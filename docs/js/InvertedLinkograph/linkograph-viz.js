import {
  MIN_LINK_STRENGTH,
  colorForActor,
  rgbToStr,
  clamp01,
  scale,
  getPairThreshold,
} from "./linkograph-core.js";

export const SEGMENT_THRESHOLD = 1000 * 60 * 30;

export class LinkographRenderer {
  constructor({
    container,
    mirroredActor = 1,
    margin = { top: 70, right: 40, bottom: 90, left: 40 },
    nodeRadius = 6,
    showLabels = false,
  }) {
    if (!container) {
      throw new Error('Missing mount node: <div id="viz"></div>');
    }

    this.container = container;
    this.container.style.overflow = "auto";
    this.container.style.width = "100%";
    this.container.style.maxWidth = "100%";

    this.svg = d3.select(container).append("svg");
    this.root = this.svg.append("g");

    this.gAxis = this.root.append("g");
    this.gDividers = this.root.append("g");
    this.gLinksUp = this.root.append("g");
    this.gLinksDown = this.root.append("g");
    this.gNodes = this.root.append("g");
    this.gLabels = this.root.append("g");

    this.width = 1200;
    this.height = 800;
    this.axisY = 300;

    this.MARGIN = margin;
    this.NODE_RADIUS = nodeRadius;
    this.SHOW_LABELS = showLabels;

    this.mirroredActor = mirroredActor;
    this.focusedId = null;
    this.showIncoming = true;
    this.showOutgoing = true;
    this.episode = null;

    this.tooltipStyle = "vertical-tag";
    // this.tooltipStyle = "card-callout";
  }

  setTooltipStyle(style) {
    this.tooltipStyle = style;
    this.render();
  }

  setEpisode(episode) {
    this.episode = episode;
  }

  setMirroredActor(actor) {
    this.mirroredActor = Number(actor);
    this.render();
  }

  setLinkVisibility({ showIncoming, showOutgoing }) {
    this.showIncoming = showIncoming;
    this.showOutgoing = showOutgoing;
    this.render();
  }

  resetFocus() {
    this.focusedId = null;
    this.showIncoming = true;
    this.showOutgoing = true;
    this.render();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    this.width = Math.max(900, r.width || 0);
    this.height = Math.max(800, r.height || 0);
    this.axisY = 300;
    this.render();
  }

  fitSvgToContent() {
    const bbox = this.root.node().getBBox();

    const PAD_LEFT = 30;
    const PAD_RIGHT = 30;
    const PAD_TOP = 30;
    const PAD_BOTTOM = 40;

    const contentWidth = Math.max(1, bbox.width);
    const contentHeight = Math.max(1, bbox.height);

    const vbWidth = Math.max(this.width, contentWidth + PAD_LEFT + PAD_RIGHT);
    const vbHeight = Math.max(
      this.height,
      contentHeight * 2 + PAD_TOP + PAD_BOTTOM
    );

    const startX = PAD_LEFT;
    const startY = vbHeight / 2;

    this.root.attr(
      "transform",
      `translate(${startX - bbox.x}, ${startY - bbox.y})`
    );

    this.svg.attr("viewBox", `0 0 ${vbWidth} ${vbHeight}`);
    this.svg.attr("width", vbWidth);
    this.svg.attr("height", vbHeight);
  }

  elbowPoint(sourceNode, targetNode, direction = "down") {
    const span = Math.abs(targetNode.x - sourceNode.x);
    const depth = Math.max(10, span * 0.52);

    return {
      x: (sourceNode.x + targetNode.x) / 2,
      y: direction === "up" ? this.axisY - depth : this.axisY + depth,
    };
  }

  linkLineData(sourceNode, targetNode, direction = "down") {
    const joint = this.elbowPoint(sourceNode, targetNode, direction);
    return {
      joint,
      segments: [
        { x1: sourceNode.x, y1: this.axisY, x2: joint.x, y2: joint.y },
        { x1: targetNode.x, y1: this.axisY, x2: joint.x, y2: joint.y },
      ],
    };
  }

  moveX(index, total) {
    const left = this.MARGIN.left + 20;
    const right = this.width - this.MARGIN.right - 20;
    if (total <= 1) return (left + right) / 2;
    return left + (index / (total - 1)) * (right - left);
  }

  shouldSegmentTimeline(currMove, prevMove) {
    if (!(currMove?.timestamp && prevMove?.timestamp)) return false;
    const deltaTime =
      Date.parse(currMove.timestamp) - Date.parse(prevMove.timestamp);
    return deltaTime >= SEGMENT_THRESHOLD;
  }

  buildPositionedMoves() {
    if (!this.episode) return [];
    return this.episode.moves.map((move, index) => ({
      ...move,
      id: move.id ?? String(index),
      index,
      x: this.moveX(index, this.episode.moves.length),
      y: this.axisY,
    }));
  }

  lineColor(strength, sourceActor, targetActor) {
    if (this.episode.actors.size > 1) {
      let targetColor = null;
      if (sourceActor === targetActor && sourceActor === 0) {
        targetColor = { red: 255, green: 0, blue: 0 };
      } else if (sourceActor === targetActor && sourceActor === 1) {
        targetColor = { red: 0, green: 0, blue: 255 };
      } else {
        targetColor = { red: 160, green: 0, blue: 255 };
      }

      const r = scale(strength, [MIN_LINK_STRENGTH, 1], [255, targetColor.red]);
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
      return `rgb(${r},${g},${b})`;
    }

    const gray = scale(strength, [MIN_LINK_STRENGTH, 1], [255, 0]);
    return `rgb(${gray},${gray},${gray})`;
  }

  getPersistentTooltipIds(visibleLinks) {
    if (!this.focusedId) return new Set();

    const ids = new Set([this.focusedId]);

    visibleLinks.forEach((l) => {
      if (l.source === this.focusedId) ids.add(l.target);
      if (l.target === this.focusedId) ids.add(l.source);
    });

    return ids;
  }

  renderPersistentTooltips(positionedMoves, visibleLinks) {
    const tooltipIds = this.getPersistentTooltipIds(visibleLinks);

    const tooltipData = positionedMoves.filter(
      (d) => tooltipIds.has(d.id) && d.text && d.text.trim()
    );

    const tooltipSel = this.gLabels
      .selectAll("g.persistent-tooltip")
      .data(tooltipData, (d) => d.id);

    const tooltipEnter = tooltipSel
      .enter()
      .append("g")
      .attr("class", "persistent-tooltip")
      .style("pointer-events", "none");

    // faint connector / tail
    tooltipEnter
      .append("line")
      .attr("class", "tooltip-connector")
      .attr("stroke", "rgba(148, 163, 184, 0.45)")
      .attr("stroke-width", 1.2);

    // for vertical tag style
    tooltipEnter
      .append("path")
      .attr("class", "tooltip-tail")
      .attr("fill", "rgba(15, 23, 42, 0.92)")
      .attr("stroke", "#475569")
      .attr("stroke-width", 1);

    tooltipEnter
      .append("rect")
      .attr("class", "tooltip-box")
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "rgba(15, 23, 42, 0.92)")
      .attr("stroke", "#475569")
      .attr("stroke-width", 1);

    tooltipEnter
      .append("text")
      .attr("class", "tooltip-text")
      .attr("fill", "#e5e7eb")
      .attr("font-size", 12)
      .attr("font-family", "sans-serif");

    const tooltipAll = tooltipEnter.merge(tooltipSel);

    tooltipAll.each((d, i, nodes) => {
      const g = d3.select(nodes[i]);
      const text = g.select("text.tooltip-text");
      const rect = g.select("rect.tooltip-box");
      const tail = g.select("path.tooltip-tail");
      const connector = g.select("line.tooltip-connector");

      text.text(d.text || "");

      const textNode = text.node();
      const bbox = textNode.getBBox();

      if (this.tooltipStyle === "vertical-tag") {
        const paddingX = 8;
        const paddingY = 6;

        const boxWidth = bbox.width + paddingX * 2;
        const boxHeight = bbox.height + paddingY * 2;

        // place just above node, then rotate
        const anchorX = d.x + 8;
        const anchorY = d.y - 14;

        g.attr("transform", `translate(${anchorX}, ${anchorY}) rotate(-90)`);

        rect
          .attr("x", 40)
          .attr("y", -boxHeight / 2)
          .attr("width", boxWidth)
          .attr("height", boxHeight)
          .attr("opacity", 0.98);

        text
          .attr("x", 48 + paddingX)
          //   .attr("y", bbox.height / 2)
          .attr("y", 0)
          .attr("dominant-baseline", "middle");

        // little pointed tail toward node
        // tail.attr(
        //   "d",
        //   `
        //   M 0 0
        //   L 10 0
        //   L 20 -6
        //   L 20 6
        //   L 10 5
        //   Z
        //   `
        // );

        // tail.attr(
        //   "d",
        //   `
        //     M 0 -1.5
        //     L 10 -1.5
        //     L 10 -6
        //     L 18 0
        //     L 10 6
        //     L 10 1.5
        //     L 0 1.5
        //     Z
        //     `
        // );

        tail.attr(
          "d",
          `
              M 0 0
              L 38 0
             
              `
        );

        connector
          .attr("x1", 0)
          .attr("y1", 0)
          .attr("x2", 0)
          .attr("y2", 0)
          .attr("opacity", 0); // not used in this style
      } else if (this.tooltipStyle === "card-callout") {
        const paddingX = 10;
        const paddingY = 7;

        const boxWidth = bbox.width + paddingX * 2;
        const boxHeight = bbox.height + paddingY * 2;

        const cardX = d.x + 14;
        const cardY = d.y - 42;

        g.attr("transform", `translate(0, 0)`);

        rect
          .attr("x", cardX)
          .attr("y", cardY)
          .attr("width", boxWidth)
          .attr("height", boxHeight)
          .attr("opacity", 0.98);

        text
          .attr("x", cardX + paddingX)
          .attr("y", cardY + paddingY + bbox.height - 2)
          .attr("dominant-baseline", "auto");

        // hide triangular tail for card mode
        tail.attr("d", "");

        // faint connector from node to card
        connector
          .attr("x1", d.x)
          .attr("y1", d.y)
          .attr("x2", cardX)
          .attr("y2", cardY + boxHeight / 2)
          .attr("opacity", 1);
      }
    });

    tooltipSel.exit().remove();
  }

  buildVisibleLinksDown(positionedMoves) {
    const byIndex = new Map(positionedMoves.map((m) => [m.index, m]));
    const result = [];

    for (const [currIdxRaw, linkSet] of Object.entries(this.episode.links)) {
      const currIdx = Number(currIdxRaw);
      const currMove = this.episode.moves[currIdx];
      const currNode = byIndex.get(currIdx);
      if (!currMove || !currNode) continue;

      for (const [prevIdxRaw, strength] of Object.entries(linkSet || {})) {
        const prevIdx = Number(prevIdxRaw);
        const prevMove = this.episode.moves[prevIdx];
        const prevNode = byIndex.get(prevIdx);
        if (!prevMove || !prevNode) continue;

        const pairThreshold = getPairThreshold(currMove, prevMove);
        if (strength < pairThreshold) continue;

        const sourceId = prevMove.id ?? String(prevIdx);
        const targetId = currMove.id ?? String(currIdx);
        const incoming = targetId === this.focusedId;
        const outgoing = sourceId === this.focusedId;

        if (
          this.focusedId &&
          !((this.showIncoming && incoming) || (this.showOutgoing && outgoing))
        ) {
          continue;
        }

        const geometry = this.linkLineData(prevNode, currNode, "down");

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
          color: this.lineColor(
            strength,
            prevMove.actor || 0,
            currMove.actor || 0
          ),
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

  buildVisibleLinksUp(positionedMoves) {
    const byIndex = new Map(positionedMoves.map((m) => [m.index, m]));
    const result = [];

    for (const [currIdxRaw, linkSet] of Object.entries(this.episode.links)) {
      const currIdx = Number(currIdxRaw);
      const currMove = this.episode.moves[currIdx];
      const currNode = byIndex.get(currIdx);
      if (!currMove || !currNode) continue;

      for (const [prevIdxRaw, strength] of Object.entries(linkSet || {})) {
        const prevIdx = Number(prevIdxRaw);
        const prevMove = this.episode.moves[prevIdx];
        const prevNode = byIndex.get(prevIdx);
        if (!prevMove || !prevNode) continue;

        const pairThreshold = getPairThreshold(currMove, prevMove);
        if (strength < pairThreshold) continue;

        if ((prevMove.actor || 0) !== this.mirroredActor) continue;
        if ((currMove.actor || 0) !== this.mirroredActor) continue;

        const sourceId = prevMove.id ?? String(prevIdx);
        const targetId = currMove.id ?? String(currIdx);

        const geometry = this.linkLineData(prevNode, currNode, "up");

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
          color: rgbToStr(colorForActor(this.mirroredActor)),
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

  renderAxis(positionedMoves) {
    this.gAxis.selectAll("*").remove();
    this.gDividers.selectAll("*").remove();

    if (!positionedMoves.length) return;

    const left = d3.min(positionedMoves, (d) => d.x);
    const right = d3.max(positionedMoves, (d) => d.x);

    this.gAxis
      .append("line")
      .attr("x1", left)
      .attr("y1", this.axisY)
      .attr("x2", right)
      .attr("y2", this.axisY)
      .attr("stroke", "#263244")
      .attr("stroke-width", 2);

    for (let i = 0; i < positionedMoves.length - 1; i++) {
      if (
        !this.shouldSegmentTimeline(positionedMoves[i + 1], positionedMoves[i])
      ) {
        continue;
      }
      const x = (positionedMoves[i].x + positionedMoves[i + 1].x) / 2;
      this.gDividers
        .append("line")
        .attr("x1", x)
        .attr("y1", this.MARGIN.top - 20)
        .attr("x2", x)
        .attr("y2", this.axisY + 30)
        .attr("stroke", "#999")
        .attr("stroke-dasharray", "3,3")
        .attr("stroke-width", 1);
    }
  }

  renderLinkLayer(layer, visibleLinks, classSuffix = "") {
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
          clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) *
            2.2
      )
      .attr(
        "stroke-opacity",
        (d) =>
          0.14 +
          clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) *
            0.76
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
          clamp01((d.weight - MIN_LINK_STRENGTH) / (1 - MIN_LINK_STRENGTH)) *
            0.7
      );

    jointSel.exit().remove();
  }

  applyFocusToLayer(layer, lineSelector, jointSelector) {
    if (!this.focusedId) {
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
      .classed(
        "dim",
        (d) => !(d.source === this.focusedId || d.target === this.focusedId)
      )
      .classed(
        "hi",
        (d) => d.source === this.focusedId || d.target === this.focusedId
      )
      .attr("stroke-opacity", (d) =>
        d.source === this.focusedId || d.target === this.focusedId ? 1 : 0.06
      );

    layer
      .selectAll(jointSelector)
      .classed(
        "dim",
        (d) => !(d.source === this.focusedId || d.target === this.focusedId)
      )
      .classed(
        "hi",
        (d) => d.source === this.focusedId || d.target === this.focusedId
      )
      .attr("fill-opacity", (d) =>
        d.source === this.focusedId || d.target === this.focusedId ? 1 : 0.08
      );
  }

  applyFocusDimming(positionedMoves, visibleLinks) {
    if (!this.focusedId) {
      this.gNodes.selectAll("g.node").classed("dim", false).style("opacity", 1);
      this.gLabels
        .selectAll("g.label")
        .classed("dim", false)
        .style("opacity", 1);

      this.applyFocusToLayer(
        this.gLinksDown,
        "line.link-down",
        "circle.link-joint-down"
      );
      this.applyFocusToLayer(
        this.gLinksUp,
        "line.link-up",
        "circle.link-joint-up"
      );
      return;
    }

    const neighbors = new Set([this.focusedId]);
    visibleLinks.forEach((l) => {
      if (l.source === this.focusedId) neighbors.add(l.target);
      if (l.target === this.focusedId) neighbors.add(l.source);
    });

    this.gNodes
      .selectAll("g.node")
      .classed("dim", (d) => !neighbors.has(d.id))
      .style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.24));

    this.gLabels
      .selectAll("g.label")
      .classed("dim", (d) => !neighbors.has(d.id))
      .style("opacity", (d) => (neighbors.has(d.id) ? 1 : 0.24));

    this.applyFocusToLayer(
      this.gLinksDown,
      "line.link-down",
      "circle.link-joint-down"
    );
    this.applyFocusToLayer(
      this.gLinksUp,
      "line.link-up",
      "circle.link-joint-up"
    );
  }

  highlightHoverAcrossLayers(d, visibleLinks) {
    this.gLinksDown
      .selectAll("line.link-down")
      .classed("dim", true)
      .classed("hi", false);
    this.gLinksDown
      .selectAll("circle.link-joint-down")
      .classed("dim", true)
      .classed("hi", false);

    this.gLinksUp
      .selectAll("line.link-up")
      .classed("dim", true)
      .classed("hi", false);
    this.gLinksUp
      .selectAll("circle.link-joint-up")
      .classed("dim", true)
      .classed("hi", false);

    this.gLinksDown
      .selectAll("line.link-down")
      .filter((l) => l.source === d.id || l.target === d.id)
      .classed("dim", false)
      .classed("hi", true)
      .attr("stroke-opacity", 1);

    this.gLinksDown
      .selectAll("circle.link-joint-down")
      .filter((l) => l.source === d.id || l.target === d.id)
      .classed("dim", false)
      .classed("hi", true)
      .attr("fill-opacity", 1);

    this.gLinksUp
      .selectAll("line.link-up")
      .filter((l) => l.source === d.id || l.target === d.id)
      .classed("dim", false)
      .classed("hi", true)
      .attr("stroke-opacity", 1);

    this.gLinksUp
      .selectAll("circle.link-joint-up")
      .filter((l) => l.source === d.id || l.target === d.id)
      .classed("dim", false)
      .classed("hi", true)
      .attr("fill-opacity", 1);

    this.gNodes.selectAll("g.node").style("opacity", (n) => {
      if (n.id === d.id) return 1;
      const connected = visibleLinks.some(
        (l) =>
          (l.source === d.id && l.target === n.id) ||
          (l.target === d.id && l.source === n.id)
      );
      return connected ? 1 : 0.24;
    });

    this.gLabels.selectAll("g.label").style("opacity", (n) => {
      if (n.id === d.id) return 1;
      const connected = visibleLinks.some(
        (l) =>
          (l.source === d.id && l.target === n.id) ||
          (l.target === d.id && l.source === n.id)
      );
      return connected ? 1 : 0.24;
    });
  }

  render() {
    if (!this.episode) return;

    const positionedMoves = this.buildPositionedMoves();
    const visibleLinksDown = this.buildVisibleLinksDown(positionedMoves);
    const visibleLinksUp = this.buildVisibleLinksUp(positionedMoves);
    const visibleLinks = [...visibleLinksDown, ...visibleLinksUp];

    this.renderAxis(positionedMoves);
    this.renderLinkLayer(this.gLinksDown, visibleLinksDown, "-down");
    this.renderLinkLayer(this.gLinksUp, visibleLinksUp, "-up");

    const nodeSel = this.gNodes
      .selectAll("g.node")
      .data(positionedMoves, (d) => d.id);

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        this.focusedId = this.focusedId === d.id ? null : d.id;
        this.render();
      })
      .on("mouseenter", (event, d) => {
        this.highlightHoverAcrossLayers(d, visibleLinks);
      })
      .on("mouseleave", () => {
        this.applyFocusDimming(positionedMoves, visibleLinks);
      });

    nodeEnter.append("circle");
    nodeEnter.append("rect").attr("class", "backbar");
    nodeEnter.append("rect").attr("class", "forebar");
    nodeEnter.append("title");

    const nodeAll = nodeEnter.merge(nodeSel);
    nodeAll.attr("transform", (d) => `translate(${d.x},${d.y})`);

    nodeAll
      .select("circle")
      .attr("r", this.NODE_RADIUS)
      .attr("fill", (d) => rgbToStr(colorForActor(d.actor || 0)))
      .attr("stroke", (d) =>
        this.focusedId && d.id === this.focusedId ? "#f1a340" : "#263244"
      )
      .attr("stroke-width", (d) =>
        this.focusedId && d.id === this.focusedId ? 3 : 2
      );

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
            [0, this.episode.maxBacklinkWeight || 1],
            [0, 40]
          )
      )
      .attr("height", (d) =>
        scale(
          d.backlinkWeight || 0,
          [0, this.episode.maxBacklinkWeight || 1],
          [0, 40]
        )
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
            [0, this.episode.maxForelinkWeight || 1],
            [0, 40]
          )
      )
      .attr("height", (d) =>
        scale(
          d.forelinkWeight || 0,
          [0, this.episode.maxForelinkWeight || 1],
          [0, 40]
        )
      );

    nodeAll.select("title").text((d) => `${d.id}: ${d.text || ""}`);
    // nodeAll.select("title").text("");

    nodeSel.exit().remove();

    this.gLabels.selectAll("*").remove();

    if (this.SHOW_LABELS) {
      const labelSel = this.gLabels
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

    this.applyFocusDimming(positionedMoves, visibleLinks);
    this.renderPersistentTooltips(positionedMoves, visibleLinks);
    this.fitSvgToContent();
  }

  populateActorSelect(selectEl) {
    if (!selectEl || !this.episode) return;

    const actors = Array.from(this.episode.actors).sort((a, b) => a - b);
    selectEl.innerHTML = actors
      .map((actor) => `<option value="${actor}">Actor ${actor}</option>`)
      .join("");

    if (!actors.includes(this.mirroredActor)) {
      this.mirroredActor = actors[0] ?? 0;
    }

    selectEl.value = String(this.mirroredActor);
  }
}
