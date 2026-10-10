import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

export function regular(path: string, directory = false): boolean {
    const status = lstatSync(path, { throwIfNoEntry: false });
    if (status && (status.isSymbolicLink() || (directory ? !status.isDirectory() : !status.isFile()))) throw new Error(`Init requires a regular ${directory ? 'directory' : 'file'}: ${path}`);
    return status !== undefined;
}
export function existingText(path: string, boundary: string): string {
    let parent = dirname(path);
    while (parent !== boundary && dirname(parent) !== parent) {
        regular(parent, true);
        parent = dirname(parent);
    }
    return regular(path) ? readFileSync(path, 'utf8') : '';
}
export interface ProjectDestination { readonly path: string; readonly validate: () => void; }
export function projectDestination(requested: string, root: string): ProjectDestination {
    const boundary = realpathSync(root);
    const inside = (path: string): boolean => {
        const part = relative(boundary, path);
        return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
    };
    if (!inside(requested)) throw new Error(`Init destination outside repository: ${requested}`);
    const identities = new Map<string, string>();
    const rootStatus = lstatSync(boundary);
    const resolve = (record: boolean): string => {
        const currentRoot = lstatSync(boundary);
        if (currentRoot.isSymbolicLink() || currentRoot.dev !== rootStatus.dev || currentRoot.ino !== rootStatus.ino) throw new Error(`Init repository changed after planning: ${boundary}`);
        let parent = boundary;
        for (const part of relative(boundary, dirname(requested)).split(sep).filter(Boolean)) {
            const entry = join(parent, part);
            const status = lstatSync(entry, { throwIfNoEntry: false });
            if (status) {
                const canonical = realpathSync(entry);
                if (!inside(canonical)) throw new Error(`Init destination outside repository: ${entry}`);
                regular(canonical, true);
                const target = lstatSync(canonical);
                const identity = `${status.dev}:${status.ino}:${canonical}:${target.dev}:${target.ino}`;
                if (record) identities.set(entry, identity);
                else if (identities.has(entry) && identities.get(entry) !== identity) throw new Error(`Init destination changed after planning: ${entry}`);
                parent = canonical;
            } else {
                if (!record && identities.has(entry)) throw new Error(`Init destination changed after planning: ${entry}`);
                parent = entry;
            }
        }
        const path = join(parent, basename(requested));
        regular(path);
        return path;
    };
    const path = resolve(true);
    return {
        path, validate: () => {
            if (resolve(false) !== path) throw new Error(`Init destination changed after planning: ${requested}`);
        }
    };
}
export function managed(text: string, name: string, body: string, markdown = false): string {
    const start = markdown ? `<!-- lattice:${name}:start -->` : `# lattice:${name}:start`;
    const end = markdown ? `<!-- lattice:${name}:end -->` : `# lattice:${name}:end`;
    for (const marker of [start, end]) {
        const index = text.indexOf(marker);
        if (index >= 0 && ((index > 0 && text[index - 1] !== '\n') || !['', '\n', '\r'].includes(text[index + marker.length] ?? ''))) throw new Error(`Lattice marker must occupy its own line: ${name}`);
    }
    const starts = text.split(start).length - 1;
    const ends = text.split(end).length - 1;
    if (starts !== ends || starts > 1 || (starts === 1 && text.indexOf(start) > text.indexOf(end))) throw new Error(`Malformed Lattice managed region: ${name}`);
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const block = `${start}\n${body.trim()}\n${end}`.replaceAll('\n', newline);
    return starts ? text.slice(0, text.indexOf(start)) + block + text.slice(text.indexOf(end) + end.length) : text + (text && !text.endsWith('\n') ? newline : '') + block + newline;
}
