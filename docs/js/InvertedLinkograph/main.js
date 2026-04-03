import { normalizeAndComputeEpisode } from "./linkograph-core.js";
import { LinkographRenderer } from "./linkograph-viz.js";

// const DEFAULT_DATASET_PATH = "../data/data.json";
const DEFAULT_DATASET_PATH = "../data/TeamRoadTrip_notes.json";

const container = document.getElementById("viz");
const btnIncoming = document.getElementById("toggleIncoming");
const btnOutgoing = document.getElementById("toggleOutgoing");
const btnReset = document.getElementById("reset");
const actorSelect = document.getElementById("actorSelect");

if (!container) {
  throw new Error('Missing mount node: <div id="viz"></div>');
}

const renderer = new LinkographRenderer({
  container,
  mirroredActor: 1,
});

function setToggleButtonState() {
  if (btnIncoming) {
    btnIncoming.style.opacity = renderer.showIncoming ? 1 : 0.55;
    btnIncoming.textContent = renderer.showIncoming ? "Incoming ✓" : "Incoming";
  }
  if (btnOutgoing) {
    btnOutgoing.style.opacity = renderer.showOutgoing ? 1 : 0.55;
    btnOutgoing.textContent = renderer.showOutgoing ? "Outgoing ✓" : "Outgoing";
  }
}

if (btnIncoming) {
  btnIncoming.addEventListener("click", () => {
    renderer.showIncoming = !renderer.showIncoming;
    setToggleButtonState();
    renderer.render();
  });
}

if (btnOutgoing) {
  btnOutgoing.addEventListener("click", () => {
    renderer.showOutgoing = !renderer.showOutgoing;
    setToggleButtonState();
    renderer.render();
  });
}

if (btnReset) {
  btnReset.addEventListener("click", () => {
    renderer.resetFocus();
    setToggleButtonState();
  });
}

if (actorSelect) {
  actorSelect.addEventListener("change", (event) => {
    renderer.setMirroredActor(Number(event.target.value));
  });
}

window.addEventListener("resize", () => {
  renderer.resize();
});

setToggleButtonState();

async function init() {
  try {
    const res = await fetch(DEFAULT_DATASET_PATH);
    if (!res.ok) {
      throw new Error(`Failed to fetch dataset: ${res.status}`);
    }

    const json = await res.json();
    const episode = await normalizeAndComputeEpisode(json, "Linkograph");

    renderer.setEpisode(episode);
    renderer.populateActorSelect(actorSelect);
    renderer.resize();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="color:crimson;font-family:Arial,sans-serif;padding:16px;">${
      err.message || "Could not load linkograph dataset."
    }</div>`;
  }
}

init();
