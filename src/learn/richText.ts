import { DEFAULT_LOCALE, directionOf } from "../types";

/**
 * The small markup of the texts of the course: `{{Grundgesetz}}` marks a German word, which stays German in every
 * language, and `**never**` marks a word that carries a trap. Nothing else is markup, and text is only ever added to the
 * page as text.
 */

/** A piece of a text. */
export interface TextPart
{
    kind: "plain" | "german" | "strong";
    text: string;
}

/** Matches the two kinds of marked text. */
const MARKED = /\{\{([^{}]+)\}\}|\*\*([^*]+)\*\*/g;

/** The middle dot that splits a German compound into its parts. */
export const COMPOUND_DOT = "·";

/**
 * Splits a text into plain, German and strong pieces.
 * @param text The text with its markup.
 * @returns The pieces in reading order. Markup that is not closed is kept as plain text.
 */
export function parseRich(text: string): TextPart[]
{
    const parts: TextPart[] = [];
    let last = 0;
    for (const match of text.matchAll(MARKED))
    {
        const start = match.index as number;
        if (start > last)
        {
            parts.push({ kind: "plain", text: text.slice(last, start) });
        }
        parts.push(match[1] === undefined ? { kind: "strong", text: match[2] } : { kind: "german", text: match[1] });
        last = start + match[0].length;
    }
    if (last < text.length)
    {
        parts.push({ kind: "plain", text: text.slice(last) });
    }
    return parts;
}

/**
 * The text without its markup, for a place that takes plain text only, such as a label.
 * @param text The text with its markup.
 * @returns The words alone.
 */
export function plainText(text: string): string
{
    return parseRich(text).map((part) => part.text).join("");
}

/**
 * A German word as an element of its own: it names its language and keeps its direction in a right to left page.
 * @param text The German text.
 * @param className Class of the element.
 * @returns The element.
 */
export function germanSpan(text: string, className = "de-term"): HTMLElement
{
    const span = document.createElement("span");
    span.className = className;
    span.lang = DEFAULT_LOCALE;
    span.dir = directionOf(DEFAULT_LOCALE);
    span.textContent = text;
    return span;
}

/**
 * Turns a text with markup into nodes.
 * @param text The text.
 * @returns Text nodes, and an element for every German or strong piece.
 */
export function richNodes(text: string): Node[]
{
    return parseRich(text).map((part) =>
    {
        if (part.kind === "german")
        {
            return germanSpan(part.text);
        }
        if (part.kind === "strong")
        {
            const strong = document.createElement("strong");
            strong.textContent = part.text;
            return strong;
        }
        return document.createTextNode(part.text);
    });
}

/**
 * A German term whose compounds are split with middle dots, as nodes: the parts with a thin mark between them, so the
 * eye sees the joins and a screen reader reads the whole word.
 * @param term The term, for example "das Bundes·verfassungs·gericht".
 * @returns The element.
 */
export function termNode(term: string): HTMLElement
{
    const whole = germanSpan("", "term-word");
    whole.setAttribute("aria-label", term.split(COMPOUND_DOT).join(""));
    term.split(COMPOUND_DOT).forEach((piece, index) =>
    {
        if (index > 0)
        {
            const dot = document.createElement("span");
            dot.className = "term-dot";
            dot.setAttribute("aria-hidden", "true");
            dot.textContent = COMPOUND_DOT;
            whole.append(dot);
        }
        whole.append(document.createTextNode(piece));
    });
    return whole;
}
