import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ_ENTRIES, MESSAGE_LINKS } from "../../src/content";
import de from "../../src/locales/de.json";
import en from "../../src/locales/en.json";

/** Every language the FAQ is written in. */
const CATALOGS: Record<string, Record<string, string>> = { de, en };

/** Link ids used as `[text](id)` in the messages. */
const LINK_PATTERN = /\]\(([A-Za-z0-9-]+)\)/g;

describe("FAQ content", () =>
{
    it("has stable, unique ids", () =>
    {
        const ids = FAQ_ENTRIES.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(["official", "edition", "authentic", "answers", "translations", "exam", "privacy", "changes", "report", "license"]);
    });

    it.each(Object.keys(CATALOGS))("has a question that ends with a question mark and filled paragraphs in %s", (code) =>
    {
        const catalog = CATALOGS[code];
        for (const entry of FAQ_ENTRIES)
        {
            expect(catalog[entry.question].trim().endsWith("?"), `${code} ${entry.id}`).toBe(true);
            expect(entry.answers.length, entry.id).toBeGreaterThan(0);
            for (const key of entry.answers)
            {
                expect(catalog[key].trim().length, `${code} ${key}`).toBeGreaterThan(20);
            }
        }
    });

    it("only links to ids that have an address", () =>
    {
        for (const code of Object.keys(CATALOGS))
        {
            for (const entry of FAQ_ENTRIES)
            {
                for (const key of entry.answers)
                {
                    for (const match of CATALOGS[code][key].matchAll(LINK_PATTERN))
                    {
                        expect(Object.keys(MESSAGE_LINKS), `${code} ${key}`).toContain(match[1]);
                    }
                }
            }
        }
    });

    it("sends links to https addresses, or to the copy of the catalogue on this site", () =>
    {
        for (const [id, href] of Object.entries(MESSAGE_LINKS))
        {
            expect(href.startsWith("https://") || href === "catalogue/gesamtfragenkatalog-lebenindeutschland.pdf", id).toBe(true);
        }
        expect(MESSAGE_LINKS.bamfPage).toContain("https://www.bamf.de/");
        expect(MESSAGE_LINKS.bamfPdf).toContain(".pdf?__blob=publicationFile&v=");
    });

    it("answers how to verify a question, where the answers come from, and what happens to data (English)", () =>
    {
        const text = (id: string): string => (FAQ_ENTRIES.find((entry) => entry.id === id)?.answers ?? []).map((key) => en[key as keyof typeof en]).join(" ");
        expect(text("authentic")).toContain("Original");
        expect(text("answers")).toContain("does not mark the right answers");
        expect(text("privacy")).toContain("only in your own browser");
        expect(text("privacy")).toContain("loads nothing from other servers");
        expect(text("changes")).toContain("The catalogue has changed");
        expect(text("license")).toContain("Commercial use is not allowed");
    });

    it("sends the privacy answer to this site's section of the privacy notice, in every language", () =>
    {
        expect(MESSAGE_LINKS.privacy).toBe("https://harshankur.com/datenschutz#lidpractice");
        for (const code of ["de", "en", "ar", "uk", "tr", "es", "hi"])
        {
            const catalog = JSON.parse(readFileSync(`src/locales/${code}.json`, "utf8")) as Record<string, string>;
            expect(catalog["faq.privacy.a1"], code).toMatch(/\]\(privacy\)/);
        }
    });

    it("says the same in German", () =>
    {
        const text = (id: string): string => (FAQ_ENTRIES.find((entry) => entry.id === id)?.answers ?? []).map((key) => de[key as keyof typeof de]).join(" ");
        expect(text("authentic")).toContain("Original");
        expect(text("privacy")).toContain("nur in deinem eigenen Browser");
        expect(text("license")).toContain("Kommerzielle Nutzung ist nicht erlaubt");
    });
});
