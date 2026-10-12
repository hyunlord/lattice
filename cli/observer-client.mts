import { Worker } from 'node:worker_threads';
import { object, type Options } from './types.mjs';
import { observationContext, observationContextKey, validSummary, type ObservationSummary, type ObserveRequest, type ObserverStart } from './observer-protocol.mjs';

interface WorkerPort {
    postMessage(request: ObserveRequest): void;
    on(event: 'message', listener: (value: unknown) => void): this;
    on(event: 'error' | 'messageerror', listener: (error: Error) => void): this;
    on(event: 'exit', listener: (code: number) => void): this;
    terminate(): Promise<number>;
}
type Factory = (start: ObserverStart) => WorkerPort;
interface Generation { readonly worker: WorkerPort; readonly number: number; readonly key: string; }
interface Pending { readonly id: number; readonly resolve: (summary: ObservationSummary) => void; readonly reject: (failure: Error) => void; }

/** Owns one read-only observer; a completed response is never reused for another request. */
export class ObservationWorker {
    private generation: Generation | undefined;
    private pending: Pending | undefined;
    private sequence = 0;
    private incarnation = 0;
    private disposed = false;
    private readonly stopping = new Set<Promise<void>>();
    constructor(private readonly create: Factory = start => new Worker(new URL('./observer-worker.mjs', import.meta.url), { workerData: { options: start.options, generation: start.generation }, env: start.environment })) { }
    observe(options: Options): Promise<ObservationSummary> {
        if (this.disposed) return Promise.reject(new Error('Source observer is disposed'));
        if (this.pending) return Promise.reject(new Error('Source observation is already in progress'));
        const context = observationContext(options), key = context.key;
        if (this.generation && this.generation.key !== key) this.retire(new Error('Source observation options changed'));
        try {
            if (!this.generation) {
                const number = ++this.incarnation;
                const worker = this.create({ options: context.options, generation: number, environment: context.environment });
                const generation = { worker, number, key }; this.generation = generation;
                worker.on('message', value => this.receive(generation, value));
                worker.on('error', () => { if (this.generation === generation) this.retire(new Error('Source observer failed')); });
                worker.on('messageerror', () => { if (this.generation === generation) this.retire(new Error('Source observer message failed')); });
                worker.on('exit', () => { if (this.generation === generation) this.retire(new Error('Source observer exited before disposal')); });
            }
            const generation = this.generation;
            return new Promise<ObservationSummary>((resolve, reject) => {
                const id = ++this.sequence; this.pending = { id, resolve, reject };
                try { generation.worker.postMessage({ type: 'observe', id, generation: generation.number }); }
                catch { this.retire(new Error('Source observer request failed')); }
            }).then(summary => {
                if (observationContextKey(options) !== key) { this.retire(new Error('Source observation options changed')); throw new Error('Source observation options changed'); }
                return summary;
            });
        } catch { this.retire(new Error('Source observer could not start')); return Promise.reject(new Error('Source observer could not start')); }
    }
    async dispose(): Promise<void> {
        this.disposed = true;
        this.retire(new Error('Source observer is disposed'));
        await Promise.all(this.stopping);
    }
    private receive(generation: Generation, value: unknown): void {
        if (this.generation !== generation) return;
        const pending = this.pending;
        if (!pending || !object(value) || value['id'] !== pending.id || value['generation'] !== generation.number) { this.retire(new Error('Invalid source observer response identity')); return; }
        if (value['type'] === 'failed' && Object.keys(value).length === 3) { this.retire(new Error('Source observation failed; freshness is unknown')); return; }
        if (value['type'] !== 'observed' || Object.keys(value).length !== 4 || !validSummary(value['summary'])) { this.retire(new Error('Invalid source observer response')); return; }
        this.pending = undefined;
        pending.resolve(value['summary']);
    }
    private retire(error: Error): void {
        const generation = this.generation, pending = this.pending;
        this.generation = undefined; this.pending = undefined;
        pending?.reject(error);
        if (generation) {
            const stopped = generation.worker.terminate().then(() => undefined);
            this.stopping.add(stopped);
            void stopped.then(() => this.stopping.delete(stopped), () => this.stopping.delete(stopped));
        }
    }
}
