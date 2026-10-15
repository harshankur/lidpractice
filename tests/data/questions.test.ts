import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localeCodes, localeFile, readBundle, readLocale, readNeutral } from "../../scripts/lib/data.mjs";
import { REAL_FLAT } from "../helpers/questionData";

const bundle = readBundle();
const neutral = bundle.questions;
const german = bundle.locales.de;
const english = bundle.locales.en;
const questions = REAL_FLAT;

/** Every language of the question bank. The translations are unofficial. */
const CODES = localeCodes();
const TRANSLATIONS = CODES.filter((code) => code !== "de");

/** Number of general questions in the official catalogue. */
const GENERAL_COUNT = 300;

/** Number of state questions in the official catalogue: 10 for each of the 16 federal states. */
const STATE_COUNT = 160;

/** Question numbers that carry a picture. */
const PICTURE_NUMBERS = [21, 55, 70, 130, 176, 181, 187, 209, 216, 226, 235, ...Array.from({ length: 16 }, (_, state) => [301 + state * 10, 308 + state * 10]).flat()];

/**
 * Golden answer key: the index of the correct option for the 300 general questions. All languages keep the option order of the catalogue.
 * Change it only when the official catalogue or the source site changes, never to make a test pass.
 */
const GENERAL_ANSWER_KEY = "310223012302311030030232011211120210313101110002112033013131311330332333020332323322201020233113010010133311123101232322002210202021103122100101031321123122000103220333203321121312121001332310201002121111012231122010313303213112303203231112120031111130032311131000330322133133302211113021210220123010";

/**
 * Golden answer key of the 160 state questions (301 to 460), in the order of the catalogue. The booklet does not mark answers,
 * the key was worked out question by question, checked blind by an independent reviewer, and the coat of arms and map answers were checked against the pictures.
 */
const STATE_ANSWER_KEY = "0121121133132211333132211303320021120331211111002010211302110322103231212110123120211000311121132231002213003132221121313022101331332111223122211230313321121131";

/** The whole key. */
const ANSWER_KEY = `${GENERAL_ANSWER_KEY}${STATE_ANSWER_KEY}`;

/** Picture questions whose answers were verified visually against the official PDF. */
const VISUALLY_VERIFIED: Record<number, number> = {21: 0, 130: 0, 176: 2, 209: 3, 226: 1, 301: 0, 308: 1, 311: 1, 318: 3, 321: 3, 328: 3, 331: 0, 338: 3, 341: 2, 348: 0, 351: 1, 358: 2, 361: 0, 368: 2, 371: 2, 378: 2, 381: 2, 388: 0, 391: 1, 398: 2, 401: 0, 408: 0, 411: 3, 418: 1, 421: 3, 428: 3, 431: 3, 438: 2, 441: 2, 448: 0, 451: 3, 458: 1};

/** Photo credits and source notes the official catalogue prints under pictures, by language (see scripts/verify-catalogue.mjs). */
const CAPTIONS: Record<string, Record<number, string>> = {
    de: {
        55: "© Deutscher Bundestag/Achim Melde",
        70: "© Bundesregierung/Engelbert Reineke",
        130: "In Anlehnung an Bundeswahlordnung (BWO), Anlage 26",
        181: "© Bundesregierung/Engelbert Reineke",
        216: "© Deutscher Bundestag/Janine Schmitz",
        235: "© Bundesregierung/Richard Schulze-Vorberg",
    },
    en: {
        55: "© Deutscher Bundestag/Achim Melde",
        70: "© Bundesregierung/Engelbert Reineke",
        130: "Based on the Federal Election Regulations (Bundeswahlordnung, BWO), Annex 26",
        181: "© Bundesregierung/Engelbert Reineke",
        216: "© Deutscher Bundestag/Janine Schmitz",
        235: "© Bundesregierung/Richard Schulze-Vorberg",
    },
};

/** German function words that must not appear in English text, apart from German terms that are given in brackets or quotation marks. */
const GERMAN_WORDS = /(?<![\p{L}])(der|die|das|und|nicht|ist|eine|zum|zur|für|bei|wird|auf|mit)(?![\p{L}])/u;

/**
 * An English text without the German terms it quotes in brackets or in quotation marks, and without a name that has "von der" in it.
 * @param text English text.
 * @returns The text without those parts.
 */
function withoutQuotedGerman(text: string): string
{
    return text.replace(/von der Leyen/g, " ").replace(/\([^)]*\)/g, " ").replace(/"[^"]*"/g, " ").replace(/'[^']*'/g, " ");
}

/** Matches HTML tags. */
const HTML_TAG = /<\/?[a-z][^>]*>/i;

/** Every text of a question in a language file. */
function texts(entry: { q: string; a: string[]; cap?: string }): string[]
{
    return [entry.q, ...entry.a, ...(entry.cap === undefined ? [] : [entry.cap])];
}

describe("data/questions.json (the part that is the same in every language)", () =>
{
    it("holds 460 questions: 300 general plus 10 for each of the 16 federal states", () =>
    {
        expect(neutral).toHaveLength(GENERAL_COUNT + STATE_COUNT);
        expect(neutral.filter((entry) => entry.n <= GENERAL_COUNT)).toHaveLength(GENERAL_COUNT);
        expect(neutral.filter((entry) => entry.n > GENERAL_COUNT)).toHaveLength(STATE_COUNT);
    });

    it("is ordered so that index equals question number minus one", () =>
    {
        neutral.forEach((entry, index) =>
        {
            expect(entry.n, `entry at index ${index}`).toBe(index + 1);
        });
    });

    it("holds only the fields that do not depend on the language", () =>
    {
        for (const entry of neutral)
        {
            expect(Object.keys(entry), `Q${entry.n}`).toEqual(["n", "k", "r", "img", "pg"]);
            expect(typeof entry.k).toBe("string");
        }
    });

    it("points r at an existing option", () =>
    {
        for (const entry of neutral)
        {
            expect(Number.isInteger(entry.r), `Q${entry.n}`).toBe(true);
            expect(entry.r, `Q${entry.n}`).toBeGreaterThanOrEqual(0);
            expect(entry.r, `Q${entry.n}`).toBeLessThan(4);
        }
    });

    it("uses 29 categories (13 subjects and the 16 federal states), each with a readable id", () =>
    {
        const ids = new Set(neutral.map((entry) => entry.k));
        expect(ids.size).toBe(29);
        for (const id of ids)
        {
            expect(id, id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        }
    });
});

describe("one file per language (data/locales)", () =>
{
    it("exist for German and every other language, German first", () =>
    {
        expect(localeCodes()).toEqual(["de", "ar", "en", "es", "hi", "tr", "uk"]);
        expect(localeFile("de")).toBe("data/locales/questions.de.json");
    });

    it.each(CODES)("%s declares itself, and only German is official", (code) =>
    {
        const file = readLocale(code);
        expect(file.locale).toBe(code);
        expect(file.name.length).toBeGreaterThan(2);
        expect(file.official).toBe(code === "de");
    });

    it.each(TRANSLATIONS)("%s has every question of the neutral file too, in the same order", (code) =>
    {
        expect(readLocale(code).questions.map((entry) => entry.n)).toEqual(neutral.map((entry) => entry.n));
    });

    it.each(TRANSLATIONS)("%s writes numbers with the digits 0 to 9, in the text and in the interface", (code) =>
    {
        const other = /[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F]/;
        for (const entry of readLocale(code).questions)
        {
            for (const text of texts(entry))
            {
                expect(other.test(text), `${code} Q${entry.n}`).toBe(false);
            }
        }
    });

    it.each(TRANSLATIONS)("%s is a translation and not a copy of the German: most questions differ", (code) =>
    {
        const same = readLocale(code).questions.filter((entry, index) => entry.q === german.questions[index].q);
        expect(same.length, code).toBeLessThan(40);
    });

    it.each(TRANSLATIONS)("%s writes no long dashes", (code) =>
    {
        const longDash = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
        for (const entry of readLocale(code).questions)
        {
            for (const text of texts(entry))
            {
                expect(longDash.test(text), `${code} Q${entry.n}`).toBe(false);
            }
        }
    });

    it.each(TRANSLATIONS)("%s keeps the option order of the state questions: one German option text always has one translation", (code) =>
    {
        // The correct answer is a position shared by every language. The 160 state questions repeat the same options
        // (names, capitals, colours), so a moved option would give one German text two different translations.
        const strip = (text: string): string => text.replace(/\([^)]*\)/g, "").replace(/[\s.,;:!?"\u201C\u201D\u201E\u00AB\u00BB\u0964]+$/g, "").trim();
        const other = new Map(readLocale(code).questions.map((entry) => [entry.n, entry]));
        const seen = new Map<string, Set<string>>();
        for (const entry of german.questions.filter((candidate) => candidate.n > GENERAL_COUNT))
        {
            const translated = other.get(entry.n) as { a: string[] };
            for (let index = 0; index < 4; index++)
            {
                const key = strip(entry.a[index]);
                seen.set(key, (seen.get(key) ?? new Set()).add(strip(translated.a[index])));
            }
        }
        const inconsistent = [...seen.entries()].filter(([, translations]) => translations.size > 1).map(([text, translations]) => `${text}: ${[...translations].join(" | ")}`);
        expect(inconsistent, code).toEqual([]);
    });

    it("German has exactly the questions of the neutral file, in the same order", () =>
    {
        expect(german.questions.map((entry) => entry.n)).toEqual(neutral.map((entry) => entry.n));
    });

    it("English has every question of the neutral file too, in the same order", () =>
    {
        expect(english.questions.map((entry) => entry.n)).toEqual(neutral.map((entry) => entry.n));
    });

    it.each(CODES)("%s has four options for every question", (code) =>
    {
        for (const entry of readLocale(code).questions)
        {
            expect(entry.a, `Q${entry.n}`).toHaveLength(4);
        }
    });

    it.each(CODES)("%s has no empty text", (code) =>
    {
        for (const entry of readLocale(code).questions)
        {
            for (const text of texts(entry))
            {
                expect(typeof text, `Q${entry.n}`).toBe("string");
                expect(text.trim().length, `Q${entry.n}`).toBeGreaterThan(0);
            }
        }
    });

    it.each(CODES)("%s names every category, and only those", (code) =>
    {
        const file = readLocale(code);
        expect(Object.keys(file.categories).sort()).toEqual([...new Set(neutral.map((entry) => entry.k))].sort());
        expect(Object.values(file.categories).every((name) => name.trim().length > 0)).toBe(true);
    });

    it("name the categories differently in English and in German", () =>
    {
        const differing = Object.keys(german.categories).filter((id) => german.categories[id] !== english.categories[id]);
        expect(differing.length).toBeGreaterThanOrEqual(18);
    });

    it("have the credit or source note on exactly the same questions in every language, and only on pictures", () =>
    {
        for (const code of CODES)
        {
            const captioned = Object.fromEntries(readLocale(code).questions.filter((entry) => entry.cap !== undefined).map((entry) => [entry.n, entry.cap]));
            // The credits are names: the translations that were written by hand keep them in their own form (see CAPTIONS), the others copy the German ones.
            expect(captioned, code).toEqual(CAPTIONS[code] ?? CAPTIONS.de);
        }
        for (const number of Object.keys(CAPTIONS.de).map(Number))
        {
            expect(neutral[number - 1].img, `Q${number}`).not.toBeNull();
        }
    });

    it("contain no HTML markup, so text can be rendered safely", () =>
    {
        for (const code of CODES)
        {
            for (const entry of readLocale(code).questions)
            {
                for (const text of texts(entry))
                {
                    expect(HTML_TAG.test(text), `${code} Q${entry.n}: ${text}`).toBe(false);
                }
            }
        }
    });

    it("contain no web address, so nothing in the data can load from a third party", () =>
    {
        for (const file of ["data/questions.json", ...CODES.map((code) => localeFile(code))])
        {
            expect(readFileSync(file, "utf8"), file).not.toMatch(/https?:\/\//);
        }
    });

    it("keeps one question per line, so a change to one question is a change to one line", () =>
    {
        for (const file of ["data/questions.json", ...CODES.map((code) => localeFile(code))])
        {
            const lines = readFileSync(file, "utf8").split("\n");
            expect(lines.length, file).toBeGreaterThanOrEqual(310);
        }
        expect(readNeutral()).toHaveLength(460);
    });
});

describe("the German text (the official one)", () =>
{
    it("has no duplicate options within a question", () =>
    {
        for (const entry of german.questions)
        {
            expect(new Set(entry.a).size, `Q${entry.n}`).toBe(entry.a.length);
        }
    });
});

describe("the English text (an unofficial translation)", () =>
{
    it("has no duplicate options", () =>
    {
        const withDuplicates = english.questions
            .filter((entry) => new Set(entry.a).size !== entry.a.length)
            .map((entry) => entry.n);
        expect(withDuplicates).toEqual([]);
    });

    it("never repeats the German question text", () =>
    {
        const translated = new Set(english.questions.map((entry) => entry.n));
        expect(questions.filter((question) => translated.has(question.n) && question.qe.trim() === question.q.trim()).map((question) => question.n)).toEqual([]);
    });

    it("holds no untranslated German: no German function word outside brackets and quotation marks", () =>
    {
        const found = english.questions
            .filter((entry) => [entry.q, ...entry.a].some((text) => GERMAN_WORDS.test(withoutQuotedGerman(text))))
            .map((entry) => entry.n);
        expect(found).toEqual([]);
    });

    it("never copies the German options, except where an option is a name or a number that needs no translation", () =>
    {
        const copied = questions
            .filter((question) => question.ae.every((option, index) => option === question.a[index]))
            .map((question) => question.n);
        const NAMES_OR_NUMBERS = /^(\d+%?|[\p{Lu}][\p{L}\-. /]*)$/u;
        const unexplained = copied.filter((number) => !questions[number - 1].a.every((option) => NAMES_OR_NUMBERS.test(option)));
        expect(unexplained).toEqual([]);
    });

    it("keeps the same four options in the same order as the German text, so that one answer key serves both", () =>
    {
        for (const entry of english.questions)
        {
            expect(entry.a, `Q${entry.n}`).toHaveLength(german.questions[entry.n - 1].a.length);
        }
        expect(english.questions[0].a[3]).toBe("freedom of expression applies here.");
        expect(english.questions[23].a).toEqual(["14", "15", "16", "17"]);
    });
});

describe("pictures", () =>
{
    const withPicture = neutral.filter((entry) => entry.img !== null);

    it("are on exactly the documented 43 questions: 11 general ones, and tasks 1 and 8 of every federal state", () =>
    {
        expect(withPicture.map((entry) => entry.n)).toEqual(PICTURE_NUMBERS);
    });

    it("are files of this site named after the question number, never an address on another server", () =>
    {
        for (const entry of withPicture)
        {
            expect(entry.img, `Q${entry.n}`).toBe(`images/q-${String(entry.n).padStart(3, "0")}.webp`);
        }
    });
});

describe("golden answer key", () =>
{
    it("matches the verified answer key for all 460 questions", () =>
    {
        expect(neutral.map((entry) => entry.r).join("")).toBe(ANSWER_KEY);
    });

    it("keeps the answers of the visually verified picture questions", () =>
    {
        for (const [number, index] of Object.entries(VISUALLY_VERIFIED))
        {
            expect(neutral[Number(number) - 1].r, `Q${number}`).toBe(index);
        }
    });

    it("keeps the general key as it was verified", () =>
    {
        expect(neutral.slice(0, GENERAL_COUNT).map((entry) => entry.r).join("")).toBe(GENERAL_ANSWER_KEY);
        expect(neutral.slice(GENERAL_COUNT).map((entry) => entry.r).join("")).toBe(STATE_ANSWER_KEY);
    });

    it("points at the same option in the flat merged form", () =>
    {
        expect(questions.map((question) => question.r).join("")).toBe(ANSWER_KEY);
        expect(questions[0].a[questions[0].r]).toBe("hier Meinungsfreiheit gilt.");
        expect(questions[0].ae[questions[0].r]).toContain("freedom of expression");
    });
});
