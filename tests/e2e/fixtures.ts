import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { flatQuestions, readBundle } from "../../scripts/lib/data.mjs";
import { STATES } from "../../scripts/lib/numbering.mjs";

/** One question with the German and the English text side by side. */
export interface RawQuestion
{
    n: number;
    c: string;
    q: string;
    a: string[];
    r: number;
    qe: string;
    ae: string[];
    img: string | null;
    cap?: string;
    pg: number;
}

/** localStorage key used by the app. */
export const STORAGE_KEY = "lidpractice-v4";

/** Number of questions in an exam. */
export const EXAM_SIZE = 33;

/** Number of general questions in an exam. */
export const EXAM_GENERAL = 30;

/** Number of questions of the chosen federal state in an exam. */
export const EXAM_STATE = 3;

/** Highest general question number. */
export const LAST_GENERAL = 300;

/**
 * How long the button that confirms the finish prompt ignores a press after the prompt appeared, in milliseconds.
 * The same value as CONFIRM_GUARD_MS in src/constants.ts.
 */
export const CONFIRM_GUARD_MS = 500;

/** Keys that choose option 1 to 4. */
const OPTION_KEYS = ["a", "b", "c", "d"];

/** The real question bank, read from disk so tests know the right answers. */
export const BUNDLE = readBundle();
export const QUESTIONS: RawQuestion[] = flatQuestions(BUNDLE) as RawQuestion[];

/** Saved record of one question, as stored by the app. */
export interface SavedRecord
{
    right: number;
    wrong: number;
    lastWrong: boolean;
}

/**
 * The question bank as the page embeds it, but with every question's text replaced by the text of one question.
 * Used to put long words or a single known question on screen.
 * @param pick Which text each question gets, by question number.
 * @returns The bundle.
 */
export function bundleWithTexts(pick: (number: number) => RawQuestion): typeof BUNDLE
{
    const swap = (code: "de" | "en") => ({
        ...BUNDLE.locales[code],
        questions: BUNDLE.locales[code].questions.map((entry: { n: number; cap?: string }) =>
        {
            const source = pick(entry.n);
            return code === "de" ? { n: entry.n, q: source.q, a: source.a } : { n: entry.n, q: source.qe, a: source.ae };
        }),
    });
    return { ...BUNDLE, locales: { de: swap("de"), en: swap("en") } };
}

/**
 * Makes the page embed a different question bank. The real page is served, only the embedded data is replaced.
 * @param page Playwright page.
 * @param bundle The bank to embed.
 */
export async function embedBundle(page: Page, bundle: typeof BUNDLE): Promise<void>
{
    await page.route(/\/(\?.*)?$/, async (route) =>
    {
        const response = await route.fetch();
        const html = await response.text();
        const body = html.replace(/(<script type="application\/json" id="question-data">)[\s\S]*?(<\/script>)/, (_, open: string, close: string) =>
            `${open}${JSON.stringify(bundle).replace(/</g, "\\u003c")}${close}`);
        await route.fulfill({ response, body });
    });
}

/** Extra fixtures provided by {@link test}. */
interface Fixtures
{
    /**
     * Patterns of page errors a test provokes on purpose. A test pushes a pattern here,
     * and matching errors no longer fail it.
     */
    allowedErrors: RegExp[];
}

/**
 * Test fixture. The test fails if the page throws, logs a console error, asks any server other than the site
 * itself for anything, or any request returns an error status, unless the error matches a pattern in `allowedErrors`.
 */
export const test = base.extend<Fixtures>({
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern, this fixture needs no others.
    allowedErrors: async ({}, use) =>
    {
        await use([]);
    },
    page: async ({ page, allowedErrors }, use) =>
    {
        const problems: string[] = [];
        // The site must work without any other server: a request to a host that is not the site itself fails the test.
        page.on("request", (request) =>
        {
            const address = request.url();
            if (!address.startsWith("data:") && !address.startsWith("blob:") && new URL(address).origin !== new URL(page.url() === "about:blank" ? address : page.url()).origin)
            {
                problems.push(`third party request: ${address}`);
            }
        });
        page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
        page.on("console", (message) =>
        {
            if (message.type() === "error")
            {
                problems.push(`console: ${message.text()}`);
            }
        });
        page.on("response", (response) =>
        {
            if (response.status() >= 400)
            {
                problems.push(`http ${response.status()}: ${response.url()}`);
            }
        });
        await use(page);
        const unexpected = problems.filter((problem) => !allowedErrors.some((pattern) => pattern.test(problem)));
        expect(unexpected, "unexpected errors while running the page").toEqual([]);
    },
});

export { expect };

/** Options of {@link openApp}. */
export interface OpenOptions
{
    /** Raw localStorage text to start with, or undefined for a fresh start. Written once per tab, so reloads keep what the app stored afterwards. */
    saved?: string;
    /** Open the page as a visitor who has never been there: the setup dialog shows. By default the setup counts as done. */
    firstVisit?: boolean;
    /** Interface language. The tests read English, so English is the default here, as it is in the app. `null` opens the plain address. */
    locale?: "de" | "en" | "ar" | "uk" | "tr" | "es" | "hi" | null;
    /** The part of the address after the "#" sign, with the sign, to open the page by a link to a tab or to a place of the Learn tab: "#train", "#learn/wuerde". */
    place?: string;
}

/**
 * Opens the app with a clean slate or with saved state.
 * @param page Playwright page.
 * @param saved Raw localStorage text to start with, or options.
 */
export async function openApp(page: Page, saved?: string | OpenOptions): Promise<void>
{
    const options: OpenOptions = typeof saved === "object" ? saved : { saved };
    if (options.saved !== undefined || !options.firstVisit)
    {
        await page.addInitScript(([key, value, done]) =>
        {
            if (!window.sessionStorage.getItem("e2e-seeded"))
            {
                let text = value;
                try
                {
                    const parsed = JSON.parse(value || "{}");
                    text = JSON.stringify(done === "yes" ? { setupDone: true, ...parsed } : parsed);
                }
                catch
                {
                    // A broken save is handed over as it is.
                }
                window.localStorage.setItem(key, text);
                window.sessionStorage.setItem("e2e-seeded", "1");
            }
        }, [STORAGE_KEY, options.saved ?? "", options.firstVisit ? "no" : "yes"]);
    }
    const locale = options.locale === undefined ? "en" : options.locale;
    await page.goto(`${locale === null ? "/" : `/?lang=${locale}`}${options.place ?? ""}`);
    await expect(page.locator("h1")).toHaveText("LiD Practice");
}

/**
 * Builds saved state in which the given questions are weak spots.
 * @param numbers Question numbers.
 * @returns Text to store in localStorage.
 */
export function weakState(numbers: number[]): string
{
    const records: Record<string, SavedRecord> = {};
    for (const number of numbers)
    {
        records[String(number)] = { right: 0, wrong: 1, lastWrong: true };
    }
    return JSON.stringify({ records });
}

/**
 * Chooses an entry of one of the lists of the page, the way a user does: open it, click the entry.
 * @param page Playwright page.
 * @param id The list id, for example "translation", "site-language" or "theme".
 * @param value The value of the entry.
 */
export async function chooseFromListbox(page: Page, id: string, value: string): Promise<void>
{
    await page.locator(`#${id}-button`).click();
    await page.locator(`#${id}-list [data-value="${value}"]`).click();
}

/** What a new round is made of. */
export interface RoundChoice
{
    /** A shorthand: "general" is all subjects without the state questions, "berlin" is no subject and the state questions, "all" is all subjects and the state questions. */
    scope?: "general" | "berlin" | "all";
    /** Subjects: all, none, or the ids to tick. Without `includeState`, a list of subjects means no state questions. */
    topics?: "all" | "none" | string[];
    /** Whether the questions of the user's state are included. */
    includeState?: boolean;
    order?: "random" | "booklet";
    /** Whether answers are final. */
    lock?: boolean;
}

/**
 * Opens the topic panel, makes the choices and starts a new round, the way a user does.
 * @param page Playwright page.
 * @param choice Subjects, state questions, order and answer lock.
 */
export async function startRound(page: Page, choice: RoundChoice = {}): Promise<void>
{
    if (!(await page.locator("#topic-panel").isVisible()))
    {
        await page.locator("#change-selection").click();
    }
    const topics = choice.scope === "berlin" ? "none" : choice.scope ? "all" : choice.topics;
    const fromScope = choice.scope === "general" ? false : choice.scope ? true : undefined;
    const includeState = choice.includeState ?? fromScope ?? (choice.topics === undefined ? undefined : false);
    if (topics === "all" || topics === "none")
    {
        await page.locator(`#preset-${topics}`).click();
    }
    else if (topics)
    {
        await page.locator("#preset-none").click();
        for (const topic of topics)
        {
            await page.locator(`#topic-${topic}`).check();
        }
    }
    if (includeState !== undefined)
    {
        await page.locator("#include-state").setChecked(includeState);
    }
    if (choice.order)
    {
        await page.locator(`#order-${choice.order}`).check();
    }
    if (choice.lock !== undefined)
    {
        await page.locator("#lock-answers").setChecked(choice.lock);
    }
    await page.locator("#panel-start").click();
}

/**
 * Question number of a label as the page shows it: "Q123" for a general question, "BE 3" for task 3 of a federal state.
 * @param label The text of a badge or a slot.
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
    const index = (STATES as { code: string }[]).findIndex((state) => state.code === code);
    return index < 0 ? Number.NaN : 300 + index * 10 + Number(task);
}

/**
 * The label that tells a question apart: "123", or "BE 3" for task 3 of a federal state.
 * @param number Question number in the bank.
 * @returns The label, as the page writes it in texts.
 */
export function nameOfNumber(number: number): string
{
    if (number <= LAST_GENERAL)
    {
        return String(number);
    }
    const state = (STATES as { code: string }[])[Math.floor((number - LAST_GENERAL - 1) / 10)];
    return `${state.code} ${((number - LAST_GENERAL - 1) % 10) + 1}`;
}

/**
 * Number of the question on screen.
 * @param page Playwright page.
 * @returns Question number from the "Q123" badge.
 */
export async function shownNumber(page: Page): Promise<number>
{
    return numberOfLabel(await page.locator(".qno").first().innerText());
}

/**
 * Index of the option that is right for the question on screen (German or German plus English mode).
 * @param page Playwright page.
 * @returns Option index, 0 to 3.
 */
export async function correctOptionIndex(page: Page): Promise<number>
{
    const question = QUESTIONS[(await shownNumber(page)) - 1];
    const texts = await page.locator("button.option .bi-main").allInnerTexts();
    return texts.findIndex((text) => text.trim() === question.a[question.r].trim());
}

/**
 * Index of an option that is wrong for the question on screen.
 * @param page Playwright page.
 * @returns Option index, 0 to 3.
 */
export async function wrongOptionIndex(page: Page): Promise<number>
{
    return (await correctOptionIndex(page)) === 0 ? 1 : 0;
}

/**
 * Picks an option with the keyboard shortcut.
 * @param page Playwright page.
 * @param index Option index, 0 to 3.
 */
export async function pressOption(page: Page, index: number): Promise<void>
{
    await page.keyboard.press(OPTION_KEYS[index]);
}

/**
 * Locator for one entry of the progress sidebar.
 * @param page Playwright page.
 * @param label "Seen", "Accuracy" or "Weak spots".
 * @returns Locator for the value.
 */
export function stat(page: Page, label: string): Locator
{
    return page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
}

/**
 * Answers the whole exam with the keyboard, then leaves the cursor on the last question.
 * @param page Playwright page.
 * @param correct How many of the first questions to answer right. The rest are answered wrong.
 * @param unansweredFrom Index from which questions are skipped.
 * @returns Question numbers in exam order.
 */
export async function answerExam(page: Page, correct: number, unansweredFrom = EXAM_SIZE): Promise<number[]>
{
    const numbers: number[] = [];
    for (let index = 0; index < EXAM_SIZE; index++)
    {
        numbers.push(await shownNumber(page));
        if (index < unansweredFrom)
        {
            const choice = index < correct ? await correctOptionIndex(page) : await wrongOptionIndex(page);
            await pressOption(page, choice);
        }
        if (index < EXAM_SIZE - 1)
        {
            await page.keyboard.press("ArrowRight");
        }
    }
    return numbers;
}

/**
 * Presses the button that finishes the exam on its last question, once the moment has passed in which it ignores a
 * press: a press at once is taken for a second tap meant for Next.
 * @param page Playwright page.
 * @param label Text of the button, in the language of the site.
 */
export async function pressFinishExam(page: Page, label = "Finish exam"): Promise<void>
{
    const button = page.getByRole("button", { name: label });
    await expect(button).toBeVisible();
    await page.waitForTimeout(CONFIRM_GUARD_MS);
    await button.click();
}

/**
 * Confirms the prompt before the exam is finished, once the moment has passed in which its button ignores a press.
 * @param page Playwright page.
 * @param label Text of the confirming button.
 */
export async function finishAnyway(page: Page, label = "Finish anyway"): Promise<void>
{
    const button = page.getByRole("dialog").getByRole("button", { name: label });
    await expect(button).toBeVisible();
    await page.waitForTimeout(CONFIRM_GUARD_MS);
    await button.click();
}
