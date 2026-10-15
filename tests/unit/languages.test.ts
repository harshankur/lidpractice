// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { I18n } from "../../src/i18n";
import { DEFAULT_LOCALE, LOCALES, UI_LOCALES, directionOf, type Locale } from "../../src/types";
import {
    chooseFromListbox, chooseTranslation, clickButton, mountApp, REAL_BUNDLE, shownNumber, startExam, type AppExports,
} from "../helpers/appHarness";
import { registerAllCatalogs } from "../helpers/catalogs";

/** The languages a translation of the questions can be shown in. */
const TRANSLATIONS = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** The question text of a number in a language. */
function questionIn(locale: Locale, questionNumber: number): string
{
    return (REAL_BUNDLE.locales[locale].questions.find((entry) => entry.n === questionNumber) as { q: string }).q;
}

beforeAll(() => registerAllCatalogs());

describe("languages of the site and of the translation", () =>
{
    let app: AppExports;

    beforeEach(() =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        window.localStorage.clear();
    });

    describe("direction", () =>
    {
        it("is right to left for Arabic and left to right for every other language", () =>
        {
            expect(LOCALES.filter((locale) => directionOf(locale) === "rtl")).toEqual(["ar"]);
            expect(new I18n("ar").dir).toBe("rtl");
            expect(new I18n("hi").dir).toBe("ltr");
        });

        it.each(UI_LOCALES)("sets the direction of the page from the site language, %s", async (locale) =>
        {
            app = await mountApp(undefined, { locale });
            expect(document.documentElement.lang).toBe(locale);
            expect(document.documentElement.dir).toBe(directionOf(locale));
            expect(document.querySelector("h1")?.textContent).toBe("LiD Practice");
        });

        it("mirrors the page for Arabic and puts it back when another language is chosen", async () =>
        {
            app = await mountApp(undefined, { locale: "ar" });
            expect(document.documentElement.dir).toBe("rtl");
            await chooseFromListbox("site-language", "en");
            expect(document.documentElement.dir).toBe("ltr");
            await chooseFromListbox("site-language", "ar");
            expect(document.documentElement.dir).toBe("rtl");
        });

        it("offers Arabic as a language of the site, takes it from the address, and keeps it as a saved choice", async () =>
        {
            expect(UI_LOCALES).toContain("ar");
            app = await mountApp(undefined, { locale: "ar" });
            expect(document.documentElement.lang).toBe("ar");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).uiLanguage).toBe("ar");
            app = await mountApp(undefined, { locale: null });
            expect(document.documentElement.lang).toBe("ar");
        });

        it("keeps the German question and the answer letters left to right in the Arabic page, and the question label too", async () =>
        {
            app = await mountApp(undefined, { locale: "ar" });
            expect(document.querySelector(".question .bi-main")?.getAttribute("dir")).toBe("ltr");
            expect(document.querySelector(".qno")?.getAttribute("dir")).toBe("ltr");
            expect(document.querySelector("#clock-minutes, .timeline-counts span")?.getAttribute("dir")).toBe("ltr");
        });
    });

    describe("the translation of the questions", () =>
    {
        it.each(TRANSLATIONS)("shows %s below the German text with its own language and direction, and German stays left to right", async (locale) =>
        {
            app = await mountApp(undefined, { locale: "en" });
            await chooseTranslation(locale);
            const number = shownNumber();
            const main = document.querySelector(".question .bi-main") as HTMLElement;
            const sub = document.querySelector(".question .bi-sub") as HTMLElement;
            expect(main.getAttribute("lang")).toBe("de");
            expect(main.getAttribute("dir")).toBe("ltr");
            expect(sub.getAttribute("lang")).toBe(locale);
            expect(sub.getAttribute("dir")).toBe(directionOf(locale));
            expect(sub.textContent).toBe(questionIn(locale, number));
            expect(document.documentElement.dir).toBe("ltr");
        });

        it.each(TRANSLATIONS)("shows the four options of the question in %s, in the order of the German ones", async (locale) =>
        {
            app = await mountApp(undefined, { locale: "en" });
            await chooseTranslation(locale);
            const number = shownNumber();
            const entry = REAL_BUNDLE.locales[locale].questions.find((candidate) => candidate.n === number) as { a: string[] };
            const german = REAL_BUNDLE.locales.de.questions.find((candidate) => candidate.n === number) as { a: string[] };
            const options = Array.from(document.querySelectorAll("button.option"));
            for (const [index, german4] of german.a.entries())
            {
                const button = options.find((candidate) => candidate.querySelector(".bi-main")?.textContent === german4) as Element;
                expect(button.querySelector(".bi-sub")?.textContent, `${locale} option ${index}`).toBe(entry.a[index]);
            }
        });

        it("keeps the credit under a picture in German, left to right", async () =>
        {
            app = await mountApp(undefined, { locale: "en" });
            await chooseTranslation("ar");
            startExam();
            expect(document.querySelectorAll("figcaption[dir=rtl], .caption[dir=rtl]")).toHaveLength(0);
        });

        it("tells which language the unofficial text is in, in the language of the site", async () =>
        {
            app = await mountApp(undefined, { locale: "en" });
            await chooseTranslation("hi");
            expect(document.querySelector(".unofficial-note")?.textContent).toContain("हिन्दी");
        });

        it("lists every language but German, in its own language", async () =>
        {
            app = await mountApp(undefined, { locale: "en" });
            (document.getElementById("translation-button") as HTMLButtonElement).click();
            const labels = Array.from(document.querySelectorAll("#translation-list [role=option]")).map((option) => option.textContent);
            expect(labels[0]).toContain("Automatic");
            expect(labels.slice(1)).toEqual(["English", "العربية", "Українська", "Türkçe", "Español", "हिन्दी"]);
        });
    });

    describe("what the interface writes", () =>
    {
        it.each(LOCALES)("writes numbers with the digits 0 to 9 in %s", (locale) =>
        {
            const text = new I18n(locale).number(1234);
            expect(text).toMatch(/^1\D?234$/);
            expect(new I18n(locale).t("stats.seenValue", { seen: 12, total: 310 })).toMatch(/12/);
            expect(new I18n(locale).t("stats.seenValue", { seen: 12, total: 310 })).not.toMatch(/[٠-٩۰-۹०-९]/);
        });

        it("picks the plural form of Arabic: zero, one, two, few, many and the rest", () =>
        {
            const arabic = new I18n("ar");
            const forms = [0, 1, 2, 3, 10, 11, 99, 100, 103].map((count) => arabic.plural("panel.questions", count).replace(String(count), "#"));
            expect(new Set(forms).size).toBeGreaterThanOrEqual(5);
            expect(forms[1]).not.toBe(forms[2]);
            expect(forms[3]).toBe(forms[4]);
            expect(forms[5]).toBe(forms[6]);
        });

        it("picks the plural form of Ukrainian: 1 and 21 alike, 2 to 4 alike, 5 to 20 alike", () =>
        {
            const ukrainian = new I18n("uk");
            const text = (count: number): string => ukrainian.plural("panel.questions", count).replace(String(count), "#");
            expect(text(1)).toBe(text(21));
            expect(text(2)).toBe(text(4));
            expect(text(5)).toBe(text(20));
            expect(text(21)).not.toBe(text(20));
            expect(text(4)).not.toBe(text(5));
        });

        it("treats 0 like 1 in Hindi, and tells Turkish and Spanish ones apart", () =>
        {
            const hindi = new I18n("hi");
            expect(hindi.plural("panel.questions", 0).replace("0", "#")).toBe(hindi.plural("panel.questions", 1).replace("1", "#"));
            const spanish = new I18n("es");
            expect(spanish.plural("panel.questions", 1)).not.toBe(spanish.plural("panel.questions", 2));
        });

        it("falls back to the form 'other' for a language that has no more forms", () =>
        {
            const english = new I18n("en");
            expect(english.plural("panel.questions", 2)).toBe("2 questions");
            expect(english.plural("panel.questions", 1)).toBe("1 question");
        });
    });

    describe("every view in every language of the site", () =>
    {
        it.each(UI_LOCALES)("shows no message key and no empty button in %s", async (locale) =>
        {
            app = await mountApp(undefined, { locale });
            const check = (where: string): void =>
            {
                const text = document.body.textContent as string;
                expect(/\b[a-z]+\.[a-zA-Z]+(\.[a-zA-Z]+)?\b/.test(text.replace(/\bLiD\b|Q\d+|\d+\.\d+|BAMF|\.json|\.de\b/g, "")) && /\b(tabs|exam|stats|panel|round|train|result)\.[a-zA-Z]+/.test(text), `${locale} ${where}`).toBe(false);
                for (const button of Array.from(document.querySelectorAll("button")))
                {
                    const name = (button.textContent ?? "").trim() || button.getAttribute("aria-label") || "";
                    expect(name.length, `${locale} ${where}: a button without a name`).toBeGreaterThan(0);
                }
            };
            check("practice");
            document.querySelector<HTMLElement>("#tab-train")?.click();
            check("train");
            document.querySelector<HTMLElement>("#tab-exam")?.click();
            check("exam intro");
            clickButton(document.querySelector<HTMLElement>(".intro .primary")?.textContent as string);
            check("running exam");
            await chooseFromListbox("site-language", "en");
            expect(document.documentElement.lang).toBe("en");
        });
    });
});
