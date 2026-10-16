import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { renderOmap } from "./omap.js";

/** The tests run without a DOM, so the file gets a parser of its own. */
const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;

/**
 * A small map in the format's own shape: the colour table first, then the
 * symbol set inside the `<barrier>` Mapper always puts around it, and last
 * the objects. Colour 0 is on top, colour 1 below.
 */
function omap(body: {
  colors?: string;
  symbols: string;
  objects: string;
  scale?: number;
  georeferencing?: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="9">
<georeferencing scale="${body.scale ?? 10000}"${body.georeferencing === undefined ? "/>" : `>${body.georeferencing}</georeferencing>`}
<colors count="2">
${
  body.colors ??
  `<color priority="0" name="Svart" c="0" m="0" y="0" k="1"><rgb method="cmyk" r="0" g="0" b="0"/></color>
<color priority="1" name="Gul" c="0" m="0.27" y="0.79" k="0"><rgb method="cmyk" r="1" g="0.8" b="0.2"/></color>`
}
</colors>
<barrier version="6" required="0.6.0">
<symbols count="9">${body.symbols}</symbols>
<parts count="1" current="0"><part name="del"><objects count="9">${body.objects}</objects></part></parts>
</barrier>
</map>`;
}

const line = (color: number, width: number, extra = "") =>
  `<symbol type="2"><line_symbol color="${color}" line_width="${width}" join_style="0" cap_style="0"${extra}/></symbol>`;

const area = (color: number, inner = "") =>
  `<symbol type="4"><area_symbol inner_color="${color}" patterns="0">${inner}</area_symbol></symbol>`;

const render = (xml: string) => renderOmap(parse(xml));

describe("renderOmap", () => {
  it("keeps the file's own Y direction", () => {
    // Mapper coordinates already point down, like the screen's. Flipping
    // them mirrors the map; that was the bug this file once had.
    const { innerMarkup, viewBox } = render(
      omap({
        symbols: line(0, 100),
        objects: `<object type="1" symbol="0"><coords count="2">0 0;1000 2000;</coords></object>`,
      }),
    );
    expect(innerMarkup).toContain(`d="M 0 0 L 1000 2000"`);
    expect(viewBox).toBe("0 0 1000 2000");
  });

  it("reads colors from the priority attribute", () => {
    // The symbols refer to the colour's `priority`; reading the wrong
    // attribute leaves every lookup empty and the whole map unpainted.
    const { innerMarkup } = render(
      omap({
        symbols: area(1),
        objects: `<object type="1" symbol="0"><coords count="4">0 0;10 0;10 10;0 0 2;</coords></object>`,
      }),
    );
    // The yellow is converted from CMYK, not from the file's own RGB values.
    expect(innerMarkup).toContain(`fill="rgb(250, 178, 47)"`);
  });

  it("keeps an RGB color the file defines in RGB", () => {
    const { innerMarkup } = render(
      omap({
        colors: `<color priority="0" name="Egen"><rgb method="rgb" r="0.2" g="0.4" b="0.6"/></color>`,
        symbols: area(0),
        objects: `<object type="1" symbol="0"><coords count="4">0 0;10 0;10 10;0 0 2;</coords></object>`,
      }),
    );
    expect(innerMarkup).toContain(`fill="rgb(51, 102, 153)"`);
  });

  it("paints in the color table's order, frontmost color last", () => {
    // Colour 0 is first in the file and must be drawn last, whatever order
    // the objects are in.
    const { innerMarkup } = render(
      omap({
        symbols: `${line(0, 100)}${line(1, 100)}`,
        objects:
          `<object type="1" symbol="0"><coords count="2">0 0;10 10;</coords></object>` +
          `<object type="1" symbol="1"><coords count="2">20 20;30 30;</coords></object>`,
      }),
    );
    expect(innerMarkup.indexOf("rgb(250, 178, 47)")).toBeLessThan(
      innerMarkup.indexOf("rgb(35, 34, 38)"),
    );
  });

  it("skips objects whose symbol is hidden", () => {
    const { innerMarkup } = render(
      omap({
        symbols: `<symbol type="2" is_hidden="true"><line_symbol color="0" line_width="100"/></symbol>`,
        objects: `<object type="1" symbol="0"><coords count="2">0 0;10 10;</coords></object>`,
      }),
    );
    expect(innerMarkup).toBe("");
  });

  it("follows the curve, hole and close flags", () => {
    const { innerMarkup } = render(
      omap({
        symbols: area(0),
        objects:
          `<object type="1" symbol="0"><coords count="9">` +
          // Outer ring: a Bezier and a straight line back.
          `0 0 1;10 0;20 0;30 0;0 0 18;` +
          // Hole: a small ring of its own after the hole point.
          `5 5;8 5;5 8;5 5 2;` +
          `</coords></object>`,
      }),
    );
    expect(innerMarkup).toContain(`d="M 0 0 C 10 0 20 0 30 0 L 0 0 Z M 5 5 L 8 5 L 5 8 L 5 5 Z"`);
    // The hole is cut out, not filled.
    expect(innerMarkup).toContain(`fill-rule="evenodd"`);
  });

  it("gives a dashed line its dash pattern", () => {
    const { innerMarkup } = render(
      omap({
        symbols: line(0, 100, ` dashed="true" dash_length="400" break_length="100"`),
        objects: `<object type="1" symbol="0"><coords count="2">0 0;100 0;</coords></object>`,
      }),
    );
    expect(innerMarkup).toContain(`stroke-dasharray="400 100"`);
  });

  it("draws a double line's borders on both sides of it", () => {
    const { innerMarkup } = render(
      omap({
        symbols:
          `<symbol type="2"><line_symbol color="1" line_width="200" join_style="0" cap_style="0">` +
          `<borders><border color="0" width="50" shift="100"/></borders>` +
          `</line_symbol></symbol>`,
        objects: `<object type="1" symbol="0"><coords count="2">0 0;1000 0;</coords></object>`,
      }),
    );
    // The line runs along X, so the edges end up a hundred units above and below.
    expect(innerMarkup).toContain(`d="M 0 -100 L 1000 -100"`);
    expect(innerMarkup).toContain(`d="M 0 100 L 1000 100"`);
    expect(innerMarkup).toContain(`d="M 0 0 L 1000 0"`);
  });

  it("turns a point symbol's graphics with the object's rotation", () => {
    const { innerMarkup } = render(
      omap({
        symbols:
          `<symbol type="1"><point_symbol inner_radius="0" inner_color="-1" outer_width="0" outer_color="-1" elements="1">` +
          `<element><symbol type="2"><line_symbol color="0" line_width="50" join_style="0" cap_style="0"/></symbol>` +
          `<object type="1"><coords count="2">0 -300;0 0;</coords></object></element>` +
          `</point_symbol></symbol>`,
        objects: `<object type="0" symbol="0" rotation="1.5707963"><coords count="1">400 700;</coords></object>`,
      }),
    );
    // A quarter turn anticlockwise on screen, so a negative angle for SVG.
    expect(innerMarkup).toContain(`transform="translate(400, 700) rotate(-90)"`);
    expect(innerMarkup).toContain(`d="M 0 -300 L 0 0"`);
  });

  it("defines an area pattern once however many objects use it", () => {
    const { innerMarkup } = render(
      omap({
        symbols: area(
          -1,
          `<pattern type="1" angle="0" line_spacing="500" line_offset="0" color="1" line_width="60"/>`,
        ),
        objects:
          `<object type="1" symbol="0"><coords count="4">0 0;10 0;10 10;0 0 2;</coords></object>` +
          `<object type="1" symbol="0"><coords count="4">20 20;30 20;30 30;20 20 2;</coords></object>`,
      }),
    );
    expect(innerMarkup.match(/<pattern /g)).toHaveLength(1);
    expect(innerMarkup.match(/url\(#omap-pattern-0-0\)/g)).toHaveLength(2);
  });

  it("places a text object with its font, color and alignment", () => {
    const { innerMarkup } = render(
      omap({
        symbols: `<symbol type="8"><text_symbol><font family="Arial" size="2000"/><text color="0" line_spacing="1"/></text_symbol></symbol>`,
        objects: `<object type="4" symbol="0" h_align="1" v_align="0"><coords count="1">100 200;</coords><text>Berget</text></object>`,
      }),
    );
    expect(innerMarkup).toContain(`font-family="Arial"`);
    expect(innerMarkup).toContain(`font-size="2000"`);
    expect(innerMarkup).toContain(`text-anchor="middle"`);
    expect(innerMarkup).toContain(`>Berget</tspan>`);
  });

  it("reads the scale, and falls back when the file's is nonsense", () => {
    const good = render(omap({ symbols: "", objects: "", scale: 7500 }));
    expect(good).toMatchObject({ scale: 7500, scaleFromFile: true, metersPerUnit: 0.0075 });

    const bad = render(omap({ symbols: "", objects: "", scale: 0 }));
    expect(bad).toMatchObject({ scale: 15000, scaleFromFile: false });
  });
});

describe("the georeference", () => {
  /** SWEREF 99 TM and a reference point that the file also gives in
   * degrees, as in a real map. */
  const sweref =
    `<projected_crs id="EPSG"><spec language="PROJ.4">+init=epsg:3006</spec>` +
    `<parameter>3006</parameter><ref_point x="610000" y="6799000"/></projected_crs>`;

  it("reads the projection, reference point and rotation", () => {
    const { georef } = render(
      omap({ symbols: "", objects: "", scale: 5000, georeferencing: sweref }),
    );
    expect(georef).toMatchObject({
      easting: 610000,
      northing: 6799000,
      grivationDeg: 0,
      projection: { centralMeridian: 15, scaleFactor: 0.9996, falseEasting: 500000 },
    });
  });

  it("moves the origin when the reference point is not there", () => {
    // The reference point is 1000 units east and 2000 units south of the
    // map's origin (the map's y points down). A unit is 1/1000 mm on paper,
    // so at 1:5 000 that is 5 m east and 10 m south; the origin thus lies
    // 5 m west and 10 m north of the reference point.
    const { georef } = render(
      omap({
        symbols: "",
        objects: "",
        scale: 5000,
        georeferencing: `<ref_point x="1000" y="2000"/>${sweref}`,
      }),
    );
    expect(georef?.easting).toBeCloseTo(610000 - 5, 6);
    expect(georef?.northing).toBeCloseTo(6799000 + 10, 6);
  });

  it("gives nothing for a map without a georeference, or for a grid it does not convert", () => {
    expect(render(omap({ symbols: "", objects: "" })).georef).toBeNull();
    expect(
      render(
        omap({
          symbols: "",
          objects: "",
          georeferencing:
            `<projected_crs id="EPSG"><parameter>27700</parameter>` +
            `<ref_point x="0" y="0"/></projected_crs>`,
        }),
      ).georef,
    ).toBeNull();
  });
});
