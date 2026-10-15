import { el } from "../dom";
import { i18n, t } from "../i18n";
import { germanSpan, richNodes } from "./richText";
import type { Locale } from "../types";
import type { Era, EraId, TimelineEvent } from "./types";

/**
 * The timeline: events in the order of time, top to bottom, with a rail at the start edge that shows the era by
 * colour, pattern and name. From 1949 to 1990 the rail splits into two stripes, west and east, and every event of
 * those years sits on its stripe. The distance between two rows is not to scale; a small note says how many years lie between them.
 */

/** A note on the years between two events is shown from this many years. */
export const CHRONO_GAP_MIN = 3;

/** Matches a date that names a day. */
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The region a language writes its dates for, where the plain language would write them another way: English puts the day first, as Germany does. */
const DATE_REGIONS: Partial<Record<Locale, string>> = { en: "en-GB" };

/** The stretch of time an era belongs to. West and east are the two halves of the division. */
export type EraGroup = "ns" | "occupation" | "division" | "unity";

/**
 * The stretch of time an era belongs to.
 * @param era The era.
 * @returns Its group.
 */
export function eraGroup(era: EraId): EraGroup
{
    return era === "west" || era === "east" ? "division" : era;
}

/**
 * How the date of an event is written in the language of the site.
 * @param event The event.
 * @returns For example "8 May 1945", "1949" or "1950s".
 */
export function formatWhen(event: Pick<TimelineEvent, "date" | "when">): string
{
    if (event.when !== undefined)
    {
        return event.when;
    }
    if (!FULL_DATE.test(event.date))
    {
        return event.date;
    }
    // Western digits and the Gregorian calendar in every language, as everywhere else on the page.
    return new Intl.DateTimeFormat(`${DATE_REGIONS[i18n.locale] ?? i18n.locale}-u-nu-latn-ca-gregory`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${event.date}T00:00:00Z`));
}

/**
 * The years of an era as text.
 * @param era The era.
 * @returns For example "1933 to 1945" or "since 1990".
 */
export function eraYears(era: Pick<Era, "from" | "to">): string
{
    return era.to === null ? t("learn.era.since", { from: String(era.from) }) : t("learn.era.range", { from: String(era.from), to: String(era.to) });
}

/**
 * The name tag of an era: a swatch with its colour and pattern, and its German name.
 * @param era The era.
 * @returns The tag.
 */
export function eraChip(era: Pick<Era, "id" | "term">): HTMLElement
{
    return el("span", { class: `era-chip era-${era.id}` }, el("span", { class: "era-swatch", "aria-hidden": "true" }), germanSpan(era.term, "era-name"));
}

/**
 * What stands under the name tags of eras: their names in the language of the site and their years. A name that says
 * the same as its German name tag is left out, so the German page does not say everything twice.
 * @param eras The eras the note is about: one, or the two halves of the division.
 * @returns The note.
 */
export function eraNote(eras: readonly Era[]): string
{
    const names = eras.filter((era) => era.text !== era.term).map((era) => era.text);
    const years = eraYears(eras[0]);
    return names.length === 0 ? years : t("learn.era.note", { name: names.join(" / "), years });
}

/**
 * The eras with their names and years, as a key to the colours.
 * @param eras Every era.
 * @returns The list.
 */
export function renderEraLegend(eras: readonly Era[]): HTMLElement
{
    return el("ul", { class: "era-legend", "aria-label": t("learn.timeline.legend") },
        ...eras.map((era) => el("li", {}, eraChip(era), el("span", { class: "era-note" }, eraNote([era])))));
}

/** How a timeline is drawn. */
export interface ChronologyOptions
{
    /** Start of the ids of its elements, unique on the page. */
    id: string;
    /** Whether the dates are covered, to be recalled. */
    hidden: boolean;
    /** The events whose date was uncovered. */
    revealed: ReadonlySet<string>;
    /** Uncovers the date of an event. */
    onReveal(eventId: string): void;
}

/**
 * Draws events as a timeline.
 * @param events The events, in the order of time.
 * @param eras Every era.
 * @param options Ids, and what is covered.
 * @returns The list.
 */
export function renderChronology(events: readonly TimelineEvent[], eras: readonly Era[], options: ChronologyOptions): HTMLElement
{
    const list = el("ol", { class: "chrono" });
    let previous: TimelineEvent | undefined;
    for (const event of events)
    {
        const group = eraGroup(event.era);
        if (!previous || eraGroup(previous.era) !== group)
        {
            const members = eras.filter((era) => eraGroup(era.id) === group);
            list.append(el("li", { class: `chrono-era group-${group}` },
                el("span", { class: "chrono-rail", "aria-hidden": "true" }, el("span", { class: "rail-west" }), el("span", { class: "rail-east" })),
                el("span", { class: "chrono-era-names" }, ...members.map((era) => eraChip(era))),
                el("span", { class: "era-note" }, eraNote(members))));
        }
        else if (event.year - previous.year >= CHRONO_GAP_MIN)
        {
            list.append(el("li", { class: `chrono-gap group-${group}` },
                el("span", { class: "chrono-rail", "aria-hidden": "true" }, el("span", { class: "rail-west" }), el("span", { class: "rail-east" })),
                el("span", { class: "chrono-gap-text" }, i18n.plural("learn.chrono.gap", event.year - previous.year))));
        }
        const covered = options.hidden && !options.revealed.has(event.id);
        const when = el("span", { class: "chrono-when" },
            el("span", { class: covered ? "chrono-date is-off" : "chrono-date", "aria-hidden": covered ? "true" : false }, formatWhen(event)),
            covered
                ? el("button", {
                    id: `${options.id}-show-${event.id}`,
                    class: "secondary sm chrono-show",
                    type: "button",
                    "aria-label": t("learn.chrono.showDate", { event: event.term }),
                    onclick: () => options.onReveal(event.id),
                }, t("learn.chrono.hiddenMark"))
                : null);
        const side = event.era === "west" ? t("learn.side.west") : (event.era === "east" ? t("learn.side.east") : "");
        list.append(el("li", { id: `${options.id}-${event.id}`, class: `chrono-row group-${group} era-${event.era}` },
            el("span", { class: "chrono-rail", "aria-hidden": "true" }, el("span", { class: "rail-west" }), el("span", { class: "rail-east" }), el("span", { class: "rail-dot" })),
            when,
            el("span", { class: "chrono-body" },
                germanSpan(event.term, "chrono-term"),
                el("span", { class: "chrono-text" }, ...richNodes(event.text)),
                side || event.europe
                    ? el("span", { class: "chrono-tags" },
                        side ? el("span", { class: `tag side-tag era-${event.era}` }, side) : null,
                        event.europe ? el("span", { class: "tag europe-tag" }, t("learn.side.europe")) : null)
                    : null)));
        previous = event;
    }
    return list;
}
