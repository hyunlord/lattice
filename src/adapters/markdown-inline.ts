type Destination = { readonly target: string; readonly end: number; };

function unescape(text: string): string {
    return text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/gu, "$1");
}
export function label(text: string): string {
    return unescape(text).trim().replace(/\s+/gu, " ").toLowerCase();
}
function tickMatches(text: string): ReadonlyMap<number, { readonly close: number; readonly end: number; }> {
    const runs: { start: number; end: number; }[] = [];
    for (let offset = 0; offset < text.length; offset++) {
        if (text[offset] !== "`") continue;
        const start = offset;
        while (text[offset] === "`") offset++;
        runs.push({ start, end: offset });
        offset--;
    }
    const next = new Map<number, { start: number; end: number; }>();
    const matches = new Map<number, { close: number; end: number; }>();
    for (let index = runs.length - 1; index >= 0; index--) {
        const run = runs[index];
        if (run === undefined) continue;
        const width = run.end - run.start;
        const closing = next.get(width);
        if (closing !== undefined) matches.set(run.start, { close: closing.start, end: closing.end });
        next.set(width, run);
    }
    return matches;
}
export function plain(text: string): string {
    const matches = tickMatches(text);
    const strip = (part: string): string => unescape(part.replace(/!?(\[([^\]]*)\])\([^)]*\)/gu, "$2")
        .replace(/<[^>]*>/gu, "").replace(/(?<![\p{L}\p{N}])([*_]{1,2}|~~)(.+?)\1(?![\p{L}\p{N}])/gu, "$2"));
    let result = "";
    let start = 0;
    for (let offset = 0; offset < text.length; offset++) {
        if (text[offset] === "\\") { offset++; continue; }
        const match = matches.get(offset);
        if (match === undefined) continue;
        let end = offset;
        while (text[end] === "`") end++;
        result += strip(text.slice(start, offset)) + text.slice(end, match.close);
        start = match.end;
        offset = match.end - 1;
    }
    return (result + strip(text.slice(start))).trim();
}
export function maskCode(text: string): string {
    const matches = tickMatches(text);
    let result = "";
    let start = 0;
    for (let offset = 0; offset < text.length; offset++) {
        if (text[offset] === "\\") { offset++; continue; }
        const match = matches.get(offset);
        if (match === undefined) continue;
        result += text.slice(start, offset) + text.slice(offset, match.end).replace(/[^\n]/gu, " ");
        start = match.end;
        offset = match.end - 1;
    }
    return result + text.slice(start);
}
export function bracketMatches(text: string): ReadonlyMap<number, number> {
    const stack: number[] = [];
    const matches = new Map<number, number>();
    for (let index = 0; index < text.length; index++) {
        if (text[index] === "\\") index++;
        else if (text[index] === "[") stack.push(index);
        else if (text[index] === "]") {
            const opening = stack.pop();
            if (opening !== undefined) matches.set(opening, index);
        }
    }
    return matches;
}
export function destination(text: string, start: number): Destination | undefined {
    let offset = start;
    while (/\s/u.test(text[offset] ?? "") && offset < text.length) offset++;
    if (text[offset] === "<") {
        const beginning = ++offset;
        while (offset < text.length) {
            if (text[offset] === "\\") offset += 2;
            else if (text[offset] === ">") return { target: unescape(text.slice(beginning, offset)), end: offset + 1 };
            else if (text[offset] === "<") return undefined;
            else offset++;
        }
        return undefined;
    }
    const beginning = offset;
    let depth = 0;
    while (offset < text.length) {
        const character = text[offset];
        if (character === "\\" && offset + 1 < text.length) offset += 2;
        else if (character === "(") { depth++; offset++; }
        else if (character === ")") {
            if (depth === 0) break;
            depth--; offset++;
        } else if (/\s/u.test(character ?? "")) break;
        else offset++;
    }
    if (depth !== 0) return undefined;
    return { target: unescape(text.slice(beginning, offset)), end: offset };
}
export function inlineEnd(text: string, start: number): number | undefined {
    let offset = start;
    while (/\s/u.test(text[offset] ?? "") && offset < text.length) offset++;
    if (text[offset] === ")") return offset + 1;
    const quote = text[offset];
    if (quote !== '"' && quote !== "'" && quote !== "(") return undefined;
    const close = quote === "(" ? ")" : quote;
    offset++;
    while (offset < text.length && text[offset] !== close) {
        if (text[offset] === "\\") offset++;
        offset++;
    }
    if (text[offset++] !== close) return undefined;
    while (/\s/u.test(text[offset] ?? "") && offset < text.length) offset++;
    return text[offset] === ")" ? offset + 1 : undefined;
}
