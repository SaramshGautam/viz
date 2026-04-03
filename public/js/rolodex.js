// import { nodes, links } from "./data1.js";

// const container = document.getElementById("viz");
// const svg = d3.select(container).append("svg");
// const root = svg.append("g");

// const gAxis = root.append("g");
// const gLinks = root.append("g");
// const gCards = root.append("g");

// let width = 800;
// let height = 600;
// let center = { x: width / 2, y: height / 2 + 10 };

// let rotationDeg = 0;
// let focusedId = null;
// let showIncoming = true;
// let showOutgoing = true;

// const rotInput = document.getElementById("rot");
// const btnIncoming = document.getElementById("toggleIncoming");
// const btnOutgoing = document.getElementById("toggleOutgoing");
// const btnReset = document.getElementById("reset");

// const CARD_W = 280;
// const CARD_H = 132;

// let wheelRY = 190;
// let frontSpreadX = 28;
// let backSpreadX = 12;

// function resize() {
//   const r = container.getBoundingClientRect();
//   width = Math.max(320, r.width);
//   height = Math.max(320, r.height);

//   svg.attr("viewBox", `0 0 ${width} ${height}`);
//   svg.attr("width", width).attr("height", height);

//   center = { x: width / 2, y: height / 2 + 10 };

//   wheelRY = Math.min(230, height * 0.33);
//   frontSpreadX = Math.min(40, width * 0.018);
//   backSpreadX = Math.min(18, width * 0.01);

//   render();
// }

// window.addEventListener("resize", resize);

// function setToggleButtonState() {
//   btnIncoming.style.opacity = showIncoming ? 1 : 0.55;
//   btnOutgoing.style.opacity = showOutgoing ? 1 : 0.55;
//   btnIncoming.textContent = showIncoming ? "Incoming ✓" : "Incoming";
//   btnOutgoing.textContent = showOutgoing ? "Outgoing ✓" : "Outgoing";
// }

// btnIncoming.addEventListener("click", () => {
//   showIncoming = !showIncoming;
//   setToggleButtonState();
//   render();
// });

// btnOutgoing.addEventListener("click", () => {
//   showOutgoing = !showOutgoing;
//   setToggleButtonState();
//   render();
// });

// btnReset.addEventListener("click", () => {
//   focusedId = null;
//   rotationDeg = 0;
//   rotInput.value = 0;
//   showIncoming = true;
//   showOutgoing = true;
//   setToggleButtonState();
//   render();
// });

// rotInput.addEventListener("input", (e) => {
//   rotationDeg = +e.target.value;
//   render();
// });

// setToggleButtonState();

// const drag = d3
//   .drag()
//   .on("start", (event) => {
//     root.attr("data-drag-start-y", event.y);
//     root.attr("data-drag-start-rot", rotationDeg);
//   })
//   .on("drag", (event) => {
//     const startY = +root.attr("data-drag-start-y");
//     const startRot = +root.attr("data-drag-start-rot");
//     const dy = event.y - startY;

//     rotationDeg = startRot + dy * 0.35;
//     rotationDeg = Math.max(-180, Math.min(180, rotationDeg));
//     rotInput.value = rotationDeg;
//     render();
//   });

// svg.call(drag);

// function angleForIndex(i, n) {
//   const base = (i / n) * Math.PI * 2;
//   return base + (rotationDeg * Math.PI) / 180;
// }

// function posForIndex(i, n) {
//   const a = angleForIndex(i, n);

//   const y = center.y + Math.sin(a) * wheelRY;
//   const depth = (Math.cos(a) + 1) / 2;

//   const sideSign = Math.sin(a) >= 0 ? 1 : -1;
//   const spread = backSpreadX + depth * frontSpreadX;
//   const x = center.x + sideSign * spread * i * 0.35;

//   return { x, y, a, depth };
// }

// function cardScale(depth) {
//   return 0.68 + depth * 0.42;
// }

// function cardOpacity(depth) {
//   return 0.18 + depth * 0.82;
// }

// function cardTransform(d, forceFront = false) {
//   const depth = forceFront ? 1.15 : d.depth;
//   const scale = forceFront ? 1.18 : cardScale(depth);
//   const sy = forceFront ? 1.03 : 0.86 + depth * 0.18;

//   return `translate(${d.x},${d.y}) scale(${scale},${sy})`;
// }

// function linkPath(s, t) {
//   const midX = center.x;
//   const axisY = center.y;

//   const c1x = (s.x + midX) / 2;
//   const c2x = (t.x + midX) / 2;
//   const c1y = (s.y + axisY) / 2;
//   const c2y = (t.y + axisY) / 2;

//   return `M ${s.x} ${s.y}
//           C ${c1x} ${c1y},
//             ${c2x} ${c2y},
//             ${t.x} ${t.y}`;
// }

// function wrapText(selection, maxWidth, maxLines) {
//   selection.each(function (d) {
//     const textSel = d3.select(this);
//     textSel.selectAll("*").remove();

//     const words = d.text.split(/\s+/);
//     const lineHeight = 16;
//     let line = [];
//     let lineNumber = 0;

//     let tspan = textSel
//       .append("tspan")
//       .attr("x", -CARD_W / 2 + 14)
//       .attr("dy", 0);

//     for (const word of words) {
//       line.push(word);
//       tspan.text(line.join(" "));

//       const node = tspan.node();
//       if (node && node.getComputedTextLength() > maxWidth) {
//         line.pop();
//         tspan.text(line.join(" "));
//         line = [word];
//         lineNumber += 1;

//         if (lineNumber >= maxLines) {
//           const current = tspan.text();
//           tspan.text(current.replace(/\.*$/, "") + "…");
//           break;
//         }

//         tspan = textSel
//           .append("tspan")
//           .attr("x", -CARD_W / 2 + 14)
//           .attr("dy", lineHeight)
//           .text(word);
//       }
//     }
//   });
// }

// function renderAxis() {
//   gAxis.selectAll("*").remove();

//   const axisLeft = center.x - width * 0.18;
//   const axisRight = center.x + width * 0.18;

//   gAxis
//     .append("line")
//     .attr("class", "axis-core")
//     .attr("x1", axisLeft)
//     .attr("y1", center.y)
//     .attr("x2", axisRight)
//     .attr("y2", center.y);

//   gAxis
//     .append("line")
//     .attr("class", "axis-line")
//     .attr("x1", axisLeft)
//     .attr("y1", center.y)
//     .attr("x2", axisRight)
//     .attr("y2", center.y);
// }

// function render() {
//   renderAxis();

//   const n = nodes.length;
//   const positioned = nodes.map((d, i) => {
//     const p = posForIndex(i, n);
//     return { ...d, i, ...p };
//   });

//   const posById = new Map(positioned.map((d) => [d.id, d]));
//   const depthSort = [...positioned].sort((a, b) => a.depth - b.depth);

//   const enrichedLinks = links
//     .map((l) => {
//       const s = posById.get(l.source);
//       const t = posById.get(l.target);
//       return { ...l, s, t };
//     })
//     .filter((l) => l.s && l.t);

//   let visibleLinks = enrichedLinks;

//   if (focusedId) {
//     visibleLinks = enrichedLinks.filter((l) => {
//       const isIncoming = l.target === focusedId;
//       const isOutgoing = l.source === focusedId;
//       return (showIncoming && isIncoming) || (showOutgoing && isOutgoing);
//     });
//   }

//   const linkSel = gLinks
//     .selectAll("path.link")
//     .data(visibleLinks, (d) => `${d.source}->${d.target}:${d.type || ""}`);

//   linkSel
//     .enter()
//     .append("path")
//     .attr("class", "link")
//     .merge(linkSel)
//     .attr("opacity", (d) => {
//       const avgDepth = (d.s.depth + d.t.depth) / 2;
//       return 0.08 + avgDepth * 0.65;
//     })
//     .attr("d", (d) => linkPath(d.s, d.t));

//   linkSel.exit().remove();

//   const cardSel = gCards.selectAll("g.card").data(depthSort, (d) => d.id);

//   const cardEnter = cardSel
//     .enter()
//     .append("g")
//     .attr("class", "card")
//     .on("click", (event, d) => {
//       focusedId = focusedId === d.id ? null : d.id;

//       if (focusedId) {
//         const delta = -d.a;
//         rotationDeg += (delta * 180) / Math.PI;
//         rotationDeg = Math.max(-180, Math.min(180, rotationDeg));
//         rotInput.value = rotationDeg;
//       }

//       render();
//     })
//     .on("mouseenter", (event, d) => {
//       gLinks.selectAll("path.link").classed("dim", true).classed("hi", false);

//       gLinks
//         .selectAll("path.link")
//         .filter((l) => l.source === d.id || l.target === d.id)
//         .classed("dim", false)
//         .classed("hi", true);

//       if (!focusedId) {
//         gCards.selectAll("g.card").classed("dim", (c) => c.id !== d.id);
//       }
//     })
//     .on("mouseleave", () => {
//       gLinks.selectAll("path.link").classed("dim", false).classed("hi", false);
//       gCards.selectAll("g.card").classed("dim", false);
//     });

//   cardEnter
//     .append("rect")
//     .attr("x", -CARD_W / 2)
//     .attr("y", -CARD_H / 2)
//     .attr("width", CARD_W)
//     .attr("height", CARD_H);

//   cardEnter
//     .append("text")
//     .attr("class", "meta")
//     .attr("x", -CARD_W / 2 + 14)
//     .attr("y", -CARD_H / 2 + 22);

//   cardEnter
//     .append("text")
//     .attr("class", "text")
//     .attr("x", -CARD_W / 2 + 14)
//     .attr("y", -CARD_H / 2 + 46);

//   const badge = cardEnter
//     .append("g")
//     .attr("transform", `translate(${CARD_W / 2 - 66},${-CARD_H / 2 + 10})`);

//   badge
//     .append("rect")
//     .attr("class", "badge")
//     .attr("width", 56)
//     .attr("height", 22);

//   badge
//     .append("text")
//     .attr("class", "badgeText")
//     .attr("x", 28)
//     .attr("y", 15)
//     .attr("text-anchor", "middle");

//   const cardAll = cardEnter.merge(cardSel);

//   cardAll
//     .classed("focus", (d) => focusedId && d.id === focusedId)
//     .style("opacity", (d) => {
//       if (focusedId && d.id === focusedId) return 1;
//       return cardOpacity(d.depth);
//     })
//     .attr("transform", (d) =>
//       cardTransform(d, focusedId && d.id === focusedId)
//     );

//   cardAll.select("text.meta").text((d) => `${d.who} · ${d.t}`);
//   cardAll.select(".badgeText").text((d) => d.id);
//   wrapText(cardAll.select("text.text"), CARD_W - 28, 3);

//   if (focusedId) {
//     const neighbors = new Set([focusedId]);
//     links.forEach((l) => {
//       if (l.source === focusedId) neighbors.add(l.target);
//       if (l.target === focusedId) neighbors.add(l.source);
//     });

//     gCards.selectAll("g.card").classed("dim", (d) => !neighbors.has(d.id));
//   } else {
//     gCards.selectAll("g.card").classed("dim", false);
//   }

//   cardSel.exit().remove();
// }

// resize();

import { nodes, links } from "./data1.js";

const container = document.getElementById("viz");
const svg = d3.select(container).append("svg");
const root = svg.append("g");

const gAxis = root.append("g");
const gLinks = root.append("g");
const gNodes = root.append("g");
const gLabels = root.append("g");

let width = 1200;
let height = 700;

const MARGIN = { top: 80, right: 40, bottom: 80, left: 40 };
let axisY = 420;

const NODE_RADIUS = 6;
const LINK_MIN_OPACITY = 0.12;
const LINK_MAX_OPACITY = 0.9;
const MAX_LABEL_CHARS = 22;

let focusedId = null;
let showIncoming = true;
let showOutgoing = true;

const btnIncoming = document.getElementById("toggleIncoming");
const btnOutgoing = document.getElementById("toggleOutgoing");
const btnReset = document.getElementById("reset");

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

setToggleButtonState();

function resize() {
  const r = container.getBoundingClientRect();
  width = Math.max(700, r.width);
  height = Math.max(420, r.height || 700);

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("width", width).attr("height", height);

  axisY = Math.min(height - MARGIN.bottom, Math.max(260, height * 0.7));

  render();
}

window.addEventListener("resize", resize);

function truncateText(str, maxChars = MAX_LABEL_CHARS) {
  if (!str) return "";
  return str.length <= maxChars ? str : str.slice(0, maxChars - 1) + "…";
}

function nodeX(index, total) {
  const left = MARGIN.left + 20;
  const right = width - MARGIN.right - 20;
  if (total <= 1) return (left + right) / 2;
  return left + (index / (total - 1)) * (right - left);
}

function buildPositionedNodes() {
  return nodes.map((d, i) => ({
    ...d,
    index: i,
    x: nodeX(i, nodes.length),
    y: axisY,
  }));
}

function linkArcPath(sourceNode, targetNode) {
  const x1 = sourceNode.x;
  const x2 = targetNode.x;

  const dx = Math.abs(x2 - x1);
  const lift = Math.max(30, Math.min(220, dx * 0.55));
  const midX = (x1 + x2) / 2;
  const controlY = axisY - lift;

  return `M ${x1} ${axisY}
          Q ${midX} ${controlY}
            ${x2} ${axisY}`;
}

function normalizeWeight(w) {
  if (w == null || Number.isNaN(w)) return 0.5;
  return Math.max(0, Math.min(1, w));
}

function renderAxis(positioned) {
  gAxis.selectAll("*").remove();

  const left = d3.min(positioned, (d) => d.x) ?? MARGIN.left;
  const right = d3.max(positioned, (d) => d.x) ?? width - MARGIN.right;

  gAxis
    .append("line")
    .attr("class", "axis-line")
    .attr("x1", left)
    .attr("y1", axisY)
    .attr("x2", right)
    .attr("y2", axisY)
    .attr("stroke", "#263244")
    .attr("stroke-width", 2);

  gAxis
    .append("text")
    .attr("x", left)
    .attr("y", axisY + 36)
    .attr("fill", "#5c6773")
    .attr("font-size", 12)
    .text("Move sequence");
}

function render() {
  const positioned = buildPositionedNodes();
  const byId = new Map(positioned.map((d) => [d.id, d]));

  renderAxis(positioned);

  let visibleLinks = links
    .map((l) => {
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      return s && t ? { ...l, s, t } : null;
    })
    .filter(Boolean);

  if (focusedId) {
    visibleLinks = visibleLinks.filter((l) => {
      const incoming = l.target === focusedId;
      const outgoing = l.source === focusedId;
      return (showIncoming && incoming) || (showOutgoing && outgoing);
    });
  }

  visibleLinks.sort((a, b) => {
    const da = Math.abs(a.t.index - a.s.index);
    const db = Math.abs(b.t.index - b.s.index);
    return da - db;
  });

  const linkSel = gLinks
    .selectAll("path.link")
    .data(visibleLinks, (d) => `${d.source}->${d.target}`);

  linkSel
    .enter()
    .append("path")
    .attr("class", "link")
    .merge(linkSel)
    .attr("fill", "none")
    .attr("stroke", "#7f8ea3")
    .attr("stroke-width", (d) => 1.2 + normalizeWeight(d.weight) * 2.2)
    .attr(
      "stroke-opacity",
      (d) =>
        LINK_MIN_OPACITY +
        normalizeWeight(d.weight) * (LINK_MAX_OPACITY - LINK_MIN_OPACITY)
    )
    .attr("d", (d) => linkArcPath(d.s, d.t));

  linkSel.exit().remove();

  const nodeSel = gNodes.selectAll("g.node").data(positioned, (d) => d.id);

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
      gLinks.selectAll("path.link").classed("dim", true).classed("hi", false);

      gLinks
        .selectAll("path.link")
        .filter((l) => l.source === d.id || l.target === d.id)
        .classed("dim", false)
        .classed("hi", true);

      gNodes.selectAll("g.node").classed("dim", (n) => {
        if (n.id === d.id) return false;
        return !links.some(
          (l) =>
            (l.source === d.id && l.target === n.id) ||
            (l.target === d.id && l.source === n.id)
        );
      });
    })
    .on("mouseleave", () => {
      gLinks.selectAll("path.link").classed("dim", false).classed("hi", false);
      gNodes.selectAll("g.node").classed("dim", false);
    });

  nodeEnter.append("circle");
  nodeEnter.append("text").attr("class", "indexLabel");
  nodeEnter.append("title");

  const nodeAll = nodeEnter.merge(nodeSel);

  nodeAll
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .classed("focus", (d) => focusedId && d.id === focusedId)
    .classed("dim", (d) => {
      if (!focusedId) return false;
      if (d.id === focusedId) return false;
      return !links.some(
        (l) =>
          (l.source === focusedId && l.target === d.id) ||
          (l.target === focusedId && l.source === d.id)
      );
    });

  nodeAll
    .select("circle")
    .attr("r", NODE_RADIUS)
    .attr("fill", (d) =>
      focusedId && d.id === focusedId ? "#f1a340" : "#dce7f7"
    )
    .attr("stroke", "#263244")
    .attr("stroke-width", 2);

  nodeAll
    .select("text.indexLabel")
    .attr("text-anchor", "middle")
    .attr("y", 24)
    .attr("font-size", 11)
    .attr("fill", "#263244")
    .text((d) => d.id);

  nodeAll.select("title").text((d) => `${d.id}: ${d.text || d.label || ""}`);

  nodeSel.exit().remove();

  const labelSel = gLabels.selectAll("g.label").data(positioned, (d) => d.id);

  const labelEnter = labelSel.enter().append("g").attr("class", "label");

  labelEnter.append("text").attr("class", "moveText");
  labelEnter.append("text").attr("class", "metaText");

  const labelAll = labelEnter.merge(labelSel);

  labelAll
    .attr("transform", (d) => `translate(${d.x},${d.y - 18})`)
    .classed("dim", (d) => {
      if (!focusedId) return false;
      if (d.id === focusedId) return false;
      return !links.some(
        (l) =>
          (l.source === focusedId && l.target === d.id) ||
          (l.target === focusedId && l.source === d.id)
      );
    });

  labelAll
    .select("text.moveText")
    .attr("text-anchor", "middle")
    .attr("y", -10)
    .attr("font-size", 11)
    .attr("font-weight", 600)
    .attr("fill", "#111827")
    .text((d) => truncateText(d.text || d.label || ""));

  labelAll
    .select("text.metaText")
    .attr("text-anchor", "middle")
    .attr("y", -26)
    .attr("font-size", 10)
    .attr("fill", "#6b7280")
    .text((d) => {
      const who = d.who || "";
      const t = d.t || "";
      return [who, t].filter(Boolean).join(" · ");
    });

  labelSel.exit().remove();

  gLinks
    .selectAll("path.link.hi")
    .attr("stroke", "#f1a340")
    .attr("stroke-opacity", 1)
    .attr("stroke-width", 3);

  gLinks.selectAll("path.link.dim").attr("stroke-opacity", 0.08);
  gNodes.selectAll("g.node.dim").style("opacity", 0.28);
  gLabels.selectAll("g.label.dim").style("opacity", 0.28);
}

resize();
