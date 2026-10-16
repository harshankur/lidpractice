// Bundles src/app.ts, src/styles.css and the question bank into one self-contained HTML file, writes the files that are fetched
// later (languages, and the course of the Learn tab) and the page for a missing address next to it, and copies public/ (fonts,
// icons, pictures, the official catalogue and its images, and the headers and redirects of the host).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import sharp from "sharp";
import { readBundle } from "./scripts/lib/data.mjs";

// OUT_DIR overrides the output folder (default "dist"), so tests can build without touching dist.
const outDir = process.env.OUT_DIR ?? "dist";

const bundle = await build({
    entryPoints: ["src/app.ts"],
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: true,
    write: false,
});

/**
 * Escapes text for use inside HTML, in text and in attributes.
 * @param {string} text Raw text.
 * @returns {string} Safe text.
 */
function escapeHtml(text)
{
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const identity = JSON.parse(readFileSync("src/identity.json", "utf8"));
const ui = JSON.parse(readFileSync(`src/locales/${identity.defaultUiLocale}.json`, "utf8"));
// The text for visitors without JavaScript cannot depend on a language setting, so it holds every language, each in its own span with its language and direction.
const noscriptText = readdirSync("src/locales")
    .map((name) => name.replace(/\.json$/, ""))
    .sort((first, second) => (first === identity.defaultUiLocale ? -1 : second === identity.defaultUiLocale ? 1 : first.localeCompare(second)))
    .map((code) => `<span lang="${code}" dir="${identity.rtlLocales.includes(code) ? "rtl" : "ltr"}">${escapeHtml(JSON.parse(readFileSync(`src/locales/${code}.json`, "utf8"))["app.noscript"])}</span>`)
    .join(" ");

/**
 * The end of every page: the links to the legal notice and the privacy notice that every site of the operator shares, in a
 * line of their own, and below it the copyright line. Every link opens in a new tab. The legal links keep their German
 * names in every language, so they carry the language of German.
 * @returns HTML of the two lines.
 */
function legalFooter()
{
    const link = (href, text, lang) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener"${lang ? ` lang="${lang}"` : ""}>${escapeHtml(text)}</a>`;
    return `<p class="site-legal">${link(identity.legalNoticeUrl, identity.legalNoticeLabel, identity.defaultLocale)} `
        + `${link(identity.privacyNoticeUrl, identity.privacyNoticeLabel, identity.defaultLocale)}</p>\n`
        + `<p class="site-copyright">${escapeHtml(identity.name)} &copy; ${identity.copyrightYear} ${link(identity.authorUrl, identity.author, null)}</p>`;
}
const noscript = `<p class="noscript-text">${noscriptText}</p>\n${legalFooter()}`;
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("src/styles.css", "utf8");
// Escape "<" so the JSON can never close its script tag early.

// The size of every picture, so that its room is reserved before it is loaded and nothing moves when it arrives.
const imageSizes = {};
for (const folder of ["images", "catalogue"])
{
    const directory = `public/${folder}`;
    if (existsSync(directory))
    {
        for (const name of readdirSync(directory).filter((file) => file.endsWith(".webp")).sort())
        {
            const { width, height } = await sharp(`${directory}/${name}`).metadata();
            imageSizes[`${folder}/${name}`] = [width, height];
        }
    }
}

// The page holds the German questions and the messages of German and English. Every other language is a file next to the page that
// is fetched when it is asked for; the page only keeps the name and the category names of each language, and where its files are.
const full = readBundle();
const pageBundle = {
    questions: full.questions,
    locales: Object.fromEntries(Object.entries(full.locales).map(([code, file]) => [code, code === identity.defaultLocale ? file : { ...file, questions: [] }])),
};
const data = JSON.stringify(pageBundle).replace(/</g, "\\u003c");
const inlineMessages = new Set([identity.defaultLocale, identity.defaultUiLocale]);
const languageFiles = { ui: {}, questions: {}, learn: { texts: {} } };
const emitted = [];
/**
 * Notes a file that is written next to the page, and gives its address with a short fingerprint, so a changed file is fetched again.
 * @param {string} path Where the file goes, from the folder of the page.
 * @param {unknown} content What the file holds.
 * @returns {string} The address the page fetches it from.
 */
function emit(path, content)
{
    const text = JSON.stringify(content);
    emitted.push([path, text]);
    return `${path}?v=${createHash("sha256").update(text).digest("hex").slice(0, 8)}`;
}
for (const [code, file] of Object.entries(full.locales))
{
    if (code !== identity.defaultLocale)
    {
        languageFiles.questions[code] = emit(`locales/questions.${code}.json`, file);
    }
}
for (const name of readdirSync("src/locales"))
{
    const code = name.replace(/\.json$/, "");
    if (!inlineMessages.has(code))
    {
        languageFiles.ui[code] = emit(`locales/${name}`, JSON.parse(readFileSync(`src/locales/${name}`, "utf8")));
    }
}
// The course of the Learn tab is never part of the page: its plan, its maps and its texts are fetched when the tab is opened, the texts in one language only.
const TEACH = "data/teach";
if (existsSync(`${TEACH}/course.json`))
{
    languageFiles.learn.course = emit("teach/course.json", JSON.parse(readFileSync(`${TEACH}/course.json`, "utf8")));
    languageFiles.learn.maps = emit("teach/maps.json", JSON.parse(readFileSync(`${TEACH}/maps.json`, "utf8")));
    for (const name of readdirSync(`${TEACH}/locales`).filter((file) => /^teach\.[a-z]+\.json$/.test(file)).sort())
    {
        languageFiles.learn.texts[name.split(".")[1]] = emit(`locales/${name}`, JSON.parse(readFileSync(`${TEACH}/locales/${name}`, "utf8")));
    }
}

// Function replacers, so "$&" and friends in the text are never treated as patterns.
const html = readFileSync("src/template.html", "utf8")
    .replace(/__LANG__/g, () => identity.defaultUiLocale)
    .replace(/__DIR__/g, () => (identity.rtlLocales.includes(identity.defaultUiLocale) ? "rtl" : "ltr"))
    .replace(/__APP_NAME__/g, () => escapeHtml(identity.name))
    .replace(/__DESCRIPTION__/g, () => escapeHtml(ui["app.description"]))
    .replace(/__SITE_URL__/g, () => escapeHtml(identity.siteUrl))
    .replace(/__NOSCRIPT__/g, () => noscript)
    .replace("/*__CSS__*/", () => css)
    .replace("/*__DATA__*/", () => data)
    .replace("/*__LANGUAGES__*/", () => JSON.stringify(languageFiles))
    .replace("/*__IMAGES__*/", () => JSON.stringify(imageSizes))
    .replace("/*__JS__*/", () => js);

// The page for an address that does not exist, served by the host with the status 404 at any depth, so every address in it starts at the root.
const notFound = readFileSync("src/notfound.html", "utf8")
    .replace(/__APP_NAME__/g, () => escapeHtml(identity.name))
    .replace(/__FOOTER__/g, () => legalFooter())
    .replace("/*__CSS__*/", () => readFileSync("src/notfound.css", "utf8"));

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/index.html`, html);
writeFileSync(`${outDir}/404.html`, notFound);
for (const folder of ["locales", "teach"])
{
    mkdirSync(`${outDir}/${folder}`, { recursive: true });
}
for (const [path, text] of emitted)
{
    writeFileSync(`${outDir}/${path}`, text);
}
if (existsSync("public"))
{
    cpSync("public", outDir, { recursive: true, filter: (source) => !source.endsWith(".DS_Store") });
}
console.log(`${outDir}/index.html`, (html.length / 1024).toFixed(0) + " KB");
