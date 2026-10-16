/**
 * Walks the (possibly chained) parameter-string index blocks starting at
 * `firstBlockPos` and returns every parameter string in the file, grouped
 * by record type (9 = color, 1039 = scale/georeferencing, 1050+ = course
 * setting data, etc. — see the OCAD file format wiki's "String" table).
 */
export function readParameterStrings(reader, firstBlockPos) {
    const BLOCK_BYTES = 4 + 256 * 16;
    const byType = new Map();
    // Guard against a corrupt chain that points outside the file or back at
    // an earlier block (which would otherwise loop forever).
    const visited = new Set();
    let blockPos = firstBlockPos;
    while (blockPos > 0 && blockPos <= reader.length - BLOCK_BYTES && !visited.has(blockPos)) {
        visited.add(blockPos);
        reader.push(blockPos);
        const nextBlockPos = reader.integer();
        const entries = [];
        for (let i = 0; i < 256; i++) {
            const pos = reader.integer();
            const size = reader.integer();
            const recordType = reader.integer();
            reader.integer(); // owning object index, not needed here
            if (recordType > 0 && pos > 0 && pos < reader.length)
                entries.push({ pos, size, recordType });
        }
        reader.pop();
        for (const entry of entries) {
            // One unreadable string (truncated file, bad offset) must not take
            // the color table or scale down with it — skip just that entry.
            let text;
            reader.push(entry.pos);
            try {
                text = reader.cString(entry.size > 0 ? entry.size : undefined);
            }
            catch {
                continue;
            }
            finally {
                reader.pop();
            }
            const parsed = parseParameterString(entry.recordType, text);
            const list = byType.get(entry.recordType) ?? [];
            list.push(parsed);
            byType.set(entry.recordType, list);
        }
        blockPos = nextBlockPos;
    }
    return byType;
}
function parseParameterString(recordType, text) {
    const parts = text.split("\t");
    const fields = new Map();
    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part)
            continue;
        fields.set(part.charAt(0), part.slice(1));
    }
    return { recordType, subject: parts[0] ?? "", fields };
}
