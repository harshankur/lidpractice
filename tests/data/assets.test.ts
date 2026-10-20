import { readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { APP_NAME, APP_SHORT_NAME, SEARCH_TITLE, TITLE_SEPARATOR } from "../../src/constants";
import de from "../../src/locales/de.json";
import en from "../../src/locales/en.json";
import identity from "../../src/identity.json";

/** Folder of the static files that are copied next to the page. */
const PUBLIC = "public";

/** Sizes the fixed icon files must have. */
const ICON_SIZES: Record<string, number> = { "apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512 };

/** Sizes inside the ICO file. */
const ICO_SIZES = [16, 32, 48];

/** First bytes of a WOFF2 font. */
const WOFF2_MAGIC = "wOF2";

const template = readFileSync("src/template.html", "utf8");
const manifest = JSON.parse(readFileSync(`${PUBLIC}/site.webmanifest`, "utf8")) as {
    name: string; short_name: string; description: string; lang: string; display: string; start_url: string;
    theme_color: string; background_color: string; icons: { src: string; sizes: string; type: string }[];
};

describe("product identity", () =>
{
    it("is written once, in src/identity.json, and read from there", () =>
    {
        expect(identity.name).toBe("LiD Practice");
        expect(APP_NAME).toBe(identity.name);
        expect(APP_SHORT_NAME).toBe(identity.shortName);
        expect(identity.defaultLocale).toBe("de");
        expect(identity.defaultUiLocale).toBe("en");
    });

    it("gives the start page one title in every language: what it is for, in the German words people search for, then the name", () =>
    {
        expect(SEARCH_TITLE).toBe("Einbürgerungstest üben: Test Leben in Deutschland | LiD Practice");
        expect(SEARCH_TITLE).toBe(`${identity.searchTitlePrefix}${TITLE_SEPARATOR}${APP_NAME}`);
        expect(TITLE_SEPARATOR).toBe(" | ");
        // Built from its parts, so the name is still written once.
        expect(identity.searchTitlePrefix).not.toContain(identity.name);
    });

    it("names the site for search engines by the words people search for, and never by a federal state", () =>
    {
        expect(identity.searchAlternateNames).toEqual(["Einbürgerungstest üben", "Test Leben in Deutschland"]);
        expect(identity.searchKeywords[0]).toBe("Einbürgerungstest");
        expect([...identity.searchAlternateNames, ...identity.searchKeywords].filter((text) => /Berlin/i.test(text))).toEqual([]);
    });

    it("does not name a federal state: the site covers all of them", () =>
    {
        const shown = [identity.name, identity.shortName, manifest.name, manifest.short_name, manifest.description, template, de["app.description"], en["app.description"], de["header.subtitle"], en["header.subtitle"], de["about.intro"], en["about.intro"]];
        expect(shown.filter((text) => /Berlin/i.test(text))).toEqual([]);
    });

    it("is not typed a second time in the source or the language files", () =>
    {
        const sources = [...["app", "views", "content", "modal", "links", "listbox", "constants"].map((name) => `src/${name}.ts`), "build.mjs"].map((path) => readFileSync(path, "utf8")).join("\n");
        expect(sources).not.toContain(identity.name);
        expect(Object.values(de).some((value) => value.includes(identity.name))).toBe(false);
        expect(template).not.toContain(identity.name);
    });
});

describe("icons", () =>
{
    it.each(Object.entries(ICON_SIZES))("%s is a PNG of %i pixels", async (file, size) =>
    {
        const meta = await sharp(`${PUBLIC}/${file}`).metadata();
        expect(meta.format).toBe("png");
        expect(meta.width).toBe(size);
        expect(meta.height).toBe(size);
    });

    it("favicon.svg is a scalable icon with a description", () =>
    {
        const svg = readFileSync(`${PUBLIC}/favicon.svg`, "utf8");
        expect(svg).toContain("<svg");
        expect(svg).toContain("viewBox=\"0 0 512 512\"");
        expect(svg).toContain("aria-label=");
    });

    it("favicon.ico holds the small sizes", () =>
    {
        const ico = readFileSync(`${PUBLIC}/favicon.ico`);
        expect(ico.readUInt16LE(0)).toBe(0);
        expect(ico.readUInt16LE(2)).toBe(1);
        const count = ico.readUInt16LE(4);
        expect(count).toBe(ICO_SIZES.length);
        const sizes = Array.from({ length: count }, (_, index) => ico.readUInt8(6 + index * 16));
        expect(sizes).toEqual(ICO_SIZES);
        const offset = ico.readUInt32LE(6 + 12);
        expect(ico.subarray(offset, offset + 4).toString("latin1")).toBe("\u0089PNG");
    });
});

describe("web app manifest", () =>
{
    it("takes the name from the product identity, never a second spelling", () =>
    {
        expect(manifest.name).toBe(APP_NAME);
        expect(manifest.short_name).toBe(APP_SHORT_NAME);
    });

    it("describes the app in the default language and starts in the folder it is in", () =>
    {
        expect(manifest.lang).toBe("en");
        expect(manifest.description).toBe(en["app.description"]);
        expect(manifest.start_url).toBe(".");
        expect(manifest.display).toBe("standalone");
        expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
        expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("lists exactly the two icon sizes, by their fixed names, and the files exist", () =>
    {
        expect(manifest.icons.map((icon) => [icon.src, icon.sizes, icon.type])).toEqual([
            ["icon-192.png", "192x192", "image/png"],
            ["icon-512.png", "512x512", "image/png"],
        ]);
        for (const icon of manifest.icons)
        {
            expect(statSync(`${PUBLIC}/${icon.src}`).size).toBeGreaterThan(1000);
        }
    });
});

describe("the page template", () =>
{
    it("links the favicon, the touch icon, the manifest and the browser bar colours", () =>
    {
        expect(template).toContain("<link rel=\"icon\" href=\"favicon.ico\" sizes=\"48x48\">");
        expect(template).toContain("<link rel=\"icon\" href=\"favicon.svg\" type=\"image/svg+xml\">");
        expect(template).toContain("<link rel=\"apple-touch-icon\" href=\"apple-touch-icon.png\">");
        expect(template).toContain("<link rel=\"manifest\" href=\"site.webmanifest\">");
        expect(template.match(/<meta name="theme-color"/g)).toHaveLength(2);
    });

    it("has a language, a description and a text for visitors without JavaScript, all filled in by the build", () =>
    {
        expect(template).toContain("<html lang=\"__LANG__\" dir=\"__DIR__\">");
        expect(template).toContain("content=\"__DESCRIPTION__\"");
        expect(template).toContain("<noscript>__NOSCRIPT__</noscript>");
        expect(template).toContain("<title>__SEARCH_TITLE__</title>");
        expect(template).toContain("<meta property=\"og:title\" content=\"__SEARCH_TITLE__\">");
        expect(template).toContain("<meta property=\"og:site_name\" content=\"__APP_NAME__\">");
        // The heading is built into the page, and the text for visitors without JavaScript comes after it.
        expect(template.indexOf("<div id=\"app\">__HEADER__</div>")).toBeGreaterThan(0);
        expect(template.indexOf("<noscript>")).toBeGreaterThan(template.indexOf("<div id=\"app\">"));
    });

    it("loads nothing from another server", () =>
    {
        expect(template).not.toMatch(/(?:href|src)="https?:\/\//);
        expect(template).not.toMatch(/@import|url\(\s*["']?https?:/);
    });

    it("uses no native popup control", () =>
    {
        expect(template).not.toMatch(/<select|<datalist|type="(date|datetime-local|time|month|week|color)"/);
    });
});

describe("self hosted fonts", () =>
{
    const FONTS = [
        { file: "public-sans-latin-wght-normal.woff2", license: "OFL-Public-Sans.txt", family: "Public Sans Variable" },
        { file: "public-sans-latin-ext-wght-normal.woff2", license: "OFL-Public-Sans.txt", family: "Public Sans Variable" },
        { file: "bricolage-grotesque-latin-wght-normal.woff2", license: "OFL-Bricolage-Grotesque.txt", family: "Bricolage Grotesque Variable" },
        { file: "bricolage-grotesque-latin-ext-wght-normal.woff2", license: "OFL-Bricolage-Grotesque.txt", family: "Bricolage Grotesque Variable" },
        { file: "noto-sans-cyrillic-wght-normal.woff2", license: "OFL-Noto-Sans.txt", family: "Noto Sans Variable" },
        { file: "noto-sans-arabic-arabic-400-normal.woff2", license: "OFL-Noto-Sans-Arabic.txt", family: "Noto Sans Arabic" },
        { file: "noto-sans-arabic-arabic-700-normal.woff2", license: "OFL-Noto-Sans-Arabic.txt", family: "Noto Sans Arabic" },
        { file: "noto-sans-devanagari-devanagari-400-normal.woff2", license: "OFL-Noto-Sans-Devanagari.txt", family: "Noto Sans Devanagari" },
        { file: "noto-sans-devanagari-devanagari-700-normal.woff2", license: "OFL-Noto-Sans-Devanagari.txt", family: "Noto Sans Devanagari" },
    ];
    const css = readFileSync("src/styles.css", "utf8");

    it.each(FONTS)("$file is a WOFF2 font that this site serves, with its license text next to it", ({ file, license }) =>
    {
        const bytes = readFileSync(`${PUBLIC}/fonts/${file}`);
        expect(bytes.subarray(0, 4).toString("latin1")).toBe(WOFF2_MAGIC);
        expect(bytes.length).toBeGreaterThan(10000);
        expect(readFileSync(`${PUBLIC}/fonts/${license}`, "utf8")).toContain("SIL Open Font License");
    });

    it.each(FONTS)("$family is declared in the stylesheet from a path of this site", ({ file, family }) =>
    {
        expect(css).toContain(`font-family: "${family}"`);
        expect(css).toContain(`url(fonts/${file})`);
    });

    it("gives every font face a unicode range, so a page only downloads the fonts for the scripts it shows", () =>
    {
        const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
        expect(faces.length).toBe(FONTS.length);
        for (const face of faces)
        {
            expect(face).toMatch(/unicode-range:\s*U\+/);
        }
    });

    it("lists a font for every script of the languages in both font stacks, ahead of the system fonts", () =>
    {
        for (const name of ["--font-body", "--font-display"])
        {
            const stack = (new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1] ?? "");
            for (const family of ["Noto Sans Variable", "Noto Sans Arabic", "Noto Sans Devanagari"])
            {
                expect(stack.indexOf(`"${family}"`), `${name} ${family}`).toBeGreaterThan(-1);
                expect(stack.indexOf(`"${family}"`), `${name} ${family}`).toBeLessThan(stack.indexOf("system-ui"));
            }
        }
    });

    it("the stylesheet loads nothing from another server", () =>
    {
        expect(css).not.toMatch(/@import|url\(\s*["']?https?:/);
    });
});
