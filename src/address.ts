/**
 * The addresses of the page. Every tab has an address of its own, so it can be linked, opened again and reached with
 * the Back button of the browser: the part of the address after "#", which is the name of the tab.
 *
 *   #learn       the Learn tab, which has an address for every page of it (see learn/route.ts)
 *   #practice    practice
 *   #train       the training
 *   #exam        the exam
 *
 * The address of the site without such a part stands for the tab the page opens with, and so does a part that names
 * no tab. The names are the same in every language, so a link works whatever language the site is shown in.
 */
import { pageHash, parseRoute, type LearnRoute } from "./learn/route";
import { MODES, type AppMode } from "./types";

/** The tab the page opens with when its address names none. */
export const START_MODE: AppMode = "practice";

/** What an address stands for: a tab, and for the Learn tab the page of it. */
export interface Place
{
    /** The tab. */
    mode: AppMode;
    /** The page of the Learn tab, or null for a tab that has one page. */
    route: LearnRoute | null;
}

/**
 * The part of the address that stands for a tab.
 * @param mode The tab.
 * @returns The fragment with its "#", for example "#train".
 */
export function modeHash(mode: AppMode): string
{
    return `#${mode}`;
}

/**
 * Reads what an address stands for.
 * @param hash The fragment of an address, with or without its "#".
 * @returns The tab, and the page of the Learn tab. The first name decides: what follows the name of a tab that has
 *          one page is not looked at, and an address that names no tab stands for the tab the page opens with.
 */
export function placeOf(hash: string): Place
{
    const route = parseRoute(hash);
    if (route)
    {
        return { mode: "learn", route };
    }
    const name = hash.replace(/^#/, "").split("/")[0].toLowerCase();
    return { mode: MODES.find((mode) => mode === name) ?? START_MODE, route: null };
}

/**
 * The address of the page an address belongs to, as the page writes it: without a section of a lesson, and with the
 * name of the tab for an address that has none.
 * @param hash The fragment of an address.
 * @returns The fragment of the page. Two addresses belong to the same page when this is the same for both.
 */
export function pageOf(hash: string): string
{
    return pageHash(hash) || modeHash(placeOf(hash).mode);
}
