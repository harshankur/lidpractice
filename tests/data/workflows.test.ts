import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

/** Folder of the GitHub Actions workflows. */
const FOLDER = ".github/workflows";

/** One step of a workflow job. */
interface Step
{
    name?: string;
    uses?: string;
    run?: string;
    if?: string;
    env?: Record<string, string>;
    with?: Record<string, unknown>;
}

/** A workflow, reduced to what the tests read. */
interface Workflow
{
    name: string;
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, { "runs-on": string; "timeout-minutes": number; steps: Step[] }>;
}

/**
 * Reads a workflow file.
 * @param name File name.
 * @returns The workflow and its text.
 */
function load(name: string): { workflow: Workflow; text: string }
{
    const text = readFileSync(`${FOLDER}/${name}`, "utf8");
    return { workflow: parse(text) as Workflow, text };
}

describe("workflows", () =>
{
    it("are the drift check and the test run, and nothing else", () =>
    {
        expect(readdirSync(FOLDER).sort()).toEqual(["catalogue-drift.yml", "ci.yml"]);
    });

    it.each(["catalogue-drift.yml", "ci.yml"])("%s only uses actions from GitHub itself, at a fixed major version", (name) =>
    {
        const { workflow } = load(name);
        for (const job of Object.values(workflow.jobs))
        {
            for (const step of job.steps.filter((entry) => entry.uses))
            {
                expect(step.uses, name).toMatch(/^actions\/[a-z-]+@v\d+$/);
            }
        }
    });

    it.each(["catalogue-drift.yml", "ci.yml"])("%s has a time limit and the least permissions it needs", (name) =>
    {
        const { workflow } = load(name);
        for (const job of Object.values(workflow.jobs))
        {
            expect(job["timeout-minutes"]).toBeGreaterThan(0);
            expect(job["timeout-minutes"]).toBeLessThanOrEqual(30);
        }
        expect(workflow.permissions.contents).toBe("read");
    });
});

describe("catalogue-drift.yml", () =>
{
    const { workflow, text } = load("catalogue-drift.yml");
    const steps = workflow.jobs.check.steps;

    it("runs every week and can be started by hand", () =>
    {
        const schedule = (workflow.on.schedule as { cron: string }[])[0].cron;
        expect(schedule).toMatch(/^\d+ \d+ \* \* [0-6]$/);
        expect("workflow_dispatch" in workflow.on).toBe(true);
    });

    it("may open issues and nothing more than that", () =>
    {
        expect(workflow.permissions).toEqual({ contents: "read", issues: "write" });
    });

    it("runs the drift check, and only opens an issue when something changed", () =>
    {
        const check = steps.find((step) => step.run?.includes("scripts/check-catalogue-drift.mjs"));
        expect(check).toBeDefined();
        const open = steps.find((step) => step.run?.includes("gh issue create"));
        expect(open?.if).toBe("steps.check.outputs.changed == 'true'");
    });

    it("does not report the same change twice, and uses the label the issue forms use", () =>
    {
        const open = steps.find((step) => step.run?.includes("gh issue create")) as Step;
        expect(open.run).toContain("gh issue list --state all --label catalogue-drift");
        expect(open.run).toContain("--label catalogue-drift");
        expect(open.env?.GH_TOKEN).toBe("${{ github.token }}");
    });

    it("hands the title in through the environment, never pasted into the script", () =>
    {
        const open = steps.find((step) => step.run?.includes("gh issue create")) as Step;
        expect(open.run).not.toContain("${{");
        expect(open.env?.TITLE).toBe("${{ steps.check.outputs.title }}");
    });

    it("installs the tool that reads the new PDF before it runs the check", () =>
    {
        const install = steps.findIndex((step) => step.run?.includes("poppler-utils"));
        const check = steps.findIndex((step) => step.run?.includes("check-catalogue-drift"));
        expect(install).toBeGreaterThanOrEqual(0);
        expect(install).toBeLessThan(check);
    });

    it("says what happens when GitHub pauses scheduled runs", () =>
    {
        expect(text).toContain("60 days");
    });
});

describe("ci.yml", () =>
{
    const { workflow } = load("ci.yml");

    it("runs on pushes to master and on pull requests", () =>
    {
        expect((workflow.on.push as { branches: string[] }).branches).toEqual(["master"]);
        expect("pull_request" in workflow.on).toBe(true);
    });

    it("installs the dependencies from the lock file, installs a browser, and runs the whole gate", () =>
    {
        const runs = workflow.jobs.test.steps.map((step) => step.run).filter(Boolean);
        expect(runs).toEqual(["npm ci", "npx playwright install --with-deps chromium", "npm test"]);
    });

    it("uses the bundled browser instead of a Chrome that is not there", () =>
    {
        const environment = (workflow.jobs.test as unknown as { env: Record<string, string> }).env;
        expect(environment.PW_CHANNEL).toBe("");
    });
});
