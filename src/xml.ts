/**
 * Helpers for the XML formats (IOF XML, Purple Pen): decoding a file's bytes by the
 * encoding it declares, parsing with the browser's `DOMParser` or one the caller
 * supplies, and walking elements by local name.
 *
 * Element names are compared on `localName`: files in circulation carry the IOF
 * namespace with and without a prefix, and a file with the right elements but a wrong
 * namespace declaration is still the file the user meant.
 */

import { FormatError } from "./errors.js";

/**
 * Parses XML text into a document. The browser's `DOMParser` is used when none is
 * given; pass one (e.g. from `@xmldom/xmldom`) where there is none, such as in Node.
 */
export type XmlParse = (xml: string) => Document;

/**
 * Turns the bytes of an XML file into text, honouring the encoding the file declares.
 *
 * Older orienteering files are often not UTF-8: IOF XML 2.0.3 files from OCAD and
 * others typically declare `encoding="ISO-8859-1"`. Reading them as UTF-8 would garble
 * "å", "ä" and "ö", so the declaration at the top of the file is read first.
 *
 * @param bytes - The whole file.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  // A byte order mark identifies UTF-8 and UTF-16 directly.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);

  // The declaration is ASCII in every encoding XML files use in practice.
  const head = new TextDecoder("ascii").decode(bytes.subarray(0, 200));
  const declared = /<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(head)?.[1];
  try {
    return new TextDecoder(declared ?? "utf-8").decode(bytes);
  } catch {
    // An encoding name the platform does not know: UTF-8 is the XML default.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * Parses XML text and returns its root element.
 *
 * @throws {FormatError} `unreadable` when the text is not well-formed XML.
 */
export function parseXmlRoot(xml: string, parse?: XmlParse): Element {
  const parser: XmlParse =
    parse ?? ((text) => new DOMParser().parseFromString(text, "application/xml"));
  let doc: Document;
  try {
    // A byte order mark that survived decoding is not part of the document.
    doc = parser(xml.replace(/^﻿/, ""));
  } catch {
    throw new FormatError("unreadable");
  }
  const root = doc.documentElement as Element | null;
  // Browsers do not throw on bad XML; they return a document with a <parsererror>.
  if (
    !root ||
    root.localName === "parsererror" ||
    doc.getElementsByTagName("parsererror").length > 0
  ) {
    throw new FormatError("unreadable");
  }
  return root;
}

/** The direct child elements of `parent` with the given local name. */
export function childElements(parent: Element, name: string): Element[] {
  const out: Element[] = [];
  const nodes = parent.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node && node.nodeType === 1 && (node as Element).localName === name) {
      out.push(node as Element);
    }
  }
  return out;
}

/** The first direct child element with the given local name, if any. */
export function childElement(parent: Element | undefined, name: string): Element | undefined {
  return parent ? childElements(parent, name)[0] : undefined;
}

/** Trimmed text of the first direct child with the given local name, or "" if missing. */
export function childText(parent: Element | undefined, name: string): string {
  return (childElement(parent, name)?.textContent ?? "").trim();
}

/** A number from text or an attribute, or `undefined` if missing or not a number. */
export function numberOf(text: string | null | undefined): number | undefined {
  if (text === null || text === undefined || text.trim() === "") return undefined;
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : undefined;
}

/** A positive number, or `undefined`. */
export function positiveNumberOf(text: string | null | undefined): number | undefined {
  const value = numberOf(text);
  return value !== undefined && value > 0 ? value : undefined;
}
