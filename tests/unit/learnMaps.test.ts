// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mapModel, renderMap, type MapModel, type MapNames, type MapOptions } from "../../src/learn/maps";
import { MAP_VIEWS, type MapView } from "../../src/learn/types";
import { STATES } from "../../src/states";
import { courseFile, courseTexts, mapsFile } from "../helpers/courseFixture";

const MAPS = mapsFile();

/** Names as the course of the tests has them. The states are named in English, Berlin like in German. */
const NAMES: MapNames = {
    state: (id) => (id === "berlin" ? "Berlin" : `EN ${id}`),
    place: (id) => ({ term: courseFile().places[id], text: courseTexts().places[id] }),
};

/**
 * Builds a map of the small course.
 * @param view Which map.
 * @param home The user's state.
 * @returns The map.
 */
function model(view: MapView, home = "bayern"): MapModel
{
    return mapModel(view, MAPS, NAMES, home);
}

/**
 * Draws a map.
 * @param view Which map.
 * @param options What differs from a map with nothing covered and nothing picked.
 * @returns The figure.
 */
function draw(view: MapView, options: Partial<MapOptions> = {}): HTMLElement
{
    return renderMap(model(view), { id: "m", label: "A map", covered: false, revealed: new Set(), picked: null, onPick: () => undefined, onCover: () => undefined, ...options });
}

describe("the maps of the course", () =>
{
    it("can be built for every view the course knows", () =>
    {
        for (const view of MAP_VIEWS)
        {
            const built = model(view);
            expect(built.entries.length, view).toBeGreaterThan(0);
            // Every region that is drawn has a shape, and every number has a place.
            expect(built.regions.every((region) => typeof built.data.regions[region.id]?.d === "string"), view).toBe(true);
            expect(built.entries.every((entry) => entry.anchor.length === 2 && entry.anchor.every((value) => Number.isFinite(value))), view).toBe(true);
            expect(new Set(built.entries.map((entry) => entry.id)).size, view).toBe(built.entries.length);
        }
    });

    it("number the 16 states in the order of the catalogue, with their German name, the name of the site's language and the capital", () =>
    {
        const states = model("states");
        expect(states.entries).toHaveLength(16);
        expect(states.entries.map((entry) => entry.number)).toEqual(Array.from({ length: 16 }, (_, index) => String(index + 1)));
        expect(states.entries.map((entry) => entry.term)).toEqual(STATES.map((state) => state.name));
        expect(states.entries[1]).toMatchObject({ id: "bayern", number: "2", term: "Bayern", text: "EN bayern", detail: "München", group: "plain", regions: ["bayern"] });
        // A name that is the same in both languages is given once.
        expect(states.entries[2]).not.toHaveProperty("text");
        expect(states.entries.map((entry) => entry.detail)).toEqual(["Stuttgart", "München", "Berlin", "Potsdam", "Bremen", "Hamburg", "Wiesbaden", "Schwerin", "Hannover", "Düsseldorf", "Mainz", "Saarbrücken", "Dresden", "Magdeburg", "Kiel", "Erfurt"]);
        expect(states.dots).toHaveLength(16);
        expect(states.legend).toEqual([]);
        expect(states.regions.every((region) => region.group === "plain")).toBe(true);
    });

    it("mark the user's own state on the map of the lesson about it, and no other", () =>
    {
        expect(model("home", "sachsen").regions.filter((region) => region.group === "home").map((region) => region.id)).toEqual(["sachsen"]);
        expect(model("home", "sachsen").entries.find((entry) => entry.id === "sachsen")?.group).toBe("home");
        expect(model("states", "sachsen").regions.some((region) => region.group === "home")).toBe(false);
    });

    it("tell the five states of the former GDR from the west, and divided Berlin from both", () =>
    {
        const east = model("east");
        const idsOf = (group: string): string[] => east.regions.filter((region) => region.group === group).map((region) => region.id);
        expect(idsOf("east")).toEqual(["brandenburg", "mecklenburg-vorpommern", "sachsen", "sachsen-anhalt", "thueringen"]);
        expect(idsOf("berlin")).toEqual(["berlin"]);
        expect(idsOf("west")).toHaveLength(10);
        expect(east.legend).toEqual([
            { group: "west", term: "Bundesrepublik (West)", text: "Federal Republic (West)" },
            { group: "east", term: "DDR (Ost)", text: "GDR (East)" },
            { group: "berlin", term: "Berlin: geteilte Stadt", text: "Berlin: a divided city" },
        ]);
    });

    it("number the four occupation zones as the picture of the catalogue does, and mark Berlin with a letter", () =>
    {
        const zones = model("zones");
        expect(zones.entries.map((entry) => [entry.number, entry.id, entry.term, entry.text])).toEqual([
            ["1", "zone-uk", "Britische Zone", "British zone"],
            ["2", "zone-su", "Sowjetische Zone", "Soviet zone"],
            ["3", "zone-us", "Amerikanische Zone", "American zone"],
            ["4", "zone-fr", "Französische Zone", "French zone"],
            ["B", "berlin-sectors", "Berlin: vier Sektoren", "Berlin: four sectors"],
        ]);
        // Baden-Württemberg did not exist: its north was American, its south French.
        expect(zones.entries[2].regions).toEqual(["bayern", "hessen", "bremen", "bw-north"]);
        expect(zones.entries[3].regions).toEqual(["rheinland-pfalz", "saarland", "bw-south"]);
        expect(zones.regions.map((region) => region.id)).not.toContain("baden-wuerttemberg");
        // Every state of today belongs to exactly one zone, or is Berlin.
        const covered = zones.regions.map((region) => region.id).filter((id) => !id.startsWith("bw-"));
        expect([...covered, "baden-wuerttemberg"].sort()).toEqual(STATES.map((state) => state.id).sort());
        expect(zones.dots).toEqual([]);
    });

    it("number the nine neighbours clockwise from the north, with Germany marked", () =>
    {
        const neighbours = model("neighbours");
        expect(neighbours.entries.map((entry) => entry.term)).toEqual(["Dänemark", "Polen", "Tschechien", "Österreich", "die Schweiz", "Frankreich", "Luxemburg", "Belgien", "die Niederlande"]);
        expect(neighbours.entries.map((entry) => entry.number)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
        expect(neighbours.entries[0]).toMatchObject({ id: "dk", text: "Denmark", regions: ["dk"] });
        expect(neighbours.regions[0]).toEqual({ id: "other", group: "other" });
        expect(neighbours.regions[neighbours.regions.length - 1]).toEqual({ id: "de", group: "home" });
        expect(neighbours.legend).toEqual([{ group: "home", term: "Deutschland", text: "Germany" }]);
    });

    it("number the three places of the European Parliament at their towns, not at a country", () =>
    {
        const parliament = model("parliament");
        expect(parliament.entries.map((entry) => [entry.number, entry.term, entry.text, entry.anchor])).toEqual([
            ["1", "Straßburg", "Strasbourg (France)", [1, 2]],
            ["2", "Luxemburg", "Luxembourg (city)", [3, 4]],
            ["3", "Brüssel", "Brussels (Belgium)", [5, 6]],
        ]);
        expect(parliament.entries.every((entry) => entry.regions.length === 0)).toBe(true);
    });
});

describe("a map on the page", () =>
{
    it("is a picture with a name, and a numbered list that says what each number is", () =>
    {
        const figure = draw("states");
        expect(figure.id).toBe("m");
        const picture = figure.querySelector("svg.map") as SVGElement;
        expect(picture.getAttribute("role")).toBe("img");
        expect(picture.getAttribute("aria-label")).toBe("A map");
        expect(picture.getAttribute("viewBox")).toBe(`0 0 ${MAPS.germany.width} ${MAPS.germany.height}`);
        expect(picture.querySelectorAll("path.region")).toHaveLength(16);
        expect(picture.querySelectorAll("circle.map-dot")).toHaveLength(16);
        expect(Array.from(picture.querySelectorAll(".map-label text")).map((label) => label.textContent)).toEqual(Array.from({ length: 16 }, (_, index) => String(index + 1)));
        const lines = Array.from(figure.querySelectorAll<HTMLButtonElement>(".map-list button"));
        expect(lines).toHaveLength(16);
        expect(lines[1].id).toBe("m-entry-bayern");
        expect(lines[1].querySelector(".map-no")?.textContent).toBe("2");
        expect(lines[1].querySelector(".map-term")?.textContent).toBe("Bayern");
        expect((lines[1].querySelector(".map-term") as HTMLElement).lang).toBe("de");
        expect(lines[1].querySelector(".map-text")?.textContent).toBe("EN bayern");
        expect(lines[1].querySelector(".map-detail")?.textContent).toBe("München");
        expect(lines[2].querySelector(".map-text")).toBeNull();
    });

    it("has no legend and no swatches where one fill says it all", () =>
    {
        const figure = draw("states");
        expect(figure.querySelector(".map-legend")).toBeNull();
        expect(figure.querySelector(".map-list")?.className).toBe("map-list");
        expect(figure.querySelector(".map-list .map-swatch")).toBeNull();
        expect(figure.querySelector("pattern")).toBeNull();
    });

    it("tells fills apart by a pattern as well as a colour, and explains them in a legend", () =>
    {
        const figure = draw("east");
        expect(Array.from(figure.querySelectorAll("pattern")).map((pattern) => pattern.id).sort()).toEqual(["m-pat-berlin", "m-pat-east"]);
        expect(figure.querySelector("pattern#m-pat-east")?.getAttribute("class")).toBe("pat pat-east");
        const east = Array.from(figure.querySelectorAll("path.region.g-east"));
        expect(east).toHaveLength(5);
        expect(east.every((region) => region.getAttribute("fill") === "url(#m-pat-east)")).toBe(true);
        // The west is one plain colour and names no pattern.
        expect(Array.from(figure.querySelectorAll("path.region.g-west")).every((region) => !region.hasAttribute("fill"))).toBe(true);
        const legend = Array.from(figure.querySelectorAll(".map-legend li"));
        expect(legend.map((item) => item.querySelector(".map-term")?.textContent)).toEqual(["Bundesrepublik (West)", "DDR (Ost)", "Berlin: geteilte Stadt"]);
        expect(legend.map((item) => item.querySelector(".map-text")?.textContent)).toEqual(["Federal Republic (West)", "GDR (East)", "Berlin: a divided city"]);
        expect(legend.every((item) => item.querySelector("svg.map-swatch") !== null)).toBe(true);
        // Every line of the list has a swatch in front of its number, so the numbers stay in one column.
        expect(figure.querySelector(".map-list")?.className).toBe("map-list has-swatches");
        expect(figure.querySelectorAll(".map-list .map-swatch")).toHaveLength(16);
    });

    it("draws each of the four zones with a pattern of its own, and leaves the name of a legend entry out when it says nothing new", () =>
    {
        const zones = draw("zones");
        expect(Array.from(zones.querySelectorAll("pattern")).map((pattern) => pattern.id).sort()).toEqual(["m-pat-berlin", "m-pat-zone-fr", "m-pat-zone-su", "m-pat-zone-uk"]);
        expect(zones.querySelector("#m-pat-zone-fr circle.pat-dot")).not.toBeNull();
        expect(zones.querySelector("#m-pat-zone-uk path.pat-ink")?.getAttribute("d")).toContain("M0 0L12 12");
        expect(zones.querySelector("#m-pat-zone-su path.pat-ink")?.getAttribute("d")).toContain("M0 12L12 0");
        expect(zones.querySelector("#m-pat-berlin path.pat-ink")?.getAttribute("d")).toBe("M0 6H12M6 0V12");
        expect(Array.from(zones.querySelectorAll(".map-label text")).map((label) => label.textContent)).toEqual(["1", "2", "3", "4", "B"]);
        const german = renderMap({ ...model("neighbours"), legend: [{ group: "home", term: "Deutschland", text: "Deutschland" }] },
            { id: "g", label: "Karte", covered: false, revealed: new Set(), picked: null, onPick: () => undefined, onCover: () => undefined });
        expect(german.querySelector(".map-legend .map-term")?.textContent).toBe("Deutschland");
        expect(german.querySelector(".map-legend .map-text")).toBeNull();
    });

    it("picks an entry from its line, from its number and from its region", () =>
    {
        const picked: string[] = [];
        const figure = draw("neighbours", { onPick: (id) => picked.push(id) });
        (figure.querySelector("#m-entry-pl") as HTMLButtonElement).click();
        (figure.querySelectorAll(".map-label")[3] as SVGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const regions = Array.from(figure.querySelectorAll("path.region"));
        // Region 0 is the land around, region 1 the first neighbour, the last one Germany itself.
        regions[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        regions[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        regions[regions.length - 1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(picked).toEqual(["pl", "at", "dk"]);
        expect(regions[1].getAttribute("class")).toBe("region g-plain is-entry");
        expect(regions[0].getAttribute("class")).toBe("region g-other");
    });

    it("shows which entry is picked: on its line, on its number and on every region it stands for", () =>
    {
        const figure = draw("zones", { picked: "zone-fr" });
        const line = figure.querySelector("#m-entry-zone-fr") as HTMLButtonElement;
        expect(line.className).toBe("map-entry is-picked");
        expect(line.getAttribute("aria-pressed")).toBe("true");
        expect(figure.querySelector("#m-entry-zone-us")?.getAttribute("aria-pressed")).toBe("false");
        expect(figure.querySelectorAll("path.region.is-picked")).toHaveLength(3);
        expect(figure.querySelectorAll(".map-label.is-picked")).toHaveLength(1);
        expect(draw("zones").querySelector(".is-picked")).toBeNull();
    });

    it("has a button that covers the names, pressed while they are covered, with a hint that says what to do", () =>
    {
        const calls: boolean[] = [];
        const open = draw("states", { onCover: (covered) => calls.push(covered) });
        const button = open.querySelector("#m-cover") as HTMLButtonElement;
        expect(button.textContent).toBe("Cover the names");
        expect(button.getAttribute("aria-pressed")).toBe("false");
        // Both hints are in the page, so the hint keeps its height; the one that applies is the one that is shown and read.
        expect(open.querySelector(".map-tools .hint .swap:not(.is-off)")?.textContent).toBe("Tap a number or a line of the list to see where it is.");
        expect(open.querySelector(".map-tools .hint .swap.is-off")?.getAttribute("aria-hidden")).toBe("true");
        button.click();
        const covered = draw("states", { covered: true, onCover: (value) => calls.push(value) });
        expect(covered.querySelector("#m-cover")?.getAttribute("aria-pressed")).toBe("true");
        expect(covered.querySelector(".map-tools .hint .swap:not(.is-off)")?.textContent).toBe("Say the name, then tap the line to uncover it.");
        (covered.querySelector("#m-cover") as HTMLButtonElement).click();
        expect(calls).toEqual([true, false]);
    });

    it("covers a name without taking its room: the name stays in the line, unpainted and unread, under the words that stand for it", () =>
    {
        const figure = draw("states", { covered: true, revealed: new Set(["bayern"]) });
        const hidden = figure.querySelector("#m-entry-berlin .map-name-text") as HTMLElement;
        expect(hidden.className).toBe("map-name-text is-off");
        expect(hidden.getAttribute("aria-hidden")).toBe("true");
        expect(hidden.textContent).toBe("BerlinBerlin");
        expect(figure.querySelector("#m-entry-berlin .map-hidden")?.textContent).toBe("Tap to show");
        // The number stays: it is what the user answers to.
        expect(figure.querySelector("#m-entry-berlin .map-no")?.textContent).toBe("3");
        const shown = figure.querySelector("#m-entry-bayern .map-name-text") as HTMLElement;
        expect(shown.className).toBe("map-name-text");
        expect(shown.hasAttribute("aria-hidden")).toBe(false);
        // The words for a covered name are in every line, only not painted where the name shows: a line is as high as the
        // longer of the two either way, so uncovering moves nothing below it.
        const words = figure.querySelector("#m-entry-bayern .map-hidden") as HTMLElement;
        expect(words.className).toBe("map-hidden is-off");
        expect(words.getAttribute("aria-hidden")).toBe("true");
        expect(figure.querySelectorAll(".map-hidden:not(.is-off)")).toHaveLength(15);
    });
});
