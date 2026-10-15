// Takes the pictures of the questions from the official catalogue PDF itself, so the site needs no
// third party image host. The picture of a question is the area printed between the question text and
// the answer options, cut from the rendered page exactly as printed (including "Bild 1", "Bild 2" labels).
//
//   node scripts/extract-question-pictures.mjs [--pdf catalogue.pdf] [--out public/images]
//
// Needs poppler (`pdftohtml`, `pdftoppm`) and the `sharp` dev dependency.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { readNeutral } from "./lib/data.mjs";
import { parseLayoutXml, planFigure, planQuestions } from "./lib/catalogueLayout.mjs";

/** Default location of the catalogue in the repo, and of the pictures. */
const DEFAULT_PDF = "public/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf";
const DEFAULT_OUT = "public/images";

/** Last page of the catalogue (191 pages). */
const LAST_PAGE = 191;

/** Pages are rendered at this resolution. pdftohtml measures at 108 dpi (72 dpi times its zoom of 1.5). */
const RENDER_DPI = 216;
const LAYOUT_DPI = 108;

/** Pictures wider than this are scaled down, which is twice the width they are shown at. */
const MAX_WIDTH = 1200;

/** WebP quality. Photographs and flat graphics both stay sharp at this setting. */
const WEBP_QUALITY = 90;
const WEBP_EFFORT = 6;

/** How much of a pixel may differ from white before it counts as picture when trimming. */
const TRIM_THRESHOLD = 10;

/** White margin around the finished picture, in pixels. */
const MARGIN = 4;

/** Largest text output accepted from poppler. */
const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Reads a command line option.
 * @param {string[]} args Arguments.
 * @param {string} name Option name.
 * @param {string} fallback Value when missing.
 * @returns {string} Value.
 */
function option(args, name, fallback)
{
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
}

const args = process.argv.slice(2);
const pdf = option(args, "--pdf", DEFAULT_PDF);
const out = option(args, "--out", DEFAULT_OUT);

const xml = execFileSync("pdftohtml", ["-xml", "-i", "-stdout", "-f", "1", "-l", String(LAST_PAGE), pdf], {
    encoding: "utf8", maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "ignore"],
});
const pages = parseLayoutXml(xml);
const plan = planQuestions(pages);
const withPicture = readNeutral().filter((entry) => entry.img !== null);

const workDir = mkdtempSync(join(tmpdir(), "lid-pictures-"));
mkdirSync(out, { recursive: true });
const scale = RENDER_DPI / LAYOUT_DPI;
const problems = [];
for (const entry of withPicture)
{
    const region = planFigure(pages, plan.get(entry.n));
    if (!region)
    {
        problems.push(`Q${entry.n}: no picture found between the question text and the options`);
        continue;
    }
    execFileSync("pdftoppm", ["-r", String(RENDER_DPI), "-png", "-f", String(region.page), "-l", String(region.page), "-singlefile", pdf, join(workDir, `p${region.page}`)]);
    const page = sharp(join(workDir, `p${region.page}.png`));
    const meta = await page.metadata();
    const top = Math.max(0, Math.floor(region.top * scale));
    const height = Math.min(meta.height - top, Math.ceil((region.bottom - region.top) * scale));
    const cut = await page.extract({ left: 0, top, width: meta.width, height }).png().toBuffer();
    const trimmed = await sharp(cut).trim({ background: "#ffffff", threshold: TRIM_THRESHOLD }).toBuffer();
    const finished = await sharp(trimmed)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .extend({ top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, background: "#ffffff" })
        .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
        .toBuffer();
    const file = `${out}/${entry.img.split("/").pop()}`;
    writeFileSync(file, finished);
    console.log(`Q${entry.n} page ${region.page} -> ${file} (${(finished.length / 1024).toFixed(0)} KB)`);
}
rmSync(workDir, { recursive: true, force: true });
if (problems.length > 0)
{
    console.error(problems.join("\n"));
    process.exit(1);
}
