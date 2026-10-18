import { readFileSync } from "node:fs";
import type { Locator, Page, Route } from "@playwright/test";
import { expect, openApp, STORAGE_KEY, test } from "./fixtures";

/**
 * The question about counting in detail, in a real browser. The page asks it on the live site only, so these tests open
 * the built site under its live address: every request to it is answered from the local server of the tests, and the
 * counter's consent script is answered by a stand-in, so nothing leaves the machine. The page itself is the one that
 * is deployed, with no switch for tests.
 */

/** The live site. */
const LIVE = "https://lidpractice.de";

/** The counter's consent script, as the page asks for it. */
const CONSENT_SCRIPT = "https://views.harshankur.com/consent.js";

/** The local server of the tests, which serves the built site. */
const LOCAL = "http://localhost:8081";

/** The key the stand-in keeps the answer under, as the counter's script does. */
const ANSWER_KEY = "viewcounter-consent:lidpractice";

/** The Content-Security-Policy the host sends with every page, read from the headers file of the site. */
const POLICY = (/^\s*Content-Security-Policy:\s*(.+)$/m.exec(readFileSync("public/_headers", "utf8")) as RegExpExecArray)[1];

/**
 * A stand-in for the counter's consent script: it keeps the answer where the real one does and offers the same API.
 * It never loads the counter. Its own prompt counts as a call, so a test can tell the page never uses it.
 */
const STAND_IN = `(() => {
    const calls = [];
    const fire = (status) => window.dispatchEvent(new CustomEvent("viewcounter:consent", { detail: { status } }));
    const decide = (status) => { calls.push(status === "granted" ? "grant" : "deny"); localStorage.setItem(${JSON.stringify(ANSWER_KEY)}, status); fire(status); };
    window.consentCalls = calls;
    window.viewcounterConsent = Object.freeze({
        status: () => localStorage.getItem(${JSON.stringify(ANSWER_KEY)}) || "unset",
        grant: () => decide("granted"),
        deny: () => decide("denied"),
        open: () => calls.push("open"),
    });
})();`;

/** Options of {@link openLive}. */
interface LiveOptions
{
    locale?: "en" | "de" | "ar";
    theme?: "light" | "dark";
    /** The answer given on an earlier visit. */
    answer?: "granted" | "denied";
}

/** The requests the stand-in for the counter answered, by test. */
const counterRequests = new WeakMap<Page, string[]>();

/**
 * Opens the built site under its live address, with the first-visit setup done.
 * @param page Playwright page.
 * @param allowedErrors The fixture's list of what a test may provoke: the request for the counter's script, which goes to another host by design.
 * @param options Language, theme and an earlier answer.
 */
async function openLive(page: Page, allowedErrors: RegExp[], options: LiveOptions = {}): Promise<void>
{
    allowedErrors.push(/^third party request: https:\/\/views\.harshankur\.com\/consent\.js$/);
    const seen: string[] = [];
    counterRequests.set(page, seen);
    await page.route(`${LIVE}/**`, async (route: Route) =>
    {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${LOCAL}${url.pathname}${url.search}` });
        const isPage = (response.headers()["content-type"] ?? "").startsWith("text/html");
        await route.fulfill({ response, headers: isPage ? { ...response.headers(), "content-security-policy": POLICY } : response.headers() });
    });
    await page.route("https://views.harshankur.com/**", async (route: Route) =>
    {
        seen.push(route.request().url());
        await route.fulfill({ status: 200, contentType: "text/javascript", body: STAND_IN });
    });
    await page.addInitScript(([key, value, answerKey, answer]) =>
    {
        if (!window.sessionStorage.getItem("e2e-seeded"))
        {
            window.localStorage.setItem(key, value);
            if (answer)
            {
                window.localStorage.setItem(answerKey, answer);
            }
            window.sessionStorage.setItem("e2e-seeded", "1");
        }
    }, [STORAGE_KEY, JSON.stringify({ setupDone: true, theme: options.theme ?? "light" }), ANSWER_KEY, options.answer ?? ""]);
    await page.goto(`${LIVE}/?lang=${options.locale ?? "en"}`);
    await expect(page.locator("h1")).toHaveText("LiD Practice");
}

/**
 * The box of an element on the screen.
 * @param locator The element.
 */
async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }>
{
    return (await locator.boundingBox()) as { x: number; y: number; width: number; height: number };
}

/** Whether two boxes share any area. */
function overlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean
{
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * What makes a button look like it does: two answers of equal weight have the same values.
 * @param locator The button.
 */
function look(locator: Locator): Promise<string[]>
{
    return locator.evaluate((element) =>
    {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.color, style.fontWeight, style.fontSize, style.borderTopWidth, style.borderTopColor, style.borderRadius, style.paddingTop];
    });
}

test.describe("the question about counting in detail, on the live site", () =>
{
    for (const theme of ["light", "dark"] as const)
    {
        test(`asks in a card that leaves the row of buttons free, with two answers of equal weight (${theme})`, async ({ page, isMobile, allowedErrors }) =>
        {
            await openLive(page, allowedErrors, { theme });
            const card = page.locator("#consent");
            await expect(card).toBeVisible();
            expect(counterRequests.get(page)).toEqual([CONSENT_SCRIPT]);
            // It takes no focus when it comes up by itself, and is told once to a screen reader.
            expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
            await expect(page.locator("#consent-announce")).toHaveText("A question about usage statistics is waiting at the bottom of the page.");
            const viewport = page.viewportSize() as { width: number; height: number };
            const frame = await box(card);
            if (isMobile)
            {
                expect(frame.x).toBe(0);
                expect(frame.width).toBe(viewport.width);
            }
            else
            {
                expect(Math.round(viewport.width - (frame.x + frame.width))).toBe(16);
                expect(frame.width).toBeLessThanOrEqual(360);
            }
            expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height);
            // The row of buttons that sticks to the bottom edge stays free, wherever the page is scrolled: nothing of the card lies on it.
            const row = page.locator(".nav-row").first();
            await expect(page.locator("#round-next")).toBeInViewport({ ratio: 1 });
            expect(await page.locator("#round-next").evaluate((button) =>
            {
                const rect = button.getBoundingClientRect();
                return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
            })).toBe(true);
            for (const share of [0, 0.5, 1])
            {
                await page.evaluate((part) => window.scrollTo(0, part * document.documentElement.scrollHeight), share);
                expect(overlap(await box(card), await box(row)), `scrolled to ${share}`).toBe(false);
            }
            // Two answers of equal weight: side by side, the same size and the same look.
            const allow = page.locator("#consent-allow");
            const deny = page.locator("#consent-deny");
            const [a, d] = [await box(allow), await box(deny)];
            expect(a.y).toBe(d.y);
            expect(a.width).toBeCloseTo(d.width, 0);
            expect(a.height).toBe(d.height);
            expect(a.height).toBeGreaterThanOrEqual(isMobile ? 44 : 40);
            expect(await look(allow)).toEqual(await look(deny));
            // The card is drawn with the tokens of the theme: the surface of the widgets, never a colour of its own.
            const surface = await page.locator(".widget").first().evaluate((element) => getComputedStyle(element).backgroundColor);
            expect(await card.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(surface);
            expect(surface).toBe(theme === "dark" ? "rgb(24, 28, 36)" : "rgb(255, 255, 255)");
            // The end of the page can be scrolled into view above the card.
            await page.locator("#privacy-settings").scrollIntoViewIfNeeded();
            const settings = await box(page.locator("#privacy-settings"));
            expect(overlap(await box(card), settings)).toBe(false);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        });
    }

    test("asks in Arabic from right to left: in the left corner on a wide screen, the first answer at the right", async ({ page, isMobile, allowedErrors }) =>
    {
        await openLive(page, allowedErrors, { locale: "ar" });
        const card = page.locator("#consent");
        await expect(card).toBeVisible();
        await expect(page.locator("#consent-title")).toHaveText("إحصاءات الاستخدام");
        expect(await card.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
        const frame = await box(card);
        if (!isMobile)
        {
            expect(Math.round(frame.x)).toBe(16);
        }
        const [allow, deny] = [await box(page.locator("#consent-allow")), await box(page.locator("#consent-deny"))];
        expect(allow.x).toBeGreaterThan(deny.x);
        expect(allow.width).toBeCloseTo(deny.width, 0);
        expect(allow.height).toBe(deny.height);
        // The close button sits at the end of the head, the left in Arabic.
        expect((await box(page.locator("#consent-close"))).x).toBeLessThan((await box(page.locator("#consent-title"))).x);
        expect(overlap(frame, await box(page.locator(".nav-row").first()))).toBe(false);
        await expect(page.locator("#consent-privacy")).toHaveAttribute("href", "https://harshankur.com/datenschutz#en-lidpractice");
        await expect(page.locator("script[src='https://views.harshankur.com/consent.js']")).toHaveAttribute("data-privacy-url", "https://harshankur.com/datenschutz#en-lidpractice");
    });

    test("hands the answer over, asks no more, and lets the answer be changed from Privacy settings with the keyboard", async ({ page, allowedErrors }) =>
    {
        await openLive(page, allowedErrors, { locale: "de" });
        await expect(page.locator("#consent")).toBeVisible();
        const script = page.locator("script[src='https://views.harshankur.com/consent.js']");
        await expect(script).toHaveAttribute("data-privacy-url", "https://harshankur.com/datenschutz#lidpractice");
        for (const [name, value] of Object.entries({ "data-app": "lidpractice", "data-hosts": "lidpractice.de,www.lidpractice.de", "data-ui": "none", "data-hash": "#learn,#practice,#train,#exam", "data-hash-depth": "2", "data-outbound": "false", "data-downloads": "false" }))
        {
            await expect(script).toHaveAttribute(name, value);
        }
        await page.locator("#consent-allow").click();
        await expect(page.locator("#consent")).toHaveCount(0);
        expect(await page.evaluate(() => (window as unknown as { consentCalls: string[] }).consentCalls)).toEqual(["grant"]);
        await page.locator("#tab-train").click();
        // The counter sends the title: while it counts, the title is the plain name, in no language.
        await expect(page).toHaveTitle("LiD Practice");
        await page.reload();
        await expect(page.locator("h1")).toHaveText("LiD Practice");
        await expect(page.locator("#consent")).toHaveCount(0);
        await expect(page).toHaveTitle("LiD Practice");
        const settings = page.locator("#privacy-settings");
        await expect(settings).toHaveText("Datenschutz-Einstellungen");
        await settings.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#consent-title")).toBeFocused();
        await expect(page.locator("#consent-current")).toHaveText("Deine aktuelle Antwort: erlaubt.");
        await page.keyboard.press("Tab");
        await expect(page.locator("#consent-close")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator("#consent-privacy")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator("#consent-allow")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator("#consent-deny")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#consent")).toHaveCount(0);
        await expect(settings).toBeFocused();
        await expect(page).toHaveTitle("Trainieren | LiD Practice");
        await settings.press("Enter");
        await expect(page.locator("#consent-current")).toHaveText("Deine aktuelle Antwort: nicht erlaubt.");
        await page.keyboard.press("Escape");
        await expect(page.locator("#consent")).toHaveCount(0);
        await expect(settings).toBeFocused();
        expect(await page.evaluate(() => (window as unknown as { consentCalls: string[] }).consentCalls)).toEqual(["deny"]);
    });

    test("keeps a section of a lesson and the state out of the address the counter reads", async ({ page, allowedErrors }) =>
    {
        await openLive(page, allowedErrors, { answer: "granted" });
        await page.locator("#tab-learn").click();
        await page.locator("#lesson-land-berlin").click();
        await expect(page.locator(".lesson-head h2")).toHaveText("Your state: Berlin");
        await expect(page).toHaveURL(`${LIVE}/#learn/land`);
        await expect(page).toHaveTitle("LiD Practice");
    });
});

test.describe("the question about counting in detail, anywhere else", () =>
{
    test("is never asked, loads nothing, and Privacy settings says that nothing is counted here", async ({ page }) =>
    {
        await openApp(page);
        await page.waitForTimeout(300);
        await expect(page.locator("#consent")).toHaveCount(0);
        await expect(page.locator("script[src]")).toHaveCount(0);
        await page.locator("#privacy-settings").click();
        await expect(page.locator("#consent-unavailable")).toHaveText("Nothing is counted at this address, so there is nothing to answer here.");
        await expect(page.locator("#consent button")).toHaveCount(1);
        await expect(page.locator("#consent-title")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator("#consent")).toHaveCount(0);
        await expect(page.locator("#privacy-settings")).toBeFocused();
    });
});
