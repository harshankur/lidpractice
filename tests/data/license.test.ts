import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const license = readFileSync("LICENSE", "utf8");
const manifest: { license: string; author: string; private: boolean } = JSON.parse(readFileSync("package.json", "utf8"));

describe("license", () =>
{
    it("is the PolyForm Noncommercial License 1.0.0, declared with its SPDX id", () =>
    {
        expect(manifest.license).toBe("PolyForm-Noncommercial-1.0.0");
        expect(license).toContain("# PolyForm Noncommercial License 1.0.0");
        expect(license).toContain("https://polyformproject.org/licenses/noncommercial/1.0.0");
    });

    it("starts with the Required Notice line the license asks every copy to carry", () =>
    {
        const [firstLine] = license.split("\n");
        expect(firstLine).toMatch(/^Required Notice: Copyright 20\d\d Harsh Ankur \(https:\/\/github\.com\/harshankur\/lidpractice\)$/);
        expect(manifest.author).toBe("Harsh Ankur");
    });

    it("keeps the terms that make it noncommercial and personal friendly", () =>
    {
        expect(license).toContain("Any noncommercial purpose is a permitted purpose.");
        expect(license).toContain("Personal use for research, experiment, and testing for the benefit of public knowledge, personal study, private entertainment, hobby projects, amateur pursuits, or religious observance");
        expect(license).toContain("## No Other Rights");
    });

    it("is stated in the README together with what it does not cover", () =>
    {
        const readme = readFileSync("README.md", "utf8");
        expect(readme).toContain("PolyForm Noncommercial License 1.0.0");
        expect(readme).toContain("Commercial use is not permitted");
        expect(readme).toContain("does not cover");
    });
});
