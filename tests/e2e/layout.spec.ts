import type { Page } from "@playwright/test";
import { answerExam, embedBundle, bundleWithTexts, expect, finishAnyway, openApp, pressOption, QUESTIONS, startRound, test, weakState, pressFinishExam } from "./fixtures";

/** Widest viewport that counts as a phone. */
const PHONE_MAX_WIDTH = 480;

/** A word this long (for example "Oberbuergermeisterin/Oberbuergermeister") cannot fit a phone without wrapping. */
const LONG_WORD_LENGTH = 30;

/**
 * Longest unbroken run of characters in a question and its options, German and English.
 * @param question Entry of the question bank.
 * @returns Length of the longest word.
 */
function longestWord(question: (typeof QUESTIONS)[number]): number
{
    const texts = [question.q, question.qe, ...question.a, ...question.ae];
    return Math.max(...texts.flatMap((text) => text.split(/\s+/).map((word) => word.length)));
}

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

test.describe("layout", () =>
{
    test("uses the device width on phones", async ({ page, isMobile }) =>
    {
        test.skip(!isMobile, "phone only");
        await openApp(page);
        const width = await page.evaluate(() => document.documentElement.clientWidth);
        expect(width).toBeLessThanOrEqual(PHONE_MAX_WIDTH);
    });

    test("renders in standards mode", async ({ page }) =>
    {
        await openApp(page);
        expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat");
    });

    test("has no horizontal scroll in practice, weak spots and picture questions", async ({ page }) =>
    {
        await openApp(page, weakState([21, 176, 181, 235]));
        await expectNoHorizontalScroll(page, "practice");
        await pressOption(page, 0);
        await expectNoHorizontalScroll(page, "answered practice");
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        await expectNoHorizontalScroll(page, "weak spots");
    });

    test("has no horizontal scroll with the topic panel, the legend, the translation and the end of a round", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#change-selection").click();
        await expectNoHorizontalScroll(page, "topic panel");
        await page.locator("#preset-none").click();
        await page.locator("#order-booklet").check();
        await page.locator("#panel-start").click();
        await page.getByRole("button", { name: "Legend" }).click();
        await expectNoHorizontalScroll(page, "timeline legend");
        await page.locator("#translation-button").click();
        await expectNoHorizontalScroll(page, "translation list open");
        await page.keyboard.press("Escape");
        for (let index = 0; index < 10; index++)
        {
            await page.keyboard.press("ArrowRight");
        }
        await expectNoHorizontalScroll(page, "end of the round");
    });

    test("has no horizontal scroll in the exam and on the result", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await expectNoHorizontalScroll(page, "exam intro");
        await page.getByRole("button", { name: "Start exam" }).click();
        await expectNoHorizontalScroll(page, "running exam");
        await answerExam(page, 0);
        await pressFinishExam(page);
        await expectNoHorizontalScroll(page, "exam result with 33 missed questions");
    });

    test("wraps very long German words in practice and in the exam review", async ({ page }) =>
    {
        const hardest = [...QUESTIONS].sort((first, second) => longestWord(second) - longestWord(first))[0];
        expect(longestWord(hardest)).toBeGreaterThanOrEqual(LONG_WORD_LENGTH);
        // Serve the real page, but give every question the text of the question with the longest words.
        await embedBundle(page, bundleWithTexts(() => hardest));
        await openApp(page);
        await expectNoHorizontalScroll(page, "practice question");
        await pressOption(page, 0);
        await expectNoHorizontalScroll(page, "answered practice question");
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await page.getByRole("button", { name: "Start exam" }).click();
        await answerExam(page, 0);
        await pressFinishExam(page);
        await expectNoHorizontalScroll(page, "exam review with long words");
    });
});

/** A rectangle on the page. */
interface Box
{
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Box of an element measured from the top left of a widget, rounded to a tenth of a pixel, so that scrolling does not matter.
 * @param page Playwright page.
 * @param selector The element.
 * @param widget The widget that holds it.
 * @returns Position and size.
 */
async function insideWidget(page: Page, selector: string, widget: string): Promise<Box>
{
    return page.evaluate(([inner, outer]) =>
    {
        const a = (document.querySelector(inner) as HTMLElement).getBoundingClientRect();
        const b = (document.querySelector(outer) as HTMLElement).getBoundingClientRect();
        const round = (value: number): number => Math.round(value * 10) / 10;
        return { x: round(a.left - b.left), y: round(a.top - b.top), width: round(a.width), height: round(a.height) };
    }, [selector, widget]);
}

/**
 * Width of an element.
 * @param page Playwright page.
 * @param selector The element.
 * @returns Width in pixels.
 */
async function widthOf(page: Page, selector: string): Promise<number>
{
    return page.evaluate((inner) => (document.querySelector(inner) as HTMLElement).getBoundingClientRect().width, selector);
}

/**
 * The box of the first element that matches.
 * @param page Playwright page.
 * @param selector Selector.
 * @returns The box.
 */
async function boxOf(page: Page, selector: string): Promise<Box>
{
    const box = await page.locator(selector).first().boundingBox();
    if (!box)
    {
        throw new Error(`${selector} has no box`);
    }
    return box;
}

/**
 * A custom property of the page, as a number of pixels.
 * @param page Playwright page.
 * @param name Property name.
 * @returns The value.
 */
async function pixels(page: Page, name: string): Promise<number>
{
    return page.evaluate((property) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property)), name);
}

/** Opens a round in the order of the booklet and goes to question 97, so there are slots on both sides of the current one. */
async function goTo97(page: Page): Promise<void>
{
    await openApp(page);
    await startRound(page, { scope: "general", order: "booklet" });
    for (let index = 0; index < 96; index++)
    {
        await page.keyboard.press("ArrowRight");
    }
    await expect(page.locator(".slot.is-current .slot-number")).toHaveText("97");
}

test.describe("buttons that keep their box when their words change", () =>
{
    test("Skip, Next question and Change selection keep their size and place, and push nothing", async ({ page }) =>
    {
        await openApp(page);
        const before = { next: await boxOf(page, "#round-next"), back: await boxOf(page, "#round-back"), change: await boxOf(page, "#change-selection") };
        await page.locator("button.option").first().click();
        expect(await boxOf(page, "#round-next")).toEqual(before.next);
        expect(await boxOf(page, "#round-back")).toEqual(before.back);
        await page.locator("#change-selection").click();
        expect(await boxOf(page, "#change-selection")).toEqual(before.change);
    });
});

test.describe("one system of controls", () =>
{
    test("gives every control of a kind the same height, from the tokens, on this screen", async ({ page }) =>
    {
        await goTo97(page);
        const control = await pixels(page, "--h-control");
        const small = await pixels(page, "--h-control-sm");
        const tag = await pixels(page, "--h-tag");
        const large = [".tab >> nth=0", ".tab >> nth=1", "#change-selection", "#round-back", "#round-next", ".slot.is-open >> nth=0", ".timeline-scroll >> nth=0", ".timeline-scroll >> nth=1"];
        for (const selector of large)
        {
            expect((await boxOf(page, selector)).height, selector).toBeCloseTo(control, 0);
        }
        const compact = ["#site-language-button", "#theme-button", "#translation-button", ".original-btn", "#state-button", ".timeline-legend-toggle", "#reset-progress"];
        for (const selector of compact)
        {
            expect((await boxOf(page, selector)).height, selector).toBeCloseTo(small, 0);
        }
        for (const selector of [".qno", ".tag-topic"])
        {
            expect((await boxOf(page, selector)).height, selector).toBeCloseTo(tag, 0);
        }
    });

    test("keeps the size and place of a button that needs a second press when it asks for it, in the widget of progress", async ({ page }) =>
    {
        await openApp(page);
        const button = page.locator("#reset-progress");
        await button.scrollIntoViewIfNeeded();
        const before = await insideWidget(page, "#reset-progress", ".stats");
        await button.click();
        await expect(button).toHaveClass(/danger/);
        const after = await insideWidget(page, "#reset-progress", ".stats");
        expect(after).toEqual(before);
        expect(await page.locator("#reset-progress .swap:not(.is-off)").evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(25);
        expect(after.x + after.width).toBeLessThanOrEqual(await widthOf(page, ".stats") + 0.5);
        await expect(page.getByRole("button", { name: "Tap again to erase progress" })).toBeVisible();
    });

    test("keeps the size and place of Start over and of the buttons beside it when it asks for a second press", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await page.getByRole("button", { name: "Start exam" }).click();
        await page.locator("#exam-start-over").scrollIntoViewIfNeeded();
        const names = ["#exam-finish", "#exam-start-over"];
        const before = [await insideWidget(page, names[0], ".exam-widget"), await insideWidget(page, names[1], ".exam-widget")];
        await page.locator("#exam-start-over").click();
        await expect(page.locator("#exam-start-over")).toHaveClass(/danger/);
        const after = [await insideWidget(page, names[0], ".exam-widget"), await insideWidget(page, names[1], ".exam-widget")];
        expect(after).toEqual(before);
        expect(after[1].x + after[1].width).toBeLessThanOrEqual(await widthOf(page, ".exam-widget") + 0.5);
        expect(after[1].height).toBeCloseTo(await pixels(page, "--h-control-sm"), 0);
    });

    test("makes the play and pause button a small square that stays put when it morphs", async ({ page }) =>
    {
        await openApp(page);
        const small = await pixels(page, "--h-control-sm");
        await page.locator("#clock-toggle").scrollIntoViewIfNeeded();
        const before = await insideWidget(page, "#clock-toggle", "#clock-widget");
        const reset = await insideWidget(page, "#clock-reset", "#clock-widget");
        expect(before.width).toBeCloseTo(small, 0);
        expect(before.height).toBeCloseTo(small, 0);
        await page.locator("#clock-toggle").click();
        await expect(page.locator("#clock-toggle")).toHaveAttribute("aria-label", "Pause");
        expect(await insideWidget(page, "#clock-toggle", "#clock-widget")).toEqual(before);
        expect(await insideWidget(page, "#clock-reset", "#clock-widget")).toEqual(reset);
    });

    test("puts the two lists of the header side by side, the same height, both with a label on a wide screen", async ({ page, isMobile }) =>
    {
        await openApp(page);
        const language = await boxOf(page, "#site-language-button");
        const theme = await boxOf(page, "#theme-button");
        expect(language.height).toBeCloseTo(theme.height, 0);
        expect(language.y).toBeCloseTo(theme.y, 0);
        const prefix = page.locator("#theme-button .listbox-prefix");
        if (isMobile)
        {
            await expect(prefix).toBeHidden();
            expect(language.width).toBeCloseTo(theme.width, 0);
        }
        else
        {
            await expect(prefix).toBeVisible();
            await expect(page.locator("#site-language-button .listbox-prefix")).toBeVisible();
        }
    });

    test("keeps the translation control and the original button on one row, next to each other, with no orphan", async ({ page }) =>
    {
        await goTo97(page);
        // The control is a button that shows or hides the translation, joined to the arrow that opens the list of languages.
        const translation = await boxOf(page, ".translation-split");
        const toggle = await boxOf(page, "#translation-toggle");
        const arrow = await boxOf(page, "#translation-button");
        const original = await boxOf(page, ".original-btn");
        expect(Math.abs(translation.y - original.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(toggle.y - arrow.y)).toBeLessThanOrEqual(1);
        expect(toggle.height).toBeCloseTo(arrow.height, 0);
        expect(arrow.x).toBeGreaterThanOrEqual(toggle.x + toggle.width - 2);
        expect(original.x).toBeGreaterThan(translation.x + translation.width);
        const card = await boxOf(page, ".card");
        expect(original.x + original.width).toBeLessThanOrEqual(card.x + card.width);
        const label = await page.locator("#translation-toggle").evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
        expect(label).toBe(true);
    });

    test("shows a tag as a tag and the original as a button: no edge and a tint against an edge and a hover", async ({ page }) =>
    {
        await goTo97(page);
        const look = await page.evaluate(() =>
        {
            const read = (selector: string) =>
            {
                const style = getComputedStyle(document.querySelector(selector) as Element);
                return { border: parseFloat(style.borderTopWidth), radius: style.borderTopLeftRadius, background: style.backgroundColor, cursor: style.cursor };
            };
            return { tag: read(".tag-topic"), button: read(".original-btn"), select: read("#translation-button") };
        });
        expect(look.tag.border).toBe(0);
        expect(look.tag.cursor).toBe("default");
        expect(look.tag.background).not.toBe("rgba(0, 0, 0, 0)");
        // An edge of 1.5px is drawn as 1px on a screen with one pixel per unit, so "at least 1" is the test.
        expect(look.button.border).toBeGreaterThanOrEqual(1);
        expect(look.select.border).toBeGreaterThanOrEqual(1);
        expect(look.button.cursor).toBe("pointer");
        expect(look.tag.radius).not.toBe("999px");
        expect(look.button.radius).not.toBe("999px");
    });
});

test.describe("the timeline strip", () =>
{
    test("shows the whole border of the current slot, bolder than the others, and does not touch its neighbours", async ({ page }) =>
    {
        await goTo97(page);
        const current = page.locator(".slot.is-current");
        const style = await current.evaluate((element) =>
        {
            const read = getComputedStyle(element);
            const neighbour = getComputedStyle(element.closest("li")?.previousElementSibling?.querySelector(".slot") as Element);
            return { border: parseFloat(read.borderTopWidth), left: parseFloat(read.borderLeftWidth), neighbour: parseFloat(neighbour.borderTopWidth), shadow: read.boxShadow, outline: read.outlineStyle };
        });
        expect(style.border).toBe(3);
        expect(style.left).toBe(3);
        expect(style.neighbour).toBeLessThan(style.border);
        expect(style.shadow).toBe("none");
        const box = await boxOf(page, ".slot.is-current");
        const before = await page.locator(".slot.is-current").evaluate((element) => (element.closest("li")?.previousElementSibling?.querySelector(".slot") as HTMLElement).getBoundingClientRect().right);
        const after = await page.locator(".slot.is-current").evaluate((element) => (element.closest("li")?.nextElementSibling?.querySelector(".slot") as HTMLElement).getBoundingClientRect().left);
        expect(box.x - before).toBeGreaterThanOrEqual(3.5);
        expect(after - (box.x + box.width)).toBeGreaterThanOrEqual(3.5);
        const strip = await boxOf(page, ".timeline-strip");
        expect(box.x).toBeGreaterThanOrEqual(strip.x);
        expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width);
    });

    test("keeps the size of a slot when it becomes the current one", async ({ page }) =>
    {
        await goTo97(page);
        const current = await boxOf(page, ".slot.is-current");
        const other = await boxOf(page, ".slot.is-open >> nth=0");
        expect(current.height).toBeCloseTo(other.height, 0);
    });

    test("starts on a whole slot, so none is cut in half at the left edge", async ({ page }) =>
    {
        await goTo97(page);
        const cut = await page.evaluate(() =>
        {
            const strip = document.querySelector(".timeline-strip") as HTMLElement;
            const edge = strip.getBoundingClientRect().left;
            return Array.from(strip.querySelectorAll(".slot")).filter((slot) =>
            {
                const rect = slot.getBoundingClientRect();
                return rect.left < edge - 0.5 && rect.right > edge + 0.5;
            }).length;
        });
        expect(cut).toBe(0);
    });

    test("centres the arrows in their buttons", async ({ page }) =>
    {
        await goTo97(page);
        for (const index of [0, 1])
        {
            const button = await boxOf(page, `.timeline-scroll >> nth=${index}`);
            const icon = await boxOf(page, `.timeline-scroll >> nth=${index} >> svg`);
            expect(Math.abs(button.x + button.width / 2 - (icon.x + icon.width / 2))).toBeLessThanOrEqual(0.5);
            expect(Math.abs(button.y + button.height / 2 - (icon.y + icon.height / 2))).toBeLessThanOrEqual(0.5);
            expect(button.height).toBeCloseTo((await boxOf(page, ".slot.is-open >> nth=0")).height, 0);
        }
    });

    test("turns the left arrow off at the start and the right one on, and the other way round at the end", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "general", order: "booklet" });
        const left = page.getByRole("button", { name: "Earlier questions" });
        const right = page.getByRole("button", { name: "Later questions" });
        await expect(left).toBeDisabled();
        await expect(right).toBeEnabled();
        await page.locator(".timeline-strip").evaluate((strip) =>
        {
            strip.scrollLeft = strip.scrollWidth;
        });
        await expect(right).toBeDisabled();
        await expect(left).toBeEnabled();
    });
});

test.describe("the same layout in every mode", () =>
{
    test("keeps the content and the column at the side in the same place in practice, weak spots and every view of the exam", async ({ page }) =>
    {
        await openApp(page, weakState([5]));
        const reference = {
            content: await boxOf(page, "#view.layout > :first-child"),
            aside: await boxOf(page, "#view.layout > .aside"),
        };
        const same = async (name: string): Promise<void> =>
        {
            const content = await boxOf(page, "#view.layout > :first-child");
            const aside = await boxOf(page, "#view.layout > .aside");
            expect(content.x, `${name} content x`).toBeCloseTo(reference.content.x, 0);
            expect(content.width, `${name} content width`).toBeCloseTo(reference.content.width, 0);
            expect(aside.x, `${name} aside x`).toBeCloseTo(reference.aside.x, 0);
            expect(aside.width, `${name} aside width`).toBeCloseTo(reference.aside.width, 0);
        };
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        await same("weak spots");
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await same("exam intro");
        await page.getByRole("button", { name: "Start exam" }).click();
        await same("running exam");
        await answerExam(page, 0);
        await pressFinishExam(page);
        await same("exam result");
    });
});

/** Height of a common laptop screen, where the buttons below a question used to fall off the bottom edge. */
const LAPTOP = { width: 1366, height: 768 };

/** Half a pixel of rounding is allowed when one box has to lie inside another. */
const ROUNDING = 0.5;

/**
 * Opens the exam in the language that is showing and starts it. It uses ids and classes, so it works in German too.
 * @param page Playwright page.
 */
async function startExamHere(page: Page): Promise<void>
{
    await page.locator("#tab-exam").click();
    await page.locator(".intro .primary").click();
    await expect(page.locator(".exam-progress")).toBeVisible();
}

/**
 * The buttons and tags under a selector whose text is wider than their own box.
 * @param page Playwright page.
 * @param selector Which elements to measure.
 * @returns A line for each element that overflows.
 */
async function overflowing(page: Page, selector: string): Promise<string[]>
{
    return page.locator(selector).evaluateAll((elements) => elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => `${(element.textContent ?? "").trim()}: ${element.scrollWidth} in ${element.clientWidth}`));
}

/**
 * How far the visible text of a button that needs a second press sticks out of the button, in pixels.
 * @param page Playwright page.
 * @param selector The button.
 * @returns The larger of the two sides, 0 or less when the text is inside.
 */
async function labelOutside(page: Page, selector: string): Promise<number>
{
    return page.locator(selector).evaluate((button) =>
    {
        const box = button.getBoundingClientRect();
        const text = (button.querySelector(".swap:not(.is-off)") as HTMLElement).getBoundingClientRect();
        return Math.max(box.left - text.left, text.right - box.right);
    });
}

test.describe("what has to be in view and in reach", () =>
{
    test("asks before the exam is finished in a dialog that is in view and has the focus, wherever the page is scrolled to", async ({ page }) =>
    {
        await openApp(page);
        await startExamHere(page);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.locator("#exam-finish").click();
        await expect(page.getByRole("dialog")).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole("button", { name: "Finish anyway" })).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole("button", { name: "Keep working" })).toBeInViewport({ ratio: 1 });
        await expect(page.locator("#modal-title")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator("#exam-finish")).toBeFocused();
        await expect(page.locator(".exam-progress")).toBeVisible();
    });

    test("does not end the exam when End now is pressed twice in a row at the same spot", async ({ page }) =>
    {
        await openApp(page);
        await startExamHere(page);
        const button = page.locator("#exam-finish");
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox() as { x: number; y: number; width: number; height: number };
        const spot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await page.mouse.click(spot.x, spot.y);
        await page.mouse.click(spot.x, spot.y);
        await page.mouse.click(spot.x, spot.y);
        await expect(page.locator(".result")).toHaveCount(0);
        await expect(page.locator(".exam-progress")).toBeVisible();
    });

    test("ignores Finish anyway in the first moment after the prompt appears", async ({ page }) =>
    {
        await openApp(page);
        await startExamHere(page);
        await page.locator("#exam-finish").click();
        await page.getByRole("button", { name: "Finish anyway" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.locator(".result")).toHaveCount(0);
        await finishAnyway(page);
        await expect(page.locator(".result")).toBeVisible();
    });

    test("shows the result from the top of the page, in view and with the focus, however far the page was scrolled", async ({ page }) =>
    {
        await openApp(page);
        await startExamHere(page);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.locator("#exam-finish").click();
        await finishAnyway(page);
        await expect(page.locator(".result")).toBeInViewport({ ratio: 1 });
        await expect(page.locator(".result")).toBeFocused();
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("keeps the buttons below the question on the screen without scrolling, on a laptop and on a phone, in every mode", async ({ page, isMobile }) =>
    {
        if (!isMobile)
        {
            await page.setViewportSize(LAPTOP);
        }
        await openApp(page, { locale: "de" });
        await expect(page.locator("#round-next")).toBeInViewport({ ratio: 1 });
        await page.locator("#tab-train").click();
        await expect(page.locator("#train-give-up")).toBeInViewport({ ratio: 1 });
        await expect(page.locator("#train-next")).toBeInViewport({ ratio: 1 });
        await startExamHere(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.locator(".nav-row .primary")).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("brings the next question into view from its start when the page was scrolled past it", async ({ page, isMobile }) =>
    {
        test.skip(!isMobile, "phone only: the question fits a large screen");
        await openApp(page);
        await pressOption(page, 0);
        await page.evaluate(() => window.scrollTo(0, (document.querySelector("article.card") as HTMLElement).getBoundingClientRect().bottom + window.scrollY - 200));
        expect(await page.locator("article.card").evaluate((card) => card.getBoundingClientRect().top)).toBeLessThan(0);
        await page.locator("#round-next").click();
        await expect(page.locator(".question")).toBeInViewport({ ratio: 1 });
        await expect(page.locator("button.option").last()).toBeInViewport({ ratio: 1 });
        await expect(page.locator("#round-next")).toBeInViewport({ ratio: 1 });
        // The bar with the choice is not what comes to the top edge: it is scrolled out, at least in part.
        expect(await page.locator(".round-bar").evaluate((bar) => bar.getBoundingClientRect().top)).toBeLessThan(0);
    });

    test("shows the time of a running clock above the question on one column, where the clock widget is out of sight", async ({ page, isMobile }) =>
    {
        await openApp(page);
        await expect(page.locator("#clock-strip")).toHaveCount(0);
        await startExamHere(page);
        const strip = page.locator("#clock-strip");
        if (!isMobile)
        {
            await expect(strip).toBeHidden();
            await expect(page.locator("#clock-display")).toBeInViewport();
            return;
        }
        await page.locator("button.option").last().scrollIntoViewIfNeeded();
        await expect(page.locator("#clock-display")).not.toBeInViewport();
        await expect(strip).toBeInViewport({ ratio: 1 });
        await expect(strip).toContainText(/^Clock(60:00|59:5\d)$/);
        await page.evaluate(() => window.scrollBy(0, 300));
        await expect(strip).toBeInViewport({ ratio: 1 });
    });
});

test.describe("German texts fit their boxes", () =>
{
    test("keeps the text of a button that waits for its second press inside the button", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        const reset = page.locator("#reset-progress");
        await reset.scrollIntoViewIfNeeded();
        await reset.click();
        await expect(reset).toHaveClass(/danger/);
        expect(await labelOutside(page, "#reset-progress")).toBeLessThanOrEqual(ROUNDING);
        await page.keyboard.press("Escape");
        await expect(reset).not.toHaveClass(/(^| )danger( |$)/);
        await startExamHere(page);
        const startOver = page.locator("#exam-start-over");
        await startOver.scrollIntoViewIfNeeded();
        await startOver.click();
        await expect(startOver).toHaveClass(/danger/);
        expect(await labelOutside(page, "#exam-start-over")).toBeLessThanOrEqual(ROUNDING);
    });

    test("cuts no button and no tag short on the exam result and in the review", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        await startExamHere(page);
        await page.locator("#exam-finish").click();
        await finishAnyway(page, "Trotzdem beenden");
        await expect(page.locator(".review-item")).toHaveCount(33);
        expect(await overflowing(page, ".result button")).toEqual([]);
        expect(await overflowing(page, ".review-item .original-btn")).toEqual([]);
        expect(await overflowing(page, ".line .tag")).toEqual([]);
        const outside = await page.locator(".review-item").evaluateAll((cards) => cards.filter((card) =>
        {
            const style = getComputedStyle(card);
            const edge = card.getBoundingClientRect().right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
            const label = (card.querySelector(".original-btn span") as HTMLElement).getBoundingClientRect();
            const icon = (card.querySelector(".original-btn svg") as SVGElement).getBoundingClientRect();
            const topic = (card.querySelector(".tag-topic") as HTMLElement).getBoundingClientRect();
            return label.right > edge + 1 || icon.left < topic.right;
        }).length);
        expect(outside).toBe(0);
        await expectNoHorizontalScroll(page, "German exam result");
    });

    test("cuts no button short in the panel of the round", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        await page.locator("#change-selection").click();
        await expect(page.locator("#panel-start")).toBeVisible();
        expect(await overflowing(page, ".panel-actions button")).toEqual([]);
    });
});

test.describe("the chosen chip", () =>
{
    test("keeps its fill and stays readable under the pointer", async ({ page, isMobile }) =>
    {
        test.skip(isMobile, "a touch screen has no pointer that hovers");
        await openApp(page);
        const chip = page.locator("#clock-mode-up");
        await expect(chip).toHaveAttribute("aria-pressed", "true");
        const colours = (): Promise<{ background: string; text: string }> => chip.evaluate((element) =>
        {
            const style = getComputedStyle(element);
            return { background: style.backgroundColor, text: style.color };
        });
        const resting = await colours();
        await chip.hover();
        await expect.poll(colours).toEqual(resting);
        expect(resting.background).not.toBe(resting.text);
    });
});

test.describe("the column at the side", () =>
{
    test("keeps the progress and the clock in the same place and size in practice, the training and the exam start, with and without weak spots", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        const boxes = async (): Promise<number[]> =>
        {
            const stats = await page.locator(".aside .stats").boundingBox() as { y: number; height: number };
            const clock = await page.locator("#clock-widget").boundingBox() as { y: number; height: number };
            const top = await page.locator(".aside").boundingBox() as { y: number };
            return [stats.y - top.y, stats.height, clock.y - top.y].map(Math.round);
        };
        const reference = await boxes();
        await pressOption(page, 0);
        await pressOption(page, 1);
        expect(await boxes(), "practice, after an answer").toEqual(reference);
        await page.locator("#tab-train").click();
        expect(await boxes(), "training").toEqual(reference);
        await page.locator("#tab-exam").click();
        expect(await boxes(), "exam start").toEqual(reference);
        await page.locator("#tab-practice").click();
        await expect(page.locator(".aside .widget").last()).toHaveClass(/round-widget/);
    });
});
