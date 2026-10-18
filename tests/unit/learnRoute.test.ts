import { describe, expect, it } from "vitest";
import { LEARN_ROOT, RESERVED_NAMES, SECTION_NAME, pageHash, parseRoute, routeHash, stateFreeHash, type LearnRoute } from "../../src/learn/route";

/** Every kind of place, with its address. */
const PLACES: [LearnRoute, string][] = [
    [{ page: "home" }, "#learn"],
    [{ page: "timeline" }, "#learn/timeline"],
    [{ page: "maps" }, "#learn/maps"],
    [{ page: "lesson", lesson: "wuerde" }, "#learn/wuerde"],
    [{ page: "lesson", lesson: "land-baden-wuerttemberg" }, "#learn/land-baden-wuerttemberg"],
    [{ page: "lesson", lesson: "gewalten", section: "legislative" }, "#learn/gewalten/legislative"],
    [{ page: "lesson", lesson: "gewalten", section: "check" }, "#learn/gewalten/check"],
];

describe("the addresses of the Learn tab", () =>
{
    it.each(PLACES)("write %j as %s, and read it back", (route, hash) =>
    {
        expect(routeHash(route)).toBe(hash);
        expect(parseRoute(hash)).toEqual(route);
    });

    it("start with one word, and keep two names for pages that are no lessons", () =>
    {
        expect(LEARN_ROOT).toBe("learn");
        expect(RESERVED_NAMES).toEqual(["timeline", "maps"]);
    });

    it("are read as typed by hand: with capitals, and with a slash too many", () =>
    {
        expect(parseRoute("#Learn")).toEqual({ page: "home" });
        expect(parseRoute("#learn/Wuerde")).toEqual({ page: "lesson", lesson: "wuerde" });
        expect(parseRoute("#LEARN/GEWALTEN/LEGISLATIVE")).toEqual({ page: "lesson", lesson: "gewalten", section: "legislative" });
        expect(parseRoute("#learn//wuerde")).toEqual({ page: "lesson", lesson: "wuerde" });
        expect(parseRoute("#learn/wuerde//")).toEqual({ page: "lesson", lesson: "wuerde" });
    });

    it("are read with or without the sign in front, and with a slash at the end", () =>
    {
        expect(parseRoute("learn/wuerde")).toEqual({ page: "lesson", lesson: "wuerde" });
        expect(parseRoute("#learn/")).toEqual({ page: "home" });
        expect(parseRoute("#learn/wuerde/")).toEqual({ page: "lesson", lesson: "wuerde" });
        expect(parseRoute("#learn/gewalten/legislative/")).toEqual({ page: "lesson", lesson: "gewalten", section: "legislative" });
    });

    it("are no address of the tab when they start with anything else: the other tabs have names of their own", () =>
    {
        for (const hash of ["", "#", "#practice", "#learner", "#learning/wuerde", "#exam/learn", "# learn"])
        {
            expect(parseRoute(hash), hash).toBeNull();
        }
    });

    it("lead to the list of lessons when they name something that cannot exist", () =>
    {
        for (const hash of ["#learn/wuerde/Artikel 1", "#learn/a/b/c", "#learn/-wuerde", "#learn/wuerde-", "#learn/w%C3%BCrde", "#learn/timeline/1933", "#learn/maps/states", "#learn/<script>"])
        {
            expect(parseRoute(hash), hash).toEqual({ page: "home" });
        }
    });

    it("give the address of the page a section belongs to", () =>
    {
        expect(pageHash("#learn/gewalten/legislative")).toBe("#learn/gewalten");
        expect(pageHash("#learn/gewalten")).toBe("#learn/gewalten");
        expect(pageHash("#learn/timeline")).toBe("#learn/timeline");
        expect(pageHash("#learn")).toBe("#learn");
        expect(pageHash("#learn/nothing here")).toBe("#learn");
        // An address of another tab belongs to no page of this one.
        expect(pageHash("")).toBe("");
        expect(pageHash("#practice")).toBe("");
    });

    it("say what the name of a section may be, as it is saved: plain lower case letters, digits and hyphens, or nothing for the top", () =>
    {
        for (const name of ["", "check", "artikel-1", "falle-reich"])
        {
            expect(SECTION_NAME.test(name), name).toBe(true);
        }
        for (const name of ["Artikel", "a b", "a\"]", "ä", "a/b", "a.b"])
        {
            expect(SECTION_NAME.test(name), name).toBe(false);
        }
    });
});

describe("the address the page keeps for a link to the lesson about a state", () =>
{
    it.each([
        ["#learn/land-bayern", "#learn/land"],
        ["#learn/land-schleswig-holstein/wappen", "#learn/land/wappen"],
        ["#LEARN/Land-Hessen", "#learn/land"],
    ])("takes the state out of %s, with nothing of the course", (hash, kept) =>
    {
        expect(stateFreeHash(hash)).toBe(kept);
    });

    it.each(["", "#practice", "#learn", "#learn/land", "#learn/land/wappen", "#learn/wuerde/artikel-1", "#learn/land-atlantis", "#learn/timeline"])("leaves %s as it is: it names no state", (hash) =>
    {
        expect(stateFreeHash(hash)).toBe(hash);
    });
});
