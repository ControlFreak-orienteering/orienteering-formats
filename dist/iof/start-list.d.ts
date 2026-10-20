/**
 * Reads start lists from IOF XML `StartList` files, as Eventor and timing programs
 * export them, into the package's own start list form (`StartList`, the `cf-startlist`
 * that ControlFreak Event sends to the start clock as a QR film).
 *
 * Two versions are in circulation:
 *
 * - **3.0**: `<StartList iofVersion="3.0">` with `<Event>`, then `<ClassStart>` holding
 *   `<Class><Name>`, `<StartName>` and `<PersonStart>` elements, each with
 *   `<Person><Name><Given/><Family/>`, `<Organisation><Name/>` and
 *   `<Start><StartTime>2024-05-01T10:00:00+02:00</StartTime><ControlCard/>`.
 * - **2.0.3** (Eventor's own `/api/starts/event`): `<ClassStart>` with `<EventClass>`,
 *   `<PersonStart>` with `<PersonName>`, `<Start><StartTime><Clock>10:00:00</Clock>`
 *   and `<CCard><CCardId>`.
 *
 * Start times are wall-clock times as the file states them (the local competition time,
 * which is what a start clock shows), never shifted to another time zone. Runners
 * without a start time or a name are left out: a start list is for those who start at a
 * time. Relay teams (`<TeamStart>`) are not read.
 */
import type { StartList } from "../start-list.js";
import type { IofVersion, ReadIofOptions } from "./course-data.js";
/** The runners of a StartList file, with what the file says about itself. */
export type IofStartList = StartList & {
    /** Which version the file was written in. */
    version: IofVersion;
};
/** Whether XML text looks like an IOF StartList file (checks the root element only). */
export declare function looksLikeIofStartList(xml: string): boolean;
/**
 * Reads an IOF XML StartList file, version 3.0 or 2.0.3.
 *
 * @param xml - The file's text; see `decodeXmlBytes` for getting it from bytes.
 * @throws {FormatError} `unreadable` for broken XML, `wrong-format` when the root is
 *   not `StartList`, and `empty` when the file has no runner with a start time.
 */
export declare function readIofStartList(xml: string, options?: ReadIofOptions): IofStartList;
