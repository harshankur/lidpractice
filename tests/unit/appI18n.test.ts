// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../src/locales/de.json";
import en from "../../src/locales/en.json";
import {
    afterGuard, buttonByText, chooseFromListbox, chooseTranslation, clickButton, finishAnyway, makeQuestion, mountApp, nextButton, optionButtons, pressKey,
    REAL_QUESTIONS, shownNumber, startExam, startRound, type AppExports, settle
} from "../helpers/appHarness";

/** Every message key of the interface. */
const KEYS = Object.keys(de);

/** Text that is on the page right now, including the dialog. */
function pageText(): string
{
    return document.body.textContent as string;
}

/** Fails if a message key is shown instead of its text. */
function expectNoRawKeys(where: string): void
{
    const text = pageText();
    const shown = KEYS.filter((key) => text.includes(key));
    expect(shown, `${where} shows raw message keys`).toEqual([]);
}

/** Presses a key on an element, the way a keyboard user does. */
function key(target: HTMLElement, name: string): KeyboardEvent
{
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
}

describe("App: language, theme and tabs", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        vi.useRealTimers();
        window.localStorage.clear();
        document.documentElement.className = "";
    });

    describe("interface language", () =>
    {
        it("is English when nothing else is said, with the translation off and the appearance on automatic", async () =>
        {
            app = await mountApp(undefined, { locale: null });
            expect(document.documentElement.lang).toBe("en");
            expect([...document.querySelectorAll("[role=tab]")].map((tab) => tab.textContent)).toEqual(["Learn", "Practice", "Train", "Exam (33)"]);
            expect(document.querySelector(".brand-sub")?.textContent).toBe("Leben in Deutschland · 310 questions");
            expect(nextButton().textContent).toBe("Skip");
            expect(document.querySelector("footer")?.textContent).toContain("Independent study aid");
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) ?? "{}");
            expect(saved.translation ?? "off").toBe("off");
            expect(saved.theme ?? "auto").toBe("auto");
            expectNoRawKeys("English practice");
        });

        it("is German with ?lang=de", async () =>
        {
            app = await mountApp(undefined, { locale: "de" });
            expect(document.documentElement.lang).toBe("de");
            expect([...document.querySelectorAll("[role=tab]")].map((tab) => tab.textContent)).toEqual(["Lernen", "Üben", "Trainieren", "Prüfung (33)"]);
            expect(document.querySelector(".brand-sub")?.textContent).toBe("Leben in Deutschland · 310 Fragen");
            expect(nextButton().textContent).toBe("Überspringen");
            expect(document.querySelector("footer")?.textContent).toContain("Unabhängiges Lernangebot");
            expectNoRawKeys("German practice");
        });

        it("is English with ?lang=en, and the address does not need to be remembered", async () =>
        {
            app = await mountApp(undefined, { locale: "en" });
            expect(document.documentElement.lang).toBe("en");
            expect(nextButton().textContent).toBe("Skip");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).uiLanguage).toBe("en");
        });

        it("takes the language out of the address once it is applied and saved, and keeps the rest of the address", async () =>
        {
            app = await mountApp(undefined, { locale: "en" });
            expect(window.location.search).toBe("");
            vi.resetModules();
            window.history.replaceState({}, "", "/?lang=en&x=1#train");
            app = await import("../../src/app");
            expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/?x=1#train");
        });

        it("keeps a language chosen in the page after a reload, although the page was first opened with ?lang=en", async () =>
        {
            app = await mountApp(undefined, { locale: "en" });
            await chooseFromListbox("site-language", "de");
            expect(document.documentElement.lang).toBe("de");
            const address = `${window.location.pathname}${window.location.search}`;
            vi.resetModules();
            window.history.replaceState({}, "", address);
            document.getElementById("app")?.replaceChildren();
            app = await import("../../src/app");
            expect(document.documentElement.lang).toBe("de");
            expect(nextButton().textContent).toBe("Überspringen");
        });

        it("leaves an address without a language alone", async () =>
        {
            app = await mountApp(undefined, { locale: null });
            vi.resetModules();
            window.history.replaceState({}, "", "/?x=1");
            const replace = vi.spyOn(window.history, "replaceState");
            app = await import("../../src/app");
            // The page numbers the step of the history it is at, and changes nothing of the address.
            expect(replace.mock.calls.every(([, , url]) => url === undefined)).toBe(true);
            expect(window.location.search).toBe("?x=1");
        });

        it("ignores a language it does not know", async () =>
        {
            app = await mountApp(undefined, { locale: "fr" as "de" });
            expect(document.documentElement.lang).toBe("en");
        });

        it("lets the address win over the saved language, and saves the new one", async () =>
        {
            window.localStorage.setItem("lid-berlin-trainer-v3", JSON.stringify({ uiLanguage: "de" }));
            app = await mountApp(undefined, { locale: "en" });
            expect(document.documentElement.lang).toBe("en");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).uiLanguage).toBe("en");
        });

        it("switches with the list in the header, and the page title stays the product name", async () =>
        {
            app = await mountApp(undefined, { locale: null });
            expect(document.getElementById("site-language-button")?.textContent).toContain("English");
            await chooseFromListbox("site-language", "de");
            expect(document.documentElement.lang).toBe("de");
            expect(document.getElementById("site-language-button")?.textContent).toContain("Deutsch");
            expect(buttonByText("Practice")).toBeUndefined();
            expect(document.getElementById("tab-practice")?.textContent).toBe("Üben");
            expect(document.title).toBe("LiD Practice");
            expect(document.querySelector("h1")?.textContent).toBe("LiD Practice");
            await chooseFromListbox("site-language", "en");
            expect(document.getElementById("tab-practice")?.textContent).toBe("Practice");
            expectNoRawKeys("after switching");
        });

        it("says on the button what it is for, and names the language in its own language", async () =>
        {
            app = await mountApp(undefined, { locale: "de" });
            const button = document.getElementById("site-language-button") as HTMLElement;
            expect(button.textContent).toBe("Sprache der SeiteDeutsch");
            expect(button.getAttribute("aria-label")).toBe("Sprache der Seite: Deutsch");
            (button as HTMLButtonElement).click();
            expect([...document.querySelectorAll("#site-language-list [role=option]")].map((option) => option.textContent)).toEqual(["Deutsch", "English", "العربية", "Українська", "Türkçe", "Español", "हिन्दी"]);
            expect(document.querySelector("#site-language-list .listbox-note")?.textContent).toBe("Nur Menüs und Knöpfe. Die Fragen haben einen eigenen Übersetzungs-Schalter.");
        });

        it("remembers the choice for the next visit", async () =>
        {
            app = await mountApp(undefined, { locale: null });
            await chooseFromListbox("site-language", "de");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).uiLanguage).toBe("de");
            app = await mountApp(undefined, { locale: null });
            expect(document.documentElement.lang).toBe("de");
            expect(document.getElementById("tab-practice")?.textContent).toBe("Üben");
        });

        it("keeps the list button focused after the page is drawn again", async () =>
        {
            app = await mountApp(undefined, { locale: "de" });
            await chooseFromListbox("site-language", "en");
            expect(document.activeElement?.id).toBe("site-language-button");
        });

        it("keeps the translation separate from the language of the site", async () =>
        {
            app = await mountApp(undefined, { locale: "de" });
            await chooseFromListbox("site-language", "en");
            expect(document.querySelector(".question .bi-main")?.getAttribute("lang")).toBe("de");
            expect(document.querySelectorAll(".bi-sub")).toHaveLength(0);
            await chooseTranslation("en");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("en");
            await chooseFromListbox("site-language", "de");
            expect(document.querySelector(".question .bi-main")?.getAttribute("lang")).toBe("de");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("en");
            expect(document.getElementById("translation-toggle")?.textContent).toContain("Übersetzung");
        });

        it("keeps the question in German in every site language, because the real test is German", async () =>
        {
            app = await mountApp(undefined, { locale: "en" });
            const number = shownNumber();
            const entry = REAL_QUESTIONS.find((candidate) => candidate.n === number) as (typeof REAL_QUESTIONS)[number];
            expect(document.querySelector(".question .bi-main")?.textContent).toBe(entry.q);
        });
    });

    describe("every view shows text, never message keys", () =>
    {
        it.each([["de"], ["en"]] as const)("in %s", async (locale) =>
        {
            app = await mountApp(undefined, { locale });
            expectNoRawKeys("practice");
            optionButtons()[0].click();
            expectNoRawKeys("answered question");
            await chooseTranslation("en");
            expectNoRawKeys("translation");
            (document.getElementById("change-selection") as HTMLElement).click();
            expectNoRawKeys("topic panel");
            (document.getElementById("panel-cancel") as HTMLElement).click();
            (buttonByText(locale === "de" ? "Legende" : "Legend") as HTMLElement).click();
            expectNoRawKeys("timeline legend");
            startRound({ scope: "berlin" });
            for (let index = 0; index < 10; index++)
            {
                nextButton().click();
            }
            expectNoRawKeys("end of the round");
            document.querySelector<HTMLElement>("#practice-weak")?.click();
            expectNoRawKeys("round of weak spots");
            (document.getElementById("change-selection") as HTMLElement).click();
            expectNoRawKeys("topic panel of weak spots");
            (document.getElementById("panel-cancel") as HTMLElement).click();
            document.querySelector<HTMLElement>("#tab-train")?.click();
            expectNoRawKeys("training");
            optionButtons()[0].click();
            expectNoRawKeys("training, answered");
            (document.getElementById("change-selection") as HTMLElement).click();
            expectNoRawKeys("training, panel");
            (document.getElementById("panel-cancel") as HTMLElement).click();
            (document.getElementById("train-give-up") as HTMLElement | null)?.click();
            (document.getElementById("train-end") as HTMLElement).click();
            expectNoRawKeys("training, ended");
            document.querySelector<HTMLElement>("#tab-exam")?.click();
            expectNoRawKeys("exam intro");
            (document.querySelector(".intro .primary") as HTMLElement).click();
            expectNoRawKeys("running exam");
            for (let index = 0; index < 32; index++)
            {
                pressKey("ArrowRight");
            }
            afterGuard(() => (document.querySelector(".footer-row .primary:last-child") as HTMLElement).click());
            expectNoRawKeys("finish confirmation");
            afterGuard(() => (document.querySelector(".confirm .danger") as HTMLElement).click());
            expectNoRawKeys("exam result");
            (document.querySelector(".review-item .original-btn") as HTMLElement).click();
            expectNoRawKeys("original view");
            (document.querySelector(".modal-actions .secondary") as HTMLElement).click();
            expectNoRawKeys("report view");
            (document.querySelector(".modal-close") as HTMLElement).click();
            (document.querySelector(".site-footer-links .link-button") as HTMLElement).click();
            expectNoRawKeys("about view");
        });
    });

    describe("German texts", () =>
    {
        beforeEach(async () =>
        {
            app = await mountApp(undefined, { locale: "de" });
        });

        it("run through the exam in German, with the right plural", () =>
        {
            clickButton("Prüfung (33)");
            expect(document.querySelector(".intro h2")?.textContent).toBe("Probeprüfung");
            expect([...document.querySelectorAll(".facts li")].map((item) => item.textContent)).toEqual([
                "17 richtige Antworten bestehen.",
                "60 Minuten, rückwärts gezählt.",
                "Keine Rückmeldung bis zum Ende. Du kannst zurückgehen und Antworten ändern.",
                "Markiere eine Frage zur Kontrolle (Taste M), um sie in der Fragenliste wiederzufinden.",
            ]);
            clickButton("Prüfung starten");
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Frage 1 von 33");
            for (let index = 0; index < 32; index++)
            {
                pressKey("ArrowRight");
            }
            afterGuard(() => clickButton("Prüfung beenden"));
            expect(document.querySelector(".confirm p")?.textContent).toBe("33 Fragen sind noch unbeantwortet und zählen als falsch.");
            expect(document.querySelector(".confirm-detail")?.textContent).toBe("0 nie geöffnet, 33 geöffnet und offen gelassen.");
            finishAnyway("Trotzdem beenden");
            expect(document.querySelector(".result-label")?.textContent).toBe("Nicht bestanden");
            expect(document.querySelector(".result-score")?.textContent).toBe("0 von 33");
            expect(document.querySelector(".review h2")?.textContent).toBe("Rückblick: 33 verpasst");
        });

        it("uses the singular for an exam of one minute", async () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ setupDone: true, examMinutes: 1 }));
            app = await mountApp(undefined, { locale: "de" });
            clickButton("Prüfung (33)");
            expect(document.querySelectorAll(".facts li")[1]?.textContent).toBe("1 Minute, rückwärts gezählt.");
        });

        it("run through the training in German", () =>
        {
            clickButton("Trainieren");
            expect(document.querySelector(".banner-review")?.textContent).toContain("Eine falsche kommt nach ein paar Fragen wieder");
            expect(document.querySelector(".train-widget h2")?.textContent).toBe("Training");
            expect(buttonByText("Weiß ich nicht")).toBeDefined();
            clickButton("Weiß ich nicht");
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Keine Antwort. Die richtige Antwort ist markiert.");
            expect(document.querySelector(".verdict .learn-why")?.textContent).toBe("Warum?");
            expect(document.querySelector(".train-note")?.textContent).toContain("kommt nach ein paar Fragen wieder");
            clickButton("Training beenden");
            expect(document.querySelector(".end-card h2")?.textContent).toBe("Training beendet");
            expect(document.querySelector(".end-card p")?.textContent).toBe("0 von 310 erledigt mit 1 Antwort. 1 brauchte einen zweiten Versuch.");
        });

        it("show the verdicts in German", () =>
        {
            const question = REAL_QUESTIONS.find((entry) => entry.n === shownNumber()) as (typeof REAL_QUESTIONS)[number];
            const wrongIndex = optionButtons().findIndex((button) => button.querySelector(".bi-main")?.textContent !== question.a[question.r]);
            optionButtons()[wrongIndex].click();
            expect(document.querySelector(".verdict > span")?.textContent).toBe("Leider falsch. Die richtige Antwort ist markiert.");
            expect(document.querySelector(".is-wrong .mark")?.textContent).toBe("Deine Antwort");
            expect(document.querySelector(".is-correct .mark")?.textContent).toBe("Richtig");
        });

        it("number formats follow the language", () =>
        {
            optionButtons()[0].click();
            expect(document.querySelector(".stats dd")?.textContent).toBe("1 von 310");
            const accuracy = [...document.querySelectorAll(".stats dd")][1].textContent;
            expect(accuracy === "100 %" || accuracy === "0 %").toBe(true);
        });

        it("label the topic panel in German", () =>
        {
            clickButton("Auswahl ändern");
            expect(document.getElementById("panel-title")?.textContent).toBe("Was möchtest du üben?");
            expect([...document.querySelectorAll(".preset-row button")].map((button) => button.textContent)).toEqual([
                "Alle (300)", "Keine"]);
            expect([...document.querySelectorAll(".topic-group legend")].map((legend) => legend.textContent)).toEqual([
                "Staat und Demokratie (131)", "Geschichte und Europa (88)", "Alltag und Gesellschaft (81)"]);
            expect([...document.querySelectorAll("#topic-panel .panel-heading")].map((heading) => heading.textContent)).toEqual([
                "Reihenfolge", "Themen", "Fragen deines Bundeslandes", "Schwachstellen", "Antworten"]);
            expect(document.querySelector(".panel-count")?.textContent).toBe("310 Fragen aus 13 Themen und Berlin");
            expect(document.querySelector("label[for], #lock-answers")?.closest("label")?.textContent).toContain("Antworten sperren");
        });

        it("name the topics in the language of the site", async () =>
        {
            clickButton("Auswahl ändern");
            expect(document.querySelector("label[for], .topic")?.textContent).toContain("Grundrechte");
            clickButton("Abbrechen");
            await chooseFromListbox("site-language", "en");
            clickButton("Change selection");
            expect(document.querySelector(".topic")?.textContent).toContain("Fundamental rights");
        });

        it("show the round bar and the timeline in German", () =>
        {
            expect(document.querySelector(".round-bar")?.textContent).toContain("Alle Themen + Berlin · 310 Fragen");
            expect(document.querySelector(".round-bar")?.textContent).toContain("Wie im Heft");
            expect(document.querySelector(".timeline-head")?.textContent).toContain("Runde");
            startRound({ scope: "all", order: "random" });
            expect(document.querySelector(".round-bar")?.textContent).toContain("Zufällig");
            expect(document.querySelector(".slot-more")?.textContent).toBe("+ 308 weitere");
            startRound({ scope: "berlin", order: "booklet" });
            expect(document.querySelector(".slots, .timeline-list button")?.getAttribute("aria-label")).toBe("Frage BE 1, aktuelle Frage");
        });
    });

    describe("theme", () =>
    {
        beforeEach(async () =>
        {
            app = await mountApp();
        });

        it("follows the system to begin with", () =>
        {
            expect(document.documentElement.className).toBe("");
            expect(document.getElementById("theme-button")?.getAttribute("aria-label")).toBe("Appearance: Automatic (like device)");
        });

        it("is labelled like the language list: an icon, what it is for, and the short name of what is chosen", () =>
        {
            const button = document.getElementById("theme-button") as HTMLButtonElement;
            expect(button.classList.contains("is-icon-only")).toBe(false);
            expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
            expect(button.querySelector(".listbox-prefix")?.textContent).toBe("Appearance");
            expect(button.textContent).toBe("AppearanceAuto");
            expect(document.getElementById("site-language-button")?.querySelector(".listbox-prefix")?.textContent).toBe("Site language");
        });

        it("offers three choices in the list, with the long names, and shows the short name once one is chosen", () =>
        {
            (document.getElementById("theme-button") as HTMLButtonElement).click();
            expect([...document.querySelectorAll("#theme-list [role=option]")].map((option) => option.textContent)).toEqual([
                "Automatic (like device)", "Light", "Dark"]);
            (document.querySelector("#theme-list [data-value=dark]") as HTMLElement).click();
            expect(document.getElementById("theme-button")?.textContent).toBe("AppearanceDark");
        });

        it("forces dark and light with a class on the root element", async () =>
        {
            await chooseFromListbox("theme", "dark");
            expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
            expect(document.getElementById("theme-button")?.getAttribute("aria-label")).toBe("Appearance: Dark");
            await chooseFromListbox("theme", "light");
            expect(document.documentElement.className).toBe("theme-light");
            await chooseFromListbox("theme", "auto");
            expect(document.documentElement.className).toBe("");
        });

        it("is remembered and applied again on the next visit", async () =>
        {
            await chooseFromListbox("theme", "dark");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).theme).toBe("dark");
            app = await mountApp();
            expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
        });

        it("keeps the button focused after the page is drawn again", async () =>
        {
            await chooseFromListbox("theme", "dark");
            expect(document.activeElement?.id).toBe("theme-button");
        });
    });

    describe("header", () =>
    {
        it("puts the settings of the site together, apart from the controls of the questions", async () =>
        {
            app = await mountApp();
            const tools = document.querySelector(".header-tools") as HTMLElement;
            expect([...tools.querySelectorAll("button[aria-haspopup=listbox]")].map((button) => button.id)).toEqual(["site-language-button", "theme-button"]);
            expect(document.querySelector("header")?.contains(tools)).toBe(true);
            expect(document.querySelector("header")?.contains(document.getElementById("translation-button"))).toBe(false);
        });

        it("tells the two language controls apart on first sight: each names its purpose", async () =>
        {
            app = await mountApp();
            const site = document.getElementById("site-language-button") as HTMLElement;
            const translation = document.getElementById("translation-toggle") as HTMLElement;
            expect(site.textContent).toContain("Site language");
            expect(translation.textContent).toContain("Translation");
            expect(site.getAttribute("aria-label")).not.toBe(document.getElementById("translation-button")?.getAttribute("aria-label"));
            expect(document.querySelector("article.card")?.contains(translation)).toBe(true);
        });
    });

    describe("tabs", () =>
    {
        beforeEach(async () =>
        {
            app = await mountApp();
        });

        /** The tab buttons. */
        const tabs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[role=tab]")];

        it("follow the tabs pattern: one tab in the tab order, linked to the panel", () =>
        {
            // Learn comes first, and Practice is the tab the page opens with.
            expect(tabs().map((tab) => tab.id)).toEqual(["tab-learn", "tab-practice", "tab-train", "tab-exam"]);
            expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1]);
            const panel = document.getElementById("view") as HTMLElement;
            expect(panel.getAttribute("role")).toBe("tabpanel");
            expect(panel.getAttribute("aria-labelledby")).toBe("tab-practice");
            expect(tabs().every((tab) => tab.getAttribute("aria-controls") === "view")).toBe(true);
        });

        it("move with the arrow keys, wrap around, and keep focus on the selected tab", () =>
        {
            const list = document.querySelector("[role=tablist]") as HTMLElement;
            key(list, "ArrowRight");
            expect(document.getElementById("tab-train")?.getAttribute("aria-selected")).toBe("true");
            expect(document.activeElement?.id).toBe("tab-train");
            key(list, "ArrowRight");
            expect(document.activeElement?.id).toBe("tab-exam");
            key(list, "ArrowRight");
            expect(document.activeElement?.id).toBe("tab-learn");
            key(list, "ArrowRight");
            expect(document.activeElement?.id).toBe("tab-practice");
            key(list, "ArrowLeft");
            expect(document.activeElement?.id).toBe("tab-learn");
            key(list, "ArrowLeft");
            expect(document.activeElement?.id).toBe("tab-exam");
            key(list, "Home");
            expect(document.activeElement?.id).toBe("tab-learn");
            expect(document.getElementById("view")?.getAttribute("aria-labelledby")).toBe("tab-learn");
            key(list, "End");
            expect(document.activeElement?.id).toBe("tab-exam");
            expect(document.getElementById("view")?.getAttribute("aria-labelledby")).toBe("tab-exam");
        });

        it("keep the arrow keys to themselves: they do not also move through the exam questions", () =>
        {
            startExam();
            pressKey("ArrowRight");
            pressKey("ArrowRight");
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 3 of 33");
            key(document.getElementById("tab-exam") as HTMLElement, "ArrowLeft");
            expect(document.getElementById("tab-exam")?.getAttribute("aria-selected")).toBe("true");
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 3 of 33");
        });

        it("bring the open tab back into a row that is too narrow for all of them, when the page is drawn, the window changes or the font arrives", async () =>
        {
            /** The row is 200 wide; every tab is 80 wide and they stand side by side from the left edge. */
            const narrow = (): void =>
            {
                const row = document.querySelector("[role=tablist]") as HTMLElement;
                row.getBoundingClientRect = (): DOMRect => ({ left: 0, right: 200, width: 200, top: 0, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) });
                tabs().forEach((tab, index) =>
                {
                    tab.getBoundingClientRect = (): DOMRect => ({ left: index * 80, right: index * 80 + 80, width: 80, top: 0, bottom: 40, height: 40, x: index * 80, y: 0, toJSON: () => ({}) });
                });
            };
            (document.getElementById("tab-exam") as HTMLElement).click();
            narrow();
            // The Exam tab ends at 320, 120 past the end of the row.
            window.dispatchEvent(new Event("resize"));
            expect((document.querySelector("[role=tablist]") as HTMLElement).scrollLeft).toBe(120);
            // A browser tells when its fonts are there; the row is measured again then.
            let fontsReady: () => void = () => undefined;
            Object.defineProperty(document, "fonts", { configurable: true, value: { ready: new Promise<void>((resolve) =>
            {
                fontsReady = resolve;
            }) } });
            app = await mountApp();
            (document.getElementById("tab-exam") as HTMLElement).click();
            narrow();
            expect((document.querySelector("[role=tablist]") as HTMLElement).scrollLeft).toBe(0);
            fontsReady();
            await settle();
            expect((document.querySelector("[role=tablist]") as HTMLElement).scrollLeft).toBe(120);
            delete (document as { fonts?: unknown }).fonts;
        });

        it("leave other keys alone", () =>
        {
            const event = key(document.querySelector("[role=tablist]") as HTMLElement, "a");
            expect(event.defaultPrevented).toBe(false);
            expect(document.getElementById("tab-practice")?.getAttribute("aria-selected")).toBe("true");
        });
    });

    describe("translation list", () =>
    {
        beforeEach(async () =>
        {
            app = await mountApp();
        });

        it("hands focus back to its button after a choice, although the page was drawn again", async () =>
        {
            (document.getElementById("translation-button") as HTMLElement).click();
            (document.querySelector("#translation-list [data-value=en]") as HTMLElement).click();
            await settle();
            expect(document.activeElement?.id).toBe("translation-button");
            expect(document.getElementById("translation-button")?.getAttribute("aria-label")).toBe("Translation of the question: English");
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-pressed")).toBe("true");
        });

        it("shows the hint for its keyboard shortcut in the open list", () =>
        {
            (document.getElementById("translation-button") as HTMLElement).click();
            expect(document.querySelector("#translation-list .listbox-note")?.textContent).toBe("Key T: translation on or off");
        });

        it("is on the exam intro too, so the exam can be German only or translated", async () =>
        {
            clickButton("Exam (33)");
            expect(document.getElementById("exam-translation-button")).not.toBeNull();
            expect(document.querySelector(".intro")?.textContent).toContain("Translation in the exam");
            await chooseFromListbox("exam-translation", "en");
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).translation).toBe("en");
            clickButton("Start exam");
            expect(document.querySelectorAll(".bi-sub").length).toBeGreaterThan(0);
            expect(document.getElementById("translation-button")).not.toBeNull();
        });

        it("keeps working with startRound for topics", () =>
        {
            startRound({ topics: ["familie-bildung-alltag"] });
            expect(document.querySelector(".tag-topic")?.textContent).toBe("Family, education and everyday life");
        });
    });

    describe("pictures", () =>
    {
        const picture = (overrides = {}) => makeQuestion(55, { img: "images/q-055.webp", pg: 21, cap: "© Deutscher Bundestag/Achim Melde", ...overrides });

        it("tell on hover where they come from, with the credit, in English", async () =>
        {
            app = await mountApp([picture()]);
            expect(document.querySelector("figure img")?.getAttribute("title"))
                .toBe("Source: official question catalogue of the BAMF, Stand 07.05.2025, page 21. © Deutscher Bundestag/Achim Melde");
            expect(document.querySelector("figure img")?.getAttribute("alt")).toBe("Picture for this question");
        });

        it("tell on hover where they come from, in German", async () =>
        {
            app = await mountApp([picture()], { locale: "de" });
            expect(document.querySelector("figure img")?.getAttribute("title"))
                .toBe("Quelle: offizieller Fragenkatalog des BAMF, Stand 07.05.2025, Seite 21. © Deutscher Bundestag/Achim Melde");
            expect(document.querySelector("figure img")?.getAttribute("alt")).toBe("Bild zu dieser Frage");
        });

        it("name only the source when there is no credit", async () =>
        {
            app = await mountApp([picture({ cap: undefined })]);
            expect(document.querySelector("figure img")?.getAttribute("title")).toBe("Source: official question catalogue of the BAMF, Stand 07.05.2025, page 21.");
            expect(document.querySelector("figure figcaption")).toBeNull();
        });

        it("show the credit as printed, in German, whatever the translation", async () =>
        {
            app = await mountApp([picture({ q: "Was zeigt dieses Bild?", qe: "What does this picture show?", cap: "In Anlehnung an X" })]);
            await chooseTranslation("en");
            expect(document.querySelector("figure figcaption")?.textContent).toBe("In Anlehnung an X");
        });

        it("load from this site, with no host in the address", async () =>
        {
            app = await mountApp([picture()]);
            expect(document.querySelector("figure img")?.getAttribute("src")).toBe("images/q-055.webp");
        });
    });

    describe("starting an exam", () =>
    {
        it("works in German with the exam shortcuts", async () =>
        {
            app = await mountApp(undefined, { locale: "de" });
            clickButton("Prüfung (33)");
            clickButton("Prüfung starten");
            pressKey("2");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 beantwortet");
        });

        it("English helper still works", async () =>
        {
            app = await mountApp();
            startExam();
            expect(document.querySelector(".exam-progress")?.textContent).toBe("Question 1 of 33");
        });
    });

    it("has English and German catalogs of the same size", () =>
    {
        expect(Object.keys(en)).toHaveLength(KEYS.length);
    });
});
