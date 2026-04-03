export const designMoves = [
  { id: "M1", label: "Visiting three States", actor: "A", time: "00:18" },
  { id: "M2", label: "Colorado", actor: "A", time: "00:34" },
  { id: "M3", label: "Utah", actor: "B", time: "01:05" },
  { id: "M4", label: "Vegas Baby", actor: "C", time: "01:22" },
  { id: "M5", label: "Stay one night in Vegas", actor: "A", time: "02:10" },
  { id: "M6", label: "Denver", actor: "B", time: "03:02" },
  { id: "M7", label: "Salt Lake City", actor: "C", time: "03:44" },
];

export const participantLayers = [
  {
    participant: "A",
    color: "#ff6b6b",
    links: [
      { source: "M1", target: "M2", weight: 0.9 },
      { source: "M2", target: "M5", weight: 0.7 },
      { source: "M5", target: "M6", weight: 0.5 },
    ],
  },
  {
    participant: "B",
    color: "#4dabf7",
    links: [
      { source: "M1", target: "M3", weight: 0.6 },
      { source: "M3", target: "M6", weight: 0.85 },
    ],
  },
  {
    participant: "C",
    color: "#51cf66",
    links: [
      { source: "M3", target: "M4", weight: 0.7 },
      { source: "M4", target: "M7", weight: 0.8 },
    ],
  },
];
