/** A file of this site that is missing, or is not the file that was asked for. */
export class FileError extends Error
{
}

/**
 * Fetches JSON files of this site, each load only once however often it is asked for.
 * Shared by everything that loads on demand: the languages and the course of the Learn tab.
 */
export class FileFetcher
{
    private readonly pending = new Map<string, Promise<unknown>>();

    /**
     * @param fetcher How a file is fetched. Replaced in tests.
     */
    public constructor(private readonly fetcher: (address: string) => Promise<Response> = (address) => fetch(address))
    {
    }

    /**
     * Runs a load once, however often it is asked for while it runs. A failed load can be asked for again.
     * @param key What is loaded.
     * @param load The load.
     * @returns The load that is under way.
     */
    public once<T>(key: string, load: () => Promise<T>): Promise<T>
    {
        const running = this.pending.get(key);
        if (running)
        {
            return running as Promise<T>;
        }
        const started = load().finally(() => this.pending.delete(key));
        this.pending.set(key, started);
        return started;
    }

    /**
     * Fetches a JSON file of this site.
     * @param address Its address.
     * @returns What it holds.
     */
    public async get(address: string): Promise<unknown>
    {
        const response = await this.fetcher(address);
        if (!response.ok)
        {
            throw new FileError(`${address}: ${response.status}`);
        }
        return response.json();
    }
}
