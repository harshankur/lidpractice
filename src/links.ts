import { questionName } from "./states";
import { plain } from "./i18n";
import {
    CATALOGUE_IMAGE_DIGITS, CATALOGUE_IMAGE_FOLDER, CATALOGUE_STAND, CONTACT_EMAIL, LOCAL_CATALOGUE_PDF, QUESTION_FIELD_ID,
    REPO_URL, type IssueTemplate,
} from "./constants";

/**
 * Path of the image that shows a question as printed in the catalogue.
 * @param questionNumber Question number, 1 to 460.
 * @returns For example "catalogue/q-007.webp".
 */
export function catalogueImagePath(questionNumber: number): string
{
    return `${CATALOGUE_IMAGE_FOLDER}/q-${String(questionNumber).padStart(CATALOGUE_IMAGE_DIGITS, "0")}.webp`;
}

/**
 * Link that opens the copy of the catalogue at one page.
 * @param page Page number in the PDF.
 * @returns URL with a page anchor.
 */
export function cataloguePdfPageUrl(page: number): string
{
    return `${LOCAL_CATALOGUE_PDF}#page=${page}`;
}

/**
 * Link that opens a new GitHub issue from one of our issue forms, with some fields already filled in.
 * @param template Which form.
 * @param fields Form field ids and the values to prefill. "title" prefills the title.
 * @returns URL.
 */
export function githubIssueUrl(template: IssueTemplate, fields: Record<string, string> = {}): string
{
    const query = new URLSearchParams({ template: `${template}.yml`, ...fields });
    return `${REPO_URL}/issues/new?${query.toString()}`;
}

/**
 * Title of the issue or email about one question.
 * @param questionNumber Question number.
 * @returns Short title.
 */
export function questionReportTitle(questionNumber: number): string
{
    return `Question ${questionName(questionNumber)}: `;
}

/**
 * GitHub issue about a question, with the question number and title filled in.
 * @param questionNumber Question number.
 * @returns URL.
 */
export function questionIssueUrl(questionNumber: number): string
{
    return githubIssueUrl("question-error", {
        title: questionReportTitle(questionNumber),
        [QUESTION_FIELD_ID]: questionName(questionNumber),
    });
}

/**
 * Email to the maintainer. Line breaks use CRLF, which mail programs expect in a mailto body.
 * @param subject Subject line.
 * @param lines Lines of the body.
 * @returns mailto URL.
 */
export function mailtoUrl(subject: string, lines: string[]): string
{
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\r\n"))}`;
}

/**
 * Email about one question, with a template that asks for what the catalogue says.
 * The template is in the language of the interface.
 * @param questionNumber Question number.
 * @param page Page in the catalogue PDF, when known.
 * @returns mailto URL.
 */
export function questionMailtoUrl(questionNumber: number, page: number | undefined): string
{
    const where = page === undefined ? "" : plain("mail.page", { page });
    return mailtoUrl(plain("mail.subjectQuestion", { n: questionName(questionNumber) }), [
        plain("mail.question", { n: questionName(questionNumber), stand: CATALOGUE_STAND, where }),
        "",
        plain("mail.wrong"),
        "",
        "",
        plain("mail.expected"),
        "",
    ]);
}

/**
 * Email that is not about a single question.
 * @returns mailto URL.
 */
export function generalMailtoUrl(): string
{
    return mailtoUrl(plain("mail.subjectGeneral"), [plain("mail.general"), ""]);
}
