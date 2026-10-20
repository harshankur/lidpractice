// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buttonByText, chooseFromListbox, clickButton, finishAnyway, makeQuestion, mountApp, numberOfLabel, optionButtons, pressKey, REAL_QUESTIONS, shownNumber,
    startExam, startRound, statValue, pressFinishExam,
} from "../helpers/appHarness";

/** The dialog on screen, or null. */
function dialog(): HTMLElement | null
{
    return document.querySelector<HTMLElement>("#modal-root [role=dialog]");
}

/** Text of the dialog title. */
function title(): string
{
    return (document.getElementById("modal-title") as HTMLElement).textContent as string;
}

/** Button with this exact text inside the dialog. */
function dialogButton(text: string): HTMLButtonElement
{
    const found = Array.from(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((button) => button.textContent === text);
    if (!found)
    {
        throw new Error(`No dialog button labelled "${text}"`);
    }
    return found;
}

/** Links inside the dialog as [text, href]. */
function dialogLinks(): [string, string][]
{
    return Array.from(dialog()?.querySelectorAll<HTMLAnchorElement>("a") ?? []).map((link) => [link.textContent as string, link.getAttribute("href") as string]);
}

/** Presses Escape the way a user does. */
function escape(): void
{
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

/** Opens the original of the question on screen. */
function openOriginal(): void
{
    (document.querySelector(".original-btn") as HTMLButtonElement).click();
}

describe("App: original question, report and About dialog", () =>
{
    beforeEach(async () =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        await mountApp();
        // A general question, so its label is its number whatever the random draw is.
        startRound({ scope: "general" });
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        vi.useRealTimers();
        window.localStorage.clear();
    });

    describe("a question of a federal state", () =>
    {
        it("is named by the state code and the task in the original view, the report and the email", () =>
        {
            startRound({ scope: "berlin", order: "booklet" });
            (document.querySelector(".original-btn") as HTMLButtonElement).click();
            expect(dialog()?.querySelector(".modal-title")?.textContent).toBe("Question BE 1 as printed in the catalogue");
            const image = dialog()?.querySelector("img") as HTMLImageElement;
            expect(image.getAttribute("src")).toBe("catalogue/q-321.webp");
            clickButton("Report a problem with this question");
            expect(dialog()?.querySelector(".modal-title")?.textContent).toBe("Report a problem with question BE 1");
            const links = Array.from(dialog()?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
            const issue = new URL(links.find((link) => link.href.includes("issues/new"))?.href as string);
            expect(issue.searchParams.get("question")).toBe("BE 1");
            expect(issue.searchParams.get("title")).toBe("Question BE 1: ");
            const mail = links.find((link) => link.href.startsWith("mailto:"))?.href as string;
            expect(decodeURIComponent(mail)).toContain("Question: BE 1 (catalogue Stand");
        });
    });

    describe("Show original", () =>
    {
        it("is offered on the question card, named by its visible text and described by what it opens", () =>
        {
            const button = document.querySelector(".original-btn") as HTMLButtonElement;
            const question = REAL_QUESTIONS[shownNumber() - 1];
            expect(button.textContent).toBe(`Original, p. ${question.pg}`);
            expect(button.getAttribute("aria-haspopup")).toBe("dialog");
            // The name is the visible text, which a user of voice control can say; the longer words describe it.
            expect(button.hasAttribute("aria-label")).toBe(false);
            expect(button.getAttribute("title")).toBe(`Show question ${shownNumber()} as printed in the official catalogue`);
        });

        it("opens the question cut out of the catalogue, with its page", () =>
        {
            const number = shownNumber();
            const question = REAL_QUESTIONS[number - 1];
            openOriginal();
            expect(dialog()).not.toBeNull();
            expect(title()).toBe(`Question ${number} as printed in the catalogue`);
            const image = dialog()?.querySelector("img.original-image") as HTMLImageElement;
            expect(image.getAttribute("src")).toBe(`catalogue/q-${String(number).padStart(3, "0")}.webp`);
            expect(image.getAttribute("alt")).toBe(`Question ${number} as printed on page ${question.pg} of the official catalogue`);
            expect(dialog()?.textContent).toContain(`page ${question.pg} of the official catalogue (Stand 07.05.2025), exactly as printed`);
            expect(dialog()?.textContent).toContain("does not mark the correct answers");
        });

        it("keeps the room of the image before it is loaded, by its measured width and height", () =>
        {
            startRound({ scope: "general", order: "booklet" });
            openOriginal();
            const image = dialog()?.querySelector("img.original-image") as HTMLImageElement;
            expect(image.getAttribute("width")).toBe("1064");
            expect(image.getAttribute("height")).toBe("277");
        });

        it("links to the exact page of the PDF and to the official source", () =>
        {
            const question = REAL_QUESTIONS[shownNumber() - 1];
            openOriginal();
            const links = dialogLinks();
            expect(links).toContainEqual([`Open page ${question.pg} of the PDF`, `catalogue/gesamtfragenkatalog-lebenindeutschland.pdf#page=${question.pg}`]);
            expect(links.map((link) => link[0])).toContain("Official source: the catalogue page at the BAMF");
            expect(links.map((link) => link[1])).toContain("https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.html?nn=917926");
            expect(links.some(([, href]) => href.includes("gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile&v="))).toBe(true);
        });

        it("opens every link in a new tab without handing over the opener", () =>
        {
            openOriginal();
            for (const link of Array.from(dialog()?.querySelectorAll("a") ?? []))
            {
                expect(link.getAttribute("target")).toBe("_blank");
                expect(link.getAttribute("rel")).toBe("noopener noreferrer");
            }
        });

        it("replaces a missing image with a message that points to the PDF", () =>
        {
            openOriginal();
            (dialog()?.querySelector("img") as HTMLImageElement).dispatchEvent(new Event("error"));
            expect(dialog()?.querySelector("img")).toBeNull();
            expect(dialog()?.querySelector(".original-missing")?.textContent).toBe("The image could not be loaded. Open the PDF below instead.");
        });

        it("works for a question without a recorded page", async () =>
        {
            await mountApp([makeQuestion(1)]);
            openOriginal();
            expect(dialog()?.textContent).toContain("cut out of the official catalogue (Stand");
            expect(dialogLinks().some(([text]) => text.startsWith("Open page"))).toBe(false);
            expect(dialog()?.querySelector("img")?.getAttribute("alt")).toBe("Question 1 as printed on the official catalogue");
        });

        it("is available in the exam, and does not reveal or change anything", () =>
        {
            startExam();
            const before = document.querySelector(".exam-answered")?.textContent;
            openOriginal();
            expect(dialog()).not.toBeNull();
            escape();
            expect(document.querySelector(".exam-answered")?.textContent).toBe(before);
            expect(document.querySelectorAll(".is-correct, .is-wrong")).toHaveLength(0);
        });

        it("is available for each missed question on the exam result", () =>
        {
            startExam();
            for (let index = 0; index < 32; index++)
            {
                pressKey("ArrowRight");
            }
            pressFinishExam();
            finishAnyway();
            const buttons = document.querySelectorAll(".review-item .original-btn");
            expect(buttons).toHaveLength(33);
            (buttons[4] as HTMLButtonElement).click();
            const number = numberOfLabel(document.querySelectorAll(".review-item .qno")[4].textContent as string);
            expect(title()).toBe(`Question ${number} as printed in the catalogue`);
        });

        it("leaves the question on screen when the dialog is closed", () =>
        {
            const number = shownNumber();
            openOriginal();
            escape();
            expect(dialog()).toBeNull();
            expect(shownNumber()).toBe(number);
        });

        it("returns focus to the button that opened it", () =>
        {
            const button = document.querySelector(".original-btn") as HTMLButtonElement;
            button.focus();
            button.click();
            expect(document.activeElement?.id).toBe("modal-title");
            escape();
            expect(document.activeElement).toBe(document.querySelector(".original-btn"));
        });
    });

    describe("keyboard shortcuts", () =>
    {
        it("do nothing while the dialog is open", () =>
        {
            openOriginal();
            pressKey("1");
            pressKey("b");
            pressKey("Enter");
            expect(document.querySelector(".verdict")).toBeNull();
            expect(statValue("Seen")).toBe("0 of 310");
        });

        it("work again after the dialog is closed", () =>
        {
            openOriginal();
            escape();
            pressKey("1");
            expect(document.querySelector(".verdict")).not.toBeNull();
        });

        it("are blocked in the exam too, so a stray key cannot change an answer", () =>
        {
            startExam();
            openOriginal();
            pressKey("2");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("0 answered");
            escape();
            pressKey("2");
            expect(document.querySelector(".exam-answered")?.textContent).toBe("1 answered");
        });
    });

    describe("dialog survives the app drawing again", () =>
    {
        it("stays open while the exam timer ticks", () =>
        {
            vi.useFakeTimers();
            startExam();
            openOriginal();
            vi.advanceTimersByTime(5000);
            expect(dialog()).not.toBeNull();
            expect(document.getElementById("clock-display")?.textContent).toBe("59:55");
        });

        it("lives outside the app container, which is blocked while it is open", () =>
        {
            openOriginal();
            const app = document.getElementById("app") as HTMLElement;
            expect(app.contains(dialog())).toBe(false);
            expect(app.hasAttribute("inert")).toBe(true);
            escape();
            expect(app.hasAttribute("inert")).toBe(false);
        });
    });

    describe("Report a problem", () =>
    {
        it("from the original offers a prefilled GitHub issue and an email, both with the question number", () =>
        {
            const number = shownNumber();
            const question = REAL_QUESTIONS[number - 1];
            openOriginal();
            dialogButton("Report a problem with this question").click();
            expect(title()).toBe(`Report a problem with question ${number}`);
            const links = dialogLinks();
            const issue = new URL(links.find(([text]) => text === "Open a prefilled GitHub issue")?.[1] as string);
            expect(issue.origin + issue.pathname).toBe("https://github.com/harshankur/lidpractice/issues/new");
            expect(issue.searchParams.get("template")).toBe("question-error.yml");
            expect(issue.searchParams.get("question")).toBe(String(number));
            expect(issue.searchParams.get("title")).toBe(`Question ${number}: `);
            const mail = links.find(([text]) => text === "Write an email to hello@lidpractice.de")?.[1] as string;
            expect(mail.startsWith("mailto:hello@lidpractice.de?")).toBe(true);
            const body = new URLSearchParams(mail.slice(mail.indexOf("?") + 1)).get("body") as string;
            expect(body).toContain(`Question: ${number} (catalogue Stand 07.05.2025, page ${question.pg})`);
        });

        it("also offers the changed catalogue and the app bug forms", () =>
        {
            openOriginal();
            dialogButton("Report a problem with this question").click();
            const hrefs = dialogLinks().map(([, href]) => href);
            expect(hrefs.some((href) => href.includes("template=catalogue-drift.yml"))).toBe(true);
            expect(hrefs.some((href) => href.includes("template=app-bug.yml"))).toBe(true);
        });

        it("goes back to the original with Back", () =>
        {
            const number = shownNumber();
            openOriginal();
            dialogButton("Report a problem with this question").click();
            dialogButton("Back").click();
            expect(title()).toBe(`Question ${number} as printed in the catalogue`);
            expect(dialog()?.querySelector("img.original-image")).not.toBeNull();
        });

        it("from the footer is general: no question number, and Back goes to About", () =>
        {
            clickButton("Report a problem");
            expect(title()).toBe("Report a problem");
            const links = dialogLinks();
            const issue = new URL(links.find(([text]) => text === "Open a GitHub issue")?.[1] as string);
            expect(issue.searchParams.get("template")).toBe("question-error.yml");
            expect(issue.searchParams.has("question")).toBe(false);
            const mail = links.find(([text]) => text.startsWith("Write an email"))?.[1] as string;
            expect(decodeURIComponent(mail)).toContain("What would you like to tell us?");
            dialogButton("Back").click();
            expect(title()).toBe("About this trainer and FAQ");
        });

        it("shows the GitHub and email options with their trade-offs", () =>
        {
            clickButton("Report a problem");
            expect(dialog()?.textContent).toContain("A free GitHub account is needed");
            expect(dialog()?.textContent).toContain("Private, no account needed");
            expect(dialog()?.querySelectorAll(".choice")).toHaveLength(2);
        });
    });

    describe("copyright line", () =>
    {
        it("ends the page with the name, the year and the author as a link to their site", () =>
        {
            const line = document.querySelector(".site-footer")?.lastElementChild as HTMLElement;
            expect(line.textContent).toBe("LiD Practice \u00a9 2026 Harsh Ankur");
            const link = line.querySelector("a") as HTMLAnchorElement;
            expect(link.textContent).toBe("Harsh Ankur");
            expect(link.getAttribute("href")).toBe("https://harshankur.com");
            expect(link.getAttribute("target")).toBe("_blank");
            expect(link.getAttribute("rel")).toBe("noopener");
        });
    });

    describe("legal links", () =>
    {
        it("sit in a line of their own right above the copyright line, and open the notices every site of the author shares in a new tab", () =>
        {
            const line = document.querySelector(".site-footer .site-legal") as HTMLElement;
            expect(line.nextElementSibling?.className).toBe("site-copyright");
            expect(Array.from(line.children).map((link) => [link.tagName, link.textContent, link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("rel")])).toEqual([
                ["A", "Legal notice", "https://harshankur.com/impressum", "_blank", "noopener"],
                // The privacy notice's section in English, as the interface is.
                ["A", "Privacy", "https://harshankur.com/datenschutz#en-lidpractice", "_blank", "noopener"],
                // Privacy settings opens a question on this page and leads nowhere: a button styled like the links.
                ["BUTTON", "Privacy settings", null, null, null],
            ]);
            const settings = line.lastElementChild as HTMLButtonElement;
            expect([settings.id, settings.type, settings.className]).toEqual(["privacy-settings", "button", "link-button"]);
            // Not the attribute the counter's script listens for: that would open the script's own prompt.
            expect(settings.hasAttribute("data-viewcounter-consent")).toBe(false);
        });

        it("open the question about counting from Privacy settings, which says that nothing is counted off the live site", () =>
        {
            // Not the live site: the counter's script was not added, so there is nothing to answer, and the card says why.
            expect(document.querySelectorAll("script[src]")).toHaveLength(0);
            const settings = document.getElementById("privacy-settings") as HTMLButtonElement;
            settings.focus();
            settings.click();
            const card = document.getElementById("consent") as HTMLElement;
            expect(card.parentElement?.id).toBe("consent-root");
            expect(document.getElementById("consent-unavailable")?.textContent).toBe("Nothing is counted at this address, so there is nothing to answer here.");
            expect([...card.querySelectorAll("button")].map((button) => button.id)).toEqual(["consent-close"]);
            expect(document.activeElement?.id).toBe("consent-title");
            (document.getElementById("consent-close") as HTMLElement).click();
            expect(document.getElementById("consent")).toBeNull();
            expect(document.activeElement?.id).toBe("privacy-settings");
        });

        it("follow a change of the interface language in place, the privacy link to the section in that language", async () =>
        {
            await mountApp(undefined, { locale: "en" });
            const privacy = () => document.querySelectorAll(".site-footer .site-legal a")[1];
            expect(privacy().getAttribute("href")).toBe("https://harshankur.com/datenschutz#en-lidpractice");
            await chooseFromListbox("site-language", "de");
            expect(privacy().textContent).toBe("Datenschutz");
            expect(privacy().getAttribute("href")).toBe("https://harshankur.com/datenschutz#lidpractice");
            expect(document.getElementById("privacy-settings")?.textContent).toBe("Datenschutz-Einstellungen");
        });

        it.each([
            ["de", "Impressum", "Datenschutz", "#lidpractice"],
            ["ar", "إشعار قانوني", "الخصوصية", "#en-lidpractice"],
            ["uk", "Правова інформація", "Конфіденційність", "#en-lidpractice"],
        ] as const)("read in the language of the interface, %s, and carry no language of their own", async (locale, legalNotice, privacy, section) =>
        {
            await mountApp(undefined, { locale });
            const links = Array.from(document.querySelectorAll(".site-footer .site-legal a"));
            expect(links.map((link) => link.textContent)).toEqual([legalNotice, privacy]);
            // The privacy notice is in German and English: the German section in German, the English one in any other language.
            expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://harshankur.com/impressum", `https://harshankur.com/datenschutz${section}`]);
            for (const link of links)
            {
                expect(link.hasAttribute("lang")).toBe(false);
                expect(link.hasAttribute("dir")).toBe(false);
            }
        });
    });

    describe("a dialog never changes its size", () =>
    {
        it.each([["About and FAQ"], ["Report a problem"]])("has a fixed frame in %s, and the content scrolls", (label) =>
        {
            clickButton(label);
            expect(dialog()?.classList.contains("modal-fixed")).toBe(true);
            expect(dialog()?.querySelector(".modal-body")).not.toBeNull();
        });

        it("gives every button in the row at the bottom of a dialog the same size", () =>
        {
            const classes = (): string[] => Array.from(dialog()?.querySelectorAll(".modal-actions button") ?? []).map((button) => button.className);
            // The original: report a problem, and About and FAQ.
            openOriginal();
            expect(classes()).toEqual(["secondary", "secondary"]);
            // The report from the original, with its way back; About, with its way to the report.
            clickButton("Report a problem with this question");
            expect(classes()).toEqual(["secondary"]);
            escape();
            clickButton("About and FAQ");
            expect(classes()).toEqual(["secondary"]);
        });

        it("has a fixed frame for the original too", () =>
        {
            openOriginal();
            expect(dialog()?.classList.contains("modal-fixed")).toBe(true);
        });

        it("has a fixed frame for the dialog of the first visit", async () =>
        {
            window.localStorage.clear();
            await mountApp(undefined, { firstVisit: true });
            expect(dialog()?.classList.contains("modal-setup")).toBe(true);
            expect(dialog()?.classList.contains("modal-fixed")).toBe(true);
        });
    });

    describe("About and FAQ", () =>
    {
        it("opens from the footer", () =>
        {
            clickButton("About and FAQ");
            expect(title()).toBe("About this trainer and FAQ");
            expect(dialog()?.textContent).toContain("not affiliated");
        });

        it("tells where to find the official booklet, with the official link first", () =>
        {
            clickButton("About and FAQ");
            const links = dialogLinks();
            expect(links[0]).toEqual(["Official page at the BAMF (the source of the catalogue)", "https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.html?nn=917926"]);
            expect(links.map(([text]) => text)).toContain("Our identical copy of the PDF");
            expect(links.map(([, href]) => href)).toContain("catalogue/gesamtfragenkatalog-lebenindeutschland.pdf");
        });

        it("lists every FAQ entry as an expandable item, closed to begin with", () =>
        {
            clickButton("About and FAQ");
            const items = Array.from(dialog()?.querySelectorAll<HTMLDetailsElement>("details.faq-item") ?? []);
            expect(items.map((item) => item.id)).toEqual([
                "faq-useful", "faq-official", "faq-edition", "faq-authentic", "faq-answers", "faq-translations", "faq-exam", "faq-privacy",
                "faq-changes", "faq-report", "faq-license",
            ]);
            expect(items.every((item) => !item.open)).toBe(true);
            expect(items.every((item) => item.querySelector("summary")?.textContent?.endsWith("?"))).toBe(true);
        });

        it("names the tabs in the answer about who the site is for by their labels", () =>
        {
            clickButton("About and FAQ");
            const answer = dialog()?.querySelector("#faq-useful") as HTMLElement;
            expect(answer.querySelectorAll("p")).toHaveLength(3);
            expect(answer.textContent).toContain("\"Learn\" explains the topics, \"Practice\" and \"Train\" fix the questions in memory");
            expect(answer.textContent).not.toMatch(/\{\w+\}/);
        });

        it("renders links inside answers as real links", () =>
        {
            clickButton("About and FAQ");
            const answer = dialog()?.querySelector("#faq-authentic") as HTMLElement;
            expect(answer.querySelectorAll("a").length).toBeGreaterThanOrEqual(2);
        });

        it("opens the report options from its button", () =>
        {
            clickButton("About and FAQ");
            dialogButton("Report a problem").click();
            expect(title()).toBe("Report a problem");
        });

        it("can be opened from the original view", () =>
        {
            openOriginal();
            dialogButton("About and FAQ").click();
            expect(title()).toBe("About this trainer and FAQ");
        });

        it("closes with Escape, the backdrop and the close button", () =>
        {
            clickButton("About and FAQ");
            escape();
            expect(dialog()).toBeNull();
            clickButton("About and FAQ");
            (document.querySelector(".modal-backdrop") as HTMLElement).click();
            expect(dialog()).toBeNull();
            clickButton("About and FAQ");
            (document.querySelector(".modal-close") as HTMLButtonElement).click();
            expect(dialog()).toBeNull();
        });
    });

    describe("footer", () =>
    {
        it("names the edition, says the site is independent, and links to the official page", () =>
        {
            const footer = document.querySelector("footer.site-footer") as HTMLElement;
            expect(footer.textContent).toContain("Stand 07.05.2025");
            expect(footer.textContent).toContain("not affiliated with the BAMF");
            const link = footer.querySelector("a") as HTMLAnchorElement;
            expect(link.textContent).toBe("Official catalogue (BAMF)");
            expect(link.getAttribute("href")).toContain("https://www.bamf.de/");
            expect(link.getAttribute("rel")).toBe("noopener noreferrer");
        });

        it("is present in every mode and keeps its buttons", () =>
        {
            for (const label of ["Exam (33)", "Practice"])
            {
                clickButton(label);
                expect(buttonByText("About and FAQ")).toBeDefined();
                expect(buttonByText("Report a problem")).toBeDefined();
            }
        });

        it("does not shadow the question's own buttons", () =>
        {
            expect(optionButtons()).toHaveLength(4);
            expect(document.querySelectorAll("footer .site-footer-links button")).toHaveLength(2);
        });
    });
});
