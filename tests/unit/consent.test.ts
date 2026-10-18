// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_EVENT, Consent, COUNTER_OPTIONS, type ConsentHost, type ConsentStatus } from "../../src/consent";
import { CONSENT_SCRIPT_URL, PRIVACY_NOTICE_URL, PRIVACY_NOTICE_URL_ENGLISH } from "../../src/constants";
import { i18n } from "../../src/i18n";
import type { Locale } from "../../src/types";
import { registerAllCatalogs } from "../helpers/catalogs";

/** How long the live region waits before it speaks, as in src/consent.ts. */
const ANNOUNCE_DELAY_MS = 150;

/** What a stand-in for the counter's consent script was asked to do. */
let calls: string[] = [];

/** The answer the stand-in keeps. */
let answer: ConsentStatus = "unset";

/**
 * Puts a stand-in for the counter's consent script on the window: its API, which keeps the answer in memory and fires
 * the event the real one fires on every change. Its own prompt counts as a call, so a test can tell it is never used.
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

/** The consent script the page added, or null. */
function script(): HTMLScriptElement | null
{
    return document.querySelector<HTMLScriptElement>(`script[src="${CONSENT_SCRIPT_URL}"]`);
}

/** Lets the consent script arrive, as the browser tells when it has run it. */
function arrive(): void
{
    (script() as HTMLScriptElement).dispatchEvent(new Event("load"));
}

/** The card, or null while it does not show. */
function card(): HTMLElement | null
{
    return document.getElementById("consent");
}

/**
 * An element of the card, which must be there.
 * @param id Its id.
 */
function part(id: string): HTMLElement
{
    const found = document.getElementById(id);
    if (!found)
    {
        throw new Error(`No element #${id}`);
    }
    return found;
}

/**
 * Presses a key where the keyboard is.
 * @param key The key.
 * @param target Where it is pressed.
 * @returns The event, to see whether it was used.
 */
function press(key: string, target: EventTarget = document.activeElement ?? document.body): KeyboardEvent
{
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
}

/** What the page answers to the card, set by each test. */
let mayAsk = true;
const changed = vi.fn();
const host: ConsentHost = { mayAsk: () => mayAsk, changed };

/** What the card of the page listens to on the document and the window, taken away before the next page is loaded. */
const listeners: [EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][] = [];

/** Takes away what the cards of the pages before listen to: a page is alone in its document. */
function unload(): void
{
    for (const [target, type, listener, options] of listeners.splice(0))
    {
        target.removeEventListener(type, listener, options);
    }
    document.head.querySelectorAll("script").forEach((tag) => tag.remove());
}

/**
 * Makes the card of a page and starts it, as the app does when the page is loaded.
 * @param hostname The host the page was loaded from.
 * @param locale The language of the interface.
 * @returns The card.
 */
function load(hostname = "lidpractice.de", locale: Locale = "en"): Consent
{
    unload();
    const root = document.getElementById("consent-root") as HTMLElement;
    root.replaceChildren();
    const consent = new Consent(root, host, hostname);
    const watches = [document, window].map((target: Document | Window) =>
    {
        const add = target.addEventListener.bind(target);
        return vi.spyOn(target, "addEventListener").mockImplementation((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) =>
        {
            listeners.push([target, type, listener, options]);
            add(type, listener, options);
        });
    });
    consent.start(locale);
    watches.forEach((watch) => watch.mockRestore());
    return consent;
}

beforeAll(() => registerAllCatalogs());

beforeEach(() =>
{
    unload();
    calls = [];
    mayAsk = true;
    changed.mockReset();
    i18n.setLocale("en");
    document.body.className = "";
    document.body.innerHTML = `<div id="app"><button id="elsewhere" type="button">Elsewhere</button><button id="privacy-settings" type="button">Privacy settings</button></div><div id="consent-root"></div>`;
    delete (window as unknown as Record<string, unknown>).viewcounterConsent;
});

afterEach(() =>
{
    vi.useRealTimers();
});

describe("the counter's consent script", () =>
{
    it.each(["localhost", "127.0.0.1", "lidpractice.pages.dev", "lidpractice.de.example.com", "preview.lidpractice.de"])("is not added on %s, so nothing is asked or sent there", (hostname) =>
    {
        const consent = load(hostname);
        expect(document.querySelectorAll("script")).toHaveLength(0);
        consent.consider();
        expect(card()).toBeNull();
        expect(consent.mayCount).toBe(false);
        // Nothing comes up by itself here, so there is no live region either.
        expect(document.getElementById("consent-announce")).toBeNull();
    });

    it.each(["lidpractice.de", "www.lidpractice.de", "LidPractice.de"])("is added once on the live site, %s, asynchronously and with exactly the options of this site", (hostname) =>
    {
        load(hostname);
        const scripts = document.querySelectorAll("script");
        expect(scripts).toHaveLength(1);
        expect(scripts[0].parentElement).toBe(document.head);
        expect(Object.fromEntries([...scripts[0].attributes].map((attribute) => [attribute.name, attribute.value]))).toEqual({
            async: "",
            src: "https://views.harshankur.com/consent.js",
            "data-app": "lidpractice",
            "data-hosts": "lidpractice.de,www.lidpractice.de",
            "data-ui": "none",
            "data-hash": "#learn,#practice,#train,#exam",
            "data-hash-depth": "2",
            "data-outbound": "false",
            "data-downloads": "false",
            "data-privacy-url": PRIVACY_NOTICE_URL_ENGLISH,
        });
        expect(Object.keys(COUNTER_OPTIONS)).not.toContain("data-privacy-url");
    });

    it("names the privacy notice in the language of the interface, and follows a change of it", () =>
    {
        const consent = load("lidpractice.de", "de");
        expect(script()?.getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL);
        consent.setLocale("en");
        expect(script()?.getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL_ENGLISH);
        consent.setLocale("ar");
        expect(script()?.getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL_ENGLISH);
        consent.setLocale("de");
        expect(script()?.getAttribute("data-privacy-url")).toBe(PRIVACY_NOTICE_URL);
        expect(document.querySelectorAll("script")).toHaveLength(1);
    });

    it("takes the page for counted from the moment the script is added until the answer is known to be no, and tells it when that changes", () =>
    {
        installApi("granted");
        const consent = load();
        // The script may load the counter for an earlier yes before the page hears of it: until the answer is known, it is taken for a yes.
        expect(consent.mayCount).toBe(true);
        arrive();
        expect(changed).toHaveBeenCalledTimes(1);
        expect(consent.mayCount).toBe(true);
        (window as unknown as { viewcounterConsent: { deny(): void } }).viewcounterConsent.deny();
        expect(changed).toHaveBeenCalledTimes(2);
        expect(consent.mayCount).toBe(false);
        (window as unknown as { viewcounterConsent: { grant(): void } }).viewcounterConsent.grant();
        expect(consent.mayCount).toBe(true);
    });

    it("knows the page is not counted once the answer is unset, and once the script failed to arrive", () =>
    {
        installApi("unset");
        let consent = load();
        expect(consent.mayCount).toBe(true);
        arrive();
        expect(consent.mayCount).toBe(false);
        delete (window as unknown as Record<string, unknown>).viewcounterConsent;
        consent = load();
        changed.mockReset();
        (script() as HTMLScriptElement).dispatchEvent(new Event("error"));
        expect(changed).toHaveBeenCalledTimes(1);
        expect(consent.mayCount).toBe(false);
        expect(card()).toBeNull();
    });

    it("takes no answer from a script that offers no API or reports something else", () =>
    {
        const consent = load();
        arrive();
        expect(consent.mayCount).toBe(false);
        expect(card()).toBeNull();
        installApi();
        answer = "maybe" as ConsentStatus;
        window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
        expect(card()).toBeNull();
        expect(consent.mayCount).toBe(false);
        consent.openSettings();
        expect(part("consent-unavailable").textContent).toContain("the counter’s script has not loaded");
    });
});

describe("the question that comes up by itself", () =>
{
    it("waits for the counter's script, and then asks once, without taking the keyboard, with a polite word to a screen reader", () =>
    {
        vi.useFakeTimers();
        installApi();
        const consent = load();
        const elsewhere = part("elsewhere");
        elsewhere.focus();
        consent.consider();
        expect(card()).toBeNull();
        arrive();
        expect(card()).not.toBeNull();
        expect(consent.isOpen).toBe(true);
        expect(document.activeElement).toBe(elsewhere);
        const announcer = part("consent-announce");
        expect([announcer.getAttribute("role"), announcer.getAttribute("aria-live"), announcer.getAttribute("aria-atomic")]).toEqual(["status", "polite", "true"]);
        expect(card()?.contains(announcer)).toBe(false);
        expect(announcer.textContent).toBe("");
        vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
        expect(announcer.textContent).toBe("A question about usage statistics is waiting at the bottom of the page.");
        part("consent-close").click();
        expect(announcer.textContent).toBe("");
    });

    it("says what is counted always, what only with consent, and what never, and links the privacy notice in a new tab", () =>
    {
        installApi();
        load();
        arrive();
        expect(card()?.getAttribute("aria-labelledby")).toBe("consent-title");
        expect(part("consent-title").tagName).toBe("H2");
        expect(part("consent-title").textContent).toBe("Usage statistics");
        expect([...(card() as HTMLElement).querySelectorAll("p")].map((paragraph) => paragraph.textContent)).toEqual([
            "This site, run by Harsh Ankur, always counts which pages are opened, to see how it is used and improve it. That happens on its server, with nothing read from or stored on your device.",
            "With your consent it also counts which tabs and lessons you open, how long a page stays visible and how far it is scrolled. Never your answers, results, chosen state or settings.",
            "No cookies. The counting runs on the operator’s own server, and no third party receives it. You can change your answer at any time under \"Privacy settings\" at the bottom of the page.",
            "Privacy notice (in German and English)",
        ]);
        const link = part("consent-privacy");
        expect([link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("rel")]).toEqual([PRIVACY_NOTICE_URL_ENGLISH, "_blank", "noopener"]);
        expect(document.getElementById("consent-current")).toBeNull();
    });

    it("offers two answers of equal weight: the same element, look and place, neither chosen and neither focused", () =>
    {
        installApi();
        load();
        arrive();
        const buttons = [...(card() as HTMLElement).querySelectorAll<HTMLButtonElement>(".consent-actions > *")];
        expect(buttons.map((button) => [button.tagName, button.type, button.className, button.textContent])).toEqual([
            ["BUTTON", "button", "secondary", "Allow"],
            ["BUTTON", "button", "secondary", "Don’t allow"],
        ]);
        for (const button of buttons)
        {
            expect([...button.attributes].map((attribute) => attribute.name).sort()).toEqual(["class", "id", "type"]);
            expect(document.activeElement).not.toBe(button);
        }
        expect(buttons[0].parentElement).toBe(buttons[1].parentElement);
    });

    it("does not come up while the page says it may not: over the setup, a dialog or an exam; it waits", () =>
    {
        installApi();
        const consent = load();
        mayAsk = false;
        arrive();
        consent.consider();
        expect(card()).toBeNull();
        mayAsk = true;
        consent.consider();
        expect(card()).not.toBeNull();
    });

    it("does not come up when the visitor has answered, yes or no", () =>
    {
        for (const given of ["granted", "denied"] as const)
        {
            installApi(given);
            const consent = load();
            arrive();
            consent.consider();
            expect(card(), given).toBeNull();
        }
    });

    it("comes up once per page load at most, and again on the next one while there is no answer", () =>
    {
        installApi();
        const consent = load();
        arrive();
        part("consent-close").click();
        expect(card()).toBeNull();
        expect(calls).toEqual([]);
        consent.consider();
        window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { status: "unset" } }));
        expect(card()).toBeNull();
        // The next visit.
        load();
        arrive();
        expect(card()).not.toBeNull();
    });

    it("draws itself in another language at once, and keeps the keyboard on the same control", () =>
    {
        installApi();
        const consent = load();
        arrive();
        part("consent-deny").focus();
        i18n.setLocale("de");
        consent.setLocale("de");
        expect(part("consent-title").textContent).toBe("Nutzungsstatistik");
        expect(part("consent-deny").textContent).toBe("Nicht erlauben");
        expect(part("consent-allow").textContent).toBe("Erlauben");
        expect(part("consent-privacy").getAttribute("href")).toBe(PRIVACY_NOTICE_URL);
        expect(document.activeElement?.id).toBe("consent-deny");
        expect(document.querySelectorAll("#consent")).toHaveLength(1);
    });

    it("leaves room below the page while it shows, so the end of the page can be scrolled into view above it", () =>
    {
        installApi();
        load();
        arrive();
        expect(document.body.classList.contains("consent-open")).toBe(true);
        expect(document.documentElement.style.getPropertyValue("--consent-room")).toBe("0px");
        part("consent-close").click();
        expect(document.body.classList.contains("consent-open")).toBe(false);
        expect(document.documentElement.style.getPropertyValue("--consent-room")).toBe("");
    });

    it("keeps that room as tall as the card when the card changes its size, and stops watching it when it closes", () =>
    {
        const watched: { callback: () => void; targets: Element[]; stopped: boolean }[] = [];
        vi.stubGlobal("ResizeObserver", class
        {
            private readonly entry: { callback: () => void; targets: Element[]; stopped: boolean };

            public constructor(callback: () => void)
            {
                this.entry = { callback, targets: [], stopped: false };
                watched.push(this.entry);
            }

            public observe(target: Element): void
            {
                this.entry.targets.push(target);
            }

            public disconnect(): void
            {
                this.entry.stopped = true;
            }
        });
        try
        {
            installApi();
            load();
            arrive();
            expect(watched).toHaveLength(1);
            expect(watched[0].targets).toEqual([card()]);
            Object.defineProperty(card(), "offsetHeight", { configurable: true, value: 212 });
            watched[0].callback();
            expect(document.documentElement.style.getPropertyValue("--consent-room")).toBe("212px");
            part("consent-close").click();
            expect(watched[0].stopped).toBe(true);
        }
        finally
        {
            vi.unstubAllGlobals();
        }
    });

    it("does nothing when it is put away while it does not show", () =>
    {
        const consent = load("localhost");
        consent.close();
        expect(card()).toBeNull();
        expect(document.body.classList.contains("consent-open")).toBe(false);
    });
});

describe("answering", () =>
{
    it.each([["consent-allow", "grant"], ["consent-deny", "deny"]])("hands the answer of %s to the consent script and puts the card away", (id, call) =>
    {
        installApi();
        const consent = load();
        arrive();
        part(id).click();
        expect(calls).toEqual([call]);
        expect(card()).toBeNull();
        expect(consent.mayCount).toBe(call === "grant");
        consent.consider();
        expect(card()).toBeNull();
    });

    it("returns the keyboard to where it was before it went into the card", () =>
    {
        installApi();
        load();
        arrive();
        part("elsewhere").focus();
        part("consent-allow").focus();
        part("consent-allow").click();
        expect(document.activeElement?.id).toBe("elsewhere");
    });

    it("never opens the consent script's own prompt", () =>
    {
        installApi();
        const consent = load();
        arrive();
        consent.openSettings();
        part("consent-deny").click();
        consent.openSettings();
        part("consent-allow").click();
        expect(calls).toEqual(["deny", "grant"]);
    });

    it("keeps the keys pressed in the card from the page: they answer no question of it", () =>
    {
        installApi();
        load();
        arrive();
        const seen = vi.fn();
        document.addEventListener("keydown", seen);
        part("consent-allow").focus();
        press("a");
        press("Enter");
        document.removeEventListener("keydown", seen);
        expect(seen).not.toHaveBeenCalled();
    });
});

describe("closing without an answer", () =>
{
    it("closes with its X, which has a name, and answers nothing", () =>
    {
        installApi();
        load();
        arrive();
        const close = part("consent-close");
        expect([close.tagName, close.getAttribute("type"), close.getAttribute("aria-label")]).toEqual(["BUTTON", "button", "Close without answering"]);
        close.focus();
        close.click();
        expect(card()).toBeNull();
        expect(calls).toEqual([]);
    });

    it("closes with Escape while the keyboard is in it, and gives the keyboard back", () =>
    {
        installApi();
        load();
        arrive();
        part("elsewhere").focus();
        part("consent-title").focus();
        const event = press("Escape");
        expect(event.defaultPrevented).toBe(true);
        expect(card()).toBeNull();
        expect(document.activeElement?.id).toBe("elsewhere");
        expect(calls).toEqual([]);
    });

    it("closes with Escape while nothing else has the keyboard, and keeps the key from the page then", () =>
    {
        installApi();
        load();
        arrive();
        (document.activeElement as HTMLElement | null)?.blur();
        const seen = vi.fn();
        document.addEventListener("keydown", seen);
        press("Escape", document.body);
        document.removeEventListener("keydown", seen);
        expect(card()).toBeNull();
        expect(seen).not.toHaveBeenCalled();
    });

    it("stays when Escape is meant for another control of the page, and leaves the key alone without a card", () =>
    {
        installApi();
        load();
        arrive();
        part("elsewhere").focus();
        expect(press("Escape").defaultPrevented).toBe(false);
        expect(card()).not.toBeNull();
        part("consent-close").click();
        expect(press("Escape", document.body).defaultPrevented).toBe(false);
    });
});

describe("Privacy settings", () =>
{
    it.each([
        ["granted", "Your current answer: allowed."],
        ["denied", "Your current answer: not allowed."],
    ] as const)("shows the answer given so far, %s, above the two answers, with the keyboard in the card", (given, line) =>
    {
        installApi(given);
        const consent = load();
        arrive();
        expect(card()).toBeNull();
        part("privacy-settings").focus();
        consent.openSettings();
        expect(part("consent-current").textContent).toBe(line);
        expect(part("consent-current").nextElementSibling?.className).toBe("consent-actions");
        expect(document.activeElement?.id).toBe("consent-title");
        expect(part("consent-announce").textContent).toBe("");
    });

    it("changes the answer, and gives the keyboard back to the control that opened the card", () =>
    {
        installApi("granted");
        const consent = load();
        arrive();
        part("privacy-settings").focus();
        consent.openSettings();
        part("consent-deny").click();
        expect(calls).toEqual(["deny"]);
        expect(consent.mayCount).toBe(false);
        expect(card()).toBeNull();
        expect(document.activeElement?.id).toBe("privacy-settings");
    });

    it("finds the control that opened it again when the page was drawn anew meanwhile", () =>
    {
        installApi();
        const consent = load();
        arrive();
        part("privacy-settings").focus();
        consent.openSettings();
        const app = part("app");
        app.innerHTML = `<button id="privacy-settings" type="button">Privacy settings</button>`;
        press("Escape");
        expect(document.activeElement).toBe(app.firstElementChild);
    });

    it("asks without a line about an earlier answer when there is none, and does not come up by itself after it was opened", () =>
    {
        installApi();
        const consent = load();
        mayAsk = false;
        arrive();
        consent.openSettings();
        expect(document.getElementById("consent-current")).toBeNull();
        expect(part("consent-allow")).toBeTruthy();
        part("consent-close").click();
        mayAsk = true;
        consent.consider();
        expect(card()).toBeNull();
    });

    it("says why there is nothing to answer while the counter's script has not arrived on the live site, and asks once it does", () =>
    {
        installApi();
        const consent = load();
        consent.openSettings();
        expect(part("consent-unavailable").textContent).toBe("There is nothing to answer here: the counter’s script has not loaded, for example because a content blocker stopped it. So only the server counts which pages are opened, with nothing on your device.");
        expect(card()?.querySelector("button.secondary")).toBeNull();
        expect(part("consent-privacy").getAttribute("href")).toBe(PRIVACY_NOTICE_URL_ENGLISH);
        expect(document.activeElement?.id).toBe("consent-title");
        arrive();
        expect(part("consent-allow").textContent).toBe("Allow");
        expect(document.getElementById("consent-unavailable")).toBeNull();
        expect(document.activeElement?.id).toBe("consent-title");
    });

    it("says that nothing is counted anywhere but on the live site, with no answers to give", () =>
    {
        const consent = load("localhost", "de");
        i18n.setLocale("de");
        part("privacy-settings").focus();
        consent.openSettings();
        expect(part("consent-unavailable").textContent).toBe("Unter dieser Adresse wird nichts gezählt, darum gibt es hier nichts zu beantworten.");
        expect(card()?.querySelectorAll("button")).toHaveLength(1);
        expect(part("consent-privacy").getAttribute("href")).toBe(PRIVACY_NOTICE_URL);
        press("Escape");
        expect(card()).toBeNull();
        expect(document.activeElement?.id).toBe("privacy-settings");
        expect(document.querySelectorAll("script")).toHaveLength(0);
    });

    it("draws the card that came up by itself anew with the keyboard in it, when it is opened while it shows", () =>
    {
        installApi();
        const consent = load();
        arrive();
        part("privacy-settings").focus();
        consent.openSettings();
        expect(document.querySelectorAll("#consent")).toHaveLength(1);
        expect(document.activeElement?.id).toBe("consent-title");
        press("Escape");
        expect(document.activeElement?.id).toBe("privacy-settings");
    });
});
