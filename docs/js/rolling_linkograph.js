// Hybrid version:
// - Uses the actual move-based linkograph computation from the earlier file
// - Uses D3 for drawing and hover/focus highlighting behavior similar to your current prototype
// - Takes a moves dataset, computes links if needed, and renders a horizontal linkograph
//
// Expected HTML:
// <div id="viz"></div>
// <input id="rot" type="range" min="-180" max="180" value="0" step="1" style="display:none" />
// <button id="toggleIncoming">Incoming</button>
// <button id="toggleOutgoing">Outgoing</button>
// <button id="reset">Reset</button>
// <script src="https://d3js.org/d3.v7.min.js"></script>
// <script type="module" src="./linkograph.js"></script>
//
// Expected dataset shape (either):
// 1) { title, moves, links?, modality? }
// 2) [ { text, actor?, timestamp?, modality? }, ... ]
//
// By default this file fetches ./data.json .

import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.9.0/dist/transformers.min.js";

const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);

const DIMENSION = 384;
const DEFAULT_DATASET_PATH = "../data/data.json";

const MIN_LINK_STRENGTH = 0.2;
const SEGMENT_THRESHOLD = 1000 * 60 * 30;

const MODALITY_THRESHOLDS = {
  "text:text": 0.6,
  "text:image": 0.35,
  "image:text": 0.35,
  "image:image": 0.3,
};

const ACTOR_COLORS = {
  0: { r: 230, g: 73, b: 53 },
  1: { r: 32, g: 82, b: 204 },
  2: { r: 20, g: 156, b: 88 },
};

const DEFAULT_COLOR = { r: 120, g: 120, b: 120 };

const container = document.getElementById("viz");
if (!container) {
  throw new Error('Missing mount node: <div id="viz"></div>');
}

container.style.overflow = "auto";
container.style.width = "100%";
container.style.maxWidth = "100%";

const svg = d3.select(container).append("svg");
const root = svg.append("g");
const gAxis = root.append("g");
const gDividers = root.append("g");
const gLinksUp = root.append("g");
const gLinksDown = root.append("g");
const gNodes = root.append("g");
const gLabels = root.append("g");

const btnIncoming = document.getElementById("toggleIncoming");
const btnOutgoing = document.getElementById("toggleOutgoing");
const btnReset = document.getElementById("reset");
const actorSelect = document.getElementById("actorSelect");

let width = 1200;
let height = 800;
let axisY = 140;

const MARGIN = { top: 70, right: 40, bottom: 90, left: 40 };
const NODE_RADIUS = 6;
const SHOW_LABELS = false;

// choose which actor gets mirrored above the axis
let mirroredActor = 1;

let focusedId = null;
let showIncoming = true;
let showOutgoing = true;
let episode = null;

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function rgbToStr({ r, g, b }) {
  return `rgb(${r},${g},${b})`;
}

function colorForActor(actorId) {
  return Object.prototype.hasOwnProperty.call(ACTOR_COLORS, actorId)
    ? ACTOR_COLORS[actorId]
    : DEFAULT_COLOR;
}

function getPairThreshold(m1, m2) {
  const a = (m1.modality || "others").split("_")[0];
  const b = (m2.modality || "others").split("_")[0];
  const key = `${a}:${b}`;
  return MODALITY_THRESHOLDS[key] ?? MIN_LINK_STRENGTH;
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

function totalLinkWeight(linkStrengths) {
  return sum(
    linkStrengths
      .filter((n) => n >= MIN_LINK_STRENGTH)
      .map((n) => scale(n, [MIN_LINK_STRENGTH, 1], [0, 1]))
  );
}

function entropy(pOn, pOff) {
  const pOnPart = pOn > 0 ? -(pOn * Math.log2(pOn)) : 0;
  const pOffPart = pOff > 0 ? -(pOff * Math.log2(pOff)) : 0;
  return pOnPart + pOffPart;
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

function computeEntropy(graph) {
  for (let i = 0; i < graph.moves.length; i++) {
    const maxPossibleBacklinkWeight = i || 1;
    const backlinkPOn =
      graph.moves[i].backlinkWeight / maxPossibleBacklinkWeight;
    graph.moves[i].backlinkEntropy = entropy(backlinkPOn, 1 - backlinkPOn);

    const maxPossibleForelinkWeight = graph.moves.length - (i + 1) || 1;
    const forelinkPOn =
      graph.moves[i].forelinkWeight / maxPossibleForelinkWeight;
    graph.moves[i].forelinkEntropy = entropy(forelinkPOn, 1 - forelinkPOn);
  }

  graph.backlinkEntropy = sum(graph.moves.map((move) => move.backlinkEntropy));
  graph.forelinkEntropy = sum(graph.moves.map((move) => move.forelinkEntropy));

  graph.horizonlinkEntropy = 0;
  for (let horizon = 1; horizon < graph.moves.length; horizon++) {
    const pairs = [];
    for (let i = 0; i < graph.moves.length - horizon; i++) {
      pairs.push([i, i + horizon]);
    }

    const strengths = pairs.map(([i, j]) => graph.links[j]?.[i] || 0);
    const weight = totalLinkWeight(strengths);
    const pOn = weight / Math.max(pairs.length, 1);
    graph.horizonlinkEntropy += entropy(pOn, 1 - pOn);
  }

  graph.entropy =
    graph.backlinkEntropy + graph.forelinkEntropy + graph.horizonlinkEntropy;
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
    move._idx = idx;
  });

  if (!links) {
    links = await computeLinks(moves);
  }

  const graph = { title, moves, links };
  graph.actors = new Set(moves.map((m) => m.actor || 0));
  computeLinkDensityIndex(graph);
  computeMoveWeights(graph);
  computeEntropy(graph);
  return graph;
}

function setToggleButtonState() {
  if (btnIncoming) {
    btnIncoming.style.opacity = showIncoming ? 1 : 0.55;
    btnIncoming.textContent = showIncoming ? "Incoming ✓" : "Incoming";
  }
  if (btnOutgoing) {
    btnOutgoing.style.opacity = showOutgoing ? 1 : 0.55;
    btnOutgoing.textContent = showOutgoing ? "Outgoing ✓" : "Outgoing";
  }
}

if (btnIncoming) {
  btnIncoming.addEventListener("click", () => {
    showIncoming = !showIncoming;
    setToggleButtonState();
    render();
  });
}

if (btnOutgoing) {
  btnOutgoing.addEventListener("click", () => {
    showOutgoing = !showOutgoing;
    setToggleButtonState();
    render();
  });
}

if (btnReset) {
  btnReset.addEventListener("click", () => {
    focusedId = null;
    showIncoming = true;
    showOutgoing = true;
    setToggleButtonState();
    render();
  });
}

if (actorSelect) {
  actorSelect.value = String(mirroredActor);

  actorSelect.addEventListener("change", (event) => {
    mirroredActor = Number(event.target.value);
    render();
  });
}

setToggleButtonState();

function resize() {
  const r = container.getBoundingClientRect();
  width = Math.max(900, r.width || 0);
  height = Math.max(800, r.height || 0);

  axisY = 300;
  render();
}

window.addEventListener("resize", resize);

function fitSvgToContent() {
  const bbox = root.node().getBBox();

  const PAD_LEFT = 30;
  const PAD_RIGHT = 30;
  const PAD_TOP = 30;
  const PAD_BOTTOM = 40;

  const contentWidth = Math.max(1, bbox.width);
  const contentHeight = Math.max(1, bbox.height);

  const vbWidth = Math.max(width, contentWidth + PAD_LEFT + PAD_RIGHT);
  const vbHeight = Math.max(height, contentHeight * 2 + PAD_TOP + PAD_BOTTOM);

  const startX = PAD_LEFT;
  const startY = vbHeight / 2;

  root.attr("transform", `translate(${startX - bbox.x}, ${startY - bbox.y})`);

  svg.attr("viewBox", `0 0 ${vbWidth} ${vbHeight}`);
  svg.attr("width", vbWidth);
  svg.attr("height", vbHeight);
}

function elbowPoint(sourceNode, targetNode, direction = "down") {
  const span = Math.abs(targetNode.x - sourceNode.x);
  const depth = Math.max(10, span * 0.52);

  return {
    x: (sourceNode.x + targetNode.x) / 2,
    y: direction === "up" ? axisY - depth : axisY + depth,
  };
}

function linkLineData(sourceNode, targetNode, direction = "down") {
  const joint = elbowPoint(sourceNode, targetNode, direction);
  return {
    joint,
    segments: [
      { x1: sourceNode.x, y1: axisY, x2: joint.x, y2: joint.y },
      { x1: targetNode.x, y1: axisY, x2: joint.x, y2: joint.y },
    ],
  };
}

function moveX(index, total) {
  const left = MARGIN.left + 20;
  const right = width - MARGIN.right - 20;
  if (total <= 1) return (left + right) / 2;
  return left + (index / (total - 1)) * (right - left);
}

function shouldSegmentTimeline(currMove, prevMove) {
  if (!(currMove?.timestamp && prevMove?.timestamp)) return false;
  const deltaTime =
    Date.parse(currMove.timestamp) - Date.parse(prevMove.timestamp);
  return deltaTime >= SEGMENT_THRESHOLD;
}

function buildPositionedMoves() {
  if (!episode) return [];
  return episode.moves.map((move, index) => ({
    ...move,
    id: move.id ?? String(index),
    index,
    x: moveX(index, episode.moves.length),
    y: axisY,
  }));
}

function lineColor(strength, sourceActor, targetActor) {
  if (episode.actors.size > 1) {
    let targetColor = null;
    if (sourceActor === targetActor && sourceActor === 0) {
      targetColor = { red: 255, green: 0, blue: 0 };
    } else if (sourceActor === targetActor && sourceActor === 1) {
      targetColor = { red: 0, green: 0, blue: 255 };
    } else {
      targetColor = { red: 160, green: 0, blue: 255 };
    }

    const r = scale(strength, [MIN_LINK_STRENGTH, 1], [255, targetColor.red]);
    const g = scale(strength, [MIN_LINK_STRENGTH, 1], [255, targetColor.green]);
    const b = scale(strength, [MIN_LINK_STRENGTH, 1], [255, targetColor.blue]);
    return `rgb(${r},${g},${b})`;
  }

  const gray = scale(strength, [MIN_LINK_STRENGTH, 1], [255, 0]);
  return `rgb(${gray},${gray},${gray})`;
}

function buildVisibleLinksDown(positionedMoves) {
  const byIndex = new Map(positionedMoves.map((m) => [m.index, m]));
  const result = [];

  for (const [currIdxRaw, linkSet] of Object.entries(episode.links)) {
    const currIdx = Number(currIdxRaw);
    const currMove = episode.moves[currIdx];
    const currNode = byIndex.get(currIdx);
    if (!currMove || !currNode) continue;

    for (const [prevIdxRaw, strength] of Object.entries(linkSet || {})) {
      const prevIdx = Number(prevIdxRaw);
      const prevMove = episode.moves[prevIdx];
      const prevNode = byIndex.get(prevIdx);
      if (!prevMove || !prevNode) continue;

      const pairThreshold = getPairThreshold(currMove, prevMove);
      if (strength < pairThreshold) continue;

      const sourceId = prevMove.id ?? String(prevIdx);
      const targetId = currMove.id ?? String(currIdx);
      const incoming = targetId === focusedId;
      const outgoing = sourceId === focusedId;

      if (
        focusedId &&
        !((showIncoming && incoming) || (showOutgoing && outgoing))
      ) {
        continue;
      }

      const geometry = linkLineData(prevNode, currNode, "down");

      result.push({
        id: `${sourceId}->${targetId}:down`,
        source: sourceId,
        target: targetId,
        sourceIndex: prevIdx,
        targetIndex: currIdx,
        weight: strength,
        s: prevNode,
        t: currNode,
        joint: geometry.joint,
        segments: geometry.segments,
        color: lineColor(strength, prevMove.actor || 0, currMove.actor || 0),
      });
    }
  }

  result.sort(
    (a, b) =>
      Math.abs(a.targetIndex - a.sourceIndex) -
      Math.abs(b.targetIndex - b.sourceIndex)
  );

  return result;
}

function buildVisibleLinksUp(positionedMoves) {
  const byIndex = new Map(positionedMoves.map((m) => [m.index, m]));
  const result = [];

  for (const [currIdxRaw, linkSet] of Object.entries(episode.links)) {
    const currIdx = Number(currIdxRaw);
    const currMove = episode.moves[currIdx];
    const currNode = byIndex.get(currIdx);
    if (!currMove || !currNode) continue;

    for (const [prevIdxRaw, strength] of Object.entries(linkSet || {})) {
      const prevIdx = Number(prevIdxRaw);
      const prevMove = episode.moves[prevIdx];
      const prevNode = byIndex.get(prevIdx);
      if (!prevMove || !prevNode) continue;

      const pairThreshold = getPairThreshold(currMove, prevMove);
      if (strength < pairThreshold) continue;

      // Only links where both ends belong to the mirrored actor
      if ((prevMove.actor || 0) !== mirroredActor) continue;
      if ((currMove.actor || 0) !== mirroredActor) continue;

      const sourceId = prevMove.id ?? String(prevIdx);
      const targetId = currMove.id ?? String(currIdx);

      const geometry = linkLineData(prevNode, currNode, "up");

      result.push({
        id: `${sourceId}->${targetId}:up`,
        source: sourceId,
        target: targetId,
        sourceIndex: prevIdx,
        targetIndex: currIdx,
        weight: strength,
        s: prevNode,
        t: currNode,
        joint: geometry.joint,
        segments: geometry.segments,
        color: rgbToStr(colorForActor(mirroredActor)),
      });
    }
  }

  result.sort(
    (a, b) =>
      Math.abs(a.targetIndex - a.sourceIndex) -
      Math.abs(b.targetIndex - b.sourceIndex)
  );

  return result;
}

function renderAxis(positionedMoves) {
  gAxis.selectAll("*").remove();
  gDividers.selectAll("*").remove();

  if (!positionedMoves.length) return;

  const left = d3.min(positionedMoves, (d) => d.x);
  const right = d3.max(positionedMoves, (d) => d.x);

  gAxis
    .append("line")
    .attr("x1", left)
    .attr("y1", axisY)
    .attr("x2", right)
    .attr("y2", axisY)
    .attr("stroke", "#263244")
    .attr("stroke-width", 2);

  for (let i = 0; i < positionedMoves.length - 1; i++) {
    if (!shouldSegmentTimeline(positionedMoves[i + 1], positionedMoves[i]))
      continue;
    const x = (positionedMoves[i].x + positionedMoves[i + 1].x) / 2;
    gDividers
      .append("line")
      .attr("x1", x)
      .attr("y1", MARGIN.top - 20)
      .attr("x2", x)
      .attr("y2", axisY + 30)
      .attr("stroke", "#999")
      .attr("stroke-dasharray", "3,3")
      .attr("stroke-width", 1);
  }
}

function renderLinkLayer(layer, visibleLinks, classSuffix = "") {
  const linkSegments = visibleLinks.flatMap((d) =>
    d.segments.map((seg, idx) => ({
      ...seg,
      linkId: d.id,
      color: d.color,
      weight: d.weight,
      source: d.source,
      target: d.target,
      segmentIndex: idx,
    }))
  );

  const segmentSel = layer
    .selectAll(`line.link${classSuffix}`)
    .data(linkSegments, (d) => `${d.linkId}:${d.segmentIndex}`);

  segmentSel
    .enter()
    .append("line")
    .attr("class", `link${classSuffix}`)
    .merge(segmentSel)
    .attr("x1", (d) => d.x1)
    .attr("y1", (d) => d.y1)
    .attr("x2", (d) => d.x2)
    .attr("y2", (d) => d.y2)
    .attr("stroke", (d) => d.color)
    .attr(
      "stroke-width",
      (d) =>
        1.2 +
        clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) * 2.2
    )
    .attr(
      "stroke-opacity",
      (d) =>
        0.14 +
        clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) * 0.76
    );

  segmentSel.exit().remove();

  const jointSel = layer
    .selectAll(`circle.link-joint${classSuffix}`)
    .data(visibleLinks, (d) => d.id);

  jointSel
    .enter()
    .append("circle")
    .attr("class", `link-joint${classSuffix}`)
    .merge(jointSel)
    .attr("cx", (d) => d.joint.x)
    .attr("cy", (d) => d.joint.y)
    .attr("r", 3)
    .attr("fill", (d) => d.color)
    .attr(
      "fill-opacity",
      (d) =>
        0.3 +
        clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) * 0.7
    );

  jointSel.exit().remove();
}

function applyFocusToLayer(layer, lineSelector, jointSelector, visibleLinks) {
  if (!focusedId) {
    layer
      .selectAll(lineSelector)
      .classed("dim", false)
      .classed("hi", false)
      .attr(
        "stroke-opacity",
        (d) =>
          0.14 +
          clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) *
            0.76
      );

    layer
      .selectAll(jointSelector)
      .classed("dim", false)
      .classed("hi", false)
      .attr(
        "fill-opacity",
        (d) =>
          0.3 +
          clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) *
            0.7
      );
    return;
  }

  layer
    .selectAll(lineSelector)
    .classed("dim", (d) => !(d.source === focusedId || d.target === focusedId))
    .classed("hi", (d) => d.source === focusedId || d.target === focusedId)
    .attr("stroke-opacity", (d) =>
      d.source === focusedId || d.target === focusedId ? 1 : 0.06
    );

  layer
    .selectAll(jointSelector)
    .classed("dim", (d) => !(d.source === focusedId || d.target === focusedId))
    .classed("hi", (d) => d.source === focusedId || d.target === focusedId)
    .attr("fill-opacity", (d) =>
      d.source === focusedId || d.target === focusedId ? 1 : 0.08
    );
}

function applyFocusDimming(positionedMoves, visibleLinks) {
  if (!focusedId) {
    gNodes.selectAll("g.node").classed("dim", false).style("opacity", 1);
    gLabels.selectAll("g.label").classed("dim", false).style("opacity", 1);

    applyFocusToLayer(
      gLinksDown,
      "line.link-down",
      "circle.link-joint-down",
      visibleLinks
    );
    applyFocusToLayer(
      gLinksUp,
      "line.link-up",
      "circle.link-joint-up",
      visibleLinks
    );
    return;
  }

  const neighbors = new Set([focusedId]);
  visibleLinks.forEach((l) => {
    if (l.source === focusedId) neighbors.add(l.target);
    if (l.target === focusedId) neighbors.add(l.source);
  });

  gNodes
    .selectAll("g.node")
    .classed("dim", (d) => !neighbors.has(d.id))
    .style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.24));

  gLabels
    .selectAll("g.label")
    .classed("dim", (d) => !neighbors.has(d.id))
    .style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.24));

  applyFocusToLayer(
    gLinksDown,
    "line.link-down",
    "circle.link-joint-down",
    visibleLinks
  );
  applyFocusToLayer(
    gLinksUp,
    "line.link-up",
    "circle.link-joint-up",
    visibleLinks
  );
}

function highlightHoverAcrossLayers(d, visibleLinks) {
  gLinksDown
    .selectAll("line.link-down")
    .classed("dim", true)
    .classed("hi", false);
  gLinksDown
    .selectAll("circle.link-joint-down")
    .classed("dim", true)
    .classed("hi", false);

  gLinksUp.selectAll("line.link-up").classed("dim", true).classed("hi", false);
  gLinksUp
    .selectAll("circle.link-joint-up")
    .classed("dim", true)
    .classed("hi", false);

  gLinksDown
    .selectAll("line.link-down")
    .filter((l) => l.source === d.id || l.target === d.id)
    .classed("dim", false)
    .classed("hi", true)
    .attr("stroke-opacity", 1);

  gLinksDown
    .selectAll("circle.link-joint-down")
    .filter((l) => l.source === d.id || l.target === d.id)
    .classed("dim", false)
    .classed("hi", true)
    .attr("fill-opacity", 1);

  gLinksUp
    .selectAll("line.link-up")
    .filter((l) => l.source === d.id || l.target === d.id)
    .classed("dim", false)
    .classed("hi", true)
    .attr("stroke-opacity", 1);

  gLinksUp
    .selectAll("circle.link-joint-up")
    .filter((l) => l.source === d.id || l.target === d.id)
    .classed("dim", false)
    .classed("hi", true)
    .attr("fill-opacity", 1);

  gNodes.selectAll("g.node").style("opacity", (n) => {
    if (n.id === d.id) return 1;
    const connected = visibleLinks.some(
      (l) =>
        (l.source === d.id && l.target === n.id) ||
        (l.target === d.id && l.source === n.id)
    );
    return connected ? 1 : 0.24;
  });

  gLabels.selectAll("g.label").style("opacity", (n) => {
    if (n.id === d.id) return 1;
    const connected = visibleLinks.some(
      (l) =>
        (l.source === d.id && l.target === n.id) ||
        (l.target === d.id && l.source === n.id)
    );
    return connected ? 1 : 0.24;
  });
}

function render() {
  if (!episode) return;

  const positionedMoves = buildPositionedMoves();
  const visibleLinksDown = buildVisibleLinksDown(positionedMoves);
  const visibleLinksUp = buildVisibleLinksUp(positionedMoves);
  const visibleLinks = [...visibleLinksDown, ...visibleLinksUp];

  renderAxis(positionedMoves);
  renderLinkLayer(gLinksDown, visibleLinksDown, "-down");
  renderLinkLayer(gLinksUp, visibleLinksUp, "-up");

  const nodeSel = gNodes.selectAll("g.node").data(positionedMoves, (d) => d.id);

  const nodeEnter = nodeSel
    .enter()
    .append("g")
    .attr("class", "node")
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      focusedId = focusedId === d.id ? null : d.id;
      render();
    })
    .on("mouseenter", (event, d) => {
      highlightHoverAcrossLayers(d, visibleLinks);
    })
    .on("mouseleave", () => {
      applyFocusDimming(positionedMoves, visibleLinks);
    });

  nodeEnter.append("circle");
  nodeEnter.append("rect").attr("class", "backbar");
  nodeEnter.append("rect").attr("class", "forebar");
  nodeEnter.append("title");

  const nodeAll = nodeEnter.merge(nodeSel);
  nodeAll.attr("transform", (d) => `translate(${d.x},${d.y})`);

  nodeAll
    .select("circle")
    .attr("r", NODE_RADIUS)
    .attr("fill", (d) => rgbToStr(colorForActor(d.actor || 0)))
    .attr("stroke", (d) =>
      focusedId && d.id === focusedId ? "#f1a340" : "#263244"
    )
    .attr("stroke-width", (d) => (focusedId && d.id === focusedId ? 3 : 2));

  nodeAll
    .select("rect.backbar")
    .attr("x", -5)
    .attr("width", 5)
    .attr("fill", "#998ec3")
    .attr(
      "y",
      (d) =>
        -10 -
        scale(
          d.backlinkWeight || 0,
          [0, episode.maxBacklinkWeight || 1],
          [0, 40]
        )
    )
    .attr("height", (d) =>
      scale(d.backlinkWeight || 0, [0, episode.maxBacklinkWeight || 1], [0, 40])
    );

  nodeAll
    .select("rect.forebar")
    .attr("x", 0)
    .attr("width", 5)
    .attr("fill", "#f1a340")
    .attr(
      "y",
      (d) =>
        -10 -
        scale(
          d.forelinkWeight || 0,
          [0, episode.maxForelinkWeight || 1],
          [0, 40]
        )
    )
    .attr("height", (d) =>
      scale(d.forelinkWeight || 0, [0, episode.maxForelinkWeight || 1], [0, 40])
    );

  nodeAll.select("title").text((d) => `${d.id}: ${d.text || ""}`);

  nodeSel.exit().remove();

  gLabels.selectAll("*").remove();

  if (SHOW_LABELS) {
    const labelSel = gLabels
      .selectAll("g.label")
      .data(positionedMoves, (d) => d.id);
    const labelEnter = labelSel.enter().append("g").attr("class", "label");
    labelEnter.append("text").attr("class", "metaText");
    labelEnter.append("text").attr("class", "moveText");

    const labelAll = labelEnter.merge(labelSel);
    labelAll.attr("transform", (d) => `translate(${d.x},${d.y - 18})`);

    labelAll
      .select("text.metaText")
      .attr("text-anchor", "middle")
      .attr("y", -56)
      .attr("font-size", 10)
      .attr("fill", "#6b7280")
      .text("");

    labelAll
      .select("text.moveText")
      .attr("text-anchor", "middle")
      .attr("y", -40)
      .attr("font-size", 11)
      .attr("font-weight", 500)
      .attr("fill", "#111827")
      .text("");

    labelSel.exit().remove();
  }

  applyFocusDimming(positionedMoves, visibleLinks);
  fitSvgToContent();
}

async function init() {
  try {
    const res = await fetch(DEFAULT_DATASET_PATH);
    if (!res.ok) {
      throw new Error(`Failed to fetch dataset: ${res.status}`);
    }
    const json = await res.json();
    episode = await normalizeAndComputeEpisode(json, "Linkograph");
    resize();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="color:crimson;font-family:Arial,sans-serif;padding:16px;">${
      err.message || "Could not load linkograph dataset."
    }</div>`;
  }
}

init();

export { normalizeAndComputeEpisode, computeLinks };
