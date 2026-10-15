import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "../../src/i18n";
import { CONTACT_EMAIL, LOCAL_CATALOGUE_PDF } from "../../src/constants";
import {
    catalogueImagePath, cataloguePdfPageUrl, generalMailtoUrl, githubIssueUrl, mailtoUrl, questionIssueUrl,
    questionMailtoUrl, questionReportTitle,
} from "../../src/links";

describe("catalogueImagePath", () =>
{
    it.each([[1, "catalogue/q-001.webp"], [42, "catalogue/q-042.webp"], [310, "catalogue/q-310.webp"]])(
        "pads question %i to three digits", (number, expected) =>
        {
            expect(catalogueImagePath(number)).toBe(expected);
        });
});

describe("cataloguePdfPageUrl", () =>
{
    it("opens our copy of the PDF at the given page", () =>
    {
        expect(cataloguePdfPageUrl(96)).toBe(`${LOCAL_CATALOGUE_PDF}#page=96`);
    });
});

describe("githubIssueUrl", () =>
{
    it("targets the new issue form of the repository with the chosen template", () =>
    {
        const url = new URL(githubIssueUrl("catalogue-drift"));
        expect(url.origin + url.pathname).toBe("https://github.com/harshankur/lidpractice/issues/new");
        expect(url.searchParams.get("template")).toBe("catalogue-drift.yml");
    });

    it("prefills fields and encodes awkward characters", () =>
    {
        const url = new URL(githubIssueUrl("question-error", { title: "Q 1: a&b=c #1", question: "1" }));
        expect(url.searchParams.get("title")).toBe("Q 1: a&b=c #1");
        expect(url.searchParams.get("question")).toBe("1");
        expect(url.search).not.toContain("a&b=c");
    });

    it("works for every template", () =>
    {
        for (const template of ["question-error", "catalogue-drift", "app-bug"] as const)
        {
            expect(githubIssueUrl(template)).toContain(`template=${template}.yml`);
        }
    });
});

describe("question reports", () =>
{
    beforeAll(() =>
    {
        i18n.setLocale("en");
    });

    it("title starts with the question number", () =>
    {
        expect(questionReportTitle(123)).toBe("Question 123: ");
    });

    it("issue link prefills the number and the title", () =>
    {
        const url = new URL(questionIssueUrl(123));
        expect(url.searchParams.get("template")).toBe("question-error.yml");
        expect(url.searchParams.get("question")).toBe("123");
        expect(url.searchParams.get("title")).toBe("Question 123: ");
    });

    it("email goes to the maintainer with the question, the edition and the page", () =>
    {
        const url = questionMailtoUrl(123, 45);
        expect(url.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true);
        const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
        expect(params.get("subject")).toBe("Leben in Deutschland trainer: question 123");
        expect(params.get("body")).toContain("Question: 123 (catalogue Stand 07.05.2025, page 45)");
    });

    it("email leaves the page out when it is not known", () =>
    {
        const url = questionMailtoUrl(9, undefined);
        const body = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("body") as string;
        expect(body).toContain("Question: 9 (catalogue Stand 07.05.2025)");
        expect(body).not.toContain(", page");
    });

    it("email body uses CRLF line breaks that mail programs expect", () =>
    {
        const url = mailtoUrl("Hi", ["one", "two"]);
        expect(url).toContain(encodeURIComponent("one\r\ntwo"));
        expect(url).toContain("subject=Hi");
    });

    it("general email has a subject and an opening line", () =>
    {
        const url = generalMailtoUrl();
        expect(url.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true);
        expect(decodeURIComponent(url)).toContain("What would you like to tell us?");
    });
});

describe("question reports in German", () =>
{
    it("write the email template in the language of the interface", () =>
    {
        i18n.setLocale("de");
        const url = questionMailtoUrl(123, 45);
        const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
        expect(params.get("subject")).toBe("Leben in Deutschland Trainer: Frage 123");
        expect(params.get("body")).toContain("Frage: 123 (Katalog Stand 07.05.2025, Seite 45)");
        i18n.setLocale("en");
    });
});
