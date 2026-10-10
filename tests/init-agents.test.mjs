import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
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
