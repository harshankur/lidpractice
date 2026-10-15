import { DEFAULT_COUNTDOWN_MINUTES, EXAM_DURATION_MINUTES, EXAM_HISTORY_SIZE, LEGACY_STORAGE_KEYS, MAX_COUNTDOWN_MINUTES, PERCENT, STORAGE_KEY } from "./constants";
import { ErrorBoundary } from "./errorBoundary";
import { DEFAULT_STATE, STATE_IDS } from "./states";
import { ALL_TOPICS } from "./topics";
import { START_MODE, modeHash, pageOf } from "./address";
import { SECTION_NAME } from "./learn/route";
import { LAST_BOX, grade, introduce } from "./learn/schedule";
import {
    DEFAULT_UI_LOCALE, TRANSLATION_LOCALES, UI_LOCALES, automaticTranslation, type ExamResult, type LearnProgress, type Locale, type RoundOrder, type SavedCard,
    type SavedState, type SeenLesson, type ThemeChoice, type TranslationChoice,
} from "./types";

/** Theme choices, for checking saved values. */
const THEME_CHOICES: readonly ThemeChoice[] = ["auto", "light", "dark"];

/** Where the ten Berlin questions were numbered in older versions, and how far they moved. */
const BERLIN_OLD_FIRST = 301;
const BERLIN_OLD_LAST = 310;
const BERLIN_SHIFT = 20;

/** Orders of a round, for checking saved values. */
const ROUND_ORDERS: readonly RoundOrder[] = ["random", "booklet"];

/**
 * Loads and saves {@link SavedState}. All storage access goes through
 * {@link ErrorBoundary.run}, so a blocked or full storage never breaks the page.
 */
export class Store
{
    /** Current state, always valid even if storage is unavailable. */
    public state: SavedState = Store.defaultState();

    /** Creates the default state: German interface, German only (no translation), system theme, all topics, booklet order. */
    private static defaultState(): SavedState
    {
        return {
            uiLanguage: DEFAULT_UI_LOCALE,
            translation: "off",
            translationLanguage: "auto",
            theme: "auto",
            topics: null,
            state: DEFAULT_STATE,
            includeState: true,
            setupDone: false,
            clockMode: "up",
            clockMinutes: DEFAULT_COUNTDOWN_MINUTES,
            examMinutes: EXAM_DURATION_MINUTES,
            lockAnswers: false,
            order: "booklet",
            records: {},
            learn: { read: {}, seen: {}, cards: {}, last: null },
            exams: [],
            lastPlace: "",
        };
    }

    /**
     * Keeps only values of the right kind from saved data, so an old or hand edited save cannot break the page.
     * @param parsed Whatever was stored.
     * @returns A complete, valid state.
     */
    private static sanitize(parsed: Partial<SavedState>): SavedState
    {
        const defaults = Store.defaultState();
        const isRecordMap = typeof parsed.records === "object" && parsed.records !== null && !Array.isArray(parsed.records);
        const ids = (value: unknown): string[] | null => (Array.isArray(value)
            ? value.filter((entry): entry is string => typeof entry === "string" && entry !== "") : null);
        // An older save had a list of states and a state for the exam: the exam state is the state now.
        const older = parsed as { states?: unknown; examState?: unknown };
        const oldStates = ids(older.states);
        const known = (value: unknown): value is string => typeof value === "string" && STATE_IDS.includes(value);
        const translation = parsed.translation === "off" || TRANSLATION_LOCALES.includes(parsed.translation as Locale)
            ? (parsed.translation as TranslationChoice) : defaults.translation;
        const uiLanguage = UI_LOCALES.includes(parsed.uiLanguage as Locale) ? (parsed.uiLanguage as Locale) : defaults.uiLanguage;
        // A save from before the language of the translation was a setting of its own: the language that was shown is the one picked,
        // unless it is the one that "auto" would give anyway.
        const translationLanguage = parsed.translationLanguage === "auto" || TRANSLATION_LOCALES.includes(parsed.translationLanguage as Locale)
            ? (parsed.translationLanguage as Locale | "auto")
            : (translation !== "off" && translation !== automaticTranslation(uiLanguage) ? translation : defaults.translationLanguage);
        return {
            uiLanguage,
            translation: translation === "off" ? "off" : (translationLanguage === "auto" ? automaticTranslation(uiLanguage) : translationLanguage),
            translationLanguage,
            theme: THEME_CHOICES.includes(parsed.theme as ThemeChoice) ? (parsed.theme as ThemeChoice) : defaults.theme,
            topics: Store.knownSubjects(ids(parsed.topics)),
            state: known(parsed.state) ? parsed.state : (known(older.examState) ? older.examState : defaults.state),
            includeState: typeof parsed.includeState === "boolean" ? parsed.includeState : (oldStates === null ? defaults.includeState : oldStates.length > 0),
            setupDone: typeof parsed.setupDone === "boolean" ? parsed.setupDone : defaults.setupDone,
            clockMode: parsed.clockMode === "up" || parsed.clockMode === "down" ? parsed.clockMode : defaults.clockMode,
            clockMinutes: Store.minutes(parsed.clockMinutes, MAX_COUNTDOWN_MINUTES, defaults.clockMinutes),
            examMinutes: Store.minutes(parsed.examMinutes, EXAM_DURATION_MINUTES, defaults.examMinutes),
            lockAnswers: typeof parsed.lockAnswers === "boolean" ? parsed.lockAnswers : defaults.lockAnswers,
            order: ROUND_ORDERS.includes(parsed.order as RoundOrder) ? (parsed.order as RoundOrder) : defaults.order,
            records: isRecordMap ? (parsed.records as SavedState["records"]) : defaults.records,
            learn: Store.learnProgress(parsed.learn),
            exams: Store.examResults(parsed.exams),
            // Only the address of a page as the page itself writes it: anything else is forgotten.
            lastPlace: typeof parsed.lastPlace === "string" && pageOf(parsed.lastPlace) === parsed.lastPlace && parsed.lastPlace !== modeHash(START_MODE) ? parsed.lastPlace : defaults.lastPlace,
        };
    }

    /**
     * Whether a value is a whole number that is not negative.
     * @param value Anything.
     * @returns True when it is.
     */
    private static isCount(value: unknown): value is number
    {
        return typeof value === "number" && Number.isInteger(value) && value >= 0;
    }

    /**
     * Keeps what is usable of the saved progress of the Learn tab.
     * @param saved What was saved.
     * @returns Lessons with a day, how far lessons were read, cards with a box and a day, and the lesson that was open last.
     */
    private static learnProgress(saved: unknown): LearnProgress
    {
        const source = (typeof saved === "object" && saved !== null ? saved : {}) as Partial<Record<keyof LearnProgress, unknown>>;
        const entries = (value: unknown): [string, unknown][] => (typeof value === "object" && value !== null && !Array.isArray(value) ? Object.entries(value) : []);
        const read = entries(source.read).filter((entry): entry is [string, number] => Store.isCount(entry[1]));
        const cards = entries(source.cards).filter((entry): entry is [string, SavedCard] =>
        {
            const card = entry[1] as Partial<SavedCard> | null;
            return typeof card === "object" && card !== null && Store.isCount(card.box) && card.box >= 1 && card.box <= LAST_BOX && Store.isCount(card.due);
        });
        const seen = entries(source.seen).filter((entry): entry is [string, SeenLesson] =>
        {
            const lesson = entry[1] as Partial<SeenLesson> | null;
            // The name of a section is looked for on the page, so only the letters a section can have are taken.
            return typeof lesson === "object" && lesson !== null && typeof lesson.at === "string" && SECTION_NAME.test(lesson.at)
                && Store.isCount(lesson.percent) && lesson.percent <= PERCENT;
        });
        return {
            read: Object.fromEntries(read),
            seen: Object.fromEntries(seen.map(([id, lesson]) => [id, { at: lesson.at, percent: lesson.percent }])),
            cards: Object.fromEntries(cards.map(([id, card]) => [id, { box: card.box, due: card.due }])),
            last: typeof source.last === "string" ? source.last : null,
        };
    }

    /**
     * Keeps what is usable of the saved exam results.
     * @param saved What was saved.
     * @returns The latest results, oldest first.
     */
    private static examResults(saved: unknown): ExamResult[]
    {
        const results = (Array.isArray(saved) ? saved : []).filter((entry: unknown): entry is ExamResult =>
        {
            const result = entry as Partial<ExamResult> | null;
            return typeof result === "object" && result !== null && Store.isCount(result.day) && Store.isCount(result.score) && Store.isCount(result.total)
                && result.total > 0 && result.score <= result.total;
        });
        return results.slice(-EXAM_HISTORY_SIZE).map((result) => ({ day: result.day, score: result.score, total: result.total }));
    }

    /**
     * A number of minutes from a save: a whole number from 1 up to the limit.
     * @param value What was saved.
     * @param max The longest time allowed.
     * @param fallback Used when the value is not usable.
     * @returns Whole minutes.
     */
    private static minutes(value: unknown, max: number, fallback: number): number
    {
        return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(1, Math.round(value))) : fallback;
    }

    /**
     * Keeps the subjects that exist. A saved choice made of subjects that no longer exist (an older version had other
     * subjects) means no choice was made, so all subjects are used.
     * @param saved Saved subject ids, or null.
     * @returns The ids that exist, or null for all subjects.
     */
    private static knownSubjects(saved: string[] | null): string[] | null
    {
        if (saved === null)
        {
            return null;
        }
        const known = saved.filter((id) => ALL_TOPICS.includes(id));
        return saved.length > 0 && known.length === 0 ? null : known;
    }

    /**
     * Reads what an older version saved: the progress, the interface language, the theme, the translation and the
     * choice of topics. Older versions had the ten Berlin questions as 301 to 310, they are 321 to 330 now.
     * @returns A partial state, or an empty one when nothing older is stored.
     */
    private static readLegacy(): Partial<SavedState>
    {
        for (const key of LEGACY_STORAGE_KEYS)
        {
            const raw = ErrorBoundary.run(() => window.localStorage.getItem(key), null);
            if (raw)
            {
                const old = ErrorBoundary.run(() => JSON.parse(raw) as Record<string, unknown>, {});
                const showedEnglish = old.questionLanguage === "en" || old.questionLanguage === "both";
                const oldTopics = Array.isArray(old.topics) ? (old.topics as unknown[]).filter((topic) => typeof topic === "string") as string[] : null;
                return {
                    uiLanguage: old.uiLanguage as Locale,
                    theme: old.theme as ThemeChoice,
                    records: Store.renumberBerlin(old.records),
                    translation: typeof old.translation === "string" ? old.translation as TranslationChoice : (showedEnglish ? TRANSLATION_LOCALES[0] : "off"),
                    order: old.order as RoundOrder,
                    topics: oldTopics === null ? null : oldTopics.filter((topic) => topic !== DEFAULT_STATE),
                    includeState: oldTopics === null || oldTopics.includes(DEFAULT_STATE),
                };
            }
        }
        return {};
    }

    /**
     * Moves the records of the old Berlin questions 301 to 310 to their new numbers 321 to 330.
     * @param records Saved records by question number.
     * @returns The records with the new numbers.
     */
    private static renumberBerlin(records: unknown): SavedState["records"] | undefined
    {
        if (typeof records !== "object" || records === null || Array.isArray(records))
        {
            return undefined;
        }
        const moved: SavedState["records"] = {};
        for (const [key, record] of Object.entries(records as SavedState["records"]))
        {
            const number = Number(key);
            moved[number >= BERLIN_OLD_FIRST && number <= BERLIN_OLD_LAST ? String(number + BERLIN_SHIFT) : key] = record;
        }
        return moved;
    }

    /** Loads state from localStorage, falling back to defaults. */
    public load(): void
    {
        const raw = ErrorBoundary.run(() => window.localStorage.getItem(STORAGE_KEY), null);
        if (!raw)
        {
            this.state = Store.sanitize(Store.readLegacy());
            return;
        }
        const parsed = ErrorBoundary.run(() => JSON.parse(raw) as Partial<SavedState>, {});
        this.state = Store.sanitize(parsed);
    }

    /** Writes the current state to localStorage. */
    public save(): void
    {
        ErrorBoundary.run(() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)), undefined);
    }

    /**
     * Records the result of one answered question.
     * @param questionNumber Question number.
     * @param wasCorrect Whether the answer was right.
     */
    public recordAnswer(questionNumber: number, wasCorrect: boolean): void
    {
        const key = String(questionNumber);
        const record = this.state.records[key] ?? { right: 0, wrong: 0, lastWrong: false };
        if (wasCorrect)
        {
            record.right += 1;
        }
        else
        {
            record.wrong += 1;
        }
        record.lastWrong = !wasCorrect;
        this.state.records[key] = record;
        this.save();
    }

    /**
     * Question numbers whose latest answer was wrong.
     * @param include Which questions count. Default: all.
     * @returns The numbers.
     */
    public weakNumbersIn(include: (questionNumber: number) => boolean = () => true): number[]
    {
        return Object.keys(this.state.records)
            .filter((key) => this.state.records[key].lastWrong)
            .map(Number)
            .filter(include);
    }

    /**
     * Number of distinct questions answered at least once.
     * @param include Which questions count. Default: all.
     * @returns The count.
     */
    public seenCountIn(include: (questionNumber: number) => boolean = () => true): number
    {
        return Object.keys(this.state.records).map(Number).filter(include).length;
    }

    /**
     * Lifetime accuracy as a whole percent.
     * @param include Which questions count. Default: all.
     * @returns The percent, or null when nothing is answered.
     */
    public accuracyPercentIn(include: (questionNumber: number) => boolean = () => true): number | null
    {
        let right = 0;
        let total = 0;
        for (const [key, record] of Object.entries(this.state.records))
        {
            if (include(Number(key)))
            {
                right += record.right;
                total += record.right + record.wrong;
            }
        }
        return total === 0 ? null : Math.round((right / total) * PERCENT);
    }

    /** Question numbers whose latest answer was wrong. */
    public get weakNumbers(): number[]
    {
        return this.weakNumbersIn();
    }

    /** The language the translation is shown in when it is on: the one that was picked, or the language of the site. */
    public get translationTarget(): Locale
    {
        const { translationLanguage, uiLanguage } = this.state;
        return translationLanguage === "auto" ? automaticTranslation(uiLanguage) : translationLanguage;
    }

    /** Puts the language of a translation that is on in line with the site language and the pick. Call it after either changes. */
    public syncTranslation(): void
    {
        if (this.state.translation !== "off")
        {
            this.state.translation = this.translationTarget;
        }
    }

    /** Number of distinct questions answered at least once. */
    public get seenCount(): number
    {
        return this.seenCountIn();
    }

    /** Lifetime accuracy as a whole percent, or null when nothing is answered. */
    public get accuracyPercent(): number | null
    {
        return this.accuracyPercentIn();
    }

    /** Clears all progress but keeps preferences: the answers, the lessons, the flash cards and the exam results. */
    public resetProgress(): void
    {
        this.state.records = {};
        this.state.learn = { read: {}, seen: {}, cards: {}, last: null };
        this.state.exams = [];
        this.save();
    }

    /**
     * Remembers the lesson that is open, so the Learn tab can offer to go on with it.
     * @param lessonId Lesson id.
     */
    public openLesson(lessonId: string): void
    {
        this.state.learn.last = lessonId;
        this.save();
    }

    /**
     * Remembers how far a lesson was read. The share never goes down, and nothing is saved when nothing changed.
     * @param lessonId Lesson id.
     * @param at The furthest section that reached the top of the window, or "" when none did.
     * @param percent The share of the lesson that has come into view, in percent.
     */
    public seeLesson(lessonId: string, at: string, percent: number): void
    {
        const before = this.state.learn.seen[lessonId];
        const reached = Math.max(before?.percent ?? 0, percent);
        if (before?.at !== at || before.percent !== reached)
        {
            this.state.learn.seen[lessonId] = { at, percent: reached };
            this.save();
        }
    }

    /**
     * Remembers the page that is open, so the next visit to the plain address of the site goes on there. A section of
     * a lesson is not part of it. The tab the site opens with anyway is remembered as nothing, so a visit that changes
     * nothing saves nothing, and nothing is saved when nothing changed.
     * @param hash The part of the address after "#", with the sign.
     */
    public rememberPlace(hash: string): void
    {
        const page = pageOf(hash);
        const place = page === modeHash(START_MODE) ? "" : page;
        if (this.state.lastPlace !== place)
        {
            this.state.lastPlace = place;
            this.save();
        }
    }

    /**
     * Takes the mark of a lesson back: it is not done any more. Its flash cards stay where they are.
     * @param lessonId Lesson id.
     */
    public unfinishLesson(lessonId: string): void
    {
        delete this.state.learn.read[lessonId];
        this.save();
    }

    /**
     * Marks a lesson as done, and puts its flash cards into the first box when they are new.
     * @param lessonId Lesson id.
     * @param cardIds The ids of its cards.
     * @param today The day number of today.
     */
    public finishLesson(lessonId: string, cardIds: readonly string[], today: number): void
    {
        const { read, cards } = this.state.learn;
        read[lessonId] = read[lessonId] ?? today;
        for (const id of cardIds)
        {
            cards[id] = cards[id] ?? introduce(today);
        }
        this.save();
    }

    /**
     * Records the answer to a flash card. A card that was not introduced yet stays out of the boxes.
     * @param cardId Card id.
     * @param known Whether the user knew the answer.
     * @param today The day number of today.
     */
    public gradeCard(cardId: string, known: boolean, today: number): void
    {
        const state = this.state.learn.cards[cardId];
        if (state)
        {
            this.state.learn.cards[cardId] = grade(state, known, today);
            this.save();
        }
    }

    /**
     * Remembers the result of a finished exam.
     * @param score Correct answers.
     * @param total Questions.
     * @param today The day number of today.
     */
    public recordExam(score: number, total: number, today: number): void
    {
        this.state.exams = [...this.state.exams, { day: today, score, total }].slice(-EXAM_HISTORY_SIZE);
        this.save();
    }
}
