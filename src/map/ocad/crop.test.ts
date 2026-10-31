import { describe, expect, it } from "vitest";
import { cropOcad } from "./crop.js";
import { parseOcadFile } from "./parser.js";
import {
  ALL_VERSIONS,
  OcdFileBuilder,
  type OcdVersion,
} from "../testing/ocd-builder.js";

/**
 * A map with a boulder in the middle, one far away, and a contour whose
 * middle is outside the rectangle but which runs right through it. The
 * rectangle is -1000..1000 both ways (1/100 mm, so two centimetres of map
 * paper in each direction).
 */
function map(version: OcdVersion): ArrayBuffer {
  return new OcdFileBuilder(version)
    .addColor(0, "Black", [0, 0, 0, 100])
    .addScale(15000)
    .addPointSymbol({
      symNum: 101000,
      description: "Boulder",
      elements: [{ type: 4, color: 0, diameter: 60, points: [[0, 0]] }],
    })
    .addLineSymbol({
      symNum: 102000,
      description: "Contour",
      lineColor: 0,
      lineWidth: 14,
    })
    .addObject({ sym: 101000, otp: 1, coords: [[100, 200]] })
    .addObject({ sym: 101000, otp: 1, coords: [[50000, 50000]] })
    .addObject({
      sym: 102000,
      otp: 2,
      coords: [
        [-500, 0],
        [30000, 0],
      ],
    })
    .build();
}

const RECT = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };

describe("cropping an OCAD map", () => {
  it.each(ALL_VERSIONS)(
    "keeps what reaches into the box (OCAD %s)",
    (version) => {
      const before = parseOcadFile(map(version));
      const cropped = cropOcad(map(version), RECT);
      const after = parseOcadFile(cropped.buffer as ArrayBuffer);

      expect(before.objects).toHaveLength(3);
      // The boulder in the rectangle and the contour through it; the far boulder is gone.
      expect(after.objects).toHaveLength(2);
      expect(
        after.objects.map((o) => o.coordinates[0]?.x).sort((a, b) => a! - b!),
      ).toEqual([-500, 100]);
      // The contour is kept whole, not cut at the edge.
      const contour = after.objects.find((o) => o.symNum === 102000);
      expect(contour?.coordinates.map((p) => p.x)).toEqual([-500, 30000]);
    },
  );

  it.each(ALL_VERSIONS)(
    "leaves the symbols, colours and georeference alone (OCAD %s)",
    (version) => {
      const before = parseOcadFile(map(version));
      const after = parseOcadFile(
        cropOcad(map(version), RECT).buffer as ArrayBuffer,
      );
      expect(after.symbols.map((s) => s.symNum)).toEqual(
        before.symbols.map((s) => s.symNum),
      );
      expect(after.colors).toEqual(before.colors);
      // The georeference and scale are in the parameter strings, which come along.
      expect(after.georef).toEqual(before.georef);
    },
  );

  it("refuses something that is not an OCAD file", () => {
    expect(() => cropOcad(new Uint8Array(100).buffer, RECT)).toThrow();
  });
});
