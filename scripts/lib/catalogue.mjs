// Helpers to compare the German question text with the official BAMF "Gesamtfragenkatalog".
// Used by scripts/verify-catalogue.mjs and by the data tests. No catalogue text is stored in the repo,
// only short hashes of the normalized text.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { GENERAL_COUNT, STATES, stateNumber, taskOf } from "./numbering.mjs";

/** Where the edition, the address and the checksum of the catalogue are recorded. */
export const CATALOGUE_SOURCE_FILE = "data/catalogue-source.json";

/** What is recorded about the catalogue the data was verified against. */
export const CATALOGUE_SOURCE = JSON.parse(readFileSync(CATALOGUE_SOURCE_FILE, "utf8"));

/** Edition of the catalogue the data was verified against. */
export const CATALOGUE_STAND = CATALOGUE_SOURCE.stand;

export { GENERAL_COUNT };

/** Number of hex characters kept from the SHA-256 of a question. */
const FINGERPRINT_LENGTH = 16;

/**
 * Deliberate, cosmetic differences between our German text and the catalogue.
 * Each entry is checked by the tests, so it cannot go stale unnoticed.
 */
export const KNOWN_DEVIATIONS = {
    7: "Options end with a full stop, the catalogue has none.",
    52: "Ours uses the ellipsis character, the catalogue types three dots.",
    149: "Last option has no trailing full stop, the catalogue has one.",
    254: "Ours quotes 'Trennungsjahr' with single quotes, the catalogue uses double quotes.",
    287: "Ours writes the polite pronoun Ihr capitalized, the catalogue has a lowercase typo (ihr).",
};

/** Checkbox glyphs and private use characters that the PDF text layer contains. */
const GLYPHS = /[\uf000-\uf8ff\u25a1]/g;

/** Page footer, running headers and section titles that sit between questions. */
const NOISE = /Seite \d+ von \d+|^\s*Teil (I|II)\s*$|Allgemeine Fragen|Fragen für das Bundesland/;

/** Row of picture captions such as "Bild 1   Bild 2   Bild 3   Bild 4". */
const PICTURE_ROW = /^\s*(Bild \d\s+)+Bild \d\s*$/;

/** Photo credit or source line printed under a picture. */
const CAPTION = /^\s*(\u00a9|In Anlehnung an)/;

/**
 * Normalizes text so that typographic differences do not matter: quote styles, spacing,
 * checkbox glyphs. It deliberately keeps punctuation and letter case.
 * @param {string} text Raw text.
 * @returns {string} Normalized text.
 */
export function normalizeText(text)
{
    return text
        .replace(GLYPHS, " ")
        .replace(/[\u201e\u201c\u201d]/g, "\"")
        .replace(/[\u201a\u2018\u2019]/g, "'")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * The text a question has in the catalogue's reading order: question, then the four options.
 * @param {{ q: string, a: string[] }} question Entry of questions.json.
 * @returns {string} Normalized text.
 */
export function questionText(question)
{
    return normalizeText([question.q, ...question.a].join(" "));
}

/**
 * Short stable hash of normalized text.
 * @param {string} text Normalized text.
 * @returns {string} Hex string.
 */
export function fingerprint(text)
{
    return createHash("sha256").update(text).digest("hex").slice(0, FINGERPRINT_LENGTH);
}

/**
 * Splits catalogue text into one block of lines per "Aufgabe N" heading.
 * @param {string[]} lines Lines of one section.
 * @returns {Map<number, string[]>} Lines per task number.
 */
function splitTasks(lines)
{
    const tasks = new Map();
    let current = null;
    for (const line of lines)
    {
        const heading = /^Aufgabe (\d+)\s*$/.exec(line);
        if (heading)
        {
            current = [];
            tasks.set(Number(heading[1]), current);
        }
        else if (current)
        {
            current.push(line);
        }
    }
    return tasks;
}

/** The glyph in front of every answer option in the text layer. */
const OPTION_GLYPH = /^\s*[\uf000-\uf8ff\u25a1]/;

/**
 * Lines of one task, split into the question and its options.
 * @param {string[]} block Lines after the "Aufgabe N" heading, without noise.
 * @returns {{ q: string, a: string[], cap?: string }} Question text, options and photo credit.
 */
function splitTask(block)
{
    const question = [];
    const options = [];
    let caption;
    for (const line of block)
    {
        if (CAPTION.test(line))
        {
            caption = normalizeText(line);
        }
        else if (NOISE.test(line) || PICTURE_ROW.test(line) || line.trim() === "")
        {
            continue;
        }
        else if (OPTION_GLYPH.test(line))
        {
            options.push([line]);
        }
        else if (options.length > 0)
        {
            options[options.length - 1].push(line);
        }
        else
        {
            question.push(line);
        }
    }
    const entry = { q: normalizeText(question.join(" ")), a: options.map((lines) => normalizeText(lines.join(" "))) };
    return caption === undefined ? entry : { ...entry, cap: caption };
}

/**
 * Parses the text of the catalogue (from `pdftotext -layout`) into all questions: tasks 1 to 300 of part I,
 * and the 10 tasks of each state section as 301 to 460 (see numbering.mjs).
 * @param {string} text Output of `pdftotext -layout`.
 * @returns {{ texts: Map<number, string>, captions: Map<number, string>, entries: Map<number, { q: string, a: string[], cap?: string }> }} Normalized text,
 *   picture captions, and the question with its options split, per question number.
 */
export function parseCatalogue(text)
{
    const lines = text.replaceAll("\f", "").split("\n");
    const titleAt = (name) =>
    {
        const index = lines.findIndex((line) => line.trim() === `Fragen für das Bundesland ${name}`);
        if (index < 0)
        {
            throw new Error(`Catalogue section not found: ${name}`);
        }
        return index;
    };
    const starts = STATES.map((state) => titleAt(state.name));
    const sections = [{ tasks: splitTasks(lines.slice(0, starts[0])), number: (task) => task }];
    STATES.forEach((state, index) =>
    {
        const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
        sections.push({ tasks: splitTasks(lines.slice(starts[index], end)), number: (task) => stateNumber(state.id, task) });
    });
    const texts = new Map();
    const captions = new Map();
    const entries = new Map();
    for (const { tasks, number: numberOf } of sections)
    {
        for (const [task, block] of tasks)
        {
            const number = numberOf(task);
            const kept = [];
            for (const line of block)
            {
                if (CAPTION.test(line))
                {
                    captions.set(number, normalizeText(line));
                }
                else if (!NOISE.test(line) && !PICTURE_ROW.test(line))
                {
                    kept.push(line);
                }
            }
            // A few questions print their own number in front of the text ("184. Auf welche ...").
            const printed = new RegExp(`^${taskOf(number)}\\. `);
            texts.set(number, normalizeText(kept.join(" ")).replace(printed, ""));
            const entry = splitTask(block);
            entries.set(number, { ...entry, q: entry.q.replace(printed, "") });
        }
    }
    return { texts, captions, entries };
}
