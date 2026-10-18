// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CourseBook } from "../../src/learn/course";
import type { Block } from "../../src/learn/types";
import { miniQuestion, renderBlock, revealBox, richParagraph, type BlockParts, type LessonTools, type MiniQuestionState } from "../../src/learn/views";
import { LOCALES, type Locale, type PresentedQuestion, type Question } from "../../src/types";
import { STATE_QUESTION_BASE, courseFile, courseTexts, stateFacts } from "../helpers/courseFixture";

const book = new CourseBook(courseFile(), courseTexts(), stateFacts());

/**
 * The same text in every language, with the language in front of all but the German one.
 * @param text The German text.
 * @returns One text per language.
 */
function everyLanguage(text: string): Record<Locale, string>
{
    return Object.fromEntries(LOCALES.map((code) => [code, code === "de" ? text : `${code}: ${text}`])) as Record<Locale, string>;
}

/**
 * Makes a question whose second option is the right one.
 * @param n Question number.
 * @returns The question.
 */
function question(n: number): Question
{
    return {
        n,
        k: "grundrechte",
        r: 1,
        img: n === 2 ? "q-002.webp" : null,
        pg: 1,
        texts: Object.fromEntries(LOCALES.map((code) => [code, { q: everyLanguage(`Frage ${n}`)[code], a: ["A", "B", "C", "D"].map((letter) => everyLanguage(`Antwort ${letter}`)[code]) }])),
    } as unknown as Question;
}

/** The questions the page around the pieces has. Question 3 is missing. */
const BANK = new Map([1, 2, 4, STATE_QUESTION_BASE + 7].map((n) => [n, question(n)]));

/** What the pieces get from the page around them, reduced to what a test can read. */
const TOOLS: LessonTools = {
    bilingual: (texts, className) =>
    {
        const span = document.createElement("span");
        span.className = className ?? "bi";
        span.textContent = texts.de;
        return span;
    },
    picture: (entry) =>
    {
        if (entry.img === null)
        {
            return null;
        }
        const figure = document.createElement("figure");
        figure.className = "picture";
        figure.dataset.image = entry.img;
        return figure;
    },
    question: (n) => BANK.get(n),
    questionTexts: (entry) => Object.fromEntries(LOCALES.map((code) => [code, entry.texts[code].q])) as Record<Locale, string>,
    eras: book.eras,
    link: (section, title) =>
    {
        const link = document.createElement("a");
        link.className = "section-link";
        link.href = `#learn/lesson/${section}`;
        link.setAttribute("aria-label", `Link: ${title}`);
        return link;
    },
};

/** The pieces that keep state, each drawn as an element that says what it was asked for. */
function parts(open: string[] = [], opened: string[] = []): BlockParts
{
    const mark = (kind: string, id: string): HTMLElement =>
    {
        const element = document.createElement("div");
        element.className = kind;
        element.dataset.block = id;
        return element;
    };
    return {
        timeline: (block) => mark("drawn-timeline", `${block.id}:${block.events.join(",")}`),
        map: (block) => mark("drawn-map", `${block.id}:${block.map}`),
        isOpen: (id) => open.includes(id),
        open: (id) => opened.push(id),
    };
}

/**
 * Draws a block of the small course.
 * @param lesson Lesson id.
 * @param id Block id.
 * @param blockParts What the blocks with state get.
 * @returns The element.
 */
function draw(lesson: string, id: string, blockParts: BlockParts = parts()): HTMLElement
{
    return renderBlock(book.lesson(lesson)?.blocks.find((entry) => entry.id === id) as Block, TOOLS, blockParts);
}

describe("a text of a lesson", () =>
{
    it("is a paragraph with its markup turned into elements", () =>
    {
        const paragraph = richParagraph("The {{Bund}} is **not** a state.", "unit-body");
        expect(paragraph.tagName).toBe("P");
        expect(paragraph.className).toBe("unit-body");
        expect(paragraph.querySelector(".de-term")?.textContent).toBe("Bund");
        expect(paragraph.querySelector("strong")?.textContent).toBe("not");
        expect(richParagraph("Plain.").hasAttribute("class")).toBe(false);
    });
});

describe("something that is covered until it is asked for", () =>
{
    it("holds its content from the start, unread, under a button that uncovers it", () =>
    {
        let opened = 0;
        const box = revealBox("answer", [richParagraph("The answer.")], false, () =>
        {
            opened += 1;
        });
        expect(box.id).toBe("answer");
        expect(box.className).toBe("reveal");
        const content = box.querySelector(".reveal-content") as HTMLElement;
        // The content is in the page, so it has its size: it is only kept from being read.
        expect(content.textContent).toBe("The answer.");
        expect(content.getAttribute("aria-hidden")).toBe("true");
        const button = box.querySelector("button") as HTMLButtonElement;
        expect(button.id).toBe("answer-show");
        expect(button.textContent).toBe("Show answer");
        button.click();
        expect(opened).toBe(1);
    });

    it("shows the same content without the button once it is uncovered", () =>
    {
        const box = revealBox("answer", [richParagraph("The answer.")], true, () => undefined);
        expect(box.className).toBe("reveal is-open");
        expect(box.querySelector("button")).toBeNull();
        expect(box.querySelector(".reveal-content")?.hasAttribute("aria-hidden")).toBe(false);
        expect(box.querySelector(".reveal-content")?.textContent).toBe("The answer.");
    });

    it("takes another text for its button", () =>
    {
        expect(revealBox("x", [], false, () => undefined, "Show the date").querySelector("button")?.textContent).toBe("Show the date");
    });
});

describe("a catalogue question inside a lesson", () =>
{
    /** Question 2 with its options in the order of the catalogue. */
    const item: PresentedQuestion = {
        question: question(2),
        options: ["A", "B", "C", "D"].map((letter, index) => ({ index, texts: everyLanguage(`Antwort ${letter}`), isCorrect: index === 1 })),
    };

    /**
     * Draws the question.
     * @param state What differs from a question that is open and unanswered.
     * @returns The element.
     */
    function mini(state: Partial<MiniQuestionState> = {}): HTMLElement
    {
        return miniQuestion({ id: "check-2", item, selected: null, reveal: true, open: true, note: "", onChoose: () => undefined, ...state }, TOOLS);
    }

    it("shows its number, its German text, its picture and four options, and a line for a note that is always there", () =>
    {
        const element = mini();
        expect(element.id).toBe("check-2");
        expect(element.querySelector(".qno")?.textContent).toBe("2");
        expect(element.querySelector(".question")?.textContent).toBe("Frage 2");
        expect((element.querySelector(".picture") as HTMLElement).dataset.image).toBe("q-002.webp");
        const options = Array.from(element.querySelectorAll<HTMLButtonElement>("button.option"));
        expect(options.map((option) => option.id)).toEqual(["check-2-0", "check-2-1", "check-2-2", "check-2-3"]);
        expect(options.map((option) => option.querySelector(".letter")?.textContent)).toEqual(["A", "B", "C", "D"]);
        expect(options.map((option) => option.querySelector(".option-text")?.textContent)).toEqual(["Antwort A", "Antwort B", "Antwort C", "Antwort D"]);
        expect(options.every((option) => !option.disabled && option.getAttribute("aria-pressed") === "false")).toBe(true);
        const note = element.querySelector(".mini-q-note") as HTMLElement;
        expect(note.textContent).toBe("");
        expect(note.getAttribute("role")).toBe("status");
        expect(note.className).toBe("mini-q-note");
    });

    it("names a question of a federal state by its state and task, and takes more tags", () =>
    {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "From an earlier lesson";
        const element = mini({ item: { ...item, question: question(STATE_QUESTION_BASE + 7) }, tags: [tag] });
        // Question 327 is task 7 of the third state of the catalogue, Berlin.
        expect(element.querySelector(".qno")?.textContent).toBe("BE 7");
        expect(element.querySelectorAll(".meta .tag")).toHaveLength(2);
        expect(element.querySelector(".picture")).toBeNull();
    });

    it("reports the option that is chosen", () =>
    {
        const chosen: number[] = [];
        const element = mini({ onChoose: (index) => chosen.push(index) });
        (element.querySelector("#check-2-2") as HTMLButtonElement).click();
        expect(chosen).toEqual([2]);
    });

    it("marks a right answer in green words and nothing else", () =>
    {
        const element = mini({ selected: 1, open: false, note: "Correct." });
        const options = Array.from(element.querySelectorAll<HTMLButtonElement>("button.option"));
        expect(options.map((option) => option.className)).toEqual(["option", "option is-selected is-correct", "option", "option"]);
        expect(options[1].querySelector(".mark")?.textContent).toBe("Correct");
        expect(element.querySelectorAll(".mark")).toHaveLength(1);
        expect(options.every((option) => option.disabled)).toBe(true);
        expect(options[1].getAttribute("aria-pressed")).toBe("true");
        expect(element.querySelector(".mini-q-note")?.className).toBe("mini-q-note ok");
        expect(element.querySelector(".mini-q-note")?.textContent).toBe("Correct.");
    });

    it("marks a wrong answer and shows the right one next to it", () =>
    {
        const element = mini({ selected: 3, open: false, note: "Not quite." });
        const options = Array.from(element.querySelectorAll<HTMLButtonElement>("button.option"));
        expect(options.map((option) => option.className)).toEqual(["option", "option is-correct", "option", "option is-selected is-wrong"]);
        expect(options.map((option) => option.querySelector(".mark")?.textContent ?? "")).toEqual(["", "Correct", "", "Your answer"]);
        expect(element.querySelector(".mini-q-note")?.className).toBe("mini-q-note bad");
    });

    it("shows neither right nor wrong for a guess: only which option was chosen", () =>
    {
        const element = mini({ id: "guess", selected: 3, reveal: false, note: "Your guess is noted." });
        const options = Array.from(element.querySelectorAll<HTMLButtonElement>("button.option"));
        expect(options.map((option) => option.className)).toEqual(["option", "option", "option", "option is-selected"]);
        expect(element.querySelector(".mark")).toBeNull();
        expect(element.querySelector(".mini-q-note")?.className).toBe("mini-q-note");
        expect(options.every((option) => !option.disabled)).toBe(true);
        expect(options[3].id).toBe("guess-3");
    });
});

describe("the blocks of a lesson", () =>
{
    it("draw a unit: the question it answers, its tags, the German term with its meaning, the text and a case", () =>
    {
        const unit = draw("first", "wuerde");
        expect(unit.tagName).toBe("SECTION");
        expect(unit.id).toBe("unit-wuerde");
        expect(unit.dataset.anchor).toBe("wuerde");
        expect(unit.querySelector("h3.unit-title")?.textContent).toBe("What does Article 1 protect?");
        // The heading carries the link of the section, named after the heading without its markup.
        const link = unit.querySelector("h3.unit-title > a.section-link") as HTMLAnchorElement;
        expect(link.getAttribute("href")).toBe("#learn/lesson/wuerde");
        expect(link.getAttribute("aria-label")).toBe("Link: What does Article 1 protect?");
        expect(unit.querySelector(".unit-tags")?.textContent).toBe("Asked in 2 questions");
        expect(unit.querySelector(".term .term-word")?.getAttribute("aria-label")).toBe("die Menschenwürde");
        expect(unit.querySelector(".term .term-meaning")?.textContent).toBe("human dignity");
        expect(unit.querySelector(".unit-body")?.textContent).toBe("It protects human dignity. This is not only for citizens.");
        expect(unit.querySelector(".unit-body strong")?.textContent).toBe("not");
        expect(unit.querySelector(".unit-case")?.textContent).toBe("Example:The police may not torture anyone.");
        expect(unit.querySelector(".unit-asked")).toBeNull();
        expect(unit.querySelector(".unit-asof")).toBeNull();
    });

    it("draw a unit about a date with the name tag of its era, and say when a fact that can change was true", () =>
    {
        const unit = draw("first", "ohne-karte");
        expect(unit.querySelector(".unit-tags .era-chip")?.className).toBe("era-chip era-ns");
        expect(unit.querySelector(".unit-tags .era-name")?.textContent).toBe("NS-Diktatur");
        // One question only: no tag for how often it is asked.
        expect(unit.querySelector(".unit-tags .tag")).toBeNull();
        expect(unit.querySelector(".unit-asof")?.textContent).toBe("As the catalogue has it (2025). This can change.");
        expect(unit.querySelector(".term")).toBeNull();
        expect(unit.querySelector(".unit-case")).toBeNull();
    });

    it("draw a unit with a term and no meaning, and one with neither tags nor era", () =>
    {
        const plain = renderBlock({ type: "unit", id: "plain", questions: [1], q: "Why?", body: "Because.", term: "der Bund" }, TOOLS, parts());
        expect(plain.querySelector(".term .term-word")?.textContent).toBe("der Bund");
        expect(plain.querySelector(".term-meaning")).toBeNull();
        expect(plain.querySelector(".unit-tags")).toBeNull();
    });

    it("show the catalogue question with a unit of the lesson about the user's state", () =>
    {
        const unit = draw("land-bayern", "hauptstadt");
        expect(unit.querySelector(".unit-asked .unit-label")?.textContent).toBe("Question BE 7 of the test:");
        expect(unit.querySelector(".unit-asked .bi")?.textContent).toBe(`Frage ${STATE_QUESTION_BASE + 7}`);
        // A question the bank does not have is left out, the unit stays.
        const missing = draw("land-bayern", "wappen");
        expect(missing.querySelector(".unit-asked")).toBeNull();
        expect(missing.querySelector(".unit-body")?.textContent).toBe("White and blue diamonds.");
    });

    it("draw the picture of a question with a caption, and only the caption when the question has no picture", () =>
    {
        const picture = draw("first", "bild");
        expect(picture.tagName).toBe("FIGURE");
        expect(picture.id).toBe("block-bild");
        expect((picture.querySelector(".picture") as HTMLElement).dataset.image).toBe("q-002.webp");
        expect(picture.querySelector("figcaption")?.textContent).toBe("The picture of question 2.");
        const none = renderBlock({ type: "picture", id: "p", question: 1, caption: "No picture." }, TOOLS, parts());
        expect(none.querySelector(".picture")).toBeNull();
        expect(renderBlock({ type: "picture", id: "p", question: 3, caption: "No question." }, TOOLS, parts()).querySelector("figcaption")?.textContent).toBe("No question.");
    });

    it("draw a table that is a table for a screen reader however it is laid out, with the head of its column in every cell", () =>
    {
        const table = draw("first", "tabelle");
        expect(table.querySelector("figcaption")?.textContent).toBe("Two levels");
        expect(table.querySelector("figcaption > a.section-link")?.getAttribute("aria-label")).toBe("Link: Two levels");
        expect(table.querySelector("table")?.getAttribute("role")).toBe("table");
        expect(Array.from(table.querySelectorAll("thead [role=columnheader]")).map((cell) => cell.textContent)).toEqual(["Bund", "Land"]);
        expect(table.querySelector("thead td")?.getAttribute("role")).toBe("cell");
        const rows = Array.from(table.querySelectorAll("tbody tr"));
        expect(rows.map((row) => row.getAttribute("role"))).toEqual(["row", "row"]);
        expect(rows.map((row) => row.querySelector("th[scope=row][role=rowheader]")?.textContent)).toEqual(["Task", "Head"]);
        expect(Array.from(rows[0].querySelectorAll("td[role=cell] .cell-text")).map((cell) => cell.textContent)).toEqual(["defence", "schools"]);
        // The head inside a cell is for the narrow layout only; a screen reader has the real head.
        const heads = Array.from(rows[1].querySelectorAll(".cell-head"));
        expect(heads.map((head) => head.textContent)).toEqual(["Bund", "Land"]);
        expect(heads.every((head) => head.getAttribute("aria-hidden") === "true")).toBe(true);
        expect(table.querySelector("thead .de-term")?.textContent).toBe("Bund");
    });

    it("draw a chain of steps with what links one to the next", () =>
    {
        const chain = draw("first", "kette");
        expect(Array.from(chain.querySelectorAll("ol > li")).map((item) => item.className)).toEqual(["chain-step", "chain-link", "chain-step"]);
        expect(Array.from(chain.querySelectorAll(".chain-term")).map((term) => term.textContent)).toEqual(["der Bund", "das Land"]);
        expect((chain.querySelector(".chain-term") as HTMLElement).lang).toBe("de");
        expect(Array.from(chain.querySelectorAll(".chain-text")).map((text) => text.textContent)).toEqual(["the federation", "the state"]);
        expect(chain.querySelector(".chain-link")?.textContent).toBe("stands above");
        expect(chain.querySelector(".chain-link svg.icon")).not.toBeNull();
        expect(chain.querySelector("figcaption")?.textContent).toBe("Who stands above whom.");
    });

    it("draw a chain that names no link between two steps with the arrow alone", () =>
    {
        const chain = renderBlock({ type: "chain", id: "c", steps: [{ term: "A", text: "a" }, { term: "B", text: "b" }, { term: "C", text: "c" }], links: ["then"], caption: "" }, TOOLS, parts());
        expect(Array.from(chain.querySelectorAll(".chain-link")).map((link) => link.textContent)).toEqual(["then", ""]);
    });

    it("hand a timeline and a map to the page around them, and put a caption under the map", () =>
    {
        const timeline = draw("first", "zeit");
        expect(timeline.id).toBe("block-zeit");
        expect(timeline.className).toBe("lesson-timeline");
        expect((timeline.querySelector(".drawn-timeline") as HTMLElement).dataset.block).toBe("zeit:machtergreifung,einheit");
        const map = draw("first", "karte");
        expect(map.className).toBe("lesson-map");
        expect((map.querySelector(".drawn-map") as HTMLElement).dataset.block).toBe("karte:states");
        expect(map.querySelector("figcaption")?.textContent).toBe("The 16 federal states.");
    });

    it("give every block the name it has in an address, so a link and the reading progress can find it", () =>
    {
        const lesson = book.lesson("first");
        expect(lesson?.blocks.map((block) => renderBlock(block, TOOLS, parts()).dataset.anchor)).toEqual(lesson?.blocks.map((block) => block.id));
    });

    it("draw a trap of the test as a note with a heading", () =>
    {
        const watch = draw("first", "falle");
        expect(watch.tagName).toBe("ASIDE");
        expect(watch.className).toBe("watch");
        expect(watch.querySelector(".watch-label")?.textContent).toBe("Watch out");
        expect(watch.querySelector("p")?.textContent).toBe("A wrong option says never.");
        expect(watch.querySelector("p strong")?.textContent).toBe("never");
    });

    it("draw the questions to answer from memory, each answer covered until it is asked for", () =>
    {
        const opened: string[] = [];
        const recall = draw("first", "erinnern", parts(["recall-erinnern-1"], opened));
        expect(recall.querySelector("h3")?.textContent).toBe("From memory");
        expect(Array.from(recall.querySelectorAll(".recall-q")).map((entry) => entry.textContent)).toEqual(["Which article comes first?", "Who is protected?"]);
        const boxes = Array.from(recall.querySelectorAll<HTMLElement>(".reveal"));
        expect(boxes.map((box) => [box.id, box.className])).toEqual([["recall-erinnern-0", "reveal"], ["recall-erinnern-1", "reveal is-open"]]);
        expect(boxes.map((box) => box.querySelector(".recall-a")?.textContent)).toEqual(["Article 1.", "Every person."]);
        (recall.querySelector("#recall-erinnern-0-show") as HTMLButtonElement).click();
        expect(opened).toEqual(["recall-erinnern-0"]);
    });
});
