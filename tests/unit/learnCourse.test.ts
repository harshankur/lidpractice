import { describe, expect, it } from "vitest";
import { FileError } from "../../src/fetchOnce";
import { CourseBook, CourseError, KNOWN, STATE_LESSON_PREFIX, isCourseFile, isCourseTexts, isMapsFile, yearOf } from "../../src/learn/course";
import { LearnLoader } from "../../src/learn/loader";
import type { Block, CourseFile, CourseTexts, UnitBlock } from "../../src/learn/types";
import type { LearnFiles } from "../../src/types";
import { STATE_QUESTION_BASE, courseFile, courseTexts, mapsFile, stateFacts } from "../helpers/courseFixture";

/**
 * Finds a block of a lesson.
 * @param book The course.
 * @param lesson Lesson id.
 * @param id Block id.
 * @returns The block.
 */
function block(book: CourseBook, lesson: string, id: string): Block
{
    return book.lesson(lesson)?.blocks.find((entry) => entry.id === id) as Block;
}

describe("the files of the course", () =>
{
    it("are recognised by their shape", () =>
    {
        expect(isCourseFile(courseFile())).toBe(true);
        expect(isCourseTexts(courseTexts(), "en")).toBe(true);
        expect(isMapsFile(mapsFile())).toBe(true);
    });

    it("are refused when a part is missing or has the wrong kind", () =>
    {
        const file = courseFile() as unknown as Record<string, unknown>;
        for (const part of ["eras", "events", "chapters", "places", "variants"])
        {
            expect(isCourseFile({ ...file, [part]: undefined }), part).toBe(false);
        }
        expect(isCourseFile({ ...file, chapters: [] })).toBe(false);
        expect(isCourseFile({ ...file, places: [] })).toBe(false);
        expect(isCourseFile({ ...file, chapters: [{ id: "x", lessons: [{ id: "y", blocks: [] }] }] })).toBe(false);
        expect(isCourseFile({ ...file, chapters: [{ id: "x", lessons: "none" }] })).toBe(false);
        expect(isCourseFile({ ...file, chapters: [{ id: 5, lessons: [] }] })).toBe(false);
        expect(isCourseFile({ ...file, chapters: [null] })).toBe(false);
        for (const value of [null, undefined, "course", 5, []])
        {
            expect(isCourseFile(value), String(value)).toBe(false);
        }
    });

    it("refuse texts of another language, of no language the site has, or with a part missing", () =>
    {
        const texts = courseTexts() as unknown as Record<string, unknown>;
        expect(isCourseTexts(texts, "de")).toBe(false);
        expect(isCourseTexts({ ...texts, locale: "xx" }, "xx" as "de")).toBe(false);
        for (const part of ["eras", "events", "places", "chapters", "lessons", "arms"])
        {
            expect(isCourseTexts({ ...texts, [part]: undefined }, "en"), part).toBe(false);
        }
        expect(isCourseTexts(null, "en")).toBe(false);
        expect(isCourseTexts([], "en")).toBe(false);
    });

    it("refuse maps without a size, without shapes, or with a shape that has no outline", () =>
    {
        const maps = mapsFile();
        expect(isMapsFile({ germany: maps.germany })).toBe(false);
        expect(isMapsFile({ ...maps, europe: { ...maps.europe, width: "wide" } })).toBe(false);
        expect(isMapsFile({ ...maps, europe: { ...maps.europe, height: undefined } })).toBe(false);
        expect(isMapsFile({ ...maps, europe: { ...maps.europe, points: null } })).toBe(false);
        expect(isMapsFile({ ...maps, germany: { ...maps.germany, regions: [] } })).toBe(false);
        expect(isMapsFile({ ...maps, germany: { ...maps.germany, regions: { berlin: { label: [1, 2] } } } })).toBe(false);
        expect(isMapsFile({ ...maps, germany: { ...maps.germany, regions: { berlin: null } } })).toBe(false);
        expect(isMapsFile(null)).toBe(false);
    });

    it("name the eras and the maps a file may use", () =>
    {
        expect(KNOWN.eras).toEqual(["ns", "occupation", "west", "east", "unity"]);
        expect(KNOWN.maps).toEqual(["states", "east", "zones", "neighbours", "parliament", "home"]);
    });

    it("read the year a date begins with, whatever follows it", () =>
    {
        expect(yearOf("1945-05-08")).toBe(1945);
        expect(yearOf("1949")).toBe(1949);
        expect(yearOf("1948/1949")).toBe(1948);
        expect(yearOf("1950s")).toBe(1950);
    });
});

describe("CourseBook", () =>
{
    const book = new CourseBook(courseFile(), courseTexts(), stateFacts());

    it("puts chapters and lessons together in teaching order", () =>
    {
        expect(book.locale).toBe("en");
        expect(book.stateId).toBe("bayern");
        expect(book.chapters.map((chapter) => [chapter.id, chapter.title, chapter.intro])).toEqual([
            ["basics", "Basics", "Where {{Deutschland}} starts."],
            ["state", "Your state", "Ten questions about one state."],
        ]);
        expect(book.lessons.map((lesson) => lesson.id)).toEqual(["first", "second", "land-bayern"]);
        expect(book.lessons.map((lesson) => lesson.chapter)).toEqual(["basics", "basics", "state"]);
    });

    it("finds a lesson by its id, its chapter, and its neighbours", () =>
    {
        const [first, second, land] = book.lessons;
        expect(book.lesson("second")).toBe(second);
        expect(book.lesson("nothing")).toBeUndefined();
        expect(book.chapterOf(land).id).toBe("state");
        expect(book.neighbour(first, 1)).toBe(second);
        expect(book.neighbour(second, -1)).toBe(first);
        expect(book.neighbour(first, -1)).toBeUndefined();
        expect(book.neighbour(land, 1)).toBeUndefined();
    });

    it("carries the facts of a lesson: its time, the question to guess, its check and the question that comes back", () =>
    {
        const [first, second] = book.lessons;
        expect(first).toMatchObject({ title: "Dignity and the {{Grundgesetz}}", big: "The state protects every person.", minutes: 4, pre: 1, check: [1, 2], review: null });
        expect(second).toMatchObject({ minutes: 3, pre: 4, check: [4], review: 1 });
        expect(first.questions).toEqual([1, 2, 3]);
        expect(second.questions).toEqual([4, 5]);
    });

    it("finds the lesson and the unit that teach a question", () =>
    {
        expect(book.placeOf(2)).toEqual({ lesson: book.lesson("first"), unit: "wuerde" });
        expect(book.placeOf(3)?.unit).toBe("ohne-karte");
        expect(book.placeOf(5)).toEqual({ lesson: book.lesson("second"), unit: "datum" });
        expect(book.placeOf(STATE_QUESTION_BASE + 7)).toEqual({ lesson: book.lesson("land-bayern"), unit: "hauptstadt" });
        // A question of another state belongs to no lesson of this user.
        expect(book.placeOf(999)).toBeUndefined();
    });

    it("builds a unit from its two halves", () =>
    {
        expect(block(book, "first", "wuerde")).toEqual({
            type: "unit",
            id: "wuerde",
            questions: [1, 2],
            term: "die Menschen·würde",
            q: "What does Article 1 protect?",
            body: "It protects human dignity. This is **not** only for citizens.",
            meaning: "human dignity",
            example: "The police may not torture anyone.",
        });
        expect(block(book, "first", "ohne-karte")).toEqual({ type: "unit", id: "ohne-karte", questions: [3], era: "ns", asOf: 2025, q: "When did the dictatorship begin?", body: "It began in 1933." });
    });

    it("builds every other kind of block", () =>
    {
        expect(block(book, "first", "bild")).toEqual({ type: "picture", id: "bild", question: 2, caption: "The picture of question 2." });
        expect(block(book, "first", "tabelle")).toEqual({ type: "compare", id: "tabelle", title: "Two levels", head: ["", "{{Bund}}", "{{Land}}"], rows: [["Task", "defence", "schools"], ["Head", "chancellor", "minister president"]] });
        expect(block(book, "first", "kette")).toEqual({
            type: "chain",
            id: "kette",
            steps: [{ term: "der Bund", text: "the federation" }, { term: "das Land", text: "the state" }],
            links: ["stands above"],
            caption: "Who stands above whom.",
        });
        expect(block(book, "first", "zeit")).toEqual({ type: "timeline", id: "zeit", events: ["machtergreifung", "einheit"] });
        expect(block(book, "first", "karte")).toEqual({ type: "map", id: "karte", map: "states", caption: "The 16 federal states." });
        expect(block(book, "first", "falle")).toEqual({ type: "watch", id: "falle", text: "A wrong option says **never**." });
        expect(block(book, "first", "erinnern")).toEqual({ type: "recall", id: "erinnern", items: [{ q: "Which article comes first?", a: "Article 1." }, { q: "Who is protected?", a: "Every person." }] });
    });

    it("makes one flash card for every unit that has a front, named after its lesson and unit", () =>
    {
        const first = book.lesson("first");
        expect(first?.cards).toEqual([{
            id: "first/wuerde",
            lesson: "first",
            unit: "wuerde",
            front: "What does Article 1 of the {{Grundgesetz}} protect?",
            german: "Die Würde des Menschen ist unantastbar.",
            back: "Human dignity is inviolable.",
            note: "Article 1 comes first.",
            questions: [1, 2],
        }]);
        expect(book.lesson("second")?.cards).toEqual([{ id: "second/datum", lesson: "second", unit: "datum", front: "In which year was Germany united?", german: "1990", back: "1990", era: "unity", questions: [4, 5] }]);
        expect(book.cards.map((card) => card.id)).toEqual(["first/wuerde", "second/datum", "land-bayern/hauptstadt", "land-bayern/wappen", "land-bayern/landtag"]);
    });

    it("puts the events in the order of time, and keeps the order of the file inside a year", () =>
    {
        expect(book.events.map((event) => event.id)).toEqual(["machtergreifung", "gruendung-brd", "gruendung-ddr", "mauer", "einheit", "euro"]);
        expect(book.event("einheit")).toEqual({ id: "einheit", date: "1990-10-03", era: "unity", questions: [5], term: "Deutsche Einheit", text: "Germany is one state again.", year: 1990 });
        expect(book.event("euro")).toMatchObject({ europe: true, when: "since 2002", year: 2002 });
        expect(book.event("machtergreifung")).not.toHaveProperty("when");
        expect(book.event("nothing")).toBeUndefined();
    });

    it("names the eras in the language of the texts", () =>
    {
        expect(book.eras).toEqual([
            { id: "ns", from: 1933, to: 1945, term: "NS-Diktatur", text: "Nazi dictatorship" },
            { id: "west", from: 1949, to: 1990, term: "Bundesrepublik (West)", text: "Federal Republic (West)" },
            { id: "east", from: 1949, to: 1990, term: "DDR (Ost)", text: "GDR (East)" },
            { id: "unity", from: 1990, to: null, term: "Vereintes Deutschland", text: "United Germany" },
        ]);
    });

    it("names a place in German and in the language of the texts, and falls back to what it has", () =>
    {
        expect(book.place("dk")).toEqual({ term: "Dänemark", text: "Denmark" });
        const texts = courseTexts();
        delete texts.places.dk;
        expect(new CourseBook(courseFile(), texts, stateFacts()).place("dk")).toEqual({ term: "Dänemark", text: "Dänemark" });
        expect(book.place("atlantis")).toEqual({ term: "atlantis", text: "atlantis" });
    });
});

describe("the lesson about the user's state", () =>
{
    const book = new CourseBook(courseFile(), courseTexts(), stateFacts("bayern"));
    const lesson = book.lesson(`${STATE_LESSON_PREFIX}bayern`);

    it("is named after the state and asks the questions of that state", () =>
    {
        expect(STATE_LESSON_PREFIX).toBe("land-");
        expect(lesson).toMatchObject({ id: "land-bayern", title: "Your state: Bavaria", big: "Every state has its own symbols.", pre: STATE_QUESTION_BASE + 9, review: 4 });
        expect(lesson?.check).toEqual([STATE_QUESTION_BASE + 9, STATE_QUESTION_BASE + 3]);
        expect(lesson?.questions).toEqual([7, 1, 3].map((task) => STATE_QUESTION_BASE + task));
    });

    it("shows the catalogue question with each unit, and takes the answer of a card from that question", () =>
    {
        const unit = block(book, "land-bayern", "hauptstadt") as UnitBlock;
        expect(unit).toMatchObject({ questions: [STATE_QUESTION_BASE + 7], shown: STATE_QUESTION_BASE + 7, term: "die Landes·haupt·stadt", q: "What is the capital of the state?" });
        expect(lesson?.cards[0]).toEqual({
            id: "land-bayern/hauptstadt", lesson: "land-bayern", unit: "hauptstadt", front: "Bavaria: what is the capital?", german: "Antwort 7", back: "answer 7", questions: [STATE_QUESTION_BASE + 7],
        });
    });

    it("leaves the translation of an answer out when there is none, and shows the German answer alone", () =>
    {
        const german = new CourseBook(courseFile(), courseTexts(), stateFacts("bayern", false));
        expect(german.lesson("land-bayern")?.cards[0]).toEqual({ id: "land-bayern/hauptstadt", lesson: "land-bayern", unit: "hauptstadt", front: "Bavaria: what is the capital?", german: "Antwort 7", questions: [STATE_QUESTION_BASE + 7] });
        expect(block(german, "land-bayern", "lage-bild")).toMatchObject({ caption: "Here Bavaria is number {{Antwort 8}}." });
    });

    it("fills the state, the answer and the coat of arms into its texts", () =>
    {
        expect(block(book, "land-bayern", "lage-bild")).toEqual({ type: "picture", id: "lage-bild", question: STATE_QUESTION_BASE + 8, caption: "Here Bavaria is number {{Antwort 8}} (answer 8)." });
        expect(block(book, "land-bayern", "lage-karte")).toEqual({ type: "map", id: "lage-karte", map: "home", caption: "Bavaria among the 16 federal states." });
        expect(block(book, "land-bayern", "wappen")).toMatchObject({ body: "White and blue diamonds." });
        expect(block(book, "land-bayern", "achtung")).toEqual({ type: "watch", id: "achtung", text: "Every state has its own answer, Bavaria too." });
        expect(block(book, "land-bayern", "erinnern")).toEqual({ type: "recall", id: "erinnern", items: [{ q: "Which state is yours?", a: "Bavaria." }] });
        // The card of the coat of arms names its own answer, so it does not take "Bild 4" from the question.
        expect(lesson?.cards[1]).toEqual({ id: "land-bayern/wappen", lesson: "land-bayern", unit: "wappen", front: "Bavaria: what does the coat of arms show?", back: "White and blue diamonds.", questions: [STATE_QUESTION_BASE + 1] });
    });

    it("applies the variants of a state: a city-state has no capital of its own, and a Landesparlament", () =>
    {
        const berlin = new CourseBook(courseFile(), courseTexts(), stateFacts("berlin"));
        expect(berlin.lessons.map((entry) => entry.id)).toEqual(["first", "second", "land-berlin"]);
        expect(block(berlin, "land-berlin", "hauptstadt")).toMatchObject({ term: "der Stadt·staat", q: "What is a city-state?", body: "A city that is a federal state.", meaning: "a city that is a state" });
        expect(berlin.lesson("land-berlin")?.cards[0]).toEqual({
            id: "land-berlin/hauptstadt", lesson: "land-berlin", unit: "hauptstadt", front: "Berlin: what kind of state is it?", german: "ein Stadtstaat", back: "a city-state", questions: [STATE_QUESTION_BASE + 7],
        });
        // A variant that only changes the German term leaves the texts as they are.
        expect(block(berlin, "land-berlin", "landtag")).toMatchObject({ term: "das Landes·parlament", q: "For how many years is the parliament elected?" });
        expect(block(book, "land-bayern", "landtag")).toMatchObject({ term: "der Land·tag" });
    });
});

describe("a course with a hole", () =>
{
    it.each([
        ["the name of an era", (_: CourseFile, texts: CourseTexts) =>
        {
            delete texts.eras.ns;
        }, "era ns"],
        ["the text of an event", (_: CourseFile, texts: CourseTexts) =>
        {
            delete texts.events.euro;
        }, "event euro"],
        ["the title of a chapter", (_: CourseFile, texts: CourseTexts) =>
        {
            delete texts.chapters.state;
        }, "chapter state"],
        ["the texts of a lesson", (_: CourseFile, texts: CourseTexts) =>
        {
            delete texts.lessons.second;
        }, "lesson second"],
        ["the texts of a block", (_: CourseFile, texts: CourseTexts) =>
        {
            delete texts.lessons.first.blocks.falle;
        }, "block falle of lesson first"],
        ["a step of a chain", (_: CourseFile, texts: CourseTexts) =>
        {
            (texts.lessons.first.blocks.kette as { steps: string[] }).steps.pop();
        }, "block kette of lesson first"],
        ["the coat of arms of the state", (_: CourseFile, texts: CourseTexts) =>
        {
            delete texts.arms.bayern;
        }, "the coat of arms of bayern"],
        ["the question of a picture", (file: CourseFile) =>
        {
            delete (file.chapters[0].lessons[0].blocks[1] as { question?: number }).question;
        }, "block bild of lesson first"],
    ])("is not shown when it lacks %s", (_, change, what) =>
    {
        const file = courseFile();
        const texts = courseTexts();
        change(file, texts);
        expect(() => new CourseBook(file, texts, stateFacts())).toThrow(CourseError);
        expect(() => new CourseBook(file, texts, stateFacts())).toThrow(`The course in en lacks ${what}`);
    });
});

describe("LearnLoader", () =>
{
    /** Where the files are. */
    const FILES: LearnFiles = { course: "teach/course.json?v=1", maps: "teach/maps.json?v=1", texts: { en: "locales/teach.en.json?v=1", de: "locales/teach.de.json?v=1" } };

    /**
     * A stand-in for the server.
     * @param bodies What it answers with, by a part of the address. A missing part is a file that is not found.
     * @returns The stand-in and the addresses it was asked for.
     */
    function server(bodies: Record<string, unknown>): { fetch(address: string): Promise<Response>; asked: string[] }
    {
        const asked: string[] = [];
        return {
            asked,
            fetch: async (address) =>
            {
                asked.push(address);
                const name = Object.keys(bodies).find((part) => address.includes(part));
                return { ok: name !== undefined, status: name === undefined ? 404 : 200, json: async () => bodies[name as string] } as unknown as Response;
            },
        };
    }

    /** Everything the server has when all is well. */
    const everything = (): Record<string, unknown> => ({ "course.json": courseFile(), "maps.json": mapsFile(), "teach.en": courseTexts(), "teach.de": { ...courseTexts(), locale: "de" } });

    it("has nothing before it loads, and everything of a language after", async () =>
    {
        const files = server(everything());
        const loader = new LearnLoader(FILES, files.fetch);
        expect(loader.has("en")).toBe(false);
        expect(loader.course).toBeNull();
        expect(loader.maps).toBeNull();
        expect(loader.texts("en")).toBeUndefined();
        await loader.load("en");
        expect(loader.has("en")).toBe(true);
        expect(loader.has("de")).toBe(false);
        expect(loader.course).toEqual(courseFile());
        expect(loader.maps).toEqual(mapsFile());
        expect(loader.texts("en")).toEqual(courseTexts());
        expect([...files.asked].sort()).toEqual(["locales/teach.en.json?v=1", "teach/course.json?v=1", "teach/maps.json?v=1"]);
    });

    it("fetches a file once, however often and however quickly it is asked for", async () =>
    {
        const files = server(everything());
        const loader = new LearnLoader(FILES, files.fetch);
        await Promise.all([loader.load("en"), loader.load("en")]);
        await loader.load("en");
        expect(files.asked).toHaveLength(3);
    });

    it("fetches only the texts for a second language", async () =>
    {
        const files = server(everything());
        const loader = new LearnLoader(FILES, files.fetch);
        await loader.load("en");
        files.asked.length = 0;
        await loader.load("de");
        expect(files.asked).toEqual(["locales/teach.de.json?v=1"]);
        expect(loader.has("de")).toBe(true);
        expect(loader.texts("de")?.locale).toBe("de");
    });

    it("fails for a language the page names no texts for, or when the page names no course at all", async () =>
    {
        const loader = new LearnLoader(FILES, server(everything()).fetch);
        await expect(loader.load("hi")).rejects.toThrow("No file for the course texts in hi");
        await expect(new LearnLoader({ texts: {} }, server(everything()).fetch).load("en")).rejects.toBeInstanceOf(FileError);
        await expect(new LearnLoader({ course: "teach/course.json", texts: { en: "locales/teach.en.json" } }, server(everything()).fetch).load("en")).rejects.toThrow("No file for the maps");
    });

    it("fails when a file is missing, and loads it when it is asked for again and is there", async () =>
    {
        const bodies = everything();
        const maps = bodies["maps.json"];
        delete bodies["maps.json"];
        const loader = new LearnLoader(FILES, server(bodies).fetch);
        await expect(loader.load("en")).rejects.toThrow("teach/maps.json?v=1: 404");
        expect(loader.has("en")).toBe(false);
        bodies["maps.json"] = maps;
        await loader.load("en");
        expect(loader.has("en")).toBe(true);
    });

    it("refuses a file that is not the file that was asked for", async () =>
    {
        await expect(new LearnLoader(FILES, server({ ...everything(), "course.json": { chapters: [] } }).fetch).load("en")).rejects.toThrow("The file for the course is not valid");
        await expect(new LearnLoader(FILES, server({ ...everything(), "maps.json": {} }).fetch).load("en")).rejects.toThrow("The file for the maps is not valid");
        // Texts that say they are German are not the English texts.
        const wrong = new LearnLoader(FILES, server({ ...everything(), "teach.en": { ...courseTexts(), locale: "de" } }).fetch);
        await expect(wrong.load("en")).rejects.toThrow("The file for the course texts in en is not valid");
        expect(wrong.texts("en")).toBeUndefined();
    });
});
