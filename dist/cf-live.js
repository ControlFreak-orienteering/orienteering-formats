/**
 * The ControlFreak Live protocol ("cf-live"): how a timing app (ControlFreak Event) sends
 * live results to a results site that an organiser runs, built by anyone, often from the
 * prompt ControlFreak Event gives.
 *
 * Both sides use this module: the app to read what a site supports and to build delta
 * uploads, the site to check and apply uploads. It has no imports, so a site can load the
 * built file on its own, e.g. a Supabase edge function from
 * `https://cdn.jsdelivr.net/gh/ControlFreak-orienteering/orienteering-formats@v<tag>/dist/cf-live.js`.
 *
 * **Compatibility.** Sites are built once and often never rebuilt, so an app must keep
 * talking to every site ever built:
 * - Within a protocol version, later releases only add optional fields. Readers ignore
 *   fields they do not know, and must treat an added field as missing on older sites.
 * - A change that an older site would misread gets a new protocol version. A site lists the
 *   versions it speaks in `info`; the app picks the highest one both speak, and keeps every
 *   older version it has ever spoken in {@link CF_LIVE_VERSIONS}.
 * - `info.prompt` says which version of the prompt the site was built from (absent on sites
 *   built before it was added: prompt 1). It is for telling the organiser that a newer
 *   prompt exists; the protocol never depends on it.
 *
 * The site has two addresses below its base address `{base}`:
 * - `GET {base}/info` answers {@link CfLiveInfo} as JSON, without a key.
 * - `PUT {base}/snapshot` takes a body ({@link CfLiveBody}), with
 *   `Authorization: Bearer <upload key>` and, when compressed, `Content-Encoding: gzip`.
 * The full description, with status codes and CORS, is `docs/custom-live/protocol.md` in
 * ControlFreak Event.
 */
/** The protocol's name, in every body and in `info`. */
export const CF_LIVE_PROTOCOL = "cf-live";
/**
 * Every protocol version this module speaks, oldest first. Never remove one: sites built
 * for it may still be running.
 */
export const CF_LIVE_VERSIONS = [1];
/**
 * The version of the site-building prompt that matches this module. A site built from it
 * answers it as `info.prompt`. Raise it whenever the prompt changes in a way the organiser
 * would want to rebuild for, and say what changed in {@link CF_LIVE_PROMPT_CHANGES}.
 */
export const CF_LIVE_PROMPT_VERSION = 2;
/**
 * What each prompt version added, in English, for developers and changelogs. The app says
 * in its own words what an organiser gains by rebuilding.
 */
export const CF_LIVE_PROMPT_CHANGES = {
    1: "First prompt (2026-10-15): info, snapshot, full uploads, optional delta and gzip.",
    2: "2026-10-26: info.prompt; a cached public read address; deltas applied in one database " +
        "transaction; pinned library versions; a checklist for connecting the site.",
};
/**
 * Reads the answer of `GET {base}/info`. Lenient, since sites are built by many tools:
 * missing lists fall back to what every site must support.
 *
 * @param json - The parsed answer.
 * @returns What the site supports, or `null` if the answer is not this protocol's.
 */
export function parseInfo(json) {
    if (typeof json !== "object" || json === null)
        return null;
    const info = json;
    if (info.protocol !== CF_LIVE_PROTOCOL || !Array.isArray(info.versions))
        return null;
    const strings = (value, required) => {
        const list = Array.isArray(value)
            ? value.filter((v) => typeof v === "string")
            : [];
        return list.includes(required) ? list : [required, ...list];
    };
    return {
        versions: info.versions.filter((v) => Number.isInteger(v)),
        modes: strings(info.modes, "full"),
        encodings: strings(info.encodings, "identity"),
        prompt: Number.isInteger(info.prompt) && info.prompt > 0 ? info.prompt : 1,
    };
}
/**
 * The answer a site gives to `GET {base}/info`.
 *
 * @param supports - Whether the site takes delta uploads and gzip.
 * @param prompt - The prompt version the site was built from.
 */
export function infoAnswer(supports, prompt = CF_LIVE_PROMPT_VERSION) {
    return {
        protocol: CF_LIVE_PROTOCOL,
        versions: [...CF_LIVE_VERSIONS],
        modes: supports.delta ? ["full", "delta"] : ["full"],
        encodings: supports.gzip ? ["identity", "gzip"] : ["identity"],
        prompt,
    };
}
/**
 * Agrees on how to upload: the highest common protocol version, and the wanted mode and
 * encoding when the site takes them, else `full` and `identity`, which every site takes.
 * Never fails because of a mode or an encoding, so an old or simple site keeps working.
 *
 * @param info - The site's `info` (see {@link parseInfo}).
 * @param wanted - What the organiser chose.
 * @param ours - The versions the app speaks; {@link CF_LIVE_VERSIONS} unless testing.
 */
export function agree(info, wanted, ours = CF_LIVE_VERSIONS) {
    const common = info.versions.filter((v) => ours.includes(v));
    if (common.length === 0) {
        return { ok: false, reason: "no-common-version", theirs: info.versions, ours: [...ours] };
    }
    const delta = wanted.mode === "delta" && info.modes.includes("delta");
    const gzip = wanted.gzip && info.encodings.includes("gzip");
    const notSupported = [];
    if (wanted.mode === "delta" && !delta)
        notSupported.push("delta");
    if (wanted.gzip && !gzip)
        notSupported.push("gzip");
    return {
        ok: true,
        version: Math.max(...common),
        mode: delta ? "delta" : "full",
        encoding: gzip ? "gzip" : "identity",
        notSupported,
        olderPrompt: info.prompt < CF_LIVE_PROMPT_VERSION,
    };
}
/**
 * The delta from one full upload to the next: the classes whose content changed or are
 * new, and the ids of those that are gone. Classes are compared as JSON, so any change in
 * a class sends it whole.
 *
 * @param previous - The last full state the site accepted.
 * @param next - The new full state.
 * @param sequence - The new upload's number.
 * @returns The delta body, or `null` when nothing changed (not even the competition).
 */
export function deltaBetween(previous, next, sequence) {
    const before = new Map(previous.classes.map((c) => [c.id, JSON.stringify(c)]));
    const classes = next.classes.filter((c) => before.get(c.id) !== JSON.stringify(c));
    const nextIds = new Set(next.classes.map((c) => c.id));
    const removedClassIds = previous.classes.map((c) => c.id).filter((id) => !nextIds.has(id));
    const competitionChanged = JSON.stringify(previous.competition) !== JSON.stringify(next.competition);
    if (classes.length === 0 && removedClassIds.length === 0 && !competitionChanged)
        return null;
    return {
        protocol: CF_LIVE_PROTOCOL,
        version: next.version,
        kind: "delta",
        sequence,
        baseSequence: previous.sequence,
        generatedAt: next.generatedAt,
        competition: next.competition,
        classes,
        removedClassIds,
    };
}
/**
 * For sites: checks an upload and works out what to store, after the key has been checked
 * (a wrong key is 401, before anything else). Pure: give it what is stored for the body's
 * competition, then store `store` (in one transaction with the read, for deltas) when it
 * is not null.
 *
 * Unknown fields are kept as they are, so a newer app's additions reach the page.
 *
 * @param body - The parsed JSON body.
 * @param storedFor - What the site holds for a competition id, or null.
 */
export function applyUpload(body, storedFor) {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return { status: 400, error: "The body is not a JSON object." };
    }
    const b = body;
    if (b.protocol !== CF_LIVE_PROTOCOL)
        return { status: 400, error: 'protocol is not "cf-live".' };
    const competition = b.competition;
    if (typeof competition !== "object" || competition === null || typeof competition.id !== "string") {
        return { status: 400, error: "competition.id is missing." };
    }
    if (!Number.isInteger(b.sequence))
        return { status: 400, error: "sequence is missing." };
    const id = competition.id;
    const sequence = b.sequence;
    switch (b.kind) {
        case "test":
            return { status: 204, competitionId: null, store: null };
        case "full":
            if (!Array.isArray(b.classes))
                return { status: 400, error: "classes is missing." };
            return {
                status: 204,
                competitionId: id,
                store: { data: body, lastSequence: sequence },
            };
        case "delta": {
            if (!Array.isArray(b.classes))
                return { status: 400, error: "classes is missing." };
            const stored = storedFor(id);
            if (!stored || b.baseSequence !== stored.lastSequence) {
                return { status: 409, body: { needFull: true } };
            }
            const delta = body;
            const removed = new Set(Array.isArray(delta.removedClassIds) ? delta.removedClassIds : []);
            const changed = new Map(delta.classes.map((c) => [c.id, c]));
            const classes = stored.data.classes
                .filter((c) => !removed.has(c.id))
                .map((c) => changed.get(c.id) ?? c);
            const known = new Set(classes.map((c) => c.id));
            for (const c of delta.classes)
                if (!known.has(c.id) && !removed.has(c.id))
                    classes.push(c);
            classes.sort((x, y) => x.order - y.order);
            return {
                status: 204,
                competitionId: id,
                store: {
                    data: {
                        ...stored.data,
                        version: delta.version,
                        sequence,
                        generatedAt: delta.generatedAt,
                        competition: delta.competition,
                        classes,
                    },
                    lastSequence: sequence,
                },
            };
        }
        default:
            return { status: 400, error: 'kind is not "full", "delta" or "test".' };
    }
}
