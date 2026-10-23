// 분석 도구 시험: 답을 아는 가짜 기록을 만들어 넣고 표가 그 답을 내는지 본다. (사람 기록 아님)
'use strict';
var A = require('../tools/analyze.js');
var pass = 0, fail = 0;
function ok(c, name) { if (c) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FAIL  ' + name); } }

var DAY1 = Date.parse('2026-10-24T03:00:00Z'), DAY2 = DAY1 + 24 * 3600 * 1000; // 한국 시간 10/24 12시, 10/25 12시
var rows = [], n = 0;
function session(did, ab, at, plan) {
  var sid = 's' + (n++), k = 0;
  function ev(type, extra) { var e = { v: 2, sid: sid, did: did, ab: ab, ver: ab === 'B' ? '20261030-e1' : '20261030', n: k++, type: type, src: plan.src || 'direct', ad: plan.ad || '', at: at + k * 1000 }; for (var x in extra) e[x] = extra[x]; rows.push(e); }
  plan.games.forEach(function (g) {
    ev('start', { mode: g.mode || 'classic', stage: g.stage || null, day: g.day || null });
    if (g.moved !== false) ev('first_move', { mode: g.mode || 'classic' });
    if (g.end) ev('end', { mode: g.mode || 'classic', cause: g.end, placements: g.pl || 20, score: 100 });
    else if (g.leave) ev('leave', { mode: g.mode || 'classic', placements: g.pl || 3 });
    if (g.share) ev('share', { mode: g.mode || 'classic' });
  });
}
// 공유 주소로 들어온 새 기기 2대 (A 그룹)
session('s1', 'A', DAY2, { src: 'share', games: [{ end: 'no-space' }] });
session('s2', 'A', DAY2, { src: 'share', games: [{ leave: true }] });
// A 그룹 10대: 첫 판 끝까지 6대, 그중 다음 날 다시 오는 기기 2대
for (var i = 0; i < 10; i++) {
  session('a' + i, 'A', DAY1, { src: i < 4 ? 'yt' : 'direct', ad: i < 4 ? 'A1' : '', games: [i < 6 ? { end: 'no-space', pl: 30 + i } : { leave: true, pl: 2, moved: i !== 9 }] });
  if (i < 2) session('a' + i, 'A', DAY2, { games: [{ end: 'no-space' }] });
}
// B 그룹 10대: 첫 판 끝까지 9대, 다시 하기 5대, 다음 날 6대
for (var j = 0; j < 10; j++) {
  session('b' + j, 'B', DAY1, { games: j < 9 ? (j < 5 ? [{ end: 'no-space' }, { end: 'baby' }] : [{ end: 'no-space' }]) : [{ leave: true }] });
  if (j < 6) session('b' + j, 'B', DAY2, { games: [{ mode: 'daily', day: 20261025, end: 'clear', pl: 18 + j, share: j < 3 }, { mode: 'stage', stage: 3, end: 'clear' }] });
}
var r = A.analyze(rows);
ok(r.tabs === 30 && r.devices === 22, '탭 30(첫날 20 + 다음 날 8 + 공유로 온 2)·기기 22');
ok(r.ab.A.tabs === 14 && r.ab.B.tabs === 16, '그룹별 탭 수');
ok(r.retention['2026-10-24'].devices === 20 && r.retention['2026-10-24'].d1 === 8 && r.retention['2026-10-25'].devices === 2, '다음 날 다시 온 기기 8/20, 둘째 날 새 기기 2');
ok(r.ab.A.d1 === 2 && r.ab.B.d1 === 6, '그룹별 다음 날 다시 옴 2 / 6');
ok(r.funnel.firstLeave === 6 && r.funnel.firstMove === 29, '첫 판 도중 나감 6·첫 수까지 29');
ok(r.shares.games === 3 && r.shares.tabs === 3 && r.shares.fromShare === 2, '공유 3판·3탭, 공유 주소로 온 탭 2');
ok(r.ab.B.babyLoss === 5 && r.ab.B.endedAll === 26 && r.ab.A.babyLoss === 0, '까마귀에 져서 끝난 판(B 5/26)');
ok(r.daily['20261025'].clears === 6 && r.daily['20261025'].best === 18, '오늘의 임무 완수 6판, 가장 적은 수 18');
ok(r.stages['3'].clear === 6, '스테이지 3 깸 6');
ok(r.sources['yt/A1'].tabs === 4 && r.sources['yt/A1'].ended === 4, '광고 꼬리표별 첫 판');
var z = A.zTest(50, 100, 70, 100);
ok(z && Math.abs(z.z + 2.89) < 0.05 && z.p < 0.01, 'z 검정 값 (50/100 vs 70/100 → z≈-2.89)');
ok(A.kstDay(Date.parse('2026-10-24T15:30:00Z')) === '2026-10-25', '한국 시간 날짜(자정 넘김)');
var md = A.toMarkdown(r, ['x/2026-10-24.ndjson']);
ok(/## 반반 비교/.test(md) && /## 공유/.test(md) && /까마귀에 져서/.test(md) && /## 오늘의 임무/.test(md) && md.indexOf('undefined') < 0 && md.indexOf('NaN') < 0, '보고서 표 생성(빈 값 없음)');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
