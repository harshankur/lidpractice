// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserDevice, shareLink, type ShareDevice } from "../../src/share";

const LINK = "https://example.org/#learn/wuerde";

describe("handing a link over", () =>
{
    it("opens the share sheet on a device that is used by touch and has one", async () =>
    {
        const share = vi.fn(async () => undefined);
        const copy = vi.fn(async () => undefined);
        await expect(shareLink("Human dignity", LINK, { touch: true, share, copy })).resolves.toBe("shared");
        expect(share).toHaveBeenCalledWith({ title: "Human dignity", url: LINK });
        expect(copy).not.toHaveBeenCalled();
    });

    it("says nothing was done when the user closes the share sheet, and does not copy behind their back", async () =>
    {
        const copy = vi.fn(async () => undefined);
        const device: ShareDevice = { touch: true, share: async () => Promise.reject(new DOMException("closed", "AbortError")), copy };
        await expect(shareLink("Human dignity", LINK, device)).resolves.toBe("cancelled");
        expect(copy).not.toHaveBeenCalled();
    });

    it("copies the link on a device with a pointer, even when it has a share sheet: that is what a link button does there", async () =>
    {
        const share = vi.fn(async () => undefined);
        const copy = vi.fn(async () => undefined);
        await expect(shareLink("Human dignity", LINK, { touch: false, share, copy })).resolves.toBe("copied");
        expect(copy).toHaveBeenCalledWith(LINK);
        expect(share).not.toHaveBeenCalled();
    });

    it("copies the link on a touch device without a share sheet", async () =>
    {
        const copy = vi.fn(async () => undefined);
        await expect(shareLink("Human dignity", LINK, { touch: true, copy })).resolves.toBe("copied");
    });

    it("says so when the page may not copy, and when the device can do neither, and never rejects", async () =>
    {
        await expect(shareLink("Human dignity", LINK, { touch: false, copy: async () => Promise.reject(new Error("not allowed")) })).resolves.toBe("unavailable");
        await expect(shareLink("Human dignity", LINK, { touch: false })).resolves.toBe("unavailable");
        await expect(shareLink("Human dignity", LINK, { touch: true })).resolves.toBe("unavailable");
    });
});

describe("what the browser can do with a link", () =>
{
    afterEach(() =>
    {
        for (const name of ["share", "clipboard"])
        {
            delete (navigator as unknown as Record<string, unknown>)[name];
        }
        delete (window as unknown as Record<string, unknown>).matchMedia;
    });

    it("is nothing in a browser that has neither a share sheet nor a clipboard, and no pointer to ask about", () =>
    {
        const device = browserDevice();
        expect(device).toEqual({ touch: false });
    });

    it("is the share sheet and the clipboard of the browser where it has them, and touch where the pointer is coarse", async () =>
    {
        const shared: unknown[] = [];
        const copied: string[] = [];
        Object.defineProperty(navigator, "share", { configurable: true, value: async (data: unknown) =>
        {
            shared.push(data);
        } });
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) =>
        {
            copied.push(text);
        } } });
        Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: query === "(pointer: coarse)" }) });
        const device = browserDevice();
        expect(device.touch).toBe(true);
        await device.share?.({ title: "Human dignity", url: LINK });
        await device.copy?.(LINK);
        expect(shared).toEqual([{ title: "Human dignity", url: LINK }]);
        expect(copied).toEqual([LINK]);
        // With all of that, a link goes to the share sheet.
        await expect(shareLink("Human dignity", LINK)).resolves.toBe("shared");
    });

    it("is no touch device where the pointer is fine", () =>
    {
        Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
        expect(browserDevice().touch).toBe(false);
    });
});
