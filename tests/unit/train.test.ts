import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TRAIN_BOOST_MAX, TRAIN_RETRY_GAP } from "../../src/constants";
import { Trainer, type TrainQuestion } from "../../src/train";

/** Questions 1 to `size`, spread over the given topics in turn. */
function questions(size: number, topics: string[] = ["a", "b", "c"]): TrainQuestion[]
{
    return Array.from({ length: size }, (_, index) => ({ n: index + 1, k: topics[index % topics.length] }));
}

/** A random source that always takes the first choice. */
const first = (): number => 0;

/** A random source with a fixed seed, so a run can be repeated. */
function seeded(seed: number): (max: number) => number
{
    let state = seed >>> 0;
    return (max) =>
    {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state % max;
    };
}

/**
 * Plays a session to its end.
 * @param trainer The session.
 * @param right Decides whether the answer to a turn is right, from how often that question was asked before.
 * @returns The numbers in the order they were asked.
 */
function play(trainer: Trainer, right: (n: number, timesBefore: number) => boolean): number[]
{
    const asked: number[] = [];
    const counts = new Map<number, number>();
    for (let guard = 0; guard < 10_000 && trainer.current; guard++)
    {
        const turn = trainer.current;
        asked.push(turn.n);
        const before = counts.get(turn.n) ?? 0;
        counts.set(turn.n, before + 1);
        trainer.answer(right(turn.n, before));
        trainer.next();
    }
    return asked;
}

describe("Trainer", () =>
{
    it("starts with a question of the list, drawn at random", () =>
    {
        const trainer = new Trainer(questions(9), seeded(1));
        expect(trainer.current).not.toBeNull();
        expect(trainer.current?.reason).toBe("fresh");
        expect(trainer.total).toBe(9);
        expect(trainer.cleared).toBe(0);
        expect(trainer.answered).toBe(false);
    });

    it("is over at once when there are no questions", () =>
    {
        const trainer = new Trainer([]);
        expect(trainer.current).toBeNull();
        expect(trainer.done).toBe(true);
    });

    it("clears a question with a right answer and asks every question once when all answers are right", () =>
    {
        const trainer = new Trainer(questions(9), seeded(2));
        const asked = play(trainer, () => true);
        expect([...asked].sort((x, y) => x - y)).toEqual(questions(9).map((question) => question.n));
        expect(trainer.done).toBe(true);
        expect(trainer.cleared).toBe(9);
        expect(trainer.firstTry).toBe(9);
        expect(trainer.missed).toBe(0);
    });

    it("moves on to another topic after every answer while there is another one", () =>
    {
        const list = questions(12);
        const byNumber = new Map(list.map((question) => [question.n, question.k]));
        const asked = play(new Trainer(list, seeded(3)), () => true);
        for (let index = 1; index < asked.length - 3; index++)
        {
            expect(byNumber.get(asked[index])).not.toBe(byNumber.get(asked[index - 1]));
        }
    });

    it("keeps a question that was answered wrongly, and asks it again after a few answers, marked as a retry", () =>
    {
        const trainer = new Trainer(questions(12), first);
        const missed = trainer.current?.n as number;
        trainer.answer(false);
        expect(trainer.cleared).toBe(0);
        expect(trainer.comingBack).toBe(1);
        trainer.next();
        for (let step = 0; step < TRAIN_RETRY_GAP; step++)
        {
            expect(trainer.current?.n).not.toBe(missed);
            trainer.answer(true);
            trainer.next();
        }
        expect(trainer.current?.n).toBe(missed);
        expect(trainer.current?.reason).toBe("retry");
        expect(trainer.comingBack).toBe(0);
    });

    it("clears the question when the retry is answered right, and counts it as missed and not as a first try", () =>
    {
        const trainer = new Trainer(questions(6), first);
        const asked = play(trainer, (_, timesBefore) => timesBefore > 0);
        expect(trainer.done).toBe(true);
        expect(trainer.missed).toBe(6);
        expect(trainer.firstTry).toBe(0);
        expect(asked).toHaveLength(12);
    });

    it("draws a topic that was missed more often, and less often again after right answers", () =>
    {
        const trainer = new Trainer(questions(30, ["a", "b"]), first);
        const category = trainer.current?.category as string;
        trainer.answer(false);
        trainer.next();
        const boost = (): number => trainer.topics().find((topic) => topic.id === category)?.boost as number;
        expect(boost()).toBe(1);
        const other = trainer.current;
        trainer.answer(true);
        trainer.next();
        expect(other?.category).not.toBe(category);
        for (let step = 0; step < 10; step++)
        {
            if (trainer.current?.category === category)
            {
                trainer.answer(true);
                break;
            }
            trainer.answer(true);
            trainer.next();
        }
        expect(boost()).toBe(0);
    });

    it("marks a question of a topic that was brought back as such", () =>
    {
        const trainer = new Trainer(questions(30, ["a", "b"]), seeded(5));
        const category = trainer.current?.category as string;
        trainer.answer(false);
        trainer.next();
        let firstOfTopic: string | null = null;
        for (let step = 0; step < TRAIN_RETRY_GAP + 6 && trainer.current; step++)
        {
            if (trainer.current.category === category && firstOfTopic === null)
            {
                firstOfTopic = trainer.current.reason;
            }
            trainer.answer(true);
            trainer.next();
        }
        expect(firstOfTopic === "category" || firstOfTopic === "retry").toBe(true);
    });

    it("never lets a topic weigh more than the limit", () =>
    {
        const trainer = new Trainer(questions(30, ["a", "b"]), seeded(6));
        for (let step = 0; step < 20; step++)
        {
            trainer.answer(false);
            trainer.next();
        }
        for (const topic of trainer.topics())
        {
            expect(topic.boost).toBeLessThanOrEqual(TRAIN_BOOST_MAX);
        }
    });

    it("does not move on before an answer, and ignores a second answer to the same question", () =>
    {
        const trainer = new Trainer(questions(6), seeded(7));
        const turn = trainer.current;
        trainer.next();
        expect(trainer.current).toBe(turn);
        trainer.answer(true);
        trainer.answer(false);
        expect(trainer.cleared).toBe(1);
        expect(trainer.answers).toBe(1);
        expect(trainer.wasRight).toBe(true);
    });

    it("asks a waiting question at once when nothing else is left", () =>
    {
        const trainer = new Trainer(questions(1), first);
        trainer.answer(false);
        trainer.next();
        expect(trainer.current?.reason).toBe("retry");
        trainer.answer(true);
        trainer.next();
        expect(trainer.done).toBe(true);
        expect(trainer.current).toBeNull();
    });

    it("counts the questions left in a topic", () =>
    {
        const trainer = new Trainer(questions(6, ["a", "b"]), seeded(8));
        const category = trainer.current?.category as string;
        expect(trainer.remainingIn(category)).toBe(3);
        trainer.answer(true);
        expect(trainer.remainingIn(category)).toBe(2);
        expect(trainer.remainingIn("nothing")).toBe(0);
    });

    it("ignores a number that is in the list twice", () =>
    {
        const trainer = new Trainer([{ n: 1, k: "a" }, { n: 1, k: "a" }], first);
        expect(trainer.total).toBe(1);
    });

    it("always ends, asks no question that is already cleared, and needs one answer per question plus one per wrong answer", () =>
    {
        fc.assert(fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 5 }), fc.integer(), fc.integer({ min: 0, max: 4 }), (size, topics, seed, wrongEvery) =>
        {
            const list = questions(size, Array.from({ length: topics }, (_, index) => `t${index}`));
            const trainer = new Trainer(list, seeded(seed));
            const clearedNumbers = new Set<number>();
            let wrong = 0;
            let step = 0;
            while (trainer.current)
            {
                const turn = trainer.current;
                expect(clearedNumbers.has(turn.n)).toBe(false);
                const isWrong = wrongEvery > 0 && step % (wrongEvery + 1) === wrongEvery && trainer.missed < size && !trainer.topics().every((topic) => topic.cleared === topic.total);
                step += 1;
                if (isWrong)
                {
                    wrong += 1;
                    trainer.answer(false);
                }
                else
                {
                    clearedNumbers.add(turn.n);
                    trainer.answer(true);
                }
                trainer.next();
                if (step > 5000)
                {
                    throw new Error("does not end");
                }
            }
            expect(trainer.cleared).toBe(size);
            expect(trainer.answers).toBe(size + wrong);
            expect(trainer.cleared + trainer.remaining).toBe(trainer.total);
        }), { numRuns: 100 });
    });
});
