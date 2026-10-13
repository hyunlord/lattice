const generation = document.querySelector<HTMLMetaElement>('meta[name="lattice-generation"]')?.content;
const shell = document.querySelector('[data-open-shell]');
const banner = document.createElement('p');
banner.className = 'provenance';
banner.setAttribute('role', 'status');
banner.style.display = 'none';
document.querySelector('.topbar')?.after(banner);
const text = (id: string, value: string) => { const element = document.getElementById(id); if (element) element.textContent = value; };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const labels = {
    ko: { starting: '서버 준비 완료', clone: '공개 저장소 내려받기', inventory: '파일 목록 확인', observe: '소스 읽기 · 변경 확인', extract: '정의와 참조 추출', resolve: '정적 연결 분석', export: '전체 지도 생성', complete: '전체 지도 준비 완료' },
    en: { starting: 'Local server ready', clone: 'Cloning public repository', inventory: 'File inventory observed', observe: 'Reading and verifying sources', extract: 'Extracting definitions and references', resolve: 'Resolving static relationships', export: 'Preparing complete map', complete: 'Complete map ready' },
};
let language: 'ko' | 'en' = new URLSearchParams(location.hash.split('?')[1] ?? '').get('lang') === 'en' ? 'en' : 'ko';
let latest: Record<string, unknown> | undefined;
function renderProgress(status: Record<string, unknown>) {
    if (!shell || !object(status['progress'])) return;
    const progress = status['progress'];
    document.documentElement.lang = language;
    text('open-title', language === 'en' ? 'Opening repository' : '저장소 열기');
    text('open-intro', language === 'en' ? 'Source-backed inventory appears first. The complete map opens when analysis finishes.' : '소스에서 확인한 내용을 먼저 보여주고, 분석이 끝나면 전체 지도를 엽니다.');
    const phase = progress['phase'];
    if (typeof phase === 'string') for (const [key, value] of Object.entries(labels[language])) if (key === phase) text('open-phase', value);
    text('open-detail', typeof progress['detail'] === 'string' ? progress['detail'] : '');
    const inventory = progress['inventory'];
    if (!object(inventory)) return;
    document.getElementById('open-inventory')?.removeAttribute('hidden');
    text('open-repository', typeof inventory['name'] === 'string' ? inventory['name'] : '');
    text('open-count', language === 'en' ? `${inventory['files']} files observed · working-tree inventory` : `파일 ${inventory['files']}개 확인 · 작업 트리 인벤토리`);
    text('open-pending', language === 'en' ? 'Partial inventory. Dependencies, entrypoints and flows are pending analysis; they are not zero. File sample: first 80 paths; manifest sample: first 16.' : '부분 인벤토리입니다. 의존성·진입점·흐름은 분석 대기 중이며 0개라는 뜻이 아닙니다. 파일은 앞 80개, 매니페스트는 앞 16개를 표시합니다.');
    text('open-manifests-title', language === 'en' ? 'Manifest evidence' : '매니페스트 근거');
    text('open-paths-title', language === 'en' ? 'Observed file sample' : '확인한 파일 표본');
    const description = inventory['description'];
    if (object(description) && typeof description['text'] === 'string') { text('open-description', description['text']); text('open-description-source', `${description['path']} · ${language === 'en' ? 'source excerpt' : '소스 발췌'} · ${description['contentHash']}`); }
    const paths = document.getElementById('open-paths');
    if (paths && Array.isArray(inventory['paths'])) paths.replaceChildren(...inventory['paths'].filter((path): path is string => typeof path === 'string').map(path => { const item = document.createElement('li'); item.textContent = path; return item; }));
    const manifests = document.getElementById('open-manifests');
    if (manifests && Array.isArray(inventory['manifests'])) manifests.replaceChildren(...inventory['manifests'].filter(object).map(manifest => {
        const details = document.createElement('details'), summary = document.createElement('summary'), excerpt = document.createElement('pre');
        summary.textContent = typeof manifest['path'] === 'string' ? manifest['path'] : '';
        excerpt.textContent = typeof manifest['excerpt'] === 'string' ? manifest['excerpt'] : '';
        details.append(summary, excerpt); return details;
    }));
}
const languageSelect = document.querySelector<HTMLSelectElement>('#open-language');
if (languageSelect) { languageSelect.value = language; languageSelect.addEventListener('change', () => { language = languageSelect.value === 'en' ? 'en' : 'ko'; history.replaceState(null, '', language === 'en' ? '#/home?lang=en' : '#/home'); if (latest) renderProgress(latest); }); }
const events = new EventSource('/__lattice/events');
let reloading = false;
events.addEventListener('status', event => {
    const status: unknown = JSON.parse(event.data);
    if (!object(status) || !('generation' in status)) return;
    latest = status; renderProgress(status);
    const error = typeof status['error'] === 'string' ? status['error'] : undefined;
    if (error) {
        banner.style.display = '';
        banner.textContent = shell ? `${language === 'en' ? 'Analysis failed' : '분석 실패'}: ${error}` : `갱신 실패: ${error} · 마지막 정상 지도를 표시합니다. 파일을 수정하면 자동으로 다시 시도합니다.`;
    } else if (status['generation'] !== generation && !reloading) { reloading = true; location.reload(); }
    else { banner.style.display = 'none'; banner.textContent = ''; }
});
events.onerror = () => { if (latest && typeof latest['error'] === 'string') return; banner.style.display = ''; banner.textContent = language === 'en' ? 'Local server disconnected. Reconnecting.' : '로컬 서버 연결이 끊겼습니다. 다시 연결합니다.'; };
addEventListener('pagehide', () => events.close());
