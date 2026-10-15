import { el, svg, twoStepLabel } from "../dom";
import { t } from "../i18n";
import { STATES } from "../states";
import { germanSpan } from "./richText";
import type { MapData, MapView, MapsFile } from "./types";

/**
 * The maps of the Learn tab. A map is a picture plus a numbered list below it: the regions carry numbers, as the
 * pictures of the test do, and the list says what each number is. The names in the list can be covered, to be said
 * from memory and uncovered one by one. The list is the part that works with a keyboard and a screen reader; the
 * picture answers to a tap as well.
 */

/** How a region is filled: a colour and, where two fills must be told apart without colour, a pattern. */
export type MapGroup = "plain" | "other" | "home" | "west" | "east" | "berlin" | "zone-uk" | "zone-su" | "zone-us" | "zone-fr";

/** The patterns, by the group that uses them. A group that is not listed is filled with a plain colour. */
const PATTERNS: Partial<Record<MapGroup, "stripes" | "backstripes" | "dots" | "checks">> = {
    east: "stripes",
    berlin: "checks",
    "zone-su": "stripes",
    "zone-uk": "backstripes",
    "zone-fr": "dots",
};

/** Size of one tile of a pattern, and of the marks in it, in the units of the drawing area. */
const PATTERN_SIZE = 12;
const PATTERN_DOT = 2;
/** A slanted stripe reaches this part of a tile across a corner. */
const PATTERN_CORNER = 4;

/** Radius of the disc behind a number, of the mark of a town, and the size of the numbers, in the units of the drawing area. */
const LABEL_RADIUS = 21;
const POINT_RADIUS = 6;

/** The five states that belonged to the GDR. East Berlin did too: Berlin was divided. */
const EAST_STATES = ["brandenburg", "mecklenburg-vorpommern", "sachsen", "sachsen-anhalt", "thueringen"];

/** The occupation zones of 1945 with their states, numbered as in the picture of the catalogue. */
const ZONES: { id: string; number: string; group: MapGroup; regions: string[]; label: string }[] = [
    { id: "zone-uk", number: "1", group: "zone-uk", regions: ["schleswig-holstein", "hamburg", "niedersachsen", "nordrhein-westfalen"], label: "niedersachsen" },
    { id: "zone-su", number: "2", group: "zone-su", regions: ["mecklenburg-vorpommern", "brandenburg", "sachsen-anhalt", "sachsen", "thueringen"], label: "sachsen-anhalt" },
    { id: "zone-us", number: "3", group: "zone-us", regions: ["bayern", "hessen", "bremen", "bw-north"], label: "bayern" },
    { id: "zone-fr", number: "4", group: "zone-fr", regions: ["rheinland-pfalz", "saarland", "bw-south"], label: "rheinland-pfalz" },
];

/** The mark of Berlin on the map of the zones: not a number, because the picture of the catalogue numbers only the four zones. */
const BERLIN_MARK = "B";

/** The nine neighbours of Germany, clockwise from the north. */
const NEIGHBOURS = ["dk", "pl", "cz", "at", "ch", "fr", "lu", "be", "nl"];

/** The three places where the European Parliament works. */
const PARLIAMENT_PLACES = ["strasbourg", "luxembourg", "brussels"];

/** The capital of each state, in German. */
const CAPITALS: Record<string, string> = {
    "baden-wuerttemberg": "Stuttgart", bayern: "München", berlin: "Berlin", brandenburg: "Potsdam", bremen: "Bremen", hamburg: "Hamburg",
    hessen: "Wiesbaden", "mecklenburg-vorpommern": "Schwerin", niedersachsen: "Hannover", "nordrhein-westfalen": "Düsseldorf",
    "rheinland-pfalz": "Mainz", saarland: "Saarbrücken", sachsen: "Dresden", "sachsen-anhalt": "Magdeburg", "schleswig-holstein": "Kiel", thueringen: "Erfurt",
};

/** One line of the list below a map. */
export interface MapEntry
{
    id: string;
    /** What the map shows at its place: a number, or a letter. */
    number: string;
    /** The German name. */
    term: string;
    /** The name in the language of the site, when it differs. */
    text?: string;
    /** More about it, for example the capital of a state. */
    detail?: string;
    group: MapGroup;
    /** The regions that light up with it. */
    regions: string[];
    /** Where its number goes: the label of this region, or this point. */
    anchor: [number, number];
}

/** A map, ready to be drawn. */
export interface MapModel
{
    data: MapData;
    /** Every region that is drawn, with its fill. */
    regions: { id: string; group: MapGroup }[];
    entries: MapEntry[];
    /** Towns marked with a small dot: the capitals of the states. */
    dots: [number, number][];
    /** The fills that need explaining, with the name of each. */
    legend: { group: MapGroup; term: string; text: string }[];
}

/** What a map needs to know about names. */
export interface MapNames
{
    /** The name of a state in the language of the site. */
    state(id: string): string;
    /** The German name of a place of the maps and its name in the language of the site. */
    place(id: string): { term: string; text: string };
}

/**
 * The name in the language of the site, or nothing when it says the same as the German name.
 * @param term German name.
 * @param text Name in the language of the site.
 * @returns The second name, when there is something to add.
 */
function second(term: string, text: string): { text?: string }
{
    return text === term ? {} : { text };
}

/**
 * Builds the map of the 16 states in one of its three colourings.
 * @param view "states", "east" or "home".
 * @param data The shapes.
 * @param names Names.
 * @param home The user's state, which the "home" view marks.
 * @returns The map.
 */
function statesModel(view: MapView, data: MapData, names: MapNames, home: string): MapModel
{
    const groupOf = (id: string): MapGroup =>
    {
        if (view === "east")
        {
            return id === "berlin" ? "berlin" : (EAST_STATES.includes(id) ? "east" : "west");
        }
        return view === "home" && id === home ? "home" : "plain";
    };
    const entries = STATES.map((state, index): MapEntry => ({
        id: state.id,
        number: String(index + 1),
        term: state.name,
        ...second(state.name, names.state(state.id)),
        detail: CAPITALS[state.id],
        group: groupOf(state.id),
        regions: [state.id],
        anchor: data.regions[state.id].label as [number, number],
    }));
    const legend = view === "east"
        ? (["west", "east", "berlin"] as const).map((group) => ({ group, ...names.place(group === "berlin" ? "berlin-divided" : group) }))
        : [];
    return { data, regions: STATES.map((state) => ({ id: state.id, group: groupOf(state.id) })), entries, dots: STATES.map((state) => data.points[state.id]), legend };
}

/**
 * Builds the map of the four occupation zones of 1945.
 * @param data The shapes.
 * @param names Names.
 * @returns The map.
 */
function zonesModel(data: MapData, names: MapNames): MapModel
{
    const entries = ZONES.map((zone): MapEntry =>
    {
        const name = names.place(zone.id);
        return { id: zone.id, number: zone.number, term: name.term, ...second(name.term, name.text), group: zone.group, regions: zone.regions, anchor: data.regions[zone.label].label as [number, number] };
    });
    const berlin = names.place("berlin-sectors");
    entries.push({ id: "berlin-sectors", number: BERLIN_MARK, term: berlin.term, ...second(berlin.term, berlin.text), group: "berlin", regions: ["berlin"], anchor: data.regions.berlin.label as [number, number] });
    return {
        data,
        regions: [...ZONES.flatMap((zone) => zone.regions.map((id) => ({ id, group: zone.group }))), { id: "berlin", group: "berlin" }],
        entries,
        dots: [],
        legend: [],
    };
}

/**
 * Builds the map of Germany and its neighbours, with the neighbours or the places of the European Parliament numbered.
 * @param view "neighbours" or "parliament".
 * @param data The shapes.
 * @param names Names.
 * @returns The map.
 */
function europeModel(view: MapView, data: MapData, names: MapNames): MapModel
{
    const regions: { id: string; group: MapGroup }[] = [{ id: "other", group: "other" }, ...NEIGHBOURS.map((id) => ({ id, group: "plain" as const })), { id: "de", group: "home" }];
    const numbered = view === "parliament" ? PARLIAMENT_PLACES : NEIGHBOURS;
    const entries = numbered.map((id, index): MapEntry =>
    {
        const name = names.place(id);
        return {
            id,
            number: String(index + 1),
            term: name.term,
            ...second(name.term, name.text),
            group: "plain",
            regions: view === "parliament" ? [] : [id],
            anchor: view === "parliament" ? data.points[id] : data.regions[id].label as [number, number],
        };
    });
    const germany = names.place("de");
    return { data, regions, entries, dots: [], legend: [{ group: "home", term: germany.term, text: germany.text }] };
}

/**
 * Builds a map.
 * @param view Which map, and how it is coloured.
 * @param maps The shapes.
 * @param names Names.
 * @param home The user's state.
 * @returns The map, ready to be drawn.
 */
export function mapModel(view: MapView, maps: MapsFile, names: MapNames, home: string): MapModel
{
    switch (view)
    {
        case "states":
        case "east":
        case "home":
            return statesModel(view, maps.germany, names, home);
        case "zones":
            return zonesModel(maps.germany, names);
        case "neighbours":
        case "parliament":
            return europeModel(view, maps.europe, names);
    }
}

/**
 * One tile of a pattern.
 * @param id Id of the pattern.
 * @param group The group it fills.
 * @param kind The pattern.
 * @returns The pattern element.
 */
function patternTile(id: string, group: MapGroup, kind: "stripes" | "backstripes" | "dots" | "checks"): SVGElement
{
    const size = PATTERN_SIZE;
    const half = size / 2;
    // A slanted line is drawn once through the tile and once across each of the two corners it leaves open, so the stripes of neighbouring tiles join without a notch.
    const corner = size / PATTERN_CORNER;
    const rising = `M${-corner} ${corner}L${corner} ${-corner}M0 ${size}L${size} 0M${size - corner} ${size + corner}L${size + corner} ${size - corner}`;
    const falling = `M${-corner} ${size - corner}L${corner} ${size + corner}M0 0L${size} ${size}M${size - corner} ${-corner}L${size + corner} ${corner}`;
    const marks: Record<typeof kind, SVGElement[]> = {
        stripes: [svg("path", { class: "pat-ink", d: rising })],
        backstripes: [svg("path", { class: "pat-ink", d: falling })],
        dots: [svg("circle", { class: "pat-dot", cx: String(half), cy: String(half), r: String(PATTERN_DOT) })],
        checks: [svg("path", { class: "pat-ink", d: `M0 ${half}H${size}M${half} 0V${size}` })],
    };
    return svg("pattern", { id, class: `pat pat-${group}`, width: String(size), height: String(size), patternUnits: "userSpaceOnUse" },
        svg("rect", { class: "pat-bg", width: String(size), height: String(size) }), ...marks[kind]);
}

/**
 * A small swatch that shows how a group is filled.
 * @param mapId Id of the map whose patterns it uses.
 * @param group The group.
 * @returns The swatch.
 */
function swatch(mapId: string, group: MapGroup): SVGElement
{
    const size = String(PATTERN_SIZE * 2);
    return svg("svg", { class: "map-swatch", viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true", focusable: "false" },
        svg("rect", { class: `region g-${group}`, width: size, height: size, ...(PATTERNS[group] ? { fill: `url(#${mapId}-pat-${group})` } : {}) }));
}

/** How a map is drawn. */
export interface MapOptions
{
    /** Id of the map, unique on the page. */
    id: string;
    /** What the map shows, as its accessible name. */
    label: string;
    /** Whether the names of the list are covered. */
    covered: boolean;
    /** The entries whose name was uncovered. */
    revealed: ReadonlySet<string>;
    /** The entry that is picked, or null. */
    picked: string | null;
    /** Picks an entry, which also uncovers its name. */
    onPick(entryId: string): void;
    /** Covers or uncovers all names. */
    onCover(covered: boolean): void;
}

/**
 * Draws a map with its list.
 * @param model The map.
 * @param options Ids and what is covered and picked.
 * @returns The figure.
 */
export function renderMap(model: MapModel, options: MapOptions): HTMLElement
{
    const { data } = model;
    const picked = model.entries.find((entry) => entry.id === options.picked);
    const entryOf = (region: string): MapEntry | undefined => model.entries.find((entry) => entry.regions.includes(region));
    const groups = [...new Set(model.regions.map((region) => region.group))];
    const drawing = svg("svg", { class: "map", viewBox: `0 0 ${data.width} ${data.height}`, role: "img", "aria-label": options.label },
        svg("defs", {}, ...groups.flatMap((group) =>
        {
            const kind = PATTERNS[group];
            return kind ? [patternTile(`${options.id}-pat-${group}`, group, kind)] : [];
        })),
        ...model.regions.map((region) =>
        {
            const entry = entryOf(region.id);
            return svg("path", {
                class: `region g-${region.group}${picked?.regions.includes(region.id) ? " is-picked" : ""}${entry ? " is-entry" : ""}`,
                d: data.regions[region.id].d,
                "fill-rule": "evenodd",
                ...(PATTERNS[region.group] ? { fill: `url(#${options.id}-pat-${region.group})` } : {}),
                ...(entry ? { onclick: () => options.onPick(entry.id) } : {}),
            });
        }),
        ...model.dots.map(([x, y]) => svg("circle", { class: "map-dot", cx: String(x), cy: String(y), r: String(POINT_RADIUS) })),
        ...model.entries.map((entry) => svg("g", { class: `map-label${entry.id === options.picked ? " is-picked" : ""}`, onclick: () => options.onPick(entry.id) },
            svg("circle", { cx: String(entry.anchor[0]), cy: String(entry.anchor[1]), r: String(LABEL_RADIUS) }),
            svg("text", { x: String(entry.anchor[0]), y: String(entry.anchor[1]), "text-anchor": "middle", "dominant-baseline": "central" }, entry.number))));

    // A swatch stands in front of the number of an entry whose fill needs telling apart. When one entry has it, every line keeps its room, so the numbers stay in one column.
    const marked = (entry: MapEntry): boolean => PATTERNS[entry.group] !== undefined || entry.group !== "plain";
    const list = el("ol", { class: model.entries.some(marked) ? "map-list has-swatches" : "map-list" }, ...model.entries.map((entry) =>
    {
        const hidden = options.covered && !options.revealed.has(entry.id);
        return el("li", {},
            el("button", {
                id: `${options.id}-entry-${entry.id}`,
                class: entry.id === options.picked ? "map-entry is-picked" : "map-entry",
                type: "button",
                "aria-pressed": String(entry.id === options.picked),
                onclick: () => options.onPick(entry.id),
            },
                el("span", { class: "map-no" }, marked(entry) ? swatch(options.id, entry.group) : null, el("span", { dir: "ltr" }, entry.number)),
                el("span", { class: "map-name" },
                    el("span", { class: hidden ? "map-name-text is-off" : "map-name-text", "aria-hidden": hidden ? "true" : false },
                        germanSpan(entry.term, "map-term"),
                        entry.text ? el("span", { class: "map-text" }, entry.text) : null,
                        entry.detail ? germanSpan(entry.detail, "map-detail") : null),
                    hidden ? el("span", { class: "map-hidden" }, t("learn.map.hidden")) : null)));
    }));

    return el("div", { class: "map-figure", id: options.id },
        drawing,
        model.legend.length > 0
            ? el("ul", { class: "map-legend" }, ...model.legend.map((item) => el("li", {},
                swatch(options.id, item.group), germanSpan(item.term, "map-term"), item.text === item.term ? null : el("span", { class: "map-text" }, item.text))))
            : null,
        el("div", { class: "map-tools" },
            el("button", {
                id: `${options.id}-cover`,
                class: "secondary sm chip-button",
                type: "button",
                "aria-pressed": String(options.covered),
                onclick: () => options.onCover(!options.covered),
            }, t("learn.map.cover")),
            el("p", { class: "hint" }, ...twoStepLabel(t("learn.map.hint"), t("learn.map.coverHint"), options.covered))),
        list);
}
