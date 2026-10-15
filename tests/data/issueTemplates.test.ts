import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL, QUESTION_FIELD_ID, type IssueTemplate } from "../../src/constants";
import { githubIssueUrl, questionIssueUrl } from "../../src/links";

/** Folder of the GitHub issue forms. */
const FOLDER = ".github/ISSUE_TEMPLATE";

/** One form element of an issue form. */
interface FormElement
{
    type: string;
    id?: string;
    attributes: { label?: string; options?: unknown[]; value?: string };
    validations?: { required?: boolean };
}

/** An issue form. */
interface IssueForm
{
    name: string;
    description: string;
    title: string;
    labels: string[];
    body: FormElement[];
}

/**
 * Reads one issue form.
 * @param id Template id, the file name without ".yml".
 * @returns Parsed form.
 */
function load(id: IssueTemplate): IssueForm
{
    return parse(readFileSync(`${FOLDER}/${id}.yml`, "utf8")) as IssueForm;
}

/** Every form the site can link to. */
const TEMPLATES: IssueTemplate[] = ["question-error", "catalogue-drift", "app-bug"];

describe("GitHub issue forms", () =>
{
    it("exist for every template the site links to, and nothing else is hidden in the folder", () =>
    {
        expect(readdirSync(FOLDER).sort()).toEqual([...TEMPLATES.map((id) => `${id}.yml`), "config.yml"].sort());
    });

    it.each(TEMPLATES)("%s has a name, a description, a title prefix and a label", (id) =>
    {
        const form = load(id);
        expect(form.name.length).toBeGreaterThan(5);
        expect(form.description.length).toBeGreaterThan(20);
        expect(form.title.length).toBeGreaterThan(2);
        expect(form.labels.length).toBeGreaterThan(0);
    });

    it.each(TEMPLATES)("%s gives every input a unique id and a label", (id) =>
    {
        const fields = load(id).body.filter((element) => element.type !== "markdown");
        const ids = fields.map((field) => field.id);
        expect(ids.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
        for (const field of fields)
        {
            expect(field.attributes.label, `${id}/${field.id}`).toBeTruthy();
        }
    });

    it.each(TEMPLATES)("%s requires at least one field", (id) =>
    {
        expect(load(id).body.some((element) => element.validations?.required === true)).toBe(true);
    });

    it("lets the site prefill the question number: the field exists, is an input and is required", () =>
    {
        const field = load("question-error").body.find((element) => element.id === QUESTION_FIELD_ID);
        expect(field?.type).toBe("input");
        expect(field?.validations?.required).toBe(true);
    });

    it("offers every kind of problem a question can have", () =>
    {
        const dropdown = load("question-error").body.find((element) => element.id === "problem");
        expect(dropdown?.type).toBe("dropdown");
        expect((dropdown?.attributes.options ?? []).length).toBeGreaterThanOrEqual(6);
    });

    it("asks the drift form for the new edition date and the bamf.de link", () =>
    {
        const ids = load("catalogue-drift").body.map((element) => element.id);
        expect(ids).toContain("edition");
        expect(ids).toContain("source");
        expect(ids).toContain("kind");
    });

    it("mentions the email address in the forms people write about questions in", () =>
    {
        for (const id of ["question-error", "catalogue-drift"] as const)
        {
            expect(JSON.stringify(load(id))).toContain(CONTACT_EMAIL);
        }
    });

    it("turns off blank issues, so reports always use a form", () =>
    {
        const config = parse(readFileSync(`${FOLDER}/config.yml`, "utf8")) as { blank_issues_enabled: boolean; contact_links: { url: string }[] };
        expect(config.blank_issues_enabled).toBe(false);
        expect(config.contact_links.every((link) => link.url.startsWith("https://"))).toBe(true);
    });

    it("is reachable from the links the site builds", () =>
    {
        for (const id of TEMPLATES)
        {
            const url = new URL(githubIssueUrl(id));
            expect(url.pathname).toBe("/harshankur/lidpractice/issues/new");
            expect(url.searchParams.get("template")).toBe(`${id}.yml`);
        }
        expect(new URL(questionIssueUrl(7)).searchParams.get(QUESTION_FIELD_ID)).toBe("7");
    });
});
