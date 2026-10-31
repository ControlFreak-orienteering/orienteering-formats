import { describe, expect, it } from "vitest";
import { parseOcadFile } from "./parser.js";
import { renderMapSvg } from "./render-svg.js";
import {
  ALL_VERSIONS,
  OcdFileBuilder,
  type OcdVersion,
} from "../testing/ocd-builder.js";

/** A small but complete map: two colors, a scale, one symbol of each kind
 * and one object per symbol. */
function sampleMap(version: OcdVersion) {
  return new OcdFileBuilder(version)
    .addColor(0, "Black", [0, 0, 0, 100])
    .addColor(1, "Yellow", [0, 27, 79, 0])
    .addScale(10000)
    .addPointSymbol({
      symNum: 101000,
      description: "Boulder",
      elements: [{ type: 4, color: 0, diameter: 60, points: [[0, 0]] }],
    })
    .addLineSymbol({ symNum: 501000, lineColor: 0, lineWidth: 35 })
    .addAreaSymbol({ symNum: 401000, fillColor: 1 })
    .addTextSymbol({
      symNum: 701000,
      fontName: "Arial",
      fontColor: 0,
      fontSizeTenths: 100,
    })
    .addObject({ sym: 101000, otp: 1, coords: [[1234, -5678]] })
    .addObject({
      sym: 501000,
      otp: 2,
      coords: [
        [0, 0],
        [100, 50, 0x01], // first Bezier control point
        [200, 50, 0x02], // second Bezier control point
        [300, 0],
        [-400, -300],
      ],
    })
    .addObject({
      sym: 401000,
      otp: 3,
      coords: [
        [0, 0],
        [1000, 0],
        [1000, 1000],
        [0, 1000],
        [200, 200, 0, 0x02], // hole start
        [800, 200],
        [800, 800],
      ],
    })
    .addObject({
      sym: 701000,
      otp: 4,
      coords: [[50, 60]],
      // Longer than one text slot, with non-ASCII, an astral (surrogate
      // pair) character and an OCAD-style "\r\n" line break.
      text: "Kontroll 31 – Hällmarken\r\nÅäö \u{1F642}",
    });
}

describe.each(ALL_VERSIONS)("parseOcadFile - OCAD %i layout", (version) => {
  const map = parseOcadFile(sampleMap(version).build());

  it("reads the header and parameter strings", () => {
    expect(map.version).toBe(version);
    expect(map.warnings).toEqual([]);
    expect(map.colors.map((c) => [c.number, c.name, c.order])).toEqual([
      [0, "Black", 0],
      [1, "Yellow", 1],
    ]);
    expect(map.colors[0]!.rgb).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(map.georef?.mapScale).toBe(10000);
  });

  it("reads every symbol kind", () => {
    expect(map.symbols.map((s) => [s.symNum, s.kind])).toEqual([
      [101000, "point"],
      [501000, "line"],
      [401000, "area"],
      [701000, "text"],
    ]);
    const line = map.symbolsByNumber.get(501000);
    expect(line?.kind === "line" && line.lineWidth).toBe(35);
    const area = map.symbolsByNumber.get(401000);
    expect(area?.kind === "area" && area.fillColor).toBe(1);
    const text = map.symbolsByNumber.get(701000);
    expect(text?.kind === "text" && text.fontName).toBe("Arial");
    if (version <= 10) {
      expect(map.symbolsByNumber.get(101000)?.description).toBe("Boulder");
    }
  });

  it("reads object geometry, including negative coordinates and vertex flags", () => {
    expect(map.objects).toHaveLength(4);
    const [point, line, area] = map.objects;
    expect(point?.coordinates[0]).toMatchObject({ x: 1234, y: -5678 });

    expect(line?.coordinates.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [100, 50],
      [200, 50],
      [300, 0],
      [-400, -300],
    ]);
    expect(line?.coordinates[1]?.bezierFirst).toBe(true);
    expect(line?.coordinates[2]?.bezierSecond).toBe(true);
    expect(line?.coordinates[3]?.bezierFirst).toBe(false);

    expect(area?.coordinates[4]?.holeStart).toBe(true);
    expect(area?.coordinates[3]?.holeStart).toBe(false);
  });

  it("decodes the full UTF-16 text of a text object", () => {
    const text = map.objects[3];
    expect(text?.kind).toBe("text");
    expect(text?.text).toBe("Kontroll 31 – Hällmarken\nÅäö \u{1F642}");
  });

  it("renders to SVG markup with the text included", () => {
    const { innerMarkup, viewBox } = renderMapSvg(map);
    expect(viewBox.split(" ")).toHaveLength(4);
    expect(innerMarkup).toContain("<circle");
    expect(innerMarkup).toContain('stroke-width="35"');
    expect(innerMarkup).toContain("Kontroll 31 – Hällmarken");
    expect(innerMarkup).toContain("<tspan");
  });
});

describe("parseOcadFile - corrupt input", () => {
  it("rejects non-OCAD data with a clear error", () => {
    expect(() => parseOcadFile(new ArrayBuffer(10))).toThrow(
      /Not an OCAD file/,
    );
    const junk = new Uint8Array(200);
    junk[0] = 0x12;
    expect(() => parseOcadFile(junk.buffer)).toThrow(/Not an OCAD file/);
  });

  it.each(["strings", "symbols", "objects"] as const)(
    "terminates when the %s index block points at itself",
    (which) => {
      const builder = sampleMap(2018);
      builder.selfLinkedIndex[which] = true;
      const map = parseOcadFile(builder.build());
      // Every entry is seen exactly once: the chain is followed, but not twice.
      expect(map.objects).toHaveLength(4);
      expect(map.symbols).toHaveLength(4);
      expect(map.colors).toHaveLength(2);
    },
  );

  it("returns a partial map instead of throwing when the file is truncated", () => {
    const full = sampleMap(12).build();
    for (const fraction of [0.95, 0.75, 0.5, 0.25]) {
      const cut = full.slice(0, Math.floor(full.byteLength * fraction));
      expect(() => parseOcadFile(cut)).not.toThrow();
    }
  });

  it("skips an object whose vertex count runs past the end of the file", () => {
    const buf = sampleMap(11)
      .addObject({
        sym: 501000,
        otp: 2,
        coords: [[0, 0]],
        nItemOverride: 0x7fffffff,
      })
      .build();
    const map = parseOcadFile(buf);
    expect(map.objects).toHaveLength(4);
    expect(map.warnings).toHaveLength(1);
    expect(map.warnings[0]).toMatch(/beyond end of file/);
  });

  it("escapes markup and drops XML-illegal characters in text objects", () => {
    const buf = sampleMap(2018)
      .addObject({ sym: 701000, otp: 4, coords: [[0, 0]], text: 'ab<c>&"d' })
      .build();
    const { innerMarkup } = renderMapSvg(parseOcadFile(buf));
    expect(innerMarkup).toContain("ab&lt;c&gt;&amp;&quot;d");
    // eslint-disable-next-line no-control-regex
    expect(innerMarkup).not.toMatch(/[-]/);
  });
});

describe("symbols drawn from more than one primitive", () => {
  it.each(ALL_VERSIONS)(
    "keeps every part of the symbol (OCAD %s)",
    (version) => {
      // A tower: a crossbar and a post, two strokes in the same symbol. If the
      // symbol's data budget is read in the wrong unit it only covers the
      // first, and the tower loses its post without anything saying so.
      const file = new OcdFileBuilder(version)
        .addColor(0, "Black", [0, 0, 0, 100])
        .addScale(15000)
        .addPointSymbol({
          symNum: 535000,
          description: "Tower",
          elements: [
            {
              type: 1,
              color: 0,
              lineWidth: 18,
              points: [
                [-60, 60],
                [60, 60],
              ],
            },
            {
              type: 1,
              color: 0,
              lineWidth: 18,
              points: [
                [0, 60],
                [0, -60],
              ],
            },
          ],
        })
        .addObject({ sym: 535000, otp: 1, coords: [[1000, 1000]] })
        .build();

      const map = parseOcadFile(file);
      const tower = map.symbolsByNumber.get(535000);
      expect(tower?.kind).toBe("point");
      const elements = tower?.kind === "point" ? tower.elements : [];
      expect(elements).toHaveLength(2);
      expect(elements[1]!.points.map((p) => [p.x, p.y])).toEqual([
        [0, 60],
        [0, -60],
      ]);

      // And both strokes end up in the map.
      const { innerMarkup } = renderMapSvg(map);
      expect(innerMarkup.match(/<path /g)).toHaveLength(2);
      expect(innerMarkup).toContain("M 1000 -1060 L 1000 -940");
    },
  );
});
