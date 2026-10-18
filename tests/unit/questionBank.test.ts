// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { makeBank, makeQuestion, mountApp, REAL_BUNDLE, type AppExports } from "../helpers/appHarness";
import { toBundle } from "../helpers/questionData";

describe("QuestionBank (real data)", () =>
{
    let app: AppExports;
    let bank: InstanceType<AppExports["QuestionBank"]>;

    beforeEach(async () =>
    {
        app = await mountApp();
        bank = new app.QuestionBank(REAL_BUNDLE);
    });

    it("exposes all 460 questions", () =>
    {
        expect(bank.all).toHaveLength(app.QUESTION_COUNT);
        expect(bank.all).toHaveLength(460);
    });

    it("splits 300 general questions from the state questions at the boundary", () =>
    {
        expect(bank.general).toHaveLength(300);
        expect(Math.max(...bank.general.map((question) => question.n))).toBe(app.LAST_GENERAL_NUMBER);
        expect(bank.all.filter((question) => question.n > app.LAST_GENERAL_NUMBER)).toHaveLength(160);
    });

    it("gives every state ten questions, numbered in the order of the catalogue, with the state as category", () =>
    {
        const states = ["baden-wuerttemberg", "bayern", "berlin"];
        states.forEach((id, index) =>
        {
            const questions = bank.ofState(id);
            expect(questions, id).toHaveLength(10);
            expect(questions.map((question) => question.n), id).toEqual(Array.from({ length: 10 }, (_, task) => 301 + index * 10 + task));
        });
        expect(bank.ofState("atlantis")).toEqual([]);
        expect(bank.ofState("grundrechte")).toEqual([]);
    });

    it("gives every question its text in German and in English, and every state has its own English text", () =>
    {
        for (const question of bank.all)
        {
            expect(question.texts.de.a, `Q${question.n}`).toHaveLength(4);
            expect(question.texts.en.a, `Q${question.n}`).toHaveLength(4);
            expect(question.texts.de.q.length).toBeGreaterThan(0);
            expect(question.texts.en.q.length).toBeGreaterThan(0);
        }
        expect(bank.ofState("berlin")[1].texts.en.q).not.toBe(bank.ofState("berlin")[1].texts.de.q);
        expect(bank.ofState("bayern")[1].texts.en.q).not.toBe(bank.ofState("bayern")[1].texts.de.q);
        const first = bank.byNumber(1);
        expect(first?.texts.de.q).toBe("In Deutschland dürfen Menschen offen etwas gegen die Regierung sagen, weil …");
        expect(first?.texts.en.q).toContain("In Germany, people may speak out openly against the government");
    });

    it("lists the 29 category ids (13 subjects and 16 states) in German alphabetical order of their names", () =>
    {
        const ids = bank.categories;
        expect(ids).toHaveLength(29);
        expect(new Set(ids).size).toBe(29);
        const names = ids.map((id) => bank.categoryName(id, "de"));
        expect(names).toEqual(names.slice().sort((first, second) => first.localeCompare(second, "de")));
        expect(ids).toContain("bund-laender-gemeinden");
    });

    describe("categoryName", () =>
    {
        it("is localized", () =>
        {
            expect(bank.categoryName("bund-laender-gemeinden", "de")).toBe("Bund, Länder und Gemeinden");
            expect(bank.categoryName("bund-laender-gemeinden", "en")).toBe("Federation, states and municipalities");
        });

        it("names every category in both languages", () =>
        {
            for (const id of bank.categories)
            {
                expect(bank.categoryName(id, "de").length, id).toBeGreaterThan(0);
                expect(bank.categoryName(id, "en"), id).not.toBe(id);
            }
        });

        it("falls back to the German name, and then to the id", () =>
        {
            const onlyGerman = new app.QuestionBank({
                ...toBundle(makeBank(2, 0)),
                locales: { ...toBundle(makeBank(2, 0)).locales, en: { ...toBundle(makeBank(2, 0)).locales.en, categories: {} } },
            });
            expect(onlyGerman.categoryName("testkategorie", "en")).toBe("Testkategorie");
            expect(onlyGerman.categoryName("unknown", "de")).toBe("unknown");
        });
    });

    describe("select", () =>
    {
        it("returns the general questions of the given subjects, and the questions of the given states", () =>
        {
            const chosen = bank.select(["familie-bildung-alltag"], ["berlin"]);
            expect(chosen).toHaveLength(22 + 10);
            expect(chosen.filter((question) => question.n <= 300).every((question) => question.k === "familie-bildung-alltag")).toBe(true);
            expect(chosen.filter((question) => question.n > 300).every((question) => question.k === "berlin")).toBe(true);
        });

        it("returns every general question for null, and none of the states unless they are named", () =>
        {
            expect(bank.select(null, [])).toHaveLength(300);
            expect(bank.select(null, ["berlin"])).toHaveLength(310);
            expect(bank.select(null, bank.categories)).toHaveLength(460);
        });

        it("returns nothing for no subjects and no states, and keeps the order of the catalogue", () =>
        {
            expect(bank.select([], [])).toEqual([]);
            const numbers = bank.select(null, ["thueringen", "bayern"]).map((question) => question.n);
            expect(numbers).toEqual([...numbers].sort((first, second) => first - second));
        });

        it("ignores a subject that is really a state, and a state that is really a subject", () =>
        {
            expect(bank.select(["berlin"], [])).toEqual([]);
            expect(bank.select([], ["familie-bildung-alltag"])).toEqual([]);
        });
    });

    describe("byNumber", () =>
    {
        it("finds a question by number", () =>
        {
            expect(bank.byNumber(1)?.n).toBe(1);
            expect(bank.byNumber(460)?.n).toBe(460);
        });

        it("returns undefined for numbers outside the bank", () =>
        {
            expect(bank.byNumber(0)).toBeUndefined();
            expect(bank.byNumber(461)).toBeUndefined();
        });
    });
});

describe("QuestionBank with a language that lacks a question", () =>
{
    it("falls back to the German text, so nothing is ever blank", async () =>
    {
        const app = await mountApp();
        const bundle = toBundle(makeBank(3, 0));
        bundle.locales.en.questions = bundle.locales.en.questions.filter((entry) => entry.n !== 2);
        const bank = new app.QuestionBank(bundle);
        expect(bank.byNumber(2)?.texts.en.q).toBe("Frage 2");
        expect(bank.byNumber(1)?.texts.en.q).toBe("Question 1");
    });

    it("copes with a bundle that has no file for a language", async () =>
    {
        const app = await mountApp();
        const bundle = toBundle(makeBank(2, 0));
        delete (bundle.locales as Partial<typeof bundle.locales>).en;
        const bank = new app.QuestionBank(bundle);
        expect(bank.byNumber(1)?.texts.en.q).toBe("Frage 1");
        expect(bank.categoryName("testkategorie", "en")).toBe("Testkategorie");
    });
});

describe("QuestionBank.present", () =>
{
    let app: AppExports;

    beforeEach(async () =>
    {
        app = await mountApp();
    });

    it("keeps the same set of options and marks exactly one correct, in both languages", () =>
    {
        const bank = new app.QuestionBank(toBundle([...makeBank(4, 1), makeQuestion(9, { r: 2 })]));
        const question = bank.byNumber(9) as NonNullable<ReturnType<typeof bank.byNumber>>;
        const presented = bank.present(question);
        expect(presented.question).toBe(question);
        expect(presented.options.map((option) => option.texts.de).sort()).toEqual(["Antwort 1", "Antwort 2", "Antwort 3", "Antwort 4"]);
        expect(presented.options.filter((option) => option.isCorrect)).toHaveLength(1);
        const correct = presented.options.find((option) => option.isCorrect);
        expect(correct?.texts.de).toBe("Antwort 3");
        expect(correct?.texts.en).toBe("Answer 3");
    });

    it("knows the place of every option in the catalogue, and shows the options again in an order that was shown before", () =>
    {
        const bank = new app.QuestionBank(toBundle([...makeBank(4, 1), makeQuestion(9, { r: 2 })]));
        const question = bank.byNumber(9) as NonNullable<ReturnType<typeof bank.byNumber>>;
        const presented = bank.present(question);
        expect(presented.options.map((option) => option.index).sort()).toEqual([0, 1, 2, 3]);
        for (const option of presented.options)
        {
            expect(option.texts.de).toBe(`Antwort ${option.index + 1}`);
        }
        const again = bank.presentInOrder(question, [3, 1, 0, 2]);
        expect(again.question).toBe(question);
        expect(again.options.map((option) => option.texts.de)).toEqual(["Antwort 4", "Antwort 2", "Antwort 1", "Antwort 3"]);
        expect(again.options.map((option) => option.isCorrect)).toEqual([false, false, false, true]);
    });

    it("shuffles options of text questions (all 24 orders appear)", () =>
    {
        const bank = new app.QuestionBank(toBundle([makeQuestion(5)]));
        const question = bank.byNumber(5) as NonNullable<ReturnType<typeof bank.byNumber>>;
        const orders = new Set<string>();
        for (let index = 0; index < 1500; index++)
        {
            orders.add(bank.present(question).options.map((option) => option.texts.de).join("|"));
        }
        expect(orders.size).toBe(24);
    });

    it("keeps the original order for picture questions", () =>
    {
        const bank = new app.QuestionBank(toBundle([makeQuestion(21, { img: "images/q-021.webp", a: ["Bild 1", "Bild 2", "Bild 3", "Bild 4"], r: 1 })]));
        const question = bank.byNumber(21) as NonNullable<ReturnType<typeof bank.byNumber>>;
        for (let index = 0; index < 50; index++)
        {
            const presented = bank.present(question);
            expect(presented.options.map((option) => option.texts.de)).toEqual(["Bild 1", "Bild 2", "Bild 3", "Bild 4"]);
            expect(presented.options.map((option) => option.isCorrect)).toEqual([false, true, false, false]);
        }
    });

    it("falls back to the German text when an English option is missing", () =>
    {
        const bank = new app.QuestionBank(toBundle([makeQuestion(7, { ae: ["Answer 1"], img: "images/q-007.webp" })]));
        const question = bank.byNumber(7) as NonNullable<ReturnType<typeof bank.byNumber>>;
        const presented = bank.present(question);
        expect(presented.options.map((option) => option.texts.en)).toEqual(["Answer 1", "Antwort 2", "Antwort 3", "Antwort 4"]);
    });
});
