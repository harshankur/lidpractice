// Copies the web fonts and their license texts, from the Fontsource packages into public/fonts.
// Run again only when a font package is updated. The site serves the fonts itself, so it makes no
// request to a third party (and nothing about a visitor is sent to a font host).
//
//   node scripts/vendor-fonts.mjs
import { copyFileSync, mkdirSync } from "node:fs";

/** Where the files go. */
const OUT = "public/fonts";

/**
 * What to copy. Public Sans and Bricolage Grotesque: the Latin and the Latin Extended subsets (German, English, Spanish, Turkish).
 * Noto Sans: the Cyrillic subset (Ukrainian), Noto Sans Arabic and Noto Sans Devanagari: the script itself, in the weights 400 and 700.
 * Fonts for a script are only downloaded by a page that shows that script (unicode-range in styles.css).
 */
const FONTS = [
    {
        from: "node_modules/@fontsource-variable/public-sans",
        files: ["public-sans-latin-wght-normal.woff2", "public-sans-latin-ext-wght-normal.woff2"],
        license: "OFL-Public-Sans.txt",
    },
    {
        from: "node_modules/@fontsource-variable/bricolage-grotesque",
        files: ["bricolage-grotesque-latin-wght-normal.woff2", "bricolage-grotesque-latin-ext-wght-normal.woff2"],
        license: "OFL-Bricolage-Grotesque.txt",
    },
    {
        from: "node_modules/@fontsource-variable/noto-sans",
        files: ["noto-sans-cyrillic-wght-normal.woff2"],
        license: "OFL-Noto-Sans.txt",
    },
    {
        from: "node_modules/@fontsource/noto-sans-arabic",
        files: ["noto-sans-arabic-arabic-400-normal.woff2", "noto-sans-arabic-arabic-700-normal.woff2"],
        license: "OFL-Noto-Sans-Arabic.txt",
    },
    {
        from: "node_modules/@fontsource/noto-sans-devanagari",
        files: ["noto-sans-devanagari-devanagari-400-normal.woff2", "noto-sans-devanagari-devanagari-700-normal.woff2"],
        license: "OFL-Noto-Sans-Devanagari.txt",
    },
];

mkdirSync(OUT, { recursive: true });
for (const font of FONTS)
{
    for (const file of font.files)
    {
        copyFileSync(`${font.from}/files/${file}`, `${OUT}/${file}`);
        console.log(`copied ${file}`);
    }
    copyFileSync(`${font.from}/LICENSE`, `${OUT}/${font.license}`);
}
