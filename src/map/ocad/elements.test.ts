import { describe, expect, it } from "vitest";
import { BinaryReader } from "./binary-reader.js";
import { readSymbolElements } from "./elements.js";

/**
 * Builds a block of symbol primitives as OCAD writes them: six 16-bit
 * fields and a reserved 32-bit one, followed by the coordinate pairs.
 */
function elementBlock(
  elements: {
    type: number;
    color: number;
    lineWidth: number;
    diameter: number;
    points: number;
  }[],
) {
  const words = elements.reduce((n, el) => n + 8 + el.points * 4, 0);
  const buf = new ArrayBuffer(words * 2);
  const view = new DataView(buf);
  let at = 0;
  const word = (v: number) => {
    view.setUint16(at, v, true);
    at += 2;
  };
  const long = (v: number) => {
    view.setInt32(at, v, true);
    at += 4;
  };
  for (const el of elements) {
    word(el.type);
    word(0); // flaggor
    word(el.color);
    word(el.lineWidth);
    word(el.diameter);
    word(el.points);
    long(0); // reserverad
    for (let i = 0; i < el.points; i++) {
      long(100 << 8);
      long(200 << 8);
    }
  }
  return { buffer: buf, words };
}

describe("readSymbolElements", () => {
  it("reads the primitives a symbol is drawn from", () => {
    const { buffer, words } = elementBlock([
      { type: 1, color: 0, lineWidth: 14, diameter: 0, points: 3 },
      { type: 4, color: 2, lineWidth: 0, diameter: 60, points: 1 },
    ]);
    const out = readSymbolElements(new BinaryReader(buffer), words);
    expect(out.map((e) => e.type)).toEqual(["line", "dot"]);
    expect(out[0]).toMatchObject({ color: 0, lineWidth: 14 });
    expect(out[0]!.points).toHaveLength(3);
    expect(out[1]).toMatchObject({ color: 2, diameter: 60 });
  });

  it("skips a primitive it does not know and keeps reading", () => {
    // If reading stopped here, the rest of the symbol fell away: a tower
    // could lose its outline and become a lone dot, or disappear entirely.
    const { buffer, words } = elementBlock([
      { type: 99, color: 0, lineWidth: 0, diameter: 0, points: 2 },
      { type: 1, color: 0, lineWidth: 14, diameter: 0, points: 4 },
    ]);
    const out = readSymbolElements(new BinaryReader(buffer), words);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "line", lineWidth: 14 });
    expect(out[0]!.points).toHaveLength(4);
  });

  it("says which primitive it could not draw", () => {
    // Whoever sees a symbol missing a part should be able to find out why,
    // and what needs adding. The type number is the whole answer.
    const skipped: number[] = [];
    const { buffer, words } = elementBlock([
      { type: 7, color: 0, lineWidth: 0, diameter: 0, points: 1 },
      { type: 1, color: 0, lineWidth: 14, diameter: 0, points: 2 },
    ]);
    readSymbolElements(new BinaryReader(buffer), words, (type) =>
      skipped.push(type),
    );
    expect(skipped).toEqual([7]);
  });

  it("stops at the end of the block it was given", () => {
    const { buffer } = elementBlock([
      { type: 1, color: 0, lineWidth: 14, diameter: 0, points: 2 },
    ]);
    // Half the budget: the record does not fit, and nothing is read outside it.
    expect(readSymbolElements(new BinaryReader(buffer), 0)).toEqual([]);
  });
});
