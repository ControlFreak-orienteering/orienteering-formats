import { readOcadPoint } from "./coords.js";
/** The format's unit for symbol data: one coordinate pair, see `readOcadPoint`. */
const BYTES_PER_COORD = 8;
const ELEMENT_KIND_BY_TYPE = {
    1: "line",
    2: "area",
    3: "circle",
    4: "dot",
};
/**
 * Reads the small drawing primitives ("symbol elements") that make up a
 * point symbol's graphic, or the primary/secondary/corner/start/end
 * decorations along a line symbol.
 *
 * `dataSizeCoords` is the budget OCAD wrote for the block, counted in
 * coordinates — the 8-byte unit the format measures everything in — and
 * each primitive's own 16-byte header counts as two of them. Reading it
 * as 16-bit words instead makes the budget a quarter of the block, so the
 * loop stops after the first primitive and every symbol drawn from more
 * than one loses the rest: a tower keeps its crossbar and loses its mast.
 *
 * The budget is an upper bound, and we stop early rather than throw if
 * the data stops making sense, since a partially-unreadable decoration
 * must never affect any other symbol — every symbol and object in the
 * file is addressed by its own absolute file offset, so a short read here
 * is strictly local.
 */
export function readSymbolElements(reader, dataSizeCoords, 
/** Called with the type code of a primitive we do not recognise. It is
 * skipped and so becomes invisible; without this that happens silently,
 * and a symbol that loses a part just looks as if it were drawn that way. */
onUnknown) {
    const elements = [];
    const budgetBytes = dataSizeCoords * BYTES_PER_COORD;
    const startOffset = reader.offset;
    while (reader.offset - startOffset < budgetBytes) {
        try {
            const type = reader.smallInt();
            reader.word(); // flags (rotation/fill hints not needed for now)
            const color = reader.smallInt();
            const lineWidth = reader.smallInt();
            const diameter = reader.smallInt();
            const numberCoords = reader.smallInt();
            reader.cardinal(); // reserved
            if (numberCoords < 0)
                break;
            const points = new Array(numberCoords);
            for (let i = 0; i < numberCoords; i++)
                points[i] = readOcadPoint(reader);
            // An unknown primitive is skipped, but its block is read to the end:
            // its header says how many coordinates it has, so the next primitive
            // can be found. Stopping here would throw away the rest of the
            // symbol's graphics: a tower that loses its outline and becomes a dot,
            // or disappears altogether.
            const kind = ELEMENT_KIND_BY_TYPE[type];
            if (!kind) {
                onUnknown?.(type);
                continue;
            }
            elements.push({ type: kind, color, lineWidth, diameter, points });
        }
        catch {
            break;
        }
    }
    return elements;
}
