import { describe, expect, it } from "vitest";
import { sameTopics } from "../../src/topics";

describe("comparing two choices of subjects", () =>
{
    it("is the same choice whatever the order", () =>
    {
        expect(sameTopics(["a", "b"], ["b", "a"])).toBe(true);
        expect(sameTopics([], [])).toBe(true);
        expect(sameTopics(["a"], ["b"])).toBe(false);
        expect(sameTopics(["a"], ["a", "b"])).toBe(false);
    });

    it("counts a subject named twice once, so two lists of the same length are not taken for the same choice", () =>
    {
        expect(sameTopics(["a", "a"], ["a", "b"])).toBe(false);
        expect(sameTopics(["a", "b"], ["a", "a"])).toBe(false);
        expect(sameTopics(["a", "a", "b"], ["b", "a"])).toBe(true);
    });
});
