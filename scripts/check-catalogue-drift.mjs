// Checks whether the BAMF has published a new edition of the catalogue.
//
//   node scripts/check-catalogue-drift.mjs [--report drift-report.md]
//
// Reads the BAMF page, downloads the PDF it links to, and compares version, date, size and SHA-256 with
// data/catalogue-source.json. Prints the result. When something changed it writes a report for an issue,
// and sets `changed`, `title` and `report` as outputs when run inside GitHub Actions.
// Exits with an error when the page or the PDF cannot be read, so a broken check is never silent.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOGUE_SOURCE } from "./lib/catalogue.mjs";
import { assessDrift, buildReport, issueTitle, parseBamfPage, parseStand } from "./lib/drift.mjs";

/** How long to wait for the BAMF before giving up, in milliseconds. */
const TIMEOUT_MS = 120000;

/** Largest PDF accepted, in bytes. The real one is about 9 MB. */
const MAX_PDF_BYTES = 100 * 1024 * 1024;

/** Largest text output accepted from poppler and from the verification script. */
const MAX_BUFFER = 64 * 1024 * 1024;

/** Lines of the verification output that go into the report. */
const VERIFY_LINES = 60;

/**
 * Downloads an address.
 * @param {string} url Address.
 * @returns {Promise<Buffer>} Body.
 */
async function download(url)
{
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "lidpractice-drift-check" } });
    if (!response.ok)
    {
        throw new Error(`${url} answered with status ${response.status}`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_PDF_BYTES)
    {
        throw new Error(`${url} is larger than ${MAX_PDF_BYTES} bytes`);
    }
    return body;
}

/**
 * Appends a value to the GitHub Actions output file, when there is one.
 * @param {string} name Output name.
 * @param {string} value Value (a single line).
 */
function setOutput(name, value)
{
    if (process.env.GITHUB_OUTPUT)
    {
        appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
}

const args = process.argv.slice(2);
const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : undefined;

const html = (await download(CATALOGUE_SOURCE.pageUrl)).toString("utf8");
const page = parseBamfPage(html);
if (!page)
{
    throw new Error("The PDF link is missing on the BAMF page. The page may have changed its layout, please check it by hand.");
}
const pdf = await download(page.pdfUrl);
const found = {
    ...page,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    bytes: pdf.length,
};
const { changed, reasons } = assessDrift(CATALOGUE_SOURCE, found);

if (!changed)
{
    console.log(`No change. The catalogue at the BAMF is still Stand ${CATALOGUE_SOURCE.stand} (v=${found.version}, ${found.sha256.slice(0, 12)}).`);
    setOutput("changed", "false");
    process.exit(0);
}

console.log(`The catalogue has changed:\n- ${reasons.join("\n- ")}`);
const workDir = mkdtempSync(join(tmpdir(), "lid-drift-"));
const file = join(workDir, "new-catalogue.pdf");
writeFileSync(file, pdf);

let stand;
let verifyOutput;
const hasPoppler = spawnSync("pdftotext", ["-v"], { stdio: "ignore" }).status !== null;
if (hasPoppler)
{
    stand = parseStand(execFileSync("pdftotext", ["-f", "1", "-l", "1", file, "-"], { encoding: "utf8", maxBuffer: MAX_BUFFER }));
    const verify = spawnSync("node", ["scripts/verify-catalogue.mjs", file], { encoding: "utf8", maxBuffer: MAX_BUFFER });
    verifyOutput = `${verify.stdout}${verify.stderr}`.split("\n").slice(0, VERIFY_LINES).join("\n");
}

const title = issueTitle(stand, found.sha256);
const report = buildReport({ recorded: CATALOGUE_SOURCE, found, reasons, stand, verifyOutput });
if (reportPath)
{
    writeFileSync(reportPath, `${report}\n`);
}
setOutput("changed", "true");
setOutput("title", title);
setOutput("shortHash", found.sha256.slice(0, 12));
console.log(`\nIssue title: ${title}`);
