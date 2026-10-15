// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clampedText, DEFAULT_CLAMP_LINES } from "../../src/dom";
import { applyTheme } from "../../src/theme";

describe("applyTheme", () =>
{
    beforeEach(() =>
    {
        document.head.innerHTML = "<meta name=\"theme-color\" content=\"#f2f3f6\" media=\"(prefers-color-scheme: light)\"><meta name=\"theme-color\" content=\"#101319\" media=\"(prefers-color-scheme: dark)\">";
        document.documentElement.className = "";
    });

    const colors = (): string[] => Array.from(document.querySelectorAll<HTMLMetaElement>("meta[name=theme-color]")).map((meta) => meta.content);

    it("follows the system with no class for auto", () =>
    {
        applyTheme("auto");
        expect(document.documentElement.className).toBe("");
        expect(colors()).toEqual(["#f2f3f6", "#101319"]);
    });

    it("forces the dark theme with a class on the root element and the dark browser bar", () =>
    {
        applyTheme("dark");
        expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
        expect(colors()).toEqual(["#101319", "#101319"]);
    });

    it("forces the light theme", () =>
    {
        applyTheme("light");
        expect(document.documentElement.classList.contains("theme-light")).toBe(true);
        expect(colors()).toEqual(["#f2f3f6", "#f2f3f6"]);
    });

    it("replaces the previous theme and goes back to the original bar colours for auto", () =>
    {
        applyTheme("dark");
        applyTheme("light");
        expect(document.documentElement.className).toBe("theme-light");
        applyTheme("auto");
        expect(document.documentElement.className).toBe("");
        expect(colors()).toEqual(["#f2f3f6", "#101319"]);
    });

    it("keeps other classes on the root element", () =>
    {
        document.documentElement.classList.add("something");
        applyTheme("dark");
        applyTheme("auto");
        expect(document.documentElement.classList.contains("something")).toBe(true);
    });
});

describe("clampedText", () =>
{
    /** Observer callbacks, so the test can say when the box changed size. */
    let callbacks: (() => void)[];

    beforeEach(() =>
    {
        callbacks = [];
        (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class
        {
            public constructor(callback: () => void)
            {
                callbacks.push(callback);
            }

            public observe(): void
            {
                // Nothing to do, the test calls the callbacks itself.
            }
        };
    });

    /** Gives an element a measured size. */
    function measure(element: HTMLElement, scrollHeight: number, clientHeight: number): void
    {
        Object.defineProperty(element, "scrollHeight", { value: scrollHeight, configurable: true });
        Object.defineProperty(element, "clientHeight", { value: clientHeight, configurable: true });
    }

    it("is text with the clamp class and the allowed number of lines", () =>
    {
        const element = clampedText("Hello");
        expect(element.className).toBe("clamp");
        expect(element.textContent).toBe("Hello");
        expect(element.style.getPropertyValue("--clamp-lines")).toBe(String(DEFAULT_CLAMP_LINES));
        expect(clampedText("Hello", 1).style.getPropertyValue("--clamp-lines")).toBe("1");
    });

    it("carries its full text as a tooltip only when it is really cut off", () =>
    {
        const element = clampedText("A long name that does not fit");
        measure(element, 80, 40);
        callbacks[0]();
        expect(element.getAttribute("title")).toBe("A long name that does not fit");
        measure(element, 40, 40);
        callbacks[0]();
        expect(element.hasAttribute("title")).toBe(false);
    });

    it("does not count a rounding difference of a pixel as cut off", () =>
    {
        const element = clampedText("Fits");
        measure(element, 41, 40);
        callbacks[0]();
        expect(element.hasAttribute("title")).toBe(false);
    });

    it("works where the browser has no ResizeObserver", () =>
    {
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
        expect(clampedText("Plain").textContent).toBe("Plain");
    });
});
