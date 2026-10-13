import { canonicalJson } from '../dist/index.js';
import type { SourceInput } from '../dist/index.js';
import { digest } from './storage.mjs';

type EncodedInputs = { readonly canonical: string; };
type InputWitness = { readonly input: SourceInput; readonly path: string; readonly contentHash: string; };

// This caches derived bytes only; the observation reader still verifies every input.
export class InputDigestList {
    private previous: { readonly witnesses: readonly InputWitness[]; readonly encoded: EncodedInputs; } | undefined;
    encode(inputs: readonly SourceInput[]): EncodedInputs {
        const previous = this.previous;
        if (previous && previous.witnesses.length === inputs.length && inputs.every((input, index) => {
            const witness = previous.witnesses[index];
            return witness?.input === input && witness.path === input.path && witness.contentHash === input.contentHash;
        })) return previous.encoded;
        const witnesses = inputs.map(input => ({ input, path: input.path, contentHash: input.contentHash }));
        const encoded = Object.freeze({ canonical: canonicalJson(witnesses.map(({ path, contentHash }) => ({ path, contentHash }))) });
        this.previous = { witnesses, encoded };
        return encoded;
    }
}

export function observationFingerprint(fields: Readonly<Record<string, unknown>>, inputs: EncodedInputs, codeInputs?: EncodedInputs): string {
    const values = new Map(Object.entries(fields).map(([key, value]) => [key, canonicalJson(value)]));
    values.set('inputs', inputs.canonical);
    if (codeInputs) values.set('codeInputs', codeInputs.canonical);
    return digest.stream(write => {
        write('{');
        let separator = '';
        for (const key of [...values.keys()].sort()) {
            write(separator); write(canonicalJson(key)); write(':'); write(values.get(key) ?? 'null');
            separator = ',';
        }
        write('}');
    });
}
