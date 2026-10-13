import { object, type Options } from './types.mjs';
import { createHash } from 'node:crypto';
import type { observeRepository } from './observation.mjs';

export interface ObservationSummary {
    readonly fingerprint: string;
    readonly checkedInputs: number;
    readonly observationMode: 'metadata-witness' | 'content-hash';
}
export function observationSummary(observed: ReturnType<typeof observeRepository>): ObservationSummary {
    return { fingerprint: observed.fingerprint, checkedInputs: observed.selected.length + observed.codeInputs.length, observationMode: observed.repository.observationMode ?? 'content-hash' };
}
export function validSummary(value: unknown): value is ObservationSummary {
    return object(value) && Object.keys(value).length === 3 && typeof value['fingerprint'] === 'string' && /^[a-f0-9]{64}$/u.test(value['fingerprint'])
        && typeof value['checkedInputs'] === 'number' && Number.isSafeInteger(value['checkedInputs']) && value['checkedInputs'] >= 0
        && (value['observationMode'] === 'content-hash' || value['observationMode'] === 'metadata-witness');
}
export function observationContext(options: Options) {
    const snapshot = { ...options }, environment = { ...process.env };
    const settings = [options.root, options.lens, options.cacheDir, options.output, options.port, options.viewerUrl, options.json, options.noGlobal, options.noLens, options.force];
    const key = createHash('sha256').update(JSON.stringify([settings, process.cwd(), Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))])).digest('hex');
    return { options: snapshot, environment, key };
}
export const observationContextKey = (options: Options): string => observationContext(options).key;
export interface ObserveRequest { readonly type: 'observe'; readonly id: number; readonly generation: number; }
export interface ObserverStart { readonly options: Options; readonly generation: number; readonly environment: Readonly<NodeJS.ProcessEnv>; }
