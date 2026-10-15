import {
    BAMF_CATALOGUE_PAGE_URL, BAMF_CATALOGUE_PDF_URL, LICENSE_URL, LOCAL_CATALOGUE_PDF, REPO_URL,
} from "./constants";
import { msg, type MessageKey } from "./i18n";

/** One question and answer of the FAQ. The text is in the language files. */
export interface FaqEntry
{
    /** Stable id, used for the element id and in tests. */
    id: string;
    /** Message key of the question. */
    question: MessageKey;
    /** Message keys of the paragraphs of the answer. Paragraphs may contain `[text](linkId)` links. */
    answers: MessageKey[];
}

/** Frequently asked questions. Keep the ids stable, tests and links rely on them. */
export const FAQ_ENTRIES: FaqEntry[] = [
    { id: "official", question: msg("faq.official.q"), answers: [msg("faq.official.a1")] },
    { id: "edition", question: msg("faq.edition.q"), answers: [msg("faq.edition.a1")] },
    { id: "authentic", question: msg("faq.authentic.q"), answers: [msg("faq.authentic.a1"), msg("faq.authentic.a2")] },
    { id: "answers", question: msg("faq.answers.q"), answers: [msg("faq.answers.a1")] },
    { id: "translations", question: msg("faq.translations.q"), answers: [msg("faq.translations.a1")] },
    { id: "exam", question: msg("faq.exam.q"), answers: [msg("faq.exam.a1")] },
    { id: "privacy", question: msg("faq.privacy.q"), answers: [msg("faq.privacy.a1")] },
    { id: "changes", question: msg("faq.changes.q"), answers: [msg("faq.changes.a1"), msg("faq.changes.a2")] },
    { id: "report", question: msg("faq.report.q"), answers: [msg("faq.report.a1")] },
    { id: "license", question: msg("faq.license.q"), answers: [msg("faq.license.a1")] },
];

/** Where the `[text](linkId)` links of the messages lead. */
export const MESSAGE_LINKS: Record<string, string> = {
    bamfPage: BAMF_CATALOGUE_PAGE_URL,
    bamfPdf: BAMF_CATALOGUE_PDF_URL,
    copy: LOCAL_CATALOGUE_PDF,
    repo: REPO_URL,
    license: LICENSE_URL,
};
