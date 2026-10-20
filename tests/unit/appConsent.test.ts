// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://lidpractice.de/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_EVENT, type ConsentStatus } from "../../src/consent";
import { CONSENT_SCRIPT_URL, PRIVACY_NOTICE_URL, PRIVACY_NOTICE_URL_ENGLISH, SEARCH_TITLE } from "../../src/constants";
import {
    chooseFromListbox, clickButton, finishAnyway, mountApp, optionButtons, pressFinishExam, pressKey, settle, startExam, type AppExports, type MountOptions,
} from "../helpers/appHarness";

/** The live site, where the page asks about counting in detail. */
const LIVE_ORIGIN = "https://lidpractice.de";

/** What the stand-in for the counter's consent script was asked to do. */
let calls: string[] = [];

/** The answer the stand-in keeps. */
let answer: ConsentStatus = "unset";

/**
 * Puts a stand-in for the counter's consent script on the window, as the real one does when it runs: its API, which
 * keeps the answer in memory and fires the event of the real one on every change.
 * @param initial The answer given on an earlier visit.
 */
function installApi(initial: ConsentStatus = "unset"): void
{
    answer = initial;
    const decide = (value: ConsentStatus): void =>
    {
        calls.push(value === "granted" ? "grant" : "deny");
        answer = value;
        window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { status: value } }));
    };
    (window as unknown as Record<string, unknown>).viewcounterConsent = {
        status: () => answer,
        grant: () => decide("granted"),
        deny: () => decide("denied"),
        open: () => calls.push("open"),
    };
}

/** The consent scripts on the page. */
function scripts(): HTMLScriptElement[]
{
    return [...document.querySelectorAll<HTMLScriptElement>(`script[src="${CONSENT_SCRIPT_URL}"]`)];
}

/** Lets the consent script arrive: the stand-in is put on the window and the browser says the script has run. */
function arrive(initial: ConsentStatus = "unset"): void
{
    installApi(initial);
    scripts()[0].dispatchEvent(new Event("load"));
}

/** The card, or null while it does not show. */
function card(): HTMLElement | null
{
    return document.getElementById("consent");
}

/**
 * Opens the page on the live site, as a new page load.
 * @param options As for mountApp.
 * @returns The app.
 */
async function openLive(options: MountOptions = {}): Promise<AppExports>
{
    document.head.querySelectorAll("script").forEach((tag) => tag.remove());
    delete (window as unknown as Record<string, unknown>).viewcounterConsent;
    return mountApp(undefined, options);
}

describe("App on the live site: counting in detail, only with consent", () =>
{
    beforeEach(() =>
    {
        window.localStorage.clear();
        calls = [];
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() =>
    {
        document.querySelector<HTMLElement>(".modal-close")?.click();
        document.getElementById("consent-close")?.click();
        vi.restoreAllMocks();
        vi.useRealTimers();
        window.localStorage.clear();
    });

    it("is opened from the live site", () =>
    {
        expect(window.location.origin).toBe(LIVE_ORIGIN);
    });

    it("adds the counter's consent script once, naming the privacy notice in the language of the site as that changes", async () =>
    {
        await openLive();
        expect(scripts()).toHaveLength(1);
        expect(scripts()[0].getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL_ENGLISH);
        await chooseFromListbox("site-language", "de");
        expect(scripts()[0].getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL);
        await chooseFromListbox("site-language", "ar");
        expect(scripts()[0].getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL_ENGLISH);
        await chooseFromListbox("site-language", "de");
        expect(scripts()).toHaveLength(1);
        expect(scripts()[0].getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL);
    });

    it("asks once the script has arrived, over a page that stays usable, and leaves the keyboard where it is", async () =>
    {
        await openLive();
        expect(card()).toBeNull();
        const option = optionButtons()[0];
        option.focus();
        arrive();
        expect(card()).not.toBeNull();
        expect(document.activeElement).toBe(option);
        // The page below is not blocked: an answer to the question still counts.
        option.click();
        expect(document.querySelector(".option.is-selected, .option[aria-pressed=true], .option.is-correct, .option.is-wrong")).not.toBeNull();
        expect(document.getElementById("app")?.hasAttribute("inert")).toBe(false);
        expect(card()).not.toBeNull();
    });

    it("waits for the first-visit setup to be done, and asks when it closes", async () =>
    {
        await openLive({ firstVisit: true });
        arrive();
        expect(document.querySelector("#modal-root [role=dialog]")).not.toBeNull();
        expect(card()).toBeNull();
        clickButton("Let’s go");
        expect(document.querySelector("#modal-root [role=dialog]")).toBeNull();
        expect(card()).not.toBeNull();
        expect(card()?.contains(document.activeElement)).toBe(false);
    });

    it("never comes up over a dialog: it waits until the dialog closes, and the dialog blocks a card that shows", async () =>
    {
        await openLive();
        clickButton("About and FAQ");
        arrive();
        expect(card()).toBeNull();
        document.querySelector<HTMLElement>(".modal-close")?.click();
        expect(card()).not.toBeNull();
        clickButton("About and FAQ");
        const root = document.getElementById("consent-root") as HTMLElement;
        expect([root.hasAttribute("inert"), root.getAttribute("aria-hidden")]).toEqual([true, "true"]);
        // Escape belongs to the dialog.
        pressKey("Escape", {}, document.activeElement ?? document);
        expect(document.querySelector("#modal-root [role=dialog]")).toBeNull();
        expect(card()).not.toBeNull();
        expect(root.hasAttribute("inert")).toBe(false);
    });

    it("never comes up during an exam: it waits until the exam is over", async () =>
    {
        await openLive();
        startExam();
        arrive();
        expect(card()).toBeNull();
        for (let index = 0; index < 32; index++)
        {
            clickButton("Next");
        }
        expect(card()).toBeNull();
        pressFinishExam();
        expect(card()).toBeNull();
        finishAnyway();
        expect(document.querySelector(".result")).not.toBeNull();
        expect(card()).not.toBeNull();
    });

    it("asks nobody who has answered, and none twice on one page load", async () =>
    {
        await openLive();
        arrive("denied");
        expect(card()).toBeNull();
        await openLive();
        arrive();
        (document.getElementById("consent-close") as HTMLElement).click();
        clickButton("Train");
        expect(card()).toBeNull();
    });

    it("hands the answer to the consent script, and the page stays as it was with a no", async () =>
    {
        await openLive({ place: "#train" });
        arrive();
        expect(document.title).toBe("Train | LiD Practice");
        (document.getElementById("consent-deny") as HTMLElement).click();
        expect(calls).toEqual(["deny"]);
        expect(card()).toBeNull();
        expect(document.title).toBe("Train | LiD Practice");
        expect(document.querySelector("[role=tab][aria-selected=true]")?.id).toBe("tab-train");
    });

    it("keeps what the visitor chose out of the title while the page is counted in detail: the title is that of the start page", async () =>
    {
        await openLive({ place: "#train", locale: "de" });
        arrive();
        expect(document.title).toBe("Trainieren | LiD Practice");
        (document.getElementById("consent-allow") as HTMLElement).click();
        expect(calls).toEqual(["grant"]);
        // The counter sends the title with every page: it must not tell the language of the site or anything chosen.
        expect(document.title).toBe(SEARCH_TITLE);
        clickButton("Prüfung (33)");
        expect(document.title).toBe(SEARCH_TITLE);
        await openLive({ place: "#learn/land", locale: "de" });
        arrive("granted");
        await settle();
        expect(document.querySelector(".lesson-head h2")?.textContent).toBe("Dein Bundesland: Berlin");
        expect(document.title).toBe(SEARCH_TITLE);
        expect(window.location.hash).toBe("#learn/land");
        // Taken back: the page is named again, in the language of the site.
        (document.getElementById("privacy-settings") as HTMLElement).click();
        expect(document.getElementById("consent-current")?.textContent).toBe("Deine aktuelle Antwort: erlaubt.");
        (document.getElementById("consent-deny") as HTMLElement).click();
        expect(document.title).toBe("Dein Bundesland: Berlin | LiD Practice");
    });

    it("keeps the title of the start page from the moment the counter's script is added until the answer is known not to be yes", async () =>
    {
        const appended: string[] = [];
        const append = HTMLHeadElement.prototype.append;
        vi.spyOn(HTMLHeadElement.prototype, "append").mockImplementation(function (this: HTMLHeadElement, ...nodes: (Node | string)[])
        {
            appended.push(document.title);
            append.apply(this, nodes);
        });
        document.title = "Something else";
        await openLive({ place: "#train", locale: "de" });
        // The page set its title right after it added the script, before the script could run: the title of the start page.
        expect(document.title).toBe(SEARCH_TITLE);
        // The script runs, and for an earlier yes loads the counter, which reads the title, before the page hears of it.
        installApi("granted");
        const readByCounter = document.title;
        scripts()[0].dispatchEvent(new Event("load"));
        expect(readByCounter).toBe(SEARCH_TITLE);
        expect(document.title).toBe(SEARCH_TITLE);
        expect(appended).toHaveLength(1);
        // Known to be unset: the page is named again.
        await openLive({ place: "#train", locale: "de" });
        expect(document.title).toBe(SEARCH_TITLE);
        arrive();
        expect(document.title).toBe("Trainieren | LiD Practice");
        // The script did not arrive: nothing counts, and the page is named.
        await openLive({ place: "#train", locale: "de" });
        expect(document.title).toBe(SEARCH_TITLE);
        scripts()[0].dispatchEvent(new Event("error"));
        expect(document.title).toBe("Trainieren | LiD Practice");
    });

    it("takes the state out of the address of a shared link at once, before the counter's script is added and before the course is there", async () =>
    {
        const seen: { hash: string; lesson: boolean }[] = [];
        const append = HTMLHeadElement.prototype.append;
        vi.spyOn(HTMLHeadElement.prototype, "append").mockImplementation(function (this: HTMLHeadElement, ...nodes: (Node | string)[])
        {
            seen.push({ hash: window.location.hash, lesson: document.querySelector(".lesson-head") !== null });
            append.apply(this, nodes);
        });
        await openLive({ place: "#learn/land-bayern/wappen" });
        expect(seen).toEqual([{ hash: "#learn/land/wappen", lesson: false }]);
        arrive("granted");
        await settle();
        // The state of the link is kept in memory for the note, and nowhere in the address.
        expect(document.querySelector(".lesson-linked")?.textContent).toContain("This link was made for Bavaria");
        expect(window.location.hash).toBe("#learn/land/wappen");
    });

    it("takes the state out of an address the browser goes to, before anything else listening on the same event reads it", async () =>
    {
        await openLive();
        arrive("granted");
        // A listener added after the page, as the counter's is: it sees the address the page has put right.
        const read: string[] = [];
        const listener = (): void =>
        {
            read.push(window.location.hash);
        };
        window.addEventListener("popstate", listener);
        window.addEventListener("hashchange", listener);
        window.history.pushState(null, "", "#learn/land-hessen");
        window.dispatchEvent(new PopStateEvent("popstate"));
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        window.removeEventListener("popstate", listener);
        window.removeEventListener("hashchange", listener);
        expect(read).toEqual(["#learn/land", "#learn/land"]);
        // The course was not there yet: it arrives, and the lesson says which state the link was for.
        expect(document.querySelector(".lesson-head")).toBeNull();
        await settle();
        expect(document.querySelector(".lesson-head h2")?.textContent).toBe("Your state: Berlin");
        expect(document.querySelector(".lesson-linked")?.textContent).toContain("This link was made for Hesse");
        expect(window.location.hash).toBe("#learn/land");
    });

    it("follows an answer given in another tab of the site", async () =>
    {
        await openLive({ place: "#exam" });
        arrive("granted");
        expect(document.title).toBe(SEARCH_TITLE);
        answer = "denied";
        window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { status: "denied" } }));
        expect(document.title).toBe("Exam (33) | LiD Practice");
    });

    it("opens from Privacy settings at the bottom of the page with the keyboard in it, and gives the keyboard back", async () =>
    {
        await openLive();
        arrive("granted");
        const settings = document.getElementById("privacy-settings") as HTMLButtonElement;
        expect(settings.closest(".site-legal")).not.toBeNull();
        settings.focus();
        settings.click();
        expect(document.activeElement?.id).toBe("consent-title");
        expect(document.getElementById("consent-current")?.textContent).toBe("Your current answer: allowed.");
        // The keys pressed in the card answer no question of the page.
        const before = document.querySelectorAll(".option.is-selected, .option[aria-pressed=true]").length;
        pressKey("a", {}, document.activeElement as HTMLElement);
        expect(document.querySelectorAll(".option.is-selected, .option[aria-pressed=true]")).toHaveLength(before);
        pressKey("Escape", {}, document.activeElement as HTMLElement);
        expect(card()).toBeNull();
        expect(document.activeElement?.id).toBe("privacy-settings");
        expect(calls).toEqual([]);
    });

    it("says why there is nothing to answer while the counter's script has not arrived, for example behind a content blocker", async () =>
    {
        await openLive();
        (document.getElementById("privacy-settings") as HTMLElement).click();
        expect(document.getElementById("consent-unavailable")?.textContent).toContain("the counter’s script has not loaded");
        expect(card()?.querySelector(".consent-actions")).toBeNull();
    });

    it("follows a change of the site's language while it shows", async () =>
    {
        await openLive();
        arrive();
        await chooseFromListbox("site-language", "de");
        expect(document.getElementById("consent-title")?.textContent).toBe("Nutzungsstatistik");
        expect(document.getElementById("consent-privacy")?.getAttribute("href")).toBe(PRIVACY_NOTICE_URL);
        expect(document.getElementById("privacy-settings")?.textContent).toBe("Datenschutz-Einstellungen");
        expect(card()?.textContent).toContain("unter „Datenschutz-Einstellungen“ unten auf der Seite");
    });

    it("names Privacy settings in the answer about data of the FAQ", async () =>
    {
        await openLive();
        clickButton("About and FAQ");
        const answers = [...document.querySelectorAll("#faq-privacy p")].map((paragraph) => paragraph.textContent);
        expect(answers).toHaveLength(2);
        expect(answers[1]).toContain("under \"Privacy settings\" at the bottom of the page");
        expect(answers[1]).toContain("The site, run by Harsh Ankur, counts which pages are opened");
        expect(document.querySelector("#faq-privacy a")?.getAttribute("href")).toBe(PRIVACY_NOTICE_URL_ENGLISH);
    });
});
