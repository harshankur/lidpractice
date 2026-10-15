import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asLocale, I18n, i18n, msg, t, type MessageKey } from "../../src/i18n";
import de from "../../src/locales/de.json";
import en from "../../src/locales/en.json";
import { DEFAULT_LOCALE, DEFAULT_UI_LOCALE, LOCALES } from "../../src/types";
import { registerAllCatalogs } from "../helpers/catalogs";

beforeAll(() => registerAllCatalogs());

describe("languages", () =>
{
    it("have German as the language of the questions and first language, and English as the default of the site", () =>
    {
        expect(DEFAULT_LOCALE).toBe("de");
        expect(DEFAULT_UI_LOCALE).toBe("en");
        expect(LOCALES).toEqual(["de", "en", "ar", "uk", "tr", "es", "hi"]);
    });

    it("recognise a supported language code and nothing else", () =>
    {
        expect(asLocale("de")).toBe("de");
        expect(asLocale("en")).toBe("en");
        for (const value of ["fr", "DE", "", null, undefined, 5, {}])
        {
            expect(asLocale(value), String(value)).toBeUndefined();
        }
    });
});

describe("I18n", () =>
{
    let german: I18n;
    let english: I18n;

    beforeEach(() =>
    {
        german = new I18n("de");
        english = new I18n("en");
    });

    describe("t", () =>
    {
        it("starts in English when no language is given", () =>
        {
            expect(new I18n().locale).toBe("en");
            expect(german.locale).toBe("de");
            expect(german.t("tabs.practice")).toBe("Üben");
            expect(english.t("tabs.practice")).toBe("Practice");
        });

        it("switches language", () =>
        {
            german.setLocale("en");
            expect(german.locale).toBe("en");
            expect(german.t("tabs.practice")).toBe("Practice");
        });

        it("fills placeholders", () =>
        {
            expect(english.t("exam.progress", { current: 3, total: 33 })).toBe("Question 3 of 33");
            expect(german.t("exam.progress", { current: 3, total: 33 })).toBe("Frage 3 von 33");
        });

        it("writes number values the way the language does", () =>
        {
            expect(german.t("stats.seenValue", { seen: 1234, total: 5678 })).toBe("1.234 von 5.678");
            expect(english.t("stats.seenValue", { seen: 1234, total: 5678 })).toBe("1,234 of 5,678");
        });

        it("leaves text values exactly as they are, including numbers written as text", () =>
        {
            expect(english.t("toast.error", { message: "code 1234" })).toBe("Something went wrong: code 1234");
        });

        it("keeps a placeholder that has no value, so the gap is visible", () =>
        {
            expect(english.t("exam.progress", { current: 3 })).toBe("Question 3 of {total}");
        });

        it("falls back to the German text when another language lacks a message", () =>
        {
            const catalog = en as Record<string, string>;
            const original = catalog["tabs.practice"];
            delete catalog["tabs.practice"];
            try
            {
                expect(english.t("tabs.practice")).toBe("Üben");
                expect(english.t("tabs.exam", { count: 1 })).toBe("Exam (1)");
            }
            finally
            {
                catalog["tabs.practice"] = original;
            }
            expect(english.t("tabs.practice")).toBe("Practice");
        });

        it("returns the key itself when it exists nowhere", () =>
        {
            expect(english.t("does.not.exist" as MessageKey)).toBe("does.not.exist");
        });

        it("uses the shared instance for the t shorthand", () =>
        {
            i18n.setLocale("de");
            expect(t("tabs.exam", { count: 33 })).toBe("Prüfung (33)");
            i18n.setLocale("en");
            expect(t("tabs.exam", { count: 33 })).toBe("Exam (33)");
            i18n.setLocale("de");
        });
    });

    describe("plural", () =>
    {
        it.each([[0, "0 Fragen sind noch unbeantwortet und zählen als falsch."], [1, "1 Frage ist noch unbeantwortet und zählt als falsch."], [2, "2 Fragen sind noch unbeantwortet und zählen als falsch."]])(
            "picks the German form for %i", (count, expected) =>
            {
                expect(german.plural("exam.unanswered", count)).toBe(expected);
            });

        it.each([[0, "0 questions are still unanswered and will count as wrong."], [1, "1 question is still unanswered and will count as wrong."], [5, "5 questions are still unanswered and will count as wrong."]])(
            "picks the English form for %i", (count, expected) =>
            {
                expect(english.plural("exam.unanswered", count)).toBe(expected);
            });

        it("always uses the given count, even if a value named count is passed", () =>
        {
            expect(english.plural("exam.unanswered", 3, { count: 99 })).toContain("3 questions");
        });
    });

    describe("number", () =>
    {
        it("formats with the grouping of the language", () =>
        {
            expect(german.number(12345.5)).toBe("12.345,5");
            expect(english.number(12345.5)).toBe("12,345.5");
        });

        it("accepts Intl options", () =>
        {
            expect(english.number(0.256, { style: "percent" })).toBe("26%");
        });
    });

    describe("rich", () =>
    {
        const links = { bamfPage: "https://example.org/page", copy: "catalogue/x.pdf" };

        it("splits a message into text and links", () =>
        {
            const parts = english.rich("faq.authentic.a2", { ...links, bamfPdf: "https://example.org/file.pdf" });
            expect(parts).toEqual([
                "You can also open the whole booklet: ",
                { text: "download it from the BAMF", href: "https://example.org/file.pdf" },
                " or open our ",
                { text: "identical copy", href: "catalogue/x.pdf" },
                ". The copy has the same checksum as the BAMF download.",
            ]);
        });

        it("shows a link with an unknown id as plain text", () =>
        {
            const parts = english.rich("faq.authentic.a2", {});
            expect(parts.every((part) => typeof part === "string")).toBe(true);
            expect(parts.join("")).toContain("identical copy");
        });

        it("fills placeholders inside rich messages and keeps the text around links", () =>
        {
            const parts = english.rich("faq.edition.a1", links, { stand: "01.01.2030" });
            expect(parts[0]).toBe("The \"Gesamtfragenkatalog\" with Stand 01.01.2030, as published on the ");
            expect(parts[1]).toEqual({ text: "BAMF website", href: "https://example.org/page" });
        });

        it("returns plain text as one part", () =>
        {
            expect(english.rich("tabs.practice", links)).toEqual(["Practice"]);
        });
    });
});

describe("msg", () =>
{
    it("returns the key unchanged, which only marks it for the type checker and the key scan", () =>
    {
        expect(msg("tabs.practice")).toBe("tabs.practice");
    });
});

describe("language files", () =>
{
    it("have the same keys in German and English", () =>
    {
        expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    });
});
