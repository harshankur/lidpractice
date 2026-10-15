import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readBundle } from "../../scripts/lib/data.mjs";
import { CourseBook, KNOWN, isCourseFile, isCourseTexts, isMapsFile } from "../../src/learn/course";
import { RESERVED_NAMES, parseRoute } from "../../src/learn/route";
import type { BlockSpec, CourseFile, CourseTexts, LessonSpec, MapsFile, StateFacts, UnitSpec } from "../../src/learn/types";
import { STATES } from "../../src/states";
import { LOCALES, type Locale } from "../../src/types";
import type { FullBundle } from "../helpers/questionData";

/** Where the course is kept. */
const FOLDER = "data/teach";

const course = JSON.parse(readFileSync(`${FOLDER}/course.json`, "utf8")) as CourseFile;
const maps = JSON.parse(readFileSync(`${FOLDER}/maps.json`, "utf8")) as MapsFile;
const texts = Object.fromEntries(LOCALES.map((code) => [code, JSON.parse(readFileSync(`${FOLDER}/locales/teach.${code}.json`, "utf8")) as CourseTexts])) as Record<Locale, CourseTexts>;
const bundle = readBundle() as unknown as FullBundle;

/** The general questions of the catalogue, and the tasks of a federal state. */
const GENERAL_COUNT = 300;
const STATE_TASKS = 10;

/** English is the language the course was written in; every other language follows its shape. */
const SOURCE: Locale = "en";

const lessons: LessonSpec[] = course.chapters.flatMap((chapter) => chapter.lessons);
const general = lessons.filter((lesson) => lesson.template === undefined);
const template = lessons.filter((lesson) => lesson.template === "state");

/** Every unit of a lesson. */
const unitsOf = (lesson: LessonSpec): UnitSpec[] => lesson.blocks.filter((block): block is UnitSpec => block.type === "unit");

/** The ids of every place a map names (see src/learn/maps.ts). */
const MAP_PLACES = [
    "de", "dk", "pl", "cz", "at", "ch", "fr", "lu", "be", "nl", "strasbourg", "luxembourg", "brussels",
    "zone-uk", "zone-su", "zone-us", "zone-fr", "berlin-sectors", "berlin-divided", "west", "east",
];

/** Matches a German key term in a text, a placeholder of the lesson about the user's state, a long dash, and digits of other scripts. */
const TERM = /\{\{([^{}]*)\}\}/g;
const PLACEHOLDER = /\{(state|answer|arms)\}/g;
const OTHER_DIGITS = /[٠-٩۰-۹०-९]/;

/**
 * Walks two values of the same shape side by side and calls back for every text.
 * @param source The value of the source language.
 * @param other The value of another language.
 * @param where The path so far, for messages.
 * @param problems Collects what does not fit.
 * @param onText Called with the two texts and their path.
 */
function walk(source: unknown, other: unknown, where: string, problems: string[], onText: (source: string, other: string, where: string) => void): void
{
    if (typeof source === "string")
    {
        if (typeof other === "string")
        {
            onText(source, other, where);
        }
        else
        {
            problems.push(`${where}: not a text`);
        }
    }
    else if (Array.isArray(source))
    {
        if (!Array.isArray(other) || other.length !== source.length)
        {
            problems.push(`${where}: not a list of ${source.length}`);
            return;
        }
        source.forEach((entry, index) => walk(entry, other[index], `${where}[${index}]`, problems, onText));
    }
    else
    {
        const from = source as Record<string, unknown>;
        const to = (typeof other === "object" && other !== null ? other : {}) as Record<string, unknown>;
        for (const key of Object.keys(from))
        {
            if (key in to)
            {
                walk(from[key], to[key], `${where}.${key}`, problems, onText);
            }
            else
            {
                problems.push(`${where}.${key}: missing`);
            }
        }
        for (const key of Object.keys(to))
        {
            if (!(key in from))
            {
                problems.push(`${where}.${key}: not in ${SOURCE}`);
            }
        }
    }
}

/**
 * What the lesson about the user's state knows about a state, from the real question bank.
 * @param stateId State id.
 * @param locale The language of the site.
 * @returns The facts.
 */
function facts(stateId: string, locale: Locale): StateFacts
{
    const first = GENERAL_COUNT + STATES.findIndex((state) => state.id === stateId) * STATE_TASKS;
    const answer = (task: number, code: Locale): string => bundle.locales[code].questions[first + task - 1].a[bundle.questions[first + task - 1].r];
    return {
        id: stateId,
        name: bundle.locales[locale].categories[stateId],
        question: (task) => first + task,
        answer: (task) => answer(task, "de"),
        translation: (task) => (locale === "de" ? undefined : answer(task, locale)),
    };
}

describe("the files of the course", () =>
{
    it("are the plan, the maps, and the texts in exactly the languages of the site", () =>
    {
        expect(isCourseFile(course)).toBe(true);
        expect(isMapsFile(maps)).toBe(true);
        expect(readdirSync(`${FOLDER}/locales`).sort()).toEqual(LOCALES.map((code) => `teach.${code}.json`).sort());
        for (const code of LOCALES)
        {
            expect(isCourseTexts(texts[code], code), code).toBe(true);
        }
    });
});

describe("the plan of the course", () =>
{
    it("teaches every one of the 300 general questions in exactly one unit: the course is the syllabus, no more and no less", () =>
    {
        const taught = general.flatMap((lesson) => unitsOf(lesson).flatMap((unit) => unit.questions ?? []));
        expect([...taught].sort((first, second) => first - second)).toEqual(Array.from({ length: GENERAL_COUNT }, (_, index) => index + 1));
    });

    it("has one lesson for the user's federal state, which teaches each of its ten tasks in exactly one unit", () =>
    {
        expect(template).toHaveLength(1);
        const tasks = unitsOf(template[0]).map((unit) => unit.task);
        expect([...tasks].sort((first, second) => (first as number) - (second as number))).toEqual(Array.from({ length: STATE_TASKS }, (_, index) => index + 1));
        expect(unitsOf(template[0]).every((unit) => unit.questions === undefined)).toBe(true);
        expect(general.every((lesson) => unitsOf(lesson).every((unit) => unit.task === undefined && (unit.questions ?? []).length > 0))).toBe(true);
    });

    it("gives every chapter, lesson and block an id of its own, in lower case words joined by hyphens", () =>
    {
        const id = /^[a-z0-9]+(-[a-z0-9]+)*$/;
        const chapterIds = course.chapters.map((chapter) => chapter.id);
        const lessonIds = lessons.map((lesson) => lesson.id);
        expect(new Set(chapterIds).size).toBe(chapterIds.length);
        expect(new Set(lessonIds).size).toBe(lessonIds.length);
        for (const value of [...chapterIds, ...lessonIds])
        {
            expect(value).toMatch(id);
        }
        for (const lesson of lessons)
        {
            const blockIds = lesson.blocks.map((block) => block.id);
            expect(new Set(blockIds).size, lesson.id).toBe(blockIds.length);
            for (const value of blockIds)
            {
                expect(value, lesson.id).toMatch(id);
            }
        }
        // The id of the state lesson is completed with a state id, so no other lesson may start the way it does.
        expect(lessonIds.filter((value) => value.startsWith("land-"))).toEqual([]);
        // A lesson and a section are named in an address (see src/learn/route.ts): a lesson cannot have the name of a page of its own,
        // and a block cannot have the name of one of the sections every lesson has.
        expect(lessonIds.filter((value) => RESERVED_NAMES.includes(value))).toEqual([]);
        expect(lessons.flatMap((lesson) => lesson.blocks.map((block) => block.id)).filter((value) => ["guess", "cards", "check"].includes(value))).toEqual([]);
        expect([...chapterIds, ...lessonIds, ...lessons.flatMap((lesson) => lesson.blocks.map((block) => block.id))].every((value) => parseRoute(`#learn/${value}`)?.page !== "home")).toBe(true);
        expect(course.chapters.every((chapter) => chapter.lessons.length > 0)).toBe(true);
    });

    it("asks before reading and checks at the end with questions the lesson itself teaches", () =>
    {
        for (const lesson of general)
        {
            const own = unitsOf(lesson).flatMap((unit) => unit.questions ?? []);
            expect(own, lesson.id).toContain(lesson.pre);
            expect(lesson.check.length, lesson.id).toBeGreaterThanOrEqual(1);
            expect(new Set(lesson.check).size, lesson.id).toBe(lesson.check.length);
            for (const question of lesson.check)
            {
                expect(own, `${lesson.id} checks ${question}`).toContain(question);
            }
        }
        const tasks = unitsOf(template[0]).map((unit) => unit.task);
        expect(tasks).toContain(template[0].pre);
        expect(template[0].check.every((task) => tasks.includes(task))).toBe(true);
    });

    it("brings one question of the lesson before back in every check but the first, so the first repetition comes after a pause", () =>
    {
        expect(lessons[0].review).toBeUndefined();
        lessons.slice(1).forEach((lesson, index) =>
        {
            const before = lessons.slice(0, index + 1).filter((entry) => entry.template === undefined).pop() as LessonSpec;
            expect(before.check, `${lesson.id} reviews ${lesson.review}`).toContain(lesson.review);
            expect(lesson.check, lesson.id).not.toContain(lesson.review);
        });
    });

    it("gives every lesson an honest reading time and at least one flash card", () =>
    {
        for (const lesson of lessons)
        {
            expect(Number.isInteger(lesson.minutes) && lesson.minutes >= 2 && lesson.minutes <= 15, `${lesson.id}: ${lesson.minutes} minutes`).toBe(true);
            const blocks = texts[SOURCE].lessons[lesson.id].blocks as Record<string, { front?: string }>;
            expect(unitsOf(lesson).some((unit) => blocks[unit.id].front !== undefined), lesson.id).toBe(true);
        }
    });

    it("puts the German answer on every flash card outside the lesson about the user's state", () =>
    {
        for (const lesson of general)
        {
            const blocks = texts[SOURCE].lessons[lesson.id].blocks as Record<string, { front?: string }>;
            for (const unit of unitsOf(lesson))
            {
                if (blocks[unit.id].front !== undefined)
                {
                    expect(typeof unit.de === "string" && unit.de.length > 0, `${lesson.id}/${unit.id}`).toBe(true);
                }
            }
        }
    });

    it("uses only the eras, the maps and the events it knows", () =>
    {
        const eventIds = course.events.map((event) => event.id);
        expect(new Set(eventIds).size).toBe(eventIds.length);
        expect(course.eras.map((era) => era.id)).toEqual([...KNOWN.eras]);
        for (const era of course.eras)
        {
            expect(era.from).toBeGreaterThanOrEqual(1933);
            expect(era.to === null || era.to > era.from, era.id).toBe(true);
        }
        for (const event of course.events)
        {
            expect(KNOWN.eras, event.id).toContain(event.era);
            // A day, a year, two years or a decade: as exact as the catalogue asks, never more.
            expect(event.date, event.id).toMatch(/^\d{4}(-\d{2}-\d{2}|\/\d{4}|s)?$/);
            expect(event.questions.every((question) => Number.isInteger(question) && question >= 1 && question <= GENERAL_COUNT), event.id).toBe(true);
            expect(event.term.trim().length, event.id).toBeGreaterThan(0);
        }
        for (const lesson of lessons)
        {
            for (const block of lesson.blocks)
            {
                if (block.type === "timeline")
                {
                    expect(block.events.length, `${lesson.id}/${block.id}`).toBeGreaterThan(0);
                    expect(block.events.every((event) => eventIds.includes(event)), `${lesson.id}/${block.id}`).toBe(true);
                }
                if (block.type === "map")
                {
                    expect(KNOWN.maps, `${lesson.id}/${block.id}`).toContain(block.map);
                }
                if (block.type === "unit" && block.era !== undefined)
                {
                    expect(KNOWN.eras, `${lesson.id}/${block.id}`).toContain(block.era);
                }
            }
        }
    });

    it("puts every event into the era of its year, and uses every event at least once in a lesson", () =>
    {
        const used = new Set(lessons.flatMap((lesson) => lesson.blocks.flatMap((block) => (block.type === "timeline" ? block.events : []))));
        for (const event of course.events)
        {
            const year = Number(event.date.slice(0, 4));
            const era = course.eras.find((entry) => entry.id === event.era) as CourseFile["eras"][number];
            expect(year >= era.from && (era.to === null || year <= era.to), `${event.id}: ${year} in ${era.id}`).toBe(true);
            expect(used.has(event.id), event.id).toBe(true);
        }
    });

    it("shows a picture only of a question that has one, and of a question the lesson teaches", () =>
    {
        const withPicture = new Set(bundle.questions.filter((question) => question.img !== null).map((question) => question.n));
        for (const lesson of general)
        {
            const own = unitsOf(lesson).flatMap((unit) => unit.questions ?? []);
            for (const block of lesson.blocks)
            {
                if (block.type === "picture")
                {
                    expect(withPicture.has(block.question as number), `${lesson.id}/${block.id}`).toBe(true);
                    expect(own, `${lesson.id}/${block.id}`).toContain(block.question);
                }
            }
        }
        for (const block of template[0].blocks)
        {
            if (block.type === "picture")
            {
                // The same task has a picture in every state: the coat of arms and the map.
                expect(STATES.every((_, index) => withPicture.has(GENERAL_COUNT + index * STATE_TASKS + (block.task as number))), block.id).toBe(true);
            }
        }
    });

    it("names its variants of the state lesson by state, and uses every variant it names", () =>
    {
        const stateIds = STATES.map((state) => state.id);
        const named = new Set(Object.values(course.variants).flat());
        const used = new Set(unitsOf(template[0]).flatMap((unit) => Object.keys(unit.variants ?? {})));
        const written = new Set(Object.values(texts[SOURCE].lessons[template[0].id].blocks).flatMap((block) => Object.keys((block as { variants?: object }).variants ?? {})));
        expect(Object.keys(course.variants).every((id) => stateIds.includes(id))).toBe(true);
        expect([...new Set([...used, ...written])].sort()).toEqual([...named].sort());
        // The three city-states share one variant.
        expect(["berlin", "hamburg", "bremen"].every((id) => course.variants[id].includes("city"))).toBe(true);
    });

    it("writes a German key term with its article where it is a noun, and splits a compound with middle dots only", () =>
    {
        for (const lesson of lessons)
        {
            for (const unit of unitsOf(lesson))
            {
                for (const term of [unit.term, ...Object.values(unit.variants ?? {}).map((variant) => variant.term)])
                {
                    if (term !== undefined)
                    {
                        expect(term, `${lesson.id}/${unit.id}`).toBe(term.trim());
                        expect(term, `${lesson.id}/${unit.id}`).not.toMatch(/[{}*]|··|^·|·$| ·|· /);
                    }
                }
            }
        }
    });

    it("has a German name for every place a map shows", () =>
    {
        for (const place of MAP_PLACES)
        {
            expect(course.places[place], place).toBeTruthy();
        }
        expect(Object.keys(course.places).sort()).toEqual([...MAP_PLACES].sort());
    });
});

describe("the maps", () =>
{
    /** What a shape may be written with: moves and lines relative to the last point, in whole numbers. */
    const PATH = /^[Mlz0-9 -]+$/;

    it("have the 16 states with a place for the number and for the capital, and the two halves of Baden-Württemberg", () =>
    {
        const { germany } = maps;
        expect(Object.keys(germany.regions).sort()).toEqual([...STATES.map((state) => state.id), "bw-north", "bw-south"].sort());
        for (const state of STATES)
        {
            const region = germany.regions[state.id];
            expect(region.d, state.id).toMatch(PATH);
            for (const point of [region.label as [number, number], germany.points[state.id]])
            {
                expect(point[0] >= 0 && point[0] <= germany.width && point[1] >= 0 && point[1] <= germany.height, `${state.id} ${point}`).toBe(true);
            }
        }
        expect(Object.keys(germany.points).sort()).toEqual(STATES.map((state) => state.id).sort());
    });

    it("have Germany, its nine neighbours and the land around, and the three places of the European Parliament", () =>
    {
        const { europe } = maps;
        expect(Object.keys(europe.regions).sort()).toEqual(["at", "be", "ch", "cz", "de", "dk", "fr", "lu", "nl", "other", "pl"]);
        expect(Object.keys(europe.points).sort()).toEqual(["brussels", "luxembourg", "strasbourg"]);
        for (const [id, region] of Object.entries(europe.regions))
        {
            expect(region.d, id).toMatch(PATH);
            if (id !== "other")
            {
                const [x, y] = region.label as [number, number];
                expect(x >= 0 && x <= europe.width && y >= 0 && y <= europe.height, id).toBe(true);
            }
        }
        for (const [x, y] of Object.values(europe.points))
        {
            expect(x >= 0 && x <= europe.width && y >= 0 && y <= europe.height).toBe(true);
        }
    });

    it("keep the numbers of two neighbours far enough apart to be read, and stay small enough to be fetched quickly", () =>
    {
        // The disc behind a number has a radius of 21 units (src/learn/maps.ts): two centres closer than two radii would overlap.
        const LEAST_DISTANCE = 42;
        const apart = (points: [number, number][]): number => Math.min(...points.flatMap((first, index) => points.slice(index + 1).map((second) => Math.hypot(first[0] - second[0], first[1] - second[1]))));
        expect(apart(STATES.map((state) => maps.germany.regions[state.id].label as [number, number]))).toBeGreaterThanOrEqual(LEAST_DISTANCE);
        expect(apart(["dk", "pl", "cz", "at", "ch", "fr", "lu", "be", "nl"].map((id) => maps.europe.regions[id].label as [number, number]))).toBeGreaterThanOrEqual(LEAST_DISTANCE);
        expect(apart(Object.values(maps.europe.points))).toBeGreaterThanOrEqual(LEAST_DISTANCE);
        expect(JSON.stringify(maps).length).toBeLessThan(100000);
    });
});

describe("the texts of the course", () =>
{
    const source = texts[SOURCE];

    it("cover the plan in the source language: every era, event, place, chapter, lesson, block and coat of arms, and nothing else", () =>
    {
        expect(Object.keys(source.eras).sort()).toEqual(course.eras.map((era) => era.id).sort());
        expect(Object.keys(source.events).sort()).toEqual(course.events.map((event) => event.id).sort());
        expect(Object.keys(source.places).sort()).toEqual(Object.keys(course.places).sort());
        expect(Object.keys(source.chapters).sort()).toEqual(course.chapters.map((chapter) => chapter.id).sort());
        expect(Object.keys(source.lessons).sort()).toEqual(lessons.map((lesson) => lesson.id).sort());
        expect(Object.keys(source.arms).sort()).toEqual(STATES.map((state) => state.id).sort());
        for (const lesson of lessons)
        {
            const withText = lesson.blocks.filter((block) => block.type !== "timeline").map((block) => block.id);
            expect(Object.keys(source.lessons[lesson.id].blocks).sort(), lesson.id).toEqual([...withText].sort());
        }
    });

    it("fit the plan block by block: a table has its columns and rows, a chain a text for every step and a link between two", () =>
    {
        for (const lesson of lessons)
        {
            const blocks = source.lessons[lesson.id].blocks as unknown as Record<string, Record<string, unknown>>;
            for (const block of lesson.blocks as BlockSpec[])
            {
                const text = blocks[block.id];
                const where = `${lesson.id}/${block.id}`;
                if (block.type === "compare")
                {
                    const head = text.head as string[];
                    const rows = text.rows as string[][];
                    expect(head.length, where).toBe(block.columns);
                    expect(rows.length, where).toBe(block.rows);
                    expect(rows.every((row) => row.length === block.columns), where).toBe(true);
                    // The corner above the row heads is empty; every other cell says something.
                    expect(head[0], where).toBe("");
                    expect([...head.slice(1), ...rows.flat()].every((cell) => cell.trim() !== ""), where).toBe(true);
                    expect((text.title as string).trim(), where).not.toBe("");
                }
                if (block.type === "chain")
                {
                    expect((text.steps as string[]).length, where).toBe(block.terms.length);
                    expect((text.links as string[]).length, where).toBe(block.terms.length - 1);
                    expect(block.terms.length, where).toBeGreaterThanOrEqual(2);
                }
                if (block.type === "recall")
                {
                    expect((text.items as unknown[]).length, where).toBe(block.items);
                    expect(block.items, where).toBeGreaterThanOrEqual(2);
                }
                if (block.type === "unit" && text.front === undefined)
                {
                    // A unit without a card has no back of a card either.
                    expect(text.back === undefined && text.note === undefined, where).toBe(true);
                }
            }
        }
    });

    it.each(LOCALES.filter((code) => code !== SOURCE))("have the same shape in %s as in the source language, apart from the German answer of a card", (code) =>
    {
        const problems: string[] = [];
        // In German the answer of a card is the German answer of the plan, so the texts carry a back only where the plan has no answer.
        const expected = structuredClone(source) as unknown as { locale: string; lessons: Record<string, { blocks: Record<string, { front?: string; back?: string; variants?: Record<string, { back?: string }> }> }> };
        expected.locale = code;
        if (code === "de")
        {
            for (const lesson of lessons)
            {
                for (const unit of unitsOf(lesson))
                {
                    const text = expected.lessons[lesson.id].blocks[unit.id];
                    if (unit.de !== undefined)
                    {
                        delete text.back;
                    }
                    for (const [name, variant] of Object.entries(text.variants ?? {}))
                    {
                        if (unit.variants?.[name]?.de !== undefined)
                        {
                            delete variant.back;
                        }
                    }
                }
            }
        }
        walk(expected, texts[code], code, problems, (from, to, where) =>
        {
            if (where === `${code}.locale`)
            {
                return;
            }
            if (from.trim() !== "" && to.trim() === "")
            {
                problems.push(`${where}: empty`);
            }
            if (to !== to.trim())
            {
                problems.push(`${where}: space at an end`);
            }
            if ([...from.matchAll(PLACEHOLDER)].map((match) => match[0]).sort().join() !== [...to.matchAll(PLACEHOLDER)].map((match) => match[0]).sort().join())
            {
                problems.push(`${where}: placeholders differ`);
            }
            if (OTHER_DIGITS.test(to))
            {
                problems.push(`${where}: digits of another script`);
            }
            if ((to.match(/\*\*/g)?.length ?? 0) % 2 !== 0 || (to.match(/\{\{/g)?.length ?? 0) !== (to.match(/\}\}/g)?.length ?? 0) || /\{\{\s*\}\}/.test(to))
            {
                problems.push(`${where}: broken markup`);
            }
            // A German key term stays German, letter for letter, in every language but German itself.
            if (code !== "de" && [...from.matchAll(TERM)].map((match) => match[1]).sort().join("|") !== [...to.matchAll(TERM)].map((match) => match[1]).sort().join("|"))
            {
                problems.push(`${where}: German terms differ from the source`);
            }
        });
        expect(problems).toEqual([]);
    });

    it("are really translated: a language does not carry the source text over, apart from names and numbers", () =>
    {
        for (const code of LOCALES.filter((entry) => entry !== SOURCE))
        {
            const same: string[] = [];
            let all = 0;
            walk(source, { ...texts[code], locale: SOURCE }, code, [], (from, to, where) =>
            {
                all += 1;
                if (from === to && from.replace(TERM, "").replace(/[^A-Za-z]/g, "").length > 25)
                {
                    same.push(where);
                }
            });
            expect(all, code).toBeGreaterThan(1500);
            // German shares the texts that are a German term and nothing else; no language shares whole sentences.
            expect(same, code).toEqual([]);
        }
    });

    it("write Arabic, Ukrainian and Hindi in their own script, with German terms and Western digits in between", () =>
    {
        const scripts: Partial<Record<Locale, RegExp>> = { ar: /[؀-ۿ]/, uk: /[Ѐ-ӿ]/, hi: /[ऀ-ॿ]/ };
        for (const [code, script] of Object.entries(scripts) as [Locale, RegExp][])
        {
            const latin: string[] = [];
            walk(source, { ...texts[code], locale: SOURCE }, code, [], (from, to, where) =>
            {
                // A sentence of the source language must come out with letters of the script of the language.
                if (from.replace(TERM, "").replace(/[^A-Za-z]/g, "").length > 30 && !script.test(to))
                {
                    latin.push(where);
                }
            });
            expect(latin, code).toEqual([]);
        }
    });

    it("build into a course for every language and every federal state, with nothing missing", () =>
    {
        for (const code of LOCALES)
        {
            for (const state of STATES)
            {
                const book = new CourseBook(course, texts[code], facts(state.id, code));
                expect(book.lessons).toHaveLength(lessons.length);
                const land = book.lesson(`land-${state.id}`);
                expect(land?.questions.length, `${code} ${state.id}`).toBe(STATE_TASKS);
                // Nothing of the template is left in what the user reads.
                const shown = JSON.stringify([land?.title, land?.big, land?.blocks, land?.cards]);
                expect(shown, `${code} ${state.id}`).not.toMatch(/\{(state|answer|arms)\}/);
                // Every card can be answered: it has a German answer, an answer in the language of the site, or both.
                for (const card of book.cards)
                {
                    expect(card.german !== undefined || card.back !== undefined, `${code} ${card.id}`).toBe(true);
                    expect(card.front.trim().length, `${code} ${card.id}`).toBeGreaterThan(0);
                }
            }
        }
    });

    it("teach every question of every user: the 300 general ones and the ten of the state", () =>
    {
        for (const state of STATES)
        {
            const book = new CourseBook(course, source, facts(state.id, SOURCE));
            const first = GENERAL_COUNT + STATES.indexOf(state) * STATE_TASKS;
            const own = [...Array.from({ length: GENERAL_COUNT }, (_, index) => index + 1), ...Array.from({ length: STATE_TASKS }, (_, index) => first + index + 1)];
            expect(own.every((question) => book.placeOf(question) !== undefined), state.id).toBe(true);
            expect(book.lessons.flatMap((lesson) => lesson.questions).sort((a, b) => a - b), state.id).toEqual(own);
            // The answer on a card of the state lesson is the answer of the catalogue.
            const capital = book.cards.find((card) => card.id === `land-${state.id}/hauptstadt`);
            expect([facts(state.id, "de").answer(7), "ein Stadtstaat"], state.id).toContain(capital?.german);
        }
    });

    it("give the three city-states the unit about city-states, and Bremen and Schleswig-Holstein their own wording", () =>
    {
        const termOf = (stateId: string, unit: string): string | undefined =>
        {
            const block = new CourseBook(course, source, facts(stateId, SOURCE)).lesson(`land-${stateId}`)?.blocks.find((entry) => entry.id === unit);
            return block?.type === "unit" ? block.term : undefined;
        };
        expect(termOf("bayern", "hauptstadt")).toBe("die Landes·haupt·stadt");
        for (const city of ["berlin", "hamburg", "bremen"])
        {
            expect(termOf(city, "hauptstadt"), city).toBe("der Stadt·staat");
            expect(termOf(city, "landtag"), city).toBe("das Landes·parlament");
        }
        expect(termOf("hessen", "landtag")).toBe("der Land·tag");
        expect(termOf("bremen", "wahlalter")).toBe("die Bürgerschaft");
        expect(termOf("schleswig-holstein", "politische-bildung")).toBe("die Landes·beauftragte für politische Bildung");
    });
});
