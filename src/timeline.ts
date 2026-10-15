import { el, icon } from "./dom";
import { i18n, msg, t } from "./i18n";
import type { Round, RoundSlot } from "./round";
import { questionName } from "./states";

/** What the timeline asks the app to do. */
export interface TimelineHandlers
{
    /** A slot was chosen. */
    open(index: number): void;
    /** The legend was shown or hidden. */
    toggleLegend(): void;
}

/** The glyph in a slot, so that colour is never the only signal. */
const GLYPHS = { correct: "✓", wrong: "✗", skipped: "»", resume: "▸", open: "", current: "" } as const;

/** The names in the legend. */
const LEGEND_LABELS = {
    correct: msg("timeline.legend.correct"),
    wrong: msg("timeline.legend.wrong"),
    skipped: msg("timeline.legend.skipped"),
    current: msg("timeline.legend.current"),
    resume: msg("timeline.legend.resume"),
    open: msg("timeline.legend.open"),
    next: msg("timeline.legend.next"),
} as const;

/** The glyph of a question that is not drawn yet. */
const UNKNOWN_GLYPH = "?";

/** Where the current slot rests when the strip scrolls, as a share of the strip width from its start edge. */
const CURRENT_POSITION = 0.33;

/** The strip counts as scrolled to its end when it is this many pixels short of it. */
const SCROLL_END_TOLERANCE = 1;

/** How far the arrow buttons scroll, as a share of the strip width. */
const PAGE_SHARE = 0.8;

/**
 * Which way scrollLeft grows when the strip scrolls toward its end: up in a left to right page, down (negative numbers) in a right to left one.
 * @param strip The scrolling strip.
 * @returns 1 or -1.
 */
function scrollSign(strip: HTMLElement): 1 | -1
{
    return getComputedStyle(strip).direction === "rtl" ? -1 : 1;
}

/** The state a slot is drawn in. */
type SlotState = keyof typeof GLYPHS;

/**
 * The state of one slot, from the round and the place being looked at.
 * @param round The round.
 * @param index Slot index.
 * @param slot The slot.
 * @returns The state.
 */
function stateOf(round: Round, index: number, slot: RoundSlot): SlotState
{
    if (index === round.resume && round.view !== round.resume && !round.ended && slot.outcome === "open")
    {
        return "resume";
    }
    return slot.outcome;
}

/**
 * Accessible name of a slot.
 * @param round The round.
 * @param index Slot index.
 * @param slot The slot.
 * @returns For example "Question 12, wrong".
 */
function slotLabel(round: Round, index: number, slot: RoundSlot): string
{
    if (index === round.view && !round.ended)
    {
        return t("timeline.slot.current", { n: questionName(slot.n) });
    }
    switch (stateOf(round, index, slot))
    {
        case "correct":
            return t("timeline.slot.correct", { n: questionName(slot.n) });
        case "wrong":
            return t("timeline.slot.wrong", { n: questionName(slot.n) });
        case "skipped":
            return t("timeline.slot.skipped", { n: questionName(slot.n) });
        case "resume":
            return t("timeline.slot.resume", { n: questionName(slot.n) });
        case "open":
        case "current":
            return t("timeline.slot.open", { n: questionName(slot.n) });
    }
}

/**
 * One slot of the strip.
 * @param round The round.
 * @param index Slot index.
 * @param stopIndex The slot that has the keyboard stop.
 * @param handlers What a click does.
 * @returns List item.
 */
function renderSlot(round: Round, index: number, stopIndex: number, handlers: TimelineHandlers): HTMLElement
{
    const slot = round.slots[index];
    const isCurrent = index === round.view && !round.ended;
    const state = stateOf(round, index, slot);
    const classes = ["slot", `is-${state}`, isCurrent ? "is-current" : "", isCurrent && slot.outcome === "skipped" ? "was-skipped" : ""].filter(Boolean);
    return el("li", {},
        el("button", {
            class: classes.join(" "),
            type: "button",
            "aria-label": slotLabel(round, index, slot),
            "aria-current": isCurrent ? "step" : false,
            tabindex: index === stopIndex ? "0" : "-1",
            "data-index": String(index),
            onclick: () => handlers.open(index),
        },
        el("span", { class: "slot-number" }, questionName(slot.n)),
        el("span", { class: "slot-glyph", "aria-hidden": "true" }, GLYPHS[state])));
}

/**
 * The strip of a round: every question with how it went, the one that is shown, and what is still to come.
 * In booklet order the coming questions are real numbers. In random order the next question is drawn only when
 * the user moves on, so the future is one "?" and a count.
 * @param round The round.
 * @param legendOpen Whether the legend is showing.
 * @param handlers What a click does.
 * @returns The timeline.
 */
export function renderTimeline(round: Round, legendOpen: boolean, handlers: TimelineHandlers): HTMLElement
{
    const counts = round.counts;
    const stopIndex = round.view >= 0 ? round.view : Math.max(0, round.slots.length - 1);
    const items: HTMLElement[] = round.slots.map((_, index) => renderSlot(round, index, stopIndex, handlers));
    const unknown = round.order === "random" ? round.total - round.slots.length : 0;
    if (unknown > 0)
    {
        items.push(el("li", { class: "slot-unknown", title: t("timeline.next") }, el("span", { "aria-label": t("timeline.next"), role: "img" }, UNKNOWN_GLYPH)));
    }
    if (unknown > 1)
    {
        items.push(el("li", { class: "slot-more", title: t("timeline.moreLabel", { count: unknown - 1 }) }, t("timeline.more", { count: unknown - 1 })));
    }
    const list = el("ol", { class: "timeline-list" }, ...items);
    const strip = el("div", {
        class: "timeline-strip",
        onkeydown: (event: Event) => moveFocus(event as KeyboardEvent, list),
    }, list);
    // The two arrows are "earlier" and "later", the first at the start edge of the strip and the second at the end edge, whichever way the page is read.
    const scroll = (step: 1 | -1): void =>
    {
        strip.scrollBy?.({ left: step * scrollSign(strip) * strip.clientWidth * PAGE_SHARE, behavior: "smooth" });
    };
    const earlier = el("button", { class: "timeline-scroll", type: "button", "aria-label": t("timeline.scrollEarlier"), onclick: () => scroll(-1) }, icon("chevronStart")) as HTMLButtonElement;
    const later = el("button", { class: "timeline-scroll", type: "button", "aria-label": t("timeline.scrollLater"), onclick: () => scroll(1) }, icon("chevronEnd")) as HTMLButtonElement;
    // An arrow that cannot scroll any further is off, so the ends of the strip are known without looking for them.
    // In a right to left page scrollLeft is 0 at the start and negative beyond it, so only its size counts.
    strip.addEventListener("scroll", () =>
    {
        const travelled = Math.abs(strip.scrollLeft);
        earlier.disabled = travelled <= 0;
        later.disabled = travelled + strip.clientWidth >= strip.scrollWidth - SCROLL_END_TOLERANCE;
    });
    const countText = (glyph: string, count: number): string => `${glyph}${i18n.number(count)}`;
    const head = el("div", { class: "timeline-head" },
        el("strong", {}, t("timeline.round")),
        el("span", { class: "timeline-progress" }, t("timeline.progress", { done: counts.answered, total: counts.total })),
        el("span", { class: "timeline-counts" },
            // A mark with its number is one chip that is always read from the left: the browser would write the number first in a right to left page.
            el("span", { class: "count-correct", dir: "ltr", title: t("timeline.countCorrect", { count: counts.correct }) }, countText(GLYPHS.correct, counts.correct)),
            el("span", { class: "count-wrong", dir: "ltr", title: t("timeline.countWrong", { count: counts.wrong }) }, countText(GLYPHS.wrong, counts.wrong)),
            el("span", { class: "count-skipped", dir: "ltr", title: t("timeline.countSkipped", { count: counts.skipped }) }, countText(GLYPHS.skipped, counts.skipped))),
        el("button", { class: "ghost sm timeline-legend-toggle", type: "button", "aria-expanded": String(legendOpen), onclick: () => handlers.toggleLegend() }, t("timeline.legend")));
    const legend = legendOpen
        ? el("ul", { class: "timeline-legend" },
            ...(Object.keys(LEGEND_LABELS) as (keyof typeof LEGEND_LABELS)[]).map((kind) => el("li", {},
                el("span", { class: `legend-swatch is-${kind}`, "aria-hidden": "true" }, legendGlyph(kind)),
                t(LEGEND_LABELS[kind]))))
        : null;
    return el("nav", { class: "timeline", "aria-label": t("timeline.label") },
        head,
        el("div", { class: "timeline-body" },
            earlier,
            strip,
            later),
        legend);
}

/**
 * The mark inside a legend swatch.
 * @param kind Which entry of the legend.
 * @returns The glyph, empty when the swatch is only a colour.
 */
function legendGlyph(kind: keyof typeof LEGEND_LABELS): string
{
    const glyphs: Record<string, string> = { correct: GLYPHS.correct, wrong: GLYPHS.wrong, skipped: GLYPHS.skipped, resume: GLYPHS.resume, next: UNKNOWN_GLYPH };
    return glyphs[kind] ?? "";
}

/**
 * Moves focus between the slots with the arrow keys, Home and End. Enter and Space work as on any button.
 * @param event Keyboard event in the strip.
 * @param list The list of slots.
 */
function moveFocus(event: KeyboardEvent, list: HTMLElement): void
{
    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>("button.slot"));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index === -1)
    {
        return;
    }
    // The arrow that points toward the end of the strip goes on: right in a left to right page, left in a right to left one.
    const forward = getComputedStyle(list).direction === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = forward === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
    const target: Record<string, number> = { [backward]: index - 1, [forward]: index + 1, Home: 0, End: buttons.length - 1 };
    if (event.key in target)
    {
        event.preventDefault();
        const next = buttons[Math.min(buttons.length - 1, Math.max(0, target[event.key]))];
        buttons.forEach((button) => button.setAttribute("tabindex", button === next ? "0" : "-1"));
        next.focus();
    }
}

/**
 * Scrolls the strip so that the slot that is shown rests about a third from the left.
 * Nothing moves if the reader prefers reduced motion, the strip just starts there.
 * @param root Element that contains the timeline.
 */
export function scrollTimelineToCurrent(root: HTMLElement): void
{
    const strip = root.querySelector<HTMLElement>(".timeline-strip");
    const current = strip?.querySelector<HTMLElement>("button[aria-current=step]") ?? strip?.querySelector<HTMLElement>("button.is-resume");
    if (strip && current)
    {
        // Positions are counted from the start edge of the strip, which is the left in a left to right page and the right in the other.
        const sign = scrollSign(strip);
        const stripBox = strip.getBoundingClientRect();
        const fromStart = (element: HTMLElement): number =>
        {
            const box = element.getBoundingClientRect();
            return (sign === 1 ? box.left - stripBox.left : stripBox.right - box.right) + Math.abs(strip.scrollLeft);
        };
        // Start at a whole slot, so no slot is cut in half at the start edge. The arrows and the fade at the end tell there is more.
        const wanted = Math.max(0, fromStart(current) - strip.clientWidth * CURRENT_POSITION);
        const first = Array.from(strip.querySelectorAll<HTMLElement>(".timeline-list > li")).find((item) => fromStart(item) >= wanted);
        strip.scrollLeft = sign * (first ? fromStart(first) : wanted);
    }
    strip?.dispatchEvent(new Event("scroll"));
}
