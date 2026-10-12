/** Defaults exclude runnable fixtures and build scripts, without discarding their graph evidence. */
export function productLogicPath(path: string): boolean {
    const parts = path.split('/');
    const main = parts.findIndex((part, index) => part === 'src' && parts[index + 1] === 'main');
    const scope = main < 0 ? parts.slice(0, -1) : parts.slice(0, main);
    return !scope.some(part => /(?:^|[._-])(?:tests?|specs?|examples?|samples?|demos?|benches|benchmarks?|fixtures|testdata|scripts|build)(?:$|[._-])/iu.test(part))
        && !/(?:^|\/)(?:build\.rs|test_[^/]+\.py)$|_test\.go$|[._-](?:test|spec)\.[cm]?[jt]sx?$|Tests?\.(?:java|cs)$/u.test(path);
}
export const executionCategory = (category: string): boolean => category === 'executable' || category === 'module-execution';
