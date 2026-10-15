// Verifies the German text in data/locales/questions.de.json against the official BAMF catalogue PDF.
//
//   node scripts/verify-catalogue.mjs [catalogue.pdf]                        report and fail on unexpected differences
//   node scripts/verify-catalogue.mjs [catalogue.pdf] --write-fingerprints   also refresh tests/data/catalogue-fingerprints.json
//
// Without an argument it checks the copy of the official PDF that lives in the repo.
//
// Needs `pdftotext` from poppler (brew install poppler).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { CATALOGUE_STAND, KNOWN_DEVIATIONS, fingerprint, parseCatalogue, questionText } from "./lib/catalogue.mjs";
import { OFFICIAL_LOCALE, readLocale } from "./lib/data.mjs";

/** Where the fingerprints are stored for the tests. */
const FINGERPRINT_FILE = "tests/data/catalogue-fingerprints.json";

/** Largest text output accepted from pdftotext. */
const MAX_BUFFER = 64 * 1024 * 1024;

/** The official PDF as stored in the repo. */
const DEFAULT_PDF = "public/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf";

const flags = process.argv.slice(2).filter((argument) => argument.startsWith("--"));
const pdfPath = process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? DEFAULT_PDF;

const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8", maxBuffer: MAX_BUFFER });
const { texts, captions } = parseCatalogue(text);
// The official catalogue is German, so the German language file is what is compared with it.
const questions = readLocale(OFFICIAL_LOCALE).questions;

const problems = [];
const fingerprints = {};
let identical = 0;
for (const question of questions)
{
    const official = texts.get(question.n);
    if (official === undefined)
    {
        problems.push(`Q${question.n}: missing in the catalogue`);
        continue;
    }
    fingerprints[question.n] = fingerprint(official);
    const same = questionText(question) === official;
    const known = Object.hasOwn(KNOWN_DEVIATIONS, question.n);
    if (same && !known)
    {
        identical++;
    }
    else if (same && known)
    {
        problems.push(`Q${question.n}: listed as a deviation but identical to the catalogue`);
    }
    else if (!same && !known)
    {
        problems.push(`Q${question.n}: differs from the catalogue\n   ours:    ${questionText(question)}\n   catalog: ${official}`);
    }
}
for (const [number, caption] of captions)
{
    if ((questions[number - 1].cap ?? null) !== caption)
    {
        problems.push(`Q${number}: caption differs. catalogue "${caption}", ours "${questions[number - 1].cap ?? ""}"`);
    }
}
for (const question of questions)
{
    if (question.cap && !captions.has(question.n))
    {
        problems.push(`Q${question.n}: has a caption that the catalogue does not print`);
    }
}

console.log(`Catalogue Stand ${CATALOGUE_STAND}: ${texts.size} questions parsed, ${questions.length} in data`);
console.log(`${identical} identical, ${Object.keys(KNOWN_DEVIATIONS).length} known cosmetic deviations, ${captions.size} picture captions`);
if (flags.includes("--write-fingerprints"))
{
    writeFileSync(FINGERPRINT_FILE, `${JSON.stringify({ stand: CATALOGUE_STAND, fingerprints }, null, 4)}\n`);
    console.log(`wrote ${FINGERPRINT_FILE}`);
}
if (problems.length > 0)
{
    console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
    process.exit(1);
}
console.log("OK");
