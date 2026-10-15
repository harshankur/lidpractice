import type { CourseFile, CourseTexts, MapsFile, StateFacts } from "../../src/learn/types";

/**
 * A small course for the tests of the Learn tab: two lessons of one chapter with one block of every kind, and the
 * lesson about the user's state. It has the shape of data/teach/course.json and of a file of texts, and nothing of
 * their content, so a test of the code does not break when a lesson is rewritten.
 */

/** The plan of the small course. */
export function courseFile(): CourseFile
{
    return {
        eras: [
            { id: "ns", from: 1933, to: 1945, term: "NS-Diktatur" },
            { id: "west", from: 1949, to: 1990, term: "Bundesrepublik (West)" },
            { id: "east", from: 1949, to: 1990, term: "DDR (Ost)" },
            { id: "unity", from: 1990, to: null, term: "Vereintes Deutschland" },
        ],
        events: [
            { id: "einheit", date: "1990-10-03", era: "unity", questions: [5], term: "Deutsche Einheit" },
            { id: "machtergreifung", date: "1933", era: "ns", questions: [4], term: "Hitler wird Reichskanzler" },
            { id: "gruendung-brd", date: "1949", era: "west", questions: [], term: "Gründung der Bundesrepublik" },
            { id: "gruendung-ddr", date: "1949", era: "east", questions: [], term: "Gründung der DDR" },
            { id: "mauer", date: "1961", era: "east", questions: [], term: "Bau der Berliner Mauer" },
            { id: "euro", date: "2002", era: "unity", europe: true, questions: [], term: "Euro-Bargeld" },
        ],
        places: {
            de: "Deutschland", dk: "Dänemark", pl: "Polen", cz: "Tschechien", at: "Österreich", ch: "die Schweiz", fr: "Frankreich", lu: "Luxemburg", be: "Belgien", nl: "die Niederlande",
            strasbourg: "Straßburg", luxembourg: "Luxemburg", brussels: "Brüssel",
            "zone-uk": "Britische Zone", "zone-su": "Sowjetische Zone", "zone-us": "Amerikanische Zone", "zone-fr": "Französische Zone",
            "berlin-sectors": "Berlin: vier Sektoren", "berlin-divided": "Berlin: geteilte Stadt", west: "Bundesrepublik (West)", east: "DDR (Ost)",
        },
        chapters: [
            {
                id: "basics",
                lessons: [
                    {
                        id: "first",
                        minutes: 4,
                        pre: 1,
                        check: [1, 2],
                        blocks: [
                            { type: "unit", id: "wuerde", questions: [1, 2], term: "die Menschen·würde", de: "Die Würde des Menschen ist unantastbar." },
                            { type: "picture", id: "bild", question: 2 },
                            { type: "compare", id: "tabelle", columns: 3, rows: 2 },
                            { type: "chain", id: "kette", terms: ["der Bund", "das Land"] },
                            { type: "timeline", id: "zeit", events: ["machtergreifung", "einheit"] },
                            { type: "map", id: "karte", map: "states" },
                            { type: "watch", id: "falle" },
                            { type: "unit", id: "ohne-karte", questions: [3], era: "ns", asOf: 2025 },
                            { type: "recall", id: "erinnern", items: 2 },
                        ],
                    },
                    {
                        id: "second",
                        minutes: 3,
                        pre: 4,
                        check: [4],
                        review: 1,
                        blocks: [{ type: "unit", id: "datum", questions: [4, 5], era: "unity", de: "1990" }],
                    },
                ],
            },
            {
                id: "state",
                lessons: [
                    {
                        id: "land",
                        minutes: 6,
                        pre: 9,
                        check: [9, 3],
                        review: 4,
                        template: "state",
                        blocks: [
                            { type: "unit", id: "hauptstadt", task: 7, term: "die Landes·haupt·stadt", variants: { city: { term: "der Stadt·staat", de: "ein Stadtstaat" } } },
                            { type: "picture", id: "lage-bild", task: 8 },
                            { type: "map", id: "lage-karte", map: "home" },
                            { type: "unit", id: "wappen", task: 1 },
                            { type: "unit", id: "landtag", task: 3, term: "der Land·tag", variants: { city: { term: "das Landes·parlament" } } },
                            { type: "watch", id: "achtung" },
                            { type: "recall", id: "erinnern", items: 1 },
                        ],
                    },
                ],
            },
        ],
        variants: { berlin: ["city"] },
    };
}

/** The English texts of the small course. */
export function courseTexts(): CourseTexts
{
    return {
        locale: "en",
        eras: { ns: "Nazi dictatorship", west: "Federal Republic (West)", east: "GDR (East)", unity: "United Germany" },
        events: {
            einheit: { text: "Germany is one state again." },
            machtergreifung: { text: "Hitler becomes {{Reichskanzler}}." },
            "gruendung-brd": { text: "The Federal Republic is founded." },
            "gruendung-ddr": { text: "The GDR is founded." },
            mauer: { text: "The GDR builds the Wall." },
            euro: { text: "People pay with euro notes.", when: "since 2002" },
        },
        places: {
            de: "Germany", dk: "Denmark", pl: "Poland", cz: "Czechia", at: "Austria", ch: "Switzerland", fr: "France", lu: "Luxembourg", be: "Belgium", nl: "the Netherlands",
            strasbourg: "Strasbourg (France)", luxembourg: "Luxembourg (city)", brussels: "Brussels (Belgium)",
            "zone-uk": "British zone", "zone-su": "Soviet zone", "zone-us": "American zone", "zone-fr": "French zone",
            "berlin-sectors": "Berlin: four sectors", "berlin-divided": "Berlin: a divided city", west: "Federal Republic (West)", east: "GDR (East)",
        },
        chapters: {
            basics: { title: "Basics", intro: "Where {{Deutschland}} starts." },
            state: { title: "Your state", intro: "Ten questions about one state." },
        },
        lessons: {
            first: {
                title: "Dignity and the {{Grundgesetz}}",
                big: "The state protects every person.",
                blocks: {
                    wuerde: {
                        q: "What does Article 1 protect?",
                        body: "It protects human dignity. This is **not** only for citizens.",
                        meaning: "human dignity",
                        case: "The police may not torture anyone.",
                        front: "What does Article 1 of the {{Grundgesetz}} protect?",
                        back: "Human dignity is inviolable.",
                        note: "Article 1 comes first.",
                    },
                    bild: { caption: "The picture of question 2." },
                    tabelle: { title: "Two levels", head: ["", "{{Bund}}", "{{Land}}"], rows: [["Task", "defence", "schools"], ["Head", "chancellor", "minister president"]] },
                    kette: { steps: ["the federation", "the state"], links: ["stands above"], caption: "Who stands above whom." },
                    karte: { caption: "The 16 federal states." },
                    falle: { text: "A wrong option says **never**." },
                    "ohne-karte": { q: "When did the dictatorship begin?", body: "It began in 1933." },
                    erinnern: { items: [{ q: "Which article comes first?", a: "Article 1." }, { q: "Who is protected?", a: "Every person." }] },
                },
            },
            second: {
                title: "Two dates",
                big: "Two dates frame the story.",
                blocks: { datum: { q: "When was Germany united?", body: "On 3 October 1990.", front: "In which year was Germany united?", back: "1990" } },
            },
            land: {
                title: "Your state: {state}",
                big: "Every state has its own symbols.",
                blocks: {
                    hauptstadt: {
                        q: "What is the capital of the state?",
                        body: "Every state has a capital.",
                        meaning: "the capital of a state",
                        front: "{state}: what is the capital?",
                        variants: { city: { q: "What is a city-state?", body: "A city that is a federal state.", meaning: "a city that is a state", front: "{state}: what kind of state is it?", back: "a city-state" } },
                    },
                    "lage-bild": { caption: "Here {state} is number {answer}." },
                    "lage-karte": { caption: "{state} among the 16 federal states." },
                    wappen: { q: "What does the coat of arms show?", body: "{arms}", front: "{state}: what does the coat of arms show?", back: "{arms}" },
                    landtag: { q: "For how many years is the parliament elected?", body: "The people elect it.", meaning: "the parliament of a state", front: "{state}: for how many years?" },
                    achtung: { text: "Every state has its own answer, {state} too." },
                    erinnern: { items: [{ q: "Which state is yours?", a: "{state}." }] },
                },
            },
        },
        arms: { bayern: "White and blue diamonds.", berlin: "A black bear on a white shield." },
    };
}

/**
 * What the lesson about the user's state knows about a state, made up: task n is question 320 + n, its answer is "Antwort n".
 * @param id State id.
 * @param translated Whether the answers have a translation.
 * @returns The facts.
 */
export function stateFacts(id = "bayern", translated = true): StateFacts
{
    return {
        id,
        name: id === "berlin" ? "Berlin" : "Bavaria",
        question: (task) => STATE_QUESTION_BASE + task,
        answer: (task) => `Antwort ${task}`,
        translation: (task) => (translated ? `answer ${task}` : undefined),
    };
}

/** The made-up number before the first question of the made-up state. */
export const STATE_QUESTION_BASE = 320;

/** The ids of the 16 states, in the order of the catalogue. */
const STATE_IDS = [
    "baden-wuerttemberg", "bayern", "berlin", "brandenburg", "bremen", "hamburg", "hessen", "mecklenburg-vorpommern", "niedersachsen", "nordrhein-westfalen",
    "rheinland-pfalz", "saarland", "sachsen", "sachsen-anhalt", "schleswig-holstein", "thueringen",
];

/** Small maps with every shape and place the views ask for: each state is a square in a row. */
export function mapsFile(): MapsFile
{
    const square = (index: number): { d: string; label: [number, number] } => ({ d: `M${index * TILE} 0h${TILE}v${TILE}h-${TILE}z`, label: [index * TILE + TILE / 2, TILE / 2] });
    const germany: MapsFile["germany"] = { width: STATE_IDS.length * TILE, height: TILE, regions: {}, points: {} };
    STATE_IDS.forEach((id, index) =>
    {
        germany.regions[id] = square(index);
        germany.points[id] = [index * TILE + 1, 1];
    });
    germany.regions["bw-north"] = { d: "M0 0h5v5h-5z" };
    germany.regions["bw-south"] = { d: "M0 5h5v5h-5z" };
    const countries = ["de", "dk", "pl", "cz", "at", "ch", "fr", "lu", "be", "nl"];
    const europe: MapsFile["europe"] = { width: countries.length * TILE, height: TILE, regions: { other: { d: "M0 0h1v1z" } }, points: { strasbourg: [1, 2], luxembourg: [3, 4], brussels: [5, 6] } };
    countries.forEach((id, index) =>
    {
        europe.regions[id] = square(index);
    });
    return { germany, europe };
}

/** The side of one square of the small maps. */
const TILE = 10;
