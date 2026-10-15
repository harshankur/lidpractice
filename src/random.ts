/** Size of the range of a 32 bit unsigned integer. */
const UINT32_RANGE = 0x100000000;

/**
 * Returns an unbiased random integer in the range 0 to maxExclusive minus 1.
 * Uses the browser crypto source with rejection sampling.
 * @param maxExclusive Upper bound, exclusive. Must be at least 1.
 * @returns Random integer.
 */
export function randomInt(maxExclusive: number): number
{
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    const buffer = new Uint32Array(1);
    let value: number;
    do
    {
        crypto.getRandomValues(buffer);
        value = buffer[0];
    }
    while (value >= limit);
    return value % maxExclusive;
}

/**
 * Returns a shuffled copy of an array (Fisher-Yates).
 * @param items Source array. It is not modified.
 * @returns New shuffled array.
 */
export function shuffled<T>(items: readonly T[]): T[]
{
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index--)
    {
        const swapIndex = randomInt(index + 1);
        const held = copy[index];
        copy[index] = copy[swapIndex];
        copy[swapIndex] = held;
    }
    return copy;
}

/**
 * Picks `count` distinct random items from an array.
 * @param items Source array.
 * @param count How many to pick.
 * @returns Array of picked items in random order.
 */
export function pickRandom<T>(items: readonly T[], count: number): T[]
{
    return shuffled(items).slice(0, count);
}
