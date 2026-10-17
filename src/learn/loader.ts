import { FileError, FileFetcher } from "../fetchOnce";
import type { LearnFiles, Locale } from "../types";
import { isCourseFile, isCourseTexts, isMapsFile } from "./course";
import type { CourseFile, CourseTexts, MapsFile } from "./types";

/**
 * Fetches the files of the Learn tab when the tab is opened: the course, the maps and the texts of a language.
 * Nothing of it is in the page itself, so a visitor who only practises never downloads it. A file is fetched once.
 */
export class LearnLoader
{
    private readonly fetcher: FileFetcher;
    private courseFile: CourseFile | null = null;
    private mapsFile: MapsFile | null = null;
    private readonly textFiles = new Map<Locale, CourseTexts>();

    /**
     * @param files Where the files are.
     * @param fetcher How a file is fetched. Replaced in tests.
     */
    public constructor(private readonly files: LearnFiles, fetcher?: (address: string) => Promise<Response>)
    {
        this.fetcher = new FileFetcher(fetcher);
    }

    /** The course, or null before it was fetched. */
    public get course(): CourseFile | null
    {
        return this.courseFile;
    }

    /** The maps, or null before they were fetched. */
    public get maps(): MapsFile | null
    {
        return this.mapsFile;
    }

    /**
     * The texts of a language.
     * @param locale The language.
     * @returns The texts, or undefined before they were fetched.
     */
    public texts(locale: Locale): CourseTexts | undefined
    {
        return this.textFiles.get(locale);
    }

    /**
     * Whether everything the tab needs in a language is there.
     * @param locale The language.
     * @returns True when the course, the maps and the texts are loaded.
     */
    public has(locale: Locale): boolean
    {
        return this.courseFile !== null && this.mapsFile !== null && this.textFiles.has(locale);
    }

    /**
     * Forgets the files of the course, so the next load fetches them again. Used when they arrived, but the course
     * could not be put together from them: keeping them would only build the same broken course again.
     * @param locale The language whose texts are forgotten.
     */
    public forget(locale: Locale): void
    {
        this.courseFile = null;
        this.mapsFile = null;
        this.textFiles.delete(locale);
    }

    /**
     * Fetches what is not there yet: the course, the maps and the texts of a language.
     * @param locale The language.
     * @returns Resolves when all three are there. Rejects when a file cannot be fetched or is not the right file.
     */
    public async load(locale: Locale): Promise<void>
    {
        await Promise.all([this.loadCourse(), this.loadMaps(), this.loadTexts(locale)]);
    }

    /**
     * Fetches one file and checks it.
     * @param key What is loaded, so it is loaded once.
     * @param address Where it is, or undefined when the page does not name it.
     * @param valid Whether what was fetched is the right file.
     * @returns The file.
     */
    private fetchChecked<T>(key: string, address: string | undefined, valid: (value: unknown) => value is T): Promise<T>
    {
        if (address === undefined)
        {
            return Promise.reject(new FileError(`No file for the ${key}`));
        }
        return this.fetcher.once(key, async () =>
        {
            const value = await this.fetcher.get(address);
            if (!valid(value))
            {
                throw new FileError(`The file for the ${key} is not valid`);
            }
            return value;
        });
    }

    /** Fetches the course when it is not there. */
    private async loadCourse(): Promise<void>
    {
        this.courseFile = this.courseFile ?? await this.fetchChecked("course", this.files.course, isCourseFile);
    }

    /** Fetches the maps when they are not there. */
    private async loadMaps(): Promise<void>
    {
        this.mapsFile = this.mapsFile ?? await this.fetchChecked("maps", this.files.maps, isMapsFile);
    }

    /**
     * Fetches the texts of a language when they are not there.
     * @param locale The language.
     */
    private async loadTexts(locale: Locale): Promise<void>
    {
        if (!this.textFiles.has(locale))
        {
            const valid = (value: unknown): value is CourseTexts => isCourseTexts(value, locale);
            this.textFiles.set(locale, await this.fetchChecked(`course texts in ${locale}`, this.files.texts[locale], valid));
        }
    }
}
