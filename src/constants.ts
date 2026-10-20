import source from "../data/catalogue-source.json";
import identity from "./identity.json";

/**
 * Constants shared by several files: the identity of the product, where the questions come from,
 * where to report problems, the exam rules, and the names of the files that belong to the catalogue.
 */

/** Display name of the product. Never typed a second time, every surface reads it from here. */
export const APP_NAME: string = identity.name;

/** Short display name, for the home screen icon. */
export const APP_SHORT_NAME: string = identity.shortName;

/** What stands between the name of a page and the name of the site in the title of the page, as on the pages of the legal notice. */
export const TITLE_SEPARATOR: string = identity.titleSeparator;

/**
 * The title of the start page: what the page is for, in the words people search for, then the name of the site. It is the
 * same in every language of the interface, because the counter reads the title and must not learn the visitor's language
 * from it. The build writes the same title into the page.
 */
export const SEARCH_TITLE = `${identity.searchTitlePrefix}${TITLE_SEPARATOR}${APP_NAME}`;

/** The space between two words that are put together from two texts, such as two spans of one heading or one button. */
export const WORD_SPACE = " ";

/** Storage key. The slug is the namespace, bump `storageVersion` in identity.json when the saved format changes. */
export const STORAGE_KEY = `${identity.slug}-v${identity.storageVersion}`;

/** Keys of older saved formats. Progress is copied from them once, when the current key is empty. */
export const LEGACY_STORAGE_KEYS = ["lid-berlin-trainer-v3", "lid-berlin-trainer-v2"];

/** Number of general questions in an exam. */
export const EXAM_GENERAL_COUNT = 30;

/** Number of questions of the chosen federal state in an exam. */
export const EXAM_STATE_COUNT = 3;

/** Correct answers needed to pass the exam. */
export const EXAM_PASS_MARK = 17;

/** Milliseconds in one second. */
export const MS_PER_SECOND = 1000;

/** Seconds in one minute. */
export const SECONDS_PER_MINUTE = 60;

/** Exam length in minutes. */
export const EXAM_DURATION_MINUTES = 60;

/** Exam length in milliseconds. */
export const EXAM_DURATION_MS = EXAM_DURATION_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** A count down shows a colour nudge when fewer than this many minutes are left. */
export const CLOCK_NUDGE_MINUTES = 15;

/** A count down gets a yellow border when fewer than this many minutes are left. */
export const CLOCK_WARN_MINUTES = 5;

/** A count down gets a red border when fewer than this many minutes are left. */
export const CLOCK_CRITICAL_MINUTES = 1;

/** The count down of practice starts from this many minutes until the user sets another time. */
export const DEFAULT_COUNTDOWN_MINUTES = 30;

/** The longest time a count down can be set to, in minutes. It keeps the display to three digits of minutes. */
export const MAX_COUNTDOWN_MINUTES = 999;

/** How long an error message stays visible, in milliseconds. */
export const TOAST_DURATION_MS = 6000;

/** A button that needs a second press goes back to normal after this long without it, in milliseconds. */
export const TWO_STEP_TIMEOUT_MS = 5000;

/**
 * The button that confirms a prompt ignores a press this soon after the prompt appeared, in milliseconds,
 * so the second tap of a double tap on the button that opened it confirms nothing.
 */
export const CONFIRM_GUARD_MS = 500;

/** Factor that turns a ratio into a percentage. */
export const PERCENT = 100;

/** Highest general question number. Questions above this belong to a federal state. */
export const LAST_GENERAL_NUMBER = 300;

/** Letters shown next to options. */
export const OPTION_LETTERS = ["A", "B", "C", "D"];

/** Total number of questions in the bank: 300 general and 10 for each of the 16 federal states. */
export const QUESTION_COUNT = 460;

/** Edition of the official catalogue ("Stand") that the questions are based on. Recorded in data/catalogue-source.json. */
export const CATALOGUE_STAND: string = source.stand;

/** Public page of the official catalogue at the Bundesamt für Migration und Flüchtlinge. */
export const BAMF_CATALOGUE_PAGE_URL: string = source.pageUrl;

/** Direct download of the edition above. */
export const BAMF_CATALOGUE_PDF_URL: string = source.pdfUrl;

/** Copy of that exact PDF, served next to the page. */
export const LOCAL_CATALOGUE_PDF = "catalogue/gesamtfragenkatalog-lebenindeutschland.pdf";

/** Folder that holds one image per question, cut out of the PDF. */
export const CATALOGUE_IMAGE_FOLDER = "catalogue";

/** Question numbers in image file names are padded to this many digits. */
export const CATALOGUE_IMAGE_DIGITS = 3;

/**
 * The legal notice (Impressum) and the privacy notice (Datenschutzerklaerung). Every site of the operator shares one of each,
 * on the operator's own site; the privacy notice has a section for this site in German and one in English, and the link opens
 * the one in the reader's language (privacyNoticeUrl). Their labels are in the language of the interface (`footer.legalNotice`,
 * `footer.privacy`): "Impressum" and "Datenschutz" in German, "Legal notice" and "Privacy" in English.
 */
export const LEGAL_NOTICE_URL: string = identity.legalNoticeUrl;
/** This site's section of the privacy notice in German. */
export const PRIVACY_NOTICE_URL: string = identity.privacyNoticeUrl;
/** The same section in English. */
export const PRIVACY_NOTICE_URL_ENGLISH: string = identity.privacyNoticeUrlEnglish;

/**
 * This site's section of the privacy notice for a reader of a language: the German one in German, and the English one in every
 * other language, as the notice is written in those two.
 * @param locale The language of the interface.
 * @returns The address.
 */
export function privacyNoticeUrl(locale: string): string
{
    return locale === "de" ? PRIVACY_NOTICE_URL : PRIVACY_NOTICE_URL_ENGLISH;
}

/**
 * The hosts of the live site, exactly. Only there are visits counted in detail, and only with the visitor's consent: anywhere
 * else (a local server, a preview, a test) the counter's script is not added, so nothing is asked and nothing is sent.
 */
export const LIVE_HOSTS: readonly string[] = identity.liveHosts;

/**
 * The consent script of the operator's own view counter. It keeps the visitor's answer, and loads the counter only after a yes.
 * The site asks the question itself, in its own language and style, and hands the answer over (see consent.ts).
 */
export const CONSENT_SCRIPT_URL: string = identity.consentScriptUrl;

/** The name the view counter knows this site by. The counter's script also keeps the visitor's answer under it. */
export const COUNTER_APP: string = identity.counterApp;

/**
 * How many parts of an address after the "#" sign make a page for the counter: the tab and the page of the Learn tab
 * ("#learn/<lesson>"), so a section of a lesson ("#learn/<lesson>/<section>") counts as its lesson.
 */
export const COUNTED_HASH_DEPTH = 2;

/** The author, as named in the copyright line at the bottom of the page, with the address of their site and the year of the first release. */
export const AUTHOR_NAME: string = identity.author;
export const AUTHOR_URL: string = identity.authorUrl;
export const COPYRIGHT_YEAR: number = identity.copyrightYear;

/** Project home, where problems are reported. */
export const REPO_URL = "https://github.com/harshankur/lidpractice";

/** Address that receives reports by email. */
export const CONTACT_EMAIL = "hello@lidpractice.de";

/** The license of the code. */
export const LICENSE_NAME = "PolyForm Noncommercial License 1.0.0";
export const LICENSE_URL = `${REPO_URL}/blob/master/LICENSE`;

/** Issue forms in .github/ISSUE_TEMPLATE. The file name without ".yml" is the template id. */
export type IssueTemplate = "question-error" | "catalogue-drift" | "app-bug";

/** Id of the form field that holds the question number in the question-error template. */
export const QUESTION_FIELD_ID = "question";

/** How many answers pass before a question that was answered wrongly in the training comes back. */
export const TRAIN_RETRY_GAP = 3;

/** How far a topic can be pushed up by wrong answers in the training: the most extra weight it gets in the draw. */
export const TRAIN_BOOST_MAX = 3;

/** How many finished exams are remembered, the latest ones. */
export const EXAM_HISTORY_SIZE = 20;
