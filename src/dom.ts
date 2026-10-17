/** Child accepted by {@link el}. */
export type Child = Node | string | null | false | undefined;

/**
 * Creates an element with attributes and children.
 * Attributes starting with "on" are added as event listeners. Text is always added as text, never as markup.
 * @param tag Tag name.
 * @param attributes Attribute map. Boolean true sets an empty attribute.
 * @param children Child nodes or text.
 * @returns The new element.
 */
export function el(
    tag: string,
    attributes: Record<string, string | boolean | EventListener> = {},
    ...children: Child[]
): HTMLElement
{
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes))
    {
        if (typeof value === "function")
        {
            element.addEventListener(name.slice(2), value);
        }
        else if (value === true)
        {
            element.setAttribute(name, "");
        }
        else if (value !== false)
        {
            element.setAttribute(name, value);
        }
    }
    for (const child of children)
    {
        if (child === null || child === false || child === undefined)
        {
            continue;
        }
        element.append(child);
    }
    return element;
}

/** Number of lines a clamped text may use before it is cut with an ellipsis. */
export const DEFAULT_CLAMP_LINES = 2;

/** A text may be this many pixels taller than its box before it counts as cut off. */
const CLAMP_TOLERANCE = 1;

/**
 * Text that is cut after a few lines with an ellipsis, and then shows its full value on hover.
 * Whether it is cut is measured from the real layout and measured again when the box changes size,
 * never guessed from the length of the string.
 * @param text The full text.
 * @param lines How many lines are allowed.
 * @returns The element.
 */
export function clampedText(text: string, lines: number = DEFAULT_CLAMP_LINES): HTMLElement
{
    const element = el("span", { class: "clamp" }, text);
    element.style.setProperty("--clamp-lines", String(lines));
    const update = (): void =>
    {
        if (element.scrollHeight > element.clientHeight + CLAMP_TOLERANCE)
        {
            element.setAttribute("title", text);
        }
        else
        {
            element.removeAttribute("title");
        }
    };
    if (typeof ResizeObserver !== "undefined")
    {
        new ResizeObserver(update).observe(element);
    }
    return element;
}

/** The namespace of SVG elements. */
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Creates an SVG element with attributes and children, the way {@link el} does for HTML.
 * @param tag Tag name, for example "path".
 * @param attributes Attribute map. Attributes starting with "on" are added as event listeners.
 * @param children Child nodes or text.
 * @returns The new element.
 */
export function svg(tag: string, attributes: Record<string, string | EventListener> = {}, ...children: Child[]): SVGElement
{
    const element = document.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes))
    {
        if (typeof value === "function")
        {
            element.addEventListener(name.slice(2), value);
        }
        else
        {
            element.setAttribute(name, value);
        }
    }
    for (const child of children)
    {
        if (child !== null && child !== false && child !== undefined)
        {
            element.append(child);
        }
    }
    return element;
}

/** Size of the icons, in the units of their drawing area. */
const ICON_VIEW_BOX = "0 0 24 24";

/**
 * The icons: a path each, drawn with a line on a 24 by 24 area. The names say what an arrow means, not where it points:
 * "back" and "forward" and the two ends of a row point the other way in a right to left page (see ICON_DIRECTIONAL).
 */
const ICON_PATHS = {
    globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-2.5 2.4-3.8 5.4-3.8 9s1.3 6.6 3.8 9m0-18c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9M3.5 9h17M3.5 15h17",
    contrast: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0v18",
    pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.2a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
    book: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Zm0 15A1.5 1.5 0 0 0 6.5 21H19v-3",
    arrowBack: "M19 12H5m6-6-6 6 6 6",
    arrowForward: "M5 12h14m-6-6 6 6-6 6",
    chevronDown: "M6 9l6 6 6-6",
    chevronStart: "M14.5 6 8.5 12l6 6",
    chevronEnd: "M9.5 6l6 6-6 6",
    flag: "M6 21V4m0 0h11l-2.5 4 2.5 4H6",
    play: "M8 5.5v13l11-6.5-11-6.5Z",
    pause: "M8.5 5.5v13m7-13v13",
    translate: "M4 5h9M8.5 3v2m-3 0c.6 3.4 3.2 6.4 6.5 8M11.5 5c-.6 3.4-3.2 6.4-6.5 8M12.5 21l4-10 4 10m-6.6-3h5.2",
    check: "M5 12.5l4.5 4.5L19 7.5",
    circle: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
    cards: "M7 8h12v11H7V8Zm-2 8H4.5V5H17v.5",
    clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.5V12l3 2",
    map: "M9 5 4 7v12l5-2 6 2 5-2V5l-5 2-6-2Zm0 0v12m6-10v12",
    alert: "M12 4 3 19h18L12 4Zm0 6v4m0 2.6v.2",
    link: "M10.5 13.5a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1m1 4.66a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
    share: "M12 15V4m0 0L8 8m4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12",
} as const;

/** The icons whose direction means something in reading order, and that are mirrored in a right to left page. */
const ICON_DIRECTIONAL: readonly string[] = ["arrowBack", "arrowForward", "chevronStart", "chevronEnd"];

/** Names of the icons. */
export type IconName = keyof typeof ICON_PATHS;

/**
 * An icon, as an inline picture that takes its colour from the text. It is hidden from assistive technology,
 * so whatever uses it needs its own accessible name.
 * @param name Which icon.
 * @returns SVG element.
 */
export function icon(name: IconName): SVGElement
{
    return svg("svg", { viewBox: ICON_VIEW_BOX, class: ICON_DIRECTIONAL.includes(name) ? "icon icon-dir" : "icon", "aria-hidden": "true", focusable: "false" },
        svg("path", { d: ICON_PATHS[name] }));
}

/**
 * Two texts for one place, of which one shows: both are laid over each other and only the current one is visible and
 * read, so the place is as big as the bigger text needs in either state and nothing around it moves or wraps. Used
 * for a button that needs a second press, and for a hint that changes with a switch.
 * @param normal Text before the first press, or while the switch is off.
 * @param armed Text that asks for the second press, or while the switch is on.
 * @param isArmed Whether the second text is the one that shows.
 * @returns The two spans, to be spread into the element.
 */
export function twoStepLabel(normal: string, armed: string, isArmed: boolean): HTMLElement[]
{
    return [
        el("span", { class: isArmed ? "swap is-off" : "swap", "aria-hidden": isArmed ? "true" : false }, normal),
        el("span", { class: isArmed ? "swap" : "swap is-off", "aria-hidden": isArmed ? false : "true" }, armed),
    ];
}

/**
 * Several texts for one place, of which one shows, like {@link twoStepLabel}: a button that names the next step in
 * other words from state to state keeps the width of its longest text, so it never pushes its neighbours.
 * @param texts Every text the place can show.
 * @param shown Which of them shows.
 * @returns The spans, to be spread into an element with the class "swap-box".
 */
export function stackedTexts(texts: string[], shown: number): HTMLElement[]
{
    return texts.map((text, index) => el("span", { class: index === shown ? "swap" : "swap is-off", "aria-hidden": index === shown ? false : "true" }, text));
}

/**
 * Scrolls a strip sideways just far enough that one of its items is whole inside it. Nothing else moves: the page
 * keeps its place, and a strip that shows the item already is left alone. It works the same in a right to left page.
 * @param strip The element that scrolls sideways.
 * @param item An element inside it.
 */
export function revealInStrip(strip: HTMLElement, item: HTMLElement): void
{
    const frame = strip.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.right > frame.right)
    {
        strip.scrollLeft += box.right - frame.right;
    }
    else if (box.left < frame.left)
    {
        strip.scrollLeft -= frame.left - box.left;
    }
}
