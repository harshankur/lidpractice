/** The size of a picture in pixels: width and height. */
export type ImageSize = [number, number];

/** The sizes of the pictures by address, as the build measured them. */
let sizes: Record<string, ImageSize> = {};

/**
 * Reads the sizes of the pictures from the page. A picture whose size is known gets its place in the layout before it is loaded, so nothing moves when it arrives.
 * @param node The element the build put the sizes in, or null.
 */
export function readImageSizes(node: HTMLElement | null): void
{
    sizes = JSON.parse(node?.textContent || "{}") as Record<string, ImageSize>;
}

/**
 * The attributes that reserve the room of a picture: its width and height, when they are known.
 * @param address Address of the picture, for example "images/q-021.webp".
 * @returns The attributes, or none.
 */
export function imageSizeAttributes(address: string): { width?: string; height?: string }
{
    const size = sizes[address];
    return size ? { width: String(size[0]), height: String(size[1]) } : {};
}
