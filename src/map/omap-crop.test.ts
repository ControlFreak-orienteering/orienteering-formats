import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { cropOmapDoc } from "./omap-crop.js";
import { renderOmap } from "./omap.js";

const parse = (xml: string) =>
  new DOMParser().parseFromString(
    xml,
    "application/xml",
  ) as unknown as Document;

/** Three boulders and a contour. The rectangle is -1000..1000 both ways (1/1000 mm).
 * The point symbol carries its own `<object>` as a template; it must stay. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<map xmlns="http://openorienteering.org/apps/mapper/xml/v2" version="9">
<colors count="1"><color priority="0" name="Black" c="0" m="0" y="0" k="1" opacity="1"/></colors>
<barrier version="6" required="0.6.0"><symbols count="2">
<symbol type="1" id="0" code="101"><point_symbol inner_radius="300" inner_color="0" elements="1"><element><symbol type="2" code=""><line_symbol color="0" line_width="70"/></symbol><object type="1"><coords count="2">-50000 -50000;50000 50000;</coords></object></element></point_symbol></symbol>
<symbol type="2" id="1" code="102"><line_symbol color="0" line_width="140"/></symbol>
</symbols>
<parts count="1" current="0"><part name="default"><objects count="4">
<object type="0" symbol="0"><coords count="1">100 200;</coords></object>
<object type="0" symbol="0"><coords count="1">50000 50000;</coords></object>
<object type="0" symbol="0"><coords count="1">-30000 700;</coords></object>
<object type="1" symbol="1"><coords count="2">-500 0;30000 0;</coords></object>
</objects></part></parts></barrier></map>`;

const RECT = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };

describe("cropping an Open Orienteering Mapper map", () => {
  it("keeps what reaches into the box, whole", () => {
    const doc = parse(XML);
    expect(cropOmapDoc(doc, RECT)).toBe(2);
    const objects = Array.from(doc.getElementsByTagName("objects"))[0]!;
    expect(objects.getAttribute("count")).toBe("2");
    const text = new XMLSerializer().serializeToString(doc as never);
    expect(text).toContain("100 200;");
    // The contour runs through the rectangle and is kept whole.
    expect(text).toContain("-500 0;30000 0;");
    expect(text).not.toContain("50000 50000;</coords></object>\n<object");
    expect(text).not.toContain("-30000 700;");
  });

  it("leaves the symbols' own drawings alone", () => {
    const doc = parse(XML);
    cropOmapDoc(doc, RECT);
    const text = new XMLSerializer().serializeToString(doc as never);
    // The template in the point symbol lies far outside, but is not map content.
    expect(text).toContain("-50000 -50000;50000 50000;");
  });

  it("still draws as a map afterwards", () => {
    const doc = parse(XML);
    cropOmapDoc(doc, RECT);
    const rendered = renderOmap(doc);
    expect(rendered.innerMarkup.length).toBeGreaterThan(0);
    expect(rendered.scale).toBe(renderOmap(parse(XML)).scale);
  });
});
