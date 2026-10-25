// 플레이 기록 분석: 수집 서버에서 받은 하루치 기록(NDJSON, 한 줄 = 기록 하나)을 읽어 표로 낸다.
// 쓰는 법: node tools/analyze.js data/2026-10-24.ndjson [data/2026-10-25.ndjson ...] [--md 보고서.md]
// 받는 법: EXPORT_KEY=... node tools/fetch-export.js 2026-10-24   (열쇠는 수집 서버 설정에 있음)
//
// 보는 것
//  1. 흐름: 화면 연 사람 → 첫 판 시작 → 첫 수 → 판 끝까지 / 판 도중 나감
//  2. 판: 모드별 판 수, 놓은 수 가운데값, 끝난 이유
//  3. 스테이지별 깨는 비율, 오늘의 임무 참여·완수·가장 적은 수
//  4. 다음 날 다시 온 비율(기기 번호 did 기준, 한국 시간 날짜)
//  5. 광고(src·ad)별 유입과 첫 판 끝까지 간 비율
//  6. 반반 비교(ab): 그룹별 주요 비율과 차이가 우연인지(두 비율 z 검정)
//  7. 공유 단추를 누른 판·탭, 공유 주소(src=share)로 들어온 탭
'use strict';
var fs = require('fs');

function kstDay(ms) { var d = new Date(ms + 9 * 3600 * 1000); return d.toISOString().slice(0, 10); }
function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor((b.length - 1) / 2)]; }
function pct(n, d) { return d ? Math.round(1000 * n / d) / 10 : null; }
function fmtPct(n, d) { return d ? pct(n, d) + '% (' + n + '/' + d + ')' : '-'; }
// 두 비율 차이 z 검정 (양쪽). 표본이 작으면 결론 내지 않도록 n 표시를 같이 본다
function zTest(x1, n1, x2, n2) {
  if (!n1 || !n2) return null;
  var p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2);
  var se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  var z = (p1 - p2) / se;
  // 정규분포 양쪽 p값 (Abramowitz-Stegun 근사)
  var t = 1 / (1 + 0.2316419 * Math.abs(z));
  var dd = 0.3989423 * Math.exp(-z * z / 2);
  var q = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return { z: Math.round(z * 100) / 100, p: Math.round(2 * q * 1000) / 1000 };
}

function load(files) {
  var rows = [];
  files.forEach(function (f) {
    fs.readFileSync(f, 'utf8').split('\n').forEach(function (line) {
      line = line.trim(); if (!line) return;
      try { rows.push(JSON.parse(line)); } catch (e) {}
    });
  });
  rows.sort(function (a, b) { return (a.at || 0) - (b.at || 0) || (a.n || 0) - (b.n || 0); });
  return rows;
}

// 탭(sid)마다 판 단위로 묶는다: start 부터 다음 start 전까지가 한 판
function games(rows) {
  var bySid = {}, out = [];
  rows.forEach(function (e) { (bySid[e.sid] = bySid[e.sid] || []).push(e); });
  Object.keys(bySid).forEach(function (sid) {
    var cur = null, idx = 0;
    bySid[sid].sort(function (a, b) { return (a.n || 0) - (b.n || 0); }).forEach(function (e) {
      if (e.type === 'start') {
        if (cur) out.push(cur);
        cur = { sid: sid, did: e.did || null, ab: e.ab || null, ver: e.ver || null, src: e.src || 'direct', ad: e.ad || '', mode: e.mode || 'classic', stage: e.stage || null, day: e.day || null, at: e.at, idx: idx++, moved: false, end: null, leave: null };
      } else if (cur) {
        if (e.type === 'first_move') cur.moved = true;
        else if (e.type === 'end') cur.end = e;
        else if (e.type === 'leave') cur.leave = e;
        else if (e.type === 'share') cur.shared = true;
      }
    });
    if (cur) out.push(cur);
  });
  return out;
}

function analyze(rows) {
  var G = games(rows), r = {};
  var sids = {}, firstGame = {};
  G.forEach(function (g) { sids[g.sid] = 1; if (g.idx === 0) firstGame[g.sid] = g; });
  var firsts = Object.keys(firstGame).map(function (k) { return firstGame[k]; });
  r.tabs = Object.keys(sids).length;
  r.devices = Object.keys(G.reduce(function (o, g) { if (g.did) o[g.did] = 1; return o; }, {})).length;
  r.funnel = {
    tabs: r.tabs,
    firstMove: firsts.filter(function (g) { return g.moved; }).length,
    firstEnd: firsts.filter(function (g) { return g.end; }).length,
    firstLeave: firsts.filter(function (g) { return g.leave && !g.end; }).length,
    replayed: Object.keys(sids).filter(function (s) { return G.some(function (g) { return g.sid === s && g.idx >= 1; }); }).length
  };
  // 모드별
  r.modes = {};
  G.forEach(function (g) {
    var m = r.modes[g.mode] = r.modes[g.mode] || { games: 0, ended: 0, left: 0, placements: [], causes: {} };
    m.games++;
    if (g.end) { m.ended++; m.placements.push(g.end.placements || 0); m.causes[g.end.cause || '?'] = (m.causes[g.end.cause || '?'] || 0) + 1; }
    else if (g.leave) { m.left++; m.placements.push(g.leave.placements || 0); }
  });
  // 스테이지
  r.stages = {};
  G.filter(function (g) { return g.mode === 'stage' && g.stage; }).forEach(function (g) {
    var s = r.stages[g.stage] = r.stages[g.stage] || { games: 0, clear: 0, left: 0 };
    s.games++; if (g.end && g.end.cause === 'clear') s.clear++; if (!g.end && g.leave) s.left++;
  });
  // 오늘의 임무
  r.daily = {};
  G.filter(function (g) { return g.mode === 'daily' && g.day; }).forEach(function (g) {
    var d = r.daily[g.day] = r.daily[g.day] || { games: 0, players: {}, clears: 0, best: null, clearPlacements: [] };
    d.games++; d.players[g.did || g.sid] = 1;
    if (g.end && g.end.cause === 'clear') { d.clears++; d.clearPlacements.push(g.end.placements); if (d.best == null || g.end.placements < d.best) d.best = g.end.placements; }
  });
  // 다음 날 다시 온 비율: 기기별 처음 본 날 → 그 다음 날에도 있었나
  var seen = {};
  rows.forEach(function (e) { if (!e.did || !e.at) return; var day = kstDay(e.at); (seen[e.did] = seen[e.did] || {})[day] = 1; });
  // 기록의 마지막 날 처음 온 기기는 다음 날 기록이 아직 없으니 분모에서 뺀다(표에는 「다음 날 기록 없음」)
  var lastDay = Object.keys(rows.reduce(function (o, e) { if (e.at) o[kstDay(e.at)] = 1; return o; }, {})).sort().pop() || '';
  function nextDay(d0) { return kstDay(Date.parse(d0 + 'T00:00:00+09:00') + 24 * 3600 * 1000); }
  var cohorts = {};
  Object.keys(seen).forEach(function (did) {
    var d0 = Object.keys(seen[did]).sort()[0];
    var c = cohorts[d0] = cohorts[d0] || { devices: 0, d1: 0, open: d0 >= lastDay };
    c.devices++; if (seen[did][nextDay(d0)]) c.d1++;
  });
  r.retention = cohorts;
  // 공유
  var sharedTabs = {};
  G.forEach(function (g) { if (g.shared) sharedTabs[g.sid] = 1; });
  r.shares = { games: G.filter(function (g) { return g.shared; }).length, tabs: Object.keys(sharedTabs).length, fromShare: firsts.filter(function (g) { return g.src === 'share'; }).length };
  // 광고별
  r.sources = {};
  firsts.forEach(function (g) {
    var k = g.src + (g.ad ? '/' + g.ad : '');
    var s = r.sources[k] = r.sources[k] || { tabs: 0, moved: 0, ended: 0 };
    s.tabs++; if (g.moved) s.moved++; if (g.end) s.ended++;
  });
  // 반반 비교
  r.ab = {};
  ['A', 'B'].forEach(function (grp) {
    var fg = firsts.filter(function (g) { return g.ab === grp; });
    var dev = Object.keys(seen).filter(function (did) { return G.some(function (g) { return g.did === did && g.ab === grp; }); });
    var d1 = 0, d1n = 0;
    dev.forEach(function (did) {
      var d0 = Object.keys(seen[did]).sort()[0];
      if (d0 >= lastDay) return; // 다음 날 기록이 아직 없는 기기
      d1n++; if (seen[did][nextDay(d0)]) d1++;
    });
    r.ab[grp] = {
      tabs: fg.length,
      moved: fg.filter(function (g) { return g.moved; }).length,
      ended: fg.filter(function (g) { return g.end; }).length,
      replayed: fg.filter(function (g) { return G.some(function (h) { return h.sid === g.sid && h.idx >= 1; }); }).length,
      devices: d1n, d1: d1,
      endedAll: G.filter(function (g) { return g.ab === grp && g.end; }).length,
      babyLoss: G.filter(function (g) { return g.ab === grp && g.end && g.end.cause === 'baby'; }).length,
      shared: fg.filter(function (g) { return G.some(function (h) { return h.sid === g.sid && h.shared; }); }).length,
      vers: Object.keys(fg.reduce(function (o, g) { if (g.ver) o[g.ver] = 1; return o; }, {}))
    };
  });
  var A = r.ab.A, B = r.ab.B;
  r.abTests = {
    '첫 수까지': zTest(A.moved, A.tabs, B.moved, B.tabs),
    '첫 판 끝까지': zTest(A.ended, A.tabs, B.ended, B.tabs),
    '다시 하기': zTest(A.replayed, A.tabs, B.replayed, B.tabs),
    '다음 날 다시 옴': zTest(A.d1, A.devices, B.d1, B.devices),
    '까마귀에 져서 끝난 판': zTest(A.babyLoss, A.endedAll, B.babyLoss, B.endedAll),
    '공유한 탭': zTest(A.shared, A.tabs, B.shared, B.tabs)
  };
  return r;
}

function toMarkdown(r, files) {
  var L = [];
  L.push('# 젤리 패닉 플레이 기록 분석');
  L.push('');
  L.push('기록 파일: ' + files.map(function (f) { return f.split('/').pop(); }).join(', '));
  L.push('');
  L.push('## 흐름 (탭 기준 첫 판)');
  var f = r.funnel;
  L.push('| 단계 | 비율 |'); L.push('|---|---|');
  L.push('| 화면 연 탭 | ' + f.tabs + ' (기기 ' + r.devices + ') |');
  L.push('| 첫 수까지 | ' + fmtPct(f.firstMove, f.tabs) + ' |');
  L.push('| 첫 판 끝까지 | ' + fmtPct(f.firstEnd, f.tabs) + ' |');
  L.push('| 첫 판 도중 나감 | ' + fmtPct(f.firstLeave, f.tabs) + ' |');
  L.push('| 두 판 이상 | ' + fmtPct(f.replayed, f.tabs) + ' |');
  L.push('');
  L.push('## 모드별 판');
  L.push('| 모드 | 판 | 끝까지 | 도중 나감 | 놓은 수 가운데값 | 끝난 이유 |'); L.push('|---|---|---|---|---|---|');
  Object.keys(r.modes).forEach(function (k) {
    var m = r.modes[k];
    L.push('| ' + k + ' | ' + m.games + ' | ' + m.ended + ' | ' + m.left + ' | ' + (median(m.placements) == null ? '-' : median(m.placements)) + ' | ' + Object.keys(m.causes).map(function (c) { return c + ' ' + m.causes[c]; }).join(', ') + ' |');
  });
  L.push('');
  if (Object.keys(r.stages).length) {
    L.push('## 스테이지별');
    L.push('| 스테이지 | 판 | 깸 | 도중 나감 |'); L.push('|---|---|---|---|');
    Object.keys(r.stages).sort(function (a, b) { return a - b; }).forEach(function (k) { var s = r.stages[k]; L.push('| ' + k + ' | ' + s.games + ' | ' + fmtPct(s.clear, s.games) + ' | ' + s.left + ' |'); });
    L.push('');
  }
  if (Object.keys(r.daily).length) {
    L.push('## 오늘의 임무');
    L.push('| 날짜 | 참여 기기 | 판 | 완수 판 | 가장 적은 수 | 완수 수 가운데값 |'); L.push('|---|---|---|---|---|---|');
    Object.keys(r.daily).sort().forEach(function (k) { var d = r.daily[k]; L.push('| ' + k + ' | ' + Object.keys(d.players).length + ' | ' + d.games + ' | ' + d.clears + ' | ' + (d.best == null ? '-' : d.best) + ' | ' + (median(d.clearPlacements) == null ? '-' : median(d.clearPlacements)) + ' |'); });
    L.push('');
  }
  L.push('## 다음 날 다시 온 비율 (처음 온 날 기준)');
  L.push('| 처음 온 날 | 기기 | 다음 날 다시 옴 |'); L.push('|---|---|---|');
  Object.keys(r.retention).sort().forEach(function (k) { var c = r.retention[k]; L.push('| ' + k + ' | ' + c.devices + ' | ' + (c.open ? '다음 날 기록 없음' : fmtPct(c.d1, c.devices)) + ' |'); });
  L.push('');
  L.push('## 유입 (광고 꼬리표별 첫 판)');
  L.push('| 꼬리표 | 탭 | 첫 수까지 | 첫 판 끝까지 |'); L.push('|---|---|---|---|');
  Object.keys(r.sources).sort(function (a, b) { return r.sources[b].tabs - r.sources[a].tabs; }).forEach(function (k) { var s = r.sources[k]; L.push('| ' + k + ' | ' + s.tabs + ' | ' + fmtPct(s.moved, s.tabs) + ' | ' + fmtPct(s.ended, s.tabs) + ' |'); });
  L.push('');
  L.push('## 공유');
  L.push('| | 수 |'); L.push('|---|---|');
  L.push('| 공유 단추를 누른 판 | ' + r.shares.games + ' |');
  L.push('| 공유한 탭 | ' + fmtPct(r.shares.tabs, r.tabs) + ' |');
  L.push('| 공유 주소로 들어온 탭 | ' + fmtPct(r.shares.fromShare, r.tabs) + ' |');
  L.push('');
  L.push('## 반반 비교 (A/B)');
  L.push('| | A | B | 차이가 우연일 확률(p) |'); L.push('|---|---|---|---|');
  var A = r.ab.A, B = r.ab.B, T = r.abTests;
  L.push('| 공개판 번호 | ' + A.vers.join(', ') + ' | ' + B.vers.join(', ') + ' | |');
  [['첫 수까지', 'moved', 'tabs'], ['첫 판 끝까지', 'ended', 'tabs'], ['다시 하기', 'replayed', 'tabs'], ['다음 날 다시 옴', 'd1', 'devices'], ['까마귀에 져서 끝난 판', 'babyLoss', 'endedAll'], ['공유한 탭', 'shared', 'tabs']].forEach(function (x) {
    var t = T[x[0]];
    L.push('| ' + x[0] + ' | ' + fmtPct(A[x[1]], A[x[2]]) + ' | ' + fmtPct(B[x[1]], B[x[2]]) + ' | ' + (t ? t.p : '-') + ' |');
  });
  L.push('');
  L.push('p가 0.05보다 작으면 두 그룹 차이가 우연으로 보기 어렵다는 뜻. 그룹마다 수백 명 아래면 p가 작아도 판정을 미룬다.');
  return L.join('\n') + '\n';
}

if (require.main === module) {
  var args = process.argv.slice(2), mdOut = null, files = [];
  for (var i = 0; i < args.length; i++) { if (args[i] === '--md') mdOut = args[++i]; else files.push(args[i]); }
  if (!files.length) { console.error('쓰는 법: node tools/analyze.js <기록.ndjson> ... [--md 보고서.md]'); process.exit(2); }
  var md = toMarkdown(analyze(load(files)), files);
  if (mdOut) fs.writeFileSync(mdOut, md); else process.stdout.write(md);
}
module.exports = { load: load, games: games, analyze: analyze, toMarkdown: toMarkdown, zTest: zTest, kstDay: kstDay };
