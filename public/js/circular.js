import { nodes, links } from "./data.js";

const container = document.getElementById("viz");
const svg = d3.select(container).append("svg");
const root = svg.append("g");

const gLinks = root.append("g");
const gCards = root.append("g");

let width = 800;
let height = 600;
let center = { x: width / 2, y: height / 2 };
let radius = 210;

let rotationDeg = 0;
let focusedId = null;

let showIncoming = true;
let showOutgoing = true;

const rotInput = document.getElementById("rot");
const btnIncoming = document.getElementById("toggleIncoming");
const btnOutgoing = document.getElementById("toggleOutgoing");
const btnReset = document.getElementById("reset");

const CARD_W = 240;
const CARD_H = 120;

function resize() {
  const r = container.getBoundingClientRect();
  width = Math.max(320, r.width);
  height = Math.max(320, r.height);

  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("width", width).attr("height", height);

  center = { x: width / 2, y: height / 2 };
  radius = Math.min(width, height) * 0.34;

  render();
}

window.addEventListener("resize", resize);

const drag = d3
  .drag()
  .on("start", (event) => {
    root.attr("data-drag-start-x", event.x);
    root.attr("data-drag-start-rot", rotationDeg);
  })
  .on("drag", (event) => {
    const startX = +root.attr("data-drag-start-x");
    const startRot = +root.attr("data-drag-start-rot");
    const dx = event.x - startX;

    rotationDeg = startRot + dx * 0.25;
    rotationDeg = Math.max(-180, Math.min(180, rotationDeg));
    rotInput.value = rotationDeg;
    render();
  });

svg.call(drag);

rotInput.addEventListener("input", (e) => {
  rotationDeg = +e.target.value;
  render();
});

function setToggleButtonState() {
  btnIncoming.style.opacity = showIncoming ? 1 : 0.55;
  btnOutgoing.style.opacity = showOutgoing ? 1 : 0.55;
  btnIncoming.textContent = showIncoming ? "Incoming ✓" : "Incoming";
  btnOutgoing.textContent = showOutgoing ? "Outgoing ✓" : "Outgoing";
}

btnIncoming.addEventListener("click", () => {
  showIncoming = !showIncoming;
  setToggleButtonState();
  render();
});

btnOutgoing.addEventListener("click", () => {
  showOutgoing = !showOutgoing;
  setToggleButtonState();
  render();
});

btnReset.addEventListener("click", () => {
  focusedId = null;
  rotationDeg = 0;
  rotInput.value = 0;
  showIncoming = true;
  showOutgoing = true;
  setToggleButtonState();
  render();
});

setToggleButtonState();

function angleForIndex(i, n) {
  const base = (i / n) * Math.PI * 2;
  return base + (rotationDeg * Math.PI) / 180;
}

function posForIndex(i, n) {
  const a = angleForIndex(i, n);
  return {
    x: center.x + radius * Math.cos(a),
    y: center.y + radius * Math.sin(a),
    a,
  };
}

function depthFromAngle(a) {
  const frontA = -Math.PI / 2;
  return (Math.cos(a - frontA) + 1) / 2;
}

function cardTransform(p, depth) {
  const s = 0.78 + depth * 0.42;
  const yLift = (1 - depth) * 18;
  return `translate(${p.x},${p.y + yLift}) scale(${s})`;
}

function linkPath(p1, p2) {
  const cx = center.x;
  const cy = center.y;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);

  const bend = Math.max(40, Math.min(180, dist * 0.35));

  const c1x = (p1.x + cx) / 2;
  const c1y = (p1.y + cy) / 2;
  const c2x = (p2.x + cx) / 2;
  const c2y = (p2.y + cy) / 2;

  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);

  const cc1x = c1x + nx * bend;
  const cc1y = c1y + ny * bend;
  const cc2x = c2x + nx * bend;
  const cc2y = c2y + ny * bend;

  return `M ${p1.x} ${p1.y} C ${cc1x} ${cc1y}, ${cc2x} ${cc2y}, ${p2.x} ${p2.y}`;
}

function wrapText(selection, maxWidth, maxLines) {
  selection.each(function (d) {
    const textSel = d3.select(this);
    textSel.selectAll("*").remove();

    const words = d.text.split(/\s+/);
    const lineHeight = 16;
    let line = [];
    let lineNumber = 0;

    let tspan = textSel
      .append("tspan")
      .attr("x", -CARD_W / 2 + 14)
      .attr("dy", 0);

    for (const word of words) {
      line.push(word);
      tspan.text(line.join(" "));

      const node = tspan.node();
      if (node && node.getComputedTextLength() > maxWidth) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        lineNumber += 1;

        if (lineNumber >= maxLines) {
          const current = tspan.text();
          tspan.text(current.replace(/\.*$/, "") + "…");
          break;
        }

        tspan = textSel
          .append("tspan")
          .attr("x", -CARD_W / 2 + 14)
          .attr("dy", lineHeight)
          .text(word);
      }
    }
  });
}

function render() {
  const n = nodes.length;

  const positioned = nodes.map((d, i) => {
    const p = posForIndex(i, n);
    const depth = depthFromAngle(p.a);
    return { ...d, i, ...p, depth };
  });

  positioned.sort((a, b) => a.depth - b.depth);

  const posById = new Map(positioned.map((d) => [d.id, d]));

  function effectiveDepth(d) {
    if (focusedId && d.id === focusedId) return 1.4;
    return d.depth;
  }

  const enrichedLinks = links
    .map((l) => {
      const s = posById.get(l.source);
      const t = posById.get(l.target);
      return { ...l, s, t };
    })
    .filter((l) => l.s && l.t);

  let visibleLinks = enrichedLinks;

  if (focusedId) {
    visibleLinks = enrichedLinks.filter((l) => {
      const isIncoming = l.target === focusedId;
      const isOutgoing = l.source === focusedId;
      return (showIncoming && isIncoming) || (showOutgoing && isOutgoing);
    });
  }

  const linkSel = gLinks
    .selectAll("path.link")
    .data(visibleLinks, (d) => `${d.source}->${d.target}:${d.type || ""}`);

  linkSel
    .enter()
    .append("path")
    .attr("class", "link")
    .merge(linkSel)
    .attr("d", (d) => linkPath({ x: d.s.x, y: d.s.y }, { x: d.t.x, y: d.t.y }));

  linkSel.exit().remove();

  const cardSel = gCards.selectAll("g.card").data(positioned, (d) => d.id);

  const cardEnter = cardSel
    .enter()
    .append("g")
    .attr("class", "card")
    .on("click", (event, d) => {
      focusedId = focusedId === d.id ? null : d.id;

      if (focusedId) {
        const currentAngle = d.a;
        const frontA = -Math.PI / 2;
        const delta = frontA - currentAngle;
        rotationDeg += (delta * 180) / Math.PI;
        rotationDeg = Math.max(-180, Math.min(180, rotationDeg));
        rotInput.value = rotationDeg;
      }

      render();
    })
    .on("mouseenter", (event, d) => {
      gLinks.selectAll("path.link").classed("dim", true).classed("hi", false);

      gLinks
        .selectAll("path.link")
        .filter((l) => l.source === d.id || l.target === d.id)
        .classed("dim", false)
        .classed("hi", true);

      if (!focusedId) {
        gCards.selectAll("g.card").classed("dim", (c) => c.id !== d.id);
      }
    })
    .on("mouseleave", () => {
      gLinks.selectAll("path.link").classed("dim", false).classed("hi", false);
      gCards.selectAll("g.card").classed("dim", false);
    });

  cardEnter
    .append("rect")
    .attr("x", -CARD_W / 2)
    .attr("y", -CARD_H / 2)
    .attr("width", CARD_W)
    .attr("height", CARD_H);

  cardEnter
    .append("text")
    .attr("class", "meta")
    .attr("x", -CARD_W / 2 + 14)
    .attr("y", -CARD_H / 2 + 22);

  cardEnter
    .append("text")
    .attr("class", "text")
    .attr("x", -CARD_W / 2 + 14)
    .attr("y", -CARD_H / 2 + 46);

  const badge = cardEnter
    .append("g")
    .attr("transform", `translate(${CARD_W / 2 - 66},${-CARD_H / 2 + 10})`);

  badge
    .append("rect")
    .attr("class", "badge")
    .attr("width", 56)
    .attr("height", 22);

  badge
    .append("text")
    .attr("class", "badgeText")
    .attr("x", 28)
    .attr("y", 15)
    .attr("text-anchor", "middle");

  const cardAll = cardEnter.merge(cardSel);

  cardAll
    .classed("focus", (d) => focusedId && d.id === focusedId)
    .attr("transform", (d) => cardTransform(d, effectiveDepth(d)));

  cardAll.select("text.meta").text((d) => `${d.who} · ${d.t}`);
  cardAll.select(".badgeText").text((d) => d.id);
  wrapText(cardAll.select("text.text"), CARD_W - 28, 3);

  if (focusedId) {
    const neighbors = new Set([focusedId]);
    links.forEach((l) => {
      if (l.source === focusedId) neighbors.add(l.target);
      if (l.target === focusedId) neighbors.add(l.source);
    });

    gCards.selectAll("g.card").classed("dim", (d) => !neighbors.has(d.id));
  } else {
    gCards.selectAll("g.card").classed("dim", false);
  }
}

resize();
