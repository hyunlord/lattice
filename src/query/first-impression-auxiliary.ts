import type { Node } from '../core/model.js';
import { pathOf } from './first-impression-components.js';

/** Presentation metadata only: keep mixed groups, canonical membership and source-bound notes intact. */
export function auxiliaryComponent(members: readonly Node[]): boolean {
    return members.length > 0 && members.every(node => {
        const path = pathOf(node).replaceAll('\\', '/');
        const file = path.split('/').at(-1) ?? '';
        const beforeSource = path.split(/(?:^|\/)(?:src|source|lib)\//iu)[0] ?? path;
        if (/(?:^|\/)(?:ci|\.github|\.circleci|\.buildkite|kokoro|lint|lint-checks|build-logic|spotless)(?:\/|$)/iu.test(beforeSource)) return true;
        if (/^(?:Formula|(?:pkg|packaging)\/(?:brew|homebrew))\/[^/]+\.rb$/u.test(path)) return true;
        if ((/^(?:copyright)(?:[._-].*)?$/iu.test(file) || /^licen[cs]e(?:[._-](?:txt|md|rst|template))?$/iu.test(file))) return true;
        if (/^(?:go\.mod|go\.sum|Cargo\.(?:toml|lock)|package(?:-lock)?\.json|pyproject\.toml|pom\.xml|build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradlew(?:\.bat)?|(?:eslint|prettier|biome|stylelint)\.config\.[cm]?[jt]s)$/iu.test(file)) return true;
        return /(?:^|[_-])(?:release|publish|lint|format)(?:[_-]|\.)/iu.test(file) && /\.(?:sh|bash|ps1|bat|cmd)$/iu.test(file);
    });
}
