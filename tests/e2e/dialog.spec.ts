import { BUNDLE, correctOptionIndex, embedBundle, expect, finishAnyway, LAST_GENERAL, nameOfNumber, openApp, pressOption, QUESTIONS, shownNumber, test, pressFinishExam } from "./fixtures";
import type { Page } from "@playwright/test";

/** Widest viewport that counts as a phone. */
const PHONE_MAX_WIDTH = 480;

/** The question numbers whose originals the test fetches one by one: first, last, picture, photo, ballot, state coat of arms, Berlin map, last of all. */
const SAMPLE_QUESTIONS = [1, 21, 55, 130, 216, 301, 328, 460];

/** Name of the button that opens the original of a question. */
const ORIGINAL_BUTTON = /^Original, p\. \d+$/;

/**
 * Asserts the page has no horizontal scrollbar.
 * @param page Playwright page.
 * @param where Name of the view, for the failure message.
 */
async function expectNoHorizontalScroll(page: Page, where: string): Promise<void>
{
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${where} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
}

/**
 * Whether keyboard focus is inside the dialog.
 * @param page Playwright page.
 * @returns True when focus is inside the dialog.
 */
async function focusIsInsideDialog(page: Page): Promise<boolean>
{
    return page.evaluate(() => document.querySelector("[role=dialog]")?.contains(document.activeElement) === true);
}

test.describe("Show original", () =>
{
    test("shows the question as printed, with the picture loaded", async ({ page }) =>
    {
        await openApp(page);
        const number = await shownNumber(page);
        await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("heading", { name: `Question ${nameOfNumber(number)} as printed in the catalogue` })).toBeVisible();
        const image = dialog.locator("img.original-image");
        await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
        await expect(image).toHaveAttribute("src", `catalogue/q-${String(number).padStart(3, "0")}.webp`);
    });

    test("links to the exact page of the PDF, which is served and is the real PDF", async ({ page, request }) =>
    {
        await openApp(page);
        const question = QUESTIONS[(await shownNumber(page)) - 1];
        await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
        const link = page.getByRole("dialog").getByRole("link", { name: `Open page ${question.pg} of the PDF` });
        await expect(link).toHaveAttribute("href", `catalogue/gesamtfragenkatalog-lebenindeutschland.pdf#page=${question.pg}`);
        const response = await request.get("/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf");
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toBe("application/pdf");
        expect((await response.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    });

    test("serves all 460 images", async ({ request }) =>
    {
        for (let number = 1; number <= 460; number++)
        {
            const response = await request.get(`/catalogue/q-${String(number).padStart(3, "0")}.webp`);
            expect(response.status(), `Q${number}`).toBe(200);
            expect(response.headers()["content-type"], `Q${number}`).toBe("image/webp");
        }
    });

    for (const number of SAMPLE_QUESTIONS)
    {
        test(`shows question ${number} with its text in the image`, async ({ page }) =>
        {
            // Make question `number` the only question, so the card on screen is that one.
            await embedBundle(page, {
                questions: [BUNDLE.questions[number - 1]],
                locales: {
                    de: { ...BUNDLE.locales.de, questions: [BUNDLE.locales.de.questions[number - 1]] },
                    // Only some questions have a translation, the other ones show the German text.
                    en: { ...BUNDLE.locales.en, questions: BUNDLE.locales.en.questions.filter((entry: { n: number }) => entry.n === number) },
                },
            });
            // A state question is only drawn when its state is chosen.
            const state = number > LAST_GENERAL ? BUNDLE.questions[number - 1].k : "berlin";
            await openApp(page, JSON.stringify({ state }));
            expect(await shownNumber(page)).toBe(number);
            await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
            const image = page.getByRole("dialog").locator("img.original-image");
            await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
            await expect(image).toHaveAttribute("alt", `Question ${nameOfNumber(number)} as printed on page ${QUESTIONS[number - 1].pg} of the official catalogue`);
        });
    }

    test("is available on the exam result for missed questions", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await page.getByRole("button", { name: "Start exam" }).click();
        await page.getByRole("button", { name: "Question 33", exact: true }).click();
        await pressFinishExam(page);
        await finishAnyway(page);
        await page.locator(".review-item").nth(3).getByRole("button", { name: ORIGINAL_BUTTON }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
    });
});

test.describe("dialog behaviour", () =>
{
    test("closes with Escape and gives focus back to the button", async ({ page }) =>
    {
        await openApp(page);
        const button = page.getByRole("button", { name: ORIGINAL_BUTTON });
        await button.focus();
        await button.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(button).toBeFocused();
    });

    test("closes with a click on the backdrop but not with a click inside", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
        await page.getByRole("dialog").locator(".modal-title").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.locator(".modal-backdrop").click({ position: { x: 4, y: 4 } });
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("closes with the close button", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: "About and FAQ" }).click();
        await page.getByRole("button", { name: "Close" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("keeps keyboard focus inside while open, in both directions", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: "About and FAQ" }).click();
        for (let step = 0; step < 40; step++)
        {
            await page.keyboard.press("Tab");
            expect(await focusIsInsideDialog(page), `Tab ${step + 1}`).toBe(true);
        }
        for (let step = 0; step < 40; step++)
        {
            await page.keyboard.press("Shift+Tab");
            expect(await focusIsInsideDialog(page), `Shift+Tab ${step + 1}`).toBe(true);
        }
    });

    test("blocks the page behind: shortcuts do nothing and the page does not scroll", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
        await page.keyboard.press("a");
        await page.keyboard.press("b");
        await page.keyboard.press("Enter");
        await expect(page.locator(".verdict")).toHaveCount(0);
        expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
        await page.keyboard.press("Escape");
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".verdict > span")).toHaveText("Correct.");
    });

    test("is a labelled modal dialog", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toHaveAttribute("aria-modal", "true");
        await expect(dialog).toHaveAccessibleName(/^Question (\d+|[A-Z]{2} \d+) as printed in the catalogue$/);
        // The page behind is hidden from assistive technology while the dialog is open.
        await expect(page.getByRole("button", { name: ORIGINAL_BUTTON })).toHaveCount(0);
        await expect(page.locator("#app")).toHaveAttribute("inert", "");
    });
});

test.describe("report and FAQ", () =>
{
    test("reporting a question offers a GitHub issue with the number filled in, and an email", async ({ page }) =>
    {
        await openApp(page);
        const number = nameOfNumber(await shownNumber(page));
        await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
        await page.getByRole("button", { name: "Report a problem with this question" }).click();
        const issue = new URL((await page.getByRole("link", { name: "Open a prefilled GitHub issue" }).getAttribute("href")) as string);
        expect(issue.origin + issue.pathname).toBe("https://github.com/harshankur/lidpractice/issues/new");
        expect(issue.searchParams.get("template")).toBe("question-error.yml");
        expect(issue.searchParams.get("question")).toBe(String(number));
        const mail = (await page.getByRole("link", { name: /Write an email to hello@lidpractice.de/ }).getAttribute("href")) as string;
        expect(mail.startsWith("mailto:hello@lidpractice.de?subject=")).toBe(true);
        expect(decodeURIComponent(mail)).toContain(`Question: ${number} (catalogue Stand 07.05.2025`);
    });

    test("the footer opens the FAQ, whose entries expand, and which names the official sources", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: "About and FAQ" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: "About this trainer and FAQ" })).toBeVisible();
        await expect(dialog.getByRole("link", { name: "Official page at the BAMF (the source of the catalogue)" })).toHaveAttribute("href", /^https:\/\/www\.bamf\.de\//);
        const item = dialog.locator("#faq-authentic");
        await expect(item).not.toHaveAttribute("open", "");
        await item.locator("summary").click();
        await expect(item).toHaveAttribute("open", "");
        await expect(item).toContainText("Original");
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
    });

    test("every external link opens in a new tab", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: "About and FAQ" }).click();
        const links = page.getByRole("dialog").locator("a");
        const count = await links.count();
        expect(count).toBeGreaterThan(8);
        for (let index = 0; index < count; index++)
        {
            await expect(links.nth(index)).toHaveAttribute("target", "_blank");
            await expect(links.nth(index)).toHaveAttribute("rel", /noopener/);
        }
    });
});

test.describe("dialog layout", () =>
{
    test("fits every view without horizontal scroll, and stays inside the viewport", async ({ page, isMobile }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: ORIGINAL_BUTTON }).click();
        await expectNoHorizontalScroll(page, "original view");
        await page.getByRole("button", { name: "Report a problem with this question" }).click();
        await expectNoHorizontalScroll(page, "report view");
        await page.getByRole("button", { name: "Back" }).click();
        await page.getByRole("dialog").getByRole("button", { name: "About and FAQ" }).click();
        await page.locator("#faq-changes summary").click();
        await expectNoHorizontalScroll(page, "about view");
        const box = await page.locator(".modal").boundingBox();
        const viewport = page.viewportSize() as { width: number; height: number };
        expect((box as NonNullable<typeof box>).width).toBeLessThanOrEqual(viewport.width);
        expect((box as NonNullable<typeof box>).height).toBeLessThanOrEqual(viewport.height);
        if (isMobile)
        {
            expect(viewport.width).toBeLessThanOrEqual(PHONE_MAX_WIDTH);
        }
    });

    test("scrolls inside the dialog when the content is longer than the screen", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("button", { name: "About and FAQ" }).click();
        for (const summary of await page.locator(".faq-item summary").all())
        {
            await summary.click();
        }
        const body = page.locator(".modal-body");
        expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
        await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
        await expect(page.getByRole("button", { name: "Report a problem" }).last()).toBeInViewport();
    });
});
