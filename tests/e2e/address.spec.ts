import type { Page } from "@playwright/test";
import { appDrawn, chooseFromListbox, expect, finishAnyway, openApp, pressOption, SEARCH_TITLE, test } from "./fixtures";

/** The tabs that have one page each, with the name on their tab and something only their page shows. */
const TABS = [
    { name: "practice", label: "Practice", sign: ".timeline" },
    { name: "train", label: "Train", sign: "#train-next" },
    { name: "exam", label: "Exam (33)", sign: "text=Start exam" },
] as const;

/**
 * Expects one tab to be the one that shows, with its page.
 * @param page Playwright page.
 * @param name The name of the tab.
 */
async function expectTab(page: Page, name: (typeof TABS)[number]["name"]): Promise<void>
{
    const tab = TABS.find((entry) => entry.name === name) as (typeof TABS)[number];
    await expect(page.locator(`#tab-${name}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(tab.sign).first()).toBeVisible();
}

test.describe("the addresses of the tabs", () =>
{
    test("name the tab that is opened, and the Back and Forward buttons of the browser go from tab to tab", async ({ page }) =>
    {
        await openApp(page);
        // The plain address of the site is practice, and stays plain.
        await expectTab(page, "practice");
        await expect(page).toHaveURL(/\/$/);
        await page.getByRole("tab", { name: "Train" }).click();
        await expect(page).toHaveURL(/\/#train$/);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await expect(page).toHaveURL(/\/#exam$/);
        await page.getByRole("tab", { name: "Practice" }).click();
        await expect(page).toHaveURL(/\/#practice$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/#exam$/);
        await expectTab(page, "exam");
        await page.goBack();
        await expect(page).toHaveURL(/\/#train$/);
        await expectTab(page, "train");
        await page.goBack();
        await expect(page).toHaveURL(/\/$/);
        await expectTab(page, "practice");
        await page.goForward();
        await expect(page).toHaveURL(/\/#train$/);
        await expectTab(page, "train");
    });

    test("name what shows in the title of the browser tab: the tab or the lesson, and the title of the start page at its plain address", async ({ page }) =>
    {
        await openApp(page);
        await expect(page).toHaveTitle(SEARCH_TITLE);
        await page.getByRole("tab", { name: "Train" }).click();
        await expect(page).toHaveTitle("Train | LiD Practice");
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await expect(page).toHaveTitle("Exam (33) | LiD Practice");
        await page.getByRole("tab", { name: "Practice" }).click();
        await expect(page).toHaveTitle("Practice | LiD Practice");
        await page.getByRole("tab", { name: "Learn" }).click();
        await expect(page).toHaveTitle("Learn | LiD Practice");
        const row = page.locator(".lesson-row").first();
        const lesson = await row.locator(".lesson-title").innerText();
        await row.click();
        await expect(page).toHaveTitle(`${lesson} | LiD Practice`);
        // Every step of the history has the name of its page.
        await page.goBack();
        await expect(page).toHaveTitle("Learn | LiD Practice");
        await page.goBack();
        await expect(page).toHaveTitle("Practice | LiD Practice");
        await page.goBack();
        await page.goBack();
        await expect(page).toHaveTitle("Train | LiD Practice");
        await page.goBack();
        await expect(page).toHaveTitle(SEARCH_TITLE);
    });

    test("name the lesson in the title when the page is opened by a link to a lesson, in the language of the site", async ({ page }) =>
    {
        await openApp(page, { place: "#learn/timeline" });
        await expect(page).toHaveTitle("Timeline: 1933 to today | LiD Practice");
        await page.goto("/#learn/maps");
        await expect(page).toHaveTitle("Maps | LiD Practice");
        await chooseFromListbox(page, "site-language", "de");
        await expect(page).toHaveTitle("Landkarten | LiD Practice");
    });

    test("keep the tab that was open last when the plain address is reloaded or opened again", async ({ page, context }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Train" }).click();
        // The address the user types or has bookmarked: the plain one.
        await page.goto("/");
        await expectTab(page, "train");
        await expect(page).toHaveURL(/\/#train$/);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await page.reload();
        await expectTab(page, "exam");
        // A new window of the same browser, later.
        const again = await context.newPage();
        await again.goto("/");
        await expect(again.locator("#tab-exam")).toHaveAttribute("aria-selected", "true");
        await expect(again).toHaveTitle("Exam (33) | LiD Practice");
        // Back in practice, the plain address stays plain.
        await again.getByRole("tab", { name: "Practice" }).click();
        await again.goto("/");
        await expect(again.locator("#tab-practice")).toHaveAttribute("aria-selected", "true");
        await expect(again).toHaveURL(/\/$/);
    });

    for (const tab of TABS)
    {
        test(`open ${tab.name} by its link, and a reload stays on it`, async ({ page }) =>
        {
            await openApp(page, { place: `#${tab.name}` });
            await expectTab(page, tab.name);
            await expect(page).toHaveURL(new RegExp(`/#${tab.name}$`));
            await page.reload();
            await appDrawn(page);
            await expectTab(page, tab.name);
            await expect(page).toHaveURL(new RegExp(`/#${tab.name}$`));
        });
    }

    test("lead to the tab that is typed into the address bar while the page is open, and put an address right that names none", async ({ page }) =>
    {
        await openApp(page);
        await page.goto("/#train");
        await expectTab(page, "train");
        await page.goto("/#exam");
        await expectTab(page, "exam");
        await page.goto("/#somewhere");
        await expectTab(page, "practice");
        await expect(page).toHaveURL(/\/#practice$/);
        await page.goto("/#train/");
        await expectTab(page, "train");
        await expect(page).toHaveURL(/\/#train$/);
    });

    test("go along with the keyboard: the arrow keys in the row of tabs change the address, and Back brings the keyboard to the tab before", async ({ page }) =>
    {
        await openApp(page);
        await page.locator("#tab-practice").focus();
        await page.keyboard.press("ArrowRight");
        await expect(page).toHaveURL(/\/#train$/);
        await expect(page.locator("#tab-train")).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(page).toHaveURL(/\/#exam$/);
        await page.goBack();
        await expectTab(page, "train");
        await expect(page.locator("#tab-train")).toBeFocused();
    });

    test("do not lead out of a running exam: the Back button leaves the exam as it is", async ({ page }) =>
    {
        await openApp(page);
        await page.getByRole("tab", { name: "Train" }).click();
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await page.getByRole("button", { name: "Start exam" }).click();
        await expect(page.locator(".exam-progress")).toHaveText("Question 1 of 33");
        await pressOption(page, 0);
        await page.getByRole("button", { name: "Next" }).click();
        await expect(page.locator(".exam-progress")).toHaveText("Question 2 of 33");
        await page.goBack();
        await expect(page).toHaveURL(/\/#exam$/);
        await expect(page.locator("#tab-exam")).toHaveAttribute("aria-selected", "true");
        await expect(page.locator(".exam-progress")).toHaveText("Question 2 of 33");
        // Once it is finished, the address leads to the other tabs again.
        await page.locator("#exam-finish").click();
        await finishAnyway(page);
        await expect(page.locator("#exam-result")).toBeVisible();
        await page.goto("/#train");
        await expectTab(page, "train");
    });
});
