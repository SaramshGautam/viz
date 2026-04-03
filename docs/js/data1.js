export const nodes = [
  {
    id: "I1",
    who: "A",
    t: "00:18",
    text: "Let’s do a 2-day coastal itinerary.",
  },
  {
    id: "I2",
    who: "B",
    t: "00:34",
    text: "Alternative: mountain cabin + hiking.",
  },
  {
    id: "I3",
    who: "C",
    t: "01:05",
    text: "Constraint: drive time max 4 hours.",
  },
  { id: "I4", who: "A", t: "01:22", text: "Cluster: coastal vs mountain." },
  { id: "I5", who: "B", t: "02:10", text: "Add lighthouse stop." },
  { id: "I6", who: "C", t: "03:02", text: "Summary: 2 options + constraints." },
  { id: "I7", who: "A", t: "03:44", text: "Premature convergence check." },
  { id: "I8", who: "B", t: "04:12", text: "Wild option: city food crawl." },
  { id: "I9", who: "C", t: "04:40", text: "Wild option: lake camping." },
];

export const links = [
  { source: "I4", target: "I1" },
  { source: "I4", target: "I2" },
  { source: "I5", target: "I1" },
  { source: "I6", target: "I3" },
  { source: "I6", target: "I4" },
  { source: "I7", target: "I6" },
  { source: "I8", target: "I7" },
  { source: "I9", target: "I7" },
];
