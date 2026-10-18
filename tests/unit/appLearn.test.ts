// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayNumber } from "../../src/learn/schedule";
import type { CourseFile, CourseTexts, LessonSpec, UnitSpec } from "../../src/learn/types";
import {
    breakServer, buttonByText, chooseFromListbox, chooseTranslation, clickButton, correctIndex, finishAnyway, mountApp, optionButtons, pressKey, requests, serveCourseFile, settle,
    shownNumber, slots, startExam, statValue, REAL_QUESTIONS, type AppExports, pressFinishExam, afterGuard,
} from "../helpers/appHarness";

/** The real course: these tests drive the tab the way a user does, with the lessons a user gets. */
const course = JSON.parse(readFileSync("data/teach/course.json", "utf8")) as CourseFile;
const english = JSON.parse(readFileSync("data/teach/locales/teach.en.json", "utf8")) as CourseTexts;
const german = JSON.parse(readFileSync("data/teach/locales/teach.de.json", "utf8")) as CourseTexts;

const LESSONS: LessonSpec[] = course.chapters.flatMap((chapter) => chapter.lessons);
const FIRST = LESSONS[0];
const SECOND = LESSONS[1];

/** The morning of the day the tests begin on, and the same hour on a later day. */
const START = new Date(2026, 9, 12, 9, 0);
const later = (days: number): Date => new Date(2026, 9, 12 + days, 9, 0);
const TODAY = dayNumber(START);

/** The id a lesson has on the page: the lesson about the user's state carries the id of the state. */
const pageId = (lesson: LessonSpec, state = "berlin"): string => (lesson.template === "state" ? `land-${state}` : lesson.id);

/** The units of a lesson, and those of them that have a flash card. */
const unitsOf = (lesson: LessonSpec): UnitSpec[] => lesson.blocks.filter((block): block is UnitSpec => block.type === "unit");
const cardsOf = (lesson: LessonSpec, state = "berlin"): string[] => unitsOf(lesson)
    .filter((unit) => (english.lessons[lesson.id].blocks[unit.id] as { front?: string }).front !== undefined)
    .map((unit) => `${pageId(lesson, state)}/${unit.id}`);

/** Every card of the course of a user in Berlin. */
const ALL_CARDS = LESSONS.flatMap((lesson) => cardsOf(lesson));

/** The title of a lesson as the page shows it, without its markup. */
const titleOf = (lesson: LessonSpec, texts: CourseTexts = english): string => texts.lessons[lesson.id].title.replace(/\{\{|\}\}|\*\*/g, "");

/** What the page has saved. */
function saved(app: AppExports): { records: Record<string, { right: number; wrong: number; lastWrong: boolean }>; learn: { read: Record<string, number>; seen: Record<string, { at: string; percent: number }>; cards: Record<string, { box: number; due: number }>; last: string | null }; exams: { day: number; score: number; total: number }[] }
{
    return JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
}

/** Opens the Learn tab and waits for the course. */
async function openLearn(): Promise<void>
{
    (document.getElementById("tab-learn") as HTMLButtonElement).click();
    await settle();
}

/** Clicks an element by its id. Throws when it is missing, so a wrong id cannot pass silently. */
function click(id: string): void
{
    const element = document.getElementById(id);
    if (!element)
    {
        throw new Error(`No element with the id "${id}"`);
    }
    (element as HTMLElement).click();
}

/** The text of an element by its id. */
const textOf = (id: string): string => document.getElementById(id)?.textContent ?? "";

/**
 * Rates the flash card that is up, a moment after its answer came up: a press at once is taken for a second press
 * meant to show the answer, and ignored.
 * @param id The button: "flash-known" or "flash-again".
 */
function rate(id: string): void
{
    afterGuard(() => click(id));
}

/** The first element that matches a selector, and its text. */
const find = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement;
const textIn = (selector: string): string => document.querySelector(selector)?.textContent ?? "";

/**
 * The option buttons of a question inside a lesson.
 * @param id Id of the question: "guess", or "check-" and the question number.
 */
const optionsOf = (id: string): HTMLButtonElement[] => Array.from(document.querySelectorAll<HTMLButtonElement>(`#${id} button.option`));

/**
 * Chooses an option of a question inside a lesson.
 * @param id Id of the question on the page.
 * @param questionNumber Its number in the catalogue.
 * @param right Whether the right option is chosen.
 */
function choose(id: string, questionNumber: number, right: boolean): void
{
    const question = REAL_QUESTIONS.find((entry) => entry.n === questionNumber) as (typeof REAL_QUESTIONS)[number];
    const options = optionsOf(id);
    const correct = options.findIndex((option) => option.querySelector(".bi-main")?.textContent === question.a[question.r]);
    options[right ? correct : (correct === 0 ? 1 : 0)].click();
}

/** The questions of the check of a lesson: its own, and the one that comes back from the lesson before. */
const checkOf = (lesson: LessonSpec): number[] => [...lesson.check, ...(lesson.review === undefined ? [] : [lesson.review])];

/**
 * Answers every question of the check of the lesson that is open.
 * @param lesson The lesson.
 * @param right Whether the answers are right.
 */
function finishCheck(lesson: LessonSpec, right = true): void
{
    for (const questionNumber of checkOf(lesson))
    {
        choose(`check-${questionNumber}`, questionNumber, right);
    }
}

/** The values of the widget of the tab, by their label. */
function widget(): Record<string, string>
{
    const terms = Array.from(document.querySelectorAll(".learn-widget dt"));
    return Object.fromEntries(terms.map((term) => [term.textContent as string, term.nextElementSibling?.textContent as string]));
}

/** How many cards the widget shows in each box. */
const boxes = (): string[] => Array.from(document.querySelectorAll(".learn-widget .box-row strong")).map((count) => count.textContent as string);

/**
 * Puts progress into the storage of the browser, as an earlier visit would have left it. The page reads it when it is opened.
 * @param state What is saved.
 */
function seed(state: Record<string, unknown>): void
{
    window.localStorage.setItem("lidpractice-v4", JSON.stringify({ setupDone: true, ...state }));
}

describe("App: the Learn tab", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        window.localStorage.clear();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(START);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        app = await mountApp();
    });

    afterEach(() =>
    {
        document.querySelector<HTMLElement>(".modal-close")?.click();
        breakServer(null);
        vi.restoreAllMocks();
        vi.useRealTimers();
        window.localStorage.clear();
    });

    describe("loading the course", () =>
    {
        it("fetches nothing of the course while the user only practises", () =>
        {
            expect(requests.filter((address) => address.includes("teach"))).toEqual([]);
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-practice");
            expect(document.querySelector(".learn-widget")).toBeNull();
        });

        it("fetches the plan, the maps and the texts of the site's language when the tab is opened, each once", async () =>
        {
            click("tab-learn");
            // The room of the first card is there while the course is on its way.
            expect(find(".learn-wait").getAttribute("aria-busy")).toBe("true");
            expect(textIn(".learn-wait [role=status]")).toBe("Loading the lessons …");
            expect(document.querySelector(".learn-widget")).toBeNull();
            await settle();
            expect([...requests].filter((address) => address.includes("teach")).sort()).toEqual(["locales/teach.en.json", "teach/course.json", "teach/maps.json"]);
            expect(document.querySelector(".learn-wait")).toBeNull();
            expect(textIn(".learn-top h2")).toBe("Learn the material");
            click("tab-practice");
            await openLearn();
            expect(requests.filter((address) => address.includes("teach"))).toHaveLength(3);
        });

        it.each(["missing", "offline", "wrong"] as const)("says so when the files are %s, and loads them when the user tries again", async (kind) =>
        {
            breakServer(kind);
            await openLearn();
            expect(textIn(".learn-wait [role=alert]")).toBe("The lessons could not be loaded. Check your connection and try again.");
            expect(document.querySelector(".learn-top")).toBeNull();
            // A failure the page expects is told in its own words, without the line for an unexpected error in front.
            const toast = document.getElementById("toast") as HTMLElement;
            expect(toast.textContent).toBe("The lessons could not be loaded. Check your connection and try again.");
            // Nothing is asked for again until the user asks.
            const asked = requests.length;
            click("tab-practice");
            await openLearn();
            expect(requests).toHaveLength(asked);
            breakServer(null);
            click("learn-retry");
            await settle();
            expect(textIn(".learn-top h2")).toBe("Learn the material");
            expect(document.querySelectorAll(".lesson-row")).toHaveLength(LESSONS.length);
            // The message at the bottom is not true any more, so it goes.
            expect(toast.hidden).toBe(true);
        });

        it("does not show a course with a hole in it", async () =>
        {
            const broken = structuredClone(english);
            delete broken.lessons[SECOND.id];
            serveCourseFile("teach/locales/teach.en.json", broken);
            await openLearn();
            expect(textIn(".learn-wait [role=alert]")).toBe("The lessons could not be loaded. Check your connection and try again.");
            expect(document.querySelector(".lesson-row")).toBeNull();
            expect(document.querySelector(".learn-widget")).toBeNull();
            // The files are fetched again on Try again, not built once more from the broken ones that arrived.
            serveCourseFile("teach/locales/teach.en.json", english);
            click("learn-retry");
            await settle();
            expect(document.querySelectorAll(".lesson-row")).toHaveLength(LESSONS.length);
        });

        it("fetches only the texts when the site changes its language, and draws the tab in that language", async () =>
        {
            await openLearn();
            requests.length = 0;
            await chooseFromListbox("site-language", "de");
            await settle();
            expect(requests.filter((address) => address.includes("teach"))).toEqual(["locales/teach.de.json"]);
            expect(textOf("tab-learn")).toBe("Lernen");
            expect(textIn(`#lesson-${FIRST.id} .lesson-title`)).toBe(titleOf(FIRST, german));
            // Back in English nothing is fetched: the texts are still there.
            requests.length = 0;
            await chooseFromListbox("site-language", "en");
            await settle();
            expect(requests.filter((address) => address.includes("teach"))).toEqual([]);
            expect(textIn(`#lesson-${FIRST.id} .lesson-title`)).toBe(titleOf(FIRST));
        });
    });

    describe("the list of lessons", () =>
    {
        beforeEach(async () =>
        {
            await openLearn();
        });

        it("says what the tab is for, how far the user is, and what to do next", () =>
        {
            expect(textIn(".learn-intro")).toContain("Short lessons explain what the questions ask and why.");
            expect(textIn(".learn-coverage")).toBe(`0 of ${LESSONS.length} lessons finished. They prepare you for 0 of your 310 questions.`);
            expect(textOf("learn-next")).toBe(`Start: ${titleOf(FIRST)}`);
            expect(textIn(".learn-next .hint")).toBe("The next lesson that is not finished.");
            expect(textOf("learn-timeline")).toBe("Timeline");
            expect(textOf("learn-maps")).toBe("Maps");
        });

        it("lists every chapter with a number and every lesson with its time, its questions and how it stands", () =>
        {
            const chapters = Array.from(document.querySelectorAll(".learn-chapter"));
            expect(chapters).toHaveLength(course.chapters.length);
            expect(chapters.map((chapter) => chapter.querySelector("h3")?.textContent)).toEqual(course.chapters.map((chapter, index) => `${index + 1}. ${english.chapters[chapter.id].title}`));
            expect(chapters.map((chapter) => chapter.querySelectorAll(".lesson-row").length)).toEqual(course.chapters.map((chapter) => chapter.lessons.length));
            const row = find(`#lesson-${FIRST.id}`);
            const questions = unitsOf(FIRST).flatMap((unit) => unit.questions ?? []).length;
            expect(row.querySelector(".lesson-title")?.textContent).toBe(titleOf(FIRST));
            expect(row.querySelector(".lesson-meta")?.textContent).toBe(`${FIRST.minutes} min, ${questions} questions`);
            expect(row.querySelector(".lesson-state")?.className).toBe("tag lesson-state is-new");
            expect(row.querySelector(".lesson-state")?.textContent).toBe("New");
            expect(document.querySelectorAll(".lesson-state.is-new")).toHaveLength(LESSONS.length);
            expect(document.querySelector(".lesson-weak")).toBeNull();
        });

        it("has one lesson about the user's own state, and makes it the lesson of another state when the state is changed", async () =>
        {
            expect(textIn("#lesson-land-berlin .lesson-title")).toBe("Your state: Berlin");
            expect(textIn("#lesson-land-berlin .lesson-meta")).toContain("10 questions");
            await chooseFromListbox("state", "bayern");
            expect(document.getElementById("lesson-land-berlin")).toBeNull();
            expect(textIn("#lesson-land-bayern .lesson-title")).toBe("Your state: Bavaria");
            expect(document.querySelectorAll(".lesson-row")).toHaveLength(LESSONS.length);
        });

        it("says what it takes to be ready for the test, and that nothing of it is met yet", () =>
        {
            const rows = Array.from(document.querySelectorAll(".ready-list li"));
            expect(rows.map((row) => row.textContent)).toEqual([
                `Not yet:All lessons finished (0 of ${LESSONS.length})`,
                "Not yet:0% of the flash cards are in box 3 or higher (80% needed)",
                "Not yet:0 of 2 practice exams with 25 or more of 33 right answers, on different days",
            ]);
            expect(rows.every((row) => !row.classList.contains("is-met"))).toBe(true);
            expect(textIn(".ready-verdict")).toBe("The pass mark is 17 of 33. You do not have to be perfect.");
        });

        it("shows a widget at the side: lessons, cards that are due, the five boxes, and a review that waits for cards", () =>
        {
            expect(widget()).toEqual({ Lessons: `0 of ${LESSONS.length}`, "Cards due today": "0" });
            expect(boxes()).toEqual(["0", "0", "0", "0", "0"]);
            expect((document.getElementById("learn-review") as HTMLButtonElement).disabled).toBe(true);
            // The widget of the tab stands above the clock, below the progress.
            expect(Array.from(document.querySelectorAll(".aside > *")).map((part) => part.classList[1])).toEqual(["stats", "learn-widget", "clock-widget"]);
        });
    });

    describe("a lesson", () =>
    {
        beforeEach(async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
        });

        it("opens with the way back, its title in focus, its time and the big picture, and is remembered as the lesson that is open", () =>
        {
            expect(find(".stage").className).toBe("stage learn learn-lesson");
            expect(textIn(".learn-bar #learn-back")).toBe("All lessons");
            expect(textIn(".learn-crumb")).toBe(english.chapters[course.chapters[0].id].title);
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
            expect(document.activeElement).toBe(find(".lesson-head h2"));
            expect(textIn(".lesson-big")).toBe(english.lessons[FIRST.id].big.replace(/\{\{|\}\}|\*\*/g, ""));
            expect(textIn(".lesson-head .lesson-state")).toBe("New");
            expect(saved(app).learn.last).toBe(FIRST.id);
            click("learn-back");
            expect(textOf("learn-next")).toBe(`Go on: ${titleOf(FIRST)}`);
        });

        it("asks for a guess first: the choice is shown, not judged, not counted, and can be changed", () =>
        {
            expect(textIn(".lesson-pre h3")).toBe("First, a guess");
            expect(textIn("#guess .qno")).toBe(String(FIRST.pre));
            expect(textIn("#guess .mini-q-note")).toBe("Nothing chosen yet.");
            choose("guess", FIRST.pre, false);
            expect(optionsOf("guess").filter((option) => option.classList.contains("is-selected"))).toHaveLength(1);
            expect(document.querySelector("#guess .is-correct, #guess .is-wrong, #guess .mark")).toBeNull();
            expect(textIn("#guess .mini-q-note")).toBe("Your guess is noted. Read on.");
            expect(statValue("Seen")).toBe("0 of 310");
            expect(saved(app).records).toEqual({});
            choose("guess", FIRST.pre, true);
            expect(optionsOf("guess").filter((option) => option.getAttribute("aria-pressed") === "true")).toHaveLength(1);
            expect(optionsOf("guess").every((option) => !option.disabled)).toBe(true);
        });

        it("draws every block of the plan, each unit at a place of its own that a link can lead to", () =>
        {
            const body = find(".lesson-body");
            expect(Array.from(body.children).map((block) => block.id)).toEqual(FIRST.blocks.map((block) => (block.type === "unit" ? `unit-${block.id}` : `block-${block.id}`)));
            const first = unitsOf(FIRST)[0];
            const text = english.lessons[FIRST.id].blocks[first.id] as { q: string };
            expect(textIn(`#unit-${first.id} .unit-title`)).toBe(text.q.replace(/\{\{|\}\}|\*\*/g, ""));
            // The pictures of the catalogue are shown where the lesson talks about them.
            const pictures = FIRST.blocks.filter((block) => block.type === "picture");
            expect(pictures.length).toBeGreaterThan(0);
            expect(document.querySelectorAll(".lesson-picture .picture img")).toHaveLength(pictures.length);
        });

        it("keeps an answer to recall covered until it is asked for, moves nothing when it is uncovered, and leaves it open", () =>
        {
            const recall = FIRST.blocks.find((block) => block.type === "recall") as { id: string; items: number };
            const boxId = `recall-${recall.id}-0`;
            expect(document.querySelectorAll(".recall .reveal")).toHaveLength(recall.items);
            expect(find(`#${boxId}`).className).toBe("reveal");
            const covered = textIn(`#${boxId} .reveal-content`);
            expect(covered).not.toBe("");
            click(`${boxId}-show`);
            expect(find(`#${boxId}`).className).toBe("reveal is-open");
            // The same content, now readable; the button is gone and the focus is on the answer, not at the top of the page.
            expect(textIn(`#${boxId} .reveal-content`)).toBe(covered);
            expect(document.getElementById(`${boxId}-show`)).toBeNull();
            expect(document.activeElement?.id).toBe(boxId);
            expect(document.querySelectorAll(".recall .reveal.is-open")).toHaveLength(1);
            // It stays open when the user leaves the lesson and comes back.
            click("learn-back");
            click(`lesson-${FIRST.id}`);
            expect(find(`#${boxId}`).className).toBe("reveal is-open");
        });

        it("offers the cards of the lesson and a round of practice over exactly its questions", () =>
        {
            expect(textOf("lesson-cards")).toBe(`Go through ${cardsOf(FIRST).length} cards`);
            const questions = unitsOf(FIRST).flatMap((unit) => unit.questions ?? []);
            expect(textOf("lesson-practise")).toBe(`Practise all ${questions.length} questions of this lesson`);
            click("lesson-practise");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-practice");
            expect(slots()).toHaveLength(questions.length);
            expect(textIn(".round-bar strong")).toBe(`Lesson: ${titleOf(FIRST)} · ${questions.length} questions`);
            expect([...questions].sort((first, second) => first - second)).toContain(shownNumber());
            // Started over, the round is drawn again from the same lesson; the way back leads to the lesson.
            optionButtons()[correctIndex()].click();
            click("round-start-over");
            expect(slots()).toHaveLength(questions.length);
            expect(textIn(".round-bar strong")).toBe(`Lesson: ${titleOf(FIRST)} · ${questions.length} questions`);
            expect(document.querySelector(".verdict")).toBeNull();
            click("exit-lesson");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-learn");
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
        });

        it("goes on with the lesson about the new state when the state changes while the lesson about the old one was the last", async () =>
        {
            click("learn-back");
            click("lesson-land-berlin");
            await settle();
            await chooseFromListbox("state", "bayern");
            expect(textIn(".lesson-head h2")).toBe("Your state: Bavaria");
            click("learn-back");
            expect(textOf("learn-next")).toBe("Go on: Your state: Bavaria");
            expect(saved(app).learn.last).toBe("land-bayern");
        });

        it("gives up the round of the lesson about the state when the state changes, and practises as usual", async () =>
        {
            click("learn-back");
            click("lesson-land-berlin");
            await settle();
            click("lesson-practise");
            expect(textIn(".round-bar strong")).toContain("Lesson: Your state: Berlin");
            await chooseFromListbox("state", "bayern");
            expect(textIn(".round-bar strong")).not.toContain("Lesson:");
            // No question of Berlin is left in the round: they are named BE and their task.
            const labels = slots().map((slot) => slot.getAttribute("aria-label") ?? "");
            expect(labels.length).toBeGreaterThan(0);
            expect(labels.some((label) => /\bBE \d/.test(label))).toBe(false);
            expect(document.getElementById("exit-lesson")).toBeNull();
        });

        it("moves to the lesson before and after, and stops at the first one", () =>
        {
            expect((document.getElementById("lesson-previous") as HTMLButtonElement).disabled).toBe(true);
            click("lesson-next");
            expect(textIn(".lesson-head h2")).toBe(titleOf(SECOND));
            expect(saved(app).learn.last).toBe(SECOND.id);
            click("lesson-previous");
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
        });

        it("stops at the last lesson", () =>
        {
            const last = LESSONS[LESSONS.length - 1];
            click("learn-back");
            click(`lesson-${pageId(last)}`);
            expect((document.getElementById("lesson-next") as HTMLButtonElement).disabled).toBe(true);
            expect((document.getElementById("lesson-previous") as HTMLButtonElement).disabled).toBe(false);
        });

        it("leads back to the list of lessons by its button and by the tab itself", () =>
        {
            click("learn-back");
            expect(find(".stage").className).toBe("stage learn learn-home");
            click(`lesson-${FIRST.id}`);
            find("#tab-learn").focus();
            click("tab-learn");
            expect(find(".stage").className).toBe("stage learn learn-home");
            // The tab that was pressed keeps the focus: nothing pulls it into the page.
            expect(document.activeElement?.id).toBe("tab-learn");
        });
    });

    describe("the check at the end of a lesson", () =>
    {
        beforeEach(async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
        });

        it("asks real questions of the catalogue and says that the lesson is open until all are answered", () =>
        {
            expect(Array.from(document.querySelectorAll(".lesson-check .mini-q")).map((entry) => entry.id)).toEqual(checkOf(FIRST).map((questionNumber) => `check-${questionNumber}`));
            expect(textIn(".check-result")).toBe("Answer every question above to finish the lesson.");
            expect(document.querySelectorAll(".lesson-check .mini-q-note")).toHaveLength(checkOf(FIRST).length);
            expect(Array.from(document.querySelectorAll(".lesson-check .mini-q-note")).every((note) => note.textContent === "")).toBe(true);
        });

        it("counts an answer like any other answer of the site, shows right and wrong, and takes no second answer", () =>
        {
            const [first, second] = FIRST.check;
            choose(`check-${first}`, first, true);
            expect(textIn(`#check-${first} .mini-q-note`)).toBe("Correct.");
            expect(find(`#check-${first} .mini-q-note`).className).toBe("mini-q-note ok");
            expect(saved(app).records[String(first)]).toEqual({ right: 1, wrong: 0, lastWrong: false });
            expect(statValue("Seen")).toBe("1 of 310");
            // The options are off, and the focus stays with the question.
            expect(optionsOf(`check-${first}`).every((option) => option.disabled)).toBe(true);
            expect(document.activeElement?.id).toBe(`check-${first}`);
            choose(`check-${second}`, second, false);
            expect(textIn(`#check-${second} .mini-q-note`)).toBe("Not quite. The correct answer is highlighted.");
            expect(document.querySelectorAll(`#check-${second} .is-wrong`)).toHaveLength(1);
            expect(document.querySelectorAll(`#check-${second} .is-correct`)).toHaveLength(1);
            expect(saved(app).records[String(second)]).toEqual({ right: 0, wrong: 1, lastWrong: true });
            expect(statValue("Weak spots")).toBe("1");
            // A click on an option that is off changes nothing.
            optionsOf(`check-${first}`)[0].click();
            expect(saved(app).records[String(first)]).toEqual({ right: 1, wrong: 0, lastWrong: false });
            expect(saved(app).learn.read).toEqual({});
        });

        it("tells how the guess before reading went, and closes the guess once the question was answered for real", () =>
        {
            expect(FIRST.check).toContain(FIRST.pre);
            choose("guess", FIRST.pre, true);
            choose(`check-${FIRST.pre}`, FIRST.pre, true);
            expect(textIn(`#check-${FIRST.pre} .mini-q-note`)).toBe("Correct. Your guess before reading was right too.");
            expect(optionsOf("guess").every((option) => option.disabled)).toBe(true);
        });

        it("tells when the guess before reading was another answer", () =>
        {
            choose("guess", FIRST.pre, false);
            choose(`check-${FIRST.pre}`, FIRST.pre, true);
            expect(textIn(`#check-${FIRST.pre} .mini-q-note`)).toBe("Correct. Your guess before reading was a different one.");
        });

        it("says that the guess was the right one when the answer after reading is wrong", () =>
        {
            choose("guess", FIRST.pre, true);
            choose(`check-${FIRST.pre}`, FIRST.pre, false);
            expect(textIn(`#check-${FIRST.pre} .mini-q-note`)).toBe("Not quite. The correct answer is highlighted. Your guess before reading was the right one.");
            expect(find(`#check-${FIRST.pre} .mini-q-note`).className).toBe("mini-q-note bad");
        });

        it("says that the guess was not right either when both went wrong", () =>
        {
            choose("guess", FIRST.pre, false);
            choose(`check-${FIRST.pre}`, FIRST.pre, false);
            expect(textIn(`#check-${FIRST.pre} .mini-q-note`)).toBe("Not quite. The correct answer is highlighted. Your guess before reading was not right either.");
        });

        it("says nothing about a guess for a question that was not the question of the guess", () =>
        {
            choose("guess", FIRST.pre, true);
            const other = FIRST.check.find((questionNumber) => questionNumber !== FIRST.pre) as number;
            choose(`check-${other}`, other, true);
            expect(textIn(`#check-${other} .mini-q-note`)).toBe("Correct.");
        });

        it("finishes the lesson with the last answer: it counts as done, and its cards go into the first box for tomorrow", () =>
        {
            finishCheck(FIRST);
            const total = checkOf(FIRST).length;
            expect(textIn(".check-result")).toBe(`${total} of ${total} right.`);
            // The lesson is ticked off by itself.
            expect((document.getElementById("lesson-done") as HTMLInputElement).checked).toBe(true);
            expect(find(".check-result").className).toBe("check-result ok");
            expect(textIn(".lesson-head .lesson-state")).toBe("Done");
            expect(saved(app).learn.read).toEqual({ [FIRST.id]: TODAY });
            expect(saved(app).learn.cards).toEqual(Object.fromEntries(cardsOf(FIRST).map((id) => [id, { box: 1, due: TODAY + 1 }])));
            expect(widget()).toEqual({ Lessons: `1 of ${LESSONS.length}`, "Cards due today": "0" });
            expect(boxes()).toEqual([String(cardsOf(FIRST).length), "0", "0", "0", "0"]);
            click("learn-back");
            const questions = unitsOf(FIRST).flatMap((unit) => unit.questions ?? []).length;
            expect(textIn(".learn-coverage")).toBe(`1 of ${LESSONS.length} lessons finished. They prepare you for ${questions} of your 310 questions.`);
            expect(textIn(`#lesson-${FIRST.id} .lesson-state`)).toBe("Done");
            expect(find(`#lesson-${FIRST.id} .lesson-state`).className).toBe("tag lesson-state is-read");
            // The cards are due tomorrow, so the next step is the next lesson.
            expect(textOf("learn-next")).toBe(`Start: ${titleOf(SECOND)}`);
        });

        it("finishes a lesson whatever the answers were, and shows the questions that went wrong on its row", () =>
        {
            finishCheck(FIRST, false);
            expect(textIn(".check-result")).toBe(`0 of ${checkOf(FIRST).length} right.`);
            expect(saved(app).learn.read).toEqual({ [FIRST.id]: TODAY });
            click("learn-back");
            expect(textIn(`#lesson-${FIRST.id} .lesson-weak`)).toBe(`${FIRST.check.length} weak questions`);
        });

        it("brings a question of the lesson before back in the check of the next lesson, marked as such", () =>
        {
            click("lesson-next");
            const review = SECOND.review as number;
            expect(FIRST.check).toContain(review);
            expect(Array.from(document.querySelectorAll(".lesson-check .mini-q")).map((entry) => entry.id)).toEqual(checkOf(SECOND).map((questionNumber) => `check-${questionNumber}`));
            expect(textIn(`#check-${review} .meta .tag:not(.qno)`)).toBe("From an earlier lesson");
            expect(document.querySelectorAll(".lesson-check .meta .tag:not(.qno)")).toHaveLength(1);
            // The lesson is not finished before that question is answered too.
            for (const questionNumber of SECOND.check)
            {
                choose(`check-${questionNumber}`, questionNumber, true);
            }
            expect(saved(app).learn.read).toEqual({});
            choose(`check-${review}`, review, true);
            expect(saved(app).learn.read).toEqual({ [SECOND.id]: TODAY });
        });

        it("shows the translation of the questions with the control of the check, as everywhere on the site", async () =>
        {
            expect(document.querySelector(".lesson-check .bi-sub")).toBeNull();
            await chooseTranslation("en");
            expect(document.querySelectorAll(".lesson-check .question .bi-sub")).toHaveLength(checkOf(FIRST).length);
            expect(find(".stage").className).toBe("stage learn learn-lesson");
        });
    });

    describe("the lesson about the user's state", () =>
    {
        const land = LESSONS.find((lesson) => lesson.template === "state") as LessonSpec;

        beforeEach(async () =>
        {
            await openLearn();
        });

        it("shows the question of the catalogue with every unit, and fetches the questions in the site's language for the answers", async () =>
        {
            requests.length = 0;
            click("lesson-land-berlin");
            await settle();
            expect(requests).toContain("locales/questions.en.json");
            expect(textIn(".lesson-head h2")).toBe("Your state: Berlin");
            expect(document.querySelectorAll(".lesson-body .unit")).toHaveLength(unitsOf(land).length);
            expect(document.querySelectorAll(".lesson-body .unit-asked")).toHaveLength(unitsOf(land).length);
            const labels = Array.from(document.querySelectorAll(".lesson-body .unit-asked .unit-label")).map((label) => label.textContent);
            expect([...labels].sort()).toEqual(Array.from({ length: 10 }, (_, index) => `Question BE ${index + 1} of the test:`).sort());
            // The map of the question and the map of the lesson, with the user's state marked.
            expect(document.querySelectorAll(".lesson-picture .picture img")).toHaveLength(2);
            expect(document.querySelectorAll(".lesson-map path.region.g-home")).toHaveLength(1);
            expect(textIn(".lesson-pre .qno")).toBe(`BE ${land.pre}`);
        });

        it("becomes the lesson about the new state when the state is changed while it is open", async () =>
        {
            click("lesson-land-berlin");
            await settle();
            await chooseFromListbox("state", "hessen");
            expect(find(".stage").className).toBe("stage learn learn-lesson");
            expect(textIn(".lesson-head h2")).toBe("Your state: Hesse");
            expect(textIn(".lesson-pre .qno")).toBe(`HE ${land.pre}`);
        });

        it("finishes with the questions of the state, and its cards carry the answers of the catalogue", async () =>
        {
            click("lesson-land-berlin");
            await settle();
            const first = 320;
            for (const task of land.check)
            {
                choose(`check-${first + task}`, first + task, true);
            }
            choose(`check-${land.review}`, land.review as number, true);
            expect(saved(app).learn.read).toEqual({ "land-berlin": TODAY });
            expect(Object.keys(saved(app).learn.cards).sort()).toEqual(cardsOf(land).sort());
            click("lesson-cards");
            const question = REAL_QUESTIONS.find((entry) => entry.n === first + 7) as (typeof REAL_QUESTIONS)[number];
            click("flash-answer-show");
            // Berlin is a city-state: the card of the first unit asks for that.
            expect(textIn(".flash-front")).toContain("Berlin");
            expect(textIn(".flash-german")).toBe("ein Stadtstaat");
            expect(question.a[question.r]).toBe("Berlin");
        });
    });

    describe("flash cards", () =>
    {
        const cards = cardsOf(FIRST);

        /** The front of a card of the first lesson, as the page shows it. */
        const frontOf = (cardId: string): string => (english.lessons[FIRST.id].blocks[cardId.split("/")[1]] as { front: string }).front.replace(/\{\{|\}\}|\*\*/g, "");

        /** The dialog, or null while none is open. */
        const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>("[role=dialog]");

        beforeEach(async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
        });

        it("open in the dialog of the page, over the lesson, which stays exactly as it is", () =>
        {
            const address = window.location.href;
            find("#lesson-cards").focus();
            click("lesson-cards");
            expect(dialog()?.className).toBe("modal modal-fixed modal-cards");
            expect(textOf("modal-title")).toBe(`Flash cards: ${titleOf(FIRST)}`);
            expect(document.activeElement?.id).toBe("modal-title");
            // The lesson is still the page below: nothing was navigated, so there is nothing to scroll back to.
            expect(find(".stage").className).toBe("stage learn learn-lesson");
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
            expect(window.location.href).toBe(address);
            // It is blocked and hidden from a screen reader while the cards are open.
            expect(find("#app").hasAttribute("inert")).toBe(true);
            expect(find("#app").getAttribute("aria-hidden")).toBe("true");
        });

        it("show one card at a time: the question, and the answer covered in a place that has its size already", () =>
        {
            click("lesson-cards");
            expect(textIn(".flash-meta span")).toBe(`${cards.length} cards to go`);
            expect(textIn(".flash-meta .tag")).toBe("New card");
            expect(textIn(".flash-lesson")).toBe(titleOf(FIRST));
            expect(textIn(".flash-front")).toBe(frontOf(cards[0]));
            // The answer is in the dialog, unread, under the button.
            expect(find("#flash-answer").className).toBe("reveal");
            expect(find("#flash-answer .reveal-content").getAttribute("aria-hidden")).toBe("true");
            expect(textIn("#flash-answer .flash-german")).not.toBe("");
            expect((document.getElementById("flash-again") as HTMLButtonElement).disabled).toBe(true);
            expect((document.getElementById("flash-known") as HTMLButtonElement).disabled).toBe(true);
        });

        it("take no rating from a second press that comes right after the answer showed, where the keyboard went to Got it", () =>
        {
            click("lesson-cards");
            pressKey("Enter");
            expect(document.activeElement?.id).toBe("flash-known");
            // The second Enter lands on Got it at once: it was meant for the answer, not as a rating.
            click("flash-known");
            expect(textIn(".flash-front")).toBe(frontOf(cards[0]));
            expect(saved(app).learn.cards).toEqual({});
            // A moment later the press counts.
            rate("flash-known");
            expect(textIn(".flash-front")).toBe(frontOf(cards[1]));
            // The keys for the rating are a choice of their own and count at once.
            pressKey(" ");
            pressKey("2");
            expect(textIn(".flash-front")).toBe(frontOf(cards[2]));
        });

        it("uncover the answer in German and in the site's language, say where the catalogue asks for it, and then take a rating", () =>
        {
            click("lesson-cards");
            const unit = unitsOf(FIRST).find((entry) => `${FIRST.id}/${entry.id}` === cards[0]) as UnitSpec;
            click("flash-answer-show");
            expect(find("#flash-answer").className).toBe("reveal is-open");
            expect(textIn(".flash-german")).toBe(unit.de);
            expect(find(".flash-german .flash-de").lang).toBe("de");
            expect(textIn(".flash-source .hint")).toBe(`The catalogue asks this in: ${(unit.questions ?? []).join(", ")}`);
            expect((document.getElementById("flash-known") as HTMLButtonElement).disabled).toBe(false);
            // The focus goes to the button a user most often wants next.
            expect(document.activeElement?.id).toBe("flash-known");
            rate("flash-known");
            expect(textIn(".flash-front")).toBe(frontOf(cards[1]));
            expect(textIn(".flash-meta span")).toBe(`${cards.length - 1} cards to go`);
            expect(find("#flash-answer").className).toBe("reveal");
            expect(document.activeElement?.id).toBe("flash-answer-show");
            // It is one dialog all along.
            expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
        });

        it("keep a card that was only looked at out of the boxes: the lesson is not done", () =>
        {
            click("lesson-cards");
            click("flash-answer-show");
            rate("flash-known");
            click("flash-answer-show");
            rate("flash-again");
            expect(saved(app).learn.cards).toEqual({});
            find(".modal-close").click();
            expect(boxes()).toEqual(["0", "0", "0", "0", "0"]);
        });

        it("work with the keyboard: Space or Enter uncovers, 2 says got it, 1 says not yet, and nothing else is taken", () =>
        {
            click("lesson-cards");
            // A rating before the answer shows is not taken.
            pressKey("2");
            pressKey("1");
            expect(textIn(".flash-front")).toBe(frontOf(cards[0]));
            expect(find("#flash-answer").className).toBe("reveal");
            pressKey(" ");
            expect(find("#flash-answer").className).toBe("reveal is-open");
            pressKey(" ");
            pressKey("3");
            pressKey("a");
            expect(textIn(".flash-front")).toBe(frontOf(cards[0]));
            pressKey("2");
            expect(textIn(".flash-front")).toBe(frontOf(cards[1]));
            pressKey("Enter");
            expect(find("#flash-answer").className).toBe("reveal is-open");
            pressKey("1");
            expect(textIn(".flash-front")).toBe(frontOf(cards[2]));
            expect(textIn(".flash-meta span")).toBe(`${cards.length - 1} cards to go`);
            // A key with Ctrl or Cmd belongs to the browser.
            pressKey(" ", { ctrlKey: true });
            expect(find("#flash-answer").className).toBe("reveal");
        });

        it("leave Space and Enter to a button that has the focus, so it is pressed and nothing happens twice", () =>
        {
            click("lesson-cards");
            const close = find(".modal-close");
            const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
            close.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
            expect(find("#flash-answer").className).toBe("reveal");
            // A key that the cards do use is taken, so nothing scrolls.
            const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
            document.dispatchEvent(space);
            expect(space.defaultPrevented).toBe(true);
        });

        it("ignore the keys of the cards while no cards are open", () =>
        {
            const before = window.localStorage.getItem(app.STORAGE_KEY);
            pressKey(" ");
            pressKey("2");
            pressKey("1");
            expect(find(".stage").className).toBe("stage learn learn-lesson");
            expect(dialog()).toBeNull();
            expect(statValue("Seen")).toBe("0 of 310");
            expect(window.localStorage.getItem(app.STORAGE_KEY)).toBe(before);
            // Another dialog has no such keys either.
            clickButton("About and FAQ");
            const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
            document.dispatchEvent(space);
            expect(space.defaultPrevented).toBe(false);
        });

        it("bring a card that was not known back in the same run, and end by saying how it went", () =>
        {
            find("#lesson-cards").focus();
            click("lesson-cards");
            click("flash-answer-show");
            rate("flash-again");
            for (let step = 0; step < cards.length; step++)
            {
                click("flash-answer-show");
                rate("flash-known");
            }
            expect(textIn(".flash-end h3")).toBe("Done for now");
            expect(textIn(".flash-end p")).toBe(`Cards gone through: ${cards.length}. Needed a second look: 1.`);
            expect(textIn(".flash-end .hint")).toBe("When the lesson is marked as done, these cards come back in the review.");
            expect(document.getElementById("flash-more")).toBeNull();
            expect(textOf("flash-leave")).toBe("Close");
            expect(document.activeElement?.id).toBe("flash-leave");
            // Keys do nothing once the run is over.
            pressKey("2");
            pressKey(" ");
            expect(textIn(".flash-end h3")).toBe("Done for now");
            click("flash-leave");
            expect(dialog()).toBeNull();
            // Back in the lesson, at the button that opened the cards.
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
            expect(document.activeElement?.id).toBe("lesson-cards");
        });

        it("close in the middle of a run with Escape or the close button, and start over when they are opened again", () =>
        {
            click("lesson-cards");
            click("flash-answer-show");
            rate("flash-known");
            pressKey("Escape");
            expect(dialog()).toBeNull();
            expect(find("#app").hasAttribute("inert")).toBe(false);
            expect(find(".stage").className).toBe("stage learn learn-lesson");
            click("lesson-cards");
            expect(textIn(".flash-meta span")).toBe(`${cards.length} cards to go`);
            expect(textIn(".flash-front")).toBe(frontOf(cards[0]));
            find(".modal-close").click();
            expect(dialog()).toBeNull();
        });

        it("close when the user goes back in the browser, which leads to the page before", () =>
        {
            click("lesson-cards");
            window.history.replaceState(null, "", "#learn");
            window.dispatchEvent(new PopStateEvent("popstate"));
            expect(dialog()).toBeNull();
            expect(find(".stage").className).toBe("stage learn learn-home");
        });

        it("do not move a card up on the day the lesson was finished: only a pause counts", () =>
        {
            finishCheck(FIRST);
            click("lesson-cards");
            expect(textIn(".flash-meta .tag")).toBe("Box 1 of 5");
            click("flash-answer-show");
            rate("flash-known");
            expect(saved(app).learn.cards[cards[0]]).toEqual({ box: 1, due: TODAY + 1 });
        });
    });

    describe("the review of the cards that are due", () =>
    {
        const cards = cardsOf(FIRST);

        beforeEach(async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            finishCheck(FIRST);
            click("learn-back");
        });

        /** Draws the page again on another day, the way it is drawn when the user comes back to the tab. */
        function comeBack(days: number): void
        {
            vi.setSystemTime(later(days));
            click("tab-practice");
            click("tab-learn");
        }

        /** Goes through the review, knowing every card. */
        function knowAll(): void
        {
            while (document.getElementById("flash-answer-show"))
            {
                click("flash-answer-show");
                rate("flash-known");
            }
        }

        it("has nothing to do on the day a lesson was finished", () =>
        {
            expect(widget()["Cards due today"]).toBe("0");
            expect((document.getElementById("learn-review") as HTMLButtonElement).disabled).toBe(true);
        });

        it("is the next step on the next day, before any new lesson", () =>
        {
            comeBack(1);
            expect(textOf("learn-next")).toBe(`Review ${cards.length} cards`);
            expect(textIn(".learn-next .hint")).toBe("These cards are due today. It takes a few minutes.");
            expect(widget()["Cards due today"]).toBe(String(cards.length));
            expect((document.getElementById("learn-review") as HTMLButtonElement).disabled).toBe(false);
        });

        it("moves every card that is still known one box up, and then has nothing left for today", () =>
        {
            comeBack(1);
            click("learn-next");
            expect(textOf("modal-title")).toBe("Review of the cards that are due");
            expect(find(".stage").className).toBe("stage learn learn-home");
            expect(textIn(".flash-meta span")).toBe(`${cards.length} cards to go`);
            expect(textIn(".flash-meta .tag")).toBe("Box 1 of 5");
            knowAll();
            expect(Object.values(saved(app).learn.cards)).toEqual(cards.map(() => ({ box: 2, due: TODAY + 1 + 3 })));
            expect(textIn(".flash-end p")).toBe(`Cards gone through: ${cards.length}. Needed a second look: 0.`);
            expect(textIn(".flash-end .hint")).toBe("No more cards are due today.");
            expect(document.getElementById("flash-more")).toBeNull();
            expect(find("#flash-leave").className).toBe("primary");
            click("flash-leave");
            // The list below is drawn again with what the review changed.
            expect(document.querySelector("[role=dialog]")).toBeNull();
            expect(find(".stage").className).toBe("stage learn learn-home");
            expect(boxes()).toEqual(["0", String(cards.length), "0", "0", "0"]);
            expect(widget()["Cards due today"]).toBe("0");
            expect(textOf("learn-next")).toBe(`Start: ${titleOf(SECOND)}`);
        });

        it("starts from the widget as well, and from a lesson, which stays the page below", () =>
        {
            comeBack(1);
            click("learn-review");
            expect(textOf("modal-title")).toBe("Review of the cards that are due");
            find(".modal-close").click();
            click(`lesson-${SECOND.id}`);
            click("learn-review");
            expect(textOf("modal-title")).toBe("Review of the cards that are due");
            expect(textIn(".lesson-head h2")).toBe(titleOf(SECOND));
        });

        it("sends a card that was not known back to the first box, and does not count the second answer in the same run", () =>
        {
            comeBack(1);
            click("learn-review");
            const missed = textIn(".flash-front");
            click("flash-answer-show");
            rate("flash-again");
            knowAll();
            const states = Object.values(saved(app).learn.cards);
            // One card is in the first box again, due tomorrow; knowing it at the second try did not move it.
            expect(states.filter((state) => state.box === 1)).toEqual([{ box: 1, due: TODAY + 2 }]);
            expect(states.filter((state) => state.box === 2)).toHaveLength(cards.length - 1);
            expect(textIn(".flash-end p")).toBe(`Cards gone through: ${cards.length}. Needed a second look: 1.`);
            expect(missed).not.toBe("");
        });

        it("marks the lesson as secure once every card of it was known after two pauses", () =>
        {
            comeBack(1);
            click("learn-review");
            knowAll();
            click("flash-leave");
            expect(find(`#lesson-${FIRST.id} .lesson-state`).className).toBe("tag lesson-state is-read");
            comeBack(4);
            click("learn-review");
            knowAll();
            click("flash-leave");
            expect(Object.values(saved(app).learn.cards).every((state) => state.box === 3)).toBe(true);
            expect(find(`#lesson-${FIRST.id} .lesson-state`).className).toBe("tag lesson-state is-secure");
            expect(textIn(`#lesson-${FIRST.id} .lesson-state`)).toBe("Secure");
        });
    });

    describe("with progress from earlier visits", () =>
    {
        /** Every lesson finished, on the day before. */
        const allRead = Object.fromEntries(LESSONS.map((lesson) => [pageId(lesson), TODAY - 1]));

        /** Every card in a box, due on a day. */
        const allCards = (box: number, due: number): Record<string, { box: number; due: number }> => Object.fromEntries(ALL_CARDS.map((id) => [id, { box, due }]));

        it("holds a review of at most 20 cards, and offers the next round while more are due", async () =>
        {
            seed({ learn: { read: allRead, cards: allCards(1, TODAY), last: null } });
            app = await mountApp();
            await openLearn();
            expect(textOf("learn-next")).toBe(`Review ${ALL_CARDS.length} cards`);
            click("learn-next");
            expect(textIn(".flash-meta span")).toBe("20 cards to go");
            // Two cards of one lesson do not follow each other while other lessons have cards left.
            const lessonsSeen: string[] = [];
            while (document.getElementById("flash-answer-show"))
            {
                lessonsSeen.push(textIn(".flash-lesson"));
                click("flash-answer-show");
                rate("flash-known");
            }
            expect(lessonsSeen).toHaveLength(20);
            expect(lessonsSeen.some((lesson, index) => index > 0 && lesson === lessonsSeen[index - 1])).toBe(false);
            expect(textIn(".flash-end .hint")).toBe(`${ALL_CARDS.length - 20} more cards are due today.`);
            expect(textOf("flash-more")).toBe("Next round");
            expect(find("#flash-leave").className).toBe("secondary");
            click("flash-more");
            // The next round goes on in the same dialog, with the keyboard on the new card.
            expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
            expect(textIn(".flash-meta span")).toBe("20 cards to go");
            expect(document.activeElement?.id).toBe("flash-answer-show");
            find(".modal-close").click();
            expect(widget()["Cards due today"]).toBe(String(ALL_CARDS.length - 20));
        });

        it("suggests the weak questions when every lesson is finished, and leads to a round of them", async () =>
        {
            seed({ learn: { read: allRead, cards: allCards(2, TODAY + 3), last: null }, records: { "5": { right: 0, wrong: 1, lastWrong: true }, "9": { right: 0, wrong: 2, lastWrong: true } } });
            app = await mountApp();
            await openLearn();
            expect(textOf("learn-next")).toBe("Practise 2 weak questions");
            expect(textIn(".learn-next .hint")).toBe("Every lesson is finished. These questions were wrong the last time.");
            expect(document.querySelectorAll(".lesson-weak")).toHaveLength(2);
            expect(textIn(".lesson-weak")).toBe("1 weak question");
            click("learn-next");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-practice");
            expect(slots()).toHaveLength(2);
        });

        it("suggests a practice exam when every lesson is finished and no question is weak", async () =>
        {
            seed({ learn: { read: allRead, cards: allCards(2, TODAY + 3), last: null } });
            app = await mountApp();
            await openLearn();
            expect(textOf("learn-next")).toBe("Take a practice exam");
            expect(textIn(".learn-next .hint")).toBe("Every lesson is finished and no question is weak.");
            click("learn-next");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-exam");
        });

        it("says the user is ready when all three things are met, and not before", async () =>
        {
            const exams = [{ day: TODAY - 2, score: 27, total: 33 }, { day: TODAY - 1, score: 31, total: 33 }];
            seed({ learn: { read: allRead, cards: allCards(3, TODAY + 5), last: null }, exams });
            app = await mountApp();
            await openLearn();
            const rows = Array.from(document.querySelectorAll(".ready-list li"));
            expect(rows.map((row) => row.textContent)).toEqual([
                `Met:All lessons finished (${LESSONS.length} of ${LESSONS.length})`,
                "Met:100% of the flash cards are in box 3 or higher (80% needed)",
                "Met:2 of 2 practice exams with 25 or more of 33 right answers, on different days",
            ]);
            expect(rows.every((row) => row.classList.contains("is-met"))).toBe(true);
            expect(textIn(".ready-verdict")).toBe("All three are met. You are ready for the test.");
            expect(find(".ready-verdict").className).toBe("ready-verdict ok");
            expect(boxes()).toEqual(["0", "0", String(ALL_CARDS.length), "0", "0"]);
            expect(document.querySelectorAll(".lesson-state.is-secure")).toHaveLength(LESSONS.length);
        });

        it("is not ready with two good exams on one day", async () =>
        {
            const exams = [{ day: TODAY - 1, score: 27, total: 33 }, { day: TODAY - 1, score: 31, total: 33 }];
            seed({ learn: { read: allRead, cards: allCards(3, TODAY + 5), last: null }, exams });
            app = await mountApp();
            await openLearn();
            expect(textIn(".ready-list li:last-child")).toBe("Not yet:1 of 2 practice exams with 25 or more of 33 right answers, on different days");
            expect(textIn(".ready-verdict")).toBe("The pass mark is 17 of 33. You do not have to be perfect.");
        });

        it("forgets lessons, cards and exams when the progress is erased, and goes back to the list", async () =>
        {
            seed({ learn: { read: allRead, cards: allCards(3, TODAY + 5), last: FIRST.id }, exams: [{ day: TODAY, score: 30, total: 33 }] });
            app = await mountApp();
            await openLearn();
            click(`lesson-${FIRST.id}`);
            click("reset-progress");
            click("reset-progress");
            expect(find(".stage").className).toBe("stage learn learn-home");
            expect(saved(app).learn).toEqual({ read: {}, seen: {}, cards: {}, last: null });
            expect(saved(app).exams).toEqual([]);
            expect(document.querySelectorAll(".lesson-state.is-new")).toHaveLength(LESSONS.length);
            expect(textOf("learn-next")).toBe(`Start: ${titleOf(FIRST)}`);
        });
    });

    describe("the timeline", () =>
    {
        beforeEach(async () =>
        {
            await openLearn();
            click("learn-timeline");
        });

        it("shows every event of the course in the order of time, with a key to the five eras", () =>
        {
            expect(find(".stage").className).toBe("stage learn learn-timeline");
            expect(textIn(".learn-crumb")).toBe("Timeline");
            expect(document.querySelectorAll(".era-legend li")).toHaveLength(course.eras.length);
            const rows = Array.from(document.querySelectorAll(".chrono-row"));
            expect(rows).toHaveLength(course.events.length);
            const years = rows.map((row) => Number(course.events.find((event) => `timeline-${event.id}` === row.id)?.date.slice(0, 4)));
            expect(years).toEqual([...years].sort((first, second) => first - second));
            expect(document.querySelectorAll(".chrono-era")).toHaveLength(4);
        });

        it("covers the dates for a self-test, uncovers them one by one, and shows them all again", () =>
        {
            const first = course.events.find((event) => event.era === "ns") as CourseFile["events"][number];
            expect(find("#timeline-cover").getAttribute("aria-pressed")).toBe("false");
            click("timeline-cover");
            expect(find("#timeline-cover").getAttribute("aria-pressed")).toBe("true");
            expect(document.querySelectorAll(".chrono-show")).toHaveLength(course.events.length);
            // Both hints are in the page, so the hint keeps its height; the one that applies is the one that is shown and read.
            expect(textIn(".chrono-box .hint .swap:not(.is-off)")).toBe("Say the date, then tap the question mark.");
            expect(find(".chrono-box .hint .swap.is-off").getAttribute("aria-hidden")).toBe("true");
            click(`timeline-show-${first.id}`);
            expect(document.querySelectorAll(".chrono-show")).toHaveLength(course.events.length - 1);
            expect(find(`#timeline-${first.id} .chrono-date`).className).toBe("chrono-date");
            expect(document.activeElement?.id).toBe(`timeline-${first.id}`);
            click("timeline-cover");
            expect(document.querySelector(".chrono-show")).toBeNull();
            // Covering again starts the test over.
            click("timeline-cover");
            expect(document.querySelectorAll(".chrono-show")).toHaveLength(course.events.length);
            click("learn-back");
            expect(find(".stage").className).toBe("stage learn learn-home");
        });

        it("appears as an excerpt in the lessons about dates, and each lesson remembers its own cover", () =>
        {
            const withTimeline = LESSONS.filter((lesson) => lesson.blocks.some((block) => block.type === "timeline"));
            expect(withTimeline.length).toBeGreaterThan(3);
            const [one, two] = withTimeline;
            const block = (lesson: LessonSpec): { id: string; events: string[] } => lesson.blocks.find((entry) => entry.type === "timeline") as { id: string; events: string[] };
            click("learn-back");
            click(`lesson-${one.id}`);
            expect(document.querySelectorAll(`#tl-${block(one).id} .chrono-row`)).toHaveLength(block(one).events.length);
            click(`tl-${block(one).id}-cover`);
            expect(document.querySelectorAll(`#tl-${block(one).id} .chrono-show`)).toHaveLength(block(one).events.length);
            click("learn-back");
            click(`lesson-${two.id}`);
            // The other lesson has a timeline with the same id on the page, and its dates are not covered.
            expect(block(two).id).toBe(block(one).id);
            expect(document.querySelector(`#tl-${block(two).id} .chrono-show`)).toBeNull();
            click("learn-back");
            click(`lesson-${one.id}`);
            expect(document.querySelectorAll(`#tl-${block(one).id} .chrono-show`)).toHaveLength(block(one).events.length);
        });
    });

    describe("the maps", () =>
    {
        beforeEach(async () =>
        {
            await openLearn();
            click("learn-maps");
        });

        it("are five: the states, the former GDR, the zones, the neighbours and the places of the European Parliament", () =>
        {
            expect(find(".stage").className).toBe("stage learn learn-maps");
            expect(Array.from(document.querySelectorAll(".atlas-map .map-figure")).map((map) => map.id)).toEqual(["atlas-states", "atlas-east", "atlas-zones", "atlas-neighbours", "atlas-parliament"]);
            expect(Array.from(document.querySelectorAll(".atlas-map h3")).map((heading) => heading.textContent)).toEqual([
                "The 16 federal states and their capitals", "The states of the former GDR", "The four occupation zones, 1945 to 1949", "Germany and its nine neighbours", "Where the European Parliament works",
            ]);
            expect(document.querySelectorAll("#atlas-states .map-entry")).toHaveLength(16);
            expect(document.querySelectorAll("#atlas-neighbours .map-entry")).toHaveLength(9);
            expect(document.querySelectorAll("#atlas-parliament .map-entry")).toHaveLength(3);
            // The names of the states come in German and in the language of the site.
            expect(textIn("#atlas-states-entry-bayern .map-term")).toBe("Bayern");
            expect(textIn("#atlas-states-entry-bayern .map-text")).toBe("Bavaria");
            expect(textIn("#atlas-neighbours-entry-at .map-text")).toBe("Austria");
        });

        it("show where an entry is when its line is picked, and let go of it when it is picked again", () =>
        {
            find("#atlas-states-entry-hessen").focus();
            click("atlas-states-entry-hessen");
            expect(find("#atlas-states-entry-hessen").getAttribute("aria-pressed")).toBe("true");
            expect(document.querySelectorAll("#atlas-states path.region.is-picked")).toHaveLength(1);
            // The line that was pressed keeps the focus, so the next line is one Tab away.
            expect(document.activeElement?.id).toBe("atlas-states-entry-hessen");
            // The other maps are not touched.
            expect(document.querySelector("#atlas-east .is-picked")).toBeNull();
            click("atlas-states-entry-hessen");
            expect(document.querySelector("#atlas-states .is-picked")).toBeNull();
            click("atlas-states-entry-hessen");
            click("atlas-states-entry-bayern");
            expect(document.querySelectorAll("#atlas-states .map-entry.is-picked")).toHaveLength(1);
            expect(find("#atlas-states-entry-bayern").className).toBe("map-entry is-picked");
        });

        it("cover the names for a self-test: a line uncovers its name and shows its place, and stays uncovered", () =>
        {
            click("atlas-neighbours-cover");
            expect(document.querySelectorAll("#atlas-neighbours .map-hidden:not(.is-off)")).toHaveLength(9);
            expect(document.querySelector("#atlas-states .map-hidden:not(.is-off)")).toBeNull();
            click("atlas-neighbours-entry-pl");
            expect(document.querySelectorAll("#atlas-neighbours .map-hidden:not(.is-off)")).toHaveLength(8);
            expect(find("#atlas-neighbours-entry-pl .map-name-text").className).toBe("map-name-text");
            expect(document.querySelectorAll("#atlas-neighbours path.region.is-picked")).toHaveLength(1);
            // A second press does not cover the name again while the test runs.
            click("atlas-neighbours-entry-pl");
            expect(find("#atlas-neighbours-entry-pl").getAttribute("aria-pressed")).toBe("true");
            expect(document.querySelectorAll("#atlas-neighbours .map-hidden:not(.is-off)")).toHaveLength(8);
            click("atlas-neighbours-cover");
            expect(document.querySelector("#atlas-neighbours .map-hidden:not(.is-off)")).toBeNull();
            expect(document.querySelector("#atlas-neighbours .is-picked")).toBeNull();
        });

        it("appear in the lessons that talk about places", () =>
        {
            const withMap = LESSONS.filter((lesson) => lesson.template === undefined && lesson.blocks.some((block) => block.type === "map"));
            expect(withMap.length).toBeGreaterThan(3);
            click("learn-back");
            for (const lesson of withMap)
            {
                click(`lesson-${lesson.id}`);
                const maps = lesson.blocks.filter((block) => block.type === "map");
                expect(document.querySelectorAll(".lesson-map svg.map"), lesson.id).toHaveLength(maps.length);
                expect(document.querySelector(`#map-${maps[0].id}`), lesson.id).not.toBeNull();
                expect(document.querySelector(".lesson-map figcaption")?.textContent, lesson.id).not.toBe("");
                click("learn-back");
            }
        });
    });

    describe("marking a lesson as done", () =>
    {
        const questions = unitsOf(FIRST).flatMap((unit) => unit.questions ?? []).length;

        /** The tick of a lesson, at the end of the lesson or in the list. */
        const tick = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;

        beforeEach(async () =>
        {
            await openLearn();
        });

        it("has a tick at the end of every lesson that the user sets and takes back", () =>
        {
            click(`lesson-${FIRST.id}`);
            expect(tick("lesson-done").type).toBe("checkbox");
            expect(tick("lesson-done").checked).toBe(false);
            expect(textIn(".lesson-done .done-label")).toBe("I am done with this lesson");
            expect(textIn(".lesson-done .hint")).toBe("The tick is set by itself when you finish the check. You can set it yourself or take it back at any time.");
            tick("lesson-done").focus();
            tick("lesson-done").click();
            expect(tick("lesson-done").checked).toBe(true);
            expect(document.activeElement?.id).toBe("lesson-done");
            expect(textIn(".lesson-head .lesson-state")).toBe("Done");
            expect(saved(app).learn.read).toEqual({ [FIRST.id]: TODAY });
            // Its cards go into the first box, as they do when the check is finished: what the user says they know is asked again tomorrow.
            expect(saved(app).learn.cards).toEqual(Object.fromEntries(cardsOf(FIRST).map((id) => [id, { box: 1, due: TODAY + 1 }])));
            tick("lesson-done").click();
            expect(tick("lesson-done").checked).toBe(false);
            expect(textIn(".lesson-head .lesson-state")).toBe("New");
            expect(saved(app).learn.read).toEqual({});
            // The cards stay where they are.
            expect(Object.keys(saved(app).learn.cards)).toHaveLength(cardsOf(FIRST).length);
        });

        it("has the same tick next to every lesson of the list, which marks the lesson without opening it", () =>
        {
            const ticks = Array.from(document.querySelectorAll<HTMLInputElement>(".lesson-item .done-box"));
            expect(ticks).toHaveLength(LESSONS.length);
            expect(ticks.every((box) => !box.checked)).toBe(true);
            expect(tick(`done-${FIRST.id}`).getAttribute("aria-label")).toBe(`Done: ${titleOf(FIRST)}`);
            // The tick stands next to the link of the lesson, not inside it.
            expect(tick(`done-${FIRST.id}`).closest("a")).toBeNull();
            expect(find(`#lesson-${FIRST.id}`).closest("li")).toBe(tick(`done-${FIRST.id}`).closest("li"));
            const address = window.location.href;
            tick(`done-${FIRST.id}`).click();
            expect(find(".stage").className).toBe("stage learn learn-home");
            expect(window.location.href).toBe(address);
            expect(tick(`done-${FIRST.id}`).checked).toBe(true);
            expect(textIn(`#lesson-${FIRST.id} .lesson-state`)).toBe("Done");
            expect(textIn(".learn-coverage")).toBe(`1 of ${LESSONS.length} lessons finished. They prepare you for ${questions} of your 310 questions.`);
            expect(widget().Lessons).toBe(`1 of ${LESSONS.length}`);
            // The next step moves on: a lesson that is ticked off is not offered again.
            expect(textOf("learn-next")).toBe(`Start: ${titleOf(SECOND)}`);
            tick(`done-${FIRST.id}`).click();
            expect(tick(`done-${FIRST.id}`).checked).toBe(false);
            expect(textOf("learn-next")).toBe(`Start: ${titleOf(FIRST)}`);
        });

        it("gives every lesson of the list one tag for how it stands, so a row keeps its height when it is ticked", () =>
        {
            expect(document.querySelectorAll(".lesson-row .lesson-state")).toHaveLength(LESSONS.length);
            tick(`done-${FIRST.id}`).click();
            expect(document.querySelectorAll(".lesson-row .lesson-state")).toHaveLength(LESSONS.length);
            expect(document.querySelectorAll(`#lesson-${FIRST.id} .lesson-state`)).toHaveLength(1);
        });

        it("lets the user take back a tick that the check has set, and the result of the check stays", () =>
        {
            click(`lesson-${FIRST.id}`);
            finishCheck(FIRST);
            expect(tick("lesson-done").checked).toBe(true);
            tick("lesson-done").click();
            expect(tick("lesson-done").checked).toBe(false);
            expect(saved(app).learn.read).toEqual({});
            expect(textIn(".check-result")).toBe(`${checkOf(FIRST).length} of ${checkOf(FIRST).length} right.`);
            click("learn-back");
            expect(tick(`done-${FIRST.id}`).checked).toBe(false);
        });

        it("shows a lesson that was ticked in the list as done when it is opened", () =>
        {
            tick(`done-${SECOND.id}`).click();
            click(`lesson-${SECOND.id}`);
            expect(tick("lesson-done").checked).toBe(true);
            expect(textIn(".lesson-head .lesson-state")).toBe("Done");
        });
    });

    describe("where the user was", () =>
    {
        /** How far the window of the test is scrolled, and how high it is. */
        let position = 0;
        const HEIGHT = 800;

        /** The distance between two sections of the lesson the test lays out, and where the first one starts. */
        const STEP = 1000;
        const FIRST_TOP = 500;

        /** Every section of the lesson that is open, in reading order: the guess, the blocks, the cards and the check. */
        const sections = (): string[] => Array.from(document.querySelectorAll<HTMLElement>(".learn-lesson [data-anchor]")).map((section) => section.dataset.anchor as string);

        /** Where a section of the lesson starts on the page of the test. */
        const topOf = (name: string): number => FIRST_TOP + sections().indexOf(name) * STEP;

        /**
         * Gives the page a window: a height, a place it is scrolled to, and a place on the page for every section of a
         * lesson, one below the other, with the end of the lesson after the last. The DOM of a test has no layout of its own.
         */
        function layOut(): void
        {
            position = 0;
            Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, get: () => HEIGHT });
            Object.defineProperty(document.documentElement, "scrollTop", { configurable: true, get: () => position, set: (value: number) =>
            {
                position = value;
            } });
            Object.defineProperty(window, "scrollY", { configurable: true, get: () => position });
            vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function place(this: HTMLElement): DOMRect
            {
                const name = this.dataset.anchor;
                const all = sections();
                const top = (name !== undefined && all.includes(name) ? topOf(name) : (this.classList.contains("lesson-end") ? FIRST_TOP + all.length * STEP : 0)) - position;
                return { top, bottom: top + STEP, left: 0, right: 0, width: 0, height: STEP, x: 0, y: top, toJSON: () => ({}) };
            });
        }

        /** Scrolls the window of the test, as the user does. */
        function scrollTo(y: number): void
        {
            position = y;
            window.dispatchEvent(new Event("scroll"));
        }

        /** The sections a call to scrollIntoView went to, by their name or id. */
        function watchJumps(): string[]
        {
            const jumps: string[] = [];
            Element.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement): void
            {
                jumps.push(this.dataset.anchor ?? this.id);
            };
            return jumps;
        }

        afterEach(() =>
        {
            for (const [owner, name] of [[document.documentElement, "clientHeight"], [document.documentElement, "scrollTop"], [window, "scrollY"], [Element.prototype, "scrollIntoView"]] as [object, string][])
            {
                delete (owner as Record<string, unknown>)[name];
            }
        });

        it("notes how far a lesson was read: the furthest section that reached the top of the window, and the share of its length that has come into view", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            const all = sections();
            expect(all).toEqual(["guess", ...FIRST.blocks.map((block) => block.id), "cards", "check"]);
            // The share of the length of the lesson, from its first section to its end, that lies above a line at 80% of the window.
            const share = (scrolled: number): number => Math.floor(((HEIGHT * 0.8 - (FIRST_TOP - scrolled)) / (all.length * STEP)) * 100);
            // At the top: the first section is in view, none has reached the top of the window.
            scrollTo(0);
            expect(saved(app).learn.seen).toEqual({ [FIRST.id]: { at: "", percent: share(0) } });
            // Scrolled so that the third section is just below the top edge: reading is there.
            scrollTo(topOf(all[2]) - 100);
            expect(saved(app).learn.seen[FIRST.id]).toEqual({ at: all[2], percent: share(topOf(all[2]) - 100) });
            // Back up, as on the way to the list at the top of the page: neither the place nor the share goes back.
            scrollTo(topOf(all[1]) - 100);
            expect(saved(app).learn.seen[FIRST.id]).toEqual({ at: all[2], percent: share(topOf(all[2]) - 100) });
            scrollTo(0);
            expect(saved(app).learn.seen[FIRST.id]).toEqual({ at: all[2], percent: share(topOf(all[2]) - 100) });
            // Further down the place moves on again.
            scrollTo(topOf(all[4]));
            const furthest = share(topOf(all[4]));
            expect(saved(app).learn.seen[FIRST.id]).toEqual({ at: all[4], percent: furthest });
            scrollTo(0);
            // Reading is no proof of knowing: the lesson is not done.
            expect(saved(app).learn.read).toEqual({});
            click("learn-back");
            expect(textIn(`#lesson-${FIRST.id} .lesson-state`)).toBe(`${furthest}% read`);
            expect(find(`#lesson-${FIRST.id} .lesson-state`).className).toBe("tag lesson-state is-started");
            expect((document.getElementById(`done-${FIRST.id}`) as HTMLInputElement).checked).toBe(false);
        });

        it("counts a lesson as read in full only when its end was in view, and still does not tick it", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            const all = sections();
            scrollTo(topOf("check"));
            // The check is the last section: what of it lies above the line at 80% of the window counts, not the whole of it.
            const length = all.length * STEP;
            expect(saved(app).learn.seen[FIRST.id]).toEqual({ at: "check", percent: Math.floor(((HEIGHT * 0.8 - FIRST_TOP + topOf("check")) / length) * 100) });
            expect(saved(app).learn.seen[FIRST.id].percent).toBeLessThan(100);
            scrollTo(topOf("check") + STEP - HEIGHT + 1);
            expect(saved(app).learn.seen[FIRST.id].percent).toBe(100);
            expect(saved(app).learn.read).toEqual({});
            expect(textIn(".lesson-head .lesson-state")).toBe("New");
            click("learn-back");
            expect(textIn(`#lesson-${FIRST.id} .lesson-state`)).toBe("100% read");
        });

        it("leads back to the list where the user left it, with the focus on the lesson that was open", async () =>
        {
            await openLearn();
            layOut();
            const jumps = watchJumps();
            scrollTo(1200);
            click(`lesson-${SECOND.id}`);
            // A lesson that was never opened starts at its top.
            expect(jumps).toEqual(["view"]);
            expect(document.activeElement).toBe(find(".lesson-head h2"));
            scrollTo(300);
            click("learn-back");
            expect(position).toBe(1200);
            expect(document.activeElement?.id).toBe(`lesson-${SECOND.id}`);
            expect(jumps).toEqual(["view"]);
        });

        it("opens a lesson from the list where reading stopped, although the user scrolled back up to get to the list", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            const jumps = watchJumps();
            const reached = sections()[2];
            scrollTo(topOf(reached) + 300);
            // The way back to the list is at the top of the lesson.
            scrollTo(0);
            click("learn-back");
            expect(position).toBe(0);
            click(`lesson-${FIRST.id}`);
            expect(jumps).toEqual([reached]);
            expect((document.activeElement as HTMLElement).dataset.anchor).toBe(reached);
            // The button for the next step leads to the same place.
            click("learn-back");
            expect(textOf("learn-next")).toBe(`Go on: ${titleOf(FIRST)}`);
            click("learn-next");
            expect(jumps).toEqual([reached, reached]);
        });

        it("puts a lesson where the window was when the Back button of the browser leads to it, and the timeline and the maps always", async () =>
        {
            const browserGoesTo = (address: string): void =>
            {
                window.history.replaceState(null, "", address);
                window.dispatchEvent(new PopStateEvent("popstate"));
            };
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            const jumps = watchJumps();
            scrollTo(4300);
            // Back up a little, to read something again, and then back in the browser: no way back at the top of the page was needed.
            scrollTo(2300);
            browserGoesTo("#learn");
            expect(find(".stage").className).toBe("stage learn learn-home");
            browserGoesTo(`#learn/${FIRST.id}`);
            expect(position).toBe(2300);
            expect(jumps).toEqual([]);
            expect(document.activeElement).toBe(find(".lesson-head h2"));
            // The timeline and the maps have no reading to go on with: they open where the window was.
            click("learn-back");
            click("learn-timeline");
            scrollTo(640);
            click("learn-back");
            click("learn-timeline");
            expect(position).toBe(640);
        });

        it("goes on at the section reading stopped at when a lesson is opened by its link on another day, without a section in the link", async () =>
        {
            const section = FIRST.blocks[2].id;
            seed({ learn: { read: {}, seen: { [FIRST.id]: { at: section, percent: 35 } }, cards: {}, last: FIRST.id } });
            const jumps = watchJumps();
            app = await mountApp(undefined, { place: `#learn/${FIRST.id}` });
            await settle();
            expect(jumps).toEqual([section]);
        });

        it("moves the reading place on from a section the lesson no longer has", async () =>
        {
            seed({ learn: { read: {}, seen: { [FIRST.id]: { at: "gone", percent: 40 } }, cards: {}, last: FIRST.id } });
            app = await mountApp();
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            scrollTo(0);
            expect(saved(app).learn.seen[FIRST.id].at).toBe("");
            scrollTo(topOf(sections()[1]));
            expect(saved(app).learn.seen[FIRST.id]).toEqual({ at: sections()[1], percent: 40 });
        });

        it("goes on reading at the section it stopped at when the page is opened another day", async () =>
        {
            const section = FIRST.blocks[2].id;
            seed({ learn: { read: {}, seen: { [FIRST.id]: { at: section, percent: 35 } }, cards: {}, last: FIRST.id } });
            app = await mountApp();
            await openLearn();
            const jumps = watchJumps();
            expect(textOf("learn-next")).toBe(`Go on: ${titleOf(FIRST)}`);
            click("learn-next");
            expect(jumps).toEqual([section]);
            expect((document.activeElement as HTMLElement).dataset.anchor).toBe(section);
        });

        it.each([
            ["was read to its end", { at: "check", percent: 100 }],
            ["was left at its top", { at: "", percent: 12 }],
            ["has no such section any more", { at: "gone", percent: 40 }],
        ])("starts a lesson at its top when it %s", async (_, seen) =>
        {
            seed({ learn: { read: {}, seen: { [FIRST.id]: seen }, cards: {}, last: null } });
            app = await mountApp();
            await openLearn();
            const jumps = watchJumps();
            click(`lesson-${FIRST.id}`);
            expect(jumps).toEqual(["view"]);
            expect(document.activeElement).toBe(find(".lesson-head h2"));
        });

        it("starts the lesson before and the lesson after at the top, also when they were open before", async () =>
        {
            await openLearn();
            click(`lesson-${SECOND.id}`);
            layOut();
            const jumps = watchJumps();
            scrollTo(1700);
            click("lesson-previous");
            scrollTo(900);
            click("lesson-next");
            expect(jumps).toEqual(["view", "view"]);
            expect(textIn(".lesson-head h2")).toBe(titleOf(SECOND));
        });

        it("comes back from a round of practice to where the lesson was left, at the button that led away", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            scrollTo(3100);
            click("lesson-practise");
            // Practice scrolls on its own; the Learn tab does not take that for its own place.
            scrollTo(50);
            click("exit-lesson");
            expect(position).toBe(3100);
            expect(document.activeElement?.id).toBe("lesson-practise");
        });

        it("goes to the top of the list when the tab that is open is pressed again, and keeps the focus on the tab", async () =>
        {
            await openLearn();
            layOut();
            scrollTo(1500);
            click(`lesson-${FIRST.id}`);
            scrollTo(700);
            find("#tab-learn").focus();
            click("tab-learn");
            expect(find(".stage").className).toBe("stage learn learn-home");
            expect(position).toBe(0);
            expect(document.activeElement?.id).toBe("tab-learn");
        });

        it("keeps the place when the site changes its language, and leaves the focus on the list of languages", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            scrollTo(2600);
            const before = saved(app).learn.seen[FIRST.id];
            (document.getElementById("site-language-button") as HTMLButtonElement).click();
            (document.querySelector("#site-language-list [data-value=\"de\"]") as HTMLElement).click();
            // While the course in the other language is on its way the page is short, and the browser scrolls it up.
            for (let turn = 0; turn < 20 && !document.querySelector(".learn-wait"); turn++)
            {
                await Promise.resolve();
            }
            expect(document.querySelector(".learn-wait")).not.toBeNull();
            scrollTo(0);
            await settle();
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST, german));
            expect(position).toBe(2600);
            expect(document.activeElement?.id).toBe("site-language-button");
            expect(saved(app).learn.seen[FIRST.id]).toEqual(before);
        });

        it("notes where the window was in the step of the history, and puts a lesson there again after the page was loaded anew", async () =>
        {
            vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
            await openLearn();
            click(`lesson-${FIRST.id}`);
            layOut();
            scrollTo(2300);
            // Noted once the scrolling rests.
            vi.advanceTimersByTime(299);
            expect((window.history.state as { y?: number }).y).toBeUndefined();
            vi.advanceTimersByTime(1);
            const kept = window.history.state as { step: number; y: number };
            expect(kept.y).toBe(2300);
            // The page is loaded anew on that step, as after a reload or the way back past another site.
            vi.useRealTimers();
            app = await mountApp(undefined, { place: `#learn/${FIRST.id}`, historyState: kept });
            layOut();
            await settle();
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
            expect(position).toBe(2300);
            // The step keeps its place. (Its number is not compared: pages of earlier tests still have timers that write theirs.)
            expect((window.history.state as { y: number }).y).toBe(2300);
        });

        it("takes no note of scrolling in another tab, under a dialog, or where nothing has a size", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            // No layout yet: nothing can be measured, so nothing is noted.
            window.dispatchEvent(new Event("scroll"));
            expect(saved(app).learn.seen).toEqual({});
            layOut();
            click("lesson-cards");
            scrollTo(4000);
            expect(saved(app).learn.seen).toEqual({});
            find(".modal-close").click();
            click("tab-practice");
            scrollTo(4000);
            expect(saved(app).learn.seen).toEqual({});
            click("tab-learn");
            scrollTo(topOf("cards"));
            expect(saved(app).learn.seen[FIRST.id].at).toBe("cards");
        });
    });

    describe("addresses", () =>
    {
        /** The address of a place of the tab, as the page shows it in the bar. */
        const hash = (): string => window.location.hash;

        /** Goes to an address the way the Back and Forward buttons of the browser do: the address changes, then the page is told. */
        function browserGoesTo(address: string, state: unknown = null): void
        {
            window.history.replaceState(state, "", address);
            window.dispatchEvent(new PopStateEvent("popstate"));
            window.dispatchEvent(new HashChangeEvent("hashchange"));
        }

        it("gives every page of the tab an address of its own, and opens the tab again on the page that was open", async () =>
        {
            expect(hash()).toBe("");
            await openLearn();
            expect(hash()).toBe("#learn");
            click(`lesson-${FIRST.id}`);
            expect(hash()).toBe(`#learn/${FIRST.id}`);
            click("lesson-next");
            expect(hash()).toBe(`#learn/${SECOND.id}`);
            click("learn-back");
            expect(hash()).toBe("#learn");
            click("learn-timeline");
            expect(hash()).toBe("#learn/timeline");
            click("learn-back");
            click("learn-maps");
            expect(hash()).toBe("#learn/maps");
            click("tab-train");
            expect(hash()).toBe("#train");
            expect(window.location.search).toBe("");
            click("tab-learn");
            expect(hash()).toBe("#learn/maps");
        });

        it("names the page in the title of the browser: the lesson, the timeline or the maps, and the tab for the list", async () =>
        {
            click("tab-learn");
            // While the course is on its way the tab is all there is to name.
            expect(document.title).toBe("Learn | LiD Practice");
            await settle();
            expect(document.title).toBe("Learn | LiD Practice");
            click(`lesson-${FIRST.id}`);
            expect(document.title).toBe(`${titleOf(FIRST)} | LiD Practice`);
            click("lesson-next");
            expect(document.title).toBe(`${titleOf(SECOND)} | LiD Practice`);
            click("learn-back");
            expect(document.title).toBe("Learn | LiD Practice");
            click("learn-timeline");
            expect(document.title).toBe("Timeline: 1933 to today | LiD Practice");
            click("learn-back");
            click("learn-maps");
            expect(document.title).toBe("Maps | LiD Practice");
        });

        it("names a lesson that is opened by its link once the course is there, in the language of the site", async () =>
        {
            app = await mountApp(undefined, { place: `#learn/${SECOND.id}/check` });
            expect(document.title).toBe("Learn | LiD Practice");
            await settle();
            expect(document.title).toBe(`${titleOf(SECOND)} | LiD Practice`);
            await chooseFromListbox("site-language", "de");
            expect(document.title).toBe(`${titleOf(SECOND, german)} | LiD Practice`);
            expect(titleOf(SECOND, german)).not.toBe(titleOf(SECOND));
            app = await mountApp(undefined, { place: "#learn/land-bayern" });
            await settle();
            expect(document.title).toBe("Your state: Berlin | LiD Practice");
        });

        it("names only the tab when the course could not be fetched", async () =>
        {
            breakServer("offline");
            app = await mountApp(undefined, { place: `#learn/${SECOND.id}`, serverFault: "offline" });
            await settle();
            expect(document.querySelector(".learn-wait [role=alert]")).not.toBeNull();
            expect(document.title).toBe("Learn | LiD Practice");
        });

        it("makes every page a step the Back button of the browser takes back, and so the way to another tab", async () =>
        {
            const start = window.history.length;
            await openLearn();
            click(`lesson-${FIRST.id}`);
            expect(window.history.length).toBe(start + 2);
            click("learn-back");
            click("tab-practice");
            expect(window.history.length).toBe(start + 4);
            // A step carries its address and its number, so the page knows how far the Back button went.
            expect(window.history.state).toEqual({ step: expect.any(Number) as number });
        });

        it("links every lesson of the list with its address, and leaves a press that asks for a new tab to the browser", async () =>
        {
            await openLearn();
            const row = find(`#lesson-${FIRST.id}`) as HTMLAnchorElement;
            expect(row.tagName).toBe("A");
            expect(row.getAttribute("href")).toBe(`#learn/${FIRST.id}`);
            expect((find("#learn-back") as HTMLElement | null)).toBeNull();
            for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])
            {
                const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
                // The test has no browser to open a new tab: it only wants to know that the page left the press alone.
                row.addEventListener("click", (pressed) => pressed.preventDefault(), { once: true });
                const handled = !row.dispatchEvent(event);
                expect(handled, JSON.stringify(init)).toBe(true);
                expect(find(".stage").className, JSON.stringify(init)).toBe("stage learn learn-home");
            }
            row.click();
            expect(find(".stage").className).toBe("stage learn learn-lesson");
            expect((find("#learn-back") as HTMLAnchorElement).getAttribute("href")).toBe("#learn");
        });

        it("opens a lesson by its link, without another step in the history", async () =>
        {
            app = await mountApp(undefined, { place: `#learn/${SECOND.id}` });
            const steps = window.history.length;
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-learn");
            // The course is fetched first; then the lesson shows.
            expect(document.querySelector(".learn-wait")).not.toBeNull();
            await settle();
            expect(textIn(".lesson-head h2")).toBe(titleOf(SECOND));
            expect(hash()).toBe(`#learn/${SECOND.id}`);
            expect(window.history.length).toBe(steps);
            expect(saved(app).learn.last).toBe(SECOND.id);
            expect(document.activeElement).toBe(find(".lesson-head h2"));
        });

        it("puts a linked section in place again once the fonts have arrived, unless the reader scrolled first", async () =>
        {
            const unit = unitsOf(SECOND)[1];
            let arrive: () => void = () => undefined;
            const fonts = { ready: new Promise<void>((done) =>
            {
                arrive = done;
            }) };
            Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
            const jumps: string[] = [];
            Element.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement): void
            {
                jumps.push(this.dataset.anchor ?? this.id);
            };
            app = await mountApp(undefined, { place: `#learn/${SECOND.id}/${unit.id}` });
            await settle();
            expect(jumps).toEqual([unit.id]);
            arrive();
            await settle();
            expect(jumps).toEqual([unit.id, unit.id]);
            // A reader who scrolls before the fonts arrive keeps their place.
            fonts.ready = new Promise<void>((done) =>
            {
                arrive = done;
            });
            app = await mountApp(undefined, { place: `#learn/${SECOND.id}/${unit.id}` });
            await settle();
            window.dispatchEvent(new Event("wheel"));
            arrive();
            await settle();
            expect(jumps).toEqual([unit.id, unit.id, unit.id]);
            delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
            delete (document as unknown as Record<string, unknown>).fonts;
        });

        it("opens a section of a lesson by its link, at that section, and keeps it in the address", async () =>
        {
            const unit = unitsOf(SECOND)[1];
            const jumps: string[] = [];
            Element.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement): void
            {
                jumps.push(this.dataset.anchor ?? this.id);
            };
            app = await mountApp(undefined, { place: `#learn/${SECOND.id}/${unit.id}` });
            await settle();
            delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
            expect(textIn(".lesson-head h2")).toBe(titleOf(SECOND));
            expect(jumps).toEqual([unit.id]);
            expect(document.activeElement?.id).toBe(`unit-${unit.id}`);
            expect(hash()).toBe(`#learn/${SECOND.id}/${unit.id}`);
        });

        it.each([
            ["the check of a lesson", `#learn/${SECOND.id}/check`, `#learn/${SECOND.id}/check`, "lesson"],
            ["the timeline", "#learn/timeline", "#learn/timeline", "timeline"],
            ["the maps", "#learn/maps", "#learn/maps", "maps"],
            ["the list of lessons", "#learn", "#learn", "home"],
            ["a section the lesson does not have, which leads to the lesson", `#learn/${SECOND.id}/nothing`, `#learn/${SECOND.id}`, "lesson"],
            ["a lesson that does not exist, which leads to the list", "#learn/nothing", "#learn", "home"],
            ["something that is no place at all, which leads to the list", "#learn/A%20B/c/d", "#learn", "home"],
        ])("opens %s by its link", async (_, place, address, page) =>
        {
            app = await mountApp(undefined, { place });
            await settle();
            expect(find(".stage").className).toBe(`stage learn learn-${page}`);
            expect(hash()).toBe(address);
        });

        it("opens the lesson that was open last again when the plain address of the site is opened, where reading stopped", async () =>
        {
            const section = FIRST.blocks[2].id;
            seed({ lastPlace: `#learn/${FIRST.id}`, learn: { read: {}, seen: { [FIRST.id]: { at: section, percent: 35 } }, cards: {}, last: FIRST.id } });
            const jumps: string[] = [];
            Element.prototype.scrollIntoView = function scrollIntoView(this: HTMLElement): void
            {
                jumps.push(this.dataset.anchor ?? this.id);
            };
            app = await mountApp();
            await settle();
            delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
            expect(hash()).toBe(`#learn/${FIRST.id}`);
            expect(jumps).toEqual([section]);
            // A section of a lesson is not remembered: the place in it is the reading place.
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).lastPlace).toBe(`#learn/${FIRST.id}`);
        });

        it("takes putting the window where the user was over from the browser, which would do it before the page is drawn", async () =>
        {
            Object.defineProperty(window.history, "scrollRestoration", { configurable: true, writable: true, value: "auto" });
            app = await mountApp();
            expect(window.history.scrollRestoration).toBe("manual");
            delete (window.history as unknown as Record<string, unknown>).scrollRestoration;
        });

        it.each(["#somewhere", "#practice", "#train", "#exam", "#learning"])("fetches nothing of the course for %s, which is no address of the tab", async (place) =>
        {
            app = await mountApp(undefined, { place });
            await settle();
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).not.toBe("tab-learn");
            expect(requests.filter((address) => address.includes("teach"))).toEqual([]);
        });

        it("shows the lesson about the user's own state for a link that was made for another state, and says so", async () =>
        {
            app = await mountApp(undefined, { place: "#learn/land-bayern/wappen" });
            await settle();
            expect(textIn(".lesson-head h2")).toBe("Your state: Berlin");
            expect(textIn(".lesson-linked")).toBe("This link was made for Bavaria. You see the lesson about your own state, Berlin. You can change your state at the bottom of the page.");
            // The address of the page names no state: it is the lesson about the user's state, whichever that is.
            expect(hash()).toBe("#learn/land/wappen");
            expect(saved(app)).not.toHaveProperty("state", "bayern");
            // The note belongs to that visit by link: it is gone when the lesson is opened from the list.
            click("learn-back");
            click("lesson-land-berlin");
            expect(document.querySelector(".lesson-linked")).toBeNull();
        });

        it("writes the lesson about the user's state with one address whatever the state is, and opens that lesson by it", async () =>
        {
            app = await mountApp(undefined, { place: "#learn/land/wappen" });
            await settle();
            expect(textIn(".lesson-head h2")).toBe("Your state: Berlin");
            expect(document.querySelector(".lesson-linked")).toBeNull();
            expect(hash()).toBe("#learn/land/wappen");
            seed({ state: "bayern" });
            app = await mountApp(undefined, { place: "#learn/land" });
            await settle();
            expect(textIn(".lesson-head h2")).toBe("Your state: Bavaria");
            expect(document.querySelector(".lesson-linked")).toBeNull();
            expect(hash()).toBe("#learn/land");
            // Nothing the page writes names the state: the address, the links of the list, the way back from a question.
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).lastPlace).toBe("#learn/land");
            click("learn-back");
            expect(find("#lesson-land-bayern").getAttribute("href")).toBe("#learn/land");
            expect(Array.from(document.querySelectorAll("a[href^='#']")).map((link) => link.getAttribute("href")).filter((href) => href?.includes("bayern"))).toEqual([]);
        });

        it("has no such note for a link to the user's own state, and leads to the list for a state that does not exist", async () =>
        {
            app = await mountApp(undefined, { place: "#learn/land-berlin" });
            await settle();
            expect(textIn(".lesson-head h2")).toBe("Your state: Berlin");
            expect(document.querySelector(".lesson-linked")).toBeNull();
            app = await mountApp(undefined, { place: "#learn/land-atlantis" });
            await settle();
            expect(find(".stage").className).toBe("stage learn learn-home");
            expect(hash()).toBe("#learn");
        });

        it("offers the state of the link in the welcome dialog to a visitor who comes by that link for the first time", async () =>
        {
            window.localStorage.clear();
            app = await mountApp(undefined, { place: "#learn/land-bayern", firstVisit: true });
            await settle();
            expect(document.querySelector("[role=dialog]")).not.toBeNull();
            expect(textOf("setup-state-button")).toContain("Bavaria");
            clickButton("Let’s go");
            expect(textIn(".lesson-head h2")).toBe("Your state: Bavaria");
            expect(document.querySelector(".lesson-linked")).toBeNull();
            expect(hash()).toBe("#learn/land");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).state).toBe("bayern");
        });

        it("keeps the state of a visitor who was here before, whatever state a link names", async () =>
        {
            seed({ state: "hessen" });
            app = await mountApp(undefined, { place: "#learn/land-bayern" });
            await settle();
            expect(textIn(".lesson-head h2")).toBe("Your state: Hesse");
            expect(hash()).toBe("#learn/land");
        });

        it("follows the Back and Forward buttons of the browser, and tells one step from the two events it fires", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            const opened = vi.spyOn(app.Store.prototype, "openLesson");
            browserGoesTo("#learn");
            expect(find(".stage").className).toBe("stage learn learn-home");
            browserGoesTo(`#learn/${SECOND.id}`);
            expect(textIn(".lesson-head h2")).toBe(titleOf(SECOND));
            // One step, two events, one lesson opened.
            expect(opened).toHaveBeenCalledTimes(1);
            browserGoesTo("#learn/timeline");
            expect(find(".stage").className).toBe("stage learn learn-timeline");
        });

        it("goes back from the tab to the tab the address names, and to practice when the address names none", async () =>
        {
            await openLearn();
            click(`lesson-${FIRST.id}`);
            browserGoesTo("#train");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-train");
            // The way forward leads to the lesson again, not to the list.
            browserGoesTo(`#learn/${FIRST.id}`);
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-learn");
            expect(textIn(".lesson-head h2")).toBe(titleOf(FIRST));
            browserGoesTo(window.location.pathname);
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-practice");
            expect(hash()).toBe("");
            // What a step of the browser carries besides its address says nothing: only the address does.
            browserGoesTo("#learn", { mode: "train" });
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-learn");
            expect(find(".stage").className).toBe("stage learn learn-home");
        });

        it("does not leave a running exam by the Back button: the exam stays, and the address is put back", async () =>
        {
            await openLearn();
            startExam();
            optionButtons()[0].click();
            browserGoesTo("#learn");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-exam");
            expect(document.querySelector(".exam-progress")).not.toBeNull();
            expect(hash()).toBe("#exam");
        });

        it("leaves the welcome dialog open when the address changes under it", async () =>
        {
            window.localStorage.clear();
            app = await mountApp(undefined, { firstVisit: true });
            browserGoesTo("#learn");
            await settle();
            expect(document.querySelector("[role=dialog]")).not.toBeNull();
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-learn");
        });

        it("puts the address right when the page changes by itself: after a reset, a change of state, and the way from a lesson to practice and back", async () =>
        {
            await openLearn();
            click("lesson-land-berlin");
            await settle();
            expect(hash()).toBe("#learn/land");
            await chooseFromListbox("state", "sachsen");
            expect(textIn(".lesson-head h2")).toBe("Your state: Saxony");
            expect(hash()).toBe("#learn/land");
            click("reset-progress");
            click("reset-progress");
            expect(hash()).toBe("#learn");
            const lesson = FIRST;
            click(`lesson-${lesson.id}`);
            expect(hash()).toBe(`#learn/${lesson.id}`);
            // The round of practice over the questions of a lesson is in the practice tab, and the way back leads to the lesson.
            click("lesson-practise");
            expect(hash()).toBe("#practice");
            click("exit-lesson");
            expect(hash()).toBe(`#learn/${lesson.id}`);
        });
    });

    describe("passing a link on", () =>
    {
        /** What the clipboard of the test was given. */
        let copied: string[] = [];

        /** The address of the page without its place, as a link starts. */
        const base = (): string => `${window.location.origin}${window.location.pathname}`;

        /** Gives the browser of the test a clipboard. */
        function giveClipboard(works = true): void
        {
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                    writeText: async (text: string): Promise<void> =>
                    {
                        if (!works)
                        {
                            return Promise.reject(new DOMException("not allowed", "NotAllowedError"));
                        }
                        copied.push(text);
                        return undefined;
                    },
                },
            });
        }

        beforeEach(async () =>
        {
            copied = [];
            vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
            vi.setSystemTime(START);
            await openLearn();
            click(`lesson-${FIRST.id}`);
        });

        afterEach(() =>
        {
            for (const name of ["clipboard", "share"])
            {
                delete (navigator as unknown as Record<string, unknown>)[name];
            }
            delete (window as unknown as Record<string, unknown>).matchMedia;
        });

        it("has a button on the lesson that copies its link, says so for a moment, and keeps its size", async () =>
        {
            giveClipboard();
            const button = (): HTMLElement => find("#learn-share");
            const shown = (): string[] => Array.from(button().querySelectorAll(".swap:not(.is-off)")).map((text) => text.textContent as string);
            // Both texts are in the button all the time, so it never changes its width.
            expect(Array.from(button().querySelectorAll(".swap")).map((text) => text.textContent)).toEqual(["Share", "Link copied"]);
            expect(shown()).toEqual(["Share"]);
            button().focus();
            button().click();
            await settle();
            expect(copied).toEqual([`${base()}#learn/${FIRST.id}`]);
            expect(shown()).toEqual(["Link copied"]);
            expect(document.activeElement?.id).toBe("learn-share");
            vi.advanceTimersByTime(2400);
            expect(shown()).toEqual(["Link copied"]);
            vi.advanceTimersByTime(200);
            expect(shown()).toEqual(["Share"]);
        });

        it("puts nothing of the visitor into a link: no language and no setting, only the place", async () =>
        {
            giveClipboard();
            window.history.replaceState(null, "", `${window.location.pathname}?lang=de&x=1${window.location.hash}`);
            find("#learn-share").click();
            await settle();
            expect(copied).toEqual([`${base()}#learn/${FIRST.id}`]);
        });

        it("names the state in the link of the lesson about the user's state, though the address of the page does not", async () =>
        {
            giveClipboard();
            click("learn-back");
            click("lesson-land-berlin");
            await settle();
            expect(window.location.hash).toBe("#learn/land");
            const land = LESSONS.find((lesson) => lesson.template === "state") as LessonSpec;
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".lesson-body .unit-title > a.section-link"));
            expect(links.map((link) => link.getAttribute("href"))).toEqual(unitsOf(land).map((unit) => `#learn/land/${unit.id}`));
            find("#learn-share").click();
            await settle();
            links[0].click();
            await settle();
            // Whoever opens the link is told which state it was made for.
            expect(copied).toEqual([`${base()}#learn/land-berlin`, `${base()}#learn/land-berlin/${unitsOf(land)[0].id}`]);
            expect(find("#learn-share .swap:not(.is-off)").textContent).toBe("Share");
            expect(find(`#link-${unitsOf(land)[0].id}`).className).toBe("section-link is-noted");
        });

        it("has a small link next to the heading of every section, with the address of that section", async () =>
        {
            giveClipboard();
            const units = unitsOf(FIRST);
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".lesson-body .unit-title > a.section-link"));
            expect(links.map((link) => link.getAttribute("href"))).toEqual(units.map((unit) => `#learn/${FIRST.id}/${unit.id}`));
            const unit = units[1];
            const title = (english.lessons[FIRST.id].blocks[unit.id] as { q: string }).q.replace(/\{\{|\}\}|\*\*/g, "");
            const link = (): HTMLAnchorElement => find(`#link-${unit.id}`) as HTMLAnchorElement;
            expect(link().getAttribute("aria-label")).toBe(`Copy the link to this section: ${title}`);
            expect(link().getAttribute("title")).toBe(`Copy the link to this section: ${title}`);
            expect(link().className).toBe("section-link");
            const address = window.location.href;
            link().focus();
            link().click();
            await settle();
            expect(copied).toEqual([`${base()}#learn/${FIRST.id}/${unit.id}`]);
            expect(link().className).toBe("section-link is-noted");
            expect(link().getAttribute("aria-label")).toBe("Link copied");
            expect(document.activeElement?.id).toBe(`link-${unit.id}`);
            // The page stays where it is: the link was handed over, not followed.
            expect(window.location.href).toBe(address);
            expect(document.querySelectorAll(".section-link.is-noted")).toHaveLength(1);
            // The button of the lesson says nothing: it was not its link.
            expect(find("#learn-share .swap:not(.is-off)").textContent).toBe("Share");
            vi.advanceTimersByTime(2600);
            expect(link().className).toBe("section-link");
        });

        it("starts the moment of the note anew with every link that is copied", async () =>
        {
            giveClipboard();
            const [first, second] = unitsOf(FIRST);
            find(`#link-${first.id}`).click();
            await settle();
            vi.advanceTimersByTime(2000);
            find(`#link-${second.id}`).click();
            await settle();
            vi.advanceTimersByTime(2000);
            expect(find(`#link-${second.id}`).className).toBe("section-link is-noted");
            expect(find(`#link-${first.id}`).className).toBe("section-link");
            vi.advanceTimersByTime(600);
            expect(document.querySelector(".section-link.is-noted")).toBeNull();
        });

        it("links the check of the lesson, the timeline and the maps as well", async () =>
        {
            giveClipboard();
            expect((find("#link-check") as HTMLAnchorElement).getAttribute("href")).toBe(`#learn/${FIRST.id}/check`);
            click("learn-back");
            click("learn-timeline");
            find("#learn-share").click();
            await settle();
            click("learn-back");
            click("learn-maps");
            find("#learn-share").click();
            await settle();
            expect(copied).toEqual([`${base()}#learn/timeline`, `${base()}#learn/maps`]);
        });

        it("leaves a press on a section link that asks for a new tab to the browser", () =>
        {
            giveClipboard();
            const link = find(`#link-${unitsOf(FIRST)[0].id}`);
            link.addEventListener("click", (pressed) => pressed.preventDefault(), { once: true });
            link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
            expect(copied).toEqual([]);
        });

        it("opens the share sheet of a phone instead, and says nothing about copying", async () =>
        {
            giveClipboard();
            const shared: unknown[] = [];
            Object.defineProperty(navigator, "share", {
                configurable: true,
                value: async (data: unknown): Promise<void> =>
                {
                    shared.push(data);
                },
            });
            Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: query === "(pointer: coarse)" }) });
            find("#learn-share").click();
            await settle();
            expect(shared).toEqual([{ title: titleOf(FIRST), url: `${base()}#learn/${FIRST.id}` }]);
            expect(copied).toEqual([]);
            expect(find("#learn-share .swap:not(.is-off)").textContent).toBe("Share");
        });

        it("does nothing more when the user closes the share sheet", async () =>
        {
            Object.defineProperty(navigator, "share", { configurable: true, value: async (): Promise<void> => Promise.reject(new DOMException("closed", "AbortError")) });
            Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
            find("#learn-share").click();
            await settle();
            expect(find("#learn-share .swap:not(.is-off)").textContent).toBe("Share");
            expect(document.querySelector("[role=dialog]")).toBeNull();
            expect((document.getElementById("toast") as HTMLElement).hidden).toBe(true);
        });

        it.each([["has no clipboard", false], ["has a clipboard that refuses", true]])("shows the link to be copied by hand where the browser %s", async (_, present) =>
        {
            if (present)
            {
                giveClipboard(false);
            }
            find(`#link-${unitsOf(FIRST)[0].id}`).click();
            await settle();
            expect(textOf("modal-title")).toBe("Share");
            const field = find("#share-url") as HTMLInputElement;
            expect(field.value).toBe(`${base()}#learn/${FIRST.id}/${unitsOf(FIRST)[0].id}`);
            expect(field.readOnly).toBe(true);
            expect(textIn(".share-manual label")).toBe("Copy this link:");
            expect((find(".share-manual label") as HTMLLabelElement).htmlFor).toBe("share-url");
            // The field has the focus with the whole link marked, ready for Ctrl and C.
            expect(document.activeElement).toBe(field);
            expect(field.selectionStart).toBe(0);
            expect(field.selectionEnd).toBe(field.value.length);
            expect(document.querySelector(".is-noted")).toBeNull();
        });
    });

    describe("from the other tabs", () =>
    {
        /** The dialog, or null. */
        const dialog = (): HTMLElement | null => document.querySelector("#modal-root [role=dialog]");

        /** The plain text of the heading of a unit, as the page shows it. */
        const unitTitle = (lesson: LessonSpec, unit: UnitSpec): string => (english.lessons[lesson.id].blocks[unit.id] as { q: string }).q.replace(/\{\{|\}\}|\*\*/g, "");

        /** The lesson and the unit that teach a question. */
        function placeOf(number: number): { lesson: LessonSpec; unit: UnitSpec }
        {
            const lesson = LESSONS.find((entry) => unitsOf(entry).some((unit) => unit.questions?.includes(number))) as LessonSpec;
            return { lesson, unit: unitsOf(lesson).find((entry) => entry.questions?.includes(number)) as UnitSpec };
        }

        /**
         * Expects the dialog to explain a question with the unit that teaches it.
         * @param number The question.
         * @param label The name of the question in the title of the dialog.
         */
        function expectExplained(number: number, label = String(number)): void
        {
            if (number > app.LAST_GENERAL_NUMBER)
            {
                // A question of the user's state, which training and exams mix in: the lesson about the state explains it.
                expect(textOf("modal-title")).toMatch(/^Question BE \d+: why$/);
                expect(textIn("#modal-root .why-from")).toBe("From the lesson “Your state: Berlin”");
                expect(find("#why-lesson").getAttribute("href")).toMatch(/^#learn\/land\/[a-z-]+$/);
                return;
            }
            const { lesson, unit } = placeOf(number);
            expect(textOf("modal-title")).toBe(`Question ${label}: why`);
            expect(textIn("#modal-root .why-from")).toBe(`From the lesson “${titleOf(lesson)}”`);
            expect(textIn("#modal-root .why .unit-title")).toBe(unitTitle(lesson, unit));
            expect(find("#modal-root .why .unit").id).toBe(`unit-${unit.id}`);
            // The unit stands on its own here: the link to pass it on belongs to the page of the lesson.
            expect(document.querySelector("#modal-root .section-link")).toBeNull();
            expect(find("#why-lesson").getAttribute("href")).toBe(`#learn/${lesson.id}/${unit.id}`);
            expect(find("#modal-root .modal").className).toContain("modal-fixed");
        }

        it("explains a wrong answer in practice in the dialog, with the unit that teaches it, and leaves the tab as it is", async () =>
        {
            const number = shownNumber();
            optionButtons()[correctIndex() === 0 ? 1 : 0].click();
            expect(textOf("learn-why")).toBe("Learn why");
            expect(find("#learn-why").getAttribute("aria-haspopup")).toBe("dialog");
            find("#learn-why").focus();
            click("learn-why");
            // The course is fetched first: the dialog says so, in its frame of one size.
            expect(dialog()).not.toBeNull();
            expect(textIn("#modal-root .why-wait")).toBe("Loading the lessons …");
            expect(textOf("modal-title")).toBe(`Question ${number}: why`);
            await settle();
            expectExplained(number);
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-practice");
            expect(window.location.hash).toBe("");
            // Reading an explanation opens no lesson.
            expect(saved(app).learn.last).toBeNull();
            click("why-close");
            expect(dialog()).toBeNull();
            expect(document.activeElement?.id).toBe("learn-why");
            // The second time the course is there.
            click("learn-why");
            expectExplained(number);
        });

        it("explains a right answer too, and every answer in the training", async () =>
        {
            const number = shownNumber();
            optionButtons()[correctIndex()].click();
            click("learn-why");
            await settle();
            expectExplained(number);
            click("why-close");
            click("tab-train");
            const trained = shownNumber();
            optionButtons()[correctIndex()].click();
            click("learn-why");
            expectExplained(trained);
            click("why-close");
            click("train-next");
            clickButton("I don't know");
            click("learn-why");
            expectExplained(shownNumber());
        });

        it("leaves the keys of the question alone while the dialog is open", async () =>
        {
            const number = shownNumber();
            optionButtons()[correctIndex()].click();
            click("learn-why");
            await settle();
            pressKey("ArrowRight");
            pressKey("n");
            expect(dialog()).not.toBeNull();
            click("why-close");
            expect(shownNumber()).toBe(number);
        });

        it("opens the whole lesson at that unit from the dialog, and closes the dialog", async () =>
        {
            const number = shownNumber();
            const { lesson, unit } = placeOf(number);
            optionButtons()[correctIndex()].click();
            click("learn-why");
            await settle();
            const link = find("#why-lesson") as HTMLAnchorElement;
            // The link is a plain one: a press that asks for a new tab is the browser's.
            expect(link.tagName).toBe("A");
            // What the browser does with the press: it goes to the address of the link.
            window.history.pushState(null, "", link.getAttribute("href") as string);
            window.dispatchEvent(new HashChangeEvent("hashchange"));
            expect(dialog()).toBeNull();
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-learn");
            expect(textIn(".lesson-head h2")).toBe(titleOf(lesson));
            expect(document.activeElement?.id).toBe(`unit-${unit.id}`);
            expect(saved(app).learn.last).toBe(lesson.id);
        });

        it("says so in the dialog when the lessons could not be fetched, and tries again from there", async () =>
        {
            breakServer("offline");
            const number = shownNumber();
            optionButtons()[correctIndex()].click();
            click("learn-why");
            await settle();
            expect(textIn("#modal-root [role=alert]")).toBe("The lessons could not be loaded. Check your connection and try again.");
            breakServer(null);
            find("#why-retry").focus();
            click("why-retry");
            expect(textIn("#modal-root .why-wait")).toBe("Loading the lessons …");
            // The button that was pressed is gone: the focus stays in the dialog.
            expect(find("#modal-root").contains(document.activeElement)).toBe(true);
            await settle();
            expectExplained(number);
        });

        it("says so when no lesson explains the question", async () =>
        {
            const number = shownNumber();
            const changed = structuredClone(course);
            for (const lesson of changed.chapters.flatMap((chapter) => chapter.lessons))
            {
                for (const unit of unitsOf(lesson))
                {
                    unit.questions = unit.questions?.filter((entry) => entry !== number);
                }
            }
            serveCourseFile("teach/course.json", changed);
            optionButtons()[correctIndex()].click();
            click("learn-why");
            await settle();
            expect(textIn("#modal-root .why")).toBe("No lesson explains this question.");
        });

        it("explains every question of the review of an exam, also the right ones and those of the state, and remembers the result of the exam", async () =>
        {
            startExam();
            optionButtons()[correctIndex()].click();
            click("exam-finish");
            finishAnyway();
            expect(saved(app).exams).toEqual([{ day: TODAY, score: 1, total: 33 }]);
            click("review-all");
            const items = Array.from(document.querySelectorAll<HTMLElement>(".review-item"));
            expect(items).toHaveLength(33);
            expect(items.every((item) => item.querySelector(".learn-why") !== null)).toBe(true);
            expect(items[0].className).toBe("card review-item is-right");
            // A general question: the questions of the state are mixed in, and are explained below.
            const general = items.find((item) => /^Q\d+$/.test(item.querySelector(".qno")?.textContent ?? "")) as HTMLElement;
            const number = Number((general.querySelector(".qno")?.textContent as string).replace(/\D/g, ""));
            (general.querySelector(".learn-why") as HTMLButtonElement).click();
            await settle();
            expectExplained(number);
            expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-exam");
            click("why-close");
            // A question of the user's state is explained by the lesson about that state. The page was drawn again when the course arrived.
            const drawn = Array.from(document.querySelectorAll<HTMLElement>(".review-item"));
            const position = drawn.findIndex((item) => /^BE \d+$/.test(item.querySelector(".qno")?.textContent ?? ""));
            const label = drawn[position].querySelector(".qno")?.textContent as string;
            const why = find(`#why-${position}`);
            why.focus();
            why.click();
            expect(textOf("modal-title")).toBe(`Question ${label}: why`);
            expect(textIn("#modal-root .why-from")).toBe("From the lesson “Your state: Berlin”");
            expect(find("#why-lesson").getAttribute("href")).toMatch(/^#learn\/land\//);
            click("why-close");
            expect(document.activeElement?.id).toBe(`why-${position}`);
        });

        it("counts an exam that was passed towards being ready", async () =>
        {
            startExam();
            for (let index = 0; index < 33; index++)
            {
                optionButtons()[correctIndex()].click();
                if (index < 32)
                {
                    clickButton("Next");
                }
            }
            pressFinishExam();
            expect(saved(app).exams).toEqual([{ day: TODAY, score: 33, total: 33 }]);
            click("tab-learn");
            await settle();
            expect(textIn(".ready-list li:last-child")).toBe("Not yet:1 of 2 practice exams with 25 or more of 33 right answers, on different days");
        });

        it("keeps the tab switched off while an exam runs, like the others", () =>
        {
            startExam();
            optionButtons()[0].click();
            expect((document.getElementById("tab-learn") as HTMLButtonElement).disabled).toBe(true);
        });

        it("is drawn in German and in Arabic, with German terms that keep their direction", async () =>
        {
            await openLearn();
            await chooseFromListbox("site-language", "ar");
            await settle();
            expect(document.documentElement.dir).toBe("rtl");
            click(`lesson-${FIRST.id}`);
            const terms = Array.from(document.querySelectorAll<HTMLElement>(".lesson-body .de-term, .lesson-body .term-word"));
            expect(terms.length).toBeGreaterThan(3);
            expect(terms.every((term) => term.lang === "de" && term.dir === "ltr")).toBe(true);
            expect(textIn(".lesson-head h2")).toMatch(/[؀-ۿ]/);
            expect(buttonByText("All lessons")).toBeUndefined();
        });
    });
});
