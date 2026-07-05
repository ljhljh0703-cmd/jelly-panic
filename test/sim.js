// 과제 A 실측 시뮬레이션 — 다수 판 자동 플레이로 "회피 불가능한 스폰 발생률 = 0%"를 검증하고
// 위협 밀도 상한(MAX_THREATS=4)의 실측 근거를 남긴다. node sim.js [판수] — 결정론(정책 RNG도 seed 계통).
// 대조군: 각 스폰 기회마다 "구버전(무검증) 풀에서 뽑았다면 덮기 불가였을 확률"을 반사실로 집계.
'use strict';
var C = require('./core.js');
var fs = require('fs');

var GAMES = +process.argv[2] || 500;
var MAX_MOVES = 400;
var POLICY = process.argv[3] || 'random'; // random | greedy (세션11: 승리 조건 결정 데이터용)

// 정책 RNG — 게임 rng와 분리된 mulberry32 (Math.random 금지)
function makeRng(seed) {
  var s = { v: seed | 0 };
  return function () {
    s.v = (s.v + 0x6D2B79F5) | 0;
    var t = s.v;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function legalMoves(state) {
  var out = [];
  for (var i = 0; i < 3; i++) {
    if (state.tray[i] == null) continue;
    for (var r = 0; r < C.N; r++)
      for (var c = 0; c < C.N; c++)
        if (C.canPlace(state, state.tray[i], r, c)) out.push([i, r, c]);
  }
  return out;
}

var agg = {
  games: 0, moves: 0, spawns: 0,
  uncoverableSpawns: 0,       // 핵심 지표 — 0이어야 함
  deferrals: 0,               // 스폰 보류 발생 (검증이 실제로 개입한 횟수)
  legacyRiskCells: 0, legacyPoolCells: 0, // 반사실: 구버전 풀 중 덮기 불가 칸 비율
  maxThreatsSeen: 0, chainMax: 0, chains2plus: 0,
  bombsGranted: 0, bombsUsed: 0, coverageLost: 0, // 세션3
  spawnTypes: {}, grants: {}, rescues: 0, babySpawns: 0, deathBaby: 0, deathSpace: 0, // 세션4
  holesAtOver: [], movesPerGame: [], scores: []
};

function emptyNoThreat(state) {
  var out = [];
  for (var r = 0; r < C.N; r++)
    for (var c = 0; c < C.N; c++)
      if (state.grid[r][c] === C.EMPTY && !C.threatAt(state, r, c)) out.push([r, c]);
  return out;
}

for (var g = 1; g <= GAMES; g++) {
  var s = C.newGame(g * 7919 + 13);
  var pick = makeRng(g ^ 0x9E3779B9);
  var moves = 0;
  while (!s.over && moves < MAX_MOVES) {
    var ms = legalMoves(s);
    if (ms.length === 0) break;
    var m;
    if (POLICY === 'greedy') {
      // greedy: previewPlace 이득 최대 수 (구출 +500 가중, 아기 위험 수 -99999) — 결정적(동률 시 첫 수)
      var bestG = -Infinity;
      m = ms[0];
      for (var gi = 0; gi < ms.length; gi++) {
        var mv = ms[gi];
        var pv = C.previewPlace(s, s.tray[mv[0]], mv[1], mv[2], s.trayColors ? s.trayColors[mv[0]] : null);
        if (!pv) continue;
        var g = pv.gained + (pv.rescued ? 500 : 0) - (pv.babyEaten ? 99999 : 0);
        if (g > bestG) { bestG = g; m = mv; }
      }
    } else {
      m = ms[Math.floor(pick() * ms.length)];
    }
    // 스폰 기회 사전 판정 (place 직전 반사실 집계용) — 세션3 난이도 커브 반영
    var dNext = C.difficulty(s.placements + 1);
    var willTrySpawn = ((s.placements + 1) % dNext.spawnEvery === 0) && s.threats.length < dNext.maxThreats;
    var ev = C.place(s, m[0], m[1], m[2]);
    moves++;
    if (ev.chain && ev.chain.length > agg.chainMax) agg.chainMax = ev.chain.length;
    if (ev.chain && ev.chain.length >= 2) agg.chains2plus++;
    if (ev.bombGranted) agg.bombsGranted++;
    if (ev.bomb) agg.bombsUsed++;
    if (ev.granted != null) agg.grants[ev.granted] = (agg.grants[ev.granted] || 0) + 1;
    if (ev.rescued) agg.rescues += ev.rescued;
    if (ev.babySpawn) agg.babySpawns++;
    if (ev.spawned.length > 0) {
      for (var si = 0; si < ev.spawned.length; si++) { // 세션12: 더블 스폰 대응 — 전 스폰 검증
        agg.spawns++;
        var sp = ev.spawned[si];
        agg.spawnTypes[sp[2]] = (agg.spawnTypes[sp[2]] || 0) + 1;
        // 핵심 검증 — 설탕은 내 블록 타겟(비치명·덮기 개념 없음)이라 coverable 검증 대상 아님
        if (sp[2] !== 'crust' && !C.canCoverCell(s, sp[0], sp[1])) agg.uncoverableSpawns++;
      }
    } else if (willTrySpawn && !s.over) {
      agg.deferrals++; // 스폰 기회였으나 보류(coverable 후보 0 또는 풀 0)
    }
    // 반사실: 이 시점 구버전 풀(무검증)에서 덮기 불가 칸이 몇 개였나
    if (willTrySpawn) {
      var pool = emptyNoThreat(s);
      for (var p = 0; p < pool.length; p++) {
        agg.legacyPoolCells++;
        if (!C.canCoverCell(s, pool[p][0], pool[p][1])) agg.legacyRiskCells++;
      }
    }
    if (s.threats.length > agg.maxThreatsSeen) agg.maxThreatsSeen = s.threats.length;
  }
  agg.games++;
  if (s.overCause === 'baby') agg.deathBaby++; else if (s.over) agg.deathSpace++;
  agg.coverageLost += (s.telemetry ? s.telemetry.coverageLost : 0);
  agg.moves += moves;
  agg.movesPerGame.push(moves);
  agg.scores.push(s.score);
  agg.holesAtOver.push(C.countCells(s, C.HOLE));
}

function stat(a) {
  var sum = 0, mx = 0; a.forEach(function (v) { sum += v; if (v > mx) mx = v; });
  var srt = a.slice().sort(function (x, y) { return x - y; });
  return { avg: (sum / a.length).toFixed(1), med: srt[(a.length / 2) | 0], max: mx };
}

var mv = stat(agg.movesPerGame), sc = stat(agg.scores), ho = stat(agg.holesAtOver);
var report = [
  '# 과제 A 시뮬레이션 리포트 — ' + new Date().toISOString().slice(0, 10) + ' (정책: ' + POLICY + ')',
  '판수: ' + agg.games + ' (' + POLICY + ' 정책, 전 판 결정론 seed)',
  '총 배치: ' + agg.moves + ' / 총 스폰: ' + agg.spawns,
  '',
  '## 핵심 게이트',
  '회피(덮기) 불가능한 스폰: ' + agg.uncoverableSpawns + '건 → 발생률 ' + (agg.spawns ? (100 * agg.uncoverableSpawns / agg.spawns).toFixed(2) : 0) + '% (요구: 0%)',
  '',
  '## 검증 개입 실측',
  '스폰 보류(coverable 후보 0): ' + agg.deferrals + '건 — 규칙이 실제로 막은 상황 수',
  '반사실(구버전 무검증 풀): 스폰 후보 ' + agg.legacyPoolCells + '칸 중 덮기 불가 ' + agg.legacyRiskCells + '칸 = ' + (agg.legacyPoolCells ? (100 * agg.legacyRiskCells / agg.legacyPoolCells).toFixed(1) : 0) + '% — 구버전이라면 이 비율만큼 불합리 스폰 위험',
  '',
  '## 밀도 상한 근거 (MAX_THREATS=4 상수화)',
  '동시 위협 최대 관측: ' + agg.maxThreatsSeen + ' (상한 4 준수)',
  '게임오버 시 구멍 수: avg ' + ho.avg + ' / med ' + ho.med + ' / max ' + ho.max,
  '판 길이(배치 수): avg ' + mv.avg + ' / med ' + mv.med + ' / max ' + mv.max,
  '점수: avg ' + sc.avg + ' / med ' + sc.med + ' / max ' + sc.max,
  '',
  '## 과제 B 부수 관측',
  '2연쇄 이상 발생: ' + agg.chains2plus + '회 / 최대 연쇄 단수: ' + agg.chainMax,
  '',
  '## 세션3 관측 (폭탄·텔레메트리)',
  '폭탄 지급: ' + agg.bombsGranted + '회 / 사용: ' + agg.bombsUsed + '회 (랜덤 정책 기준)',
  '대응 가능성 상실 전이(coverageLost): 총 ' + agg.coverageLost + '건 = 판당 ' + (agg.coverageLost / agg.games).toFixed(2) + '건 — 벨 존재 근거·밀도 튜닝 입력',
  '',
  '## 세션4 관측 (디펜스 피벗)',
  '위협 스폰 분포: ' + JSON.stringify(agg.spawnTypes),
  '아이템 지급 분포 (12=폭탄 13/14=롤링핀 15=마카롱): ' + JSON.stringify(agg.grants),
  '아기 등장: ' + agg.babySpawns + '회 / 구출: ' + agg.rescues + '회',
  '사인 분포: 배치불가 ' + agg.deathSpace + ' / 아기 피탈 ' + agg.deathBaby + ' (랜덤 정책 = 아기 방치 → 피탈률 상한 근사)'
].join('\n');

console.log(report);
fs.writeFileSync(__dirname + '/sim-report.txt', report + '\n');
process.exit(agg.uncoverableSpawns > 0 ? 1 : 0);
