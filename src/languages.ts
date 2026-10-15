import type { QuestionBank } from "./bank";
import { FileError, FileFetcher } from "./fetchOnce";
import { hasCatalog, registerCatalog } from "./i18n";
import type { LanguageFiles, Locale, QuestionLocale } from "./types";

/** How many options every question has. */
const OPTION_COUNT = 4;

/** The fewest messages a language file of the interface can have. A file with fewer is not the right file. */
const MIN_MESSAGES = 100;

/**
 * Reads where the files of the languages that are not in the page are, from the page itself.
 * @param node The element the build put the list in, or null.
 * @returns The addresses, by language.
 */
export function readLanguageFiles(node: HTMLElement | null): LanguageFiles
{
    const parsed = JSON.parse(node?.textContent || "{}") as Partial<LanguageFiles>;
    return { ui: parsed.ui ?? {}, questions: parsed.questions ?? {}, learn: { ...parsed.learn, texts: parsed.learn?.texts ?? {} } };
}

/**
 * Whether a value is a file of interface messages: text by key.
 * @param value What was fetched.
 * @returns True when it is.
 */
function isCatalog(value: unknown): value is Record<string, string>
{
    if (typeof value !== "object" || value === null || Array.isArray(value))
    {
        return false;
    }
    const entries = Object.values(value);
    return entries.length >= MIN_MESSAGES && entries.every((entry) => typeof entry === "string" && entry.trim() !== "");
}

/**
 * Whether a value is the question file of a language: the right language, and for every question a text and four options.
 * @param value What was fetched.
 * @param locale The language that was asked for.
 * @returns True when it is.
 */
function isQuestionFile(value: unknown, locale: Locale): value is QuestionLocale
{
    const file = value as Partial<QuestionLocale> | null;
    return typeof file === "object" && file !== null && file.locale === locale && Array.isArray(file.questions)
        && typeof file.categories === "object" && file.categories !== null
        && file.questions.every((entry) => typeof entry.n === "number" && typeof entry.q === "string"
            && Array.isArray(entry.a) && entry.a.length === OPTION_COUNT && entry.a.every((option) => typeof option === "string"));
}

/**
 * Fetches the files of the languages when they are asked for, from this site, and hands them to the interface and the
 * question bank. A language that is being fetched is not fetched twice.
 */
export class LanguageLoader
{
    private readonly fetcher: FileFetcher;

    /**
     * @param files Where the files are.
     * @param bank The question bank that receives the questions.
     * @param fetcher How a file is fetched. Replaced in tests.
     */
    public constructor(
        private readonly files: LanguageFiles,
        private readonly bank: QuestionBank,
        fetcher?: (address: string) => Promise<Response>,
    )
    {
        this.fetcher = new FileFetcher(fetcher);
    }

    /**
     * Makes the messages of the interface in a language available.
     * @param locale The language.
     * @returns Resolves when they are there. Rejects when the file cannot be fetched or is not the right file.
     */
    public ui(locale: Locale): Promise<void>
    {
        const address = this.files.ui[locale];
        if (hasCatalog(locale) || address === undefined)
        {
            return hasCatalog(locale) ? Promise.resolve() : Promise.reject(new FileError(`No interface file for ${locale}`));
        }
        return this.fetcher.once(`ui ${locale}`, async () =>
        {
            const catalog = await this.fetcher.get(address);
            if (!isCatalog(catalog))
            {
                throw new FileError(`The interface file for ${locale} is not valid`);
            }
            registerCatalog(locale, catalog);
        });
    }

    /**
     * Makes the questions in a language available.
     * @param locale The language.
     * @returns Resolves when they are there. Rejects when the file cannot be fetched or is not the right file.
     */
    public questions(locale: Locale): Promise<void>
    {
        const address = this.files.questions[locale];
        if (this.bank.hasQuestions(locale) || address === undefined)
        {
            return this.bank.hasQuestions(locale) ? Promise.resolve() : Promise.reject(new FileError(`No question file for ${locale}`));
        }
        return this.fetcher.once(`questions ${locale}`, async () =>
        {
            const file = await this.fetcher.get(address);
            if (!isQuestionFile(file, locale))
            {
                throw new FileError(`The question file for ${locale} is not valid`);
            }
            this.bank.addLocale(file);
        });
    }
}
