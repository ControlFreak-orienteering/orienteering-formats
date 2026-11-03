/**
 * Writes results as an IOF XML 3.0 `ResultList`, the file Eventor, MeOS, WinSplits and
 * Livelox import. The results come in the package's own form (`ResultList`), with the
 * places, times and statuses the caller already has: nothing is ranked or worked out here.
 *
 * Layout (only the elements written here, in the order the schema fixes):
 *
 * ```xml
 * <ResultList xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0"
 *             createTime="…" creator="…" status="Complete">
 *   <Event>
 *     <Name>Veckans bana</Name>
 *     <StartTime><Date>2026-10-29</Date></StartTime>
 *     <EndTime><Date>2026-11-01</Date></EndTime>             (when given)
 *     <Organiser><Name>Strängnäs OK</Name></Organiser>     (when given)
 *   </Event>
 *   <ClassResult>                                           (one per class, in order)
 *     <Class><Name>Lång</Name></Class>
 *     <Course><Name>Lång</Name><Length>4100</Length><NumberOfControls>17</NumberOfControls></Course>
 *     <PersonResult>                                        (one per runner, in order)
 *       <Person><Name><Family>Berg</Family><Given>Elin</Given></Name></Person>
 *       <Organisation><Name>Mossens IF</Name></Organisation>
 *       <Result>
 *         <StartTime>…</StartTime><FinishTime>…</FinishTime>
 *         <Time>1512</Time><TimeBehind>0</TimeBehind><Position>1</Position>
 *         <Status>OK</Status>
 *         <Score type="Score">304</Score><Score type="Penalty">6</Score>   (score courses)
 *         <SplitTime><ControlCode>31</ControlCode><Time>245</Time></SplitTime>
 *         <SplitTime status="Missing"><ControlCode>32</ControlCode></SplitTime>
 *       </Result>
 *     </PersonResult>
 *   </ClassResult>
 * </ResultList>
 * ```
 *
 * - Times (`time`, `timeBehind`, split times) are seconds, as the schema has them; split
 *   times are counted from the start. A split without a time is written as missing.
 * - Start and finish are ms since 1970, written with the offset of `timeZone` (an IANA
 *   name such as "Europe/Stockholm") at that moment, else in UTC.
 * - The name is one string, split like the start list's (`splitRunnerName`).
 * - `complete: false` writes `status="Snapshot"`: results taken while runners are still out.
 */
/** A runner's status in IOF XML 3.0 (`ResultStatus`). */
export type IofResultStatus = "OK" | "Finished" | "MissingPunch" | "Disqualified" | "DidNotFinish" | "Active" | "Inactive" | "OverTime" | "SportingWithdrawal" | "NotCompeting" | "Moved" | "MovedUp" | "DidNotStart" | "DidNotEnter" | "Cancelled";
/** One runner's result. */
export type ResultListRunner = {
    /** The runner's name as one string. */
    name: string;
    club?: string;
    status: IofResultStatus;
    /** 1, 2 …; left out when the runner is not placed. */
    position?: number;
    /** Running time in seconds. */
    time?: number;
    /** Seconds behind the winner. */
    timeBehind?: number;
    /** The start and the finish, ms since 1970. */
    startTime?: number;
    finishTime?: number;
    /** Points after the penalty, on a score course. */
    score?: number;
    /** Points taken off for time over the limit, on a score course. */
    penalty?: number;
    /** The time at each control from the start, in course order; no time means missing. */
    splits?: {
        controlCode: string;
        time?: number;
    }[];
    /** The runner's control card (SI card) number. */
    card?: string | number;
};
/** One class (or course) and its results. */
export type ResultListClass = {
    name: string;
    course?: {
        name?: string;
        lengthMeters?: number;
        climbMeters?: number;
        numberOfControls?: number;
    };
    /** In the order to write them: placed runners first, as the list shows them. */
    results: ResultListRunner[];
};
/** The results of one event, in the package's own form. */
export type ResultList = {
    event: {
        name: string;
        /** The first day, "YYYY-MM-DD". */
        date?: string;
        /** The last day, "YYYY-MM-DD", for an event over several days. */
        endDate?: string;
        organiser?: string;
    };
    /** False while results may still change (`status="Snapshot"`); true when final. */
    complete: boolean;
    classes: ResultListClass[];
};
/** Options for `writeIofResultList`. */
export type WriteIofResultListOptions = {
    /** The program writing the file, for the root element's `creator`. */
    creator?: string;
    /** When the file is written (ISO 8601); now when not given. */
    createTime?: string;
    /** The event's time zone (IANA name) for start and finish times; UTC when not given. */
    timeZone?: string;
};
/**
 * Writes an IOF XML 3.0 ResultList file.
 *
 * @param list - The results; see the module comment for how they are written.
 * @throws {FormatError} `empty` when no class has a result, or `unreadable` when a date is
 *   not "YYYY-MM-DD".
 */
export declare function writeIofResultList(list: ResultList, options?: WriteIofResultListOptions): string;
