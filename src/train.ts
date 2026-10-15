import { TRAIN_BOOST_MAX, TRAIN_RETRY_GAP } from "./constants";
import { randomInt } from "./random";

/** A question as the training needs to know it. */
export interface TrainQuestion
{
    n: number;
    /** The topic of the question: a subject, or the user's state. */
    k: string;
}

/** Why a question is shown: drawn at random, drawn because its topic was brought back, or the very question that was missed. */
export type TrainReason = "fresh" | "category" | "retry";

/** The question that is up. */
export interface TrainTurn
{
    n: number;
    category: string;
    reason: TrainReason;
}

/** How one topic stands. */
export interface TrainTopic
{
    id: string;
    total: number;
    cleared: number;
    /** How much more often the topic is drawn because of wrong answers. 0 is not at all. */
    boost: number;
}

/** A question that was answered wrongly and is waiting to come back. */
interface Waiting
{
    n: number;
    /** The count of answers at which it is due. */
    dueAt: number;
}

/**
 * The model of a training session. It starts at random. A right answer clears the question, which makes its topic
 * smaller and lighter in the draw, and moves on to another topic. A wrong answer keeps the question, brings it back
 * after a few answers, and makes its topic heavier in the draw until questions of it are answered right again.
 * The session is over when every question is cleared.
 */
export class Trainer
{
    private readonly piles = new Map<string, number[]>();
    private readonly totals = new Map<string, number>();
    private readonly boosts = new Map<string, number>();
    private readonly categoryOf = new Map<number, string>();
    private readonly waiting: Waiting[] = [];
    private readonly everMissed = new Set<number>();
    private asked = 0;
    private answeredFirstTry = 0;
    private lastCategory: string | null = null;
    private turn: TrainTurn | null = null;
    private right: boolean | null = null;

    /**
     * Starts a session with a first question.
     * @param questions The questions to train.
     * @param pick Returns a random integer from 0 to the number given minus 1. Replaced in tests.
     */
    public constructor(questions: readonly TrainQuestion[], private readonly pick: (maxExclusive: number) => number = randomInt)
    {
        for (const question of questions)
        {
            if (!this.categoryOf.has(question.n))
            {
                this.categoryOf.set(question.n, question.k);
                this.piles.set(question.k, [...(this.piles.get(question.k) ?? []), question.n]);
                this.totals.set(question.k, (this.totals.get(question.k) ?? 0) + 1);
                this.boosts.set(question.k, 0);
            }
        }
        this.turn = this.draw();
    }

    /** The question that is up, or null when the session is over. */
    public get current(): TrainTurn | null
    {
        return this.turn;
    }

    /** Whether the question that is up was answered. */
    public get answered(): boolean
    {
        return this.right !== null;
    }

    /** Whether the question that is up was answered right. Null before an answer. */
    public get wasRight(): boolean | null
    {
        return this.right;
    }

    /** Whether every question is cleared. */
    public get done(): boolean
    {
        return this.remaining === 0;
    }

    /** How many questions there are. */
    public get total(): number
    {
        return this.categoryOf.size;
    }

    /** How many questions are not cleared yet. */
    public get remaining(): number
    {
        return [...this.piles.values()].reduce((sum, pile) => sum + pile.length, 0);
    }

    /** How many questions are cleared. */
    public get cleared(): number
    {
        return this.total - this.remaining;
    }

    /** How many answers were given. */
    public get answers(): number
    {
        return this.asked;
    }

    /** How many questions are waiting to come back after a wrong answer. */
    public get comingBack(): number
    {
        return this.waiting.length;
    }

    /** How many different questions were answered wrongly at least once. */
    public get missed(): number
    {
        return this.everMissed.size;
    }

    /** How many questions were answered right at the first try. */
    public get firstTry(): number
    {
        return this.answeredFirstTry;
    }

    /**
     * How many questions of a topic are not cleared.
     * @param category Topic id.
     */
    public remainingIn(category: string): number
    {
        return this.piles.get(category)?.length ?? 0;
    }

    /** Every topic with how far it is. */
    public topics(): TrainTopic[]
    {
        return [...this.totals.entries()].map(([id, total]) => ({
            id,
            total,
            cleared: total - this.remainingIn(id),
            boost: this.boosts.get(id) ?? 0,
        }));
    }

    /**
     * Takes the answer to the question that is up.
     * @param wasRight Whether it was right. A question given up counts as wrong.
     */
    public answer(wasRight: boolean): void
    {
        const turn = this.turn;
        if (!turn || this.right !== null)
        {
            return;
        }
        this.asked += 1;
        const boost = this.boosts.get(turn.category) ?? 0;
        if (wasRight)
        {
            this.piles.set(turn.category, (this.piles.get(turn.category) ?? []).filter((n) => n !== turn.n));
            this.boosts.set(turn.category, Math.max(0, boost - 1));
            if (!this.everMissed.has(turn.n))
            {
                this.answeredFirstTry += 1;
            }
        }
        else
        {
            this.everMissed.add(turn.n);
            this.boosts.set(turn.category, Math.min(TRAIN_BOOST_MAX, boost + 1));
            this.waiting.push({ n: turn.n, dueAt: this.asked + TRAIN_RETRY_GAP });
        }
        this.lastCategory = turn.category;
        this.right = wasRight;
    }

    /** Moves on to the next question. Nothing happens before the question that is up is answered. */
    public next(): void
    {
        if (this.turn && this.right === null)
        {
            return;
        }
        this.right = null;
        this.turn = this.draw();
    }

    /** Draws the next question: one that is due again first, otherwise a random question from a topic, heavier topics more often. */
    private draw(): TrainTurn | null
    {
        if (this.remaining === 0)
        {
            return null;
        }
        const due = this.waiting.filter((entry) => entry.dueAt <= this.asked).sort((first, second) => first.dueAt - second.dueAt)[0];
        if (due)
        {
            return this.take(due);
        }
        const waitingNumbers = new Set(this.waiting.map((entry) => entry.n));
        const open = [...this.piles.entries()]
            .map(([category, pile]) => ({ category, free: pile.filter((n) => !waitingNumbers.has(n)) }))
            .filter((entry) => entry.free.length > 0);
        if (open.length === 0)
        {
            // Everything that is left is waiting to come back: no point in waiting for it.
            return this.take([...this.waiting].sort((first, second) => first.dueAt - second.dueAt)[0]);
        }
        const others = open.filter((entry) => entry.category !== this.lastCategory);
        const choices = others.length > 0 ? others : open;
        const weights = choices.map((entry) => entry.free.length * (1 + (this.boosts.get(entry.category) ?? 0)));
        let point = this.pick(weights.reduce((sum, weight) => sum + weight, 0));
        let chosen = choices[choices.length - 1];
        for (let index = 0; index < choices.length; index++)
        {
            if (point < weights[index])
            {
                chosen = choices[index];
                break;
            }
            point -= weights[index];
        }
        const n = chosen.free[this.pick(chosen.free.length)];
        return { n, category: chosen.category, reason: (this.boosts.get(chosen.category) ?? 0) > 0 ? "category" : "fresh" };
    }

    /**
     * Takes a waiting question out of the line, to be asked again.
     * @param entry The waiting question.
     */
    private take(entry: Waiting): TrainTurn
    {
        this.waiting.splice(this.waiting.indexOf(entry), 1);
        return { n: entry.n, category: this.categoryOf.get(entry.n) as string, reason: "retry" };
    }
}
