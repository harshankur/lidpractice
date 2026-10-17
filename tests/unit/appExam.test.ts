// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buttonByText, chooseFromListbox, chooseState, finishAnyway, numberOfLabel, chooseTranslation, clickButton, correctIndex, makeBank, mountApp, optionButtons, pressKey,
    REAL_QUESTIONS, shownNumber, startExam, statValue, visibleText, wrongIndex, type AppExports, type Question, settle, pressFinishExam,
} from "../helpers/appHarness";

/** Number of questions in an exam: 30 general plus 3 of the chosen federal state. */
const EXAM_SIZE = 33;

/**
 * Walks through the whole exam, answering the first `correct` questions right and the rest wrong.
 * Leaves the cursor on the last question.
 * @param correct How many answers to get right.
 * @param bank Bank the app was mounted with.
 * @param skipFrom Index from which questions are left unanswered (default: none).
 */
function answerExam(correct: number, bank: Question[] = REAL_QUESTIONS, skipFrom = Number.POSITIVE_INFINITY): void
{
    for (let index = 0; index < EXAM_SIZE; index++)
    {
        if (index < skipFrom)
        {
            optionButtons()[index < correct ? correctIndex(bank) : wrongIndex(bank)].click();
        }
        if (index < EXAM_SIZE - 1)
        {
            clickButton("Next");
        }
    }
}

/** Text of the exam result headline, for example "Passed". */
function resultLabel(): string
{
    return document.querySelector(".result-label")?.textContent as string;
}

describe("App: exam mode", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        app = await mountApp();
    });

    afterEach(() =>
    {
        // A dialog that a test leaves open would keep taking the Escape key from the tests after it.
        document.querySelector<HTMLElement>(".modal-close")?.click();
        vi.restoreAllMocks();
        vi.useRealTimers();
        window.localStorage.clear();
    });

    describe("intro", () =>
    {
        it("explains the rules and offers to start", () =>
        {
            clickButton("Exam (33)");
            expect(document.querySelector(".intro h2")?.textContent).toBe("Practice exam");
            const facts = Array.from(document.querySelectorAll(".facts li")).map((item) => item.textContent);
            expect(facts).toEqual([
                `${app.EXAM_PASS_MARK} correct answers pass.`,
                "60 minutes, counted down.",
                "No feedback until you finish. You can go back and change answers.",
                "Mark a question for review (key M) to find it again in the list of questions.",
            ]);
            expect(buttonByText("Start exam")).toBeDefined();
            expect(document.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Exam (33)");
        });

        it("documents the constants the exam is built on", () =>
        {
            expect(app.EXAM_GENERAL_COUNT).toBe(30);
            expect(app.EXAM_STATE_COUNT).toBe(3);
            expect(app.EXAM_PASS_MARK).toBe(17);
            expect(app.EXAM_DURATION_MS).toBe(60 * 60 * 1000);
        });
    });

    describe("running", () =>
    {
        it("starts on question 1 of 33 with a full clock and nothing answered", () =>
        {
            vi.useFakeTimers();
            startExam();
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 1 of 33");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("0 answered");
            expect(document.getElementById("clock-display")?.textContent).toBe("60:00");
            expect(document.getElementById("clock-widget")?.classList.contains("level-calm")).toBe(true);
            expect(document.querySelectorAll(".nav-dot")).toHaveLength(EXAM_SIZE);
        });

        it("draws 30 distinct general and 3 distinct questions of Berlin, the state that is chosen at first", () =>
        {
            startExam();
            const numbers: number[] = [];
            for (let index = 0; index < EXAM_SIZE; index++)
            {
                numbers.push(shownNumber());
                if (index < EXAM_SIZE - 1)
                {
                    clickButton("Next");
                }
            }
            expect(new Set(numbers).size).toBe(EXAM_SIZE);
            expect(numbers.filter((number) => number <= app.LAST_GENERAL_NUMBER)).toHaveLength(30);
            expect(numbers.filter((number) => number > app.LAST_GENERAL_NUMBER)).toHaveLength(3);
        });

        it("does not reveal whether an answer is right", () =>
        {
            startExam();
            optionButtons()[correctIndex()].click();
            expect(document.querySelectorAll(".is-correct, .is-wrong")).toHaveLength(0);
            expect(document.querySelector(".verdict")).toBeNull();
            expect(optionButtons().every((button) => !button.disabled)).toBe(true);
            expect(optionButtons().filter((button) => button.classList.contains("is-selected"))).toHaveLength(1);
        });

        it("lets the answer be changed and counts answered questions", () =>
        {
            startExam();
            optionButtons()[0].click();
            optionButtons()[2].click();
            expect(optionButtons()[2].getAttribute("aria-pressed")).toBe("true");
            expect(optionButtons()[0].getAttribute("aria-pressed")).toBe("false");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
        });

        it("accepts keyboard answers", () =>
        {
            startExam();
            pressKey("3");
            expect(optionButtons()[2].getAttribute("aria-pressed")).toBe("true");
            pressKey("a");
            expect(optionButtons()[0].getAttribute("aria-pressed")).toBe("true");
        });

        it("navigates with Back, Next and the arrow keys and clamps at both ends", () =>
        {
            startExam();
            const first = shownNumber();
            expect((buttonByText("Back") as HTMLButtonElement).disabled).toBe(true);
            pressKey("ArrowLeft");
            expect(shownNumber()).toBe(first);
            pressKey("ArrowRight");
            const second = shownNumber();
            expect(second).not.toBe(first);
            expect((buttonByText("Back") as HTMLButtonElement).disabled).toBe(false);
            clickButton("Back");
            expect(shownNumber()).toBe(first);
            pressKey("Enter");
            expect(shownNumber()).toBe(second);
            pressKey("ArrowLeft");
            expect(shownNumber()).toBe(first);
        });

        it("shows Finish exam on the last question and stops moving past it", () =>
        {
            startExam();
            for (let index = 0; index < EXAM_SIZE - 1; index++)
            {
                pressKey("ArrowRight");
            }
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 33 of 33");
            expect(buttonByText("Next")).toBeUndefined();
            expect(buttonByText("Finish exam")).toBeDefined();
            pressKey("ArrowRight");
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 33 of 33");
        });

        it("jumps with the navigator and labels answered dots", () =>
        {
            startExam();
            optionButtons()[0].click();
            const dots = Array.from(document.querySelectorAll<HTMLButtonElement>(".nav-dot"));
            expect(dots[0].getAttribute("aria-label")).toBe("Question 1, answered");
            expect(dots[0].classList.contains("is-done")).toBe(true);
            expect(dots[0].classList.contains("is-current")).toBe(true);
            expect(dots[0].getAttribute("aria-current")).toBe("step");
            expect(dots[4].getAttribute("aria-label")).toBe("Question 5");
            expect(dots[4].hasAttribute("aria-current")).toBe(false);
            dots[4].click();
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 5 of 33");
            expect(document.querySelectorAll(".nav-dot")[4].classList.contains("is-current")).toBe(true);
        });

        it("switches off every tab while the exam runs, so it cannot be left by accident", () =>
        {
            startExam();
            optionButtons()[0].click();
            const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[role=tab]"));
            expect(tabs).toHaveLength(4);
            expect(tabs.every((tab) => tab.disabled)).toBe(true);
            tabs.forEach((tab) => tab.click());
            expect(document.getElementById("tab-exam")?.getAttribute("aria-selected")).toBe("true");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
        });

        it("ignores the arrow keys on the tabs while the exam runs", () =>
        {
            startExam();
            const tab = document.getElementById("tab-exam") as HTMLElement;
            for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"])
            {
                tab.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
            }
            expect(document.getElementById("tab-exam")?.getAttribute("aria-selected")).toBe("true");
            expect(document.querySelector(".exam-answered")).not.toBeNull();
        });

        it("switches the tabs on again when the exam is finished, and keeps the result", () =>
        {
            startExam();
            answerExam(33);
            pressFinishExam();
            const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[role=tab]"));
            expect(tabs.some((tab) => tab.disabled)).toBe(false);
            clickButton("Practice");
            expect(document.getElementById("change-selection")).not.toBeNull();
            clickButton("Exam (33)");
            expect(document.querySelector(".result-label")).not.toBeNull();
        });

        it("ignores answer keys for options that do not exist", async () =>
        {
            app = await mountApp(makeBank(31, 3, { a: ["Ja", "Nein"], ae: ["Yes", "No"] }));
            startExam();
            pressKey("4");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("0 answered");
            pressKey("2");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
        });
    });

    describe("federal state", () =>
    {
        it("is the state of the user, named on the intro, with a hint where to change it", () =>
        {
            clickButton("Exam (33)");
            expect(document.getElementById("exam-state-button")).toBeNull();
            expect(document.querySelector(".intro")?.textContent).toContain("The 3 state questions come from your state: Berlin. You can change it at the bottom of the page.");
        });

        it("gives the exam three questions of the state chosen at the bottom of the page", () =>
        {
            chooseState("bayern");
            clickButton("Exam (33)");
            expect(document.querySelector(".intro")?.textContent).toContain("Bavaria");
            clickButton("Start exam");
            const numbers: number[] = [];
            for (let index = 0; index < 33; index++)
            {
                numbers.push(numberOfLabel(document.querySelector(".qno")?.textContent as string));
                pressKey("ArrowRight");
            }
            const state = numbers.filter((number) => number > app.LAST_GENERAL_NUMBER);
            expect(state).toHaveLength(3);
            expect(state.every((number) => number > 310 && number <= 320)).toBe(true);
        });

        it("forgets a finished exam when the state changes, so the next exam is of the new state", () =>
        {
            startExam();
            answerExam(0);
            pressFinishExam();
            expect(document.querySelector(".result")).not.toBeNull();
            chooseState("hamburg");
            expect(document.querySelector(".intro")).not.toBeNull();
            expect(document.querySelector(".intro")?.textContent).toContain("Hamburg");
        });

        it("keeps an exam that is running as it is when the state changes", () =>
        {
            startExam();
            pressKey("1");
            chooseState("hamburg");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
        });

        it("is remembered after a reload", async () =>
        {
            chooseState("hamburg");
            app = await mountApp();
            clickButton("Exam (33)");
            expect(document.querySelector(".intro")?.textContent).toContain("Hamburg");
        });
    });

    describe("translation", () =>
    {
        it("is off in the exam unless it was chosen, because the real test is German only", () =>
        {
            startExam();
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
            expect(document.querySelector(".question .bi-main")?.getAttribute("lang")).toBe("de");
        });

        it("can be chosen on the intro and shows below the German text during the exam", async () =>
        {
            clickButton("Exam (33)");
            await chooseFromListbox("exam-translation", "en");
            clickButton("Start exam");
            const question = document.querySelector(".question") as Element;
            expect(question.querySelector(".bi-main")?.getAttribute("lang")).toBe("de");
            expect(question.querySelector(".bi-sub")?.getAttribute("lang")).toBe("en");
        });

        it("can be switched during the exam, without losing an answer", async () =>
        {
            startExam();
            optionButtons()[0].click();
            await chooseTranslation("en");
            expect(document.querySelectorAll(".bi-sub").length).toBeGreaterThan(0);
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
            expect(optionButtons()[0].getAttribute("aria-pressed")).toBe("true");
        });

        it("can be switched with the T key", async () =>
        {
            startExam();
            pressKey("t");
            await settle();
            expect(document.querySelectorAll(".bi-sub").length).toBeGreaterThan(0);
        });

        it("keeps the German text first in the review after the exam", async () =>
        {
            startExam();
            await chooseTranslation("en");
            answerExam(0);
            pressFinishExam();
            expect(document.querySelector(".review-item .bi-main")?.getAttribute("lang")).toBe("de");
            expect(document.querySelector(".review-item .bi-sub")?.getAttribute("lang")).toBe("en");
        });
    });

    describe("finishing", () =>
    {
        it("finishes at once when everything is answered", () =>
        {
            startExam();
            answerExam(33);
            pressFinishExam();
            expect(document.querySelector(".confirm")).toBeNull();
            expect(resultLabel()).toBe("Passed");
            expect(document.querySelector(".result-score")?.textContent).toBe("33 of 33");
            expect(document.querySelector(".review h2")?.textContent).toBe("No mistakes");
            expect(document.querySelectorAll(".review-item")).toHaveLength(0);
        });

        it("passes with exactly the pass mark", () =>
        {
            startExam();
            answerExam(17);
            pressFinishExam();
            expect(resultLabel()).toBe("Passed");
            expect(document.querySelector(".result-score")?.textContent).toBe("17 of 33");
            expect(document.querySelector(".result")?.className).toBe("card result pass");
            expect(document.querySelector(".result-note")?.textContent).toBe("17 correct answers are needed to pass.");
            expect(document.querySelector(".review h2")?.textContent).toBe("Review: 16 missed");
        });

        it("fails one point below the pass mark", () =>
        {
            startExam();
            answerExam(16);
            pressFinishExam();
            expect(resultLabel()).toBe("Not passed");
            expect(document.querySelector(".result-score")?.textContent).toBe("16 of 33");
            expect(document.querySelector(".result")?.className).toBe("card result fail");
        });

        it("asks before finishing with unanswered questions and counts them as wrong", () =>
        {
            startExam();
            answerExam(33, REAL_QUESTIONS, 30);
            pressFinishExam();
            expect(document.querySelector("#modal-root [role=dialog] .confirm")).not.toBeNull();
            expect(document.getElementById("modal-title")?.textContent).toBe("Finish the exam?");
            expect(document.querySelector(".confirm p")?.textContent)
                .toBe("3 questions are still unanswered and will count as wrong.");
            finishAnyway();
            expect(resultLabel()).toBe("Passed");
            expect(document.querySelector(".result-score")?.textContent).toBe("30 of 33");
            expect(document.querySelectorAll(".review-item")).toHaveLength(3);
            const lines = Array.from(document.querySelectorAll(".line.bad")).map((line) => line.textContent);
            expect(lines.every((line) => line === "YouNo answer")).toBe(true);
        });

        it("uses the singular for exactly one unanswered question", () =>
        {
            startExam();
            answerExam(33, REAL_QUESTIONS, 32);
            pressFinishExam();
            expect(document.querySelector(".confirm p")?.textContent)
                .toBe("1 question is still unanswered and will count as wrong.");
        });

        it("lets the user keep working from the confirmation", () =>
        {
            startExam();
            answerExam(0, REAL_QUESTIONS, 0);
            pressFinishExam();
            expect(document.querySelector(".confirm")).not.toBeNull();
            clickButton("Keep working");
            expect(document.querySelector(".confirm")).toBeNull();
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 33 of 33");
        });

        it("asks in the dialog: the page behind is blocked, and focus goes into the dialog and back to the button", () =>
        {
            startExam();
            const endNow = (): HTMLElement => document.getElementById("exam-finish") as HTMLElement;
            endNow().focus();
            endNow().click();
            expect(document.getElementById("app")?.hasAttribute("inert")).toBe(true);
            expect(document.querySelector("#app .confirm")).toBeNull();
            expect(document.activeElement).toBe(document.getElementById("modal-title"));
            clickButton("Keep working");
            expect(document.getElementById("app")?.hasAttribute("inert")).toBe(false);
            expect(document.activeElement).toBe(endNow());
        });

        it("keeps working when the dialog is closed with Escape, with the close button or by a click outside", () =>
        {
            startExam();
            const closers = [
                (): void => pressKey("Escape"),
                (): void => (document.querySelector(".modal-close") as HTMLElement).click(),
                (): void => (document.querySelector(".modal-backdrop") as HTMLElement).click(),
            ];
            for (const close of closers)
            {
                (document.getElementById("exam-finish") as HTMLButtonElement).click();
                expect(document.querySelector(".confirm")).not.toBeNull();
                close();
                expect(document.querySelector(".confirm")).toBeNull();
                expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 1 of 33");
            }
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).records).toEqual({});
        });

        it("ignores Finish anyway in the first moment, so a double tap on End now does not end the exam", () =>
        {
            vi.useFakeTimers();
            startExam();
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            clickButton("Finish anyway");
            expect(document.querySelector(".result")).toBeNull();
            expect(document.querySelector(".confirm")).not.toBeNull();
            vi.advanceTimersByTime(app.CONFIRM_GUARD_MS - 1);
            clickButton("Finish anyway");
            expect(document.querySelector(".result")).toBeNull();
            vi.advanceTimersByTime(1);
            clickButton("Finish anyway");
            expect(resultLabel()).toBe("Not passed");
            expect(document.querySelector(".confirm")).toBeNull();
        });

        it("shows the result from the top of the page and puts the focus on it", () =>
        {
            const scrolled: Element[] = [];
            Element.prototype.scrollIntoView = function scrollIntoView(this: Element): void
            {
                scrolled.push(this);
            };
            startExam();
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            finishAnyway();
            expect(scrolled).toEqual([document.documentElement]);
            expect(document.activeElement).toBe(document.querySelector(".result"));
            expect(document.querySelector(".result-timeup")).toBeNull();
            Reflect.deleteProperty(Element.prototype, "scrollIntoView");
        });

        it("lists missed questions with the given and the right answer", () =>
        {
            startExam();
            answerExam(30);
            pressFinishExam();
            expect(document.querySelectorAll(".review-item")).toHaveLength(3);
            for (const item of Array.from(document.querySelectorAll(".review-item")))
            {
                const number = numberOfLabel(item.querySelector(".qno")?.textContent as string);
                const question = REAL_QUESTIONS.find((entry) => entry.n === number) as Question;
                const right = item.querySelector(".line.ok .bi-main")?.textContent;
                const given = item.querySelector(".line.bad .bi-main")?.textContent;
                expect(right).toBe(question.a[question.r]);
                expect(given).not.toBe(right);
                expect(question.a).toContain(given);
            }
        });

        it("lists every answer on request, in the order of the exam, and goes back to the mistakes, with nothing to change", () =>
        {
            startExam();
            const order: number[] = [];
            for (let index = 0; index < EXAM_SIZE; index++)
            {
                order.push(numberOfLabel(document.querySelector(".card .qno")?.textContent as string));
                optionButtons()[index < 30 ? correctIndex() : wrongIndex()].click();
                if (index < EXAM_SIZE - 1)
                {
                    clickButton("Next");
                }
            }
            pressFinishExam();
            const toggle = (): HTMLButtonElement => document.getElementById("review-all") as HTMLButtonElement;
            const shownText = (): string => toggle().querySelector(".swap:not(.is-off)")?.textContent as string;
            expect(document.querySelector(".review h2")?.textContent).toBe("Review: 3 missed");
            expect(toggle().getAttribute("aria-pressed")).toBe("false");
            // Both texts are in the button all the time, so it keeps its width.
            expect(Array.from(toggle().querySelectorAll(".swap")).map((text) => text.textContent)).toEqual(["Show all answers (33)", "Show only the mistakes"]);
            expect(shownText()).toBe("Show all answers (33)");
            toggle().focus();
            toggle().click();
            expect(document.activeElement?.id).toBe("review-all");
            expect(toggle().getAttribute("aria-pressed")).toBe("true");
            expect(shownText()).toBe("Show only the mistakes");
            expect(document.querySelector(".review h2")?.textContent).toBe("Your answers (33)");
            const items = Array.from(document.querySelectorAll(".review-item"));
            expect(items.map((item) => numberOfLabel(item.querySelector(".qno")?.textContent as string))).toEqual(order);
            for (const [index, item] of items.entries())
            {
                const number = order[index];
                const question = REAL_QUESTIONS.find((entry) => entry.n === number) as Question;
                if (index < 30)
                {
                    // A right answer: one line, the answer that was given and is right.
                    expect(item.className).toBe("card review-item is-right");
                    expect(item.querySelector(".line.ok .tag")?.textContent).toBe("You, right");
                    expect(item.querySelector(".line.ok .bi-main")?.textContent).toBe(question.a[question.r]);
                    expect(item.querySelector(".line.bad")).toBeNull();
                }
                else
                {
                    expect(item.className).toBe("card review-item");
                    expect(item.querySelector(".line.bad .tag")?.textContent).toBe("You");
                    expect(item.querySelector(".line.ok .tag")?.textContent).toBe("Right");
                }
                expect(item.querySelector(".learn-why")?.id).toBe(`why-${index}`);
                // Only a review: no answer can be chosen again.
                expect(item.querySelector("button.option")).toBeNull();
            }
            toggle().click();
            expect(document.querySelectorAll(".review-item")).toHaveLength(3);
            expect(document.querySelector(".review h2")?.textContent).toBe("Review: 3 missed");
            expect(Array.from(document.querySelectorAll(".review-item .learn-why")).map((button) => button.id)).toEqual(["why-30", "why-31", "why-32"]);
        });

        it("offers every answer after an exam without mistakes too, and lists only the mistakes again for the next exam", () =>
        {
            startExam();
            answerExam(EXAM_SIZE);
            pressFinishExam();
            expect(document.querySelector(".review h2")?.textContent).toBe("No mistakes");
            expect(document.querySelectorAll(".review-item")).toHaveLength(0);
            (document.getElementById("review-all") as HTMLButtonElement).click();
            expect(document.querySelectorAll(".review-item.is-right")).toHaveLength(EXAM_SIZE);
            clickButton("New exam");
            clickButton("Start exam");
            answerExam(0);
            pressFinishExam();
            expect(document.getElementById("review-all")?.getAttribute("aria-pressed")).toBe("false");
            expect(document.querySelectorAll(".review-item")).toHaveLength(EXAM_SIZE);
        });

        it("links to the picture of a missed picture question", async () =>
        {
            const bank = makeBank(31, 3, { img: "images/q-1.png", cap: "\u00a9 Credit" });
            app = await mountApp(bank);
            startExam();
            answerExam(0, bank);
            pressFinishExam();
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".review-item a.pic-link"));
            expect(links).toHaveLength(33);
            expect(links[0].textContent).toBe("Open picture");
            expect(links[0].getAttribute("href")).toBe("images/q-1.png");
            expect(links[0].getAttribute("rel")).toBe("noopener");
            const captions = Array.from(document.querySelectorAll(".review-item .caption"));
            expect(captions).toHaveLength(33);
            expect(captions[0].textContent).toBe("\u00a9 Credit");
        });

        it("shows no caption in the review for questions without a credit", async () =>
        {
            const bank = makeBank(31, 3, { img: "images/q-1.png" });
            app = await mountApp(bank);
            startExam();
            answerExam(0, bank);
            pressFinishExam();
            expect(document.querySelectorAll(".review-item .caption")).toHaveLength(0);
        });

        it("records every answer in the progress, unanswered ones as wrong", () =>
        {
            startExam();
            answerExam(20, REAL_QUESTIONS, 25);
            pressFinishExam();
            finishAnyway();
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            const records = Object.values(saved.records) as { right: number; wrong: number; lastWrong: boolean }[];
            expect(records).toHaveLength(EXAM_SIZE);
            expect(records.filter((record) => record.right === 1)).toHaveLength(20);
            expect(records.filter((record) => record.wrong === 1 && record.lastWrong)).toHaveLength(13);
        });

        it("ignores answer and navigation keys once finished", () =>
        {
            startExam();
            answerExam(33);
            pressFinishExam();
            pressKey("1");
            pressKey("ArrowLeft");
            pressKey("Enter");
            expect(resultLabel()).toBe("Passed");
            expect(document.querySelector(".result-score")?.textContent).toBe("33 of 33");
        });

        it("shows the result again when returning to the Exam tab", () =>
        {
            startExam();
            answerExam(33);
            pressFinishExam();
            clickButton("Practice");
            clickButton("Exam (33)");
            expect(resultLabel()).toBe("Passed");
        });
    });

    describe("marking for review, and opened or never opened", () =>
    {
        const mark = (): HTMLButtonElement => document.getElementById("exam-mark") as HTMLButtonElement;
        const dots = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(".nav-dot"));

        it("has one button that marks the question that is shown, keeps its text, and unmarks it", () =>
        {
            startExam();
            expect(mark().textContent).toBe("Mark for review");
            expect(mark().getAttribute("aria-pressed")).toBe("false");
            mark().click();
            expect(mark().textContent).toBe("Mark for review");
            expect(mark().getAttribute("aria-pressed")).toBe("true");
            expect(dots()[0].classList.contains("is-marked")).toBe(true);
            expect(dots()[0].getAttribute("aria-label")).toBe("Question 1, marked for review");
            clickButton("Next");
            expect(mark().getAttribute("aria-pressed")).toBe("false");
            expect(dots()[1].classList.contains("is-marked")).toBe(false);
            clickButton("Back");
            expect(mark().getAttribute("aria-pressed")).toBe("true");
            mark().click();
            expect(dots()[0].classList.contains("is-marked")).toBe(false);
        });

        it("marks with the M key, counts the marks in the widget, and says so on answered questions", () =>
        {
            startExam();
            const rows = (): string[] => Array.from(document.querySelectorAll(".exam-widget dd")).map((value) => value.textContent as string);
            pressKey("1");
            pressKey("m");
            expect(rows()[2]).toBe("1");
            expect(dots()[0].getAttribute("aria-label")).toBe("Question 1, answered, marked for review");
            pressKey("m");
            expect(rows()[2]).toBe("0");
        });

        it("does nothing with the M key in practice", () =>
        {
            pressKey("m");
            expect(document.getElementById("exam-mark")).toBeNull();
        });

        it("asks before finishing when something is marked, even when everything is answered", () =>
        {
            startExam();
            answerExam(33);
            clickButton("Back");
            mark().click();
            clickButton("Next");
            pressFinishExam();
            expect(document.querySelector(".confirm")).not.toBeNull();
            expect(document.querySelector(".confirm")?.textContent).toContain("1 question is marked for review.");
            expect(document.querySelector(".confirm")?.textContent).not.toContain("unanswered");
            finishAnyway();
            expect(document.querySelector(".result-score")?.textContent).toBe("33 of 33");
        });

        it("tells in the prompt how many questions were never opened and how many were opened and left open", () =>
        {
            startExam();
            pressKey("ArrowRight");
            pressKey("ArrowRight");
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            expect(document.querySelector(".confirm")?.textContent).toContain("33 questions are still unanswered and will count as wrong.");
            expect(document.querySelector(".confirm-detail")?.textContent).toBe("30 never opened, 3 opened and left open.");
        });

        it("counts a question that was jumped to as opened", () =>
        {
            startExam();
            dots()[19].click();
            dots()[0].click();
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            expect(document.querySelector(".confirm-detail")?.textContent).toBe("31 never opened, 2 opened and left open.");
        });

        it("records a question that was opened and left open as wrong, and one that was never opened not at all", () =>
        {
            startExam();
            optionButtons()[correctIndex()].click();
            clickButton("Next");
            clickButton("Next");
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            finishAnyway();
            expect(document.querySelector(".result-score")?.textContent).toBe("1 of 33");
            expect(statValue("Seen")).toBe("3 of 310");
            expect(statValue("Weak spots")).toBe("2");
        });

        it("names the two kinds of missing answer in the review", () =>
        {
            startExam();
            clickButton("Next");
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            finishAnyway();
            const lines = Array.from(document.querySelectorAll(".review-item .line.bad")).map((line) => line.textContent);
            expect(lines.filter((line) => line?.endsWith("No answer"))).toHaveLength(2);
            expect(lines.filter((line) => line?.endsWith("Not opened"))).toHaveLength(31);
            expect(document.querySelector(".review h2")?.textContent).toBe("Review: 33 missed");
        });
    });

    describe("after the result", () =>
    {
        it("takes New exam back to the start screen, and the exam starts there with Start exam", () =>
        {
            vi.useFakeTimers();
            startExam();
            answerExam(33);
            pressFinishExam();
            clickButton("New exam");
            expect(document.querySelector(".exam-progress")).toBeNull();
            expect(document.querySelector(".card.intro")).not.toBeNull();
            // Moving the focus to the result makes jsdom queue a task of its own. It is flushed so that only the timers of the app are counted.
            vi.advanceTimersByTime(0);
            expect(vi.getTimerCount()).toBe(0);
            expect(document.getElementById("clock-display")?.textContent).toBe("60:00");
            clickButton("Start exam");
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 1 of 33");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("0 answered");
            expect(document.getElementById("clock-display")?.textContent).toBe("60:00");
        });

        it("sends the user to a round of weak spots with every question that was missed or left open", () =>
        {
            startExam();
            answerExam(23);
            pressFinishExam();
            expect(statValue("Weak spots")).toBe("10");
            clickButton("Practice weak spots");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Practice");
            expect(document.querySelector(".round-bar")?.textContent).toContain("All my weak spots · 10 questions");
            expect(document.querySelector(".timeline-progress")?.textContent).toContain("0 of 10");
            expect(document.getElementById("scope-button")).toBeNull();
        });
    });

    describe("what the user does that must not end or lose an exam by accident", () =>
    {
        /** The result headline, or null while the exam runs. */
        const finished = (): boolean => document.querySelector(".result-label") !== null;

        it("does not finish on a second tap meant for Next, which lands on the button that finishes", () =>
        {
            startExam();
            answerExam(EXAM_SIZE);
            // On question 33 now: back to 32, and Next pressed twice in a row.
            clickButton("Back");
            clickButton("Next");
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 33 of 33");
            (document.getElementById("exam-next") as HTMLButtonElement).click();
            expect(finished()).toBe(false);
            // A moment later the same press finishes.
            pressFinishExam();
            expect(finished()).toBe(true);
        });

        it("takes no answer after the time is over, even before the clock has ticked, and ends the exam as timed out", () =>
        {
            vi.useFakeTimers();
            startExam();
            optionButtons()[correctIndex()].click();
            clickButton("Next");
            // The device sleeps past the end: the time is over, but no tick has come yet.
            vi.setSystemTime(Date.now() + 61 * 60 * 1000);
            optionButtons()[correctIndex()].click();
            expect(finished()).toBe(true);
            expect(document.querySelector(".result-timeup")).not.toBeNull();
            expect(document.querySelector(".result-score")?.textContent).toBe("1 of 33");
        });

        it("ends as timed out when finishing is asked for after the time, and does not ask first", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.setSystemTime(Date.now() + 61 * 60 * 1000);
            clickButton("End now");
            expect(document.querySelector("#modal-root [role=dialog]")).toBeNull();
            expect(document.querySelector(".result-timeup")).not.toBeNull();
        });

        it("keeps the keyboard on the answer, on Back and Next and in the list of questions after a press", () =>
        {
            startExam();
            const press = (id: string): void =>
            {
                const button = document.getElementById(id) as HTMLButtonElement;
                button.focus();
                button.click();
                expect(document.activeElement?.id, id).toBe(id);
            };
            press("option-1");
            press("exam-next");
            press("exam-next");
            press("exam-back");
            // Back on the second question leads to the first, where Back is off: the keyboard goes to the question.
            const back = document.getElementById("exam-back") as HTMLButtonElement;
            back.focus();
            back.click();
            expect(document.activeElement).toBe(document.querySelector("[data-focus]"));
            press("exam-dot-9");
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 10 of 33");
            // On the last question Next turns into the button that finishes, in the same place, and keeps the keyboard.
            press("exam-dot-31");
            press("exam-next");
            expect(buttonByText("Finish exam")?.id).toBe("exam-next");
        });

        it("asks before the page is left by a reload or by closing it, while the exam runs, and only then", () =>
        {
            const leave = (): boolean =>
            {
                const event = new Event("beforeunload", { cancelable: true });
                window.dispatchEvent(event);
                return event.defaultPrevented;
            };
            expect(leave()).toBe(false);
            startExam();
            expect(leave()).toBe(true);
            clickButton("End now");
            finishAnyway();
            expect(leave()).toBe(false);
        });

        it("goes back to the step of the exam when the Back or Forward button leaves it, so the steps around it stay", () =>
        {
            clickButton("Train");
            startExam();
            const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
            const step = (window.history.state as { step: number }).step;
            // What the browser does on Back: the step before, with its own number, and then the page is told.
            window.history.replaceState({ step: step - 1 }, "", "#train");
            window.dispatchEvent(new PopStateEvent("popstate"));
            expect(go).toHaveBeenCalledWith(1);
            // And on Forward from an earlier step.
            window.history.replaceState({ step: step + 2 }, "", "#learn");
            window.dispatchEvent(new PopStateEvent("popstate"));
            expect(go).toHaveBeenLastCalledWith(-2);
            expect(document.querySelector(".exam-progress")).not.toBeNull();
        });

        it("puts the exam back over an address typed by hand, as a step of its own", () =>
        {
            startExam();
            const step = (window.history.state as { step: number }).step;
            window.history.pushState(null, "", "#practice");
            window.dispatchEvent(new HashChangeEvent("hashchange"));
            expect(window.location.hash).toBe("#exam");
            expect(window.history.state).toEqual({ step: step + 1 });
            expect(document.querySelector(".exam-progress")).not.toBeNull();
        });

        it("takes the keyboard to the first question when Start exam was pressed, and to the start when New exam was", () =>
        {
            clickButton("Exam (33)");
            const start = buttonByText("Start exam") as HTMLButtonElement;
            start.focus();
            start.click();
            expect(document.activeElement).toBe(document.querySelector("[data-focus]"));
            answerExam(EXAM_SIZE);
            pressFinishExam();
            const again = buttonByText("New exam") as HTMLButtonElement;
            again.focus();
            again.click();
            expect(document.activeElement?.tagName).toBe("H2");
            expect(document.activeElement?.textContent).toBe("Practice exam");
        });

        it("offers no round of weak spots on the result when there are none", () =>
        {
            startExam();
            answerExam(EXAM_SIZE);
            pressFinishExam();
            expect(buttonByText("Practice weak spots")?.disabled).toBe(true);
        });
    });

    describe("timer", () =>
    {
        /** The classes of the clock widget that say how urgent the time is. */
        function level(): string
        {
            return Array.from(document.getElementById("clock-widget")?.classList ?? []).find((name) => name.startsWith("level-")) as string;
        }

        it("counts down once per second", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(1000);
            expect(document.getElementById("clock-display")?.textContent).toBe("59:59");
            vi.advanceTimersByTime(59000);
            expect(document.getElementById("clock-display")?.textContent).toBe("59:00");
        });

        it("stays calm until 15 minutes are left, then tints the time", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(44 * 60 * 1000 + 59000);
            expect(level()).toBe("level-calm");
            vi.advanceTimersByTime(1000);
            expect(document.getElementById("clock-display")?.textContent).toBe("15:00");
            expect(level()).toBe("level-nudge");
        });

        it("gets a yellow border in the last five minutes", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(55 * 60 * 1000 - 1000);
            expect(level()).toBe("level-nudge");
            vi.advanceTimersByTime(1000);
            expect(document.getElementById("clock-display")?.textContent).toBe("05:00");
            expect(level()).toBe("level-warn");
        });

        it("gets a red border in the last minute", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(59 * 60 * 1000 - 1000);
            expect(level()).toBe("level-warn");
            vi.advanceTimersByTime(1000);
            expect(document.getElementById("clock-display")?.textContent).toBe("01:00");
            expect(level()).toBe("level-critical");
        });

        it("keeps the level when the page is drawn again in the last five minutes", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(56 * 60 * 1000);
            pressKey("ArrowRight");
            expect(level()).toBe("level-warn");
            expect(document.getElementById("clock-display")?.textContent).toBe("04:00");
        });

        it("ends the exam when time runs out and counts unanswered as wrong", () =>
        {
            vi.useFakeTimers();
            startExam();
            optionButtons()[correctIndex()].click();
            vi.advanceTimersByTime(app.EXAM_DURATION_MS);
            expect(resultLabel()).toBe("Not passed");
            expect(document.querySelector(".result-score")?.textContent).toBe("1 of 33");
            expect(document.querySelector(".review h2")?.textContent).toBe("Review: 32 missed");
        });

        it("says on the result that the time ran out, and only then", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(app.EXAM_DURATION_MS);
            expect(document.querySelector(".result-timeup")?.textContent).toBe("The time ran out.");
            expect(document.querySelector(".result")?.firstElementChild?.className).toBe("result-timeup");
            clickButton("New exam");
            clickButton("Start exam");
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            vi.advanceTimersByTime(app.CONFIRM_GUARD_MS);
            clickButton("Finish anyway");
            expect(document.querySelector(".result")).not.toBeNull();
            expect(document.querySelector(".result-timeup")).toBeNull();
        });

        it("takes the finish prompt away when the time runs out while it is open", () =>
        {
            vi.useFakeTimers();
            startExam();
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            expect(document.querySelector(".confirm")).not.toBeNull();
            vi.advanceTimersByTime(app.EXAM_DURATION_MS);
            expect(document.querySelector(".confirm")).toBeNull();
            expect(document.getElementById("app")?.hasAttribute("inert")).toBe(false);
            expect(resultLabel()).toBe("Not passed");
        });

        it("shows the time in a strip above the question while the exam runs, and keeps it up to date", () =>
        {
            vi.useFakeTimers();
            clickButton("Exam (33)");
            expect(document.getElementById("clock-strip")).toBeNull();
            clickButton("Start exam");
            const strip = (): HTMLElement => document.getElementById("clock-strip") as HTMLElement;
            expect(document.querySelector(".stage")?.firstElementChild).toBe(strip());
            expect(strip().getAttribute("aria-hidden")).toBe("true");
            expect(strip().textContent).toBe("Clock60:00");
            expect(strip().classList.contains("level-calm")).toBe(true);
            vi.advanceTimersByTime(56 * 60 * 1000);
            expect(document.getElementById("clock-strip-time")?.textContent).toBe("04:00");
            expect(strip().classList.contains("level-warn")).toBe(true);
            pressKey("1");
            expect(document.getElementById("clock-strip-time")?.textContent).toBe("04:00");
            vi.advanceTimersByTime(4 * 60 * 1000);
            expect(document.getElementById("clock-strip")).toBeNull();
        });

        it("does not end the exam one second early", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(app.EXAM_DURATION_MS - 1000);
            expect(document.querySelector(".result-label")).toBeNull();
            vi.advanceTimersByTime(1000);
            expect(resultLabel()).toBe("Not passed");
        });

        it("stops the timer when the exam is finished by hand", () =>
        {
            vi.useFakeTimers();
            startExam();
            expect(vi.getTimerCount()).toBe(1);
            answerExam(33);
            pressFinishExam();
            // Moving the focus to the result makes jsdom queue a task of its own. It is flushed so that only the timers of the app are counted.
            vi.advanceTimersByTime(0);
            expect(vi.getTimerCount()).toBe(0);
            vi.advanceTimersByTime(app.EXAM_DURATION_MS);
            expect(resultLabel()).toBe("Passed");
        });

        it("a restarted exam gets its own full time and only one timer runs", () =>
        {
            vi.useFakeTimers();
            startExam();
            vi.advanceTimersByTime(30 * 60 * 1000);
            answerExam(33);
            pressFinishExam();
            clickButton("New exam");
            // Moving the focus to the result makes jsdom queue a task of its own. It is flushed so that only the timers of the app are counted.
            vi.advanceTimersByTime(0);
            clickButton("Start exam");
            // The keyboard moves to the first question, which queues a task of jsdom as well.
            vi.advanceTimersByTime(0);
            expect(document.getElementById("clock-display")?.textContent).toBe("60:00");
            expect(vi.getTimerCount()).toBe(1);
            vi.advanceTimersByTime(1000);
            expect(document.getElementById("clock-display")?.textContent).toBe("59:59");
        });
    });

    describe("the exam time", () =>
    {
        /** Types minutes into the field of the clock widget the way a user does. */
        function type(minutes: string): void
        {
            const input = document.getElementById("clock-minutes") as HTMLInputElement;
            input.value = minutes;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        it("is the official 60 minutes at first, as a count down, with the field for the minutes", () =>
        {
            clickButton("Exam (33)");
            expect(document.getElementById("clock-display")?.textContent).toBe("60:00");
            const input = document.getElementById("clock-minutes") as HTMLInputElement;
            expect(input.value).toBe("60");
            expect(input.max).toBe("60");
            expect(document.getElementById("clock-note")?.textContent).toBe("Counts down. The official time is 60 minutes. You can make it shorter, not longer.");
        });

        it("can be made shorter for practising, and the exam then runs that long", () =>
        {
            vi.useFakeTimers();
            clickButton("Exam (33)");
            type("20");
            expect(document.getElementById("clock-display")?.textContent).toBe("20:00");
            expect(document.querySelector(".facts")?.textContent).toContain("20 minutes, counted down.");
            type("1");
            expect(document.querySelector(".facts")?.textContent).toContain("1 minute, counted down.");
            expect(document.querySelector(".facts")?.textContent).not.toContain("1 minutes");
            type("20");
            clickButton("Start exam");
            expect(document.getElementById("clock-display")?.textContent).toBe("20:00");
            expect(document.getElementById("clock-widget")?.classList.contains("level-warn")).toBe(false);
            vi.advanceTimersByTime(20 * 60 * 1000);
            expect(resultLabel()).toBe("Not passed");
        });

        it("cannot be made longer than the official time", () =>
        {
            clickButton("Exam (33)");
            type("90");
            expect(document.getElementById("clock-display")?.textContent).toBe("60:00");
            expect((document.getElementById("clock-minutes") as HTMLInputElement).value).toBe("60");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).examMinutes).toBe(60);
        });

        it("ignores something that is not a time, and keeps what was set", () =>
        {
            clickButton("Exam (33)");
            type("30");
            type("abc");
            type("0");
            type("-5");
            expect(document.getElementById("clock-display")?.textContent).toBe("30:00");
        });

        it("is remembered for the next exam and after a reload", async () =>
        {
            clickButton("Exam (33)");
            type("25");
            app = await mountApp();
            clickButton("Exam (33)");
            expect(document.getElementById("clock-display")?.textContent).toBe("25:00");
        });

        it("starts in the nudge and the border levels if it is short enough", () =>
        {
            clickButton("Exam (33)");
            type("10");
            expect(document.getElementById("clock-widget")?.classList.contains("level-nudge")).toBe(true);
            type("4");
            expect(document.getElementById("clock-widget")?.classList.contains("level-warn")).toBe(true);
            type("1");
            expect(document.getElementById("clock-widget")?.classList.contains("level-critical")).toBe(true);
        });

        it("cannot be changed or stopped while the exam runs: the field is off and there are no start or pause buttons", () =>
        {
            startExam();
            expect((document.getElementById("clock-minutes") as HTMLInputElement).disabled).toBe(true);
            expect(document.getElementById("clock-toggle")).toBeNull();
            expect(document.getElementById("clock-mode-up")).toBeNull();
        });
    });

    describe("the widget at the side", () =>
    {
        it("is there in every view of the exam, like in practice: intro, running, and result", () =>
        {
            clickButton("Exam (33)");
            expect(document.querySelector("#view.layout > .aside")).not.toBeNull();
            expect(document.querySelector(".aside .stats")).not.toBeNull();
            startExam();
            expect(document.querySelector("#view.layout > .aside .exam-widget")).not.toBeNull();
            answerExam(33);
            pressFinishExam();
            expect(document.querySelector("#view.layout > .aside .stats")).not.toBeNull();
            expect(document.querySelector(".layout.single")).toBeNull();
        });

        it("shows how many are answered, how many are open and what it takes to pass, and follows the answers", () =>
        {
            startExam();
            const rows = (): string[] => Array.from(document.querySelectorAll(".exam-widget dd")).map((value) => value.textContent as string);
            expect(rows()).toEqual(["0 of 33", "33", "0", "17 correct"]);
            pressKey("1");
            expect(rows()).toEqual(["1 of 33", "32", "0", "17 correct"]);
        });

        it("has an End now button that works from any question, and asks first when something is open", () =>
        {
            startExam();
            pressKey("1");
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            expect(document.querySelector(".confirm")?.textContent).toContain("32 questions are still unanswered");
            finishAnyway();
            expect(document.querySelector(".result-score")?.textContent).toMatch(/^[01] of 33$/);
        });

        it("has a Start over button that needs a second press, and then starts a new exam with a full clock", () =>
        {
            vi.useFakeTimers();
            startExam();
            pressKey("1");
            vi.advanceTimersByTime(5 * 60 * 1000);
            const button = document.getElementById("exam-start-over") as HTMLButtonElement;
            button.click();
            expect(visibleText(document.getElementById("exam-start-over") as HTMLElement)).toBe("Tap again: new exam");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
            (document.getElementById("exam-start-over") as HTMLButtonElement).click();
            expect(document.querySelector(".exam-answered")?.textContent).toBe("0 answered");
            expect(document.getElementById("clock-display")?.textContent).toBe("60:00");
            expect(visibleText(document.getElementById("exam-start-over") as HTMLElement)).toBe("Start over");
            expect(vi.getTimerCount()).toBe(1);
        });

        it("takes the wait of Start over back after a while, with Escape, and with a click or a key elsewhere", () =>
        {
            vi.useFakeTimers();
            startExam();
            pressKey("1");
            const button = (): HTMLButtonElement => document.getElementById("exam-start-over") as HTMLButtonElement;
            const armed = (): boolean => button().className === "danger sm two-step" && visibleText(button()) === "Tap again: new exam";
            const enders = [
                (): void =>
                {
                    vi.advanceTimersByTime(app.TWO_STEP_TIMEOUT_MS);
                },
                (): void => pressKey("Escape"),
                (): void => (document.getElementById("exam-mark") as HTMLElement).click(),
                (): void => pressKey("ArrowRight"),
            ];
            for (const end of enders)
            {
                button().click();
                expect(armed()).toBe(true);
                vi.advanceTimersByTime(app.TWO_STEP_TIMEOUT_MS - 1);
                expect(armed()).toBe(true);
                end();
                expect(armed()).toBe(false);
                expect(button().className).toBe("secondary sm two-step");
                expect(visibleText(button())).toBe("Start over");
            }
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
            // After the wait is over, one press only asks again.
            button().click();
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
        });

        it("keeps the buttons that move between questions in a row that stays at the bottom edge", () =>
        {
            startExam();
            expect(buttonByText("Next")?.parentElement?.className).toBe("footer-row nav-row");
        });
    });

    describe("the state during an exam", () =>
    {
        it("cannot be changed while the exam runs, and the footer says so", () =>
        {
            const stateButton = (): HTMLButtonElement => document.getElementById("state-button") as HTMLButtonElement;
            expect(stateButton().disabled).toBe(false);
            startExam();
            expect(stateButton().disabled).toBe(true);
            expect(document.querySelector(".footer-state-note")?.textContent).toBe("Your state cannot be changed while an exam is running.");
            stateButton().click();
            expect(stateButton().getAttribute("aria-expanded")).toBe("false");
            (document.querySelector("#state-list [data-value=\"bayern\"]") as HTMLElement).click();
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).state ?? "berlin").toBe("berlin");
            expect(stateButton().textContent).toContain("Berlin");
        });

        it("can be changed again when the exam is over, and the note is the usual one", () =>
        {
            startExam();
            (document.getElementById("exam-finish") as HTMLButtonElement).click();
            finishAnyway();
            expect((document.getElementById("state-button") as HTMLButtonElement).disabled).toBe(false);
            expect(document.querySelector(".footer-state-note")?.textContent).toBe("Your 310 questions: 300 general ones and the 10 for Berlin.");
            chooseState("bayern");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).state).toBe("bayern");
        });
    });
});
