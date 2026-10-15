import type { QuestionBank } from "./bank";
import { clampedText, el } from "./dom";
import { i18n, t } from "./i18n";
import { ALL_TOPICS, TOPIC_GROUPS, sameTopics } from "./topics";
import type { RoundOrder } from "./types";

/** What the panel shows and what its controls do. */
export interface TopicPanelConfig
{
    bank: QuestionBank;
    /** Subjects ticked in the panel. Nothing is applied until the round is started. */
    topics: readonly string[];
    /** The user's federal state. */
    stateId: string;
    /** Whether the questions of that state are part of the round. */
    includeState: boolean;
    order: RoundOrder;
    /** Whether answers are final in the round. */
    lockAnswers: boolean;
    /** Whether only the questions whose last answer was wrong are drawn from the choice. */
    onlyWeak: boolean;
    /** How many weak spots there are in all, whatever the choice. */
    weakTotal: number;
    /** How many weak spots the choice contains. */
    weakCount: number;
    /** Whether the panel is the one of the training: only the subjects and the state, and the training's own texts. */
    forTrain?: boolean;
    /** The round that a new start would end, or null when there is none to lose. */
    running: { done: number; total: number } | null;
    onToggle(topic: string): void;
    onPreset(topics: readonly string[]): void;
    onIncludeState(include: boolean): void;
    onOrder(order: RoundOrder): void;
    onLock(locked: boolean): void;
    onOnlyWeak(only: boolean): void;
    onCancel(): void;
    onStart(): void;
}

/** The orders, with the messages that name and explain them. */
const ORDERS = [
    { value: "random", label: "order.random", hint: "order.randomHint" },
    { value: "booklet", label: "order.booklet", hint: "order.bookletHint" },
] as const;

/**
 * The panel in which the user chooses the order, the subjects, whether the questions of their state are included and whether answers are final
 * for a new round. It works on a staged copy: ticking something changes nothing in the round that is running
 * until "Start new round".
 * @param config Data and callbacks.
 * @returns The panel.
 */
export function renderTopicPanel(config: TopicPanelConfig): HTMLElement
{
    const { bank } = config;
    const stateName = bank.categoryName(config.stateId, i18n.locale);
    const inChoice = bank.select(config.topics, config.includeState ? [config.stateId] : []).length;
    const questions = config.onlyWeak ? config.weakCount : inChoice;
    const empty = questions === 0;

    const preset = (id: string, label: string, pressed: boolean, choose: () => void): HTMLElement => el("button", {
        id: `preset-${id}`,
        class: "secondary sm chip-button",
        type: "button",
        "aria-pressed": String(pressed),
        onclick: choose,
    }, label);

    const orderSection = el("fieldset", { class: "panel-section order-choice" },
        el("legend", { class: "panel-heading" }, t("panel.order")),
        ...ORDERS.map((entry) => el("label", { class: "order-option" },
            el("input", {
                id: `order-${entry.value}`,
                type: "radio",
                name: "round-order",
                checked: config.order === entry.value,
                onchange: () => config.onOrder(entry.value),
            }),
            el("span", {}, el("strong", {}, t(entry.label)), el("span", { class: "order-hint" }, t(entry.hint))))));

    const subjects = el("div", { class: "panel-section" },
        el("h3", { class: "panel-heading" }, t("panel.topics")),
        el("div", { class: "preset-row" },
            preset("all", t("panel.preset.all", { count: bank.select(null, []).length }), sameTopics(config.topics, ALL_TOPICS), () => config.onPreset(ALL_TOPICS)),
            preset("none", t("panel.preset.none"), config.topics.length === 0, () => config.onPreset([]))),
        ...TOPIC_GROUPS.map((group) => el("fieldset", { class: "topic-group" },
            el("legend", {}, t("panel.groupCount", { name: t(group.title), count: bank.select(group.topics, []).length })),
            el("div", { class: "topic-list" },
                ...group.topics.map((topic) => el("label", { class: "topic" },
                    el("input", {
                        id: `topic-${topic}`,
                        type: "checkbox",
                        checked: config.topics.includes(topic),
                        onchange: () => config.onToggle(topic),
                    }),
                    clampedText(bank.categoryName(topic, i18n.locale), 2),
                    el("span", { class: "topic-count" }, i18n.number(bank.select([topic], []).length))))))));

    const state = el("div", { class: "panel-section state-choice" },
        el("h3", { class: "panel-heading" }, t("panel.state")),
        el("label", { class: "order-option" },
            el("input", {
                id: "include-state",
                type: "checkbox",
                checked: config.includeState,
                onchange: (event: Event) => config.onIncludeState((event.target as HTMLInputElement).checked),
            }),
            el("span", {}, el("strong", {}, t("panel.stateInclude", { state: stateName })), el("span", { class: "order-hint" }, t("panel.stateHint")))));

    const weak = el("div", { class: "panel-section" },
        el("h3", { class: "panel-heading" }, t("panel.weak")),
        el("label", { class: "order-option" },
            el("input", {
                id: "only-weak",
                type: "checkbox",
                checked: config.onlyWeak,
                disabled: config.weakTotal === 0,
                onchange: (event: Event) => config.onOnlyWeak((event.target as HTMLInputElement).checked),
            }),
            el("span", {}, el("strong", {}, t("panel.weakOnly")), el("span", { class: "order-hint" }, t(config.weakTotal === 0 ? "panel.weakNone" : "panel.weakHint")))));

    const answers = el("div", { class: "panel-section" },
        el("h3", { class: "panel-heading" }, t("panel.answers")),
        el("label", { class: "order-option" },
            el("input", {
                id: "lock-answers",
                type: "checkbox",
                checked: config.lockAnswers,
                onchange: (event: Event) => config.onLock((event.target as HTMLInputElement).checked),
            }),
            el("span", {}, el("strong", {}, t("panel.lock")), el("span", { class: "order-hint" }, t("panel.lockHint")))));

    const topicsText = i18n.plural("panel.topicCount", config.topics.length);
    const countLine = config.includeState
        ? t("panel.countLine", { questions: i18n.plural("panel.questions", questions), topics: topicsText, state: stateName })
        : t("panel.countLineNoState", { questions: i18n.plural("panel.questions", questions), topics: topicsText });
    const emptyText = config.onlyWeak && inChoice > 0 ? t("panel.emptyWeak") : t("panel.empty");

    return el("section", { id: "topic-panel", class: "card panel", "aria-labelledby": "panel-title" },
        el("div", { class: "panel-head" },
            el("h2", { id: "panel-title", tabindex: "-1" }, t(config.forTrain ? "panel.titleTrain" : "panel.title")),
            el("span", { class: "panel-esc" }, t("panel.escHint"))),
        config.forTrain ? null : orderSection,
        subjects,
        state,
        config.forTrain ? null : weak,
        config.forTrain ? null : answers,
        el("div", { class: "panel-foot" },
            el("p", { class: "panel-count", role: "status" }, empty ? emptyText : countLine),
            config.running ? el("p", { class: "panel-consequence" }, t("panel.consequence", { done: config.running.done, total: config.running.total })) : null,
            el("div", { class: "footer-row panel-actions" },
                el("button", { id: "panel-cancel", class: "secondary", type: "button", onclick: () => config.onCancel() }, t("panel.cancel")),
                el("button", { id: "panel-start", class: "primary", type: "button", disabled: empty, onclick: () => config.onStart() }, t(config.forTrain ? "panel.startTrain" : "panel.start")))));
}
