import {
    chooseFromListbox, correctOptionIndex, expect, openApp, pressOption, QUESTIONS, shownNumber, startRound, STORAGE_KEY, stat,
    test, wrongOptionIndex, weakState,
} from "./fixtures";

test.describe("practice mode", () =>
{
    test("loads with a question, four options, a timeline and empty progress", async ({ page }) =>
    {
        await openApp(page);
        await expect(page.locator("button.option")).toHaveCount(4);
        await expect(page.locator("#round-next")).toHaveText("Skip");
        await expect(page.locator("nav.timeline")).toBeVisible();
        await expect(stat(page, "Seen")).toHaveText("0 of 310");
        await expect(stat(page, "Accuracy")).toHaveText("none yet");
        await expect(stat(page, "Weak spots")).toHaveText("0");
    });

    test("reveals the right answer after a click and offers the next question", async ({ page }) =>
    {
        await openApp(page);
        const wrong = await wrongOptionIndex(page);
        const right = await correctOptionIndex(page);
        await page.locator("button.option").nth(wrong).click();
        await expect(page.locator(".verdict > span")).toHaveText("Not quite. The correct answer is highlighted.");
        await expect(page.locator("button.option").nth(right)).toHaveClass(/is-correct/);
        await expect(page.locator("button.option").nth(wrong)).toHaveClass(/is-wrong/);
        await expect(page.locator("#round-next")).toHaveText("Next question");
    });

    test("runs a keyboard only round and keeps score", async ({ page }) =>
    {
        await openApp(page);
        const seen = new Set<number>();
        for (let round = 0; round < 10; round++)
        {
            seen.add(await shownNumber(page));
            const choice = round < 7 ? await correctOptionIndex(page) : await wrongOptionIndex(page);
            await pressOption(page, choice);
            await page.keyboard.press("Enter");
        }
        expect(seen.size).toBe(10);
        await expect(stat(page, "Seen")).toHaveText("10 of 310");
        await expect(stat(page, "Accuracy")).toHaveText("70%");
        await expect(stat(page, "Weak spots")).toHaveText("3");
        await expect(page.locator(".timeline-counts")).toHaveText("✓7✗3»0");
    });

    test("answers with the keyboard right after a choice in the translation list, and after a click on a tab", async ({ page }) =>
    {
        await openApp(page);
        await chooseFromListbox(page, "translation", "en");
        await expect(page.locator("#translation-button")).toBeFocused();
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".verdict > span")).toHaveText("Correct.");
        await page.getByRole("tab", { name: "Practice" }).click();
        await expect(page.getByRole("tab", { name: "Practice" })).toBeFocused();
        await page.keyboard.press("Enter");
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".verdict > span")).toHaveText("Correct.");
    });

    test("ignores option keys while a list is open", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#translation-button").click();
        await page.keyboard.press("a");
        await page.keyboard.press("1");
        await expect(page.locator(".verdict")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(page.locator("#translation-list")).toBeHidden();
    });
});

test.describe("rounds", () =>
{
    test("go through the questions of the booklet in their printed order, with the answers in their printed order", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "general", order: "booklet" });
        for (let index = 1; index <= 6; index++)
        {
            expect(await shownNumber(page)).toBe(index);
            const question = QUESTIONS[index - 1];
            await expect(page.locator("button.option .bi-main")).toHaveText(question.a);
            await pressOption(page, 0);
            await page.keyboard.press("ArrowRight");
        }
    });

    test("show the timeline in order, with marks, and can be scrolled", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "general", order: "booklet" });
        await pressOption(page, await correctOptionIndex(page));
        await page.keyboard.press("ArrowRight");
        await pressOption(page, await wrongOptionIndex(page));
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        const slots = page.locator(".timeline-list button.slot");
        await expect(slots.nth(0)).toHaveAccessibleName("Question 1, correct");
        await expect(slots.nth(1)).toHaveAccessibleName("Question 2, wrong");
        await expect(slots.nth(2)).toHaveAccessibleName("Question 3, skipped");
        await expect(slots.nth(3)).toHaveAccessibleName("Question 4, current question");
        const strip = page.locator(".timeline-strip");
        expect(await strip.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
        await page.getByRole("button", { name: "Later questions" }).click();
        await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        // The scroll is animated, so keep pressing until it is back at the start.
        await expect.poll(async () =>
        {
            const left = page.getByRole("button", { name: "Earlier questions" });
            if (await left.isEnabled())
            {
                await left.click();
            }
            return strip.evaluate((element) => element.scrollLeft);
        }, { timeout: 10000 }).toBeLessThan(1);
    });

    test("keep the current question in view in the timeline while going through a long round", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "general", order: "booklet" });
        for (let index = 0; index < 40; index++)
        {
            await page.keyboard.press("ArrowRight");
        }
        await expect(page.locator(".timeline-list button[aria-current=step]")).toBeInViewport();
        await expect(page.locator(".timeline-list button[aria-current=step]")).toHaveAccessibleName("Question 41, current question");
    });

    test("decide a random question only after the one before it is done", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "berlin", order: "random" });
        await expect(page.locator(".timeline-list button.slot")).toHaveCount(1);
        await expect(page.locator(".slot-unknown")).toBeVisible();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator(".timeline-list button.slot")).toHaveCount(2);
    });

    test("let a question be skipped, show it as skipped, and answer it later", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "berlin", order: "booklet" });
        await page.locator("#round-next").click();
        expect(await shownNumber(page)).toBe(322);
        await page.locator(".timeline-list button.slot").first().click();
        expect(await shownNumber(page)).toBe(321);
        await expect(page.locator(".banner-skipped")).toHaveText("Skipped. Answer it now or go back to question BE 2.");
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".timeline-list button.slot").first()).toHaveClass(/is-correct/);
        await page.locator("#round-next").click();
        expect(await shownNumber(page)).toBe(322);
    });

    test("end with a card that offers the skipped and the wrong questions again", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "berlin", order: "booklet" });
        await page.locator("#round-next").click();
        for (let index = 0; index < 9; index++)
        {
            await pressOption(page, index < 2 ? await wrongOptionIndex(page) : await correctOptionIndex(page));
            await page.keyboard.press("ArrowRight");
        }
        await expect(page.getByRole("heading", { name: "All new questions are done" })).toBeVisible();
        await page.getByRole("button", { name: "Answer skipped questions (1)" }).click();
        expect(await shownNumber(page)).toBe(321);
        await pressOption(page, await correctOptionIndex(page));
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("heading", { name: "Round done: 8 of 10 correct" })).toBeVisible();
        await page.getByRole("button", { name: "Practise the mistakes of this round (2)" }).click();
        await expect(page.locator(".round-bar")).toContainText("Mistakes of this round · 2 questions");
    });

    test("go back to look at an answer, which stays locked when the setting is on", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "berlin", order: "booklet", lock: true });
        await pressOption(page, await wrongOptionIndex(page));
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowLeft");
        expect(await shownNumber(page)).toBe(321);
        await expect(page.locator(".banner-review")).toBeVisible();
        await page.keyboard.press("1");
        await expect(stat(page, "Seen")).toHaveText("1 of 310");
        await expect(page.locator("#round-next")).toHaveText("Back to question BE 2");
    });
});

test.describe("topic panel", () =>
{
    test("offers every topic as a checkbox in groups, and more than one can be ticked", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#change-selection").click();
        await expect(page.locator("#topic-panel")).toBeVisible();
        await expect(page.locator("input[id^=topic-]")).toHaveCount(13);
        await expect(page.locator("input[id^=topic-]:checked")).toHaveCount(13);
        await expect(page.locator("#include-state")).toBeChecked();
        await page.locator("#preset-none").click();
        await page.locator("#include-state").uncheck();
        await expect(page.locator("#panel-start")).toBeDisabled();
        await page.locator("#topic-staatssymbole").check();
        await page.locator("#topic-familie-bildung-alltag").check();
        await expect(page.locator(".panel-count")).toHaveText("29 questions from 2 topics");
        await page.locator("#panel-start").click();
        await expect(page.locator(".round-bar")).toContainText("2 topics · 29 questions");
        const allowed = new Set(QUESTIONS.filter((question) => ["Staatssymbole und Grunddaten", "Familie, Bildung und Alltag"].includes(question.c)).map((question) => question.n));
        for (let index = 0; index < 29; index++)
        {
            expect(allowed.has(await shownNumber(page))).toBe(true);
            await page.keyboard.press("ArrowRight");
        }
    });

    test("changes nothing until it is started, and Escape closes it", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#change-selection").click();
        await page.locator("#preset-none").click();
        await page.keyboard.press("Escape");
        await expect(page.locator("#topic-panel")).toHaveCount(0);
        await expect(page.locator(".round-bar")).toContainText("All topics + Berlin · 310 questions");
        await expect(page.locator("#change-selection")).toBeFocused();
    });

    test("works with the keyboard: Tab reaches the checkboxes, Space ticks them", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#change-selection").focus();
        await page.keyboard.press("Enter");
        await page.locator("#topic-grundrechte").focus();
        await page.keyboard.press("Space");
        await expect(page.locator("#topic-grundrechte")).not.toBeChecked();
        await expect(page.locator(".panel-count")).toHaveText("289 questions from 12 topics and Berlin");
    });

    test("remembers the topics and the order after a reload", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "berlin", order: "booklet" });
        await page.reload();
        await expect(page.locator(".round-bar")).toContainText("Berlin · 10 questions");
        await expect(page.locator(".round-bar")).toContainText("Booklet order");
        expect(await shownNumber(page)).toBe(321);
    });
});

test.describe("jumping and skipping in the timeline", () =>
{
    test("marks every question that a jump passes over as skipped, like the Skip button", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "berlin", order: "booklet" });
        await page.locator(".timeline-list button.slot").nth(4).click();
        expect(await shownNumber(page)).toBe(325);
        const slots = page.locator(".timeline-list button.slot");
        for (let index = 0; index < 4; index++)
        {
            await expect(slots.nth(index)).toHaveClass(/is-skipped/);
        }
        await expect(slots.nth(5)).toHaveClass(/is-open/);
        await expect(page.locator(".timeline-counts")).toHaveText("✓0✗0»4");
    });

    test("labels the state questions with the state code and the task", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "berlin", order: "booklet" });
        await expect(page.locator(".qno")).toHaveText("BE 1");
        await expect(page.locator(".timeline-list button.slot").first()).toHaveAccessibleName("Question BE 1, current question");
    });
});

test.describe("answers", () =>
{
    test("can be changed by default, but only the first answer goes into the progress", async ({ page }) =>
    {
        await openApp(page);
        await pressOption(page, await wrongOptionIndex(page));
        await expect(stat(page, "Weak spots")).toHaveText("1");
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".verdict > span")).toHaveText("Correct.");
        await expect(page.locator(".timeline-counts")).toHaveText("✓1✗0»0");
        await expect(stat(page, "Weak spots")).toHaveText("1");
        await expect(stat(page, "Accuracy")).toHaveText("0%");
    });

    test("are final when the lock is switched on in the panel", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { lock: true });
        await pressOption(page, await wrongOptionIndex(page));
        await expect(page.locator("button.option").first()).toBeDisabled();
        await pressOption(page, await correctOptionIndex(page));
        await expect(page.locator(".verdict > span")).toHaveText("Not quite. The correct answer is highlighted.");
        await expect(page.locator(".round-bar")).toContainText("Answers locked");
    });
});

test.describe("your state", () =>
{
    test("is Berlin at first, and the round holds its ten questions after the general ones", async ({ page }) =>
    {
        await openApp(page);
        await startRound(page, { scope: "all", order: "booklet" });
        await expect(page.locator(".round-bar")).toContainText("All topics + Berlin · 310 questions");
        const slots = page.locator(".timeline-list button.slot");
        await expect(slots).toHaveCount(310);
        await expect(slots.nth(300).locator(".slot-number")).toHaveText("BE 1");
        await expect(slots.nth(309).locator(".slot-number")).toHaveText("BE 10");
    });

    test("is chosen at the bottom of the page, and every count then speaks of 310, never 460", async ({ page }) =>
    {
        await openApp(page);
        await expect(page.locator("footer #state-button")).toContainText("Berlin");
        await chooseFromListbox(page, "state", "bayern");
        await expect(page.locator(".footer-state-note")).toHaveText("Your 310 questions: 300 general ones and the 10 for Bavaria.");
        await expect(stat(page, "Seen")).toHaveText("0 of 310");
        await expect(page.locator(".brand-sub")).toHaveText("Leben in Deutschland · 310 questions");
        await startRound(page, { scope: "all", order: "booklet" });
        await expect(page.locator(".timeline-list button.slot").nth(300).locator(".slot-number")).toHaveText("BY 1");
        await page.reload();
        await expect(page.locator("footer #state-button")).toContainText("Bavaria");
    });

    test("gives the exam three questions of the user's state", async ({ page }) =>
    {
        await openApp(page);
        await chooseFromListbox(page, "state", "sachsen");
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await expect(page.locator(".intro")).toContainText("Saxony");
        await page.getByRole("button", { name: "Start exam" }).click();
        const numbers: number[] = [];
        for (let index = 0; index < 33; index++)
        {
            numbers.push(await shownNumber(page));
            await page.keyboard.press("ArrowRight");
        }
        const state = numbers.filter((number) => number > 300);
        expect(state).toHaveLength(3);
        expect(state.every((number) => number > 420 && number <= 430)).toBe(true);
    });

    test("opens its list upwards at the bottom of the page, inside the window", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#state-button").scrollIntoViewIfNeeded();
        await page.locator("#state-button").click();
        const list = page.locator("#state-list");
        await expect(list).toBeVisible();
        const box = await list.boundingBox();
        const button = await page.locator("#state-button").boundingBox();
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((button?.y ?? 0));
        expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    });
});

test.describe("the first visit", () =>
{
    test("asks for the state, the language, the appearance and the translation in one dialog, once", async ({ page }) =>
    {
        await openApp(page, { firstVisit: true });
        const dialog = page.getByRole("dialog", { name: "Welcome" });
        await expect(dialog).toBeVisible();
        for (const name of ["Your state", "Site language", "Appearance", "Also show the questions in my language"])
        {
            await expect(dialog.locator(".setup-label", { hasText: name })).toBeVisible();
        }
        await chooseFromListbox(page, "setup-state", "hamburg");
        await chooseFromListbox(page, "setup-theme", "dark");
        // The translation is one tick: it follows the language of the site.
        await dialog.locator("#setup-translation").check();
        await expect(page.locator("html")).toHaveClass(/theme-dark/);
        await dialog.getByRole("button", { name: "Let’s go" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator("footer #state-button")).toContainText("Hamburg");
        await expect(page.locator(".question .bi-sub").first()).toBeVisible();
        await page.reload();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator("footer #state-button")).toContainText("Hamburg");
    });

    test("switches its own language at once, and keeps the list focused", async ({ page }) =>
    {
        await openApp(page, { firstVisit: true });
        await chooseFromListbox(page, "setup-language", "de");
        await expect(page.getByRole("dialog", { name: "Willkommen" })).toBeVisible();
        await expect(page.locator("#setup-language-button")).toBeFocused();
    });

    test("keeps every list inside the window, also on a small screen", async ({ page }) =>
    {
        await openApp(page, { firstVisit: true });
        await page.locator("#setup-state-button").click();
        const list = page.locator("#setup-state-list");
        await expect(list).toBeVisible();
        const box = (await list.boundingBox()) as { x: number; y: number; width: number; height: number };
        const viewport = page.viewportSize() as { width: number; height: number };
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        await page.keyboard.press("Escape");
        await expect(list).toBeHidden();
        await expect(page.getByRole("dialog")).toBeVisible();
    });
});

test.describe("translation list keyboard contract", () =>
{
    test("opens with Enter, moves with the arrows, chooses with Enter and gives focus back", async ({ page }) =>
    {
        await openApp(page);
        const button = page.locator("#translation-button");
        await button.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#translation-list")).toBeVisible();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator("#translation-list")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.locator("#translation-list")).toHaveAttribute("aria-activedescendant", "translation-option-1");
        await page.keyboard.press("Enter");
        await expect(page.locator("#translation-list")).toBeHidden();
        await expect(button).toBeFocused();
        // The button is an arrow without a word; its name says what is chosen. Choosing a language also shows the translation.
        await expect(button).toHaveAccessibleName("Translation of the question: English");
        await expect(page.locator("#translation-toggle")).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".question .bi-sub").first()).toHaveAttribute("lang", "en");
    });

    test("jumps with Home and End and with typed letters, and closes with Escape without choosing", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#translation-button").focus();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("End");
        await expect(page.locator("#translation-list [role=option].is-active")).toContainText("हिन्दी");
        await page.keyboard.press("Home");
        await expect(page.locator("#translation-list [role=option].is-active")).toContainText("Automatic");
        await page.keyboard.press("e");
        await expect(page.locator("#translation-list [role=option].is-active")).toContainText("English");
        await page.keyboard.press("Escape");
        await expect(page.locator("#translation-list")).toBeHidden();
        await expect(page.locator("#translation-button")).toBeFocused();
        // Nothing was chosen: the language is still the automatic one, and the translation is still off.
        await expect(page.locator("#translation-button")).toHaveAccessibleName("Translation of the question: Automatic (English)");
        await expect(page.locator("#translation-toggle")).toHaveAttribute("aria-pressed", "false");
    });

    test("closes when something else is clicked", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#translation-button").click();
        await expect(page.locator("#translation-list")).toBeVisible();
        await page.locator("h1").click();
        await expect(page.locator("#translation-list")).toBeHidden();
    });

    test("is a real listbox for assistive technology", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#translation-button").click();
        await expect(page.getByRole("listbox")).toBeVisible();
        // Automatic, and the six languages other than German.
        expect(await page.getByRole("option").count()).toBe(7);
        await expect(page.getByRole("option", { selected: true })).toContainText("Automatic");
    });
});

test.describe("tabs", () =>
{
    test("move with the arrow keys and keep focus", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Practice" }).focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("tab", { name: "Train" })).toBeFocused();
        await expect(page.getByRole("tab", { name: "Train" })).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("tab", { name: "Exam (33)" })).toBeFocused();
        await expect(page.getByRole("tab", { name: "Exam (33)" })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("heading", { name: "Practice exam" })).toBeVisible();
        await page.keyboard.press("End");
        await expect(page.getByRole("tab", { name: "Exam (33)" })).toBeFocused();
        // Learn is the first tab; Practice is the one the page opens with.
        await page.keyboard.press("Home");
        await expect(page.getByRole("tab", { name: "Learn" })).toBeFocused();
        await expect(page.getByRole("tab", { name: "Learn" })).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("tab", { name: "Practice" })).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await expect(page.getByRole("tab", { name: "Exam (33)" })).toBeFocused();
    });
});

test.describe("translation", () =>
{
    test("is off to begin with, because the real test is German only, and shows below the German text when on", async ({ page }) =>
    {
        await openApp(page);
        await expect(page.locator(".question .bi-main")).toHaveAttribute("lang", "de");
        await expect(page.locator(".bi-sub")).toHaveCount(0);
        await expect(page.locator("#translation-toggle")).toHaveAttribute("aria-pressed", "false");
        await page.locator("#translation-toggle").click();
        await expect(page.locator("#translation-toggle")).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".question .bi-main")).toHaveAttribute("lang", "de");
        await expect(page.locator(".question .bi-sub").first()).toHaveAttribute("lang", "en");
        // Another language from the list, and off again with the button.
        await chooseFromListbox(page, "translation", "tr");
        await expect(page.locator(".question .bi-sub").first()).toHaveAttribute("lang", "tr");
        await page.locator("#translation-toggle").click();
        await expect(page.locator(".bi-sub")).toHaveCount(0);
    });

    test("sits in the question card, so it is next to the text it changes", async ({ page }) =>
    {
        await openApp(page);
        await expect(page.locator("article.card #translation-button")).toBeVisible();
        await expect(page.locator("header #translation-button")).toHaveCount(0);
    });

    test("switches with the T key", async ({ page }) =>
    {
        await openApp(page);
        await page.keyboard.press("t");
        await expect(page.locator(".question .bi-sub").first()).toBeVisible();
        await page.keyboard.press("t");
        await expect(page.locator(".bi-sub")).toHaveCount(0);
    });

    test("is remembered after a reload", async ({ page }) =>
    {
        await openApp(page);
        await chooseFromListbox(page, "translation", "en");
        await page.reload();
        await expect(page.locator("#translation-button")).toHaveAccessibleName("Translation of the question: English");
        await expect(page.locator("#translation-toggle")).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".question .bi-sub").first()).toBeVisible();
    });

    test("marks the English text as an unofficial translation", async ({ page }) =>
    {
        await openApp(page);
        await chooseFromListbox(page, "translation", "en");
        await expect(page.locator(".question .bi-sub").first()).toHaveAttribute("title", /Unofficial translation/);
        await expect(page.locator(".unofficial-note")).toBeVisible();
    });
});

test.describe("header controls", () =>
{
    test("tell the site language and the translation apart at first glance", async ({ page }) =>
    {
        await openApp(page);
        await expect(page.locator("#site-language-button")).toContainText("Site language");
        await expect(page.locator("#translation-toggle")).toContainText("Translation");
        await expect(page.locator("#site-language-button")).toHaveAccessibleName("Site language: English");
        await expect(page.locator("#translation-button")).toHaveAccessibleName("Translation of the question: Automatic (English)");
    });
});

test.describe("weak spots", () =>
{
    test("collects a wrong answer, offers a button for it and releases it after a right one", async ({ page }) =>
    {
        await openApp(page);
        await expect(page.getByRole("button", { name: "Practice weak spots" })).toBeDisabled();
        const number = await shownNumber(page);
        await pressOption(page, await wrongOptionIndex(page));
        await expect(page.getByRole("tab")).toHaveCount(4);
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        expect(await shownNumber(page)).toBe(number);
        await expect(page.locator(".round-bar")).toContainText("All my weak spots · 1 question");
        await page.getByRole("button", { name: "Exit weak spots" }).click();
        await expect(page.locator(".round-bar")).toContainText("310 questions");
        await expect(page.getByRole("button", { name: "Exit weak spots" })).toHaveCount(0);
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        await pressOption(page, await correctOptionIndex(page));
        await expect(stat(page, "Weak spots")).toHaveText("0");
        await expect(page.getByRole("button", { name: "Practice weak spots" })).toBeDisabled();
    });

    test("restores weak spots from a previous visit", async ({ page }) =>
    {
        await openApp(page, weakState([5, 6, 7]));
        await expect(stat(page, "Weak spots")).toHaveText("3");
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        expect([5, 6, 7]).toContain(await shownNumber(page));
    });

    test("can be limited to a choice of subjects in the panel", async ({ page }) =>
    {
        await openApp(page, weakState([5, 6, 7]));
        await page.locator("#change-selection").click();
        await page.getByRole("checkbox", { name: /Only my weak spots/ }).check();
        await expect(page.locator(".panel-count")).toContainText("3 questions");
        await page.getByRole("button", { name: "Start new round" }).click();
        await expect(page.locator(".round-bar")).toContainText("Weak spots: All topics + Berlin · 3 questions");
    });
});

test.describe("progress", () =>
{
    test("survives a reload", async ({ page }) =>
    {
        await openApp(page);
        await pressOption(page, await correctOptionIndex(page));
        await page.reload();
        await expect(stat(page, "Seen")).toHaveText("1 of 310");
        await expect(stat(page, "Accuracy")).toHaveText("100%");
    });

    test("is erased only after a second click on reset", async ({ page }) =>
    {
        await openApp(page);
        await pressOption(page, await wrongOptionIndex(page));
        await page.getByRole("button", { name: "Reset progress" }).click();
        await expect(stat(page, "Seen")).toHaveText("1 of 310");
        await page.getByRole("button", { name: "Tap again to erase progress" }).click();
        await expect(stat(page, "Seen")).toHaveText("0 of 310");
        await page.reload();
        await expect(stat(page, "Seen")).toHaveText("0 of 310");
        await expect(stat(page, "Weak spots")).toHaveText("0");
    });

    test("starts cleanly and tells the user when saved data is corrupt", async ({ page, allowedErrors }) =>
    {
        // The app logs a broken save with console.error on purpose.
        allowedErrors.push(/console: SyntaxError/);
        await page.addInitScript((key) => window.localStorage.setItem(key, "{broken"), STORAGE_KEY);
        await page.goto("/?lang=en");
        await expect(page.locator("#toast")).toBeVisible();
        await expect(page.locator("#toast")).toContainText("Something went wrong");
        await expect(page.locator("button.option")).toHaveCount(4);
    });
});

test.describe("the clock of practice", () =>
{
    test("counts up from zero when started, pauses, and resets", async ({ page }) =>
    {
        await page.clock.install({ time: new Date("2026-01-01T10:00:00") });
        await openApp(page);
        const display = page.locator("#clock-display");
        await expect(display).toHaveText("00:00");
        await page.getByRole("button", { name: "Start", exact: true }).click();
        await page.clock.runFor("01:05");
        await expect(display).toHaveText("01:05");
        await page.getByRole("button", { name: "Pause" }).click();
        await page.clock.runFor("00:30");
        await expect(display).toHaveText("01:05");
        await page.getByRole("button", { name: "Reset", exact: true }).click();
        await expect(display).toHaveText("00:00");
    });

    test("counts down from a time that is set, with no limit, and shows the border levels with a real border", async ({ page }) =>
    {
        await page.clock.install({ time: new Date("2026-01-01T10:00:00") });
        await openApp(page);
        await page.getByRole("button", { name: "Count down" }).click();
        const minutes = page.locator("#clock-minutes");
        await minutes.fill("120");
        await minutes.blur();
        await expect(page.locator("#clock-display")).toHaveText("120:00");
        await minutes.fill("20");
        await minutes.blur();
        await page.getByRole("button", { name: "Start", exact: true }).click();
        const widget = page.locator("#clock-widget");
        const border = () => widget.evaluate((element) =>
        {
            const style = getComputedStyle(element);
            return { width: style.borderTopWidth, color: style.borderTopColor, text: getComputedStyle(document.getElementById("clock-display") as Element).color };
        });
        const calm = await border();
        await page.clock.runFor("05:00");
        await expect(page.locator("#clock-display")).toHaveText("15:00");
        const nudge = await border();
        expect(nudge.width).toBe(calm.width);
        expect(nudge.text).not.toBe(calm.text);
        await page.clock.runFor("10:00");
        await expect(widget).toHaveClass(/level-warn/);
        const warn = await border();
        expect(warn.width).toBe("3px");
        expect(warn.color).not.toBe(calm.color);
        await page.clock.runFor("04:00");
        await expect(widget).toHaveClass(/level-critical/);
        const critical = await border();
        expect(critical.width).toBe("3px");
        expect(critical.color).not.toBe(warn.color);
        await page.clock.runFor("01:00");
        await expect(page.locator("#clock-display")).toHaveText("00:00");
        await expect(page.locator("#clock-note")).toHaveText("Time is up.");
    });

    test("is below the progress in the column at the side", async ({ page, isMobile }) =>
    {
        await openApp(page);
        const progress = (await page.locator(".widget.stats").boundingBox()) as { x: number; y: number; width: number; height: number };
        const clock = (await page.locator("#clock-widget").boundingBox()) as { x: number; y: number; width: number; height: number };
        expect(clock.y).toBeGreaterThanOrEqual(progress.y + progress.height);
        expect(Math.abs(clock.x - progress.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(clock.width - progress.width)).toBeLessThanOrEqual(1);
        if (!isMobile)
        {
            const stage = (await page.locator(".stage").boundingBox()) as { x: number; width: number };
            expect(clock.x).toBeGreaterThanOrEqual(stage.x + stage.width);
        }
    });
});
