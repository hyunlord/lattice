const generation = document.querySelector('meta[name="lattice-generation"]').content;
const banner = document.createElement('p');
banner.className = 'provenance';
banner.setAttribute('role', 'status');
banner.style.display = 'none';
document.querySelector('.topbar').after(banner);
const events = new EventSource('/__lattice/events');
events.addEventListener('status', event => {
  const status = JSON.parse(event.data);
  if (status.error) {
    banner.style.display = ''; 
    banner.textContent = `갱신 실패: ${status.error} · 마지막 정상 지도를 표시합니다. 파일을 수정하면 자동으로 다시 시도합니다.`;
  } else if (status.generation !== generation) location.reload();
  else { banner.style.display = 'none'; banner.textContent = ''; }
});
events.onerror = () => { banner.style.display = '';  banner.textContent = '로컬 서버 연결이 끊겼습니다. 마지막 지도를 표시하며 다시 연결합니다.'; };
addEventListener('pagehide', () => events.close());
