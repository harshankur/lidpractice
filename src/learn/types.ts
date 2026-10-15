import type { Locale } from "../types";

/**
 * The shapes of the course of the Learn tab.
 *
 * The course is kept the way the question bank is: one file that is the same in every language (`CourseFile`: the order of
 * chapters and lessons, the question numbers a block teaches, the German terms) and one file of texts per language
 * (`CourseTexts`). `CourseBook` puts the two together into the lessons the views draw (`Lesson`, `Block`, `Card`).
 */

/** The eras of the timeline. Nothing before 1933: the catalogue asks nothing there. */
export type EraId = "ns" | "occupation" | "west" | "east" | "unity";

/** Every era, in the order of time. West and east run side by side. */
export const ERA_IDS: readonly EraId[] = ["ns", "occupation", "west", "east", "unity"];

/** The maps a lesson can show: what is drawn and how it is coloured. "home" is the map of the states with the user's own state marked. */
export type MapView = "states" | "east" | "zones" | "neighbours" | "parliament" | "home";

/** Every map view. */
export const MAP_VIEWS: readonly MapView[] = ["states", "east", "zones", "neighbours", "parliament", "home"];

/** The kinds of block a lesson is made of. */
export type BlockType = "unit" | "picture" | "compare" | "chain" | "timeline" | "map" | "watch" | "recall";

// ----- the file that is the same in every language -----

/** An era of the timeline. */
export interface EraSpec
{
    id: EraId;
    /** First year. */
    from: number;
    /** Last year, or null for an era that goes on. */
    to: number | null;
    /** Its German name. */
    term: string;
}

/** An event of the timeline. */
export interface EventSpec
{
    id: string;
    /** When: a day ("1945-05-08"), a year ("1949"), two years ("1948/1949") or a decade ("1950s"), as exact as the catalogue asks. */
    date: string;
    era: EraId;
    /** Whether it is a step of the European union, which gets a mark of its own. */
    europe?: boolean;
    /** The catalogue questions about it. */
    questions: number[];
    /** Its German name. */
    term: string;
}

/** What a variant of a state changes in a unit of the lesson about the user's state. */
export interface UnitVariantSpec
{
    term?: string;
    de?: string;
}

/** A fact unit: one idea, the questions that test it, and one flash card. */
export interface UnitSpec
{
    type: "unit";
    id: string;
    /** The catalogue questions the unit teaches. Missing in the lesson about the user's state, which has `task`. */
    questions?: number[];
    /** In the lesson about the user's state: the task (1 to 10) of that state the unit teaches. */
    task?: number;
    /** The German key term, with its article and with its compounds split by a middle dot. */
    term?: string;
    /** The era of a fact about a date. */
    era?: EraId;
    /** The year a fact that can change was true, as the catalogue states it. */
    asOf?: number;
    /** The answer of the flash card in German. */
    de?: string;
    /** In the lesson about the user's state: what changes for a kind of state, by the name of the variant. */
    variants?: Record<string, UnitVariantSpec>;
}

/** The picture of a catalogue question. */
export interface PictureSpec
{
    type: "picture";
    id: string;
    question?: number;
    /** In the lesson about the user's state: the task whose picture is shown. */
    task?: number;
}

/** A table that sets things side by side. */
export interface CompareSpec
{
    type: "compare";
    id: string;
    columns: number;
    rows: number;
}

/** A chain of steps: who elects whom, what follows from what. */
export interface ChainSpec
{
    type: "chain";
    id: string;
    /** The German name of each step. */
    terms: string[];
}

/** An excerpt of the timeline. */
export interface TimelineSpec
{
    type: "timeline";
    id: string;
    events: string[];
}

/** A map. */
export interface MapSpec
{
    type: "map";
    id: string;
    map: MapView;
}

/** A typical trap of the test. */
export interface WatchSpec
{
    type: "watch";
    id: string;
}

/** Questions to answer from memory at the end of a lesson. */
export interface RecallSpec
{
    type: "recall";
    id: string;
    items: number;
}

/** A block of a lesson, as the neutral file holds it. */
export type BlockSpec = UnitSpec | PictureSpec | CompareSpec | ChainSpec | TimelineSpec | MapSpec | WatchSpec | RecallSpec;

/** A lesson, as the neutral file holds it. */
export interface LessonSpec
{
    id: string;
    /** Honest time for reading and recalling, in minutes. */
    minutes: number;
    /** The question that is asked before reading. In the lesson about the user's state: its task. */
    pre: number;
    /** The questions of the check at the end. In the lesson about the user's state: their tasks. */
    check: number[];
    /** A question of an earlier lesson that comes back in the check. */
    review?: number;
    /** "state" for the one lesson that is built for the user's state. */
    template?: "state";
    blocks: BlockSpec[];
}

/** A chapter: the lessons of one subject. */
export interface ChapterSpec
{
    id: string;
    lessons: LessonSpec[];
}

/** The course, the same in every language. */
export interface CourseFile
{
    eras: EraSpec[];
    events: EventSpec[];
    /** German names of what the maps show, by id. */
    places: Record<string, string>;
    chapters: ChapterSpec[];
    /** The variants of the lesson about the user's state that apply to a state, by state id. */
    variants: Record<string, string[]>;
}

// ----- the texts of one language -----

/** The texts of a unit. */
export interface UnitText
{
    /** The heading, a question the unit answers. */
    q: string;
    body: string;
    /** What the German term means. */
    meaning?: string;
    /** A concrete case. */
    case?: string;
    /** The front of the flash card. A unit without one has no card. */
    front?: string;
    /** The answer of the flash card in this language. */
    back?: string;
    /** A short anchor on the back of the card. */
    note?: string;
    variants?: Record<string, Partial<Omit<UnitText, "variants">>>;
}

/** The text of a picture or a map. */
export interface CaptionText
{
    caption: string;
}

/** The texts of a table. */
export interface CompareText
{
    title: string;
    head: string[];
    rows: string[][];
}

/** The texts of a chain. */
export interface ChainText
{
    steps: string[];
    links: string[];
    caption: string;
}

/** The text of a trap. */
export interface WatchText
{
    text: string;
}

/** The questions and answers of a recall block. */
export interface RecallText
{
    items: { q: string; a: string }[];
}

/** The texts of any block. */
export type BlockText = UnitText | CaptionText | CompareText | ChainText | WatchText | RecallText;

/** The texts of a lesson. */
export interface LessonText
{
    title: string;
    /** The big picture, one sentence. */
    big: string;
    blocks: Record<string, BlockText>;
}

/** The texts of the course in one language. */
export interface CourseTexts
{
    locale: Locale;
    eras: Record<string, string>;
    events: Record<string, { text: string; when?: string }>;
    places: Record<string, string>;
    chapters: Record<string, { title: string; intro: string }>;
    lessons: Record<string, LessonText>;
    /** What the coat of arms of each state shows, by state id. */
    arms: Record<string, string>;
}

// ----- the maps -----

/** One shape of a map. */
export interface MapRegion
{
    /** SVG path data. */
    d: string;
    /** Where its label goes. */
    label?: [number, number];
}

/** A map: shapes and places on a drawing area. */
export interface MapData
{
    width: number;
    height: number;
    regions: Record<string, MapRegion>;
    points: Record<string, [number, number]>;
}

/** The maps of the course. */
export interface MapsFile
{
    /** The 16 federal states, and the two halves of Baden-Württemberg for the occupation zones. */
    germany: MapData;
    /** Germany and its neighbours. */
    europe: MapData;
}

// ----- what the views draw -----

/** An era with its name in the language of the site. */
export interface Era extends EraSpec
{
    text: string;
}

/** An event with its text in the language of the site. */
export interface TimelineEvent extends EventSpec
{
    text: string;
    /** How the date is written, when it is not a plain day or year. */
    when?: string;
    /** The year, for sorting and for the distance to the next event. */
    year: number;
}

/** A unit as it is drawn. */
export interface UnitBlock
{
    type: "unit";
    id: string;
    questions: number[];
    term?: string;
    era?: EraId;
    asOf?: number;
    q: string;
    body: string;
    meaning?: string;
    example?: string;
    /** In the lesson about the user's state: the catalogue question, shown with its answer. */
    shown?: number;
}

/** A block as it is drawn. */
export type Block =
    | UnitBlock
    | { type: "picture"; id: string; question: number; caption: string }
    | { type: "compare"; id: string; title: string; head: string[]; rows: string[][] }
    | { type: "chain"; id: string; steps: { term: string; text: string }[]; links: string[]; caption: string }
    | { type: "timeline"; id: string; events: string[] }
    | { type: "map"; id: string; map: MapView; caption: string }
    | { type: "watch"; id: string; text: string }
    | { type: "recall"; id: string; items: { q: string; a: string }[] };

/** A flash card. */
export interface Card
{
    /** Lesson id and unit id, joined: the name the progress is saved under. */
    id: string;
    lesson: string;
    unit: string;
    front: string;
    /** The answer in German, when the card has one. */
    german?: string;
    /** The answer in the language of the site. */
    back?: string;
    note?: string;
    era?: EraId;
    /** The catalogue questions that ask for this fact. */
    questions: number[];
}

/** A lesson as it is drawn. */
export interface Lesson
{
    id: string;
    chapter: string;
    title: string;
    big: string;
    minutes: number;
    pre: number;
    check: number[];
    review: number | null;
    blocks: Block[];
    /** Every catalogue question the lesson prepares for. */
    questions: number[];
    cards: Card[];
}

/** A chapter as it is drawn. */
export interface Chapter
{
    id: string;
    title: string;
    intro: string;
    lessons: Lesson[];
}

/** What the lesson about the user's state needs to know about that state. */
export interface StateFacts
{
    /** State id. */
    id: string;
    /** Its name in the language of the site. */
    name: string;
    /** The question number of each task, 1 to 10. */
    question(task: number): number;
    /** The correct answer of a task in German. */
    answer(task: number): string;
    /** The same answer in the language of the site, or undefined when that is German or not loaded. */
    translation(task: number): string | undefined;
}
