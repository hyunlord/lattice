import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildGallery, galleryHtml, sourceEnvironment, validateManifest, notesDirectory, verifyNotes } from '../tools/build-gallery.mjs';

const entry = { id: 'sample', name: 'Sample <&>', description: 'Source-backed sample', stack: 'JavaScript', repository: 'example/sample', commit: 'a'.repeat(40) };
test('gallery validates remote identifiers and escapes display metadata', () => {
    const manifest = { version: 1, repositories: [entry] };
    assert.match(galleryHtml(validateManifest(manifest)), /Sample &lt;&amp;&gt;/u);
    assert.match(galleryHtml(manifest), /\.\/sample\/#\/home\?lang=en/u);
    for (const change of [{ id: '../escape' }, { repository: 'https://user:secret@example.com/x' }, { commit: 'main' }]) {
        assert.throws(() => validateManifest({ ...manifest, repositories: [{ ...entry, ...change }] }));
    }
    assert.throws(() => validateManifest({ ...manifest, repositories: [entry, entry] }));
    assert.throws(() => validateManifest({ ...manifest, lensExamples: [{ name: 'Unsafe', url: 'javascript:alert(1)' }] }));
});
test('gallery source identity appends to inherited Git config without changing its environment', () => {
    const inherited = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.abbrev', GIT_CONFIG_VALUE_0: '12', PATH: '/example/path' };
    assert.deepEqual(sourceEnvironment(entry.repository, inherited), { ...inherited, GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_1: 'remote.origin.url', GIT_CONFIG_VALUE_1: 'https://github.com/example/sample' });
    assert.equal(inherited.GIT_CONFIG_COUNT, '1');
    assert.throws(() => sourceEnvironment(entry.repository, { GIT_CONFIG_COUNT: 'invalid' }), /GIT_CONFIG_COUNT/u);
});
test('gallery builds real exports from exact existing checkouts without target writes or scripts', () => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-gallery-test-'));
    try {
        const sources = join(root, 'sources'), checkout = join(sources, entry.id), output = join(root, 'site'), cache = join(root, 'cache');
        mkdirSync(checkout, { recursive: true });
        const git = args => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
        git(['init', '--quiet']);
        git(['remote', 'add', 'origin', '/local/source-checkout']);
        writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name: 'sample', description: 'Fixture repository', scripts: { build: 'touch must-not-run', prepare: 'touch must-not-run' } }));
        writeFileSync(join(checkout, 'index.js'), 'export function hello() { return "hello"; }\n');
        git(['add', '.']);
        git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Fixture']);
        const commit = git(['rev-parse', 'HEAD']);
        const manifest = { version: 1, repositories: [{ ...entry, commit }] };
        buildGallery({ manifest, output, sources, cache });
        assert.match(readFileSync(join(output, 'index.html'), 'utf8'), /Source snapshot/u);
        assert.equal(JSON.parse(readFileSync(join(output, entry.id, '.lattice-export.json'), 'utf8')).generator, 'lattice');
        assert.ok(existsSync(join(output, entry.id, 'index.html')));
        const overview = JSON.parse(readFileSync(join(output, entry.id, 'overview.json'), 'utf8'));
        assert.equal(overview.repository.remoteUrl, 'https://github.com/example/sample');
        assert.equal(overview.repository.commit, commit);
        assert.ok(JSON.stringify(overview).includes(`https://github.com/example/sample/blob/${commit}/package.json`));
        assert.equal(git(['config', '--get', 'remote.origin.url']), '/local/source-checkout');
        assert.equal(git(['status', '--porcelain', '--untracked-files=all']), '');
        assert.equal(existsSync(join(checkout, '.lattice')), false);
        assert.equal(existsSync(join(checkout, 'must-not-run')), false);
        buildGallery({ manifest, output, sources, cache });
        assert.throws(() => buildGallery({ manifest, output: checkout, sources, cache }), /separate directories/u);
        const foreign = join(root, 'foreign'); mkdirSync(foreign);
        assert.throws(() => buildGallery({ manifest, output: foreign, sources, cache }), /ownership marker/u);
        assert.throws(() => buildGallery({ manifest: { ...manifest, repositories: [entry] }, output, sources, cache }), /pinned commit/u);
        writeFileSync(join(checkout, 'untracked.txt'), 'unexpected');
        assert.throws(() => buildGallery({ manifest, output, sources, cache }), /dirty/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('gallery hides test maps and checks source-bound external notes paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-gallery-notes-'));
    try {
        const manifest = { version: 1, repositories: [entry, { ...entry, id: 'blind', testOnly: true }] };
        assert.doesNotMatch(galleryHtml(validateManifest(manifest)), /href=".\/blind/u);
        for (const notes of ['../notes', '/notes', 'notes/a/b', 'notes/../escape']) assert.throws(() => validateManifest({ version: 1, repositories: [{ ...entry, notes }] }));
        const directory = join(root, 'notes', 'sample'); mkdirSync(join(directory, 'notes'), { recursive: true });
        writeFileSync(join(directory, 'provenance.json'), JSON.stringify({ repository: entry.repository, commit: entry.commit }));
        const withNotes = { ...entry, notes: 'notes/sample' };
        assert.equal(notesDirectory(withNotes, root), directory);
        assert.throws(() => notesDirectory({ ...withNotes, commit: 'b'.repeat(40) }, root), /pinned repository/u);
        writeFileSync(join(directory, 'notes', 'valid.json'), JSON.stringify({ targetId: 'component:entry', claims: [{ text: 'role' }] }));
        assert.throws(() => verifyNotes(directory, { interpretations: [] }), /stale or has invalid citations/u);
        assert.throws(() => verifyNotes(directory, { interpretations: [{ targetId: 'component:entry', status: 'fresh', validatedClaims: [] }] }), /invalid citations/u);
        verifyNotes(directory, { interpretations: [{ targetId: 'component:entry', status: 'fresh', validatedClaims: [{}] }] });
        symlinkSync(join(directory, 'provenance.json'), join(directory, 'notes', 'linked.json'));
        assert.throws(() => notesDirectory(withNotes, root), /regular JSON/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
