import { flatQuestions, readBundle } from "../../scripts/lib/data.mjs";
import type { Locale, QuestionBundle, QuestionLocale } from "../../src/types";

/** The question bank with the questions of every language, as the files hold them. The page holds less, see the build. */
export interface FullBundle
{
    questions: QuestionBundle["questions"];
    locales: Record<Locale, QuestionLocale>;
}

/** A bank of the tests: German and English. */
export interface TestBundle
{
    questions: QuestionBundle["questions"];
    locales: { de: QuestionLocale; en: QuestionLocale };
}

/**
 * A question with the German and the English text side by side, the shape most tests work with.
 * The real files keep the languages apart, see data/locales.
 */
export interface FlatQuestion
{
    n: number;
    /** Category name (German). */
    c: string;
    q: string;
    a: string[];
    r: number;
    qe: string;
    ae: string[];
    img: string | null;
    cap?: string;
    pg?: number;
}

/** The real question bank, merged into the flat shape. */
export const REAL_FLAT: FlatQuestion[] = flatQuestions(readBundle()) as FlatQuestion[];

/** The real question bank in the shape the page embeds. */
export const REAL_BUNDLE: FullBundle = readBundle() as unknown as FullBundle;

/**
 * Turns an id out of a category name, the way the real files do.
 * @param name Category name.
 * @returns Id.
 */
function categoryId(name: string): string
{
    return name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Builds the embedded question bank from flat questions.
 * @param questions Flat questions.
 * @returns The bundle: a neutral entry per question and one language file per language.
 */
export function toBundle(questions: FlatQuestion[]): TestBundle
{
    const categories: Record<string, string> = {};
    for (const question of questions)
    {
        categories[categoryId(question.c)] = question.c;
    }
    const locale = (code: Locale, official: boolean, pick: (question: FlatQuestion) => { q: string; a: string[] }) => ({
        locale: code,
        name: code,
        official,
        categories,
        questions: questions.map((question) => ({
            n: question.n,
            ...pick(question),
            ...(question.cap === undefined ? {} : { cap: question.cap }),
        })),
    });
    return {
        questions: questions.map((question) => ({
            n: question.n,
            k: categoryId(question.c),
            r: question.r,
            img: question.img,
            ...(question.pg === undefined ? {} : { pg: question.pg }),
        })),
        // The other languages are left out on purpose: a language without a file shows the German text, as the bank does.
        locales: {
            de: locale("de", true, (question) => ({ q: question.q, a: question.a })),
            en: locale("en", false, (question) => ({ q: question.qe, a: question.ae })),
        },
    };
}
