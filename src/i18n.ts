import { DEFAULT_UI_LOCALE, LOCALES, UI_LOCALES, directionOf, type Locale } from "./types";
import de from "./locales/de.json";
import en from "./locales/en.json";

/** Every message key. The German file is the base: a key that is not in it cannot be used. */
export type MessageKey = keyof typeof de;

/** Keys that have plural forms: `exam.unanswered` stands for `exam.unanswered.one` and `exam.unanswered.other`. */
export type PluralKey = MessageKey extends infer Key ? (Key extends `${infer Base}.one` ? Base : never) : never;

/** Values that fill the `{name}` placeholders of a message. */
export type MessageParams = Record<string, string | number>;

/** A piece of rich text: a string, or a link. */
export type RichPart = string | { text: string; href: string };

/**
 * The messages by language. German (the base, and the fallback of every other language) and English (the language the site
 * opens in) are part of the page; the others are added with {@link registerCatalog} when they are asked for.
 */
const BASE_CATALOG: Record<string, string> = de;
const CATALOGS: Partial<Record<Locale, Record<string, string>>> = { de, en };

/**
 * Makes the messages of a language available.
 * @param locale The language.
 * @param catalog Its messages, by key.
 */
export function registerCatalog(locale: Locale, catalog: Record<string, string>): void
{
    CATALOGS[locale] = catalog;
}

/**
 * Whether the messages of a language are available.
 * @param locale The language.
 * @returns True when they are.
 */
export function hasCatalog(locale: Locale): boolean
{
    return CATALOGS[locale] !== undefined;
}

/** Unicode isolates: what is between them keeps its own direction. */
export const FIRST_STRONG_ISOLATE = "\u2068";
export const POP_ISOLATE = "\u2069";

/** Matches `{name}` placeholders. */
const PLACEHOLDER = /\{(\w+)\}/g;

/** Matches `[text](id)` links in rich messages. */
const RICH_LINK = /\[([^\]]+)\]\(([A-Za-z0-9-]+)\)/g;

/**
 * Marks a string as a message key, so tables of keys are type checked and found by the key parity test.
 * @param key The key.
 * @returns The same key.
 */
export function msg(key: MessageKey): MessageKey
{
    return key;
}

/**
 * Turns a language code from outside (a saved setting, a query parameter) into a supported language.
 * @param value Anything.
 * @returns The language, or undefined when it is not supported.
 */
export function asLocale(value: unknown): Locale | undefined
{
    return LOCALES.find((locale) => locale === value);
}

/**
 * Narrows a value to a language that the site itself can be shown in.
 * @param value Anything, for example a query parameter or a saved value.
 * @returns The language, or undefined.
 */
export function asUiLocale(value: unknown): Locale | undefined
{
    return UI_LOCALES.find((locale) => locale === value);
}

/**
 * Translations for the interface: text lookup with placeholders, plural forms, number formatting and links.
 * German is the default and the fallback for any message that another language lacks.
 */
export class I18n
{
    private current: Locale;

    /**
     * @param locale Language to start in.
     */
    public constructor(locale: Locale = DEFAULT_UI_LOCALE)
    {
        this.current = locale;
    }

    /** The direction the current language is written in. */
    public get dir(): "ltr" | "rtl"
    {
        return directionOf(this.current);
    }

    /** The current language. */
    public get locale(): Locale
    {
        return this.current;
    }

    /**
     * Switches the language.
     * @param locale New language.
     */
    public setLocale(locale: Locale): void
    {
        this.current = locale;
    }

    /**
     * Looks a message up and fills in its placeholders.
     * @param key Message key.
     * @param params Values for `{name}` placeholders.
     * @returns The text. A key that exists nowhere is returned as it is, so the gap is visible.
     */
    public t(key: MessageKey, params: MessageParams = {}, isolate = true): string
    {
        const template = CATALOGS[this.current]?.[key] ?? BASE_CATALOG[key] ?? key;
        // In a right to left sentence a value in another script (a state name, a question number) is isolated, so it keeps
        // its own direction and does not reorder the words and punctuation around it. Text that leaves the page asks for none.
        const wrap = isolate && this.dir === "rtl";
        return template.replace(PLACEHOLDER, (placeholder, name: string) =>
        {
            const value = params[name];
            if (value === undefined)
            {
                return placeholder;
            }
            if (typeof value === "number")
            {
                return this.number(value);
            }
            return wrap ? `${FIRST_STRONG_ISOLATE}${value}${POP_ISOLATE}` : value;
        });
    }

    /**
     * Picks the plural form that fits a count, for example "one question" and "3 questions".
     * @param key Key without the `.one` or `.other` ending.
     * @param count How many.
     * @param params More values. `count` is always the given count.
     * @returns The text.
     */
    public plural(key: PluralKey, count: number, params: MessageParams = {}): string
    {
        const category = new Intl.PluralRules(this.current).select(count);
        const specific = `${key}.${category}` as MessageKey;
        // A language may have more forms than German (few, many, zero, two); a form it does not have falls back to "other".
        const chosen = specific in (CATALOGS[this.current] ?? BASE_CATALOG) || specific in BASE_CATALOG ? specific : (`${key}.other` as MessageKey);
        return this.t(chosen, { ...params, count });
    }

    /**
     * Formats a number the way the current language writes it.
     * @param value Number.
     * @param options Intl options.
     * @returns Text.
     */
    public number(value: number, options?: Intl.NumberFormatOptions): string
    {
        // Western digits in every language: the questions, the labels and the clock use them, and some engines would write Arabic-Indic digits for "ar".
        return new Intl.NumberFormat(`${this.current}-u-nu-latn`, options).format(value);
    }

    /**
     * Looks a message up that contains `[text](id)` links and splits it into text and links.
     * @param key Message key.
     * @param links Target address by link id. A link whose id is unknown is shown as plain text.
     * @param params Values for placeholders.
     * @returns Parts in reading order.
     */
    public rich(key: MessageKey, links: Record<string, string>, params: MessageParams = {}): RichPart[]
    {
        const text = this.t(key, params);
        const parts: RichPart[] = [];
        let last = 0;
        for (const match of text.matchAll(RICH_LINK))
        {
            const [whole, label, id] = match;
            const start = match.index as number;
            if (start > last)
            {
                parts.push(text.slice(last, start));
            }
            const href = links[id];
            parts.push(href === undefined ? label : { text: label, href });
            last = start + whole.length;
        }
        if (last < text.length)
        {
            parts.push(text.slice(last));
        }
        return parts;
    }
}

/** The one instance the whole page uses. */
export const i18n = new I18n();

/**
 * Shorthand for {@link I18n.t} on the shared instance.
 * @param key Message key.
 * @param params Values for placeholders.
 * @returns The text.
 */
export function t(key: MessageKey, params?: MessageParams): string
{
    return i18n.t(key, params);
}

/**
 * A message for text that leaves the page (an email, an address): never wrapped in direction marks.
 * @param key Message key.
 * @param params Values for the placeholders.
 * @returns The text.
 */
export function plain(key: MessageKey, params?: MessageParams): string
{
    return i18n.t(key, params, false);
}
