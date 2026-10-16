/**
 * Trainer for the citizenship test ("Leben in Deutschland"): the 300 general and the 160 state questions.
 *
 * Features:
 *  - Practice: a round over the topics you tick, in random order or in the order of the official booklet,
 *    with a timeline of the round. Questions can be skipped and answered later.
 *  - Train: an adaptive session over the topics. A right answer clears the question, a wrong one brings it back after a
 *    few questions and makes its topic come up more often, with a note that says why.
 *  - Exam: 30 random general questions plus 3 random questions of the chosen federal state, 17 correct answers to pass,
 *    60 minute countdown (same shape as the real test).
 *  - Weak spots: practice can be limited to the questions whose last answer was wrong, from the panel, the progress widget or the exam result.
 *  - Questions are always German (the language of the real test). A translation can be shown below them.
 *  - Site language (German or English) and appearance are set in the header.
 *
 * Error handling is centralized in {@link ErrorBoundary}. Nothing else uses try/catch.
 * Every text the user can read comes from the language files through {@link t}.
 */

import { START_MODE, modeHash, pageOf, placeOf } from "./address";
import { QuestionBank } from "./bank";
import {
    APP_NAME, AUTHOR_NAME, LEGAL_NOTICE_LABEL, LEGAL_NOTICE_URL, PRIVACY_NOTICE_LABEL, PRIVACY_NOTICE_URL, AUTHOR_URL, COPYRIGHT_YEAR, BAMF_CATALOGUE_PAGE_URL, CATALOGUE_STAND, EXAM_DURATION_MINUTES, EXAM_GENERAL_COUNT, MAX_COUNTDOWN_MINUTES, EXAM_PASS_MARK,
    EXAM_STATE_COUNT, LAST_GENERAL_NUMBER, MS_PER_SECOND, SECONDS_PER_MINUTE, OPTION_LETTERS, TOAST_DURATION_MS, TWO_STEP_TIMEOUT_MS,
} from "./constants";
import { Clock, type ClockLevel } from "./clock";
import { clampedText, el, icon, revealInStrip, twoStepLabel, type Child } from "./dom";
import { ErrorBoundary } from "./errorBoundary";
import { formatClock } from "./format";
import { FIRST_STRONG_ISOLATE, POP_ISOLATE, asLocale, asUiLocale, hasCatalog, i18n, msg, t, type MessageKey } from "./i18n";
import { readImageSizes, imageSizeAttributes } from "./imageSizes";
import { LanguageLoader, readLanguageFiles } from "./languages";
import { STATE_LESSON_PREFIX } from "./learn/course";
import { LearnTab } from "./learn/learn";
import { dayNumber } from "./learn/schedule";
import { shortcutKey } from "./keys";
import { Listbox } from "./listbox";
import { Modal } from "./modal";
import { pickRandom } from "./random";
import { Round } from "./round";
import { Trainer, type TrainReason } from "./train";
import { Store } from "./store";
import { applyTheme } from "./theme";
import { renderTimeline, scrollTimelineToCurrent } from "./timeline";
import { renderTopicPanel, type TopicPanelConfig } from "./topicPanel";
import { DEFAULT_STATE, STATE_IDS, questionName, stateOfNumber } from "./states";
import { ALL_TOPICS, describeSubjects, sameTopics } from "./topics";
import {
    DEFAULT_LOCALE, DEFAULT_UI_LOCALE, LOCALES, MODES, TRANSLATION_LOCALES, UI_LOCALES, automaticTranslation, directionOf, type AppMode, type ExamState, type Locale, type PresentedQuestion, type Question,
    type LearnFiles, type QuestionBundle, type RoundOrder, type ThemeChoice,
} from "./types";
import { aboutView, finishView, originalView, reportView, type ViewActions } from "./views";

// The modules behind the app are also available from here, which is where the tests and older code import them from.
export * from "./constants";
export { randomInt, shuffled, pickRandom } from "./random";
export { ErrorBoundary } from "./errorBoundary";
export { formatClock } from "./format";
export { QuestionBank } from "./bank";
export { Store } from "./store";
export { el };
export type { Child };
export * from "./types";

/** Query parameter that picks the interface language, for example `?lang=en`. */
const LANGUAGE_PARAMETER = "lang";

/** Prefix of a question number badge, as in "Q123". */
const QUESTION_PREFIX = "Q";

/** Name of each language in that language, for the lists. */
const ENDONYMS: Record<Locale, MessageKey> = {
    de: msg("language.endonym.de"),
    en: msg("language.endonym.en"),
    ar: msg("language.endonym.ar"),
    uk: msg("language.endonym.uk"),
    tr: msg("language.endonym.tr"),
    es: msg("language.endonym.es"),
    hi: msg("language.endonym.hi"),
};

/** The choices of the appearance list. */
const THEMES: { theme: ThemeChoice; label: MessageKey; short: MessageKey }[] = [
    { theme: "auto", label: msg("theme.auto"), short: msg("theme.short.auto") },
    { theme: "light", label: msg("theme.light"), short: msg("theme.short.light") },
    { theme: "dark", label: msg("theme.dark"), short: msg("theme.short.dark") },
];

/** Keys that move between the tabs. While a tab has focus, they belong to the tabs and not to the shortcuts. */
const TAB_KEYS = ["arrowleft", "arrowright", "home", "end"];

/** Keys that are on the way to a button, or only modify another key: they do not end a wait for a second press. */
const PASSIVE_KEYS = ["tab", "shift", "control", "alt", "meta"];

/** The buttons that need a second press. */
type TwoStep = "reset" | "startOver";

/** Each button that needs a second press: its id, its class while it is not waiting, and its two texts. */
const TWO_STEP_BUTTONS: Record<TwoStep, { id: string; className: string; label: MessageKey; confirm: MessageKey }> = {
    reset: { id: "reset-progress", className: "secondary sm two-step danger-text", label: msg("stats.reset"), confirm: msg("stats.resetConfirm") },
    startOver: { id: "exam-start-over", className: "secondary sm two-step", label: msg("exam.startOver"), confirm: msg("exam.startOverConfirm") },
};

/** Id of the result card of the exam, which takes the keyboard focus when the result appears. */
const RESULT_ID = "exam-result";

/** What stands between the name of a page and the name of the site in the title of the page, as on the pages of the legal notice. */
const TITLE_SEPARATOR = " | ";

/** The modes that run rounds. */
type RoundMode = "practice";

/**
 * Where the questions of a round come from: the chosen subjects, every weak spot there is, the weak spots inside the
 * chosen subjects, the mistakes of the round before, or a lesson of the Learn tab.
 */
type RoundSource = "topics" | "weak" | "weakSelection" | "mistakes" | "lesson";

/** A round with a note about what it is made of. */
interface ActiveRound
{
    round: Round;
    source: RoundSource;
}

/** A training session with the question that is up, as it is shown. */
interface TrainSession
{
    trainer: Trainer;
    /** The question that is up, with its options, or null when the session is over. */
    item: PresentedQuestion | null;
    /** The option that was chosen, or null before an answer and after giving up. */
    selected: number | null;
    /** Whether the user gave up on the question that is up. */
    gaveUp: boolean;
    /** Whether the user ended the session before every question was cleared. */
    ended: boolean;
}

/** The choices in the panel, not yet applied. */
interface StagedChoice
{
    topics: string[];
    includeState: boolean;
    lockAnswers: boolean;
    order: RoundOrder;
    /** Whether only the weak spots inside the choice are drawn. */
    onlyWeak: boolean;
}

/**
 * Text of a question number badge.
 * @param questionNumber Question number.
 * @returns For example "Q123".
 */
function questionLabel(questionNumber: number): string
{
    return stateOfNumber(questionNumber) ? questionName(questionNumber) : `${QUESTION_PREFIX}${questionNumber}`;
}

/**
 * Main controller. Owns state and re-renders the view after every change.
 */
export class App
{
    private readonly bank: QuestionBank;
    private readonly languages: LanguageLoader;
    /** Whether the questions of a language are being fetched for the translation, so its button waits. */
    private translating = false;
    /** Whether the first view was drawn. */
    private started = false;
    private readonly store = new Store();
    private readonly root: HTMLElement;
    private readonly toast: HTMLElement;

    private mode: AppMode = START_MODE;
    private readonly rounds: Record<RoundMode, ActiveRound | null> = { practice: null };
    private panelOpen = false;
    private train: TrainSession | null = null;
    /** The Learn tab. */
    private readonly learn: LearnTab;
    /** The lesson whose questions the round of practice is made of, while it is one: its title and its questions. */
    private lessonRound: { title: string; numbers: number[] } | null = null;
    /** What the training draws from. It starts as the choice of practice and is changed in the panel of the training. */
    private trainChoice: { topics: string[]; includeState: boolean } | null = null;
    private staged: StagedChoice = { topics: ALL_TOPICS, includeState: true, lockAnswers: false, order: "random", onlyWeak: false };
    /** The questions the user has: the general ones and those of the user's state, by state id. */
    /** Whether the first-visit setup dialog is showing. */
    private setupOpen = false;
    private poolCache: { state: string; numbers: Set<number> } | null = null;
    private legendOpen = false;
    /** Set when the question changed, so the next draw brings the top of the round back into view. */
    private moved = false;
    private exam: ExamState | null = null;
    /** Whether the result of the exam lists every answer, or only the ones that were missed. */
    private reviewAll = false;
    /** The clock of practice. It counts up or down, as the user chose. */
    private practiceClock = new Clock("up", 1);
    /** Handle of the once per second tick, or 0 while no clock is running. */
    private timerHandle = 0;
    /** The button that waits for its second press, or null. Only one can wait at a time. */
    private armed: TwoStep | null = null;
    /** Handle of the timer that takes the wait for a second press back, or 0. */
    private armTimer = 0;
    /** Set when the view changed as a whole (the result of an exam), so the next draw shows the top of the page. */
    private toTop = false;
    /** The address the page has set or followed last, to tell a change of the address by the user from its own. */
    private address = "";
    private readonly modal: Modal;
    private readonly actions: ViewActions = {
        showOriginal: (question) => this.modal.show(originalView(question, this.actions)),
        showReport: (question) => this.modal.show(reportView(question, this.actions)),
        showAbout: () => this.modal.show(aboutView(this.actions)),
    };

    /**
     * @param bank Question bank.
     * @param root Element to render into.
     * @param toast Element used for error messages.
     * @param modalRoot Element the dialog is rendered into.
     * @param languages Fetches the languages that are not in the page, when they are asked for.
     * @param learnFiles Where the files of the Learn tab are.
     */
    public constructor(bank: QuestionBank, root: HTMLElement, toast: HTMLElement, modalRoot: HTMLElement, languages: LanguageLoader, learnFiles: LearnFiles = { texts: {} })
    {
        this.languages = languages;
        this.bank = bank;
        this.root = root;
        this.toast = toast;
        this.modal = new Modal(modalRoot, [root]);
        this.learn = new LearnTab({
            bank,
            store: this.store,
            render: () => this.render(),
            bilingual: (texts, className) => this.bilingual(texts, className),
            questionTexts: (question) => this.questionTexts(question),
            picture: (question) => this.renderPicture(question),
            translationControl: (id) => this.translationControl(id),
            loadQuestions: (locale) => this.loadQuestions(locale),
            pool: () => this.pool(),
            practise: (numbers, title) => this.practiseLesson(numbers, title),
            practiseWeak: () => this.practiceWeakSpots(),
            openExam: () => this.switchMode("exam"),
            showDialog: (view) => this.modal.show(view),
            updateDialog: (view) => this.modal.update(view),
            closeDialog: () => this.modal.close(),
            visit: (hash, step) => this.setAddress(hash, step),
            link: (hash) => this.linkTo(hash),
        }, learnFiles);
    }

    /**
     * Fetches the messages of the interface in a language, and tells the user when that is not possible.
     * @param locale The language.
     * @returns Whether they are there.
     */
    private loadUi(locale: Locale): Promise<boolean>
    {
        if (hasCatalog(locale))
        {
            return Promise.resolve(true);
        }
        return ErrorBoundary.runAsync(async () =>
        {
            await this.languages.ui(locale);
            return true;
        }, false, t("language.loadFailed", { name: t(ENDONYMS[locale]) }));
    }

    /**
     * Fetches the questions in a language for the translation, and tells the user when that is not possible.
     * @param locale The language.
     * @returns Whether they are there.
     */
    private async loadQuestions(locale: Locale): Promise<boolean>
    {
        if (this.bank.hasQuestions(locale))
        {
            return true;
        }
        this.translating = true;
        if (this.started)
        {
            this.render();
        }
        const loaded = await ErrorBoundary.runAsync(async () =>
        {
            await this.languages.questions(locale);
            return true;
        }, false, t("language.loadFailed", { name: t(ENDONYMS[locale]) }));
        this.translating = false;
        return loaded;
    }

    /**
     * Loads saved state, wires keyboard input, and draws the first view. The languages that the first view needs, the one of the site
     * and the one of a translation that is on, are fetched first when they are not in the page; if that fails, the page opens in English
     * without a translation.
     */
    public async start(): Promise<void>
    {
        // The language in the address wins once, and is known before the saved state is read, so a problem
        // with the saved state is already reported in that language. It is then saved and taken out of the
        // address, so a later choice in the page is not undone by the next reload.
        const requested = asUiLocale(new URLSearchParams(window.location.search).get(LANGUAGE_PARAMETER));
        const requestedLoaded = requested !== undefined && await this.loadUi(requested);
        if (requestedLoaded)
        {
            i18n.setLocale(requested);
        }
        this.store.load();
        if (requestedLoaded)
        {
            this.store.state.uiLanguage = requested;
            this.store.syncTranslation();
            this.store.save();
        }
        if (requested)
        {
            this.dropLanguageParameter();
        }
        const state = this.store.state;
        if (!(await this.loadUi(state.uiLanguage)))
        {
            // The page opens as plainly as it can: in English, and without a translation that would need more files.
            state.uiLanguage = DEFAULT_UI_LOCALE;
            state.translation = "off";
        }
        this.store.syncTranslation();
        if (state.translation !== "off" && !(await this.loadQuestions(state.translation)))
        {
            state.translation = "off";
        }
        i18n.setLocale(state.uiLanguage);
        applyTheme(this.store.state.theme);
        document.addEventListener("keydown", (event) => this.handleKey(event));
        document.addEventListener("click", (event) => this.releaseOnClick(event));
        // The row of tabs is measured when the page is drawn. Its words get another width when the font arrives or the window changes, so it is measured again then.
        window.addEventListener("resize", () => this.revealOpenTab());
        void document.fonts?.ready.then(() => this.revealOpenTab());
        this.practiceClock = new Clock(this.store.state.clockMode, this.store.state.clockMinutes);
        this.rounds.practice = this.newTopicRound();
        this.openAddress();
        this.started = true;
        this.render();
        if (!this.store.state.setupDone)
        {
            this.showSetup();
        }
    }

    /**
     * Reads the address the page was opened with, and listens to the address from then on. Every tab has an address
     * of its own (see address.ts), and so has every page of the Learn tab (see learn/route.ts): a link leads straight
     * to a tab, to a lesson or to a section of it, and the Back button of the browser leads to the page before.
     */
    private openAddress(): void
    {
        const remembered = this.store.state.lastPlace;
        if (window.location.hash === "" && remembered !== "")
        {
            // The plain address of the site goes on where the user was last, and says so. A link names its own place and wins.
            const url = new URL(window.location.href);
            url.hash = remembered;
            window.history.replaceState(null, "", url);
        }
        const place = placeOf(window.location.hash);
        const state = this.store.state;
        this.enterMode(place.mode);
        if (place.route)
        {
            const route = place.route;
            const linkedState = route.page === "lesson" && route.lesson.startsWith(STATE_LESSON_PREFIX) ? route.lesson.slice(STATE_LESSON_PREFIX.length) : "";
            if (!state.setupDone && STATE_IDS.includes(linkedState))
            {
                // A first visit by a link to the lesson about a state: that state is the one offered in the welcome dialog.
                state.state = linkedState;
            }
            this.learn.follow(route);
        }
        else
        {
            // An address that names no tab, or names one in another spelling, is put right.
            this.setAddress(this.hash(), false);
        }
        if ("scrollRestoration" in window.history)
        {
            // The page is drawn by this code, so this code puts the window where the user was. The browser would do it before the page is drawn.
            window.history.scrollRestoration = "manual";
        }
        this.address = window.location.href;
        window.addEventListener("popstate", () => this.followAddress());
        window.addEventListener("hashchange", () => this.followAddress());
        window.addEventListener("scroll", () => this.onScroll(), { passive: true });
    }

    /** The address of what the page shows: the tab, and the page of the Learn tab. */
    private hash(): string
    {
        return this.mode === "learn" ? this.learn.hash() : modeHash(this.mode);
    }

    /**
     * The title of the page, which the browser shows on its tab, in its history and in a bookmark: the name of what
     * shows (a lesson, a page of the Learn tab, or else the tab) in front of the name of the site. The plain address
     * of the site keeps the plain name of the site, as it keeps its plain address.
     */
    private title(): string
    {
        if (window.location.hash === "")
        {
            return APP_NAME;
        }
        const page = (this.mode === "learn" ? this.learn.title() : null) ?? this.tabLabel(this.mode);
        return `${page}${TITLE_SEPARATOR}${APP_NAME}`;
    }

    /**
     * Makes a place the address of the page, without loading anything.
     * @param hash The part after the "#" sign, with the sign: a tab, or a place of the Learn tab.
     * @param step Whether this is a step in the history of the browser. Another section of the same page never is.
     */
    private setAddress(hash: string, step: boolean): void
    {
        const url = new URL(window.location.href);
        const samePage = pageOf(url.hash) === pageOf(hash);
        // The address of the site without a tab stands for the tab the page opens with, and stays as plain as it is while that tab shows.
        if (url.hash !== hash && !(samePage && url.hash === ""))
        {
            url.hash = hash;
            if (step && !samePage)
            {
                window.history.pushState(null, "", url);
            }
            else
            {
                window.history.replaceState(null, "", url);
            }
        }
        this.address = window.location.href;
        this.store.rememberPlace(hash);
    }

    /**
     * The whole address of a place of the Learn tab, to pass it on. It carries nothing of the visitor: no language and no setting.
     * @param hash The part after the "#" sign, with the sign.
     */
    private linkTo(hash: string): string
    {
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = hash;
        return url.href;
    }

    /**
     * Shows what the address stands for, after the user went back or forward in the browser or changed the address by hand.
     * A running exam is not left this way: the address is put back.
     */
    private followAddress(): void
    {
        if (window.location.href === this.address)
        {
            // The address the page set itself, or one that was followed already: a step back fires two events.
            return;
        }
        if (this.examRuns())
        {
            this.setAddress(this.hash(), false);
            return;
        }
        this.address = window.location.href;
        const place = placeOf(window.location.hash);
        if (!place.route && place.mode === this.mode)
        {
            // Another spelling of the address of the tab that shows: there is nothing to show, only the address to put right.
            this.setAddress(this.hash(), false);
            document.title = this.title();
            return;
        }
        if (this.modal.isOpen && !this.setupOpen)
        {
            // A dialog over the page that is left, such as the flash cards, goes with it.
            this.modal.close();
        }
        this.enterMode(place.mode);
        if (place.route)
        {
            this.learn.follow(place.route);
        }
        else
        {
            this.setAddress(this.hash(), false);
            // The window may be far down the tab that was left: the question of this one is brought into view.
            this.moved = true;
        }
        this.render();
        if (document.activeElement?.getAttribute("role") === "tab")
        {
            // The keyboard was in the row of tabs, and no press changed the tab: it goes along to the tab that shows.
            document.getElementById(`tab-${this.mode}`)?.focus();
        }
    }

    /** Tells the Learn tab that the window was scrolled, while it is the tab that shows and nothing lies over it. */
    private onScroll(): void
    {
        if (this.mode === "learn" && !this.modal.isOpen)
        {
            this.learn.scrolled();
        }
    }

    /** Takes the language out of the address without loading the page again. */
    private dropLanguageParameter(): void
    {
        const url = new URL(window.location.href);
        url.searchParams.delete(LANGUAGE_PARAMETER);
        window.history.replaceState(window.history.state, "", url);
    }

    // ----- buttons that need a second press -----

    /**
     * Makes a button wait for its second press. The wait ends by itself after a while, and with any click or key
     * elsewhere, so a button that erases something never stays loaded.
     * @param which The button.
     */
    private arm(which: TwoStep): void
    {
        this.disarm();
        this.armed = which;
        this.armTimer = window.setTimeout(() => this.release(), TWO_STEP_TIMEOUT_MS);
    }

    /**
     * Ends the wait for a second press, without drawing.
     * @returns The button that was waiting, or null.
     */
    private disarm(): TwoStep | null
    {
        const which = this.armed;
        window.clearTimeout(this.armTimer);
        this.armTimer = 0;
        this.armed = null;
        return which;
    }

    /**
     * Ends the wait for a second press and shows the button as normal again. Only the button is redrawn, so an
     * open list or a field that is being typed into stays as it is.
     * @returns Whether a button was waiting.
     */
    private release(): boolean
    {
        const which = this.disarm();
        if (which === null)
        {
            return false;
        }
        const button = document.getElementById(TWO_STEP_BUTTONS[which].id);
        if (button)
        {
            button.className = this.twoStepClass(which);
            button.replaceChildren(...this.twoStepContent(which));
        }
        return true;
    }

    /** A click anywhere but on the waiting button ends its wait. */
    private releaseOnClick(event: Event): void
    {
        if (this.armed !== null && !this.onArmedButton(event.target))
        {
            this.release();
        }
    }

    /**
     * Whether an event happened on the button that waits for its second press.
     * @param target Target of the event.
     */
    private onArmedButton(target: EventTarget | null): boolean
    {
        return this.armed !== null && target instanceof Element && target.closest(`#${TWO_STEP_BUTTONS[this.armed].id}`) !== null;
    }

    /**
     * Class of a button that needs a second press, in its current state.
     * @param which The button.
     */
    private twoStepClass(which: TwoStep): string
    {
        return this.armed === which ? "danger sm two-step" : TWO_STEP_BUTTONS[which].className;
    }

    /**
     * The two texts of a button that needs a second press, with the current one visible.
     * @param which The button.
     */
    private twoStepContent(which: TwoStep): HTMLElement[]
    {
        const { label, confirm } = TWO_STEP_BUTTONS[which];
        return twoStepLabel(t(label), t(confirm), this.armed === which);
    }

    /**
     * Shows a short error message at the bottom of the page.
     * @param message Text to show.
     */
    public showError(message: string): void
    {
        this.toast.textContent = t("toast.error", { message });
        this.toast.hidden = false;
        window.setTimeout(() =>
        {
            this.toast.hidden = true;
        }, TOAST_DURATION_MS);
    }

    // ----- text helpers -----

    /**
     * Builds the text block for a text that exists in every language: German, and the translation below it when one is chosen.
     * @param texts The text per language.
     * @param className Optional class for the wrapper.
     * @returns Element containing one or two lines.
     */
    private bilingual(texts: Record<Locale, string>, className = ""): HTMLElement
    {
        const translation = this.store.state.translation;
        const wrapper = el("span", { class: `bi ${className}`.trim() });
        // Every text block names its own language and direction: the page direction follows the site language, the text follows its own.
        wrapper.append(el("span", { class: "bi-main", lang: DEFAULT_LOCALE, dir: directionOf(DEFAULT_LOCALE) }, texts[DEFAULT_LOCALE]));
        if (translation !== "off" && texts[translation].trim() !== texts[DEFAULT_LOCALE].trim())
        {
            wrapper.append(el("span", { class: "bi-sub", lang: translation, dir: directionOf(translation), title: t("card.unofficial") }, texts[translation]));
        }
        return wrapper;
    }

    /**
     * The text of a question in every language, for {@link bilingual}.
     * @param question The question.
     * @returns Question text per language.
     */
    private questionTexts(question: Question): Record<Locale, string>
    {
        return Object.fromEntries(LOCALES.map((locale) => [locale, question.texts[locale].q])) as Record<Locale, string>;
    }

    /**
     * Name of a topic in the language of the site.
     * @param topic Category id.
     * @returns The name.
     */
    private topicName(topic: string): string
    {
        return this.bank.categoryName(topic, i18n.locale);
    }

    // ----- rounds -----

    /** The numbers of the questions the user has: the 300 general ones and the 10 of the user's state. */
    private pool(): Set<number>
    {
        const { state } = this.store.state;
        if (this.poolCache?.state !== state)
        {
            this.poolCache = { state, numbers: new Set(this.bank.select(null, [state]).map((question) => question.n)) };
        }
        return this.poolCache.numbers;
    }

    /** The state ids whose questions practice draws from: the user's state, or none. */
    private practiceStates(): string[]
    {
        const { state, includeState } = this.store.state;
        return includeState ? [state] : [];
    }

    /** The subjects practice draws from now. */
    private topicsInUse(): string[]
    {
        return this.store.state.topics ?? ALL_TOPICS;
    }

    /**
     * Builds a round.
     * @param numbers Question numbers.
     * @param order Order of the round.
     * @param source What the round is made of.
     * @returns The round.
     */
    private buildRound(numbers: number[], order: RoundOrder, source: RoundSource): ActiveRound
    {
        const round = new Round(numbers, order, (questionNumber, shuffle) =>
            this.bank.present(this.bank.byNumber(questionNumber) as Question, shuffle), this.store.state.lockAnswers);
        return { round, source };
    }

    /**
     * A new round over the saved topics in the saved order.
     * @param onlyWeak Whether only the questions whose last answer was wrong are drawn from them.
     */
    private newTopicRound(onlyWeak = false): ActiveRound
    {
        // No saved choice of subjects means every general question, whatever subjects a bank has.
        const numbers = this.selectionNumbers(this.store.state.topics ?? ALL_TOPICS, this.practiceStates(), onlyWeak);
        return this.buildRound(numbers, this.store.state.order, onlyWeak ? "weakSelection" : "topics");
    }

    /**
     * The numbers of the questions in a choice.
     * @param topics Subject ids.
     * @param states The user's state id, or none.
     * @param onlyWeak Whether only the questions whose last answer was wrong count.
     */
    private selectionNumbers(topics: readonly string[], states: readonly string[], onlyWeak: boolean): number[]
    {
        const numbers = this.bank.select(sameTopics(topics, ALL_TOPICS) ? null : [...topics], [...states]).map((question) => question.n);
        if (!onlyWeak)
        {
            return numbers;
        }
        const weak = new Set(this.store.weakNumbersIn((questionNumber) => this.pool().has(questionNumber)));
        return numbers.filter((questionNumber) => weak.has(questionNumber));
    }

    /**
     * Starts the round over with the same kind of questions, drawn again.
     * @param source What the round is made of.
     */
    private rebuildRound(source: RoundSource | undefined): ActiveRound
    {
        if (source === "lesson" && this.lessonRound)
        {
            return this.buildRound(this.lessonRound.numbers, this.store.state.order, "lesson");
        }
        const wantsWeak = source === "weak" || source === "weakSelection";
        const round = source === "weak" ? this.newWeakRound() : this.newTopicRound(source === "weakSelection");
        // A round of weak spots that has none left (progress erased, another state) is not a place to stay in: practice goes on as usual.
        return wantsWeak && round.round.total === 0 ? this.newTopicRound() : round;
    }

    /** A new round over every question whose last answer was wrong, whatever its subject. */
    private newWeakRound(): ActiveRound
    {
        // A saved number that is not one of the user's questions (another state, an older catalogue) is left out.
        const numbers = this.store.weakNumbersIn((questionNumber) => this.pool().has(questionNumber));
        return this.buildRound(numbers, this.store.state.order, "weak");
    }

    /** The round of the mode that is shown, or null in the exam. */
    private activeRound(): ActiveRound | null
    {
        return this.mode === "practice" ? this.rounds.practice : null;
    }

    // ----- training -----

    /** What the training draws from now. */
    private trainSelection(): { topics: string[]; includeState: boolean }
    {
        if (!this.trainChoice)
        {
            this.trainChoice = { topics: [...this.topicsInUse()], includeState: this.store.state.includeState };
        }
        return this.trainChoice;
    }

    /** Starts a training session over the questions of the choice, with the first question up. */
    private newTrainSession(): TrainSession
    {
        const { topics, includeState } = this.trainSelection();
        const numbers = this.selectionNumbers(topics, includeState ? [this.store.state.state] : [], false);
        const trainer = new Trainer(numbers.map((n) => ({ n, k: (this.bank.byNumber(n) as Question).k })));
        const session: TrainSession = { trainer, item: null, selected: null, gaveUp: false, ended: false };
        this.presentTurn(session);
        return session;
    }

    /**
     * Puts the question that is up in front of the user, with its options in a new order.
     * @param session The session.
     */
    private presentTurn(session: TrainSession): void
    {
        const turn = session.trainer.current;
        session.item = turn ? this.bank.present(this.bank.byNumber(turn.n) as Question) : null;
        session.selected = null;
        session.gaveUp = false;
    }

    /**
     * Takes the answer to the question that is up in the training.
     * @param optionIndex Position of the chosen option.
     */
    private answerTrain(optionIndex: number): void
    {
        const session = this.train;
        const turn = session?.trainer.current;
        if (!session || !session.item || !turn || session.trainer.answered || session.ended || optionIndex >= session.item.options.length)
        {
            return;
        }
        const wasRight = session.item.options[optionIndex].isCorrect;
        session.selected = optionIndex;
        session.trainer.answer(wasRight);
        this.store.recordAnswer(turn.n, wasRight);
        this.render();
    }

    /** Gives up on the question that is up: it counts as wrong, and the right answer is shown. */
    private giveUpTrain(): void
    {
        const session = this.train;
        const turn = session?.trainer.current;
        if (!session || !turn || session.trainer.answered || session.ended)
        {
            return;
        }
        session.gaveUp = true;
        session.trainer.answer(false);
        this.store.recordAnswer(turn.n, false);
        this.render();
    }

    /** Moves the training on to its next question. */
    private nextTrain(): void
    {
        const session = this.train;
        if (!session || !session.trainer.answered || session.ended)
        {
            return;
        }
        session.trainer.next();
        this.presentTurn(session);
        this.moved = true;
        this.render();
    }

    /** Ends the session now. */
    private endTrain(): void
    {
        if (this.train)
        {
            this.train.ended = true;
            this.panelOpen = false;
            this.render();
        }
    }

    /** Starts the session over with the same choice, drawn again. */
    private restartTrain(): void
    {
        this.train = this.newTrainSession();
        this.panelOpen = false;
        this.moved = true;
        this.render();
    }

    /** Leaves a round of weak spots for a regular round over the saved choice of subjects. */
    private exitWeakSpots(): void
    {
        this.rounds.practice = this.newTopicRound();
        this.panelOpen = false;
        this.render();
    }

    /** How many weak spots the user has, in every subject. */
    private weakTotal(): number
    {
        return this.store.weakNumbersIn((questionNumber) => this.pool().has(questionNumber)).length;
    }

    /** Goes to practice with a round over every weak spot, from the progress widget and the exam result. */
    private practiceWeakSpots(): void
    {
        this.rounds.practice = this.newWeakRound();
        this.switchMode("practice");
    }

    /**
     * Brings the tab that is open into its row. On a narrow screen the tabs can be wider than the page, and the page is
     * drawn anew with every change, which puts the row back to its start.
     */
    private revealOpenTab(): void
    {
        const tab = this.root.querySelector<HTMLElement>("[role=tab][aria-selected=true]");
        if (tab?.parentElement)
        {
            revealInStrip(tab.parentElement, tab);
        }
    }

    /**
     * Goes to practice with a round over the questions of a lesson of the Learn tab.
     * @param numbers The question numbers of the lesson.
     * @param title The title of the lesson.
     */
    private practiseLesson(numbers: number[], title: string): void
    {
        // A lesson only holds questions the user has, but a number the bank lacks would make an empty slot.
        this.lessonRound = { title, numbers: numbers.filter((questionNumber) => this.pool().has(questionNumber)) };
        this.rounds.practice = this.buildRound(this.lessonRound.numbers, this.store.state.order, "lesson");
        this.switchMode("practice");
    }

    /**
     * Explains a question in the dialog, with the part of the lesson of the Learn tab that teaches it. The tab that is
     * open stays as it is.
     * @param questionNumber Question number.
     */
    private learnWhy(questionNumber: number): void
    {
        this.learn.explain(questionNumber);
    }

    /**
     * Records the answer to the question of the round that is shown.
     * @param optionIndex Position of the chosen option.
     */
    private answerRound(optionIndex: number): void
    {
        const active = this.activeRound();
        const result = active?.round.answer(optionIndex);
        if (result)
        {
            // Only the first answer goes into the progress. A changed answer shows in the round, but it cannot
            // turn a miss into a hit after the right answer was shown, or the other way round.
            if (result.first)
            {
                this.store.recordAnswer(result.n, result.wasCorrect);
            }
            this.render();
        }
    }

    // ----- panel -----

    /** Opens the panel with the saved choices ticked. */
    private openPanel(): void
    {
        if (this.mode === "train")
        {
            const choice = this.trainSelection();
            const { lockAnswers, order } = this.store.state;
            this.staged = { topics: [...choice.topics], includeState: choice.includeState, lockAnswers, order, onlyWeak: false };
            this.panelOpen = true;
            this.render();
            document.getElementById("panel-title")?.focus();
            return;
        }
        const { includeState, lockAnswers, order } = this.store.state;
        const source = this.rounds.practice?.source;
        const weakRound = source === "weak" || source === "weakSelection";
        this.staged = { topics: [...this.topicsInUse()], includeState, lockAnswers, order, onlyWeak: weakRound && this.weakTotal() > 0 };
        this.panelOpen = true;
        this.render();
        document.getElementById("panel-title")?.focus();
    }

    /** Closes the panel without changes and puts focus back on the button that opened it. */
    private closePanel(): void
    {
        this.panelOpen = false;
        this.render();
        document.getElementById("change-selection")?.focus();
    }

    /** Applies the choices of the panel and starts a new round. */
    private startFromPanel(): void
    {
        if (this.mode === "train")
        {
            this.trainChoice = { topics: [...this.staged.topics], includeState: this.staged.includeState };
            this.train = this.newTrainSession();
            this.panelOpen = false;
            this.moved = true;
            this.render();
            return;
        }
        const state = this.store.state;
        state.order = this.staged.order;
        state.lockAnswers = this.staged.lockAnswers;
        state.topics = sameTopics(this.staged.topics, ALL_TOPICS) ? null : [...this.staged.topics];
        state.includeState = this.staged.includeState;
        this.rounds.practice = this.newTopicRound(this.staged.onlyWeak);
        this.store.save();
        this.panelOpen = false;
        this.render();
    }

    // ----- exam logic -----

    /** Builds and starts a new exam. Its clock counts down from the exam time that is set, which is the official time at most. */
    private startExam(): void
    {
        const general = pickRandom(this.bank.general, EXAM_GENERAL_COUNT);
        const local = pickRandom(this.bank.ofState(this.store.state.state), EXAM_STATE_COUNT);
        const items = [...general, ...local].map((question) => this.bank.present(question));
        const clock = new Clock("down", this.store.state.examMinutes);
        clock.start(Date.now());
        this.exam = {
            items,
            answers: items.map(() => null),
            current: 0,
            visited: items.map((_, index) => index === 0),
            marked: items.map(() => false),
            clock,
            finished: false,
            timedOut: false,
        };
        this.disarm();
        this.mode = "exam";
        this.reviewAll = false;
        this.syncTicker();
        this.render();
    }

    /** Back from the result to the start screen of the exam, where the next exam begins with the start button. */
    private leaveResult(): void
    {
        this.exam = null;
        this.disarm();
        this.syncTicker();
        this.render();
    }

    /** Whether an exam is running. The tabs are off then: the exam is left by finishing it or by starting over. */
    private examRuns(): boolean
    {
        return this.exam !== null && !this.exam.finished;
    }

    /** Whether a clock is running that has to be shown once per second. */
    private clockRuns(): boolean
    {
        return (this.exam !== null && !this.exam.finished) || this.practiceClock.running;
    }

    /** Starts the once per second tick while a clock runs, and stops it when none does. */
    private syncTicker(): void
    {
        if (this.clockRuns() && this.timerHandle === 0)
        {
            this.timerHandle = window.setInterval(() => this.tick(), MS_PER_SECOND);
        }
        else if (!this.clockRuns() && this.timerHandle !== 0)
        {
            window.clearInterval(this.timerHandle);
            this.timerHandle = 0;
        }
    }

    /** One second has passed: ends the exam or stops the count down of practice at zero, and shows the time. */
    private tick(): void
    {
        const now = Date.now();
        const exam = this.exam;
        if (exam && !exam.finished && exam.clock.over(now))
        {
            exam.timedOut = true;
            this.finishExam();
            return;
        }
        if (this.practiceClock.running && this.practiceClock.over(now))
        {
            this.practiceClock.pause(now);
            this.syncTicker();
            this.render();
            return;
        }
        this.paintClock(now);
    }

    /**
     * The clock that the widget on the page shows.
     * @returns The clock of the exam while it runs, a clock for the exam time that is set before it starts, or the clock of practice.
     */
    private shownClock(): Clock
    {
        if (this.mode !== "exam")
        {
            return this.practiceClock;
        }
        return this.exam && !this.exam.finished ? this.exam.clock : new Clock("down", this.store.state.examMinutes);
    }

    /**
     * Shows the time and how urgent it is, without drawing the page again.
     * @param now The current time in milliseconds.
     */
    private paintClock(now: number): void
    {
        const clock = this.shownClock();
        const display = document.getElementById("clock-display");
        if (display)
        {
            display.textContent = formatClock(clock.shown(now), clock.mode);
        }
        const widget = document.getElementById("clock-widget");
        if (widget)
        {
            this.setLevel(widget, clock.level(now));
        }
        const note = document.getElementById("clock-note");
        if (note)
        {
            note.textContent = this.clockNote(clock, now);
        }
        const strip = document.getElementById("clock-strip");
        const stripTime = document.getElementById("clock-strip-time");
        if (strip && stripTime)
        {
            stripTime.textContent = formatClock(clock.shown(now), clock.mode);
            this.setLevel(strip, clock.level(now));
        }
    }

    /**
     * Marks a widget with the level of its clock, which the style sheet turns into a colour nudge and a yellow or red border.
     * @param widget The widget.
     * @param level How urgent the time is.
     */
    private setLevel(widget: HTMLElement, level: ClockLevel): void
    {
        widget.classList.remove("level-calm", "level-nudge", "level-warn", "level-critical");
        widget.classList.add(`level-${level}`);
    }

    /**
     * The line under the time.
     * @param clock The clock.
     * @param now The current time in milliseconds.
     * @returns What the clock does, or that the time is up.
     */
    private clockNote(clock: Clock, now: number): string
    {
        if (clock.over(now))
        {
            return t("clock.note.over");
        }
        if (this.mode === "exam")
        {
            return t("clock.note.exam", { minutes: EXAM_DURATION_MINUTES });
        }
        return clock.mode === "down" ? t("clock.note.down") : t("clock.note.up");
    }

    /** Ends the exam, records every answer, and shows the result. */
    private finishExam(): void
    {
        const exam = this.exam;
        if (!exam || exam.finished)
        {
            return;
        }
        exam.finished = true;
        exam.clock.pause(Date.now());
        this.syncTicker();
        this.disarm();
        // The exam is over, so whatever dialog is open (the finish prompt, or a question as printed) goes away.
        this.modal.close();
        this.toTop = true;
        exam.items.forEach((item, index) =>
        {
            const choice = exam.answers[index];
            if (choice === null && !exam.visited[index])
            {
                // Never shown, so never failed: it counts as wrong in the score but not in the progress.
                return;
            }
            const wasCorrect = choice !== null && item.options[choice].isCorrect;
            this.store.recordAnswer(item.question.n, wasCorrect);
        });
        // The result is remembered: two good exams on different days are part of what tells the user they are ready.
        this.store.recordExam(this.examScore(exam), exam.items.length, dayNumber(new Date()));
        this.render();
    }

    /** Number of correct answers in the finished exam. */
    private examScore(exam: ExamState): number
    {
        return exam.items.filter((item, index) =>
        {
            const choice = exam.answers[index];
            return choice !== null && item.options[choice].isCorrect;
        }).length;
    }

    // ----- input -----

    /**
     * Keyboard shortcuts: 1 to 4 or A to D pick an option, Enter or Right Arrow goes on (or skips), Left Arrow goes back,
     * T switches the translation, Escape closes the topic panel. They are off while the dialog is open and while typing
     * into a field or a list, or using the tabs.
     * @param event Keyboard event.
     */
    private handleKey(event: KeyboardEvent): void
    {
        if (event.metaKey || event.ctrlKey || event.altKey)
        {
            return;
        }
        const target = event.target as HTMLElement | null;
        const key = shortcutKey(event.key, event.code);
        if (this.modal.isOpen)
        {
            // Only the flash cards have keys inside the dialog. They are a run of the Learn tab, whatever tab it was opened from.
            if (this.learn.handleKey(key, target?.tagName === "BUTTON"))
            {
                event.preventDefault();
            }
            return;
        }
        // In a right to left page the buttons are mirrored: the arrow that points toward the next question is the left one.
        const forwardKey = i18n.dir === "rtl" ? "arrowleft" : "arrowright";
        const backwardKey = i18n.dir === "rtl" ? "arrowright" : "arrowleft";
        // Any key that is not on the way to the waiting button or a press of it takes its wait for a second press back.
        // Escape does so on the button too, and does nothing else then.
        if (!PASSIVE_KEYS.includes(key) && (key === "escape" || !this.onArmedButton(target)) && this.release() && key === "escape")
        {
            return;
        }
        if (key === "escape" && this.panelOpen && !target?.closest?.("[role=listbox]"))
        {
            this.closePanel();
            return;
        }
        // Typing into a field, or into the open list of choices, is not a shortcut. On the tabs, only the keys that move between tabs belong to the tabs.
        if (target && (target.tagName === "INPUT" || target.closest?.("[role=listbox]")
            || (target.closest?.("[role=tablist]") && TAB_KEYS.includes(key))
            || (target.closest?.(".timeline-strip") && TAB_KEYS.includes(key))))
        {
            return;
        }
        if (this.mode === "learn")
        {
            // The shortcuts of the questions do not apply in the Learn tab: a lesson is read, and its questions are answered by pressing them.
            return;
        }
        const optionIndex = ["1", "2", "3", "4"].indexOf(key) >= 0
            ? Number(key) - 1
            : ["a", "b", "c", "d"].indexOf(key);
        if (optionIndex >= 0)
        {
            this.chooseOption(optionIndex);
            return;
        }
        if (key === "t")
        {
            void this.toggleTranslation();
        }
        else if (key === "m")
        {
            this.toggleMark();
        }
        else if (key === "enter" || key === forwardKey)
        {
            if (target && target.tagName === "BUTTON" && key === "enter")
            {
                return;
            }
            this.advance();
        }
        else if (key === backwardKey)
        {
            this.stepBack();
        }
    }

    /** Switches the translation off, or on in the language of the site (English when the site is German) or the one that was picked. */
    private toggleTranslation(): Promise<void>
    {
        return this.setTranslation(this.store.state.translation === "off");
    }

    /**
     * Shows the translation or hides it, and remembers it. The questions of its language are fetched first when they are not there yet.
     * @param on Whether to show it.
     */
    private async setTranslation(on: boolean): Promise<void>
    {
        const state = this.store.state;
        if (on && !(await this.loadQuestions(this.store.translationTarget)))
        {
            this.render();
            return;
        }
        state.translation = on ? this.store.translationTarget : "off";
        this.store.save();
        this.render();
    }

    /**
     * Picks the language of the translation, or "auto", and shows the translation in it.
     * @param choice A language, or "auto" for the language of the site.
     */
    private async pickTranslationLanguage(choice: Locale | "auto"): Promise<void>
    {
        const state = this.store.state;
        const target = choice === "auto" ? automaticTranslation(state.uiLanguage) : choice;
        if (!(await this.loadQuestions(target)))
        {
            this.render();
            return;
        }
        state.translationLanguage = choice;
        state.translation = target;
        this.store.save();
        this.render();
    }

    /**
     * Makes another language the language of the site. Its messages are fetched first when they are not there yet, and a translation
     * that follows the site gets its questions in the new language.
     * @param locale The language.
     * @param id Id of the list that was used.
     */
    private async changeSiteLanguage(locale: Locale, id: string): Promise<void>
    {
        if (!(await this.loadUi(locale)))
        {
            this.changed(id);
            return;
        }
        const state = this.store.state;
        if (state.translation !== "off" && state.translationLanguage === "auto" && !(await this.loadQuestions(automaticTranslation(locale))))
        {
            state.translation = "off";
        }
        state.uiLanguage = locale;
        this.store.syncTranslation();
        i18n.setLocale(locale);
        this.store.save();
        this.changed(id);
    }

    /**
     * Routes an option choice to the active mode.
     * @param optionIndex Option index.
     */
    private chooseOption(optionIndex: number): void
    {
        if (this.mode === "exam")
        {
            const exam = this.exam;
            if (exam && !exam.finished && optionIndex < exam.items[exam.current].options.length)
            {
                exam.answers[exam.current] = optionIndex;
                this.render();
            }
            return;
        }
        if (this.mode === "train")
        {
            this.answerTrain(optionIndex);
            return;
        }
        this.answerRound(optionIndex);
    }

    /** The right hand button: next question in the exam, next or skip in a round. */
    private advance(): void
    {
        if (this.mode === "exam")
        {
            this.moveExam(1);
            return;
        }
        if (this.mode === "train")
        {
            if (!this.panelOpen)
            {
                this.nextTrain();
            }
            return;
        }
        const active = this.activeRound();
        if (active && !this.panelOpen)
        {
            this.advanceRound(active.round);
        }
    }

    /**
     * Moves a round on, and keeps focus on the question.
     * @param round The round.
     */
    private advanceRound(round: Round): void
    {
        round.advance();
        this.moved = true;
        this.render();
    }

    /** The left hand button and the left arrow: the previous question. */
    private stepBack(): void
    {
        if (this.mode === "exam")
        {
            this.moveExam(-1);
            return;
        }
        const active = this.activeRound();
        if (active && !this.panelOpen && active.round.canGoBack)
        {
            active.round.back();
            this.moved = true;
            this.render();
        }
    }

    /**
     * Moves the exam cursor.
     * @param step Positive or negative number of questions.
     */
    private moveExam(step: number): void
    {
        const exam = this.exam;
        if (!exam || exam.finished)
        {
            return;
        }
        this.showExamQuestion(exam, Math.min(exam.items.length - 1, Math.max(0, exam.current + step)));
    }

    /**
     * Shows a question of the exam. A question that was shown counts as opened, whatever happens to it next.
     * @param exam The running exam.
     * @param index Position of the question.
     */
    private showExamQuestion(exam: ExamState, index: number): void
    {
        exam.current = index;
        exam.visited[index] = true;
        this.render();
    }

    /** Marks the question that is shown for review, or takes the mark away. */
    private toggleMark(): void
    {
        const exam = this.exam;
        if (this.mode === "exam" && exam && !exam.finished)
        {
            exam.marked[exam.current] = !exam.marked[exam.current];
            this.render();
        }
    }

    /**
     * Switches the top level mode.
     * @param mode Mode to show.
     */
    private switchMode(mode: AppMode): void
    {
        if (this.examRuns())
        {
            // A running exam is left only by finishing it or starting over.
            return;
        }
        if (mode === "learn" && this.mode === "learn")
        {
            // The tab of the page that is open leads back to its start.
            this.learn.home();
        }
        this.enterMode(mode);
        // Every tab has an address: opening another tab is a step the Back button of the browser takes back.
        this.setAddress(this.hash(), true);
        this.render();
    }

    /**
     * Makes a mode the mode that shows, and gets what it needs ready. Nothing is drawn.
     * @param mode The mode.
     */
    private enterMode(mode: AppMode): void
    {
        this.panelOpen = false;
        this.disarm();
        this.mode = mode;
        if (mode === "train" && this.train === null)
        {
            this.train = this.newTrainSession();
        }
        else if (mode === "practice" && this.rounds.practice === null)
        {
            this.rounds.practice = this.newTopicRound();
        }
    }

    // ----- rendering -----

    /** Redraws the whole view. Keyboard focus stays on the same control when it still exists. */
    private render(): void
    {
        const active = document.activeElement;
        const focusedId = active instanceof HTMLElement && this.root.contains(active) ? active.id : "";
        document.documentElement.lang = i18n.locale;
        document.documentElement.dir = i18n.dir;
        const body = this.renderBody();
        // The Learn tab knows which page it shows once it is drawn, so the page is named after that.
        document.title = this.title();
        body.id = "view";
        body.setAttribute("role", "tabpanel");
        body.setAttribute("aria-labelledby", `tab-${this.mode}`);
        this.root.replaceChildren(this.renderHeader(), body, this.renderFooter());
        if (focusedId)
        {
            document.getElementById(focusedId)?.focus();
        }
        scrollTimelineToCurrent(this.root);
        this.revealOpenTab();
        if (this.mode === "learn")
        {
            this.learn.drawn(this.root);
        }
        if (this.moved)
        {
            this.moved = false;
            this.showQuestion();
        }
        if (this.toTop)
        {
            this.toTop = false;
            document.documentElement.scrollIntoView?.({ block: "start" });
            document.getElementById(RESULT_ID)?.focus();
        }
        const heading = this.root.querySelector<HTMLElement>("[data-focus]");
        if (heading && this.mode !== "exam")
        {
            // Keep keyboard users oriented after the question changes.
            heading.setAttribute("tabindex", "-1");
        }
    }

    /**
     * After a new question was drawn, scrolls up to it if the page is scrolled past the start of the timeline (or of
     * the question, where there is no timeline), which happens on a phone when the button at the bottom of a long
     * question was used. The timeline goes to the top edge when the question and the buttons below it still fit
     * under it. Otherwise the question itself does, so that a small screen shows the whole question without another
     * scroll. The bar with the choice is never the target.
     */
    private showQuestion(): void
    {
        const card = this.root.querySelector<HTMLElement>("[data-focus]")?.closest<HTMLElement>(".card");
        const timeline = this.root.querySelector<HTMLElement>(".timeline");
        if (!card || (timeline ?? card).getBoundingClientRect().top >= 0)
        {
            return;
        }
        const buttons = this.root.querySelector<HTMLElement>(".nav-row")?.getBoundingClientRect().height ?? 0;
        const fits = timeline !== null && card.getBoundingClientRect().bottom - timeline.getBoundingClientRect().top + buttons <= window.innerHeight;
        (fits ? timeline : card).scrollIntoView?.({ block: "start" });
    }

    /**
     * The time of a running clock in a strip above the question. It shows only on one column, where the clock widget
     * sits below the question and is out of sight while answering. The widget stays the timer for assistive technology.
     * @returns The strip, or null while no clock runs.
     */
    private renderClockStrip(): HTMLElement | null
    {
        const clock = this.shownClock();
        if (!clock.running)
        {
            return null;
        }
        const now = Date.now();
        const strip = el("p", { id: "clock-strip", class: "clock-strip", "aria-hidden": "true" },
            el("span", { class: "clock-strip-label" }, t("clock.title")),
            el("span", { id: "clock-strip-time" }, formatClock(clock.shown(now), clock.mode)));
        this.setLevel(strip, clock.level(now));
        return strip;
    }

    /**
     * Footer with the source of the questions, the entry points to the About dialog and to reporting, the links to the
     * legal notice and the privacy notice in a line of their own, and the copyright line below them.
     */
    private renderFooter(): HTMLElement
    {
        const stateName = this.topicName(this.store.state.state);
        const examRuns = this.examRuns();
        return el("footer", { class: "site-footer" },
            el("div", { class: "footer-state" },
                this.stateBox("state", undefined, "up", examRuns),
                el("p", { class: "footer-state-note" }, examRuns ? t("footer.state.locked") : t("footer.state.note", { count: this.pool().size, name: stateName }))),
            el("p", { class: "site-footer-note" }, t("footer.note", { stand: CATALOGUE_STAND })),
            el("div", { class: "site-footer-links" },
                el("button", { class: "link-button", type: "button", onclick: () => this.actions.showAbout() }, t("footer.about")),
                el("a", { href: BAMF_CATALOGUE_PAGE_URL, target: "_blank", rel: "noopener noreferrer" }, t("footer.official")),
                el("button", { class: "link-button", type: "button", onclick: () => this.actions.showReport(null) }, t("footer.report"))),
            // The legal links keep their German names in every language, so they carry the language and direction of German.
            el("p", { class: "site-legal" },
                el("a", { href: LEGAL_NOTICE_URL, target: "_blank", rel: "noopener", lang: DEFAULT_LOCALE, dir: directionOf(DEFAULT_LOCALE) }, LEGAL_NOTICE_LABEL),
                el("a", { href: PRIVACY_NOTICE_URL, target: "_blank", rel: "noopener", lang: DEFAULT_LOCALE, dir: directionOf(DEFAULT_LOCALE) }, PRIVACY_NOTICE_LABEL)),
            el("p", { class: "site-copyright" },
                document.createTextNode(`${APP_NAME} \u00a9 ${COPYRIGHT_YEAR} `),
                el("a", { href: AUTHOR_URL, target: "_blank", rel: "noopener" }, AUTHOR_NAME)));
    }

    /**
     * Button that opens the question as printed in the official catalogue.
     * @param question The question.
     * @returns Button element.
     */
    private renderOriginalButton(question: Question): HTMLElement
    {
        return el("button", {
            class: "secondary sm original-btn",
            type: "button",
            "aria-haspopup": "dialog",
            "aria-label": t("card.showOriginalLabel", { n: questionName(question.n) }),
            onclick: () => this.actions.showOriginal(question),
        }, icon("book"), el("span", {}, t("card.showOriginal", { page: question.pg ?? 0 })));
    }

    /**
     * Moves between the tabs with the arrow keys, as the ARIA tabs pattern asks.
     * @param event Keyboard event on the tab list.
     */
    private onTabKey(event: KeyboardEvent): void
    {
        if (this.examRuns())
        {
            return;
        }
        const index = MODES.indexOf(this.mode);
        // The tabs are mirrored in a right to left page, so the arrow toward the next tab is the left one.
        const forward = i18n.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
        const backward = i18n.dir === "rtl" ? "ArrowRight" : "ArrowLeft";
        const next: Record<string, number> = {
            [forward]: (index + 1) % MODES.length,
            [backward]: (index + MODES.length - 1) % MODES.length,
            Home: 0,
            End: MODES.length - 1,
        };
        if (event.key in next)
        {
            event.preventDefault();
            this.switchMode(MODES[next[event.key]]);
            document.getElementById(`tab-${this.mode}`)?.focus();
        }
    }

    /**
     * Applies a change made in one of the setup dialog's lists: draws the page again, and the dialog too, because its
     * texts follow the language. Focus goes back to the list that was used.
     * @param id Id of the list.
     */
    private changed(id: string): void
    {
        this.render();
        if (this.setupOpen)
        {
            this.showSetup(`${id}-button`);
        }
    }

    /**
     * The list for the language of the site: the button names what it is for and what is chosen.
     * @param id Id of the list.
     * @param labelId Id of a visible label, in the setup dialog. Without it the button carries the name.
     */
    private siteLanguageBox(id = "site-language", labelId?: string): HTMLElement
    {
        return new Listbox({
            id,
            ...(labelId ? { labelId } : { label: t("site.language.label"), prefix: t("site.language.label") }),
            items: UI_LOCALES.map((locale) => ({ value: locale, label: t(ENDONYMS[locale]), lang: locale, dir: directionOf(locale) })),
            value: this.store.state.uiLanguage,
            icon: () => icon("globe"),
            buttonName: (item) => t("site.language.button", { name: item.label }),
            align: labelId ? "start" : "end",
            className: labelId ? "setup-box" : "header-box",
            note: t("site.language.note"),
            onChange: (value) =>
            {
                void this.changeSiteLanguage(asUiLocale(value) ?? DEFAULT_UI_LOCALE, id);
            },
        }).element;
    }

    /**
     * The list for the appearance, built like the one for the language.
     * @param id Id of the list.
     * @param labelId Id of a visible label, in the setup dialog.
     */
    private themeBox(id = "theme", labelId?: string): HTMLElement
    {
        return new Listbox({
            id,
            ...(labelId ? { labelId } : { label: t("theme.label"), prefix: t("theme.label") }),
            items: THEMES.map((entry) => ({ value: entry.theme, label: t(entry.label), short: t(entry.short) })),
            value: this.store.state.theme,
            icon: () => icon("contrast"),
            buttonName: (item) => t("theme.button", { name: item.label }),
            align: labelId ? "start" : "end",
            className: labelId ? "setup-box" : "header-box",
            onChange: (value) =>
            {
                const theme = THEMES.find((entry) => entry.theme === value)?.theme ?? "auto";
                this.store.state.theme = theme;
                applyTheme(theme);
                this.store.save();
                this.changed(id);
            },
        }).element;
    }

    /**
     * The list for the user's federal state.
     * @param id Id of the list.
     * @param labelId Id of a visible label, in the setup dialog.
     * @param placement Where the list opens.
     * @param disabled Whether the state is fixed for now, as it is while an exam runs.
     */
    private stateBox(id: string, labelId?: string, placement: "down" | "up" = "down", disabled = false): HTMLElement
    {
        return new Listbox({
            id,
            ...(labelId ? { labelId } : { label: t("footer.state.label"), prefix: t("footer.state.label") }),
            items: STATE_IDS.map((stateId) => ({ value: stateId, label: this.topicName(stateId) })),
            value: this.store.state.state,
            icon: () => icon("pin"),
            buttonName: (item) => t("footer.state.button", { name: item.label }),
            placement,
            disabled,
            className: labelId ? "setup-box" : "state-box",
            onChange: (value) => this.changeState(value, id),
        }).element;
    }

    /**
     * Makes another federal state the user's state. The questions of the user change with it, so the rounds start over
     * and a finished exam is forgotten. While an exam runs the state stays as it is: the exam was drawn for it, and
     * its answers go into the progress of that state.
     * @param value State id.
     * @param id Id of the list that was used.
     */
    private changeState(value: string, id: string): void
    {
        if (this.examRuns())
        {
            return;
        }
        this.store.state.state = STATE_IDS.includes(value) ? value : DEFAULT_STATE;
        this.store.save();
        this.rounds.practice = this.rebuildRound(this.rounds.practice?.source);
        this.train = this.mode === "train" ? this.newTrainSession() : null;
        if (this.exam?.finished)
        {
            this.exam = null;
        }
        this.panelOpen = false;
        this.changed(id);
    }

    /** The settings that are asked once, when the page is opened for the first time. */
    private showSetup(focusId?: string): void
    {
        const row = (labelId: string, label: string, control: HTMLElement, hint?: string): HTMLElement => el("div", { class: "setup-row" },
            el("span", { id: labelId, class: "setup-label" }, label),
            control,
            hint ? el("p", { class: "hint" }, hint) : null);
        const content = el("div", { class: "setup" },
            el("p", {}, t("setup.intro"), document.createTextNode(" "), el("span", { class: "setup-later" }, t("setup.later")), t("setup.laterWhere")),
            row("setup-state-label", t("setup.state"), this.stateBox("setup-state", "setup-state-label"), t("setup.stateHint")),
            row("setup-language-label", t("site.language.label"), this.siteLanguageBox("setup-language", "setup-language-label")),
            row("setup-theme-label", t("theme.label"), this.themeBox("setup-theme", "setup-theme-label")),
            el("div", { class: "setup-row" },
                el("label", { class: "setup-check" },
                    el("input", {
                        id: "setup-translation",
                        type: "checkbox",
                        checked: this.store.state.translation !== "off",
                        onchange: (event: Event) =>
                        {
                            void this.setTranslation((event.target as HTMLInputElement).checked).then(() => this.showSetup("setup-translation"));
                        },
                    }),
                    el("span", { class: "setup-label" }, t("setup.translation"))),
                el("p", { class: "hint" }, t("setup.translationHint"))),
            el("div", { class: "modal-actions" },
                el("button", { id: "setup-start", class: "primary", type: "button", onclick: () => this.modal.close() }, t("setup.start"))));
        this.setupOpen = true;
        this.modal.show({
            title: t("setup.title"),
            content,
            className: "modal-setup modal-fixed",
            onClose: () =>
            {
                this.setupOpen = false;
                this.store.state.setupDone = true;
                this.store.save();
            },
        });
        if (focusId)
        {
            document.getElementById(focusId)?.focus();
        }
    }

    /**
     * The name of a tab, as its tab and the title of the page show it.
     * @param mode The tab.
     */
    private tabLabel(mode: AppMode): string
    {
        const labels: Record<AppMode, () => string> = {
            learn: () => t("tabs.learn"),
            practice: () => t("tabs.practice"),
            train: () => t("tabs.train"),
            exam: () => t("tabs.exam", { count: this.examSize() }),
        };
        return labels[mode]();
    }

    /** Header with title, the settings of the site, and the mode tabs. */
    private renderHeader(): HTMLElement
    {
        const examRuns = this.examRuns();
        const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": t("tabs.label"), onkeydown: (event: Event) => this.onTabKey(event as KeyboardEvent) },
            ...MODES.map((mode) => el("button", {
                id: `tab-${mode}`,
                class: "tab",
                type: "button",
                role: "tab",
                "aria-selected": String(this.mode === mode),
                "aria-controls": "view",
                tabindex: this.mode === mode ? "0" : "-1",
                disabled: examRuns,
                onclick: () => this.switchMode(mode),
            }, this.tabLabel(mode))));

        return el("header", { class: "top" },
            el("div", { class: "brand" },
                el("h1", {}, APP_NAME),
                el("p", { class: "brand-sub" }, t("header.subtitle", { count: this.pool().size }))),
            el("div", { class: "header-tools" }, this.siteLanguageBox(), this.themeBox()),
            tabs);
    }

    /** Number of questions in an exam. */
    private examSize(): number
    {
        return EXAM_GENERAL_COUNT + EXAM_STATE_COUNT;
    }

    /** Body for the active mode. */
    private renderBody(): HTMLElement
    {
        if (this.mode === "exam")
        {
            return this.renderExam();
        }
        if (this.mode === "train")
        {
            return this.renderTrain();
        }
        if (this.mode === "learn")
        {
            return el("main", { class: "layout" }, this.learn.render(), this.renderAside());
        }
        return this.renderPractice();
    }

    // ----- practice and weak spot view -----

    /**
     * The control for the translation, which sits with the questions: a button that shows or hides it, in the language of the site
     * (English when the site is German), and beside it an arrow with the other languages to choose from.
     * @param id Id of the list of languages. The button has the same id with "-toggle".
     */
    private translationControl(id: string): HTMLElement
    {
        const state = this.store.state;
        const automatic = automaticTranslation(state.uiLanguage);
        const nameOf = (locale: Locale): string => t(ENDONYMS[locale]);
        const items = [
            { value: "auto", label: t("translation.auto"), description: t("translation.autoHint") },
            ...TRANSLATION_LOCALES.map((locale) => ({ value: locale, label: nameOf(locale), lang: locale, dir: directionOf(locale) })),
        ];
        const toggle = el("button", {
            id: `${id}-toggle`,
            class: "secondary sm chip-button translation-toggle",
            type: "button",
            "aria-pressed": String(state.translation !== "off"),
            "aria-busy": this.translating ? "true" : false,
            disabled: this.translating,
            onclick: () => void this.toggleTranslation(),
        }, icon("translate"), el("span", {}, t("translation.label")));
        const languages = new Listbox({
            id,
            label: t("translation.listLabel"),
            items,
            value: state.translationLanguage,
            icon: () => icon("chevronDown"),
            iconOnly: true,
            buttonName: (item) => t("translation.button", { name: item.value === "auto" ? t("translation.autoNamed", { name: nameOf(automatic) }) : item.label }),
            className: "translation-box",
            align: "end",
            note: t("translation.note"),
            onChange: (value) =>
            {
                void this.pickTranslationLanguage(value === "auto" ? "auto" : (asLocale(value) ?? "auto"));
            },
        }).element;
        return el("span", { class: "translation-split" }, toggle, languages);
    }

    /** Round view: bar, panel, timeline, the question or the end card, and the buttons. */
    private renderPractice(): HTMLElement
    {
        const main = el("main", { class: "layout" });
        const column = el("section", { class: "stage" }, this.renderClockStrip());
        const active = this.activeRound() as ActiveRound;
        const { round } = active;

        column.append(this.renderRoundBar(active));
        if (this.panelOpen)
        {
            column.append(this.renderPanel(active));
        }
        if (round.total === 0)
        {
            column.append(this.renderEmptyRound());
        }
        else
        {
            column.append(renderTimeline(round, this.legendOpen, {
                open: (index) =>
                {
                    round.open(index);
                    this.moved = true;
                    this.render();
                },
                toggleLegend: () =>
                {
                    this.legendOpen = !this.legendOpen;
                    this.render();
                },
            }));
            const banner = this.renderBanner(round);
            if (banner)
            {
                column.append(banner);
            }
            const slot = round.current;
            column.append(slot?.item
                ? this.renderQuestionCard(slot.item, slot.selected, true, round.canAnswer)
                : this.renderEndCard(active));
            column.append(this.renderRoundButtons(round));
        }
        main.append(column, this.renderAside());
        return main;
    }

    /**
     * The line above the timeline: what the round is made of, its order, and the button that changes both.
     * @param active The round.
     */
    private renderRoundBar(active: ActiveRound): HTMLElement
    {
        const { round } = active;
        let what: string;
        if (active.source === "weak")
        {
            what = t("round.mistakes");
        }
        else if (active.source === "weakSelection")
        {
            what = t("round.weakIn", { choice: this.describeChoice(this.topicsInUse(), this.practiceStates()) });
        }
        else if (active.source === "mistakes")
        {
            what = t("round.roundMistakes");
        }
        else if (active.source === "lesson")
        {
            what = t("learn.round.lesson", { title: this.lessonRound?.title ?? "" });
        }
        else
        {
            what = this.describeChoice(this.topicsInUse(), this.practiceStates());
        }
        const orderText = round.order === "random" ? t("order.random") : t("order.booklet");
        return el("section", { class: "round-bar", "aria-label": t("round.region") },
            el("span", { class: "round-fact" },
                el("span", { class: "round-label" }, t("round.questions")),
                el("strong", {}, t("round.summary", { what, count: i18n.plural("panel.questions", round.total) }))),
            el("span", { class: "round-fact" },
                el("span", { class: "round-label" }, t("round.order")),
                el("strong", {}, orderText)),
            round.locked ? el("span", { class: "round-fact" }, el("strong", {}, t("round.locked"))) : null,
            active.source === "weak" || active.source === "weakSelection"
                ? el("button", { id: "exit-weak", class: "secondary", type: "button", onclick: () => this.exitWeakSpots() }, t("round.exitWeak"))
                : null,
            active.source === "lesson"
                ? el("button", {
                    id: "exit-lesson",
                    class: "secondary",
                    type: "button",
                    onclick: () =>
                    {
                        // Back in the lesson where the user left it, at the button that led here.
                        this.learn.resume();
                        this.switchMode("learn");
                    },
                }, t("learn.round.back"))
                : null,
            el("button", {
                id: "change-selection",
                class: "secondary",
                type: "button",
                "aria-expanded": String(this.panelOpen),
                "aria-controls": "topic-panel",
                onclick: () => (this.panelOpen ? this.closePanel() : this.openPanel()),
            }, this.panelOpen ? t("round.close") : t("round.change")));
    }

    /**
     * The choice of subjects and the user's state in words, for the line above the timeline.
     * @param topics Subject ids.
     * @param states The user's state id, or none.
     * @returns For example "All topics + Berlin".
     */
    private describeChoice(topics: readonly string[], states: readonly string[]): string
    {
        const subjects = describeSubjects(topics);
        const subjectsText: Record<string, string> = {
            all: t("round.allTopics"),
            none: "",
            group: subjects.group ? t(subjects.group.title) : "",
            list: i18n.plural("panel.topicCount", topics.length),
        };
        const statesText = states.length === 1 ? this.topicName(states[0]) : "";
        const parts = [subjectsText[subjects.kind], statesText].filter((part) => part !== "");
        return parts.length === 2 ? t("round.join", { topics: parts[0], states: parts[1] }) : parts[0] ?? "";
    }

    /**
     * The panel for order, subjects, states and answers.
     * @param active The round that a new start would end.
     */
    private renderPanel(active: ActiveRound): HTMLElement
    {
        const counts = active.round.counts;
        return renderTopicPanel(this.panelConfig({ running: counts.answered > 0 ? { done: counts.answered, total: counts.total } : null }));
    }

    /**
     * What the panel shows and does, over the staged choice.
     * @param extra What differs between the panels of the modes.
     */
    private panelConfig(extra: Pick<TopicPanelConfig, "running"> & Partial<TopicPanelConfig>): TopicPanelConfig
    {
        return {
            bank: this.bank,
            topics: this.staged.topics,
            stateId: this.store.state.state,
            includeState: this.staged.includeState,
            order: this.staged.order,
            lockAnswers: this.staged.lockAnswers,
            onlyWeak: this.staged.onlyWeak,
            weakTotal: this.weakTotal(),
            weakCount: this.selectionNumbers(this.staged.topics, this.staged.includeState ? [this.store.state.state] : [], true).length,
            onToggle: (topic) =>
            {
                const topics = this.staged.topics;
                this.staged.topics = topics.includes(topic) ? topics.filter((entry) => entry !== topic) : ALL_TOPICS.filter((entry) => entry === topic || topics.includes(entry));
                this.render();
            },
            onPreset: (topics) =>
            {
                this.staged.topics = [...topics];
                this.render();
            },
            onIncludeState: (include) =>
            {
                this.staged.includeState = include;
                this.render();
            },
            onOrder: (order) =>
            {
                this.staged.order = order;
                this.render();
            },
            onLock: (locked) =>
            {
                this.staged.lockAnswers = locked;
                this.render();
            },
            onOnlyWeak: (only) =>
            {
                this.staged.onlyWeak = only;
                this.render();
            },
            onCancel: () => this.closePanel(),
            onStart: () => this.startFromPanel(),
            ...extra,
        };
    }

    /**
     * The note above a question that is looked at again or was skipped.
     * @param round The round.
     * @returns The note, or null when the question needs none.
     */
    private renderBanner(round: Round): HTMLElement | null
    {
        const slot = round.current;
        if (!slot)
        {
            return null;
        }
        if (round.locked && slot.selected !== null && (round.isDetour || round.ended))
        {
            return el("p", { class: "banner banner-review", role: "status" }, t("review.banner"));
        }
        if (slot.outcome === "skipped" && round.canAnswer && round.isDetour)
        {
            return el("p", { class: "banner banner-skipped", role: "status" }, t("skipped.banner", { n: questionName(round.slots[round.resume].n) }));
        }
        return null;
    }

    /**
     * Back and the right hand button below the question. The right hand one skips, goes on, returns to where the round
     * goes on, or leads to the result, whichever is the case.
     * @param round The round.
     */
    private renderRoundButtons(round: Round): HTMLElement
    {
        let label: string;
        const unanswered = round.current?.selected === null;
        if (round.ended)
        {
            const moreSkipped = round.slots.some((slot, index) => index > round.view && slot.outcome === "skipped");
            label = moreSkipped ? (unanswered ? t("action.skip") : t("action.next")) : t("action.result");
        }
        else if (round.isDetour)
        {
            label = t("action.backTo", { n: questionName(round.slots[round.resume].n) });
        }
        else if (unanswered)
        {
            label = t("action.skip");
        }
        else
        {
            label = round.hasNext ? t("action.next") : t("action.result");
        }
        // Skipping is the quiet choice. The main button is for going on after an answer, so it is not the first thing to press.
        const quiet = unanswered && !round.ended && !round.isDetour;
        return el("div", { class: "footer-row nav-row" },
            el("button", {
                id: "round-back",
                class: "secondary",
                type: "button",
                disabled: !round.canGoBack,
                onclick: () => this.stepBack(),
            }, icon("arrowBack"), el("span", {}, t("action.previous"))),
            round.view >= 0
                ? el("button", { id: "round-next", class: quiet ? "secondary" : "primary", type: "button", onclick: () => this.advance() }, el("span", {}, label), icon("arrowForward"))
                : null);
    }

    /**
     * The card at the end of a round: what was done, and what to do next.
     * @param active The round.
     */
    private renderEndCard(active: ActiveRound): HTMLElement
    {
        const { round } = active;
        const counts = round.counts;
        const mistakes = round.mistakes;
        const title = counts.skipped > 0 ? t("end.titleSkipped") : t("end.titleDone", { correct: counts.correct, total: counts.total });
        const again = (): void => this.startRoundOver();
        return el("div", { class: "card end-card" },
            el("h2", { "data-focus": true }, title),
            el("p", {}, t("end.text", { answered: counts.answered, total: counts.total, correct: counts.correct, wrong: counts.wrong })),
            counts.skipped > 0 ? el("p", {}, t("end.skipped", { count: counts.skipped })) : null,
            el("div", { class: "footer-row end-actions" },
                counts.skipped > 0
                    ? el("button", { id: "end-skipped", class: "primary", type: "button", onclick: () => this.answerSkipped(round) }, t("end.answerSkipped", { count: counts.skipped }))
                    : null,
                mistakes.length > 0
                    ? el("button", {
                        id: "end-mistakes",
                        class: counts.skipped > 0 ? "secondary" : "primary",
                        type: "button",
                        onclick: () =>
                        {
                            this.rounds[this.mode as RoundMode] = this.buildRound(mistakes, this.store.state.order, "mistakes");
                            this.render();
                        },
                    }, t("end.mistakes", { count: mistakes.length }))
                    : null,
                el("button", { id: "end-again", class: "secondary", type: "button", onclick: again }, t("end.again")),
                el("button", { id: "end-change", class: "secondary", type: "button", onclick: () => this.openPanel() }, t("end.change"))));
    }

    /**
     * Shows the first skipped question of a round that has ended.
     * @param round The round.
     */
    private answerSkipped(round: Round): void
    {
        round.answerSkipped();
        this.moved = true;
        this.render();
    }

    /** Message shown when a selection has no questions. */
    private renderEmptyRound(): HTMLElement
    {
        return el("div", { class: "card empty" },
            el("h2", {}, t("end.empty")),
            el("button", { class: "primary", type: "button", onclick: () => this.openPanel() }, t("end.change")));
    }

    /**
     * The column on the right, the same in every mode: what you have done so far, then the clock.
     * In a running exam the first widget is the exam itself, with its Finish and Start over buttons.
     * @returns The column.
     */
    private renderAside(): HTMLElement
    {
        const exam = this.exam;
        const running = this.mode === "exam" && exam !== null && !exam.finished;
        const finished = this.mode === "exam" && exam !== null && exam.finished;
        const round = this.mode === "practice" ? this.activeRound()?.round : undefined;
        // The progress and the clock are the same in every mode, so they keep their place and their size.
        // What only one mode has (the buttons of the round, the widget of the training) comes after them.
        // Only the Learn tab puts its own widget above the clock: nothing is timed there, and what is due is what matters.
        return el("div", { class: "aside" },
            running ? this.renderExamWidget(exam) : this.renderStats(),
            this.mode === "learn" ? this.learn.renderWidget() : null,
            finished ? null : this.renderClockWidget(),
            round && round.total > 0 ? this.renderRoundWidget(round) : null,
            this.mode === "train" && this.train ? this.renderTrainWidget(this.train) : null);
    }

    /**
     * The widget of a running exam: how far you are, what it takes to pass, and the buttons to end or start over.
     * @param exam The running exam.
     */
    private renderExamWidget(exam: ExamState): HTMLElement
    {
        const answered = exam.answers.filter((answer) => answer !== null).length;
        const rows: [string, string][] = [
            [t("exam.widget.answered"), t("exam.widget.answeredValue", { count: answered, total: exam.items.length })],
            [t("exam.widget.open"), i18n.number(exam.items.length - answered)],
            [t("exam.widget.marked"), i18n.number(exam.marked.filter(Boolean).length)],
            [t("exam.widget.pass"), t("exam.widget.passValue", { count: EXAM_PASS_MARK })],
        ];
        return el("aside", { class: "widget exam-widget", "aria-label": t("exam.widget.title") },
            el("h2", {}, t("exam.widget.title")),
            el("dl", {}, ...rows.flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value)])),
            el("div", { class: "widget-actions" },
                el("button", { id: "exam-finish", class: "secondary sm", type: "button", onclick: () => this.requestFinish() }, t("exam.widget.end")),
                el("button", {
                    id: TWO_STEP_BUTTONS.startOver.id,
                    class: this.twoStepClass("startOver"),
                    type: "button",
                    onclick: () =>
                    {
                        if (this.armed === "startOver")
                        {
                            this.startExam();
                            return;
                        }
                        this.arm("startOver");
                        this.render();
                    },
                }, ...this.twoStepContent("startOver"))));
    }

    /**
     * The clock. In practice it counts up or down, as chosen, with a time to set for the count down and no limit.
     * In the exam it counts down from the exam time, which can be made shorter than the official time but not longer,
     * and it cannot be stopped. The time is tinted with 15 minutes left, gets a yellow border with 5 and a red one with 1.
     */
    private renderClockWidget(): HTMLElement
    {
        const now = Date.now();
        const clock = this.shownClock();
        const forExam = this.mode === "exam";
        const examRunning = forExam && this.exam !== null && !this.exam.finished;
        const state = this.store.state;
        const widget = el("aside", { id: "clock-widget", class: "widget clock-widget", "aria-label": t("clock.title") },
            el("h2", {}, t("clock.title")));
        this.setLevel(widget, clock.level(now));
        if (!forExam)
        {
            widget.append(el("div", { class: "clock-modes", role: "group", "aria-label": t("clock.mode.label") },
                ...(["down", "up"] as const).map((mode) => el("button", {
                    id: `clock-mode-${mode}`,
                    class: "secondary sm chip-button",
                    type: "button",
                    "aria-pressed": String(clock.mode === mode),
                    onclick: () => this.setClockMode(mode),
                }, t(mode === "down" ? "clock.mode.down" : "clock.mode.up")))));
        }
        widget.append(
            el("p", { id: "clock-display", class: "clock-display", role: "timer", "aria-label": t(clock.mode === "down" ? "clock.label.down" : "clock.label.up") }, formatClock(clock.shown(now), clock.mode)),
            el("p", { id: "clock-note", class: "hint" }, this.clockNote(clock, now)));
        if (clock.mode === "down")
        {
            const max = forExam ? EXAM_DURATION_MINUTES : MAX_COUNTDOWN_MINUTES;
            widget.append(el("label", { class: "clock-minutes" },
                el("span", {}, t("clock.minutes")),
                el("input", {
                    id: "clock-minutes",
                    dir: "ltr",
                    type: "number",
                    inputmode: "numeric",
                    min: "1",
                    max: String(max),
                    value: String(forExam ? state.examMinutes : state.clockMinutes),
                    disabled: examRunning,
                    onchange: (event: Event) => this.setClockMinutes((event.target as HTMLInputElement).value, forExam),
                })));
        }
        if (!forExam)
        {
            widget.append(el("div", { class: "widget-actions" },
                el("button", {
                    id: "clock-toggle",
                    class: "secondary sm icon-only",
                    type: "button",
                    "aria-label": clock.running ? t("clock.pause") : t("clock.start"),
                    title: clock.running ? t("clock.pause") : t("clock.start"),
                    onclick: () => this.toggleClock(),
                }, icon(clock.running ? "pause" : "play")),
                el("button", { id: "clock-reset", class: "secondary sm", type: "button", onclick: () => this.resetClock() }, t("clock.reset"))));
        }
        return widget;
    }

    /**
     * Makes the clock of practice count up or down, from zero or from the set time.
     * @param mode Which way.
     */
    private setClockMode(mode: "up" | "down"): void
    {
        this.store.state.clockMode = mode;
        this.store.save();
        this.practiceClock = new Clock(mode, this.store.state.clockMinutes);
        this.syncTicker();
        this.render();
    }

    /**
     * Sets how long a count down is. Whatever is typed is made a whole number of minutes from 1 up to the limit: the official time for the exam, a large number for practice.
     * @param text What was typed.
     * @param forExam Whether it is the time of the exam.
     */
    private setClockMinutes(text: string, forExam: boolean): void
    {
        const state = this.store.state;
        const max = forExam ? EXAM_DURATION_MINUTES : MAX_COUNTDOWN_MINUTES;
        const typed = Math.round(Number(text));
        const minutes = Number.isFinite(typed) && typed > 0 ? Math.min(max, typed) : (forExam ? state.examMinutes : state.clockMinutes);
        if (forExam)
        {
            state.examMinutes = minutes;
        }
        else
        {
            state.clockMinutes = minutes;
            this.practiceClock.durationMs = minutes * SECONDS_PER_MINUTE * MS_PER_SECOND;
        }
        this.store.save();
        this.render();
    }

    /** Starts the clock of practice, or stops it. */
    private toggleClock(): void
    {
        const now = Date.now();
        if (this.practiceClock.running)
        {
            this.practiceClock.pause(now);
        }
        else
        {
            if (this.practiceClock.over(now))
            {
                this.practiceClock.reset();
            }
            this.practiceClock.start(now);
        }
        this.syncTicker();
        this.render();
    }

    /** Stops the clock of practice and sets it back to the start. */
    private resetClock(): void
    {
        this.practiceClock.reset();
        this.syncTicker();
        this.render();
    }

    /** Starts the round over with the same questions in the same order, drawn again. */
    private startRoundOver(): void
    {
        const source = this.rounds[this.mode as RoundMode]?.source;
        this.rounds[this.mode as RoundMode] = this.rebuildRound(source === "mistakes" ? "topics" : source);
        this.panelOpen = false;
        this.render();
    }

    /**
     * The buttons of a round of practice, in a widget of their own below the clock, where the training has its widget.
     * @param round The round.
     */
    private renderRoundWidget(round: Round): HTMLElement
    {
        return el("aside", { class: "widget round-widget", "aria-label": t("timeline.round") },
            el("h2", {}, t("timeline.round")),
            el("p", { class: "hint" }, t("round.explain")),
            el("div", { class: "widget-actions" },
                el("button", { id: "round-start-over", class: "secondary sm", type: "button", title: t("round.startOverHint"), onclick: () => this.startRoundOver() }, t("round.startOver")),
                el("button", {
                    id: "round-finish",
                    class: "secondary sm",
                    type: "button",
                    title: t("round.finishHint"),
                    disabled: round.ended,
                    onclick: () =>
                    {
                        round.finish();
                        this.render();
                    },
                }, t("round.finish"))));
    }

    /** Sidebar with the progress numbers, the way to the weak spots and the reset control. The same in every mode. */
    private renderStats(): HTMLElement
    {
        const inPool = (questionNumber: number): boolean => this.pool().has(questionNumber);
        const accuracy = this.store.accuracyPercentIn(inPool);
        const weak = this.store.weakNumbersIn(inPool).length;
        const rows: [string, string][] = [
            [t("stats.seen"), t("stats.seenValue", { seen: this.store.seenCountIn(inPool), total: this.pool().size })],
            [t("stats.accuracy"), accuracy === null ? t("stats.accuracyNone") : t("stats.accuracyValue", { percent: accuracy })],
            [t("stats.weak"), i18n.number(weak)],
        ];
        const resetButton = el("button", {
            id: TWO_STEP_BUTTONS.reset.id,
            class: this.twoStepClass("reset"),
            type: "button",
            onclick: () =>
            {
                if (this.armed === "reset")
                {
                    this.store.resetProgress();
                    this.learn.forget();
                    if (this.mode === "learn")
                    {
                        // The tab is back at its list of lessons, and the address says so.
                        this.setAddress(this.hash(), false);
                    }
                    this.disarm();
                    const source = this.rounds.practice?.source;
                    if (source === "weak" || source === "weakSelection")
                    {
                        this.rounds.practice = this.rebuildRound(source);
                    }
                    this.panelOpen = false;
                }
                else
                {
                    this.arm("reset");
                }
                this.render();
            },
        }, ...this.twoStepContent("reset"));

        return el("aside", { class: "widget stats", "aria-label": t("stats.aria") },
            el("h2", {}, t("stats.title")),
            el("dl", {},
                ...rows.flatMap(([label, value]) => [el("dt", {}, label), el("dd", { class: value === t("stats.accuracyNone") ? "is-empty" : "" }, value)])),
            // Always there, and off while there is no weak spot, so the widget has one height and the clock below it stays put.
            el("button", { id: "practice-weak", class: "secondary sm", type: "button", disabled: weak === 0, onclick: () => this.practiceWeakSpots() }, t("stats.practiceWeak")),
            el("details", { class: "kbd-help" }, el("summary", {}, t("stats.keyboard")), el("p", { class: "hint" }, t("stats.hint"))),
            resetButton);
    }

    // ----- shared question card -----

    /**
     * Text that says where a picture comes from, shown when hovering the picture.
     * @param question The question.
     * @returns Tooltip text.
     */
    private pictureSource(question: Question): string
    {
        const page = question.pg ?? 0;
        const credit = question.texts[DEFAULT_LOCALE].cap;
        return credit
            ? t("picture.sourceCredit", { stand: CATALOGUE_STAND, page, credit })
            : t("picture.source", { stand: CATALOGUE_STAND, page });
    }

    /**
     * The picture of a question, with its credit under it. Hovering the picture tells where it comes from.
     * @param question The question.
     * @returns Picture block, or null when the question has no picture.
     */
    private renderPicture(question: Question): HTMLElement | null
    {
        if (!question.img)
        {
            return null;
        }
        const source = question.img;
        const credit = question.texts[DEFAULT_LOCALE].cap;
        return el("figure", { class: "picture" },
            el("img", {
                src: source,
                ...imageSizeAttributes(source),
                alt: t("picture.alt"),
                title: this.pictureSource(question),
                loading: "lazy",
                onerror: (event: Event) =>
                {
                    const figure = (event.target as HTMLElement).parentElement;
                    if (figure)
                    {
                        figure.replaceChildren(el("a", { href: source, target: "_blank", rel: "noopener" }, t("picture.error")));
                    }
                },
            }),
            credit ? el("figcaption", { class: "caption", lang: DEFAULT_LOCALE, dir: "ltr" }, credit) : null);
    }

    /**
     * Draws a question with its options. The translation list sits in the card, next to the text it changes.
     * @param item Presented question.
     * @param selected Selected option index or null.
     * @param revealOnSelect Show right and wrong colors once an answer is chosen.
     * @param canAnswer Whether an option can be chosen. False when the answer is final (locked answers).
     */
    private renderQuestionCard(item: PresentedQuestion, selected: number | null, revealOnSelect: boolean, canAnswer = true, gaveUp = false): HTMLElement
    {
        const { question, options } = item;
        const isState = question.n > LAST_GENERAL_NUMBER;
        const answered = (selected !== null || gaveUp) && revealOnSelect;
        const translation = this.store.state.translation;

        // A tag only informs. The number, then the state for a state question or the subject for a general one.
        const meta = el("div", { class: "meta" },
            el("span", { class: "tag tag-strong qno", dir: "ltr" }, questionLabel(question.n)),
            el("span", { class: isState ? "tag tag-state tag-topic" : "tag tag-topic", title: this.topicName(question.k) }, clampedText(this.topicName(question.k), 1)));

        const tools = el("div", { class: "card-tools" },
            this.translationControl("translation"),
            this.renderOriginalButton(question));

        const title = el("h2", { class: "question", "data-focus": true },
            this.bilingual(this.questionTexts(question)));

        const list = el("ol", { class: "options" },
            ...options.map((option, index) =>
            {
                const classes = ["option"];
                if (selected === index)
                {
                    classes.push("is-selected");
                }
                if (answered && option.isCorrect)
                {
                    classes.push("is-correct");
                }
                if (answered && selected === index && !option.isCorrect)
                {
                    classes.push("is-wrong");
                }
                const mark = answered
                    ? (option.isCorrect ? t("card.correct") : (selected === index ? t("card.yourAnswer") : ""))
                    : "";
                return el("li", {},
                    el("button", {
                        class: classes.join(" "),
                        type: "button",
                        "aria-pressed": String(selected === index),
                        disabled: !canAnswer,
                        onclick: () => this.chooseOption(index),
                    },
                        el("span", { class: "letter" }, OPTION_LETTERS[index]),
                        this.bilingual(option.texts, "option-text"),
                        mark ? el("span", { class: "mark" }, mark) : null));
            }));

        const card = el("article", { class: "card" }, meta, tools,
            translation === "off" ? null : el("p", { class: "unofficial-note" }, t("card.unofficialNote", { language: `${FIRST_STRONG_ISOLATE}${t(ENDONYMS[translation])}${POP_ISOLATE}` })),
            title, this.renderPicture(question), list);
        if (answered)
        {
            const correct = selected !== null && options[selected].isCorrect;
            card.append(el("p", { class: correct ? "verdict ok" : "verdict bad", role: "status" },
                el("span", {}, selected === null ? t("card.verdictGaveUp") : (correct ? t("card.verdictRight") : t("card.verdictWrong"))),
                // Right or wrong, why the answer is right is one step away: the part of the lesson that teaches it, in the dialog.
                el("button", { id: "learn-why", class: "link-button learn-why", type: "button", "aria-haspopup": "dialog", onclick: () => this.learnWhy(question.n) }, t("learn.why"))));
        }
        return card;
    }

    // ----- training view -----

    /** Training view: the choice, the question that is up with a note on why it is up, and what the answer did. */
    private renderTrain(): HTMLElement
    {
        const session = this.train as TrainSession;
        const { trainer } = session;
        const column = el("section", { class: "stage" }, this.renderClockStrip());
        column.append(this.renderTrainBar(session));
        if (this.panelOpen)
        {
            column.append(renderTopicPanel(this.panelConfig({
                forTrain: true,
                running: trainer.answers > 0 && !session.ended && !trainer.done ? { done: trainer.cleared, total: trainer.total } : null,
            })));
        }
        if (trainer.total === 0)
        {
            column.append(this.renderEmptyRound());
        }
        else if (session.ended || !session.item || !trainer.current)
        {
            column.append(this.renderTrainEnd(session));
        }
        else
        {
            const turn = trainer.current;
            const topic = this.topicName(turn.category);
            const marker = this.trainMarker(turn.reason, topic, trainer.answers);
            if (marker)
            {
                column.append(marker);
            }
            column.append(this.renderQuestionCard(session.item, session.selected, true, !trainer.answered, session.gaveUp));
            if (trainer.answered)
            {
                column.append(this.trainNote(trainer, topic));
            }
            column.append(el("div", { class: "footer-row nav-row" },
                el("button", { id: "train-give-up", class: "secondary", type: "button", disabled: trainer.answered, onclick: () => this.giveUpTrain() }, t("train.dontKnow")),
                el("button", { id: "train-next", class: "primary", type: "button", disabled: !trainer.answered, onclick: () => this.nextTrain() },
                    trainer.remaining === 0 ? t("train.finish") : t("train.next"))));
        }
        return el("main", { class: "layout" }, column, this.renderAside());
    }

    /**
     * The line above the question: what the session draws from and the button that changes it.
     * @param session The session.
     */
    private renderTrainBar(session: TrainSession): HTMLElement
    {
        const { includeState, topics } = this.trainSelection();
        const what = this.describeChoice(topics, includeState ? [this.store.state.state] : []);
        return el("section", { class: "round-bar", "aria-label": t("train.region") },
            el("span", { class: "round-fact" },
                el("span", { class: "round-label" }, t("round.questions")),
                el("strong", {}, t("round.summary", { what, count: i18n.plural("panel.questions", session.trainer.total) }))),
            el("button", {
                id: "change-selection",
                class: "secondary",
                type: "button",
                "aria-expanded": String(this.panelOpen),
                "aria-controls": "topic-panel",
                onclick: () => (this.panelOpen ? this.closePanel() : this.openPanel()),
            }, this.panelOpen ? t("round.close") : t("round.change")));
    }

    /**
     * The note above a question of the training that says why it is up. A question drawn at random needs none, except
     * for the first one of a session, which comes with a short explanation of how the training works.
     * @param reason Why the question is up.
     * @param topic Name of its topic.
     * @param answers How many answers were given in the session.
     * @returns The note, or null.
     */
    private trainMarker(reason: TrainReason, topic: string, answers: number): HTMLElement | null
    {
        if (reason === "retry")
        {
            return el("p", { class: "banner banner-back", role: "status" }, icon("arrowBack"), t("train.banner.retry"));
        }
        if (reason === "category")
        {
            return el("p", { class: "banner banner-back", role: "status" }, icon("arrowBack"), t("train.banner.category", { topic }));
        }
        return answers === 0 ? el("p", { class: "banner banner-review" }, t("train.how")) : null;
    }

    /**
     * What the answer did, so the way the training works is clear from its own behaviour.
     * @param trainer The session.
     * @param topic Name of the topic of the question that was answered.
     */
    private trainNote(trainer: Trainer, topic: string): HTMLElement
    {
        const category = trainer.current?.category ?? "";
        let text: string;
        if (trainer.wasRight)
        {
            const left = trainer.remainingIn(category);
            text = left === 0 ? t("train.note.topicDone", { topic }) : i18n.plural("train.note.right", left, { topic });
        }
        else
        {
            text = t("train.note.wrong", { topic });
        }
        return el("p", { class: trainer.wasRight ? "train-note ok" : "train-note bad", role: "status" }, text);
    }

    /**
     * The card at the end of a session.
     * @param session The session.
     */
    private renderTrainEnd(session: TrainSession): HTMLElement
    {
        const { trainer } = session;
        return el("div", { class: "card end-card" },
            el("h2", { "data-focus": true }, trainer.done ? t("train.done.title") : t("train.ended.title")),
            el("p", {}, t("train.done.text", { cleared: trainer.cleared, total: trainer.total, answers: i18n.plural("train.answers", trainer.answers), missed: i18n.plural("train.missed", trainer.missed) })),
            el("div", { class: "footer-row end-actions" },
                el("button", { id: "train-again", class: "primary", type: "button", onclick: () => this.restartTrain() }, t("train.again")),
                el("button", { id: "end-change", class: "secondary", type: "button", onclick: () => this.openPanel() }, t("end.change"))));
    }

    /**
     * The widget of the training: how far it is, what is coming back, the buttons for the session and every topic.
     * @param session The session.
     */
    private renderTrainWidget(session: TrainSession): HTMLElement
    {
        const { trainer } = session;
        const over = session.ended || !trainer.current;
        const rows: [string, string][] = [
            [t("train.widget.cleared"), t("train.widget.clearedValue", { count: trainer.cleared, total: trainer.total })],
            [t("train.widget.left"), i18n.number(trainer.remaining)],
            [t("train.widget.back"), i18n.number(trainer.comingBack)],
        ];
        return el("aside", { class: "widget train-widget", "aria-label": t("train.widget.title") },
            el("h2", {}, t("train.widget.title")),
            el("dl", {}, ...rows.flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value)])),
            el("div", { class: "widget-actions" },
                el("button", { id: "train-end", class: "secondary sm", type: "button", disabled: over, onclick: () => this.endTrain() }, t("train.widget.end")),
                el("button", { id: "train-start-over", class: "secondary sm", type: "button", onclick: () => this.restartTrain() }, t("round.startOver"))),
            el("details", { class: "train-topics" },
                el("summary", {}, t("train.widget.topics")),
                el("ul", {}, ...trainer.topics().map((topic) => el("li", {},
                    el("span", { class: "train-topic-name" },
                        clampedText(this.topicName(topic.id), 2),
                        topic.boost > 0 ? el("span", { class: "train-back", role: "img", "aria-label": t("train.topic.back"), title: t("train.topic.back") }, icon("arrowBack")) : null),
                    el("span", { class: "train-topic-count" }, t("train.widget.clearedValue", { count: topic.cleared, total: topic.total })),
                    el("progress", { max: String(topic.total), value: String(topic.cleared), "aria-label": this.topicName(topic.id) }))))));
    }

    // ----- exam view -----

    /** Exam view: intro, running exam, or results. */
    private renderExam(): HTMLElement
    {
        const exam = this.exam;
        if (!exam)
        {
            return this.renderExamIntro();
        }
        if (exam.finished)
        {
            return this.renderExamResult(exam);
        }
        return this.renderExamRunning(exam);
    }

    /** Intro card with rules, the translation choice and the start button. */
    private renderExamIntro(): HTMLElement
    {
        return el("main", { class: "layout" },
            el("section", { class: "card intro" },
                el("h2", {}, t("exam.intro.title")),
                el("p", {}, t("exam.intro.text", { total: this.examSize(), general: EXAM_GENERAL_COUNT, local: EXAM_STATE_COUNT })),
                el("ul", { class: "facts" },
                    el("li", {}, t("exam.intro.pass", { count: EXAM_PASS_MARK })),
                    el("li", {}, i18n.plural("exam.intro.time", this.store.state.examMinutes)),
                    el("li", {}, t("exam.intro.feedback")),
                    el("li", {}, t("exam.intro.mark"))),
                el("div", { class: "intro-translation" },
                    el("p", { class: "hint" }, t("exam.intro.stateLine", { count: EXAM_STATE_COUNT, state: this.topicName(this.store.state.state) }))),
                el("div", { class: "intro-translation" },
                    el("span", { class: "setting-label" }, t("exam.intro.translation")),
                    this.translationControl("exam-translation"),
                    el("p", { class: "hint" }, t("exam.intro.translationNote"))),
                el("button", { class: "primary", type: "button", onclick: () => this.startExam() }, t("exam.start"))),
            this.renderAside());
    }

    /**
     * Running exam: clock, navigator, current question, back and next.
     * @param exam Exam state.
     */
    private renderExamRunning(exam: ExamState): HTMLElement
    {
        const item = exam.items[exam.current];
        const answeredCount = exam.answers.filter((answer) => answer !== null).length;

        const bar = el("div", { class: "exam-bar" },
            el("span", { class: "exam-progress" }, t("exam.progress", { current: exam.current + 1, total: exam.items.length })),
            el("span", { class: "exam-answered" }, t("exam.answered", { count: answeredCount })),
            el("button", {
                id: "exam-mark",
                class: "secondary sm chip-button",
                type: "button",
                "aria-pressed": String(exam.marked[exam.current]),
                onclick: () => this.toggleMark(),
            }, icon("flag"), t("exam.mark")));

        const navigator = el("div", { class: "navigator", role: "group", "aria-label": t("exam.navigator") },
            ...exam.items.map((_, index) => el("button", {
                class: [
                    "nav-dot",
                    index === exam.current ? "is-current" : "",
                    exam.answers[index] !== null ? "is-done" : "",
                    exam.marked[index] ? "is-marked" : "",
                ].join(" ").trim(),
                type: "button",
                "aria-label": this.dotLabel(exam, index),
                "aria-current": index === exam.current ? "step" : false,
                onclick: () => this.showExamQuestion(exam, index),
            }, i18n.number(index + 1))));

        const isLast = exam.current === exam.items.length - 1;
        const controls = el("div", { class: "footer-row nav-row" },
            el("button", {
                class: "secondary",
                type: "button",
                disabled: exam.current === 0,
                onclick: () => this.moveExam(-1),
            }, t("exam.back")),
            isLast
                ? el("button", { class: "primary", type: "button", onclick: () => this.requestFinish() }, t("exam.finish"))
                : el("button", { class: "primary", type: "button", onclick: () => this.moveExam(1) }, t("exam.next")));

        const column = el("section", { class: "stage" }, this.renderClockStrip(), bar, navigator, this.renderQuestionCard(item, exam.answers[exam.current], false), controls);
        return el("main", { class: "layout" }, column, this.renderAside());
    }

    /**
     * Accessible name of a button of the list of questions.
     * @param exam The running exam.
     * @param index Position of the question.
     */
    private dotLabel(exam: ExamState, index: number): string
    {
        const answered = exam.answers[index] !== null;
        const key = exam.marked[index]
            ? (answered ? "exam.dotAnsweredMarked" : "exam.dotMarked")
            : (answered ? "exam.dotAnswered" : "exam.dot");
        return t(key, { n: index + 1 });
    }

    /**
     * Finishes at once when everything is answered and nothing is marked, otherwise asks first, in the dialog: it
     * is in view wherever the page is scrolled to, takes the keyboard focus, and Escape or a click outside keeps working.
     */
    private requestFinish(): void
    {
        const exam = this.exam;
        if (!exam)
        {
            return;
        }
        const unanswered = exam.answers.filter((answer) => answer === null).length;
        if (unanswered === 0 && !exam.marked.some(Boolean))
        {
            this.finishExam();
            return;
        }
        this.modal.show(finishView({
            unanswered,
            never: exam.answers.filter((answer, index) => answer === null && !exam.visited[index]).length,
            marked: exam.marked.filter(Boolean).length,
            keepWorking: () => this.modal.close(),
            finish: () => this.finishExam(),
        }));
    }

    /**
     * Result screen with score and the list of missed questions, or of every answer when the user asks for it. Nothing
     * of the exam can be changed any more: the list only shows it.
     * @param exam Finished exam.
     */
    private renderExamResult(exam: ExamState): HTMLElement
    {
        const score = this.examScore(exam);
        const passed = score >= EXAM_PASS_MARK;
        const isRight = (item: PresentedQuestion, index: number): boolean =>
        {
            const choice = exam.answers[index];
            return choice !== null && item.options[choice].isCorrect;
        };
        const all = exam.items.map((item, index) => ({ item, index }));
        const missed = all.filter(({ item, index }) => !isRight(item, index));
        const shown = this.reviewAll ? all : missed;
        let heading = t("result.review", { count: missed.length });
        if (this.reviewAll)
        {
            heading = t("result.reviewAll", { count: all.length });
        }
        else if (missed.length === 0)
        {
            heading = t("result.noMistakes");
        }

        const summary = el("section", { id: RESULT_ID, class: passed ? "card result pass" : "card result fail", tabindex: "-1" },
            exam.timedOut ? el("p", { class: "result-timeup" }, t("result.timeUp")) : null,
            el("p", { class: "result-label" }, passed ? t("result.passed") : t("result.failed")),
            el("p", { class: "result-score" }, t("result.score", { score, total: exam.items.length })),
            el("p", { class: "result-note" }, t("result.note", { count: EXAM_PASS_MARK })),
            el("div", { class: "footer-row" },
                el("button", { class: "primary", type: "button", onclick: () => this.leaveResult() }, t("result.newExam")),
                el("button", { class: "secondary", type: "button", onclick: () => this.practiceWeakSpots() }, t("stats.practiceWeak"))));

        const review = el("section", { class: "review" },
            el("div", { class: "review-head" },
                el("h2", {}, heading),
                // Both texts are in the button all the time, so it keeps its width when it is pressed.
                el("button", {
                    id: "review-all",
                    class: "secondary sm swap-box",
                    type: "button",
                    "aria-pressed": String(this.reviewAll),
                    onclick: () =>
                    {
                        this.reviewAll = !this.reviewAll;
                        this.render();
                    },
                }, ...twoStepLabel(t("result.showAll", { count: all.length }), t("result.showMistakes"), this.reviewAll))),
            ...shown.map(({ item, index }) =>
            {
                const choice = exam.answers[index];
                const correct = item.options.find((option) => option.isCorrect);
                const credit = item.question.texts[DEFAULT_LOCALE].cap;
                const right = isRight(item, index);
                return el("article", { class: right ? "card review-item is-right" : "card review-item" },
                    el("div", { class: "meta" },
                        el("span", { class: "tag tag-strong qno", dir: "ltr" }, questionLabel(item.question.n)),
                        el("span", { class: "tag tag-topic", title: this.topicName(item.question.k) }, clampedText(this.topicName(item.question.k), 1)),
                        this.renderOriginalButton(item.question)),
                    el("p", { class: "question small" }, this.bilingual(this.questionTexts(item.question))),
                    item.question.img
                        ? el("a", { href: item.question.img, target: "_blank", rel: "noopener", class: "pic-link" }, t("result.openPicture"))
                        : null,
                    credit ? el("p", { class: "caption", lang: DEFAULT_LOCALE, dir: "ltr" }, credit) : null,
                    right
                        ? el("p", { class: "line ok" },
                            el("span", { class: "tag" }, t("result.youRight")),
                            this.bilingual((correct as PresentedQuestion["options"][number]).texts))
                        : el("p", { class: "line bad" },
                            el("span", { class: "tag" }, t("result.you")),
                            choice === null ? t(exam.visited[index] ? "result.noAnswer" : "result.notOpened") : this.bilingual(item.options[choice as number].texts)),
                    right
                        ? null
                        : el("p", { class: "line ok" },
                            el("span", { class: "tag" }, t("result.right")),
                            this.bilingual((correct as PresentedQuestion["options"][number]).texts)),
                    el("button", { id: `why-${index}`, class: "link-button learn-why", type: "button", "aria-haspopup": "dialog", onclick: () => this.learnWhy(item.question.n) }, t("learn.why")));
            }));

        return el("main", { class: "layout" }, el("div", { class: "stage" }, summary, review), this.renderAside());
    }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/** Reads the embedded JSON, creates the app, and starts it. */
async function boot(): Promise<void>
{
    const root = document.getElementById("app") as HTMLElement;
    const toast = document.getElementById("toast") as HTMLElement;
    const modalRoot = document.getElementById("modal-root") as HTMLElement;
    const dataNode = document.getElementById("question-data") as HTMLElement;
    const bundle = JSON.parse(dataNode.textContent ?? "{}") as QuestionBundle;
    readImageSizes(document.getElementById("image-sizes"));
    const bank = new QuestionBank(bundle);
    const files = readLanguageFiles(document.getElementById("language-files"));
    const languages = new LanguageLoader(files, bank);
    const app = new App(bank, root, toast, modalRoot, languages, files.learn);
    ErrorBoundary.install((message) => app.showError(message));
    await app.start();
}

/** Settles when the page is drawn the first time, which waits for the languages it needs. */
export const ready: Promise<void> = boot();
