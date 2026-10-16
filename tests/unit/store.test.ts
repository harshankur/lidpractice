// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type AppExports } from "../helpers/appHarness";

describe("Store", () =>
{
    let app: AppExports;
    let store: InstanceType<AppExports["Store"]>;

    beforeEach(async () =>
    {
        window.localStorage.clear();
        app = await mountApp(undefined, { locale: null, firstVisit: true });
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        store = new app.Store();
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        window.localStorage.clear();
    });

    describe("defaults", () =>
    {
        it("starts in English without a translation, with the system theme, all topics and Berlin, booklet order, answers open and no records", () =>
        {
            expect(store.state).toEqual({ uiLanguage: "en", translation: "off", translationLanguage: "auto", theme: "auto", topics: null, state: "berlin", includeState: true, setupDone: false, clockMode: "up", clockMinutes: 30, examMinutes: 60, lockAnswers: false, order: "booklet", records: {}, learn: { read: {}, seen: {}, cards: {}, last: null }, exams: [], lastPlace: "" });
            expect(store.seenCount).toBe(0);
            expect(store.weakNumbers).toEqual([]);
            expect(store.accuracyPercent).toBeNull();
        });

        it("uses a separate state object per instance", () =>
        {
            const other = new app.Store();
            other.state.records["1"] = { right: 1, wrong: 0, lastWrong: false };
            expect(store.state.records).toEqual({});
        });
    });

    describe("recordAnswer", () =>
    {
        it("counts right answers and clears lastWrong", () =>
        {
            store.recordAnswer(5, true);
            expect(store.state.records["5"]).toEqual({ right: 1, wrong: 0, lastWrong: false });
        });

        it("counts wrong answers and sets lastWrong", () =>
        {
            store.recordAnswer(5, false);
            expect(store.state.records["5"]).toEqual({ right: 0, wrong: 1, lastWrong: true });
        });

        it("keeps totals across answers and lets a later right answer clear the weak flag", () =>
        {
            store.recordAnswer(5, false);
            store.recordAnswer(5, false);
            store.recordAnswer(5, true);
            expect(store.state.records["5"]).toEqual({ right: 1, wrong: 2, lastWrong: false });
            expect(store.weakNumbers).toEqual([]);
        });

        it("lets a later wrong answer set the weak flag again", () =>
        {
            store.recordAnswer(5, true);
            store.recordAnswer(5, false);
            expect(store.weakNumbers).toEqual([5]);
        });

        it("saves to localStorage under the documented key", () =>
        {
            store.recordAnswer(12, true);
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(app.STORAGE_KEY).toBe("lidpractice-v4");
            expect(saved.records["12"]).toEqual({ right: 1, wrong: 0, lastWrong: false });
        });
    });

    describe("derived values", () =>
    {
        it("reports weak question numbers as numbers", () =>
        {
            store.recordAnswer(3, false);
            store.recordAnswer(4, true);
            store.recordAnswer(301, false);
            expect(store.weakNumbers.sort((first, second) => first - second)).toEqual([3, 301]);
        });

        it("counts distinct questions seen", () =>
        {
            store.recordAnswer(1, true);
            store.recordAnswer(1, false);
            store.recordAnswer(2, true);
            expect(store.seenCount).toBe(2);
        });

        it.each([
            [[true, true, true], 100],
            [[false, false], 0],
            [[true, false, false], 33],
            [[true, true, false], 67],
        ])("rounds accuracy for answers %j to %d percent", (answers, expected) =>
        {
            answers.forEach((wasCorrect, index) => store.recordAnswer(index + 1, wasCorrect));
            expect(store.accuracyPercent).toBe(expected);
        });

        it("weighs accuracy by every attempt, not per question", () =>
        {
            store.recordAnswer(1, true);
            store.recordAnswer(1, true);
            store.recordAnswer(1, true);
            store.recordAnswer(2, false);
            expect(store.accuracyPercent).toBe(75);
        });
    });

    describe("resetProgress", () =>
    {
        it("clears records but keeps the languages, the theme, the topics and the order", () =>
        {
            store.state.translation = "en";
            store.state.uiLanguage = "en";
            store.state.theme = "dark";
            store.state.topics = ["familie-bildung-alltag"];
            store.state.state = "hessen";
            store.state.includeState = false;
            store.state.setupDone = true;
            store.state.lockAnswers = true;
            store.state.order = "booklet";
            store.recordAnswer(1, false);
            store.resetProgress();
            expect(store.state).toEqual({ uiLanguage: "en", translation: "en", translationLanguage: "auto", theme: "dark", topics: ["familie-bildung-alltag"], state: "hessen", includeState: false, setupDone: true, clockMode: "up", clockMinutes: 30, examMinutes: 60, lockAnswers: true, order: "booklet", records: {}, learn: { read: {}, seen: {}, cards: {}, last: null }, exams: [], lastPlace: "" });
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);
            expect(saved.records).toEqual({});
            expect(saved.translation).toBe("en");
            expect(saved.uiLanguage).toBe("en");
        });
    });

    describe("load", () =>
    {
        it("keeps defaults when nothing is stored", () =>
        {
            store.load();
            expect(store.state).toEqual({ uiLanguage: "en", translation: "off", translationLanguage: "auto", theme: "auto", topics: null, state: "berlin", includeState: true, setupDone: false, clockMode: "up", clockMinutes: 30, examMinutes: 60, lockAnswers: false, order: "booklet", records: {}, learn: { read: {}, seen: {}, cards: {}, last: null }, exams: [], lastPlace: "" });
        });

        it("restores a saved state", () =>
        {
            const saved = { uiLanguage: "en", translation: "en", translationLanguage: "auto", theme: "light", topics: ["familie-bildung-alltag"], state: "hamburg", includeState: false, setupDone: true, clockMode: "down", clockMinutes: 15, examMinutes: 40, lockAnswers: true, order: "booklet", records: { "9": { right: 2, wrong: 1, lastWrong: true } }, learn: { read: { symbole: 20000 }, seen: { symbole: { at: "", percent: 100 }, wuerde: { at: "artikel-1", percent: 40 } }, cards: { "symbole/flagge": { box: 2, due: 20004 } }, last: "wuerde" }, exams: [{ day: 20001, score: 28, total: 33 }], lastPlace: "#learn/wuerde" };
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify(saved));
            store.load();
            expect(store.state).toEqual(saved);
        });

        it("fills in defaults for fields missing from an older save", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ uiLanguage: "en" }));
            store.load();
            expect(store.state).toEqual({ ...{ uiLanguage: "en", translation: "off", translationLanguage: "auto", theme: "auto", topics: null, state: "berlin", includeState: true, setupDone: false, clockMode: "up", clockMinutes: 30, examMinutes: 60, lockAnswers: false, order: "booklet", records: {}, learn: { read: {}, seen: {}, cards: {}, last: null }, exams: [], lastPlace: "" }, uiLanguage: "en" });
        });

        it("falls back to defaults and reports when the saved text is not JSON", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            window.localStorage.setItem(app.STORAGE_KEY, "{not json");
            store.load();
            expect(store.state).toEqual({ uiLanguage: "en", translation: "off", translationLanguage: "auto", theme: "auto", topics: null, state: "berlin", includeState: true, setupDone: false, clockMode: "up", clockMinutes: 30, examMinutes: 60, lockAnswers: false, order: "booklet", records: {}, learn: { read: {}, seen: {}, cards: {}, last: null }, exams: [], lastPlace: "" });
            expect(reporter).toHaveBeenCalledTimes(1);
            expect(reporter.mock.calls[0][0]).toMatch(/JSON/);
        });

        it("survives storage that throws on read", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            vi.spyOn(Storage.prototype, "getItem").mockImplementation(() =>
            {
                throw new Error("storage blocked");
            });
            store.load();
            expect(store.state.records).toEqual({});
            expect(reporter).toHaveBeenCalledWith("storage blocked");
        });
    });

    describe("the page that was open last", () =>
    {
        it("keeps the address of a page as the page writes it, and forgets anything else", () =>
        {
            for (const [stored, kept] of [
                ["#train", "#train"],
                ["#exam", "#exam"],
                ["#learn", "#learn"],
                ["#learn/wuerde", "#learn/wuerde"],
                ["#learn/timeline", "#learn/timeline"],
                // The tab the site opens with anyway is no place to remember.
                ["#practice", ""],
                // A section, another spelling, a name of nothing, or no text: forgotten.
                ["#learn/wuerde/artikel-1", ""],
                ["#train/", ""],
                ["#somewhere", ""],
                ["train", ""],
                [42, ""],
                [null, ""],
            ] as [unknown, string][])
            {
                window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ lastPlace: stored }));
                store.load();
                expect(store.state.lastPlace, String(stored)).toBe(kept);
            }
        });

        it("remembers the page without its section, saves only a change, and saves nothing for the tab the site opens with", () =>
        {
            store.load();
            const save = vi.spyOn(store, "save");
            store.rememberPlace("");
            store.rememberPlace("#practice");
            expect(save).not.toHaveBeenCalled();
            expect(window.localStorage.getItem(app.STORAGE_KEY)).toBeNull();
            store.rememberPlace("#learn/wuerde/artikel-1");
            expect(store.state.lastPlace).toBe("#learn/wuerde");
            store.rememberPlace("#learn/wuerde/artikel-2");
            expect(save).toHaveBeenCalledTimes(1);
            store.rememberPlace("#train");
            store.rememberPlace("#practice");
            expect(store.state.lastPlace).toBe("");
            expect(save).toHaveBeenCalledTimes(3);
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string).lastPlace).toBe("");
        });
    });

    describe("load with unusable values", () =>
    {
        it.each([
            ["an unknown interface language", { uiLanguage: "fr" }],
            ["an unknown translation", { translation: "fr" }],
            ["the default language as a translation", { translation: "de" }],
            ["an unknown theme", { theme: "sepia" }],
            ["an unknown order", { order: "alphabetical" }],
            ["topics that are not a list", { topics: "familie-bildung-alltag" }],
            ["a state that does not exist", { state: "atlantis" }],
            ["a state that is not text", { state: 7 }],
            ["a yes or no for the state questions that is not one", { includeState: "yes" }],
            ["a first visit flag that is not a yes or no", { setupDone: 1 }],
            ["a direction of the clock that does not exist", { clockMode: "sideways" }],
            ["minutes that are not a number", { clockMinutes: "ten", examMinutes: "sixty" }],
            ["a lock that is not a yes or no", { lockAnswers: "yes" }],
            ["records that are a list", { records: [1, 2] }],
            ["records that are null", { records: null }],
        ])("falls back to the default for %s", (_, saved) =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify(saved));
            store.load();
            expect(store.state).toEqual({ uiLanguage: "en", translation: "off", translationLanguage: "auto", theme: "auto", topics: null, state: "berlin", includeState: true, setupDone: false, clockMode: "up", clockMinutes: 30, examMinutes: 60, lockAnswers: false, order: "booklet", records: {}, learn: { read: {}, seen: {}, cards: {}, last: null }, exams: [], lastPlace: "" });
        });

        it("keeps the valid fields next to a broken one", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ uiLanguage: "en", theme: "nope", topics: ["familie-bildung-alltag"] }));
            store.load();
            expect(store.state.uiLanguage).toBe("en");
            expect(store.state.theme).toBe("auto");
            expect(store.state.topics).toEqual(["familie-bildung-alltag"]);
        });

        it("uses its own storage key, which names the product and the format version", () =>
        {
            expect(app.STORAGE_KEY).toBe("lidpractice-v4");
        });
    });

    describe("the clock", () =>
    {
        it("keeps the direction and the minutes of practice, and the minutes of the exam", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ clockMode: "down", clockMinutes: 45, examMinutes: 20 }));
            store.load();
            expect(store.state).toMatchObject({ clockMode: "down", clockMinutes: 45, examMinutes: 20 });
        });

        it("never lets the exam be longer than the official 60 minutes, and never shorter than one", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ examMinutes: 90 }));
            store.load();
            expect(store.state.examMinutes).toBe(60);
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ examMinutes: 0 }));
            store.load();
            expect(store.state.examMinutes).toBe(1);
        });

        it("has no limit for the count down of practice but the three digits the display can show", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ clockMinutes: 500 }));
            store.load();
            expect(store.state.clockMinutes).toBe(500);
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ clockMinutes: 5000 }));
            store.load();
            expect(store.state.clockMinutes).toBe(999);
        });

        it("rounds minutes to whole minutes", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ clockMinutes: 12.6 }));
            store.load();
            expect(store.state.clockMinutes).toBe(13);
        });
    });

    describe("subjects and state", () =>
    {
        it("keeps an empty list of subjects, which means none", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ topics: [] }));
            store.load();
            expect(store.state.topics).toEqual([]);
        });

        it("drops entries that are not text, and subjects that do not exist", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ topics: [5, null, "familie-bildung-alltag", "", "atlantis"] }));
            store.load();
            expect(store.state.topics).toEqual(["familie-bildung-alltag"]);
        });

        it("treats a choice made only of subjects that no longer exist as no choice at all", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ topics: ["bildung", "foederalismus"] }));
            store.load();
            expect(store.state.topics).toBeNull();
        });

        it("keeps the state, and whether its questions are included", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ state: "bayern", includeState: false, setupDone: true }));
            store.load();
            expect(store.state).toMatchObject({ state: "bayern", includeState: false, setupDone: true });
        });

        it("takes the exam state of a save from before as the state", () =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ states: ["berlin", "bremen"], examState: "hamburg" }));
            store.load();
            expect(store.state.state).toBe("hamburg");
            expect(store.state.includeState).toBe(true);
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ states: [] }));
            store.load();
            expect(store.state.includeState).toBe(false);
        });
    });

    describe("counts for the questions of the user", () =>
    {
        const right = { right: 1, wrong: 0, lastWrong: false };
        const wrong = { right: 0, wrong: 2, lastWrong: true };

        it("count only the questions that are let through, so the questions of another state do not show", () =>
        {
            store.state.records = { "5": right, "6": wrong, "321": wrong, "331": right };
            const mine = (number: number): boolean => number <= 300 || (number >= 321 && number <= 330);
            expect(store.seenCountIn(mine)).toBe(3);
            expect(store.weakNumbersIn(mine).sort((first, second) => first - second)).toEqual([6, 321]);
            expect(store.accuracyPercentIn(mine)).toBe(20);
            expect(store.seenCount).toBe(4);
            expect(store.accuracyPercentIn(() => false)).toBeNull();
        });
    });

    describe("saved by an older version", () =>
    {
        const OLD_KEY = "lid-berlin-trainer-v2";
        const OLD_V3_KEY = "lid-berlin-trainer-v3";

        it("brings the progress, the languages and the theme along, and shows a translation if English was shown", () =>
        {
            const old = { uiLanguage: "en", questionLanguage: "both", theme: "dark", scope: "familie-bildung-alltag", records: { "9": { right: 2, wrong: 1, lastWrong: true } } };
            window.localStorage.setItem(OLD_KEY, JSON.stringify(old));
            store.load();
            expect(store.state).toEqual({ ...{ uiLanguage: "en", translation: "off", translationLanguage: "auto", theme: "auto", topics: null, state: "berlin", includeState: true, setupDone: false, clockMode: "up", clockMinutes: 30, examMinutes: 60, lockAnswers: false, order: "booklet", records: {}, learn: { read: {}, seen: {}, cards: {}, last: null }, exams: [], lastPlace: "" }, uiLanguage: "en", translation: "en", translationLanguage: "auto", theme: "dark", records: old.records });
        });

        it("starts without a translation when the old version showed German only", () =>
        {
            window.localStorage.setItem(OLD_KEY, JSON.stringify({ questionLanguage: "de", records: {} }));
            store.load();
            expect(store.state.translation).toBe("off");
        });

        it("moves the progress of the old Berlin questions 301 to 310 to their new numbers 321 to 330", () =>
        {
            const right = { right: 1, wrong: 0, lastWrong: false };
            window.localStorage.setItem(OLD_KEY, JSON.stringify({ records: { "5": right, "301": right, "310": { right: 0, wrong: 2, lastWrong: true }, "311": right } }));
            store.load();
            expect(Object.keys(store.state.records).sort()).toEqual(["311", "321", "330", "5"]);
            expect(store.state.records["330"]).toEqual({ right: 0, wrong: 2, lastWrong: true });
        });

        it("turns the old choice of topics into subjects and states: Berlin was a topic then", () =>
        {
            window.localStorage.setItem(OLD_V3_KEY, JSON.stringify({ topics: ["berlin", "familie-bildung-alltag"], order: "booklet", translation: "en", translationLanguage: "auto" }));
            store.load();
            expect(store.state.topics).toEqual(["familie-bildung-alltag"]);
            expect(store.state.includeState).toBe(true);
            expect(store.state.order).toBe("booklet");
            window.localStorage.removeItem(app.STORAGE_KEY);
            window.localStorage.setItem(OLD_V3_KEY, JSON.stringify({ topics: ["familie-bildung-alltag"] }));
            store.load();
            expect(store.state.includeState).toBe(false);
        });

        it("starts with all subjects and Berlin when the old save had no choice", () =>
        {
            window.localStorage.setItem(OLD_V3_KEY, JSON.stringify({ topics: null }));
            store.load();
            expect(store.state.topics).toBeNull();
            expect(store.state.includeState).toBe(true);
            expect(store.state.state).toBe("berlin");
        });

        it("is not used once the current key has been saved, and an old save left next to it is removed", () =>
        {
            window.localStorage.setItem(OLD_KEY, JSON.stringify({ uiLanguage: "en" }));
            window.localStorage.setItem(OLD_V3_KEY, JSON.stringify({ uiLanguage: "en" }));
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ uiLanguage: "de" }));
            store.load();
            expect(store.state.uiLanguage).toBe("de");
            expect(window.localStorage.getItem(OLD_KEY)).toBeNull();
            expect(window.localStorage.getItem(OLD_V3_KEY)).toBeNull();
            expect(JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string)).toEqual({ uiLanguage: "de" });
        });

        it("saves what it brought along under the current key at once, and then removes every old save", () =>
        {
            const records = { "9": { right: 2, wrong: 1, lastWrong: true } };
            window.localStorage.removeItem(app.STORAGE_KEY);
            window.localStorage.setItem(OLD_V3_KEY, JSON.stringify({ theme: "dark", records }));
            window.localStorage.setItem(OLD_KEY, JSON.stringify({ theme: "light" }));
            store.load();
            const saved = JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string) as { theme: string; records: unknown };
            expect(saved.theme).toBe("dark");
            expect(saved.records).toEqual(records);
            expect(window.localStorage.getItem(OLD_V3_KEY)).toBeNull();
            expect(window.localStorage.getItem(OLD_KEY)).toBeNull();
            // The next visit reads the current key, and finds what was brought along.
            const again = new app.Store();
            again.load();
            expect(again.state.records).toEqual(records);
            expect(again.state.theme).toBe("dark");
        });

        it("keeps the old save when the current key cannot be written, so the next visit brings it along again", () =>
        {
            window.localStorage.removeItem(app.STORAGE_KEY);
            window.localStorage.setItem(OLD_KEY, JSON.stringify({ records: { "5": { right: 1, wrong: 0, lastWrong: false } } }));
            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() =>
            {
                throw new Error("QuotaExceededError");
            });
            store.load();
            expect(store.state.records).toEqual({ "5": { right: 1, wrong: 0, lastWrong: false } });
            expect(window.localStorage.getItem(app.STORAGE_KEY)).toBeNull();
            expect(window.localStorage.getItem(OLD_KEY)).not.toBeNull();
        });

        it("writes nothing on a visit without any save, old or new", () =>
        {
            window.localStorage.clear();
            const write = vi.spyOn(Storage.prototype, "setItem");
            const remove = vi.spyOn(Storage.prototype, "removeItem");
            store.load();
            expect(write).not.toHaveBeenCalled();
            expect(remove).not.toHaveBeenCalled();
            expect(window.localStorage.length).toBe(0);
        });

        it("says whether a save was written", () =>
        {
            expect(store.save()).toBe(true);
            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() =>
            {
                throw new Error("QuotaExceededError");
            });
            expect(store.save()).toBe(false);
        });
    });

    describe("the Learn tab", () =>
    {
        /** A day to count from, and what is saved after an action. */
        const TODAY = 20000;
        const saved = (): { learn: { read: Record<string, number>; seen: Record<string, { at: string; percent: number }>; cards: Record<string, { box: number; due: number }>; last: string | null }; exams: unknown[] } => JSON.parse(window.localStorage.getItem(app.STORAGE_KEY) as string);

        it("remembers the lesson that was open last", () =>
        {
            store.openLesson("gewalten");
            expect(store.state.learn.last).toBe("gewalten");
            expect(saved().learn.last).toBe("gewalten");
            store.openLesson("wuerde");
            expect(saved().learn).toEqual({ read: {}, seen: {}, cards: {}, last: "wuerde" });
        });

        it("counts a finished lesson as read from that day on, and puts its cards into the first box, due the next day", () =>
        {
            store.finishLesson("gewalten", ["gewalten/a", "gewalten/b"], TODAY);
            expect(store.state.learn.read).toEqual({ gewalten: TODAY });
            expect(store.state.learn.cards).toEqual({ "gewalten/a": { box: 1, due: TODAY + 1 }, "gewalten/b": { box: 1, due: TODAY + 1 } });
            expect(saved().learn.read).toEqual({ gewalten: TODAY });
        });

        it("keeps the first day and the boxes when a lesson is finished again, and adds only the cards that are new", () =>
        {
            store.finishLesson("gewalten", ["gewalten/a"], TODAY);
            store.gradeCard("gewalten/a", true, TODAY + 1);
            store.finishLesson("gewalten", ["gewalten/a", "gewalten/b"], TODAY + 5);
            expect(store.state.learn.read).toEqual({ gewalten: TODAY });
            expect(store.state.learn.cards).toEqual({ "gewalten/a": { box: 2, due: TODAY + 4 }, "gewalten/b": { box: 1, due: TODAY + 6 } });
        });

        it("moves a card between the boxes by the answer: up after a pause, back to the first box when it was not known", () =>
        {
            store.finishLesson("gewalten", ["gewalten/a"], TODAY);
            // Known on the day it was introduced: no pause, so no move.
            store.gradeCard("gewalten/a", true, TODAY);
            expect(store.state.learn.cards["gewalten/a"]).toEqual({ box: 1, due: TODAY + 1 });
            store.gradeCard("gewalten/a", true, TODAY + 1);
            expect(store.state.learn.cards["gewalten/a"]).toEqual({ box: 2, due: TODAY + 4 });
            expect(saved().learn.cards["gewalten/a"]).toEqual({ box: 2, due: TODAY + 4 });
            store.gradeCard("gewalten/a", false, TODAY + 4);
            expect(store.state.learn.cards["gewalten/a"]).toEqual({ box: 1, due: TODAY + 5 });
        });

        it("leaves a card out of the boxes that was looked at before its lesson was finished", () =>
        {
            store.gradeCard("gewalten/a", true, TODAY);
            store.gradeCard("gewalten/a", false, TODAY);
            expect(store.state.learn.cards).toEqual({});
            expect(window.localStorage.getItem(app.STORAGE_KEY)).toBeNull();
        });

        it("remembers the results of finished exams, the last 20 of them, oldest first", () =>
        {
            store.recordExam(28, 33, TODAY);
            store.recordExam(17, 33, TODAY + 1);
            expect(store.state.exams).toEqual([{ day: TODAY, score: 28, total: 33 }, { day: TODAY + 1, score: 17, total: 33 }]);
            expect(saved().exams).toEqual(store.state.exams);
            for (let exam = 0; exam < 25; exam++)
            {
                store.recordExam(exam, 33, TODAY + 2 + exam);
            }
            expect(store.state.exams).toHaveLength(20);
            expect(store.state.exams[0]).toEqual({ day: TODAY + 7, score: 5, total: 33 });
            expect(store.state.exams[19]).toEqual({ day: TODAY + 26, score: 24, total: 33 });
        });

        it("erases the lessons, the cards and the exam results with the rest of the progress", () =>
        {
            store.openLesson("gewalten");
            store.finishLesson("gewalten", ["gewalten/a"], TODAY);
            store.recordExam(30, 33, TODAY);
            store.resetProgress();
            expect(store.state.learn).toEqual({ read: {}, seen: {}, cards: {}, last: null });
            expect(store.state.exams).toEqual([]);
            expect(saved().learn).toEqual({ read: {}, seen: {}, cards: {}, last: null });
            expect(saved().exams).toEqual([]);
        });

        it("restores what was saved", () =>
        {
            const learn = { read: { gewalten: TODAY, wuerde: TODAY + 2 }, seen: { freiheiten: { at: "meinung", percent: 35 } }, cards: { "gewalten/a": { box: 5, due: TODAY + 40 }, "wuerde/b": { box: 1, due: TODAY } }, last: "freiheiten" };
            const exams = [{ day: TODAY, score: 0, total: 33 }, { day: TODAY, score: 33, total: 33 }];
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ learn, exams }));
            store.load();
            expect(store.state.learn).toEqual(learn);
            expect(store.state.exams).toEqual(exams);
        });

        it.each([
            ["is missing", undefined],
            ["is null", null],
            ["is a text", "all of it"],
            ["is a list", [1, 2]],
            ["has parts of the wrong kind", { read: [TODAY], cards: "none", last: 5 }],
            ["has parts that are null", { read: null, cards: null, last: null }],
        ])("starts with no lessons and no cards when the saved progress %s", (_, learn) =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ learn }));
            store.load();
            expect(store.state.learn).toEqual({ read: {}, seen: {}, cards: {}, last: null });
        });

        it("keeps what is usable of a damaged save and drops the rest: a day must be a whole number, a box one of the five", () =>
        {
            const learn = {
                read: { good: TODAY, text: "today", negative: -1, half: 1.5, none: null },
                cards: {
                    good: { box: 3, due: TODAY, extra: "dropped" },
                    first: { box: 1, due: 0 },
                    last: { box: 5, due: TODAY },
                    boxZero: { box: 0, due: TODAY },
                    boxSix: { box: 6, due: TODAY },
                    boxHalf: { box: 2.5, due: TODAY },
                    noDue: { box: 2 },
                    dueText: { box: 2, due: "soon" },
                    nothing: null,
                    number: 7,
                },
                last: "good",
            };
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ learn }));
            store.load();
            expect(store.state.learn).toEqual({
                read: { good: TODAY },
                seen: {},
                cards: { good: { box: 3, due: TODAY }, first: { box: 1, due: 0 }, last: { box: 5, due: TODAY } },
                last: "good",
            });
        });

        it("remembers how far a lesson was read: the section reading stopped at, and a share that never goes down", () =>
        {
            store.seeLesson("gewalten", "legislative", 40);
            expect(store.state.learn.seen).toEqual({ gewalten: { at: "legislative", percent: 40 } });
            expect(saved().learn.seen).toEqual({ gewalten: { at: "legislative", percent: 40 } });
            // Scrolled back up: the place moves, the share that was read stays.
            store.seeLesson("gewalten", "", 10);
            expect(store.state.learn.seen.gewalten).toEqual({ at: "", percent: 40 });
            store.seeLesson("gewalten", "check", 100);
            expect(store.state.learn.seen.gewalten).toEqual({ at: "check", percent: 100 });
            store.seeLesson("wuerde", "", 0);
            expect(Object.keys(saved().learn.seen)).toEqual(["gewalten", "wuerde"]);
        });

        it("saves nothing when the place and the share are what they were, so scrolling does not write all the time", () =>
        {
            store.seeLesson("gewalten", "legislative", 40);
            const write = vi.spyOn(Storage.prototype, "setItem");
            store.seeLesson("gewalten", "legislative", 40);
            store.seeLesson("gewalten", "legislative", 12);
            expect(write).not.toHaveBeenCalled();
            store.seeLesson("gewalten", "exekutive", 40);
            expect(write).toHaveBeenCalledTimes(1);
        });

        it("never counts reading as done: a lesson that was read to its end is still not marked", () =>
        {
            store.seeLesson("gewalten", "check", 100);
            expect(store.state.learn.read).toEqual({});
            expect(store.state.learn.cards).toEqual({});
        });

        it("takes the mark of a lesson back, and leaves its cards and what was read as they are", () =>
        {
            store.seeLesson("gewalten", "check", 100);
            store.finishLesson("gewalten", ["gewalten/a"], TODAY);
            store.gradeCard("gewalten/a", true, TODAY + 1);
            store.unfinishLesson("gewalten");
            expect(store.state.learn.read).toEqual({});
            expect(saved().learn.read).toEqual({});
            expect(store.state.learn.cards).toEqual({ "gewalten/a": { box: 2, due: TODAY + 4 } });
            expect(store.state.learn.seen).toEqual({ gewalten: { at: "check", percent: 100 } });
            // Marked again later, it is done from that day, and the card keeps its box.
            store.finishLesson("gewalten", ["gewalten/a"], TODAY + 9);
            expect(store.state.learn.read).toEqual({ gewalten: TODAY + 9 });
            expect(store.state.learn.cards["gewalten/a"]).toEqual({ box: 2, due: TODAY + 4 });
            // Taking back a mark that is not there changes nothing.
            store.unfinishLesson("wuerde");
            expect(store.state.learn.read).toEqual({ gewalten: TODAY + 9 });
        });

        it("keeps what is usable of saved reading progress: a section of plain letters, and a share from 0 to 100", () =>
        {
            const seen = {
                good: { at: "artikel-1", percent: 40, extra: "dropped" },
                top: { at: "", percent: 0 },
                whole: { at: "check", percent: 100 },
                over: { at: "a", percent: 101 },
                half: { at: "a", percent: 12.5 },
                negative: { at: "a", percent: -1 },
                noPercent: { at: "a" },
                noPlace: { percent: 20 },
                markup: { at: "a\"] , body", percent: 20 },
                upper: { at: "Artikel", percent: 20 },
                nothing: null,
                number: 7,
            };
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ learn: { seen } }));
            store.load();
            expect(store.state.learn.seen).toEqual({ good: { at: "artikel-1", percent: 40 }, top: { at: "", percent: 0 }, whole: { at: "check", percent: 100 } });
            for (const broken of [null, "all", [1], 5])
            {
                window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ learn: { seen: broken } }));
                store.load();
                expect(store.state.learn.seen, String(broken)).toEqual({});
            }
        });

        it.each([
            ["are missing", undefined],
            ["are null", null],
            ["are an object", { day: TODAY, score: 30, total: 33 }],
            ["are a text", "passed"],
        ])("starts with no exam results when the saved ones %s", (_, exams) =>
        {
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ exams }));
            store.load();
            expect(store.state.exams).toEqual([]);
        });

        it("drops an exam result that cannot be true, and keeps only the last 20", () =>
        {
            const good = { day: TODAY, score: 30, total: 33 };
            const exams = [
                good,
                { ...good, extra: "dropped" },
                { day: TODAY, score: 34, total: 33 },
                { day: TODAY, score: 0, total: 0 },
                { day: -1, score: 1, total: 33 },
                { day: TODAY, score: 1.5, total: 33 },
                { day: TODAY, score: "30", total: 33 },
                { day: TODAY, score: 30 },
                null,
                "30 of 33",
            ];
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ exams }));
            store.load();
            expect(store.state.exams).toEqual([good, good]);
            window.localStorage.setItem(app.STORAGE_KEY, JSON.stringify({ exams: Array.from({ length: 30 }, (_, index) => ({ day: TODAY + index, score: 20, total: 33 })) }));
            store.load();
            expect(store.state.exams).toHaveLength(20);
            expect(store.state.exams[0].day).toBe(TODAY + 10);
        });
    });

    describe("save", () =>
    {
        it("survives storage that throws on write and keeps the in memory state", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            vi.spyOn(Storage.prototype, "setItem").mockImplementation(() =>
            {
                throw new Error("quota exceeded");
            });
            store.recordAnswer(7, false);
            expect(store.weakNumbers).toEqual([7]);
            expect(reporter).toHaveBeenCalledWith("quota exceeded");
        });
    });
});
