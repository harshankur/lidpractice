/**
 * Single place where failures are caught and reported.
 * Use {@link ErrorBoundary.run} for anything that may throw (storage, JSON parsing).
 * Uncaught errors are routed here through global listeners.
 */
export class ErrorBoundary
{
    /** Receives a short message to show to the user, and whether it is one written for the user or the text of an error. */
    private static reporter: (message: string, known: boolean) => void = () => undefined;

    /**
     * Registers the function used to show errors, and installs global listeners.
     * @param reporter Called with a human readable message, and whether it was written for the user.
     */
    public static install(reporter: (message: string, known: boolean) => void): void
    {
        ErrorBoundary.reporter = reporter;
        window.addEventListener("error", (event) =>
        {
            ErrorBoundary.report(event.error ?? event.message);
        });
        window.addEventListener("unhandledrejection", (event) =>
        {
            ErrorBoundary.report(event.reason);
        });
    }

    /**
     * Runs a function and returns its result, or the fallback if it throws.
     * @param action The risky operation.
     * @param fallback Value returned when the action throws.
     * @param message What to tell the user instead of the message of the error, or null to tell nothing: the caller
     *        tells the user itself, in words that fit.
     * @returns The action result or the fallback.
     */
    public static run<T>(action: () => T, fallback: T, message?: string | null): T
    {
        try
        {
            return action();
        }
        catch (error)
        {
            ErrorBoundary.report(error, message);
            return fallback;
        }
    }

    /**
     * Runs an asynchronous function and returns its result, or the fallback if it fails.
     * @param action The risky operation, for example a request.
     * @param fallback Value returned when the action fails.
     * @param message What to tell the user instead of the message of the error, for a failure the user can understand.
     * @returns The action result or the fallback.
     */
    public static async runAsync<T>(action: () => Promise<T>, fallback: T, message?: string): Promise<T>
    {
        try
        {
            return await action();
        }
        catch (error)
        {
            ErrorBoundary.report(error, message);
            return fallback;
        }
    }

    /**
     * Logs an error and forwards a message to the reporter.
     * @param error Anything that was thrown.
     * @param message What to tell the user instead of the message of the error, or null to log it only.
     */
    public static report(error: unknown, message?: string | null): void
    {
        // The only place that writes to the console, so every failure is logged the same way.
        // eslint-disable-next-line no-console
        console.error(error);
        if (message !== null)
        {
            ErrorBoundary.reporter(message ?? (error instanceof Error ? error.message : String(error)), message !== undefined);
        }
    }
}
