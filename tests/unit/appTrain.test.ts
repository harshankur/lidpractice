// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buttonByText, chooseState, clickButton, correctIndex, mountApp, optionButtons, pressKey, REAL_BUNDLE, shownNumber, statValue, wrongIndex,
} from "../helpers/appHarness";

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

/** The button that moves the training on. */
function next(): HTMLButtonElement
{
    return document.getElementById("train-next") as HTMLButtonElement;
}

/** Text of a row of the widget of the training. */
function trainValue(label: string): string
{
    const term = Array.from(document.querySelectorAll(".train-widget dt")).find((entry) => entry.textContent === label) as HTMLElement;
    return (term.nextElementSibling as HTMLElement).textContent as string;
}

/** The topic of a question of the bank. */
function topicOf(questionNumber: number): string
{
    return (REAL_BUNDLE.questions.find((entry) => entry.n === questionNumber) as (typeof REAL_BUNDLE.questions)[number]).k;
}

/** Opens the panel of the training and chooses what it draws from. */
function chooseTrainTopics(topics: string[], includeState: boolean): void
{
    clickButton("Change selection");
    (document.getElementById("preset-none") as HTMLButtonElement).click();
    for (const topic of topics)
    {
        (document.getElementById(`topic-${topic}`) as HTMLInputElement).click();
    }
    const box = document.getElementById("include-state") as HTMLInputElement;
    if (box.checked !== includeState)
    {
        box.click();
    }
    clickButton("Start new training");
}

describe("App: training", () =>
{
    beforeEach(async () =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        await mountApp();
        clickButton("Train");
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        vi.useRealTimers();
        window.localStorage.clear();
    });

    describe("the view", () =>
    {
        it("is a tab of its own between Practice and Exam, and starts at once with a question and a note on how it works", () =>
        {
            expect(Array.from(document.querySelectorAll("[role=tab]")).map((tab) => tab.textContent)).toEqual(["Learn", "Practice", "Train", "Exam (33)"]);
            expect(document.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Train");
            expect(document.querySelector("article.card")).not.toBeNull();
            expect(document.querySelector(".banner-review")?.textContent).toContain("A wrong one comes back after a few questions");
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Berlin · 310 questions");
        });

        it("has the progress, then the clock, in the same place as in practice, and the widget of the training after them", () =>
        {
            const aside = document.querySelector("main.layout > .aside") as HTMLElement;
            expect(Array.from(aside.children).map((widget) => widget.className.split(" ").slice(0, 2).join(" "))).toEqual(["widget stats", "widget clock-widget", "widget train-widget"]);
            expect(trainValue("Cleared")).toBe("0 of 310");
            expect(trainValue("Left")).toBe("310");
            expect(trainValue("Coming back")).toBe("0");
        });

        it("lists every topic by name with its progress, closed at first", () =>
        {
            const details = document.querySelector("details.train-topics") as HTMLDetailsElement;
            expect(details.open).toBe(false);
            expect(details.querySelectorAll("li")).toHaveLength(14);
            expect(details.querySelector("li progress")?.getAttribute("max")).not.toBeNull();
        });

        it("keeps Practice as it was", () =>
        {
            clickButton("Practice");
            const number = shownNumber();
            clickButton("Train");
            answerRight();
            clickButton("Practice");
            expect(shownNumber()).toBe(number);
        });
    });

    describe("answering", () =>
    {
        it("clears a question that is answered right, and says what is left in its topic", () =>
        {
            const topic = topicOf(shownNumber());
            answerRight();
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Correct.");
            expect(document.querySelector(".verdict #learn-why")?.textContent).toBe("Learn why");
            expect(document.querySelector(".train-note")?.textContent).toMatch(/^Cleared\. /);
            expect(trainValue("Cleared")).toBe("1 of 310");
            expect(trainValue("Left")).toBe("309");
            expect(statValue("Seen")).toBe("1 of 310");
            expect(topic).toBeTruthy();
            expect(next().disabled).toBe(false);
        });

        it("keeps a question that is answered wrong, says it comes back, and puts it on the way back", () =>
        {
            answerWrong();
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Not quite. The correct answer is highlighted.");
            expect(document.querySelector(".train-note")?.textContent).toContain("comes back after a few questions");
            expect(trainValue("Cleared")).toBe("0 of 310");
            expect(trainValue("Coming back")).toBe("1");
            expect(statValue("Weak spots")).toBe("1");
        });

        it("cannot be moved on before an answer, and the options are off after one", () =>
        {
            expect(next().disabled).toBe(true);
            pressKey("Enter");
            pressKey("ArrowRight");
            expect(document.querySelector(".train-widget dd")?.textContent).toBe("0 of 310");
            answerRight();
            expect(optionButtons().every((button) => button.disabled)).toBe(true);
            const number = shownNumber();
            pressKey("1");
            expect(shownNumber()).toBe(number);
            expect(trainValue("Cleared")).toBe("1 of 310");
        });

        it("takes the keys 1 to 4 and A to D, and Enter for the next question", () =>
        {
            const first = shownNumber();
            pressKey(String(correctIndex() + 1));
            expect(trainValue("Cleared")).toBe("1 of 310");
            pressKey("Enter");
            expect(document.querySelector(".verdict")).toBeNull();
            expect(shownNumber()).not.toBe(first);
        });

        it("has an I don't know button: it shows the right answer without choosing one, and counts as wrong", () =>
        {
            clickButton("I don't know");
            expect(document.querySelector(".verdict > span")?.textContent).toBe("No answer. The correct answer is highlighted.");
            expect(document.querySelectorAll(".option.is-correct")).toHaveLength(1);
            expect(document.querySelectorAll(".option.is-wrong")).toHaveLength(0);
            expect(document.querySelectorAll(".option.is-selected")).toHaveLength(0);
            expect(trainValue("Coming back")).toBe("1");
            expect(statValue("Weak spots")).toBe("1");
            expect((document.getElementById("train-give-up") as HTMLButtonElement).disabled).toBe(true);
        });

        it("moves on to a question of another topic after a right answer", () =>
        {
            const topic = topicOf(shownNumber());
            answerRight();
            next().click();
            expect(topicOf(shownNumber())).not.toBe(topic);
        });
    });

    describe("bringing questions back, with a note that says why", () =>
    {
        it("asks a missed question again after three others, marked as back again", () =>
        {
            const missed = shownNumber();
            answerWrong();
            next().click();
            for (let step = 0; step < 3; step++)
            {
                expect(shownNumber()).not.toBe(missed);
                answerRight();
                next().click();
            }
            expect(shownNumber()).toBe(missed);
            expect(document.querySelector(".banner-back")?.textContent).toContain("Back again: you missed this question earlier.");
            expect(trainValue("Coming back")).toBe("0");
        });

        it("clears the missed question when the second try is right", () =>
        {
            const missed = shownNumber();
            answerWrong();
            next().click();
            for (let step = 0; step < 3; step++)
            {
                answerRight();
                next().click();
            }
            expect(shownNumber()).toBe(missed);
            answerRight();
            expect(trainValue("Cleared")).toBe("4 of 310");
            expect(statValue("Weak spots")).toBe("0");
        });

        it("says that a topic comes up more often when a question of it was missed, and marks the topic in the list", () =>
        {
            answerWrong();
            expect(document.querySelectorAll(".train-back")).toHaveLength(1);
            expect(document.querySelector(".train-back")?.getAttribute("aria-label")).toBe("Brought back: you missed a question here");
        });

        it("names the topic in the note on a question drawn because of it", () =>
        {
            const missed = shownNumber();
            const topic = (document.querySelector(".tag-topic") as HTMLElement).title;
            answerWrong();
            next().click();
            let found = "";
            for (let step = 0; step < 40 && !found; step++)
            {
                const banner = document.querySelector(".banner-back")?.textContent ?? "";
                if (banner.includes("More from"))
                {
                    found = banner;
                }
                answerRight();
                next().click();
                if (shownNumber() === missed)
                {
                    break;
                }
            }
            if (found)
            {
                expect(found).toContain(`More from ${topic}`);
            }
        });
    });

    describe("the choice of questions", () =>
    {
        it("opens a panel with only the topics and the state, in the words of the training", () =>
        {
            clickButton("Change selection");
            expect(document.getElementById("panel-title")?.textContent).toBe("What do you want to train?");
            expect(document.getElementById("order-random")).toBeNull();
            expect(document.getElementById("only-weak")).toBeNull();
            expect(document.getElementById("lock-answers")).toBeNull();
            expect(document.getElementById("preset-all")).not.toBeNull();
            expect(document.getElementById("include-state")).not.toBeNull();
            expect(buttonByText("Start new training")).toBeDefined();
        });

        it("trains only the chosen topics, and does not change the choice of practice", () =>
        {
            chooseTrainTopics(["staatssymbole"], false);
            expect(document.querySelector(".round-bar")?.textContent).toContain("7 questions");
            expect(topicOf(shownNumber())).toBe("staatssymbole");
            clickButton("Practice");
            expect(document.querySelector(".round-bar")?.textContent).toContain("All topics + Berlin · 310 questions");
        });

        it("asks for a new choice with nothing ticked, and cannot start", () =>
        {
            clickButton("Change selection");
            (document.getElementById("preset-none") as HTMLButtonElement).click();
            (document.getElementById("include-state") as HTMLInputElement).click();
            expect((document.getElementById("panel-start") as HTMLButtonElement).disabled).toBe(true);
        });

        it("starts a new session when the state changes", () =>
        {
            answerRight();
            chooseState("bayern");
            expect(trainValue("Cleared")).toBe("0 of 310");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Bavaria");
        });
    });

    describe("the end", () =>
    {
        it("is reached when every question is cleared: the last Next says See the result, and the card sums up", () =>
        {
            chooseTrainTopics(["staatssymbole"], false);
            for (let step = 0; step < 7; step++)
            {
                answerRight();
                if (step < 6)
                {
                    expect(next().textContent).toBe("Next");
                    next().click();
                }
            }
            expect(next().textContent).toBe("See the result");
            next().click();
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Everything cleared");
            expect(document.querySelector(".end-card p")?.textContent).toBe("7 of 7 cleared with 7 answers. 0 needed another try.");
            expect((document.getElementById("train-end") as HTMLButtonElement).disabled).toBe(true);
        });

        it("is still on the end card after leaving the tab and coming back, and starts a new session only when asked", () =>
        {
            chooseTrainTopics(["staatssymbole"], false);
            for (let step = 0; step < 7; step++)
            {
                answerRight();
                next().click();
            }
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Everything cleared");
            clickButton("Practice");
            clickButton("Train");
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Everything cleared");
            expect(document.querySelector("article.card")).toBeNull();
        });

        it("counts the questions that needed another try", () =>
        {
            chooseTrainTopics(["staatssymbole"], false);
            const first = shownNumber();
            answerWrong();
            next().click();
            for (let guard = 0; guard < 40 && document.querySelector("article.card"); guard++)
            {
                answerRight();
                if (trainValue("Left") === "0")
                {
                    next().click();
                    break;
                }
                next().click();
            }
            expect(first).toBeGreaterThan(0);
            expect(document.querySelector(".end-card p")?.textContent).toBe("7 of 7 cleared with 8 answers. 1 needed another try.");
        });

        it("can be asked for by the user, and keeps what was cleared", () =>
        {
            answerRight();
            next().click();
            clickButton("End training");
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Training ended");
            expect(document.querySelector(".end-card p")?.textContent).toMatch(/^1 of 310 cleared with 1 answer\. 0 needed another try\.$/);
            expect(document.querySelector("article.card")).toBeNull();
        });

        it("starts again from the end card, and from the widget at any time", () =>
        {
            answerRight();
            clickButton("End training");
            clickButton("Train again");
            expect(trainValue("Cleared")).toBe("0 of 310");
            expect(document.querySelector("article.card")).not.toBeNull();
            answerRight();
            clickButton("Start over");
            expect(trainValue("Cleared")).toBe("0 of 310");
        });

        it("offers a way to the panel from the end card", () =>
        {
            clickButton("End training");
            (document.getElementById("end-change") as HTMLButtonElement).click();
            expect(document.getElementById("topic-panel")).not.toBeNull();
        });
    });

    describe("progress", () =>
    {
        it("feeds the progress and the weak spots of the whole site, and Practice weak spots finds the missed question", () =>
        {
            const missed = shownNumber();
            answerWrong();
            expect(statValue("Seen")).toBe("1 of 310");
            clickButton("Practice weak spots");
            expect(document.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Practice");
            expect(shownNumber()).toBe(missed);
        });
    });
});
