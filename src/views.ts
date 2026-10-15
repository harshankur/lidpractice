import { questionName } from "./states";
import { BAMF_CATALOGUE_PAGE_URL, BAMF_CATALOGUE_PDF_URL, CATALOGUE_STAND, CONFIRM_GUARD_MS, CONTACT_EMAIL, LOCAL_CATALOGUE_PDF, REPO_URL } from "./constants";
import { FAQ_ENTRIES, MESSAGE_LINKS } from "./content";
import { el } from "./dom";
import { i18n, t, type MessageKey, type MessageParams, type RichPart } from "./i18n";
import {
    catalogueImagePath, cataloguePdfPageUrl, generalMailtoUrl, githubIssueUrl, questionIssueUrl, questionMailtoUrl,
} from "./links";
import { imageSizeAttributes } from "./imageSizes";
import type { ModalView } from "./modal";
import type { Question } from "./types";

/** What the dialog views can ask the app to do. */
export interface ViewActions
{
    /** Shows the question as printed in the catalogue. */
    showOriginal(question: Question): void;
    /** Shows the report options, for one question or in general. */
    showReport(question: Question | null): void;
    /** Shows the About and FAQ view. */
    showAbout(): void;
}

/** Attributes for a link that opens in a new tab. */
const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" };

/**
 * Builds a link that opens in a new tab.
 * @param text Link text.
 * @param href Target.
 * @param className Optional class.
 * @returns Anchor element.
 */
function externalLink(text: string, href: string, className = ""): HTMLElement
{
    return el("a", { href, ...EXTERNAL, ...(className ? { class: className } : {}) }, text);
}

/**
 * Turns text and links into DOM nodes.
 * @param parts Plain strings and link descriptions.
 * @returns Nodes in the same order.
 */
export function renderRich(parts: RichPart[]): Node[]
{
    return parts.map((part) => (typeof part === "string" ? document.createTextNode(part) : externalLink(part.text, part.href)));
}

/**
 * A paragraph from a message that may contain links.
 * @param key Message key.
 * @param params Values for placeholders.
 * @returns Paragraph element.
 */
function richParagraph(key: MessageKey, params: MessageParams = {}): HTMLElement
{
    return el("p", {}, ...renderRich(i18n.rich(key, MESSAGE_LINKS, params)));
}

/**
 * The question as printed in the official catalogue, with its page and the official sources.
 * @param question The question.
 * @param actions What the buttons do.
 * @returns Dialog view.
 */
export function originalView(question: Question, actions: ViewActions): ModalView
{
    const page = question.pg;
    const where = page === undefined ? t("original.whereCatalogue") : t("original.wherePage", { page });
    const image = el("img", {
        class: "original-image",
        src: catalogueImagePath(question.n),
        ...imageSizeAttributes(catalogueImagePath(question.n)),
        alt: t("original.alt", { n: questionName(question.n), where }),
        onerror: (event: Event) =>
        {
            (event.target as HTMLElement).replaceWith(el("p", { class: "original-missing" }, t("original.missing")));
        },
    });
    const links = [
        page === undefined ? null : el("li", {}, externalLink(t("original.openPage", { page }), cataloguePdfPageUrl(page))),
        el("li", {}, externalLink(t("original.official"), BAMF_CATALOGUE_PAGE_URL)),
        el("li", {}, externalLink(t("original.download"), BAMF_CATALOGUE_PDF_URL)),
    ];
    const content = el("div", { class: "original" },
        el("p", { class: "muted" }, t("original.intro", { n: questionName(question.n), where, stand: CATALOGUE_STAND })),
        el("figure", { class: "original-figure" }, image),
        el("ul", { class: "link-list" }, ...links),
        el("div", { class: "modal-actions" },
            el("button", { class: "secondary", type: "button", onclick: () => actions.showReport(question) }, t("original.report")),
            el("button", { class: "secondary", type: "button", onclick: () => actions.showAbout() }, t("original.about"))));
    return { title: t("original.title", { n: questionName(question.n) }), content, className: "modal-fixed" };
}

/** What the prompt before finishing an exam shows and does. */
export interface FinishPrompt
{
    /** Questions without an answer. */
    unanswered: number;
    /** Of those, the ones that were never opened. */
    never: number;
    /** Questions marked for review. */
    marked: number;
    /** Closes the prompt and goes on with the exam. */
    keepWorking(): void;
    /** Ends the exam. */
    finish(): void;
}

/**
 * The prompt before an exam is finished with questions unanswered or marked. Closing the dialog in any way keeps
 * working. The button that finishes ignores a press in the first moment, so a double tap on the button that opened
 * the prompt cannot end the exam.
 * @param prompt The counts, and what the buttons do.
 * @returns Dialog view.
 */
export function finishView(prompt: FinishPrompt): ModalView
{
    const shownAt = Date.now();
    const content = el("div", { class: "confirm" },
        prompt.unanswered > 0 ? el("p", {}, i18n.plural("exam.unanswered", prompt.unanswered)) : null,
        prompt.unanswered > 0 ? el("p", { class: "confirm-detail" }, t("exam.unansweredSplit", { never: prompt.never, left: prompt.unanswered - prompt.never })) : null,
        prompt.marked > 0 ? el("p", {}, i18n.plural("exam.marked", prompt.marked)) : null,
        el("div", { class: "modal-actions" },
            el("button", { id: "exam-keep-working", class: "secondary", type: "button", onclick: () => prompt.keepWorking() }, t("exam.keepWorking")),
            el("button", {
                id: "exam-finish-anyway",
                class: "danger",
                type: "button",
                onclick: () =>
                {
                    if (Date.now() - shownAt >= CONFIRM_GUARD_MS)
                    {
                        prompt.finish();
                    }
                },
            }, t("exam.finishAnyway"))));
    return { title: t("exam.finishTitle"), content };
}

/**
 * One way of reporting, with a short explanation and a link that looks like a button.
 * @param title What it does.
 * @param description Why you would choose it.
 * @param link The action.
 * @returns Block element.
 */
function choice(title: string, description: string, link: HTMLElement): HTMLElement
{
    return el("div", { class: "choice" },
        el("h3", {}, title),
        el("p", { class: "muted" }, description),
        link);
}

/**
 * The ways to report a problem: a prefilled GitHub issue, or an email.
 * @param question The question the report is about, or null for a general report.
 * @param actions What the back button does.
 * @returns Dialog view.
 */
export function reportView(question: Question | null, actions: ViewActions): ModalView
{
    const issueLink = question
        ? externalLink(t("report.github.prefilled"), questionIssueUrl(question.n), "button-link primary")
        : externalLink(t("report.github.open"), githubIssueUrl("question-error"), "button-link primary");
    const mailLink = externalLink(
        t("report.email.action", { address: CONTACT_EMAIL }),
        question ? questionMailtoUrl(question.n, question.pg) : generalMailtoUrl(),
        "button-link secondary",
    );
    const intro = question ? t("report.introQuestion", { n: questionName(question.n) }) : t("report.intro");
    const content = el("div", { class: "report" },
        el("p", {}, intro),
        choice(t("report.github.title"), t("report.github.text"), issueLink),
        choice(t("report.email.title"), t("report.email.text"), mailLink),
        el("h3", { class: "report-more" }, t("report.more")),
        el("ul", { class: "link-list" },
            el("li", {}, externalLink(t("report.drift"), githubIssueUrl("catalogue-drift"))),
            el("li", {}, externalLink(t("report.bug"), githubIssueUrl("app-bug")))),
        el("div", { class: "modal-actions" },
            el("button", {
                class: "secondary",
                type: "button",
                onclick: () => (question ? actions.showOriginal(question) : actions.showAbout()),
            }, t("report.back"))));
    return { title: question ? t("report.titleQuestion", { n: questionName(question.n) }) : t("report.title"), content, className: "modal-fixed" };
}

/**
 * About this trainer, the official sources, and the FAQ.
 * @param actions What the report button does.
 * @returns Dialog view.
 */
export function aboutView(actions: ViewActions): ModalView
{
    const faq = FAQ_ENTRIES.map((entry) => el("details", { class: "faq-item", id: `faq-${entry.id}` },
        el("summary", {}, t(entry.question)),
        ...entry.answers.map((key) => richParagraph(key, { stand: CATALOGUE_STAND }))));
    const content = el("div", { class: "about" },
        el("p", {}, t("about.intro", { stand: CATALOGUE_STAND })),
        el("h3", {}, t("about.bookletHeading")),
        el("ul", { class: "link-list" },
            el("li", {}, externalLink(t("about.bookletPage"), BAMF_CATALOGUE_PAGE_URL)),
            el("li", {}, externalLink(t("about.bookletDownload"), BAMF_CATALOGUE_PDF_URL)),
            el("li", {}, externalLink(t("about.bookletCopy"), LOCAL_CATALOGUE_PDF))),
        el("h3", {}, t("about.moreHeading")),
        el("ul", { class: "link-list" },
            el("li", {}, externalLink(t("about.repo"), REPO_URL))),
        el("h3", {}, t("about.faqHeading")),
        el("div", { class: "faq" }, ...faq),
        el("div", { class: "modal-actions" },
            el("button", { class: "secondary", type: "button", onclick: () => actions.showReport(null) }, t("about.report"))));
    return { title: t("about.title"), content, className: "modal-fixed" };
}
