import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localeCodes } from "../../scripts/lib/data.mjs";
import { LOCALES } from "../../src/types";

/** The language files of the interface. German is the base language. */
const FOLDER = "src/locales";
const BASE = "de";
const catalogs: Record<string, Record<string, string>> = Object.fromEntries(
    readdirSync(FOLDER).filter((name) => name.endsWith(".json")).map((name) => [name.replace(/\.json$/, ""), JSON.parse(readFileSync(`${FOLDER}/${name}`, "utf8"))]),
);

/**
 * Lists every TypeScript file below a folder.
 * @param folder The folder.
 * @returns The paths.
 */
function sourceFiles(folder: string): string[]
{
    return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory()
        ? sourceFiles(`${folder}/${entry.name}`)
        : (entry.name.endsWith(".ts") ? [`${folder}/${entry.name}`] : [])));
}

/** The source files whose code asks for messages, in src and in the folders below it. */
const SOURCE_FILES = sourceFiles("src");
const SOURCE = SOURCE_FILES.map((file) => readFileSync(file, "utf8")).join("\n");

/** The build reads two messages straight from the file: the page description and the text for visitors without JavaScript. */
const BUILD_FILES = ["build.mjs", "scripts/generate-icons.mjs"].map((file) => readFileSync(file, "utf8")).join("\n");

/** Every shape in which the code names a key: t("key"), i18n.t("key"), plural("key"), rich("key"), msg("key"). */
const KEY_CALLS = /\b(?:t|plural|rich|msg)\(\s*"([a-zA-Z0-9.]+)"/g;

/** Keys that are asked for as `base` and exist as `base.one` and `base.other`. */
const PLURAL_CALLS = /\bplural\(\s*"([a-zA-Z0-9.]+)"/g;

/** The plural forms a language may have beyond "one" and "other". */
const EXTRA_FORMS = ["zero", "two", "few", "many"];

/** Placeholders and link ids inside a message. */
const PLACEHOLDERS = /\{(\w+)\}/g;
const LINK_IDS = /\]\(([A-Za-z0-9-]+)\)/g;

/** Minimum number of keys the scan must find, so a broken pattern cannot pass by finding nothing. */
const MINIMUM_USED_KEYS = 120;

const used = new Set([...SOURCE.matchAll(KEY_CALLS)].map((match) => match[1]));
const pluralBases = new Set([...SOURCE.matchAll(PLURAL_CALLS)].map((match) => match[1]));

/** Sorted placeholders of a message. */
function placeholders(text: string): string[]
{
    return [...text.matchAll(PLACEHOLDERS)].map((match) => match[1]).sort();
}

/** Sorted link ids of a message. */
function linkIds(text: string): string[]
{
    return [...text.matchAll(LINK_IDS)].map((match) => match[1]).sort();
}

describe("interface language files", () =>
{
    it("exist for exactly the languages the app supports, and German is the base", () =>
    {
        expect(Object.keys(catalogs).sort()).toEqual([...LOCALES].sort());
        expect(LOCALES[0]).toBe(BASE);
    });

    it("cover the same languages as the question bank", () =>
    {
        expect(localeCodes().sort()).toEqual([...LOCALES].sort());
    });

    it("scans enough of the source to be trusted", () =>
    {
        expect(used.size).toBeGreaterThan(MINIMUM_USED_KEYS);
        expect(pluralBases.has("exam.unanswered")).toBe(true);
        expect(SOURCE_FILES.length).toBeGreaterThan(8);
        expect(SOURCE_FILES).toContain("src/learn/learn.ts");
        expect(used.has("learn.home.title")).toBe(true);
        expect(pluralBases.has("learn.chrono.gap")).toBe(true);
    });

    it("has every key the code uses in the base language", () =>
    {
        const missing = [...used].filter((key) => !(key in catalogs[BASE]) && !pluralBases.has(key));
        expect(missing).toEqual([]);
    });

    it("has both plural forms for every key that is used as a plural", () =>
    {
        for (const base of pluralBases)
        {
            for (const code of Object.keys(catalogs))
            {
                expect(catalogs[code][`${base}.one`], `${code} ${base}.one`).toBeTruthy();
                expect(catalogs[code][`${base}.other`], `${code} ${base}.other`).toBeTruthy();
            }
        }
    });

    it("has every key of the base language in every language, and beyond that only the plural forms that language needs", () =>
    {
        const pluralBasesOfBase = new Set(Object.keys(catalogs[BASE]).filter((key) => key.endsWith(".one")).map((key) => key.slice(0, -".one".length)));
        for (const code of Object.keys(catalogs))
        {
            const missing = Object.keys(catalogs[BASE]).filter((key) => !(key in catalogs[code]));
            expect(missing, `${code} lacks`).toEqual([]);
            const extra = Object.keys(catalogs[code]).filter((key) => !(key in catalogs[BASE]));
            for (const key of extra)
            {
                const base = key.slice(0, key.lastIndexOf("."));
                const form = key.slice(key.lastIndexOf(".") + 1);
                expect(pluralBasesOfBase.has(base) && EXTRA_FORMS.includes(form), `${code} has an unexpected key ${key}`).toBe(true);
            }
        }
    });

    it("gives every plural group all the forms the language has for whole numbers", () =>
    {
        for (const code of Object.keys(catalogs))
        {
            // Spanish has a "many" for exact millions only, which no message in this app needs.
            const needed = new Intl.PluralRules(code).resolvedOptions().pluralCategories.filter((form) => !(code === "es" && form === "many"));
            for (const base of pluralBases)
            {
                for (const form of needed)
                {
                    const wanted = form === "other" && ["uk", "ar"].includes(code) ? "other" : form;
                    expect(catalogs[code][`${base}.${wanted}`], `${code} ${base}.${wanted}`).toBeTruthy();
                }
            }
        }
    });

    it("writes no digit into a plural form of a language whose forms cover more than the number one: they use the count", () =>
    {
        const forms = /\.(zero|one|two|few|many|other)$/;
        for (const code of ["ar", "uk", "hi"])
        {
            for (const [key, value] of Object.entries(catalogs[code]))
            {
                if (forms.test(key))
                {
                    expect(value.replace(/\{\w+\}/g, ""), `${code} ${key}`).not.toMatch(/\d/);
                }
            }
        }
    });

    it("has no empty or blank value in any language", () =>
    {
        for (const [code, catalog] of Object.entries(catalogs))
        {
            for (const [key, value] of Object.entries(catalog))
            {
                expect(typeof value, `${code} ${key}`).toBe("string");
                expect(value.trim().length, `${code} ${key}`).toBeGreaterThan(0);
            }
        }
    });

    it("has no key that nothing uses", () =>
    {
        const unused = Object.keys(catalogs[BASE]).filter((key) =>
        {
            const base = key.replace(/\.(one|other)$/, "");
            return !used.has(key) && !(base !== key && pluralBases.has(base)) && !SOURCE.includes(`"${key}"`) && !BUILD_FILES.includes(`"${key}"`);
        });
        expect(unused).toEqual([]);
    });

    it("fills the same placeholders in every language, and a plural form that names the number in words may leave out the count", () =>
    {
        for (const key of Object.keys(catalogs[BASE]))
        {
            const isForm = /\.(zero|one|two|few|many)$/.test(key);
            for (const code of Object.keys(catalogs))
            {
                if (isForm)
                {
                    const allowed = [...placeholders(catalogs[BASE][key]), "count"];
                    for (const name of placeholders(catalogs[code][key]))
                    {
                        expect(allowed, `${code} ${key}`).toContain(name);
                    }
                }
                else
                {
                    expect(placeholders(catalogs[code][key]), `${code} ${key}`).toEqual(placeholders(catalogs[BASE][key]));
                }
            }
        }
    });

    it("uses the same links in every language", () =>
    {
        for (const key of Object.keys(catalogs[BASE]))
        {
            for (const code of Object.keys(catalogs))
            {
                expect(linkIds(catalogs[code][key]), `${code} ${key}`).toEqual(linkIds(catalogs[BASE][key]));
            }
        }
    });

    it("names keys for what the text is for, in lower case words separated by dots", () =>
    {
        for (const key of Object.keys(catalogs[BASE]))
        {
            expect(key, key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/);
        }
    });

    it("keeps the number of questions in the subtitle on one line with its word, in every language", () =>
    {
        const noBreak = String.fromCharCode(0xa0);
        for (const [code, catalog] of Object.entries(catalogs))
        {
            const subtitle = catalog["header.subtitle"];
            // After the number where the word follows it, before it where the word comes first (uk).
            expect(subtitle.includes(`{count}${noBreak}`) || subtitle.includes(`${noBreak}{count}`), code).toBe(true);
        }
    });

    it("writes no long dashes", () =>
    {
        const longDash = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
        for (const [code, catalog] of Object.entries(catalogs))
        {
            for (const [key, value] of Object.entries(catalog))
            {
                expect(longDash.test(value), `${code} ${key}`).toBe(false);
            }
        }
    });

    it("keeps the product name and the question number out of the messages, they are not translated", () =>
    {
        for (const [code, catalog] of Object.entries(catalogs))
        {
            expect(Object.values(catalog).some((value) => value.includes("LiD Practice")), code).toBe(false);
        }
    });

    it("gives the two languages different texts for the interface, apart from a few shared words", () =>
    {
        const same = Object.keys(catalogs.de).filter((key) => catalogs.de[key] === catalogs.en[key]);
        expect(same.length).toBeLessThan(25);
    });
});
