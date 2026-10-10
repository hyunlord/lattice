import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, realpathSync, readlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const cli = resolve('bin/lattice.mjs');
function fixture(t) {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-init-agents-')));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const root = join(directory, 'repo');
    const home = join(directory, 'home');
    mkdirSync(root); mkdirSync(home);
    execFileSync('git', ['init', '--quiet', root]);
    return { root, home, run: (...args) => spawnSync(process.execPath, [cli, 'init', '--root', root, '--json', ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, CODEX_HOME: join(home, '.codex') } }) };
}
test('init wires agents alongside Graft and remains byte stable without home writes', t => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'AGENTS.md'), '# Existing\n');
    writeFileSync(join(f.root, '.mcp.json'), JSON.stringify({ mcpServers: { graft: { command: 'graft' } }, extra: true }));
    assert.equal(f.run('--no-global').status, 0);
    const paths = ['AGENTS.md', '.mcp.json', '.codex/config.toml', '.claude/skills/lattice/SKILL.md', '.lattice/lens.yaml'];
    const first = paths.map(path => readFileSync(join(f.root, path), 'utf8'));
    const config = JSON.parse(first[1]);
    assert.equal(config.mcpServers.graft.command, 'graft');
    assert.equal(config.mcpServers.lattice.command, process.execPath);
    assert.deepEqual(config.mcpServers.lattice.args.slice(-3), ['mcp', '--root', f.root]);
    assert.match(first[0], /lattice_overview/); assert.match(first[3], /lattice_diff/);
    for (const instructions of [first[0], first[3]]) {
        assert.match(instructions, /scope="overview", compact=true, limit=9/);
        assert.match(instructions, /sourceSetToken/);
        assert.match(instructions, /overviewScope="all"/);
    }
    assert.equal(f.run('--no-global').status, 0);
    assert.deepEqual(paths.map(path => readFileSync(join(f.root, path), 'utf8')), first);
    assert.equal(existsSync(join(f.home, '.codex')), false);
});
test('init validates every destination before writing lens or agent instructions', t => {
    for (const invalid of ['model = "unterminated', '[mcp_servers.lattice]\ncommand = "foreign"\n', 'model = true\nmodel = false\n']) {
        const f = fixture(t); mkdirSync(join(f.root, '.codex'));
        writeFileSync(join(f.root, '.codex/config.toml'), invalid);
        assert.notEqual(f.run('--no-global').status, 0);
        assert.equal(existsSync(join(f.root, '.lattice')), false);
        assert.equal(existsSync(join(f.root, 'AGENTS.md')), false);
        assert.equal(readFileSync(join(f.root, '.codex/config.toml'), 'utf8'), invalid);
    }
});
test('init refuses symlinked destination directories before writes', t => {
    const f = fixture(t); symlinkSync(f.home, join(f.root, '.claude'));
    assert.notEqual(f.run('--no-global').status, 0);
    assert.equal(existsSync(join(f.root, '.lattice')), false);
});
test('init defaults to isolated per-repository global Codex registration', t => {
    const f = fixture(t);
    assert.equal(f.run().status, 0);
    const config = readFileSync(join(f.home, '.codex/config.toml'), 'utf8');
    assert.match(config, /mcp_servers\.lattice_/);
    assert.ok(config.includes(JSON.stringify(f.root)));
    assert.equal(f.run().status, 0);
    assert.equal(readFileSync(join(f.home, '.codex/config.toml'), 'utf8'), config);
});
test('init preserves unrelated configuration bytes and rejects ambiguous JSON before writes', t => {
    const f = fixture(t);
    const original = '{\n "mcpServers" : { "graft" : {"command":"graft"} },\n "note": "retain spacing"\n}\n';
    writeFileSync(join(f.root, '.mcp.json'), original);
    mkdirSync(join(f.root, '.codex'));
    const toml = '# keep exact bytes\nmodel = "chosen"\n[mcp_servers.graft]\ncommand = "graft"\nargs = ["mcp", "--safe"]\n';
    writeFileSync(join(f.root, '.codex/config.toml'), toml);
    assert.equal(f.run('--no-global').status, 0);
    assert.ok(readFileSync(join(f.root, '.codex/config.toml'), 'utf8').startsWith(toml));
    assert.match(readFileSync(join(f.root, '.mcp.json'), 'utf8'), /"graft" : \{"command":"graft"\}/);
    for (const invalid of ['{"mcpServers":', '{"mcpServers":{},"mcpServers":{}}', '{"mcpServers":{"lattice":{"command":"other"}}}']) {
        const broken = fixture(t);
        writeFileSync(join(broken.root, '.mcp.json'), invalid);
        assert.notEqual(broken.run('--no-global').status, 0);
        assert.equal(existsSync(join(broken.root, '.lattice')), false);
    }
});
test('init preflights global config before creating project files', t => {
    const f = fixture(t); mkdirSync(join(f.home, '.codex'));
    writeFileSync(join(f.home, '.codex/config.toml'), 'model = "unfinished');
    assert.notEqual(f.run().status, 0);
    assert.equal(existsSync(join(f.root, '.lattice')), false);
    assert.equal(existsSync(join(f.root, 'AGENTS.md')), false);
});
test('init preserves internal shared skill directories and unmanaged siblings', t => {
    const f = fixture(t);
    mkdirSync(join(f.root, '.claude/skills'), { recursive: true });
    mkdirSync(join(f.root, '.codex'));
    writeFileSync(join(f.root, '.claude/skills/existing.md'), 'owned by repository\n');
    symlinkSync('../.claude/skills', join(f.root, '.codex/skills'));
    const first = f.run('--no-global');
    assert.equal(first.status, 0, first.stderr);
    const skill = readFileSync(join(f.root, '.claude/skills/lattice-init/SKILL.md'), 'utf8');
    assert.match(skill, /lattice_interpretation_context/);
    assert.equal(readlinkSync(join(f.root, '.codex/skills')), '../.claude/skills');
    assert.equal(f.run('--no-global').status, 0);
    assert.equal(readFileSync(join(f.root, '.claude/skills/lattice-init/SKILL.md'), 'utf8'), skill);
    assert.equal(readFileSync(join(f.root, '.claude/skills/existing.md'), 'utf8'), 'owned by repository\n');
});
test('init rejects linked skill files and dangling directory aliases before writes', t => {
    for (const leaf of [true, false]) {
        const f = fixture(t);
        mkdirSync(join(f.root, '.claude/skills/lattice'), { recursive: true });
        writeFileSync(join(f.root, 'owned.md'), 'repository text');
        if (leaf) symlinkSync('../../../owned.md', join(f.root, '.claude/skills/lattice/SKILL.md'));
        else { mkdirSync(join(f.root, '.codex')); symlinkSync('../missing', join(f.root, '.codex/skills')); }
        assert.notEqual(f.run('--no-global').status, 0);
        assert.equal(existsSync(join(f.root, '.lattice')), false);
        assert.equal(readFileSync(join(f.root, 'owned.md'), 'utf8'), 'repository text');
    }
});
test('init refuses unmanaged skills through internal aliases without other writes', t => {
    const f = fixture(t);
    mkdirSync(join(f.root, '.claude/skills/lattice-init'), { recursive: true });
    mkdirSync(join(f.root, '.codex'));
    symlinkSync('../.claude/skills', join(f.root, '.codex/skills'));
    const path = join(f.root, '.claude/skills/lattice-init/SKILL.md');
    writeFileSync(path, 'unmanaged skill');
    assert.notEqual(f.run('--no-global').status, 0);
    assert.equal(readFileSync(path, 'utf8'), 'unmanaged skill');
    assert.equal(existsSync(join(f.root, '.lattice')), false);
});
test('planned project destinations reject directory alias retargeting', async t => {
    const { projectDestination } = await import('../bin/init-files.mjs');
    const f = fixture(t);
    for (const path of ['.codex', 'first', 'second']) mkdirSync(join(f.root, path));
    const alias = join(f.root, '.codex/skills');
    symlinkSync('../first', alias);
    const plan = projectDestination(join(alias, 'lattice-init/SKILL.md'), f.root);
    plan.validate();
    unlinkSync(alias);
    symlinkSync('../second', alias);
    assert.throws(() => plan.validate(), /changed after planning/);
    assert.equal(existsSync(join(f.root, 'second/lattice-init')), false);
});
test('init starter maps code and documents without selecting unrelated invalid data', t => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'settings.json'), '// editor configuration\n{"enabled": true}\n');
    writeFileSync(join(f.root, 'broken.json'), '{');
    writeFileSync(join(f.root, 'main.ts'), 'export const ready = true;\n');
    writeFileSync(join(f.root, 'player.gd'), 'extends Node\nfunc ready():\n    pass\n');
    writeFileSync(join(f.root, 'README.md'), '# Example\n');
    assert.equal(f.run('--no-global').status, 0);
    const build = () => spawnSync(process.execPath, [cli, 'build', '--root', f.root, '--json'], { encoding: 'utf8' });
    const first = build();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const graph = JSON.parse(readFileSync(join(f.root, '.lattice/cache/graph.json'), 'utf8'));
    assert.ok(graph.nodes.some(node => node.id === 'module:main.ts'));
    assert.ok(graph.nodes.some(node => node.id === 'module:player.gd'));
    assert.ok(graph.nodes.some(node => node.id === 'document:README.md'));
    assert.ok(!graph.inputs.some(input => ['settings.json', 'broken.json'].includes(input.path)));
    const lensPath = join(f.root, '.lattice/lens.yaml');
    const lens = readFileSync(lensPath, 'utf8');
    for (const path of ['broken.json', 'settings.json']) {
        writeFileSync(lensPath, lens.replace('kinds:\n', `kinds:\n  - id: record\n    label: Records\n    files: ["${path}"]\n`));
        const explicit = build();
        assert.equal(explicit.status, 2);
        assert.ok(explicit.stdout.includes(path));
    }
});
