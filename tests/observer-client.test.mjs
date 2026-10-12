import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ObservationWorker } from '../bin/observer-client.mjs';

const summary = { fingerprint: 'a'.repeat(64), checkedInputs: 3, observationMode: 'metadata-witness' };
class FakeWorker extends EventEmitter {
    requests = []; terminated = false;
    postMessage(message) { this.requests.push(message); }
    terminate() { this.terminated = true; this.emit('exit', 0); return Promise.resolve(0); }
    reply(value = summary) { const request = this.requests.at(-1); this.emit('message', { ...request, type: 'observed', summary: value }); }
}
function fixture(t) {
    const workers = [], client = new ObservationWorker(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
    t.after(() => client.dispose());
    return { client, workers, options: { root: '/source', noLens: true } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('each request requires a new bound reply and only the small summary crosses the boundary', async t => {
    const f = fixture(t), first = f.client.observe(f.options); await tick();
    f.workers[0].reply(); assert.deepEqual(await first, summary);
    const second = f.client.observe(f.options); await tick();
    assert.equal(f.workers.length, 1); assert.equal(f.workers[0].requests.length, 2);
    assert.notEqual(f.workers[0].requests[0].id, f.workers[0].requests[1].id);
    f.workers[0].reply(); assert.deepEqual(await second, summary);
});
for (const invalid of ['id', 'generation', 'fingerprint', 'count', 'mode', 'payload']) {
    test(`invalid ${invalid} reply rejects and retires the worker`, async t => {
        const f = fixture(t), pending = f.client.observe(f.options); await tick();
        const worker = f.workers[0], request = worker.requests[0], reply = { ...request, type: 'observed', summary: { ...summary } };
        if (invalid === 'id') reply.id++;
        if (invalid === 'generation') reply.generation++;
        if (invalid === 'fingerprint') reply.summary.fingerprint = 'not-a-digest';
        if (invalid === 'count') reply.summary.checkedInputs = -1;
        if (invalid === 'mode') reply.summary.observationMode = 'unchecked';
        if (invalid === 'payload') reply.summary.sourceText = 'must not transfer';
        const rejected = assert.rejects(pending); worker.emit('message', reply); await rejected;
        assert.equal(worker.terminated, true);
        const recovery = f.client.observe(f.options); await tick();
        assert.equal(f.workers.length, 2); worker.reply(); f.workers[1].reply(); await recovery;
    });
}
for (const event of ['error', 'messageerror', 'exit']) {
    test(`${event} fails the active check without hiding the failure`, async t => {
        const f = fixture(t), pending = f.client.observe(f.options); await tick();
        const rejected = assert.rejects(pending); f.workers[0].emit(event, event === 'exit' ? 0 : new Error('broken')); await rejected;
        assert.equal(f.workers[0].terminated, true);
    });
}
test('options changes retire the old generation; disposal settles active checks and forbids reuse', async t => {
    const f = fixture(t), first = f.client.observe(f.options); await tick(); f.workers[0].reply(); await first;
    f.options.noLens = false;
    const second = f.client.observe(f.options); await tick(); assert.equal(f.workers[0].terminated, true);
    assert.equal(f.workers.length, 2);
    const rejected = assert.rejects(second); await f.client.dispose(); await rejected;
    await assert.rejects(f.client.observe(f.options), /disposed/u);
});
test('overlapping direct observations are rejected, and duplicate replies cannot satisfy later requests', async t => {
    const f = fixture(t), first = f.client.observe(f.options); await tick();
    await assert.rejects(f.client.observe(f.options), /in progress/u);
    f.workers[0].reply(); await first; f.workers[0].reply();
    assert.equal(f.workers[0].terminated, true);
    const next = f.client.observe(f.options); await tick(); f.workers[1].reply(); await next;
});
test('options and environment mutations during a request cannot authorize its response', async t => {
    const f = fixture(t);
    const first = f.client.observe(f.options); await tick(); f.options.noLens = false;
    const rejected = assert.rejects(first, /changed/u); f.workers[0].reply(); await rejected;
    const previous = process.env.LATTICE_INTERPRETATION_DIR;
    t.after(() => { if (previous === undefined) delete process.env.LATTICE_INTERPRETATION_DIR; else process.env.LATTICE_INTERPRETATION_DIR = previous; });
    const second = f.client.observe(f.options); await tick(); process.env.LATTICE_INTERPRETATION_DIR = '/new-external-notes';
    const changed = assert.rejects(second, /changed/u); f.workers[1].reply(); await changed;
});
test('busy disposal waits for actual termination and settles the active promise', async t => {
    let stopped;
    const worker = new FakeWorker(); worker.terminate = () => new Promise(resolve => { stopped = resolve; });
    const client = new ObservationWorker(() => worker); t.after(() => client.dispose());
    const pending = client.observe({ root: '/source' }), rejected = assert.rejects(pending, /disposed/u);
    let done = false; const disposing = client.dispose().then(() => { done = true; }); await tick();
    await rejected; assert.equal(done, false); stopped(0); await disposing; assert.equal(done, true);
});
test('startup and postMessage exceptions reject without a stale response', async t => {
    const startup = new ObservationWorker(() => { throw new Error('private environment value'); }); t.after(() => startup.dispose());
    await assert.rejects(startup.observe({ root: '/source' }), /^Error: Source observer could not start$/u);
    const worker = new FakeWorker(); worker.postMessage = () => { throw new Error('private source text'); };
    const posting = new ObservationWorker(() => worker); t.after(() => posting.dispose());
    await assert.rejects(posting.observe({ root: '/source' }), /^Error: Source observer request failed$/u); assert.equal(worker.terminated, true);
});
