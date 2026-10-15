// Cuts every question out of the official catalogue PDF as an image, exactly as it is printed there,
// so the website can show the original next to our text.
//
//   node scripts/extract-catalogue-pages.mjs                  writes public/catalogue/q-001.webp ... q-460.webp
//   node scripts/extract-catalogue-pages.mjs --update-data    also records the PDF page of every question in data/questions.json
//   node scripts/extract-catalogue-pages.mjs --pdf other.pdf --out some/folder
//
// Needs poppler (`pdftohtml`, `pdftoppm`, `pdftotext`, `brew install poppler`) and the `sharp` dev dependency.
// Before writing anything, the text found inside each cut is compared with the catalogue text, so a cut
// that clips a line or swallows the next question stops the script.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { parseCatalogue } from "./lib/catalogue.mjs";
import { TOTAL_COUNT } from "./lib/numbering.mjs";
import { readNeutral, writeNeutral } from "./lib/data.mjs";
import {
    CROP_LEFT, CROP_RIGHT, parseLayoutXml, planQuestions, plannedText,
} from "./lib/catalogueLayout.mjs";

/** Default location of the catalogue in the repo, and of the images. */
const DEFAULT_PDF = "public/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf";
const DEFAULT_OUT = "public/catalogue";

/** Last page of the catalogue (191 pages). */
const LAST_PAGE = 191;

/** Resolution of the rendered pages and the unit conversion of pdftohtml (72 dpi times its zoom of 1.5). */
const RENDER_DPI = 144;
const LAYOUT_DPI = 108;

/** WebP settings: sharp text and small files. */
const WEBP_QUALITY = 82;
const WEBP_EFFORT = 6;

/** White margin around the finished image, in pixels. */
const IMAGE_MARGIN = 12;

/** How much of a pixel may differ from white before it counts as content when trimming. */
const TRIM_THRESHOLD = 12;

/** Largest text output accepted from poppler. */
const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Reads a command line option.
 * @param {string[]} args Arguments.
 * @param {string} name Option name, for example "--pdf".
 * @param {string} fallback Value when the option is missing.
 * @returns {string} Value.
 */
function option(args, name, fallback)
{
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
}

/**
 * Pads a question number to three digits.
 * @param {number} number Question number.
 * @returns {string} For example "007".
 */
function pad(number)
{
    return String(number).padStart(3, "0");
}

const args = process.argv.slice(2);
const pdf = option(args, "--pdf", DEFAULT_PDF);
const out = option(args, "--out", DEFAULT_OUT);

const layoutXml = execFileSync("pdftohtml", ["-xml", "-i", "-stdout", "-f", "1", "-l", String(LAST_PAGE), pdf], {
    encoding: "utf8", maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "ignore"],
});
const pages = parseLayoutXml(layoutXml);
const plan = planQuestions(pages);
if (plan.size !== TOTAL_COUNT)
{
    console.error(`Expected ${TOTAL_COUNT} questions in the catalogue, found ${plan.size}.`);
    process.exit(1);
}

// Check every cut against the catalogue text before rendering anything.
const catalogueText = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: MAX_BUFFER });
const { texts } = parseCatalogue(catalogueText);
const problems = [];
for (const [number, entry] of plan)
{
    const expected = (texts.get(number) ?? "").replace(/\s+/g, "");
    if (plannedText(pages, entry, number) !== expected)
    {
        problems.push(`Q${number}: the cut does not contain exactly the catalogue text`);
    }
}
if (problems.length > 0)
{
    console.error(problems.join("\n"));
    process.exit(1);
}
const spanning = [...plan].filter(([, entry]) => entry.pieces.length > 1).map(([number]) => number);
console.log(`Checked ${plan.size} cuts against the catalogue text. Questions spanning pages: ${spanning.length === 0 ? "none" : spanning.join(", ")}`);

// Render each needed page once.
const workDir = mkdtempSync(join(tmpdir(), "lid-pages-"));
const neededPages = [...new Set([...plan.values()].flatMap((entry) => entry.pieces.map((piece) => piece.page)))].sort((a, b) => a - b);
for (const page of neededPages)
{
    execFileSync("pdftoppm", ["-r", String(RENDER_DPI), "-png", "-f", String(page), "-l", String(page), "-singlefile", pdf, join(workDir, `p${page}`)]);
}

mkdirSync(out, { recursive: true });
const scale = RENDER_DPI / LAYOUT_DPI;
const pageNumbers = {};
let totalBytes = 0;
for (const [number, entry] of [...plan].sort((a, b) => a[0] - b[0]))
{
    const parts = [];
    for (const piece of entry.pieces)
    {
        const image = sharp(join(workDir, `p${piece.page}.png`));
        const meta = await image.metadata();
        const left = Math.round(CROP_LEFT * scale);
        const top = Math.max(0, Math.round(piece.top * scale));
        const width = Math.min(meta.width - left, Math.round((CROP_RIGHT - CROP_LEFT) * scale));
        const height = Math.min(meta.height - top, Math.round((piece.bottom - piece.top) * scale));
        parts.push({ buffer: await image.extract({ left, top, width, height }).toBuffer(), width, height });
    }
    const width = Math.max(...parts.map((part) => part.width));
    const height = parts.reduce((sum, part) => sum + part.height, 0);
    let offset = 0;
    const stitched = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
        .composite(parts.map((part) =>
        {
            const placed = { input: part.buffer, left: 0, top: offset };
            offset += part.height;
            return placed;
        }))
        .png()
        .toBuffer();
    // Trim the white space above and below only, so that every image has the same width.
    const { info } = await sharp(stitched)
        .trim({ background: "#ffffff", threshold: TRIM_THRESHOLD })
        .toBuffer({ resolveWithObject: true });
    const trimmed = await sharp(stitched)
        .extract({ left: 0, top: -info.trimOffsetTop, width, height: info.height })
        .extend({ top: IMAGE_MARGIN, bottom: IMAGE_MARGIN, left: IMAGE_MARGIN, right: IMAGE_MARGIN, background: "#ffffff" })
        .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
        .toBuffer();
    writeFileSync(join(out, `q-${pad(number)}.webp`), trimmed);
    totalBytes += trimmed.length;
    pageNumbers[number] = entry.page;
}
rmSync(workDir, { recursive: true, force: true });
console.log(`Wrote ${plan.size} images to ${out} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);

if (args.includes("--update-data"))
{
    const entries = readNeutral();
    for (const entry of entries)
    {
        entry.pg = pageNumbers[entry.n];
    }
    writeNeutral(entries);
    console.log("Recorded the PDF page of every question in data/questions.json");
}
