import { readSymbolElements } from "./elements.js";
const SYMBOL_TYPE_POINT = 1;
const SYMBOL_TYPE_LINE = 2;
const SYMBOL_TYPE_AREA = 3;
const SYMBOL_TYPE_TEXT = 4;
/**
 * Walks the (possibly chained) symbol index blocks starting at
 * `firstBlockPos` and returns every symbol record's absolute file
 * position. Each entry addresses its symbol directly, independent of any
 * other symbol, so symbols never need to be read in file order.
 */
export function readSymbolIndex(reader, firstBlockPos) {
    const BLOCK_BYTES = 4 + 256 * 4;
    const entries = [];
    // Guard against a corrupt chain that points outside the file or back at
    // an earlier block (which would otherwise loop forever).
    const visited = new Set();
    let blockPos = firstBlockPos;
    while (blockPos > 0 && blockPos <= reader.length - BLOCK_BYTES && !visited.has(blockPos)) {
        visited.add(blockPos);
        reader.push(blockPos);
        const nextBlockPos = reader.integer();
        const positions = [];
        for (let i = 0; i < 256; i++)
            positions.push(reader.integer());
        reader.pop();
        for (const pos of positions)
            if (pos > 0 && pos < reader.length)
                entries.push({ filePos: pos });
        blockPos = nextBlockPos;
    }
    return entries;
}
/**
 * Parses one symbol record. `version` selects which of the three known
 * on-disk layouts to use:
 *  - OCAD 10
 *  - OCAD 11 (and the otherwise-identical byte layout used by 12/2018 for
 *    everything except a handful of area-symbol pattern fields)
 *  - OCAD 12 / 2018 area-symbol variant
 *
 * OCAD versions before 10 use a materially different (16-bit-field, no
 * Unicode) layout and are not read by this parser yet.
 */
export function readSymbol(reader, version, filePos, 
/** Receives what could be read but not drawn. See `onUnknown` in
 * elements.ts: a symbol that loses a part should say so, not just look
 * as if it were drawn that way. */
warn = () => { }) {
    reader.push(filePos);
    try {
        reader.integer(); // size, in bytes — informational, not needed for random-access parsing
        const symNum = reader.integer();
        const otp = reader.byte();
        reader.byte(); // flags
        reader.byte(); // selected
        const status = reader.byte();
        reader.byte(); // preferred drawing tool
        reader.byte(); // course-setting mode
        reader.byte(); // course-setting object type
        reader.byte(); // course-setting flags
        reader.integer(); // extent
        reader.cardinal(); // file position (redundant with index)
        let description = "";
        if (version <= 10) {
            reader.smallInt(); // group
            reader.smallInt(); // color count
            reader.skip(14 * 2); // color list
            description = reader.pascalString(32);
            reader.skip(484); // icon bitmap
        }
        else {
            reader.byte();
            reader.byte();
            reader.smallInt(); // color count
            reader.skip(14 * 2); // color list
            description = reader.utf16FixedString(32);
            reader.skip(484); // icon bitmap
            reader.skip(64 * 2); // symbol-tree grouping
            reader.skip(64); // reserved block observed on OCAD >= 11 files
        }
        const hidden = (status & 0x02) === 0x02;
        const number = `${Math.floor(symNum / 1000)}.${symNum % 1000}`;
        const base = { symNum, number, description, hidden };
        const onUnknown = (type) => warn(`Symbol ${number}: skipped an unknown drawing primitive (type ${type}).`);
        switch (otp) {
            case SYMBOL_TYPE_POINT:
                return readPointSymbol(reader, base, onUnknown);
            case SYMBOL_TYPE_LINE:
                return readLineSymbol(reader, base, onUnknown);
            case SYMBOL_TYPE_AREA:
                return readAreaSymbol(reader, base, version);
            case SYMBOL_TYPE_TEXT:
                return readTextSymbol(reader, base);
            default:
                return { kind: "unsupported", ...base };
        }
    }
    finally {
        reader.pop();
    }
}
function readPointSymbol(reader, base, onUnknown) {
    const dataSize = reader.word();
    reader.smallInt(); // reserved
    const elements = readSymbolElements(reader, dataSize, onUnknown);
    return { kind: "point", ...base, elements };
}
function readLineSymbol(reader, base, onUnknown) {
    const lineColor = reader.smallInt();
    const lineWidth = reader.smallInt();
    reader.smallInt(); // line join/cap style
    reader.smallInt(); // distance from start
    reader.smallInt(); // distance to end
    const mainLength = reader.smallInt();
    const endLength = reader.smallInt();
    const mainGap = reader.smallInt();
    const secondaryGap = reader.smallInt();
    const endGap = reader.smallInt();
    reader.smallInt(); // minimum length for a symbol-decorated line
    const primaryCount = reader.smallInt();
    const primaryDistance = reader.smallInt();
    const dblMode = reader.word();
    const dblFlags = reader.word();
    const dblFillColor = reader.smallInt();
    const dblLeftColor = reader.smallInt();
    const dblRightColor = reader.smallInt();
    const dblWidth = reader.smallInt();
    const dblLeftWidth = reader.smallInt();
    const dblRightWidth = reader.smallInt();
    reader.smallInt(); // double-line dash length
    reader.smallInt(); // double-line dash gap
    reader.skip(6); // version-specific tail (background color / reserved words)
    reader.word(); // decrease-towards-end mode
    reader.skip(4); // decrease parameters
    const frColor = reader.smallInt();
    const frWidth = reader.smallInt();
    reader.smallInt(); // framing style
    const primDataSize = reader.word();
    const secDataSize = reader.word();
    const cornerDataSize = reader.word();
    const startDataSize = reader.word();
    const endDataSize = reader.word();
    reader.byte(); // use-symbol flags
    reader.byte(); // reserved
    // The decorations along the line (a cliff's tags, a fence's ticks, a
    // power line's pylons). Unknown primitives in them are not reported, as
    // elsewhere in line symbols. The secondary symbols (between the primary
    // ones) are read past: they are rare and not drawn.
    const primary = readSymbolElements(reader, primDataSize);
    readSymbolElements(reader, secDataSize);
    const corner = readSymbolElements(reader, cornerDataSize);
    const start = readSymbolElements(reader, startDataSize);
    const end = readSymbolElements(reader, endDataSize);
    const decorations = primary.length || corner.length || start.length || end.length
        ? { primary, primaryCount, primaryDistance, corner, start, end }
        : undefined;
    return {
        kind: "line",
        ...base,
        lineColor,
        lineWidth,
        dashed: { mainLength, mainGap, secondaryGap, endLength, endGap },
        ...(decorations ? { decorations } : {}),
        ...(dblMode > 0
            ? {
                doubleLine: {
                    mode: dblMode,
                    fillColor: dblFillColor,
                    fillOn: (dblFlags & 0x01) !== 0,
                    leftColor: dblLeftColor,
                    rightColor: dblRightColor,
                    width: dblWidth,
                    leftWidth: dblLeftWidth,
                    rightWidth: dblRightWidth,
                },
            }
            : {}),
        ...(frWidth > 0 ? { framing: { color: frColor, width: frWidth } } : {}),
    };
}
function readAreaSymbol(reader, base, version) {
    const borderSymbolNumber = reader.integer();
    const fillColor = reader.smallInt();
    const hatchMode = reader.smallInt();
    const hatchColor = reader.smallInt();
    const hatchLineWidth = reader.smallInt();
    const hatchDistance = reader.smallInt();
    const hatchAngle1Deg = reader.smallInt() / 10;
    const hatchAngle2Deg = reader.smallInt() / 10;
    const fillOn = reader.byte() !== 0;
    reader.byte(); // border-on flag (informational; border is drawn via borderSymbolNumber)
    let structureMode;
    let structureCellWidth;
    let structureCellHeight;
    let structureAngleDeg;
    if (version >= 12) {
        structureMode = reader.byte();
        reader.byte(); // structure draw mode
        structureCellWidth = reader.smallInt();
        structureCellHeight = reader.smallInt();
        structureAngleDeg = reader.smallInt() / 10;
        reader.byte(); // irregular pattern X variance
        reader.byte(); // irregular pattern Y variance
        reader.smallInt(); // irregular pattern min distance
        reader.smallInt(); // reserved
    }
    else {
        structureMode = reader.smallInt();
        structureCellWidth = reader.smallInt();
        structureCellHeight = reader.smallInt();
        structureAngleDeg = reader.smallInt() / 10;
        reader.smallInt(); // reserved
    }
    const dataSize = reader.word();
    const elements = readSymbolElements(reader, dataSize);
    return {
        kind: "area",
        ...base,
        fillColor,
        fillOn,
        hatchMode,
        hatchColor,
        hatchLineWidth,
        hatchDistance,
        hatchAngle1Deg,
        hatchAngle2Deg,
        borderSymbolNumber,
        elements,
        ...(structureMode > 0 && elements.length > 0
            ? {
                structure: {
                    mode: structureMode,
                    cellWidth: structureCellWidth,
                    cellHeight: structureCellHeight,
                    angleDeg: structureAngleDeg,
                },
            }
            : {}),
    };
}
function readTextSymbol(reader, base) {
    const fontName = reader.pascalString(32);
    const fontColor = reader.smallInt();
    const fontSize = reader.smallInt();
    const weight = reader.smallInt();
    const italic = reader.byte() !== 0;
    reader.byte(); // reserved
    reader.smallInt(); // character spacing
    reader.smallInt(); // word spacing
    const alignment = reader.smallInt();
    // Remaining fields (line/paragraph spacing, tabs, underline, framing) are
    // not needed to place course controls and are left unread; nothing after
    // this symbol depends on this record's exact length (see readSymbol).
    return {
        kind: "text",
        ...base,
        fontName,
        fontColor,
        fontSize,
        bold: weight > 400,
        italic,
        alignmentHorizontal: (alignment & 0x03) === 1 ? "center" : (alignment & 0x03) === 2 ? "right" : "left",
    };
}
