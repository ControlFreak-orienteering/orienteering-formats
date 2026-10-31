/** OCAD stores font size in tenths of a point; convert to 1/100 mm (the map's own coordinate unit). */
const POINT_TENTHS_TO_HUNDREDTHS_MM = 3.52778;
function colorOrder(map, colorNumber) {
    return map.colorsByNumber.get(colorNumber)?.order ?? 0;
}
function push(ops, map, colorNumber, markup) {
    if (!markup)
        return;
    ops.push({ order: colorOrder(map, colorNumber), markup });
}
/**
 * Renders a parsed OCAD map to an SVG fragment. Point symbols, line symbols
 * (incl. double lines, framing and the symbols drawn along them, such as a
 * cliff's tags or a contour's slope lines), area symbols (incl. holes, bezier
 * curves, hatch lines and repeating-icon "structure" fills) are drawn. Not
 * drawn: a line's secondary symbols, and the different first and last dash.
 *
 * @param map - The map from `parseOcadFile`.
 * @param options - See `RenderOptions`.
 * @returns The SVG content and the `viewBox` that holds it.
 */
export function renderMapSvg(map, options = {}) {
    const exportHidden = options.exportHidden ?? false;
    const defs = collectPatternDefs(map);
    // Colors are defined top-layer-first in an .ocd file (color order 0 is
    // the frontmost/last-printed color, not the bottommost — the reverse of
    // what the name "first" might suggest), and every shape is printed
    // strictly in that order: every shape using a higher-order color is
    // drawn before every shape using a lower-order one, regardless of which
    // object or symbol it belongs to. A single object can itself use
    // several colors (a framed line's frame vs. its main stroke, an area's
    // solid fill vs. its hatch
    // overprint, ...), so — unlike sorting whole objects by one "primary"
    // color — each drawn piece below is tagged with its own color's order,
    // and every piece from every object is sorted together. Otherwise a
    // piece drawn in a late (high-order, "on top") color but attached to an
    // object whose other, earlier-order color got picked as "the" sort key
    // would wrongly end up underneath things it should print over, and
    // vice versa.
    const ops = [];
    for (const obj of map.objects) {
        const symbol = map.symbolsByNumber.get(obj.symNum);
        if (!symbol || (!exportHidden && symbol.hidden))
            continue;
        try {
            if (symbol.kind === "line" && obj.kind === "line") {
                renderLineObject(obj, symbol, map, ops);
            }
            else if (symbol.kind === "area" && obj.kind === "area") {
                renderAreaObject(obj, symbol, map, ops);
            }
            else if (symbol.kind === "point" && obj.kind === "point") {
                renderPointObject(obj, symbol, map, ops);
            }
            else if (symbol.kind === "text" && obj.kind === "text") {
                renderTextObject(obj, symbol, map, ops);
            }
        }
        catch {
            // A single malformed object must never break the rest of the map.
        }
    }
    // Descending: color order 0 is frontmost (see note above), so it must
    // sort to the END of this array — SVG paints array-first as the bottom
    // layer and array-last as the top layer. Array.prototype.sort is
    // stable, so pieces that share a color order (including multiple
    // pieces from the same object) keep their original relative position —
    // e.g. a line's framing still stays under its own main stroke, and
    // same-color objects keep the file's own drawing order.
    ops.sort((a, b) => b.order - a.order);
    // Not `parts.push(...ops.map(...))`: spreading one argument per drawn
    // piece exceeds the engine's argument limit on large maps (hundreds of
    // thousands of pieces) and throws a RangeError.
    const body = ops.map((op) => op.markup).join("\n");
    const innerMarkup = defs ? `${defs}\n${body}` : body;
    const { minX, minY, maxX, maxY } = map.bounds;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const viewBox = `${minX} ${-maxY} ${width} ${height}`;
    return { innerMarkup, viewBox };
}
function colorRgb(map, colorNumber) {
    return map.colorsByNumber.get(colorNumber)?.rgb ?? "rgb(0,0,0)";
}
/**
 * Builds the `<defs>` block of `<pattern>` fills used for hatched and
 * "structure" (repeating-icon, e.g. dot or rock patterns) area symbols.
 * One symbol can need up to two hatch patterns (cross-hatch mode) plus a
 * structure pattern; every used area symbol is scanned once regardless of
 * how many objects use it, since a pattern definition doesn't depend on
 * the individual object it's later applied to.
 */
function collectPatternDefs(map) {
    const pieces = [];
    for (const symbol of map.symbols) {
        if (symbol.kind !== "area")
            continue;
        if (symbol.hatchMode) {
            const hatchColor = colorRgb(map, symbol.hatchColor);
            pieces.push(hatchPatternDef(`hatch-${symbol.symNum}-1`, hatchColor, symbol.hatchLineWidth, symbol.hatchDistance, symbol.hatchAngle1Deg));
            if (symbol.hatchMode === 2) {
                pieces.push(hatchPatternDef(`hatch-${symbol.symNum}-2`, hatchColor, symbol.hatchLineWidth, symbol.hatchDistance, symbol.hatchAngle2Deg));
            }
        }
        if (symbol.structure) {
            pieces.push(structurePatternDef(`struct-${symbol.symNum}`, symbol, map));
        }
    }
    return pieces.length ? `<defs>${pieces.join("")}</defs>` : "";
}
/**
 * A tile of parallel lines: a thin rect (height = line width) repeated
 * every `distance` units, then rotated to the hatch angle. The tile width
 * is arbitrary (any positive value tiles seamlessly along the line
 * direction, since the rect spans the tile's full width).
 *
 * `rotate(-angleDeg)`, not `+angleDeg`: SVG's own `rotate()` turns a
 * positive angle clockwise on screen (its Y axis points down), while
 * every angle elsewhere in this renderer (see `renderPointObject`) is
 * applied as a true counter-clockwise map-space rotation and only
 * flipped to screen coordinates afterwards. Negating here keeps a given
 * hatch angle rotating the same visual direction as everything else.
 */
function hatchPatternDef(id, color, lineWidth, distance, angleDeg) {
    const width = 40;
    const height = Math.max(1, distance);
    const thickness = Math.max(0.1, lineWidth);
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${width}" height="${height}" patternTransform="rotate(${-angleDeg})"><rect x="0" y="0" width="${width}" height="${thickness}" fill="${color}" /></pattern>`;
}
/**
 * A tile of the symbol's own point-graphic elements (`symbol.elements`),
 * repeated on a grid. Mode 1 is a plain grid (one icon per cell); mode 2
 * is a staggered/brick grid, built as a double-height tile holding one
 * full row plus a second row offset by half a cell — split across the
 * tile's left and right edges so it still repeats seamlessly.
 */
function structurePatternDef(id, symbol, map) {
    const s = symbol.structure;
    const w = Math.max(1, s.cellWidth);
    const ch = Math.max(1, s.cellHeight);
    const height = s.mode === 2 ? ch * 2 : ch;
    const anchors = s.mode === 2
        ? [
            [w / 2, ch / 2],
            [0, ch * 1.5],
            [w, ch * 1.5],
        ]
        : [[w / 2, ch / 2]];
    const pieces = anchors.flatMap(([anchorX, anchorY]) => symbol.elements.map((el) => renderElement(el, (p) => ({ ...p, x: p.x + anchorX, y: p.y - anchorY }), map)));
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${height}" patternTransform="rotate(${-s.angleDeg})">${pieces.join("")}</pattern>`;
}
function renderLineObject(obj, symbol, map, ops) {
    const d = pathData(obj.coordinates, false);
    const dash = dashArray(symbol);
    if (symbol.framing && symbol.framing.width > 0) {
        push(ops, map, symbol.framing.color, strokePath(d, colorRgb(map, symbol.framing.color), symbol.framing.width, dash));
    }
    if (symbol.doubleLine) {
        const dbl = symbol.doubleLine;
        // The middle part: `width` is the distance *between* the side lines, not
        // the symbol's whole width. Filling the whole width made roads too wide,
        // and gave them the fill colour all the way out to the edge.
        if (dbl.fillOn && dbl.width > 0) {
            push(ops, map, dbl.fillColor, strokePath(d, colorRgb(map, dbl.fillColor), dbl.width, null));
        }
        // The side lines. They lie outside the middle part, one on each side, and
        // are drawn one by one in their own colour and colour layer: a road
        // should have black edges around its brown fill, not be one wide brown
        // band. Without a fill (fillOn off) the side lines are the whole symbol,
        // and earlier nothing at all was drawn then.
        for (const side of [
            { width: dbl.leftWidth, color: dbl.leftColor, sign: 1 },
            { width: dbl.rightWidth, color: dbl.rightColor, sign: -1 },
        ]) {
            if (side.width <= 0)
                continue;
            const shift = (side.sign * (dbl.width + side.width)) / 2;
            const sideD = pathData(offsetPoints(obj.coordinates, shift), false);
            push(ops, map, side.color, strokePath(sideD, colorRgb(map, side.color), side.width, null));
        }
    }
    if (symbol.lineWidth > 0) {
        push(ops, map, symbol.lineColor, strokePath(d, colorRgb(map, symbol.lineColor), symbol.lineWidth, dash));
    }
    if (symbol.decorations)
        renderLineDecorations(obj, symbol, symbol.decorations, map, ops);
}
/** Straight pieces per Bezier curve: plenty for symbols a millimetre apart. */
const BEZIER_STEPS = 12;
/**
 * The line as straight pieces, one per sub-path (`holeStart`), with Bezier
 * curves sampled. Control points are not part of the line; only the vertices
 * through which it passes can be corners.
 */
function flattenLine(points) {
    const lines = [];
    let current = null;
    let cp1 = null;
    let cp2 = null;
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i > 0 && p.bezierFirst) {
            cp1 = p;
            continue;
        }
        if (i > 0 && p.bezierSecond) {
            cp2 = p;
            continue;
        }
        if (!current || p.holeStart) {
            current = { points: [{ x: p.x, y: p.y }], corners: [] };
            lines.push(current);
        }
        else {
            const from = current.points[current.points.length - 1];
            if (cp1 && cp2) {
                for (let k = 1; k <= BEZIER_STEPS; k++) {
                    const t = k / BEZIER_STEPS;
                    const u = 1 - t;
                    const a = u * u * u;
                    const b = 3 * u * u * t;
                    const c = 3 * u * t * t;
                    const e = t * t * t;
                    current.points.push({
                        x: a * from.x + b * cp1.x + c * cp2.x + e * p.x,
                        y: a * from.y + b * cp1.y + c * cp2.y + e * p.y,
                    });
                }
            }
            else {
                current.points.push({ x: p.x, y: p.y });
            }
        }
        cp1 = cp2 = null;
        if (p.corner)
            current.corners.push(current.points.length - 1);
    }
    return lines;
}
/** The direction from one point to another, in radians with y up. */
function heading(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
}
/**
 * Where symbols repeated along a line stand, as distances from its start.
 *
 * Solid lines (a cliff, a fence): one at `endLength` from each end and the
 * rest evenly between, about `mainLength` apart, so that both ends look the
 * same. A line too short for that gets one in the middle. Dashed lines get one
 * in the middle of each dash, following the same rhythm as `dashArray`.
 */
function repeatPositions(length, symbol) {
    const { mainLength, endLength, mainGap } = symbol.dashed;
    if (!(length > 0) || !(mainLength > 0))
        return length > 0 ? [length / 2] : [];
    if (mainGap > 0 && dashArray(symbol)) {
        const out = [];
        for (let s = mainLength / 2; s < length; s += mainLength + mainGap)
            out.push(s);
        return out;
    }
    const usable = length - 2 * Math.max(0, endLength);
    if (usable <= 0)
        return [length / 2];
    const n = Math.max(1, Math.round(usable / mainLength));
    const step = usable / n;
    const out = [];
    for (let i = 0; i <= n; i++)
        out.push(endLength + i * step);
    return out;
}
/** The places along a flattened line at the given distances from its start. */
function placesAlong(line, distances) {
    const pts = line.points;
    const places = [];
    let i = 0;
    let walked = 0;
    for (const s of distances) {
        while (i < pts.length - 2) {
            const piece = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            if (walked + piece >= s)
                break;
            walked += piece;
            i++;
        }
        const a = pts[i];
        const b = pts[i + 1];
        const piece = Math.hypot(b.x - a.x, b.y - a.y);
        const t = piece > 0 ? Math.min(1, Math.max(0, (s - walked) / piece)) : 0;
        places.push({
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            angle: heading(a, b),
        });
    }
    return places;
}
/** The line's length along its straight pieces. */
function lineLength(line) {
    let length = 0;
    for (let i = 1; i < line.points.length; i++) {
        length += Math.hypot(line.points[i].x - line.points[i - 1].x, line.points[i].y - line.points[i - 1].y);
    }
    return length;
}
/** The first point on a piece of real length, from `from` in steps of `step`. */
function nextDistinct(points, from, step) {
    for (let j = from + step; j >= 0 && j < points.length; j += step) {
        const p = points[j];
        if (p.x !== points[from].x || p.y !== points[from].y)
            return p;
    }
    return null;
}
/**
 * Draws the symbols a line symbol puts along its line (see `LineDecorations`).
 *
 * The same element, colour and width repeats hundreds of times along a long
 * cliff, so the pieces are gathered per kind and drawn as one path each,
 * instead of one SVG element per tag.
 */
function renderLineDecorations(obj, symbol, decorations, map, ops) {
    const strokes = new Map();
    const fills = new Map();
    const dots = [];
    const draw = (elements, at) => {
        const cos = Math.cos(at.angle);
        const sin = Math.sin(at.angle);
        const place = (p) => ({
            ...p,
            x: at.x + p.x * cos - p.y * sin,
            y: at.y + p.x * sin + p.y * cos,
        });
        for (const el of elements) {
            const points = el.points.map(place);
            if (el.type === "line") {
                if (el.lineWidth <= 0)
                    continue;
                const key = `${el.color}|${el.lineWidth}`;
                const entry = strokes.get(key) ?? {
                    color: el.color,
                    width: el.lineWidth,
                    d: [],
                };
                entry.d.push(pathData(points, false));
                strokes.set(key, entry);
            }
            else if (el.type === "area") {
                const list = fills.get(el.color) ?? [];
                list.push(pathData(points, true));
                fills.set(el.color, list);
            }
            else {
                dots.push({
                    color: el.color,
                    markup: renderElement({ ...el, points }, (p) => p, map),
                });
            }
        }
    };
    for (const line of flattenLine(obj.coordinates)) {
        const pts = line.points;
        if (pts.length < 2)
            continue;
        if (decorations.primary.length) {
            const count = Math.max(1, decorations.primaryCount);
            const spread = (count - 1) * decorations.primaryDistance;
            const length = lineLength(line);
            const centres = repeatPositions(length, symbol);
            // Several symbols in a group stand `primaryDistance` apart, centred on the place.
            const distances = centres.flatMap((c) => Array.from({ length: count }, (_, k) => Math.min(length, Math.max(0, c - spread / 2 + k * decorations.primaryDistance))));
            for (const at of placesAlong(line, distances))
                draw(decorations.primary, at);
        }
        if (decorations.corner.length) {
            for (const i of line.corners) {
                const p = pts[i];
                const before = nextDistinct(pts, i, -1);
                const after = nextDistinct(pts, i, 1);
                // Halfway between the directions in and out, so the symbol stands
                // square to the bend; at an end, the one direction there is.
                let angle;
                if (before && after) {
                    const a = heading(before, p);
                    const b = heading(p, after);
                    angle = Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
                }
                else if (after)
                    angle = heading(p, after);
                else if (before)
                    angle = heading(before, p);
                else
                    continue;
                draw(decorations.corner, { x: p.x, y: p.y, angle });
            }
        }
        if (decorations.start.length) {
            const after = nextDistinct(pts, 0, 1);
            if (after)
                draw(decorations.start, { ...pts[0], angle: heading(pts[0], after) });
        }
        if (decorations.end.length) {
            const last = pts.length - 1;
            const before = nextDistinct(pts, last, -1);
            if (before)
                draw(decorations.end, {
                    ...pts[last],
                    angle: heading(before, pts[last]),
                });
        }
    }
    for (const s of strokes.values()) {
        push(ops, map, s.color, strokePath(s.d.join(" "), colorRgb(map, s.color), s.width, null));
    }
    for (const [color, d] of fills)
        push(ops, map, color, fillPath(d.join(" "), colorRgb(map, color)));
    for (const dot of dots)
        push(ops, map, dot.color, dot.markup);
}
/**
 * The same line, moved `distance` units to the side.
 *
 * Used for the side lines of double lines. A true parallel curve to a
 * Bezier is not a Bezier, but the offset here is a fraction of a
 * millimetre against curve radii of tens of metres: moving every point
 * (control points included) along the normal cannot be told apart from
 * the true curve at those sizes, and costs nothing.
 *
 * The normal is taken from the direction between the neighbouring points,
 * so that a point in a corner ends up along the angle bisector. Sub-paths
 * (`holeStart`) are handled one by one: a point never borrows a direction
 * from a sub-path it does not belong to.
 */
function offsetPoints(points, distance) {
    if (points.length < 2 || distance === 0)
        return points;
    // The sub-paths' limits, so that neighbours stay within their own.
    const bounds = [];
    let from = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].holeStart) {
            bounds.push([from, i - 1]);
            from = i;
        }
    }
    bounds.push([from, points.length - 1]);
    const out = points.slice();
    for (const [first, last] of bounds) {
        for (let i = first; i <= last; i++) {
            const before = points[Math.max(first, i - 1)];
            const after = points[Math.min(last, i + 1)];
            const dx = after.x - before.x;
            const dy = after.y - before.y;
            const len = Math.hypot(dx, dy);
            if (len === 0)
                continue;
            // The normal in map coordinates (y up); pathData flips y for the
            // screen, so left and right swap there. Only visible when the edges
            // have different colours, which almost never happens.
            out[i] = {
                ...points[i],
                x: points[i].x - (dy / len) * distance,
                y: points[i].y + (dx / len) * distance,
            };
        }
    }
    return out;
}
/**
 * The dash pattern as a `stroke-dasharray`.
 *
 * OCAD describes a dashed line symbol with five measures: the main dash's
 * length, the main gap between dashes, a secondary gap, and a dash and gap
 * of their own for the line's ends. The secondary gap is *cut out of* the
 * main dash and splits it in two halves: adding up the halves and the gap
 * gives back the main length.
 *
 * With both gaps set, all four numbers are needed: half, secondary gap,
 * half, main gap. SVG repeats the whole list, which gives exactly that
 * rhythm. With only one gap, two numbers are enough.
 *
 * The end measures are not used: a `stroke-dasharray` has no notion of
 * the first and last dash being different.
 */
function dashArray(symbol) {
    const { mainLength, mainGap, secondaryGap, endGap } = symbol.dashed;
    if (!mainGap && !secondaryGap && !endGap)
        return null;
    if (!mainLength)
        return null;
    const dash = secondaryGap ? (mainLength - secondaryGap) / 2 : mainLength;
    // A dash no longer than zero cannot be drawn, and a negative number
    // makes the browser throw away the whole pattern.
    if (!(dash > 0))
        return null;
    if (secondaryGap && mainGap)
        return `${dash} ${secondaryGap} ${dash} ${mainGap}`;
    const gap = secondaryGap || mainGap || endGap;
    if (!gap)
        return null;
    return `${dash} ${gap}`;
}
function renderAreaObject(obj, symbol, map, ops) {
    const d = pathData(obj.coordinates, true);
    // A solid base fill and a hatch/structure pattern can both be present
    // on the same symbol (e.g. a light green tint under a dot pattern), so
    // these layer rather than being mutually exclusive — and each layers in
    // at its own color's paint order, not necessarily together.
    if (symbol.fillOn) {
        push(ops, map, symbol.fillColor, fillPath(d, colorRgb(map, symbol.fillColor)));
    }
    if (symbol.hatchMode) {
        push(ops, map, symbol.hatchColor, fillPath(d, `url(#hatch-${symbol.symNum}-1)`));
        if (symbol.hatchMode === 2) {
            push(ops, map, symbol.hatchColor, fillPath(d, `url(#hatch-${symbol.symNum}-2)`));
        }
    }
    if (symbol.structure) {
        // A structure fill can tile several differently-colored elements (see
        // structurePatternDef); there's no single "the" color for the tile as
        // a whole, so it sorts at the topmost (lowest-numbered, see the note
        // in renderMapSvg) of its elements' orders — structure fills are
        // small repeated icons (dots, rocks, ...) that are meant to sit on
        // top of the plainer colors under them.
        const structureOrder = Math.min(...symbol.elements.map((el) => colorOrder(map, el.color)), Number.MAX_SAFE_INTEGER);
        ops.push({
            order: structureOrder,
            markup: fillPath(d, `url(#struct-${symbol.symNum})`),
        });
    }
    if (symbol.borderSymbolNumber) {
        const borderSymbol = map.symbolsByNumber.get(symbol.borderSymbolNumber);
        if (borderSymbol?.kind === "line") {
            renderLineObject({ ...obj, kind: "line" }, borderSymbol, map, ops);
        }
    }
}
function renderPointObject(obj, symbol, map, ops) {
    const angleRad = (obj.angle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const origin = obj.coordinates[0] ?? { x: 0, y: 0 };
    const placed = (p) => ({
        ...p,
        x: origin.x + p.x * cos - p.y * sin,
        y: origin.y + p.x * sin + p.y * cos,
    });
    // A point symbol's elements can mix colors (e.g. a two-tone control
    // description), so each element is its own draw op rather than one
    // fixed `<g>` — otherwise the whole symbol would sort as a unit at
    // whichever color happened to be listed first.
    for (const el of symbol.elements) {
        push(ops, map, el.color, renderElement(el, placed, map));
    }
}
function renderElement(el, place, map) {
    const color = colorRgb(map, el.color);
    const points = el.points.map(place);
    switch (el.type) {
        case "line":
            return strokePath(pathData(points, false), color, el.lineWidth, null);
        case "area":
            return fillPath(pathData(points, true), color);
        case "circle": {
            const c = points[0] ?? { x: 0, y: 0 };
            return `<circle cx="${c.x}" cy="${-c.y}" r="${el.diameter / 2}" fill="none" stroke="${color}" stroke-width="${el.lineWidth}" />`;
        }
        case "dot": {
            const c = points[0] ?? { x: 0, y: 0 };
            return `<circle cx="${c.x}" cy="${-c.y}" r="${el.diameter / 2}" fill="${color}" />`;
        }
    }
}
function renderTextObject(obj, symbol, map, ops) {
    const p = obj.coordinates[0];
    if (!p || !obj.text)
        return;
    const fontSize = symbol.fontSize * POINT_TENTHS_TO_HUNDREDTHS_MM;
    const anchor = symbol.alignmentHorizontal === "center"
        ? "middle"
        : symbol.alignmentHorizontal === "right"
            ? "end"
            : "start";
    const lines = obj.text.split("\n");
    const tspans = lines
        .map((line, i) => `<tspan x="${p.x}" y="${-p.y + i * fontSize * 1.2}">${escapeXml(line)}</tspan>`)
        .join("");
    const markup = `<text x="${p.x}" y="${-p.y}" fill="${colorRgb(map, symbol.fontColor)}" font-family="${escapeXml(symbol.fontName || "sans-serif")}" font-size="${fontSize}" font-weight="${symbol.bold ? "bold" : "normal"}" font-style="${symbol.italic ? "italic" : "normal"}" text-anchor="${anchor}">${tspans}</text>`;
    push(ops, map, symbol.fontColor, markup);
}
function strokePath(d, color, width, dash) {
    if (width <= 0 || !d)
        return "";
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""} />`;
}
function fillPath(d, color, opacity = 1) {
    if (!d)
        return "";
    return `<path d="${d}" fill="${color}" fill-rule="evenodd" fill-opacity="${opacity}" />`;
}
/**
 * Converts OCAD's flagged vertex list into an SVG path `d` string,
 * following the sub-path/hole and Bezier-curve flags on each vertex.
 * Y is negated throughout so map "up" renders as screen "up" (SVG's Y
 * axis points down).
 */
function pathData(points, closeSubPaths) {
    if (points.length === 0)
        return "";
    const segments = [];
    let subPathStart = points[0];
    let pendingCp1 = null;
    let pendingCp2 = null;
    segments.push(`M ${subPathStart.x} ${-subPathStart.y}`);
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i === 0)
            continue;
        if (p.bezierFirst) {
            pendingCp1 = p;
            continue;
        }
        if (p.bezierSecond) {
            pendingCp2 = p;
            continue;
        }
        if (p.holeStart) {
            if (closeSubPaths)
                segments.push(`L ${subPathStart.x} ${-subPathStart.y} Z`);
            subPathStart = p;
            segments.push(`M ${p.x} ${-p.y}`);
            continue;
        }
        if (pendingCp1 && pendingCp2) {
            segments.push(`C ${pendingCp1.x} ${-pendingCp1.y} ${pendingCp2.x} ${-pendingCp2.y} ${p.x} ${-p.y}`);
            pendingCp1 = pendingCp2 = null;
        }
        else {
            segments.push(`L ${p.x} ${-p.y}`);
        }
    }
    if (closeSubPaths)
        segments.push(`L ${subPathStart.x} ${-subPathStart.y} Z`);
    return segments.join(" ");
}
/**
 * Characters XML 1.0 forbids outright: control characters other than
 * tab/LF/CR, the two non-characters U+FFFE/U+FFFF, and unpaired
 * surrogates. Map text can contain them (garbage in a text object, an
 * odd font name), and DOMParser rejects the *whole* document over a
 * single one — so they are dropped rather than escaped.
 */
/* eslint-disable no-control-regex -- matching the forbidden control characters is the whole point here */
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/* eslint-enable no-control-regex */
export function escapeXml(s) {
    return s
        .replace(INVALID_XML_CHARS, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
