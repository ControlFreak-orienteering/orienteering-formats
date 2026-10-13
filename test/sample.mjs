/** An exchange section with every field, shared by the tests. */
export const sampleExchange = {
  map: {
    scale: 10000,
    metersPerUnit: 0.1,
    georeference: {
      easting: 600000,
      northing: 6800000,
      grivationDeg: 1.5,
      projection: {
        centralMeridian: 15,
        latitudeOfOrigin: 0,
        scaleFactor: 0.9996,
        falseEasting: 500000,
        falseNorthing: 0,
        ellipsoid: { a: 6378137, f: 1 / 298.257222101 },
      },
    },
  },
  controls: [
    { id: "start1", kind: "start", codes: [], label: "S1", x: 0, y: 0, lat: 61.3, lng: 17.05 },
    { id: "c1", kind: "control", codes: [31], x: 1000, y: 2000, lat: 61.29, lng: 17.06 },
    { id: "c2", kind: "control", codes: [32], x: 3000, y: 2500 },
    { id: "c4", kind: "crossing", codes: [], x: 4000, y: 4500 },
    { id: "finish1", kind: "finish", codes: [], label: "M1", x: 6000, y: 6000 },
  ],
  courses: [
    {
      id: "1",
      name: "Bana 1",
      order: "fixed",
      controls: ["start1", "c1", "c4", "finish1"],
      lengthMeters: 1200,
      climbMeters: 45,
      printScale: 10000,
    },
    {
      id: "2",
      name: "Bana 2",
      order: "fixed",
      controls: ["start1", "c1", "finish1"],
      printScale: 7500,
      variations: [
        { code: "A", controls: ["start1", "c1", "finish1"], lengthMeters: 900 },
        { code: "B", controls: ["start1", "c2", "finish1"], lengthMeters: 950 },
      ],
    },
    { id: "3", name: "Poäng", order: "free", controls: ["c1", "c2"], scores: { c1: 10, c2: 20 } },
  ],
};
