import { OPTION_LETTERS } from "../constants";
import { el, icon, type Child } from "../dom";
import { i18n, t } from "../i18n";
import { questionName } from "../states";
import type { Locale, PresentedQuestion, Question } from "../types";
import { eraChip } from "./chronology";
import { germanSpan, plainText, richNodes, termNode } from "./richText";
import type { Block, Era, UnitBlock } from "./types";

/**
 * The pieces a lesson is drawn from. Nothing here keeps state: what is covered, chosen or answered is handed in, and
 * a change is reported through a callback. Every piece keeps its size when its state changes: an answer that is
 * covered already takes its room, so nothing moves when it is uncovered.
 */

/** What the pieces need from the page around them. */
export interface LessonTools
{
    /** The text of a question or an option: German, and below it the translation when one is chosen. */
    bilingual(texts: Record<Locale, string>, className?: string): HTMLElement;
    /** The picture of a question with its credit, or null when it has none. */
    picture(question: Question): HTMLElement | null;
    /** Looks a question up. */
    question(questionNumber: number): Question | undefined;
    /** The text of a question in every language. */
    questionTexts(question: Question): Record<Locale, string>;
    /** Every era, for the name tag of a fact about a date. */
    eras: readonly Era[];
    /**
     * The link of a section of the lesson, to pass it on: a small link next to a heading, or null where a section is
     * shown on its own, outside its lesson.
     * @param section The name of the section in the address.
     * @param title What the section is called, for the name of the link.
     */
    link(section: string, title: string): HTMLElement | null;
}

/**
 * A text with its markup, as a paragraph.
 * @param text The text.
 * @param className Class of the paragraph.
 * @returns The paragraph.
 */
export function richParagraph(text: string, className = ""): HTMLElement
{
    return el("p", className ? { class: className } : {}, ...richNodes(text));
}

/**
 * Something that is covered until the user asks for it. The covered content takes its room from the start, and the
 * button that uncovers it lies over it, so uncovering moves nothing.
 * @param id Id of the box. The button has the same id with "-show".
 * @param content What is covered.
 * @param open Whether it is uncovered.
 * @param onOpen Uncovers it.
 * @param label The text of the button.
 * @returns The box.
 */
export function revealBox(id: string, content: Child[], open: boolean, onOpen: () => void, label: string = t("learn.reveal")): HTMLElement
{
    return el("div", { id, class: open ? "reveal is-open" : "reveal" },
        el("div", { class: "reveal-content", "aria-hidden": open ? false : "true" }, ...content),
        open ? null : el("button", { id: `${id}-show`, class: "secondary sm reveal-cover", type: "button", onclick: onOpen }, label));
}

/** How a question inside a lesson stands. */
export interface MiniQuestionState
{
    /** Start of the ids of its elements. */
    id: string;
    item: PresentedQuestion;
    /** The option that was chosen, or null. */
    selected: number | null;
    /** Whether right and wrong are shown once an option is chosen. The guess before reading shows neither. */
    reveal: boolean;
    /** Whether an option can still be chosen. */
    open: boolean;
    /** A note under the options, in a room that is always there. */
    note: string;
    /** Extra tags next to the question number. */
    tags?: Child[];
    onChoose(index: number): void;
}

/**
 * A catalogue question inside a lesson: the German text, the picture, the four options, and one line for a note.
 * @param state How it stands.
 * @param tools The page around it.
 * @returns The question.
 */
export function miniQuestion(state: MiniQuestionState, tools: LessonTools): HTMLElement
{
    const { question, options } = state.item;
    const answered = state.selected !== null && state.reveal;
    const right = answered && options[state.selected as number].isCorrect;
    return el("div", { id: state.id, class: "mini-q" },
        el("div", { class: "meta" }, el("span", { class: "tag tag-strong qno", dir: "ltr" }, questionName(question.n)), ...(state.tags ?? [])),
        el("p", { class: "question small" }, tools.bilingual(tools.questionTexts(question))),
        tools.picture(question),
        el("ol", { class: "options" }, ...options.map((option, index) =>
        {
            const classes = ["option"];
            if (state.selected === index)
            {
                classes.push("is-selected");
            }
            if (answered && option.isCorrect)
            {
                classes.push("is-correct");
            }
            if (answered && state.selected === index && !option.isCorrect)
            {
                classes.push("is-wrong");
            }
            const mark = answered ? (option.isCorrect ? t("card.correct") : (state.selected === index ? t("card.yourAnswer") : "")) : "";
            return el("li", {},
                el("button", {
                    id: `${state.id}-${index}`,
                    class: classes.join(" "),
                    type: "button",
                    "aria-pressed": String(state.selected === index),
                    disabled: !state.open,
                    onclick: () => state.onChoose(index),
                },
                    el("span", { class: "letter" }, OPTION_LETTERS[index]),
                    tools.bilingual(option.texts, "option-text"),
                    mark ? el("span", { class: "mark" }, mark) : null));
        })),
        el("p", { class: `mini-q-note${answered ? (right ? " ok" : " bad") : ""}`, role: "status" }, state.note));
}

/**
 * The tags under the heading of a unit: its era, and how often the catalogue asks for it.
 * @param unit The unit.
 * @param tools The page around it.
 * @returns The tags, or null when there is nothing to say.
 */
function unitTags(unit: UnitBlock, tools: LessonTools): HTMLElement | null
{
    const era = tools.eras.find((entry) => entry.id === unit.era);
    const often = unit.questions.length > 1 ? el("span", { class: "tag" }, i18n.plural("learn.unit.asked", unit.questions.length)) : null;
    return era || often ? el("p", { class: "unit-tags" }, era ? eraChip(era) : null, often) : null;
}

/**
 * A fact unit: the question it answers, the German term with its meaning, the explanation and a case.
 * @param unit The unit.
 * @param tools The page around it.
 * @returns The section.
 */
export function renderUnit(unit: UnitBlock, tools: LessonTools): HTMLElement
{
    const shown = unit.shown === undefined ? undefined : tools.question(unit.shown);
    return el("section", { id: `unit-${unit.id}`, class: "unit", "data-anchor": unit.id },
        el("h3", { class: "unit-title" }, el("span", {}, ...richNodes(unit.q)), tools.link(unit.id, plainText(unit.q))),
        unitTags(unit, tools),
        unit.term ? el("p", { class: "term" }, termNode(unit.term), unit.meaning ? el("span", { class: "term-meaning" }, ...richNodes(unit.meaning)) : null) : null,
        shown
            ? el("div", { class: "unit-asked" },
                el("span", { class: "unit-label" }, t("learn.unit.question", { name: questionName(shown.n) })),
                tools.bilingual(tools.questionTexts(shown)))
            : null,
        richParagraph(unit.body, "unit-body"),
        unit.example ? el("p", { class: "unit-case" }, el("span", { class: "unit-label" }, t("learn.unit.example")), ...richNodes(unit.example)) : null,
        unit.asOf === undefined ? null : el("p", { class: "hint unit-asof" }, t("learn.unit.asOf", { year: String(unit.asOf) })));
}

/**
 * A table that sets things side by side. On a narrow screen every row becomes a small list, each value with the
 * head of its column in front of it, so nothing has to scroll sideways. The parts name their roles themselves,
 * because a table that is laid out as blocks would otherwise stop being a table for a screen reader.
 * @param block The table.
 * @param tools The page around it.
 * @returns The table in its frame.
 */
function renderCompare(block: Extract<Block, { type: "compare" }>, tools: LessonTools): HTMLElement
{
    return el("figure", { id: `block-${block.id}`, class: "compare", "data-anchor": block.id },
        el("figcaption", { class: "block-title" }, el("span", {}, ...richNodes(block.title)), tools.link(block.id, plainText(block.title))),
        el("table", { role: "table" },
            el("thead", { role: "rowgroup" }, el("tr", { role: "row" }, ...block.head.map((cell, index) => (index === 0
                ? el("td", { role: "cell" })
                : el("th", { scope: "col", role: "columnheader" }, ...richNodes(cell)))))),
            el("tbody", { role: "rowgroup" }, ...block.rows.map((row) => el("tr", { role: "row" }, ...row.map((cell, index) => (index === 0
                ? el("th", { scope: "row", role: "rowheader" }, ...richNodes(cell))
                : el("td", { role: "cell" },
                    el("span", { class: "cell-head", "aria-hidden": "true" }, ...richNodes(block.head[index])),
                    el("span", { class: "cell-text" }, ...richNodes(cell))))))))));
}

/**
 * A chain of steps from top to bottom, with what links one step to the next.
 * @param block The chain.
 * @returns The chain in its frame.
 */
function renderChain(block: Extract<Block, { type: "chain" }>): HTMLElement
{
    const parts: HTMLElement[] = [];
    block.steps.forEach((step, index) =>
    {
        if (index > 0)
        {
            parts.push(el("li", { class: "chain-link" }, icon("chevronDown"), el("span", {}, ...richNodes(block.links[index - 1] ?? ""))));
        }
        parts.push(el("li", { class: "chain-step" }, germanSpan(step.term, "chain-term"), el("span", { class: "chain-text" }, ...richNodes(step.text))));
    });
    return el("figure", { id: `block-${block.id}`, class: "chain", "data-anchor": block.id }, el("ol", {}, ...parts), el("figcaption", { class: "caption" }, ...richNodes(block.caption)));
}

/** What the blocks with state of their own need: the timeline, the map and the questions to recall. */
export interface BlockParts
{
    /** Draws an excerpt of the timeline. */
    timeline(block: Extract<Block, { type: "timeline" }>): HTMLElement;
    /** Draws a map. */
    map(block: Extract<Block, { type: "map" }>): HTMLElement;
    /** Whether an answer of a recall block is uncovered. */
    isOpen(id: string): boolean;
    /** Uncovers an answer of a recall block. */
    open(id: string): void;
}

/**
 * Draws a block of a lesson.
 * @param block The block.
 * @param tools The page around it.
 * @param parts The blocks that keep state.
 * @returns The element.
 */
export function renderBlock(block: Block, tools: LessonTools, parts: BlockParts): HTMLElement
{
    switch (block.type)
    {
        case "unit":
            return renderUnit(block, tools);
        case "picture":
        {
            const question = tools.question(block.question);
            return el("figure", { id: `block-${block.id}`, class: "lesson-picture", "data-anchor": block.id },
                question ? tools.picture(question) : null,
                el("figcaption", { class: "caption" }, ...richNodes(block.caption)));
        }
        case "compare":
            return renderCompare(block, tools);
        case "chain":
            return renderChain(block);
        case "timeline":
            return el("figure", { id: `block-${block.id}`, class: "lesson-timeline", "data-anchor": block.id }, parts.timeline(block));
        case "map":
            return el("figure", { id: `block-${block.id}`, class: "lesson-map", "data-anchor": block.id }, parts.map(block), el("figcaption", { class: "caption" }, ...richNodes(block.caption)));
        case "watch":
            return el("aside", { id: `block-${block.id}`, class: "watch", "data-anchor": block.id },
                el("span", { class: "watch-label" }, icon("alert"), t("learn.watch.title")),
                richParagraph(block.text));
        case "recall":
            return el("section", { id: `block-${block.id}`, class: "recall", "data-anchor": block.id },
                el("h3", { class: "block-title" }, t("learn.recall.title")),
                el("p", { class: "hint" }, t("learn.recall.hint")),
                el("ol", { class: "recall-list" }, ...block.items.map((item, index) =>
                {
                    const id = `recall-${block.id}-${index}`;
                    return el("li", {}, richParagraph(item.q, "recall-q"), revealBox(id, [richParagraph(item.a, "recall-a")], parts.isOpen(id), () => parts.open(id)));
                })));
    }
}
