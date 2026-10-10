import { spawn } from 'node:child_process';
import type { Graph } from '../dist/core/model.js';
import { InterpretationError, interpretationTargets } from '../dist/interpretation/model.js';
import { readInterpretations, writeInterpretation } from './interpretation.mjs';
import { workingRepository } from './repository.mjs';

/** The caller explicitly supplies argv; repository data is never executed as a command. */
export async function runInterpretationCommand(root: string, graph: Graph, command: readonly string[], keyEnvironmentVariable: string) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(keyEnvironmentVariable)) throw new InterpretationError('Invalid API-key environment variable');
    if (!process.env[keyEnvironmentVariable]) return { skipped: 'API key absent', updated: 0 };
    const [executable, ...args] = command;
    if (!executable) throw new InterpretationError('An explicit summary command is required');
    const current = new Map(readInterpretations(root, graph).map(note => [note.targetId, note]));
    const pending = interpretationTargets(graph).filter(target => current.get(target.id)?.status !== 'fresh');
    if (!pending.length) return { skipped: 'All summaries current', updated: 0 };
    const reader = workingRepository(root);
    const request = { schemaVersion: 1, summaryLanguage: 'ko', targets: pending.map(target => ({ ...target, sources: target.sources.map(source => ({ ...source, text: reader.readText(source.path) ?? '' })) })) };
    const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(executable, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
        let stdout = '', size = 0, failed = false;
        const fail = (message: string) => { if (!failed) { failed = true; child.kill(); reject(new InterpretationError(message)); } };
        const timer = setTimeout(() => fail('Summary command timed out after 120 seconds'), 120000);
        child.on('error', () => fail('Summary command could not start'));
        child.stdin.on('error', () => fail('Summary command input failed'));
        child.stderr.resume();
        child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 8 * 1024 * 1024) fail('Summary output exceeds 8 MiB'); else stdout += chunk.toString('utf8'); });
        child.on('close', code => { clearTimeout(timer); if (failed) return; if (code !== 0) fail('Summary command failed (output suppressed to protect credentials)'); else resolve(stdout); });
        child.stdin.end(JSON.stringify(request));
    });
    let records: unknown;
    try { records = JSON.parse(output); } catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new InterpretationError('Summary command did not return valid JSON (output suppressed)'); }
    if (!Array.isArray(records) || records.length !== pending.length) throw new InterpretationError('Runner must return one interpretation per requested target');
    const requested = new Set(pending.map(target => target.id));
    const { parseInterpretation } = await import('../dist/interpretation/model.js');
    const parsed = records.map(parseInterpretation);
    if (new Set(parsed.map(note => note.targetId)).size !== parsed.length || parsed.some(note => !requested.has(note.targetId))) throw new InterpretationError('Runner returned an unexpected or duplicate target');
    for (const note of parsed) writeInterpretation(root, graph, note);
    return { updated: parsed.length };
}
