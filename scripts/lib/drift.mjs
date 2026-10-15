// Decides whether the official catalogue at the BAMF has changed since the edition this project is based on.
// Pure functions, so they can be tested without the network.

/** Where relative links on the BAMF page lead. */
const BAMF_ORIGIN = "https://www.bamf.de";

/** The link to the PDF on the BAMF page, and the date the page shows for it. */
const PDF_LINK = /href="([^"]*gesamtfragenkatalog-lebenindeutschland\.pdf[^"]*)"/i;
const PAGE_DATE = /Datum:(?:&#32;|&nbsp;|\s|<[^>]*>)*(\d{2}\.\d{2}\.\d{4})/;

/** The version number the BAMF puts in the PDF address, for example `v=23`. */
const VERSION = /[?&]v=(\d+)/;

/** How many characters of the checksum are shown in an issue title. */
const SHORT_HASH_LENGTH = 12;

/**
 * Reads the BAMF page for the catalogue.
 * @param {string} html The page.
 * @returns {{ pdfUrl: string, version: number | undefined, pageDate: string | undefined } | null} What the page says, or null when the PDF link is missing.
 */
export function parseBamfPage(html)
{
    const link = PDF_LINK.exec(html);
    if (!link)
    {
        return null;
    }
    const href = link[1].replace(/&amp;/g, "&");
    const version = VERSION.exec(href)?.[1];
    return {
        pdfUrl: new URL(href, BAMF_ORIGIN).toString(),
        version: version === undefined ? undefined : Number(version),
        pageDate: PAGE_DATE.exec(html)?.[1],
    };
}

/**
 * Compares what was found at the BAMF with what the project records.
 * @param {{ pdfVersion: number, pageDate: string, sha256: string, bytes: number }} recorded The recorded edition.
 * @param {{ version?: number, pageDate?: string, sha256: string, bytes: number }} found What was found.
 * @returns {{ changed: boolean, reasons: string[] }} Whether anything differs, and what.
 */
export function assessDrift(recorded, found)
{
    const reasons = [];
    if (found.version !== undefined && found.version !== recorded.pdfVersion)
    {
        reasons.push(`The version of the PDF link changed from v=${recorded.pdfVersion} to v=${found.version}.`);
    }
    if (found.pageDate !== undefined && found.pageDate !== recorded.pageDate)
    {
        reasons.push(`The date on the BAMF page changed from ${recorded.pageDate} to ${found.pageDate}.`);
    }
    if (found.sha256 !== recorded.sha256)
    {
        reasons.push(`The PDF is no longer the recorded file (SHA-256 ${found.sha256.slice(0, SHORT_HASH_LENGTH)}, recorded ${recorded.sha256.slice(0, SHORT_HASH_LENGTH)}).`);
    }
    if (found.bytes !== recorded.bytes)
    {
        reasons.push(`The size of the PDF changed from ${recorded.bytes} to ${found.bytes} bytes.`);
    }
    return { changed: reasons.length > 0, reasons };
}

/**
 * Reads the edition ("Stand") from the first page text of a catalogue.
 * @param {string} firstPageText Text of page 1.
 * @returns {string | undefined} For example "07.05.2025".
 */
export function parseStand(firstPageText)
{
    return /Stand:\s*(\d{2}\.\d{2}\.\d{4})/.exec(firstPageText)?.[1];
}

/**
 * Title of the issue that reports a change. It holds the start of the new checksum, so the same change is only reported once.
 * @param {string | undefined} stand New edition, when known.
 * @param {string} sha256 Checksum of the new PDF.
 * @returns {string} Title.
 */
export function issueTitle(stand, sha256)
{
    return `Catalogue changed: Stand ${stand ?? "unknown"} (${sha256.slice(0, SHORT_HASH_LENGTH)})`;
}

/**
 * Text of the issue that reports a change.
 * @param {{ recorded: { stand: string, pageUrl: string }, found: { pdfUrl: string }, reasons: string[], stand?: string, verifyOutput?: string }} details What is known.
 * @returns {string} Markdown.
 */
export function buildReport({ recorded, found, reasons, stand, verifyOutput })
{
    const lines = [
        "The scheduled check found that the official catalogue at the BAMF is no longer the edition this project is based on.",
        "",
        `- Recorded edition: Stand ${recorded.stand}`,
        `- New edition: Stand ${stand ?? "unknown"}`,
        `- BAMF page: ${recorded.pageUrl}`,
        `- PDF: ${found.pdfUrl}`,
        "",
        "What changed:",
        "",
        ...reasons.map((reason) => `- ${reason}`),
    ];
    if (verifyOutput)
    {
        lines.push("", "Comparison of our German text with the new PDF (`npm run catalogue:verify <pdf>`):", "", "```", verifyOutput.trim(), "```");
    }
    lines.push(
        "",
        "To update: follow \"When the official catalogue changes\" in the README. Questions about the current Chancellor, the head of state,",
        "the parliamentary groups, the number of EU members and the population are the most likely to have changed.",
        "",
        "This issue was created by the workflow `.github/workflows/catalogue-drift.yml`.",
    );
    return lines.join("\n");
}
