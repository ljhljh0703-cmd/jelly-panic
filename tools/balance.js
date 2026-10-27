// 밸런스 측정: 자동 플레이로 모드·스테이지·오늘의 임무를 돌려 숫자를 낸다. 규칙을 바꾸면 전후로 돌려 비교한다.
// 쓰는 법:
//   node tools/balance.js                      → 표 출력 (기본 판 수)
//   node tools/balance.js --quick              → 판 수를 줄여 빠르게(대략 확인용)
//   node tools/balance.js --json out.json      → 결과 저장
//   node tools/balance.js --compare docs/codex/baseline.json   → 기준과 차이(%p, 수) 표시
// 봇 두 종류(사람 기록이 쌓이기 전까지의 대리 지표):
//   초보 = 절반은 「당장 점수 많이 나는 곳」, 절반은 아무 데나 (처음 해 보는 사람에 가까움)
//   익숙 = 늘 「당장 점수 많이 나는 곳」, 소중한 것을 뺏기는 수는 두지 않음
// 모든 무작위는 seed 로 고정 → 같은 코드면 같은 숫자.
'use strict';
var path = require('path'), fs = require('fs');
var C = require(path.join(__dirname, '..', 'src', 'core.js'));
var args = process.argv.slice(2);
var QUICK = args.indexOf('--quick') >= 0;
var outJson = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : null;
var cmpFile = args.indexOf('--compare') >= 0 ? args[args.indexOf('--compare') + 1] : null;
var G_CLASSIC = QUICK ? 60 : 200, G_STAGE = QUICK ? 40 : 150, DAYS = QUICK ? 30 : 90, MAXMOVES = 400;

function rng(seed) { var v = seed | 0; return function () { v = (v + 0x6D2B79F5) | 0; var t = Math.imul(v ^ (v >>> 15), v | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function legal(s) { var o = []; for (var i = 0; i < 3; i++) { if (s.tray[i] == null) continue; for (var r = 0; r < C.N; r++) for (var c = 0; c < C.N; c++) if (C.canPlace(s, s.tray[i], r, c)) o.push([i, r, c]); } return o; }
function best(s, ms) {
  var b = ms[0], bg = -1e18;
  for (var k = 0; k < ms.length; k++) {
    var m = ms[k], p = C.previewPlace(s, s.tray[m[0]], m[1], m[2], s.trayColors[m[0]]);
    if (!p) continue;
    var g = p.gained + (p.rescued ? 500 : 0) - (p.babyEaten ? 99999 : 0);
    if (g > bg) { bg = g; b = m; }
  }
  return b;
}
function play(s, kind, seed) {
  var R = rng(seed), n = 0;
  while (!s.over && n < MAXMOVES) {
    var ms = legal(s);
    if (!ms.length) { var d = s.tray[0] != null ? 0 : s.tray[1] != null ? 1 : 2; if (s.tray[d] == null) break; C.discard(s, d); n++; continue; }
    var m = kind === 'expert' || R() < 0.5 ? best(s, ms) : ms[Math.floor(R() * ms.length)];
    C.place(s, m[0], m[1], m[2]); n++;
  }
  return s;
}
function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; }
function pct(n, d) { return d ? Math.round(1000 * n / d) / 10 : 0; }

var out = { at: new Date().toISOString(), quick: QUICK, classic: {}, defense: {}, stages: [], daily: {} };
['novice', 'expert'].forEach(function (kind) {
  ['classic', 'defense'].forEach(function (mode) {
    var pl = [], r20 = 0, r70 = 0, causes = {};
    for (var g = 0; g < G_CLASSIC; g++) {
      var s = play(C.newGame(7000 + g, { mode: mode }), kind, 9000 + g);
      pl.push(s.placements); if (s.placements >= 20) r20++; if (s.placements >= 70) r70++;
      causes[s.overCause || 'limit'] = (causes[s.overCause || 'limit'] || 0) + 1;
    }
    out[mode][kind] = { games: G_CLASSIC, medianMoves: median(pl), reach20: pct(r20, G_CLASSIC), reach70: pct(r70, G_CLASSIC), causes: causes };
  });
});
for (var i = 0; i < C.STAGES.length; i++) {
  var row = { stage: i + 1 };
  ['novice', 'expert'].forEach(function (kind) {
    var w = 0;
    for (var g = 1; g <= G_STAGE; g++) if (play(C.newGame(g * 104729 + i, { mode: 'stage', stage: i }), kind, g * 31 + i).overCause === 'clear') w++;
    row[kind] = pct(w, G_STAGE);
  });
  out.stages.push(row);
}
['novice', 'expert'].forEach(function (kind) {
  var w = 0, moves = [];
  for (var d = 0; d < DAYS; d++) {
    var dt = new Date(Date.UTC(2026, 10, 1) + d * 86400000), key = dt.getUTCFullYear() + ('0' + (dt.getUTCMonth() + 1)).slice(-2) + ('0' + dt.getUTCDate()).slice(-2);
    var s = play(C.newGame(0, { mode: 'daily', daily: C.daily(key) }), kind, 500 + d);
    if (s.overCause === 'clear') { w++; moves.push(s.placements); }
  }
  out.daily[kind] = { days: DAYS, clear: pct(w, DAYS), medianClearMoves: median(moves) };
});

var base = cmpFile ? JSON.parse(fs.readFileSync(cmpFile, 'utf8')) : null;
function delta(v, b, unit) { if (b == null || v == null) return ''; var d = Math.round((v - b) * 10) / 10; return d === 0 ? ' (=)' : ' (' + (d > 0 ? '+' : '') + d + unit + ')'; }
console.log('끝없이·디펜스 (봇 ' + G_CLASSIC + '판)');
['classic', 'defense'].forEach(function (mode) {
  ['novice', 'expert'].forEach(function (kind) {
    var o = out[mode][kind], b = base && base[mode] && base[mode][kind];
    console.log('  ' + mode + ' ' + (kind === 'novice' ? '초보' : '익숙') + ': 놓은 수 가운데값 ' + o.medianMoves + delta(o.medianMoves, b && b.medianMoves, '수') + ' · 20수 도달 ' + o.reach20 + '%' + delta(o.reach20, b && b.reach20, '%p') + ' · 70수 도달 ' + o.reach70 + '%' + delta(o.reach70, b && b.reach70, '%p') + ' · 끝난 이유 ' + JSON.stringify(o.causes));
  });
});
console.log('스테이지 깨는 비율 % (봇 ' + G_STAGE + '판) — 초보 / 익숙');
out.stages.forEach(function (r, k) {
  var b = base && base.stages && base.stages[k];
  console.log('  ' + ('0' + r.stage).slice(-2) + ': ' + r.novice + delta(r.novice, b && b.novice, '%p') + ' / ' + r.expert + delta(r.expert, b && b.expert, '%p'));
});
console.log('오늘의 임무 (' + DAYS + '일치)');
['novice', 'expert'].forEach(function (kind) {
  var o = out.daily[kind], b = base && base.daily && base.daily[kind];
  console.log('  ' + (kind === 'novice' ? '초보' : '익숙') + ': 깨는 비율 ' + o.clear + '%' + delta(o.clear, b && b.clear, '%p') + ' · 깬 판 수 가운데값 ' + o.medianClearMoves);
});
if (outJson) { fs.writeFileSync(outJson, JSON.stringify(out, null, 1)); console.log('저장: ' + outJson); }
