import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { renderOmap } from "./omap.js";
import { parseOmapModel } from "./omap-model.js";

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;

/** A small map in the format's own shape, as in `omap.test.ts`. */
function omap(body: {
  symbols: string;
  parts: string[];
  scale?: number;
  georeferencing?: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="9">
<georeferencing scale="${body.scale ?? 10000}"${body.georeferencing === undefined ? "/>" : `>${body.georeferencing}</georeferencing>`}
<colors count="2">
<color priority="0" name="Svart" c="0" m="0" y="0" k="1"><rgb method="cmyk" r="0" g="0" b="0"/></color>
<color priority="1" name="Gul" c="0" m="0.27" y="0.79" k="0"><rgb method="cmyk" r="1" g="0.8" b="0.2"/></color>
</colors>
<barrier version="6" required="0.6.0">
<symbols count="9">${body.symbols}</symbols>
<parts count="${body.parts.length}" current="0">${body.parts
    .map((objects, i) => `<part name="del${i}"><objects count="9">${objects}</objects></part>`)
    .join("")}</parts>
</barrier>
</map>`;
}

const line = (code: string, width: number, color = 0) =>
  `<symbol type="2" code="${code}" name="Linje ${code}"><line_symbol color="${color}" line_width="${width}" join_style="0" cap_style="0"/></symbol>`;

const model = (xml: string) => parseOmapModel(parse(xml));

describe("parseOmapModel", () => {
  it("gives a line symbol and an object with its point flags", () => {
    const m = model(
      omap({
        symbols: line("506", 100),
        parts: [
          `<object type="1" symbol="0"><coords count="4">0 0 1;10 0;20 5 2;30 5 16;</coords></object>`,
        ],
      }),
    );
    expect(m.scale).toBe(10000);
    expect(m.colors).toMatchObject([
      { index: 0, name: "Svart", priority: 0 },
      { index: 1, name: "Gul", priority: 1 },
    ]);
    expect(m.symbols).toMatchObject([{ index: 0, code: "506", name: "Linje 506", kind: "line", hidden: false }]);
    expect(m.objects).toHaveLength(1);
    expect(m.objects[0]).toMatchObject({ symbolIndex: 0, rotation: 0, text: null, part: 0 });
    expect(m.objects[0]!.points).toEqual([
      { x: 0, y: 0, curveStart: true, closePoint: false, holePoint: false },
      { x: 10, y: 0, curveStart: false, closePoint: false, holePoint: false },
      { x: 20, y: 5, curveStart: false, closePoint: true, holePoint: false },
      { x: 30, y: 5, curveStart: false, closePoint: false, holePoint: true },
    ]);
  });

  it("tells looks apart by appearance, not by index, code or name", () => {
    const m = model(
      omap({
        symbols: line("506", 100) + line("507", 120) + line("508", 100),
        parts: [""],
      }),
    );
    expect(m.symbols[0]!.appearance).not.toBe(m.symbols[1]!.appearance);
    expect(m.symbols[0]!.appearance).toBe(m.symbols[2]!.appearance);
  });

  it("names colours in the appearance, so renumbered colours compare equal", () => {
    const a = model(omap({ symbols: line("1", 100, 0), parts: [""] }));
    const b = model(omap({ symbols: line("1", 100, 1), parts: [""] }));
    expect(a.symbols[0]!.appearance).not.toBe(b.symbols[0]!.appearance);
    expect(a.symbols[0]!.appearance).toContain("Svart");
  });

  it("reads text and rotation", () => {
    const m = model(
      omap({
        symbols: `<symbol type="8" code="999" name="Text"><text_symbol><font family="Arial" size="3000"/><text color="0" line_spacing="1"/></text_symbol></symbol>`,
        parts: [
          `<object type="4" symbol="0" rotation="1.5"><coords count="1">5 6;</coords><text>Hej</text></object>`,
        ],
      }),
    );
    expect(m.symbols[0]!.kind).toBe("text");
    expect(m.objects[0]).toMatchObject({ text: "Hej", rotation: 1.5 });
  });

  it("takes objects from every part", () => {
    const obj = `<object type="1" symbol="0"><coords count="1">1 1;</coords></object>`;
    const m = model(omap({ symbols: line("1", 100), parts: [obj, obj] }));
    expect(m.objects.map((o) => o.part)).toEqual([0, 1]);
  });

  it("reads the georeference as renderOmap does", () => {
    const sweref =
      `<projected_crs id="EPSG"><spec language="PROJ.4">+init=epsg:3006</spec>` +
      `<parameter>3006</parameter><ref_point x="610000" y="6799000"/></projected_crs>`;
    const xml = omap({ symbols: "", parts: [""], scale: 5000, georeferencing: sweref });
    const m = model(xml);
    expect(m.georeference).not.toBeNull();
    expect(m.georeference).toEqual(renderOmap(parse(xml)).georef);
    expect(model(omap({ symbols: "", parts: [""] })).georeference).toBeNull();
  });
});
