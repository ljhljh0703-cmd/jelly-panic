// 토스 미니앱 안에서 게임 본체(index.html)에 window.PLATFORM 을 심는다.
// 게임은 PLATFORM 이 있으면 저장소·뒤로가기·닫기·진동을 이쪽으로 쓰고, 없으면 브라우저 기능을 쓴다.
// 검수표(앱인토스 게임 출시 가이드)와 맞춘 것: 사용자 식별키 발급·저장, 네이티브 저장소로 기록 유지, 안드로이드 뒤로가기,
// 안전 영역(상단 닫기 버튼 포함), 백그라운드 소리 정지(게임 본체 visibilitychange).
import { User, Storage, graniteEvent, closeView, SafeArea, generateHapticFeedback, Environment, eventLog, submitGameCenterLeaderBoardScore, openGameCenterLeaderboard, Share } from '@apps-in-toss/web-framework';

const APP_NAME = 'jelly-panic'; // apps-in-toss.config.ts 의 appName 과 같게. 콘솔에서 이름이 정해지면 두 곳을 같이 고친다

const STORE_KEY = 'jelly-panic-store'; // 게임 저장 값 전부를 JSON 하나로 묶어 네이티브 저장소에 둔다
const mem = {};
const dirty = {};       // 이번에 게임이 쓴 키
let loaded = false;     // 저장소를 읽었는지. 못 읽었으면 쓰지 않는다(늦게 온 답을 기다렸다가 합친다) — 지난 기록을 빈 값으로 덮지 않게
let saveTimer = null;

function saveSoon() {
  if (!loaded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { Storage.setItem(STORE_KEY, JSON.stringify(mem)).catch(() => {}); } catch (e) {} }, 300);
}

function setInsets(s) {
  if (!s) return;
  document.documentElement.style.setProperty('--plat-top', (s.top || 0) + 'px');
  document.documentElement.style.setProperty('--plat-bottom', (s.bottom || 0) + 'px');
}
function applySafeArea() {
  try { setInsets(SafeArea.get()); } catch (e) {}
  try { SafeArea.subscribe({ onEvent: setInsets }); } catch (e) {}
}

// 토스 밖(브라우저)이나 다리가 응답하지 않을 때 게임이 멈추지 않도록, 기다림은 최대 1.5초
function withTimeout(promise, ms = 1500) {
  return Promise.race([Promise.resolve().then(() => promise), new Promise((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

function inToss() {
  try { const e = Environment.environment; return e === 'toss' || e === 'sandbox'; } catch (e) { return false; }
}

function runGame() {
  // index.html 의 원래 스크립트는 build.mjs 가 type="text/x-game" 으로 바꿔 두었다
  document.querySelectorAll('script[type="text/x-game"]').forEach((old) => {
    const s = document.createElement('script');
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
}

async function boot() {
  if (document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  // 토스 밖(브라우저로 열어 본 경우): PLATFORM 없이 그대로 실행 — 게임이 브라우저 저장소를 쓴다
  if (!inToss()) { runGame(); return; }

  // 1) 저장 값 불러오기 (게임이 동기 읽기를 하므로 시작 전에 메모리로)
  const LATE = {};
  let load = null;
  try { load = Promise.resolve(Storage.getItem(STORE_KEY)); } catch (e) { load = Promise.reject(e); }
  load.catch(() => {});
  let raw = LATE;
  try { raw = await withTimeout(load.then((v) => (v == null ? null : v)), 1500); if (raw === undefined) raw = LATE; } catch (e) { raw = LATE; }
  if (raw !== LATE) {
    loaded = true;
    try { if (raw) Object.assign(mem, JSON.parse(raw)); } catch (e) {}
  } else {
    // 1.5초 안에 못 읽음: 게임은 먼저 시작하고, 답이 오면 지난 기록을 합친 뒤에야 저장한다
    load.then((late) => {
      let old = {};
      try { old = late ? JSON.parse(late) : {}; } catch (e) { old = {}; }
      Object.keys(old).forEach((k) => {
        if (!dirty[k]) { mem[k] = old[k]; return; }
        if (k === 'cp-best' || k === 'cp-stages') mem[k] = String(Math.max(parseInt(old[k], 10) || 0, parseInt(mem[k], 10) || 0));
        else if (k === 'cp-did') mem[k] = old[k]; // 기기 번호는 예전 것을 지킨다(다음 날 다시 옴·반반 그룹이 흔들리지 않게)
      });
      loaded = true; saveSoon();
    }).catch(() => {}); // 끝내 못 읽으면 이번 실행 기록은 저장하지 않는다(지난 기록 보호가 먼저)
  }
  // 처음 토스에서 열 때: 같은 기기 브라우저 기록이 있으면 가져옴(없으면 빈 값)
  try {
    if (loaded && !Object.keys(mem).length && window.localStorage) {
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('cp-') === 0) mem[k] = localStorage.getItem(k); }
    }
  } catch (e) {}

  // 2) 사용자 식별키 발급·저장 (검수표). 수집 서버로는 보내지 않는다 — 다시 접속해도 같은 사람인지 기기 안에서만 확인
  try {
    const r = await withTimeout(User.getAnonymousKey());
    if (r && r.hash) { mem['cp-tosskey'] = r.hash; saveSoon(); }
  } catch (e) {}

  window.PLATFORM = {
    name: 'toss',
    store: {
      get: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      set: (k, v) => { mem[k] = String(v); dirty[k] = 1; saveSoon(); },
    },
    exit: () => { try { closeView(); } catch (e) {} },
    onBack: (fn) => {
      try { graniteEvent.addEventListener('backEvent', { onEvent: () => fn(), onError: () => {} }); } catch (e) {}
    },
    haptic: (kind) => { try { generateHapticFeedback({ type: kind === 'strong' ? 'basicMedium' : 'tickWeak' }); } catch (e) {} },
    // 사용자 행동 기록(앱인토스 게임 필수 기능 중 하나): 게임의 익명 기록과 같은 사건을 토스 기록에도
    log: (name, params) => { try { eventLog({ log_name: name, log_type: 'event', params: params || {} }).catch(() => {}); } catch (e) {} },
    // 리더보드: 끝없이 모드 점수를 토스 게임센터 순위에 올리고, 판 끝 화면에서 순위를 연다
    submitScore: (n) => { try { if (!submitGameCenterLeaderBoardScore.isSupported || submitGameCenterLeaderBoardScore.isSupported()) submitGameCenterLeaderBoardScore({ score: String(n) }).catch(() => {}); } catch (e) {} },
    // 공유: 토스 공유 시트로 결과 글 + 토스 안에서 이 게임을 여는 주소(만들기 실패하면 글만)
    share: async (text) => {
      let link = '';
      try { link = await withTimeout(Share.createLink({ path: 'intoss://' + APP_NAME + '?src=share' }), 2000) || ''; } catch (e) {}
      try { await Share.sendMessage({ message: link ? text + ' ' + link : text }); } catch (e) {}
    },
    openRanking: (() => { try { return openGameCenterLeaderboard.isSupported && !openGameCenterLeaderboard.isSupported() ? null : () => { openGameCenterLeaderboard().catch(() => {}); }; } catch (e) { return null; } })(),
  };
  applySafeArea();

  // 3) 게임 본체 실행
  runGame();
}

boot();
