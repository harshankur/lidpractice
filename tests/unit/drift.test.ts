import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessDrift, buildReport, issueTitle, parseBamfPage, parseStand } from "../../scripts/lib/drift.mjs";

/** An excerpt of the real BAMF page, kept as it was seen. */
const PAGE = readFileSync("tests/fixtures/bamf-page-excerpt.html", "utf8");

/** The recorded edition, the way data/catalogue-source.json holds it. */
const RECORDED = { pdfVersion: 23, pageDate: "26.05.2025", sha256: "a".repeat(64), bytes: 8970190, stand: "07.05.2025", pageUrl: "https://www.bamf.de/page" };

describe("parseBamfPage", () =>
{
    it("reads the address, the version and the date from the real page", () =>
    {
        expect(parseBamfPage(PAGE)).toEqual({
            pdfUrl: "https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile&v=23",
            version: 23,
            pageDate: "26.05.2025",
        });
    });

    it("makes a relative link absolute and reads an escaped ampersand", () =>
    {
        const html = "<a href=\"/SharedDocs/x/gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile&amp;v=31\">PDF</a>";
        expect(parseBamfPage(html)).toEqual({
            pdfUrl: "https://www.bamf.de/SharedDocs/x/gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile&v=31",
            version: 31,
            pageDate: undefined,
        });
    });

    it("copes with a link that has no version, and a date that is written differently", () =>
    {
        const html = "<span>Datum:&nbsp;01.02.2030</span><a href=\"https://www.bamf.de/gesamtfragenkatalog-lebenindeutschland.pdf\">PDF</a>";
        expect(parseBamfPage(html)).toEqual({ pdfUrl: "https://www.bamf.de/gesamtfragenkatalog-lebenindeutschland.pdf", version: undefined, pageDate: "01.02.2030" });
    });

    it("returns null when the page has no link to the catalogue, so a changed page layout is noticed", () =>
    {
        expect(parseBamfPage("<html><body>Nothing here</body></html>")).toBeNull();
        expect(parseBamfPage("<a href=\"https://www.bamf.de/other.pdf\">Other</a>")).toBeNull();
    });
});

describe("assessDrift", () =>
{
    const same = { version: 23, pageDate: "26.05.2025", sha256: "a".repeat(64), bytes: 8970190 };

    it("sees no change when everything is as recorded", () =>
    {
        expect(assessDrift(RECORDED, same)).toEqual({ changed: false, reasons: [] });
    });

    it("sees no change when the page does not show a version or a date", () =>
    {
        expect(assessDrift(RECORDED, { sha256: same.sha256, bytes: same.bytes }).changed).toBe(false);
    });

    it("reports a new version of the link", () =>
    {
        const result = assessDrift(RECORDED, { ...same, version: 24 });
        expect(result.changed).toBe(true);
        expect(result.reasons).toEqual(["The version of the PDF link changed from v=23 to v=24."]);
    });

    it("reports a new date on the page", () =>
    {
        expect(assessDrift(RECORDED, { ...same, pageDate: "01.01.2027" }).reasons)
            .toEqual(["The date on the BAMF page changed from 26.05.2025 to 01.01.2027."]);
    });

    it("reports a PDF that is not the recorded file, even when the version is the same", () =>
    {
        const result = assessDrift(RECORDED, { ...same, sha256: "b".repeat(64) });
        expect(result.changed).toBe(true);
        expect(result.reasons[0]).toContain("no longer the recorded file");
        expect(result.reasons[0]).toContain("bbbbbbbbbbbb");
        expect(result.reasons[0]).toContain("aaaaaaaaaaaa");
    });

    it("reports a different size", () =>
    {
        expect(assessDrift(RECORDED, { ...same, bytes: 9000000 }).reasons)
            .toEqual(["The size of the PDF changed from 8970190 to 9000000 bytes."]);
    });

    it("lists every difference", () =>
    {
        expect(assessDrift(RECORDED, { version: 24, pageDate: "x", sha256: "c".repeat(64), bytes: 1 }).reasons).toHaveLength(4);
    });
});

describe("parseStand", () =>
{
    it("reads the edition from the cover of the catalogue", () =>
    {
        expect(parseStand("Gesamtfragenkatalog\n Stand: 07.05.2025\n")).toBe("07.05.2025");
    });

    it("returns undefined when there is none", () =>
    {
        expect(parseStand("no date")).toBeUndefined();
    });
});

describe("issueTitle", () =>
{
    it("holds the edition and the start of the checksum, so the same change is reported once", () =>
    {
        expect(issueTitle("01.01.2027", "abcdef0123456789")).toBe("Catalogue changed: Stand 01.01.2027 (abcdef012345)");
    });

    it("says unknown when the edition could not be read", () =>
    {
        expect(issueTitle(undefined, "abcdef0123456789")).toBe("Catalogue changed: Stand unknown (abcdef012345)");
    });
});

describe("buildReport", () =>
{
    const details = { recorded: RECORDED, found: { pdfUrl: "https://www.bamf.de/new.pdf" }, reasons: ["Something changed."], stand: "01.01.2027" };

    it("tells what is recorded, what was found and why it counts as a change", () =>
    {
        const report = buildReport(details);
        expect(report).toContain("- Recorded edition: Stand 07.05.2025");
        expect(report).toContain("- New edition: Stand 01.01.2027");
        expect(report).toContain("- PDF: https://www.bamf.de/new.pdf");
        expect(report).toContain("- Something changed.");
        expect(report).toContain("When the official catalogue changes");
        expect(report).toContain(".github/workflows/catalogue-drift.yml");
    });

    it("includes the comparison with our text when there is one", () =>
    {
        const report = buildReport({ ...details, verifyOutput: "Q72: differs from the catalogue\n" });
        expect(report).toContain("```\nQ72: differs from the catalogue\n```");
    });

    it("leaves the comparison out when there is none, and says unknown for an unreadable edition", () =>
    {
        const report = buildReport({ ...details, stand: undefined });
        expect(report).not.toContain("```");
        expect(report).toContain("- New edition: Stand unknown");
    });
});
