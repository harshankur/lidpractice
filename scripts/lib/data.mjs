// Reads and writes the question bank, which is split into a language neutral file and one file per language:
//
//   data/questions.json                  n, category id, index of the correct option, picture, catalogue page
//   data/locales/questions.de.json       German: the official text, verified against the BAMF catalogue
//   data/locales/questions.en.json       English: an unofficial translation
//
// Adding a language means adding data/locales/questions.<code>.json. Tests check that every language
// has exactly the same questions, four options each, and no empty text.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

/** Location of the neutral file and of the language files. */
export const NEUTRAL_FILE = "data/questions.json";
export const LOCALE_FOLDER = "data/locales";

/** Language of the official catalogue. It is the reference for every check against the PDF. */
export const OFFICIAL_LOCALE = "de";

/**
 * Path of the language file for a language code.
 * @param {string} code Language code, for example "de".
 * @returns {string} Path.
 */
export function localeFile(code)
{
    return `${LOCALE_FOLDER}/questions.${code}.json`;
}

/**
 * Language codes that have a file, official language first.
 * @returns {string[]} Codes.
 */
export function localeCodes()
{
    const codes = readdirSync(LOCALE_FOLDER)
        .map((name) => /^questions\.([a-z]{2,3})\.json$/.exec(name)?.[1])
        .filter((code) => code !== undefined);
    return codes.sort((first, second) => (first === OFFICIAL_LOCALE ? -1 : second === OFFICIAL_LOCALE ? 1 : first.localeCompare(second)));
}

/**
 * Reads the language neutral entries.
 * @returns {{ n: number, k: string, r: number, img: string | null, pg: number }[]} Entries, index is number minus one.
 */
export function readNeutral()
{
    return JSON.parse(readFileSync(NEUTRAL_FILE, "utf8"));
}

/**
 * Reads one language file.
 * @param {string} code Language code.
 * @returns {{ locale: string, name: string, official: boolean, categories: Record<string, string>, questions: { n: number, q: string, a: string[], cap?: string }[] }} The file.
 */
export function readLocale(code)
{
    return JSON.parse(readFileSync(localeFile(code), "utf8"));
}

/**
 * Everything in one object, the shape the build embeds into the page.
 * @returns {{ questions: ReturnType<typeof readNeutral>, locales: Record<string, ReturnType<typeof readLocale>> }} The bundle.
 */
export function readBundle()
{
    return {
        questions: readNeutral(),
        locales: Object.fromEntries(localeCodes().map((code) => [code, readLocale(code)])),
    };
}

/**
 * Serializes a list with one entry per line, so that a change to one question is a one line change in git.
 * @param {unknown[]} entries Entries.
 * @returns {string} JSON text.
 */
function linesOf(entries)
{
    return `[\n${entries.map((entry) => JSON.stringify(entry)).join(",\n")}\n]`;
}

/**
 * Writes the neutral file, one question per line.
 * @param {ReturnType<typeof readNeutral>} entries Entries.
 */
export function writeNeutral(entries)
{
    writeFileSync(NEUTRAL_FILE, `${linesOf(entries)}\n`);
}

/**
 * Writes a language file, one question per line.
 * @param {ReturnType<typeof readLocale>} file The file.
 */
export function writeLocale(file)
{
    const { questions, categories, ...header } = file;
    const head = JSON.stringify(header).slice(1, -1);
    writeFileSync(localeFile(file.locale), `{${head},\n"categories":${JSON.stringify(categories)},\n"questions":${linesOf(questions)}\n}\n`);
}

/**
 * Flat questions in the old shape (a question that has no translation repeats the German text) (n, c, q, a, r, qe, ae, img, cap, pg). Used by tests and checks that
 * compare one language with the catalogue.
 * @param {ReturnType<typeof readBundle>} bundle The bundle.
 * @returns {{ n: number, c: string, q: string, a: string[], r: number, qe: string, ae: string[], img: string | null, cap?: string, pg: number }[]} Flat questions.
 */
export function flatQuestions(bundle = readBundle())
{
    const de = new Map(bundle.locales.de.questions.map((entry) => [entry.n, entry]));
    const en = new Map(bundle.locales.en.questions.map((entry) => [entry.n, entry]));
    return bundle.questions.map((entry) =>
    {
        const german = de.get(entry.n);
        const english = en.get(entry.n);
        const flat = {
            n: entry.n,
            c: bundle.locales.de.categories[entry.k],
            q: german.q,
            a: german.a,
            r: entry.r,
            // A question without a translation shows the German text, as the app does.
            qe: (english ?? german).q,
            ae: (english ?? german).a,
            img: entry.img,
            pg: entry.pg,
        };
        return german.cap === undefined ? flat : { ...flat, cap: german.cap };
    });
}
