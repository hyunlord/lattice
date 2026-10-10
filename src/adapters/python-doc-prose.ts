/** Keep the first prose paragraph; executable examples are not a role description. */
export function pythonDocProse(lines: readonly string[]): { text: string; start: number; end: number; } | undefined {
    const code = (line: string): boolean => /^(?:>>>|\.\.\.|assert\b|(?:from|import|return|raise|print|pass)\b|(?:async\s+)?(?:def|class|for|while|if|with|try)\b|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]]*\])*\s*(?::[^=]+)?=(?!=)|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\(|https?:\/\/|[\[{}\d])/u.test(line);
    let index = 0;
    while (index < lines.length) {
        while (index < lines.length && !lines[index]?.trim()) index++;
        const start = index, paragraph: string[] = [];
        while (index < lines.length && lines[index]?.trim()) paragraph.push(lines[index++] ?? '');
        const first = paragraph[0]?.trim() ?? '';
        if (!first || /^(?:examples?|usage|parameters|arguments|returns|raises|attributes)\s*:$/iu.test(first) || paragraph.some(line => code(line.trim()))) continue;
        if (/[\p{L}]/u.test(first)) return { text: paragraph.join('\n'), start, end: index - 1 };
    }
    return undefined;
}
