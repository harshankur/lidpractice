// @vitest-environment jsdom
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type AppExports } from "../helpers/appHarness";

describe("randomness helpers", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        app = await mountApp();
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    describe("randomInt", () =>
    {
        it("always returns an integer in range", () =>
        {
            fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), (max) =>
            {
                const value = app.randomInt(max);
                expect(Number.isInteger(value)).toBe(true);
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(max);
            }));
        });

        it("returns 0 when the range has one value", () =>
        {
            expect(app.randomInt(1)).toBe(0);
        });

        it("maps the raw value with modulo", () =>
        {
            vi.spyOn(crypto, "getRandomValues").mockImplementation(((buffer: Uint32Array) =>
            {
                buffer[0] = 17;
                return buffer;
            }) as typeof crypto.getRandomValues);
            expect(app.randomInt(10)).toBe(7);
        });

        it("rejects raw values in the biased tail and draws again", () =>
        {
            // For max 3, limit is 0x100000000 - (0x100000000 % 3) = 4294967295. Values at or above it are rejected.
            const draws = [4294967295, 4294967295, 4];
            const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((buffer: Uint32Array) =>
            {
                buffer[0] = draws.shift() as number;
                return buffer;
            }) as typeof crypto.getRandomValues);
            expect(app.randomInt(3)).toBe(1);
            expect(spy).toHaveBeenCalledTimes(3);
        });

        it("is roughly uniform over many draws", () =>
        {
            const buckets = [0, 0, 0, 0, 0];
            const draws = 20000;
            for (let index = 0; index < draws; index++)
            {
                buckets[app.randomInt(buckets.length)] += 1;
            }
            const expected = draws / buckets.length;
            for (const count of buckets)
            {
                expect(Math.abs(count - expected)).toBeLessThan(expected * 0.1);
            }
        });
    });

    describe("shuffled", () =>
    {
        it("returns a permutation and leaves the input untouched", () =>
        {
            fc.assert(fc.property(fc.array(fc.integer(), { maxLength: 60 }), (items) =>
            {
                const snapshot = items.slice();
                const result = app.shuffled(items);
                expect(items).toEqual(snapshot);
                expect(result).not.toBe(items);
                expect(result.slice().sort((first, second) => first - second))
                    .toEqual(snapshot.slice().sort((first, second) => first - second));
            }));
        });

        it("handles empty and single element arrays", () =>
        {
            expect(app.shuffled([])).toEqual([]);
            expect(app.shuffled(["only"])).toEqual(["only"]);
        });

        it("can produce every ordering of three items", () =>
        {
            const seen = new Set<string>();
            for (let index = 0; index < 600; index++)
            {
                seen.add(app.shuffled([1, 2, 3]).join(""));
            }
            expect(seen.size).toBe(6);
        });
    });

    describe("pickRandom", () =>
    {
        it("returns the requested number of distinct items", () =>
        {
            fc.assert(fc.property(
                fc.uniqueArray(fc.integer(), { minLength: 1, maxLength: 50 }),
                fc.integer({ min: 0, max: 60 }),
                (items, count) =>
                {
                    const picked = app.pickRandom(items, count);
                    expect(picked).toHaveLength(Math.min(count, items.length));
                    expect(new Set(picked).size).toBe(picked.length);
                    for (const value of picked)
                    {
                        expect(items).toContain(value);
                    }
                }));
        });

        it("returns an empty array for count 0", () =>
        {
            expect(app.pickRandom([1, 2, 3], 0)).toEqual([]);
        });
    });
});
