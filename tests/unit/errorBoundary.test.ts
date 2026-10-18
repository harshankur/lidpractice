// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type AppExports } from "../helpers/appHarness";

describe("ErrorBoundary", () =>
{
    let app: AppExports;
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(async () =>
    {
        app = await mountApp();
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    describe("run", () =>
    {
        it("returns the action result when nothing throws", () =>
        {
            expect(app.ErrorBoundary.run(() => 42, 0)).toBe(42);
            expect(consoleError).not.toHaveBeenCalled();
        });

        it("returns the fallback and reports when the action throws an Error", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            const failure = new Error("boom");
            const result = app.ErrorBoundary.run(() =>
            {
                throw failure;
            }, "fallback");
            expect(result).toBe("fallback");
            expect(consoleError).toHaveBeenCalledWith(failure);
            expect(reporter).toHaveBeenCalledWith("boom", false);
        });

        it("reports non Error throwables as text", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            app.ErrorBoundary.run(() =>
            {
                throw "plain string";
            }, null);
            expect(reporter).toHaveBeenCalledWith("plain string", false);
        });
    });

    describe("report", () =>
    {
        it("logs the error and forwards the message to the reporter", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            app.ErrorBoundary.report(new TypeError("bad type"));
            expect(consoleError).toHaveBeenCalledTimes(1);
            expect(reporter).toHaveBeenCalledWith("bad type", false);
        });

        it("stringifies undefined and objects without throwing", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            app.ErrorBoundary.report(undefined);
            app.ErrorBoundary.report({ toString: () => "custom" });
            expect(reporter).toHaveBeenNthCalledWith(1, "undefined", false);
            expect(reporter).toHaveBeenNthCalledWith(2, "custom", false);
        });
    });

    describe("messages written for the user", () =>
    {
        it("passes a written message on as one, and logs only when the caller tells the user itself", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            expect(app.ErrorBoundary.run(() =>
            {
                throw new Error("raw");
            }, "fallback", "Said in words")).toBe("fallback");
            expect(reporter).toHaveBeenLastCalledWith("Said in words", true);
            app.ErrorBoundary.run(() =>
            {
                throw new Error("quiet");
            }, 0, null);
            expect(reporter).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledTimes(2);
        });
    });

    describe("install", () =>
    {
        it("routes window error events to the reporter, preferring event.error", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            window.dispatchEvent(new ErrorEvent("error", { error: new Error("from error"), message: "ignored" }));
            expect(reporter).toHaveBeenCalledWith("from error", false);
        });

        it("falls back to event.message when event.error is empty", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            window.dispatchEvent(new ErrorEvent("error", { message: "script failed" }));
            expect(reporter).toHaveBeenCalledWith("script failed", false);
        });

        it("routes unhandled promise rejections to the reporter", () =>
        {
            const reporter = vi.fn();
            app.ErrorBoundary.install(reporter);
            const event = new Event("unhandledrejection");
            Object.assign(event, { reason: new Error("rejected") });
            window.dispatchEvent(event);
            expect(reporter).toHaveBeenCalledWith("rejected", false);
        });
    });
});
