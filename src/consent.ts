/**
 * Counting visits in detail, only with the visitor's consent.
 *
 * The server of the site counts every page that is requested, from the request alone: nothing runs in the page for that
 * and nothing is read from or stored on the device. Counting in more detail runs in the page (which tabs and lessons are
 * opened, how long a page stays visible, how far it is scrolled), so it needs the visitor's consent first (Art. 6(1)(a)
 * GDPR, § 25(1) TDDDG): freely given, informed, as easy to take back as to give, with two answers of equal weight.
 *
 * The operator's view counter has a consent script of its own, which keeps the answer and loads the counter only after a
 * yes, and stops it after a no. It is told never to ask by itself (`data-ui="none"`): this file asks, in the language and
 * the look of the site, and hands the answer over through `window.viewcounterConsent`. The script is added on the live
 * site only ({@link LIVE_HOSTS}), so a local server, a preview or a test asks nothing and sends nothing.
 *
 * The question is a card over a corner of the page that blocks nothing: the page stays usable without an answer, and
 * with a no. It comes up by itself at most once per page load, while the visitor has not answered, once the first-visit
 * setup is done, and never over a dialog or during an exam. "Privacy settings" at the bottom of the page opens it at
 * any time, with the answer given so far, so it can be changed.
 */
import { modeHash } from "./address";
import { CONSENT_SCRIPT_URL, COUNTED_HASH_DEPTH, COUNTER_APP, LIVE_HOSTS, privacyNoticeUrl } from "./constants";
import { el } from "./dom";
import { ErrorBoundary } from "./errorBoundary";
import { t } from "./i18n";
import { DEFAULT_UI_LOCALE, MODES, type Locale } from "./types";

/** The visitor's answer, as the counter's consent script keeps it. */
export type ConsentStatus = "granted" | "denied" | "unset";

/** Every answer the consent script can report. Anything else is not taken for an answer. */
const STATUSES: readonly ConsentStatus[] = ["granted", "denied", "unset"];

/** What the counter's consent script offers the page as `window.viewcounterConsent`. Its own prompt (`open`) is never used here. */
export interface ConsentApi
{
    /** The answer: "granted", "denied" or "unset". */
    status(): string;
    /** Answers yes for the visitor: the script keeps it and loads the counter. */
    grant(): void;
    /** Answers no for the visitor: the script keeps it, and a counter that runs stops sending. */
    deny(): void;
}

/** What the page tells the card, and is told by it. */
export interface ConsentHost
{
    /** Whether the question may come up by itself now: the first-visit setup is done, no dialog is open and no exam runs. */
    mayAsk(): boolean;
    /** Called when the counter's script has arrived and when the answer changes: whether the page is counted in detail depends on both. */
    changed(): void;
}

/** The event the consent script fires on the window whenever the answer changes, also when it was given in another tab. */
export const CONSENT_EVENT = "viewcounter:consent";

/**
 * The options of the counter, as attributes of the consent script, which hands them on to it. The tabs and the pages of
 * the Learn tab count as pages ({@link COUNTED_HASH_DEPTH}: a section of a lesson counts as its lesson), and no click on
 * a link or a download is counted. The address of the privacy notice is set apart, as it follows the language.
 */
export const COUNTER_OPTIONS: Readonly<Record<string, string>> = {
    "data-app": COUNTER_APP,
    "data-hosts": LIVE_HOSTS.join(","),
    "data-ui": "none",
    "data-hash": MODES.map(modeHash).join(","),
    "data-hash-depth": String(COUNTED_HASH_DEPTH),
    "data-outbound": "false",
    "data-downloads": "false",
};

/** The attribute of the consent script that names the privacy notice its question links to. */
const PRIVACY_ATTRIBUTE = "data-privacy-url";

/** Id of the card, and of the controls in it, which keep the keyboard when the card is drawn anew in another language. */
const CARD_ID = "consent";
const TITLE_ID = "consent-title";

/** Id of the control at the bottom of the page that opens the card. Focus goes back to it, also after the page was drawn anew. */
export const SETTINGS_BUTTON_ID = "privacy-settings";

/** The multiplication sign on the close button, as on the dialog. */
const CLOSE_GLYPH = "×";

/** Class on the body while the card shows, which leaves room below the page so its end can be scrolled clear of the card. */
const OPEN_CLASS = "consent-open";

/** The custom property that holds the height of the card, for that room. */
const ROOM_PROPERTY = "--consent-room";

/**
 * How long the live region waits before it says that the question is there, in milliseconds: a region that changes at
 * the moment it appears is not read out by every screen reader.
 */
const ANNOUNCE_DELAY_MS = 150;

/**
 * The consent script's API, when it is there.
 * @returns The API, or undefined.
 */
function consentApi(): ConsentApi | undefined
{
    return (window as Window & { viewcounterConsent?: ConsentApi }).viewcounterConsent;
}

/**
 * The question about counting in detail, and the card that asks it.
 */
export class Consent
{
    /** The element the card and the live region are drawn into, outside the app, so drawing the app anew keeps them. */
    private readonly root: HTMLElement;
    private readonly host: ConsentHost;
    /** Whether the page is on the live site, the only place where the consent script is added. */
    private readonly live: boolean;
    /** The consent script, once it was added. */
    private script: HTMLScriptElement | null = null;
    /** Whether the consent script has arrived and offers its API. */
    private ready = false;
    /** Whether the card showed on this page load already: it comes up by itself once at most. */
    private shown = false;
    /** The card while it shows. */
    private card: HTMLElement | null = null;
    /**
     * The region that tells a screen reader that the question came up by itself. It is there before it speaks, as a live
     * region must be, and only on the live site: anywhere else the question never comes up by itself.
     */
    private readonly announcer: HTMLElement | null = null;
    /** Handle of the timer that fills the live region, or 0. */
    private announceTimer = 0;
    /** Where the keyboard was before it went into the card, to go back there when the card closes. */
    private returnFocus: HTMLElement | null = null;
    /** Keeps the room below the page as tall as the card. */
    private watcher: ResizeObserver | null = null;
    /** The language of the interface. */
    private locale: Locale | null = null;

    /**
     * @param root The element the card is drawn into.
     * @param host The page around it.
     * @param hostname The host the page was loaded from.
     */
    public constructor(root: HTMLElement, host: ConsentHost, hostname: string = window.location.hostname)
    {
        this.root = root;
        this.host = host;
        this.live = LIVE_HOSTS.includes(hostname.toLowerCase());
        if (this.live)
        {
            this.announcer = el("div", { id: "consent-announce", class: "visually-hidden", role: "status", "aria-live": "polite", "aria-atomic": "true" });
            this.root.append(this.announcer);
        }
    }

    /**
     * Adds the counter's consent script, on the live site only, and listens for the visitor's answer and for Escape.
     * @param locale The language of the interface, whose section of the privacy notice the script names.
     */
    public start(locale: Locale): void
    {
        this.locale = locale;
        // In the capture phase, so the key closes the card and goes no further: it does not also close the panel below it.
        document.addEventListener("keydown", (event) => this.onKey(event), true);
        if (!this.live)
        {
            return;
        }
        window.addEventListener(CONSENT_EVENT, () => this.update());
        const script = document.createElement("script");
        // Loaded beside the page, never in its way. Written as an attribute, so the tag says so too.
        script.setAttribute("async", "");
        script.src = CONSENT_SCRIPT_URL;
        for (const [name, value] of Object.entries(COUNTER_OPTIONS))
        {
            script.setAttribute(name, value);
        }
        script.setAttribute(PRIVACY_ATTRIBUTE, privacyNoticeUrl(locale));
        // A script that does not arrive (a content blocker, no network) leaves the question unasked: "Privacy settings" says why.
        script.addEventListener("load", () => this.update());
        this.script = script;
        document.head.append(script);
    }

    /** Whether the page is counted in detail now: the counter's script is there and the visitor said yes. */
    public get counting(): boolean
    {
        return this.status() === "granted";
    }

    /** Whether the card shows. */
    public get isOpen(): boolean
    {
        return this.card !== null;
    }

    /**
     * Follows the language of the interface: the script names the privacy notice in it, and a card that shows is drawn in it.
     * @param locale The language.
     */
    public setLocale(locale: Locale): void
    {
        if (locale === this.locale)
        {
            return;
        }
        this.locale = locale;
        this.script?.setAttribute(PRIVACY_ATTRIBUTE, privacyNoticeUrl(locale));
        this.redraw();
    }

    /**
     * Asks the question by itself, when it may: on the live site, once the counter's script is there, while the visitor
     * has not answered, when the page allows it (see {@link ConsentHost.mayAsk}), and once per page load at most. The
     * keyboard stays where it is; a screen reader is told once that the question is there.
     */
    public consider(): void
    {
        if (this.shown || this.status() !== "unset" || !this.host.mayAsk())
        {
            return;
        }
        this.show(false);
        this.announceTimer = window.setTimeout(() =>
        {
            (this.announcer as HTMLElement).textContent = t("consent.announce");
        }, ANNOUNCE_DELAY_MS);
    }

    /**
     * Opens the card from "Privacy settings", with the keyboard in it: with the answer given so far and the two answers,
     * or, where nothing can be answered, why not.
     */
    public openSettings(): void
    {
        const active = document.activeElement;
        const outside = active instanceof HTMLElement && active !== document.body && !this.card?.contains(active);
        this.show(true);
        if (outside)
        {
            this.returnFocus = active;
        }
        // The keyboard lands in the card, which says where the reader is: there is nothing to announce.
        this.silence();
        document.getElementById(TITLE_ID)?.focus();
    }

    /**
     * Puts the card away without an answer, for this page load. The keyboard goes back to where it was before it went
     * into the card, when it was in the card.
     */
    public close(): void
    {
        const card = this.card;
        if (!card)
        {
            return;
        }
        const hadFocus = card.contains(document.activeElement);
        card.remove();
        this.card = null;
        this.silence();
        this.watcher?.disconnect();
        this.watcher = null;
        document.body.classList.remove(OPEN_CLASS);
        document.documentElement.style.removeProperty(ROOM_PROPERTY);
        const back = this.returnFocus;
        this.returnFocus = null;
        if (hadFocus)
        {
            // The page may have been drawn anew meanwhile: the control is then found again by its id.
            const again = back && !back.isConnected && back.id ? document.getElementById(back.id) : null;
            (back?.isConnected ? back : again ?? document.getElementById(SETTINGS_BUTTON_ID))?.focus();
        }
    }

    /** Empties the live region, and stops an announcement that is still on its way. */
    private silence(): void
    {
        window.clearTimeout(this.announceTimer);
        this.announcer?.replaceChildren();
    }

    // ----- the answer -----

    /**
     * The visitor's answer, as the consent script reports it.
     * @returns The answer, or null where there is none to give: off the live site, and while the script is not there.
     */
    private status(): ConsentStatus | null
    {
        const api = this.ready ? consentApi() : undefined;
        if (!api)
        {
            return null;
        }
        // The script is not part of this site: an answer it cannot give, or one that is not one of the three, counts as none.
        const value = ErrorBoundary.run(() => api.status(), null, null);
        return STATUSES.find((status) => status === value) ?? null;
    }

    /**
     * The consent script has arrived, or the answer changed (in this page, or in another tab of the site): the page is
     * told, a card that shows says what holds now, and the question may come up.
     */
    private update(): void
    {
        this.ready = consentApi() !== undefined;
        this.host.changed();
        this.redraw();
        this.consider();
    }

    /**
     * Gives the visitor's answer to the consent script, and puts the card away.
     * @param allow Whether the visitor allows counting in detail.
     */
    private answer(allow: boolean): void
    {
        const api = consentApi();
        this.close();
        if (allow)
        {
            api?.grant();
        }
        else
        {
            api?.deny();
        }
    }

    // ----- the card -----

    /**
     * Shows the card, or draws it anew when it shows already.
     * @param bySettings Whether the visitor opened it.
     */
    private show(bySettings: boolean): void
    {
        this.shown = true;
        if (!this.card)
        {
            this.returnFocus = null;
            this.card = this.build();
            this.root.prepend(this.card);
            document.body.classList.add(OPEN_CLASS);
            this.keepRoom();
        }
        else if (bySettings)
        {
            this.redraw();
        }
    }

    /** Draws the card that shows anew: in the language of the interface, with the answer as it is now. The keyboard stays on the same control. */
    private redraw(): void
    {
        const card = this.card;
        if (!card)
        {
            return;
        }
        const focused = card.contains(document.activeElement) ? (document.activeElement as HTMLElement).id : "";
        const next = this.build();
        card.replaceWith(next);
        this.card = next;
        this.watcher?.disconnect();
        this.keepRoom();
        if (focused)
        {
            document.getElementById(focused)?.focus();
        }
    }

    /** Keeps the room below the page as tall as the card, so the end of the page can be scrolled into view above it. */
    private keepRoom(): void
    {
        const card = this.card as HTMLElement;
        const measure = (): void => document.documentElement.style.setProperty(ROOM_PROPERTY, `${card.offsetHeight}px`);
        measure();
        if (typeof ResizeObserver !== "undefined")
        {
            this.watcher = new ResizeObserver(measure);
            this.watcher.observe(card);
        }
    }

    /**
     * The card: the question with its two answers of equal weight, or, where there is nothing to answer, why not.
     * @returns The card element.
     */
    private build(): HTMLElement
    {
        const status = this.status();
        const privacy = el("p", {}, el("a", { id: "consent-privacy", href: privacyNoticeUrl(this.locale ?? DEFAULT_UI_LOCALE), target: "_blank", rel: "noopener" }, t("consent.privacy")));
        const answer = (id: string, label: string, allow: boolean): HTMLElement =>
            el("button", { id, class: "secondary", type: "button", onclick: () => this.answer(allow) }, label);
        const content = status === null
            ? [el("p", { id: "consent-unavailable" }, t(this.live ? "consent.blocked" : "consent.elsewhere")), privacy]
            : [
                el("p", {}, t("consent.always")),
                el("p", {}, t("consent.detail")),
                el("p", {}, t("consent.where", { settings: t("footer.privacySettings") })),
                privacy,
                status === "unset" ? null : el("p", { id: "consent-current", class: "consent-current" }, t(status === "granted" ? "consent.current.granted" : "consent.current.denied")),
                // The same look, the same size and side by side: neither answer is the one to choose, and neither is chosen.
                el("div", { class: "consent-actions" }, answer("consent-allow", t("consent.allow"), true), answer("consent-deny", t("consent.deny"), false)),
            ];
        return el("section", {
            id: CARD_ID,
            class: "consent",
            "aria-labelledby": TITLE_ID,
            // The keys pressed in the card belong to it: they answer no question of the page and press no shortcut of it.
            onkeydown: (event: Event) => event.stopPropagation(),
            // Where the keyboard came from when it went into the card, to go back there when the card closes.
            onfocusin: (event: Event) => this.noteReturn(event as FocusEvent),
        },
        el("div", { class: "consent-head" },
            el("h2", { id: TITLE_ID, class: "consent-title", tabindex: "-1" }, t("consent.title")),
            el("button", { id: "consent-close", class: "consent-close", type: "button", "aria-label": t("consent.close"), title: t("consent.close"), onclick: () => this.close() }, CLOSE_GLYPH)),
        ...content);
    }

    /**
     * Notes where the keyboard was when it went into the card from the page.
     * @param event The focus event.
     */
    private noteReturn(event: FocusEvent): void
    {
        const from = event.relatedTarget;
        if (from instanceof HTMLElement && !this.card?.contains(from))
        {
            this.returnFocus = from;
        }
    }

    /**
     * Escape puts the card away, when the keyboard is in it or nowhere else on the page.
     * @param event The key, seen before the page sees it.
     */
    private onKey(event: KeyboardEvent): void
    {
        if (event.key !== "Escape" || !this.card || event.defaultPrevented)
        {
            return;
        }
        const active = document.activeElement;
        if (active === null || active === document.body || active === document.documentElement || this.card.contains(active))
        {
            event.preventDefault();
            event.stopPropagation();
            this.close();
        }
    }
}
