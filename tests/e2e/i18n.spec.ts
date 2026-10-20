import type { Page } from "@playwright/test";
import { answerExam, chooseFromListbox, correctOptionIndex, expect, openApp, pressOption, nameOfNumber, QUESTIONS, SEARCH_TITLE, shownNumber, stat, test, pressFinishExam } from "./fixtures";

/** Text of the exam result headline in German. */
const GERMAN_PASSED = "Bestanden";

test.describe("interface language", () =>
{
    test("is English when nothing else is said, with the translation off and the appearance on automatic", async ({ page }) =>
    {
        await openApp(page, { locale: null });
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(page.getByRole("tab", { name: "Practice" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Exam (33)" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
        await expect(page.locator(".brand-sub")).toHaveText("Einbürgerungstest · Leben in Deutschland · 310 questions");
        await expect(stat(page, "Seen")).toHaveText("0 of 310");
        await expect(page.locator(".question .bi-main")).toHaveAttribute("lang", "de");
        await expect(page.locator(".bi-sub")).toHaveCount(0);
        await expect(page.locator("#translation-toggle")).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("#theme-button")).toContainText("Auto");
    });

    test("is German with ?lang=de", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        await expect(page.locator("html")).toHaveAttribute("lang", "de");
        await expect(page.getByRole("tab", { name: "Üben" })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Prüfung (33)" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Überspringen" })).toBeVisible();
        await expect(page.locator(".brand-sub")).toHaveText("Einbürgerungstest · Leben in Deutschland · 310 Fragen");
        await expect(stat(page, "Gesehen")).toHaveText("0 von 310");
    });

    test("is English with ?lang=en", async ({ page }) =>
    {
        await openApp(page, { locale: "en" });
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(page.getByRole("tab", { name: "Practice" })).toBeVisible();
    });

    test("switches with the list in the header, keeps the focus there, and is remembered after a reload", async ({ page }) =>
    {
        await openApp(page, { locale: null });
        await expect(page.locator("#site-language-button")).toContainText("Site language");
        await chooseFromListbox(page, "site-language", "de");
        await expect(page.locator("html")).toHaveAttribute("lang", "de");
        await expect(page.getByRole("tab", { name: "Üben" })).toBeVisible();
        await expect(page.locator("#site-language-button")).toBeFocused();
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("lang", "de");
        await expect(page.getByRole("tab", { name: "Üben" })).toBeVisible();
        await chooseFromListbox(page, "site-language", "en");
        await expect(page.getByRole("tab", { name: "Practice" })).toBeVisible();
    });

    test("takes ?lang out of the address once it is applied, so a language chosen later survives a reload", async ({ page }) =>
    {
        await openApp(page, { locale: "en" });
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        expect(new URL(page.url()).search).toBe("");
        await chooseFromListbox(page, "site-language", "de");
        await expect(page.locator("html")).toHaveAttribute("lang", "de");
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("lang", "de");
        await expect(page.locator("#site-language-button")).toContainText("Deutsch");
    });

    test("does not change the language of the questions", async ({ page }) =>
    {
        await openApp(page, { locale: null });
        await chooseFromListbox(page, "site-language", "de");
        await expect(page.locator(".question .bi-main")).toHaveAttribute("lang", "de");
        await expect(page.locator(".bi-sub")).toHaveCount(0);
    });

    test("keeps the title of the start page the same in every language", async ({ page }) =>
    {
        await openApp(page, { locale: null });
        await expect(page).toHaveTitle(SEARCH_TITLE);
        await chooseFromListbox(page, "site-language", "de");
        await expect(page).toHaveTitle(SEARCH_TITLE);
        await chooseFromListbox(page, "site-language", "ar");
        await expect(page).toHaveTitle(SEARCH_TITLE);
    });

    test("describes the page in German in the head, for search engines and link previews, while the page is English", async ({ page }) =>
    {
        await openApp(page, { locale: null });
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(page.locator("meta[name=description]")).toHaveAttribute("content", /^Kostenlose Übungsseite für den Einbürgerungstest/);
        await expect(page.locator("meta[property='og:title']")).toHaveAttribute("content", SEARCH_TITLE);
    });

    test("runs a whole exam in German", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        await page.getByRole("tab", { name: "Prüfung (33)" }).click();
        await expect(page.getByRole("heading", { name: "Probeprüfung" })).toBeVisible();
        await page.getByRole("button", { name: "Prüfung starten" }).click();
        await expect(page.locator(".exam-progress")).toHaveText("Frage 1 von 33");
        await answerExam(page, 20);
        await pressFinishExam(page, "Prüfung beenden");
        await expect(page.locator(".result-label")).toHaveText(GERMAN_PASSED);
        await expect(page.locator(".result-score")).toHaveText("20 von 33");
        await expect(page.getByRole("heading", { name: "Rückblick: 13 verpasst" })).toBeVisible();
    });

    test("shows German feedback after an answer", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".verdict > span")).toHaveText("Richtig.");
        await expect(page.locator(".is-correct .mark")).toHaveText("Richtig");
    });

    test("opens the dialogs in German", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        const number = nameOfNumber(await shownNumber(page));
        // The button is named by its visible text; what it opens is its description.
        const original = page.locator(".original-btn");
        await expect(original).toHaveAttribute("title", `Frage ${number} wie im offiziellen Katalog gedruckt anzeigen`);
        await original.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: `Frage ${number} wie im Katalog gedruckt` })).toBeVisible();
        await dialog.getByRole("button", { name: "Problem mit dieser Frage melden" }).click();
        await expect(dialog.getByRole("link", { name: "Vorausgefülltes GitHub-Issue öffnen" })).toBeVisible();
        const mail = (await dialog.getByRole("link", { name: /E-Mail an hello@lidpractice.de schreiben/ }).getAttribute("href")) as string;
        expect(decodeURIComponent(mail)).toContain(`Frage: ${number} (Katalog Stand 07.05.2025`);
        await dialog.getByRole("button", { name: "Zurück" }).click();
        await dialog.getByRole("button", { name: "Über diese Seite und FAQ" }).click();
        await expect(dialog.getByRole("heading", { name: "Über diese Seite und FAQ" })).toBeVisible();
        await expect(dialog.locator("#faq-privacy summary")).toHaveText("Was passiert mit meinem Fortschritt und meinen Daten?");
    });

    test("never shows a message key instead of text", async ({ page }) =>
    {
        for (const locale of ["de", "en"] as const)
        {
            await openApp(page, { locale });
            await page.locator(".original-btn").first().click();
            await page.getByRole("dialog").getByRole("button").nth(1).click();
            const text = await page.locator("body").innerText();
            expect(text, locale).not.toMatch(/\b(tabs|exam|stats|card|footer|original|report|faq|about|settings|result|scope|weak|practice|picture|toast|modal|mail)\.[a-zA-Z]+/);
            await page.keyboard.press("Escape");
        }
    });
});

test.describe("question text in two languages", () =>
{
    test("every German question has an English translation below it when the translation is on", async ({ page }) =>
    {
        await openApp(page);
        await chooseFromListbox(page, "translation", "en");
        const number = await shownNumber(page);
        const question = QUESTIONS[number - 1];
        await expect(page.locator(".question .bi-main")).toHaveText(question.q);
        await expect(page.locator(".question .bi-sub")).toHaveText(question.qe);
    });
});

test.describe("theme", () =>
{
    /** Background colour of the page. */
    async function background(page: Page): Promise<string>
    {
        return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    }

    test("can be forced dark and light, whatever the system says, and goes back to following it", async ({ page }) =>
    {
        await page.emulateMedia({ colorScheme: "light" });
        await openApp(page);
        const light = await background(page);
        await chooseFromListbox(page, "theme", "dark");
        await expect(page.locator("html")).toHaveClass(/theme-dark/);
        const dark = await background(page);
        expect(dark).not.toBe(light);
        await chooseFromListbox(page, "theme", "light");
        await expect(page.locator("html")).toHaveClass(/theme-light/);
        expect(await background(page)).toBe(light);
        await page.emulateMedia({ colorScheme: "dark" });
        expect(await background(page)).toBe(light);
        await chooseFromListbox(page, "theme", "auto");
        await expect(page.locator("html")).not.toHaveClass(/theme-/);
        expect(await background(page)).toBe(dark);
    });

    test("follows the system when set to automatic", async ({ page }) =>
    {
        await page.emulateMedia({ colorScheme: "dark" });
        await openApp(page);
        const dark = await background(page);
        await page.emulateMedia({ colorScheme: "light" });
        expect(await background(page)).not.toBe(dark);
    });

    test("is remembered after a reload", async ({ page }) =>
    {
        await openApp(page);
        await chooseFromListbox(page, "theme", "dark");
        await page.reload();
        await expect(page.locator("html")).toHaveClass(/theme-dark/);
        await expect(page.locator("#theme-button")).toHaveAttribute("aria-label", "Appearance: Dark");
    });

    test("keeps the text readable in both themes: contrast of body text on the page background", async ({ page }) =>
    {
        await openApp(page);
        for (const theme of ["light", "dark"])
        {
            await chooseFromListbox(page, "theme", theme);
            const ratio = await page.evaluate(() =>
            {
                const channels = (color: string): number[] => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
                const luminance = ([red, green, blue]: number[]): number =>
                {
                    const linear = (value: number): number => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
                    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
                };
                const foreground = luminance(channels(getComputedStyle(document.body).color));
                const background = luminance(channels(getComputedStyle(document.body).backgroundColor));
                return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
            });
            expect(ratio, theme).toBeGreaterThan(7);
        }
    });
});

test.describe("assets of this site", () =>
{
    test("the manifest, the icons and the fonts are served, and the page links them", async ({ page, request }) =>
    {
        await openApp(page);
        const manifest = await (await request.get("/site.webmanifest")).json() as { name: string; icons: { src: string }[] };
        expect(manifest.name).toBe("LiD Practice");
        for (const icon of manifest.icons)
        {
            const response = await request.get(`/${icon.src}`);
            expect(response.status(), icon.src).toBe(200);
            expect(response.headers()["content-type"], icon.src).toBe("image/png");
        }
        for (const file of ["favicon.ico", "favicon.svg", "apple-touch-icon.png"])
        {
            expect((await request.get(`/${file}`)).status(), file).toBe(200);
        }
        await expect(page.locator("link[rel=manifest]")).toHaveAttribute("href", "site.webmanifest");
        await expect(page.locator("link[rel=apple-touch-icon]")).toHaveAttribute("href", "apple-touch-icon.png");
    });

    test("uses the fonts of this site: they load from the same address and are in use", async ({ page }) =>
    {
        const fonts: string[] = [];
        page.on("response", (response) =>
        {
            if (response.url().endsWith(".woff2"))
            {
                fonts.push(new URL(response.url()).pathname);
            }
        });
        await openApp(page);
        await page.evaluate(() => document.fonts.ready);
        expect(fonts.sort()).toEqual(["/fonts/bricolage-grotesque-latin-wght-normal.woff2", "/fonts/public-sans-latin-wght-normal.woff2"]);
        expect(await page.evaluate(() => document.fonts.check("16px \"Public Sans Variable\""))).toBe(true);
        expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Public Sans Variable");
    });

    test("the official catalogue is served with the PDF content type", async ({ request }) =>
    {
        const response = await request.get("/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf");
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toBe("application/pdf");
    });
});
