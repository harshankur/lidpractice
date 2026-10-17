import type { QuestionBank } from "../bank";
import { EXAM_GENERAL_COUNT, EXAM_PASS_MARK, EXAM_STATE_COUNT, PERCENT } from "../constants";
import { clampedText, el, icon, twoStepLabel, type Child } from "../dom";
import { ErrorBoundary } from "../errorBoundary";
import { i18n, t } from "../i18n";
import type { ModalView } from "../modal";
import { shareLink } from "../share";
import { STATE_IDS, questionName } from "../states";
import type { Store } from "../store";
import { DEFAULT_LOCALE, type LearnFiles, type LearnProgress, type Locale, type PresentedQuestion, type Question } from "../types";
import { renderChronology, renderEraLegend } from "./chronology";
import { CourseBook, STATE_LESSON_PREFIX } from "./course";
import { LearnLoader } from "./loader";
import { mapModel, renderMap } from "./maps";
import { READY_CARD_PERCENT, READY_EXAMS, READY_EXAM_SCORE, boxCounts, coverage, dueCount, lessonState, nextStep, readPercent, readiness, weakCount } from "./progress";
import { germanSpan, plainText, richNodes } from "./richText";
import { routeHash, type LearnRoute } from "./route";
import { CardSession, LAST_BOX, SECURE_BOX, dayNumber, dueSession } from "./schedule";
import type { Block, Card, Lesson, MapView, MapsFile, StateFacts, TimelineEvent, UnitBlock } from "./types";
import { miniQuestion, renderBlock, renderUnit, revealBox, richParagraph, type LessonTools } from "./views";

/** What the Learn tab needs from the app around it. */
export interface LearnHost
{
    readonly bank: QuestionBank;
    readonly store: Store;
    /** Draws the page again. */
    render(): void;
    /** The text of a question or an option: German, and the translation below it when one is chosen. */
    bilingual(texts: Record<Locale, string>, className?: string): HTMLElement;
    /** The text of a question in every language. */
    questionTexts(question: Question): Record<Locale, string>;
    /** The picture of a question with its credit, or null. */
    picture(question: Question): HTMLElement | null;
    /** The control that shows or hides the translation of the questions. */
    translationControl(id: string): HTMLElement;
    /** Makes the questions of a language available. */
    loadQuestions(locale: Locale): Promise<boolean>;
    /** The numbers of the questions the user has: the general ones and those of the user's state. */
    pool(): Set<number>;
    /** Goes to practice with a round over the given questions, which belong to a lesson. */
    practise(numbers: number[], lessonTitle: string): void;
    /** Goes to practice with a round over every weak spot. */
    practiseWeak(): void;
    /** Goes to the exam. */
    openExam(): void;
    /** Opens the dialog of the page over the tab. */
    showDialog(view: ModalView): void;
    /** Replaces what the open dialog shows, without moving its scroll position. */
    updateDialog(view: ModalView): void;
    /** Closes the dialog. */
    closeDialog(): void;
    /**
     * Makes a place of the tab the address of the page.
     * @param hash The part of the address after the "#" sign, with the sign.
     * @param step Whether this is a step in the history of the browser, so that its Back button leads to the page before.
     */
    visit(hash: string, step: boolean): void;
    /**
     * The whole address of a place of the tab, to pass it on.
     * @param hash The part of the address after the "#" sign, with the sign.
     */
    link(hash: string): string;
}

/** What the tab shows. */
type Page =
    | { name: "home" }
    | { name: "lesson"; id: string }
    | { name: "timeline" }
    | { name: "maps" };


/**
 * Where the window is put after a page was drawn: at its top, at a section, or where the user left it. The last
 * also says what takes the keyboard focus: the heading, an element (the control that led away), or nothing new.
 */
type Arrival =
    | { at: "top" }
    | { at: "section"; name: string }
    | { at: "offset"; y: number; focus: "heading" | "keep" | { id: string } };

/**
 * How a lesson is opened: from the list, where reading goes on at the furthest section it got to ("resume"), as the
 * next page of the course, from its top ("start"), or by its address, as the Back button of the browser does, where
 * the window was when the lesson was left ("return").
 */
type Opening = "resume" | "start" | "return";

/** The review of the cards that are due is a scope of its own; any other scope is the id of a lesson. */
const DUE_SCOPE = "due";

/** The sections every lesson has besides its blocks, by the name they have in an address and in the saved progress. */
const GUESS_SECTION = "guess";
const CARDS_SECTION = "cards";
const CHECK_SECTION = "check";

/** A section is the one being read while its top is at most this far below the top of the window, in pixels. */
const READING_LINE = 120;

/** A section has been seen once its top has come above this share of the height of the window. */
const SEEN_SHARE = 0.8;

/** How long the note that a link was copied stays, in milliseconds. */
const SHARE_NOTE_MS = 2500;

/** What the user did in a lesson since it was opened. It lives as long as the page. */
interface Visit
{
    /** The option chosen as a guess before reading, or null. */
    guess: number | null;
    /** The questions of the lesson as they are shown, so their options keep their order. */
    items: Map<number, PresentedQuestion>;
    /** The answers to the questions of the check. */
    answers: Map<number, number>;
    /** The covered things that were uncovered. */
    open: Set<string>;
}

/** How a map stands: whether its names are covered, which were uncovered, and what is picked. */
interface MapUse
{
    covered: boolean;
    revealed: Set<string>;
    picked: string | null;
}

/** How a timeline stands: whether its dates are covered, and which were uncovered. */
interface ChronoUse
{
    hidden: boolean;
    revealed: Set<string>;
}

/** The maps of the page with all maps, in reading order. */
const ATLAS: MapView[] = ["states", "east", "zones", "neighbours", "parliament"];

/** Number of questions in an exam, for the note on the pass mark. */
const EXAM_SIZE = EXAM_GENERAL_COUNT + EXAM_STATE_COUNT;

/**
 * The Learn tab: lessons that explain what the catalogue asks, flash cards that bring it back after a pause, a
 * timeline and maps. It keeps what is on screen and what the user did there, and draws itself; the app around it
 * owns the saved progress, the question bank, the dialog, the address of the page and the other tabs.
 *
 * Every page of the tab has an address (see route.ts), and the tab remembers where the user was on each page: going
 * back to the list leads to the lesson one came from, and a lesson opens where reading stopped.
 */
export class LearnTab
{
    private readonly loader: LearnLoader;
    private status: "idle" | "loading" | "ready" | "failed" = "idle";
    private page: Page = { name: "home" };
    private readonly visits = new Map<string, Visit>();
    private readonly maps = new Map<string, MapUse>();
    private readonly chronos = new Map<string, ChronoUse>();
    private cached: { key: string; book: CourseBook } | null = null;
    /** A place that is to be shown as soon as the course is there. */
    private pending: LearnRoute | null = null;
    /** Where the window goes after the next draw of a page, or null to leave it where it is. */
    private arrival: Arrival | null = null;
    /**
     * The element that takes the focus after the next draw. A button that uncovers something is gone once it is pressed,
     * and the page is drawn anew: without this the focus would fall back to the top of the page, and a user of the
     * keyboard would have to find the place again.
     */
    private focusAfter: string | null = null;
    /** How far down the window was on each page when the user was there last, by the name of the page. It lives as long as the page. */
    private readonly scrolls = new Map<string, number>();
    /** The run through flash cards that is open in the dialog, or null. */
    private cards: { scope: string; session: CardSession } | null = null;
    /** The address of the link that was just copied, so its button can say so for a moment. */
    private noted: string | null = null;
    /** Handle of the timer that takes that note back, or 0. */
    private noteTimer = 0;
    /** The state a link to the lesson about a state was made for, when it is not the user's own. */
    private linked: string | null = null;
    /** The question whose explanation the dialog shows, or null while it does not. */
    private why: number | null = null;

    /**
     * @param host The app around the tab.
     * @param files Where the files of the course are.
     * @param fetcher How a file is fetched. Replaced in tests.
     */
    public constructor(private readonly host: LearnHost, files: LearnFiles, fetcher?: (address: string) => Promise<Response>)
    {
        this.loader = new LearnLoader(files, fetcher);
    }

    // ----- loading -----

    /**
     * Fetches the course in the language of the site when it is not there, and draws the page when it has arrived.
     * Safe to call at any time: it does nothing while a load runs or when everything is there.
     */
    public ensure(): void
    {
        const locale = i18n.locale;
        if (this.loader.has(locale))
        {
            this.status = this.status === "failed" ? "failed" : "ready";
            return;
        }
        if (this.status === "loading" || this.status === "failed")
        {
            return;
        }
        this.status = "loading";
        void ErrorBoundary.runAsync(async () =>
        {
            await this.loader.load(locale);
            return true;
        }, false, t("learn.loadFailed")).then((loaded) =>
        {
            // The language may have changed while the files were on their way: then the next draw fetches again.
            this.status = loaded ? (this.loader.has(i18n.locale) ? "ready" : "idle") : "failed";
            const left = this.scrolls.get(LearnTab.keyOf(this.page));
            if (left !== undefined && this.arrival === null)
            {
                // The course of another language has arrived: the page is drawn where the user was, and the focus stays on the list of languages.
                this.arrival = { at: "offset", y: left, focus: "keep" };
            }
            this.host.render();
            if (this.why !== null)
            {
                // The explanation that waited for the course.
                this.host.updateDialog(this.whyView());
            }
        });
    }

    /** Tries again after a failed load. */
    private retry(): void
    {
        this.status = "idle";
        this.cached = null;
        this.loader.forget(i18n.locale);
        this.host.render();
    }

    /** The day number of today. */
    private today(): number
    {
        return dayNumber(new Date());
    }

    /**
     * What the lesson about the user's state needs to know about that state.
     * @param stateId State id.
     * @param locale The language of the site.
     */
    private stateFacts(stateId: string, locale: Locale): StateFacts
    {
        const { bank } = this.host;
        const questions = bank.ofState(stateId);
        const of = (task: number): Question | undefined => questions[task - 1];
        return {
            id: stateId,
            name: bank.categoryName(stateId, locale),
            question: (task) => of(task)?.n ?? 0,
            answer: (task) =>
            {
                const question = of(task);
                return question ? question.texts[DEFAULT_LOCALE].a[question.r] : "";
            },
            translation: (task) =>
            {
                const question = of(task);
                if (!question || locale === DEFAULT_LOCALE || !bank.hasQuestions(locale))
                {
                    return undefined;
                }
                const translated = question.texts[locale].a[question.r];
                return translated === question.texts[DEFAULT_LOCALE].a[question.r] ? undefined : translated;
            },
        };
    }

    /** The course in the language of the site and for the user's state, or null while it is not there. */
    private book(): CourseBook | null
    {
        const locale = i18n.locale;
        const file = this.loader.course;
        const texts = this.loader.texts(locale);
        if (!file || !texts)
        {
            return null;
        }
        const stateId = this.host.store.state.state;
        const key = [locale, stateId, this.host.bank.hasQuestions(locale)].join(" ");
        if (this.cached?.key !== key)
        {
            const book = ErrorBoundary.run(() => new CourseBook(file, texts, this.stateFacts(stateId, locale)), null);
            if (!book)
            {
                this.status = "failed";
                return null;
            }
            this.adopt(book);
            this.cached = { key, book };
        }
        return this.cached.book;
    }

    /**
     * Carries what is on screen over to a course that was built anew because the user's state changed: the lesson
     * about the state the user had becomes the lesson about the state the user has now.
     * @param book The new course.
     */
    private adopt(book: CourseBook): void
    {
        const last = this.host.store.state.learn.last;
        if (last !== null && last.startsWith(STATE_LESSON_PREFIX) && book.lesson(last) === undefined)
        {
            // The lesson that was open last was about the state the user had before: going on means the lesson about the new one.
            this.host.store.openLesson(`${STATE_LESSON_PREFIX}${book.stateId}`);
        }
        const page = this.page;
        if (page.name === "lesson" && page.id.startsWith(STATE_LESSON_PREFIX) && book.lesson(page.id) === undefined)
        {
            this.page = { name: "lesson", id: `${STATE_LESSON_PREFIX}${book.stateId}` };
            this.linked = null;
            this.host.visit(this.hash(), false);
        }
    }

    // ----- moving about -----

    /**
     * The name a page is remembered under.
     * @param page The page.
     */
    private static keyOf(page: Page): string
    {
        return page.name === "lesson" ? `lesson/${page.id}` : page.name;
    }

    /**
     * The address of the page that is shown.
     * @returns The part of the address after the "#" sign, with the sign.
     */
    public hash(): string
    {
        const page = this.page;
        return routeHash(page.name === "lesson" ? { page: "lesson", lesson: page.id } : { page: page.name });
    }

    /**
     * The name of the page that is shown, for the title of the page in the browser. It is asked for after the tab was drawn.
     * @returns The title of the lesson, of the timeline or of the maps. Null for the list of lessons and while the
     *          course is not there: the name of the tab says where the user is then.
     */
    public title(): string | null
    {
        const book = this.status === "ready" ? this.book() : null;
        const page = this.page;
        if (!book || page.name === "home")
        {
            return null;
        }
        if (page.name === "lesson")
        {
            return plainText((book.lesson(page.id) as Lesson).title);
        }
        return page.name === "timeline" ? t("learn.timeline.title") : t("learn.maps.title");
    }

    /**
     * Where the window is put when a page is shown.
     * @param page The page.
     * @param from The page the user comes from.
     * @param section A section of a lesson to show, when one was asked for.
     * @param opening How a lesson is opened.
     */
    private arrivalFor(page: Page, from: Page, section?: string, opening: Opening = "resume"): Arrival
    {
        if (section !== undefined)
        {
            return { at: "section", name: section };
        }
        const left = this.scrolls.get(LearnTab.keyOf(page));
        if (page.name === "home")
        {
            // Back at the list: where the user was, with the focus on the lesson that was open.
            return { at: "offset", y: left ?? 0, focus: from.name === "lesson" ? { id: `lesson-${from.id}` } : "heading" };
        }
        // The timeline and the maps open where the window was. A lesson does so only on the way back to it in the history of the
        // browser: the way from a lesson to the list starts at the top of the lesson, so where the window was last says nothing about reading.
        if (left !== undefined && (page.name !== "lesson" || opening === "return"))
        {
            return { at: "offset", y: left, focus: "heading" };
        }
        const seen = page.name === "lesson" && opening !== "start" ? this.host.store.state.learn.seen[page.id] : undefined;
        if (seen && seen.at !== "" && seen.percent < PERCENT)
        {
            // Reading goes on at the furthest section it got to, also after the page was closed. A lesson that was read to its end starts over.
            return { at: "section", name: seen.at };
        }
        return { at: "top" };
    }

    /**
     * Shows another page of the tab, where the user left it or from its top, and makes it the address of the page.
     * @param page The page.
     * @param section A section of a lesson to show.
     * @param opening How a lesson is opened.
     */
    private go(page: Page, section?: string, opening: Opening = "resume"): void
    {
        const from = this.page;
        this.page = page;
        this.linked = null;
        this.arrival = this.arrivalFor(page, from, section, opening);
        this.host.visit(this.hash(), true);
        this.host.render();
    }

    /**
     * What a lesson needs before it is shown: it becomes the lesson that was open last, and the lesson about the
     * user's state gets the questions in the language of the site, because it shows the answers of the catalogue.
     * @param lesson The lesson.
     */
    private prepare(lesson: Lesson): void
    {
        this.host.store.openLesson(lesson.id);
        const locale = i18n.locale;
        if (lesson.blocks.some((block) => block.type === "unit" && block.shown !== undefined) && locale !== DEFAULT_LOCALE && !this.host.bank.hasQuestions(locale))
        {
            void this.host.loadQuestions(locale).then(() => this.host.render());
        }
    }

    /**
     * Opens a lesson.
     * @param lesson The lesson.
     * @param opening Whether reading goes on where it stopped, or starts at the top.
     */
    private openLesson(lesson: Lesson, opening: Opening = "resume"): void
    {
        this.prepare(lesson);
        this.go({ name: "lesson", id: lesson.id }, undefined, opening);
    }

    /**
     * Explains a question in the dialog, from whatever tab: the part of the lesson that teaches it, with a way to the
     * whole lesson. The course is fetched first when it is not there, and the dialog shows that it is on its way.
     * @param questionNumber Question number.
     */
    public explain(questionNumber: number): void
    {
        this.why = questionNumber;
        this.ensure();
        this.host.showDialog(this.whyView());
    }

    /**
     * Asks for the place an address stands for: when the page is opened with it, and when the Back button of the
     * browser leads to it. It is shown with the next draw of the tab, or as soon as the course has arrived.
     * @param route The place.
     */
    public follow(route: LearnRoute): void
    {
        this.pending = route;
    }

    /** Goes back to the top of the list of lessons, when the user presses the tab of the tab that is open. The focus stays on that tab. */
    public home(): void
    {
        this.page = { name: "home" };
        this.pending = null;
        this.linked = null;
        this.arrival = { at: "offset", y: 0, focus: "keep" };
    }

    /** Brings the page of the tab back to where the user left it, when the user comes back to it from a round of practice. */
    public resume(): void
    {
        const left = this.scrolls.get(LearnTab.keyOf(this.page));
        if (left !== undefined)
        {
            this.arrival = { at: "offset", y: left, focus: { id: "lesson-practise" } };
        }
    }

    /** Forgets what was done in the lessons, after the progress was erased. */
    public forget(): void
    {
        this.visits.clear();
        this.scrolls.clear();
        this.page = { name: "home" };
        this.pending = null;
        this.linked = null;
        this.arrival = { at: "offset", y: 0, focus: "keep" };
    }

    /**
     * The lesson an address names. The lesson about a state exists for the user's own state only: a link that was made
     * for another state leads to it, and the lesson says so.
     * @param id The lesson id of the address.
     * @param book The course.
     * @returns The lesson, or undefined when the course has none of that name.
     */
    private lessonOf(id: string, book: CourseBook): Lesson | undefined
    {
        const lesson = book.lesson(id);
        const other = id.slice(STATE_LESSON_PREFIX.length);
        if (lesson || !id.startsWith(STATE_LESSON_PREFIX) || !STATE_IDS.includes(other))
        {
            return lesson;
        }
        this.linked = other;
        return book.lesson(`${STATE_LESSON_PREFIX}${book.stateId}`);
    }

    /**
     * Shows a place that was asked for before the course was there, and puts its address right.
     * @param pending The place.
     * @param book The course.
     */
    private resolve(pending: LearnRoute, book: CourseBook): void
    {
        const from = this.page;
        let page: Page = { name: "home" };
        let section: string | undefined;
        this.linked = null;
        if (pending.page === "lesson")
        {
            const lesson = this.lessonOf(pending.lesson, book);
            if (lesson)
            {
                this.prepare(lesson);
                page = { name: "lesson", id: lesson.id };
                const named = pending.section;
                section = named !== undefined && (lesson.blocks.some((block) => block.id === named) || [GUESS_SECTION, CARDS_SECTION, CHECK_SECTION].includes(named)) ? named : undefined;
            }
        }
        else
        {
            page = { name: pending.page };
        }
        this.page = page;
        this.arrival = this.arrivalFor(page, from, section, "return");
        // The address is put right: it names the page that is shown, and a section only when the lesson has it.
        this.host.visit(page.name === "lesson" && section !== undefined ? routeHash({ page: "lesson", lesson: page.id, section }) : this.hash(), false);
    }

    /**
     * Gives an element the keyboard focus without moving the window.
     * @param element The element, or nothing.
     */
    private static focus(element: HTMLElement | null | undefined): void
    {
        if (element && element.tabIndex < 0)
        {
            // Not a control: it can hold the focus, but it is not a stop of the Tab key.
            element.setAttribute("tabindex", "-1");
        }
        element?.focus({ preventScroll: true });
    }

    /**
     * Called after the page was drawn: puts the window where it was asked for, and the focus with it.
     * @param root The element the page is drawn into.
     */
    public drawn(root: HTMLElement): void
    {
        if (this.focusAfter !== null)
        {
            LearnTab.focus(document.getElementById(this.focusAfter));
            this.focusAfter = null;
        }
        const arrival = this.arrival;
        const stage = root.querySelector<HTMLElement>(`.learn-${this.page.name}`);
        if (arrival === null || stage === null)
        {
            // While the course is on its way there is no page to put the window on: the place is kept for when there is.
            return;
        }
        this.arrival = null;
        const heading = stage.querySelector<HTMLElement>("[data-focus]");
        if (arrival.at === "offset")
        {
            (document.scrollingElement ?? document.documentElement).scrollTop = arrival.y;
            if (arrival.focus !== "keep")
            {
                LearnTab.focus(arrival.focus === "heading" ? heading : document.getElementById(arrival.focus.id) ?? heading);
            }
            return;
        }
        const section = arrival.at === "section" ? Array.from(stage.querySelectorAll<HTMLElement>("[data-anchor]")).find((element) => element.dataset.anchor === arrival.name) : undefined;
        (section ?? document.getElementById("view"))?.scrollIntoView?.({ block: "start" });
        if (section)
        {
            LearnTab.placeAgainWithFonts(section);
        }
        LearnTab.focus(section ?? heading);
    }

    /**
     * Puts a section in place once more when the fonts of the page have arrived. Text above it gets another height with
     * the real fonts and would push it out of place, and the browser does not keep it there. A reader who scrolled in
     * the meantime is left where they are.
     * @param section The section that was put at the top of the window.
     */
    private static placeAgainWithFonts(section: HTMLElement): void
    {
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (!fonts)
        {
            return;
        }
        let scrolled = false;
        const user = (): void =>
        {
            scrolled = true;
        };
        const kinds = ["wheel", "touchstart", "keydown", "pointerdown"];
        kinds.forEach((kind) => window.addEventListener(kind, user, { passive: true }));
        void fonts.ready.then(() =>
        {
            kinds.forEach((kind) => window.removeEventListener(kind, user));
            if (!scrolled && section.isConnected)
            {
                section.scrollIntoView?.({ block: "start" });
            }
        });
    }

    /**
     * Called when the window was scrolled while the tab is shown. Remembers where the user is on the page, and in a
     * lesson how far it was read: the furthest section that reached the top of the window, where reading goes on next
     * time, and the share of the lesson that has come into view. Neither goes back when the user scrolls back up, which
     * everyone does on the way to the list of lessons. Reading alone never marks a lesson as done.
     */
    public scrolled(): void
    {
        const page = this.page;
        const stage = document.querySelector<HTMLElement>(`.learn-${page.name}`);
        const height = document.documentElement.clientHeight;
        if (stage === null || height === 0)
        {
            // The page is not drawn (the course is on its way), or nothing has a size: there is nothing to measure.
            return;
        }
        this.scrolls.set(LearnTab.keyOf(page), window.scrollY);
        if (page.name !== "lesson")
        {
            return;
        }
        const sections = Array.from(stage.querySelectorAll<HTMLElement>("[data-anchor]"));
        const names = sections.map((section) => section.dataset.anchor as string);
        // The furthest section reading got to before, or -1 for none: a section the lesson no longer has counts as none.
        let reached = names.indexOf(this.host.store.state.learn.seen[page.id]?.at ?? "");
        let seen = 0;
        for (const [index, section] of sections.entries())
        {
            const { top } = section.getBoundingClientRect();
            if (top <= READING_LINE)
            {
                reached = Math.max(reached, index);
            }
            if (top < height * SEEN_SHARE)
            {
                seen += 1;
            }
        }
        const end = stage.querySelector<HTMLElement>(".lesson-end");
        const whole = end !== null && end.getBoundingClientRect().top < height;
        // The end of the lesson is one more step than its last section, so a lesson is only read in full when its end was in view.
        this.host.store.seeLesson(page.id, names[reached] ?? "", whole ? PERCENT : Math.floor((seen / (sections.length + 1)) * PERCENT));
    }

    // ----- what a lesson remembers -----

    /**
     * What the user did in a lesson since it was opened.
     * @param lesson The lesson.
     */
    private visit(lesson: Lesson): Visit
    {
        let visit = this.visits.get(lesson.id);
        if (!visit)
        {
            visit = { guess: null, items: new Map(), answers: new Map(), open: new Set() };
            this.visits.set(lesson.id, visit);
        }
        return visit;
    }

    /**
     * A question of a lesson as it is shown. Its options keep their order for as long as the lesson is open.
     * @param visit The visit.
     * @param questionNumber Question number.
     * @returns The question, or undefined when the bank does not have it.
     */
    private item(visit: Visit, questionNumber: number): PresentedQuestion | undefined
    {
        let item = visit.items.get(questionNumber);
        const question = this.host.bank.byNumber(questionNumber);
        if (!item && question)
        {
            item = this.host.bank.present(question);
            visit.items.set(questionNumber, item);
        }
        return item;
    }

    /**
     * The questions of the check of a lesson: its own, and one of an earlier lesson.
     * @param lesson The lesson.
     * @returns The numbers the bank has.
     */
    private checkNumbers(lesson: Lesson): number[]
    {
        return [...lesson.check, ...(lesson.review === null ? [] : [lesson.review])].filter((questionNumber) => this.host.bank.byNumber(questionNumber) !== undefined);
    }

    /**
     * Takes an answer in the check of a lesson. It counts in the progress like any other answer. With the last
     * answer the lesson is finished and its cards go into the first box.
     * @param lesson The lesson.
     * @param questionNumber Question number.
     * @param index The option that was chosen.
     */
    private answerCheck(lesson: Lesson, questionNumber: number, index: number): void
    {
        const visit = this.visit(lesson);
        const item = this.item(visit, questionNumber);
        if (!item || visit.answers.has(questionNumber))
        {
            return;
        }
        visit.answers.set(questionNumber, index);
        // The options are switched off now: the focus stays with the question, where the verdict is.
        this.focusAfter = `check-${questionNumber}`;
        this.host.store.recordAnswer(questionNumber, item.options[index].isCorrect);
        if (this.checkNumbers(lesson).every((entry) => visit.answers.has(entry)))
        {
            this.host.store.finishLesson(lesson.id, lesson.cards.map((card) => card.id), this.today());
        }
        this.host.render();
    }

    /**
     * Marks a lesson as done, or takes the mark back. The mark is the user's own: it is also set when the check of
     * the lesson is finished, and the user can take it back and set it again at any time.
     * @param lesson The lesson.
     * @param done Whether it is done.
     */
    private setDone(lesson: Lesson, done: boolean): void
    {
        if (done)
        {
            this.host.store.finishLesson(lesson.id, lesson.cards.map((card) => card.id), this.today());
        }
        else
        {
            this.host.store.unfinishLesson(lesson.id);
        }
        this.host.render();
    }

    // ----- links -----

    /**
     * Follows a link of the tab inside the page. A press that asks the browser for something else, such as a new tab,
     * is left to the browser: the link has a real address.
     * @param event The click.
     * @param action What following the link does.
     */
    private static onLink(event: Event, action: () => void): void
    {
        const click = event as MouseEvent;
        if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey)
        {
            return;
        }
        event.preventDefault();
        action();
    }

    /**
     * Hands the link of a place to the user: to the share sheet of a phone, or to the clipboard, and then its button
     * says for a moment that the link was copied. Where the page may do neither, the link is shown in the dialog, to
     * be copied by hand.
     * @param route The place.
     * @param title What it is called.
     */
    private share(route: LearnRoute, title: string): void
    {
        const hash = routeHash(route);
        const url = this.host.link(hash);
        void shareLink(title, url).then((outcome) =>
        {
            if (outcome === "unavailable")
            {
                this.host.showDialog({
                    title: t("learn.share.page"),
                    content: el("div", { class: "share-manual" },
                        el("label", { for: "share-url" }, t("learn.share.manual")),
                        el("input", { id: "share-url", class: "share-url", type: "text", readonly: true, dir: "ltr", value: url, onfocus: (event: Event) => (event.target as HTMLInputElement).select() })),
                });
                document.getElementById("share-url")?.focus();
            }
            if (outcome !== "copied")
            {
                return;
            }
            window.clearTimeout(this.noteTimer);
            this.noted = hash;
            this.noteTimer = window.setTimeout(() =>
            {
                this.noted = null;
                this.host.render();
            }, SHARE_NOTE_MS);
            this.host.render();
        });
    }

    /**
     * The small link next to the heading of a section: it leads to the section, and a press hands its address over.
     * It shows when the pointer is over the heading or the keyboard is on it, and on a touch screen always.
     * @param route The section.
     * @param title What the section is called.
     */
    private sectionLink(route: Extract<LearnRoute, { page: "lesson" }>, title: string): HTMLElement
    {
        const hash = routeHash(route);
        const copied = this.noted === hash;
        const label = copied ? t("learn.share.copied") : t("learn.share.section", { title });
        return el("a", {
            id: `link-${route.section ?? ""}`,
            class: copied ? "section-link is-noted" : "section-link",
            href: hash,
            title: label,
            "aria-label": label,
            onclick: (event: Event) => LearnTab.onLink(event, () => this.share(route, title)),
        }, icon(copied ? "check" : "link"));
    }

    /**
     * The button that hands the address of the page over.
     * @param route The page.
     * @param title What it is called.
     */
    private shareButton(route: LearnRoute, title: string): HTMLElement
    {
        const copied = this.noted === routeHash(route);
        return el("button", { id: "learn-share", class: "secondary sm share-button", type: "button", onclick: () => this.share(route, title) },
            icon(copied ? "check" : "share"),
            el("span", { class: "swap-box", role: "status" }, ...twoStepLabel(t("learn.share.page"), t("learn.share.copied"), copied)));
    }

    // ----- flash cards -----

    /**
     * Starts a run through cards in the dialog of the page: those that are due, or those of a lesson. The page below
     * stays where it is.
     * @param scope "due" or a lesson id.
     * @param book The course.
     */
    private startCards(scope: string, book: CourseBook): void
    {
        const cards = scope === DUE_SCOPE ? dueSession(book.cards, this.host.store.state.learn.cards, this.today()).cards : (book.lesson(scope) as Lesson).cards;
        const open = this.cards !== null;
        this.cards = { scope, session: new CardSession(cards) };
        if (open)
        {
            // The next round of a review goes on in the dialog that is open.
            this.drawCards(book, "flash-answer-show");
        }
        else
        {
            this.host.showDialog(this.cardsView(book));
        }
    }

    /**
     * Draws the run through cards again after a step.
     * @param book The course.
     * @param focus Id of the control that takes the keyboard focus.
     */
    private drawCards(book: CourseBook, focus: string): void
    {
        this.host.updateDialog(this.cardsView(book));
        document.getElementById(focus)?.focus();
    }

    /**
     * Shows the answer of the card that is up.
     * @param session The run through the cards.
     * @param book The course.
     */
    private revealCard(session: CardSession, book: CourseBook): void
    {
        if (session.current && !session.revealed)
        {
            session.reveal();
            this.drawCards(book, "flash-known");
        }
    }

    /**
     * Takes the answer to the card that is up. Only the first answer to a card in a run moves it between the boxes.
     * @param session The run through the cards.
     * @param known Whether the user knew it.
     * @param book The course.
     */
    private rateCard(session: CardSession, known: boolean, book: CourseBook): void
    {
        const rated = session.rate(known);
        if (rated)
        {
            if (rated.first)
            {
                this.host.store.gradeCard(rated.card.id, known, this.today());
            }
            this.drawCards(book, session.current ? "flash-answer-show" : "flash-leave");
        }
    }

    /**
     * The keys of the flash cards: Space or Enter shows the answer, 1 says "not yet", 2 says "got it".
     * @param key The key, in lower case.
     * @param onButton Whether the key was pressed on a button, which Enter and Space then press.
     * @returns Whether the key was used.
     */
    public handleKey(key: string, onButton: boolean): boolean
    {
        const session = this.cards?.session;
        const book = this.cached?.book;
        if (!session?.current || !book)
        {
            return false;
        }
        if ((key === " " || key === "enter") && !session.revealed && !onButton)
        {
            this.revealCard(session, book);
            return true;
        }
        if ((key === "1" || key === "2") && session.revealed)
        {
            this.rateCard(session, key === "2", book);
            return true;
        }
        return false;
    }

    // ----- drawing -----

    /**
     * What the pieces of a lesson need from the app.
     * @param book The course.
     * @param lesson The lesson.
     */
    private tools(book: CourseBook, lesson: Lesson): LessonTools
    {
        const { host } = this;
        return {
            bilingual: (texts, className) => host.bilingual(texts, className),
            picture: (question) => host.picture(question),
            question: (questionNumber) => host.bank.byNumber(questionNumber),
            questionTexts: (question) => host.questionTexts(question),
            eras: book.eras,
            link: (section, title) => this.sectionLink({ page: "lesson", lesson: lesson.id, section }, title),
        };
    }

    /**
     * The column of the tab.
     * @returns The section for the page that is shown.
     */
    public render(): HTMLElement
    {
        this.ensure();
        const book = this.status === "ready" ? this.book() : null;
        if (!book)
        {
            return el("section", { class: "stage learn" }, this.status === "failed" ? this.renderFailed() : this.renderLoading());
        }
        if (this.pending !== null)
        {
            const pending = this.pending;
            this.pending = null;
            this.resolve(pending, book);
        }
        const page = this.page;
        let content: Child[];
        if (page.name === "lesson")
        {
            content = this.renderLesson(book.lesson(page.id) as Lesson, book);
        }
        else if (page.name === "timeline")
        {
            content = this.renderTimelinePage(book);
        }
        else if (page.name === "maps")
        {
            content = this.renderMapsPage(book);
        }
        else
        {
            content = this.renderHome(book);
        }
        return el("section", { class: `stage learn learn-${page.name}` }, ...content);
    }

    /** The place of the course while it is on its way. It has the height of the first card of the tab, so little moves when the course arrives. */
    private renderLoading(): HTMLElement
    {
        return el("article", { class: "card learn-wait", "aria-busy": "true" }, el("h2", { "data-focus": true }, t("learn.home.title")), el("p", { role: "status" }, t("learn.loading")));
    }

    /** What is shown when the course could not be fetched. */
    private renderFailed(): HTMLElement
    {
        return el("article", { class: "card learn-wait" },
            el("h2", { "data-focus": true }, t("learn.home.title")),
            el("p", { role: "alert" }, t("learn.loadFailed")),
            el("button", { id: "learn-retry", class: "primary", type: "button", onclick: () => this.retry() }, t("learn.retry")));
    }

    /**
     * The line at the top of a page inside the tab: the way back to the list of lessons, and where the user is.
     * @param label Where the user is.
     */
    private renderBar(label: string): HTMLElement
    {
        return el("nav", { class: "learn-bar", "aria-label": t("learn.bar") },
            el("a", {
                id: "learn-back",
                class: "secondary sm",
                href: routeHash({ page: "home" }),
                onclick: (event: Event) => LearnTab.onLink(event, () => this.go({ name: "home" })),
            }, icon("arrowBack"), el("span", {}, t("learn.back"))),
            el("span", { class: "learn-crumb" }, ...richNodes(label)));
    }

    /**
     * The tag that says how a lesson stands: new, how much of it was read, done, or secure. Every lesson has one, so
     * a row of the list keeps its height when the lesson is ticked off.
     * @param lesson The lesson.
     * @param learn The saved progress.
     */
    private stateTag(lesson: Lesson, learn: LearnProgress): HTMLElement
    {
        const state = lessonState(lesson, learn);
        const labels = {
            new: () => t("learn.state.new"),
            started: () => t("learn.state.started", { percent: readPercent(lesson, learn) }),
            read: () => t("learn.state.read"),
            secure: () => t("learn.state.secure"),
        };
        return el("span", { class: `tag lesson-state is-${state}` }, state === "new" || state === "started" ? icon("circle") : icon("check"), el("span", {}, labels[state]()));
    }

    /**
     * The tick that marks a lesson as done. It is a plain checkbox: it shows how the lesson stands, and it is set
     * and taken back with one press.
     * @param id Id of the checkbox.
     * @param lesson The lesson.
     * @param learn The saved progress.
     * @param label Its accessible name, when it has no text next to it.
     */
    private doneBox(id: string, lesson: Lesson, learn: LearnProgress, label?: string): HTMLElement
    {
        const done = learn.read[lesson.id] !== undefined;
        return el("input", {
            id,
            class: "done-box",
            type: "checkbox",
            checked: done,
            ...(label === undefined ? {} : { "aria-label": label }),
            onchange: () => this.setDone(lesson, !done),
        });
    }

    /**
     * The list of lessons, with what to do next and how far the user is.
     * @param book The course.
     */
    private renderHome(book: CourseBook): Child[]
    {
        const { store } = this.host;
        const { learn, records, exams } = store.state;
        const lessons = book.lessons;
        const cards = book.cards;
        const pool = this.host.pool();
        const weak = store.weakNumbersIn((questionNumber) => pool.has(questionNumber)).length;
        const done = coverage(lessons, learn);
        const step = nextStep(lessons, cards, learn, weak, this.today());
        const actions = {
            cards: () => this.startCards(DUE_SCOPE, book),
            lesson: () => (step.kind === "lesson" ? this.openLesson(step.lesson) : undefined),
            weak: () => this.host.practiseWeak(),
            exam: () => this.host.openExam(),
        };
        const labels = {
            cards: () => (step.kind === "cards" ? i18n.plural("learn.next.cards", step.count) : ""),
            lesson: () => (step.kind === "lesson" ? t(step.resume ? "learn.next.resume" : "learn.next.start", { title: plainText(step.lesson.title) }) : ""),
            weak: () => (step.kind === "weak" ? i18n.plural("learn.next.weak", step.count) : ""),
            exam: () => t("learn.next.exam"),
        };
        const hints = { cards: t("learn.next.cardsHint"), lesson: t("learn.next.lessonHint"), weak: t("learn.next.weakHint"), exam: t("learn.next.examHint") };
        const ready = readiness(lessons, cards, learn, exams);
        const row = (met: boolean, text: string): HTMLElement => el("li", { class: met ? "is-met" : "" },
            met ? icon("check") : icon("circle"), el("span", { class: "visually-hidden" }, met ? t("learn.ready.met") : t("learn.ready.open")), el("span", {}, text));

        return [
            el("article", { class: "card learn-top" },
                el("h2", { "data-focus": true }, t("learn.home.title")),
                el("p", { class: "learn-intro" }, t("learn.home.intro")),
                el("p", { class: "learn-coverage" }, t("learn.home.coverage", { read: done.read, lessons: done.lessons, questions: done.questions, total: pool.size })),
                el("div", { class: "learn-next" },
                    el("span", { class: "round-label" }, t("learn.next.title")),
                    // The button has room for two lines whatever it says, so ticking a lesson off, which changes the next step, moves nothing below it.
                    el("button", { id: "learn-next", class: "primary", type: "button", onclick: () => actions[step.kind]() }, clampedText(labels[step.kind]())),
                    el("p", { class: "hint" }, hints[step.kind])),
                el("div", { class: "learn-refs" },
                    el("button", { id: "learn-timeline", class: "secondary", type: "button", onclick: () => this.go({ name: "timeline" }) }, icon("clock"), el("span", {}, t("learn.refs.timeline"))),
                    el("button", { id: "learn-maps", class: "secondary", type: "button", onclick: () => this.go({ name: "maps" }) }, icon("map"), el("span", {}, t("learn.refs.maps"))))),
            ...book.chapters.map((chapter, index) => el("section", { class: "learn-chapter", "aria-labelledby": `chapter-${chapter.id}` },
                el("h3", { id: `chapter-${chapter.id}`, class: "learn-chapter-title" }, t("learn.chapter.heading", { number: index + 1, title: plainText(chapter.title) })),
                el("p", { class: "hint" }, ...richNodes(chapter.intro)),
                el("ol", { class: "lesson-list" }, ...chapter.lessons.map((lesson) =>
                {
                    const weakHere = weakCount(lesson, records);
                    // The tick stands next to the link, not inside it: a control inside a link could not be pressed on its own.
                    return el("li", { class: "lesson-item" },
                        el("label", { class: "lesson-tick" }, this.doneBox(`done-${lesson.id}`, lesson, learn, t("learn.done.row", { title: plainText(lesson.title) }))),
                        el("a", {
                            id: `lesson-${lesson.id}`,
                            class: "lesson-row",
                            href: routeHash({ page: "lesson", lesson: lesson.id }),
                            onclick: (event: Event) => LearnTab.onLink(event, () => this.openLesson(lesson)),
                        },
                            el("span", { class: "lesson-title" }, ...richNodes(lesson.title)),
                            el("span", { class: "lesson-meta" }, t("learn.lesson.meta", { minutes: lesson.minutes, questions: i18n.plural("panel.questions", lesson.questions.length) })),
                            el("span", { class: "lesson-tags" },
                                this.stateTag(lesson, learn),
                                weakHere > 0 ? el("span", { class: "tag lesson-weak" }, i18n.plural("learn.lesson.weak", weakHere)) : null)));
                })))),
            el("article", { class: "card learn-ready" },
                el("h3", { class: "block-title" }, t("learn.ready.title")),
                el("ul", { class: "ready-list" },
                    row(ready.lessons.met, t("learn.ready.lessons", { done: ready.lessons.done, total: ready.lessons.total })),
                    row(ready.cards.met, t("learn.ready.cards", { percent: ready.cards.percent, box: SECURE_BOX, needed: READY_CARD_PERCENT })),
                    row(ready.exams.met, t("learn.ready.exams", { done: ready.exams.done, needed: READY_EXAMS, score: READY_EXAM_SCORE, total: EXAM_SIZE }))),
                el("p", { class: ready.ready ? "ready-verdict ok" : "ready-verdict" }, ready.ready ? t("learn.ready.yes") : t("learn.ready.note", { pass: EXAM_PASS_MARK, total: EXAM_SIZE }))),
        ];
    }

    /**
     * A timeline with the button that covers its dates.
     * @param id Id of the timeline, unique on the page.
     * @param events The events it shows.
     * @param book The course.
     * @param owner The lesson it is part of, or nothing on the page of the whole timeline. What is covered is remembered per lesson.
     */
    private chronoBox(id: string, events: readonly TimelineEvent[], book: CourseBook, owner = ""): HTMLElement
    {
        const key = `${owner}/${id}`;
        let use = this.chronos.get(key);
        if (!use)
        {
            use = { hidden: false, revealed: new Set() };
            this.chronos.set(key, use);
        }
        const state = use;
        return el("div", { id, class: "chrono-box" },
            el("div", { class: "map-tools" },
                el("button", {
                    id: `${id}-cover`,
                    class: "secondary sm chip-button",
                    type: "button",
                    "aria-pressed": String(state.hidden),
                    onclick: () =>
                    {
                        state.hidden = !state.hidden;
                        state.revealed.clear();
                        this.host.render();
                    },
                }, t("learn.timeline.hide")),
                el("p", { class: "hint" }, ...twoStepLabel(t("learn.timeline.hint"), t("learn.timeline.hideHint"), state.hidden))),
            renderChronology(events, book.eras, {
                id,
                hidden: state.hidden,
                revealed: state.revealed,
                onReveal: (eventId) =>
                {
                    state.revealed.add(eventId);
                    this.focusAfter = `${id}-${eventId}`;
                    this.host.render();
                },
            }));
    }

    /**
     * A map with its list.
     * @param id Id of the map, unique on the page.
     * @param view Which map.
     * @param label What the map shows.
     * @param book The course.
     * @param owner The lesson it is part of, or nothing on the page of all maps. What is covered and picked is remembered per lesson.
     */
    private mapBox(id: string, view: MapView, label: string, book: CourseBook, owner = ""): HTMLElement
    {
        const key = `${owner}/${id}`;
        let use = this.maps.get(key);
        if (!use)
        {
            use = { covered: false, revealed: new Set(), picked: null };
            this.maps.set(key, use);
        }
        const state = use;
        // The maps are loaded together with the course, so they are there whenever a course is drawn.
        const data = this.loader.maps as MapsFile;
        const { bank, store } = this.host;
        const model = mapModel(view, data, { state: (stateId) => bank.categoryName(stateId, i18n.locale), place: (placeId) => book.place(placeId) }, store.state.state);
        return renderMap(model, {
            id,
            label,
            covered: state.covered,
            revealed: state.revealed,
            picked: state.picked,
            onPick: (entryId) =>
            {
                state.picked = state.picked === entryId && !state.covered ? null : entryId;
                state.revealed.add(entryId);
                this.host.render();
            },
            onCover: (covered) =>
            {
                state.covered = covered;
                state.revealed.clear();
                state.picked = null;
                this.host.render();
            },
        });
    }

    /**
     * A lesson: the guess before reading, the big picture, the units with their pictures, the cards and the check.
     * @param lesson The lesson.
     * @param book The course.
     */
    private renderLesson(lesson: Lesson, book: CourseBook): Child[]
    {
        const { store } = this.host;
        const visit = this.visit(lesson);
        const tools = this.tools(book, lesson);
        const chapter = book.chapterOf(lesson);
        const { learn } = store.state;
        const route: Extract<LearnRoute, { page: "lesson" }> = { page: "lesson", lesson: lesson.id };
        const title = plainText(lesson.title);
        const linked = this.linked;
        const guessItem = this.item(visit, lesson.pre);
        const checks = this.checkNumbers(lesson);
        const finished = checks.length > 0 && checks.every((questionNumber) => visit.answers.has(questionNumber));
        const right = checks.filter((questionNumber) => this.item(visit, questionNumber)?.options[visit.answers.get(questionNumber) ?? -1]?.isCorrect === true).length;
        const previous = book.neighbour(lesson, -1);
        const next = book.neighbour(lesson, 1);

        const blocks = lesson.blocks.map((block: Block) => renderBlock(block, tools, {
            timeline: (entry) => this.chronoBox(`tl-${entry.id}`, book.events.filter((event) => entry.events.includes(event.id)), book, lesson.id),
            map: (entry) => this.mapBox(`map-${entry.id}`, entry.map, plainText(entry.caption), book, lesson.id),
            isOpen: (id) => visit.open.has(id),
            open: (id) =>
            {
                visit.open.add(id);
                this.focusAfter = id;
                this.host.render();
            },
        }));

        const check = checks.map((questionNumber) =>
        {
            const item = this.item(visit, questionNumber) as PresentedQuestion;
            const selected = visit.answers.get(questionNumber) ?? null;
            const correct = selected !== null && item.options[selected].isCorrect;
            const guessed = questionNumber === lesson.pre && visit.guess !== null;
            // What is said about the guess depends on both: whether the guess was right, and whether the answer is.
            const guessRight = guessed && item.options[visit.guess as number].isCorrect;
            const afterRight = guessRight ? t("learn.check.guessRight") : t("learn.check.guessWrong");
            const afterWrong = guessRight ? t("learn.check.guessOnlyRight") : t("learn.check.guessAlsoWrong");
            const guessNote = guessed ? (correct ? afterRight : afterWrong) : "";
            const verdict = selected === null ? "" : (correct ? t("card.verdictRight") : t("card.verdictWrong"));
            return miniQuestion({
                id: `check-${questionNumber}`,
                item,
                selected,
                reveal: true,
                open: selected === null,
                note: selected !== null && guessNote ? t("learn.check.withGuess", { verdict, guess: guessNote }) : verdict,
                tags: questionNumber === lesson.review ? [el("span", { class: "tag" }, t("learn.check.review"))] : [],
                onChoose: (index) => this.answerCheck(lesson, questionNumber, index),
            }, tools);
        });

        return [
            this.renderBar(chapter.title),
            el("article", { class: "card lesson-head" },
                el("div", { class: "lesson-top" }, el("h2", { "data-focus": true }, ...richNodes(lesson.title)), this.shareButton(route, title)),
                el("p", { class: "lesson-meta" },
                    el("span", {}, t("learn.lesson.meta", { minutes: lesson.minutes, questions: i18n.plural("panel.questions", lesson.questions.length) })),
                    this.stateTag(lesson, learn)),
                el("p", { class: "lesson-big" }, ...richNodes(lesson.big)),
                linked === null
                    ? null
                    : el("p", { class: "hint lesson-linked" }, t("learn.state.other", { linked: this.host.bank.categoryName(linked, i18n.locale), state: this.host.bank.categoryName(book.stateId, i18n.locale) }))),
            guessItem
                ? el("section", { class: "card lesson-pre", "aria-labelledby": "pre-title", "data-anchor": GUESS_SECTION },
                    el("h3", { id: "pre-title", class: "block-title" }, t("learn.pre.title")),
                    el("p", { class: "hint" }, t("learn.pre.hint")),
                    miniQuestion({
                        id: "guess",
                        item: guessItem,
                        selected: visit.guess,
                        reveal: false,
                        // Once the question was answered in the check, the guess is history.
                        open: !visit.answers.has(lesson.pre),
                        note: visit.guess === null ? t("learn.pre.waiting") : t("learn.pre.saved"),
                        onChoose: (index) =>
                        {
                            visit.guess = index;
                            this.host.render();
                        },
                    }, tools))
                : null,
            el("article", { class: "card lesson-body" }, ...blocks),
            el("section", { class: "card lesson-cards", "aria-labelledby": "cards-title", "data-anchor": CARDS_SECTION },
                el("h3", { id: "cards-title", class: "block-title" }, t("learn.cards.title")),
                el("p", {}, t("learn.cards.lessonHint")),
                el("button", { id: "lesson-cards", class: "secondary", type: "button", disabled: lesson.cards.length === 0, onclick: () => this.startCards(lesson.id, book) },
                    icon("cards"), el("span", {}, i18n.plural("learn.cards.start", lesson.cards.length)))),
            el("section", { class: "card lesson-check", "aria-labelledby": "check-title", "data-anchor": CHECK_SECTION },
                el("h3", { id: "check-title", class: "block-title" }, el("span", {}, t("learn.check.title")), this.sectionLink({ ...route, section: CHECK_SECTION }, t("learn.check.title"))),
                el("p", { class: "hint" }, t("learn.check.hint")),
                el("div", { class: "card-tools" }, this.host.translationControl("translation")),
                ...check,
                el("p", { class: finished ? "check-result ok" : "check-result", role: "status" },
                    finished ? t("learn.check.done", { right, total: checks.length }) : t("learn.check.open"))),
            el("div", { class: "lesson-end" },
                el("div", { class: "card lesson-done" },
                    el("label", { class: "done-label" }, this.doneBox("lesson-done", lesson, learn), el("span", {}, t("learn.done.mark"))),
                    el("p", { class: "hint" }, t("learn.done.hint"))),
                el("button", { id: "lesson-practise", class: "primary", type: "button", onclick: () => this.host.practise(lesson.questions, title) },
                    i18n.plural("learn.lesson.practise", lesson.questions.length)),
                el("div", { class: "footer-row" },
                    el("button", { id: "lesson-previous", class: "secondary", type: "button", disabled: !previous, onclick: () => (previous ? this.openLesson(previous, "start") : undefined) },
                        icon("arrowBack"), el("span", {}, t("learn.lesson.previous"))),
                    el("button", { id: "lesson-next", class: "secondary", type: "button", disabled: !next, onclick: () => (next ? this.openLesson(next, "start") : undefined) },
                        el("span", {}, t("learn.lesson.next")), icon("arrowForward")))),
        ];
    }

    /**
     * The back of a flash card: the answer in German, the answer in the language of the site, an anchor, and where the catalogue asks for it.
     * @param card The card.
     * @param book The course.
     */
    private cardBack(card: Card, book: CourseBook): Child[]
    {
        const era = book.eras.find((entry) => entry.id === card.era);
        return [
            card.german ? el("p", { class: "flash-german" }, germanSpan(card.german, "flash-de")) : null,
            card.back ? richParagraph(card.back, "flash-back") : null,
            card.note ? richParagraph(card.note, "flash-note") : null,
            el("p", { class: "flash-source" },
                era ? el("span", { class: `era-chip era-${era.id}` }, el("span", { class: "era-swatch", "aria-hidden": "true" }), germanSpan(era.term, "era-name")) : null,
                el("span", { class: "hint" }, t("learn.cards.asked", { questions: card.questions.map((questionNumber) => questionName(questionNumber)).join(", ") }))),
        ];
    }

    /**
     * The explanation of a question, for the dialog: the unit of the lesson that teaches it, and a link to the whole
     * lesson at that unit. While the course is on its way the dialog says so. It has one size, so its frame does not
     * move when the explanation arrives.
     */
    private whyView(): ModalView
    {
        const questionNumber = this.why as number;
        const book = this.status === "ready" ? this.book() : null;
        const view = (...children: Child[]): ModalView => ({
            title: t("learn.why.title", { n: questionName(questionNumber) }),
            content: el("div", { class: "why" }, ...children),
            className: "modal-fixed modal-why",
            onClose: () =>
            {
                this.why = null;
            },
        });
        if (!book)
        {
            return this.status === "failed"
                ? view(el("p", { role: "alert" }, t("learn.loadFailed")),
                    el("button", { id: "why-retry", class: "primary", type: "button", onclick: () => this.retryWhy() }, t("learn.retry")))
                : view(el("p", { class: "why-wait", role: "status", "aria-busy": "true" }, t("learn.loading")));
        }
        const place = book.placeOf(questionNumber);
        if (!place)
        {
            return view(el("p", {}, t("learn.why.none")));
        }
        const unit = place.lesson.blocks.find((block) => block.id === place.unit) as UnitBlock;
        // The unit is shown on its own here: the link next to its heading belongs to the page of the lesson.
        const tools: LessonTools = { ...this.tools(book, place.lesson), link: () => null };
        return view(
            el("p", { class: "hint why-from" }, t("learn.why.from", { title: plainText(place.lesson.title) })),
            renderUnit(unit, tools),
            el("div", { class: "footer-row" },
                // A plain link: the address leads to the lesson, so it also opens in a new tab of the browser.
                el("a", { id: "why-lesson", class: "secondary", href: routeHash({ page: "lesson", lesson: place.lesson.id, section: place.unit }) }, icon("book"), el("span", {}, t("learn.why.open"))),
                el("button", { id: "why-close", class: "primary", type: "button", onclick: () => this.host.closeDialog() }, t("modal.close"))));
    }

    /** Fetches the course again for the explanation in the dialog, after the first try failed. */
    private retryWhy(): void
    {
        this.status = "idle";
        this.cached = null;
        this.loader.forget(i18n.locale);
        this.ensure();
        this.host.updateDialog(this.whyView());
    }

    /**
     * The flash cards, for the dialog of the page: one card at a time, its answer covered until asked for, and two
     * buttons to say how it went. The dialog has one size, so nothing moves from card to card.
     * @param book The course.
     */
    private cardsView(book: CourseBook): ModalView
    {
        const { scope, session } = this.cards as { scope: string; session: CardSession };
        const lesson = scope === DUE_SCOPE ? undefined : book.lesson(scope);
        const card = session.current;
        const view = (content: HTMLElement): ModalView => ({
            title: lesson ? t("learn.cards.ofLesson", { title: plainText(lesson.title) }) : t("learn.cards.review"),
            content,
            className: "modal-fixed modal-cards",
            onClose: () =>
            {
                // The page below shows the boxes and what is due: it is drawn again with what the run changed.
                this.cards = null;
                this.host.render();
            },
        });
        if (!card)
        {
            const left = scope === DUE_SCOPE ? dueCount(book.cards, this.host.store.state.learn, this.today()) : 0;
            return view(el("div", { class: "flash-end" },
                el("h3", { class: "block-title" }, t("learn.cards.done.title")),
                el("p", {}, t("learn.cards.done.text", { total: session.total, again: session.again })),
                el("p", { class: "hint" }, lesson ? t("learn.cards.done.lesson") : (left > 0 ? i18n.plural("learn.cards.done.more", left) : t("learn.cards.done.all"))),
                el("div", { class: "footer-row" },
                    left > 0 ? el("button", { id: "flash-more", class: "primary", type: "button", onclick: () => this.startCards(DUE_SCOPE, book) }, t("learn.cards.next")) : null,
                    el("button", { id: "flash-leave", class: left > 0 ? "secondary" : "primary", type: "button", onclick: () => this.host.closeDialog() }, t("modal.close")))));
        }
        const state = this.host.store.state.learn.cards[card.id];
        const from = book.lesson(card.lesson);
        return view(el("div", { id: "flashcard", class: "flashcard" },
            el("p", { class: "flash-meta" },
                el("span", {}, i18n.plural("learn.cards.left", session.remaining)),
                el("span", { class: "tag" }, state ? t("learn.cards.box", { box: state.box, last: LAST_BOX }) : t("learn.cards.newCard"))),
            el("p", { class: "flash-lesson" }, ...richNodes(from?.title ?? "")),
            el("h3", { class: "flash-front" }, ...richNodes(card.front)),
            revealBox("flash-answer", this.cardBack(card, book), session.revealed, () => this.revealCard(session, book)),
            el("div", { class: "footer-row flash-actions" },
                el("button", { id: "flash-again", class: "secondary", type: "button", disabled: !session.revealed, onclick: () => this.rateCard(session, false, book) }, t("learn.cards.again")),
                el("button", { id: "flash-known", class: "primary", type: "button", disabled: !session.revealed, onclick: () => this.rateCard(session, true, book) }, t("learn.cards.known"))),
            el("p", { class: "hint flash-keys" }, t("learn.cards.keys"))));
    }

    /**
     * The whole timeline.
     * @param book The course.
     */
    private renderTimelinePage(book: CourseBook): Child[]
    {
        return [
            this.renderBar(t("learn.refs.timeline")),
            el("article", { class: "card" },
                el("div", { class: "lesson-top" }, el("h2", { "data-focus": true }, t("learn.timeline.title")), this.shareButton({ page: "timeline" }, t("learn.timeline.title"))),
                el("p", {}, t("learn.timeline.intro")),
                renderEraLegend(book.eras),
                this.chronoBox("timeline", book.events, book)),
        ];
    }

    /**
     * Every map of the course.
     * @param book The course.
     */
    private renderMapsPage(book: CourseBook): Child[]
    {
        const titles: Record<string, string> = {
            states: t("learn.maps.states"),
            east: t("learn.maps.east"),
            zones: t("learn.maps.zones"),
            neighbours: t("learn.maps.neighbours"),
            parliament: t("learn.maps.parliament"),
        };
        return [
            this.renderBar(t("learn.refs.maps")),
            el("article", { class: "card" },
                el("div", { class: "lesson-top" }, el("h2", { "data-focus": true }, t("learn.maps.title")), this.shareButton({ page: "maps" }, t("learn.maps.title"))),
                el("p", {}, t("learn.maps.intro"))),
            ...ATLAS.map((view) => el("article", { class: "card atlas-map" },
                el("h3", { class: "block-title" }, titles[view]),
                this.mapBox(`atlas-${view}`, view, titles[view], book))),
        ];
    }

    /**
     * The widget of the tab in the column at the side: how far the user is, and the way to the cards that are due.
     * @returns The widget, or null while the course is not there.
     */
    public renderWidget(): HTMLElement | null
    {
        const book = this.status === "ready" ? this.book() : null;
        if (!book)
        {
            return null;
        }
        const { learn } = this.host.store.state;
        const done = coverage(book.lessons, learn);
        const due = dueCount(book.cards, learn, this.today());
        const counts = boxCounts(book.cards, learn);
        const rows: [string, string][] = [
            [t("learn.widget.lessons"), t("learn.widget.of", { done: done.read, total: done.lessons })],
            [t("learn.widget.due"), i18n.number(due)],
        ];
        return el("aside", { class: "widget learn-widget", "aria-label": t("learn.widget.title") },
            el("h2", {}, t("learn.widget.title")),
            el("dl", {}, ...rows.flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value)])),
            el("p", { class: "hint" }, t("learn.widget.boxes")),
            el("ol", { class: "box-row" }, ...counts.boxes.map((count, index) => el("li", { title: t("learn.cards.box", { box: index + 1, last: LAST_BOX }) },
                el("span", { class: "box-no" }, i18n.number(index + 1)), el("strong", {}, i18n.number(count))))),
            el("button", { id: "learn-review", class: "secondary sm", type: "button", disabled: due === 0, onclick: () => this.startCards(DUE_SCOPE, book) }, t("learn.widget.review")));
    }
}
