import type { NodeDraft } from "../core/model.js";
import type { SourceInput } from "./types.js";
import { validateSourceInput, makeSource } from "./types.js";
import { plain } from "./markdown-inline.js";
import { extractJson } from "./json.js";

export const packageDescriptionPath = (path: string): boolean => /(?:^|\/)(?:package\.json|pyproject\.toml|Cargo\.toml|pom\.xml|[^/]+\.(?:csproj|gemspec))$/u.test(path);

function literal(value: string): string | undefined {
    const trimmed = value.trim();
    if (/^"(?:[^"\\]|\\.)*"$/u.test(trimmed)) {
        try { const parsed: unknown = JSON.parse(trimmed); return typeof parsed === "string" ? parsed : undefined; }
        catch { return undefined; }
    }
    return /^'[^']*'$/u.test(trimmed) ? trimmed.slice(1, -1) : undefined;
}

function metadata(input: SourceInput): { text: string; offset: number; field: string; } | undefined {
    const file = input.path.split('/').at(-1) ?? '';
    if (file === 'package.json') {
        try {
            const parsed: unknown = JSON.parse(input.text);
            const description: unknown = parsed && typeof parsed === 'object' ? Reflect.get(parsed, 'description') : undefined;
            const source = extractJson(input).find(record => record.node.sources[0]?.pointer === '')?.fields['/description'];
            if (typeof description === 'string' && source) return { text: description, offset: input.text.split('\n').slice(0, source.line - 1).reduce((length, line) => length + line.length + 1, 0), field: 'description' };
        } catch { return undefined; }
    } else if (file === 'pyproject.toml' || file === 'Cargo.toml') {
        let section = '', offset = 0;
        for (const line of input.text.split(/\n/u)) {
            const heading = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
            if (heading) section = heading[1] ?? '';
            const match = /^\s*description\s*=\s*((?:"(?:[^"\\]|\\.)*"|'[^']*'))\s*(?:#.*)?$/u.exec(line);
            if (section === (file === 'pyproject.toml' ? 'project' : 'package') && match) {
                const text = literal(match[1] ?? '');
                if (text !== undefined) return { text, offset, field: `${section}.description` };
            }
            offset += line.length + 1;
        }
    } else if (file.endsWith('.gemspec')) {
        const match = /^\s*[A-Za-z_]\w*\.summary\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*$/mu.exec(input.text);
        const text = match ? literal(match[1] ?? '') : undefined;
        if (text !== undefined && !text.includes('#{')) return { text, offset: match?.index ?? 0, field: 'summary' };
    } else if (file === 'pom.xml' || file.endsWith('.csproj')) {
        const masked = input.text.replace(/<!--[\s\S]*?-->/gu, value => value.replace(/[^\n]/gu, ' '));
        const stack: string[] = [];
        const conditions: boolean[] = [];
        for (const match of masked.matchAll(/<(\/?)([\w:.-]+)\b([^>]*)>/gu)) {
            const name = match[2]?.split(':').at(-1) ?? '';
            if (match[1]) { stack.pop(); conditions.pop(); continue; }
            const wanted = file === 'pom.xml' ? name === 'description' && stack.join('/') === 'project' : ['Description', 'PackageDescription'].includes(name) && stack.join('/') === 'Project/PropertyGroup';
            const conditional = /\bCondition\s*=/u.test(match[3] ?? '');
            if (wanted && !conditional && !conditions.some(Boolean)) {
                const start = (match.index ?? 0) + match[0].length;
                const end = masked.indexOf('</', start);
                const body = masked.slice(start, end);
                if (end >= start && !body.includes('<') && !/\$[({]|&(?!(?:amp|lt|gt|quot|apos);)/u.test(body)) {
                    const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
                    return { text: body.replace(/&(amp|lt|gt|quot|apos);/gu, (_, entity: string) => entities[entity] ?? ''), offset: match.index ?? 0, field: name };
                }
            }
            if (!match[0].endsWith('/>')) { stack.push(name); conditions.push(conditional); }
        }
    }
    return undefined;
}

/** Declarative package prose is repository metadata, never a folder-role description. */
export function extractPackageDescription(input: SourceInput): NodeDraft | undefined {
    validateSourceInput(input);
    if (!packageDescriptionPath(input.path)) return undefined;
    const value = metadata(input);
    if (!value) return undefined;
    const text = plain(value.text).replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim().split(/(?<=[.!?。])\s/u)[0]?.slice(0, 320);
    if (!text) return undefined;
    const line = input.text.slice(0, value.offset).split('\n').length;
    return { id: `package-description:${input.path}`, kind: 'document', name: input.path, attributes: { sourceDescription: { text, kind: 'package-metadata', line, endLine: line, field: value.field } }, sources: [makeSource(input, `/package-description/${value.field}`, line)] };
}
