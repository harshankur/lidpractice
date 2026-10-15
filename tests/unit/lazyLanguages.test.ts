// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionBank } from "../../src/bank";
import { LanguageLoader } from "../../src/languages";
import { hasCatalog } from "../../src/i18n";
import {
    breakServer, chooseFromListbox, chooseTranslation, mountApp, REAL_BUNDLE, requests, settle, shownNumber,
} from "../helpers/appHarness";

/** The addresses of the language files that were asked for, without the folder. */
function asked(): string[]
{
    return requests.map((address) => address.replace("locales/", "")).sort();
}

describe("languages that are fetched when they are asked for", () =>
{
    beforeEach(() =>
    {
        window.localStorage.clear();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() =>
    {
        breakServer(null);
        vi.restoreAllMocks();
        window.localStorage.clear();
    });

    describe("in the app", () =>
    {
        it("asks for no file when the site opens in English, and when the German questions are shown", async () =>
        {
            await mountApp(undefined, { locale: null });
            expect(requests).toEqual([]);
            expect(document.querySelector(".bi-sub")).toBeNull();
        });

        it("fetches the messages of a language when the site is switched to it, once", async () =>
        {
            await mountApp(undefined, { locale: null });
            await chooseFromListbox("site-language", "uk");
            expect(asked()).toEqual(["uk.json"]);
            expect(document.documentElement.lang).toBe("uk");
            await chooseFromListbox("site-language", "en");
            await chooseFromListbox("site-language", "uk");
            expect(asked()).toEqual(["uk.json"]);
        });

        it("fetches the questions of a language when the translation is turned on in it, and shows them on the question that is up", async () =>
        {
            await mountApp(undefined, { locale: null });
            const number = shownNumber();
            await chooseTranslation("tr");
            expect(asked()).toEqual(["questions.tr.json"]);
            const entry = REAL_BUNDLE.locales.tr.questions.find((candidate) => candidate.n === number) as { q: string; a: string[] };
            expect(document.querySelector(".question .bi-sub")?.textContent).toBe(entry.q);
            expect(Array.from(document.querySelectorAll("button.option .bi-sub")).map((node) => node.textContent).sort()).toEqual([...entry.a].sort());
            await chooseTranslation("off");
            await chooseTranslation("tr");
            expect(asked()).toEqual(["questions.tr.json"]);
        });

        it("fetches both the messages and the questions for a saved site language with a translation that follows it, before the first draw", async () =>
        {
            window.localStorage.setItem("lidpractice-v4", JSON.stringify({ uiLanguage: "es", translation: "es", setupDone: true }));
            await mountApp(undefined, { locale: null });
            expect(asked()).toEqual(["es.json", "questions.es.json"]);
            expect(document.documentElement.lang).toBe("es");
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("es");
        });

        it("takes a language from the address, fetches it, and takes it out of the address", async () =>
        {
            await mountApp(undefined, { locale: "hi" });
            expect(asked()).toEqual(["hi.json"]);
            expect(document.documentElement.lang).toBe("hi");
            expect(window.location.search).toBe("");
        });

        it("fetches the questions of the new site language for a translation that follows the site, and not for one that was picked", async () =>
        {
            await mountApp(undefined, { locale: null });
            await chooseTranslation("en");
            await chooseFromListbox("translation", "auto");
            requests.length = 0;
            await chooseFromListbox("site-language", "uk");
            expect(asked()).toEqual(["questions.uk.json", "uk.json"]);
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("uk");
            await chooseFromListbox("translation", "es");
            requests.length = 0;
            await chooseFromListbox("site-language", "tr");
            expect(asked()).toEqual(["tr.json"]);
            expect(document.querySelector(".question .bi-sub")?.getAttribute("lang")).toBe("es");
        });

        it("waits with its button while the questions come, and gives it back", async () =>
        {
            await mountApp(undefined, { locale: null });
            const toggle = document.getElementById("translation-toggle") as HTMLButtonElement;
            toggle.click();
            // The questions of English are not there yet.
            expect((document.getElementById("translation-toggle") as HTMLButtonElement).disabled).toBe(true);
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-busy")).toBe("true");
            await settle();
            expect((document.getElementById("translation-toggle") as HTMLButtonElement).disabled).toBe(false);
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-pressed")).toBe("true");
        });
    });

    describe("when it goes wrong", () =>
    {
        it.each(["missing", "offline", "wrong"] as const)("keeps the site in English and tells the user, when a language cannot be loaded (%s)", async (kind) =>
        {
            await mountApp(undefined, { locale: null });
            breakServer(kind);
            await chooseFromListbox("site-language", "ar");
            expect(document.documentElement.lang).toBe("en");
            expect(document.documentElement.dir).toBe("ltr");
            const toast = document.getElementById("toast") as HTMLElement;
            expect(toast.hidden).toBe(false);
            expect(toast.textContent).toContain("Could not load العربية. Check your connection and try again.");
        });

        it.each(["missing", "offline", "wrong"] as const)("leaves the translation off, and says so, when its questions cannot be loaded (%s)", async (kind) =>
        {
            await mountApp(undefined, { locale: null });
            breakServer(kind);
            await chooseTranslation("hi");
            expect(document.querySelector(".bi-sub")).toBeNull();
            expect(document.getElementById("translation-toggle")?.getAttribute("aria-pressed")).toBe("false");
            expect((document.getElementById("translation-toggle") as HTMLButtonElement).disabled).toBe(false);
            expect((document.getElementById("toast") as HTMLElement).textContent).toContain("Could not load");
        });

        it("opens in English without a translation when the saved languages cannot be loaded, and works", async () =>
        {
            window.localStorage.setItem("lidpractice-v4", JSON.stringify({ uiLanguage: "uk", translation: "uk", setupDone: true }));
            const app = await mountApp(undefined, { locale: null, serverFault: "offline" });
            expect(app.STORAGE_KEY).toBeTruthy();
            expect(document.documentElement.lang).toBe("en");
            expect(document.querySelector(".bi-sub")).toBeNull();
            expect(document.querySelectorAll("button.option")).toHaveLength(4);
            // The message names the language that could not be loaded, not the one the page fell back to.
            expect((document.getElementById("toast") as HTMLElement).textContent).toContain("Could not load Українська.");
        });

        it("can load a language later, after a failure", async () =>
        {
            await mountApp(undefined, { locale: null });
            breakServer("offline");
            await chooseFromListbox("site-language", "tr");
            expect(document.documentElement.lang).toBe("en");
            breakServer(null);
            await chooseFromListbox("site-language", "tr");
            expect(document.documentElement.lang).toBe("tr");
        });
    });

    describe("the loader", () =>
    {
        /** A bank with only the German questions, as the page holds it. */
        function germanBank(): QuestionBank
        {
            const page = {
                questions: REAL_BUNDLE.questions,
                locales: { ...Object.fromEntries(Object.entries(REAL_BUNDLE.locales).map(([code, file]) => [code, { ...file, questions: [] }])), de: REAL_BUNDLE.locales.de },
            };
            return new QuestionBank(page as unknown as ConstructorParameters<typeof QuestionBank>[0]);
        }

        /** A stand-in for fetch that counts and answers with the real files. */
        function counting(counter: { calls: number }): (address: string) => Promise<Response>
        {
            return async (address) =>
            {
                counter.calls += 1;
                const code = /questions\.([a-z]+)\.json/.exec(address)?.[1] ?? "";
                return { ok: true, status: 200, json: async () => REAL_BUNDLE.locales[code as "en"] } as unknown as Response;
            };
        }

        it("fetches the questions of a language once, however often and however quickly they are asked for", async () =>
        {
            const counter = { calls: 0 };
            const bank = germanBank();
            const loader = new LanguageLoader({ ui: {}, questions: { en: "locales/questions.en.json" }, learn: { texts: {} } }, bank, counting(counter));
            expect(bank.hasQuestions("en")).toBe(false);
            await Promise.all([loader.questions("en"), loader.questions("en")]);
            await loader.questions("en");
            expect(counter.calls).toBe(1);
            expect(bank.hasQuestions("en")).toBe(true);
            expect(bank.byNumber(1)?.texts.en.q).toBe(REAL_BUNDLE.locales.en.questions[0].q);
        });

        it("shows the German text for a question of a language that is not there yet, so nothing is blank", () =>
        {
            const bank = germanBank();
            expect(bank.byNumber(1)?.texts.uk.q).toBe(REAL_BUNDLE.locales.de.questions[0].q);
            expect(bank.categoryName("grundrechte", "uk")).toBe(REAL_BUNDLE.locales.uk.categories.grundrechte);
        });

        it("asks again after a failure, and refuses a language it has no file for", async () =>
        {
            let fail = true;
            const bank = germanBank();
            const loader = new LanguageLoader({ ui: {}, questions: { en: "locales/questions.en.json" }, learn: { texts: {} } }, bank, async () =>
            {
                if (fail)
                {
                    return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
                }
                return { ok: true, status: 200, json: async () => REAL_BUNDLE.locales.en } as unknown as Response;
            });
            await expect(loader.questions("en")).rejects.toThrow("500");
            fail = false;
            await loader.questions("en");
            expect(bank.hasQuestions("en")).toBe(true);
            await expect(loader.questions("uk")).rejects.toThrow("No question file");
            await expect(loader.ui("uk")).rejects.toThrow("No interface file");
            expect(hasCatalog("en")).toBe(true);
        });
    });
});
