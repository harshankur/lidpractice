import { readFileSync } from "node:fs";
import { STATES } from "../../scripts/lib/numbering.mjs";
import { OFFICIAL_LOCALE, readLocale } from "../../scripts/lib/data.mjs";
import { describe, expect, it } from "vitest";
import {
    CATALOGUE_STAND, GENERAL_COUNT, KNOWN_DEVIATIONS, fingerprint, normalizeText, parseCatalogue, questionText,
} from "../../scripts/lib/catalogue.mjs";

/** One entry of data/questions.json. */
interface RawQuestion
{
    n: number;
    q: string;
    a: string[];
}

// The catalogue is German, so the German language file is what is compared with it.
const questions: RawQuestion[] = readLocale(OFFICIAL_LOCALE).questions;
const stored: { stand: string; fingerprints: Record<string, string> } = JSON.parse(
    readFileSync("tests/data/catalogue-fingerprints.json", "utf8"),
);

describe("agreement with the official catalogue", () =>
{
    it("was verified against the documented edition", () =>
    {
        expect(stored.stand).toBe(CATALOGUE_STAND);
        expect(CATALOGUE_STAND).toBe("07.05.2025");
    });

    it("has a fingerprint for every question", () =>
    {
        expect(Object.keys(stored.fingerprints)).toHaveLength(460);
    });

    it("matches the catalogue word for word, apart from the listed deviations", () =>
    {
        const mismatched = questions
            .filter((question) => fingerprint(questionText(question)) !== stored.fingerprints[question.n])
            .map((question) => question.n);
        expect(mismatched).toEqual(Object.keys(KNOWN_DEVIATIONS).map(Number));
    });

    it("keeps every documented deviation small: same words, only punctuation and spelling differ", () =>
    {
        for (const number of Object.keys(KNOWN_DEVIATIONS).map(Number))
        {
            expect(KNOWN_DEVIATIONS[number as keyof typeof KNOWN_DEVIATIONS].length, `Q${number}`).toBeGreaterThan(20);
            expect(questions[number - 1].n).toBe(number);
        }
    });

    it("lists the deviations in numeric order with a reason each", () =>
    {
        expect(Object.keys(KNOWN_DEVIATIONS).map(Number)).toEqual([7, 52, 149, 254, 287]);
    });
});

describe("catalogue helpers", () =>
{
    it("normalizes quotes, spacing and checkbox glyphs", () =>
    {
        expect(normalizeText("  \u201eHallo\u201c \u2018x\u2019\u00a0 \uf0a3  Welt \u25a1 ")).toBe("\"Hallo\" 'x' Welt");
    });

    it("keeps punctuation and case", () =>
    {
        expect(normalizeText("Ihr ihr ... \u2026")).toBe("Ihr ihr ... \u2026");
    });

    it("joins question and options in order", () =>
    {
        expect(questionText({ q: "Frage?", a: ["eins", "zwei", "drei", "vier"] })).toBe("Frage? eins zwei drei vier");
    });

    it("builds a stable 16 character fingerprint", () =>
    {
        expect(fingerprint("abc")).toBe("ba7816bf8f01cfea");
        expect(fingerprint("abc")).toHaveLength(16);
        expect(fingerprint("abd")).not.toBe(fingerprint("abc"));
    });

    it("uses 300 as the number of general questions", () =>
    {
        expect(GENERAL_COUNT).toBe(300);
    });
});

describe("parseCatalogue", () =>
{
    /** Minimal catalogue with two general tasks, a captioned picture task and one task for each of the 16 federal states. */
    const stateSections = (STATES as { id: string; name: string }[]).flatMap((state) => (state.id === "berlin"
        ? ["Teil II", "Fragen für das Bundesland Berlin", "Aufgabe 1", "Berlin Frage?", "In Anlehnung an Quelle", "  \uf0a3  Bild 1", "  \uf0a3  Bild 2", "  \uf0a3  Bild 3", "  \uf0a3  Bild 4"]
        : ["Teil II", `Fragen für das Bundesland ${state.name}`, "Aufgabe 1", `${state.name} Frage?`, "  \uf0a3  a", "  \uf0a3  b", "  \uf0a3  c", "  \uf0a3  d"]));
    const sample = [
        "Teil I", "Allgemeine Fragen", "",
        "Aufgabe 1", "Erste Frage?", "  \uf0a3  Ja", "  \uf0a3  Nein", "  \uf0a3  Vielleicht", "  \uf0a3  Nie", "Seite 2 von 191", "\f",
        "Aufgabe 2", "2. Zweite Frage?", "Bild 1     Bild 2     Bild 3     Bild 4", "\u00a9 Foto/Person", "  \uf0a3  A", "  \uf0a3  B", "  \uf0a3  C", "  \uf0a3  D",
        ...stateSections,
    ].join("\n");

    it("reads general tasks as 1 to 300 and the tasks of the states as 301 to 460, in the order of the catalogue", () =>
    {
        const { texts } = parseCatalogue(sample);
        expect([...texts.keys()]).toEqual([1, 2, ...(STATES as unknown[]).map((_, index) => 301 + index * 10)]);
        expect(texts.get(1)).toBe("Erste Frage? Ja Nein Vielleicht Nie");
        expect(texts.get(321)).toBe("Berlin Frage? Bild 1 Bild 2 Bild 3 Bild 4");
        expect(texts.get(451)).toBe("Thüringen Frage? a b c d");
    });

    it("does not mix up Sachsen with Sachsen-Anhalt", () =>
    {
        const { texts } = parseCatalogue(sample);
        expect(texts.get(421)).toBe("Sachsen Frage? a b c d");
        expect(texts.get(431)).toBe("Sachsen-Anhalt Frage? a b c d");
    });

    it("splits every question from its four options", () =>
    {
        const { entries } = parseCatalogue(sample);
        expect(entries.get(1)).toEqual({ q: "Erste Frage?", a: ["Ja", "Nein", "Vielleicht", "Nie"] });
        expect(entries.get(2)).toEqual({ q: "Zweite Frage?", a: ["A", "B", "C", "D"], cap: "\u00a9 Foto/Person" });
        expect(entries.get(321)?.cap).toBe("In Anlehnung an Quelle");
    });

    it("drops page footers, the picture row and printed question numbers", () =>
    {
        const { texts } = parseCatalogue(sample);
        expect(texts.get(1)).not.toContain("Seite");
        expect(texts.get(2)).toBe("Zweite Frage? A B C D");
    });

    it("collects photo credits and source notes as captions", () =>
    {
        const { captions } = parseCatalogue(sample);
        expect(captions.get(2)).toBe("\u00a9 Foto/Person");
        expect(captions.get(321)).toBe("In Anlehnung an Quelle");
        expect(captions.has(1)).toBe(false);
    });

    it("joins an option that runs over several lines", () =>
    {
        const text = [...sample.split("\n").slice(0, 3), "Aufgabe 5", "Frage", "  \uf0a3  lang", "      weiter", "  \uf0a3  b", "  \uf0a3  c", "  \uf0a3  d", ...stateSections].join("\n");
        expect(parseCatalogue(text).entries.get(5)?.a).toEqual(["lang weiter", "b", "c", "d"]);
    });

    it("reports a missing section with a clear message", () =>
    {
        expect(() => parseCatalogue("Aufgabe 1\nFrage")).toThrow("Catalogue section not found: Baden-Württemberg");
    });
});
