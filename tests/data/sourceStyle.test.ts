import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Folders and files whose text must follow the project style rules. */
const ROOTS = ["src", "tests", "scripts", "data", ".github", "public/site.webmanifest", "public/favicon.svg", "public/catalogue/SOURCE.md", "public/_redirects", "public/sitemap.xml", "build.mjs", "README.md", "playwright.config.ts", "vitest.config.ts", "eslint.config.mjs"];

/** Code points of the em dash and the en dash, built from numbers so this file passes its own check. */
const LONG_DASH_CODES = [0x2014, 0x2013];

/** Matches an em dash or an en dash. */
const LONG_DASH = new RegExp(`[${LONG_DASH_CODES.map((code) => String.fromCharCode(code)).join("")}]`);

/** Matches block and line comments. */
const COMMENTS = /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm;

/**
 * Lists every file below a path.
 * @param path File or folder.
 * @returns Flat list of file paths.
 */
function listFiles(path: string): string[]
{
    if (!statSync(path).isDirectory())
    {
        return [path];
    }
    return readdirSync(path).flatMap((name) => listFiles(join(path, name)));
}

/** Expands the roots into files. */
const files = ROOTS.flatMap((root) => listFiles(root));

/** All TypeScript source of the app, each file with comments removed so words in documentation are not counted as code. */
const SOURCE_FILES = listFiles("src").filter((name) => name.endsWith(".ts"));
const sources = new Map(SOURCE_FILES.map((file) => [file, readFileSync(file, "utf8").replace(COMMENTS, "")]));
const appSource = [...sources.values()].join("\n");

describe("project style rules", () =>
{
    it("finds the files it is meant to check", () =>
    {
        expect(files).toContain(join("src", "app.ts"));
        expect(SOURCE_FILES).toContain(join("src", "app.ts"));
        // The folders below src count too: a rule that only saw the top level would miss the Learn tab.
        expect(SOURCE_FILES).toContain(join("src", "learn", "learn.ts"));
        expect(files).toContain(join("data", "teach", "course.json"));
        expect(files).toContain(join("data", "questions.json"));
        expect(files).toContain("README.md");
    });

    it("uses no em dashes or en dashes in code, data, UI text or docs", () =>
    {
        const offenders = files.filter((file) => LONG_DASH.test(readFileSync(file, "utf8")));
        expect(offenders).toEqual([]);
    });

    it("uses spaces, never tabs, in the TypeScript source", () =>
    {
        expect(/\t/.test(readFileSync("src/app.ts", "utf8"))).toBe(false);
    });

    it("keeps try/catch centralized in the ErrorBoundary file, and nowhere else", () =>
    {
        for (const [file, code] of sources)
        {
            // The boundary has two ways to run something: one for a plain function and one for a request.
            const expected = file === join("src", "errorBoundary.ts") ? 2 : 0;
            expect(code.match(/\btry\b/g)?.length ?? 0, file).toBe(expected);
            expect(code.match(/\bcatch\b/g)?.length ?? 0, file).toBe(expected);
        }
    });

    it("has exactly one place that writes to the console", () =>
    {
        const writers = [...sources].filter(([, code]) => /\bconsole\./.test(code)).map(([file]) => file);
        expect(writers).toEqual([join("src", "errorBoundary.ts")]);
    });

    it("never uses Math.random, only the crypto source", () =>
    {
        expect(appSource).not.toContain("Math.random");
        expect(appSource).toContain("crypto.getRandomValues");
    });

    it("never writes untrusted text through innerHTML or document.write", () =>
    {
        expect(appSource).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    });
});

describe("a value the browser tests repeat", () =>
{
    it("is the same in the app and in the fixtures: the moment in which the finish prompt ignores its confirming button", () =>
    {
        const read = (file: string): string | undefined => /export const CONFIRM_GUARD_MS = (\d+);/.exec(readFileSync(file, "utf8"))?.[1];
        expect(read(join("src", "constants.ts"))).toMatch(/^\d+$/);
        expect(read(join("tests", "e2e", "fixtures.ts"))).toBe(read(join("src", "constants.ts")));
    });
});
