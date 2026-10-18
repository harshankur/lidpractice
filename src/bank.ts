import { LAST_GENERAL_NUMBER } from "./constants";
import { shuffled } from "./random";
import {
    DEFAULT_LOCALE, LOCALES, type Locale, type PresentedOption, type PresentedQuestion, type Question, type QuestionBundle,
    type QuestionLocale, type QuestionText,
} from "./types";

/**
 * Read only access to the embedded question bank, with helpers for
 * building presented (shuffled) questions.
 */
export class QuestionBank
{
    /** All 310 questions, each with its text in every language. */
    public readonly all: Question[];

    /** Category names by language, then by category id. */
    private readonly categoryNames: Record<Locale, Record<string, string>>;

    /** The languages whose questions are in the bank. German always is; the others when they were added. */
    private readonly withQuestions = new Set<Locale>([DEFAULT_LOCALE]);

    /**
     * @param bundle The question bank as embedded in the page: language neutral entries and one file per language.
     */
    public constructor(bundle: QuestionBundle)
    {
        const byNumber = {} as Record<Locale, Map<number, QuestionText>>;
        const names = {} as Record<Locale, Record<string, string>>;
        for (const locale of LOCALES)
        {
            const file = bundle.locales[locale];
            byNumber[locale] = new Map((file?.questions ?? []).map((entry) => [entry.n, { q: entry.q, a: entry.a, cap: entry.cap }]));
            names[locale] = file?.categories ?? {};
            if (file && file.questions.length > 0)
            {
                this.withQuestions.add(locale);
            }
        }
        this.categoryNames = names;
        this.all = bundle.questions.map((entry) =>
        {
            const texts = {} as Record<Locale, QuestionText>;
            for (const locale of LOCALES)
            {
                // A language without this question falls back to the default language, so nothing is ever blank.
                texts[locale] = byNumber[locale].get(entry.n) ?? (byNumber[DEFAULT_LOCALE].get(entry.n) as QuestionText);
            }
            return { ...entry, texts };
        });
    }

    /**
     * Adds the questions of a language that was fetched. Until then a question shows the German text in that language.
     * @param file The language file.
     */
    public addLocale(file: QuestionLocale): void
    {
        const byNumber = new Map(file.questions.map((entry) => [entry.n, { q: entry.q, a: entry.a, cap: entry.cap }]));
        for (const question of this.all)
        {
            question.texts[file.locale] = byNumber.get(question.n) ?? question.texts[DEFAULT_LOCALE];
        }
        this.categoryNames[file.locale] = { ...this.categoryNames[file.locale], ...file.categories };
        this.withQuestions.add(file.locale);
    }

    /**
     * Whether the questions of a language are in the bank.
     * @param locale The language.
     * @returns True when they are.
     */
    public hasQuestions(locale: Locale): boolean
    {
        return this.withQuestions.has(locale);
    }

    /** Questions 1 to 300. */
    public get general(): Question[]
    {
        return this.all.filter((question) => question.n <= LAST_GENERAL_NUMBER);
    }

    /**
     * The questions of one federal state.
     * @param stateId State id, for example "berlin".
     * @returns Its ten questions.
     */
    public ofState(stateId: string): Question[]
    {
        return this.all.filter((question) => question.n > LAST_GENERAL_NUMBER && question.k === stateId);
    }

    /** Category ids, sorted by their German name. */
    public get categories(): string[]
    {
        const ids = Array.from(new Set(this.all.map((question) => question.k)));
        return ids.sort((first, second) => this.categoryName(first, DEFAULT_LOCALE).localeCompare(this.categoryName(second, DEFAULT_LOCALE), DEFAULT_LOCALE));
    }

    /**
     * Name of a category in a language.
     * @param id Category id.
     * @param locale Language.
     * @returns The name, or the id when the language has no name for it.
     */
    public categoryName(id: string, locale: Locale): string
    {
        return this.categoryNames[locale][id] ?? this.categoryNames[DEFAULT_LOCALE][id] ?? id;
    }

    /**
     * The questions of a choice: general questions of the given subjects, plus the questions of the given states.
     * @param topics Subjects (category ids of general questions), or null for all of them.
     * @param states Ids of federal states.
     * @returns Matching questions, in the order of the catalogue.
     */
    public select(topics: readonly string[] | null, states: readonly string[]): Question[]
    {
        return this.all.filter((question) => (question.n > LAST_GENERAL_NUMBER
            ? states.includes(question.k)
            : topics === null || topics.includes(question.k)));
    }

    /**
     * Looks a question up by its number.
     * @param questionNumber Number from 1 to 310.
     * @returns The question, or undefined.
     */
    public byNumber(questionNumber: number): Question | undefined
    {
        return this.all.find((question) => question.n === questionNumber);
    }

    /**
     * Builds a presented question. Options are shuffled, except for image
     * questions, where option labels refer to numbered pictures, and when
     * the order of the booklet is wanted.
     * @param question Source question.
     * @param shuffle Whether the options may be shuffled. False keeps the printed order.
     * @returns Question with ordered options.
     */
    public present(question: Question, shuffle = true): PresentedQuestion
    {
        const german = question.texts[DEFAULT_LOCALE].a;
        // The texts are looked up when they are read, not now: the questions of a language that is fetched later reach a question that is on screen.
        const options: PresentedOption[] = german.map((_, index) => ({
            index,
            get texts(): Record<Locale, string>
            {
                const texts = {} as Record<Locale, string>;
                for (const locale of LOCALES)
                {
                    texts[locale] = question.texts[locale].a[index] ?? german[index];
                }
                return texts;
            },
            isCorrect: index === question.r,
        }));
        return {
            question,
            options: question.img || !shuffle ? options : shuffled(options),
        };
    }

    /**
     * Builds a presented question with its options in an order that was shown before.
     * @param question Source question.
     * @param order The places of the options in the catalogue, in the order to show them.
     * @returns Question with ordered options.
     */
    public presentInOrder(question: Question, order: readonly number[]): PresentedQuestion
    {
        const { options } = this.present(question, false);
        return { question, options: order.map((index) => options[index]) };
    }
}
