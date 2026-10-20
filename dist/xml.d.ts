/**
 * Helpers for the XML formats (IOF XML, Purple Pen): decoding a file's bytes by the
 * encoding it declares, parsing with the browser's `DOMParser` or one the caller
 * supplies, and walking elements by local name.
 *
 * Element names are compared on `localName`: files in circulation carry the IOF
 * namespace with and without a prefix, and a file with the right elements but a wrong
 * namespace declaration is still the file the user meant.
 */
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
export declare function decodeXmlBytes(bytes: Uint8Array): string;
/**
 * Parses XML text and returns its root element.
 *
 * @throws {FormatError} `unreadable` when the text is not well-formed XML.
 */
export declare function parseXmlRoot(xml: string, parse?: XmlParse): Element;
/** The direct child elements of `parent` with the given local name. */
export declare function childElements(parent: Element, name: string): Element[];
/** The first direct child element with the given local name, if any. */
export declare function childElement(parent: Element | undefined, name: string): Element | undefined;
/** Trimmed text of the first direct child with the given local name, or "" if missing. */
export declare function childText(parent: Element | undefined, name: string): string;
/** A number from text or an attribute, or `undefined` if missing or not a number. */
export declare function numberOf(text: string | null | undefined): number | undefined;
/** A positive number, or `undefined`. */
export declare function positiveNumberOf(text: string | null | undefined): number | undefined;
