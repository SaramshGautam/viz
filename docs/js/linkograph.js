// Minimal standalone fuzzy linkograph renderer.
// It takes a moves dataset, computes semantic links from later moves to earlier moves,
// and draws a linkograph into a container element.
//
// Expected usage in HTML:
// <div id="app"></div>
// <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
// <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
// <script type="module" src="./linkograph.js"></script>
//
// Expected dataset shape (either of these):
// 1) { title, moves, links?, modality? }
// 2) [ { text, actor?, timestamp?, modality? }, ... ]
//
// By default this file fetches ./data.json . Change DEFAULT_DATASET_PATH if needed.

import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.9.0/dist/transformers.min.js";

const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);
const e = React.createElement;

const DIMENSION = 384;
const DEFAULT_DATASET_PATH = "./data.json";

const MOVE_TEXT_MODE = "FULL"; // FULL | INDEX | NONE
const SHOULD_COLORIZE_LINKS = true;
const GRAPH_WIDTH = 1000;
const INIT_X = 10;
const INIT_Y = { FULL: 500, INDEX: 80, NONE: 60 }[MOVE_TEXT_MODE];
const MOVE_LINK_BAR_HEIGHT = 40;
const MIN_LINK_STRENGTH = 0.2;
const SEGMENT_THRESHOLD = 1000 * 60 * 30; // 30 min

const MODALITY_THRESHOLDS = {
  "text:text": 0.6,
  "text:image": 0.25,
  "image:text": 0.25,
  "image:image": 0.1,
};

const ACTOR_COLORS = {
  0: { r: 230, g: 73, b: 53 },
  1: { r: 32, g: 82, b: 204 },
  2: { r: 20, g: 156, b: 88 },
};

const DEFAULT_COLOR = { r: 120, g: 120, b: 120 };

function getPairThreshold(m1, m2) {
  const a = (m1.modality || "others").split("_")[0];
  const b = (m2.modality || "others").split("_")[0];
  const key = `${a}:${b}`;
  return MODALITY_THRESHOLDS[key] ?? MIN_LINK_STRENGTH;
}

function rgbToStr({ r, g, b }) {
  return `rgb(${r},${g},${b})`;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

function dotProduct(vectorA, vectorB) {
  let dotProd = 0;
  for (let i = 0; i < DIMENSION; i++) {
    dotProd += vectorA[i] * vectorB[i];
  }
  return dotProd;
}

function magnitude(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

function cosineSimilarity(vectorA, vectorB) {
  const dotProd = dotProduct(vectorA, vectorB);
  const magProd = magnitude(vectorA) * magnitude(vectorB);
  return magProd === 0 ? 0 : dotProd / magProd;
}

function scale(num, [oldMin, oldMax], [newMin, newMax]) {
  if (oldMax === oldMin) return newMin;
  const oldRange = oldMax - oldMin;
  const newRange = newMax - newMin;
  return ((num - oldMin) / oldRange) * newRange + newMin;
}

function colorForActor(actorId) {
  return Object.prototype.hasOwnProperty.call(ACTOR_COLORS, actorId)
    ? ACTOR_COLORS[actorId]
    : DEFAULT_COLOR;
}

function totalLinkWeight(linkStrengths) {
  return sum(
    linkStrengths
      .filter((n) => n >= MIN_LINK_STRENGTH)
      .map((n) => scale(n, [MIN_LINK_STRENGTH, 1], [0, 1]))
  );
}

function computeLinkDensityIndex(graph) {
  const overallLinkWeight = sum(
    Object.values(graph.links).map((linkSet) =>
      totalLinkWeight(Object.values(linkSet))
    )
  );
  graph.linkDensityIndex = overallLinkWeight / Math.max(graph.moves.length, 1);
}

function computeMoveWeights(graph) {
  for (let i = 0; i < graph.moves.length; i++) {
    const backlinkStrengths = Object.values(graph.links[i] || {});
    graph.moves[i].backlinkWeight = totalLinkWeight(backlinkStrengths);

    const forelinkStrengths = Object.values(graph.links).map(
      (linkSet) => linkSet[i] || 0
    );
    graph.moves[i].forelinkWeight = totalLinkWeight(forelinkStrengths);
  }

  [...graph.moves]
    .sort((a, b) => b.backlinkWeight - a.backlinkWeight)
    .slice(0, 3)
    .forEach((move) => {
      move.backlinkCriticalMove = true;
    });

  [...graph.moves]
    .sort((a, b) => b.forelinkWeight - a.forelinkWeight)
    .slice(0, 3)
    .forEach((move) => {
      move.forelinkCriticalMove = true;
    });

  graph.maxForelinkWeight = Math.max(
    0,
    ...graph.moves.map((move) => move.forelinkWeight)
  );
  graph.maxBacklinkWeight = Math.max(
    0,
    ...graph.moves.map((move) => move.backlinkWeight)
  );
}

function entropy(pOn, pOff) {
  const pOnPart = pOn > 0 ? -(pOn * Math.log2(pOn)) : 0;
  const pOffPart = pOff > 0 ? -(pOff * Math.log2(pOff)) : 0;
  return pOnPart + pOffPart;
}

function computeEntropy(graph) {
  for (let i = 0; i < graph.moves.length; i++) {
    const maxPossibleBacklinkWeight = i || 1;
    const backlinkPOn =
      graph.moves[i].backlinkWeight / maxPossibleBacklinkWeight;
    const backlinkPOff = 1 - backlinkPOn;
    graph.moves[i].backlinkEntropy = entropy(backlinkPOn, backlinkPOff);

    const maxPossibleForelinkWeight = graph.moves.length - (i + 1) || 1;
    const forelinkPOn =
      graph.moves[i].forelinkWeight / maxPossibleForelinkWeight;
    const forelinkPOff = 1 - forelinkPOn;
    graph.moves[i].forelinkEntropy = entropy(forelinkPOn, forelinkPOff);
  }

  graph.backlinkEntropy = sum(graph.moves.map((move) => move.backlinkEntropy));
  graph.forelinkEntropy = sum(graph.moves.map((move) => move.forelinkEntropy));

  graph.horizonlinkEntropy = 0;
  for (let horizon = 1; horizon < graph.moves.length; horizon++) {
    const moveIndexPairs = [];
    for (let i = 0; i < graph.moves.length - horizon; i++) {
      moveIndexPairs.push([i, i + horizon]);
    }
    const horizonlinkStrengths = moveIndexPairs.map(
      ([i, j]) => graph.links[j]?.[i] || 0
    );
    const horizonlinkWeight = totalLinkWeight(horizonlinkStrengths);
    const horizonlinkPOn =
      horizonlinkWeight / Math.max(moveIndexPairs.length, 1);
    const horizonlinkPOff = 1 - horizonlinkPOn;
    graph.horizonlinkEntropy += entropy(horizonlinkPOn, horizonlinkPOff);
  }

  graph.entropy =
    graph.backlinkEntropy + graph.forelinkEntropy + graph.horizonlinkEntropy;
}

function computeActorLinkStats(graph) {
  const linkStrengthsByActorPair = {};
  const possibleLinkCountsByActorPair = {};
  graph.copyCount = 0;

  for (let i = 0; i < graph.moves.length - 1; i++) {
    const actorA = graph.moves[i]?.actor || 0;
    for (let j = i + 1; j < graph.moves.length; j++) {
      if ((graph.links[j]?.[i] || 0) >= 0.99) {
        graph.copyCount++;
        continue;
      }

      const actorB = graph.moves[j]?.actor || 0;
      const pair = [actorB, actorA].join(":");

      if (!linkStrengthsByActorPair[pair]) {
        linkStrengthsByActorPair[pair] = [];
      }
      linkStrengthsByActorPair[pair].push(graph.links[j]?.[i] || 0);

      if (!possibleLinkCountsByActorPair[pair]) {
        possibleLinkCountsByActorPair[pair] = 0;
      }
      possibleLinkCountsByActorPair[pair] += 1;
    }
  }

  const linkDensitiesByActorPair = {};
  for (const [pair, strengths] of Object.entries(linkStrengthsByActorPair)) {
    linkDensitiesByActorPair[pair] =
      totalLinkWeight(strengths) / possibleLinkCountsByActorPair[pair];
  }

  graph.linkDensitiesByActorPair = linkDensitiesByActorPair;
}

async function embed(text) {
  const output = await extractor(text || "", {
    convert_to_tensor: true,
    pooling: "mean",
    normalize: true,
  });
  return output[0];
}

async function computeLinks(moves) {
  for (const move of moves) {
    move.embedding = await embed(move.text || "");
  }

  const links = {};
  for (let i = 0; i < moves.length; i++) {
    const currMove = moves[i];
    links[i] = {};
    for (let j = 0; j < i; j++) {
      const prevMove = moves[j];
      links[i][j] = cosineSimilarity(currMove.embedding, prevMove.embedding);
    }
  }
  return links;
}

function inferModality(move) {
  const hasUrl =
    move.url ||
    move.imageUrl ||
    (move.content &&
      Array.isArray(move.content.imageUrls) &&
      move.content.imageUrls.length > 0);
  const hasText = !!(move.text || (move.content && move.content.text));

  if (hasText && hasUrl) return "text_image";
  if (hasText) return "text";
  if (hasUrl) return "image";
  return "others";
}

async function normalizeAndComputeEpisode(
  jsonLike,
  fallbackTitle = "Linkograph"
) {
  let firstKey = null;
  if (!Array.isArray(jsonLike)) {
    const keys = Object.keys(jsonLike);
    if (
      keys.length === 1 &&
      (jsonLike[keys[0]].moves || Array.isArray(jsonLike[keys[0]]))
    ) {
      firstKey = keys[0];
      jsonLike = jsonLike[firstKey];
    }
  }

  const title = jsonLike.title || firstKey || fallbackTitle;
  const moves = jsonLike.moves || jsonLike;
  let links = jsonLike.links;
  const modalities = jsonLike.modality || [];

  moves.forEach((move, idx) => {
    if (!move.text && move.content?.text) {
      move.text = move.content.text;
    }
    move.modality = modalities[idx] || move.modality || inferModality(move);
  });

  if (!links) {
    links = await computeLinks(moves);
  }

  const episode = { title, moves, links };
  episode.actors = new Set(episode.moves.map((m) => m.actor || 0));

  computeLinkDensityIndex(episode);
  computeMoveWeights(episode);
  computeEntropy(episode);
  if (episode.actors.size > 1) {
    computeActorLinkStats(episode);
  }

  episode.moveSpacing =
    (GRAPH_WIDTH - INIT_X * 2) / Math.max(1, episode.moves.length - 1);
  return episode;
}

function elbow(pt1, pt2) {
  const x = (pt1.x + pt2.x) / 2;
  const y = pt1.y - (pt2.x - pt1.x) / 2;
  return { x, y };
}

function moveLoc(props) {
  return { x: props.idx * props.moveSpacing + INIT_X, y: INIT_Y };
}

function shouldSegmentTimeline(currMove, prevMove) {
  if (!(currMove?.timestamp && prevMove?.timestamp)) return false;
  const deltaTime =
    Date.parse(currMove.timestamp) - Date.parse(prevMove.timestamp);
  return deltaTime >= SEGMENT_THRESHOLD;
}

function DesignMove(props) {
  const move = props.moves[props.idx];
  const currLoc = moveLoc(props);
  const scaledForelinkWeight = scale(
    move.forelinkWeight,
    [0, props.maxForelinkWeight || 1],
    [0, MOVE_LINK_BAR_HEIGHT]
  );
  const scaledBacklinkWeight = scale(
    move.backlinkWeight,
    [0, props.maxBacklinkWeight || 1],
    [0, MOVE_LINK_BAR_HEIGHT]
  );
  const moveLinkBarSize = 10 + MOVE_LINK_BAR_HEIGHT + 10;

  const actorId = move.actor || 0;
  const fillColor = rgbToStr(colorForActor(actorId));
  let moveMarker = null;

  if (actorId === 0) {
    moveMarker = e("circle", {
      cx: currLoc.x,
      cy: currLoc.y,
      r: 5,
      fill: fillColor,
    });
  } else if (actorId === 1) {
    moveMarker = e("rect", {
      x: currLoc.x - 5,
      y: currLoc.y - 5,
      width: 10,
      height: 10,
      fill: fillColor,
    });
  } else if (actorId === 2) {
    const p = [
      [currLoc.x, currLoc.y - 6],
      [currLoc.x - 6, currLoc.y + 5],
      [currLoc.x + 6, currLoc.y + 5],
    ]
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
    moveMarker = e("polygon", { points: p, fill: fillColor });
  } else {
    const p = [
      [currLoc.x, currLoc.y - 6],
      [currLoc.x - 6, currLoc.y],
      [currLoc.x, currLoc.y + 6],
      [currLoc.x + 6, currLoc.y],
    ]
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
    moveMarker = e("polygon", { points: p, fill: fillColor });
  }

  return e(
    "g",
    {},
    MOVE_TEXT_MODE === "FULL"
      ? e(
          "text",
          {
            x: currLoc.x + 5,
            y: currLoc.y - moveLinkBarSize,
            transform: `rotate(270, ${currLoc.x + 5}, ${
              currLoc.y - moveLinkBarSize
            })`,
            fontWeight:
              move.backlinkCriticalMove || move.forelinkCriticalMove
                ? "bold"
                : "normal",
            fontSize: 11,
          },
          move.text || `Move ${props.idx}`
        )
      : null,
    MOVE_TEXT_MODE === "INDEX"
      ? e(
          "text",
          {
            x: currLoc.x,
            y: currLoc.y - moveLinkBarSize,
            textAnchor: "middle",
            fontWeight:
              move.backlinkCriticalMove || move.forelinkCriticalMove
                ? "bold"
                : "normal",
            fontSize: 11,
          },
          props.idx
        )
      : null,
    e("rect", {
      x: currLoc.x - 5,
      y: currLoc.y - 10 - scaledBacklinkWeight,
      width: 5,
      height: scaledBacklinkWeight,
      fill: "#998ec3",
    }),
    e("rect", {
      x: currLoc.x,
      y: currLoc.y - 10 - scaledForelinkWeight,
      width: 5,
      height: scaledForelinkWeight,
      fill: "#f1a340",
    }),
    moveMarker
  );
}

function makeTimelineDividers(props) {
  const dividers = [];
  for (let idx = 0; idx < props.moves.length; idx++) {
    const currLoc = moveLoc({ ...props, idx });
    const splitAfter = shouldSegmentTimeline(
      props.moves[idx + 1],
      props.moves[idx]
    );
    if (!splitAfter) continue;

    dividers.push(
      e("line", {
        key: `divider-${idx}`,
        stroke: "#999",
        strokeDasharray: "2",
        strokeWidth: 1,
        x1: currLoc.x + props.moveSpacing / 2,
        y1: currLoc.y - GRAPH_WIDTH,
        x2: currLoc.x + props.moveSpacing / 2,
        y2: currLoc.y + GRAPH_WIDTH,
      })
    );
  }
  return dividers;
}

function makeLinkObjects(props) {
  const linkLines = [];
  const linkJoints = [];

  for (const [currIdxRaw, linkSet] of Object.entries(props.links)) {
    const currIdx = Number(currIdxRaw);
    const currLoc = moveLoc({ ...props, idx: currIdx });

    for (const [prevIdxRaw, strength] of Object.entries(linkSet)) {
      const prevIdx = Number(prevIdxRaw);
      const mCurr = props.moves[currIdx];
      const mPrev = props.moves[prevIdx];

      const pairThreshold = getPairThreshold(mCurr, mPrev);
      if (strength < pairThreshold) continue;

      const prevLoc = moveLoc({ ...props, idx: prevIdx });
      const jointLoc = elbow(currLoc, prevLoc);

      let color = "";
      if (props.actors.size > 1 && SHOULD_COLORIZE_LINKS) {
        const currActor = props.moves[currIdx].actor || 0;
        const prevActor = props.moves[prevIdx].actor || 0;
        let targetColor = null;

        if (currActor === prevActor && currActor === 0) {
          targetColor = { red: 255, green: 0, blue: 0 };
        } else if (currActor === prevActor && currActor === 1) {
          targetColor = { red: 0, green: 0, blue: 255 };
        } else {
          targetColor = { red: 160, green: 0, blue: 255 };
        }

        const r = scale(
          strength,
          [MIN_LINK_STRENGTH, 1],
          [255, targetColor.red]
        );
        const g = scale(
          strength,
          [MIN_LINK_STRENGTH, 1],
          [255, targetColor.green]
        );
        const b = scale(
          strength,
          [MIN_LINK_STRENGTH, 1],
          [255, targetColor.blue]
        );
        color = `rgb(${r},${g},${b})`;
      } else {
        const gray = scale(strength, [pairThreshold, 1], [255, 0]);
        color = `rgb(${gray},${gray},${gray})`;
      }

      linkLines.push({
        x1: currLoc.x,
        y1: currLoc.y,
        x2: jointLoc.x,
        y2: jointLoc.y,
        color,
        strength,
      });
      linkLines.push({
        x1: prevLoc.x,
        y1: prevLoc.y,
        x2: jointLoc.x,
        y2: jointLoc.y,
        color,
        strength,
      });
      linkJoints.push({ x: jointLoc.x, y: jointLoc.y, color, strength });
    }
  }

  return { linkLines, linkJoints };
}

function FuzzyLinkograph(props) {
  const dividers = makeTimelineDividers(props);
  const { linkLines, linkJoints } = makeLinkObjects(props);

  return e(
    "div",
    { className: "fuzzy-linkograph", style: { width: "100%" } },
    e("h2", { style: { margin: "0 0 12px 0" } }, props.title),
    e(
      "svg",
      {
        viewBox: `0 0 ${GRAPH_WIDTH} ${GRAPH_WIDTH / 2 + INIT_Y}`,
        style: {
          width: "100%",
          height: "auto",
          display: "block",
          border: "1px solid #eee",
        },
        preserveAspectRatio: "xMidYMid meet",
      },
      ...dividers,
      ...linkLines
        .sort((a, b) => a.strength - b.strength)
        .map((line, idx) =>
          e("line", {
            key: `line-${idx}`,
            x1: line.x1,
            y1: line.y1,
            x2: line.x2,
            y2: line.y2,
            stroke: line.color,
            strokeWidth: 2,
          })
        ),
      ...linkJoints
        .sort((a, b) => a.strength - b.strength)
        .map((joint, idx) =>
          e("circle", {
            key: `joint-${idx}`,
            cx: joint.x,
            cy: joint.y,
            r: 3,
            fill: joint.color,
          })
        ),
      ...props.moves.map((_, idx) => e(DesignMove, { key: idx, ...props, idx }))
    )
  );
}

function App() {
  const [episode, setEpisode] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(DEFAULT_DATASET_PATH);
        if (!res.ok) {
          throw new Error(`Failed to fetch dataset: ${res.status}`);
        }
        const json = await res.json();
        const ep = await normalizeAndComputeEpisode(json, "Linkograph");

        if (!cancelled) {
          setEpisode(ep);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(err.message || "Could not load linkograph dataset.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return e(
    "div",
    {
      style: {
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "16px",
        fontFamily: "Arial, sans-serif",
        // color: "#333",
      },
    },
    e("h1", { style: { marginTop: 0 } }, "Linkograph"),
    loading ? e("div", null, "Loading and computing…") : null,
    error ? e("div", { style: { color: "crimson" } }, error) : null,
    episode
      ? e(FuzzyLinkograph, {
          title: episode.title,
          moves: episode.moves,
          links: episode.links,
          actors: episode.actors,
          moveSpacing: episode.moveSpacing,
          maxForelinkWeight: episode.maxForelinkWeight,
          maxBacklinkWeight: episode.maxBacklinkWeight,
        })
      : null
  );
}

let root = null;
function renderUI() {
  const mountNode = document.getElementById("app");
  if (!mountNode) {
    throw new Error('Missing mount node: <div id="app"></div>');
  }
  if (!root) {
    root = ReactDOM.createRoot(mountNode);
  }
  root.render(e(App));
}

renderUI();

export { normalizeAndComputeEpisode, computeLinks, FuzzyLinkograph };
