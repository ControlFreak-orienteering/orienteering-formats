import { describe, expect, it } from "vitest";

import { FormatError } from "./errors.js";
import { parseXml } from "./test-xml.js";
import { childElements, childText, decodeXmlBytes, numberOf, parseXmlRoot } from "./xml.js";

const latin1 = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));

describe("decodeXmlBytes", () => {
  it("follows the declared encoding, so ISO-8859-1 files keep their å, ä and ö", () => {
    const bytes = latin1('<?xml version="1.0" encoding="ISO-8859-1"?><a>Bana Ö</a>');
    expect(decodeXmlBytes(bytes)).toContain("<a>Bana Ö</a>");
  });

  it("reads UTF-8 by default and honours a byte order mark", () => {
    expect(decodeXmlBytes(new TextEncoder().encode("<a>å</a>"))).toBe("<a>å</a>");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("<a/>")]);
    expect(decodeXmlBytes(withBom)).toBe("<a/>");
  });

  it("falls back to UTF-8 for an encoding it does not know", () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0" encoding="x-nonsense"?><a>å</a>');
    expect(decodeXmlBytes(bytes)).toContain("<a>å</a>");
  });
});

describe("parseXmlRoot and the element helpers", () => {
  it("gives the root, ignoring namespaces when walking children", () => {
    const root = parseXmlRoot(
      '<x:Root xmlns:x="urn:x"><x:Child>1</x:Child><Child> 2 </Child><Other/></x:Root>',
      parseXml,
    );
    expect(root.localName).toBe("Root");
    expect(childElements(root, "Child").length).toBe(2);
    expect(childText(root, "Child")).toBe("1");
    expect(childText(root, "Missing")).toBe("");
  });

  it("reports broken XML as unreadable", () => {
    expect(() => parseXmlRoot("<a><b></a>", parseXml)).toThrow(FormatError);
    try {
      parseXmlRoot("<a", parseXml);
    } catch (e) {
      expect((e as FormatError).code).toBe("unreadable");
    }
  });

  it("reads numbers leniently", () => {
    expect(numberOf(" 12.5 ")).toBe(12.5);
    expect(numberOf("")).toBeUndefined();
    expect(numberOf("x")).toBeUndefined();
    expect(numberOf(null)).toBeUndefined();
  });
});
