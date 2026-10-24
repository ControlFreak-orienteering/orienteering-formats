/**
 * Writes a start list as an IOF XML 3.0 `StartList`, the file Eventor's start list
 * import and timing programs read. The counterpart of `readIofStartList`: a list written
 * here reads back the same.
 *
 * The file is written from the package's own start list form (`StartList`, the
 * `cf-startlist` of the QR film), which is what the start clock holds whatever the list
 * came from, so a list typed as CSV or sent from ControlFreak Event can go on to Eventor.
 *
 * Layout (only the elements written here, in the order the schema fixes):
 *
 * ```xml
 * <StartList xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0"
 *            createTime="…" creator="…">
 *   <Event><Id>4711</Id><Name>Vårspringet</Name><StartTime><Date>2026-04-18</Date></StartTime></Event>
 *   <ClassStart>                                   (one per class, in order of first runner)
 *     <Class><Name>H21</Name></Class>
 *     <Course><Name>Bana 1</Name></Course>          (when every runner in the class has the same)
 *     <StartName>S1</StartName>                     (likewise)
 *     <PersonStart>                                 (one per runner, in the list's order)
 *       <Person><Name><Family>Berg</Family><Given>Johan</Given></Name></Person>
 *       <Organisation><Name>IFK Lidingö</Name></Organisation>
 *       <Start><StartTime>2026-04-18T10:00:00+02:00</StartTime><ControlCard>7099123</ControlCard></Start>
 *     </PersonStart>
 *   </ClassStart>
 * </StartList>
 * ```
 *
 * - The form has one `name` per runner; the file wants given and family names. The last
 *   word is written as the family name and the rest as the given name, which is right
 *   for most names and what a reader joins back to the same string. Eventor matches a
 *   runner without an Eventor id on the name and the club, so a double family name may
 *   need a look after the import.
 * - Start times are the form's clock times on the competition's date, with the time
 *   zone's offset: `date` and `utcOffsetMinutes` from the options, else the list's
 *   `competition.date` and the computer's offset on that day, which is right when the
 *   file is written where the competition is held.
 * - Runners without a class are written in one `<ClassStart>` with an empty class name;
 *   Eventor needs the class names to match its own, so give the runners classes when
 *   the file is for it.
 * - `late` has no element in a start list and is not written.
 */
import type { StartList } from "../start-list.js";
/** Options for `writeIofStartList`. */
export type WriteIofStartListOptions = {
    /** The program writing the file, for the root element's `creator`. */
    creator?: string;
    /** When the file is written (ISO 8601); the list's `createdAt`, else now, when not given. */
    createTime?: string;
    /** Eventor's id of the event, written as `<Event><Id>`, so Eventor knows which event. */
    eventId?: string;
    /**
     * The competition's date, "YYYY-MM-DD", for the start times; the list's
     * `competition.date`, else today, when not given.
     */
    date?: string;
    /**
     * The competition's time zone as minutes ahead of UTC (120 for Swedish summer time);
     * the computer's own offset on the date when not given.
     */
    utcOffsetMinutes?: number;
};
/** Given and family name from one string: the last word is the family name. */
export declare function splitRunnerName(name: string): {
    given: string;
    family: string;
};
/**
 * Writes an IOF XML 3.0 StartList file.
 *
 * @param list - The runners, in start order; see the module comment for how they are written.
 * @throws {FormatError} `empty` when the list has no runner, or `unreadable` when the
 *   date is not "YYYY-MM-DD" or a runner's time is not a clock time.
 */
export declare function writeIofStartList(list: StartList, options?: WriteIofStartListOptions): string;
