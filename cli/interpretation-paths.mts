import { join, resolve } from 'node:path';
import { regular } from './init-files.mjs';

/** Explicit process configuration supports read-only source repositories. Never read this setting from source files. */
export function interpretationDirectory(root: string): string {
    const directory = process.env['LATTICE_INTERPRETATION_DIR'] ? resolve(process.env['LATTICE_INTERPRETATION_DIR']) : join(root, '.lattice');
    regular(directory, true);
    return directory;
}
