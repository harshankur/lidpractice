import type { Locator, Page } from "@playwright/test";
import { expect, openApp, test } from "./fixtures";

/**
 * The legal notice and the privacy notice that every site of the author shares; the privacy link opens this site's section, in
 * German for a German page and in English for any other.
 */
const LEGAL_NOTICE_URL = "https://harshankur.com/impressum";
const PRIVACY_NOTICE_URL = "https://harshankur.com/datenschutz#lidpractice";
const PRIVACY_NOTICE_URL_ENGLISH = "https://harshankur.com/datenschutz#en-lidpractice";

/** The copyright line, as it reads on every page. */
const COPYRIGHT = "LiD Practice © 2026 Harsh Ankur";

/** An address the site does not have, deeper than the root, so the 404 page has to address everything from the root. */
const MISSING_ADDRESS = "/no/such/page";

/** The names of the two legal links in the app in English, the language it opens in. */
const ENGLISH_LABELS = ["Legal notice", "Privacy"] as const;

/**
 * Checks the end of a page: the line with the two legal links, and right below it the copyright line.
 * @param container What holds the two lines.
 * @param labels The names of the legal notice link and of the privacy link, as the page shows them.
 */
async function expectLegalFooter(container: Locator, labels: readonly [string, string], privacyUrl = PRIVACY_NOTICE_URL_ENGLISH): Promise<void>
{
    const legal = container.locator(".site-legal");
    const copyright = container.locator(".site-copyright");
    await expect(legal.getByRole("link")).toHaveCount(2);
    await expect(legal.getByRole("link", { name: labels[0], exact: true })).toHaveAttribute("href", LEGAL_NOTICE_URL);
    await expect(legal.getByRole("link", { name: labels[1], exact: true })).toHaveAttribute("href", privacyUrl);
    await expect(copyright).toHaveText(COPYRIGHT);
    for (const link of await container.locator(".site-legal a, .site-copyright a").all())
    {
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener");
    }
    const legalBox = await legal.boundingBox();
    const copyrightBox = await copyright.boundingBox();
    expect(legalBox && copyrightBox && legalBox.y + legalBox.height <= copyrightBox.y).toBe(true);
}

/**
 * Every address the page fetched by itself, from the browser's own list.
 * @param page Playwright page.
 * @returns The addresses.
 */
async function fetchedAddresses(page: Page): Promise<string[]>
{
    return page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
}

test.describe("footer of the app", () =>
{
    test("ends with the legal links in a line of their own and the copyright line below, in every mode", async ({ page }) =>
    {
        await openApp(page);
        await expectLegalFooter(page.locator("footer.site-footer"), ENGLISH_LABELS);
        await page.getByRole("tab", { name: "Exam (33)" }).click();
        await expectLegalFooter(page.locator("footer.site-footer"), ENGLISH_LABELS);
    });

    test("names the legal links in German in German", async ({ page }) =>
    {
        await openApp(page, { locale: "de" });
        await expectLegalFooter(page.locator("footer.site-footer"), ["Impressum", "Datenschutz"], PRIVACY_NOTICE_URL);
    });

    test("names the legal links in Arabic in Arabic", async ({ page }) =>
    {
        await openApp(page, { locale: "ar" });
        await expectLegalFooter(page.locator("footer.site-footer"), ["إشعار قانوني", "الخصوصية"]);
    });

    test("fetches nothing from another server", async ({ page }) =>
    {
        await openApp(page);
        const origin = new URL(page.url()).origin;
        const addresses = await fetchedAddresses(page);
        expect(addresses.length).toBeGreaterThan(0);
        expect(addresses.filter((address) => new URL(address).origin !== origin)).toEqual([]);
    });
});

test.describe("page for an address that does not exist", () =>
{
    test("answers 404 in German and English, with a way home, the legal links and the copyright line", async ({ page, allowedErrors }) =>
    {
        allowedErrors.push(/http 404: .*\/no\/such\/page$/, /console: Failed to load resource: .*404/);
        const response = await page.goto(MISSING_ADDRESS);
        expect(response?.status()).toBe(404);
        await expect(page.getByRole("heading", { name: "Seite nicht gefunden" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
        // German first, as the page is.
        await expectLegalFooter(page.locator("footer"), ["Impressum / Legal notice", "Datenschutz / Privacy"], PRIVACY_NOTICE_URL);
        // The fonts come from the root of the site even this deep, and nothing comes from anywhere else.
        const origin = new URL(page.url()).origin;
        await page.evaluate(() => document.fonts.ready);
        const fonts = (await fetchedAddresses(page)).filter((address) => address.endsWith(".woff2"));
        expect(fonts.length).toBeGreaterThan(0);
        for (const font of fonts)
        {
            expect(font.startsWith(`${origin}/fonts/`), font).toBe(true);
        }
        await page.getByRole("link", { name: "Go to the start page of LiD Practice" }).click();
        await expect(page).toHaveURL(`${origin}/`);
        await expect(page.locator("footer.site-footer")).toBeVisible();
    });
});

test.describe("without JavaScript", () =>
{
    test.use({ javaScriptEnabled: false });

    test("says that the page needs JavaScript, and still shows the legal links and the copyright line", async ({ page }) =>
    {
        await page.goto("/");
        const noscript = page.locator("noscript");
        await expect(noscript.locator(".noscript-text span[lang=en]")).toHaveText("This page needs JavaScript.");
        await expect(noscript.locator(".noscript-text span[lang=de]")).toBeVisible();
        // English first, as the page is.
        await expectLegalFooter(noscript, ["Legal notice / Impressum", "Privacy / Datenschutz"]);
        // The heading the page is built with comes first, then what the site is for, the note, and the copyright line last.
        const heading = page.getByRole("heading", { level: 1 });
        await expect(heading).toHaveAccessibleName("LiD Practice Einbürgerungstest · Leben in Deutschland · 310 questions");
        await expect(noscript.locator(".noscript-intro")).toContainText("A free study aid for the German citizenship test (Einbürgerungstest)");
        const tops = await Promise.all([heading, noscript.locator(".noscript-intro"), noscript.locator(".noscript-text"), noscript.locator(".site-copyright")]
            .map(async (part) => (await part.boundingBox())?.y ?? Number.NaN));
        expect([...tops].sort((first, second) => first - second)).toEqual(tops);
    });
});
