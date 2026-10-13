/** JSON UTF-8 is at most three bytes per UTF-16 code unit; leave room for the page envelope. */
export function firstImpressionPages<T>(items: readonly T[], maximum: number): readonly (readonly T[])[] {
    const pages: T[][] = [];
    let page: T[] = [], characters = 0;
    for (const item of items) {
        const length = JSON.stringify(item).length + 1;
        if (page.length && (page.length >= maximum || characters + length > 60000)) { pages.push(page); page = []; characters = 0; }
        page.push(item); characters += length;
    }
    if (page.length) pages.push(page);
    return pages;
}
