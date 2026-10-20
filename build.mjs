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

/**
 * Fills the `{name}` placeholders of a message, the way the app does for the values the build knows.
 * @param {string} text Message.
 * @param {Record<string, string>} params Values by placeholder name.
 * @returns {string} The text.
 */
function fill(text, params)
{
    return text.replace(/\{(\w+)\}/g, (placeholder, name) => params[name] ?? placeholder);
}

const identity = JSON.parse(readFileSync("src/identity.json", "utf8"));
// The page is in the default language of the interface (its lang attribute), so what it shows before the app has drawn
// itself is in that language too. The description for search engines is German, the language the test and the words people
// search for are in, whatever the language of the interface.
const ui = JSON.parse(readFileSync(`src/locales/${identity.defaultUiLocale}.json`, "utf8"));
const base = JSON.parse(readFileSync(`src/locales/${identity.defaultLocale}.json`, "utf8"));
const catalogueSource = JSON.parse(readFileSync("data/catalogue-source.json", "utf8"));
// The title of the start page, the same in every language (the app sets the same, see SEARCH_TITLE in src/constants.ts).
const searchTitle = `${identity.searchTitlePrefix}${identity.titleSeparator}${identity.name}`;
// The text for visitors without JavaScript cannot depend on a language setting, so it holds every language, each in its own span with its language and direction.
const noscriptText = readdirSync("src/locales")
    .map((name) => name.replace(/\.json$/, ""))
    .sort((first, second) => (first === identity.defaultUiLocale ? -1 : second === identity.defaultUiLocale ? 1 : first.localeCompare(second)))
    .map((code) => `<span lang="${code}" dir="${identity.rtlLocales.includes(code) ? "rtl" : "ltr"}">${escapeHtml(JSON.parse(readFileSync(`src/locales/${code}.json`, "utf8"))["app.noscript"])}</span>`)
    .join(" ");

/**
 * The end of a page that does not follow the language setting: the links to the legal notice and the privacy notice that every
 * site of the operator shares, in a line of their own, and below it the copyright line. Every link opens in a new tab. The
 * notices are written in German and English, so each link is named in both, each name in its own span with its language and
 * direction, in the order the page puts its languages; the privacy link opens this site's section in the language the page leads
 * with.
 * @param {string[]} locales The languages of the names, the page's first.
 * @returns HTML of the two lines.
 */
function legalFooter(locales)
{
    const messages = Object.fromEntries(locales.map((code) => [code, JSON.parse(readFileSync(`src/locales/${code}.json`, "utf8"))]));
    const label = (key) => locales
        .map((code) => `<span lang="${code}" dir="${identity.rtlLocales.includes(code) ? "rtl" : "ltr"}">${escapeHtml(messages[code][key])}</span>`)
        .join(" / ");
    const link = (href, content) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${content}</a>`;
    return `<p class="site-legal">${link(identity.legalNoticeUrl, label("footer.legalNotice"))} `
        + `${link(locales[0] === "de" ? identity.privacyNoticeUrl : identity.privacyNoticeUrlEnglish, label("footer.privacy"))}</p>\n`
        + `<p class="site-copyright">${escapeHtml(identity.name)} &copy; ${identity.copyrightYear} ${link(identity.authorUrl, escapeHtml(identity.author))}</p>`;
}
// The text for visitors without JavaScript leads with the default language of the site; the 404 page leads with German. It
// stands below the heading the page is built with, and starts with what the site is for.
const noscript = `<p class="noscript-intro">${escapeHtml(fill(ui["about.intro"], { stand: catalogueSource.stand }))}</p>\n`
    + `<p class="noscript-text">${noscriptText}</p>\n${legalFooter([identity.defaultUiLocale, identity.defaultLocale])}`;
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

// Every question, in every language.
const full = readBundle();

// The heading the app draws first (renderHeader in src/app.ts), already in the page: search engines that run no script see
// it, and it stands where it will stay before the app has drawn itself. The count is the user's questions, the general ones
// and those of one state (every state has the same number).
const stateIds = JSON.parse(readFileSync("data/states.json", "utf8")).map((state) => state.id);
const userCount = full.questions.filter((question) => !stateIds.includes(question.k) || question.k === stateIds[0]).length;
const header = `<header class="top"><div class="brand"><h1><span class="brand-name">${escapeHtml(identity.name)}</span> `
    + `<span class="brand-sub">${escapeHtml(fill(ui["header.subtitle"], { count: new Intl.NumberFormat(`${identity.defaultUiLocale}-u-nu-latn`).format(userCount) }))}</span>`
    + "</h1></div></header>";

// What the site is, for search engines: the site and the app, with the names people search for. A data block, never run.
const alternateName = identity.searchAlternateNames;
const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
        { "@type": "WebSite", name: identity.name, alternateName, url: identity.siteUrl },
        {
            "@type": "WebApplication",
            name: identity.name,
            alternateName,
            url: identity.siteUrl,
            applicationCategory: "EducationalApplication",
            operatingSystem: "Any",
            browserRequirements: "Requires JavaScript",
            inLanguage: [identity.defaultLocale, ...readdirSync("src/locales").map((name) => name.replace(/\.json$/, "")).filter((code) => code !== identity.defaultLocale).sort()],
            isAccessibleForFree: true,
            description: base["app.description"],
            keywords: identity.searchKeywords.join(", "),
            // The operator, whom the copyright line at the end of every page names and links already.
            author: { "@type": "Person", name: identity.author, url: identity.authorUrl },
        },
    ],
}).replace(/</g, "\\u003c");

// The page holds the German questions and the messages of German and English. Every other language is a file next to the page that
// is fetched when it is asked for; the page only keeps the name and the category names of each language, and where its files are.
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
    .replace(/__SEARCH_TITLE__/g, () => escapeHtml(searchTitle))
    .replace(/__APP_NAME__/g, () => escapeHtml(identity.name))
    .replace(/__DESCRIPTION__/g, () => escapeHtml(base["app.description"]))
    .replace(/__SITE_URL__/g, () => escapeHtml(identity.siteUrl))
    .replace(/__HEADER__/g, () => header)
    .replace(/__NOSCRIPT__/g, () => noscript)
    .replace("/*__STRUCTURED_DATA__*/", () => structuredData)
    .replace("/*__CSS__*/", () => css)
    .replace("/*__DATA__*/", () => data)
    .replace("/*__LANGUAGES__*/", () => JSON.stringify(languageFiles))
    .replace("/*__IMAGES__*/", () => JSON.stringify(imageSizes))
    .replace("/*__JS__*/", () => js);

// The page for an address that does not exist, served by the host with the status 404 at any depth, so every address in it starts at the root.
const notFound = readFileSync("src/notfound.html", "utf8")
    .replace(/__APP_NAME__/g, () => escapeHtml(identity.name))
    .replace(/__FOOTER__/g, () => legalFooter([identity.defaultLocale, identity.defaultUiLocale]))
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
