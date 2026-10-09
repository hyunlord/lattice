import { importGraft } from '../dist/index.js';
import { digest } from './storage.mjs';

export const graftPath = 'graft/.graph/wiring.json';

export function observeGraft(repository) {
  try {
    const text = repository.readText(graftPath);
    return text === undefined ? undefined : { input: { path: graftPath, text, contentHash: digest(text) } };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { diagnostic: { code: 'graft-unreadable', message: `Optional Graft graph unavailable: ${error.message}` } };
  }
}

export function buildGraft(observation, selected, sourceLink) {
  if (!observation?.input) return { nodes: [], edges: [], diagnostics: observation?.diagnostic ? [observation.diagnostic] : [], coveredPaths: [] };
  const result = importGraft(observation.input, selected.filter(selection => selection.format === 'code').map(selection => selection.input));
  // The generated graph is a local artifact, not necessarily a committed file.
  const link = source => source.path === graftPath ? source : sourceLink(source);
  return { ...result, nodes: result.nodes.map(node => ({ ...node, sources: node.sources.map(link) })), edges: result.edges.map(edge => ({ ...edge, sources: edge.sources.map(link) })) };
}
