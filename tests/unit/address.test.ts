import { describe, expect, it } from "vitest";
import { START_MODE, modeHash, pageOf, placeOf } from "../../src/address";
import { MODES } from "../../src/types";

describe("the addresses of the tabs", () =>
{
    it("are the names of the tabs, one for every tab of the row", () =>
    {
        expect(MODES).toEqual(["learn", "practice", "train", "exam"]);
        expect(MODES.map((mode) => modeHash(mode))).toEqual(["#learn", "#practice", "#train", "#exam"]);
    });

    it.each(MODES.filter((mode) => mode !== "learn"))("read %s back as a tab with one page", (mode) =>
    {
        expect(placeOf(modeHash(mode))).toEqual({ mode, route: null });
        // The sign in front is not needed, and a slash at the end names nothing more.
        expect(placeOf(mode)).toEqual({ mode, route: null });
        expect(placeOf(`#${mode}/`)).toEqual({ mode, route: null });
    });

    it("read the Learn tab with its page", () =>
    {
        expect(placeOf("#learn")).toEqual({ mode: "learn", route: { page: "home" } });
        expect(placeOf("#learn/timeline")).toEqual({ mode: "learn", route: { page: "timeline" } });
        expect(placeOf("#learn/wuerde/artikel-1")).toEqual({ mode: "learn", route: { page: "lesson", lesson: "wuerde", section: "artikel-1" } });
        expect(placeOf("#learn/Nothing here")).toEqual({ mode: "learn", route: { page: "home" } });
    });

    it("stand for the tab the page opens with when they name no tab: practice", () =>
    {
        expect(START_MODE).toBe("practice");
        for (const hash of ["", "#", "#somewhere", "#Train", "#training", "#exams", "# exam", "#/train", "#1", "#toString", "#constructor"])
        {
            expect(placeOf(hash), hash).toEqual({ mode: "practice", route: null });
        }
    });

    it("let the first name decide: what follows the name of a tab that has one page is not looked at", () =>
    {
        expect(placeOf("#train/anything")).toEqual({ mode: "train", route: null });
        expect(placeOf("#exam/12/x")).toEqual({ mode: "exam", route: null });
        expect(placeOf("#practice/learn")).toEqual({ mode: "practice", route: null });
    });

    it("give the address of the page an address belongs to, as the page writes it", () =>
    {
        expect(pageOf("#train")).toBe("#train");
        expect(pageOf("#train/anything")).toBe("#train");
        expect(pageOf("#exam/")).toBe("#exam");
        expect(pageOf("#practice")).toBe("#practice");
        // The plain address of the site, and one that names nothing, belong to the tab the page opens with.
        expect(pageOf("")).toBe("#practice");
        expect(pageOf("#somewhere")).toBe("#practice");
        // A section of a lesson belongs to the page of its lesson.
        expect(pageOf("#learn")).toBe("#learn");
        expect(pageOf("#learn/gewalten/legislative")).toBe("#learn/gewalten");
        expect(pageOf("#learn/timeline")).toBe("#learn/timeline");
        expect(pageOf("#learn/Nothing here")).toBe("#learn");
    });
});
