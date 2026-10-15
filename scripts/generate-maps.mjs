// Draws the maps of the Learn tab from Natural Earth data (public domain, naturalearthdata.com) and writes them as
// compact SVG paths to data/teach/maps.json. Run it again only when a map has to change. The source files are large and
// are not kept in this repository: download them once and name the folder.
//
//   ne_10m_admin_1_states_provinces.geojson   the 16 federal states
//   ne_10m_admin_0_countries.geojson          Germany and the countries around it
//   (both from https://github.com/nvkelso/natural-earth-vector, folder geojson)
//
//   node scripts/generate-maps.mjs <folder with the two files>
import { readFileSync, writeFileSync } from "node:fs";
import { boundsOf, clipByLine, clipToBox, fit, pathOf, project, ringsOf, snap } from "./lib/geo.mjs";

/** Where the maps go. */
const OUT = "data/teach/maps.json";

/** Width of both maps, in the units of their drawing area. A whole number of these is the grid the shapes snap to. */
const WIDTH = 600;

/** Free room around the map of Germany. */
const MARGIN = 8;

/** The middle of the map of Germany. */
const GERMANY_CENTRE = { lon: 10.4, lat: 51.2 };

/** The middle of the map of Germany and its neighbours, and the corners of what it shows. */
const EUROPE_CENTRE = { lon: 12.0, lat: 51.3 };
const EUROPE_FRAME = { west: [2.0, 51.0], east: [24.4, 52.0], north: [12.0, 58.2], south: [12.0, 45.4] };

/** Where the short name of each state is written (longitude, latitude): inside the state, clear of its capital and of Berlin. */
const STATE_LABELS = {
    "schleswig-holstein": [9.7, 54.2], hamburg: [10.02, 53.55], "mecklenburg-vorpommern": [12.6, 53.8], bremen: [8.8, 53.1],
    niedersachsen: [9.3, 52.75], berlin: [13.4, 52.5], brandenburg: [13.9, 52.0], "sachsen-anhalt": [11.75, 51.95],
    "nordrhein-westfalen": [7.6, 51.5], hessen: [9.0, 50.6], thueringen: [11.0, 50.9], sachsen: [13.4, 51.05],
    "rheinland-pfalz": [7.4, 49.9], saarland: [6.95, 49.38], "baden-wuerttemberg": [9.0, 48.5], bayern: [11.5, 48.9],
};

/** The capital of each state (longitude, latitude). */
const CAPITALS = {
    "baden-wuerttemberg": [9.18, 48.78], bayern: [11.58, 48.14], berlin: [13.4, 52.52], brandenburg: [13.06, 52.4],
    bremen: [8.8, 53.08], hamburg: [9.99, 53.55], hessen: [8.24, 50.08], "mecklenburg-vorpommern": [11.41, 53.63],
    niedersachsen: [9.73, 52.37], "nordrhein-westfalen": [6.78, 51.23], "rheinland-pfalz": [8.27, 50.0], saarland: [7.0, 49.23],
    sachsen: [13.74, 51.05], "sachsen-anhalt": [11.63, 52.13], "schleswig-holstein": [10.14, 54.32], thueringen: [11.03, 50.98],
};

/**
 * The line that roughly divided Baden-Württemberg between the American zone (north) and the French zone (south) from 1945:
 * it followed the motorway from Karlsruhe by Stuttgart to Ulm. A schematic line is enough for a map of the four zones.
 */
const ZONE_LINE = { from: [8.05, 48.93], to: [10.25, 48.32] };

/** Germany and its nine neighbours, by the code used in the map, with the place of the label (longitude, latitude). */
const COUNTRIES = {
    DEU: { id: "de", label: [10.3, 51.0] }, DNK: { id: "dk", label: [9.2, 56.1] }, POL: { id: "pl", label: [19.3, 52.2] },
    CZE: { id: "cz", label: [15.3, 49.8] }, AUT: { id: "at", label: [14.3, 47.55] }, CHE: { id: "ch", label: [8.2, 46.8] },
    FRA: { id: "fr", label: [4.4, 48.0] }, LUX: { id: "lu", label: [6.1, 49.77] }, BEL: { id: "be", label: [4.6, 50.6] },
    NLD: { id: "nl", label: [5.6, 52.3] },
};

/** The three places where the European Parliament works (longitude, latitude). */
const EUROPE_POINTS = { strasbourg: [7.75, 48.58], luxembourg: [6.13, 49.61], brussels: [4.35, 50.85] };

/**
 * Rounds a place to the grid.
 * @param {number[]} point A point in picture units.
 * @returns {[number, number]} Whole numbers.
 */
function whole(point)
{
    return [Math.round(point[0]), Math.round(point[1])];
}

/**
 * The map of the 16 federal states, with the two halves of Baden-Württemberg for the map of the occupation zones.
 * @param {{ features: { properties: Record<string, string>, geometry: object }[] }} provinces Natural Earth states and provinces.
 * @param {{ id: string, code: string }[]} states The states of the catalogue.
 * @returns {object} The map.
 */
function germanyMap(provinces, states)
{
    const flat = (lonLat) => project(lonLat[0], lonLat[1], GERMANY_CENTRE.lon, GERMANY_CENTRE.lat);
    const shapes = states.map((state) =>
    {
        const feature = provinces.features.find((entry) => entry.properties.iso_3166_2 === `DE-${state.code}`);
        if (!feature)
        {
            throw new Error(`No shape for ${state.id}`);
        }
        return { id: state.id, rings: ringsOf(feature.geometry).map((ring) => ring.map(flat)) };
    });
    const { height, place } = fit(boundsOf(shapes.flatMap((shape) => shape.rings)), WIDTH, MARGIN);
    const draw = (rings) => pathOf(rings.map((ring) => snap(ring.map(place))));
    const regions = Object.fromEntries(shapes.map((shape) => [shape.id, { d: draw(shape.rings), label: whole(place(flat(STATE_LABELS[shape.id]))) }]));
    const south = shapes.find((shape) => shape.id === "baden-wuerttemberg").rings;
    const [from, to] = [flat(ZONE_LINE.from), flat(ZONE_LINE.to)];
    // North of the line is on its left when walking east, south of it on the left when walking west.
    regions["bw-north"] = { d: draw(south.map((ring) => clipByLine(ring, from, to)).filter((ring) => ring.length > 0)) };
    regions["bw-south"] = { d: draw(south.map((ring) => clipByLine(ring, to, from)).filter((ring) => ring.length > 0)) };
    const points = Object.fromEntries(Object.entries(CAPITALS).map(([id, lonLat]) => [id, whole(place(flat(lonLat)))]));
    return { width: WIDTH, height, regions, points };
}

/**
 * The map of Germany and its neighbours. Every other country in the frame is one grey shape without borders inside it.
 * @param {{ features: { properties: Record<string, string>, geometry: object }[] }} countries Natural Earth countries.
 * @returns {object} The map.
 */
function europeMap(countries)
{
    const flat = (lonLat) => project(lonLat[0], lonLat[1], EUROPE_CENTRE.lon, EUROPE_CENTRE.lat);
    const frame = {
        minX: flat(EUROPE_FRAME.west)[0], maxX: flat(EUROPE_FRAME.east)[0],
        minY: flat(EUROPE_FRAME.south)[1], maxY: flat(EUROPE_FRAME.north)[1],
    };
    const { height, place } = fit(frame, WIDTH, 0);
    const inFrame = (feature) => ringsOf(feature.geometry)
        // A shape on the far side of the globe would be turned inside out by the projection, so only what is near is drawn.
        .filter((ring) => ring.some((point) => Math.abs(point[0] - EUROPE_CENTRE.lon) < 40 && Math.abs(point[1] - EUROPE_CENTRE.lat) < 25))
        .map((ring) => clipToBox(ring.map(flat), frame))
        .filter((ring) => ring.length > 0)
        .map((ring) => snap(ring.map(place)))
        .filter((ring) => ring.length > 0);
    const regions = {};
    const others = [];
    for (const feature of countries.features)
    {
        const known = COUNTRIES[feature.properties.ADM0_A3];
        const rings = inFrame(feature);
        if (known)
        {
            regions[known.id] = { d: pathOf(rings), label: whole(place(flat(known.label))) };
        }
        else
        {
            others.push(...rings);
        }
    }
    regions.other = { d: pathOf(others) };
    const points = Object.fromEntries(Object.entries(EUROPE_POINTS).map(([id, lonLat]) => [id, whole(place(flat(lonLat)))]));
    return { width: WIDTH, height, regions, points };
}

const folder = process.argv[2];
if (!folder)
{
    console.error("Name the folder that holds the two Natural Earth files. See the top of this script.");
    process.exit(1);
}
const states = JSON.parse(readFileSync("data/states.json", "utf8"));
const provinces = JSON.parse(readFileSync(`${folder}/ne_10m_admin_1_states_provinces.geojson`, "utf8"));
const countries = JSON.parse(readFileSync(`${folder}/ne_10m_admin_0_countries.geojson`, "utf8"));
const maps = { germany: germanyMap(provinces, states), europe: europeMap(countries) };
const lines = Object.entries(maps).map(([name, map]) =>
{
    const regions = Object.entries(map.regions).map(([id, region]) => `    ${JSON.stringify(id)}: ${JSON.stringify(region)}`).join(",\n");
    return `${JSON.stringify(name)}: {"width": ${map.width}, "height": ${map.height}, "points": ${JSON.stringify(map.points)}, "regions": {\n${regions}\n}}`;
});
writeFileSync(OUT, `{\n${lines.join(",\n")}\n}\n`);
for (const [name, map] of Object.entries(maps))
{
    console.log(name, `${map.width}x${map.height}`, Object.keys(map.regions).length, "regions");
}
console.log(OUT, `${(readFileSync(OUT, "utf8").length / 1024).toFixed(0)} KB`);
