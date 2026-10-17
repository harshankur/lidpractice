// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonByText, chooseFromListbox, clickButton, finishAnyway, mountApp, optionButtons, pressKey, settle, startExam, wrongIndex } from "../helpers/appHarness";

/** The tabs that have one page each. The Learn tab has an address for every page of it, see appLearn.test.ts. */
const TABS = ["practice", "train", "exam"] as const;

/** The name of the tab that shows. */
const openTab = (): string => (document.querySelector("[role=tab][aria-selected=true]") as HTMLElement).id.replace("tab-", "");

/** The part of the address that names the tab, as the page shows it in the bar. */
const hash = (): string => window.location.hash;

/** The dialog over the page, or null. */
const dialog = (): Element | null => document.querySelector("#modal-root [role=dialog]");

/**
 * Presses a tab of the row.
 * @param name The name of the tab.
 */
function openByTab(name: string): void
{
    (document.getElementById(`tab-${name}`) as HTMLButtonElement).click();
}

/**
 * Goes to an address the way the Back and Forward buttons of the browser do: the address changes, then the page is told, twice.
 * @param address The address.
 */
function browserGoesTo(address: string): void
{
    window.history.replaceState(null, "", address);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/**
 * Says whether a tab shows what belongs to it, not only its name in the row.
 * @param name The name of the tab.
 */
function showsItsPage(name: string): boolean
{
    const signs: Record<string, () => boolean> = {
        practice: () => document.querySelector(".timeline") !== null && optionButtons().length > 0,
        train: () => document.getElementById("train-next") !== null && optionButtons().length > 0,
        exam: () => buttonByText("Start exam") !== undefined,
    };
    return signs[name]();
}

describe("App: the addresses of the tabs", () =>
{
    beforeEach(async () =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        await mountApp();
    });

    afterEach(() =>
    {
        document.querySelector<HTMLElement>(".modal-close")?.click();
        vi.restoreAllMocks();
        window.localStorage.clear();
    });

    it("opens with practice at the plain address of the site, and leaves that address as plain as it is", () =>
    {
        expect(openTab()).toBe("practice");
        expect(`${window.location.pathname}${window.location.search}${hash()}`).toBe("/");
        const steps = window.history.length;
        // The tab that shows is pressed, and a round over the weak spots is started in it: the address has nothing to say that it does not say already.
        openByTab("practice");
        optionButtons()[wrongIndex()].click();
        expect((document.getElementById("practice-weak") as HTMLButtonElement).disabled).toBe(false);
        clickButton("Practice weak spots");
        expect(document.getElementById("exit-weak")).not.toBeNull();
        expect(openTab()).toBe("practice");
        expect(window.location.href.endsWith("/")).toBe(true);
        expect(window.history.length).toBe(steps);
    });

    it("goes on in the tab that was open last when the plain address of the site is opened again, and the address names it", async () =>
    {
        openByTab("train");
        const steps = window.history.length;
        // A reload of the plain address, or a new visit to it: the page is opened anew.
        await mountApp();
        expect(openTab()).toBe("train");
        expect(showsItsPage("train")).toBe(true);
        expect(hash()).toBe("#train");
        expect(document.title).toBe("Train | LiD Practice");
        expect(window.history.length).toBe(steps);
        openByTab("exam");
        await mountApp();
        expect(openTab()).toBe("exam");
        // Practice is where the site opens anyway: the address stays plain, and nothing is kept for it.
        openByTab("practice");
        expect(JSON.parse(window.localStorage.getItem("lidpractice-v4") as string).lastPlace).toBe("");
        await mountApp();
        expect(openTab()).toBe("practice");
        expect(hash()).toBe("");
    });

    it("lets a link win over the tab that was open last, and remembers the place of the link", async () =>
    {
        openByTab("train");
        await mountApp(undefined, { place: "#exam" });
        expect(openTab()).toBe("exam");
        expect(JSON.parse(window.localStorage.getItem("lidpractice-v4") as string).lastPlace).toBe("#exam");
    });

    it("saves nothing on a first visit that only looks at practice", async () =>
    {
        window.localStorage.clear();
        // Opened without a language in the address, which would be saved as a choice.
        await mountApp(undefined, { firstVisit: true, locale: null });
        expect(window.localStorage.getItem("lidpractice-v4")).toBeNull();
    });

    it.each(TABS)("opens %s by its link, complete and without another step in the history", async (name) =>
    {
        const steps = window.history.length;
        await mountApp(undefined, { place: `#${name}` });
        expect(openTab()).toBe(name);
        expect(showsItsPage(name)).toBe(true);
        expect(hash()).toBe(`#${name}`);
        expect(window.location.search).toBe("");
        expect(window.history.length).toBe(steps);
    });

    it("names the tab in the address when another tab is opened, with a press and with the arrow keys", async () =>
    {
        for (const name of ["train", "exam", "practice", "learn"])
        {
            openByTab(name);
            expect(hash(), name).toBe(`#${name}`);
            expect(openTab()).toBe(name);
        }
        const key = (name: string): void => pressKey(name, {}, document.querySelector("[role=tab][aria-selected=true]") as HTMLElement);
        key("ArrowRight");
        expect(hash()).toBe("#practice");
        key("End");
        expect(hash()).toBe("#exam");
        key("ArrowLeft");
        expect(hash()).toBe("#train");
        key("Home");
        expect(hash()).toBe("#learn");
        expect(window.location.search).toBe("");
        // The lessons that were asked for on the way arrive.
        await settle();
    });

    it("names the tab in the title of the page, in front of the name of the site, and keeps the plain name at the plain address", () =>
    {
        expect(document.title).toBe("LiD Practice");
        openByTab("practice");
        expect(document.title).toBe("LiD Practice");
        openByTab("train");
        expect(document.title).toBe("Train | LiD Practice");
        openByTab("exam");
        expect(document.title).toBe("Exam (33) | LiD Practice");
        openByTab("practice");
        expect(document.title).toBe("Practice | LiD Practice");
        // The title goes with the address, also when only the address changes and the tab stays.
        browserGoesTo("/");
        expect(document.title).toBe("LiD Practice");
        browserGoesTo("#practice");
        expect(document.title).toBe("Practice | LiD Practice");
        browserGoesTo("#train");
        expect(document.title).toBe("Train | LiD Practice");
        browserGoesTo("/");
        expect(document.title).toBe("LiD Practice");
    });

    it.each([
        ["#practice", "Practice | LiD Practice"],
        ["#train", "Train | LiD Practice"],
        ["#exam", "Exam (33) | LiD Practice"],
        ["#somewhere", "Practice | LiD Practice"],
    ])("names the tab in the title when the page is opened with %s", async (place, title) =>
    {
        await mountApp(undefined, { place });
        expect(document.title).toBe(title);
    });

    it("names the tab in the language of the site, and never translates the name of the site", async () =>
    {
        openByTab("train");
        await chooseFromListbox("site-language", "de");
        expect(document.title).toBe("Trainieren | LiD Practice");
        openByTab("exam");
        expect(document.title).toBe("Prüfung (33) | LiD Practice");
        await mountApp(undefined, { locale: "tr", place: "#practice" });
        expect(document.title).toBe(`${(document.getElementById("tab-practice") as HTMLElement).textContent} | LiD Practice`);
        expect(document.title).not.toBe("Practice | LiD Practice");
    });

    it("makes every other tab a step the Back button of the browser takes back, and a press on the tab that shows none", () =>
    {
        const start = window.history.length;
        openByTab("train");
        openByTab("train");
        expect(window.history.length).toBe(start + 1);
        openByTab("exam");
        openByTab("practice");
        openByTab("practice");
        expect(window.history.length).toBe(start + 3);
        // A step carries its address and its number, so the page knows how far the Back button went.
        expect(window.history.state).toEqual({ step: expect.any(Number) as number });
    });

    it("follows the Back and Forward buttons of the browser from tab to tab", () =>
    {
        openByTab("train");
        openByTab("exam");
        const steps = window.history.length;
        browserGoesTo("#train");
        expect(openTab()).toBe("train");
        expect(showsItsPage("train")).toBe(true);
        // The plain address the visit began with is practice, and stays plain.
        browserGoesTo("/");
        expect(openTab()).toBe("practice");
        expect(showsItsPage("practice")).toBe(true);
        expect(hash()).toBe("");
        browserGoesTo("#exam");
        expect(openTab()).toBe("exam");
        expect(showsItsPage("exam")).toBe(true);
        browserGoesTo("#practice");
        expect(openTab()).toBe("practice");
        expect(hash()).toBe("#practice");
        // Following the address is no step of its own.
        expect(window.history.length).toBe(steps);
    });

    it("shows a tab once for one step of the browser, although the browser tells it twice", () =>
    {
        openByTab("train");
        const question = document.querySelector("[data-focus]") as HTMLElement;
        browserGoesTo("#exam");
        browserGoesTo("#train");
        // The training that was running is the one that shows again: it was not started anew.
        expect((document.querySelector("[data-focus]") as HTMLElement).textContent).toBe(question.textContent);
        const drawn = document.getElementById("view");
        window.dispatchEvent(new PopStateEvent("popstate"));
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        expect(document.getElementById("view")).toBe(drawn);
    });

    it("takes the keyboard along to the tab that shows when it was in the row of tabs, and leaves it alone anywhere else", async () =>
    {
        openByTab("train");
        (document.getElementById("tab-train") as HTMLElement).focus();
        browserGoesTo("#exam");
        expect(document.activeElement?.id).toBe("tab-exam");
        browserGoesTo("#learn");
        expect(document.activeElement?.id).toBe("tab-learn");
        await settle();
        (document.getElementById("site-language-button") as HTMLElement).focus();
        browserGoesTo("#train");
        expect(document.activeElement?.id).toBe("site-language-button");
    });

    it("brings the question into view when the address leads to a tab while the window is far down the page", () =>
    {
        const scrolled: Element[] = [];
        Element.prototype.scrollIntoView = function scrollIntoView(this: Element): void
        {
            scrolled.push(this);
        };
        // The question starts above the top edge of the window: the page is scrolled past it.
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement): DOMRect
        {
            return (this.matches("article.card") ? { top: -200, bottom: 200, height: 400 } : { top: 0, bottom: 0, height: 0 }) as DOMRect;
        });
        openByTab("train");
        openByTab("exam");
        // A press on a tab happens at the top of the page, where the tabs are: nothing moves.
        expect(scrolled).toEqual([]);
        browserGoesTo("#train");
        expect(scrolled).toEqual([document.querySelector("article.card")]);
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    });

    it.each([
        ["#somewhere", "practice"],
        ["#Train", "practice"],
        ["#exams", "practice"],
        ["#train/", "train"],
        ["#exam/now", "exam"],
        ["#practice/12", "practice"],
    ])("puts the address %s right when the page is opened with it, and shows %s", async (place, name) =>
    {
        const steps = window.history.length;
        await mountApp(undefined, { place });
        expect(openTab()).toBe(name);
        expect(showsItsPage(name)).toBe(true);
        expect(hash()).toBe(`#${name}`);
        expect(window.history.length).toBe(steps);
    });

    it("puts an address right that is typed while the page is open: another spelling stays on the tab, no tab at all leads to practice", () =>
    {
        openByTab("train");
        const steps = window.history.length;
        const drawn = document.getElementById("view");
        browserGoesTo("#train/");
        expect(openTab()).toBe("train");
        expect(hash()).toBe("#train");
        // Nothing was drawn again for a spelling.
        expect(document.getElementById("view")).toBe(drawn);
        browserGoesTo("#somewhere");
        expect(openTab()).toBe("practice");
        expect(hash()).toBe("#practice");
        expect(window.history.length).toBe(steps);
    });

    it("keeps a dialog open when the address only changes its spelling, and closes it when the address leads to another tab", () =>
    {
        clickButton("About and FAQ");
        expect(dialog()).not.toBeNull();
        browserGoesTo("#practice");
        expect(dialog()).not.toBeNull();
        expect(hash()).toBe("#practice");
        browserGoesTo("#train");
        expect(dialog()).toBeNull();
        expect(openTab()).toBe("train");
    });

    it("does not leave a running exam by its address: the exam stays, and the address is put back", () =>
    {
        startExam();
        expect(hash()).toBe("#exam");
        optionButtons()[0].click();
        for (const address of ["#practice", "/", "#train", "#learn/timeline", "#somewhere"])
        {
            browserGoesTo(address);
            expect(openTab(), address).toBe("exam");
            expect(document.querySelector(".exam-progress"), address).not.toBeNull();
            expect(hash(), address).toBe("#exam");
            expect(document.title, address).toBe("Exam (33) | LiD Practice");
        }
        // Once the exam is finished its tab is left like any other.
        (document.getElementById("exam-finish") as HTMLButtonElement).click();
        finishAnyway();
        expect(hash()).toBe("#exam");
        browserGoesTo("#train");
        expect(openTab()).toBe("train");
    });

    it("starts an exam on the tab that was opened by its link, and leads from its result to practice by name", async () =>
    {
        await mountApp(undefined, { place: "#exam" });
        clickButton("Start exam");
        expect(document.querySelector(".exam-progress")).not.toBeNull();
        expect(hash()).toBe("#exam");
        optionButtons()[wrongIndex()].click();
        (document.getElementById("exam-finish") as HTMLButtonElement).click();
        finishAnyway();
        const steps = window.history.length;
        clickButton("Practice weak spots");
        expect(openTab()).toBe("practice");
        expect(hash()).toBe("#practice");
        expect(window.history.length).toBe(steps + 1);
    });

    it("shows the welcome dialog over the tab of the link on a first visit, and stays on that tab", async () =>
    {
        window.localStorage.clear();
        await mountApp(undefined, { place: "#train", firstVisit: true });
        expect(dialog()).not.toBeNull();
        expect(openTab()).toBe("train");
        // The address changes under the dialog: the dialog stays until it is answered.
        browserGoesTo("#exam");
        expect(dialog()).not.toBeNull();
        expect(openTab()).toBe("exam");
        clickButton("Let’s go");
        expect(dialog()).toBeNull();
        expect(openTab()).toBe("exam");
        expect(hash()).toBe("#exam");
    });

    it("keeps the tab and its address when the language of the site changes, in the page and by the address", async () =>
    {
        openByTab("train");
        await chooseFromListbox("site-language", "de");
        expect(document.documentElement.lang).toBe("de");
        expect(openTab()).toBe("train");
        expect(hash()).toBe("#train");
        await mountApp(undefined, { locale: "tr", place: "#exam" });
        expect(document.documentElement.lang).toBe("tr");
        expect(openTab()).toBe("exam");
        expect(`${window.location.pathname}${window.location.search}${hash()}`).toBe("/#exam");
    });
});
