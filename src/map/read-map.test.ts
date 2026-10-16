import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { MapError, mapFileFormat, mapSvgMarkup, readMapFile } from "./read-map.js";
import { OcdFileBuilder } from "./testing/ocd-builder.js";

/** The tests run without a DOM, so .omap files get xmldom's parser. */
const parseXml = (xml: string) =>
  new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;

/** A small OCAD map at 1:10 000 with one boulder at (1234, -5678). */
function ocadMap(scale = 10000): ArrayBuffer {
  return new OcdFileBuilder(2018)
    .addColor(0, "Black", [0, 0, 0, 100])
    .addScale(scale)
    .addPointSymbol({
      symNum: 101000,
      description: "Boulder",
      elements: [{ type: 4, color: 0, diameter: 60, points: [[0, 0]] }],
    })
    .addObject({ sym: 101000, otp: 1, coords: [[1234, -5678]] })
    .build();
}

const OMAP = `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="9">
<georeferencing scale="7500"/>
<colors count="1"><color priority="0" name="Black" c="0" m="0" y="0" k="1"><rgb method="cmyk" r="0" g="0" b="0"/></color></colors>
<barrier version="6" required="0.6.0"><symbols count="1">
<symbol type="1" id="0" code="101.0" name="Boulder"><point_symbol inner_radius="300" inner_color="0"/></symbol>
</symbols></barrier>
<parts count="1"><part name="default"><objects count="1">
<object type="0" symbol="0"><coords count="1">1000 2000;</coords></object>
</objects></part></parts>
</map>`;

describe("mapFileFormat", () => {
  it("tells the format from the file name", () => {
    expect(mapFileFormat("Kantorp.OCD")).toBe("ocad");
    expect(mapFileFormat("Kantorp.omap")).toBe("omap");
    expect(mapFileFormat("Kantorp.xmap")).toBe("omap");
    expect(mapFileFormat("Kantorp.pdf")).toBeNull();
  });
});

describe("readMapFile", () => {
  it("draws an OCAD map in screen orientation, with its scale", () => {
    const drawing = readMapFile(ocadMap(), "Kantorp.ocd");
    expect(drawing.format).toBe("ocad");
    expect(drawing.scale).toBe(10000);
    expect(drawing.scaleFromFile).toBe(true);
    // 1/100 mm at 1:10 000.
    expect(drawing.metersPerUnit).toBeCloseTo(0.1);
    // OCAD's Y points up; the drawing's points down, as the exchange section's does.
    expect(drawing.innerMarkup).toContain('cx="1234" cy="5678"');
    expect(drawing.georef).toBeNull();
  });

  it("falls back to 1:15 000 when the file has no usable scale", () => {
    const drawing = readMapFile(ocadMap(0), "Kantorp.ocd");
    expect(drawing.scale).toBe(15000);
    expect(drawing.scaleFromFile).toBe(false);
  });

  it("accepts the bytes as a view into a larger buffer", () => {
    const file = new Uint8Array(ocadMap());
    const larger = new Uint8Array(file.length + 10);
    larger.set(file, 10);
    expect(readMapFile(larger.subarray(10), "Kantorp.ocd").scale).toBe(10000);
  });

  it("draws an OpenOrienteering Mapper map, with its scale", () => {
    const drawing = readMapFile(new TextEncoder().encode(OMAP), "Kantorp.omap", { parseXml });
    expect(drawing.format).toBe("omap");
    expect(drawing.scale).toBe(7500);
    // 1/1000 mm at 1:7 500.
    expect(drawing.metersPerUnit).toBeCloseTo(0.0075);
    expect(drawing.innerMarkup).toContain("<circle");
  });

  it("gives a standalone SVG document", () => {
    const markup = mapSvgMarkup(readMapFile(ocadMap(), "Kantorp.ocd"));
    expect(markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="')).toBe(true);
    expect(parseXml(markup).documentElement.localName).toBe("svg");
  });

  it.each([
    ["Kantorp.pdf", new Uint8Array(10), "unsupported-file"],
    ["Kantorp.ocd", new Uint8Array(100), "not-ocad"],
  ])("explains why %s cannot be read (%#)", (name, bytes, code) => {
    let error: unknown;
    try {
      readMapFile(bytes, name, { parseXml });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MapError);
    expect((error as MapError).code).toBe(code);
  });

  it("refuses an OCAD version it does not read", () => {
    const file = new Uint8Array(ocadMap());
    // The version is the word at byte 4; OCAD 9 is not read.
    new DataView(file.buffer).setUint16(4, 9, true);
    expect(() => readMapFile(file, "Kantorp.ocd")).toThrow(
      expect.objectContaining({ code: "ocad-version" }),
    );
  });

  it("refuses an .omap file that is not XML", () => {
    expect(() =>
      readMapFile(new TextEncoder().encode("not xml <"), "Kantorp.omap", {
        parseXml: () => {
          throw new Error("bad");
        },
      }),
    ).toThrow(expect.objectContaining({ code: "omap-unreadable" }));
  });
});
