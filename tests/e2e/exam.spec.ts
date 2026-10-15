import type { Page } from "@playwright/test";
import { answerExam, correctOptionIndex, EXAM_GENERAL, EXAM_SIZE, EXAM_STATE, expect, finishAnyway, LAST_GENERAL, openApp, pressOption, shownNumber, stat, test } from "./fixtures";

/** Length of the exam in minutes. */
const EXAM_MINUTES = 60;

/** Seconds in a minute. */
const SECONDS_PER_MINUTE = 60;

/** Milliseconds in a second. */
const MS_PER_SECOND = 1000;

/** Opens the app and starts an exam. */
async function startExam(page: Page): Promise<void>
{
    await openApp(page);
    await page.getByRole("tab", { name: "Exam (33)" }).click();
    await page.getByRole("button", { name: "Start exam" }).click();
    await expect(page.locator(".exam-progress")).toHaveText(`Question 1 of ${EXAM_SIZE}`);
}

test.describe("exam", () =>
{
    test("shows the rules before starting", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await expect(page.getByRole("heading", { name: "Practice exam" })).toBeVisible();
        await expect(page.locator(".facts li").nth(0)).toHaveText("17 correct answers pass.");
        await expect(page.locator(".facts li").nth(1)).toHaveText("60 minutes, counted down.");
    });

    test("draws 30 general and 3 questions of Berlin, which is the state until another is chosen, all different", async ({ page }) =>
    {
        await startExam(page);
        const numbers: number[] = [];
        for (let index = 0; index < EXAM_SIZE; index++)
        {
            numbers.push(await shownNumber(page));
            if (index < EXAM_SIZE - 1)
            {
                await page.keyboard.press("ArrowRight");
            }
        }
        expect(new Set(numbers).size).toBe(EXAM_SIZE);
        expect(numbers.filter((number) => number <= LAST_GENERAL)).toHaveLength(EXAM_GENERAL);
        expect(numbers.filter((number) => number > LAST_GENERAL)).toHaveLength(EXAM_STATE);
    });

    test("gives no feedback while the exam runs and lets answers change", async ({ page }) =>
    {
        await startExam(page);
        const right = await correctOptionIndex(page);
        await pressOption(page, right);
        await expect(page.locator(".is-correct, .is-wrong, .verdict")).toHaveCount(0);
        await pressOption(page, right === 0 ? 1 : 0);
        await expect(page.locator("button.option.is-selected")).toHaveCount(1);
        await expect(page.locator(".exam-answered")).toHaveText("1 answered");
    });

    test("passes with exactly 17 correct answers", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 17);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await expect(page.locator(".result-label")).toHaveText("Passed");
        await expect(page.locator(".result-score")).toHaveText("17 of 33");
        await expect(page.getByRole("heading", { name: "Review: 16 missed" })).toBeVisible();
        await expect(page.locator(".review-item")).toHaveCount(16);
    });

    test("lists every answer on request after the exam, without moving the button, and explains each in a dialog", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 30);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await expect(page.locator(".review-item")).toHaveCount(3);
        const toggle = page.locator("#review-all");
        await expect(toggle).toHaveAccessibleName("Show all answers (33)");
        const box = async (): Promise<{ x: number; y: number; width: number; height: number }> => (await toggle.boundingBox()) as { x: number; y: number; width: number; height: number };
        const before = await box();
        await toggle.click();
        await expect(page.getByRole("heading", { name: "Your answers (33)" })).toBeVisible();
        await expect(page.locator(".review-item")).toHaveCount(EXAM_SIZE);
        await expect(page.locator(".review-item.is-right")).toHaveCount(30);
        await expect(toggle).toHaveAccessibleName("Show only the mistakes");
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        expect(await box()).toEqual(before);
        // Every answer has its explanation, the right ones too.
        await expect(page.locator(".review-item .learn-why")).toHaveCount(EXAM_SIZE);
        const first = page.locator(".review-item").first();
        const label = (await first.locator(".qno").textContent()) as string;
        await first.getByRole("button", { name: "Learn why" }).click();
        const dialog = page.getByRole("dialog", { name: `Question ${label.replace(/^Q/, "")}: why` });
        await expect(dialog.locator(".why .unit")).toBeVisible();
        await expect(page.locator("#tab-exam")).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(page.locator("#why-0")).toBeFocused();
        await expect(page.locator(".review-item")).toHaveCount(EXAM_SIZE);
        await toggle.click();
        await expect(page.locator(".review-item")).toHaveCount(3);
    });

    test("fails with 16 correct answers", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 16);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await expect(page.locator(".result-label")).toHaveText("Not passed");
        await expect(page.locator(".result-score")).toHaveText("16 of 33");
    });

    test("shows no review for a perfect exam", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 33);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await expect(page.locator(".result-score")).toHaveText("33 of 33");
        await expect(page.getByRole("heading", { name: "No mistakes" })).toBeVisible();
    });

    test("asks before finishing with unanswered questions", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 33, 30);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await expect(page.getByRole("dialog")).toContainText("3 questions are still unanswered and will count as wrong.");
        await page.getByRole("button", { name: "Keep working" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await finishAnyway(page);
        await expect(page.locator(".result-score")).toHaveText("30 of 33");
        await expect(page.locator(".review-item")).toHaveCount(3);
        await expect(page.locator(".line.bad").first()).toContainText("No answer");
    });

    test("marks a question for review with a button or the M key, shows it in the list of questions and the widget, and keeps the size of the button", async ({ page }) =>
    {
        await startExam(page);
        const button = page.locator("#exam-mark");
        const before = await button.boundingBox();
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        const after = await button.boundingBox();
        expect(after?.width).toBeCloseTo(before?.width ?? 0, 0);
        expect(after?.height).toBeCloseTo(before?.height ?? 0, 0);
        await expect(page.getByRole("button", { name: "Question 1, marked for review" })).toBeVisible();
        await expect(page.locator(".exam-widget dd").nth(2)).toHaveText("1");
        const corner = await page.locator(".nav-dot.is-marked").evaluate((element) => getComputedStyle(element, "::after").borderRightWidth);
        expect(corner).toBe("12px");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("m");
        await expect(page.locator(".exam-widget dd").nth(2)).toHaveText("2");
        await page.keyboard.press("m");
        await expect(page.locator(".exam-widget dd").nth(2)).toHaveText("1");
    });

    test("asks before finishing when a question is marked, and says how many were never opened and how many were left open", async ({ page }) =>
    {
        await startExam(page);
        await page.locator("#exam-mark").click();
        await page.keyboard.press("ArrowRight");
        await page.getByRole("button", { name: "Finish exam" }).or(page.getByRole("button", { name: "End now" })).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText("33 questions are still unanswered and will count as wrong.");
        await expect(dialog).toContainText("31 never opened, 2 opened and left open.");
        await expect(dialog).toContainText("1 question is marked for review.");
    });

    test("keeps a question that was never opened out of the progress, and names it in the review", async ({ page }) =>
    {
        await startExam(page);
        await pressOption(page, await correctOptionIndex(page));
        await page.getByRole("button", { name: "End now" }).click();
        await finishAnyway(page);
        await expect(page.locator(".result-score")).toHaveText("1 of 33");
        await expect(stat(page, "Seen")).toHaveText("1 of 310");
        await expect(stat(page, "Weak spots")).toHaveText("0");
        await expect(page.locator(".review-item .line.bad", { hasText: "Not opened" })).toHaveCount(32);
    });

    test("jumps between questions with the navigator and keeps answers", async ({ page }) =>
    {
        await startExam(page);
        await pressOption(page, 2);
        const first = await shownNumber(page);
        await page.getByRole("button", { name: "Question 10", exact: true }).click();
        await expect(page.locator(".exam-progress")).toHaveText("Question 10 of 33");
        await page.getByRole("button", { name: "Question 1, answered" }).click();
        expect(await shownNumber(page)).toBe(first);
        await expect(page.locator("button.option").nth(2)).toHaveClass(/is-selected/);
    });

    test("counts down and ends the exam when the time is up, with a nudge, a yellow border and a red border on the way", async ({ page }) =>
    {
        await page.clock.install({ time: new Date("2026-01-01T10:00:00") });
        await startExam(page);
        const display = page.locator("#clock-display");
        const widget = page.locator("#clock-widget");
        await expect(display).toHaveText("60:00");
        await expect(widget).toHaveClass(/level-calm/);
        await page.clock.runFor("30:00");
        await expect(display).toHaveText("30:00");
        await page.clock.runFor("16:00");
        await expect(display).toHaveText("14:00");
        await expect(widget).toHaveClass(/level-nudge/);
        await page.clock.runFor("10:00");
        await expect(display).toHaveText("04:00");
        await expect(widget).toHaveClass(/level-warn/);
        expect(await widget.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("3px");
        await page.clock.runFor("03:00");
        await expect(display).toHaveText("01:00");
        await expect(widget).toHaveClass(/level-critical/);
        await pressOption(page, await correctOptionIndex(page));
        await page.clock.runFor("01:00");
        await expect(page.locator(".result-label")).toHaveText("Not passed");
        await expect(page.locator(".result-score")).toHaveText("1 of 33");
    });

    test("can be made shorter before it starts, never longer than the official 60 minutes", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        const minutes = page.locator("#clock-minutes");
        await expect(minutes).toHaveAttribute("max", "60");
        await minutes.fill("25");
        await minutes.blur();
        await expect(page.locator("#clock-display")).toHaveText("25:00");
        await minutes.fill("80");
        await minutes.blur();
        await expect(page.locator("#clock-display")).toHaveText("60:00");
        await page.getByRole("button", { name: "Start exam" }).click();
        await expect(minutes).toBeDisabled();
    });

    test("has a widget at the side like the other modes, with End now and Start over", async ({ page }) =>
    {
        await startExam(page);
        const stage = await page.locator(".stage").boundingBox();
        const aside = await page.locator(".aside").boundingBox();
        expect(stage && aside && aside.x >= stage.x + stage.width).toBeTruthy();
        await expect(page.locator(".exam-widget dd").first()).toHaveText("0 of 33");
        await pressOption(page, 0);
        await expect(page.locator(".exam-widget dd").first()).toHaveText("1 of 33");
        await page.getByRole("button", { name: "Start over" }).click();
        await page.getByRole("button", { name: "Tap again: new exam" }).click();
        await expect(page.locator(".exam-widget dd").first()).toHaveText("0 of 33");
        await page.getByRole("button", { name: "End now" }).click();
        await finishAnyway(page);
        await expect(page.locator(".result-label")).toBeVisible();
    });

    test("uses the same width for its content as practice does", async ({ page }) =>
    {
        await openApp(page);
        const practice = await page.locator(".stage").boundingBox();
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        const intro = await page.locator(".card.intro").boundingBox();
        await page.getByRole("button", { name: "Start exam" }).click();
        const running = await page.locator(".stage").boundingBox();
        expect(Math.abs((intro?.width ?? 0) - (practice?.width ?? 0))).toBeLessThanOrEqual(1);
        expect(Math.abs((running?.width ?? 0) - (practice?.width ?? 0))).toBeLessThanOrEqual(1);
    });

    test("records the finished exam in the progress and offers the missed questions as weak spots", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 25);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await page.getByRole("button", { name: "Practice weak spots" }).first().click();
        await expect(page.getByRole("tab", { name: "Practice" })).toHaveAttribute("aria-selected", "true");
        await expect(page.locator(".round-bar")).toContainText("All my weak spots · 8 questions");
        await expect(stat(page, "Seen")).toHaveText("33 of 310");
        await page.reload();
        await expect(stat(page, "Seen")).toHaveText("33 of 310");
        await expect(stat(page, "Weak spots")).toHaveText("8");
    });

    test("takes New exam from the result screen back to the start screen, and Start exam begins the next one", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 33);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await page.getByRole("button", { name: "New exam" }).click();
        await expect(page.getByRole("heading", { name: "Practice exam" })).toBeVisible();
        await expect(page.locator(".exam-progress")).toHaveCount(0);
        await page.getByRole("button", { name: "Start exam" }).click();
        await expect(page.locator(".exam-progress")).toHaveText("Question 1 of 33");
        await expect(page.locator(".exam-answered")).toHaveText("0 answered");
    });

    test("switches off all tabs while the exam runs, also for the keyboard, and on again after it", async ({ page }) =>
    {
        await startExam(page);
        for (const name of ["Practice", "Train", "Exam (33)"])
        {
            await expect(page.getByRole("tab", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) })).toBeDisabled();
        }
        await page.getByRole("tab", { name: "Practice" }).click({ force: true });
        await expect(page.locator(".exam-progress")).toBeVisible();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator(".exam-progress")).toHaveText("Question 2 of 33");
        await page.getByRole("button", { name: "End now" }).click();
        await finishAnyway(page);
        await expect(page.getByRole("tab", { name: "Practice" })).toBeEnabled();
        await page.getByRole("tab", { name: "Practice" }).click();
        await expect(page.getByRole("tab", { name: "Practice" })).toHaveAttribute("aria-selected", "true");
    });

    test("keeps the state as it is while the exam runs: the list is off and the footer says why", async ({ page }) =>
    {
        await startExam(page);
        await expect(page.locator("#state-button")).toBeDisabled();
        await expect(page.locator(".footer-state-note")).toHaveText("Your state cannot be changed while an exam is running.");
        await page.locator("#state-button").click({ force: true });
        await expect(page.locator("#state-list")).toBeHidden();
        await page.getByRole("button", { name: "End now" }).click();
        await finishAnyway(page);
        await expect(page.locator("#state-button")).toBeEnabled();
        await expect(page.locator(".footer-state-note")).toContainText("the 10 for Berlin");
    });

    test("says on the result when the time ran out", async ({ page }) =>
    {
        await page.clock.install();
        await startExam(page);
        await page.clock.fastForward(EXAM_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND + MS_PER_SECOND);
        await expect(page.locator(".result-timeup")).toHaveText("The time ran out.");
        await expect(page.locator(".result-label")).toHaveText("Not passed");
    });

    test("an exam that is not finished leaves no progress behind", async ({ page }) =>
    {
        await startExam(page);
        await answerExam(page, 10);
        await page.reload();
        await expect(stat(page, "Seen")).toHaveText("0 of 310");
    });
});
