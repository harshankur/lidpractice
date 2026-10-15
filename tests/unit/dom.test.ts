// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { icon, revealInStrip, svg, twoStepLabel } from "../../src/dom";

/**
 * Gives an element a place on the screen, which the DOM of a test does not work out.
 * @param element The element.
 * @param left Its left edge.
 * @param right Its right edge.
 */
function placeAt(element: HTMLElement, left: number, right: number): void
{
    element.getBoundingClientRect = (): DOMRect => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON: () => ({}) });
}

describe("svg", () =>
{
    it("makes an element of the drawing kind with its attributes, and adds what starts with on as a listener", () =>
    {
        let clicks = 0;
        const path = svg("path", {
            d: "M0 0L1 1",
            class: "region",
            onclick: () =>
            {
                clicks += 1;
            },
        });
        expect(path.namespaceURI).toBe("http://www.w3.org/2000/svg");
        expect(path.tagName).toBe("path");
        expect(path.getAttribute("d")).toBe("M0 0L1 1");
        expect(path.getAttribute("class")).toBe("region");
        expect(path.hasAttribute("onclick")).toBe(false);
        path.dispatchEvent(new MouseEvent("click"));
        expect(clicks).toBe(1);
    });

    it("takes children and text, and leaves out what is null, false or undefined", () =>
    {
        const group = svg("g", {}, svg("circle", { r: "2" }), null, false, undefined, "7");
        expect(group.childNodes).toHaveLength(2);
        expect(group.firstElementChild?.tagName).toBe("circle");
        expect(group.textContent).toBe("7");
        expect(svg("defs").attributes).toHaveLength(0);
    });

    it("never turns text into markup", () =>
    {
        const text = svg("text", {}, "<script>alert(1)</script>");
        expect(text.children).toHaveLength(0);
        expect(text.textContent).toBe("<script>alert(1)</script>");
    });

    it("draws the icons, hidden from a screen reader, and marks the ones that point in a direction", () =>
    {
        for (const name of ["check", "circle", "cards", "clock", "map", "alert"] as const)
        {
            const drawn = icon(name);
            expect(drawn.getAttribute("aria-hidden"), name).toBe("true");
            expect(drawn.getAttribute("class"), name).toBe("icon");
            expect(drawn.querySelector("path")?.getAttribute("d"), name).toBeTruthy();
        }
        expect(icon("arrowBack").getAttribute("class")).toBe("icon icon-dir");
    });
});

describe("two texts for one place", () =>
{
    it("holds both texts, and shows and reads only the one that applies", () =>
    {
        const [first, second] = twoStepLabel("Cover the names", "Say the name", false);
        expect([first.className, second.className]).toEqual(["swap", "swap is-off"]);
        expect([first.hasAttribute("aria-hidden"), second.getAttribute("aria-hidden")]).toEqual([false, "true"]);
        expect([first.textContent, second.textContent]).toEqual(["Cover the names", "Say the name"]);
        const [off, on] = twoStepLabel("Cover the names", "Say the name", true);
        expect([off.className, on.className]).toEqual(["swap is-off", "swap"]);
        expect([off.getAttribute("aria-hidden"), on.hasAttribute("aria-hidden")]).toEqual(["true", false]);
    });
});

describe("bringing an item of a strip into view", () =>
{
    /** A strip from 20 to 300 on the screen, with one item in it. */
    function strip(left: number, right: number, scrolled = 0): { strip: HTMLElement; item: HTMLElement }
    {
        const row = document.createElement("div");
        const item = document.createElement("button");
        row.append(item);
        placeAt(row, 20, 300);
        placeAt(item, left, right);
        row.scrollLeft = scrolled;
        return { strip: row, item };
    }

    it("leaves a strip alone that shows the item whole", () =>
    {
        const { strip: row, item } = strip(40, 120, 15);
        revealInStrip(row, item);
        expect(row.scrollLeft).toBe(15);
        const edges = strip(20, 300, 15);
        revealInStrip(edges.strip, edges.item);
        expect(edges.strip.scrollLeft).toBe(15);
    });

    it("scrolls on by what sticks out at the right", () =>
    {
        const { strip: row, item } = strip(250, 340);
        revealInStrip(row, item);
        expect(row.scrollLeft).toBe(40);
    });

    it("scrolls back by what sticks out at the left", () =>
    {
        const { strip: row, item } = strip(-10, 80, 50);
        revealInStrip(row, item);
        expect(row.scrollLeft).toBe(20);
    });
});
