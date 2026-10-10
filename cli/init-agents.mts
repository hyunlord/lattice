import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { object } from './types.mjs';
import { digest } from './storage.mjs';
import { existingText, managed } from './init-files.mjs';
import { insertServer } from './init-json.mjs';
import { validateToml } from './init-toml.mjs';

export interface PlannedFile { readonly path: string; readonly previous: string; readonly next: string; }
export function agentFiles(root: string, global: boolean): readonly PlannedFile[] {
    const result: PlannedFile[] = [];
    const plan = (relative: string, transform: (text: string) => string): void => {
        const path = join(root, relative);
        const previous = existingText(path, root);
        result.push({ path, previous, next: transform(previous) });
    };
    const instructions = 'Before design or implementation, call lattice_overview and lattice_findings to inspect current structure, evidence and unresolved findings. Record the starting Git revision. After work, call lattice_diff against that revision to verify the intended changes. Read source evidence before editing; findings are evidence, not permission to change domain rules. Lattice complements Graft; retain both configurations.';
    plan('AGENTS.md', text => managed(text, 'agents', `## Lattice\n\n${instructions}`, true));
    plan('.claude/skills/lattice/SKILL.md', text => {
        if (text && !text.includes('<!-- lattice:skill:start -->')) throw new Error('Existing unmanaged Lattice skill; refusing replacement');
        const header = '---\nname: lattice\ndescription: Inspect repository structure and findings before work, then verify changes.\n---\n\n';
        return managed(text || header, 'skill', instructions, true);
    });
    const server = { command: process.execPath, args: [fileURLToPath(new URL('./lattice.mjs', import.meta.url)), 'mcp', '--root', root] };
    plan('.mcp.json', text => {
        const config: unknown = text ? JSON.parse(text) : {};
        if (!object(config)) throw new Error('.mcp.json must contain an object');
        const servers = config['mcpServers'] === undefined ? {} : config['mcpServers'];
        if (!object(servers)) throw new Error('.mcp.json mcpServers must contain an object');
        const old = servers['lattice'];
        if (old !== undefined && JSON.stringify(old) !== JSON.stringify(server)) throw new Error('Existing unmanaged Lattice MCP server; refusing replacement');
        const next = insertServer(text, server);
        if (old !== undefined) return text;
        return next;
    });
    const name = `lattice_${digest(root).slice(0, 12)}`;
    const codex = (text: string): string => {
        validateToml(text);
        const marker = `# lattice:${name}:start`;
        const outside = text.includes(marker) ? text.slice(0, text.indexOf(marker)) + text.slice(text.indexOf(`# lattice:${name}:end`) + `# lattice:${name}:end`.length) : text;
        const keys = validateToml(outside).map(key => JSON.parse(key)).filter((parts: unknown): parts is string[] => Array.isArray(parts));
        if (keys.some(parts => parts[0] === 'mcp_servers' && (parts[1] === name || parts[1] === 'lattice' || parts.length === 1))) throw new Error('Existing unmanaged Lattice Codex server; refusing replacement');
        const next = managed(text, name, `[mcp_servers.${name}]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}`);
        validateToml(next);
        return next;
    };
    plan('.codex/config.toml', codex);
    if (global) {
        const home = homedir();
        const path = join(process.env['CODEX_HOME'] ?? join(home, '.codex'), 'config.toml');
        const previous = existingText(path, home);
        result.push({ path, previous, next: codex(previous) });
    }
    return result;
}
