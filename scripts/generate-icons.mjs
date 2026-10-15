// Creates the icon files and the web app manifest from public/favicon.svg and src/identity.json.
// The names are fixed:
//   public/favicon.ico  public/favicon.svg  public/apple-touch-icon.png (180)
//   public/icon-192.png  public/icon-512.png  public/site.webmanifest
//
//   node scripts/generate-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

/** Folder of the static files. */
const PUBLIC = "public";

/** PNG sizes of the icons. The classic favicon holds the small sizes. */
const APPLE_TOUCH_SIZE = 180;
const ICON_SIZES = [192, 512];
const FAVICON_SIZES = [16, 32, 48];

/** Colours of the browser bar and of the start screen of the installed app. */
const THEME_COLOR = "#14171f";
const BACKGROUND_COLOR = "#f2f3f6";

/** Size of the header of an ICO file, of one directory entry, and the value that means 256 pixels. */
const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;

const identity = JSON.parse(readFileSync("src/identity.json", "utf8"));
const ui = JSON.parse(readFileSync(`src/locales/${identity.defaultUiLocale}.json`, "utf8"));
const svg = readFileSync(`${PUBLIC}/favicon.svg`);
// iOS rounds the corners itself and turns transparent corners black, so its icon is a full square.
const squareSvg = Buffer.from(svg.toString("utf8").replace(/rx="\d+"/, "rx=\"0\""));

/**
 * Renders an SVG to a PNG of a given size.
 * @param {Buffer} source SVG.
 * @param {number} size Width and height in pixels.
 * @returns {Promise<Buffer>} PNG.
 */
function png(source, size)
{
    return sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
}

/**
 * Packs PNG images into an ICO file. Browsers read PNG data inside ICO.
 * @param {{ size: number, data: Buffer }[]} images Images.
 * @returns {Buffer} ICO file.
 */
function ico(images)
{
    const header = Buffer.alloc(ICO_HEADER_BYTES);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    let offset = ICO_HEADER_BYTES + ICO_ENTRY_BYTES * images.length;
    const entries = images.map(({ size, data }) =>
    {
        const entry = Buffer.alloc(ICO_ENTRY_BYTES);
        entry.writeUInt8(size, 0);
        entry.writeUInt8(size, 1);
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(data.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += data.length;
        return entry;
    });
    return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

writeFileSync(`${PUBLIC}/apple-touch-icon.png`, await png(squareSvg, APPLE_TOUCH_SIZE));
for (const size of ICON_SIZES)
{
    writeFileSync(`${PUBLIC}/icon-${size}.png`, await png(svg, size));
}
const small = await Promise.all(FAVICON_SIZES.map(async (size) => ({ size, data: await png(svg, size) })));
writeFileSync(`${PUBLIC}/favicon.ico`, ico(small));

const manifest = {
    name: identity.name,
    short_name: identity.shortName,
    description: ui["app.description"],
    lang: identity.defaultUiLocale,
    start_url: ".",
    scope: ".",
    display: "standalone",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: ICON_SIZES.map((size) => ({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
};
writeFileSync(`${PUBLIC}/site.webmanifest`, `${JSON.stringify(manifest, null, 4)}\n`);
console.log("wrote icons and site.webmanifest");
