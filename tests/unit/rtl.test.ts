// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_STRONG_ISOLATE, I18n, POP_ISOLATE } from "../../src/i18n";
import { shortcutKey } from "../../src/keys";
import { questionMailtoUrl } from "../../src/links";
import ar from "../../src/locales/ar.json";
import { chooseFromListbox, mountApp, nextButton, shownNumber, settle } from "../helpers/appHarness";
import { registerAllCatalogs } from "../helpers/catalogs";

/** Dispatches a keydown the way a keyboard does, with the character and the physical key. */
function press(key: string, code: string, target: EventTarget = document): void
{
    target.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
}

beforeAll(() => registerAllCatalogs());

describe("shortcut keys", () =>
{
    it("keeps Latin letters and digits, and the named keys, in lower case", () =>
    {
        expect(shortcutKey("A", "KeyA")).toBe("a");
        expect(shortcutKey("1", "Digit1")).toBe("1");
        expect(shortcutKey("Enter", "Enter")).toBe("enter");
        expect(shortcutKey("ArrowLeft", "ArrowLeft")).toBe("arrowleft");
    });

    it("keeps the letter of the layout when it is Latin, so AZERTY and Dvorak keep what the user sees", () =>
    {
        expect(shortcutKey("a", "KeyQ")).toBe("a");
        expect(shortcutKey("1", "KeyP")).toBe("1");
    });

    it.each([["٣", "3"], ["٠", "0"], ["۴", "4"], ["३", "3"], ["१", "1"]])("reads the digit %s as %s", (typed, expected) =>
    {
        expect(shortcutKey(typed, "")).toBe(expected);
    });

    it("takes the letter on the physical key when the layout types another script", () =>
    {
        expect(shortcutKey("ش", "KeyA")).toBe("a");
        expect(shortcutKey("т", "KeyN")).toBe("n");
        expect(shortcutKey("ф", "KeyA")).toBe("a");
        expect(shortcutKey("ٱ", "Digit2")).toBe("2");
        expect(shortcutKey("?", "Numpad3")).toBe("3");
    });

    it("leaves a character alone that has no physical key to fall back on", () =>
    {
        expect(shortcutKey("ش", "")).toBe("ش");
        expect(shortcutKey("?", "Slash")).toBe("?");
    });
});

describe("isolating values in a right to left sentence", () =>
{
    it("wraps a text value, but not a number, in Arabic", () =>
    {
        const text = new I18n("ar").t("round.summary", { what: "Berlin", count: "3" });
        expect(text).toContain(`${FIRST_STRONG_ISOLATE}Berlin${POP_ISOLATE}`);
        expect(new I18n("ar").t("stats.seenValue", { seen: 4, total: 310 })).not.toContain(FIRST_STRONG_ISOLATE);
    });

    it("leaves every left to right language alone", () =>
    {
        for (const code of ["de", "en", "uk", "tr", "es", "hi"] as const)
        {
            expect(new I18n(code).t("round.summary", { what: "Berlin", count: "3" }), code).not.toContain(FIRST_STRONG_ISOLATE);
        }
    });

    it("keeps the marks out of an email, whatever the language of the page is", async () =>
    {
        const app = await mountApp(undefined, { locale: "ar" });
        expect(app.STORAGE_KEY).toBeTruthy();
        const address = decodeURIComponent(questionMailtoUrl(12, 5));
        expect(address).not.toContain(FIRST_STRONG_ISOLATE);
        expect(address).not.toContain(POP_ISOLATE);
    });

    it("has every Latin phrase of the Arabic interface between isolates, except the keys of a shortcut that stands alone", () =>
    {
        const latin = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9]*(?:[ .\-/&'][A-Za-zÀ-ɏ0-9]+)*/g;
        for (const [key, value] of Object.entries(ar))
        {
            if (key.startsWith("mail."))
            {
                expect(value, key).not.toContain(FIRST_STRONG_ISOLATE);
                continue;
            }
            const text = value.replace(/\{\w+\}/g, "").replace(/\]\(\w+\)/g, "]");
            for (const match of text.matchAll(latin))
            {
                const letters = match[0].replace(/[^A-Za-zÀ-ɏ]/g, "");
                if (letters.length >= 2)
                {
                    const before = text[(match.index as number) - 1];
                    const after = text[(match.index as number) + match[0].length];
                    expect(before === FIRST_STRONG_ISOLATE && after === POP_ISOLATE, `${key}: ${match[0]}`).toBe(true);
                }
            }
        }
    });
});

describe("the page in Arabic", () =>
{
    beforeEach(() =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        window.localStorage.clear();
    });

    it("takes the left arrow for the next question and the right arrow for the one before, because the buttons are mirrored", async () =>
    {
        await mountApp(undefined, { locale: "ar" });
        const first = shownNumber();
        press("1", "Digit1");
        press("ArrowLeft", "ArrowLeft");
        const second = shownNumber();
        expect(second).not.toBe(first);
        press("ArrowRight", "ArrowRight");
        expect(shownNumber()).toBe(first);
        expect(nextButton()).not.toBeNull();
    });

    it("keeps the right arrow for the next question in every left to right language", async () =>
    {
        await mountApp(undefined, { locale: "en" });
        const first = shownNumber();
        press("1", "Digit1");
        press("ArrowRight", "ArrowRight");
        expect(shownNumber()).not.toBe(first);
        press("ArrowLeft", "ArrowLeft");
        expect(shownNumber()).toBe(first);
    });

    it("moves to the next tab with the left arrow", async () =>
    {
        await mountApp(undefined, { locale: "ar" });
        press("ArrowLeft", "ArrowLeft", document.getElementById("tab-practice") as HTMLElement);
        expect(document.getElementById("tab-train")?.getAttribute("aria-selected")).toBe("true");
        press("ArrowRight", "ArrowRight", document.getElementById("tab-train") as HTMLElement);
        expect(document.getElementById("tab-practice")?.getAttribute("aria-selected")).toBe("true");
    });

    it("answers with the keys of an Arabic keyboard: digits of its own script and the letters on the keys A to D", async () =>
    {
        await mountApp(undefined, { locale: "ar" });
        press("٢", "Digit2");
        expect(document.querySelectorAll(".option.is-selected, .option.is-wrong, .option.is-correct").length).toBeGreaterThan(0);
        press("ن", "KeyN");
        expect(document.querySelector(".verdict")).not.toBeNull();
    });

    it("switches the translation with the T key on a Ukrainian keyboard", async () =>
    {
        await mountApp(undefined, { locale: "uk" });
        press("е", "KeyT");
        await settle();
        expect(document.querySelector(".bi-sub")).not.toBeNull();
    });

    it("writes the hint for the arrow keys the way they work in the mirrored page", async () =>
    {
        await mountApp(undefined, { locale: "ar" });
        const hint = document.querySelector(".kbd-help .hint")?.textContent ?? "";
        expect(hint).toContain("السهم الأيسر: التالي");
        expect(hint).toContain("السهم الأيمن: عرض السؤال السابق");
        await mountApp(undefined, { locale: "en" });
        expect(document.querySelector(".kbd-help .hint")?.textContent).toContain("Enter or right arrow: next or skip");
    });

    it("names the two timeline arrows by what they do, not by a side", async () =>
    {
        await mountApp(undefined, { locale: "en" });
        const names = Array.from(document.querySelectorAll(".timeline-scroll")).map((button) => button.getAttribute("aria-label"));
        expect(names).toEqual(["Earlier questions", "Later questions"]);
        await chooseFromListbox("site-language", "ar");
        expect(Array.from(document.querySelectorAll(".timeline-scroll")).map((button) => button.getAttribute("aria-label"))).toEqual(["الأسئلة السابقة", "الأسئلة التالية"]);
    });

    it("mirrors the arrows that mean back and forward, and not the others", async () =>
    {
        await mountApp(undefined, { locale: "ar" });
        expect(document.querySelectorAll("#round-back .icon-dir, #round-next .icon-dir")).toHaveLength(2);
        expect(document.querySelector("#clock-toggle .icon-dir")).toBeNull();
        expect(document.querySelectorAll(".timeline-scroll .icon-dir")).toHaveLength(2);
    });
});
