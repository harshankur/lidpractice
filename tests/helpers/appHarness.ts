import { existsSync, readFileSync } from "node:fs";
import { vi } from "vitest";
import type * as AppModule from "../../src/app";
import { CONFIRM_GUARD_MS } from "../../src/constants";
import states from "../../data/states.json";
import type { Locale, TranslationChoice } from "../../src/types";

import { REAL_BUNDLE, REAL_FLAT, toBundle, type FlatQuestion } from "./questionData";

export { REAL_BUNDLE };

/** The federal states in the order of the catalogue. */
const STATES: { id: string; code: string }[] = states;

/** Everything exported by src/app.ts. */
export type AppExports = typeof AppModule;

/** A question with German and English text side by side. */
export type Question = FlatQuestion;

/** The real, embedded question bank. */
export const REAL_QUESTIONS: Question[] = REAL_FLAT;

/** Markup the build produces around the app, reduced to what the app needs. */
const FIXTURE_HTML = `<div id="app"></div><div id="modal-root"></div><div id="toast" role="alert" hidden></div>`
    + `<script type="application/json" id="question-data"></script>`
    + `<script type="application/json" id="language-files"></script>`
    + `<script type="application/json" id="image-sizes">{"images/q-021.webp":[1208,379],"catalogue/q-001.webp":[1064,277]}</script>`;

/** A response of the stand-in for the server: only what the app reads. */
interface FakeResponse
{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

/**
 * Lets everything that waits for a fetched file finish. Only microtasks are used, so it also works with fake timers.
 */
export async function settle(): Promise<void>
{
    for (let step = 0; step < SETTLE_STEPS; step++)
    {
        await Promise.resolve();
    }
}

/** How many microtask turns the stand-in for the server needs to hand a file over and the app to finish with it. */
const SETTLE_STEPS = 60;

/** The addresses the page asked the server for since the last mount, in order. */
export const requests: string[] = [];

/** How the stand-in for the server misbehaves, or null while it works. */
let fault: "missing" | "offline" | "wrong" | null = null;

/**
 * Makes the stand-in for the server fail from now on.
 * @param kind "missing": every file is not found. "offline": the request fails. "wrong": a file is not the file that was asked for.
 */
export function breakServer(kind: "missing" | "offline" | "wrong" | null): void
{
    fault = kind;
}

/** Files of the Learn tab that a test serves in place of the real ones, by their path under data/ ("teach/course.json", "teach/locales/teach.en.json"). */
const courseFiles: Record<string, unknown> = {};

/**
 * Serves a file of the Learn tab from the test instead of from data/teach, until the next mount. The tab fetches its
 * files when it is opened, so a test calls this after mounting and before it opens the tab.
 * @param path Path under data/, for example "teach/course.json" or "teach/locales/teach.en.json".
 * @param body What the server answers with.
 */
export function serveCourseFile(path: string, body: unknown): void
{
    courseFiles[path] = body;
}

/**
 * Stands in for the server of the built page: it hands out the files of the languages that the page does not hold, from the
 * data of the test, and the files of the Learn tab.
 * @param bundle The question bank the page was given, with every language it has.
 */
function installServer(bundle: { locales: Record<string, unknown> }): void
{
    requests.length = 0;
    window.fetch = (async (input: RequestInfo | URL): Promise<FakeResponse> =>
    {
        const address = String(input);
        requests.push(address);
        if (fault === "offline")
        {
            throw new TypeError("Failed to fetch");
        }
        if (fault === "missing")
        {
            return { ok: false, status: 404, json: async () => ({}) };
        }
        if (fault === "wrong")
        {
            return { ok: true, status: 200, json: async () => ({ locale: "xx", categories: {}, questions: [] }) };
        }
        const course = /(teach\/(?:course|maps)\.json|locales\/teach\.[a-z]+\.json)/.exec(address);
        if (course)
        {
            // The files of the Learn tab are the real ones, or the ones a test has put in their place.
            const name = course[1].replace("locales/", "teach/locales/");
            const body = name in courseFiles ? courseFiles[name] : (existsSync(`data/${name}`) ? JSON.parse(readFileSync(`data/${name}`, "utf8")) as unknown : undefined);
            return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
        }
        const question = /locales\/questions\.([a-z]+)\.json/.exec(address);
        const messages = /locales\/([a-z]+)\.json/.exec(address);
        const found = question
            ? bundle.locales[question[1]]
            : (messages ? JSON.parse(readFileSync(`src/locales/${messages[1]}.json`, "utf8")) as unknown : undefined);
        return { ok: found !== undefined, status: found === undefined ? 404 : 200, json: async () => found };
    }) as unknown as typeof window.fetch;
}

/**
 * Builds a synthetic question. Options are "Antwort 1..n" and "Answer 1..n", the correct
 * one is index `r`.
 * @param number Question number.
 * @param overrides Fields to replace.
 * @returns A complete question.
 */
export function makeQuestion(number: number, overrides: Partial<Question> = {}): Question
{
    return {
        n: number,
        c: "Testkategorie",
        q: `Frage ${number}`,
        a: ["Antwort 1", "Antwort 2", "Antwort 3", "Antwort 4"],
        r: 0,
        qe: `Question ${number}`,
        ae: ["Answer 1", "Answer 2", "Answer 3", "Answer 4"],
        img: null,
        ...overrides,
    };
}

/**
 * Builds a bank shaped like the real one: `general` questions numbered from 1 and
 * `berlin` questions numbered from 301 (their category is Berlin). Question n has its correct answer at index n % 4.
 * @param general Number of general questions.
 * @param berlin Number of Berlin questions.
 * @param overrides Fields applied to every question.
 * @returns Question list.
 */
export function makeBank(general: number, berlin: number, overrides: Partial<Question> = {}): Question[]
{
    const numbers = [
        ...Array.from({ length: general }, (_, index) => index + 1),
        ...Array.from({ length: berlin }, (_, index) => 301 + index),
    ];
    // The questions above 300 belong to a federal state: Berlin, which is the state that is chosen until the user chooses another.
    return numbers.map((number) => makeQuestion(number, { r: number % 4, ...(number > 300 ? { c: "Berlin" } : {}), ...overrides }));
}

/** Options of {@link mountApp}. */
export interface MountOptions
{
    /** Open the page as a visitor who has never been there: the setup dialog shows. By default the setup counts as done. */
    firstVisit?: boolean;
    /** Interface language. Tests read English texts, so English is the default here. The app itself defaults to German. */
    locale?: Locale | null;
    /** Makes the stand-in for the server fail from the start: the page is opened with saved languages it cannot fetch. */
    serverFault?: "missing" | "offline" | "wrong";
    /** The part of the address after the "#" sign, with the sign, when the page is opened by a link to a tab or to a place of the Learn tab: "#train", "#learn/wuerde". */
    place?: string;
    /** What the browser keeps with the step of its history the page is opened on, as after a reload. */
    historyState?: unknown;
}

/** The languages the course of the Learn tab is written in. */
const LEARN_LOCALES = ["de", "en", "ar", "uk", "tr", "es", "hi"];

/** Key the app saves under. */
const SAVED_KEY = "lidpractice-v4";

/** Adds "setup done" to what is saved, so the first-visit dialog does not stand in the way of a test. Unreadable saves are left alone. */
function markSetupDone(): void
{
    try
    {
        const raw = window.localStorage.getItem(SAVED_KEY);
        let saved: Record<string, unknown> = {};
        if (raw)
        {
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            {
                return;
            }
            saved = parsed as Record<string, unknown>;
        }
        window.localStorage.setItem(SAVED_KEY, JSON.stringify({ setupDone: true, ...saved }));
    }
    catch
    {
        // Storage that is blocked or a save that is broken: the test that sets this up wants the app to meet it as it is.
    }
}

/**
 * Loads src/app.ts fresh against a new DOM that embeds the given questions.
 * Importing the module boots the app, exactly as the built page does.
 * @param questions Question bank to embed, with German and English text side by side.
 * @param options Interface language. `null` leaves the address alone, so the app uses its own default.
 * @returns The module exports.
 */
export async function mountApp(questions: Question[] = REAL_QUESTIONS, options: MountOptions = {}): Promise<AppExports>
{
    vi.resetModules();
    fault = null;
    for (const path of Object.keys(courseFiles))
    {
        delete courseFiles[path];
    }
    document.body.innerHTML = FIXTURE_HTML;
    document.documentElement.className = "";
    const locale = options.locale === undefined ? "en" : options.locale;
    window.history.replaceState(options.historyState ?? null, "", `${locale === null ? "/" : `/?lang=${locale}`}${options.place ?? ""}`);
    if (!options.firstVisit)
    {
        markSetupDone();
    }
    const full = questions === REAL_QUESTIONS ? REAL_BUNDLE : toBundle(questions);
    // The page holds the German questions, and of the other languages only their names and categories.
    const page = {
        questions: full.questions,
        locales: Object.fromEntries(Object.entries(full.locales).map(([code, file]) => [code, code === "de" ? file : { ...file, questions: [] }])),
    };
    (document.getElementById("question-data") as HTMLElement).textContent = JSON.stringify(page);
    const files: { ui: Record<string, string>; questions: Record<string, string>; learn?: unknown } = { ui: {}, questions: {} };
    for (const code of Object.keys(full.locales))
    {
        if (code !== "de")
        {
            files.questions[code] = `locales/questions.${code}.json`;
        }
    }
    for (const code of ["ar", "uk", "tr", "es", "hi"])
    {
        files.ui[code] = `locales/${code}.json`;
    }
    files.learn = { course: "teach/course.json", maps: "teach/maps.json", texts: Object.fromEntries(LEARN_LOCALES.map((code) => [code, `locales/teach.${code}.json`])) };
    (document.getElementById("language-files") as HTMLElement).textContent = JSON.stringify(files);
    installServer(full);
    if (options.serverFault)
    {
        fault = options.serverFault;
    }
    // The page that was mounted before is gone, but what it listens to on the document and on the window would live on and answer
    // the keys, clicks and scrolling of this test too. A real page is alone in its document, so the listeners of the page before are taken away.
    for (const [target, type, listener] of pageListeners.splice(0))
    {
        target.removeEventListener(type, listener);
    }
    const watches = [document, window].map((target: Document | Window) =>
    {
        const add = target.addEventListener.bind(target);
        return vi.spyOn(target, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, listenerOptions?: boolean | AddEventListenerOptions) =>
        {
            pageListeners.push([target, type, listener]);
            add(type, listener, listenerOptions);
        });
    });
    const app = await import("../../src/app");
    await app.ready;
    watches.forEach((watch) => watch.mockRestore());
    return app;
}

/** What the page that is mounted listens to on the document and on the window for as long as it lives, to be taken away before the next page is mounted. */
const pageListeners: [Document | Window, string, EventListenerOrEventListenerObject][] = [];

/**
 * Chooses an entry of one of the listboxes the way a user does: open it, click the entry.
 * @param id The listbox id, for example "translation", "site-language" or "theme".
 * @param value The value of the entry.
 */
export async function chooseFromListbox(id: string, value: string): Promise<void>
{
    (document.getElementById(`${id}-button`) as HTMLButtonElement).click();
    (document.querySelector(`#${id}-list [data-value="${value}"]`) as HTMLElement).click();
    // A language of the site or of the translation is fetched first.
    await settle();
}

/**
 * Sets the translation below the German text.
 * @param value "off" or a language.
 */
export async function chooseTranslation(value: TranslationChoice): Promise<void>
{
    const toggle = document.getElementById("translation-toggle") as HTMLButtonElement;
    if (value === "off")
    {
        if (toggle.getAttribute("aria-pressed") === "true")
        {
            toggle.click();
            await settle();
        }
        return;
    }
    // The list picks the language; the translation is shown in it.
    await chooseFromListbox("translation", value);
    const after = document.getElementById("translation-toggle") as HTMLButtonElement;
    if (after.getAttribute("aria-pressed") !== "true")
    {
        after.click();
        await settle();
    }
}

/** What a new round is made of. */
export interface RoundChoice
{
    /** A shorthand: "general" is all subjects without the state questions, "berlin" is no subject and the state questions, "all" is all subjects and the state questions. */
    scope?: "general" | "berlin" | "all";
    /** Subjects: all, none, or the ids to tick. Without `includeState`, a list of subjects means no state questions. */
    topics?: "all" | "none" | readonly string[];
    /** Whether the questions of the user's state are included. */
    includeState?: boolean;
    order?: "random" | "booklet";
    /** Whether answers are final. */
    lock?: boolean;
    /** Whether only the weak spots inside the choice are drawn. */
    onlyWeak?: boolean;
}

/**
 * Opens the topic panel, makes the choices, and starts a new round, the way a user does.
 * @param choice Subjects, state questions, order and answer lock.
 */
export function startRound(choice: RoundChoice = {}): void
{
    if (!document.getElementById("topic-panel"))
    {
        (document.getElementById("change-selection") as HTMLButtonElement).click();
    }
    const topics = choice.scope === "berlin" ? "none" : choice.scope ? "all" : choice.topics;
    const fromScope = choice.scope === "general" ? false : choice.scope ? true : undefined;
    const includeState = choice.includeState ?? fromScope ?? (choice.topics === undefined ? undefined : false);
    if (topics === "all")
    {
        (document.getElementById("preset-all") as HTMLButtonElement).click();
    }
    else if (topics === "none")
    {
        (document.getElementById("preset-none") as HTMLButtonElement).click();
    }
    else if (topics)
    {
        (document.getElementById("preset-none") as HTMLButtonElement).click();
        for (const id of topics)
        {
            (document.getElementById(`topic-${id}`) as HTMLInputElement).click();
        }
    }
    const box = document.getElementById("include-state") as HTMLInputElement | null;
    if (includeState !== undefined && box && box.checked !== includeState)
    {
        box.click();
    }
    if (choice.order)
    {
        (document.getElementById(`order-${choice.order}`) as HTMLInputElement).click();
    }
    const weakBox = document.getElementById("only-weak") as HTMLInputElement;
    if (weakBox.checked !== (choice.onlyWeak ?? false))
    {
        weakBox.click();
    }
    if (choice.lock !== undefined && (document.getElementById("lock-answers") as HTMLInputElement).checked !== choice.lock)
    {
        (document.getElementById("lock-answers") as HTMLInputElement).click();
    }
    (document.getElementById("panel-start") as HTMLButtonElement).click();
}

/**
 * Chooses the user's federal state in the list at the bottom of the page.
 * @param stateId State id, for example "bayern".
 */
export function chooseState(stateId: string): void
{
    chooseFromListbox("state", stateId);
}

/** The right hand button below the question. */
export function nextButton(): HTMLButtonElement
{
    return document.getElementById("round-next") as HTMLButtonElement;
}

/** Slots of the timeline, in order. */
export function slots(): HTMLButtonElement[]
{
    return Array.from(document.querySelectorAll<HTMLButtonElement>(".timeline-list button.slot"));
}

/**
 * The state of each slot as the timeline states it, for example "correct".
 * @returns One word per slot.
 */
export function slotStates(): string[]
{
    return slots().map((slot) => slot.className.split(" ").find((name) => name.startsWith("is-") && name !== "is-current")?.slice(3) ?? "");
}

/**
 * Question number of a label as the page shows it: "Q123" for a general question, "BE 3" for task 3 of a federal state.
 * @param label The text of the badge or of a slot.
 * @returns The question number in the bank.
 */
export function numberOfLabel(label: string): number
{
    const general = /^Q?(\d+)$/.exec(label.trim());
    if (general)
    {
        return Number(general[1]);
    }
    const [code, task] = label.trim().split(/\s+/);
    const index = STATES.findIndex((state) => state.code === code);
    return index < 0 ? Number.NaN : 300 + index * 10 + Number(task);
}

/**
 * Question number of the card currently on screen.
 * @returns The number behind the badge.
 */
export function shownNumber(): number
{
    return numberOfLabel((document.querySelector(".qno") as HTMLElement).textContent as string);
}

/** Option buttons of the card on screen. */
export function optionButtons(): HTMLButtonElement[]
{
    return Array.from(document.querySelectorAll<HTMLButtonElement>("button.option"));
}

/**
 * Index (in presented order) of the correct option of the card on screen.
 * Matches the German text, so use it while the language is DE or DE + EN.
 * @param questions Bank the app was mounted with.
 * @returns Option index.
 */
export function correctIndex(questions: Question[] = REAL_QUESTIONS): number
{
    const question = questions.find((entry) => entry.n === shownNumber()) as Question;
    const german = question.a[question.r];
    return optionButtons().findIndex((button) => button.querySelector(".bi-main")?.textContent === german);
}

/**
 * Index of an option that is not correct.
 * @param questions Bank the app was mounted with.
 * @returns Option index.
 */
export function wrongIndex(questions: Question[] = REAL_QUESTIONS): number
{
    return correctIndex(questions) === 0 ? 1 : 0;
}

/**
 * The text a button shows: the label of an icon button, and for a button that needs a second press only the text that
 * is visible now.
 * @param button The button.
 * @returns The text.
 */
export function visibleText(button: HTMLElement): string
{
    if (button.classList.contains("icon-only"))
    {
        return button.getAttribute("aria-label") ?? "";
    }
    const swaps = Array.from(button.querySelectorAll(".swap:not(.is-off)"));
    return swaps.length > 0 ? swaps.map((swap) => swap.textContent).join("") : button.textContent ?? "";
}

/**
 * Finds a button by its exact visible text.
 * @param text Button label.
 * @returns The button, or undefined.
 */
export function buttonByText(text: string): HTMLButtonElement | undefined
{
    return Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => visibleText(button) === text);
}

/**
 * Clicks a button by its exact visible text. Throws if it is missing, so a typo cannot pass silently.
 * @param text Button label.
 */
export function clickButton(text: string): void
{
    const button = buttonByText(text);
    if (!button)
    {
        throw new Error(`No button labelled "${text}"`);
    }
    button.click();
}

/**
 * Runs an action as if the moment had passed in which the confirming button of a prompt ignores a press (the guard
 * against a double tap).
 * @param action What to do.
 */
export function afterGuard(action: () => void): void
{
    // Each guarded press is later than the one before: a prompt that came up during one is past its own guard at the next.
    guardAhead += CONFIRM_GUARD_MS;
    const spy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + guardAhead);
    try
    {
        action();
    }
    finally
    {
        spy.mockRestore();
    }
}

/** How far ahead of the real time the guarded presses of a test have gone, so each is later than the one before. */
let guardAhead = 0;

/**
 * Presses the button that finishes the exam on its last question, a moment after that question came up: a press at
 * once is taken for a second tap meant for Next, and ignored.
 */
export function pressFinishExam(): void
{
    afterGuard(() => clickButton("Finish exam"));
}

/**
 * Confirms the prompt before the exam is finished, a moment after it appeared.
 * @param label Text of the confirming button.
 */
export function finishAnyway(label = "Finish anyway"): void
{
    afterGuard(() => clickButton(label));
}

/**
 * Dispatches a keydown event.
 * @param key Key value, for example "1", "Enter" or "ArrowLeft".
 * @param init Extra event fields, for example `{ ctrlKey: true }`.
 * @param target Element that receives the event (default: document).
 */
export function pressKey(key: string, init: KeyboardEventInit = {}, target: EventTarget = document): void
{
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

/**
 * Text of one entry in the progress sidebar.
 * @param label "Seen", "Accuracy" or "Weak spots".
 * @returns The value text.
 */
export function statValue(label: string): string
{
    const terms = Array.from(document.querySelectorAll("dt"));
    const term = terms.find((entry) => entry.textContent === label) as HTMLElement;
    return (term.nextElementSibling as HTMLElement).textContent as string;
}

/**
 * Starts an exam from the intro screen.
 */
export function startExam(): void
{
    clickButton("Exam (33)");
    clickButton("Start exam");
}
