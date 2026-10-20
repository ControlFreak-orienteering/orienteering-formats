/**
 * An XML parser for the tests, which run without a browser: xmldom, set to fail on
 * errors the way a browser's `DOMParser` reports them, so the readers' `unreadable`
 * path is exercised too. Not part of the package; `tsconfig.json` excludes it.
 */
import { DOMParser } from "@xmldom/xmldom";

export const parseXml = (xml: string): Document =>
  new DOMParser({
    onError: (level, message) => {
      if (level === "error" || level === "fatalError") throw new Error(message);
    },
  }).parseFromString(xml, "application/xml") as unknown as Document;
