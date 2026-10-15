import { LOCALES, type Locale } from "../types";
import {
    ERA_IDS, MAP_VIEWS, type Block, type BlockSpec, type BlockText, type CaptionText, type Card, type ChainText, type Chapter, type CompareText, type CourseFile,
    type CourseTexts, type Era, type Lesson, type LessonSpec, type LessonText, type MapData, type MapsFile, type RecallText, type StateFacts, type TimelineEvent,
    type UnitSpec, type UnitText, type WatchText,
} from "./types";

/** A file of the course that is missing a part, or is not the file that was asked for. */
export class CourseError extends Error
{
}

/** How many digits a year has, at the start of a date. */
const YEAR_DIGITS = 4;

/** The lesson id of the lesson about the user's state begins with this, followed by the state id. */
export const STATE_LESSON_PREFIX = "land-";

/** Matches the placeholders of the lesson about the user's state. */
const STATE_PLACEHOLDER = /\{(state|answer|arms)\}/g;

/**
 * Whether a value is a plain object.
 * @param value Anything.
 * @returns True for an object that is not an array and not null.
 */
function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is the course file: eras, events, places and chapters with lessons made of blocks.
 * @param value What was fetched.
 * @returns True when it is.
 */
export function isCourseFile(value: unknown): value is CourseFile
{
    if (!isRecord(value) || !Array.isArray(value.eras) || !Array.isArray(value.events) || !Array.isArray(value.chapters) || !isRecord(value.places) || !isRecord(value.variants))
    {
        return false;
    }
    const chapters = value.chapters as unknown[];
    return chapters.length > 0 && chapters.every((chapter) => isRecord(chapter) && typeof chapter.id === "string" && Array.isArray(chapter.lessons)
        && (chapter.lessons as unknown[]).every((lesson) => isRecord(lesson) && typeof lesson.id === "string" && Array.isArray(lesson.blocks) && Array.isArray(lesson.check)));
}

/**
 * Whether a value is the file of the texts of the course in a language.
 * @param value What was fetched.
 * @param locale The language that was asked for.
 * @returns True when it is.
 */
export function isCourseTexts(value: unknown, locale: Locale): value is CourseTexts
{
    return isRecord(value) && value.locale === locale && LOCALES.includes(locale)
        && ["eras", "events", "places", "chapters", "lessons", "arms"].every((part) => isRecord(value[part]));
}

/**
 * Whether a value is one map.
 * @param value Anything.
 * @returns True when it has a size, shapes and places.
 */
function isMapData(value: unknown): value is MapData
{
    return isRecord(value) && typeof value.width === "number" && typeof value.height === "number" && isRecord(value.regions) && isRecord(value.points)
        && Object.values(value.regions).every((region) => isRecord(region) && typeof region.d === "string");
}

/**
 * Whether a value is the file of the maps.
 * @param value What was fetched.
 * @returns True when it is.
 */
export function isMapsFile(value: unknown): value is MapsFile
{
    return isRecord(value) && isMapData(value.germany) && isMapData(value.europe);
}

/**
 * The year a date begins with.
 * @param date A date of the course, for example "1945-05-08", "1948/1949" or "1950s".
 * @returns The year.
 */
export function yearOf(date: string): number
{
    return Number(date.slice(0, YEAR_DIGITS));
}

/**
 * The course in one language, for one federal state: the two files put together into chapters, lessons, blocks and
 * cards, with the lesson about the user's state filled in for that state.
 */
export class CourseBook
{
    /** The chapters in teaching order. */
    public readonly chapters: Chapter[];

    /** The eras of the timeline. */
    public readonly eras: Era[];

    /** The events of the timeline, in the order of time. */
    public readonly events: TimelineEvent[];

    /** The language of the texts. */
    public readonly locale: Locale;

    /** The state the lesson about the user's state is filled in for. */
    public readonly stateId: string;

    private readonly file: CourseFile;
    private readonly texts: CourseTexts;
    private readonly byId = new Map<string, Lesson>();
    private readonly byQuestion = new Map<number, { lesson: Lesson; unit: string }>();

    /**
     * @param file The course, the same in every language.
     * @param texts The texts of one language.
     * @param state The user's state, for the lesson about it.
     */
    public constructor(file: CourseFile, texts: CourseTexts, state: StateFacts)
    {
        this.file = file;
        this.texts = texts;
        this.locale = texts.locale;
        this.stateId = state.id;
        this.eras = file.eras.map((era) => ({ ...era, text: this.need(texts.eras[era.id], `era ${era.id}`) }));
        this.events = file.events
            .map((event) =>
            {
                const text = this.need(texts.events[event.id], `event ${event.id}`);
                return { ...event, text: text.text, year: yearOf(event.date), ...(text.when === undefined ? {} : { when: text.when }) };
            })
            // Events of one year keep the order of the file, which is the order they happened in.
            .sort((first, second) => first.year - second.year);
        this.chapters = file.chapters.map((chapter) =>
        {
            const text = this.need(texts.chapters[chapter.id], `chapter ${chapter.id}`);
            return {
                id: chapter.id,
                title: text.title,
                intro: text.intro,
                lessons: chapter.lessons.map((lesson) => this.buildLesson(chapter.id, lesson, state)),
            };
        });
        for (const lesson of this.lessons)
        {
            this.byId.set(lesson.id, lesson);
            for (const block of lesson.blocks)
            {
                if (block.type === "unit")
                {
                    for (const question of block.questions)
                    {
                        this.byQuestion.set(question, { lesson, unit: block.id });
                    }
                }
            }
        }
    }

    /** Every lesson, in teaching order. */
    public get lessons(): Lesson[]
    {
        return this.chapters.flatMap((chapter) => chapter.lessons);
    }

    /** Every flash card, in teaching order. */
    public get cards(): Card[]
    {
        return this.lessons.flatMap((lesson) => lesson.cards);
    }

    /**
     * Looks a lesson up.
     * @param id Lesson id.
     * @returns The lesson, or undefined.
     */
    public lesson(id: string): Lesson | undefined
    {
        return this.byId.get(id);
    }

    /**
     * The chapter a lesson belongs to.
     * @param lesson The lesson.
     * @returns Its chapter.
     */
    public chapterOf(lesson: Lesson): Chapter
    {
        return this.chapters.find((chapter) => chapter.id === lesson.chapter) as Chapter;
    }

    /**
     * The lesson that teaches a catalogue question, and the unit in it.
     * @param question Question number.
     * @returns Lesson and unit id, or undefined for a question of another state.
     */
    public placeOf(question: number): { lesson: Lesson; unit: string } | undefined
    {
        return this.byQuestion.get(question);
    }

    /**
     * The lesson after or before a lesson.
     * @param lesson The lesson.
     * @param step 1 for the next lesson, -1 for the one before.
     * @returns The neighbour, or undefined at either end.
     */
    public neighbour(lesson: Lesson, step: number): Lesson | undefined
    {
        const all = this.lessons;
        return all[all.indexOf(lesson) + step];
    }

    /**
     * An event of the timeline.
     * @param id Event id.
     * @returns The event, or undefined.
     */
    public event(id: string): TimelineEvent | undefined
    {
        return this.events.find((event) => event.id === id);
    }

    /**
     * A name on a map: the German name and the name in the language of the site.
     * @param id Place id.
     * @returns Both names. A place the texts lack shows its German name twice.
     */
    public place(id: string): { term: string; text: string }
    {
        const term = this.file.places[id] ?? id;
        return { term, text: this.texts.places[id] ?? term };
    }

    /**
     * Returns a value, or fails when a file lacks it: a course with a hole is not shown.
     * @param value The value.
     * @param what What it is, for the message.
     * @returns The value.
     */
    private need<T>(value: T | undefined, what: string): T
    {
        if (value === undefined)
        {
            throw new CourseError(`The course in ${this.locale} lacks ${what}`);
        }
        return value;
    }

    /**
     * Puts a lesson together from its two halves.
     * @param chapter Chapter id.
     * @param spec The lesson of the neutral file.
     * @param state The user's state.
     * @returns The lesson.
     */
    private buildLesson(chapter: string, spec: LessonSpec, state: StateFacts): Lesson
    {
        const text = this.need(this.texts.lessons[spec.id], `lesson ${spec.id}`);
        const forState = spec.template === "state";
        const id = forState ? `${STATE_LESSON_PREFIX}${state.id}` : spec.id;
        const number = (value: number): number => (forState ? state.question(value) : value);
        const blocks: Block[] = [];
        const cards: Card[] = [];
        for (const block of spec.blocks)
        {
            const built = this.buildBlock(spec, block, text, forState ? state : null);
            blocks.push(built.block);
            if (built.card)
            {
                cards.push({ ...built.card, id: `${id}/${block.id}`, lesson: id, unit: block.id });
            }
        }
        const fill = (value: string): string => (forState ? this.fill(value, state, 0) : value);
        return {
            id,
            chapter,
            title: fill(text.title),
            big: fill(text.big),
            minutes: spec.minutes,
            pre: number(spec.pre),
            check: spec.check.map(number),
            review: spec.review ?? null,
            blocks,
            questions: blocks.flatMap((block) => (block.type === "unit" ? block.questions : [])),
            cards,
        };
    }

    /**
     * Fills the placeholders of the lesson about the user's state.
     * @param text A text with `{state}`, `{answer}` or `{arms}`.
     * @param state The user's state.
     * @param task The task whose answer `{answer}` stands for, or 0 when the text has none.
     * @returns The text for that state.
     */
    private fill(text: string, state: StateFacts, task: number): string
    {
        return text.replace(STATE_PLACEHOLDER, (_, name: string) =>
        {
            if (name === "state")
            {
                return state.name;
            }
            if (name === "arms")
            {
                return this.need(this.texts.arms[state.id], `the coat of arms of ${state.id}`);
            }
            const translation = state.translation(task);
            return translation === undefined ? `{{${state.answer(task)}}}` : `{{${state.answer(task)}}} (${translation})`;
        });
    }

    /**
     * Puts a block together from its two halves.
     * @param lesson The lesson of the neutral file.
     * @param spec The block of the neutral file.
     * @param text The texts of the lesson.
     * @param state The user's state in the lesson about it, otherwise null.
     * @returns The block, and the flash card of a unit that has one.
     */
    private buildBlock(lesson: LessonSpec, spec: BlockSpec, text: LessonText, state: StateFacts | null): { block: Block; card?: Omit<Card, "id" | "lesson" | "unit"> }
    {
        const where = `block ${spec.id} of lesson ${lesson.id}`;
        const need = <T extends BlockText>(): T => this.need(text.blocks[spec.id], where) as T;
        const task = "task" in spec && spec.task !== undefined ? spec.task : 0;
        const fill = (value: string): string => (state ? this.fill(value, state, task) : value);
        switch (spec.type)
        {
            case "unit":
                return this.buildUnit(spec, need<UnitText>(), state);
            case "picture":
                return { block: { type: "picture", id: spec.id, question: state ? state.question(task) : this.need(spec.question, where), caption: fill(need<CaptionText>().caption) } };
            case "compare":
            {
                const table = need<CompareText>();
                return { block: { type: "compare", id: spec.id, title: table.title, head: table.head, rows: table.rows } };
            }
            case "chain":
            {
                const chain = need<ChainText>();
                return {
                    block: {
                        type: "chain",
                        id: spec.id,
                        steps: spec.terms.map((term, index) => ({ term, text: this.need(chain.steps[index], where) })),
                        links: chain.links,
                        caption: chain.caption,
                    },
                };
            }
            case "timeline":
                return { block: { type: "timeline", id: spec.id, events: spec.events } };
            case "map":
                return { block: { type: "map", id: spec.id, map: spec.map, caption: fill(need<CaptionText>().caption) } };
            case "watch":
                return { block: { type: "watch", id: spec.id, text: fill(need<WatchText>().text) } };
            case "recall":
                return { block: { type: "recall", id: spec.id, items: need<RecallText>().items.map((item) => ({ q: fill(item.q), a: fill(item.a) })) } };
        }
    }

    /**
     * Puts a unit and its flash card together. In the lesson about the user's state the variants of that state are
     * applied, and the answer of the card comes from the catalogue question.
     * @param spec The unit of the neutral file.
     * @param base Its texts.
     * @param state The user's state in the lesson about it, otherwise null.
     * @returns The unit and its card.
     */
    private buildUnit(spec: UnitSpec, base: UnitText, state: StateFacts | null): { block: Block; card?: Omit<Card, "id" | "lesson" | "unit"> }
    {
        let term = spec.term;
        let german = spec.de;
        let text: Omit<UnitText, "variants"> = base;
        for (const variant of state ? this.file.variants[state.id] ?? [] : [])
        {
            term = spec.variants?.[variant]?.term ?? term;
            german = spec.variants?.[variant]?.de ?? german;
            text = { ...text, ...base.variants?.[variant] };
        }
        const task = spec.task ?? 0;
        const fill = (value: string): string => (state ? this.fill(value, state, task) : value);
        const questions = state ? [state.question(task)] : spec.questions ?? [];
        const block: Block = {
            type: "unit",
            id: spec.id,
            questions,
            q: fill(text.q),
            body: fill(text.body),
            ...(term === undefined ? {} : { term }),
            ...(spec.era === undefined ? {} : { era: spec.era }),
            ...(spec.asOf === undefined ? {} : { asOf: spec.asOf }),
            ...(text.meaning === undefined ? {} : { meaning: fill(text.meaning) }),
            ...(text.case === undefined ? {} : { example: fill(text.case) }),
            ...(state ? { shown: state.question(task) } : {}),
        };
        if (text.front === undefined)
        {
            return { block };
        }
        // A card of the user's state that names no answer of its own takes the answer of the catalogue question.
        const fromQuestion = state !== null && german === undefined && text.back === undefined;
        const answer = fromQuestion ? state.answer(task) : german;
        const back = fromQuestion ? state.translation(task) : (text.back === undefined ? undefined : fill(text.back));
        return {
            block,
            card: {
                front: fill(text.front),
                questions,
                ...(answer === undefined ? {} : { german: answer }),
                ...(back === undefined ? {} : { back }),
                ...(text.note === undefined ? {} : { note: fill(text.note) }),
                ...(spec.era === undefined ? {} : { era: spec.era }),
            },
        };
    }
}

/** The ids the files may use, for the tests of the data. */
export const KNOWN = { eras: ERA_IDS, maps: MAP_VIEWS };
