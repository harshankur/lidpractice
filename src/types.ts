import type { Clock } from "./clock";
import identity from "./identity.json";

/** Languages of the interface and of the questions. German is the default and the language of the official test. */
export type Locale = "de" | "en" | "ar" | "uk" | "tr" | "es" | "hi";

/** All languages, default first. */
export const LOCALES: readonly Locale[] = ["de", "en", "ar", "uk", "tr", "es", "hi"];

/** Languages that are written from right to left. */
export const RTL_LOCALES: readonly Locale[] = identity.rtlLocales as Locale[];

/**
 * The direction in which a language is written.
 * @param locale The language.
 * @returns "rtl" or "ltr".
 */
export function directionOf(locale: Locale): "ltr" | "rtl"
{
    return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/** The languages the site itself can be shown in: every language. Arabic is mirrored (see RTL_LOCALES and directionOf). */
export const UI_LOCALES: readonly Locale[] = LOCALES;

/** The default language, and the language of the official catalogue. */
export const DEFAULT_LOCALE: Locale = identity.defaultLocale as Locale;

/** The language of the buttons and texts around the questions until the user chooses another. Not the language of the questions. */
export const DEFAULT_UI_LOCALE: Locale = identity.defaultUiLocale as Locale;

/** The languages that can be shown as a translation: every language except the default one. */
export const TRANSLATION_LOCALES: readonly Locale[] = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/**
 * The language of the translation when the user has not picked one: the language of the site, or English when the site is German.
 * @param site The language of the site.
 * @returns The language of the translation.
 */
export function automaticTranslation(site: Locale): Locale
{
    return site === DEFAULT_LOCALE ? TRANSLATION_LOCALES[0] : site;
}

/** The translation shown below the German question text: one language, or "off" for German only, as in the real test. */
export type TranslationChoice = Locale | "off";

/** How the questions of a round are ordered. */
export type RoundOrder = "random" | "booklet";

/** Colour theme: follow the system, or force one. */
export type ThemeChoice = "auto" | "light" | "dark";

/** Language neutral part of a question, as stored in data/questions.json. */
export interface QuestionEntry
{
    /** Question number, 1 to 460. 1 to 300 are general, 301 to 460 are the tasks of the 16 federal states in the order of the catalogue. */
    n: number;
    /** Category id, for example "grundrechte". The names are in the language files. */
    k: string;
    /** Index of the correct option. All languages keep the option order of the catalogue. */
    r: number;
    /** Path of the picture, or null when the question has none. */
    img: string | null;
    /** Page of the official catalogue PDF on which the question is printed. */
    pg?: number;
}

/** Text of one question in one language. */
export interface LocalizedQuestion
{
    n: number;
    /** Question text. */
    q: string;
    /** The four answer options. */
    a: string[];
    /** Photo credit or source note printed under the picture. */
    cap?: string;
}

/** One language file of the question bank, as stored in data/locales. */
export interface QuestionLocale
{
    locale: Locale;
    /** Name of the language in that language. */
    name: string;
    /** True for the language of the official catalogue. Other languages are unofficial translations. */
    official: boolean;
    /** Category names by category id. */
    categories: Record<string, string>;
    questions: LocalizedQuestion[];
}

/**
 * The question bank as the build embeds it in the page: the language neutral entries, the German questions, and for every
 * other language only its name and the names of the categories (the questions of those languages are fetched when needed).
 */
export interface QuestionBundle
{
    questions: QuestionEntry[];
    locales: Partial<Record<Locale, QuestionLocale>> & { de: QuestionLocale };
}

/** Where the files of the Learn tab are: the course, which is the same in every language, the maps, and the texts of each language. */
export interface LearnFiles
{
    course?: string;
    maps?: string;
    texts: Partial<Record<Locale, string>>;
}

/**
 * Where the files that are not in the page are: by language the messages of the interface and the questions, and the
 * files of the Learn tab.
 */
export interface LanguageFiles
{
    ui: Partial<Record<Locale, string>>;
    questions: Partial<Record<Locale, string>>;
    learn: LearnFiles;
}

/** Text of a question in one language. */
export interface QuestionText
{
    q: string;
    a: string[];
    cap?: string;
}

/** A question with its text in every language. */
export interface Question extends QuestionEntry
{
    texts: Record<Locale, QuestionText>;
}

/** One answer option after shuffling. */
export interface PresentedOption
{
    /** The place of the option in the catalogue, from 0: what is saved when the order it was shown in has to be kept. */
    index: number;
    /** The option in every language. */
    texts: Record<Locale, string>;
    /** Whether this option is the correct answer. */
    isCorrect: boolean;
}

/** A question together with its (possibly shuffled) options. */
export interface PresentedQuestion
{
    question: Question;
    options: PresentedOption[];
}

/** Top level application modes. */
export type AppMode = "learn" | "practice" | "train" | "exam";

/**
 * The top level modes, in tab order: first learn, then practise, then train what is weak, then the exam. The name of a
 * mode is also its address (see address.ts).
 */
export const MODES: readonly AppMode[] = ["learn", "practice", "train", "exam"];

/** Result history for one question. */
export interface QuestionRecord
{
    /** Times answered correctly. */
    right: number;
    /** Times answered wrongly. */
    wrong: number;
    /** Whether the most recent answer was wrong. */
    lastWrong: boolean;
}

/** Where a flash card of the Learn tab stands: its box, and the day it is due (see src/learn/schedule.ts). */
export interface SavedCard
{
    box: number;
    due: number;
}

/** How far a lesson was read. */
export interface SeenLesson
{
    /** The furthest section that reached the top of the window, or "" when none did. Reading goes on there. It does not go back when the user scrolls back up. */
    at: string;
    /** The share of the lesson that has come into view so far, in percent. It never goes down. */
    percent: number;
}

/** What is remembered of the Learn tab. */
export interface LearnProgress
{
    /** The lessons that are done, with the number of the day they were marked: by finishing the check, or by the user's own tick. */
    read: Record<string, number>;
    /** How far each lesson was read, by lesson id. Reading alone never marks a lesson as done. */
    seen: Record<string, SeenLesson>;
    /** Where each flash card stands, by card id. A card that is not listed was not introduced yet. */
    cards: Record<string, SavedCard>;
    /** The lesson that was open last, or null. */
    last: string | null;
}

/** The result of an exam that was finished. */
export interface ExamResult
{
    /** The number of the day it was taken. */
    day: number;
    score: number;
    total: number;
}

/** Everything persisted in localStorage. */
export interface SavedState
{
    /** Language of the buttons and texts around the questions. */
    uiLanguage: Locale;
    /** The translation shown below the German text, or "off". When it is on, it is the language of `translationLanguage`. */
    translation: TranslationChoice;
    /** The language the translation is shown in when it is on: one the user picked, or "auto" for the language of the site (English when the site is German). */
    translationLanguage: Locale | "auto";
    theme: ThemeChoice;
    /** Subjects (category ids of the general questions) that practice draws from, or null for all of them. An empty list means none. */
    topics: string[] | null;
    /** The user's federal state: its ten questions are the only state questions the user gets, in practice and in the exam. */
    state: string;
    /** Whether practice includes the questions of the user's state. Off means general questions only. */
    includeState: boolean;
    /** Whether the first-visit setup dialog was shown. */
    setupDone: boolean;
    /** Which way the clock of practice runs: up from zero or down from a set time. */
    clockMode: "up" | "down";
    /** Length of the count down of practice, in minutes. No upper limit beyond what the display can show. */
    clockMinutes: number;
    /** Length of the exam, in minutes: the official time at most, shorter for practising. */
    examMinutes: number;
    /** Whether an answer that was given cannot be changed any more in a round. Off by default. */
    lockAnswers: boolean;
    /** The order of a practice round. */
    order: RoundOrder;
    records: Record<string, QuestionRecord>;
    /** The Learn tab: lessons that were finished and where the flash cards stand. */
    learn: LearnProgress;
    /** The latest exams that were finished, oldest first. */
    exams: ExamResult[];
    /** The page that was open last, as the part of its address after "#" with the sign ("#train", "#learn/wuerde"), or "" for the tab the site opens with. */
    lastPlace: string;
    /** The round of practice that was open, so it goes on after the page was loaded anew, or null. */
    round: SavedPracticeRound | null;
}

/** A question of a round as it is saved: what was done with it, and the order its options were shown in. */
export interface SavedSlot
{
    n: number;
    outcome: "correct" | "wrong" | "skipped" | "open";
    selected: number | null;
    /** The places of the options in the catalogue, in the order they were shown, or null before the question was shown. */
    options: number[] | null;
}

/** A round of practice as it is saved. */
export interface SavedRound
{
    order: RoundOrder;
    lock: boolean;
    view: number;
    resume: number;
    ended: boolean;
    /** The questions a round in random order has not drawn yet. */
    remaining: number[];
    slots: SavedSlot[];
}

/** The round of practice that is saved: the round, what it is made of, and for a round over a lesson its title and questions. */
export interface SavedPracticeRound extends SavedRound
{
    source: "topics" | "weak" | "weakSelection" | "mistakes" | "lesson";
    lesson: { title: string; numbers: number[] } | null;
}

/** State of a running or finished exam. */
export interface ExamState
{
    items: PresentedQuestion[];
    /** Selected option index per item, or null when unanswered. */
    answers: (number | null)[];
    current: number;
    /** Per item: whether it was ever shown. A question that was not is no failed question, only a missing answer. */
    visited: boolean[];
    /** Per item: whether the user marked it for review. */
    marked: boolean[];
    /** The clock of the exam: counts down from the exam time. */
    clock: Clock;
    finished: boolean;
    /** True when the exam ended because the time ran out, not because the user finished it. */
    timedOut: boolean;
}
