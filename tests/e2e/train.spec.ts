import type { Page } from "@playwright/test";
import { correctOptionIndex, expect, openApp, pressOption, shownNumber, stat, test, wrongOptionIndex } from "./fixtures";

/** Opens the app on the Train tab. */
async function openTrain(page: Page): Promise<void>
{
    await openApp(page);
    await page.getByRole("tab", { name: "Train" }).click();
    await expect(page.locator("#train-next")).toBeVisible();
}

/** The value in a row of the widget of the training. */
function trainRow(page: Page, label: string): ReturnType<Page["locator"]>
{
    return page.locator(".train-widget dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
}

test.describe("train", () =>
{
    test("is a tab between Practice and Exam with a question, a note on how it works and its own widget", async ({ page }) =>
    {
        await openTrain(page);
        await expect(page.getByRole("tab")).toHaveText(["Learn", "Practice", "Train", "Exam (33)"]);
        await expect(page.locator(".banner-review")).toContainText("A wrong one comes back after a few questions");
        await expect(trainRow(page, "Cleared")).toHaveText("0 of 310");
        await expect(page.locator("#train-next")).toBeDisabled();
    });

    test("clears a question that is answered right and moves on to Next", async ({ page }) =>
    {
        await openTrain(page);
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".verdict > span")).toHaveText("Correct.");
        await expect(page.locator(".train-note")).toContainText("Cleared.");
        await expect(trainRow(page, "Cleared")).toHaveText("1 of 310");
        await expect(stat(page, "Seen")).toHaveText("1 of 310");
        const before = await shownNumber(page);
        await page.locator("#train-next").click();
        await expect(page.locator(".verdict")).toHaveCount(0);
        expect(await shownNumber(page)).not.toBe(before);
    });

    test("explains every answer in a dialog, a right one too, and stays in the training", async ({ page }) =>
    {
        await openTrain(page);
        const number = await shownNumber(page);
        await pressOption(page, await correctOptionIndex(page));
        await page.getByRole("button", { name: "Learn why" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.locator(".why .unit")).toBeVisible();
        await expect(page.locator("#modal-title")).toHaveText(new RegExp(`^Question .*: why$`));
        await dialog.locator("#why-close").click();
        await expect(page.locator("#tab-train")).toHaveAttribute("aria-selected", "true");
        expect(await shownNumber(page)).toBe(number);
        await expect(page.locator(".verdict")).toHaveText(/Correct\./);
    });

    test("brings a missed question back after three others, with a note that says why", async ({ page }) =>
    {
        await openTrain(page);
        const missed = await shownNumber(page);
        await pressOption(page, await wrongOptionIndex(page));
        await expect(page.locator(".train-note")).toContainText("comes back after a few questions");
        await expect(trainRow(page, "Coming back")).toHaveText("1");
        await page.locator("#train-next").click();
        for (let step = 0; step < 3; step++)
        {
            expect(await shownNumber(page)).not.toBe(missed);
            await pressOption(page, await correctOptionIndex(page));
            await page.locator("#train-next").click();
        }
        expect(await shownNumber(page)).toBe(missed);
        await expect(page.locator(".banner-back")).toContainText("Back again: you missed this question earlier.");
        await pressOption(page, await correctOptionIndex(page));
        await expect(stat(page, "Weak spots")).toHaveText("0");
    });

    test("has an I don't know button that shows the right answer and counts as wrong", async ({ page }) =>
    {
        await openTrain(page);
        await page.getByRole("button", { name: "I don't know" }).click();
        await expect(page.locator(".verdict > span")).toHaveText("No answer. The correct answer is highlighted.");
        await expect(page.locator("button.option.is-correct")).toHaveCount(1);
        await expect(stat(page, "Weak spots")).toHaveText("1");
    });

    test("trains one topic from the panel to the end", async ({ page }) =>
    {
        await openTrain(page);
        await page.locator("#change-selection").click();
        await expect(page.getByRole("heading", { name: "What do you want to train?" })).toBeVisible();
        await expect(page.locator("#lock-answers")).toHaveCount(0);
        await page.locator("#preset-none").click();
        await page.locator("#topic-staatssymbole").check();
        await page.locator("#include-state").uncheck();
        await page.getByRole("button", { name: "Start new training" }).click();
        await expect(page.locator(".round-bar")).toContainText("7 questions");
        for (let step = 0; step < 7; step++)
        {
            await pressOption(page, await correctOptionIndex(page));
            await page.locator("#train-next").click();
        }
        await expect(page.getByRole("heading", { name: "Everything cleared" })).toBeVisible();
        await expect(page.locator(".end-card p")).toHaveText("7 of 7 cleared with 7 answers. 0 needed another try.");
        await page.getByRole("button", { name: "Train again" }).click();
        await expect(trainRow(page, "Cleared")).toHaveText("0 of 7");
    });

    test("has no horizontal scroll and the same layout as the other modes", async ({ page }) =>
    {
        await openApp(page);
        const reference = await page.locator("main.layout > .aside").boundingBox();
        await page.getByRole("tab", { name: "Train" }).click();
        await pressOption(page, await wrongOptionIndex(page));
        await page.locator("details.train-topics summary").click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        const aside = await page.locator("main.layout > .aside").boundingBox();
        expect(aside?.x).toBeCloseTo(reference?.x ?? 0, 0);
        expect(aside?.width).toBeCloseTo(reference?.width ?? 0, 0);
    });

    test("is switched off with the other tabs while an exam runs", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await page.getByRole("button", { name: "Start exam" }).click();
        await expect(page.getByRole("tab", { name: "Train" })).toBeDisabled();
    });
});
