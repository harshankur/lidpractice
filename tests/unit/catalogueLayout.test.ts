import { describe, expect, it } from "vitest";
import {
    CONTENT_TOP, FOOTER_TOP, PADDING, findHeadings, mergeRows, parseLayoutXml, planQuestions, plannedText,
} from "../../scripts/lib/catalogueLayout.mjs";

/**
 * Builds the text element pdftohtml writes for one piece of text.
 * @param top Distance from the top of the page.
 * @param left Distance from the left edge.
 * @param text Content.
 * @returns XML.
 */
function piece(top: number, left: number, text: string): string
{
    return `<text top="${top}" left="${left}" width="100" height="20" font="1">${text}</text>`;
}

/**
 * Builds one page of pdftohtml output.
 * @param number Page number.
 * @param pieces Text elements.
 * @returns XML of the page.
 */
function page(number: number, ...pieces: string[]): string
{
    return `<page number="${number}" position="absolute" top="0" left="0" height="1262" width="892">\n${pieces.join("\n")}\n</page>`;
}

/** Footer line of a page. */
function footer(number: number): string
{
    return piece(FOOTER_TOP, 685, `Seite ${number} von 191 `);
}

describe("parseLayoutXml", () =>
{
    it("reads pages, positions and text, and drops markup, glyphs and blank pieces", () =>
    {
        const xml = page(4, piece(207, 106, "<b>Aufgabe 7 </b>"), piece(336, 170, ""), piece(94, 106, " "), piece(255, 106, "Q &amp; A &quot;x&quot; &#228; &#xFC;"));
        const [parsed] = parseLayoutXml(xml);
        expect(parsed).toMatchObject({ number: 4, width: 892, height: 1262 });
        expect(parsed.lines).toEqual([
            { top: 207, left: 106, height: 20, text: "Aufgabe 7" },
            { top: 255, left: 106, height: 20, text: "Q & A \"x\" ä ü" },
        ]);
    });

    it("decodes the remaining entities", () =>
    {
        const [parsed] = parseLayoutXml(page(1, piece(10, 10, "&lt;a&gt; &apos;b&apos;")));
        expect(parsed.lines[0].text).toBe("<a> 'b'");
    });

    it("skips chunks that are not pages", () =>
    {
        expect(parseLayoutXml("<pdf2xml>nothing here</pdf2xml>")).toEqual([]);
        expect(parseLayoutXml("<page number=\"x\">broken")).toEqual([]);
    });
});

describe("mergeRows", () =>
{
    it("joins pieces on the same line from left to right", () =>
    {
        const rows = mergeRows([{ top: 207, left: 173, text: "16" }, { top: 207, left: 106, text: "Aufgabe" }, { top: 255, left: 106, text: "Frage" }]);
        expect(rows).toEqual([
            { top: 207, bottom: 207, left: 106, text: "Aufgabe 16" },
            { top: 255, bottom: 255, left: 106, text: "Frage" },
        ]);
        expect(mergeRows([{ top: 10, left: 0, height: 20, text: "a" }, { top: 12, left: 50, height: 30, text: "b" }])[0].bottom).toBe(42);
    });

    it("treats tops a few units apart as the same line, but not tops far apart", () =>
    {
        expect(mergeRows([{ top: 100, left: 0, text: "a" }, { top: 103, left: 50, text: "b" }]).map((row) => row.text)).toEqual(["a b"]);
        expect(mergeRows([{ top: 100, left: 0, text: "a" }, { top: 104, left: 50, text: "b" }])).toHaveLength(2);
    });
});

describe("findHeadings", () =>
{
    const pages = parseLayoutXml([
        page(2, piece(210, 106, "Teil I"), piece(311, 106, "Aufgabe 1"), piece(700, 106, "Aufgabe"), piece(700, 173, "2"), footer(2)),
        page(3, piece(207, 106, "Aufgabe 300"), footer(3)),
        page(4, piece(207, 106, "Teil II"), piece(250, 106, "Fragen für das Bundesland Baden-Württemberg"), piece(308, 106, "Aufgabe 1"), footer(4)),
        page(5, piece(207, 106, "Fragen für das Bundesland Berlin"), piece(308, 106, "Aufgabe 1"), piece(600, 106, "Aufgabe 10"), footer(5)),
        page(6, piece(207, 106, "Fragen für das Bundesland Brandenburg"), piece(308, 106, "Aufgabe 1"), footer(6)),
    ].join("\n"));

    it("numbers general tasks as they are and the tasks of each state from 301, in the order of the catalogue", () =>
    {
        expect(findHeadings(pages).map((heading) => heading.number)).toEqual([1, 2, 300, 301, 321, 330, 331]);
    });

    it("gives a heading in a section of an unknown state no number, so it only bounds its neighbour", () =>
    {
        const unknown = parseLayoutXml([page(2, piece(207, 106, "Fragen für das Bundesland Atlantis"), piece(308, 106, "Aufgabe 1"), footer(2))].join("\n"));
        expect(findHeadings(unknown).map((heading) => heading.number)).toEqual([null]);
    });

    it("finds headings that the PDF splits into two pieces", () =>
    {
        expect(findHeadings(pages)[1]).toEqual({ number: 2, page: 2, top: 700 });
    });
});

describe("planQuestions", () =>
{
    it("cuts a question from its heading to the next heading on the same page", () =>
    {
        const pages = parseLayoutXml([page(2, piece(207, 106, "Aufgabe 1"), piece(255, 106, "Frage"), piece(500, 106, "Aufgabe 2"), piece(548, 106, "Frage 2"), footer(2))].join("\n"));
        const plan = planQuestions(pages);
        expect(plan.get(1)).toEqual({ page: 2, pieces: [{ page: 2, top: 207 - PADDING, bottom: 500 - PADDING }] });
        expect(plan.get(2)?.pieces).toEqual([{ page: 2, top: 500 - PADDING, bottom: FOOTER_TOP }]);
    });

    it("never goes above the page for a heading near the top", () =>
    {
        const pages = parseLayoutXml(page(2, piece(5, 106, "Aufgabe 1"), footer(2)));
        expect(planQuestions(pages).get(1)?.pieces[0].top).toBe(0);
    });

    it("follows a question onto the next page up to the next heading", () =>
    {
        const pages = parseLayoutXml([
            page(2, piece(900, 106, "Aufgabe 1"), piece(950, 106, "Frage"), footer(2)),
            page(3, piece(CONTENT_TOP, 214, "letzte Antwort"), piece(400, 106, "Aufgabe 2"), footer(3)),
        ].join("\n"));
        const plan = planQuestions(pages);
        expect(plan.get(1)?.pieces).toEqual([
            { page: 2, top: 900 - PADDING, bottom: FOOTER_TOP },
            { page: 3, top: CONTENT_TOP - PADDING, bottom: 400 - PADDING },
        ]);
        expect(plannedText(pages, plan.get(1) as NonNullable<ReturnType<typeof plan.get>>, 1)).toBe("Frageletzte" + "Antwort");
    });

    it("includes whole pages in between that continue the question", () =>
    {
        const pages = parseLayoutXml([
            page(2, piece(900, 106, "Aufgabe 1"), footer(2)),
            page(3, piece(300, 214, "mittendrin"), footer(3)),
            page(4, piece(400, 106, "Aufgabe 2"), footer(4)),
        ].join("\n"));
        expect(planQuestions(pages).get(1)?.pieces.map((entry) => entry.page)).toEqual([2, 3]);
    });

    it("does not treat a section title at the top of the next page as a continuation", () =>
    {
        const pages = parseLayoutXml([
            page(2, piece(900, 106, "Aufgabe 300"), footer(2)),
            page(3, piece(210, 106, "Teil II"), piece(250, 106, "Fragen für das Bundesland Baden-Württemberg"), piece(308, 106, "Aufgabe 1"), footer(3)),
        ].join("\n"));
        expect(planQuestions(pages).get(300)?.pieces).toEqual([{ page: 2, top: 900 - PADDING, bottom: FOOTER_TOP }]);
    });

    it("runs the last question of the document to the footer", () =>
    {
        const pages = parseLayoutXml(page(2, piece(207, 106, "Aufgabe 1"), footer(2)));
        expect(planQuestions(pages).get(1)?.pieces).toEqual([{ page: 2, top: 207 - PADDING, bottom: FOOTER_TOP }]);
    });
});

describe("plannedText", () =>
{
    const pages = parseLayoutXml(page(
        2,
        piece(207, 106, "Aufgabe 21"),
        piece(255, 106, "Welches ist das Wappen?"),
        piece(488, 106, "Bild 1"), piece(488, 300, "Bild 2"), piece(488, 500, "Bild 3"), piece(488, 700, "Bild 4"),
        piece(539, 214, "Bild 1"), piece(571, 214, "Bild 2"),
        piece(600, 106, "© Foto/Person"),
        piece(704, 106, "Aufgabe 22"),
        footer(2),
    ));

    it("keeps the question and options but drops the heading, the picture caption row and the credit", () =>
    {
        const entry = planQuestions(pages).get(21) as NonNullable<ReturnType<ReturnType<typeof planQuestions>["get"]>>;
        expect(plannedText(pages, entry, 21)).toBe("Welchesistdas" + "Wappen?Bild1Bild2");
    });

    it("drops a question number that the catalogue prints in front of the text", () =>
    {
        const numbered = parseLayoutXml(page(2, piece(207, 106, "Aufgabe 184"), piece(255, 106, "184. Auf welche Grundlage?"), footer(2)));
        const entry = planQuestions(numbered).get(184) as NonNullable<ReturnType<ReturnType<typeof planQuestions>["get"]>>;
        expect(plannedText(numbered, entry, 184)).toBe("AufwelcheGrundlage?");
    });

    it("compares questions of a state by their task number", () =>
    {
        const berlin = parseLayoutXml(page(2, piece(207, 106, "Fragen für das Bundesland Berlin"), piece(308, 106, "Aufgabe 2"), piece(355, 106, "2. Welches ist bezirk?"), footer(2)));
        const entry = planQuestions(berlin).get(322) as NonNullable<ReturnType<ReturnType<typeof planQuestions>["get"]>>;
        expect(plannedText(berlin, entry, 322)).toBe("Welchesistbezirk?");
    });
});
