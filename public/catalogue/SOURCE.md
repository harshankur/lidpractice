# Source of the questions

`gesamtfragenkatalog-lebenindeutschland.pdf` is the official **Gesamtfragenkatalog zum Test "Leben in Deutschland" und zum "Einbürgerungstest"**, published by the Bundesamt für Migration und Flüchtlinge (BAMF).

- Edition (Stand): 07.05.2025
- Official page: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.html?nn=917926
- Download: https://www.bamf.de/SharedDocs/Anlagen/DE/Integration/Einbuergerung/gesamtfragenkatalog-lebenindeutschland.pdf?__blob=publicationFile&v=23
- SHA-256: `edd3ed5e56a35241b6cc61aa0630482dc9e64498db508a7d6892ccee2ec707a9`
- Size: 8970190 bytes, 191 pages

This file is byte for byte the BAMF download (compared on 2026-10-09). It is the copyright of the BAMF and is kept here only so that the exact edition the questions are based on stays available.

The images `q-001.webp` to `q-460.webp` next to it are cut out of this PDF, one per question, by `scripts/extract-catalogue-pages.mjs`. The 43 pictures in `public/images` are cut out of the same PDF by `scripts/extract-question-pictures.mjs`. Nothing on the site is loaded from another server.

The address, edition, version and checksum above are also recorded in `data/catalogue-source.json`, which the app, the scripts and the weekly check read.
