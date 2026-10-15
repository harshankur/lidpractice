// Geometry for the maps of the Learn tab: projecting longitude and latitude onto a plane, cutting shapes to a frame,
// snapping them to a grid and writing them as compact SVG paths. Used by scripts/generate-maps.mjs only; the app
// itself gets finished paths.
//
// A ring is a closed line as a list of [x, y] points, without the first point repeated at the end.

/** Degrees to radians. */
const RADIANS = Math.PI / 180;

/** A ring needs this many points to enclose an area. */
const MIN_RING_POINTS = 3;

/**
 * Lambert azimuthal equal-area projection of a point on the sphere, centred on a chosen point.
 * Areas keep their proportions, and shapes near the centre look the way they do on a globe.
 * @param {number} lon Longitude in degrees.
 * @param {number} lat Latitude in degrees.
 * @param {number} lon0 Longitude of the centre.
 * @param {number} lat0 Latitude of the centre.
 * @returns {[number, number]} x to the east and y to the north, in units of the radius of the sphere.
 */
export function project(lon, lat, lon0, lat0)
{
    const phi = lat * RADIANS;
    const phi0 = lat0 * RADIANS;
    const lambda = (lon - lon0) * RADIANS;
    const k = Math.sqrt(2 / (1 + Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda)));
    return [
        k * Math.cos(phi) * Math.sin(lambda),
        k * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda)),
    ];
}

/**
 * The rings of a GeoJSON geometry, each without its repeated last point.
 * @param {{ type: string, coordinates: number[][][] | number[][][][] }} geometry A Polygon or a MultiPolygon.
 * @returns {number[][][]} Every ring, outer and inner alike.
 */
export function ringsOf(geometry)
{
    const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
    return polygons.flatMap((polygon) => polygon.map((ring) =>
    {
        const first = ring[0];
        const last = ring[ring.length - 1];
        return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
    }));
}

/**
 * Cuts a ring with a straight line and keeps the part on one side of it (Sutherland and Hodgman, one edge).
 * @param {number[][]} ring The ring.
 * @param {[number, number]} from A point on the line.
 * @param {[number, number]} to Another point on the line.
 * @returns {number[][]} What is left of the ring on the left of the line as seen from `from` to `to`, possibly nothing.
 */
export function clipByLine(ring, from, to)
{
    const side = (point) => (to[0] - from[0]) * (point[1] - from[1]) - (to[1] - from[1]) * (point[0] - from[0]);
    const crossing = (a, b) =>
    {
        const sa = side(a);
        const sb = side(b);
        const ratio = sa / (sa - sb);
        return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
    };
    const kept = [];
    for (let index = 0; index < ring.length; index++)
    {
        const current = ring[index];
        const previous = ring[(index + ring.length - 1) % ring.length];
        const inside = side(current) >= 0;
        if (inside !== side(previous) >= 0)
        {
            kept.push(crossing(previous, current));
        }
        if (inside)
        {
            kept.push(current);
        }
    }
    return kept;
}

/**
 * Cuts a ring to a rectangle.
 * @param {number[][]} ring The ring.
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} box The rectangle.
 * @returns {number[][]} The part of the ring inside the rectangle, possibly nothing.
 */
export function clipToBox(ring, box)
{
    // Each edge of the rectangle, walked so that the inside is on the left.
    const edges = [
        [[box.minX, box.minY], [box.maxX, box.minY]],
        [[box.maxX, box.minY], [box.maxX, box.maxY]],
        [[box.maxX, box.maxY], [box.minX, box.maxY]],
        [[box.minX, box.maxY], [box.minX, box.minY]],
    ];
    return edges.reduce((rest, [from, to]) => (rest.length === 0 ? rest : clipByLine(rest, from, to)), ring);
}

/**
 * The smallest rectangle around some rings.
 * @param {number[][][]} rings The rings.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }} The rectangle.
 */
export function boundsOf(rings)
{
    const xs = rings.flat().map((point) => point[0]);
    const ys = rings.flat().map((point) => point[1]);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * How to draw a rectangle of the plane into a picture of a given width: scaled to fit, with a margin, and with y
 * turned around (north is up on the plane, down is positive in a picture).
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} box The rectangle on the plane.
 * @param {number} width Width of the picture.
 * @param {number} margin Free room on every side.
 * @returns {{ height: number, place: (point: number[]) => [number, number] }} The height of the picture and the mapping.
 */
export function fit(box, width, margin)
{
    const scale = (width - 2 * margin) / (box.maxX - box.minX);
    const height = Math.ceil((box.maxY - box.minY) * scale + 2 * margin);
    return {
        height,
        place: (point) => [(point[0] - box.minX) * scale + margin, (box.maxY - point[1]) * scale + margin],
    };
}

/**
 * Snaps a ring to whole numbers and drops what that makes redundant: repeated points and points on a straight line
 * between their neighbours. Two rings that share a border share the same snapped points, so no gap opens between them.
 * @param {number[][]} ring The ring, in picture units.
 * @returns {number[][]} The snapped ring, or nothing when it no longer encloses an area.
 */
export function snap(ring)
{
    // A value just below zero rounds to minus zero, which is zero here: "|| 0" makes it so.
    let current = ring.map((point) => [Math.round(point[0]) || 0, Math.round(point[1]) || 0]);
    // Dropping a point can leave two equal neighbours or a new straight line, so this runs until nothing changes.
    for (;;)
    {
        const distinct = current.filter((point, index) =>
        {
            const previous = current[(index + current.length - 1) % current.length];
            return current.length === 1 || point[0] !== previous[0] || point[1] !== previous[1];
        });
        const corners = distinct.filter((point, index) =>
        {
            const previous = distinct[(index + distinct.length - 1) % distinct.length];
            const next = distinct[(index + 1) % distinct.length];
            return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
        });
        if (corners.length === current.length)
        {
            break;
        }
        current = corners;
    }
    return current.length < MIN_RING_POINTS || area(current) === 0 ? [] : current;
}

/**
 * The area a ring encloses.
 * @param {number[][]} ring The ring.
 * @returns {number} The area, never negative.
 */
export function area(ring)
{
    let twice = 0;
    for (let index = 0; index < ring.length; index++)
    {
        const next = ring[(index + 1) % ring.length];
        twice += ring[index][0] * next[1] - next[0] * ring[index][1];
    }
    return Math.abs(twice) / 2;
}

/**
 * Writes rings as one SVG path: every ring starts with an absolute "M", goes on with relative steps and closes.
 * @param {number[][][]} rings Snapped rings.
 * @returns {string} The path data.
 */
export function pathOf(rings)
{
    return rings.filter((ring) => ring.length >= MIN_RING_POINTS).map((ring) =>
    {
        const steps = ring.slice(1).map((point, index) => `${point[0] - ring[index][0]} ${point[1] - ring[index][1]}`);
        return `M${ring[0][0]} ${ring[0][1]}l${steps.join(" ")}z`;
    }).join("");
}
