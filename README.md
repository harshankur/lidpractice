# LiD Practice (Leben in Deutschland, all 460 questions)

A free, single page practice site for the German citizenship test ("Einbürgerungstest") and the test "Leben in Deutschland": the 300 general questions and the 160 questions of the 16 federal states of the official catalogue.

- **Your 310 questions.** You get the 300 general questions and the 10 questions of your own federal state, never the other 150. You choose the state once, in a short dialog on your first visit (together with the language of the site, the appearance and the translation), and can change it at the bottom of the page.
- **Learn** before you practise. 39 short lessons explain what the catalogue asks and why, strictly along the catalogue: every one of your 310 questions is taught in exactly one place. A lesson starts with a guess, explains each fact with its German key term, shows the traps of the test, and ends with a check of real questions. Every fact has a flash card that comes back after 1, 3, 7, 14 and 30 days; the cards open in a dialog over the page, so the lesson below stays where it is. The site notes how far each lesson was read and opens it there again, and every lesson has a tick for "done": it is set when the check is finished, and you can set it or take it back yourself. Every lesson and every section of a lesson has an address of its own (`#learn/<lesson>/<section>`), with a Share button and a small link next to each heading, so a link leads another person straight to that section. Dates are on a timeline whose colours and patterns show the era (dictatorship, occupation, the two German states side by side, unity), and places are on maps (the 16 states, the former GDR, the four occupation zones, the nine neighbours, the seats of the European Parliament). Dates and names can be covered for a self-test. Every answered question in practice, in the training and in the review of an exam has a "Learn why" link, right or wrong: it opens the part of the lesson that explains the question in a dialog over the page, with a link to the whole lesson.
- **Practice** in rounds. Choose the topics with checkboxes (more than one), and the order: the order of the official booklet with the answers as printed (the default), or random. A timeline shows which questions are done, wrong, skipped and still to come. A question can be skipped and answered later. An answer can be changed unless you lock answers, but only your first answer counts for your progress.
- **Train** is an adaptive session over the topics you choose, starting at random. A right answer clears the question and moves on to another topic. A wrong answer, or "I don't know", keeps the question: it comes back after three other questions with a note that says so, and its topic comes up more often until you have it. The session is over when every question is cleared. The widget at the side shows what is cleared, what is left, what is coming back and how every topic stands. Your answers feed the progress and the weak spots like everywhere else.
- **Clock** in the column at the side, below the progress. In practice it counts up or down, as you choose, with a time of your own for the count down and no limit. In the exam it counts down from the official 60 minutes, which you can shorten for practising but not lengthen. A count down tints the time with 15 minutes left, gets a yellow border with 5 and a red border with 1. On a phone, where the clock sits below the question, the time of a running clock also stays in view in a strip at the top.
- **Exam** that mirrors the real test: 33 questions (30 general and 3 of your state), 60 minutes, 17 correct answers to pass. The result lists the mistakes, and on request every answer in the order of the exam, to read through without changing anything.
- **Marking in the exam**: every question can be marked for review with a button or the M key. The finish prompt, a dialog, tells how many questions were never opened and how many were opened and left open. A question that was never opened counts as wrong in the score only, not in your progress.
- **Weak spots**: not a tab. The progress widget and the exam result have a "Practice weak spots" button for a round over every question you last answered wrongly (in practice or in an exam, unanswered exam questions count as wrong). The selection panel can also limit a round to the weak spots inside the chosen topics.
- **German questions.** The questions are always German, because the test is in German. The site itself opens in English. Two separate settings: the language of the site (in the header) and an optional translation shown below the German text (off, English, Arabic, Ukrainian, Turkish, Spanish or Hindi, in the question card, also on the exam start page, key `T`). The site itself is available in German, English, Arabic, Ukrainian, Turkish, Spanish and Hindi. In Arabic the whole page is mirrored (right to left), the German question text stays left to right, and the left arrow key goes to the next question.
- **Original**: every question can be shown cut out of the official PDF, exactly as printed, to check that the text here is authentic.
- No account, no backend, no tracking, and no request to any other server: fonts, pictures and the official catalogue are served by the site itself. Your progress stays in your browser.
- Light and dark theme, installable as an app (icons and web app manifest), works with the keyboard and with screen readers.

It is an independent study aid and is not affiliated with the Bundesamt für Migration und Flüchtlinge (BAMF).

## Where the questions come from

All questions come from the official **Gesamtfragenkatalog zum Test "Leben in Deutschland" und zum "Einbürgerungstest"**, published by the BAMF. This is the source of truth of the whole project.

| | |
|---|---|
| Official page at the BAMF | https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.html?nn=917926 |
| Direct download | https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile&v=23 |
| Edition (Stand) | 07.05.2025 |
| Copy in this repository | [`public/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf`](public/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf) |
| SHA-256 of both | `edd3ed5e56a35241b6cc61aa0630482dc9e64498db508a7d6892ccee2ec707a9` |

The copy in this repository is byte for byte the BAMF download. Anyone can compare: `shasum -a 256 gesamtfragenkatalog-lebenindeutschland.pdf`. All of this is recorded once in [`data/catalogue-source.json`](data/catalogue-source.json), see also [`public/catalogue/SOURCE.md`](public/catalogue/SOURCE.md).

The booklet has 460 questions: 300 for all of Germany and 10 for each of the 16 federal states. This project contains all of them. The general questions keep their number (1 to 300). The state questions are numbered 301 to 460 in the order of the booklet: Baden-Württemberg 301 to 310, Bayern 311 to 320, Berlin 321 to 330, and so on. On the site they are labelled with the state code and the task printed in the booklet, for example `BE 3` for task 3 of Berlin.

Three things are not text in the booklet and come from elsewhere:

- **The correct answers.** The booklet lists the questions and options but does not mark the right answers. The answer key was worked out question by question and then checked a second time by an independent reviewer who did not see it. Pictures with answers (Q21, 130, 209, 226 and the coat of arms and map of every state) were checked against the images in the PDF. Some answers depend on current law and can go stale: the voting age in local elections is set by each state, so recheck Rheinland-Pfalz, Saarland, Thüringen, Hessen, Bayern and Sachsen first when the catalogue or a state law changes.
- **The translations.** The test is German only. The English text was written for this project by hand. Arabic, Ukrainian, Turkish, Spanish and Hindi were translated for all 460 questions and the interface by AI. Every translation is an unofficial aid and the site marks it as such. Numbers are written with the digits 0 to 9 in every language. An independent check on 2026-10-10 compared every option of all 460 questions with the German one in the same position (the stored correct answer is a position, so the order must never change) and found one wording problem, in Hindi Q290, which is fixed.
- **The pictures are the booklet's own.** They are cut out of the PDF (see below), together with their photo credits.

## How it works

```
 BAMF PDF  (public/catalogue/*.pdf, recorded in data/catalogue-source.json)
     |
     |-- scripts/verify-catalogue.mjs ----------> compares every German text, credit and page
     |-- scripts/extract-catalogue-pages.mjs ---> public/catalogue/q-001.webp ... q-460.webp   ("Original")
     |-- scripts/extract-question-pictures.mjs -> public/images/q-021.webp ... (43 pictures)
     |-- scripts/check-catalogue-drift.mjs -----> weekly: has the BAMF published a new edition?

 data/questions.json            what is the same in every language: number, category, answer, picture, page
 data/locales/questions.de.json German text (official)
 data/locales/questions.<code>.json   unofficial translations: en, ar, uk, tr, es, hi
 data/teach/course.json         the plan of the Learn tab: chapters, lessons, which question a unit teaches, German terms, events
 data/teach/maps.json           the shapes of the maps (made by scripts/generate-maps.mjs)
 data/teach/locales/teach.<code>.json   the texts of the lessons, one file per language
 src/locales/<code>.json   every text of the interface, one file per language
 src/*.ts, src/learn/*.ts, src/styles.css, src/template.html
     |
     v
   build.mjs --> dist/index.html   one file: styles, script, the German questions and the messages of German and English (about 380 KB, 100 KB compressed)
                 dist/locales/     every other language, fetched when it is chosen: messages (20 to 40 KB) and questions (85 to 190 KB) per language,
                                   and the texts of the Learn tab (210 to 410 KB per language), fetched when that tab is opened
                 dist/teach/       the plan and the maps of the Learn tab (40 and 75 KB), fetched when that tab is opened
                 dist/images/, dist/catalogue/, dist/fonts/, icons, site.webmanifest
```

The site is static. `dist/` is the complete website and there is nothing to run on a server.

### The data and its languages

The question bank is split so that the part that must never differ between languages is written once, and each language is its own file that can be reviewed on its own. German and English are separate files, because the question texts are the heart of the project and are checked against the PDF line by line.

| File | Holds |
|---|---|
| `data/questions.json` | 460 entries: `n` number, `k` category id (for a state question, the id of the state), `r` index of the correct option, `img` picture path or `null`, `pg` page of the PDF. The index is the question number minus one, so entries are never reordered or inserted. |
| `data/locales/questions.de.json` | The German texts: categories, and per question `q`, four options `a`, and `cap`, the photo credit or source note printed under the picture. This is the official text and the only language compared with the PDF. |
| `data/locales/questions.<code>.json` | The same in English (by hand) and in Arabic, Ukrainian, Turkish, Spanish and Hindi (translated by AI), each flagged `"official": false`. |

Every file has one question per line, so a change to one question is a change to one line. Options keep the order of the catalogue in every language, so `r` is valid for all of them.

### The course of the Learn tab

The course is kept the way the question bank is: what is the same in every language is written once, and every language is a file of its own.

| File | Holds |
|---|---|
| `data/teach/course.json` | The plan: 14 chapters, 39 lessons. A lesson is a list of blocks: fact units (the questions a unit teaches, its German key term with the joins of a compound marked by a middle dot, the German answer of its flash card, its era), pictures of catalogue questions, tables, chains, timeline excerpts, maps, traps and questions to recall. Also the eras, the 20 events of the timeline, the German names on the maps, the question asked before reading and the questions of the check. |
| `data/teach/locales/teach.<code>.json` | The texts of one language, by lesson and block id. `{{Grundgesetz}}` marks a German word, which stays German in every language, and `**not**` marks a word that carries a trap. English was written first; the other six are translations. |
| `data/teach/maps.json` | Two maps as SVG paths in whole numbers: Germany with its 16 states, and Germany with its neighbours. |

Rules the tests enforce (`tests/data/course.test.ts`): every general question 1 to 300 is taught by exactly one unit, and the ten tasks of a federal state by the one lesson that is filled in for the user's state from the catalogue answers; a lesson asks before reading and checks at the end only with questions it teaches; every language has the same lessons, blocks, list lengths, placeholders and German terms as English; no file contains a long dash or the digits of another script; the course builds for all 7 languages and all 16 states.

Nothing in the lessons goes beyond the catalogue. A fact that can change (the Chancellor, the number of EU members) carries `asOf` with the year of the catalogue edition and says so on the page. The lessons and their translations were written with AI and checked against the questions: treat them like the unofficial translations of the questions.

The maps are made from [Natural Earth](https://www.naturalearthdata.com/) (public domain, 1:10m admin 0 and admin 1). `node scripts/generate-maps.mjs <folder with ne_10m_admin_0_countries.geojson and ne_10m_admin_1_states_provinces.geojson>` projects them (Lambert azimuthal equal-area, centred on Germany), cuts them to a frame, snaps them to whole numbers so that shared borders stay shared, and writes `data/teach/maps.json`. The two source files are not in the repository; the result is, so the generator only has to run when a map changes.

Learning progress is saved with the rest of the progress in the browser: the day each lesson was marked as done, how far each lesson was read (the section reading stopped at, and the share that has come into view), the box and the due day of every flash card, the lesson that was open last, and the last 20 exam results. Reading alone never marks a lesson as done: that takes the check or the user's own tick.

Addresses: every tab has an address of its own, the part of the address after `#` (`src/address.ts`): `#learn`, `#practice`, `#train` and `#exam`. The plain address of the site opens the page that was open last (practice on a first visit), and the address then names it; practice keeps the plain address. A link always wins over the page that was open last. An address that names no tab is put right to `#practice`. Opening another tab is a step in the history of the browser, so its Back button leads to the tab before; a running exam is not left that way, and its address is put back. The title of the page, which the browser shows on its tab and in its history, names what shows in front of the name of the site: the lesson, the timeline or the maps, or else the tab (`Train | LiD Practice`); the plain address keeps the plain name. The Learn tab has an address for every page of it (`src/learn/route.ts`): `#learn`, `#learn/timeline`, `#learn/maps`, `#learn/<lesson>` and `#learn/<lesson>/<section>`. The names are the ids of the course, so a link works in every language. Opening a page of the tab is a step in the history as well, and the page is put where the user left it. The lesson about a federal state exists for the visitor's own state: a link made for another state opens the visitor's lesson and says so, and a first visit by such a link offers that state in the welcome dialog. "Ready for the test?" on the Learn tab asks for three things, each of them evidence and none of them reading alone: every lesson finished, 80% of the cards in box 3 or higher, and two practice exams with 25 or more of 33 on different days.

### The interface and its languages

Every text the user can read is a message in `src/locales/de.json` or `src/locales/en.json`, and the code only refers to keys: `t("exam.progress", { current, total })`. Plural forms use `.one` and `.other` keys, numbers are formatted by the language, and FAQ paragraphs can contain `[text](linkId)` links. German is the default and the base. `?lang=en` in the address switches the interface to English and remembers it. The parameter is then taken out of the address, so a language chosen later in the page is kept.

Adding a language, for example Turkish (`tr`):

1. Add `data/locales/questions.tr.json` (same questions, `"official": false`) and `src/locales/tr.json` (same keys as `de.json`).
2. Add `"tr"` to the `Locale` type and `LOCALES` in `src/types.ts`, and to `CATALOGS` in `src/i18n.ts`.
3. Add its name as `language.endonym.tr` in every language file. It then appears in the site language list and, as a translation, in the translation list (`TRANSLATION_LOCALES` is every language except German).
4. Run `npm test`. It fails until every file has exactly the same keys and questions, no value is empty, and placeholders and links match.

### The app

Plain TypeScript, no framework, strict mode, one file per concern:

| File | Job |
|---|---|
| `src/app.ts` | The app: header, practice rounds, exam, rendering, keyboard shortcuts. Also re-exports the modules below. |
| `src/round.ts` | A round of practice as plain logic: the slots, answering, skipping, going back, looking at earlier questions, the end. Random order draws the next question only when the user moves on. |
| `src/timeline.ts`, `src/topicPanel.ts`, `src/topics.ts` | The scrollable timeline of a round, the panel in which topics (checkboxes) and order are chosen, and the grouping of the 13 subjects. |
| `src/bank.ts`, `src/store.ts` | The question bank with every language, and the saved progress and settings (validated when loaded). |
| `src/i18n.ts`, `src/locales/` | Messages, plural forms, number formatting. |
| `src/train.ts` | The model of the training session (`Trainer`): the draw, what a right or wrong answer does, when a missed question comes back. No DOM. |
| `src/learn/learn.ts` | The Learn tab: the list of lessons, a lesson, the flash cards, the timeline and the maps. It keeps what is on screen; the app owns the saved progress. |
| `src/learn/course.ts`, `src/learn/loader.ts`, `src/learn/types.ts` | The course put together from the plan and the texts of one language (`CourseBook`), the lesson about the user's state filled in from the catalogue answers, and the loader that fetches and checks the three files when the tab is opened. |
| `src/learn/schedule.ts`, `src/learn/progress.ts` | The five boxes of the flash cards on calendar days and a run through cards, and what counts as progress: lesson states, what is due, readiness, the next step. No DOM. |
| `src/learn/views.ts`, `src/learn/chronology.ts`, `src/learn/maps.ts`, `src/learn/richText.ts` | The pieces a lesson is drawn from, the timeline, the maps with their numbered lists, and the small markup of the course texts. Whatever is covered keeps its room, so uncovering moves nothing. |
| `src/address.ts`, `src/learn/route.ts`, `src/share.ts` | The addresses of the tabs and of the pages of the Learn tab (reading and writing the part after `#`), and handing a link over: the share sheet on a touch device, the clipboard elsewhere, a field to copy from by hand where neither is allowed. |
| `src/fetchOnce.ts` | Fetches a JSON file of the site once, however often it is asked for. Shared by the languages and the course. |
| `src/random.ts`, `src/format.ts`, `src/errorBoundary.ts` | Crypto based shuffling (options are shuffled, except on picture questions), the exam clock, the only place that catches errors and writes to the console. |
| `src/modal.ts`, `src/views.ts`, `src/content.ts` | The single blocking dialog of the page (focus stays inside, Escape and a click outside close it, the page behind is inert) and what it shows: the original question, the report options, About and FAQ. |
| `src/listbox.ts` | The choice list (site language, appearance, translation). It replaces the browser's own select and follows the ARIA listbox pattern: arrows, Home, End, Page keys, typing letters, Enter, Space and Escape. |
| `src/theme.ts` | Light, dark or system theme, by a class on the root element. |
| `src/links.ts`, `src/constants.ts`, `src/identity.json` | Links to the PDF page, GitHub issues and email, shared constants, and the one place where the product name is written. |
| `src/dom.ts` | The small `el()` helper that builds elements. Text is always added as text, never as markup. |
| `build.mjs` | Bundles everything with esbuild into `dist/` and fills the page head from the identity and the default language. |

Everything beyond the page itself, such as the original question, the FAQ and reporting, opens in the same dialog. There are no separate pages.

### View original, FAQ and reporting

- **Original** (a button on every question) opens a dialog with the question cut out of the official PDF, the page number, a link to that exact page of the PDF, and links to the BAMF.
- **About and FAQ** and **Report a problem** are in the footer. The language of the site and the appearance are in the header.
- **Reporting** offers two ways. A GitHub issue that opens with the question number already filled in, or an email to **hello@lidpractice.de** with a short template in the language of the interface. Either is fine.
- **Pictures** show where they come from when you hover over them (the page of the catalogue, and the photo credit), and the credit is printed under the picture.

## Why you can trust a question

1. **The text is checked against the PDF.** `npm run catalogue:verify` compares the German question and four options of all 460 questions, word for word and in the printed order, with the PDF. Last run: 455 identical, 5 with documented cosmetic differences (listed with reasons in `scripts/lib/catalogue.mjs`), 6 picture credits. Tests keep this true by comparing hashes (`tests/data/catalogue-fingerprints.json`), so no catalogue text has to be stored for the check.
2. **You can see the original.** The images behind "Original" are cut out of the PDF by `scripts/extract-catalogue-pages.mjs`. Before it writes anything it checks that the text inside every cut is exactly the catalogue text of that question, so a cut cannot clip a line or include the neighbouring question.
3. **Pictures come from the PDF and are pinned.** `scripts/extract-question-pictures.mjs` cuts each picture from the place where the catalogue prints it, and a test pins every file by hash.
4. **The answer key is pinned.** The 460 correct answers are in a test as a string, so an accidental edit fails the build.
5. **Every language has the same questions.** Tests fail if a language misses a question, has an empty text, a different number of options or a different set of credits.

```bash
npm run catalogue:verify        # compare the German text with the PDF in the repo
npm run catalogue:images        # rebuild the 460 original images and the page numbers
npm run catalogue:pictures      # rebuild the 13 question pictures
```

These need [poppler](https://poppler.freedesktop.org) (`brew install poppler`).

## Run it locally

Needs Node 20 or newer.

```bash
npm install
npm run build          # type-checks and writes dist/
npm run serve          # http://localhost:8080
```

Nothing has to be downloaded: the pictures, fonts, icons and the catalogue are in the repository.

| Command | What it does |
|---|---|
| `npm run build` | Type-check, bundle, write `dist/`. `OUT_DIR=somewhere npm run build` writes elsewhere. |
| `npm run serve` | Serves `dist/` on port 8080. |
| `npm run lint` | ESLint. |
| `npm test` | The full gate, see below. |
| `npm run catalogue:verify`, `:images`, `:pictures` | See above. |
| `npm run catalogue:drift` | Asks the BAMF whether there is a new edition. |
| `npm run assets:icons`, `npm run assets:fonts` | Recreate the icon files and the web app manifest, or copy the fonts from the font packages. Needed only when the icon or the fonts change. |
| `node scripts/generate-maps.mjs <folder>` | Recreates `data/teach/maps.json` from the two Natural Earth files in the folder. Needed only when a map changes. |

## Testing

```bash
npm test               # lint, typecheck, clean, build, unit tests with coverage floor, end-to-end tests
npm run test:unit      # Vitest: unit, data, build and lint tests, with an enforced coverage floor
npm run test:e2e       # Playwright in a real browser, needs `npm run build` first
```

- `tests/unit`: randomness, question bank, storage, language and plural handling, the dialog, the listbox, the theme, and the whole app driven through the DOM (practice, weak spots in practice, exam, timer, keyboard, German and English). For the Learn tab: the card boxes, the course builder, the timeline, the maps, the pieces of a lesson, and the tab itself with the real course (loading, a lesson from guess to check, flash cards across days, language and state changes), and the geometry of the map generator.
- `tests/data`: the course of the Learn tab (see above), both question languages and their parity, the interface language files (same keys, placeholders and links in every language, no key left unused), the answer key, agreement with the catalogue, pictures, original images, the PDF copy, icons, manifest and fonts, design tokens, issue forms, workflows and license.
- `tests/build`: the build output, nothing loaded from another server, hostile data in the page, and a smoke boot of the built page.
- `tests/lint`: proves that the lint rules really fire. They ban native selects and date or colour inputs, `alert`, `confirm`, `prompt` and `window.open`, text typed into the code instead of the language files, direct console use, `new Error("...")` and magic numbers.
- `tests/e2e`: the built site in Chrome, on desktop and a phone viewport: the exam, the pictures, the dialog, the listbox keyboard contract, languages, themes, layout, the Learn tab (with measurements that nothing moves when an answer, a date or a name is uncovered or a lesson is ticked off, that the list and a lesson come back where the user left them, and that a link leads to its section), and that no request leaves the site. It uses your installed Chrome. In CI the workflow installs Chromium and sets `PW_CHANNEL=""`.

## When the official catalogue changes

The BAMF updates the catalogue from time to time. Questions that depend on the current situation are the most likely to change: the Chancellor (Q72), the largest parliamentary groups (Q73), the head of state (Q75), the population (Q213) and the number of EU member states (Q236).

**It is checked automatically.** The workflow [`.github/workflows/catalogue-drift.yml`](.github/workflows/catalogue-drift.yml) runs every Monday. It reads the BAMF page, downloads the PDF it links to and compares version, date, size and checksum with `data/catalogue-source.json`. When something differs it opens an issue with the label `catalogue-drift`, including how many of our questions differ from the new PDF. The same change is reported only once. GitHub pauses scheduled workflows in a repository without activity for 60 days, so re-enable it under Actions if that happens.

**If you notice a new edition yourself**, please [open an issue](../../issues/new/choose) with "The official catalogue has changed", or write to hello@lidpractice.de.

**Updating to a new edition** (for maintainers):

1. Download the new PDF from the BAMF page and replace `public/catalogue/gesamtfragenkatalog-lebenindeutschland.pdf`. Update `data/catalogue-source.json` (Stand, version, date, size, pages, checksum) and the checksum in `public/catalogue/SOURCE.md` and this README.
2. Run `npm run catalogue:verify`. It lists every question that differs. Fix the German file `data/locales/questions.de.json` and the neutral `data/questions.json`: new or reworded questions, options, pictures and credits. Question numbers are the task numbers in the PDF, so the index rule still holds.
3. Update the English file for every changed question, and check the answers of changed questions.
4. Run `npm run catalogue:images` and `npm run catalogue:pictures` to rebuild the images and the page numbers, and `node scripts/verify-catalogue.mjs --write-fingerprints` to refresh the fingerprints.
5. Update the golden values in the tests that fail (answer key, picture hashes, credits) after checking each change, then run `npm test`.

## Reporting a problem

On the site: **Original**, then **Report a problem with this question**, or **Report a problem** in the footer. On GitHub: [new issue](../../issues/new/choose) with one of three forms: a problem with a question, a changed catalogue, or a bug on the page. By email: hello@lidpractice.de. The labels `question-error`, `catalogue-drift` and `bug` mark them.

## Hosting

Upload the contents of `dist/` to any static host. The files in `locales/` and `teach/` carry a fingerprint in their address, so they can be cached for a long time as well. For Netlify, Cloudflare Pages or similar: build command `npm run build`, publish folder `dist`, Node 20 or newer. The pictures, the fonts and `catalogue/` never change between releases, so they can be cached for a long time. `index.html` should not be cached for long. There is no third party request to configure, allow or block.

`netlify.toml` holds the build, the cache policy, security headers (including a Content-Security-Policy that allows only the site itself: it was checked against the built page), and and nothing else that depends on the address. The address of the site is `siteUrl` in `src/identity.json`; the build puts it into the canonical link and the share tags, and `public/robots.txt` and `public/sitemap.xml` name it as well, so change those two files too if the address changes. All other addresses in the page are relative, so the site works on any domain or path. Progress is stored per address in the browser: a visitor who used the site under another address (for example a `netlify.app` one) starts empty on the new domain.

Connecting the domain: in Netlify, Domain management, add `lidpractice.de` as the primary domain; Netlify adds `www.lidpractice.de` and sends it to the primary one. The DNS of lidpractice.de is at Cloudflare: add the records Netlify shows there (for the bare domain a CNAME to the `netlify.app` name of the site, which Cloudflare flattens, or the address Netlify names; for `www` a CNAME to the same `netlify.app` name), with the proxy off ("DNS only"), so Netlify can issue the HTTPS certificate. Keep the MX and TXT records of the email routing as they are.

## Legal notice and privacy notice (Impressum, Datenschutz)

`impressum.html` and `datenschutz.html` are plain pages of their own (German with an English copy), built from `src/impressum.html`, `src/datenschutz.html`, `src/legal.css` and the details in `src/legal.json` (name, address lines, country, email, optional business name and phone). It needs no JavaScript, and the footer of the app links to it in a new tab so a running exam is not lost. While `addressLines` still holds placeholders in square brackets, the build prints a warning: fill them in before publishing. Add the phone number only once it works. Other sites can link to `https://<site>/impressum.html`. The privacy notice names the host (Netlify), the DNS provider (Cloudflare) and the email forwarding to a Google mailbox: change it when any of them changes, and when something that stores or sends data is added to the site.

## Layout of the repository

```
data/questions.json            what is the same in every language
data/locales/                  one file per language of the question bank
data/teach/                    the course of the Learn tab: plan, maps, and one file of texts per language
data/catalogue-source.json     edition, address and checksum of the official PDF
public/catalogue/              the official PDF, its provenance note, and 460 original question images
public/images/                 the 13 question pictures, cut from the PDF
public/fonts/                  the fonts (Latin and Latin Extended of the two main fonts, Cyrillic, Arabic and Devanagari of Noto Sans), with their license texts
public/                        favicon, touch icon, app icons, site.webmanifest
src/                           the app (TypeScript, CSS, HTML shell, interface languages in src/locales, the Learn tab in src/learn)
scripts/                       build helpers, catalogue verification, image extraction, drift check, icon and font tools
tests/                         unit, data, build, lint and end-to-end tests
.github/ISSUE_TEMPLATE/        the three issue forms
.github/workflows/             the test run and the weekly catalogue check
build.mjs                      bundler
```

## License and credits

The code is under the [PolyForm Noncommercial License 1.0.0](LICENSE): free for personal use, study, hobby projects, education and other noncommercial purposes. Commercial use is not permitted. This is a source-available license, not an OSI open source license.

The license covers the code in this repository. It does not cover:

- the questions and the PDF: they are published by the Bundesamt für Migration und Flüchtlinge ("Gesamtfragenkatalog", Stand 07.05.2025). The PDF copy is kept here so that the exact edition stays available. The English translations are informal study aids, not official texts.
- the pictures and the images behind "Original": they are cut out of the official PDF and belong to the BAMF and the credited photographers. Photo credits are shown under the pictures that need them.
- the maps of the Learn tab: their shapes are made from Natural Earth, which is in the public domain.
- the fonts: Public Sans, Bricolage Grotesque, Noto Sans (Cyrillic), Noto Sans Arabic and Noto Sans Devanagari, under the SIL Open Font License 1.1, the license texts are in `public/fonts`. A page downloads only the fonts for the scripts it shows.

