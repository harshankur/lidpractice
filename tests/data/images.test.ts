import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readNeutral } from "../../scripts/lib/data.mjs";

/** Folder the pictures are in, served from the same site as the page. */
const FOLDER = "public";

/** A WebP file starts with "RIFF", four size bytes, and "WEBP". */
const RIFF = "RIFF";
const WEBP = "WEBP";
const WEBP_TAG_OFFSET = 8;

/** Plausible sizes of a picture. */
const MIN_BYTES = 5 * 1024;
const MAX_BYTES = 400 * 1024;
const MIN_WIDTH = 500;
const MAX_WIDTH = 1300;

const withPicture = readNeutral().filter((entry) => entry.img !== null) as { n: number; img: string }[];

/**
 * Content fingerprint (first 32 hex characters of SHA-256) of each picture, with what it shows.
 * The pictures of the states are tasks 1 (coat of arms) and 8 (map) of each state, and the answers were checked against them. Each picture is cut from the official catalogue (scripts/extract-question-pictures.mjs), from the place where the catalogue
 * prints it under the same task number, and was looked at after cutting. A changed file means it was cut again: look at it, then update here.
 */
const VERIFIED_PICTURES: Record<number, { sha: string; shows: string }> = {
    21: { sha: "1239be405817db058abaf99e0dbd8f18", shows: "four emblems: Bundesadler, Chi-Rho, Bundeswehr cross, DDR emblem, labelled Bild 1 to 4" },
    55: { sha: "8da6fa0058435df5276238615abb0251", shows: "Reichstag building with flags (photo)" },
    70: { sha: "d600290d22c1eaa10696054dda8c5175", shows: "Heinemann hands Schmidt his certificate as Chancellor, 1974 (photo)" },
    130: { sha: "770c1b42cca81c6dbd6aa00fc2fc8dbc", shows: "four sample ballot papers (Stimmzettel)" },
    176: { sha: "d49f552c9fe3e56e8df98b3f35a97458", shows: "map of the four occupation zones, numbered 1 to 4" },
    181: { sha: "2c7ea01ca432f76f4cb6862a078d2c8b", shows: "Willy Brandt kneeling in Warsaw, 1970 (photo)" },
    187: { sha: "987030be4f76983fa3597a7a1ab22d12", shows: "DDR flag with hammer, compass and wreath" },
    209: { sha: "1239be405817db058abaf99e0dbd8f18", shows: "four emblems: Bundesadler, Chi-Rho, Bundeswehr cross, DDR emblem, labelled Bild 1 to 4" },
    216: { sha: "a896f8d492cff14c4e7f759ae465eb5b", shows: "plenary hall of the Bundestag with the Bundesadler (photo)" },
    226: { sha: "7f63c16c7762bfa62286540c7fba377b", shows: "four flags: USA, European Union, United Nations, CEFTA, labelled Bild 1 to 4" },
    235: { sha: "2efd09ea7f4274fa3cfe9e857f026686", shows: "Mitterrand and Kohl hand in hand in Verdun (photo)" },
    301: { sha: "afe9b466264b19d7f84d1a25c6e8123f", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Baden-Württemberg is Bild 1" },
    308: { sha: "296aa521097da22ad87ef3fcde473b06", shows: "map of Germany with four numbered places, 2 is Baden-Württemberg" },
    311: { sha: "da8a4a4434a99f9e8ac65bfa2764607b", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Bavaria is Bild 2" },
    318: { sha: "963cf56a009387855c7c7b5d76a1be22", shows: "map of Germany with four numbered places, 4 is Bavaria" },
    321: { sha: "7a5fb65f4505574ab8ed8ef591e90417", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Berlin is Bild 4" },
    328: { sha: "ae910bbb71d8df1a68d8a30a1f8664e3", shows: "map of Germany with four numbered places, 4 is Berlin" },
    331: { sha: "de7ebec632e1d19bf936e76312fb541b", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Brandenburg is Bild 1" },
    338: { sha: "8710cebfef069f7b81a0f30932ca0361", shows: "map of Germany with four numbered places, 4 is Brandenburg" },
    341: { sha: "0c581d07ab2bb902f1dcb58f7fdccc6a", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Bremen is Bild 3" },
    348: { sha: "39f418abfbee13289706d33765073790", shows: "map of Germany with four numbered places, 1 is Bremen" },
    351: { sha: "86bd635b4f81f1b8e2467ba02a1dddff", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Hamburg is Bild 2" },
    358: { sha: "ae910bbb71d8df1a68d8a30a1f8664e3", shows: "map of Germany with four numbered places, 3 is Hamburg" },
    361: { sha: "36a68790397dec3e8e672bdbf669132b", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Hesse is Bild 1" },
    368: { sha: "781686edb83af355b5385b1bf892011b", shows: "map of Germany with four numbered places, 3 is Hesse" },
    371: { sha: "4f4852be243e639f64f1619829cb28af", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Mecklenburg-Western Pomerania is Bild 3" },
    378: { sha: "30c9b4fba9e60a4f68fa0130e73d6d8a", shows: "map of Germany with four numbered places, 3 is Mecklenburg-Western Pomerania" },
    381: { sha: "7c21f26c24ae3e9fbcb92763b82cb703", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Lower Saxony is Bild 3" },
    388: { sha: "0867c9d2b27acd1c800305f715d5ee1f", shows: "map of Germany with four numbered places, 1 is Lower Saxony" },
    391: { sha: "5f8e2065b904dca64836400bf22cd21d", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of North Rhine-Westphalia is Bild 2" },
    398: { sha: "cef381e5273a9e6517b78b5f3e418ea4", shows: "map of Germany with four numbered places, 3 is North Rhine-Westphalia" },
    401: { sha: "c260b1324b74a6dfe5865b07e646dd62", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Rhineland-Palatinate is Bild 1" },
    408: { sha: "e6411a354e9e03fb5441abd333e111fd", shows: "map of Germany with four numbered places, 1 is Rhineland-Palatinate" },
    411: { sha: "f5cf1b5f454b8ee993ce630a4b1ca57b", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Saarland is Bild 4" },
    418: { sha: "ecf01344b3bf36e5847bd1e2d4d7169d", shows: "map of Germany with four numbered places, 2 is Saarland" },
    421: { sha: "2c46b151f02743b22eb55d9920c26f65", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Saxony is Bild 4" },
    428: { sha: "d008961e35800eeb0d4f8660d1660dbb", shows: "map of Germany with four numbered places, 4 is Saxony" },
    431: { sha: "cd9639d6aebda4425384463ad4cc531f", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Saxony-Anhalt is Bild 4" },
    438: { sha: "7f58b98c31970e09ac3d298ba027831a", shows: "map of Germany with four numbered places, 3 is Saxony-Anhalt" },
    441: { sha: "acedc55684e7224fbe1f82b91762aa03", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Schleswig-Holstein is Bild 3" },
    448: { sha: "896ed3ecd06d5d861c30e9330e0c268c", shows: "map of Germany with four numbered places, 1 is Schleswig-Holstein" },
    451: { sha: "057a410db441ce9cd3606106bb2a3015", shows: "four coats of arms, labelled Bild 1 to 4, the coat of arms of Thuringia is Bild 4" },
    458: { sha: "7bdbcb2fe028b76edf250fa84da6f55c", shows: "map of Germany with four numbered places, 2 is Thuringia" },
};

describe("question pictures", () =>
{
    it.each(withPicture)("Q$n: $img is a WebP picture of this site", async ({ img }) =>
    {
        const path = `${FOLDER}/${img}`;
        expect(existsSync(path), `${path} is missing, run npm run catalogue:pictures`).toBe(true);
        expect(statSync(path).size).toBeGreaterThan(MIN_BYTES);
        expect(statSync(path).size).toBeLessThan(MAX_BYTES);
        const bytes = readFileSync(path);
        expect(bytes.subarray(0, RIFF.length).toString("latin1")).toBe(RIFF);
        expect(bytes.subarray(WEBP_TAG_OFFSET, WEBP_TAG_OFFSET + WEBP.length).toString("latin1")).toBe(WEBP);
        const meta = await sharp(bytes).metadata();
        expect(meta.width).toBeGreaterThan(MIN_WIDTH / 2);
        expect(meta.width).toBeLessThan(MAX_WIDTH);
        expect(meta.height).toBeGreaterThan(MIN_BYTES / 100);
    });

    it("are not taken from any other server: no address in the data points outside this site", () =>
    {
        for (const entry of withPicture)
        {
            expect(entry.img).not.toMatch(/^[a-z]+:\/\//i);
            expect(entry.img.startsWith("/")).toBe(false);
        }
    });
});

describe("question pictures are tied to the right questions", () =>
{
    it("covers exactly the questions that carry a picture", () =>
    {
        expect(Object.keys(VERIFIED_PICTURES).map(Number)).toEqual(withPicture.map((entry) => entry.n));
    });

    it.each(withPicture)("Q$n: $img is the picture the catalogue prints under this task", ({ n, img }) =>
    {
        const sha = createHash("sha256").update(readFileSync(`${FOLDER}/${img}`)).digest("hex").slice(0, 32);
        expect(sha, `${img} (${VERIFIED_PICTURES[n].shows})`).toBe(VERIFIED_PICTURES[n].sha);
    });

    it("Q21 and Q209 show the same four emblems, each from its own file", () =>
    {
        expect(VERIFIED_PICTURES[21].shows).toBe(VERIFIED_PICTURES[209].shows);
        expect(withPicture.find((entry) => entry.n === 21)?.img).not.toBe(withPicture.find((entry) => entry.n === 209)?.img);
    });

    it("leaves no old picture file in the folder", () =>
    {
        const expected = new Set(withPicture.map((entry) => entry.img.split("/").pop()));
        const present = readdirSync("public/images");
        expect(present.sort()).toEqual([...expected].sort() as string[]);
    });
});
