import type { Page } from "@playwright/test";
import { answerExam, expect, finishAnyway, openApp, STORAGE_KEY, test, weakState } from "./fixtures";

/** Controls whose popup is drawn by the browser or the operating system. */
const NATIVE_POPUP_CONTROLS = "select, datalist, input[type=date], input[type=datetime-local], input[type=time], input[type=month], input[type=week], input[type=color]";

/** How long an error message stays visible, in milliseconds. */
const TOAST_MS = 6000;

/** Time the fake clock may already have run while the page was loading. */
const LOAD_MARGIN_MS = 2500;

/**
 * Fails on anything that opens a window or a box that the browser draws.
 * @param page Playwright page.
 * @param opened Collects what was opened.
 */
function watchForNativePopups(page: Page, opened: string[]): void
{
    page.on("dialog", async (dialog) =>
    {
        opened.push(`${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss();
    });
    page.on("popup", (popup) => opened.push(`window: ${popup.url()}`));
}

test.describe("nothing the browser or the operating system draws", () =>
{
    test("no native popup control exists in any view, and nothing opens a window or a browser dialog", async ({ page }) =>
    {
        const opened: string[] = [];
        watchForNativePopups(page, opened);
        await openApp(page, weakState([21, 55]));
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await page.locator("#translation-button").click();
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await page.keyboard.press("Escape");
        await page.locator("#change-selection").click();
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await expect(page.locator("input[type=checkbox]").first()).toBeVisible();
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await page.getByRole("button", { name: "Start exam" }).click();
        await answerExam(page, 5, 30);
        await page.getByRole("button", { name: "Finish exam" }).click();
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await finishAnyway(page);
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await page.locator(".site-footer-links .link-button").first().click();
        await expect(page.locator(NATIVE_POPUP_CONTROLS)).toHaveCount(0);
        await page.keyboard.press("Escape");
        expect(opened).toEqual([]);
    });

    test("asking to erase the progress is a two step button, not a browser confirm box", async ({ page }) =>
    {
        const opened: string[] = [];
        watchForNativePopups(page, opened);
        await openApp(page, weakState([5]));
        await page.getByRole("button", { name: "Reset progress" }).click();
        await expect(page.getByRole("button", { name: "Tap again to erase progress" })).toBeVisible();
        await page.getByRole("button", { name: "Tap again to erase progress" }).click();
        await expect(page.getByRole("button", { name: "Reset progress" })).toBeVisible();
        expect(opened).toEqual([]);
    });
});

test.describe("error message", () =>
{
    test("is an alert that disappears by itself", async ({ page, allowedErrors }) =>
    {
        allowedErrors.push(/console: SyntaxError/);
        await page.clock.install({ time: new Date("2026-01-01T10:00:00") });
        await page.addInitScript((key) => window.localStorage.setItem(key, "{broken"), STORAGE_KEY);
        await page.goto("/?lang=en");
        const toast = page.getByRole("alert");
        await expect(toast).toBeVisible();
        await expect(toast).toContainText("Something went wrong");
        // The clock also moved while the page loaded, so stay well clear of the limit on the first step.
        await page.clock.runFor(TOAST_MS - LOAD_MARGIN_MS);
        await expect(toast).toBeVisible();
        await page.clock.runFor(LOAD_MARGIN_MS);
        await expect(toast).toBeHidden();
    });

    test("is shown in the language of the interface", async ({ page, allowedErrors }) =>
    {
        allowedErrors.push(/console: SyntaxError/);
        await page.addInitScript((key) => window.localStorage.setItem(key, "{broken"), STORAGE_KEY);
        await page.goto("/?lang=de");
        await expect(page.getByRole("alert")).toContainText("Etwas ist schiefgelaufen");
    });
});

test.describe("status messages", () =>
{
    test("the answer verdict is announced politely, as a status", async ({ page }) =>
    {
        await openApp(page);
        await page.keyboard.press("a");
        await expect(page.getByRole("status")).toHaveCount(1);
    });
});
