import type { Source } from "../core/model.js";
import type { SourceInput } from "./types.js";
import { makeSource, validateSourceInput } from "./types.js";
import { csharpTokens } from "./csharp-tokens.js";
import type { CSharpToken } from "./csharp-tokens.js";

export type CodeSelector = { readonly kind: "switch-case"; readonly within: string; readonly expression: string; } | { readonly kind: "call-argument"; readonly within: string; readonly callee: string; readonly argumentIndex: number; };
export type CodeSurface = {
    readonly selectors: readonly { readonly selector: number; readonly status: "complete" | "unknown"; readonly sources: readonly Source[]; readonly diagnostics: readonly string[]; }[];
    readonly matches: readonly { readonly value: string; readonly selector: number; readonly source: Source; }[];
};
type Method = { readonly name: string; readonly start: number; readonly end: number; readonly parsed: boolean; };
type Program = { readonly input: SourceInput; readonly tokens: readonly CSharpToken[]; readonly pairs: ReadonlyMap<number, number>; readonly parents: ReadonlyMap<number, number>; readonly methods: readonly Method[]; readonly diagnostics: readonly string[]; readonly blocked: boolean; };
const controls = new Set(["if", "for", "foreach", "while", "switch", "catch", "lock", "using", "fixed"]);
function program(input: SourceInput): Program {
    validateSourceInput(input);
    const lexed = csharpTokens(input.text), tokens = lexed.tokens;
    const pairs = new Map<number, number>(), parents = new Map<number, number>(), stack: number[] = [], braces: number[] = [], diagnostics = [...lexed.diagnostics];
    const opening: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };
    tokens.forEach((token, index) => {
        const parent = braces.at(-1); if (parent !== undefined) parents.set(index, parent);
        if (token.kind !== "symbol") return;
        if (["(", "[", "{"].includes(token.value)) { stack.push(index); if (token.value === "{") braces.push(index); }
        else if (opening[token.value]) {
            const start = stack.pop();
            if (start === undefined || tokens[start]?.value !== opening[token.value]) diagnostics.push(`Unbalanced delimiter at line ${token.line}`);
            else { pairs.set(start, index); pairs.set(index, start); }
            if (token.value === "}") braces.pop();
        }
    });
    if (stack.length) diagnostics.push("Unclosed delimiter");
    const types = new Set<number>();
    tokens.forEach((token, index) => {
        if (token.value !== "{" || token.kind !== "symbol") return;
        for (let before = index - 1; before >= 0; before--) {
            const value = tokens[before]?.value;
            if (value === ";" || value === "{" || value === "}") break;
            if (tokens[before]?.kind === "word" && ["class", "struct", "interface", "record"].includes(value ?? "")) { types.add(index); break; }
        }
    });
    const methods: Method[] = [];
    tokens.forEach((token, index) => {
        const parent = parents.get(index), close = pairs.get(index + 1);
        if (token.kind !== "word" || tokens[index + 1]?.value !== "(" || close === undefined || parent === undefined || !types.has(parent)) return;
        if ([".", "new", "=", "return"].includes(tokens[index - 1]?.value ?? "")) return;
        const end = pairs.get(close + 1);
        if (tokens[close + 1]?.value === "{" && end !== undefined) methods.push({ name: token.value, start: close + 1, end, parsed: true });
        else methods.push({ name: token.value, start: index, end: close, parsed: false });
    });
    return { input, tokens, pairs, parents, methods, diagnostics, blocked: lexed.preprocessor || diagnostics.some(item => !item.startsWith("Raw string syntax")) };
}
function nestedFunction(code: Program, brace: number): boolean {
    const { tokens, pairs } = code;
    if (tokens[brace - 1]?.value === "=>" || tokens[brace - 1]?.value === "delegate") return true;
    if (tokens[brace - 1]?.value !== ")") return false;
    const open = pairs.get(brace - 1);
    if (open === undefined) return true;
    const head = tokens[open - 1];
    return head?.kind === "word" && !controls.has(head.value);
}
function owned(code: Program, method: Method, index: number): boolean {
    let parent = code.parents.get(index);
    while (parent !== undefined && parent !== method.start) {
        if (nestedFunction(code, parent)) return false;
        parent = code.parents.get(parent);
    }
    return parent === method.start;
}
function executable(code: Program, start: number, end: number): boolean | undefined {
    for (let index = start; index < end; index++) {
        const token = code.tokens[index];
        if (token?.kind !== "symbol") continue;
        if (token.value === "{" && nestedFunction(code, index)) return undefined;
        if (token.value === "=>" && code.tokens[index - 1]?.value === ")") {
            const open = code.pairs.get(index - 1);
            if (open !== undefined && code.tokens[open - 1]?.kind === "word") return undefined;
        }
    }
    return code.tokens.slice(start, end).some(token => token.kind !== "unsupported" && !["{", "}", ";", "break", "continue"].includes(token.value));
}
function source(code: Program, start: number, end: number): Source {
    return makeSource(code.input, `/code/${start}`, code.tokens[start]?.line ?? 1, code.tokens[end]?.endLine ?? code.tokens[start]?.endLine ?? 1);
}
function matchesFor(code: Program, method: Method, selector: CodeSelector): { readonly matches: readonly { readonly value: string; readonly source: Source; }[]; readonly complete: boolean; readonly found: boolean; } {
    const { tokens, pairs, parents } = code;
    const matches: { value: string; source: Source; }[] = [];
    let found = false, complete = true;
    for (let index = method.start + 1; index < method.end; index++) {
        if (!owned(code, method, index)) continue;
        if (selector.kind === "switch-case" && tokens[index]?.kind === "word" && tokens[index]?.value === "switch" && tokens[index + 1]?.value === "(") {
            const close = pairs.get(index + 1);
            if (close === undefined) { complete = false; continue; }
            const expression = tokens.slice(index + 2, close).map(token => [token.kind, token.value]);
            const expected = csharpTokens(selector.expression).tokens.map(token => [token.kind, token.value]);
            if (JSON.stringify(expression) !== JSON.stringify(expected)) continue;
            const body = close + 1, end = pairs.get(body);
            if (tokens[body]?.value !== "{" || end === undefined) { complete = false; continue; }
            found = true;
            let labels: { value: string; start: number; }[] = [], bodyStart = body + 1;
            const flush = (stop: number): void => {
                const bodyTokens = tokens.slice(bodyStart, stop);
                const activity = executable(code, bodyStart, stop);
                if (activity === undefined) { complete = false; labels = []; }
                else if (activity) { for (const label of labels) matches.push({ value: label.value, source: source(code, label.start, stop - 1) }); labels = []; }
                else if (bodyTokens.some(token => token.value === "break" || token.value === "continue")) labels = [];
            };
            for (let item = body + 1; item <= end; item++) {
                if (item !== end && (parents.get(item) !== body || tokens[item]?.kind !== "word" || !["case", "default"].includes(tokens[item]?.value ?? ""))) continue;
                flush(item);
                if (item === end) break;
                if (tokens[item]?.value === "default" && tokens[item + 1]?.value === ":") { labels = []; bodyStart = item + 2; continue; }
                const value = tokens[item + 1];
                if (value?.kind !== "string" || tokens[item + 2]?.value !== ":") { complete = false; labels = []; bodyStart = item + 1; continue; }
                labels.push({ value: value.value, start: item }); bodyStart = item + 3;
            }
        }
        if (selector.kind === "call-argument" && tokens[index]?.kind === "word" && tokens[index]?.value === "foreach" && tokens[index + 1]?.value === "(") {
            const close = pairs.get(index + 1);
            if (close === undefined) { complete = false; continue; }
            let inside = index + 2;
            while (inside < close && !(tokens[inside]?.kind === "word" && tokens[inside]?.value === "in")) inside++;
            const callStart = inside + 1;
            let callOpen = callStart;
            while (callOpen < close && tokens[callOpen]?.value !== "(") callOpen++;
            const callee = tokens.slice(callStart, callOpen).map(token => [token.kind, token.value]);
            if (JSON.stringify(callee) !== JSON.stringify(csharpTokens(selector.callee).tokens.map(token => [token.kind, token.value]))) continue;
            found = true;
            const callEnd = pairs.get(callOpen), body = close + 1, end = pairs.get(body);
            if (callEnd !== close - 1 || tokens[body]?.value !== "{" || end === undefined) { complete = false; continue; }
            const argumentsList: CSharpToken[][] = [[]];
            for (let item = callOpen + 1; item < callEnd; item++) {
                const token = tokens[item]; if (!token) continue;
                if (token.kind === "symbol" && token.value === ",") argumentsList.push([]);
                else {
                    argumentsList.at(-1)?.push(token);
                    const nestedEnd = pairs.get(item);
                    if (nestedEnd !== undefined && nestedEnd > item) { argumentsList.at(-1)?.push(...tokens.slice(item + 1, nestedEnd + 1)); item = nestedEnd; }
                }
            }
            const argument = argumentsList[selector.argumentIndex];
            if (!argument || argument.length !== 1 || argument[0]?.kind !== "string") { complete = false; continue; }
            const activity = executable(code, body + 1, end);
            if (activity === undefined) complete = false;
            else if (activity) matches.push({ value: argument[0].value, source: source(code, callStart, end) });
        }
    }
    return { matches, complete, found };
}
export function inspectCodeSurface(inputs: readonly SourceInput[], selectors: readonly CodeSelector[]): CodeSurface {
    const programs = inputs.map(program), matches: { value: string; selector: number; source: Source; }[] = [];
    const results = selectors.map((selector, index) => {
        const candidates = programs.flatMap(code => code.methods.filter(method => method.name === selector.within).map(method => ({ code, method })));
        const diagnostics = programs.flatMap(code => code.blocked ? code.diagnostics.map(message => `${code.input.path}: ${message}`) : []);
        const sources = candidates.map(({ code, method }) => source(code, method.start, method.end));
        const candidate = candidates[0];
        if (candidates.length !== 1 || !candidate || candidate.code.blocked) {
            diagnostics.push(`Method ${selector.within}: ${candidates.length === 0 ? "missing" : candidates.length > 1 ? "ambiguous" : "incomplete source coverage"}`);
            return { selector: index, status: "unknown" as const, sources, diagnostics };
        }
        if (!candidate.method.parsed) return { selector: index, status: "unknown" as const, sources, diagnostics: [`Unsupported method body ${selector.within}`] };
        const result = matchesFor(candidate.code, candidate.method, selector);
        matches.push(...result.matches.map(match => ({ ...match, selector: index })));
        if (!result.found) diagnostics.push(`Selector surface not found in ${selector.within}`);
        if (!result.complete) diagnostics.push(`Unsupported syntax in ${selector.within}`);
        return { selector: index, status: result.found && result.complete && !programs.some(code => code.blocked) ? "complete" as const : "unknown" as const, sources, diagnostics };
    });
    return { selectors: results, matches };
}
