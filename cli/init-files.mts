import { lstatSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
