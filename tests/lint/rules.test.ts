import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** ESLint instance that uses the project configuration. */
const eslint = new ESLint({ cwd: process.cwd() });

/** Existing files whose path the snippets borrow, so that typed linting finds them in the TypeScript project. */
const SOURCE_PATH = "src/app.ts";
const TEST_PATH = "tests/unit/store.test.ts";

/**
 * Lints a snippet as if it were a file of the application source.
 * @param code Source text.
 * @returns Rule ids of every reported problem.
 */
async function ruleIdsFor(code: string): Promise<string[]>
{
    const [result] = await eslint.lintText(code, { filePath: SOURCE_PATH });
    return result.messages.map((message) => message.ruleId ?? "parse-error");
}

describe("ESLint configuration enforces the project standards", () =>
{
    it("accepts clean code", async () =>
    {
        const code = "export const LIMIT = 10;\n\nexport function double(value: number): number\n{\n    return value * 2;\n}\n";
        expect(await ruleIdsFor(code)).toEqual([]);
    });

    it("bans direct console use in application source", async () =>
    {
        expect(await ruleIdsFor("export function f(): void\n{\n    console.log(1);\n}\n")).toContain("no-console");
    });

    it("bans Error built from a string literal or template literal", async () =>
    {
        const literal = "export function f(): never\n{\n    throw new Error(\"boom\");\n}\n";
        const template = "export function g(name: string): never\n{\n    throw new Error(`boom ${name}`);\n}\n";
        expect(await ruleIdsFor(literal)).toContain("no-restricted-syntax");
        expect(await ruleIdsFor(template)).toContain("no-restricted-syntax");
    });

    it("bans DOMException built from a string literal", async () =>
    {
        const code = "export function f(): never\n{\n    throw new DOMException(\"boom\", \"AbortError\");\n}\n";
        expect(await ruleIdsFor(code)).toContain("no-restricted-syntax");
    });

    it("bans magic numbers but allows 0, 1, -1 and 2", async () =>
    {
        expect(await ruleIdsFor("export const wait = (value: number): number => value * 4242;\n")).toContain("no-magic-numbers");
        expect(await ruleIdsFor("export const fine = (value: number): number => value * 2 + 1 - 0 + -1;\n")).toEqual([]);
    });

    it("requires every member of a union to be handled in a switch", async () =>
    {
        const code = [
            "export type Mode = \"a\" | \"b\";",
            "",
            "export function name(mode: Mode): string",
            "{",
            "    switch (mode)",
            "    {",
            "        case \"a\":",
            "            return \"first\";",
            "    }",
            "    return \"\";",
            "}",
            "",
        ].join("\n");
        expect(await ruleIdsFor(code)).toContain("@typescript-eslint/switch-exhaustiveness-check");
    });

    it("enforces braces on the next line and curly blocks", async () =>
    {
        expect(await ruleIdsFor("export function f(): void {\n    return;\n}\n")).toContain("brace-style");
        expect(await ruleIdsFor("export function g(value: boolean): void\n{\n    if (value) return;\n}\n")).toContain("curly");
    });

    it("enforces strict equality and four space indentation", async () =>
    {
        expect(await ruleIdsFor("export const same = (a: number, b: number): boolean => a == b;\n")).toContain("eqeqeq");
        expect(await ruleIdsFor("export function f(): number\n{\n  return 3;\n}\n")).toContain("indent");
    });

    describe("nothing the browser or the operating system draws", () =>
    {
        const header = "import { el } from \"./dom\";\n";

        it.each([
            ["a native select made with el", "export const picker = el(\"select\", {});"],
            ["a native datalist", "export const list = el(\"datalist\", {});"],
            ["a select made with createElement", "export const picker = document.createElement(\"select\");"],
        ])("bans %s", async (_, code) =>
        {
            expect(await ruleIdsFor(`${header}${code}\n`)).toContain("no-restricted-syntax");
        });

        it.each(["date", "datetime-local", "time", "month", "week", "color"])("bans an input of type %s", async (type) =>
        {
            expect(await ruleIdsFor(`${header}export const field = el("input", { type: "${type}" });\n`)).toContain("no-restricted-syntax");
        });

        it("allows text, checkbox and button inputs", async () =>
        {
            expect(await ruleIdsFor(`${header}export const a = el("input", { type: "text" });\nexport const b = el("input", { type: "checkbox" });\n`)).toEqual([]);
        });

        it.each(["alert", "confirm", "prompt"])("bans %s", async (name) =>
        {
            expect(await ruleIdsFor(`export function ask(): void\n{\n    ${name}("sure?");\n}\n`)).toContain("no-alert");
        });

        it.each(["open", "alert", "confirm", "prompt"])("bans window.%s", async (name) =>
        {
            const ids = await ruleIdsFor(`export function go(): void\n{\n    window.${name}("x");\n}\n`);
            expect(ids).toContain("no-restricted-properties");
        });
    });

    describe("all text comes from the language files", () =>
    {
        const header = "import { el } from \"./dom\";\nimport { t } from \"./i18n\";\n";

        it("bans text typed into an element", async () =>
        {
            expect(await ruleIdsFor(`${header}export const a = el("p", {}, "Hello");\n`)).toContain("no-restricted-syntax");
        });

        it("bans text built with a template literal", async () =>
        {
            expect(await ruleIdsFor(`${header}export const a = (n: number) => el("p", {}, \`Question \${n}\`);\n`)).toContain("no-restricted-syntax");
        });

        it.each(["title", "alt", "placeholder"])("bans a typed %s", async (name) =>
        {
            expect(await ruleIdsFor(`${header}export const a = el("img", { ${name}: "Hello" });\n`)).toContain("no-restricted-syntax");
        });

        it.each(["aria-label", "aria-description"])("bans a typed %s", async (name) =>
        {
            expect(await ruleIdsFor(`${header}export const a = el("button", { "${name}": "Close" });\n`)).toContain("no-restricted-syntax");
        });

        it("bans text assigned to textContent and to the page title", async () =>
        {
            expect(await ruleIdsFor("export function f(node: HTMLElement): void\n{\n    node.textContent = \"Hello\";\n}\n")).toContain("no-restricted-syntax");
            expect(await ruleIdsFor("export function g(): void\n{\n    document.title = \"Hello\";\n}\n")).toContain("no-restricted-syntax");
        });

        it("allows the tag name, class names and text that comes from t()", async () =>
        {
            const code = `${header}export const a = el("p", { class: "note", role: "status", "aria-label": t("modal.close") }, t("tabs.practice"));\n`;
            expect(await ruleIdsFor(code)).toEqual([]);
        });

        it("allows values that are not text for people, such as ids and urls", async () =>
        {
            const code = `${header}export const a = el("a", { href: "https://example.org", id: "x", rel: "noopener" }, t("tabs.practice"));\n`;
            expect(await ruleIdsFor(code)).toEqual([]);
        });
    });

    it("reports unused disable directives", async () =>
    {
        const [result] = await eslint.lintText("// eslint-disable-next-line no-console\nexport const x = 3;\n", { filePath: SOURCE_PATH });
        expect(result.messages.map((message) => message.message)).toEqual([
            "Unused eslint-disable directive (no problems were reported from 'no-console').",
        ]);
    });

    it("does not apply the source rules to tests", async () =>
    {
        const [result] = await eslint.lintText("console.log(4242);\nexport const x = 1;\n", { filePath: TEST_PATH });
        expect(result.messages.map((message) => message.ruleId)).toEqual([]);
    });
});
