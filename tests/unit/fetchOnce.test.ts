import { describe, expect, it } from "vitest";
import { FileError, FileFetcher } from "../../src/fetchOnce";

/**
 * A stand-in for the server that counts what it is asked for.
 * @param body What it answers with.
 * @param status The status of the answer.
 * @returns The stand-in and the addresses it was asked for.
 */
function server(body: unknown, status = 200): { fetch(address: string): Promise<Response>; asked: string[] }
{
    const asked: string[] = [];
    return {
        asked,
        fetch: async (address) =>
        {
            asked.push(address);
            return { ok: status === 200, status, json: async () => body } as unknown as Response;
        },
    };
}

describe("FileFetcher", () =>
{
    it("hands out what a file holds", async () =>
    {
        const files = server({ answer: 42 });
        await expect(new FileFetcher(files.fetch).get("teach/course.json")).resolves.toEqual({ answer: 42 });
        expect(files.asked).toEqual(["teach/course.json"]);
    });

    it("refuses a file the server does not have, and says which one and why", async () =>
    {
        const missing = new FileFetcher(server({}, 404).fetch).get("teach/maps.json");
        await expect(missing).rejects.toBeInstanceOf(FileError);
        await expect(missing).rejects.toThrow("teach/maps.json: 404");
    });

    it("runs a load once, however often it is asked for while it runs", async () =>
    {
        const fetcher = new FileFetcher(server({}).fetch);
        let runs = 0;
        const load = async (): Promise<string> =>
        {
            runs += 1;
            return "done";
        };
        const [first, second] = await Promise.all([fetcher.once("course", load), fetcher.once("course", load)]);
        expect([first, second]).toEqual(["done", "done"]);
        expect(runs).toBe(1);
    });

    it("keeps loads with different names apart", async () =>
    {
        const fetcher = new FileFetcher(server({}).fetch);
        const results = await Promise.all([fetcher.once("course", async () => "course"), fetcher.once("maps", async () => "maps")]);
        expect(results).toEqual(["course", "maps"]);
    });

    it("lets a load run again once it is over, whether it worked or failed", async () =>
    {
        const fetcher = new FileFetcher(server({}).fetch);
        let runs = 0;
        const failing = async (): Promise<string> =>
        {
            runs += 1;
            throw new FileError(String(runs));
        };
        await expect(fetcher.once("course", failing)).rejects.toThrow("1");
        await expect(fetcher.once("course", failing)).rejects.toThrow("2");
        await expect(fetcher.once("course", async () => "now")).resolves.toBe("now");
        await expect(fetcher.once("course", async () => "again")).resolves.toBe("again");
    });

    it("asks the browser when no other way to fetch is given", async () =>
    {
        const asked: string[] = [];
        const before = globalThis.fetch;
        globalThis.fetch = (async (address: string) =>
        {
            asked.push(address);
            return { ok: true, status: 200, json: async () => "from the browser" };
        }) as unknown as typeof fetch;
        const answer = await new FileFetcher().get("locales/teach.en.json");
        globalThis.fetch = before;
        expect(answer).toBe("from the browser");
        expect(asked).toEqual(["locales/teach.en.json"]);
    });
});
