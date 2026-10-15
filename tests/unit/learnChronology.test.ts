// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { i18n } from "../../src/i18n";
import { CHRONO_GAP_MIN, eraChip, eraGroup, eraNote, eraYears, formatWhen, renderChronology, renderEraLegend } from "../../src/learn/chronology";
import { CourseBook } from "../../src/learn/course";
import { registerAllCatalogs } from "../helpers/catalogs";
import { courseFile, courseTexts, stateFacts } from "../helpers/courseFixture";

beforeAll(() => registerAllCatalogs());

afterEach(() => i18n.setLocale("en"));

const book = new CourseBook(courseFile(), courseTexts(), stateFacts());

/**
 * Draws the whole timeline of the small course.
 * @param hidden Whether the dates are covered.
 * @param revealed The events whose date was uncovered.
 * @param onReveal Called with the event whose date is asked for.
 * @returns The list.
 */
function draw(hidden = false, revealed: string[] = [], onReveal: (id: string) => void = () => undefined): HTMLElement
{
    return renderChronology(book.events, book.eras, { id: "tl", hidden, revealed: new Set(revealed), onReveal });
}

describe("the dates of the timeline", () =>
{
    it("are written in the language of the site, day first in English as in Germany", () =>
    {
        expect(formatWhen({ date: "1945-05-08" })).toBe("8 May 1945");
        i18n.setLocale("de");
        expect(formatWhen({ date: "1945-05-08" })).toBe("8. Mai 1945");
        i18n.setLocale("es");
        expect(formatWhen({ date: "1990-10-03" })).toBe("3 de octubre de 1990");
    });

    it("keep Western digits in Arabic and Hindi, as everywhere on the page", () =>
    {
        for (const code of ["ar", "hi"] as const)
        {
            i18n.setLocale(code);
            const text = formatWhen({ date: "1989-11-09" });
            expect(text, code).toMatch(/9/);
            expect(text, code).toMatch(/1989/);
            expect(text, code).not.toMatch(/[٠-٩०-९]/);
        }
    });

    it("show a year, two years or a decade as the course has it, and the wording of the texts where there is one", () =>
    {
        expect(formatWhen({ date: "1949" })).toBe("1949");
        expect(formatWhen({ date: "1948/1949" })).toBe("1948/1949");
        expect(formatWhen({ date: "1950s", when: "the 1950s" })).toBe("the 1950s");
        expect(formatWhen({ date: "1989-11-09", when: "autumn 1989" })).toBe("autumn 1989");
    });

    it("name the years of an era: a span, or since a year for the one that goes on", () =>
    {
        expect(eraYears({ from: 1933, to: 1945 })).toBe("1933 to 1945");
        expect(eraYears({ from: 1990, to: null })).toBe("since 1990");
    });
});

describe("the eras", () =>
{
    it("fall into four stretches of time: west and east are the two halves of the division", () =>
    {
        expect((["ns", "occupation", "west", "east", "unity"] as const).map((era) => eraGroup(era))).toEqual(["ns", "occupation", "division", "division", "unity"]);
    });

    it("have a name tag with a swatch for the colour and pattern, and the German name", () =>
    {
        const chip = eraChip(book.eras[0]);
        expect(chip.className).toBe("era-chip era-ns");
        expect(chip.querySelector(".era-swatch")?.getAttribute("aria-hidden")).toBe("true");
        const name = chip.querySelector(".era-name") as HTMLElement;
        expect(name.textContent).toBe("NS-Diktatur");
        expect(name.lang).toBe("de");
    });

    it("are listed as a key, each with its name in the language of the site and its years", () =>
    {
        const legend = renderEraLegend(book.eras);
        expect(legend.getAttribute("aria-label")).toBe("The eras");
        expect(Array.from(legend.querySelectorAll("li")).map((item) => item.querySelector(".era-note")?.textContent)).toEqual([
            "Nazi dictatorship, 1933 to 1945", "Federal Republic (West), 1949 to 1990", "GDR (East), 1949 to 1990", "United Germany, since 1990",
        ]);
        expect(legend.querySelectorAll(".era-chip")).toHaveLength(4);
    });

    it("do not say a name twice where the name of the site's language is the German name", () =>
    {
        const [ns, west, east] = book.eras;
        expect(eraNote([{ ...west, text: west.term }])).toBe("1949 to 1990");
        expect(eraNote([ns])).toBe("Nazi dictatorship, 1933 to 1945");
        expect(eraNote([west, east])).toBe("Federal Republic (West) / GDR (East), 1949 to 1990");
        expect(eraNote([{ ...west, text: west.term }, east])).toBe("GDR (East), 1949 to 1990");
    });
});

describe("the timeline", () =>
{
    it("lists every event in the order of time, with its date, its German name and its text", () =>
    {
        const rows = Array.from(draw().querySelectorAll<HTMLElement>(".chrono-row"));
        expect(rows.map((row) => row.id)).toEqual(["tl-machtergreifung", "tl-gruendung-brd", "tl-gruendung-ddr", "tl-mauer", "tl-einheit", "tl-euro"]);
        expect(rows.map((row) => row.querySelector(".chrono-date")?.textContent)).toEqual(["1933", "1949", "1949", "1961", "3 October 1990", "since 2002"]);
        const first = rows[0];
        expect(first.querySelector(".chrono-term")?.textContent).toBe("Hitler wird Reichskanzler");
        expect((first.querySelector(".chrono-term") as HTMLElement).lang).toBe("de");
        // The text keeps its markup: a German word inside it is an element of its own.
        expect(first.querySelector(".chrono-text")?.textContent).toBe("Hitler becomes Reichskanzler.");
        expect(first.querySelector(".chrono-text .de-term")?.textContent).toBe("Reichskanzler");
    });

    it("opens every stretch of time with a heading that names its eras, and the division with both of its halves", () =>
    {
        const headings = Array.from(draw().querySelectorAll<HTMLElement>(".chrono-era"));
        expect(headings.map((heading) => heading.className)).toEqual(["chrono-era group-ns", "chrono-era group-division", "chrono-era group-unity"]);
        expect(headings.map((heading) => Array.from(heading.querySelectorAll(".era-name")).map((name) => name.textContent))).toEqual([
            ["NS-Diktatur"], ["Bundesrepublik (West)", "DDR (Ost)"], ["Vereintes Deutschland"],
        ]);
        expect(headings[1].querySelector(".era-note")?.textContent).toBe("Federal Republic (West) / GDR (East), 1949 to 1990");
    });

    it("marks every row with its era, and gives each row the two stripes of the rail and a dot", () =>
    {
        const rows = Array.from(draw().querySelectorAll<HTMLElement>(".chrono-row"));
        expect(rows.map((row) => row.className)).toEqual([
            "chrono-row group-ns era-ns", "chrono-row group-division era-west", "chrono-row group-division era-east", "chrono-row group-division era-east",
            "chrono-row group-unity era-unity", "chrono-row group-unity era-unity",
        ]);
        for (const row of rows)
        {
            const rail = row.querySelector(".chrono-rail") as HTMLElement;
            expect(rail.getAttribute("aria-hidden")).toBe("true");
            expect(Array.from(rail.children).map((part) => part.className)).toEqual(["rail-west", "rail-east", "rail-dot"]);
        }
    });

    it("says in words on which side an event of the division happened, and marks a step of Europe", () =>
    {
        const tags = Array.from(draw().querySelectorAll<HTMLElement>(".chrono-row")).map((row) => Array.from(row.querySelectorAll(".chrono-tags .tag")).map((tag) => tag.textContent));
        expect(tags).toEqual([[], ["West"], ["East"], ["East"], [], ["Europe"]]);
        expect(draw().querySelector("#tl-gruendung-ddr .side-tag")?.className).toBe("tag side-tag era-east");
        expect(draw().querySelector("#tl-euro .europe-tag")).not.toBeNull();
    });

    it("notes the years between two events of one stretch when they are three or more, and nothing across a heading", () =>
    {
        expect(CHRONO_GAP_MIN).toBe(3);
        const list = draw();
        const order = Array.from(list.children).map((item) => (item.classList.contains("chrono-gap") ? `gap: ${item.querySelector(".chrono-gap-text")?.textContent}` : item.id || "heading"));
        expect(order).toEqual([
            "heading", "tl-machtergreifung",
            "heading", "tl-gruendung-brd", "tl-gruendung-ddr", "gap: 12 years later", "tl-mauer",
            "heading", "tl-einheit", "gap: 12 years later", "tl-euro",
        ]);
        expect(list.querySelector(".chrono-gap")?.className).toBe("chrono-gap group-division");
    });

    it("leaves no note for a gap of two years, and writes one year in the singular form of the language", () =>
    {
        const events = [
            { ...book.events[0], id: "a", year: 1933 },
            { ...book.events[0], id: "b", year: 1935 },
            { ...book.events[0], id: "c", year: 1938 },
        ];
        const list = renderChronology(events, book.eras, { id: "x", hidden: false, revealed: new Set(), onReveal: () => undefined });
        expect(Array.from(list.querySelectorAll(".chrono-gap-text")).map((gap) => gap.textContent)).toEqual(["3 years later"]);
        expect(i18n.plural("learn.chrono.gap", 1)).toBe("1 year later");
    });

    it("shows every date and no button while the dates are not covered", () =>
    {
        const list = draw();
        expect(list.querySelector(".chrono-show")).toBeNull();
        expect(list.querySelector(".chrono-date.is-off")).toBeNull();
        expect(Array.from(list.querySelectorAll(".chrono-date")).every((date) => !date.hasAttribute("aria-hidden"))).toBe(true);
    });

    it("covers every date when asked: the date keeps its room, and a button over it uncovers it", () =>
    {
        const asked: string[] = [];
        const list = draw(true, [], (id) => asked.push(id));
        const dates = Array.from(list.querySelectorAll<HTMLElement>(".chrono-date"));
        expect(dates).toHaveLength(6);
        // The text of the date is still there, so the row has the size it will have: it is only not painted and not read.
        expect(dates.every((date) => date.classList.contains("is-off") && date.getAttribute("aria-hidden") === "true" && date.textContent !== "")).toBe(true);
        const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>(".chrono-show"));
        expect(buttons.map((button) => button.id)).toEqual(["tl-show-machtergreifung", "tl-show-gruendung-brd", "tl-show-gruendung-ddr", "tl-show-mauer", "tl-show-einheit", "tl-show-euro"]);
        expect(buttons[4].textContent).toBe("?");
        expect(buttons[4].getAttribute("aria-label")).toBe("Show the date of: Deutsche Einheit");
        buttons[4].click();
        expect(asked).toEqual(["einheit"]);
    });

    it("shows a date that was uncovered and keeps the others covered", () =>
    {
        const list = draw(true, ["einheit"]);
        expect(list.querySelector("#tl-einheit .chrono-date")?.className).toBe("chrono-date");
        expect(list.querySelector("#tl-einheit .chrono-show")).toBeNull();
        expect(list.querySelector("#tl-euro .chrono-date")?.className).toBe("chrono-date is-off");
        expect(list.querySelectorAll(".chrono-show")).toHaveLength(5);
    });

    it("draws an excerpt with only the events it is given", () =>
    {
        const excerpt = renderChronology(book.events.filter((event) => ["machtergreifung", "einheit"].includes(event.id)), book.eras, { id: "tl-zeit", hidden: false, revealed: new Set(), onReveal: () => undefined });
        expect(Array.from(excerpt.querySelectorAll(".chrono-row")).map((row) => row.id)).toEqual(["tl-zeit-machtergreifung", "tl-zeit-einheit"]);
        expect(excerpt.querySelectorAll(".chrono-era")).toHaveLength(2);
        expect(excerpt.querySelector(".chrono-gap")).toBeNull();
        expect(renderChronology([], book.eras, { id: "none", hidden: false, revealed: new Set(), onReveal: () => undefined }).children).toHaveLength(0);
    });
});
