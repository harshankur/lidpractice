/**
 * The addresses of the Learn tab. Every page of the tab, and every section of a lesson, has an address of its own, so
 * it can be linked, shared and opened again: the part of the address after "#".
 *
 *   #learn                      the list of lessons
 *   #learn/timeline             the timeline
 *   #learn/maps                 the maps
 *   #learn/<lesson>             a lesson
 *   #learn/<lesson>/<section>   a section of a lesson
 *
 * The other tabs have one address each, which is their name (see ../address.ts). The names are the ids of the course,
 * which are the same in every language, so a link works whatever language the site is shown in.
 */

/** A place in the Learn tab that has an address. */
export type LearnRoute =
    | { page: "home" }
    | { page: "timeline" }
    | { page: "maps" }
    | { page: "lesson"; lesson: string; section?: string };

/** The first part of every address of the Learn tab. */
export const LEARN_ROOT = "learn";

/** The names that stand for a page of their own and can therefore not be the id of a lesson. */
export const RESERVED_NAMES: readonly string[] = ["timeline", "maps"];

/** What the name of a section may be, as it is saved and looked for on the page: lower case letters, digits and hyphens, or nothing for the top of a lesson. */
export const SECTION_NAME = /^[a-z0-9-]*$/;

/** What an id of the course looks like: lower case words and digits joined by hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The part of the address that stands for a place of the Learn tab.
 * @param route The place.
 * @returns The fragment with its "#", for example "#learn/wuerde/artikel-1".
 */
export function routeHash(route: LearnRoute): string
{
    if (route.page === "home")
    {
        return `#${LEARN_ROOT}`;
    }
    if (route.page === "lesson")
    {
        return `#${[LEARN_ROOT, route.lesson, ...(route.section === undefined ? [] : [route.section])].join("/")}`;
    }
    return `#${LEARN_ROOT}/${route.page}`;
}

/**
 * Reads the place of the Learn tab an address stands for.
 * @param hash The fragment of an address, with or without its "#".
 * @returns The place, or null when the address is not one of the Learn tab. An address of the tab that names nothing
 *          that can exist leads to the list of lessons.
 */
export function parseRoute(hash: string): LearnRoute | null
{
    // An address typed by hand may have capitals or a doubled slash: the names are lower case, and an empty name names nothing.
    const parts = hash.replace(/^#/, "").toLowerCase().split("/").filter((part, index) => index === 0 || part !== "");
    if (parts[0] !== LEARN_ROOT)
    {
        return null;
    }
    const [first, section, ...more] = parts.slice(1);
    if (first === undefined || more.length > 0 || !SLUG.test(first) || (section !== undefined && !SLUG.test(section)))
    {
        return { page: "home" };
    }
    if (RESERVED_NAMES.includes(first))
    {
        return section === undefined ? { page: first as "timeline" | "maps" } : { page: "home" };
    }
    return section === undefined ? { page: "lesson", lesson: first } : { page: "lesson", lesson: first, section };
}

/**
 * The address of the page an address belongs to: the same address without its section.
 * @param hash The fragment of an address.
 * @returns The fragment of the page, or "" for an address that is not one of the Learn tab.
 */
export function pageHash(hash: string): string
{
    const route = parseRoute(hash);
    if (route === null)
    {
        return "";
    }
    return routeHash(route.page === "lesson" ? { page: "lesson", lesson: route.lesson } : route);
}
