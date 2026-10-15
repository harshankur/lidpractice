import { PERCENT } from "../constants";
import type { ExamResult, LearnProgress, QuestionRecord } from "../types";
import { LAST_BOX, SECURE_BOX, isDue } from "./schedule";
import type { Card, Lesson } from "./types";

/**
 * What the Learn tab says about progress. Every number here is evidence of something the user did or knew:
 * a check that was finished, a card that was still known after a pause, an exam that was passed. Reading alone counts for nothing.
 */

/**
 * How a lesson stands: not opened yet, begun (some of it was read), done (its check was finished, or the user ticked
 * it off), or secure (done, and every card was still known after two pauses).
 */
export type LessonState = "new" | "started" | "read" | "secure";

/** The share of the flash cards that has to be secure before the user is told they are ready, in percent. */
export const READY_CARD_PERCENT = 80;

/** The score an exam needs to count as a sign of being ready. The pass mark is lower: this leaves a margin. */
export const READY_EXAM_SCORE = 25;

/** How many such exams it takes, on different days. */
export const READY_EXAMS = 2;

/**
 * How much of a lesson has come into view so far.
 * @param lesson The lesson.
 * @param learn The saved progress.
 * @returns The share in percent, 0 for a lesson that was never scrolled.
 */
export function readPercent(lesson: Lesson, learn: LearnProgress): number
{
    return learn.seen[lesson.id]?.percent ?? 0;
}

/**
 * How a lesson stands. Reading alone never makes a lesson done: that takes the check, or the user's own tick.
 * @param lesson The lesson.
 * @param learn The saved progress.
 * @returns "new", "started", "read" or "secure".
 */
export function lessonState(lesson: Lesson, learn: LearnProgress): LessonState
{
    if (learn.read[lesson.id] === undefined)
    {
        return readPercent(lesson, learn) > 0 ? "started" : "new";
    }
    const secure = lesson.cards.length > 0 && lesson.cards.every((card) => (learn.cards[card.id]?.box ?? 0) >= SECURE_BOX);
    return secure ? "secure" : "read";
}

/**
 * How many questions of a lesson were answered wrongly the last time, in practice, in the training or in an exam.
 * @param lesson The lesson.
 * @param records The answers so far, by question number.
 * @returns The count.
 */
export function weakCount(lesson: Lesson, records: Readonly<Record<string, QuestionRecord>>): number
{
    return lesson.questions.filter((question) => records[String(question)]?.lastWrong === true).length;
}

/** How much of the course is done. */
export interface Coverage
{
    /** Lessons whose check was finished. */
    read: number;
    /** All lessons. */
    lessons: number;
    /** The questions those lessons prepare for. */
    questions: number;
}

/**
 * How much of the course is done.
 * @param lessons Every lesson.
 * @param learn The saved progress.
 * @returns Finished lessons and the questions they prepare for.
 */
export function coverage(lessons: readonly Lesson[], learn: LearnProgress): Coverage
{
    const read = lessons.filter((lesson) => learn.read[lesson.id] !== undefined);
    return { read: read.length, lessons: lessons.length, questions: read.reduce((sum, lesson) => sum + lesson.questions.length, 0) };
}

/**
 * How many cards are in each box.
 * @param cards Every card.
 * @param learn The saved progress.
 * @returns The count per box, box 1 first, and before them the cards that were not introduced yet.
 */
export function boxCounts(cards: readonly Card[], learn: LearnProgress): { waiting: number; boxes: number[] }
{
    const boxes = Array.from({ length: LAST_BOX }, () => 0);
    let waiting = 0;
    for (const card of cards)
    {
        const state = learn.cards[card.id];
        if (state)
        {
            boxes[state.box - 1] += 1;
        }
        else
        {
            waiting += 1;
        }
    }
    return { waiting, boxes };
}

/**
 * How many cards are due.
 * @param cards Every card.
 * @param learn The saved progress.
 * @param today The day number of today.
 * @returns The count.
 */
export function dueCount(cards: readonly Card[], learn: LearnProgress, today: number): number
{
    return cards.filter((card) => learn.cards[card.id] !== undefined && isDue(learn.cards[card.id], today)).length;
}

/** The evidence that the user is ready for the exam. */
export interface Readiness
{
    lessons: { done: number; total: number; met: boolean };
    /** The share of all cards that is secure, in percent. */
    cards: { percent: number; met: boolean };
    /** The days with an exam that was good enough. */
    exams: { done: number; met: boolean };
    /** Whether all three are met. */
    ready: boolean;
}

/**
 * Gathers the evidence that the user is ready for the exam.
 * @param lessons Every lesson.
 * @param cards Every card.
 * @param learn The saved progress.
 * @param exams The saved exam results.
 * @returns What is met and what is not.
 */
export function readiness(lessons: readonly Lesson[], cards: readonly Card[], learn: LearnProgress, exams: readonly ExamResult[]): Readiness
{
    const done = coverage(lessons, learn).read;
    const secure = cards.filter((card) => (learn.cards[card.id]?.box ?? 0) >= SECURE_BOX).length;
    const percent = cards.length === 0 ? 0 : Math.floor((secure / cards.length) * PERCENT);
    const goodDays = new Set(exams.filter((exam) => exam.score >= READY_EXAM_SCORE).map((exam) => exam.day)).size;
    const parts = {
        lessons: { done, total: lessons.length, met: lessons.length > 0 && done === lessons.length },
        cards: { percent, met: percent >= READY_CARD_PERCENT },
        exams: { done: Math.min(goodDays, READY_EXAMS), met: goodDays >= READY_EXAMS },
    };
    return { ...parts, ready: parts.lessons.met && parts.cards.met && parts.exams.met };
}

/** The one thing the Learn tab suggests to do next. */
export type NextStep =
    | { kind: "cards"; count: number }
    | { kind: "lesson"; lesson: Lesson; resume: boolean }
    | { kind: "weak"; count: number }
    | { kind: "exam" };

/**
 * Chooses what to do next: cards that are due come first, then the next lesson that is not finished, then the
 * questions that were answered wrongly, then an exam.
 * @param lessons Every lesson, in teaching order.
 * @param cards Every card.
 * @param learn The saved progress.
 * @param weak How many questions were answered wrongly the last time.
 * @param today The day number of today.
 * @returns The step.
 */
export function nextStep(lessons: readonly Lesson[], cards: readonly Card[], learn: LearnProgress, weak: number, today: number): NextStep
{
    const due = dueCount(cards, learn, today);
    if (due > 0)
    {
        return { kind: "cards", count: due };
    }
    const open = lessons.filter((lesson) => learn.read[lesson.id] === undefined);
    if (open.length > 0)
    {
        // The lesson that was open last is taken up again; otherwise the first one that is not finished.
        const last = open.find((lesson) => lesson.id === learn.last);
        return { kind: "lesson", lesson: last ?? open[0], resume: last !== undefined };
    }
    return weak > 0 ? { kind: "weak", count: weak } : { kind: "exam" };
}
