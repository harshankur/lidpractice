import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CATALOGUE_STAND as SCRIPT_STAND } from "../../scripts/lib/catalogue.mjs";
import {
    BAMF_CATALOGUE_PAGE_URL, BAMF_CATALOGUE_PDF_URL, CATALOGUE_STAND, LOCAL_CATALOGUE_PDF,
} from "../../src/constants";

/** Folder with the PDF and the question images. */
const FOLDER = "public/catalogue";

/** What is recorded about the PDF as published by the BAMF (compared byte for byte with the BAMF download). */
const SOURCE = JSON.parse(readFileSync("data/catalogue-source.json", "utf8")) as {
    stand: string; pageUrl: string; pdfUrl: string; pdfVersion: number; pageDate: string; file: string; sha256: string; bytes: number; pages: number;
};
const PDF_SHA256 = SOURCE.sha256;
const PDF_BYTES = SOURCE.bytes;
const PDF_PAGES_TEXT = String(SOURCE.pages);

/** A WebP file starts with "RIFF", four size bytes, and "WEBP". */
const RIFF = "RIFF";
const WEBP = "WEBP";
const WEBP_TAG_OFFSET = 8;

/** Plausible sizes of one cut-out question. */
const MIN_BYTES = 1024;
const MAX_BYTES = 400 * 1024;
/** All images are cut at the same width, so the dialog looks the same for every question. */
const MIN_WIDTH = 1000;
const MAX_WIDTH = 1100;
const MIN_HEIGHT = 100;

/** Page ranges of the catalogue: part I (tasks 1 to 300), then five pages for each of the 16 federal states. */
const GENERAL_FIRST_PAGE = 2;
const GENERAL_LAST_PAGE = 111;
const FIRST_STATE_PAGE = 112;
const PAGES_PER_STATE = 5;

const questions: { n: number; pg: number }[] = JSON.parse(readFileSync("data/questions.json", "utf8"));
const names = Array.from({ length: 460 }, (_, index) => `q-${String(index + 1).padStart(3, "0")}.webp`);

describe("the official catalogue PDF in the repository", () =>
{
    const pdf = readFileSync(`${FOLDER}/gesamtfragenkatalog-lebenindeutschland.pdf`);

    it("is a PDF of the published size", () =>
    {
        expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(pdf.length).toBe(PDF_BYTES);
    });

    it("has the checksum of the BAMF download", () =>
    {
        expect(createHash("sha256").update(pdf).digest("hex")).toBe(PDF_SHA256);
    });

    it("is described with the same checksum, edition and sources in the README and SOURCE.md", () =>
    {
        for (const file of ["README.md", `${FOLDER}/SOURCE.md`])
        {
            const text = readFileSync(file, "utf8");
            expect(text, file).toContain(PDF_SHA256);
            expect(text, file).toContain(CATALOGUE_STAND);
            expect(text, file).toContain(BAMF_CATALOGUE_PAGE_URL);
            expect(text, file).toContain(BAMF_CATALOGUE_PDF_URL);
        }
        expect(readFileSync(`${FOLDER}/SOURCE.md`, "utf8")).toContain(`${PDF_BYTES} bytes, ${PDF_PAGES_TEXT} pages`);
    });

    it("is the file recorded in data/catalogue-source.json", () =>
    {
        expect(SOURCE.file).toBe(`${FOLDER}/gesamtfragenkatalog-lebenindeutschland.pdf`);
        expect(PDF_SHA256).toBe("edd3ed5e56a35241b6cc61aa0630482dc9e64498db508a7d6892ccee2ec707a9");
        expect(SOURCE.pdfUrl).toContain(`v=${SOURCE.pdfVersion}`);
    });

    it("is the file the site links to", () =>
    {
        expect(LOCAL_CATALOGUE_PDF).toBe("catalogue/gesamtfragenkatalog-lebenindeutschland.pdf");
        expect(statSync(`public/${LOCAL_CATALOGUE_PDF}`).size).toBe(PDF_BYTES);
    });
});

describe("catalogue constants", () =>
{
    it("name the same edition in the app, the verification scripts and the record", () =>
    {
        expect(CATALOGUE_STAND).toBe(SCRIPT_STAND);
        expect(CATALOGUE_STAND).toBe(SOURCE.stand);
        expect(CATALOGUE_STAND).toBe("07.05.2025");
    });

    it("take the addresses from the record, so they are written down once", () =>
    {
        expect(BAMF_CATALOGUE_PAGE_URL).toBe(SOURCE.pageUrl);
        expect(BAMF_CATALOGUE_PDF_URL).toBe(SOURCE.pdfUrl);
    });

    it("point at bamf.de over https, with a versioned PDF link", () =>
    {
        expect(BAMF_CATALOGUE_PAGE_URL).toMatch(/^https:\/\/www\.bamf\.de\/SharedDocs\/Anlagen\/DE\/Integration\/Einbuergerung\/gesamtfragenkatalog-lebenindeutschland\.html/);
        expect(BAMF_CATALOGUE_PDF_URL).toMatch(/^https:\/\/www\.bamf\.de\/.+\.pdf\?__blob=publicationFile&v=\d+$/);
    });
});

describe("one image per question, cut out of the PDF", () =>
{
    it("holds exactly the 460 images, the PDF and the source note", () =>
    {
        const files = readdirSync(FOLDER).sort();
        expect(files).toEqual([...names, "SOURCE.md", "gesamtfragenkatalog-lebenindeutschland.pdf"].sort());
    });

    it.each(names)("%s is a WebP image of plausible size", async (name) =>
    {
        const bytes = readFileSync(`${FOLDER}/${name}`);
        expect(bytes.subarray(0, RIFF.length).toString("latin1")).toBe(RIFF);
        expect(bytes.subarray(WEBP_TAG_OFFSET, WEBP_TAG_OFFSET + WEBP.length).toString("latin1")).toBe(WEBP);
        expect(bytes.length).toBeGreaterThan(MIN_BYTES);
        expect(bytes.length).toBeLessThan(MAX_BYTES);
        const meta = await sharp(bytes).metadata();
        expect(meta.format).toBe("webp");
        expect(meta.width).toBeGreaterThan(MIN_WIDTH);
        expect(meta.width).toBeLessThan(MAX_WIDTH);
        expect(meta.height).toBeGreaterThan(MIN_HEIGHT);
    });
});

describe("page of every question in the catalogue", () =>
{
    it("is recorded for all 460 questions as a whole number", () =>
    {
        expect(questions.every((question) => Number.isInteger(question.pg))).toBe(true);
    });

    it("keeps the general questions in order on pages 2 to 111", () =>
    {
        const general = questions.filter((question) => question.n <= 300).map((question) => question.pg);
        expect(Math.min(...general)).toBe(GENERAL_FIRST_PAGE);
        expect(Math.max(...general)).toBe(GENERAL_LAST_PAGE);
        general.slice(1).forEach((page, index) => expect(page, `Q${index + 2}`).toBeGreaterThanOrEqual(general[index]));
    });

    it("puts the 10 questions of each state on its own five pages, in order", () =>
    {
        for (let state = 0; state < 16; state++)
        {
            const pages = questions.filter((question) => question.n > 300 + state * 10 && question.n <= 310 + state * 10).map((question) => question.pg);
            expect(pages, `state ${state}`).toHaveLength(10);
            expect(pages[0], `state ${state}`).toBe(FIRST_STATE_PAGE + state * PAGES_PER_STATE);
            expect(pages[9], `state ${state}`).toBe(FIRST_STATE_PAGE + state * PAGES_PER_STATE + PAGES_PER_STATE - 1);
            pages.slice(1).forEach((page, index) => expect(page).toBeGreaterThanOrEqual(pages[index]));
        }
    });

    it("matches pages printed in the catalogue for known questions", () =>
    {
        const pageOf = (number: number): number => questions[number - 1].pg;
        expect([1, 21, 55, 130, 216, 300, 301, 310, 321, 328, 330, 460].map(pageOf)).toEqual([2, 9, 21, 48, 81, 111, 112, 116, 122, 125, 126, 191]);
    });
});
