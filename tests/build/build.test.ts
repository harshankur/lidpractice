import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readBundle } from "../../scripts/lib/data.mjs";
import { CONTACT_EMAIL } from "../../src/constants";
import identity from "../../src/identity.json";
import legal from "../../src/legal.json";
import de from "../../src/locales/de.json";
import en from "../../src/locales/en.json";
import type { QuestionBundle } from "../../src/types";
import type { FullBundle } from "../helpers/questionData";

/** Absolute path of the build script under test. */
const BUILD_SCRIPT = resolve("build.mjs");

/** Absolute path of the project root. */
const PROJECT_ROOT = resolve(".");

/** Number of question pictures. */
const PICTURE_COUNT = 43;

/** The files next to the page: the questions of every language but German, the interface of every language the page does not hold. */
const QUESTION_FILES = 6;
const INTERFACE_FILES = 5;

/** The languages the course of the Learn tab is written in. */
const COURSE_LOCALES = ["de", "en", "ar", "uk", "tr", "es", "hi"];

/** The most characters the page may have. It holds the German questions, two interface languages, the styles and the code; everything else is fetched. */
const PAGE_BUDGET = 420000;

/** Every sandbox and output folder created by this file, removed at the end. */
const workDirs: string[] = [];

/**
 * Creates a fresh temporary folder.
 * @param label Part of the folder name.
 * @returns Absolute path.
 */
function makeWorkDir(label: string): string
{
    const directory = mkdtempSync(join(tmpdir(), `lid-build-${label}-`));
    workDirs.push(directory);
    return directory;
}

/**
 * Runs build.mjs.
 * @param cwd Folder that holds src/, data/ and public/.
 * @param outDir Output folder.
 * @returns The built index.html text.
 */
function runBuild(cwd: string, outDir: string): string
{
    execFileSync("node", [BUILD_SCRIPT], { cwd, env: { ...process.env, OUT_DIR: outDir }, stdio: "pipe" });
    return readFileSync(join(outDir, "index.html"), "utf8");
}

/** Waits until the page has drawn itself: it starts as soon as its script ran, and then waits for the languages it needs. */
async function started(): Promise<void>
{
    await new Promise((resolve) => setTimeout(resolve, STARTUP_WAIT_MS));
}

/** How long the page gets to draw itself in the DOM of a test, in milliseconds. */
const STARTUP_WAIT_MS = 50;

/**
 * Extracts and parses the embedded question bank from a built page.
 * @param html Built page.
 * @returns The bank: language neutral entries and one file per language.
 */
function embeddedBundle(html: string): QuestionBundle
{
    const dom = new JSDOM(html);
    const node = dom.window.document.getElementById("question-data") as HTMLElement;
    return JSON.parse(node.textContent as string);
}

/**
 * Makes a copy of the project sources that can be modified safely.
 * @returns Sandbox folder holding src/, data/ and public/.
 */
function makeSandbox(): string
{
    const sandbox = makeWorkDir("sandbox");
    cpSync(join(PROJECT_ROOT, "src"), join(sandbox, "src"), { recursive: true });
    cpSync(join(PROJECT_ROOT, "data"), join(sandbox, "data"), { recursive: true });
    mkdirSync(join(sandbox, "public"));
    writeFileSync(join(sandbox, "public", "marker.txt"), "copied");
    return sandbox;
}

const source = readBundle() as unknown as FullBundle;

describe("build.mjs", () =>
{
    let defaultOut: string;
    let defaultHtml: string;

    beforeAll(() =>
    {
        defaultOut = makeWorkDir("default");
        defaultHtml = runBuild(PROJECT_ROOT, defaultOut);
    });

    afterAll(() =>
    {
        for (const directory of workDirs)
        {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    describe("output", () =>
    {
        it("writes index.html", () =>
        {
            expect(existsSync(join(defaultOut, "index.html"))).toBe(true);
        });

        it("names the address of the site in the canonical link and the share tags", () =>
        {
            const url = identity.siteUrl;
            const document = new JSDOM(defaultHtml).window.document;
            expect(url).toMatch(/^https:\/\/[^/]+\/$/);
            expect(document.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe(url);
            expect(document.querySelector("meta[property='og:url']")?.getAttribute("content")).toBe(url);
            expect(document.querySelector("meta[property='og:image']")?.getAttribute("content")).toBe(`${url}icon-512.png`);
            expect(readFileSync("public/robots.txt", "utf8")).toContain(`Sitemap: ${url}sitemap.xml`);
            expect(readFileSync("public/sitemap.xml", "utf8")).toContain(`<loc>${url}</loc>`);
        });

        it("writes the legal notice as a page of its own, from src/legal.json, with the contact email and a way back", () =>
        {
            const page = new JSDOM(readFileSync(join(defaultOut, "impressum.html"), "utf8")).window.document;
            expect(page.querySelector("h1")?.textContent).toBe("Impressum");
            expect(page.documentElement.lang).toBe("de");
            expect(page.querySelector("main")?.textContent).toContain(legal.operator);
            for (const line of legal.addressLines)
            {
                expect(page.querySelector("main")?.textContent).toContain(line);
            }
            expect(page.querySelector(`a[href='mailto:${legal.email}']`)).not.toBeNull();
            expect(legal.email).toBe(CONTACT_EMAIL);
            expect(page.querySelector("a[href='./']")).not.toBeNull();
            expect(page.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe(`${identity.siteUrl}impressum.html`);
            expect(page.querySelectorAll("script")).toHaveLength(0);
            expect(page.querySelector("main")?.textContent).not.toContain("__");
            // Who is responsible for the content, in German and in English, with the address of the notice.
            const responsible = Array.from(page.querySelectorAll("h2")).filter((heading) => heading.textContent?.includes("18"));
            expect(responsible.map((heading) => heading.textContent)).toEqual(["Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV", "Responsible for the content according to § 18(2) MStV (German Interstate Media Treaty)"]);
            expect(responsible.map((heading) => heading.nextElementSibling?.textContent)).toEqual([`${legal.operator}, Anschrift wie oben`, `${legal.operator}, address as above`]);
        });

        it("writes the privacy notice as a page of its own: the host, the browser storage, the rights, and no scripts or third party loads", () =>
        {
            const html = readFileSync(join(defaultOut, "datenschutz.html"), "utf8");
            const page = new JSDOM(html).window.document;
            expect(page.querySelector("h1")?.textContent).toBe("Datenschutzerkl\u00e4rung");
            expect(page.documentElement.lang).toBe("de");
            const text = page.querySelector("main")?.textContent ?? "";
            for (const part of [legal.operator, legal.email, "Netlify", "Cloudflare", "localStorage", "Art. 15", "datenschutz-berlin.de", "Privacy notice"])
            {
                expect(text, part).toContain(part);
            }
            expect(page.querySelectorAll("script")).toHaveLength(0);
            expect(page.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe(`${identity.siteUrl}datenschutz.html`);
            expect(page.querySelector("a[href='impressum.html']")).not.toBeNull();
            expect(text).not.toContain("__");
        });

        it("leaves the phone out of the legal notice until there is one", () =>
        {
            const page = new JSDOM(readFileSync(join(defaultOut, "impressum.html"), "utf8")).window.document;
            expect(legal.phone === null || typeof legal.phone === "string").toBe(true);
            expect(page.querySelector("main")?.textContent?.includes("Telefon")).toBe(legal.phone !== null);
        });

        it("has a Netlify config that publishes dist, allows only the site itself, and names no other domain", () =>
        {
            const config = readFileSync("netlify.toml", "utf8");
            expect(config).toContain('publish = "dist"');
            expect(config).toContain("default-src 'self'");
            expect(config).not.toMatch(/https?:\/\//);
        });

        it("is a standards mode document with charset, viewport, language, title and description", () =>
        {
            const document = new JSDOM(defaultHtml).window.document;
            expect(defaultHtml.trimStart().toLowerCase().startsWith("<!doctype html>")).toBe(true);
            expect(document.compatMode).toBe("CSS1Compat");
            expect(document.characterSet.toLowerCase()).toBe("utf-8");
            expect(document.querySelector("meta[name=viewport]")?.getAttribute("content")).toBe("width=device-width, initial-scale=1");
            expect(document.documentElement.getAttribute("lang")).toBe(identity.defaultUiLocale);
            expect(document.title).toBe(identity.name);
            expect(document.querySelector("meta[name=description]")?.getAttribute("content")).toBe(en["app.description"]);
        });

        it("tells visitors without JavaScript in every language", () =>
        {
            const document = new JSDOM(defaultHtml).window.document;
            const spans = [...document.querySelectorAll("noscript span")];
            expect(spans.map((span) => span.getAttribute("lang"))).toEqual(["en", "ar", "de", "es", "hi", "tr", "uk"]);
            expect(spans.find((span) => span.getAttribute("lang") === "ar")?.getAttribute("dir")).toBe("rtl");
            expect(spans.filter((span) => span.getAttribute("dir") === "ltr")).toHaveLength(6);
            expect(spans[0].textContent).toBe(en["app.noscript"]);
            expect(spans[2].textContent).toBe(de["app.noscript"]);
        });

        it("replaces every template placeholder", () =>
        {
            for (const placeholder of ["/*__CSS__*/", "/*__DATA__*/", "/*__JS__*/", "__LANG__", "__APP_NAME__", "__DESCRIPTION__", "__NOSCRIPT__"])
            {
                expect(defaultHtml, placeholder).not.toContain(placeholder);
            }
        });

        it("inlines the stylesheet, the data and the script", () =>
        {
            expect(defaultHtml).toContain(".card");
            expect(defaultHtml).toContain("id=\"question-data\"");
            const dom = new JSDOM(defaultHtml);
            // The code, the questions, the list of the other language files and the sizes of the pictures.
            expect(dom.window.document.querySelectorAll("script")).toHaveLength(4);
            expect(dom.window.document.querySelectorAll("script[src]")).toHaveLength(0);
        });

        it("puts the 460 questions and the German text into the page, and of the other languages only the name and the categories", () =>
        {
            const built = embeddedBundle(defaultHtml);
            expect(built.questions).toHaveLength(460);
            expect(built.questions).toEqual(source.questions);
            expect(built.locales.de).toEqual(source.locales.de);
            expect(Object.keys(built.locales).sort()).toEqual(["ar", "de", "en", "es", "hi", "tr", "uk"]);
            for (const code of ["ar", "en", "es", "hi", "tr", "uk"] as const)
            {
                expect(built.locales[code]?.questions, code).toEqual([]);
                expect(built.locales[code]?.categories, code).toEqual(source.locales[code].categories);
            }
        });

        it("writes every other language as files next to the page, with the same content as the data, and lists them in the page", () =>
        {
            const dom = new JSDOM(defaultHtml);
            const listed = JSON.parse((dom.window.document.getElementById("language-files") as HTMLElement).textContent as string) as { ui: Record<string, string>; questions: Record<string, string> };
            expect(Object.keys(listed.questions).sort()).toEqual(["ar", "en", "es", "hi", "tr", "uk"]);
            expect(Object.keys(listed.ui).sort()).toEqual(["ar", "es", "hi", "tr", "uk"]);
            for (const [code, address] of Object.entries(listed.questions))
            {
                expect(address, code).toMatch(new RegExp(`^locales/questions\\.${code}\\.json\\?v=[0-9a-f]{8}$`));
                expect(JSON.parse(readFileSync(join(defaultOut, address.split("?")[0]), "utf8")), code).toEqual(source.locales[code as "ar"]);
            }
            for (const [code, address] of Object.entries(listed.ui))
            {
                expect(JSON.parse(readFileSync(join(defaultOut, address.split("?")[0]), "utf8")), code).toEqual(JSON.parse(readFileSync(join(PROJECT_ROOT, "src", "locales", `${code}.json`), "utf8")));
            }
            // Six question files, five interface files, and the texts of the course in seven languages.
            expect(readdirSync(join(defaultOut, "locales"))).toHaveLength(QUESTION_FILES + INTERFACE_FILES + COURSE_LOCALES.length);
        });

        it("writes the course of the Learn tab as files next to the page: its plan, its maps and its texts in every language", () =>
        {
            const dom = new JSDOM(defaultHtml);
            const listed = (JSON.parse((dom.window.document.getElementById("language-files") as HTMLElement).textContent as string) as { learn: { course: string; maps: string; texts: Record<string, string> } }).learn;
            const data = (name: string): unknown => JSON.parse(readFileSync(join(PROJECT_ROOT, "data", "teach", name), "utf8"));
            const built = (address: string): unknown => JSON.parse(readFileSync(join(defaultOut, address.split("?")[0]), "utf8"));
            expect(listed.course).toMatch(/^teach\/course\.json\?v=[0-9a-f]{8}$/);
            expect(listed.maps).toMatch(/^teach\/maps\.json\?v=[0-9a-f]{8}$/);
            expect(built(listed.course)).toEqual(data("course.json"));
            expect(built(listed.maps)).toEqual(data("maps.json"));
            expect(readdirSync(join(defaultOut, "teach")).sort()).toEqual(["course.json", "maps.json"]);
            expect(Object.keys(listed.texts).sort()).toEqual([...COURSE_LOCALES].sort());
            for (const [code, address] of Object.entries(listed.texts))
            {
                expect(address, code).toMatch(new RegExp(`^locales/teach\\.${code}\\.json\\?v=[0-9a-f]{8}$`));
                expect(built(address), code).toEqual(data(`locales/teach.${code}.json`));
            }
        });

        it("builds a page without the Learn tab's files when the course is not there, and lists none", () =>
        {
            const sandbox = makeSandbox();
            rmSync(join(sandbox, "data", "teach"), { recursive: true });
            const out = makeWorkDir("nocourse");
            const html = runBuild(sandbox, out);
            const listed = JSON.parse((new JSDOM(html).window.document.getElementById("language-files") as HTMLElement).textContent as string) as { learn: unknown };
            expect(listed.learn).toEqual({ texts: {} });
            expect(readdirSync(join(out, "teach"))).toEqual([]);
            expect(readdirSync(join(out, "locales")).filter((name) => name.startsWith("teach."))).toEqual([]);
        });

        it("measures every picture, so that the room of a picture is kept before it arrives", async () =>
        {
            const dom = new JSDOM(defaultHtml);
            const sizes = JSON.parse((dom.window.document.getElementById("image-sizes") as HTMLElement).textContent as string) as Record<string, [number, number]>;
            const pictures = readdirSync(join(PROJECT_ROOT, "public", "images")).filter((name) => name.endsWith(".webp"));
            const originals = readdirSync(join(PROJECT_ROOT, "public", "catalogue")).filter((name) => name.endsWith(".webp"));
            expect(Object.keys(sizes)).toHaveLength(pictures.length + originals.length);
            expect(pictures.length).toBe(43);
            expect(originals.length).toBe(460);
            const sharp = (await import("sharp")).default;
            for (const name of ["images/q-021.webp", "catalogue/q-001.webp"])
            {
                const { width, height } = await sharp(join(PROJECT_ROOT, "public", name)).metadata();
                expect(sizes[name], name).toEqual([width, height]);
            }
        });

        it("changes the address of a file when its content changes, so a browser does not keep an old one", () =>
        {
            const sandbox = makeSandbox();
            const first = runBuild(sandbox, makeWorkDir("first"));
            const file = join(sandbox, "src", "locales", "uk.json");
            writeFileSync(file, readFileSync(file, "utf8").replace("Практика", "Практика!"));
            const second = runBuild(sandbox, makeWorkDir("second"));
            const address = (html: string): string => (JSON.parse((new JSDOM(html).window.document.getElementById("language-files") as HTMLElement).textContent as string) as { ui: Record<string, string> }).ui.uk;
            expect(address(first)).not.toBe(address(second));
        });

        it("inlines the data and the code, but not the other languages and not the course, so the page stays small", () =>
        {
            expect(defaultHtml.length).toBeGreaterThan(JSON.stringify(source.locales.de).length);
            expect(defaultHtml.length).toBeLessThan(PAGE_BUDGET);
            expect(defaultHtml).not.toContain("Практика");
            // A sentence of the first lesson, in the two languages whose interface the page does hold.
            for (const code of ["de", "en"])
            {
                const texts = JSON.parse(readFileSync(join(PROJECT_ROOT, "data", "teach", "locales", `teach.${code}.json`), "utf8")) as { lessons: Record<string, { big: string }> };
                expect(defaultHtml, code).not.toContain(texts.lessons.symbole.big);
            }
            expect(defaultHtml).not.toContain("schleswig-holstein\":{\"d\"");
        });
    });

    describe("nothing from third parties", () =>
    {
        it("loads no script, stylesheet, image, font or frame from another server (the canonical link only names the site)", () =>
        {
            const document = new JSDOM(defaultHtml).window.document;
            const external = [...document.querySelectorAll("[src], link[href]:not([rel=canonical])")]
                .map((node) => node.getAttribute("src") ?? node.getAttribute("href") ?? "")
                .filter((address) => /^(https?:)?\/\//.test(address));
            expect(external).toEqual([]);
        });

        it("has no stylesheet rule that pulls something from another server", () =>
        {
            expect(defaultHtml).not.toMatch(/@import|url\(\s*["']?(https?:)?\/\//);
        });

        it("has no preconnect or font host hint", () =>
        {
            expect(defaultHtml).not.toMatch(/fonts\.googleapis|fonts\.gstatic|preconnect|cdn\./i);
        });

        it("points every picture at a file of this site", () =>
        {
            const pictures = embeddedBundle(defaultHtml).questions.filter((entry) => entry.img);
            expect(pictures).toHaveLength(PICTURE_COUNT);
            for (const entry of pictures)
            {
                expect(entry.img).toMatch(/^images\/q-\d{3}\.webp$/);
            }
        });
    });

    describe("public folder", () =>
    {
        it("copies everything from public/ next to the page", () =>
        {
            const sandbox = makeSandbox();
            const out = makeWorkDir("copy");
            runBuild(sandbox, out);
            expect(readFileSync(join(out, "marker.txt"), "utf8")).toBe("copied");
        });

        it("builds without a public folder", () =>
        {
            const sandbox = makeSandbox();
            rmSync(join(sandbox, "public"), { recursive: true });
            const out = makeWorkDir("nopublic");
            runBuild(sandbox, out);
            expect(readdirSync(out).sort()).toEqual(["datenschutz.html", "impressum.html", "index.html", "locales", "teach"]);
        });

        it("does not copy operating system leftovers", () =>
        {
            const sandbox = makeSandbox();
            writeFileSync(join(sandbox, "public", ".DS_Store"), "x");
            const out = makeWorkDir("dsstore");
            runBuild(sandbox, out);
            expect(existsSync(join(out, ".DS_Store"))).toBe(false);
        });

        it("ships the pictures, the fonts, the icons and the manifest next to the page", () =>
        {
            expect(readdirSync(join(defaultOut, "images")).sort()).toEqual(readdirSync("public/images").sort());
            expect(readdirSync(join(defaultOut, "images"))).toHaveLength(PICTURE_COUNT);
            for (const file of ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest"])
            {
                expect(existsSync(join(defaultOut, file)), file).toBe(true);
            }
            expect(readdirSync(join(defaultOut, "fonts")).filter((name) => name.endsWith(".woff2"))).toHaveLength(9);
        });
    });

    describe("catalogue", () =>
    {
        it("ships the PDF and the 460 question images next to the page", () =>
        {
            const names = readdirSync(join(defaultOut, "catalogue"));
            expect(names.filter((name) => name.endsWith(".webp"))).toHaveLength(460);
            expect(names).toContain("gesamtfragenkatalog-lebenindeutschland.pdf");
            expect(names).toContain("SOURCE.md");
            expect(readFileSync(join(defaultOut, "catalogue", "gesamtfragenkatalog-lebenindeutschland.pdf")).equals(
                readFileSync("public/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf"),
            )).toBe(true);
        });

        it("provides the container the dialog is drawn into, outside the app", () =>
        {
            const document = new JSDOM(defaultHtml).window.document;
            const modalRoot = document.getElementById("modal-root");
            expect(modalRoot).not.toBeNull();
            expect((document.getElementById("app") as HTMLElement).contains(modalRoot)).toBe(false);
        });

        it("embeds the catalogue page of every question", () =>
        {
            expect(embeddedBundle(defaultHtml).questions.every((entry) => Number.isInteger(entry.pg))).toBe(true);
        });

        it("boots in English with an Original button and the footer, with the questions in German", async () =>
        {
            const dom = new JSDOM(defaultHtml, { runScripts: "dangerously", url: "http://localhost/" });
            const document = dom.window.document;
            await started();
            expect(document.querySelector(".original-btn")?.textContent).toMatch(/^Original, p\. \d+$/);
            expect(document.querySelector("footer.site-footer")?.textContent).toContain("Stand 07.05.2025");
            expect(document.documentElement.lang).toBe("en");
            expect(document.querySelector(".question .bi-main")?.getAttribute("lang")).toBe("de");
        });
    });

    describe("hostile data", () =>
    {
        const hostile = {
            q: "</script><script>window.__pwned = true</script><!-- $& $' $` $1 -->",
            a: ["</SCRIPT >", "<img src=x onerror=1>", "  ", "$$"],
        };

        /**
         * Builds a sandbox whose first German question is replaced by the hostile one.
         * @returns Built html.
         */
        function buildHostile(): string
        {
            const sandbox = makeSandbox();
            const path = join(sandbox, "data", "locales", "questions.de.json");
            const file = JSON.parse(readFileSync(path, "utf8"));
            file.questions[0] = { ...file.questions[0], ...hostile };
            writeFileSync(path, JSON.stringify(file));
            return runBuild(sandbox, makeWorkDir("hostile"));
        }

        it("cannot close the data script early or add scripts", () =>
        {
            const dom = new JSDOM(buildHostile());
            expect(dom.window.document.querySelectorAll("script")).toHaveLength(4);
        });

        it("round trips the text exactly, including replacement patterns", () =>
        {
            const first = embeddedBundle(buildHostile()).locales.de.questions[0];
            expect(first.q).toBe(hostile.q);
            expect(first.a).toEqual(hostile.a);
        });

        it("does not execute injected script when the page runs", () =>
        {
            const dom = new JSDOM(buildHostile(), { runScripts: "dangerously", url: "http://localhost/" });
            expect((dom.window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
            expect(dom.window.document.querySelector("#app img")).toBeNull();
        });

        it("escapes the product name and the descriptions in the page head", () =>
        {
            const sandbox = makeSandbox();
            writeFileSync(join(sandbox, "src", "identity.json"), JSON.stringify({ ...identity, name: "A \"B\" <i>&" }));
            const html = runBuild(sandbox, makeWorkDir("identity"));
            expect(html).toContain("<title>A &quot;B&quot; &lt;i&gt;&amp;</title>");
        });
    });

    describe("built page smoke test", () =>
    {
        it("boots in a DOM, renders a question and shows no error", async () =>
        {
            const errors: string[] = [];
            const dom = new JSDOM(defaultHtml, {
                runScripts: "dangerously",
                url: "http://localhost/",
                beforeParse(window)
                {
                    window.addEventListener("error", (event) => errors.push(event.message));
                },
            });
            const document = dom.window.document;
            await started();
            expect(errors).toEqual([]);
            expect(document.querySelector("h1")?.textContent).toBe(identity.name);
            expect(document.querySelectorAll("button.option")).toHaveLength(4);
            expect((document.getElementById("toast") as HTMLElement).hidden).toBe(true);
        });

        it("boots in English with ?lang=en", async () =>
        {
            const dom = new JSDOM(defaultHtml, { runScripts: "dangerously", url: "http://localhost/?lang=en" });
            await started();
            expect(dom.window.document.documentElement.lang).toBe("en");
            expect(Array.from(dom.window.document.querySelectorAll("[role=tab]")).map((tab) => tab.textContent)).toEqual(["Learn", "Practice", "Train", "Exam (33)"]);
            expect(dom.window.document.querySelector("[role=tab][aria-selected=true]")?.textContent).toBe("Practice");
        });
    });
});
