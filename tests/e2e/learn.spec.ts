import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { chooseFromListbox, expect, openApp, QUESTIONS, STORAGE_KEY, test } from "./fixtures";

/** The plan of the course and its English texts, read from disk so the tests know what the page should show. */
interface Unit { type: "unit"; id: string; questions?: number[]; de?: string }
interface Lesson { id: string; pre: number; check: number[]; review?: number; template?: string; blocks: ({ type: string; id: string } | Unit)[] }
const course = JSON.parse(readFileSync("data/teach/course.json", "utf8")) as { chapters: { id: string; lessons: Lesson[] }[]; events: { id: string }[] };
const english = JSON.parse(readFileSync("data/teach/locales/teach.en.json", "utf8")) as { lessons: Record<string, { title: string; blocks: Record<string, { front?: string }> }> };

const LESSONS = course.chapters.flatMap((chapter) => chapter.lessons);
const FIRST = LESSONS[0];

/** The title of a lesson as the page shows it. */
const titleOf = (lesson: Lesson): string => english.lessons[lesson.id].title.replace(/\{\{|\}\}|\*\*/g, "");

/** The units of a lesson, and how many of them have a flash card. */
const unitsOf = (lesson: Lesson): Unit[] => lesson.blocks.filter((block): block is Unit => block.type === "unit");
const cardCount = (lesson: Lesson): number => unitsOf(lesson).filter((unit) => english.lessons[lesson.id].blocks[unit.id].front !== undefined).length;

/** The questions of the check of a lesson: its own, and the one that comes back. */
const checkOf = (lesson: Lesson): number[] => [...lesson.check, ...(lesson.review === undefined ? [] : [lesson.review])];

/** Rounding of positions the browser reports in fractions of a pixel. */
const PIXEL = 1;

/**
 * Scrolls the window to its top, as a reader does on the way to the list of lessons, and waits until the page was told
 * about it. A press that is faster than that would hide what the page does with the scrolling.
 * @param page Playwright page.
 */
async function scrollToTop(page: Page): Promise<void>
{
    await page.evaluate(() => new Promise<void>((done) =>
    {
        // The page listens to the same event, and it was there first.
        window.addEventListener("scroll", () => done(), { once: true });
        window.scrollTo(0, 0);
    }));
}

/**
 * Opens the Learn tab and waits for the list of lessons.
 * @param page Playwright page.
 */
async function openLearn(page: Page): Promise<void>
{
    await page.getByRole("tab", { name: "Learn" }).click();
    await expect(page.locator(".learn-top h2")).toHaveText("Learn the material");
}

/**
 * Answers a question of the check of the open lesson.
 * @param page Playwright page.
 * @param questionNumber The question.
 * @param right Whether the right option is chosen.
 */
async function answerCheck(page: Page, questionNumber: number, right = true): Promise<void>
{
    const question = QUESTIONS.find((entry) => entry.n === questionNumber) as (typeof QUESTIONS)[number];
    const options = page.locator(`#check-${questionNumber} button.option`);
    const texts = await options.locator(".bi-main").allTextContents();
    const correct = texts.indexOf(question.a[question.r]);
    await options.nth(right ? correct : (correct === 0 ? 1 : 0)).click();
}

/**
 * Where an element is on the page, whatever the scroll position.
 * @param locator The element.
 * @returns Its box, with the top counted from the top of the page.
 */
async function place(locator: Locator): Promise<{ top: number; left: number; width: number; height: number }>
{
    return locator.evaluate((element) =>
    {
        const box = element.getBoundingClientRect();
        return { top: box.top + window.scrollY, left: box.left + window.scrollX, width: box.width, height: box.height };
    });
}

/**
 * Asserts that an element did not move and did not change its size.
 * @param before Its place before.
 * @param after Its place after.
 * @param what What it is, for the message.
 */
function expectSamePlace(before: { top: number; left: number; width: number; height: number }, after: { top: number; left: number; width: number; height: number }, what: string): void
{
    for (const side of ["top", "left", "width", "height"] as const)
    {
        expect(Math.abs(after[side] - before[side]), `${what}: ${side} went from ${before[side]} to ${after[side]}`).toBeLessThan(PIXEL);
    }
}

/**
 * Asserts the page has no horizontal scrollbar.
 * @param page Playwright page.
 * @param where Name of the view, for the message.
 */
async function expectNoHorizontalScroll(page: Page, where: string): Promise<void>
{
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${where} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
}

test.describe("the Learn tab", () =>
{
    test("fetches the course only when the tab is opened, and then only once", async ({ page }) =>
    {
        const fetched: string[] = [];
        page.on("request", (request) =>
        {
            const path = new URL(request.url()).pathname;
            if (path.includes("teach"))
            {
                fetched.push(path);
            }
        });
        await openApp(page);
        await expect(page.locator("button.option")).toHaveCount(4);
        expect(fetched).toEqual([]);
        await openLearn(page);
        expect([...fetched].sort()).toEqual(["/locales/teach.en.json", "/teach/course.json", "/teach/maps.json"]);
        await page.getByRole("tab", { name: "Practice" }).click();
        await openLearn(page);
        expect(fetched).toHaveLength(3);
        await expect(page.locator(".lesson-row")).toHaveCount(LESSONS.length);
    });

    test("walks through a lesson: a guess, the reading, the check, and the lesson is done after a reload too", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await page.locator("#learn-next").click();
        await expect(page.locator(".lesson-head h2")).toHaveText(titleOf(FIRST));
        await expect(page.locator(".lesson-head h2")).toBeFocused();
        // The guess is not judged and not counted.
        await page.locator("#guess button.option").first().click();
        await expect(page.locator("#guess .mini-q-note")).toHaveText("Your guess is noted. Read on.");
        await expect(page.locator("#guess .is-correct, #guess .is-wrong")).toHaveCount(0);
        await expect(page.locator(".stats dd").first()).toHaveText("0 of 310");
        await expect(page.locator(".lesson-body .unit")).toHaveCount(unitsOf(FIRST).length);
        for (const questionNumber of checkOf(FIRST))
        {
            await answerCheck(page, questionNumber);
        }
        await expect(page.locator(".check-result")).toHaveText(`${checkOf(FIRST).length} of ${checkOf(FIRST).length} right.`);
        // The lesson is ticked off by itself.
        await expect(page.locator("#lesson-done")).toBeChecked();
        await expect(page.locator(".lesson-head .lesson-state")).toHaveText("Done");
        await expect(page.locator(".stats dd").first()).toHaveText(`${checkOf(FIRST).length} of 310`);
        // The page has the address of the lesson, so a reload opens the lesson again.
        await page.reload();
        await expect(page.locator(".lesson-head h2")).toHaveText(titleOf(FIRST));
        await expect(page.locator("#lesson-done")).toBeChecked();
        await page.locator("#learn-back").click();
        await expect(page.locator(`#lesson-${FIRST.id} .lesson-state`)).toHaveText("Done");
        await expect(page.locator(`#done-${FIRST.id}`)).toBeChecked();
        await expect(page.locator(".learn-coverage")).toContainText(`1 of ${LESSONS.length} lessons finished.`);
        const saved = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) as string), STORAGE_KEY);
        expect(Object.keys(saved.learn.read)).toEqual([FIRST.id]);
        expect(Object.keys(saved.learn.cards)).toHaveLength(cardCount(FIRST));
    });

    test("moves nothing when an answer to recall is uncovered", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        const box = page.locator(".recall .reveal").first();
        const next = page.locator(".recall .reveal").nth(1);
        const cards = page.locator(".lesson-cards");
        const before = [await place(box), await place(next), await place(cards)];
        await box.getByRole("button", { name: "Show answer" }).click();
        await expect(box).toHaveClass("reveal is-open");
        const after = [await place(box), await place(next), await place(cards)];
        expectSamePlace(before[0], after[0], "the box of the answer");
        expectSamePlace(before[1], after[1], "the box below");
        expectSamePlace(before[2], after[2], "the section below");
        // The answer can be read now, and the keyboard is where it was.
        await expect(box.locator(".reveal-content")).toBeVisible();
        await expect(box).toBeFocused();
    });

    test("moves nothing when a question of the check is answered, right or wrong", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        // A guess first, so the verdict of that question also carries the word about the guess: the longest note there is.
        await page.locator("#guess button.option").first().click();
        const questions = checkOf(FIRST);
        const boxes = questions.map((questionNumber) => page.locator(`#check-${questionNumber}`));
        const end = page.locator(".lesson-end");
        const before = [...await Promise.all(boxes.map((box) => place(box))), await place(end)];
        await answerCheck(page, questions[0], false);
        await expect(page.locator(`#check-${questions[0]} .mini-q-note`)).not.toHaveText("");
        await answerCheck(page, questions[1], true);
        await expect(page.locator(`#check-${questions[1]} .mini-q-note`)).toHaveText(/Correct\./);
        const after = [...await Promise.all(boxes.map((box) => place(box))), await place(end)];
        before.forEach((box, index) => expectSamePlace(box, after[index], index < boxes.length ? `question ${questions[index]}` : "the end of the lesson"));
        // The word on the edge of an option is there to be read, and does not cover the text of the option.
        const mark = await place(page.locator(`#check-${questions[1]} .option.is-correct .mark`));
        const text = await place(page.locator(`#check-${questions[1]} .option.is-correct .option-text`));
        expect(mark.top + mark.height).toBeLessThanOrEqual(text.top + PIXEL);
    });

    test("shows the flash cards in a dialog that keeps its size, over a lesson that does not move, and takes the keys of the cards", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        await page.locator("#lesson-cards").scrollIntoViewIfNeeded();
        const lessonAt = await page.evaluate(() => window.scrollY);
        expect(lessonAt).toBeGreaterThan(500);
        await page.locator("#lesson-cards").click();
        const frame = page.getByRole("dialog");
        await expect(frame).toBeVisible();
        const dialogBefore = await place(frame);
        const card = page.locator("#flashcard");
        const known = page.locator("#flash-known");
        const before = [await place(card), await place(known), await place(page.locator("#flash-answer"))];
        await expect(page.locator("#flash-answer .reveal-content")).toBeHidden();
        await expect(known).toBeDisabled();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.press("Space");
        await expect(page.locator("#flash-answer")).toHaveClass("reveal is-open");
        await expect(page.locator("#flash-answer .flash-german")).toBeVisible();
        // Space uncovered the answer and did not scroll the page.
        expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
        const after = [await place(card), await place(known), await place(page.locator("#flash-answer"))];
        expectSamePlace(before[0], after[0], "the card");
        expectSamePlace(before[1], after[1], "the button Got it");
        expectSamePlace(before[2], after[2], "the place of the answer");
        await expect(known).toBeFocused();
        const front = await page.locator(".flash-front").textContent();
        await page.keyboard.press("2");
        await expect(page.locator(".flash-front")).not.toHaveText(front as string);
        await expect(page.locator(".flash-meta span").first()).toHaveText(`${cardCount(FIRST) - 1} cards to go`);
        // The buttons are where they were on the card before.
        expectSamePlace(before[1], await place(page.locator("#flash-known")), "the button Got it on the next card");
        await page.keyboard.press("Enter");
        await expect(page.locator("#flash-answer")).toHaveClass("reveal is-open");
        await page.keyboard.press("1");
        await expect(page.locator(".flash-meta span").first()).toHaveText(`${cardCount(FIRST) - 1} cards to go`);
        // The dialog is the size it was, and the lesson below is where it was: closing the cards leads back to the very place.
        expectSamePlace(dialogBefore, await place(frame), "the dialog");
        expect(await page.evaluate(() => window.scrollY)).toBe(lessonAt);
        await page.keyboard.press("Escape");
        await expect(frame).toHaveCount(0);
        expect(Math.abs(await page.evaluate(() => window.scrollY) - lessonAt)).toBeLessThan(PIXEL);
        await expect(page.locator("#lesson-cards")).toBeFocused();
        await expect(page.locator("#lesson-cards")).toBeInViewport();
    });

    test("brings the cards of a finished lesson back on the next day, and moves them up when they are still known", async ({ page }) =>
    {
        await page.clock.install({ time: new Date(2026, 9, 12, 9, 0) });
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        for (const questionNumber of checkOf(FIRST))
        {
            await answerCheck(page, questionNumber);
        }
        await page.locator("#learn-back").click();
        await expect(page.locator("#learn-review")).toBeDisabled();
        await expect(page.locator("#learn-next")).toHaveText(`Start: ${titleOf(LESSONS[1])}`);
        await page.clock.setFixedTime(new Date(2026, 9, 13, 9, 0));
        await page.getByRole("tab", { name: "Practice" }).click();
        await page.getByRole("tab", { name: "Learn" }).click();
        const count = cardCount(FIRST);
        await expect(page.locator("#learn-next")).toHaveText(`Review ${count} cards`);
        await page.locator("#learn-next").click();
        // The clock of the page stands still here: it is moved on a second before each rating, as time passes while a card is read.
        let moment = new Date(2026, 9, 13, 9, 0).getTime();
        for (let index = 0; index < count; index++)
        {
            await page.locator("#flash-answer-show").click();
            moment += 1000;
            await page.clock.setFixedTime(moment);
            await page.locator("#flash-known").click();
        }
        await expect(page.locator(".flash-end h3")).toHaveText("Done for now");
        await expect(page.locator(".flash-end .hint")).toHaveText("No more cards are due today.");
        await page.locator("#flash-leave").click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator(".learn-widget .box-row strong")).toHaveText(["0", String(count), "0", "0", "0"]);
    });

    test("explains a wrong answer in practice in a dialog, and leads from there to the whole lesson at that unit", async ({ page }) =>
    {
        await openApp(page);
        const label = await page.locator(".qno").first().textContent();
        const number = Number((label as string).replace(/\D/g, ""));
        const question = QUESTIONS.find((entry) => entry.n === number) as (typeof QUESTIONS)[number];
        const lesson = LESSONS.find((entry) => unitsOf(entry).some((unit) => unit.questions?.includes(number))) as Lesson;
        const unit = unitsOf(lesson).find((entry) => entry.questions?.includes(number)) as Unit;
        const texts = await page.locator("button.option .bi-main").allTextContents();
        await page.locator("button.option").nth(texts.indexOf(question.a[question.r]) === 0 ? 1 : 0).click();
        const address = page.url();
        await page.getByRole("button", { name: "Learn why" }).click();
        const dialog = page.getByRole("dialog", { name: `Question ${number}: why` });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator(`#unit-${unit.id}`)).toBeVisible();
        await expect(dialog.locator(".why-from")).toHaveText(`From the lesson “${titleOf(lesson)}”`);
        // The tab stays as it is, and so does the address.
        await expect(page.locator("#tab-practice")).toHaveAttribute("aria-selected", "true");
        expect(page.url()).toBe(address);
        await expectNoHorizontalScroll(page, "the explanation of a question");
        await dialog.getByRole("link", { name: "Open the whole lesson" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator(".lesson-head h2")).toHaveText(titleOf(lesson));
        await expect(page.locator(`#unit-${unit.id}`)).toBeInViewport();
        await expect(page.locator(`#unit-${unit.id}`)).toBeFocused();
        // The way back leads to practice.
        await page.goBack();
        await expect(page.locator("#tab-practice")).toHaveAttribute("aria-selected", "true");
    });

    test("explains a right answer too, and the dialog has one size while the lesson is on its way and when it is there", async ({ page }) =>
    {
        let release: () => void = () => undefined;
        const held = new Promise<void>((done) =>
        {
            release = done;
        });
        await page.route((url) => url.pathname.endsWith("/teach/course.json"), async (route) =>
        {
            await held;
            await route.continue();
        });
        await openApp(page);
        const label = await page.locator(".qno").first().textContent();
        const number = Number((label as string).replace(/\D/g, ""));
        const question = QUESTIONS.find((entry) => entry.n === number) as (typeof QUESTIONS)[number];
        const texts = await page.locator("button.option .bi-main").allTextContents();
        await page.locator("button.option").nth(texts.indexOf(question.a[question.r])).click();
        await page.getByRole("button", { name: "Learn why" }).click();
        const frame = page.locator("#modal-root [role=dialog]");
        await expect(frame.locator(".why-wait")).toHaveText("Loading the lessons …");
        const waiting = await place(frame);
        release();
        await expect(frame.locator(".why .unit")).toBeVisible();
        expectSamePlace(waiting, await place(frame), "the dialog when the explanation arrived");
        await frame.locator("#why-close").click();
        await expect(frame).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Learn why" })).toBeFocused();
    });

    test("covers the dates of the timeline without moving a row, and uncovers them one by one", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await page.locator("#learn-timeline").click();
        const rows = page.locator(".chrono-row");
        await expect(rows).toHaveCount(course.events.length);
        const list = page.locator("ol.chrono");
        const before = [await place(list), await place(rows.nth(0)), await place(rows.nth(5)), await place(rows.last())];
        await page.locator("#timeline-cover").click();
        await expect(page.locator(".chrono-show")).toHaveCount(course.events.length);
        const covered = [await place(list), await place(rows.nth(0)), await place(rows.nth(5)), await place(rows.last())];
        before.forEach((box, index) => expectSamePlace(box, covered[index], `covered, part ${index}`));
        await expect(rows.nth(0).locator(".chrono-date")).toBeHidden();
        await rows.nth(0).locator(".chrono-show").click();
        await expect(rows.nth(0).locator(".chrono-date")).toBeVisible();
        await expect(page.locator(".chrono-show")).toHaveCount(course.events.length - 1);
        const uncovered = [await place(list), await place(rows.nth(0)), await place(rows.nth(5)), await place(rows.last())];
        before.forEach((box, index) => expectSamePlace(box, uncovered[index], `one date uncovered, part ${index}`));
        // The two stripes of the division stand side by side, west on the left.
        const division = page.locator(".chrono-row.group-division").first();
        const west = await place(division.locator(".rail-west"));
        const east = await place(division.locator(".rail-east"));
        expect(west.left).toBeLessThan(east.left);
        expect(west.width).toBeGreaterThan(0);
        expect(east.width).toBeGreaterThan(0);
    });

    test("covers the names of a map without moving a line, and shows where a line is on the map", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await page.locator("#learn-maps").click();
        const figure = page.locator("#atlas-states");
        const lines = figure.locator(".map-entry");
        await expect(lines).toHaveCount(16);
        const before = [await place(figure), await place(lines.nth(0)), await place(lines.nth(9)), await place(lines.last())];
        await figure.locator("#atlas-states-cover").click();
        await expect(figure.locator(".map-hidden:not(.is-off)")).toHaveCount(16);
        const covered = [await place(figure), await place(lines.nth(0)), await place(lines.nth(9)), await place(lines.last())];
        before.forEach((box, index) => expectSamePlace(box, covered[index], `covered, part ${index}`));
        await lines.nth(9).click();
        await expect(figure.locator(".map-hidden:not(.is-off)")).toHaveCount(15);
        await expect(figure.locator("path.region.is-picked")).toHaveCount(1);
        const picked = [await place(figure), await place(lines.nth(0)), await place(lines.nth(9)), await place(lines.last())];
        before.forEach((box, index) => expectSamePlace(box, picked[index], `one name uncovered, part ${index}`));
        // The numbers of the map can be read: a number is at least 9 pixels high on any screen.
        const label = await figure.locator(".map-label text").first().evaluate((text) => text.getBoundingClientRect().height);
        expect(label).toBeGreaterThanOrEqual(9);
        // A region answers to a tap as well.
        await figure.locator("path.region.is-entry").first().click({ force: true });
        await expect(figure.locator(".map-entry.is-picked")).toHaveCount(1);
    });

    test("fits the screen on every page of the tab, with nothing to scroll sideways", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await expectNoHorizontalScroll(page, "the list of lessons");
        for (const lesson of LESSONS.filter((entry) => entry.blocks.some((block) => ["compare", "map", "timeline", "chain", "picture"].includes(block.type))))
        {
            await page.locator(`#lesson-${lesson.template === "state" ? "land-berlin" : lesson.id}`).click();
            await expect(page.locator(".lesson-head h2")).toBeVisible();
            await expectNoHorizontalScroll(page, `the lesson ${lesson.id}`);
            // No table, map or picture is wider than the card it is in.
            const widest = await page.evaluate(() =>
            {
                const card = (document.querySelector(".lesson-body") as HTMLElement).getBoundingClientRect();
                return Math.max(...Array.from(document.querySelectorAll(".lesson-body > *")).map((block) => block.getBoundingClientRect().right - card.right));
            });
            expect(widest, `a block of ${lesson.id} sticks out`).toBeLessThanOrEqual(PIXEL);
            await page.locator("#learn-back").click();
        }
        await page.locator(`#lesson-${FIRST.id}`).click();
        await page.locator("#lesson-cards").click();
        await expectNoHorizontalScroll(page, "the flash cards");
        // The dialog is inside the window, with room around it or edge to edge on a phone.
        const frame = await place(page.getByRole("dialog"));
        const width = await page.evaluate(() => document.documentElement.clientWidth);
        expect(frame.left).toBeGreaterThanOrEqual(0);
        expect(frame.left + frame.width).toBeLessThanOrEqual(width + PIXEL);
        await page.keyboard.press("Escape");
        await page.locator("#learn-back").click();
        await page.locator("#learn-timeline").click();
        await expectNoHorizontalScroll(page, "the timeline");
        await page.locator("#learn-back").click();
        await page.locator("#learn-maps").click();
        await expectNoHorizontalScroll(page, "the maps");
    });

    test("works in Arabic: the page is mirrored, German terms keep their direction, and nothing sticks out", async ({ page }) =>
    {
        await openApp(page, { locale: "ar" });
        await page.locator("#tab-learn").click();
        await expect(page.locator(".lesson-row")).toHaveCount(LESSONS.length);
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        await expectNoHorizontalScroll(page, "the list of lessons in Arabic");
        await page.locator("#learn-timeline").click();
        await expectNoHorizontalScroll(page, "the timeline in Arabic");
        // The rail is at the start edge, which is the right; west stays the left stripe, as on a map.
        const row = page.locator(".chrono-row.group-division").first();
        const rail = await place(row.locator(".chrono-rail"));
        const body = await place(row.locator(".chrono-body"));
        expect(rail.left).toBeGreaterThan(body.left);
        expect((await place(row.locator(".rail-west"))).left).toBeLessThan((await place(row.locator(".rail-east"))).left);
        const term = row.locator(".chrono-term");
        await expect(term).toHaveAttribute("dir", "ltr");
        // A German name starts at the same edge as the Arabic text below it.
        const termBox = await place(term);
        const textBox = await place(row.locator(".chrono-text"));
        expect(Math.abs((termBox.left + termBox.width) - (textBox.left + textBox.width))).toBeLessThan(PIXEL);
        await page.locator("#learn-back").click();
        await page.locator("#learn-maps").click();
        await expectNoHorizontalScroll(page, "the maps in Arabic");
    });

    test("keeps the tab that is open in view on a narrow phone, in a language with long words", async ({ page }) =>
    {
        await page.setViewportSize({ width: 320, height: 640 });
        await openApp(page, { locale: "de" });
        // The words have their final width once the font is there.
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        for (const id of ["tab-exam", "tab-learn", "tab-train"])
        {
            await page.locator(`#${id}`).scrollIntoViewIfNeeded();
            await page.locator(`#${id}`).click();
            await expect(page.locator(`#${id}`)).toHaveAttribute("aria-selected", "true");
            const inside = await page.evaluate((tabId) =>
            {
                const tab = (document.getElementById(tabId) as HTMLElement).getBoundingClientRect();
                const strip = (document.querySelector("[role=tablist]") as HTMLElement).getBoundingClientRect();
                return { start: tab.left - strip.left, end: strip.right - tab.right };
            }, id);
            expect(inside.start, `${id} is cut off at its start`).toBeGreaterThanOrEqual(-PIXEL);
            expect(inside.end, `${id} is cut off at its end`).toBeGreaterThanOrEqual(-PIXEL);
        }
        await expectNoHorizontalScroll(page, "the page with four tabs at 320 pixels");
    });

    test("fetches the texts of another language when the site changes it, and keeps the user in the lesson", async ({ page }) =>
    {
        const fetched: string[] = [];
        page.on("request", (request) =>
        {
            const path = new URL(request.url()).pathname;
            if (path.includes("teach"))
            {
                fetched.push(path);
            }
        });
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        await chooseFromListbox(page, "site-language", "tr");
        await expect(page.locator("html")).toHaveAttribute("lang", "tr");
        await expect(page.locator("#tab-learn")).toHaveAttribute("aria-selected", "true");
        await expect(page.locator(".stage")).toHaveClass("stage learn learn-lesson");
        await expect(page.locator(".lesson-head h2")).not.toHaveText(titleOf(FIRST));
        await expect(page).toHaveURL(new RegExp(`#learn/${FIRST.id}$`));
        // Only the texts were fetched again: the plan and the maps are the same in every language.
        expect(fetched.filter((path) => path.endsWith("teach.tr.json"))).toHaveLength(1);
        expect(fetched.filter((path) => path.startsWith("/teach/"))).toHaveLength(2);
        // The list of languages keeps the focus, and the page stays at its top, where that list is.
        await expect(page.locator("#site-language-button")).toBeFocused();
        await expect(page.locator("#site-language-button")).toBeInViewport();
    });

    test("leads back to the list where the user left it, by its button and by the Back button of the browser", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        const lesson = LESSONS[20];
        const row = page.locator(`#lesson-${lesson.id}`);
        await row.scrollIntoViewIfNeeded();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
        const listAt = await page.evaluate(() => window.scrollY);
        await row.click();
        await expect(page.locator(".lesson-head h2")).toHaveText(titleOf(lesson));
        await expect(page).toHaveURL(new RegExp(`#learn/${lesson.id}$`));
        // A lesson that is new starts at its top.
        await expect(page.locator(".learn-bar")).toBeInViewport();
        await page.locator("#learn-back").click();
        await expect(page).toHaveURL(/#learn$/);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listAt);
        await expect(row).toBeFocused();
        await expect(row).toBeInViewport();
        // The same with the buttons of the browser.
        await row.click();
        await expect(page.locator(".lesson-head h2")).toHaveText(titleOf(lesson));
        await page.goBack();
        await expect(page.locator(".learn-top h2")).toHaveText("Learn the material");
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listAt);
        await page.goForward();
        await expect(page.locator(".lesson-head h2")).toHaveText(titleOf(lesson));
        // Every page that was opened is a step: the list, the lesson, the list again, the lesson again.
        for (const expected of [/#learn$/, new RegExp(`#learn/${lesson.id}$`), /#learn$/])
        {
            await page.goBack();
            await expect(page).toHaveURL(expected);
        }
        await page.goBack();
        // Before the Learn tab was opened the page showed practice.
        await expect(page.locator("#tab-practice")).toHaveAttribute("aria-selected", "true");
        await expect(page).toHaveURL(/\/$/);
    });

    test("notes how far a lesson was read, shows it in the list, and goes on there after the page was closed", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        const unit = unitsOf(FIRST)[3];
        // The user reads down to the fourth unit, which ends up near the top of the window.
        await page.evaluate((id) => (document.getElementById(id) as HTMLElement).scrollIntoView({ block: "start" }), `unit-${unit.id}`);
        await expect.poll(async () => (await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) as string).learn.seen, STORAGE_KEY))[FIRST.id]?.at).toBe(unit.id);
        const seen = (await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) as string).learn, STORAGE_KEY)) as { seen: Record<string, { at: string; percent: number }>; read: Record<string, number> };
        expect(seen.seen[FIRST.id].percent).toBeGreaterThan(10);
        expect(seen.seen[FIRST.id].percent).toBeLessThan(100);
        // Reading is not knowing: the lesson is not done.
        expect(seen.read).toEqual({});
        // The way back to the list is at the top of the lesson: the reader scrolls back up to it, and the page has all the time to notice.
        await scrollToTop(page);
        await expect(page.locator("#learn-back")).toBeInViewport();
        expect((await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) as string).learn.seen, STORAGE_KEY))[FIRST.id]).toEqual(seen.seen[FIRST.id]);
        await page.locator("#learn-back").click();
        await expect(page.locator(`#lesson-${FIRST.id} .lesson-state`)).toHaveText(`${seen.seen[FIRST.id].percent}% read`);
        await expect(page.locator(`#done-${FIRST.id}`)).not.toBeChecked();
        // Opened again from the list, the lesson goes on at that unit, not at the top the reader left it from.
        const expectReadingPlace = async (): Promise<void> =>
        {
            await expect(page.locator(`#unit-${unit.id}`)).toBeInViewport();
            const top = await page.locator(`#unit-${unit.id}`).evaluate((element) => element.getBoundingClientRect().top);
            expect(Math.abs(top)).toBeLessThan(40);
            await expect(page.locator(`#unit-${unit.id}`)).toBeFocused();
        };
        await page.locator(`#lesson-${FIRST.id}`).click();
        await expectReadingPlace();
        await scrollToTop(page);
        await page.locator("#learn-back").click();
        // Another day: the page is opened anew, and the lesson opens at that unit.
        await page.goto("/?lang=en");
        await openLearn(page);
        await expect(page.locator("#learn-next")).toHaveText(`Go on: ${titleOf(FIRST)}`);
        await page.locator("#learn-next").click();
        await expectReadingPlace();
    });

    test("ticks a lesson off in the list and at its end, without moving a row", async ({ page }) =>
    {
        await openApp(page);
        await openLearn(page);
        const rows = page.locator(".lesson-item");
        const before = [await place(rows.nth(0)), await place(rows.nth(1)), await place(rows.nth(5)), await place(page.locator(".learn-ready"))];
        await page.locator(`#done-${FIRST.id}`).check();
        await expect(page.locator(`#lesson-${FIRST.id} .lesson-state`)).toHaveText("Done");
        await expect(page.locator("#learn-next")).toHaveText(`Start: ${titleOf(LESSONS[1])}`);
        const ticked = [await place(rows.nth(0)), await place(rows.nth(1)), await place(rows.nth(5)), await place(page.locator(".learn-ready"))];
        before.forEach((box, index) => expectSamePlace(box, ticked[index], `ticked, part ${index}`));
        await expect(page.locator(".learn-top")).toBeVisible();
        // The tick is big enough to hit, and it does not open the lesson.
        const target = await place(page.locator(`#done-${FIRST.id}`).locator("xpath=.."));
        expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(32);
        await expect(page.locator(".stage")).toHaveClass("stage learn learn-home");
        await page.locator(`#lesson-${FIRST.id}`).click();
        const tick = page.locator("#lesson-done");
        await expect(tick).toBeChecked();
        await tick.scrollIntoViewIfNeeded();
        const end = [await place(page.locator(".lesson-done")), await place(page.locator("#lesson-practise"))];
        await tick.uncheck();
        await expect(page.locator(".lesson-head .lesson-state")).not.toHaveText("Done");
        const cleared = [await place(page.locator(".lesson-done")), await place(page.locator("#lesson-practise"))];
        end.forEach((box, index) => expectSamePlace(box, cleared[index], `tick taken back, part ${index}`));
        await page.locator("#learn-back").click();
        await expect(page.locator(`#done-${FIRST.id}`)).not.toBeChecked();
    });

    test("opens a section of a lesson by its link, at that section", async ({ page }) =>
    {
        const lesson = LESSONS[5];
        const unit = unitsOf(lesson)[1];
        await openApp(page, { place: `#learn/${lesson.id}/${unit.id}` });
        await expect(page.locator("#tab-learn")).toHaveAttribute("aria-selected", "true");
        await expect(page.locator(".lesson-head h2")).toHaveText(titleOf(lesson));
        await expect(page.locator(`#unit-${unit.id}`)).toBeInViewport();
        await expect.poll(async () => Math.abs(await page.locator(`#unit-${unit.id}`).evaluate((element) => element.getBoundingClientRect().top))).toBeLessThan(40);
        await expect(page.locator(`#unit-${unit.id}`)).toBeFocused();
        await expect(page).toHaveURL(new RegExp(`#learn/${lesson.id}/${unit.id}$`));
        // No ring is drawn around a whole section.
        expect(await page.locator(`#unit-${unit.id}`).evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
    });

    test("copies the link of a lesson and of a section, says so for a moment, and keeps every button its size", async ({ page, context, isMobile }) =>
    {
        test.skip(isMobile, "a phone opens its share sheet, see the next test");
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        const origin = new URL(page.url()).origin;
        const share = page.locator("#learn-share");
        const title = page.locator(".lesson-head h2");
        const before = [await place(share), await place(title)];
        await expect(share.locator(".swap:not(.is-off)")).toHaveText("Share");
        await share.click();
        await expect(share.locator(".swap:not(.is-off)")).toHaveText("Link copied");
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/#learn/${FIRST.id}`);
        const noted = [await place(share), await place(title)];
        before.forEach((box, index) => expectSamePlace(box, noted[index], `link copied, part ${index}`));
        await expect(share.locator(".swap:not(.is-off)")).toHaveText("Share", { timeout: 6000 });
        // The link of a section is hidden until the pointer is on its heading, and it has its room all the time.
        const unit = unitsOf(FIRST)[1];
        const heading = page.locator(`#unit-${unit.id} .unit-title`);
        const link = page.locator(`#link-${unit.id}`);
        await heading.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const headingBefore = await place(heading);
        await expect(link).toHaveCSS("opacity", "0");
        await heading.hover();
        await expect(link).toHaveCSS("opacity", "1");
        await link.click();
        await expect(link).toHaveClass("section-link is-noted");
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/#learn/${FIRST.id}/${unit.id}`);
        expectSamePlace(headingBefore, await place(heading), "the heading of the section");
        // The address of the page did not change: the link was handed over, not followed.
        await expect(page).toHaveURL(new RegExp(`#learn/${FIRST.id}$`));
        // With the keyboard a link shows as soon as it has the focus. The Tab key goes on from the link that was pressed to the next one.
        await page.mouse.move(0, 0);
        const reached = async (): Promise<string> => page.evaluate(() => (document.activeElement?.classList.contains("section-link") ? (document.activeElement as HTMLElement).id : ""));
        const pressed = await reached();
        expect(pressed).toBe(`link-${unit.id}`);
        for (let presses = 0; presses < 30 && [pressed, ""].includes(await reached()); presses++)
        {
            await page.keyboard.press("Tab");
        }
        const next = await reached();
        expect(next).not.toBe("");
        expect(next).not.toBe(pressed);
        await expect(page.locator(`#${next}`)).toHaveCSS("opacity", "1");
    });

    test("shows the links of the sections on a touch screen, where nothing can hover", async ({ page, isMobile }) =>
    {
        test.skip(!isMobile, "phone only");
        await openApp(page);
        await openLearn(page);
        await page.locator(`#lesson-${FIRST.id}`).click();
        const link = page.locator(`#link-${unitsOf(FIRST)[0].id}`);
        await link.scrollIntoViewIfNeeded();
        expect(Number(await link.evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0.4);
        const box = await place(link);
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
        // The link of a section does not make the page wider.
        await expectNoHorizontalScroll(page, "a lesson with section links");
    });
});
