import { parentPort, workerData } from 'node:worker_threads';
import { observeRepositoryAsync } from './observation.mjs';
import { observationSummary, type ObserverStart } from './observer-protocol.mjs';
import { object } from './types.mjs';

const port = parentPort;
if (!port) throw new Error('Source observer requires a worker message port');
const start: ObserverStart = workerData;
let busy = false;
port.on('message', async (request: unknown) => {
    if (!object(request) || request['type'] !== 'observe' || !Number.isSafeInteger(request['id']) || request['generation'] !== start.generation || busy) {
        port.close(); return;
    }
    busy = true;
    try {
        const summary = observationSummary(await observeRepositoryAsync(start.options));
        port.postMessage({ type: 'observed', id: request['id'], generation: start.generation, summary });
    } catch {
        // Source text and configuration details never cross the worker boundary, including errors.
        port.postMessage({ type: 'failed', id: request['id'], generation: start.generation });
    } finally { busy = false; }
});
