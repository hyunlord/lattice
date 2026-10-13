import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const cli = resolve('bin/lattice.mjs');
test('open rejects credential, query and non-GitHub URLs before acquiring anything', () => {
    for (const target of ['https://me:secret@github.com/a/b', 'https://github.com/a/b?token=x', 'https://github.com/a/b/tree/main', 'https://example.com/a/b', 'https://github.com/a/b#main']) {
        const result = spawnSync(process.execPath, [cli, 'open', target, '--no-browser', '--json'], { encoding: 'utf8' });
        assert.equal(result.status, 2);
        assert.match(result.stdout, /public GitHub HTTPS/u);
        assert.doesNotMatch(result.stdout, /secret|token=x/u);
    }
});
test('open binds before analysis, publishes grounded inventory and completes plain directory without writing target', { timeout: 60000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-open-source-'));
    writeFileSync(join(root, 'README.md'), '# Orchard\n\nA small harvesting library.\n');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'orchard', description: 'A small harvesting library.', scripts: { prepare: 'touch SHOULD_NOT_RUN' } }));
    mkdirSync(join(root, 'src'));
    for (let index = 0; index < 80; index++) writeFileSync(join(root, 'src', `f${index}.ts`), `export function f${index}() { return ${index}; }\n`);
    const child = spawn(process.execPath, [cli, 'open', root, '--no-browser', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffered = '', stderr = '';
    child.stderr.on('data', bytes => { stderr += bytes; });
    const events = [];
    let urlResolve;
    const ready = new Promise(resolve => { urlResolve = resolve; });
    let completeResolve;
    const complete = new Promise(resolve => { completeResolve = resolve; });
    child.stdout.on('data', bytes => {
        buffered += bytes;
        let end;
        while ((end = buffered.indexOf('\n')) >= 0) {
            const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
            const event = JSON.parse(line); events.push(event);
            if (event.event === 'listening') urlResolve(event.url);
            if (event.event === 'rebuilt') completeResolve(event);
        }
    });
    try {
        const url = await Promise.race([ready, once(child, 'exit').then(() => { throw new Error(stderr || JSON.stringify(events)); })]);
        assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/u);
        const page = await fetch(url).then(response => response.text());
        assert.match(page, /lattice-generation/u);
        await complete;
        const progress = events.filter(event => event.event === 'progress');
        const inventory = progress.find(event => event.progress.inventory)?.progress.inventory;
        assert.equal(inventory.files, 82);
        assert.equal(inventory.description.path, 'package.json');
        assert.match(inventory.description.text, /harvesting/u);
        assert.deepEqual([...new Set(progress.map(event => event.progress.phase))].filter(phase => ['observe', 'extract', 'resolve', 'export'].includes(phase)), ['observe', 'extract', 'resolve', 'export']);
        const overview = await fetch(new URL('overview.json', url)).then(response => response.json());
        assert.ok(overview);
        assert.equal(existsSync(join(root, '.git')), false);
        assert.equal(existsSync(join(root, '.lattice')), false);
        assert.equal(existsSync(join(root, 'SHOULD_NOT_RUN')), false);
    } finally {
        child.kill('SIGINT');
        await once(child, 'exit');
        rmSync(root, { recursive: true, force: true });
    }
});

test('Git working inventory never executes a repository-configured fsmonitor hook', async () => {
    const { execFileSync } = await import('node:child_process');
    const { workingRepository, workingRepositoryAsync } = await import('../bin/repository.mjs');
    const root = mkdtempSync(join(tmpdir(), 'lattice-open-hook-'));
    try {
        execFileSync('git', ['init', '-q', root]);
        writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
        execFileSync('git', ['-C', root, 'config', 'core.fsmonitor', 'touch SHOULD_NOT_RUN']);
        const sync = workingRepository(root);
        const asyncReader = await workingRepositoryAsync(root);
        assert.deepEqual(sync.paths, ['source.ts']);
        assert.deepEqual(asyncReader.paths, ['source.ts']);
        assert.equal(existsSync(join(root, 'SHOULD_NOT_RUN')), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('read-only source mode detects modified bytes without executing Git clean/process filters', async () => {
    const { execFileSync } = await import('node:child_process');
    const { realpathSync } = await import('node:fs');
    const { workingRepository, workingRepositoryAsync } = await import('../bin/repository.mjs');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-open-filter-')));
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
    try {
        git('init', '-q');
        writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
        writeFileSync(join(root, '.gitattributes'), '*.ts filter=reviewproof\n');
        git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture');
        git('config', 'filter.reviewproof.clean', 'touch FILTER_RAN; cat');
        git('config', 'filter.reviewproof.process', 'touch PROCESS_RAN; cat');
        assert.equal(workingRepository(root, undefined, true).dirty, false);
        writeFileSync(join(root, 'a.ts'), 'export const a = 2;\n');
        assert.equal(workingRepository(root, undefined, true).dirty, true);
        assert.equal((await workingRepositoryAsync(root, undefined, undefined, true)).dirty, true);
        assert.equal(existsSync(join(root, 'FILTER_RAN')), false);
        assert.equal(existsSync(join(root, 'PROCESS_RAN')), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
