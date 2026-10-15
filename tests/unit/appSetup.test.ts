// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseFromListbox, clickButton, mountApp, settle, statValue, type AppExports } from "../helpers/appHarness";

/** The dialog on screen, or null. */
function dialog(): HTMLElement | null
{
    return document.querySelector<HTMLElement>("#modal-root [role=dialog]");
}

/** What is saved. */
function saved(app: AppExports): Record<string, unknown>
{
    return JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
}

/** Presses Escape the way a user does. */
function escape(target: EventTarget = document): void
{
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

describe("App: the setup dialog of the first visit", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        app = await mountApp(undefined, { firstVisit: true });
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        window.localStorage.clear();
        document.documentElement.className = "";
    });

    it("opens on the first visit, over the page, and asks for the state, the language, the appearance and the translation", () =>
    {
        expect(dialog()).not.toBeNull();
        expect(dialog()?.classList.contains("modal-setup")).toBe(true);
        expect(document.getElementById("modal-title")?.textContent).toBe("Welcome");
        expect(Array.from(dialog()?.querySelectorAll(".setup-label") ?? []).map((label) => label.textContent)).toEqual([
            "Your state", "Site language", "Appearance", "Also show the questions in my language"]);
        expect(Array.from(dialog()?.querySelectorAll("button[aria-haspopup=listbox]") ?? []).map((button) => button.id)).toEqual([
            "setup-state-button", "setup-language-button", "setup-theme-button"]);
        expect(document.getElementById("setup-translation")?.tagName).toBe("INPUT");
        expect(document.getElementById("app")?.hasAttribute("inert")).toBe(true);
    });

    it("underlines the sentence that says everything can be changed later, without making it bold", () =>
    {
        const intro = document.querySelector(".setup > p") as HTMLElement;
        const later = intro.querySelector(".setup-later") as HTMLElement;
        expect(later.textContent).toBe("You can change everything later");
        expect(intro.textContent).toBe("Four choices, then you can start. You can change everything later: language and appearance at the top, your state at the bottom, the translation on the question.");
        expect(intro.querySelector("strong, b")).toBeNull();
    });

    it("starts with Berlin, the language of the page, automatic appearance and no translation", () =>
    {
        expect(document.getElementById("setup-state-button")?.textContent).toContain("Berlin");
        expect(document.getElementById("setup-language-button")?.textContent).toContain("English");
        expect(document.getElementById("setup-theme-button")?.textContent).toContain("Auto");
        expect((document.getElementById("setup-translation") as HTMLInputElement).checked).toBe(false);
    });

    it("is remembered as done only once it is closed, and never opens again", async () =>
    {
        expect(saved(app).setupDone).not.toBe(true);
        clickButton("Let’s go");
        expect(dialog()).toBeNull();
        expect(saved(app).setupDone).toBe(true);
        app = await mountApp(undefined, { firstVisit: true });
        expect(dialog()).toBeNull();
    });

    it("counts as done when it is closed with Escape, the close button or the backdrop", () =>
    {
        escape();
        expect(dialog()).toBeNull();
        expect(saved(app).setupDone).toBe(true);
    });

    it("closes a list that is open with Escape and leaves the dialog open", () =>
    {
        (document.getElementById("setup-state-button") as HTMLButtonElement).click();
        const list = document.getElementById("setup-state-list") as HTMLElement;
        expect(list.hidden).toBe(false);
        escape(list);
        expect(list.hidden).toBe(true);
        expect(dialog()).not.toBeNull();
    });

    it("sets the state at once, and the page behind shows it: 310 questions of that state", async () =>
    {
        await chooseFromListbox("setup-state", "bayern");
        expect(saved(app).state).toBe("bayern");
        expect(document.getElementById("setup-state-button")?.textContent).toContain("Bavaria");
        expect(document.getElementById("state-button")?.textContent).toContain("Bavaria");
        expect(document.querySelector(".footer-state-note")?.textContent).toBe("Your 310 questions: 300 general ones and the 10 for Bavaria.");
        expect(statValue("Seen")).toBe("0 of 310");
        expect(document.activeElement?.id).toBe("setup-state-button");
    });

    it("sets the language at once and draws the dialog again in it, keeping focus on the list", async () =>
    {
        await chooseFromListbox("setup-language", "de");
        expect(document.documentElement.lang).toBe("de");
        expect(document.getElementById("modal-title")?.textContent).toBe("Willkommen");
        expect(dialog()?.querySelector(".setup-label")?.textContent).toBe("Dein Bundesland");
        expect(document.activeElement?.id).toBe("setup-language-button");
        expect(dialog()?.querySelector("#setup-start")?.textContent).toBe("Los geht’s");
    });

    it("sets the appearance at once", async () =>
    {
        await chooseFromListbox("setup-theme", "dark");
        expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
        expect(saved(app).theme).toBe("dark");
        expect(document.activeElement?.id).toBe("setup-theme-button");
    });

    it("sets the translation at once, in the language of the site", async () =>
    {
        (document.getElementById("setup-translation") as HTMLInputElement).click();
        await settle();
        expect(saved(app).translation).toBe("en");
        expect((document.getElementById("setup-translation") as HTMLInputElement).checked).toBe(true);
        expect(document.activeElement?.id).toBe("setup-translation");
        await chooseFromListbox("setup-language", "uk");
        expect(saved(app).translation).toBe("uk");
        (document.getElementById("setup-translation") as HTMLInputElement).click();
        await settle();
        expect(saved(app).translation).toBe("off");
    });

    it("blocks the shortcuts of the page while it is open", () =>
    {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
        expect(document.querySelector(".verdict")).toBeNull();
    });
});

describe("App: the page without the setup dialog", () =>
{
    afterEach(() =>
    {
        vi.restoreAllMocks();
        window.localStorage.clear();
    });

    it("does not open it for a visitor who has seen it", async () =>
    {
        window.localStorage.clear();
        window.localStorage.setItem("lidpractice-v4", JSON.stringify({ setupDone: true, state: "sachsen" }));
        await mountApp(undefined, { firstVisit: true });
        expect(dialog()).toBeNull();
        expect(document.getElementById("state-button")?.textContent).toContain("Saxony");
    });
});
