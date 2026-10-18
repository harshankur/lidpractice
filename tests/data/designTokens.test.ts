import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

/** The tokens the design needs, by category. */
const REQUIRED: Record<string, string[]> = {
    brand: ["--brand", "--gold", "--flag-red"],
    background: ["--bg"],
    surface: ["--surface", "--surface-2"],
    border: ["--line"],
    text: ["--fg", "--fg-muted"],
    status: ["--ok", "--bad", "--warn"],
};

/**
 * Reads the declarations of the first rule that starts with a selector.
 * @param selector Start of the rule, for example ":root {".
 * @returns Custom properties and their values.
 */
function declarations(selector: string): Record<string, string>
{
    const start = css.indexOf(selector);
    if (start < 0)
    {
        throw new Error(`rule not found: ${selector}`);
    }
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

const light = declarations(":root {");
const autoDark = declarations(":root:not(.theme-light) {");
const forcedDark = declarations(":root.theme-dark {");

describe("design tokens", () =>
{
    it.each(Object.entries(REQUIRED))("define the %s tokens", (_, tokens) =>
    {
        for (const token of tokens)
        {
            expect(light[token], token).toBeTruthy();
        }
    });

    it("have a dark value for every colour that changes", () =>
    {
        for (const token of [...REQUIRED.background, ...REQUIRED.surface, ...REQUIRED.border, ...REQUIRED.text, ...REQUIRED.status, "--brand", "--on-ink", "--focus"])
        {
            expect(forcedDark[token], token).toBeTruthy();
            expect(forcedDark[token], token).not.toBe(light[token]);
        }
    });

    it("give the system dark theme exactly the values of the forced dark theme, so there is one dark theme", () =>
    {
        const withoutScheme = (rules: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(rules).filter(([name]) => name !== "color-scheme"));
        expect(withoutScheme(autoDark)).toEqual(withoutScheme(forcedDark));
    });

    it("are used instead of colours typed into the rules: no hex colour outside the token blocks except white and the picture frame", () =>
    {
        const outside = css
            .replace(/:root\s*\{[^}]*\}/g, "")
            .replace(/:root:not\(\.theme-light\)\s*\{[^}]*\}/g, "")
            .replace(/:root\.theme-dark\s*\{[^}]*\}/g, "");
        const colours = [...outside.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0].toLowerCase());
        expect([...new Set(colours)].sort()).toEqual(["#fff"]);
    });

    it("use one shadow for everything that floats, so the dialog, the list and the card about counting look the same", () =>
    {
        expect(light["--shadow-popover"]).toBeTruthy();
        const uses = [...css.matchAll(/box-shadow:\s*([^;]+);/g)].map((match) => match[1].trim());
        // The rest are rings made of tokens that mark the current question and its legend swatch.
        const floating = uses.filter((use) => !/^0 0 0 \d+px var\(--surface\), 0 0 0 \d+px var\(--ink\)$/.test(use));
        expect(floating).toEqual(["var(--shadow-popover)", "var(--shadow-popover)", "var(--shadow-popover)"]);
    });

    it("pick the theme with a class on the root element, never an attribute", () =>
    {
        expect(css).not.toContain("data-theme");
        expect(css).toContain(":root.theme-dark");
        expect(css).toContain(":root.theme-light");
    });
});

/**
 * The text of every rule whose selector list contains a selector.
 * @param selector A selector, for example ".slot.is-current".
 * @returns The bodies of those rules.
 */
function rulesFor(selector: string): string[]
{
    const rules: string[] = [];
    // Comments are taken out first: one that sits right above an indented rule would otherwise be read as part of its selector.
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|\n)([^{}\n@/][^{}]*)\{([^{}]*)\}/g))
    {
        if (match[2].split(",").some((part) => part.trim() === selector))
        {
            rules.push(match[3]);
        }
    }
    return rules;
}

describe("one system for controls, tags and the timeline", () =>
{
    it("gives every kind of control its height from a token, so the heights cannot drift", () =>
    {
        for (const selector of [".primary", ".secondary", ".tab", ".slot", ".timeline-scroll"])
        {
            expect(rulesFor(selector).some((body) => /height:\s*var\(--h-control\)/.test(body)), selector).toBe(true);
        }
        expect(rulesFor(".listbox-button").some((body) => /height:\s*var\(--h-control-sm\)/.test(body))).toBe(true);
        expect(rulesFor(".sm").some((body) => /height:\s*var\(--h-control-sm\)/.test(body))).toBe(true);
        expect(rulesFor(".tag").some((body) => /height:\s*var\(--h-tag\)/.test(body))).toBe(true);
    });

    it("defines the heights once, bigger for touch screens", () =>
    {
        expect(light["--h-control"]).toBe("40px");
        expect(light["--h-control-sm"]).toBe("32px");
        expect(light["--h-tag"]).toBe("24px");
        expect(css).toMatch(/@media \(pointer: coarse\)\s*\{\s*:root \{ --h-control: 44px; --h-control-sm: 40px; \}/);
    });

    it("marks the current slot with a bolder border of its own, with nothing drawn outside the box", () =>
    {
        const current = rulesFor(".slot.is-current").join("\n");
        expect(current).toMatch(/border-width:\s*var\(--bw-current\)/);
        expect(current).not.toMatch(/box-shadow|outline/);
        expect(rulesFor(".legend-swatch.is-current").join("\n")).not.toMatch(/box-shadow/);
        expect(css).not.toMatch(/box-shadow:\s*0 0 0 2px/);
    });

    it("keeps a tag apart from a button: a tag has no border and does not react to the pointer, a button has an edge", () =>
    {
        const tag = rulesFor(".tag").join("\n");
        expect(tag).not.toMatch(/border:\s*[1-9]/);
        expect(tag).toMatch(/cursor:\s*default/);
        expect(rulesFor(".tag:hover")).toEqual([]);
        expect(rulesFor(".secondary").join("\n") + rulesFor(".primary, .secondary, .danger, .ghost").join("\n")).toMatch(/border:\s*var\(--bw-control\)/);
    });

    it("uses no pill shape anywhere, so nothing looks like both a tag and a button", () =>
    {
        expect(css).not.toMatch(/border-radius:\s*999px/);
    });

    it("draws the edge of a list button stronger than the edge of a card, so a list reads as a control", () =>
    {
        expect(rulesFor(".listbox-button").join("\n")).toMatch(/border:\s*var\(--bw-control\) solid var\(--line-strong\)/);
        expect(light["--line-strong"]).toBeTruthy();
        expect(autoDark["--line-strong"]).toBeTruthy();
        expect(forcedDark["--line-strong"]).toBe(autoDark["--line-strong"]);
    });

    it("only lets an answer react to hovering where there is a pointer that hovers, so a touch does not leave it looking chosen", () =>
    {
        expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\.option:not\(:disabled\):hover/);
        expect(css).not.toMatch(/\n\.option:not\(:disabled\):hover/);
    });

    it("defines the tag colours for the light and both dark themes", () =>
    {
        for (const token of ["--tag-bg", "--tag-fg", "--tag-strong-bg", "--tag-strong-fg", "--state-tag-bg", "--state-tag-fg"])
        {
            expect(light[token], token).toBeTruthy();
            expect(autoDark[token], token).toBeTruthy();
            expect(forcedDark[token], token).toBe(autoDark[token]);
        }
    });

    it("nudges a count down in three steps: a colour, a yellow border, a red border, and keeps the box the same size", () =>
    {
        expect(rulesFor(".clock-widget.level-nudge .clock-display").join("\n")).toMatch(/color:\s*var\(--warn\)/);
        const warn = rulesFor(".clock-widget.level-warn").join("\n");
        const critical = rulesFor(".clock-widget.level-critical").join("\n");
        expect(warn).toMatch(/border:\s*3px solid var\(--caution\)/);
        expect(critical).toMatch(/border:\s*3px solid var\(--bad\)/);
        expect(warn).toMatch(/padding:\s*calc\(var\(--inset\) - 2px\)/);
        expect(critical).toMatch(/padding:\s*calc\(var\(--inset\) - 2px\)/);
        for (const block of [light, autoDark, forcedDark])
        {
            expect(block["--caution"]).toBeTruthy();
        }
        expect(forcedDark["--caution"]).toBe(autoDark["--caution"]);
    });

    it("shows the clock in the column at the side with the same widget as the progress, in one grid for every mode", () =>
    {
        expect(rulesFor(".widget").join("\n")).toMatch(/border-radius:\s*var\(--radius\)/);
        expect(css).not.toMatch(/\.layout\.single/);
        expect(rulesFor(".aside").join("\n")).toMatch(/flex-direction:\s*column/);
    });

    it("keeps the fill of a chosen chip under the pointer, so its light text never lands on the light hover ground", () =>
    {
        const pressedHover = rulesFor(".chip-button[aria-pressed=\"true\"]:hover:not(:disabled)").join("\n");
        expect(pressedHover).toMatch(/background:\s*var\(--ink\)/);
        expect(pressedHover).toMatch(/color:\s*var\(--on-ink\)/);
        // The rule it has to beat: the hover of a plain button.
        expect(rulesFor(".secondary:hover:not(:disabled)").join("\n")).toMatch(/background:\s*var\(--surface-2\)/);
    });

    it("gives the tags of the review a least width, never a fixed one, so a longer word cannot run into the answer", () =>
    {
        const tag = rulesFor(".line .tag").join("\n");
        expect(tag).toMatch(/min-width:/);
        expect(tag).not.toMatch(/(^|[;\s])width:/);
    });

    it("never squeezes a button of a row below its text on a narrow screen, and keeps the Original button whole", () =>
    {
        expect(rulesFor(".footer-row .danger").join("\n")).toMatch(/min-width:\s*max-content/);
        expect(rulesFor(".panel-actions > *").join("\n")).toMatch(/min-width:\s*max-content/);
        expect(rulesFor(".meta .original-btn").join("\n")).toMatch(/flex:\s*none/);
    });

    it("keeps the buttons between questions at the bottom edge and the time of a running clock at the top edge", () =>
    {
        const row = rulesFor(".nav-row").join("\n");
        expect(row).toMatch(/position:\s*sticky/);
        expect(row).toMatch(/bottom:\s*0/);
        expect(row).toMatch(/background:\s*var\(--bg\)/);
        const strips = rulesFor(".clock-strip");
        expect(strips.some((body) => /display:\s*none/.test(body))).toBe(true);
        const shown = strips.find((body) => /position:\s*sticky/.test(body)) as string;
        expect(shown).toMatch(/top:\s*0/);
        expect(shown).toMatch(/height:\s*var\(--h-control-sm\)/);
    });
});
