import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { Round, type Presenter } from "../../src/round";
import type { PresentedQuestion, Question } from "../../src/types";

/**
 * Builds a question as shown: four options, the first one is right.
 * @param n Question number.
 * @param shuffle Whether the options were shuffled (here: they are reversed, so the test can tell).
 * @returns The presented question.
 */
const present: Presenter = (n, shuffle) =>
{
    const options = [0, 1, 2, 3].map((index) => ({ index, texts: { de: `A${n}-${index}`, en: `a${n}-${index}` }, isCorrect: index === 0 }));
    return { question: { n } as Question, options: shuffle ? options.reverse() : options } as PresentedQuestion;
};

/** Index of the correct option of the question that is shown. */
function rightIndex(round: Round): number
{
    return (round.current?.item as PresentedQuestion).options.findIndex((option) => option.isCorrect);
}

/** Question numbers in the order the slots exist. */
function numbers(round: Round): number[]
{
    return round.slots.map((slot) => slot.n);
}

/** Builds a question as shown, with its options in the order of their places in the catalogue. */
const presentAgain = (n: number, order: number[]): PresentedQuestion =>
{
    const options = present(n, false).options;
    return { question: { n } as Question, options: order.map((index) => options[index]) } as PresentedQuestion;
};

describe("a round that is saved and goes on later", () =>
{
    it("goes on where it stood, with every answer, every skip and the order the options were shown in", () =>
    {
        const round = new Round([10, 20, 30, 40], "booklet", present);
        round.answer(rightIndex(round));
        round.advance();
        round.advance();
        round.answer(1);
        const saved = round.snapshot();
        expect(saved.slots.map((slot) => [slot.n, slot.outcome, slot.selected])).toEqual([[10, "correct", 0], [20, "skipped", null], [30, "wrong", 1], [40, "open", null]]);
        // The order of the booklet keeps the printed order of the options: the places of the catalogue, in the order shown.
        expect(saved.slots[0].options).toEqual([0, 1, 2, 3]);
        expect(saved.slots[3].options).toBeNull();
        const again = Round.restore(JSON.parse(JSON.stringify(saved)) as typeof saved, present, presentAgain);
        expect(again.snapshot()).toEqual(saved);
        expect(numbers(again)).toEqual([10, 20, 30, 40]);
        expect(again.current?.n).toBe(30);
        expect(again.current?.item?.options.map((option) => option.texts.de)).toEqual(["A30-0", "A30-1", "A30-2", "A30-3"]);
        expect(again.current?.selected).toBe(1);
        again.advance();
        expect(again.current?.n).toBe(40);
        expect(again.current?.item).not.toBeNull();
    });

    it("keeps what a round in random order has not drawn yet, and ends as it would have", () =>
    {
        const round = new Round([1, 2, 3], "random", present);
        round.answer(rightIndex(round));
        const saved = round.snapshot();
        expect(saved.remaining).toHaveLength(2);
        // Shuffled when shown (here: reversed), and shown in that order again.
        expect(saved.slots[0].options).toEqual([3, 2, 1, 0]);
        const again = Round.restore(saved, present, presentAgain);
        expect(again.current?.item?.options.map((option) => option.isCorrect)).toEqual([false, false, false, true]);
        again.advance();
        again.answer(0);
        again.advance();
        again.answer(0);
        again.advance();
        expect(again.ended).toBe(true);
        expect(new Set(again.slots.map((slot) => slot.n))).toEqual(new Set([1, 2, 3]));
    });

    it("keeps an ended round ended, and its lock", () =>
    {
        const round = new Round([5], "booklet", present, true);
        round.answer(0);
        round.advance();
        const again = Round.restore(round.snapshot(), present, presentAgain);
        expect(again.ended).toBe(true);
        expect(again.current).toBeUndefined();
        expect(again.locked).toBe(true);
    });
});

describe("Round in booklet order", () =>
{
    let round: Round;

    beforeEach(() =>
    {
        round = new Round([30, 10, 20, 40, 50], "booklet", present);
    });

    it("gives a question that is named twice one place only", () =>
    {
        const twice = new Round([5, 5, 7, 5], "booklet", present);
        expect(numbers(twice)).toEqual([5, 7]);
        expect(twice.total).toBe(2);
    });

    it("has a slot for every question, ascending, all open, so the future is known", () =>
    {
        expect(numbers(round)).toEqual([10, 20, 30, 40, 50]);
        expect(round.slots.every((slot) => slot.outcome === "open")).toBe(true);
        expect(round.total).toBe(5);
        expect(round.view).toBe(0);
        expect(round.resume).toBe(0);
        expect(round.ended).toBe(false);
    });

    it("shows the first question and builds only the questions it needs", () =>
    {
        expect(round.current?.n).toBe(10);
        expect(round.slots[0].item).not.toBeNull();
        expect(round.slots[1].item).toBeNull();
    });

    it("keeps the options in the printed order", () =>
    {
        expect(rightIndex(round)).toBe(0);
        expect(round.current?.item?.options.map((option) => option.texts.de)).toEqual(["A10-0", "A10-1", "A10-2", "A10-3"]);
    });

    it("answers right and wrong, and says what to record", () =>
    {
        expect(round.answer(0)).toEqual({ n: 10, wasCorrect: true, first: true });
        expect(round.slots[0]).toMatchObject({ outcome: "correct", selected: 0 });
        round.advance();
        expect(round.answer(2)).toEqual({ n: 20, wasCorrect: false, first: true });
        expect(round.slots[1]).toMatchObject({ outcome: "wrong", selected: 2 });
    });

    it("does not take an option that does not exist", () =>
    {
        expect(round.answer(7)).toBeNull();
        expect(round.answer(-1)).toBeNull();
        expect(round.slots[0].selected).toBeNull();
    });

    it("lets an answer be changed, and says that the new one is not the first", () =>
    {
        expect(round.locked).toBe(false);
        expect(round.answer(1)).toEqual({ n: 10, wasCorrect: false, first: true });
        expect(round.slots[0].outcome).toBe("wrong");
        expect(round.canAnswer).toBe(true);
        expect(round.answer(0)).toEqual({ n: 10, wasCorrect: true, first: false });
        expect(round.slots[0].outcome).toBe("correct");
        expect(round.counts).toMatchObject({ correct: 1, wrong: 0, answered: 1 });
    });

    it("records nothing when the option that is chosen is the one that was already chosen", () =>
    {
        round.answer(2);
        expect(round.answer(2)).toBeNull();
    });

    it("goes on to the next question after an answer", () =>
    {
        round.answer(0);
        round.advance();
        expect(round.view).toBe(1);
        expect(round.resume).toBe(1);
        expect(round.current?.n).toBe(20);
    });

    it("skips an unanswered question: it is marked skipped and the round goes on", () =>
    {
        round.advance();
        expect(round.slots[0].outcome).toBe("skipped");
        expect(round.slots[0].selected).toBeNull();
        expect(round.view).toBe(1);
        expect(round.counts.skipped).toBe(1);
    });

    it("counts everything", () =>
    {
        round.answer(0);
        round.advance();
        round.answer(1);
        round.advance();
        round.advance();
        expect(round.counts).toEqual({ correct: 1, wrong: 1, skipped: 1, open: 2, total: 5, answered: 2 });
    });

    describe("looking at other questions", () =>
    {
        beforeEach(() =>
        {
            round.answer(0);
            round.advance();
            round.advance();
            round.advance();
        });

        it("opens an answered question again, and its answer can be changed", () =>
        {
            round.open(0);
            expect(round.view).toBe(0);
            expect(round.resume).toBe(3);
            expect(round.isDetour).toBe(true);
            expect(round.canAnswer).toBe(true);
            expect(round.answer(1)).toEqual({ n: 10, wasCorrect: false, first: false });
            expect(round.slots[0].outcome).toBe("wrong");
        });

        it("opens a skipped question so that it can be answered in its own place", () =>
        {
            round.open(1);
            expect(round.canAnswer).toBe(true);
            expect(round.answer(0)).toEqual({ n: 20, wasCorrect: true, first: true });
            expect(round.slots[1].outcome).toBe("correct");
            expect(round.resume).toBe(3);
        });

        it("returns to where the round goes on with the right hand button", () =>
        {
            round.open(1);
            round.advance();
            expect(round.view).toBe(3);
            expect(round.isDetour).toBe(false);
        });

        it("does not mark a skipped question as answered when the user only looks at it", () =>
        {
            round.open(1);
            round.advance();
            expect(round.slots[1].outcome).toBe("skipped");
        });

        it("keeps the options of a question the same when it is opened again", () =>
        {
            const first = round.slots[1].item;
            round.open(0);
            round.open(1);
            expect(round.slots[1].item).toBe(first);
        });

        it("goes back to the previous answered or skipped question", () =>
        {
            expect(round.canGoBack).toBe(true);
            round.back();
            expect(round.view).toBe(2);
            round.back();
            expect(round.view).toBe(1);
            round.back();
            expect(round.view).toBe(0);
            expect(round.canGoBack).toBe(false);
            round.back();
            expect(round.view).toBe(0);
        });

        it("ignores a click on a slot that does not exist", () =>
        {
            round.open(99);
            expect(round.view).toBe(3);
        });
    });

    describe("jumping ahead", () =>
    {
        it("makes a question further on the place where the round goes on", () =>
        {
            round.open(3);
            expect(round.view).toBe(3);
            expect(round.resume).toBe(3);
            expect(round.isDetour).toBe(false);
        });

        it("marks the questions that were jumped over as skipped, as the Skip button does, and the one that was left", () =>
        {
            round.open(3);
            expect(round.slots.map((slot) => slot.outcome)).toEqual(["skipped", "skipped", "skipped", "open", "open"]);
            expect(round.resume).toBe(3);
        });

        it("leaves an answered question alone when it is jumped over", () =>
        {
            round.answer(0);
            round.open(2);
            expect(round.slots.map((slot) => slot.outcome)).toEqual(["correct", "skipped", "open", "open", "open"]);
        });

        it("ends after the last question, and offers what was jumped over as skipped", () =>
        {
            round.open(3);
            round.answer(0);
            round.advance();
            expect(round.current?.n).toBe(50);
            round.answer(0);
            round.advance();
            expect(round.ended).toBe(true);
            expect(round.counts.skipped).toBe(3);
        });

        it("only shows a skipped question when it is opened again, and goes on from where it was", () =>
        {
            round.open(3);
            round.open(1);
            expect(round.view).toBe(1);
            expect(round.resume).toBe(3);
            expect(round.slots.map((slot) => slot.outcome)).toEqual(["skipped", "skipped", "skipped", "open", "open"]);
        });

        it("does not mark a question that is only looked at on the way back", () =>
        {
            round.answer(0);
            round.advance();
            round.open(0);
            expect(round.slots[1].outcome).toBe("open");
        });
    });

    describe("the end of the round", () =>
    {
        it("ends after the last question and shows the summary", () =>
        {
            for (let step = 0; step < 5; step++)
            {
                round.answer(0);
                round.advance();
            }
            expect(round.ended).toBe(true);
            expect(round.view).toBe(-1);
            expect(round.current).toBeUndefined();
            expect(round.counts.correct).toBe(5);
        });

        it("knows whether the right hand button leads to another question", () =>
        {
            expect(round.hasNext).toBe(true);
            for (let step = 0; step < 4; step++)
            {
                round.answer(0);
                round.advance();
            }
            expect(round.hasNext).toBe(false);
        });

        it("keeps skipped questions, and walks through them one by one", () =>
        {
            round.advance();
            round.answer(0);
            round.advance();
            round.advance();
            round.advance();
            round.advance();
            expect(round.ended).toBe(true);
            expect(round.counts.skipped).toBe(4);
            round.answerSkipped();
            expect(round.view).toBe(0);
            expect(round.canAnswer).toBe(true);
            round.answer(0);
            round.advance();
            expect(round.view).toBe(2);
            round.answer(0);
            round.advance();
            round.advance();
            round.advance();
            expect(round.view).toBe(-1);
            expect(round.counts.skipped).toBe(2);
        });

        it("lets the user look at a slot after the end, and the button then leads back", () =>
        {
            for (let step = 0; step < 5; step++)
            {
                round.answer(0);
                round.advance();
            }
            round.open(2);
            expect(round.view).toBe(2);
            expect(round.ended).toBe(true);
            round.advance();
            expect(round.view).toBe(-1);
        });

        it("goes back from the end card to the last question", () =>
        {
            for (let step = 0; step < 5; step++)
            {
                round.answer(0);
                round.advance();
            }
            round.back();
            expect(round.view).toBe(4);
        });

        it("does nothing when asked to advance on the end card, or to show skipped questions when there are none", () =>
        {
            for (let step = 0; step < 5; step++)
            {
                round.answer(0);
                round.advance();
            }
            round.advance();
            round.answerSkipped();
            expect(round.view).toBe(-1);
        });

        it("lists the questions answered wrongly", () =>
        {
            round.answer(1);
            round.advance();
            round.answer(0);
            round.advance();
            round.answer(3);
            expect(round.mistakes).toEqual([10, 30]);
        });
    });
});

describe("Round in random order", () =>
{
    it("starts with one question and shows the rest only as a count, because the next one is drawn when the user moves on", () =>
    {
        const round = new Round([1, 2, 3, 4, 5], "random", present);
        expect(round.slots).toHaveLength(1);
        expect(round.total).toBe(5);
        expect(round.counts.open).toBe(5);
        expect(round.hasNext).toBe(true);
    });

    it("shuffles the options", () =>
    {
        const round = new Round([1], "random", present);
        expect(rightIndex(round)).toBe(3);
    });

    it("draws every question once and then ends", () =>
    {
        const round = new Round([1, 2, 3, 4, 5, 6, 7], "random", present);
        for (let step = 0; step < 7; step++)
        {
            round.answer(0);
            round.advance();
        }
        expect(round.ended).toBe(true);
        expect([...numbers(round)].sort((first, second) => first - second)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("can draw every order", () =>
    {
        const firsts = new Set<number>();
        for (let attempt = 0; attempt < 200; attempt++)
        {
            firsts.add(new Round([1, 2, 3], "random", present).slots[0].n);
        }
        expect(firsts).toEqual(new Set([1, 2, 3]));
    });

    it("draws a new question when skipping, and keeps the skipped one in the round", () =>
    {
        const round = new Round([1, 2, 3], "random", present);
        const first = round.slots[0].n;
        round.advance();
        expect(round.slots).toHaveLength(2);
        expect(round.slots[0]).toMatchObject({ n: first, outcome: "skipped" });
        expect(round.counts.open).toBe(2);
        round.advance();
        round.advance();
        expect(round.ended).toBe(true);
        expect(round.counts.skipped).toBe(3);
    });

    it("shows a skipped question again only when the user asks for it", () =>
    {
        const round = new Round([1, 2, 3], "random", present);
        const first = round.slots[0].n;
        round.advance();
        expect(round.current?.n).not.toBe(first);
        round.open(0);
        expect(round.current?.n).toBe(first);
        expect(round.canAnswer).toBe(true);
    });

    it("never repeats a question inside a round, whatever the user does", () =>
    {
        fc.assert(fc.property(fc.array(fc.constantFrom("answer", "skip", "back", "open"), { minLength: 1, maxLength: 60 }), (actions) =>
        {
            const round = new Round(Array.from({ length: 20 }, (_, index) => index + 1), "random", present);
            for (const action of actions)
            {
                if (action === "answer")
                {
                    round.answer(0);
                }
                else if (action === "skip")
                {
                    round.advance();
                }
                else if (action === "back")
                {
                    round.back();
                }
                else
                {
                    round.open(0);
                }
            }
            const seen = numbers(round);
            expect(new Set(seen).size).toBe(seen.length);
            expect(round.total).toBe(20);
        }));
    });

    it("ignores a click on a question that was not asked yet", () =>
    {
        const round = new Round([1, 2], "booklet", present);
        round.advance();
        round.advance();
        expect(round.ended).toBe(true);
        round.slots[0].outcome = "open";
        round.open(0);
        expect(round.view).toBe(-1);
    });
});

describe("Round with nothing to ask", () =>
{
    it.each(["random", "booklet"] as const)("is over at once in %s order", (order) =>
    {
        const round = new Round([], order, present);
        expect(round.ended).toBe(true);
        expect(round.view).toBe(-1);
        expect(round.total).toBe(0);
        expect(round.counts).toEqual({ correct: 0, wrong: 0, skipped: 0, open: 0, total: 0, answered: 0 });
        expect(round.hasNext).toBe(false);
        expect(round.canGoBack).toBe(false);
    });
});

describe("Round with one question", () =>
{
    it("ends after it, whether it was answered or skipped", () =>
    {
        const answered = new Round([5], "booklet", present);
        answered.answer(0);
        answered.advance();
        expect(answered.ended).toBe(true);
        const skipped = new Round([5], "random", present);
        skipped.advance();
        expect(skipped.ended).toBe(true);
        expect(skipped.counts.skipped).toBe(1);
    });
});

describe("Round with locked answers", () =>
{
    let round: Round;

    beforeEach(() =>
    {
        round = new Round([10, 20, 30], "booklet", present, true);
    });

    it("says that answers are final", () =>
    {
        expect(round.locked).toBe(true);
    });

    it("takes the first answer and refuses another", () =>
    {
        expect(round.answer(1)).toEqual({ n: 10, wasCorrect: false, first: true });
        expect(round.canAnswer).toBe(false);
        expect(round.answer(0)).toBeNull();
        expect(round.slots[0].outcome).toBe("wrong");
    });

    it("still lets a skipped question be answered once", () =>
    {
        round.advance();
        round.open(0);
        expect(round.canAnswer).toBe(true);
        expect(round.answer(0)).toEqual({ n: 10, wasCorrect: true, first: true });
        expect(round.canAnswer).toBe(false);
    });

    it("locks an answered question that is opened for review", () =>
    {
        round.answer(0);
        round.advance();
        round.open(0);
        expect(round.canAnswer).toBe(false);
        expect(round.answer(1)).toBeNull();
    });
});
