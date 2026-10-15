// @vitest-environment jsdom
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type AppExports } from "../helpers/appHarness";

describe("formatClock", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        app = await mountApp();
    });

    it.each([
        [0, "00:00"],
        [1, "00:01"],
        [999, "00:01"],
        [1000, "00:01"],
        [1001, "00:02"],
        [59000, "00:59"],
        [60000, "01:00"],
        [3599000, "59:59"],
        [3600000, "60:00"],
        [-5000, "00:00"],
        [Number.NEGATIVE_INFINITY, "00:00"],
    ])("formats %d ms as %s", (milliseconds, expected) =>
    {
        expect(app.formatClock(milliseconds)).toBe(expected);
    });

    it("always matches mm:ss and never exceeds the input rounded up", () =>
    {
        fc.assert(fc.property(fc.integer({ min: -100000, max: 7200000 }), (milliseconds) =>
        {
            const text = app.formatClock(milliseconds);
            expect(text).toMatch(/^\d{2,}:\d{2}$/);
            const [minutes, seconds] = text.split(":").map(Number);
            expect(seconds).toBeLessThan(60);
            expect(minutes * 60 + seconds).toBe(Math.max(0, Math.ceil(milliseconds / 1000)));
        }));
    });
});

describe("el", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        app = await mountApp();
    });

    it("creates the requested tag", () =>
    {
        expect(app.el("section").tagName).toBe("SECTION");
    });

    it("sets string attributes", () =>
    {
        const element = app.el("a", { href: "https://example.com", class: "link" });
        expect(element.getAttribute("href")).toBe("https://example.com");
        expect(element.className).toBe("link");
    });

    it("sets an empty attribute for boolean true and omits it for false", () =>
    {
        const element = app.el("button", { disabled: true, hidden: false });
        expect(element.hasAttribute("disabled")).toBe(true);
        expect(element.getAttribute("disabled")).toBe("");
        expect(element.hasAttribute("hidden")).toBe(false);
    });

    it("registers on* attributes as event listeners without setting an attribute", () =>
    {
        const handler = vi.fn();
        const element = app.el("button", { onclick: handler });
        element.click();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(element.hasAttribute("onclick")).toBe(false);
    });

    it("appends strings and nodes and skips null, false and undefined", () =>
    {
        const inner = app.el("em", {}, "inner");
        const element = app.el("p", {}, "text ", null, false, undefined, inner);
        expect(element.childNodes).toHaveLength(2);
        expect(element.textContent).toBe("text inner");
    });

    it("treats child strings as text, never as markup", () =>
    {
        const payload = "<img src=x onerror=alert(1)><script>alert(2)</script>";
        const element = app.el("p", {}, payload);
        expect(element.children).toHaveLength(0);
        expect(element.textContent).toBe(payload);
    });

    describe("direction", () =>
    {
        it("rounds a time that is left up, so a count down shows 00:00 only when it is over", () =>
        {
            expect(app.formatClock(1)).toBe("00:01");
            expect(app.formatClock(999, "down")).toBe("00:01");
            expect(app.formatClock(0, "down")).toBe("00:00");
        });

        it("rounds a time that has run down, so a count up shows a second only when it has passed", () =>
        {
            expect(app.formatClock(999, "up")).toBe("00:00");
            expect(app.formatClock(1000, "up")).toBe("00:01");
            expect(app.formatClock(65 * 1000 + 999, "up")).toBe("01:05");
        });

        it("shows more than 99 minutes with three digits of minutes", () =>
        {
            expect(app.formatClock(150 * 60 * 1000, "up")).toBe("150:00");
        });
    });
});
