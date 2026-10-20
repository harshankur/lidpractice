// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buttonByText, chooseFromListbox, chooseState, chooseTranslation, clickButton, correctIndex, makeBank, makeQuestion, mountApp, nextButton, optionButtons,
    pressKey, REAL_BUNDLE, REAL_QUESTIONS, shownNumber, slotStates, slots, startRound, statValue, visibleText, wrongIndex, type AppExports, settle
} from "../helpers/appHarness";

/** Text of the main (first) line of an element. */
function mainText(element: Element): string
{
    return (element.querySelector(".bi-main") as HTMLElement).textContent as string;
}

/** Answers the question on screen correctly. */
function answerRight(): void
{
    optionButtons()[correctIndex()].click();
}

/** Answers the question on screen wrongly. */
function answerWrong(): void
{
    optionButtons()[wrongIndex()].click();
}

/** The question numbers shown by answering and moving on `count` times. */
function walk(count: number, answer: () => void = answerRight): number[]
{
    const seen: number[] = [];
    for (let index = 0; index < count; index++)
    {
        seen.push(shownNumber());
        answer();
        nextButton().click();
    }
    return seen;
}

describe("App: practice mode", () =>
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
        vi.restoreAllMocks();
        vi.useRealTimers();
        window.localStorage.clear();
    });

    describe("first render", () =>
    {
        it("shows the title, four mode tabs with Practice chosen, and the two lists of the site in the header", () =>
        {
            // The heading is the name and the line under it, so it says what the site is for.
            const heading = document.querySelector("h1") as HTMLElement;
            expect(document.querySelectorAll("h1")).toHaveLength(1);
            expect([...heading.children].map((part) => [part.className, part.textContent])).toEqual([
                ["brand-name", "LiD Practice"],
                ["brand-sub", "Einbürgerungstest · Leben in Deutschland · 310 questions"],
            ]);
            expect(heading.textContent).toBe("LiD Practice Einbürgerungstest · Leben in Deutschland · 310 questions");
            const tabs = Array.from(document.querySelectorAll("[role=tab]")).map((tab) => tab.textContent);
            expect(tabs).toEqual(["Learn", "Practice", "Train", "Exam (33)"]);
            expect(document.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Practice");
            expect(document.querySelector(".header-tools #site-language-button")?.textContent).toContain("Site language");
            expect(document.querySelector(".header-tools #theme-button")).not.toBeNull();
        });

        it("marks Practice as the selected tab", () =>
        {
            const selected = Array.from(document.querySelectorAll("[role=tab]"))
                .filter((tab) => tab.getAttribute("aria-selected") === "true");
            expect(selected.map((tab) => tab.textContent)).toEqual(["Practice"]);
        });

        it("shows one question with four lettered options, a timeline and a Skip button", () =>
        {
            expect(document.querySelectorAll("article.card")).toHaveLength(1);
            expect(optionButtons()).toHaveLength(4);
            const letters = Array.from(document.querySelectorAll(".letter")).map((letter) => letter.textContent);
            expect(letters).toEqual(app.OPTION_LETTERS);
            expect(document.querySelector("nav.timeline")).not.toBeNull();
            expect(visibleText(nextButton())).toBe("Skip");
            expect(nextButton().disabled).toBe(false);
        });

        it("starts in the order of the booklet, which is ticked in the panel too", () =>
        {
            expect(document.querySelector(".round-bar")?.textContent).toContain("Booklet order");
            expect(shownNumber()).toBe(1);
            clickButton("Change selection");
            expect((document.getElementById("order-booklet") as HTMLInputElement).checked).toBe(true);
            expect((document.getElementById("order-random") as HTMLInputElement).checked).toBe(false);
        });

        it("names the questions and the order of the round in a bar above the timeline", () =>
        {
            const bar = document.querySelector(".round-bar") as HTMLElement;
            expect(bar.textContent).toContain("All topics + Berlin · 310 questions");
            expect(bar.textContent).toContain("Booklet order");
            expect(visibleText(document.getElementById("change-selection") as HTMLElement)).toBe("Change selection");
        });

        it("labels a general question with its number, and a state question with the state code and the task", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            expect(document.querySelector(".qno")?.textContent).toBe("BE 1");
            expect(document.querySelector(".tag-state")?.textContent).toBe("Berlin");
            startRound({ scope: "general", order: "booklet" });
            expect(document.querySelector(".qno")?.textContent).toBe("Q1");
            expect(document.querySelector(".tag-topic")?.textContent).toBe("Fundamental rights and freedoms");
            expect(document.querySelector(".tag-state")).toBeNull();
        });

        it("shows empty progress", () =>
        {
            expect(statValue("Seen")).toBe("0 of 310");
            expect(statValue("Accuracy")).toBe("none yet");
            expect(statValue("Weak spots")).toBe("0");
        });

        it("keeps the footer to the state list, the note, five links, the privacy settings and the copyright line, because the settings of the looks are in the header", () =>
        {
            const footer = document.querySelector("footer") as HTMLElement;
            expect(footer.querySelector(".site-settings")).toBeNull();
            expect(Array.from(footer.querySelectorAll("button, a")).map((control) => control.id || control.textContent)).toEqual([
                "state-button", "About and FAQ", "Official catalogue (BAMF)", "Report a problem", "Legal notice", "Privacy", "privacy-settings", "Harsh Ankur"]);
        });

        it("names the state in the footer, and counts only its questions: 310, never 460", () =>
        {
            expect(document.getElementById("state-button")?.textContent).toContain("Your state");
            expect(document.getElementById("state-button")?.textContent).toContain("Berlin");
            expect(document.querySelector(".footer-state-note")?.textContent).toBe("Your 310 questions: 300 general ones and the 10 for Berlin.");
            expect(document.querySelector(".brand-sub")?.textContent).toBe("Einbürgerungstest · Leben in Deutschland · 310 questions");
            expect(statValue("Seen")).toBe("0 of 310");
        });
    });

    describe("tags, buttons and lists look and behave differently", () =>
    {
        it("shows the number and the subject as tags, which are not buttons, links or tab stops", () =>
        {
            const tags = Array.from(document.querySelectorAll(".card .meta .tag"));
            expect(tags.length).toBe(2);
            for (const tag of tags)
            {
                expect(tag.tagName).toBe("SPAN");
                expect(tag.closest("button, a")).toBeNull();
                expect(tag.getAttribute("tabindex")).toBeNull();
                expect(tag.getAttribute("role")).toBeNull();
            }
        });

        it("gives a question of the state one tag with the state name, in the state colour, and no tag for 'general'", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            const tags = Array.from(document.querySelectorAll(".card .meta .tag")).map((tag) => tag.className);
            expect(tags).toEqual(["tag tag-strong qno", "tag tag-state tag-topic"]);
            expect(document.querySelector(".card")?.textContent).not.toContain("General");
        });

        it("makes the original a button with an icon and a short label, apart from the tags and next to the translation list", () =>
        {
            const button = document.querySelector(".original-btn") as HTMLButtonElement;
            expect(button.tagName).toBe("BUTTON");
            expect(button.classList.contains("secondary")).toBe(true);
            expect(button.classList.contains("sm")).toBe(true);
            expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
            expect(button.getAttribute("title")).toMatch(/^Show question .+ as printed in the official catalogue$/);
            const tools = document.querySelector(".card-tools") as HTMLElement;
            expect(tools.contains(button)).toBe(true);
            expect(tools.contains(document.getElementById("translation-button"))).toBe(true);
            expect(document.querySelector(".meta")?.contains(button)).toBe(false);
        });

        it("labels the two lists of the header alike: an icon, what it is for, and what is chosen", () =>
        {
            const buttons = ["site-language-button", "theme-button"].map((id) => document.getElementById(id) as HTMLElement);
            for (const button of buttons)
            {
                expect(button.querySelector("svg")).not.toBeNull();
                expect(button.querySelector(".listbox-prefix")?.textContent?.length).toBeGreaterThan(0);
                expect(button.querySelector(".listbox-chevron svg")).not.toBeNull();
            }
        });

        it("shows Skip as the quiet button before an answer and the main button after it", () =>
        {
            expect(nextButton().classList.contains("secondary")).toBe(true);
            answerRight();
            expect(nextButton().classList.contains("primary")).toBe(true);
            expect(nextButton().querySelector("svg")).not.toBeNull();
            expect((document.getElementById("round-back") as HTMLElement).querySelector("svg")).not.toBeNull();
        });

        it("hides the keyboard hints in a closed disclosure and shows no pill buttons in the progress panel", () =>
        {
            const help = document.querySelector(".kbd-help") as HTMLDetailsElement;
            expect(help.open).toBe(false);
            expect(help.textContent).toContain("1 to 4 or A to D answer");
            expect(buttonByText("Reset progress")?.classList.contains("sm")).toBe(true);
        });
    });

    describe("the clock of practice", () =>
    {
        /** The classes of the clock widget that say how urgent the time is. */
        function level(): string
        {
            return Array.from(document.getElementById("clock-widget")?.classList ?? []).find((name) => name.startsWith("level-")) as string;
        }

        /** Types minutes into the field the way a user does. */
        function type(minutes: string): void
        {
            const input = document.getElementById("clock-minutes") as HTMLInputElement;
            input.value = minutes;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        /** The time on the clock. */
        function shown(): string
        {
            return document.getElementById("clock-display")?.textContent as string;
        }

        it("sits below the progress in the column at the side, in practice and in a round of weak spots", () =>
        {
            const aside = document.querySelector("#view.layout > .aside") as HTMLElement;
            expect(Array.from(aside.children).map((widget) => widget.className.split(" ").slice(0, 2).join(" "))).toEqual(["widget stats", "widget clock-widget", "widget round-widget"]);
            answerWrong();
            clickButton("Practice weak spots");
            expect(document.querySelector(".aside #clock-widget")).not.toBeNull();
        });

        it("shows the time in a strip above the round while the clock runs, in practice and in the training", () =>
        {
            vi.useFakeTimers();
            expect(document.getElementById("clock-strip")).toBeNull();
            (document.getElementById("clock-toggle") as HTMLElement).click();
            const strip = (): HTMLElement => document.getElementById("clock-strip") as HTMLElement;
            expect(document.querySelector(".stage")?.firstElementChild).toBe(strip());
            expect(strip().textContent).toBe("Clock00:00");
            vi.advanceTimersByTime(3000);
            expect(document.getElementById("clock-strip-time")?.textContent).toBe("00:03");
            clickButton("Train");
            expect(document.querySelector(".stage")?.firstElementChild).toBe(strip());
            expect(document.getElementById("clock-strip-time")?.textContent).toBe("00:03");
            (document.getElementById("clock-toggle") as HTMLElement).click();
            expect(document.getElementById("clock-strip")).toBeNull();
        });

        it("holds every text of the next step and of the choice in their buttons, so they keep their width", () =>
        {
            const texts = (id: string): string[] => Array.from(document.querySelectorAll(`#${id} .swap`)).map((text) => text.textContent as string);
            // Skip, Next and the result, and the way back to where the round was, with the question it leads to.
            expect(texts("round-next")).toEqual(["Skip", "Next question", "To the result", `Back to question ${shownNumber()}`]);
            expect(texts("change-selection")).toEqual(["Change selection", "Close"]);
            clickButton("Change selection");
            expect(texts("change-selection")).toEqual(["Change selection", "Close"]);
            expect(visibleText(document.getElementById("change-selection") as HTMLElement)).toBe("Close");
        });

        it("keeps a running clock when the way it already runs is pressed again", () =>
        {
            vi.useFakeTimers();
            (document.getElementById("clock-toggle") as HTMLElement).click();
            vi.advanceTimersByTime(2000);
            (document.getElementById("clock-mode-up") as HTMLElement).click();
            vi.advanceTimersByTime(1000);
            expect(shown()).toBe("00:03");
        });

        it("counts up from zero at first, and stands still until it is started", () =>
        {
            vi.useFakeTimers();
            expect(shown()).toBe("00:00");
            expect(document.getElementById("clock-mode-up")?.getAttribute("aria-pressed")).toBe("true");
            expect(document.getElementById("clock-minutes")).toBeNull();
            vi.advanceTimersByTime(5000);
            expect(shown()).toBe("00:00");
            expect(vi.getTimerCount()).toBe(0);
        });

        it("runs when started, shows each second, pauses and goes on, and resets", () =>
        {
            vi.useFakeTimers();
            clickButton("Start");
            expect(vi.getTimerCount()).toBe(1);
            vi.advanceTimersByTime(65 * 1000);
            expect(shown()).toBe("01:05");
            clickButton("Pause");
            expect(vi.getTimerCount()).toBe(0);
            vi.advanceTimersByTime(30 * 1000);
            expect(shown()).toBe("01:05");
            clickButton("Start");
            vi.advanceTimersByTime(5000);
            expect(shown()).toBe("01:10");
            clickButton("Reset");
            expect(shown()).toBe("00:00");
            expect(vi.getTimerCount()).toBe(0);
        });

        it("has one button that morphs between play and pause, with the same place and a name that follows", () =>
        {
            vi.useFakeTimers();
            const before = document.getElementById("clock-toggle") as HTMLButtonElement;
            expect(before.getAttribute("aria-label")).toBe("Start");
            expect(before.textContent).toBe("");
            const play = before.querySelector("path")?.getAttribute("d");
            expect(document.querySelectorAll("#clock-toggle")).toHaveLength(1);
            before.click();
            const running = document.getElementById("clock-toggle") as HTMLButtonElement;
            expect(running.getAttribute("aria-label")).toBe("Pause");
            expect(running.querySelector("path")?.getAttribute("d")).not.toBe(play);
            expect(document.querySelectorAll("#clock-toggle")).toHaveLength(1);
            running.click();
            expect(document.getElementById("clock-toggle")?.getAttribute("aria-label")).toBe("Start");
            expect(document.getElementById("clock-toggle")?.querySelector("path")?.getAttribute("d")).toBe(play);
        });

        it("never ends by itself when it counts up, and shows hours as minutes", () =>
        {
            vi.useFakeTimers();
            clickButton("Start");
            vi.advanceTimersByTime(150 * 60 * 1000);
            expect(shown()).toBe("150:00");
            expect(document.getElementById("clock-widget")?.classList.contains("level-calm")).toBe(true);
        });

        it("keeps running while the user answers, moves between the modes, and draws the page again", () =>
        {
            vi.useFakeTimers();
            clickButton("Start");
            vi.advanceTimersByTime(10 * 1000);
            answerRight();
            clickButton("Exam (33)");
            clickButton("Practice");
            expect(shown()).toBe("00:10");
            vi.advanceTimersByTime(5000);
            expect(shown()).toBe("00:15");
        });

        it("counts down from the minutes that are set, 30 at first, and the field has no upper limit that a person would reach", () =>
        {
            vi.useFakeTimers();
            clickButton("Count down");
            expect(document.getElementById("clock-mode-down")?.getAttribute("aria-pressed")).toBe("true");
            expect(shown()).toBe("30:00");
            expect((document.getElementById("clock-minutes") as HTMLInputElement).value).toBe("30");
            type("120");
            expect(shown()).toBe("120:00");
            type("500");
            expect(shown()).toBe("500:00");
            type("5000");
            expect(shown()).toBe("999:00");
        });

        it("can be made as short as one minute, and a count down can be longer than the exam", () =>
        {
            clickButton("Count down");
            type("1");
            expect(shown()).toBe("01:00");
            type("75");
            expect(shown()).toBe("75:00");
        });

        it("tints the time with 15 minutes left, gets a yellow border with 5, and a red border with 1", () =>
        {
            vi.useFakeTimers();
            clickButton("Count down");
            type("20");
            expect(level()).toBe("level-calm");
            clickButton("Start");
            vi.advanceTimersByTime(5 * 60 * 1000);
            expect(shown()).toBe("15:00");
            expect(level()).toBe("level-nudge");
            vi.advanceTimersByTime(10 * 60 * 1000);
            expect(shown()).toBe("05:00");
            expect(level()).toBe("level-warn");
            vi.advanceTimersByTime(4 * 60 * 1000);
            expect(shown()).toBe("01:00");
            expect(level()).toBe("level-critical");
        });

        it("stops at zero, says that the time is up, and starts again from the full time", () =>
        {
            vi.useFakeTimers();
            clickButton("Count down");
            type("2");
            clickButton("Start");
            vi.advanceTimersByTime(3 * 60 * 1000);
            expect(shown()).toBe("00:00");
            expect(document.getElementById("clock-note")?.textContent).toBe("Time is up.");
            expect(buttonByText("Start")).toBeDefined();
            expect(vi.getTimerCount()).toBe(0);
            clickButton("Start");
            expect(shown()).toBe("02:00");
            expect(document.getElementById("clock-note")?.textContent).toBe("Counts down from the time you set.");
        });

        it("remembers the direction and the minutes, and the clock is not running after a reload", async () =>
        {
            clickButton("Count down");
            type("45");
            clickButton("Start");
            app = await mountApp();
            expect(document.getElementById("clock-mode-down")?.getAttribute("aria-pressed")).toBe("true");
            expect(shown()).toBe("45:00");
            expect(buttonByText("Start")).toBeDefined();
        });

        it("changing the direction starts the clock over from its start", () =>
        {
            vi.useFakeTimers();
            clickButton("Start");
            vi.advanceTimersByTime(30 * 1000);
            clickButton("Count down");
            expect(shown()).toBe("30:00");
            expect(buttonByText("Start")).toBeDefined();
            clickButton("Count up");
            expect(shown()).toBe("00:00");
        });

        it("names what it shows, for a screen reader", () =>
        {
            expect(document.getElementById("clock-display")?.getAttribute("aria-label")).toBe("Time elapsed");
            expect(document.getElementById("clock-display")?.getAttribute("role")).toBe("timer");
            clickButton("Count down");
            expect(document.getElementById("clock-display")?.getAttribute("aria-label")).toBe("Time left");
        });
    });

    describe("the buttons for the round in the widget at the side", () =>
    {
        it("starts the round over, with the same choice, and nothing answered", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            walk(3);
            expect(document.querySelector(".timeline-progress")?.textContent).toBe("3 of 10 answered");
            (document.getElementById("round-start-over") as HTMLButtonElement).click();
            expect(document.querySelector(".timeline-progress")?.textContent).toBe("0 of 10 answered");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Berlin · 10 questions");
        });

        it("ends the round at once, with the end card, keeping what was answered", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            walk(2);
            (document.getElementById("round-finish") as HTMLButtonElement).click();
            expect(document.querySelector(".end-card")).not.toBeNull();
            expect(document.querySelector(".end-card p")?.textContent).toBe("2 of 10 answered: 2 correct, 0 wrong.");
            expect((document.getElementById("round-finish") as HTMLButtonElement).disabled).toBe(true);
        });

        it("keeps Back and Skip in a row that stays at the bottom edge, in practice and in the training", () =>
        {
            expect(nextButton().parentElement?.className).toBe("footer-row nav-row");
            clickButton("Train");
            expect(document.getElementById("train-next")?.parentElement?.className).toBe("footer-row nav-row");
        });

        describe("after moving to another question", () =>
        {
            let scrolled: Element[];
            /** Height of the window in these tests. */
            const WINDOW_HEIGHT = 700;
            /** Height of the row of buttons below the question. */
            const BUTTONS_HEIGHT = 56;
            /**
             * Places the question card as the layout would, with the timeline 150 pixels above it.
             * @param top Top edge of the card.
             * @param height Height of the card.
             */
            const cardTopAt = (top: number, height = 400): void =>
            {
                vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement): DOMRect
                {
                    if (this.matches("article.card"))
                    {
                        return { top, bottom: top + height, height } as DOMRect;
                    }
                    if (this.matches(".timeline"))
                    {
                        return { top: top - 150, bottom: top - 16, height: 134 } as DOMRect;
                    }
                    return { top: 0, bottom: 0, height: this.matches(".nav-row") ? BUTTONS_HEIGHT : 0 } as DOMRect;
                });
                vi.spyOn(window, "innerHeight", "get").mockReturnValue(WINDOW_HEIGHT);
            };

            beforeEach(() =>
            {
                scrolled = [];
                Element.prototype.scrollIntoView = function scrollIntoView(this: Element): void
                {
                    scrolled.push(this);
                };
            });

            afterEach(() =>
            {
                Reflect.deleteProperty(Element.prototype, "scrollIntoView");
            });

            it("scrolls up to the timeline, not to the bar above it, when the question and its buttons fit below the timeline", () =>
            {
                cardTopAt(-200, WINDOW_HEIGHT - 150 - BUTTONS_HEIGHT);
                nextButton().click();
                expect(scrolled).toEqual([document.querySelector(".timeline")]);
            });

            it("scrolls up to the question itself when it is too long to fit below the timeline", () =>
            {
                cardTopAt(-200, WINDOW_HEIGHT - 150 - BUTTONS_HEIGHT + 1);
                nextButton().click();
                expect(scrolled).toEqual([document.querySelector("article.card")]);
            });

            it("scrolls up to the question in the training, which has no timeline", () =>
            {
                clickButton("Train");
                cardTopAt(-200, 100);
                pressKey("1");
                (document.getElementById("train-next") as HTMLElement).click();
                expect(scrolled).toEqual([document.querySelector("article.card")]);
            });

            it("leaves the page where it is when the start of the timeline is in view", () =>
            {
                cardTopAt(150);
                nextButton().click();
                expect(scrolled).toEqual([]);
            });

            it("goes back up to the timeline when only the question is at the top edge and a shorter question follows", () =>
            {
                cardTopAt(0, 300);
                nextButton().click();
                expect(scrolled).toEqual([document.querySelector(".timeline")]);
            });

            it("leaves the page where it is in the training when the start of the question is in view", () =>
            {
                clickButton("Train");
                cardTopAt(0, 100);
                pressKey("1");
                (document.getElementById("train-next") as HTMLElement).click();
                expect(scrolled).toEqual([]);
            });

            it("does not scroll when an answer is given, only when the question changes", () =>
            {
                cardTopAt(-200);
                answerRight();
                expect(scrolled).toEqual([]);
            });
        });

        it("sit in a widget of their own below the clock, so the progress widget is the same in every mode", () =>
        {
            /** The parts of the progress widget, without the numbers. */
            const shape = (): string[] => Array.from((document.querySelector(".aside .stats") as HTMLElement).children).map((part) => `${part.tagName} ${part.id}`.trim());
            const inPractice = shape();
            expect(document.getElementById("round-start-over")?.closest(".widget")?.className).toBe("widget round-widget");
            expect(document.querySelector(".round-widget h2")?.textContent).toBe("This round");
            expect(document.querySelector(".widget.stats h2")?.textContent).toBe("Your progress overall");
            expect(document.querySelector(".round-widget .hint")?.textContent).toBe("A round is one run through the questions you chose. It ends when every question is answered or skipped, or when you end it yourself.");
            expect(document.getElementById("round-start-over")?.getAttribute("title")).toBe("Draw the same questions again from the beginning");
            expect(document.getElementById("round-finish")?.getAttribute("title")).toBe("Stop here and see how the round went");
            expect(document.querySelector(".stats #round-finish")).toBeNull();
            answerWrong();
            expect(shape()).toEqual(inPractice);
            clickButton("Train");
            expect(shape()).toEqual(inPractice);
            expect(document.querySelector(".round-widget")).toBeNull();
            clickButton("Exam (33)");
            expect(shape()).toEqual(inPractice);
            expect(document.querySelector(".round-widget")).toBeNull();
        });

        it("is not offered when there is no round to end or start over", async () =>
        {
            app = await mountApp([]);
            expect(document.getElementById("round-finish")).toBeNull();
            expect(document.getElementById("round-start-over")).toBeNull();
        });
    });

    describe("the timeline strip", () =>
    {
        it("has arrows with an icon each, which are named, and which are off when there is nothing to scroll to", () =>
        {
            const left = document.querySelector("button[aria-label='Earlier questions']") as HTMLButtonElement;
            const right = document.querySelector("button[aria-label='Later questions']") as HTMLButtonElement;
            for (const arrow of [left, right])
            {
                expect(arrow.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
                expect(arrow.textContent).toBe("");
            }
            expect(left.getAttribute("aria-disabled")).toBe("true");
        });

        it("checks its arrows again when a scroll ends, and when the pointer or the keyboard comes to them, whatever was missed", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            const strip = document.querySelector(".timeline-strip") as HTMLElement;
            const left = document.querySelector("button[aria-label='Earlier questions']") as HTMLButtonElement;
            Object.defineProperty(strip, "clientWidth", { configurable: true, value: 100 });
            Object.defineProperty(strip, "scrollWidth", { configurable: true, value: 400 });
            // The strip moved, and no scroll event was seen.
            strip.scrollLeft = 150;
            expect(left.getAttribute("aria-disabled")).toBe("true");
            strip.dispatchEvent(new Event("scrollend"));
            expect(left.getAttribute("aria-disabled")).toBe("false");
            strip.scrollLeft = 0;
            (document.querySelector(".timeline-body") as HTMLElement).dispatchEvent(new Event("pointerover", { bubbles: true }));
            expect(left.getAttribute("aria-disabled")).toBe("true");
            strip.scrollLeft = 200;
            (document.querySelector(".timeline-body button") as HTMLElement).dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
            expect(left.getAttribute("aria-disabled")).toBe("false");
        });

        it("turns an arrow on when the strip can be scrolled that way, and off at the ends", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            const strip = document.querySelector(".timeline-strip") as HTMLElement;
            const left = document.querySelector("button[aria-label='Earlier questions']") as HTMLButtonElement;
            const right = document.querySelector("button[aria-label='Later questions']") as HTMLButtonElement;
            Object.defineProperty(strip, "clientWidth", { configurable: true, value: 100 });
            Object.defineProperty(strip, "scrollWidth", { configurable: true, value: 400 });
            strip.scrollLeft = 150;
            strip.dispatchEvent(new Event("scroll"));
            expect(left.getAttribute("aria-disabled")).toBe("false");
            expect(right.getAttribute("aria-disabled")).toBe("false");
            strip.scrollLeft = 300;
            strip.dispatchEvent(new Event("scroll"));
            expect(right.getAttribute("aria-disabled")).toBe("true");
            strip.scrollLeft = 0;
            strip.dispatchEvent(new Event("scroll"));
            expect(left.getAttribute("aria-disabled")).toBe("true");
            expect(right.getAttribute("aria-disabled")).toBe("false");
        });

        it("explains the resume mark in the legend too", () =>
        {
            clickButton("Legend");
            const entries = Array.from(document.querySelectorAll(".timeline-legend li")).map((item) => item.textContent);
            expect(entries).toContain("▸Where you left off");
            expect(document.querySelector(".legend-swatch.is-current")).not.toBeNull();
        });

        it("draws the current slot by its own state, so the colour of what happened to it stays readable", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerWrong();
            const current = document.querySelector(".slot.is-current") as HTMLElement;
            expect(current.classList.contains("is-wrong")).toBe(true);
            expect(current.getAttribute("aria-current")).toBe("step");
        });
    });

    describe("answering", () =>
    {
        it("reveals a correct answer", () =>
        {
            answerRight();
            expect(document.querySelectorAll(".option.is-correct")).toHaveLength(1);
            expect(document.querySelectorAll(".option.is-wrong")).toHaveLength(0);
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Correct.");
            expect(document.querySelector(".verdict #learn-why")?.textContent).toBe("Learn why");
            expect(document.querySelector(".verdict")?.className).toContain("ok");
            expect(document.querySelector(".option.is-correct .mark")?.textContent).toBe("Correct");
            expect(statValue("Seen")).toBe("1 of 310");
            expect(statValue("Accuracy")).toBe("100%");
            expect(visibleText(nextButton())).toBe("Next question");
        });

        it("reveals a wrong answer and highlights the right one", () =>
        {
            answerWrong();
            expect(document.querySelectorAll(".option.is-wrong")).toHaveLength(1);
            expect(document.querySelectorAll(".option.is-correct")).toHaveLength(1);
            expect(document.querySelector(".option.is-wrong .mark")?.textContent).toBe("Your answer");
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Not quite. The correct answer is highlighted.");
            expect(document.querySelector(".verdict")?.className).toContain("bad");
            expect(statValue("Accuracy")).toBe("0%");
            expect(statValue("Weak spots")).toBe("1");
        });

        it("lets the answer be changed by default: the round shows the new answer, the progress keeps the first", () =>
        {
            answerWrong();
            expect(document.querySelector(".timeline-counts")?.textContent).toBe("✓0✗1»0");
            expect(optionButtons().every((button) => !button.disabled)).toBe(true);
            answerRight();
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Correct.");
            expect(document.querySelector(".verdict #learn-why")?.textContent).toBe("Learn why");
            expect(document.querySelector(".timeline-counts")?.textContent).toBe("✓1✗0»0");
            expect(statValue("Weak spots")).toBe("1");
            expect(statValue("Accuracy")).toBe("0%");
            expect(statValue("Seen")).toBe("1 of 310");
        });

        it("records only the first answer: picking the right option after it was shown does not clear the weak spot", () =>
        {
            const number = shownNumber();
            answerWrong();
            answerRight();
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(saved.records[String(number)]).toEqual({ right: 0, wrong: 1, lastWrong: true });
        });

        it("records only the first answer the other way round too: a slip after a right answer makes no weak spot", () =>
        {
            const number = shownNumber();
            answerRight();
            answerWrong();
            expect(document.querySelector(".timeline-counts")?.textContent).toBe("✓0✗1»0");
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(saved.records[String(number)]).toEqual({ right: 1, wrong: 0, lastWrong: false });
            expect(statValue("Weak spots")).toBe("0");
        });

        it("ignores a second click on the option that was already chosen", () =>
        {
            answerWrong();
            const number = shownNumber();
            answerWrong();
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(saved.records[String(number)].wrong).toBe(1);
        });

        it("disables every option once answered and ignores further answers when answers are locked", () =>
        {
            startRound({ lock: true });
            answerRight();
            expect(optionButtons().every((button) => button.disabled)).toBe(true);
            pressKey("1");
            pressKey("b");
            expect(statValue("Seen")).toBe("1 of 310");
            expect(document.querySelector(".timeline-counts")?.textContent).toBe("✓1✗0»0");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Answers locked");
        });

        it("persists the answer to localStorage", () =>
        {
            const number = shownNumber();
            answerWrong();
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(saved.records[String(number)]).toEqual({ right: 0, wrong: 1, lastWrong: true });
        });

        it("moves on with the right hand button and shows a fresh question", () =>
        {
            const first = shownNumber();
            answerRight();
            nextButton().click();
            expect(shownNumber()).not.toBe(first);
            expect(document.querySelector(".verdict")).toBeNull();
            expect(visibleText(nextButton())).toBe("Skip");
        });

        it("shuffles the options in a random round", () =>
        {
            const orders = new Set<string>();
            startRound({ scope: "general", order: "random" });
            for (let index = 0; index < 40; index++)
            {
                const question = REAL_QUESTIONS.find((entry) => entry.n === shownNumber()) as typeof REAL_QUESTIONS[number];
                if (!question.img)
                {
                    orders.add(optionButtons().map(mainText).map((text) => question.a.indexOf(text)).join(""));
                }
                nextButton().click();
            }
            expect(orders.size).toBeGreaterThan(1);
        });
    });

    describe("random round", () =>
    {
        it("shows every question of a selection once, and none twice", () =>
        {
            startRound({ scope: "berlin" });
            const seen = walk(10);
            expect(new Set(seen).size).toBe(10);
            expect(seen.every((number) => number > app.LAST_GENERAL_NUMBER)).toBe(true);
        });

        it("ends after the last question with a card instead of repeating", () =>
        {
            startRound({ scope: "berlin" });
            walk(10);
            expect(document.querySelector("article.card")).toBeNull();
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Round done: 10 of 10 correct");
        });

        it("decides the next question only when the user moves on", () =>
        {
            startRound({ scope: "berlin", order: "random" });
            expect(slots()).toHaveLength(1);
            expect(document.querySelector(".slot-unknown")).not.toBeNull();
            expect(document.querySelector(".slot-more")?.textContent).toBe("+ 8 more");
            answerRight();
            expect(slots()).toHaveLength(1);
            nextButton().click();
            expect(slots()).toHaveLength(2);
            expect(document.querySelector(".slot-more")?.textContent).toBe("+ 7 more");
        });

        it("shows a notice instead of a question when the bank is empty", async () =>
        {
            app = await mountApp([]);
            expect(document.querySelector("article.card")).toBeNull();
            expect(document.querySelector(".card.empty h2")?.textContent).toBe("There are no questions in this selection.");
        });

        it("keeps working with a single question", async () =>
        {
            const only = [makeQuestion(1)];
            app = await mountApp(only);
            expect(shownNumber()).toBe(1);
            optionButtons()[correctIndex(only)].click();
            expect(visibleText(nextButton())).toBe("To the result");
            nextButton().click();
            expect(document.querySelector(".end-card")).not.toBeNull();
        });
    });

    describe("booklet order", () =>
    {
        it("shows the questions of the selection in the order of the booklet", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            expect(walk(10)).toEqual([321, 322, 323, 324, 325, 326, 327, 328, 329, 330]);
        });

        it("starts at question 1 for all topics", () =>
        {
            startRound({ scope: "all", order: "booklet" });
            expect(walk(5)).toEqual([1, 2, 3, 4, 5]);
        });

        it("shows the answers in the order they are printed", () =>
        {
            startRound({ scope: "general", order: "booklet" });
            for (let index = 0; index < 8; index++)
            {
                const question = REAL_QUESTIONS.find((entry) => entry.n === shownNumber()) as typeof REAL_QUESTIONS[number];
                expect(optionButtons().map(mainText)).toEqual(question.a);
                nextButton().click();
            }
        });

        it("puts every question of the round in the timeline from the start, so the coming ones are real numbers", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            expect(slots().map((slot) => slot.querySelector(".slot-number")?.textContent)).toEqual(
                ["BE 1", "BE 2", "BE 3", "BE 4", "BE 5", "BE 6", "BE 7", "BE 8", "BE 9", "BE 10"]);
            expect(document.querySelector(".slot-unknown")).toBeNull();
        });

        it("keeps the order inside a selection of topics, whatever the order in which they were ticked", () =>
        {
            startRound({ topics: ["staatssymbole", "grundrechte"], order: "booklet" });
            const seen = walk(5);
            expect(seen).toEqual([...seen].sort((first, second) => first - second));
        });
    });

    describe("timeline", () =>
    {
        it("marks the current question, and what was right, wrong or skipped", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            nextButton().click();
            answerWrong();
            nextButton().click();
            nextButton().click();
            expect(slotStates().slice(0, 4)).toEqual(["correct", "wrong", "skipped", "open"]);
            expect(slots()[3].getAttribute("aria-current")).toBe("step");
            expect(slots()[0].getAttribute("aria-label")).toBe("Question BE 1, correct");
            expect(slots()[1].getAttribute("aria-label")).toBe("Question BE 2, wrong");
            expect(slots()[2].getAttribute("aria-label")).toBe("Question BE 3, skipped");
            expect(slots()[3].getAttribute("aria-label")).toBe("Question BE 4, current question");
            expect(slots()[4].getAttribute("aria-label")).toBe("Question BE 5, not yet asked");
        });

        it("does not rely on colour: each state has its own mark", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            nextButton().click();
            answerWrong();
            nextButton().click();
            nextButton().click();
            expect(slots().slice(0, 3).map((slot) => slot.querySelector(".slot-glyph")?.textContent)).toEqual(["✓", "✗", "»"]);
        });

        it("counts correct, wrong and skipped in the head", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            nextButton().click();
            answerWrong();
            nextButton().click();
            nextButton().click();
            expect(document.querySelector(".timeline-progress")?.textContent).toBe("2 of 10 answered");
            expect(document.querySelector(".timeline-counts")?.textContent).toBe("✓1✗1»1");
        });

        it("explains its symbols in a legend that can be shown and hidden", () =>
        {
            expect(document.querySelector(".timeline-legend")).toBeNull();
            clickButton("Legend");
            expect(document.querySelectorAll(".timeline-legend li")).toHaveLength(7);
            expect(buttonByText("Legend")?.getAttribute("aria-expanded")).toBe("true");
            clickButton("Legend");
            expect(document.querySelector(".timeline-legend")).toBeNull();
        });

        it("shows an answered question again, with its answer, when its slot is clicked, and goes back with the right hand button", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerWrong();
            nextButton().click();
            slots()[0].click();
            expect(shownNumber()).toBe(321);
            expect(document.querySelector(".banner")).toBeNull();
            expect(document.querySelectorAll(".option.is-wrong")).toHaveLength(1);
            expect(optionButtons().every((button) => !button.disabled)).toBe(true);
            expect(visibleText(nextButton())).toBe("Back to question BE 2");
            nextButton().click();
            expect(shownNumber()).toBe(322);
        });

        it("shows an answered question again, locked, when answers are locked", () =>
        {
            startRound({ scope: "berlin", order: "booklet", lock: true });
            answerWrong();
            nextButton().click();
            slots()[0].click();
            expect(shownNumber()).toBe(321);
            expect(document.querySelector(".banner-review")?.textContent).toBe("Review: this is your answer. It is locked.");
            expect(optionButtons().every((button) => button.disabled)).toBe(true);
            expect(document.querySelectorAll(".option.is-wrong")).toHaveLength(1);
            expect(visibleText(nextButton())).toBe("Back to question BE 2");
            nextButton().click();
            expect(shownNumber()).toBe(322);
            expect(document.querySelector(".banner")).toBeNull();
        });

        it("does not record anything when a locked question is looked at", () =>
        {
            startRound({ scope: "berlin", order: "booklet", lock: true });
            answerWrong();
            nextButton().click();
            slots()[0].click();
            pressKey("1");
            pressKey("2");
            expect(statValue("Seen")).toBe("1 of 310");
        });

        it("lets a skipped question be answered later, in its own place", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            nextButton().click();
            slots()[0].click();
            expect(shownNumber()).toBe(321);
            expect(document.querySelector(".banner-skipped")?.textContent).toBe("Skipped. Answer it now or go back to question BE 2.");
            answerRight();
            expect(slotStates()[0]).toBe("correct");
            expect(statValue("Seen")).toBe("1 of 310");
        });

        it("jumps to a question that was not asked yet and goes on from there", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            slots()[5].click();
            expect(shownNumber()).toBe(326);
            answerRight();
            nextButton().click();
            expect(shownNumber()).toBe(327);
        });

        it("marks the questions that a jump passes over as skipped, the same as the Skip button does", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            slots()[5].click();
            expect(slotStates().slice(0, 7)).toEqual(["skipped", "skipped", "skipped", "skipped", "skipped", "open", "open"]);
            expect(document.querySelector(".timeline-counts")?.textContent).toBe("✓0✗0»5");
        });

        it("marks the question that was left without an answer when the user jumps from it", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            slots()[1].click();
            expect(slotStates().slice(0, 3)).toEqual(["skipped", "open", "open"]);
        });

        it("does not mark anything when the user jumps back to look at an answered question", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            nextButton().click();
            slots()[0].click();
            expect(slotStates().slice(0, 3)).toEqual(["correct", "resume", "open"]);
        });

        it("scrolls with its arrow buttons, which are named", () =>
        {
            const left = document.querySelector("button[aria-label='Earlier questions']");
            const right = document.querySelector("button[aria-label='Later questions']");
            expect(left).not.toBeNull();
            expect(right).not.toBeNull();
            (right as HTMLButtonElement).click();
            expect(document.querySelector(".timeline")).not.toBeNull();
        });

        it("moves between the slots with the arrow keys and keeps one tab stop", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            nextButton().click();
            expect(slots().filter((slot) => slot.tabIndex === 0)).toHaveLength(1);
            slots()[1].focus();
            slots()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
            expect(document.activeElement).toBe(slots()[0]);
            expect(slots()[0].tabIndex).toBe(0);
            expect(slots()[1].tabIndex).toBe(-1);
            slots()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
            expect(document.activeElement).toBe(slots()[9]);
        });
    });

    describe("skipping", () =>
    {
        it("moves on without an answer, and shows the question as skipped", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            expect(visibleText(nextButton())).toBe("Skip");
            nextButton().click();
            expect(shownNumber()).toBe(322);
            expect(slotStates()[0]).toBe("skipped");
            expect(statValue("Seen")).toBe("0 of 310");
        });

        it("does not count a skipped question as wrong, or as seen", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            nextButton().click();
            expect(statValue("Weak spots")).toBe("0");
            expect(statValue("Accuracy")).toBe("none yet");
        });

        it("skips with Enter and the right arrow too", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            pressKey("Enter");
            expect(shownNumber()).toBe(322);
            pressKey("ArrowRight");
            expect(shownNumber()).toBe(323);
        });

        it("offers the skipped questions again at the end, and ends once they are answered", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            nextButton().click();
            walk(9);
            expect(document.querySelector(".end-card h2")?.textContent).toBe("All new questions are done");
            expect(document.querySelector(".end-card")?.textContent).toContain("1 skipped.");
            clickButton("Answer skipped questions (1)");
            expect(shownNumber()).toBe(321);
            expect(document.querySelector(".end-card")).toBeNull();
            // The timeline marks the question that shows as the current one, also now that the round has ended once.
            const current = document.querySelector(".slot[aria-current=step]") as HTMLElement;
            expect(current.getAttribute("aria-label")).toBe("Question BE 1, current question");
            expect(current.className).toContain("is-current");
            answerRight();
            expect(visibleText(nextButton())).toBe("To the result");
            nextButton().click();
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Round done: 10 of 10 correct");
        });

        it("leaves a question skipped when the user passes it again at the end", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            nextButton().click();
            walk(9);
            clickButton("Answer skipped questions (1)");
            nextButton().click();
            expect(document.querySelector(".end-card h2")?.textContent).toBe("All new questions are done");
        });

        it("skips in a random round, too", () =>
        {
            startRound({ scope: "berlin", order: "random" });
            const first = shownNumber();
            nextButton().click();
            expect(shownNumber()).not.toBe(first);
            expect(slotStates()[0]).toBe("skipped");
        });
    });

    describe("going back", () =>
    {
        it("is disabled on the first question", () =>
        {
            expect((buttonByText("Back") as HTMLButtonElement).disabled).toBe(true);
        });

        it("shows the previous question that was answered or skipped, and Left arrow does the same", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            nextButton().click();
            clickButton("Back");
            expect(shownNumber()).toBe(321);
            nextButton().click();
            expect(shownNumber()).toBe(322);
            pressKey("ArrowLeft");
            expect(shownNumber()).toBe(321);
        });
    });

    describe("end of the round", () =>
    {
        it("says how it went, and offers to practise the mistakes of the round", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            walk(3, answerWrong);
            walk(7);
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Round done: 7 of 10 correct");
            expect(document.querySelector(".end-card p")?.textContent).toBe("10 of 10 answered: 7 correct, 3 wrong.");
            clickButton("Practise the mistakes of this round (3)");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Mistakes of this round · 3 questions");
            expect(walk(3)).toEqual([321, 322, 323]);
        });

        it("does not offer mistakes when there are none", () =>
        {
            startRound({ scope: "berlin" });
            walk(10);
            expect(buttonByText("Practise the mistakes of this round (0)")).toBeUndefined();
        });

        it("starts another round over the same selection with Again", () =>
        {
            startRound({ scope: "berlin" });
            walk(10);
            clickButton("Again");
            expect(document.querySelector("article.card")).not.toBeNull();
            expect(document.querySelector(".timeline-progress")?.textContent).toBe("0 of 10 answered");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Berlin · 10 questions");
        });

        it("opens the topic panel with Change selection", () =>
        {
            startRound({ scope: "berlin" });
            walk(10);
            clickButton("Change selection");
            expect(document.getElementById("topic-panel")).not.toBeNull();
        });

        it("still shows its slots, so any question can be looked at", () =>
        {
            startRound({ scope: "berlin", order: "booklet", lock: true });
            walk(10);
            slots()[4].click();
            expect(shownNumber()).toBe(325);
            expect(document.querySelector(".banner-review")).not.toBeNull();
        });
    });

    describe("topic panel", () =>
    {
        /** The ticked subject ids. */
        function ticked(): string[]
        {
            return Array.from(document.querySelectorAll<HTMLInputElement>("input[id^='topic-']:checked")).map((input) => input.id.slice(6));
        }

        it("is closed at first, and opens with Change selection", () =>
        {
            expect(document.getElementById("topic-panel")).toBeNull();
            clickButton("Change selection");
            expect(document.getElementById("topic-panel")).not.toBeNull();
            expect(document.getElementById("change-selection")?.getAttribute("aria-expanded")).toBe("true");
            expect(document.activeElement?.id).toBe("panel-title");
        });

        it("has its sections in this order: order, subjects, the questions of your state, weak spots, answers", () =>
        {
            clickButton("Change selection");
            const headings = Array.from(document.querySelectorAll("#topic-panel .panel-heading")).map((heading) => heading.textContent);
            expect(headings).toEqual(["Order", "Topics", "Questions of your state", "Weak spots", "Answers"]);
        });

        it("lists the 13 subjects under three groups, all ticked at first, with their number of questions", () =>
        {
            clickButton("Change selection");
            expect(ticked()).toHaveLength(13);
            expect(Array.from(document.querySelectorAll(".topic-group legend")).map((legend) => legend.textContent)).toEqual([
                "Government and democracy (131)", "History and Europe (88)", "Everyday life and society (81)"]);
            const bank = new app.QuestionBank(REAL_BUNDLE);
            const counts = Array.from(document.querySelectorAll(".topic-group .topic-count")).map((count) => Number(count.textContent));
            expect(counts.reduce((sum, count) => sum + count, 0)).toBe(bank.general.length);
        });

        it("offers one checkbox for the questions of your state, named after it, ticked at first, and no list of states", () =>
        {
            clickButton("Change selection");
            expect(document.querySelectorAll("input[id^='state-']")).toHaveLength(0);
            const box = document.getElementById("include-state") as HTMLInputElement;
            expect(box.checked).toBe(true);
            expect(box.closest("label")?.textContent).toContain("State - Berlin");
            expect(box.closest("label")?.textContent).toContain("10 questions. You change your state at the bottom of the page.");
        });

        it("picks more than one subject, and starts a round over exactly those", () =>
        {
            startRound({ topics: ["staatssymbole", "bund-laender-gemeinden"] });
            const bank = new app.QuestionBank(REAL_BUNDLE);
            const expected = bank.select(["staatssymbole", "bund-laender-gemeinden"], []).length;
            expect(document.querySelector(".round-bar")?.textContent).toContain(`2 topics · ${expected} questions`);
            const seen = new Set<string>();
            for (let index = 0; index < expected; index++)
            {
                seen.add((document.querySelector(".tag-topic") as HTMLElement).textContent as string);
                nextButton().click();
            }
            expect(seen).toEqual(new Set(["State symbols and basic facts", "Federation, states and municipalities"]));
        });

        it("holds the ten questions of your state as well as the subjects, in the order of the booklet", () =>
        {
            startRound({ scope: "general", includeState: true, order: "booklet" });
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Berlin · 310 questions");
            expect(document.querySelectorAll(".timeline-list button.slot")).toHaveLength(310);
            const labels = slots().slice(300).map((slot) => slot.querySelector(".slot-number")?.textContent);
            expect(labels.slice(0, 2)).toEqual(["BE 1", "BE 2"]);
            expect(labels[9]).toBe("BE 10");
        });

        it("names the state that was chosen at the bottom of the page, and only that one", () =>
        {
            chooseState("thueringen");
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Thuringia · 310 questions");
            startRound({ topics: "none", includeState: true });
            expect(document.querySelector(".round-bar")?.textContent).toContain("Thuringia · 10 questions");
            startRound({ scope: "general" });
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics · 300 questions");
        });

        it("shows the number of questions the choice gives, before it is started", () =>
        {
            clickButton("Change selection");
            expect(document.querySelector(".panel-count")?.textContent).toBe("310 questions from 13 topics and Berlin");
            (document.getElementById("include-state") as HTMLInputElement).click();
            expect(document.querySelector(".panel-count")?.textContent).toBe("300 questions from 13 topics");
            (document.getElementById("topic-grundrechte") as HTMLInputElement).click();
            expect(document.querySelector(".panel-count")?.textContent).toBe("279 questions from 12 topics");
            (document.getElementById("include-state") as HTMLInputElement).click();
            expect(document.querySelector(".panel-count")?.textContent).toBe("289 questions from 12 topics and Berlin");
        });

        it("marks the quick pick that matches the ticked boxes", () =>
        {
            clickButton("Change selection");
            expect(document.getElementById("preset-all")?.getAttribute("aria-pressed")).toBe("true");
            (document.getElementById("preset-none") as HTMLButtonElement).click();
            expect(document.getElementById("preset-none")?.getAttribute("aria-pressed")).toBe("true");
            expect(document.getElementById("preset-all")?.getAttribute("aria-pressed")).toBe("false");
            expect(ticked()).toEqual([]);
        });

        it("can be started with no subject if the questions of your state are included, and not with nothing ticked", () =>
        {
            clickButton("Change selection");
            (document.getElementById("preset-none") as HTMLButtonElement).click();
            expect((document.getElementById("panel-start") as HTMLButtonElement).disabled).toBe(false);
            (document.getElementById("include-state") as HTMLInputElement).click();
            expect((document.getElementById("panel-start") as HTMLButtonElement).disabled).toBe(true);
            expect(document.querySelector(".panel-count")?.textContent).toBe("Choose at least one topic.");
        });

        it("changes nothing in the round until it is started", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            const number = shownNumber();
            clickButton("Change selection");
            (document.getElementById("preset-all") as HTMLButtonElement).click();
            expect(document.querySelector(".round-bar")?.textContent).toContain("Berlin · 10 questions");
            expect(shownNumber()).toBe(number);
        });

        it("says that a new round ends the current one, when the current one has answers", () =>
        {
            clickButton("Change selection");
            expect(document.querySelector(".panel-consequence")).toBeNull();
            clickButton("Close");
            answerRight();
            clickButton("Change selection");
            expect(document.querySelector(".panel-consequence")?.textContent).toBe("The current round (1 of 310) ends.");
        });

        it("keeps the round on Cancel, and on Escape, and gives focus back to its button", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            clickButton("Change selection");
            (document.getElementById("preset-all") as HTMLButtonElement).click();
            clickButton("Cancel");
            expect(document.getElementById("topic-panel")).toBeNull();
            expect(document.activeElement?.id).toBe("change-selection");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Berlin · 10");
            clickButton("Change selection");
            pressKey("Escape");
            expect(document.getElementById("topic-panel")).toBeNull();
            expect(ticked()).toEqual([]);
        });

        it("starts with the saved choice ticked", () =>
        {
            startRound({ topics: ["familie-bildung-alltag"], includeState: true, order: "booklet", lock: true });
            clickButton("Change selection");
            expect(ticked()).toEqual(["familie-bildung-alltag"]);
            expect((document.getElementById("include-state") as HTMLInputElement).checked).toBe(true);
            expect((document.getElementById("order-booklet") as HTMLInputElement).checked).toBe(true);
            expect((document.getElementById("lock-answers") as HTMLInputElement).checked).toBe(true);
        });

        it("does not take the answer keys while a topic or the state box is focused", () =>
        {
            clickButton("Change selection");
            pressKey("1", {}, document.getElementById("topic-grundrechte") as HTMLElement);
            pressKey("2", {}, document.getElementById("include-state") as HTMLElement);
            expect(document.querySelector(".verdict")).toBeNull();
        });

        it("describes the choice in words: a group, all topics, or a list", () =>
        {
            startRound({ scope: "general" });
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics · 300 questions");
            startRound({ topics: ["nationalsozialismus", "nachkriegszeit-ddr-einheit", "europa"] });
            expect(document.querySelector(".round-bar")?.textContent).toContain("History and Europe · 88 questions");
        });

        it("saves the subjects, whether the state questions are included, the order and the lock, and restores them on the next visit", async () =>
        {
            startRound({ topics: ["familie-bildung-alltag"], includeState: false, order: "booklet", lock: true });
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(saved.topics).toEqual(["familie-bildung-alltag"]);
            expect(saved.includeState).toBe(false);
            expect(saved.order).toBe("booklet");
            expect(saved.lockAnswers).toBe(true);
            app = await mountApp();
            expect(document.querySelector(".round-bar")?.textContent).toContain("Booklet order");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Answers locked");
            expect(document.querySelector(".round-bar")?.textContent).toContain("1 topic · 22 questions");
        });

        it("stores no list of subjects when all are ticked, and starts with Berlin", () =>
        {
            startRound({ scope: "berlin" });
            startRound({ scope: "all" });
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(saved.topics).toBeNull();
            expect(saved.state).toBe("berlin");
            expect(saved.includeState).toBe(true);
            expect(saved.lockAnswers).toBe(false);
        });

        it("keeps answers open by default, and the lock is an opt-in setting in this panel", () =>
        {
            clickButton("Change selection");
            const lock = document.getElementById("lock-answers") as HTMLInputElement;
            expect(lock.checked).toBe(false);
            expect(document.querySelector("#topic-panel")?.contains(lock)).toBe(true);
            expect(lock.closest("label")?.textContent).toContain("can then no longer be changed");
        });

        it("applies the lock to the next round, not to the one that is running", () =>
        {
            answerRight();
            startRound({ lock: true });
            answerRight();
            expect(optionButtons().every((button) => button.disabled)).toBe(true);
        });
    });

    describe("keyboard", () =>
    {
        it("leaves the question below alone while the choice of subjects lies over it", () =>
        {
            const number = shownNumber();
            clickButton("Change selection");
            for (const key of ["1", "b", "t", "Enter", "ArrowRight"])
            {
                pressKey(key);
            }
            expect(optionButtons().some((button) => button.getAttribute("aria-pressed") === "true")).toBe(false);
            expect(statValue("Seen")).toBe("0 of 310");
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-pressed")).toBe("false");
            clickButton("Close");
            expect(shownNumber()).toBe(number);
        });

        it("skips only once for a key that is held down", () =>
        {
            const number = shownNumber();
            pressKey("ArrowRight");
            const next = shownNumber();
            pressKey("ArrowRight", { repeat: true });
            pressKey("ArrowRight", { repeat: true });
            expect(next).not.toBe(number);
            expect(shownNumber()).toBe(next);
        });

        it("leaves Enter to a link and to a list that opens, instead of skipping the question", () =>
        {
            const number = shownNumber();
            const link = document.querySelector(".site-copyright a") as HTMLElement;
            pressKey("Enter", {}, link);
            const summary = document.querySelector(".kbd-help summary") as HTMLElement;
            pressKey("Enter", {}, summary);
            expect(shownNumber()).toBe(number);
        });

        it("keeps the list of keys open when the page is drawn anew after an answer", () =>
        {
            const help = (): HTMLDetailsElement => document.querySelector(".kbd-help") as HTMLDetailsElement;
            help().open = true;
            help().dispatchEvent(new Event("toggle"));
            pressKey("1");
            expect(help().open).toBe(true);
            help().open = false;
            help().dispatchEvent(new Event("toggle"));
            pressKey("Enter");
            expect(help().open).toBe(false);
        });

        it("takes a second press of T back while the translation is still on its way", async () =>
        {
            const fetchFile = window.fetch;
            let release: () => void = () => undefined;
            const held = new Promise<void>((done) =>
            {
                release = done;
            });
            window.fetch = (async (input: RequestInfo | URL) =>
            {
                if (String(input).includes("questions.uk.json"))
                {
                    await held;
                }
                return fetchFile(input);
            }) as typeof fetch;
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ setupDone: true, translationLanguage: "uk" }));
            app = await mountApp();
            pressKey("t");
            pressKey("t");
            release();
            await settle();
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-pressed")).toBe("false");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).translation).toBe("off");
        });

        it.each([["1", 0], ["2", 1], ["3", 2], ["4", 3], ["a", 0], ["B", 1], ["c", 2], ["D", 3]])(
            "key %s picks option %d", (key, index) =>
            {
                pressKey(key);
                expect(optionButtons()[index].getAttribute("aria-pressed")).toBe("true");
                expect(optionButtons().filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
            });

        it("Enter and ArrowRight go to the next question after answering", () =>
        {
            const first = shownNumber();
            pressKey("1");
            pressKey("Enter");
            const second = shownNumber();
            expect(second).not.toBe(first);
            pressKey("1");
            pressKey("ArrowRight");
            expect(shownNumber()).not.toBe(second);
        });

        it("ignores other keys", () =>
        {
            pressKey("z");
            pressKey("Tab");
            pressKey("5");
            expect(document.querySelector(".verdict")).toBeNull();
        });

        it.each([["ctrlKey"], ["metaKey"], ["altKey"]])("ignores shortcuts with %s", (modifier) =>
        {
            pressKey("1", { [modifier]: true });
            expect(document.querySelector(".verdict")).toBeNull();
        });

        it("ignores keys typed into the translation list", () =>
        {
            (document.getElementById("translation-button") as HTMLButtonElement).click();
            pressKey("a", {}, document.getElementById("translation-list") as HTMLElement);
            pressKey("1", {}, document.getElementById("translation-list") as HTMLElement);
            expect(document.querySelector(".verdict")).toBeNull();
        });

        it("ignores the arrow keys on the mode tabs, which move between the tabs instead", () =>
        {
            pressKey("ArrowRight", {}, document.getElementById("tab-practice") as HTMLElement);
            expect(document.getElementById("tab-train")?.getAttribute("aria-selected")).toBe("true");
            pressKey("ArrowLeft", {}, document.getElementById("tab-train") as HTMLElement);
            expect(document.getElementById("tab-practice")?.getAttribute("aria-selected")).toBe("true");
            expect(document.querySelector(".verdict")).toBeNull();
            expect(slotStates()[0]).toBe("current".replace("current", "open"));
        });

        it("ignores the arrow keys on the timeline, which move between its slots instead", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            pressKey("ArrowRight", {}, slots()[0]);
            expect(shownNumber()).toBe(321);
        });

        it("still answers with the number and letter keys while a tab has focus, because the tab keeps focus after a click", () =>
        {
            pressKey("2", {}, document.getElementById("tab-practice") as HTMLElement);
            expect(document.querySelector(".verdict")).not.toBeNull();
        });

        it("still answers with the number and letter keys after a choice in the translation list, which gives focus back to its button", async () =>
        {
            await chooseTranslation("en");
            expect(document.activeElement?.id).toBe("translation-button");
            pressKey("c", {}, document.getElementById("translation-button") as HTMLElement);
            expect(document.querySelector(".verdict")).not.toBeNull();
        });

        it("ignores keys typed into an input", () =>
        {
            const input = document.createElement("input");
            document.body.append(input);
            pressKey("1", {}, input);
            expect(document.querySelector(".verdict")).toBeNull();
        });

        it("lets Enter activate a focused button instead of also advancing", () =>
        {
            pressKey("1");
            const first = shownNumber();
            pressKey("Enter", {}, buttonByText("Legend") as HTMLButtonElement);
            expect(shownNumber()).toBe(first);
        });

        it("ignores an option key beyond the number of options", async () =>
        {
            app = await mountApp([makeQuestion(1, { a: ["Ja", "Nein"], ae: ["Yes", "No"] })]);
            expect(optionButtons()).toHaveLength(2);
            pressKey("4");
            pressKey("d");
            expect(document.querySelector(".verdict")).toBeNull();
            pressKey("2");
            expect(document.querySelector(".verdict")).not.toBeNull();
        });

        it("does not move the round while the topic panel is open", () =>
        {
            const first = shownNumber();
            clickButton("Change selection");
            pressKey("Enter");
            pressKey("ArrowRight");
            expect(shownNumber()).toBe(first);
        });
    });

    describe("translation", () =>
    {
        it("is off to begin with: German only, as in the real test", () =>
        {
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
            expect(document.querySelector(".question .bi-main")?.getAttribute("lang")).toBe("de");
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-pressed")).toBe("false");
        });

        it("is a button in the question card that shows or hides it, with an arrow beside it for the language", () =>
        {
            const toggle = document.querySelector("article.card #translation-toggle") as HTMLButtonElement;
            const arrow = document.querySelector("article.card #translation-button") as HTMLButtonElement;
            expect(toggle.textContent).toContain("Translation");
            expect(arrow.getAttribute("aria-label")).toBe("Translation of the question: Automatic (English)");
            expect(arrow.textContent).toBe("");
            expect(toggle.nextElementSibling?.contains(arrow)).toBe(true);
        });

        it("offers automatic and every language but German in the list of the arrow, and explains automatic", () =>
        {
            (document.getElementById("translation-button") as HTMLButtonElement).click();
            const options = Array.from(document.querySelectorAll("#translation-list [role=option]"));
            expect(options.map((option) => option.getAttribute("data-value"))).toEqual(["auto", "en", "ar", "uk", "tr", "es", "hi"]);
            expect(options[0].textContent).toContain("Site language (English if German)");
        });

        it("shows the translation in the language of the site, and in English when the site is German", async () =>
        {
            app = await mountApp(undefined, { locale: "uk" });
            (document.getElementById("translation-toggle") as HTMLButtonElement).click();
            await settle();
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("uk");
            window.localStorage.clear();
            app = await mountApp(undefined, { locale: "de" });
            (document.getElementById("translation-toggle") as HTMLButtonElement).click();
            await settle();
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("en");
        });

        it("follows the site language while it is automatic, and keeps the language that was picked", async () =>
        {
            app = await mountApp(undefined, { locale: "uk" });
            (document.getElementById("translation-toggle") as HTMLButtonElement).click();
            await settle();
            await chooseFromListbox("site-language", "tr");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("tr");
            await chooseFromListbox("translation", "es");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("es");
            await chooseFromListbox("site-language", "uk");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("es");
            await chooseFromListbox("translation", "auto");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("uk");
        });

        it("turns the translation on when a language is picked, and a picked language stays when it is switched off and on", async () =>
        {
            await chooseFromListbox("translation", "hi");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("hi");
            (document.getElementById("translation-toggle") as HTMLButtonElement).click();
            await settle();
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
            (document.getElementById("translation-toggle") as HTMLButtonElement).click();
            await settle();
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("hi");
        });

        it("shows English below the German text, never in place of it", async () =>
        {
            startRound({ scope: "general", order: "booklet" });
            await chooseTranslation("en");
            const question = document.querySelector(".question") as Element;
            expect(question.querySelector(".bi-main")?.getAttribute("lang")).toBe("de");
            expect(question.querySelector(".bi-sub")?.getAttribute("lang")).toBe("en");
            const number = shownNumber();
            const entry = REAL_QUESTIONS.find((candidate) => candidate.n === number) as typeof REAL_QUESTIONS[number];
            expect(mainText(question)).toBe(entry.q);
            expect(question.querySelector(".bi-sub")?.textContent).toBe(entry.qe);
            expect(document.querySelectorAll(".option .bi-sub").length).toBeGreaterThan(0);
        });

        it("goes back to German only", async () =>
        {
            await chooseTranslation("en");
            await chooseTranslation("off");
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
        });

        it("marks the translation as unofficial, and says so in a line on the card", async () =>
        {
            await chooseTranslation("en");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("title")).toBe("Unofficial translation. The German text is the one that counts.");
            expect(document.querySelector(".question .bi-main")?.hasAttribute("title")).toBe(false);
            // The language name is wrapped in invisible isolates, so a name in another script keeps its direction.
            expect((document.querySelector(".unofficial-note")?.textContent ?? "").replace(/[\u2068\u2069]/g, "")).toBe("English: unofficial translation, the German text is authoritative");
        });

        it("hides the translation line when it equals the German text", async () =>
        {
            app = await mountApp([makeQuestion(1, { q: "Berlin", qe: " Berlin ", a: ["1", "2", "3", "4"], ae: ["1", "2", "3", "4"] })]);
            await chooseTranslation("en");
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
            expect(document.querySelectorAll(".bi-main").length).toBeGreaterThan(0);
        });

        it("is switched with the T key, which brings it back in the same language", async () =>
        {
            await chooseFromListbox("translation", "es");
            pressKey("T");
            await settle();
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
            pressKey("t");
            await settle();
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("es");
        });

        it("does not hide a question that was answered when it is switched", async () =>
        {
            answerWrong();
            await chooseTranslation("en");
            expect(document.querySelector(".verdict")).not.toBeNull();
            expect(document.querySelectorAll(".option.is-wrong")).toHaveLength(1);
        });

        it("saves the choice and restores it", async () =>
        {
            await chooseTranslation("en");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).translation).toBe("en");
            app = await mountApp();
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-pressed")).toBe("true");
            expect(document.querySelectorAll(".bi-sub").length).toBeGreaterThan(0);
        });

        it("names the category in the language of the site, not of the translation", () =>
        {
            startRound({ topics: ["bund-laender-gemeinden"] });
            expect(document.querySelector(".tag-topic")?.textContent).toBe("Federation, states and municipalities");
        });
    });

    describe("weak spots", () =>
    {
        it("clears the limit to weak spots in the open panel when the last weak spot is answered right below it", () =>
        {
            const number = shownNumber();
            optionButtons()[wrongIndex()].click();
            clickButton("Practice weak spots");
            expect(shownNumber()).toBe(number);
            clickButton("Change selection");
            expect((document.getElementById("only-weak") as HTMLInputElement).checked).toBe(true);
            optionButtons()[correctIndex()].click();
            const only = document.getElementById("only-weak") as HTMLInputElement;
            expect(only.disabled).toBe(true);
            expect(only.checked).toBe(false);
            expect(buttonByText("Start new round")?.disabled).toBe(false);
        });

        it("has a button for them in the progress widget that is off until there are some, so the widget keeps its height", () =>
        {
            expect((document.getElementById("practice-weak") as HTMLButtonElement).disabled).toBe(true);
            answerWrong();
            expect(buttonByText("Practice weak spots")?.disabled).toBe(false);
            expect(document.querySelectorAll("[role=tab]")).toHaveLength(4);
        });

        it("starts a round over every weak spot with the button, whatever the subjects are", () =>
        {
            startRound({ topics: ["grundrechte"], includeState: false });
            const wrongNumber = shownNumber();
            answerWrong();
            startRound({ topics: ["staatsorgane"], includeState: false });
            clickButton("Practice weak spots");
            expect(shownNumber()).toBe(wrongNumber);
            expect(document.querySelector(".round-bar")?.textContent).toContain("All my weak spots · 1 question");
        });

        it("drops a question from the count once it is answered right, and keeps the round it is in", () =>
        {
            const wrongNumber = shownNumber();
            answerWrong();
            clickButton("Practice weak spots");
            expect(shownNumber()).toBe(wrongNumber);
            answerRight();
            expect(statValue("Weak spots")).toBe("0");
            expect((document.getElementById("practice-weak") as HTMLButtonElement).disabled).toBe(true);
            nextButton().click();
            expect(document.querySelector(".end-card")).not.toBeNull();
        });

        it("keeps a question weak when it is answered wrong again", () =>
        {
            const wrongNumber = shownNumber();
            answerWrong();
            clickButton("Practice weak spots");
            answerWrong();
            expect(statValue("Weak spots")).toBe("1");
            clickButton("Practice weak spots");
            expect(shownNumber()).toBe(wrongNumber);
        });

        it("can be chosen in the panel too, together with the subjects and the state, and counts what is in the choice", () =>
        {
            startRound({ topics: ["grundrechte"], includeState: false });
            const inside = shownNumber();
            answerWrong();
            nextButton().click();
            startRound({ topics: ["demokratie-und-rechtsstaat"], includeState: false });
            answerWrong();
            clickButton("Change selection");
            (document.getElementById("only-weak") as HTMLInputElement).click();
            expect(document.querySelector(".panel-count")?.textContent).toBe("1 question from 1 topic");
            (document.getElementById("topic-demokratie-und-rechtsstaat") as HTMLInputElement).click();
            (document.getElementById("topic-parteien-und-wahlen") as HTMLInputElement).click();
            expect(document.getElementById("panel-start")).toHaveProperty("disabled", true);
            expect(document.querySelector(".panel-count")?.textContent).toBe("None of your weak spots is in this selection.");
            (document.getElementById("topic-grundrechte") as HTMLInputElement).click();
            expect(document.querySelector(".panel-count")?.textContent).toBe("1 question from 2 topics");
            clickButton("Start new round");
            expect(shownNumber()).toBe(inside);
            expect(document.querySelector(".round-bar")?.textContent).toContain("Weak spots: 2 topics · 1 question");
        });

        it("starts the panel with the tick set while a round of weak spots is on, and unticking it goes back to all questions", () =>
        {
            answerWrong();
            clickButton("Practice weak spots");
            clickButton("Change selection");
            expect((document.getElementById("only-weak") as HTMLInputElement).checked).toBe(true);
            (document.getElementById("only-weak") as HTMLInputElement).click();
            clickButton("Start new round");
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Berlin · 310 questions");
        });

        it("keeps the order that is chosen, and can be started over", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            walk(3, answerWrong);
            clickButton("Practice weak spots");
            expect(walk(3, answerWrong)).toEqual([321, 322, 323]);
            clickButton("Start over");
            expect(shownNumber()).toBe(321);
        });

        it("has an Exit weak spots button in a round of weak spots only, which goes back to regular practice", () =>
        {
            expect(document.getElementById("exit-weak")).toBeNull();
            answerWrong();
            clickButton("Practice weak spots");
            expect(buttonByText("Exit weak spots")).toBeDefined();
            clickButton("Exit weak spots");
            expect(document.getElementById("exit-weak")).toBeNull();
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Berlin · 310 questions");
            expect(document.getElementById("topic-panel")).toBeNull();
        });

        it("goes back to regular practice when the progress is erased inside a round of weak spots", () =>
        {
            answerWrong();
            clickButton("Practice weak spots");
            expect(document.querySelector(".round-bar")?.textContent).toContain("All my weak spots");
            clickButton("Reset progress");
            clickButton("Tap again to erase progress");
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Berlin · 310 questions");
            expect(document.querySelector("article.card")).not.toBeNull();
            expect(document.querySelector(".empty")).toBeNull();
        });

        it("goes back to regular practice when the state changes and none of the weak spots is in the new one", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            answerWrong();
            clickButton("Practice weak spots");
            chooseState("bayern");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Bavaria · 10 questions");
            expect(document.querySelector("article.card")).not.toBeNull();
        });

        it("cannot be ticked in the panel while there are no weak spots, and says why", () =>
        {
            clickButton("Change selection");
            const box = document.getElementById("only-weak") as HTMLInputElement;
            expect(box.disabled).toBe(true);
            expect(box.checked).toBe(false);
            expect(box.closest("label")?.textContent).toContain("You have no weak spots yet");
            expect((document.getElementById("panel-start") as HTMLButtonElement).disabled).toBe(false);
        });

        it("leaves out saved numbers that are not one of the user's questions", async () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({
                records: { "9999": { right: 0, wrong: 1, lastWrong: true }, "331": { right: 0, wrong: 1, lastWrong: true } },
            }));
            app = await mountApp();
            expect((document.getElementById("practice-weak") as HTMLButtonElement).disabled).toBe(true);
            expect(statValue("Weak spots")).toBe("0");
        });
    });

    describe("progress and reset", () =>
    {
        it("restores saved progress on load", async () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({
                records: {
                    "1": { right: 3, wrong: 1, lastWrong: false },
                    "2": { right: 0, wrong: 1, lastWrong: true },
                },
            }));
            app = await mountApp();
            expect(statValue("Seen")).toBe("2 of 310");
            expect(statValue("Accuracy")).toBe("60%");
            expect(statValue("Weak spots")).toBe("1");
        });

        it("asks for confirmation before erasing and erases on the second click", () =>
        {
            answerWrong();
            expect(buttonByText("Reset progress")?.className).toBe("secondary sm two-step danger-text");
            clickButton("Reset progress");
            expect(buttonByText("Tap again to erase progress")?.className).toBe("danger sm two-step");
            expect(statValue("Seen")).toBe("1 of 310");
            clickButton("Tap again to erase progress");
            expect(statValue("Seen")).toBe("0 of 310");
            expect(statValue("Weak spots")).toBe("0");
            expect(statValue("Accuracy")).toBe("none yet");
            expect(buttonByText("Reset progress")).toBeDefined();
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).records).toEqual({});
        });

        describe("the wait for the second press", () =>
        {
            /** The reset button as it is now. */
            const reset = (): HTMLButtonElement => document.getElementById("reset-progress") as HTMLButtonElement;
            /** Whether it waits for the second press. */
            const armed = (): boolean => reset().className === "danger sm two-step" && visibleText(reset()) === "Tap again to erase progress";
            /** What is saved as progress. */
            const records = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).records;

            beforeEach(() =>
            {
                vi.useFakeTimers();
                answerWrong();
                reset().click();
                expect(armed()).toBe(true);
            });

            it("ends by itself after a while, and the next press only asks again", () =>
            {
                vi.advanceTimersByTime(app.TWO_STEP_TIMEOUT_MS - 1);
                expect(armed()).toBe(true);
                vi.advanceTimersByTime(1);
                expect(armed()).toBe(false);
                expect(reset().className).toBe("secondary sm two-step danger-text");
                expect(reset().querySelector(".swap:not(.is-off)")?.getAttribute("aria-hidden")).toBeNull();
                reset().click();
                expect(armed()).toBe(true);
                expect(Object.keys(records())).toHaveLength(1);
            });

            it("starts its time again with every first press, so an old wait cannot cut a new one short", () =>
            {
                vi.advanceTimersByTime(app.TWO_STEP_TIMEOUT_MS);
                reset().click();
                vi.advanceTimersByTime(app.TWO_STEP_TIMEOUT_MS - 1);
                expect(armed()).toBe(true);
                reset().click();
                expect(records()).toEqual({});
                expect(vi.getTimerCount()).toBe(0);
            });

            it("ends with Escape, which then does nothing else", () =>
            {
                (document.getElementById("change-selection") as HTMLElement).click();
                reset().click();
                expect(armed()).toBe(true);
                pressKey("Escape");
                expect(armed()).toBe(false);
                expect(document.getElementById("topic-panel")).not.toBeNull();
                pressKey("Escape");
                expect(document.getElementById("topic-panel")).toBeNull();
            });

            it("ends with a click anywhere else, without drawing the page again: a list that was opened stays open", () =>
            {
                const card = document.querySelector("article.card") as HTMLElement;
                (document.getElementById("theme-button") as HTMLElement).click();
                expect(armed()).toBe(false);
                expect(document.getElementById("theme-button")?.getAttribute("aria-expanded")).toBe("true");
                expect(document.querySelector("article.card")).toBe(card);
                expect(Object.keys(records())).toHaveLength(1);
            });

            it("ends with a key that does something else, and that key still does it", () =>
            {
                const number = shownNumber();
                pressKey("ArrowRight");
                expect(shownNumber()).not.toBe(number);
                expect(armed()).toBe(false);
            });

            it("stays while the keyboard is on its way to the button and on the button itself", () =>
            {
                pressKey("Tab");
                pressKey("Shift");
                pressKey("Enter", {}, reset());
                expect(armed()).toBe(true);
                reset().click();
                expect(records()).toEqual({});
            });

            it("ends with Escape also while the button itself has the focus", () =>
            {
                pressKey("Escape", {}, reset());
                expect(armed()).toBe(false);
                expect(Object.keys(records())).toHaveLength(1);
            });

            it("ends when the mode is changed", () =>
            {
                clickButton("Train");
                expect(armed()).toBe(false);
                clickButton("Practice");
                expect(armed()).toBe(false);
                expect(Object.keys(records())).toHaveLength(1);
            });
        });
    });

    describe("pictures", () =>
    {
        it("keeps the room of a picture before it is loaded, by its measured size, so the card does not move when it arrives", async () =>
        {
            app = await mountApp([makeQuestion(21, { img: "images/q-021.webp", a: ["Bild 1", "Bild 2", "Bild 3", "Bild 4"] })]);
            const image = document.querySelector("figure.picture img") as HTMLImageElement;
            expect(image.getAttribute("width")).toBe("1208");
            expect(image.getAttribute("height")).toBe("379");
        });

        it("renders the picture and keeps option order on picture questions", async () =>
        {
            const picture = makeQuestion(21, { img: "images/q-21.png", a: ["Bild 1", "Bild 2", "Bild 3", "Bild 4"], r: 2 });
            app = await mountApp([picture]);
            const image = document.querySelector("figure.picture img") as HTMLImageElement;
            expect(image.getAttribute("src")).toBe("images/q-21.png");
            expect(image.getAttribute("alt")).toBe("Picture for this question");
            expect(image.getAttribute("loading")).toBe("lazy");
            expect(optionButtons().map(mainText)).toEqual(["Bild 1", "Bild 2", "Bild 3", "Bild 4"]);
        });

        it("shows the photo credit under the picture", async () =>
        {
            const photo = makeQuestion(55, { img: "images/q-55.png", cap: "© Deutscher Bundestag/Achim Melde" });
            app = await mountApp([photo]);
            const caption = document.querySelector("figure.picture figcaption.caption") as HTMLElement;
            expect(caption.textContent).toBe("© Deutscher Bundestag/Achim Melde");
            expect(document.querySelector("figure.picture")?.lastElementChild).toBe(caption);
        });

        it("shows no caption for a picture without a credit", async () =>
        {
            app = await mountApp([makeQuestion(21, { img: "images/q-21.png" })]);
            expect(document.querySelector("figcaption")).toBeNull();
        });

        it("keeps the credit when the picture cannot load and is replaced by a link", async () =>
        {
            app = await mountApp([makeQuestion(55, { img: "images/q-55.png", cap: "© Credit" })]);
            (document.querySelector("figure.picture img") as HTMLImageElement).dispatchEvent(new Event("error"));
            expect(document.querySelector("figure.picture a")).not.toBeNull();
        });

        it("renders no figure for text questions", async () =>
        {
            app = await mountApp(makeBank(5, 0));
            expect(document.querySelector("figure")).toBeNull();
        });

        it("swaps a broken picture for a link that opens it in a new tab", async () =>
        {
            const picture = makeQuestion(21, { img: "images/q-21.png" });
            app = await mountApp([picture]);
            (document.querySelector("figure.picture img") as HTMLImageElement).dispatchEvent(new Event("error"));
            const link = document.querySelector("figure.picture a") as HTMLAnchorElement;
            expect(link.textContent).toBe("The picture could not load here. Open it in a new tab.");
            expect(link.getAttribute("href")).toBe("images/q-21.png");
            expect(link.getAttribute("target")).toBe("_blank");
            expect(link.getAttribute("rel")).toBe("noopener");
            expect(document.querySelector("figure.picture img")).toBeNull();
        });
    });

    describe("error reporting", () =>
    {
        it("shows a toast for an uncaught error and hides it after six seconds", () =>
        {
            vi.useFakeTimers();
            const toast = document.getElementById("toast") as HTMLElement;
            expect(toast.hidden).toBe(true);
            window.dispatchEvent(new ErrorEvent("error", { error: new Error("kaputt") }));
            expect(toast.hidden).toBe(false);
            expect(toast.textContent).toBe("Something went wrong: kaputt");
            vi.advanceTimersByTime(5999);
            expect(toast.hidden).toBe(false);
            vi.advanceTimersByTime(1);
            expect(toast.hidden).toBe(true);
        });

        it("gives a second message its own six seconds, whatever the timer of the first had left", () =>
        {
            vi.useFakeTimers();
            const toast = document.getElementById("toast") as HTMLElement;
            window.dispatchEvent(new ErrorEvent("error", { error: new Error("first") }));
            vi.advanceTimersByTime(3000);
            window.dispatchEvent(new ErrorEvent("error", { error: new Error("second") }));
            vi.advanceTimersByTime(5999);
            expect(toast.hidden).toBe(false);
            expect(toast.textContent).toBe("Something went wrong: second");
            vi.advanceTimersByTime(1);
            expect(toast.hidden).toBe(true);
        });

        it("tells the user when saved progress is corrupt and still starts", async () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, "<<corrupt>>");
            app = await mountApp();
            expect(document.getElementById("toast")?.hidden).toBe(false);
            expect(document.getElementById("toast")?.textContent).toBe("Your saved progress could not be read, so the page starts fresh.");
            expect(statValue("Seen")).toBe("0 of 310");
            expect(document.querySelector("article.card")).not.toBeNull();
        });

        it.each([
            ["null", "null"],
            ["a list", "[1, 2, 3]"],
            ["a broken answer record", JSON.stringify({ setupDone: true, records: { "1": null, "2": "x", "3": { right: 5, wrong: -9, lastWrong: true } } })],
        ])("starts and stays usable when the save is %s, and a reload does too", async (_, raw) =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, raw);
            app = await mountApp();
            expect(statValue("Seen")).toBe("0 of 310");
            expect(statValue("Accuracy")).toBe("none yet");
            expect(document.querySelector("article.card")).not.toBeNull();
            answerRight();
            expect(statValue("Seen")).toBe("1 of 310");
            app = await mountApp();
            expect(statValue("Seen")).toBe("1 of 310");
        });

        it("keeps the keyboard on the answer that was pressed, and on the question when locked answers turn the buttons off", async () =>
        {
            const option = (): HTMLButtonElement => document.getElementById("option-0") as HTMLButtonElement;
            option().focus();
            option().click();
            expect(document.activeElement?.id).toBe("option-0");
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ setupDone: true, lockAnswers: true }));
            app = await mountApp();
            option().focus();
            option().click();
            expect(option().disabled).toBe(true);
            expect(document.activeElement).toBe(document.querySelector("[data-focus]"));
        });

        it("goes on with the round where it stood after the page is loaded anew: the answers, the skips and the order of the options", async () =>
        {
            startRound({ order: "booklet" });
            const first = shownNumber();
            answerRight();
            nextButton().click();
            nextButton().click();
            const third = shownNumber();
            const options = optionButtons().map((button) => button.textContent);
            const states = slotStates();
            app = await mountApp();
            expect(shownNumber()).toBe(third);
            expect(optionButtons().map((button) => button.textContent)).toEqual(options);
            expect(slotStates()).toEqual(states);
            expect(statValue("Seen")).toBe("1 of 310");
            // The answered question shows its answer, as before.
            (slots()[0] as HTMLButtonElement).click();
            expect(shownNumber()).toBe(first);
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Correct.");
        });

        it("starts a new round after a new load when the saved one does not fit any more, and saves nothing for a round that was not touched", async () =>
        {
            const fresh = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string) as { round?: unknown };
            expect(fresh.round ?? null).toBeNull();
            startRound({ scope: "berlin", order: "booklet" });
            answerRight();
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).round.slots).toHaveLength(10);
            // Another state: the questions of the round are not the user's any more.
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string) as Record<string, unknown>;
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ ...saved, state: "bayern" }));
            app = await mountApp();
            const named = (): string[] => slots().map((slot) => slot.getAttribute("aria-label") ?? "");
            expect(named().some((label) => /\bBE \d/.test(label))).toBe(false);
            expect(slotStates().every((state) => state !== "correct")).toBe(true);
            // An order of options that does not fit its question: a new round, with nothing answered.
            const broken = { ...saved, round: { ...(saved.round as Record<string, unknown>), slots: [{ n: 321, outcome: "correct", selected: 1, options: [0, 0, 1, 2] }] } };
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify(broken));
            app = await mountApp();
            expect(slotStates().every((state) => state !== "correct")).toBe(true);
        });

        it("tells once, in words, that nothing can be kept when the browser blocks the storage", async () =>
        {
            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() =>
            {
                throw new DOMException("blocked", "SecurityError");
            });
            answerRight();
            const toast = document.getElementById("toast") as HTMLElement;
            expect(toast.textContent).toBe("This browser does not let the page keep anything: your progress is lost when you leave.");
            toast.hidden = true;
            nextButton().click();
            answerRight();
            expect(toast.hidden).toBe(true);
        });

        it("tells it in the language of the site when the save cannot be read on the way in", async () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, "<<corrupt>>");
            app = await mountApp(undefined, { locale: "de" });
            expect(document.getElementById("toast")?.textContent).toBe("Dein gespeicherter Fortschritt ließ sich nicht lesen, die Seite beginnt neu.");
        });

        it("still works when localStorage is unavailable", async () =>
        {
            vi.spyOn(Storage.prototype, "getItem").mockImplementation(() =>
            {
                throw new Error("blocked");
            });
            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() =>
            {
                throw new Error("blocked");
            });
            app = await mountApp();
            answerRight();
            expect(statValue("Seen")).toBe("1 of 310");
        });
    });

    describe("data safety", () =>
    {
        it("renders markup in question text as plain text", async () =>
        {
            const hostile = "<img src=x onerror=alert(1)>";
            app = await mountApp([makeQuestion(1, { q: hostile, qe: hostile, a: [hostile, "b", "c", "d"], c: hostile })]);
            expect(document.querySelectorAll("#app img")).toHaveLength(0);
            expect(document.querySelector(".question")?.textContent).toContain(hostile);
        });
    });

    describe("bank shape", () =>
    {
        it("works with a synthetic bank of the real shape", async () =>
        {
            app = await mountApp(makeBank(40, 5));
            expect(statValue("Seen")).toBe("0 of 45");
            expect(optionButtons()).toHaveLength(4);
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Berlin · 45 questions");
        });
    });
});
