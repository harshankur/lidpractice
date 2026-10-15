import type { Page } from "@playwright/test";
import { chooseFromListbox, correctOptionIndex, expect, openApp, pressOption, test } from "./fixtures";

/** The languages the site itself can be shown in, and the tab names they use. */
const SITE_LANGUAGES = ["de", "en", "ar", "uk", "tr", "es", "hi"] as const;

/** Every language a translation can be shown in. */
const TRANSLATIONS = ["en", "ar", "uk", "tr", "es", "hi"] as const;

/**
 * Lists the elements that stick out of the window. In a right to left page what sticks out at the start edge cannot be scrolled to,
 * so the check for a horizontal scroll bar does not see it.
 * @param page Playwright page.
 * @returns A description of every such element.
 */
async function outsideTheWindow(page: Page): Promise<string[]>
{
    return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("button, .tag, .tab, .widget, .card, h1, h2")).flatMap((element) =>
    {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || element.closest(".timeline-strip"))
        {
            return [];
        }
        return box.left < -1 || box.right > window.innerWidth + 1 ? [`${element.id || element.className} ${Math.round(box.left)} to ${Math.round(box.right)}`] : [];
    }));
}

/**
 * Lists the buttons whose text is wider than the button, so it spills out or is cut off.
 * @param page Playwright page.
 * @returns A description of every such button.
 */
async function clippedButtons(page: Page): Promise<string[]>
{
    return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("button, .tag, .tab")).flatMap((element) =>
    {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0)
        {
            return [];
        }
        // A button that needs a second press holds two texts; only the one that is shown counts.
        const range = document.createRange();
        range.selectNodeContents(element.querySelector(".swap:not(.is-off)") ?? element);
        const text = range.getBoundingClientRect();
        const overflowing = text.width > box.width + 1.5 || (!element.querySelector(".swap") && element.scrollWidth > element.clientWidth + 1.5);
        return overflowing ? [`${element.id || element.className} "${(element.textContent ?? "").trim().slice(0, 40)}" text ${Math.round(text.width)} in ${Math.round(box.width)}`] : [];
    }));
}

/**
 * Asserts the page has no horizontal scroll.
 * @param page Playwright page.
 * @param where Name of the view.
 */
async function expectNoHorizontalScroll(page: Page, where: string): Promise<void>
{
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${where} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
}

test.describe("languages", () =>
{
    test("offers seven languages for the site, Arabic included, and six translations besides the German", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#site-language-button").click();
        await expect(page.locator("#site-language-list [role=option]")).toHaveText(["Deutsch", "English", "العربية", "Українська", "Türkçe", "Español", "हिन्दी"]);
        await page.keyboard.press("Escape");
        await page.locator("#translation-button").click();
        await expect(page.locator("#translation-list [role=option]")).toHaveCount(7);
    });

    for (const language of SITE_LANGUAGES)
    {
        test(`shows the site in ${language} without clipped buttons or horizontal scroll, in practice, train and the exam`, async ({ page }) =>
        {
            await openApp(page, { locale: language });
            await expect(page.locator("html")).toHaveAttribute("lang", language);
            await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
            await expectNoHorizontalScroll(page, `${language} practice`);
            expect(await outsideTheWindow(page), `${language} practice`).toEqual([]);
            expect(await clippedButtons(page), `${language} practice`).toEqual([]);
            await pressOption(page, await correctOptionIndex(page));
            expect(await clippedButtons(page), `${language} practice answered`).toEqual([]);
            await page.locator("#tab-train").click();
            await expectNoHorizontalScroll(page, `${language} train`);
            expect(await clippedButtons(page), `${language} train`).toEqual([]);
            await page.locator("#tab-exam").click();
            await expectNoHorizontalScroll(page, `${language} exam start`);
            await page.locator(".intro .primary").click();
            await expectNoHorizontalScroll(page, `${language} exam`);
            expect(await clippedButtons(page), `${language} exam`).toEqual([]);
            expect(await outsideTheWindow(page), `${language} exam`).toEqual([]);
        });
    }

    for (const language of TRANSLATIONS)
    {
        test(`shows the translation in ${language} under the German text, with its own direction, and the page stays left to right`, async ({ page }) =>
        {
            await openApp(page, { locale: "en" });
            await chooseFromListbox(page, "translation", language);
            const sub = page.locator(".question .bi-sub");
            await expect(sub).toHaveAttribute("lang", language);
            await expect(sub).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
            await expect(page.locator(".question .bi-main")).toHaveAttribute("dir", "ltr");
            await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
            expect(await sub.evaluate((element) => getComputedStyle(element).direction)).toBe(language === "ar" ? "rtl" : "ltr");
            await expectNoHorizontalScroll(page, `translation ${language}`);
            const german = await page.locator(".question .bi-main").innerText();
            expect((await sub.innerText()).trim()).not.toBe(german.trim());
            expect((await sub.innerText()).trim().length).toBeGreaterThan(5);
        });
    }

    test("aligns an Arabic translation to the right edge of the card and the German text to the left", async ({ page }) =>
    {
        await openApp(page, { locale: "en" });
        await chooseFromListbox(page, "translation", "ar");
        const card = await page.locator("article.card").boundingBox();
        const arabic = await page.locator(".question .bi-sub").evaluate((element) =>
        {
            const range = document.createRange();
            range.selectNodeContents(element);
            const box = range.getBoundingClientRect();
            return { left: box.left, right: box.right };
        });
        const german = await page.locator(".question .bi-main").evaluate((element) =>
        {
            const range = document.createRange();
            range.selectNodeContents(element);
            return { left: range.getBoundingClientRect().left };
        });
        expect(card).not.toBeNull();
        expect((card?.x ?? 0) + (card?.width ?? 0) - arabic.right).toBeLessThan(60);
        expect(german.left - (card?.x ?? 0)).toBeLessThan(60);
    });

    test("fetches the extra Latin font only for a page that shows Turkish letters", async ({ page }) =>
    {
        const fonts: string[] = [];
        page.on("request", (request) =>
        {
            if (request.url().includes("latin-ext"))
            {
                fonts.push(request.url());
            }
        });
        await openApp(page, { locale: "en" });
        await page.evaluate(() => document.fonts.ready);
        expect(fonts).toEqual([]);
        await chooseFromListbox(page, "site-language", "tr");
        await page.evaluate(() => document.fonts.ready);
        await expect.poll(() => fonts.length).toBeGreaterThan(0);
    });

    test.describe("the site in Arabic", () =>
    {
        test("mirrors the page: the title at the right, the lists at the left, the first tab at the right, the column at the side at the left", async ({ page, isMobile }) =>
        {
            await openApp(page, { saved: JSON.stringify({ uiLanguage: "ar" }), locale: null });
            await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
            const width = page.viewportSize()?.width ?? 0;
            const title = await page.locator("h1").boundingBox();
            const tools = await page.locator(".header-tools").boundingBox();
            const first = await page.locator("#tab-practice").boundingBox();
            const last = await page.locator("#tab-exam").boundingBox();
            expect((title?.x ?? 0) + (title?.width ?? 0) / 2).toBeGreaterThan(width / 2);
            if (!isMobile)
            {
                expect((tools?.x ?? 0) + (tools?.width ?? 0) / 2).toBeLessThan(width / 2);
            }
            expect(first?.x ?? 0).toBeGreaterThan(last?.x ?? 0);
            const stage = await page.locator(".stage").boundingBox();
            const aside = await page.locator("main.layout > .aside").boundingBox();
            if ((aside?.y ?? 0) < (stage?.y ?? 0) + 5)
            {
                expect(aside?.x ?? 0).toBeLessThan(stage?.x ?? 0);
            }
        });

        test("keeps the German question and options left to right, with the answer letter at the start of the row", async ({ page }) =>
        {
            await openApp(page, { saved: JSON.stringify({ uiLanguage: "ar" }), locale: null });
            const main = page.locator(".question .bi-main");
            await expect(main).toHaveAttribute("dir", "ltr");
            expect(await main.evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
            const option = page.locator("button.option").first();
            const letter = await option.locator(".letter").boundingBox();
            const box = await option.boundingBox();
            expect((letter?.x ?? 0) + (letter?.width ?? 0)).toBeGreaterThan((box?.x ?? 0) + (box?.width ?? 0) - 40);
        });

        test("scrolls the timeline the right way, with arrows that are mirrored and turn off at the ends", async ({ page }) =>
        {
            await openApp(page, { saved: JSON.stringify({ uiLanguage: "ar", order: "booklet" }), locale: null });
            const earlier = page.getByRole("button", { name: "الأسئلة السابقة" });
            const later = page.getByRole("button", { name: "الأسئلة التالية" });
            await expect(earlier).toBeDisabled();
            await expect(later).toBeEnabled();
            const where = async (): Promise<[number, number]> =>
            {
                const a = await earlier.boundingBox();
                const b = await later.boundingBox();
                return [a?.x ?? 0, b?.x ?? 0];
            };
            const [earlierX, laterX] = await where();
            expect(earlierX).toBeGreaterThan(laterX);
            const strip = page.locator(".timeline-strip");
            await later.click();
            await expect.poll(() => strip.evaluate((element) => Math.abs(element.scrollLeft)), { timeout: 10000 }).toBeGreaterThan(0);
            await expect(earlier).toBeEnabled();
            const first = await page.locator(".slot").first().boundingBox();
            const stripBox = await strip.boundingBox();
            expect(first?.x ?? 0).toBeGreaterThan(stripBox?.x ?? 0);
            await earlier.click();
            await expect.poll(() => strip.evaluate((element) => Math.abs(element.scrollLeft)), { timeout: 10000 }).toBeLessThan(1);
            await expect(earlier).toBeDisabled();
        });

        test("goes to the next question with the left arrow, and back with the right arrow", async ({ page }) =>
        {
            await openApp(page, { saved: JSON.stringify({ uiLanguage: "ar", order: "booklet" }), locale: null });
            await expect(page.locator(".qno")).toHaveText("Q1");
            await page.keyboard.press("1");
            await page.keyboard.press("ArrowLeft");
            await expect(page.locator(".qno")).toHaveText("Q2");
            await page.keyboard.press("ArrowRight");
            await expect(page.locator(".qno")).toHaveText("Q1");
        });

        test("moves on the strip of questions with the arrow that points to the later question", async ({ page }) =>
        {
            await openApp(page, { saved: JSON.stringify({ uiLanguage: "ar", order: "booklet" }), locale: null });
            await page.locator(".slot").first().focus();
            await page.keyboard.press("ArrowLeft");
            await expect(page.locator(".slot").nth(1)).toBeFocused();
            await page.keyboard.press("ArrowRight");
            await expect(page.locator(".slot").first()).toBeFocused();
        });

        test("shows the Arabic translation in the Arabic page, at the start edge, under the German text", async ({ page }) =>
        {
            await openApp(page, { saved: JSON.stringify({ uiLanguage: "ar", translation: "ar" }), locale: null });
            const sub = page.locator(".question .bi-sub");
            await expect(sub).toHaveAttribute("dir", "rtl");
            const card = await page.locator("article.card").boundingBox();
            const text = await sub.evaluate((element) =>
            {
                const range = document.createRange();
                range.selectNodeContents(element);
                return range.getBoundingClientRect().right;
            });
            expect((card?.x ?? 0) + (card?.width ?? 0) - text).toBeLessThan(60);
            await expectNoHorizontalScroll(page, "arabic and arabic");
            expect(await outsideTheWindow(page)).toEqual([]);
        });

        test("runs an exam in Arabic and flags a marked question in the corner at the end of the row", async ({ page }) =>
        {
            await openApp(page, { saved: JSON.stringify({ uiLanguage: "ar" }), locale: null });
            await page.locator("#tab-exam").click();
            await page.locator(".intro .primary").click();
            await page.locator("#exam-mark").click();
            const dot = page.locator(".nav-dot.is-marked");
            await expect(dot).toHaveCount(1);
            expect(await dot.evaluate((element) => getComputedStyle(element, "::after").transform)).toBe("matrix(-1, 0, 0, 1, 0, 0)");
            expect(await outsideTheWindow(page)).toEqual([]);
        });
    });

    test.describe("fonts", () =>
    {
        const cases = [
            { name: "Arabic", saved: { uiLanguage: "ar" }, file: "noto-sans-arabic" },
            { name: "Hindi", saved: { uiLanguage: "hi" }, file: "noto-sans-devanagari" },
            { name: "Ukrainian", saved: { uiLanguage: "uk" }, file: "noto-sans-cyrillic" },
        ];
        for (const { name, saved, file } of cases)
        {
            test(`loads the ${name} font from this site, and an English page does not`, async ({ page }) =>
            {
                const fonts: string[] = [];
                page.on("request", (request) =>
                {
                    if (request.url().includes(file))
                    {
                        fonts.push(request.url());
                    }
                });
                await openApp(page, { saved: JSON.stringify(saved), locale: null });
                await page.evaluate(() => document.fonts.ready);
                await expect.poll(() => fonts.length).toBeGreaterThan(0);
                expect(fonts.every((url) => new URL(url).host === new URL(page.url()).host)).toBe(true);
                const english: string[] = [];
                const other = await page.context().newPage();
                other.on("request", (request) =>
                {
                    if (request.url().includes(file))
                    {
                        english.push(request.url());
                    }
                });
                await other.goto("/?lang=en");
                await other.evaluate(() => document.fonts.ready);
                expect(english).toEqual([]);
            });
        }
    });
});
