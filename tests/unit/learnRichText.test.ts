// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { COMPOUND_DOT, germanSpan, parseRich, plainText, richNodes, termNode } from "../../src/learn/richText";

describe("the markup of the course texts", () =>
{
    it("splits a text into plain, German and strong pieces, in reading order", () =>
    {
        expect(parseRich("The {{Grundgesetz}} is **not** a law like others.")).toEqual([
            { kind: "plain", text: "The " },
            { kind: "german", text: "Grundgesetz" },
            { kind: "plain", text: " is " },
            { kind: "strong", text: "not" },
            { kind: "plain", text: " a law like others." },
        ]);
    });

    it("takes a text without markup as one plain piece, and an empty text as nothing", () =>
    {
        expect(parseRich("Nothing special.")).toEqual([{ kind: "plain", text: "Nothing special." }]);
        expect(parseRich("")).toEqual([]);
    });

    it("handles marked text at the start, at the end and side by side", () =>
    {
        expect(parseRich("{{Bund}}{{Land}}")).toEqual([{ kind: "german", text: "Bund" }, { kind: "german", text: "Land" }]);
        expect(parseRich("**never** {{Zensur}}")).toEqual([{ kind: "strong", text: "never" }, { kind: "plain", text: " " }, { kind: "german", text: "Zensur" }]);
    });

    it("keeps markup that is not closed as plain text, and a placeholder in single braces too", () =>
    {
        expect(parseRich("an open {{brace and one * star")).toEqual([{ kind: "plain", text: "an open {{brace and one * star" }]);
        expect(parseRich("{state}: 5")).toEqual([{ kind: "plain", text: "{state}: 5" }]);
    });

    it("gives the words alone for a place that takes plain text", () =>
    {
        expect(plainText("The {{Bundestag}} is **not** the government.")).toBe("The Bundestag is not the government.");
        expect(plainText("plain")).toBe("plain");
    });
});

describe("German words on the page", () =>
{
    it("are elements that name their language and keep their direction", () =>
    {
        const span = germanSpan("die Würde");
        expect(span.tagName).toBe("SPAN");
        expect(span.lang).toBe("de");
        expect(span.dir).toBe("ltr");
        expect(span.className).toBe("de-term");
        expect(span.textContent).toBe("die Würde");
        expect(germanSpan("Berlin", "map-term").className).toBe("map-term");
    });

    it("come out of a text as elements, between text nodes, with strong words as strong elements", () =>
    {
        const nodes = richNodes("The {{Bundesrat}} is **not** elected.");
        expect(nodes.map((node) => node.nodeName)).toEqual(["#text", "SPAN", "#text", "STRONG", "#text"]);
        expect((nodes[1] as HTMLElement).lang).toBe("de");
        expect(nodes[3].textContent).toBe("not");
        expect(nodes.map((node) => node.textContent).join("")).toBe("The Bundesrat is not elected.");
    });

    it("never turn text into markup: a tag in a text stays text", () =>
    {
        const holder = document.createElement("p");
        holder.append(...richNodes("<img src=x onerror=alert(1)> {{<b>fett</b>}} **<i>x</i>**"));
        expect(holder.querySelector("img, b, i")).toBeNull();
        expect(holder.textContent).toBe("<img src=x onerror=alert(1)> <b>fett</b> <i>x</i>");
    });

    it("show the joins of a compound with a mark that a screen reader does not read", () =>
    {
        const term = termNode(`das Bundes${COMPOUND_DOT}verfassungs${COMPOUND_DOT}gericht`);
        expect(term.className).toBe("term-word");
        expect(term.lang).toBe("de");
        expect(term.getAttribute("aria-label")).toBe("das Bundesverfassungsgericht");
        const dots = term.querySelectorAll(".term-dot");
        expect(dots).toHaveLength(2);
        expect(Array.from(dots).every((dot) => dot.getAttribute("aria-hidden") === "true" && dot.textContent === COMPOUND_DOT)).toBe(true);
        expect(term.textContent).toBe(`das Bundes${COMPOUND_DOT}verfassungs${COMPOUND_DOT}gericht`);
    });

    it("show a word without joins as it is", () =>
    {
        const term = termNode("der Bund");
        expect(term.querySelector(".term-dot")).toBeNull();
        expect(term.textContent).toBe("der Bund");
        expect(term.getAttribute("aria-label")).toBe("der Bund");
    });
});
