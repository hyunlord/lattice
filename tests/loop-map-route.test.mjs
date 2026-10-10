import test from 'node:test';
import assert from 'node:assert/strict';
import { readLoopRoute, writeLoopRoute } from '../viewer/loop-map-route.js';

test('scope survives view navigation and restores from history URLs', () => {
    const previousLocation = globalThis.location, previousHistory = globalThis.history;
    const entries = [];
    globalThis.location = { hash: '#/home?view=loop&scope=all&stage=all%3Afolder%3Atest' };
    globalThis.history = { pushState: (_state, _unused, hash) => { entries.push(location.hash); location.hash = hash; } };
    try {
        assert.equal(readLoopRoute().scope, 'all');
        writeLoopRoute({ view: 'catalog', item: 'module:example' });
        assert.equal(readLoopRoute().scope, 'all');
        writeLoopRoute({ view: 'loop', scope: 'production', stage: 'folder:src' });
        assert.equal(readLoopRoute().scope, 'production');
        location.hash = entries.at(-1);
        assert.equal(readLoopRoute().scope, 'all');
        assert.equal(readLoopRoute().view, 'catalog');
        location.hash = '#/home?scope=invalid';
        assert.equal(readLoopRoute().scope, undefined);
    } finally { globalThis.location = previousLocation; globalThis.history = previousHistory; }
});
test('neutral folder pages retain parent and restore without selecting an item', () => {
    const previousLocation = globalThis.location, previousHistory = globalThis.history;
    const entries = [];
    globalThis.location = { hash: '#/home?view=loop&stage=folder%3Asrc&scope=production' };
    globalThis.history = { pushState: (_state, _unused, hash) => { entries.push(location.hash); location.hash = hash; } };
    try {
        writeLoopRoute({ view: 'loop', stage: '', parent: 'directory:src', page: 1 });
        assert.equal(readLoopRoute().stage, undefined);
        assert.equal(readLoopRoute().parent, 'directory:src');
        assert.equal(readLoopRoute().page, 1);
        writeLoopRoute({ view: 'loop', stage: '', parent: '', page: 0 });
        assert.equal(readLoopRoute().parent, undefined);
        location.hash = entries.at(-1);
        assert.equal(readLoopRoute().page, 1);
        assert.equal(readLoopRoute().stage, undefined);
        location.hash = '#/home?page=-2';
        assert.equal(readLoopRoute().page, undefined);
    } finally { globalThis.location = previousLocation; globalThis.history = previousHistory; }
});
