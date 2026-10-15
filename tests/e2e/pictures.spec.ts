import type { Page } from "@playwright/test";
import { correctOptionIndex, expect, openApp, pressOption, QUESTIONS, shownNumber, test, weakState } from "./fixtures";

/** Questions that carry a picture. */
const PICTURE_NUMBERS = [21, 55, 70, 130, 176, 181, 187, 209, 216, 226, 235, ...Array.from({ length: 16 }, (_, state) => [301 + state * 10, 308 + state * 10]).flat()];

/** Photo credits and source notes that the catalogue prints under pictures. */
/** The ids of the federal states in the order of the catalogue. */
const STATE_IDS = ["baden-wuerttemberg", "bayern", "berlin", "brandenburg", "bremen", "hamburg", "hessen", "mecklenburg-vorpommern", "niedersachsen", "nordrhein-westfalen", "rheinland-pfalz", "saarland", "sachsen", "sachsen-anhalt", "schleswig-holstein", "thueringen"];

const CREDITS = new Set([55, 70, 130, 181, 216, 235]);

test.describe("question pictures", () =>
{
    test("every picture is served from this site as a WebP image", async ({ request }) =>
    {
        for (const number of PICTURE_NUMBERS)
        {
            const response = await request.get(`/images/q-${String(number).padStart(3, "0")}.webp`);
            expect(response.status(), `Q${number}`).toBe(200);
            expect(response.headers()["content-type"], `Q${number}`).toBe("image/webp");
        }
    });

    /**
     * Visits the given picture questions in the round of weak spots and checks each one: its own picture, the credit, the source on hover, the option order.
     * @param page Playwright page.
     * @param numbers The picture questions that are weak spots.
     */
    async function visitPictures(page: Page, numbers: number[]): Promise<void>
    {
        const seen: number[] = [];
        for (let round = 0; round < numbers.length; round++)
        {
            const number = await shownNumber(page);
            seen.push(number);
            const image = page.locator("figure.picture img");
            await image.scrollIntoViewIfNeeded();
            await expect(image).toHaveAttribute("src", `images/q-${String(number).padStart(3, "0")}.webp`);
            await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { message: `Q${number} picture` })
                .toBeGreaterThan(0);
            // The source is what a visitor sees when hovering the picture.
            await expect(image).toHaveAttribute("title", new RegExp(`^Source: official question catalogue of the BAMF, Stand 07\\.05\\.2025, page ${QUESTIONS[number - 1].pg}\\.`));
            const caption = page.locator("figure.picture figcaption");
            const expectedCaption = QUESTIONS[number - 1].cap;
            if (CREDITS.has(number))
            {
                await expect(caption, `Q${number} credit`).toHaveText(expectedCaption as string);
            }
            else
            {
                await expect(caption, `Q${number} has no credit`).toHaveCount(0);
            }
            const german = await page.locator("button.option .bi-main").allInnerTexts();
            expect(german.map((text) => text.trim())).toEqual(QUESTIONS[number - 1].a.map((text) => text.trim()));
            // A right answer removes the question from the weak spots, so each picture is visited once.
            await pressOption(page, await correctOptionIndex(page));
            await page.keyboard.press("Enter");
        }
        expect(seen.slice().sort((first, second) => first - second)).toEqual(numbers);
    }

    test("all 11 general picture questions show their own picture, with its credit and its source on hover, and keep their option order", async ({ page }) =>
    {
        const general = PICTURE_NUMBERS.filter((number) => number <= 300);
        await openApp(page, weakState(general));
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        await visitPictures(page, general);
    });

    for (const [index, state] of STATE_IDS.entries())
    {
        test(`the coat of arms and the map of ${state} show their own pictures`, async ({ page }) =>
        {
            const numbers = [301 + index * 10, 308 + index * 10];
            await openApp(page, JSON.stringify({ state, ...JSON.parse(weakState(numbers)) }));
            await page.getByRole("button", { name: "Practice weak spots" }).click();
            await visitPictures(page, numbers);
        });
    }

    test("show the source in German on hover when the interface is German", async ({ page }) =>
    {
        await openApp(page, { saved: weakState([21]), locale: "de" });
        await page.getByRole("button", { name: "Schwachstellen üben" }).click();
        await expect(page.locator("figure.picture img")).toHaveAttribute("title", "Quelle: offizieller Fragenkatalog des BAMF, Stand 07.05.2025, Seite 9.");
        await expect(page.locator("figure.picture img")).toHaveAttribute("alt", "Bild zu dieser Frage");
    });

    test("make no request to any other server while showing pictures and fonts", async ({ page }) =>
    {
        // The fixture fails the test on any request to another host. This test makes that guarantee explicit.
        const hosts = new Set<string>();
        page.on("request", (request) => hosts.add(new URL(request.url()).host));
        await openApp(page, weakState(PICTURE_NUMBERS.filter((number) => number <= 300)));
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        await page.locator("figure.picture img").waitFor();
        await page.evaluate(() => document.fonts.ready);
        expect([...hosts]).toHaveLength(1);
    });

    test("offers a link when a picture cannot load", async ({ page, allowedErrors }) =>
    {
        allowedErrors.push(/net::ERR_FAILED/);
        await page.route("**/images/q-021.webp", (route) => route.abort());
        await openApp(page, weakState([21]));
        await page.getByRole("button", { name: "Practice weak spots" }).click();
        const link = page.locator("figure.picture a");
        await expect(link).toHaveText("The picture could not load here. Open it in a new tab.");
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener");
    });
});
