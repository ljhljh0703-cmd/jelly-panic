// UI 스모크 테스트 (node, DOM/canvas 스텁) — 초기화·렌더 루프·드래그 배치 시뮬이 예외 없이 돌고 점수가 반영되는지 검증.
// ⚠️ 실브라우저 렌더 증명 아님(픽셀 검증 X) — 화면 발현 최종 확인은 브라우저에서 index.html 열기(H-14 user-facing proof).
'use strict';
var pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FAIL  ' + name); } }

// ── 스텁 ──
var handlers = {};
var ctxCalls = { n: 0 };
function ctxStub() {
  return new Proxy({}, {
    get: function (t, p) {
      if (p === 'canvas') return {};
      return function () { ctxCalls.n++; };
    },
    set: function () { return true; }
  });
}
function makeEl(id) {
  var el = {
    id: id, style: {}, textContent: '', className: '', width: 0, height: 0,
    dataset: {},
    classList: {
      _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; },
      toggle: function (c, v) { if (v) this._s[c] = 1; else delete this._s[c]; }, contains: function (c) { return !!this._s[c]; }
    },
    addEventListener: function (ev, fn) { handlers[id + ':' + ev] = fn; },
    getContext: function () { return ctxStub(); },
    getBoundingClientRect: function () { return { left: 0, top: 100, width: 400, height: 400 }; },
    querySelector: function () { if (!el._cv) el._cv = makeEl(id + '-canvas'); return el._cv; },
    closest: function () { return el; }
  };
  return el;
}
var ids = ['board', 'drag', 'score', 'seed', 'bell', 'restart', 'replay', 'quit', 'over', 'overscore', 'overcause', 'overstats', 'newbest', 'mute', 'photo', 'photoinput', 'share', 'help', 'dex', 'dexlist', 'dexclose', 'mode', 'modes', 'modescard', 'stageinfo', 'modesclose', 'mode-classic', 'mode-stage', 'mode-defense', 'mascot', 'hint', 'tray', 'tierpips', 'bin', 'status', 'toast'];
var els = {}; ids.forEach(function (id) { els[id] = makeEl(id); });
// mascot = SVG 요소 모사: className 읽기 전용(실브라우저 TypeError 재현 — 2026-07-02 블랭크 화면 버그의 진범), setAttribute만 허용
Object.defineProperty(els.mascot, 'className', { get: function () { return ''; }, set: function () { throw new TypeError('Cannot set className on SVGElement (stub)'); } });
els.mascot.setAttribute = function (k, v) { this['_attr_' + k] = v; };
var slots = [0, 1, 2].map(function (i) { var e = makeEl('slot' + i); e.dataset.slot = String(i); return e; });
// 버리기 통은 보드와 겹치지 않는 별도 좌표로 (드래그 스모크가 오작동하지 않게)
els.bin.getBoundingClientRect = function () { return { left: 900, top: 900, width: 60, height: 60 }; };

global.window = global;
global.document = {
  getElementById: function (id) { return els[id]; },
  querySelectorAll: function (sel) { return sel === '.slot' ? slots : []; }
};
global.location = { search: '?seed=777' };
global.innerWidth = 400; global.innerHeight = 800;
global.devicePixelRatio = 1;
var rafCb = null;
global.requestAnimationFrame = function (fn) { rafCb = fn; };
global.addEventListener = function (ev, fn) { handlers['window:' + ev] = fn; };
global.CORE = require('./core.js');

// ── 로드 ──
var threw = null;
try { require('./ui.js'); } catch (e) { threw = e; }
ok(!threw, 'S1 ui.js 초기화 예외 0' + (threw ? ' — ' + threw.message : ''));
ok(els.board.width > 0, 'S2 보드 캔버스 사이즈 설정됨');
ok(els.seed.textContent.indexOf('777') !== -1, 'S3 seed 파라미터 반영');

// ── 렌더 루프 5프레임 ──
threw = null;
try { for (var f = 1; f <= 5; f++) { var cb = rafCb; rafCb = null; cb(f * 16); } } catch (e) { threw = e; }
ok(!threw && ctxCalls.n > 100, 'S4 렌더 5프레임 예외 0 + 드로우콜 발생(' + ctxCalls.n + ')');

// ── 드래그 배치 시뮬 (pointerdown → move 스캔 → up) ──
threw = null;
var placed = false;
try {
  var down = handlers['tray:pointerdown'];
  var move = handlers['window:pointermove'];
  var up = handlers['window:pointerup'];
  outer:
  for (var r = 0; r < 8; r++) {
    for (var c = 0; c < 8; c++) {
      down({ target: slots[0], clientX: 200, clientY: 700, preventDefault: function () {} });
      // moveDrag: gy = clientY - h/2 - 70, bx/by = g - rect(left0,top100) → 역산해 셀 (r,c) 근처로
      var px = 0 + 10 + c * 44 + 60; // 대략치 — round 스냅이라 스캔으로 커버
      var py = 100 + 10 + r * 44 + 60 + 70;
      move({ clientX: px, clientY: py });
      up({});
      if (els.score.textContent !== '0') { placed = true; break outer; }
    }
  }
} catch (e) { threw = e; }
ok(!threw, 'S5 드래그 시퀀스 예외 0' + (threw ? ' — ' + threw.message : ''));
ok(placed, 'S6 배치 성공 → 점수 반영 (score=' + els.score.textContent + ')');

// ── 배치 후 렌더 재확인 ──
threw = null;
try { for (var f2 = 1; f2 <= 3; f2++) { var cb2 = rafCb; rafCb = null; cb2(1000 + f2 * 16); } } catch (e) { threw = e; }
ok(!threw, 'S7 배치 후 렌더 예외 0');

// ── 세션2: 연쇄(과제 B) UI 경로 스모크 — 디버그 훅으로 2연쇄 강제 → 예외 0 + 낙하 애니 프레임 관통 ──
threw = null;
var chainOk = false;
try {
  var hook = global.window.__CP;
  hook.reset(30);
  var st = hook.state();
  for (var cc = 0; cc < 7; cc++) { st.grid[7][cc] = global.CORE.BLOCK; st.grid[6][cc] = global.CORE.BLOCK; }
  st.grid[5][7] = global.CORE.BLOCK;
  st.tray = [0, 0, 0];
  hook.place(0, 7, 7);
  chainOk = st.combo === 2;
  for (var f3 = 1; f3 <= 25; f3++) { var cb3 = rafCb; rafCb = null; cb3(2000 + f3 * 30); } // 낙하 애니(200ms+시차) 구간 관통
} catch (e) { threw = e; }
ok(!threw, 'S8 연쇄 강제 실행 예외 0' + (threw ? ' — ' + threw.message : ''));
ok(chainOk, 'S9 UI 경로에서 연쇄 2단 발생(combo=2)');

// ── 세션3: 드래그 중 미리보기 렌더 경로 (프레임 사이에 렌더 삽입) ──
threw = null;
try {
  var hook2 = global.window.__CP;
  hook2.reset(41);
  var down2 = handlers['tray:pointerdown'], move2 = handlers['window:pointermove'], up2 = handlers['window:pointerup'];
  down2({ target: slots[0], clientX: 200, clientY: 700, preventDefault: function () {} });
  move2({ clientX: 120, clientY: 400 });
  for (var f4 = 1; f4 <= 3; f4++) { var cb4 = rafCb; rafCb = null; cb4(3000 + f4 * 16); } // 미리보기 그리기 관통
  up2({});
} catch (e) { threw = e; }
ok(!threw, 'S10 드래그 중 결과 미리보기 렌더 예외 0' + (threw ? ' — ' + threw.message : ''));

// ── 세션3: 폭탄 UI 경로 (폭발 연출·트레이 폭탄 렌더) ──
threw = null;
var bombOk = false;
try {
  var hook3 = global.window.__CP;
  hook3.reset(42);
  var st3 = hook3.state();
  st3.grid[4][4] = global.CORE.BLOCK; st3.grid[4][5] = global.CORE.BLOCK; st3.grid[5][4] = global.CORE.JELLY;
  st3.tray = [global.CORE.BOMB, 0, 0];
  hook3.place(0, 4, 4); // 폭탄 배치(canPlace: (4,4)는 점유라 불가 → (3,3)로)
  if (st3.grid[4][4] === global.CORE.BLOCK) { hook3.place(0, 3, 3); }
  bombOk = st3.grid[4][4] === global.CORE.EMPTY && st3.grid[4][5] === global.CORE.EMPTY;
  for (var f5 = 1; f5 <= 10; f5++) { var cb5 = rafCb; rafCb = null; cb5(4000 + f5 * 30); }
} catch (e) { threw = e; }
ok(!threw, 'S11 폭탄 실행·렌더 예외 0' + (threw ? ' — ' + threw.message : ''));
ok(bombOk, 'S12 폭탄 3×3 클리어가 UI 경로에서 동작');

// ── 세션4: 롤링핀·마카롱·아기·까마귀 UI 경로 ──
threw = null;
var s4ok = false;
try {
  var hook4 = global.window.__CP;
  hook4.reset(50);
  var st4 = hook4.state();
  st4.grid[3][1] = global.CORE.BLOCK; st4.colors[3][1] = 2;
  st4.grid[3][2] = global.CORE.BLOCK; st4.colors[3][2] = 2;
  st4.tray = [global.CORE.ROCKET_H, global.CORE.MACARON, 0];
  hook4.place(0, 3, 0); // 가로핀 → 3행 클리어
  var rocketOk = st4.grid[3][1] === global.CORE.EMPTY;
  st4.grid[5][5] = global.CORE.BLOCK; st4.colors[5][5] = 1;
  hook4.place(1, 4, 5); // 마카롱 → 인접 색 1 파괴 (중력으로 위치 이동 가능 → 색으로 검사)
  var mac = true;
  for (var mr = 0; mr < 8; mr++) for (var mc = 0; mc < 8; mc++) if (st4.colors[mr][mc] === 1) mac = false;
  // 까마귀 → 아기 게임오버 UI 사인
  hook4.reset(51);
  var st5 = hook4.state();
  st5.grid[5][5] = global.CORE.BABY;
  st5.threats = [{ r: 5, c: 6, type: 'crow', countdown: 1 }];
  st5.tray = [0, 0, 0];
  hook4.place(0, 0, 0);
  var overOk = st5.over && els.overcause.textContent.indexOf('아기') !== -1;
  for (var f6 = 1; f6 <= 10; f6++) { var cb6 = rafCb; rafCb = null; cb6(6000 + f6 * 30); }
  s4ok = rocketOk && mac && overOk;
} catch (e) { threw = e; }
ok(!threw, 'S13 세션4 아이템·디펜스 UI 경로 예외 0' + (threw ? ' — ' + threw.message : ''));
ok(s4ok, 'S14 롤링핀·마카롱·아기 게임오버 사인 동작');

// ── 세션5: 버리기 UI 경로 + 상태 스트립 ──
threw = null;
var s5ok = false;
try {
  var hook5 = global.window.__CP;
  hook5.reset(60);
  var st6 = hook5.state();
  st6.threats = [{ r: 2, c: 2, type: 'crack', countdown: 2 }];
  var before6 = st6.tray.slice();
  hook5.discard(0);
  s5ok = st6.tray[0] == null && st6.threats[0].countdown === 1 && els.status.textContent.indexOf('⚠️') !== -1;
  for (var f7 = 1; f7 <= 5; f7++) { var cb7 = rafCb; rafCb = null; cb7(8000 + f7 * 30); }
} catch (e) { threw = e; }
ok(!threw, 'S15 버리기 UI 경로 예외 0' + (threw ? ' — ' + threw.message : ''));
ok(s5ok, 'S16 버리기 → 위협 전진 + 상태 스트립 갱신');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
