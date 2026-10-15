import { describe, expect, it } from "vitest";
import { Clock } from "../../src/clock";

/** One minute in milliseconds. */
const MINUTE = 60 * 1000;

describe("Clock counting up", () =>
{
    it("stands at zero until it is started", () =>
    {
        const clock = new Clock("up", 30);
        expect(clock.running).toBe(false);
        expect(clock.shown(5 * MINUTE)).toBe(0);
    });

    it("shows what has run", () =>
    {
        const clock = new Clock("up", 30);
        clock.start(1000);
        expect(clock.running).toBe(true);
        expect(clock.shown(1000 + 90 * 1000)).toBe(90 * 1000);
    });

    it("keeps the time when it is stopped, and goes on from there", () =>
    {
        const clock = new Clock("up", 30);
        clock.start(0);
        clock.pause(10 * 1000);
        expect(clock.running).toBe(false);
        expect(clock.shown(500 * 1000)).toBe(10 * 1000);
        clock.start(500 * 1000);
        expect(clock.shown(505 * 1000)).toBe(15 * 1000);
    });

    it("goes back to zero on reset, and stops", () =>
    {
        const clock = new Clock("up", 30);
        clock.start(0);
        clock.reset();
        expect(clock.running).toBe(false);
        expect(clock.shown(99 * 1000)).toBe(0);
    });

    it("is never urgent and never over, however long it runs", () =>
    {
        const clock = new Clock("up", 1);
        clock.start(0);
        expect(clock.level(10 * MINUTE)).toBe("calm");
        expect(clock.over(10 * MINUTE)).toBe(false);
    });

    it("ignores a second start, which would move the start of the run", () =>
    {
        const clock = new Clock("up", 30);
        clock.start(0);
        clock.start(5000);
        expect(clock.shown(10 * 1000)).toBe(10 * 1000);
    });

    it("does not go below zero when asked about a time before the start", () =>
    {
        const clock = new Clock("up", 30);
        clock.start(1000);
        expect(clock.elapsed(0)).toBe(0);
    });
});

describe("Clock counting down", () =>
{
    it("shows the whole time at the start, and what is left once it runs", () =>
    {
        const clock = new Clock("down", 60);
        expect(clock.shown(0)).toBe(60 * MINUTE);
        clock.start(0);
        expect(clock.shown(25 * MINUTE)).toBe(35 * MINUTE);
    });

    it("stops at zero and is over", () =>
    {
        const clock = new Clock("down", 5);
        clock.start(0);
        expect(clock.over(5 * MINUTE - 1)).toBe(false);
        expect(clock.over(5 * MINUTE)).toBe(true);
        expect(clock.shown(9 * MINUTE)).toBe(0);
    });

    it("can be made longer or shorter while it runs, and the time left follows", () =>
    {
        const clock = new Clock("down", 10);
        clock.start(0);
        clock.durationMs = 20 * MINUTE;
        expect(clock.shown(4 * MINUTE)).toBe(16 * MINUTE);
    });

    it.each([
        ["calm", 15 * MINUTE + 1],
        ["nudge", 15 * MINUTE],
        ["nudge", 5 * MINUTE + 1],
        ["warn", 5 * MINUTE],
        ["warn", 1 * MINUTE + 1],
        ["critical", 1 * MINUTE],
        ["critical", 0],
    ])("is %s with %d milliseconds left", (level, left) =>
    {
        const clock = new Clock("down", 60);
        clock.start(0);
        expect(clock.level(60 * MINUTE - left)).toBe(level);
    });

    it("is calm for a time that is long, and urgent from the start for a time that is short", () =>
    {
        expect(new Clock("down", 60).level(0)).toBe("calm");
        expect(new Clock("down", 10).level(0)).toBe("nudge");
        expect(new Clock("down", 1).level(0)).toBe("critical");
    });
});
