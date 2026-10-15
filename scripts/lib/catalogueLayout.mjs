import { normalizeText } from "./catalogue.mjs";
import { GENERAL_COUNT, STATES, stateNumber, taskOf } from "./numbering.mjs";

// Page geometry of the official BAMF catalogue, used to cut every question out of the PDF as an image.
// All coordinates are the units of `pdftohtml -xml` (the page is 892 by 1262 units, 1.5 per PDF point).
// Pure functions only, so they can be tested with small synthetic pages.

/** Top edge of the content area on every page, below the BAMF logo. */
export const CONTENT_TOP = 207;

/** Top of the page footer ("Seite 4 von 191"). Nothing of a question lies below it. */
export const FOOTER_TOP = 1146;

/** White space kept above a question and between a question and the next heading. */
export const PADDING = 14;

/** Left and right edge of the crop, wide enough for the widest picture and the option text. */
export const CROP_LEFT = 70;
export const CROP_RIGHT = 850;

/** Rows within this many units of each other belong to the same printed line. */
const SAME_ROW_TOLERANCE = 3;

export { GENERAL_COUNT };

/** Section titles and the page footer, which are never part of a question. */
const TITLE_ROW = /^(Teil (I|II)|Allgemeine Fragen|Fragen für das Bundesland .+)$/;
const FOOTER_ROW = /^Seite \d+ von \d+$/;
const HEADING_ROW = /^Aufgabe (\d+)$/;
const SECTION_TITLE = /^Fragen für das Bundesland (.+)$/;

/** Rows that the text comparison ignores: the "Bild 1 Bild 2 ..." caption row, photo credits and source notes. */
const PICTURE_ROW = /^(Bild \d\s+)+Bild \d$/;
const CAPTION_ROW = /^(©|In Anlehnung an)/;

/** Private use glyphs (checkboxes) in the text layer. */
const GLYPHS = /[-□]/g;

/**
 * Decodes the few XML entities that pdftohtml writes.
 * @param {string} text Raw text.
 * @returns {string} Decoded text.
 */
function decodeEntities(text)
{
    return text
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

/**
 * Parses the output of `pdftohtml -xml` into pages of text lines.
 * @param {string} xml Output of `pdftohtml -xml -i -stdout`.
 * @returns {{ number: number, width: number, height: number, lines: { top: number, left: number, height: number, text: string }[] }[]} Pages.
 */
export function parseLayoutXml(xml)
{
    const pages = [];
    for (const chunk of xml.split("<page number=\"").slice(1))
    {
        const header = /^(\d+)" position="absolute" top="\d+" left="\d+" height="(\d+)" width="(\d+)"/.exec(chunk);
        if (!header)
        {
            continue;
        }
        const lines = [];
        for (const match of chunk.matchAll(/<text top="(\d+)" left="(\d+)" width="\d+" height="(\d+)" font="\d+">([\s\S]*?)<\/text>/g))
        {
            const text = decodeEntities(match[4].replace(/<[^>]+>/g, "")).replace(GLYPHS, "").replace(/\s+/g, " ").trim();
            if (text !== "")
            {
                lines.push({ top: Number(match[1]), left: Number(match[2]), height: Number(match[3]), text });
            }
        }
        pages.push({ number: Number(header[1]), height: Number(header[2]), width: Number(header[3]), lines });
    }
    return pages;
}

/**
 * Joins text pieces that sit on the same printed line, left to right ("Aufgabe" and "16" become "Aufgabe 16").
 * @param {{ top: number, left: number, height?: number, text: string }[]} lines Text pieces of one page.
 * @returns {{ top: number, bottom: number, left: number, text: string }[]} One entry per printed line, from top to bottom.
 */
export function mergeRows(lines)
{
    const sorted = [...lines].sort((first, second) => first.top - second.top || first.left - second.left);
    const rows = [];
    for (const line of sorted)
    {
        const row = rows.find((candidate) => Math.abs(candidate.top - line.top) <= SAME_ROW_TOLERANCE);
        if (row)
        {
            row.parts.push(line);
        }
        else
        {
            rows.push({ top: line.top, parts: [line] });
        }
    }
    return rows.map((row) =>
    {
        const parts = row.parts.sort((first, second) => first.left - second.left);
        return {
            top: row.top,
            bottom: Math.max(...parts.map((part) => part.top + (part.height ?? 0))),
            left: parts[0].left,
            text: parts.map((part) => part.text).join(" "),
        };
    });
}

/**
 * Finds every "Aufgabe N" heading in reading order and numbers it as in numbering.mjs: tasks 1 to 300 of part I
 * keep their number, the tasks of each state section become 301 to 460. A heading in a section that is not
 * a known state keeps `number: null`, it only bounds the neighbouring question.
 * @param {ReturnType<typeof parseLayoutXml>} pages Parsed pages.
 * @returns {{ number: number | null, page: number, top: number }[]} Headings in reading order.
 */
export function findHeadings(pages)
{
    const headings = [];
    let state = null;
    for (const page of pages)
    {
        for (const row of mergeRows(page.lines))
        {
            const title = SECTION_TITLE.exec(row.text);
            const heading = HEADING_ROW.exec(row.text);
            if (title)
            {
                state = STATES.find((candidate) => candidate.name === title[1].trim())?.id ?? "unknown";
            }
            else if (heading)
            {
                const task = Number(heading[1]);
                const number = state === null ? task : state === "unknown" ? null : stateNumber(state, task);
                headings.push({ number, page: page.number, top: row.top });
            }
        }
    }
    return headings;
}

/**
 * Does a region of a page contain printed text that belongs to a question (so it continues the previous one)?
 * Section titles, footers and blank space do not count.
 * @param {ReturnType<typeof parseLayoutXml>[number]} page Page.
 * @param {number} from Top of the region.
 * @param {number} to Bottom of the region.
 * @returns {boolean} True when there is question text.
 */
function hasQuestionText(page, from, to)
{
    return mergeRows(page.lines).some((row) => row.top >= from && row.top < to
        && !TITLE_ROW.test(row.text) && !FOOTER_ROW.test(row.text) && !HEADING_ROW.test(row.text));
}

/**
 * Plans which parts of which pages make up each question.
 * A question normally lies on one page, between its heading and the next one. If the next heading is
 * on a later page, the question runs to the footer and continues on the following pages up to that heading.
 * @param {ReturnType<typeof parseLayoutXml>} pages Parsed pages.
 * @returns {Map<number, { page: number, pieces: { page: number, top: number, bottom: number }[] }>} Plan per question number.
 */
export function planQuestions(pages)
{
    const headings = findHeadings(pages);
    const byNumber = new Map(pages.map((page) => [page.number, page]));
    const plan = new Map();
    headings.forEach((heading, index) =>
    {
        if (heading.number === null)
        {
            return;
        }
        const next = headings[index + 1];
        const start = Math.max(0, heading.top - PADDING);
        const pieces = [];
        if (!next || next.page === heading.page)
        {
            pieces.push({ page: heading.page, top: start, bottom: next ? next.top - PADDING : FOOTER_TOP });
        }
        else
        {
            pieces.push({ page: heading.page, top: start, bottom: FOOTER_TOP });
            for (let number = heading.page + 1; number < next.page; number++)
            {
                if (hasQuestionText(byNumber.get(number), CONTENT_TOP, FOOTER_TOP))
                {
                    pieces.push({ page: number, top: CONTENT_TOP - PADDING, bottom: FOOTER_TOP });
                }
            }
            if (hasQuestionText(byNumber.get(next.page), CONTENT_TOP, next.top - PADDING))
            {
                pieces.push({ page: next.page, top: CONTENT_TOP - PADDING, bottom: next.top - PADDING });
            }
        }
        plan.set(heading.number, { page: heading.page, pieces });
    });
    return plan;
}

/**
 * Text printed inside the planned pieces of a question, without the heading, footer, picture caption row
 * and credits. Whitespace is removed, so it can be compared with the text of the catalogue.
 * @param {ReturnType<typeof parseLayoutXml>} pages Parsed pages.
 * @param {{ page: number, pieces: { page: number, top: number, bottom: number }[] }} entry Plan of one question.
 * @param {number} number Question number, to drop a printed "184." in front of the text.
 * @returns {string} Compact text.
 */
export function plannedText(pages, entry, number)
{
    const byNumber = new Map(pages.map((page) => [page.number, page]));
    const rows = entry.pieces.flatMap((piece) => mergeRows(byNumber.get(piece.page).lines)
        .filter((row) => row.top >= piece.top && row.top < piece.bottom)
        .map((row) => row.text));
    const text = normalizeText(rows
        .filter((row) => !FOOTER_ROW.test(row) && !HEADING_ROW.test(row) && !TITLE_ROW.test(row)
            && !PICTURE_ROW.test(row) && !CAPTION_ROW.test(row))
        .join(" "))
        .replace(/\s+/g, "");
    return text.replace(new RegExp(`^${taskOf(number)}\\.`), "");
}

/** Text of a question starts at this left edge or further left. Answer options are indented further. */
const OPTION_INDENT = 150;

/** White space kept around a picture, in layout units. */
const FIGURE_PADDING = 6;

/** A region shorter than this holds no picture. */
const MIN_FIGURE_HEIGHT = 60;

/**
 * Finds where the picture of a question is printed: below the question text and above the credit line
 * (or, for pictures with numbered options, below the "Bild 1 Bild 2 ..." row) and the answer options.
 * @param {ReturnType<typeof parseLayoutXml>} pages Parsed pages.
 * @param {{ page: number, pieces: { page: number, top: number, bottom: number }[] }} entry Plan of one question.
 * @returns {{ page: number, top: number, bottom: number } | null} The region, or null when the question has no picture region.
 */
export function planFigure(pages, entry)
{
    const [piece] = entry.pieces;
    const page = pages.find((candidate) => candidate.number === piece.page);
    const rows = mergeRows(page.lines)
        .filter((row) => row.top >= piece.top && row.top < piece.bottom && !HEADING_ROW.test(row.text) && !FOOTER_ROW.test(row.text));
    const firstOption = rows.find((row) => row.left >= OPTION_INDENT && !PICTURE_ROW.test(row.text) && !CAPTION_ROW.test(row.text));
    const caption = rows.find((row) => CAPTION_ROW.test(row.text));
    const labels = rows.find((row) => PICTURE_ROW.test(row.text));
    const textRows = rows.filter((row) => row.left < OPTION_INDENT && !PICTURE_ROW.test(row.text) && !CAPTION_ROW.test(row.text)
        && (!firstOption || row.top < firstOption.top));
    if (textRows.length === 0)
    {
        return null;
    }
    const top = Math.max(...textRows.map((row) => row.bottom)) + FIGURE_PADDING;
    const bottom = labels
        ? labels.bottom + FIGURE_PADDING
        : (caption ?? firstOption)?.top;
    if (bottom === undefined || bottom - FIGURE_PADDING - top < MIN_FIGURE_HEIGHT)
    {
        return null;
    }
    return { page: piece.page, top, bottom: bottom - FIGURE_PADDING };
}
