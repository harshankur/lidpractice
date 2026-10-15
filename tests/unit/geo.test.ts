import { describe, expect, it } from "vitest";
import { area, boundsOf, clipByLine, clipToBox, fit, pathOf, project, ringsOf, snap } from "../../scripts/lib/geo.mjs";

/** A square with corners at 0 and 10, counter clockwise. */
const SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("project", () =>
{
    it("puts the centre at the origin", () =>
    {
        const [x, y] = project(10, 51, 10, 51);
        expect(x).toBeCloseTo(0);
        expect(y).toBeCloseTo(0);
    });

    it("puts the east to the right and the north up", () =>
    {
        expect(project(12, 51, 10, 51)[0]).toBeGreaterThan(0);
        expect(project(8, 51, 10, 51)[0]).toBeLessThan(0);
        expect(project(10, 53, 10, 51)[1]).toBeGreaterThan(0);
        expect(project(10, 49, 10, 51)[1]).toBeLessThan(0);
    });

    it("is the same on both sides of the middle meridian", () =>
    {
        const east = project(13, 48, 10, 51);
        const west = project(7, 48, 10, 51);
        expect(east[0]).toBeCloseTo(-west[0]);
        expect(east[1]).toBeCloseTo(west[1]);
    });

    it("keeps a degree of latitude near the centre close to a degree of arc on the sphere", () =>
    {
        const [, y] = project(10, 52, 10, 51);
        expect(y).toBeCloseTo(Math.PI / 180, 4);
    });
});

describe("ringsOf", () =>
{
    it("takes the rings of a polygon and drops the point that closes each", () =>
    {
        const polygon = { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 1]]] };
        expect(ringsOf(polygon)).toEqual([[[0, 0], [4, 0], [4, 4]], [[1, 1], [2, 1], [2, 2]]]);
    });

    it("takes the rings of every part of a shape in several parts", () =>
    {
        const multi = { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] };
        expect(ringsOf(multi)).toEqual([[[0, 0], [1, 0], [1, 1]], [[5, 5], [6, 5], [6, 6]]]);
    });

    it("leaves a ring as it is when its last point is not its first", () =>
    {
        expect(ringsOf({ type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4]]] })).toEqual([[[0, 0], [4, 0], [4, 4]]]);
    });
});

describe("clipByLine", () =>
{
    it("keeps the part on the left of the line and adds the points where the ring crosses it", () =>
    {
        // The line runs up at x = 4: its left is where x is smaller.
        const left = clipByLine(SQUARE, [4, 0], [4, 10]);
        expect(left).toEqual([[0, 0], [4, 0], [4, 10], [0, 10]]);
        expect(area(left)).toBe(40);
    });

    it("keeps the other part when the line runs the other way", () =>
    {
        const right = clipByLine(SQUARE, [4, 10], [4, 0]);
        expect(area(right)).toBe(60);
        expect(right.every((point: number[]) => point[0] >= 4)).toBe(true);
    });

    it("keeps a ring whole that lies on the left, and nothing of a ring on the right", () =>
    {
        expect(clipByLine(SQUARE, [20, 0], [20, 10])).toEqual(SQUARE);
        expect(clipByLine(SQUARE, [-5, 0], [-5, 10])).toEqual([]);
    });
});

describe("clipToBox", () =>
{
    it("cuts a ring to a rectangle", () =>
    {
        const cut = clipToBox(SQUARE, { minX: 5, minY: 5, maxX: 20, maxY: 20 });
        expect(area(cut)).toBe(25);
        expect(boundsOf([cut])).toEqual({ minX: 5, minY: 5, maxX: 10, maxY: 10 });
    });

    it("keeps a ring that is inside, and nothing of a ring that is outside", () =>
    {
        expect(clipToBox(SQUARE, { minX: -1, minY: -1, maxX: 11, maxY: 11 })).toEqual(SQUARE);
        expect(clipToBox(SQUARE, { minX: 50, minY: 50, maxX: 60, maxY: 60 })).toEqual([]);
    });

    it("cuts a triangle that pokes through a corner", () =>
    {
        const triangle = [[0, 0], [12, 0], [0, 12]];
        const cut = clipToBox(triangle, { minX: 0, minY: 0, maxX: 6, maxY: 6 });
        // The corner square of 6 by 6 is inside the triangle, since 6 + 6 is no more than 12.
        expect(area(cut)).toBeCloseTo(36);
    });
});

describe("boundsOf", () =>
{
    it("finds the smallest rectangle around several rings", () =>
    {
        expect(boundsOf([[[1, 2], [3, 9]], [[-4, 5], [0, 0]]])).toEqual({ minX: -4, minY: 0, maxX: 3, maxY: 9 });
    });
});

describe("fit", () =>
{
    it("scales a rectangle to the width of the picture with a margin, and turns north up", () =>
    {
        const { height, place } = fit({ minX: 0, minY: 0, maxX: 2, maxY: 1 }, 220, 10);
        // 2 units fill 200 pixels, so 1 unit is 100 pixels: the picture is 100 high plus the two margins.
        expect(height).toBe(120);
        expect(place([0, 1])).toEqual([10, 10]);
        expect(place([2, 0])).toEqual([210, 110]);
        expect(place([1, 0.5])).toEqual([110, 60]);
    });

    it("rounds the height up to a whole pixel", () =>
    {
        expect(fit({ minX: 0, minY: 0, maxX: 3, maxY: 1 }, 100, 0).height).toBe(34);
    });
});

describe("snap", () =>
{
    it("rounds every point to whole numbers", () =>
    {
        expect(snap([[0.2, 0.4], [9.6, -0.3], [10.4, 9.9], [-0.4, 10.2]])).toEqual(SQUARE);
    });

    it("drops points that fall together and points on a straight line between their neighbours", () =>
    {
        const noisy = [[0, 0], [0.2, 0.1], [5, 0], [10, 0], [10, 5], [10, 10], [0, 10], [0, 4]];
        expect(snap(noisy)).toEqual(SQUARE);
    });

    it("goes on until nothing changes: dropping a point can make its neighbours equal", () =>
    {
        // Without the spike at (5, 0.3) the first and the third point are the same point.
        const spiked = [[0, 0], [5, 0.3], [0, 0.2], [10, 0], [10, 10], [0, 10]];
        expect(snap(spiked)).toEqual(SQUARE);
    });

    it("gives nothing for a ring that no longer encloses an area", () =>
    {
        expect(snap([[0, 0], [0.3, 0.2], [0.1, 0.4]])).toEqual([]);
        expect(snap([[0, 0], [5, 0], [10, 0]])).toEqual([]);
        expect(snap([[3, 3]])).toEqual([]);
        expect(snap([])).toEqual([]);
    });

    it("snaps a border that two rings share to the same points, so no gap opens between them", () =>
    {
        const border = [[4.4, -0.2], [4.6, 5.3], [4.4, 10.1]];
        const left = snap([[0, 0], ...border, [0, 10]]);
        const right = snap([[10, 10], ...[...border].reverse(), [10, 0]]);
        const shared = (ring: number[][]): string[] => ring.filter((point) => point[0] === 4 || point[0] === 5).map((point) => point.join(","));
        expect(shared(left).sort()).toEqual(shared(right).sort());
        expect(area(left) + area(right)).toBe(100);
    });
});

describe("area", () =>
{
    it("measures a ring whichever way it runs", () =>
    {
        expect(area(SQUARE)).toBe(100);
        expect(area([...SQUARE].reverse())).toBe(100);
        expect(area([[0, 0], [4, 0], [0, 3]])).toBe(6);
        expect(area([])).toBe(0);
    });
});

describe("pathOf", () =>
{
    it("writes a ring as a start point, relative steps and a close", () =>
    {
        expect(pathOf([SQUARE])).toBe("M0 0l10 0 0 10 -10 0z");
    });

    it("writes several rings one after the other, and leaves out what is no ring", () =>
    {
        expect(pathOf([[[0, 0], [2, 0], [0, 2]], [[5, 5], [6, 5]], [[10, 10], [12, 10], [10, 13]]])).toBe("M0 0l2 0 -2 2zM10 10l2 0 -2 3z");
        expect(pathOf([])).toBe("");
    });

    it("writes only what the maps of the site are made of: whole numbers, moves, lines and closes", () =>
    {
        expect(pathOf([snap([[0.4, 0.4], [20.2, 3.3], [7.7, 18.1]])])).toMatch(/^[Mlz0-9 -]+$/);
    });
});
