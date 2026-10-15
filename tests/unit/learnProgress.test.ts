import { describe, expect, it } from "vitest";
import {
    READY_CARD_PERCENT, READY_EXAMS, READY_EXAM_SCORE, boxCounts, coverage, dueCount, lessonState, nextStep, readPercent, readiness, weakCount,
} from "../../src/learn/progress";
import type { Card, Lesson } from "../../src/learn/types";
import type { LearnProgress } from "../../src/types";

/** A day to count from. */
const TODAY = 20000;

/**
 * Makes a lesson with one card per question.
 * @param id Lesson id.
 * @param questions The questions it prepares for.
 * @returns The lesson.
 */
function lesson(id: string, questions: number[]): Lesson
{
    const cards: Card[] = questions.map((question) => ({ id: `${id}/q${question}`, lesson: id, unit: `q${question}`, front: "front", questions: [question] }));
    return { id, chapter: "chapter", title: id, big: "", minutes: 5, pre: questions[0], check: questions, review: null, blocks: [], questions, cards };
}

/** Three lessons with two, three and one card. */
const LESSONS = [lesson("one", [1, 2]), lesson("two", [3, 4, 5]), lesson("three", [6])];
const CARDS = LESSONS.flatMap((entry) => entry.cards);

/**
 * Saved progress with what a test names.
 * @param part The parts that differ from an empty progress.
 * @returns The progress.
 */
function progress(part: Partial<LearnProgress> = {}): LearnProgress
{
    return { read: {}, seen: {}, cards: {}, last: null, ...part };
}

describe("how a lesson stands", () =>
{
    it("is new until it is marked as done, whatever its cards say", () =>
    {
        expect(lessonState(LESSONS[0], progress())).toBe("new");
        expect(lessonState(LESSONS[0], progress({ cards: { "one/q1": { box: 5, due: TODAY }, "one/q2": { box: 5, due: TODAY } } }))).toBe("new");
    });

    it("is begun once some of it was read, and reading alone never makes it done, not even to the end", () =>
    {
        expect(readPercent(LESSONS[0], progress())).toBe(0);
        expect(lessonState(LESSONS[0], progress({ seen: { one: { at: "", percent: 0 } } }))).toBe("new");
        const half = progress({ seen: { one: { at: "q1", percent: 50 } } });
        expect(readPercent(LESSONS[0], half)).toBe(50);
        expect(lessonState(LESSONS[0], half)).toBe("started");
        expect(lessonState(LESSONS[0], progress({ seen: { one: { at: "check", percent: 100 } } }))).toBe("started");
        // The progress of another lesson says nothing about this one.
        expect(lessonState(LESSONS[1], half)).toBe("new");
        // Once it is marked, how much was read does not matter.
        expect(lessonState(LESSONS[0], progress({ read: { one: TODAY }, seen: { one: { at: "q1", percent: 50 } } }))).toBe("read");
    });

    it("is done once its check was finished, and secure when every card reached box 3", () =>
    {
        const read = { one: TODAY };
        expect(lessonState(LESSONS[0], progress({ read }))).toBe("read");
        expect(lessonState(LESSONS[0], progress({ read, cards: { "one/q1": { box: 3, due: TODAY }, "one/q2": { box: 2, due: TODAY } } }))).toBe("read");
        expect(lessonState(LESSONS[0], progress({ read, cards: { "one/q1": { box: 3, due: TODAY }, "one/q2": { box: 4, due: TODAY } } }))).toBe("secure");
    });

    it("is never secure without cards: there is nothing that was still known after a pause", () =>
    {
        const empty: Lesson = { ...LESSONS[0], id: "empty", cards: [] };
        expect(lessonState(empty, progress({ read: { empty: TODAY } }))).toBe("read");
    });

    it("counts the questions of a lesson that were wrong the last time", () =>
    {
        const records = {
            "3": { right: 0, wrong: 1, lastWrong: true },
            "4": { right: 2, wrong: 1, lastWrong: false },
            "5": { right: 0, wrong: 2, lastWrong: true },
            "6": { right: 0, wrong: 1, lastWrong: true },
        };
        expect(weakCount(LESSONS[1], records)).toBe(2);
        expect(weakCount(LESSONS[0], records)).toBe(0);
        expect(weakCount(LESSONS[2], {})).toBe(0);
    });
});

describe("how far the course is done", () =>
{
    it("counts finished lessons and the questions they prepare for", () =>
    {
        expect(coverage(LESSONS, progress())).toEqual({ read: 0, lessons: 3, questions: 0 });
        expect(coverage(LESSONS, progress({ read: { one: TODAY, three: TODAY } }))).toEqual({ read: 2, lessons: 3, questions: 3 });
        // A lesson that no longer exists does not count.
        expect(coverage(LESSONS, progress({ read: { gone: TODAY } }))).toEqual({ read: 0, lessons: 3, questions: 0 });
    });

    it("counts the cards of every box, and the cards that were not introduced yet", () =>
    {
        const cards = { "one/q1": { box: 1, due: TODAY }, "one/q2": { box: 1, due: TODAY + 1 }, "two/q3": { box: 3, due: TODAY }, "three/q6": { box: 5, due: TODAY + 20 } };
        expect(boxCounts(CARDS, progress({ cards }))).toEqual({ waiting: 2, boxes: [2, 0, 1, 0, 1] });
        expect(boxCounts(CARDS, progress())).toEqual({ waiting: 6, boxes: [0, 0, 0, 0, 0] });
    });

    it("counts the cards that are due today or overdue, and no card of a lesson that is gone", () =>
    {
        const cards = { "one/q1": { box: 1, due: TODAY }, "one/q2": { box: 1, due: TODAY + 1 }, "two/q3": { box: 3, due: TODAY - 4 }, "gone/x": { box: 1, due: TODAY } };
        expect(dueCount(CARDS, progress({ cards }), TODAY)).toBe(2);
        expect(dueCount(CARDS, progress({ cards }), TODAY + 1)).toBe(3);
        expect(dueCount(CARDS, progress(), TODAY)).toBe(0);
    });
});

describe("the evidence of being ready for the test", () =>
{
    /** Every card in a box. */
    const allIn = (box: number): Record<string, { box: number; due: number }> => Object.fromEntries(CARDS.map((card) => [card.id, { box, due: TODAY + 5 }]));
    const allRead = Object.fromEntries(LESSONS.map((entry) => [entry.id, TODAY]));

    it("asks for three things: every lesson, 80% of the cards in box 3 or higher, and two good exams on different days", () =>
    {
        expect([READY_CARD_PERCENT, READY_EXAM_SCORE, READY_EXAMS]).toEqual([80, 25, 2]);
        const nothing = readiness(LESSONS, CARDS, progress(), []);
        expect(nothing).toEqual({ lessons: { done: 0, total: 3, met: false }, cards: { percent: 0, met: false }, exams: { done: 0, met: false }, ready: false });
        const all = readiness(LESSONS, CARDS, progress({ read: allRead, cards: allIn(3) }), [{ day: TODAY - 1, score: 25, total: 33 }, { day: TODAY, score: 33, total: 33 }]);
        expect(all).toEqual({ lessons: { done: 3, total: 3, met: true }, cards: { percent: 100, met: true }, exams: { done: 2, met: true }, ready: true });
    });

    it("is not met by reading alone, by cards alone or by exams alone", () =>
    {
        const exams = [{ day: TODAY - 1, score: 30, total: 33 }, { day: TODAY, score: 30, total: 33 }];
        expect(readiness(LESSONS, CARDS, progress({ read: allRead }), []).ready).toBe(false);
        expect(readiness(LESSONS, CARDS, progress({ cards: allIn(5) }), []).ready).toBe(false);
        expect(readiness(LESSONS, CARDS, progress(), exams).ready).toBe(false);
        expect(readiness(LESSONS, CARDS, progress({ read: allRead, cards: allIn(5) }), []).ready).toBe(false);
    });

    it("rounds the share of secure cards down, so 79.9% is not 80%", () =>
    {
        // Five of six cards are 83%, four of six are 66%.
        const five = { ...allIn(3), "one/q1": { box: 2, due: TODAY } };
        const four = { ...five, "one/q2": { box: 1, due: TODAY } };
        expect(readiness(LESSONS, CARDS, progress({ cards: five }), []).cards).toEqual({ percent: 83, met: true });
        expect(readiness(LESSONS, CARDS, progress({ cards: four }), []).cards).toEqual({ percent: 66, met: false });
    });

    it("counts good exams by day: two on one day are one, and an exam below 25 does not count", () =>
    {
        const sameDay = [{ day: TODAY, score: 30, total: 33 }, { day: TODAY, score: 31, total: 33 }];
        expect(readiness(LESSONS, CARDS, progress(), sameDay).exams).toEqual({ done: 1, met: false });
        const oneWeak = [{ day: TODAY - 1, score: 24, total: 33 }, { day: TODAY, score: 31, total: 33 }];
        expect(readiness(LESSONS, CARDS, progress(), oneWeak).exams).toEqual({ done: 1, met: false });
        const many = [TODAY - 2, TODAY - 1, TODAY].map((day) => ({ day, score: 28, total: 33 }));
        expect(readiness(LESSONS, CARDS, progress(), many).exams).toEqual({ done: 2, met: true });
    });

    it("is never met by a course without lessons or cards", () =>
    {
        const empty = readiness([], [], progress(), []);
        expect(empty.lessons.met).toBe(false);
        expect(empty.cards).toEqual({ percent: 0, met: false });
    });
});

describe("the next step", () =>
{
    it("is the cards that are due, before anything else", () =>
    {
        const learn = progress({ cards: { "one/q1": { box: 1, due: TODAY }, "one/q2": { box: 1, due: TODAY - 1 } } });
        expect(nextStep(LESSONS, CARDS, learn, 4, TODAY)).toEqual({ kind: "cards", count: 2 });
    });

    it("is the first lesson that is not finished when no card is due", () =>
    {
        expect(nextStep(LESSONS, CARDS, progress(), 0, TODAY)).toEqual({ kind: "lesson", lesson: LESSONS[0], resume: false });
        expect(nextStep(LESSONS, CARDS, progress({ read: { one: TODAY } }), 9, TODAY)).toEqual({ kind: "lesson", lesson: LESSONS[1], resume: false });
    });

    it("takes up the lesson that was open last, as long as it is not finished", () =>
    {
        expect(nextStep(LESSONS, CARDS, progress({ last: "three" }), 0, TODAY)).toEqual({ kind: "lesson", lesson: LESSONS[2], resume: true });
        expect(nextStep(LESSONS, CARDS, progress({ last: "three", read: { three: TODAY } }), 0, TODAY)).toEqual({ kind: "lesson", lesson: LESSONS[0], resume: false });
        expect(nextStep(LESSONS, CARDS, progress({ last: "gone" }), 0, TODAY)).toEqual({ kind: "lesson", lesson: LESSONS[0], resume: false });
    });

    it("is the weak questions when every lesson is finished, and an exam when there are none", () =>
    {
        const read = Object.fromEntries(LESSONS.map((entry) => [entry.id, TODAY]));
        expect(nextStep(LESSONS, CARDS, progress({ read }), 3, TODAY)).toEqual({ kind: "weak", count: 3 });
        expect(nextStep(LESSONS, CARDS, progress({ read }), 0, TODAY)).toEqual({ kind: "exam" });
    });
});
