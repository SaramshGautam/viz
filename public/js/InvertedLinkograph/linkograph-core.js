import { pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.9.0/dist/transformers.min.js";

const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);

export const DIMENSION = 384;
export const MIN_LINK_STRENGTH = 0.2;

export const MODALITY_THRESHOLDS = {
  "text:text": 0.6,
  "text:image": 0.35,
  "image:text": 0.35,
  "image:image": 0.3,
};

export const ACTOR_COLORS = {
  0: { r: 230, g: 73, b: 53 },
  1: { r: 32, g: 82, b: 204 },
  2: { r: 20, g: 156, b: 88 },
};

export const DEFAULT_COLOR = { r: 120, g: 120, b: 120 };

export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function rgbToStr({ r, g, b }) {
  return `rgb(${r},${g},${b})`;
}

export function colorForActor(actorId) {
  return Object.prototype.hasOwnProperty.call(ACTOR_COLORS, actorId)
    ? ACTOR_COLORS[actorId]
    : DEFAULT_COLOR;
}

export function getPairThreshold(m1, m2) {
  const a = (m1.modality || "others").split("_")[0];
  const b = (m2.modality || "others").split("_")[0];
  const key = `${a}:${b}`;
  return MODALITY_THRESHOLDS[key] ?? MIN_LINK_STRENGTH;
}

export function sum(xs) {
  return xs.reduce((a, b) => a + b, 0);
}

export function dotProduct(vectorA, vectorB) {
  let dotProd = 0;
  for (let i = 0; i < DIMENSION; i++) {
    dotProd += vectorA[i] * vectorB[i];
  }
  return dotProd;
}

export function magnitude(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

export function cosineSimilarity(vectorA, vectorB) {
  const dotProd = dotProduct(vectorA, vectorB);
  const magProd = magnitude(vectorA) * magnitude(vectorB);
  return magProd === 0 ? 0 : dotProd / magProd;
}

export function scale(num, [oldMin, oldMax], [newMin, newMax]) {
  if (oldMax === oldMin) return newMin;
  const oldRange = oldMax - oldMin;
  const newRange = newMax - newMin;
  return ((num - oldMin) / oldRange) * newRange + newMin;
}

export function totalLinkWeight(linkStrengths) {
  return sum(
    linkStrengths
      .filter((n) => n >= MIN_LINK_STRENGTH)
      .map((n) => scale(n, [MIN_LINK_STRENGTH, 1], [0, 1]))
  );
}

export function entropy(pOn, pOff) {
  const pOnPart = pOn > 0 ? -(pOn * Math.log2(pOn)) : 0;
  const pOffPart = pOff > 0 ? -(pOff * Math.log2(pOff)) : 0;
  return pOnPart + pOffPart;
}

export function computeLinkDensityIndex(graph) {
  const overallLinkWeight = sum(
    Object.values(graph.links).map((linkSet) =>
      totalLinkWeight(Object.values(linkSet))
    )
  );
  graph.linkDensityIndex = overallLinkWeight / Math.max(graph.moves.length, 1);
}

export function computeMoveWeights(graph) {
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

export function computeEntropy(graph) {
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

export async function embed(text) {
  const output = await extractor(text || "", {
    convert_to_tensor: true,
    pooling: "mean",
    normalize: true,
  });
  return output[0];
}

export async function computeLinks(moves) {
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

export function inferModality(move) {
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

export async function normalizeAndComputeEpisode(
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
