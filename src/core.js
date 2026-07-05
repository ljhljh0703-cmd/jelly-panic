// 텔레그래프 퍼즐 코어 로직 — 순수 함수(렌더 0), 브라우저·node 겸용. rng 단일화(seed 기반, Math.random/Date 금지 — INV-D1 준수).
// 규칙 요약: 8x8 보드, 조각 드래그 배치(입력 1종). 모든 위협은 예고됨(균열=구멍化, 젤리=칸 점유). 균열은 덮으면 해체(+보너스), 젤리는 줄 완성에 포함(유도 묘수). 배치 불가 = 게임 오버(사인 가독).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var N = 8;
  var EMPTY = 0, BLOCK = 1, JELLY = 2, HOLE = 3;
  // 세션4 (디펜스 피벗): BABY = 지켜야 할 블록(줄 클리어 = 구출), CRUST = 굳은 설탕(줄 차단, 인접 클리어로 파괴), SLIME = 초코 슬라임(번짐)
  var BABY = 4, CRUST = 5, SLIME = 6;
  var NCOLORS = 5; // 색 마카롱용 코어 색상 수 (캔디크러시 관례: 적을수록 색 타겟팅이 전략적)

  // ── 결정론 RNG (mulberry32, 상태 명시) ──
  function rand(state) {
    state.rngState = (state.rngState + 0x6D2B79F5) | 0;
    var t = state.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(state, n) { return Math.floor(rand(state) * n); }

  // ── 조각 정의 (Block Blast 계열 표준 세트) ──
  var SHAPES = [
    { id: 'dot',  m: [[1]] },
    { id: 'i2h',  m: [[1, 1]] },
    { id: 'i2v',  m: [[1], [1]] },
    { id: 'i3h',  m: [[1, 1, 1]] },
    { id: 'i3v',  m: [[1], [1], [1]] },
    { id: 'sq2',  m: [[1, 1], [1, 1]] },
    { id: 'l3',   m: [[1, 0], [1, 1]] },
    { id: 'j3',   m: [[0, 1], [1, 1]] },
    { id: 'l4',   m: [[1, 0], [1, 0], [1, 1]] },
    { id: 't4',   m: [[1, 1, 1], [0, 1, 0]] },
    { id: 's4',   m: [[0, 1, 1], [1, 1, 0]] },
    { id: 'i4h',  m: [[1, 1, 1, 1]] },
    // 특수 아이템 (콤보/구출 보상 전용 — 리필 랜덤 등장 없음, 전부 드래그 배치 1칸 = 입력 1종 유지)
    { id: 'bomb',     m: [[1]] }, // 세션3: 3×3 폭발 (2연쇄 보상)
    { id: 'rocket_h', m: [[1]] }, // 세션4: 가로 롤링핀 — 행 전체 클리어 (3연쇄 보상, 세로와 교대)
    { id: 'rocket_v', m: [[1]] }, // 세션4: 세로 롤링핀 — 열 전체 클리어
    { id: 'macaron',  m: [[1]] }  // 세션4: 색 마카롱 — 인접 블록 색 전멸 (아기 구출 보상, 작가 확정)
  ];
  var PLAYABLE = 12;  // 리필 추첨 대상 (특수 제외)
  var BOMB = 12, ROCKET_H = 13, ROCKET_V = 14, MACARON = 15;

  var SPAWN_EVERY = 3;   // 배치 N회마다 위협 1개 예고 (티어1 기준 — difficulty() 참조)
  var COUNTDOWN = 3;     // 예고 → 발동까지 배치 수
  var MAX_THREATS = 4;   // 동시 위협 절대 상한 (가독성 — 위협 '수' 아닌 '조합'으로 난이도)

  // 난이도 커브 (세션3·4) — 배치 수 기반 고정 커브. 성과 기반 몰래 보정 아님 = Active DDA 계약 준수. 티어 핍으로 상시 노출.
  // 세션4: 위협 종류도 티어별 순차 등장(캔디크러시 방식) — 첫 10초 이해(Pillar 2)를 지키면서 뒤로 갈수록 몰아침.
  // 세션12 (작가 피드백 "선택 강제"): 티어3+는 스폰 이벤트당 위협 2개 — 전부 못 막는 상황을 의도적으로 생성 (까마귀 잡으면 균열을 포기하는 삼중 판단)
  function difficulty(placements) {
    if (placements >= 70) return { tier: 4, spawnEvery: 2, maxThreats: 5, spawnCount: 2, weights: [['crack', 0.3], ['jelly', 0.15], ['crust', 0.3], ['slime', 0.25]], crowChance: 0.45 };
    if (placements >= 40) return { tier: 3, spawnEvery: 2, maxThreats: 4, spawnCount: 2, weights: [['crack', 0.35], ['jelly', 0.2], ['crust', 0.25], ['slime', 0.2]], crowChance: 0.35 };
    if (placements >= 20) return { tier: 2, spawnEvery: 3, maxThreats: 3, spawnCount: 1, weights: [['crack', 0.4], ['jelly', 0.25], ['crust', 0.35]], crowChance: 0.25 }; // 세션5: 까마귀 조기 등장
    return { tier: 1, spawnEvery: 3, maxThreats: 2, spawnCount: 1, weights: [['crack', 0.6], ['jelly', 0.4]], crowChance: 0 };
  }

  // ── 세션13: 스테이지 임무 (작가 확정 — 쿠키런 모험의 탑 방식). 시간 목표는 턴제 정합상 "수 제한"으로 구현.
  // 세션14 (작가): 색 임무 = 색 조합 or 단일색 대량 — 마카롱 원샷 봉쇄
  var STAGES = [
    { goal: { type: 'colors', parts: [[2, 8], [0, 8]] }, diffBoost: 0 },     // 1. 코딱지맛 8 + 딸기맛 8
    { goal: { type: 'rescue', n: 1 }, diffBoost: 18 },                       // 2. 소중한 것 1 구출
    { goal: { type: 'score', score: 250, moves: 25 }, diffBoost: 10 },       // 3. 25수 안에 250점
    { goal: { type: 'colors', parts: [[4, 12], [3, 12]] }, diffBoost: 15 },  // 4. 가지맛 12 + 치약맛 12
    { goal: { type: 'rescue', n: 2 }, diffBoost: 24 },                       // 5. 구출 2
    { goal: { type: 'score', score: 500, moves: 35 }, diffBoost: 25 },       // 6. 35수 안에 500점
    { goal: { type: 'colors', parts: [[2, 50]] }, diffBoost: 35 },           // 7. 코딱지맛 50개 (단일 대량)
    { goal: { type: 'rescue', n: 3 }, diffBoost: 44 },                       // 8. 구출 3
    { goal: { type: 'score', score: 900, moves: 45 }, diffBoost: 50 },       // 9. 45수 안에 900점
    { goal: { type: 'colors', parts: [[0, 20], [1, 20], [2, 20]] }, diffBoost: 62 } // 10. 3색 조합
  ];
  var WAVE_EVERY = 10; // 세션14: 디펜스 웨이브 주기 (배치 수)
  var DEFENSE_BABY = [3, 4]; // 세션13: 디펜스 모드 — 중앙 영구 고정 보호 대상 (작가 예시)

  // opts: { mode: 'classic'|'stage'|'defense', stage: 0-based }
  function newGame(seed, opts) {
    opts = opts || {};
    var state = {
      mode: opts.mode || 'classic',
      stage: opts.mode === 'stage' ? (opts.stage | 0) : null,
      goal: opts.mode === 'stage' ? STAGES[Math.min(opts.stage | 0, STAGES.length - 1)].goal : null,
      diffBoost: opts.mode === 'stage' ? STAGES[Math.min(opts.stage | 0, STAGES.length - 1)].diffBoost : (opts.mode === 'defense' ? 10 : 0),
      colorCleared: [0, 0, 0, 0, 0], // 색별 파괴 누계 (임무 추적)
      totalRescued: 0,
      crowsDefused: 0,               // 디펜스 방어 카운터
      wave: 0,                       // 세션14: 디펜스 웨이브 번호
      seed: seed | 0,
      rngState: seed | 0,
      grid: [],
      colors: [],         // 세션4: 칸별 색 인덱스 (0..NCOLORS-1 | null) — 마카롱 타겟팅용, 코어 관리
      threats: [],        // {r, c, type:'crack'|'jelly'|'crust'|'slime'|'crow', countdown}
      tray: [],
      trayColors: [],     // 세션4: 트레이 조각 색 (특수 아이템 = null)
      placements: 0,
      score: 0,
      combo: 0,
      lastBabyAt: 8,      // 세션4: 아기 등장 페이싱 (첫 아기 = 배치 20)
      rocketFlip: false,  // 세션4: 롤링핀 가로/세로 교대
      bellUsed: false,
      over: false,
      overCause: null,
      telemetry: { coverageLost: 0 }, // 세션3: 대응 가능성 상실 전이 계수
      events: []          // 마지막 place()의 이벤트 (UI 주스용)
    };
    for (var r = 0; r < N; r++) {
      var row = [], crow = [];
      for (var c = 0; c < N; c++) { row.push(EMPTY); crow.push(null); }
      state.grid.push(row);
      state.colors.push(crow);
    }
    if (state.mode === 'defense') state.grid[DEFENSE_BABY[0]][DEFENSE_BABY[1]] = BABY; // 중앙 영구 고정
    refillTray(state);
    return state;
  }

  // 세션13: 임무 판정 — 달성 시 즉시 승리 종료 (overCause 'clear')
  function checkGoal(state) {
    if (state.mode !== 'stage' || !state.goal || state.over) return;
    var g = state.goal, done = false;
    if (g.type === 'colors') done = g.parts.every(function (p) { return state.colorCleared[p[0]] >= p[1]; });
    else if (g.type === 'rescue') done = state.totalRescued >= g.n;
    else if (g.type === 'score') done = state.score >= g.score;
    if (done) { state.over = true; state.overCause = 'clear'; }
  }
  function checkMovesLimit(state) {
    if (state.mode !== 'stage' || !state.goal || state.over) return;
    if (state.goal.type === 'score' && state.placements >= state.goal.moves) {
      state.over = true; state.overCause = 'moves'; // 수 소진 (사인 가독)
    }
  }

  function refillTray(state) {
    state.tray = [];
    state.trayColors = [];
    for (var i = 0; i < 3; i++) {
      state.tray.push(randInt(state, PLAYABLE));
      state.trayColors.push(randInt(state, NCOLORS));
    }
  }

  function shapeCells(shapeIdx, r, c) {
    var m = SHAPES[shapeIdx].m, cells = [];
    for (var i = 0; i < m.length; i++)
      for (var j = 0; j < m[i].length; j++)
        if (m[i][j]) cells.push([r + i, c + j]);
    return cells;
  }

  function canPlace(state, shapeIdx, r, c) {
    if (shapeIdx == null || state.tray.indexOf(shapeIdx) === -1 && !SHAPES[shapeIdx]) return false;
    // 세션12 (작가 피드백): 특수 아이템은 아무 칸이나 타겟 가능 — 폭탄은 점유 칸 중심 9칸, 마카롱은 원하는 젤리 위에 드롭
    if (shapeIdx >= BOMB) return r >= 0 && c >= 0 && r < N && c < N;
    var cells = shapeCells(shapeIdx, r, c);
    for (var k = 0; k < cells.length; k++) {
      var rr = cells[k][0], cc = cells[k][1];
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) return false;
      if (state.grid[rr][cc] !== EMPTY) return false; // 균열 예고 칸은 EMPTY → 덮기(해체) 가능
    }
    return true;
  }

  function threatAt(state, r, c) {
    for (var i = 0; i < state.threats.length; i++)
      if (state.threats[i].r === r && state.threats[i].c === c) return state.threats[i];
    return null;
  }

  function emptyCellsWithoutThreat(state) {
    var out = [];
    for (var r = 0; r < N; r++)
      for (var c = 0; c < N; c++)
        if (state.grid[r][c] === EMPTY && !threatAt(state, r, c)) out.push([r, c]);
    return out;
  }

  // ── 세션4 헬퍼 ──
  function findBaby(state) {
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (state.grid[r][c] === BABY) return [r, c];
    return null;
  }
  function babyNear(state, r, c) { // 체비쇼프 거리 1 이내
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < N && cc < N && state.grid[rr][cc] === BABY) return true;
    }
    return false;
  }
  // 위협 해체 (칸 기준) — 보너스: 균열 +25, 까마귀 +50, 슬라임 예고 +15
  function defuseAt(state, ev, r, c) {
    var th = threatAt(state, r, c);
    if (!th) return;
    state.threats.splice(state.threats.indexOf(th), 1);
    ev.defused.push([r, c]);
    if (th.type === 'crack') ev.gained += 25;
    else if (th.type === 'crow') { ev.gained += 50; if (state.crowsDefused != null) state.crowsDefused++; } // 디펜스 웨이브 카운트
    else if (th.type === 'slime') ev.gained += 15;
  }
  // 아이템의 칸 파괴 공통 처리 — HOLE 유지, BABY = 구출(+100), CRUST +15, SLIME +10
  function itemClearCell(state, ev, rr, cc, log) {
    var v = state.grid[rr][cc];
    if (v === BLOCK) { ev.gained += 2; if (state.colorCleared && state.colors[rr][cc] != null) state.colorCleared[state.colors[rr][cc]]++; } // 임무 추적 (세션13)
    else if (v === JELLY) { ev.gained += 2; }
    else if (v === CRUST) { ev.gained += 15; ev.broke.push([rr, cc, 'crust']); }
    else if (v === SLIME) { ev.gained += 10; ev.slimeKilled = true; ev.broke.push([rr, cc, 'slime']); }
    else if (v === BABY) {
      if (state.mode === 'defense') { defuseAt(state, ev, rr, cc); return; } // 디펜스: 고정 보호 대상 — 아이템으로도 제거 불가
      ev.gained += 100; ev.rescued++;
    }
    else { defuseAt(state, ev, rr, cc); return; } // EMPTY: 예고만 해체
    state.grid[rr][cc] = EMPTY;
    state.colors[rr][cc] = null;
    if (log) log.push([rr, cc]);
    defuseAt(state, ev, rr, cc);
  }

  // 위협 카운트다운 + 발동 — 틱 1회 (배치·버리기 공용). RNG 미사용.
  function tickThreats(state, ev) {
    var remaining = [];
    for (var i = 0; i < state.threats.length; i++) {
      var t = state.threats[i];
      t.countdown--;
      if (t.countdown <= 0) {
        if (t.type === 'crow') {
          // 도둑 까마귀 (세션4): 발동 시 아기가 인접(8방)해 있으면 잡아먹음 = 즉시 게임오버 (작가 확정)
          if (babyNear(state, t.r, t.c)) {
            state.over = true;
            state.overCause = 'baby';
            ev.babyEaten = [t.r, t.c];
            ev.fired.push([t.r, t.c, 'crow']);
          } // 아기가 벗어났으면 불발
        } else if (t.type === 'crust') {
          // 굳은 설탕 (세션4): 내 블록을 굳힘 — 줄 완성 차단. 블록이 먼저 사라졌으면 불발
          if (state.grid[t.r][t.c] === BLOCK) {
            state.grid[t.r][t.c] = CRUST; state.colors[t.r][t.c] = null;
            ev.fired.push([t.r, t.c, 'crust']);
          }
        } else if (t.type === 'peck') {
          // 방벽 쪼기 (세션14 디펜스): 보호 대상 인접 방벽 블록을 부숨 — 블록이 먼저 사라졌으면 불발
          if (state.grid[t.r][t.c] === BLOCK) {
            state.grid[t.r][t.c] = EMPTY; state.colors[t.r][t.c] = null;
            ev.fired.push([t.r, t.c, 'peck']);
          }
        } else if (t.type === 'slime') {
          if (state.grid[t.r][t.c] === EMPTY) { state.grid[t.r][t.c] = SLIME; ev.fired.push([t.r, t.c, 'slime']); }
        } else if (state.grid[t.r][t.c] === EMPTY) {
          state.grid[t.r][t.c] = (t.type === 'crack') ? HOLE : JELLY;
          ev.fired.push([t.r, t.c, t.type]);
        }
      } else remaining.push(t);
    }
    state.threats = remaining;
  }

  // 실행 코어 (배치/아이템 → 카운트다운 → 연쇄) — place()와 previewPlace()가 공유.
  // RNG 미사용 구간 = 결정론과 순수 미리보기 동시 보장.
  function resolveAction(state, shapeIdx, r, c, ev, pieceColor) {
    if (shapeIdx === BOMB) {
      // 폭탄 (세션3): 3×3 파괴
      ev.bomb = { r: r, c: c, cleared: [] };
      for (var br = r - 1; br <= r + 1; br++) for (var bc = c - 1; bc <= c + 1; bc++) {
        if (br < 0 || bc < 0 || br >= N || bc >= N) continue;
        itemClearCell(state, ev, br, bc, ev.bomb.cleared);
      }
    } else if (shapeIdx === ROCKET_H || shapeIdx === ROCKET_V) {
      // 롤링핀 (세션4): 행/열 전체 파괴
      ev.rocket = { r: r, c: c, dir: shapeIdx === ROCKET_H ? 'h' : 'v', cleared: [] };
      for (var k1 = 0; k1 < N; k1++) {
        if (shapeIdx === ROCKET_H) itemClearCell(state, ev, r, k1, ev.rocket.cleared);
        else itemClearCell(state, ev, k1, c, ev.rocket.cleared);
      }
    } else if (shapeIdx === MACARON) {
      // 색 마카롱 (세션4, 작가 확정): 인접(상>우>하>좌) 블록 색 중 최다 색을 보드 전체에서 파괴
      ev.macaronColor = macaronTarget(state, r, c);
      ev.macaron = { r: r, c: c, cleared: [] };
      defuseAt(state, ev, r, c);
      if (ev.macaronColor != null) {
        for (var mr = 0; mr < N; mr++) for (var mc = 0; mc < N; mc++)
          if (state.grid[mr][mc] === BLOCK && state.colors[mr][mc] === ev.macaronColor) {
            state.grid[mr][mc] = EMPTY; state.colors[mr][mc] = null;
            ev.macaron.cleared.push([mr, mc]); ev.gained += 2;
          }
      }
    } else {
      // 1) 배치 (+예고 칸 덮으면 해체) — 색 기록
      var cells = shapeCells(shapeIdx, r, c);
      for (var k = 0; k < cells.length; k++) {
        var rr = cells[k][0], cc = cells[k][1];
        state.grid[rr][cc] = BLOCK;
        state.colors[rr][cc] = (pieceColor == null ? 0 : pieceColor);
        ev.placed.push([rr, cc]);
        defuseAt(state, ev, rr, cc);
      }
      ev.gained += cells.length;
    }

    // 2) 위협 카운트다운 + 발동
    tickThreats(state, ev);
    if (state.over) return; // 아기 피탈 — 사망 순간 보드 동결(사인 가독)

    // 3) 줄 클리어 + 중력 + 연쇄
    runChains(state, ev, !!(ev.bomb || ev.rocket || ev.macaron));
  }

  // 줄 클리어 + 중력 낙하 + 콤보 연쇄 (세션2 과제 B + 세션4 확장) — 배치·아이템·버리기 공용.
  // 클리어 → 인접 설탕/슬라임 파괴 → 낙하 → 새 줄 재클리어 반복. 전 과정 RNG 0회 = 결정론.
  // 아기 포함 줄 클리어 = 구출(+100). 낙하 착지 해체 유지.
  function runChains(state, ev, itemPass) {
    var chained = false;
    for (;;) {
      var lines = findFullLines(state);
      if (lines.keys.length === 0 && !itemPass) break;
      itemPass = false;
      if (lines.keys.length) { chained = true; state.combo++; }
      var step = { clearedLines: lines.count, clearedCells: [], fell: [], defused: [], broke: [], gained: 0 };
      var jellyBonus = 0;
      for (var q = 0; q < lines.keys.length; q++) {
        var kp = lines.keys[q].split(','), rr3 = +kp[0], cc3 = +kp[1];
        var cv = state.grid[rr3][cc3];
        if (cv === JELLY) { jellyBonus += 5; ev.jellyCleared++; }
        if (cv === BABY) {
          if (state.mode === 'defense') continue; // 디펜스: 줄은 지워져도 보호 대상은 영구 고정 (구출 없음)
          step.gained += 100; ev.rescued++; // 구출!
        }
        if (cv === BLOCK && state.colorCleared && state.colors[rr3][cc3] != null) state.colorCleared[state.colors[rr3][cc3]]++; // 임무 추적
        state.grid[rr3][cc3] = EMPTY;
        state.colors[rr3][cc3] = null;
        step.clearedCells.push([rr3, cc3]);
        ev.clearedCells.push([rr3, cc3]);
      }
      step.gained += lines.count * 10 * state.combo + jellyBonus;
      // 인접 파괴 (세션4, 캔디크러시 방식): 클리어 칸의 상하좌우 굳은 설탕(+15)·슬라임(+10) 파괴 — 중력보다 먼저
      var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
      for (var q2 = 0; q2 < step.clearedCells.length; q2++) {
        for (var dd = 0; dd < 4; dd++) {
          var ar = step.clearedCells[q2][0] + DIRS[dd][0], ac = step.clearedCells[q2][1] + DIRS[dd][1];
          if (ar < 0 || ac < 0 || ar >= N || ac >= N) continue;
          if (state.grid[ar][ac] === CRUST) { state.grid[ar][ac] = EMPTY; step.gained += 15; step.broke.push([ar, ac, 'crust']); ev.broke.push([ar, ac, 'crust']); }
          else if (state.grid[ar][ac] === SLIME) { state.grid[ar][ac] = EMPTY; step.gained += 10; ev.slimeKilled = true; step.broke.push([ar, ac, 'slime']); ev.broke.push([ar, ac, 'slime']); }
        }
      }
      // 중력: 열 단위 압축 — HOLE은 지형(관통 금지), 나머지는 전부 낙하(색 동반)
      step.fell = applyGravity(state);
      for (var f = 0; f < step.fell.length; f++) ev.fell.push(step.fell[f]);
      // 굳은설탕 예고는 타겟 블록을 따라 이동 (블록이 떨어지면 예고도 함께)
      for (var f2 = 0; f2 < step.fell.length; f2++) {
        var mv2 = step.fell[f2];
        for (var d2 = 0; d2 < state.threats.length; d2++) {
          var thm = state.threats[d2];
          if ((thm.type === 'crust' || thm.type === 'peck') && thm.r === mv2[0] && thm.c === mv2[1]) { thm.r = mv2[2]; thm.c = mv2[3]; }
        }
      }
      // 낙하 착지 해체 (예고 칸이 점유되면 위협 제거)
      var keep = [];
      for (var d = 0; d < state.threats.length; d++) {
        var th2 = state.threats[d];
        var isBlockTarget = th2.type === 'crust' || th2.type === 'peck';
        if (!isBlockTarget && state.grid[th2.r][th2.c] !== EMPTY) {
          step.defused.push([th2.r, th2.c]);
          ev.defused.push([th2.r, th2.c]);
          if (th2.type === 'crack') step.gained += 25;
          else if (th2.type === 'crow') { step.gained += 50; if (state.crowsDefused != null) state.crowsDefused++; }
          else if (th2.type === 'slime') step.gained += 15;
        } else if (isBlockTarget && state.grid[th2.r][th2.c] !== BLOCK) {
          // 세션5·14: 타겟 블록이 사라지면 예고도 즉시 소멸 (설탕·쪼기 공통)
          ev.fizzled.push([th2.r, th2.c, th2.type]);
        } else keep.push(th2);
      }
      state.threats = keep;
      // 폭탄 헛스윙(변화 0) — 빈 스텝 미기록
      if (!lines.keys.length && !step.fell.length && !step.defused.length && !step.clearedCells.length) break;
      ev.clearedLines += step.clearedLines;
      ev.gained += step.gained;
      ev.chain.push(step);
    }
    if (!chained) state.combo = 0;
  }

  function newEv() {
    return {
      placed: [], defused: [], fired: [], spawned: [], broke: [],
      clearedLines: 0, clearedCells: [], jellyCleared: 0, rescued: 0, gained: 0,
      fell: [], chain: [], bomb: null, rocket: null, macaron: null, macaronColor: null,
      bombGranted: false, granted: null, babyEaten: null, babySpawn: null, slimeSpread: null, slimeKilled: false,
      fizzled: [], discarded: null,
      waveStart: null, waveBonus: 0, waveCleared: null
    };
  }

  // 세션14: 디펜스 웨이브 스포너 — 빈 인접 칸 있으면 까마귀, 방벽으로 막혀 있으면 방벽 쪼기(peck)
  function spawnCrowOrPeck(state, ev) {
    var baby = findBaby(state);
    if (!baby) return;
    var seats = [], walls = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      var rr = baby[0] + dr, cc = baby[1] + dc;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || threatAt(state, rr, cc)) continue;
      if (state.grid[rr][cc] === EMPTY && canCoverCell(state, rr, cc)) seats.push([rr, cc]);
      else if (state.grid[rr][cc] === BLOCK) walls.push([rr, cc]);
    }
    if (seats.length) {
      var p = seats[randInt(state, seats.length)];
      state.threats.push({ r: p[0], c: p[1], type: 'crow', countdown: COUNTDOWN, _cov: true });
      ev.spawned.push([p[0], p[1], 'crow']);
    } else if (walls.length) {
      var w = walls[randInt(state, walls.length)];
      state.threats.push({ r: w[0], c: w[1], type: 'peck', countdown: 2, _cov: true });
      ev.spawned.push([w[0], w[1], 'peck']);
    }
  }

  // 버리기 통 (세션5, 작가 확정): 조각을 버리면 모든 위협 카운트다운 1 전진(발동 포함) — "시간을 버리는" 선택.
  // 배치가 아니므로 배치수·스폰·슬라임 번짐·아기 등장 없음. RNG는 리필 시에만 = 결정론 유지.
  function discard(state, trayPos) {
    if (state.over) return false;
    if (trayPos == null || trayPos < 0 || trayPos > 2) return false;
    if (state.tray[trayPos] == null) return false;
    var ev = newEv();
    ev.discarded = state.tray[trayPos];
    state.tray[trayPos] = null;
    if (state.trayColors) state.trayColors[trayPos] = null;
    tickThreats(state, ev);
    if (state.over) { state.events = ev; return ev; }
    runChains(state, ev, false); // 발동한 젤리가 줄을 완성시킬 수 있음
    state.score += ev.gained;
    state.totalRescued += ev.rescued;
    checkGoal(state); // 세션13
    if (state.over) { state.events = ev; return ev; }
    if (state.tray[0] == null && state.tray[1] == null && state.tray[2] == null) refillTray(state);
    if (!state.telemetry) state.telemetry = { coverageLost: 0 };
    for (var ti = 0; ti < state.threats.length; ti++) {
      var tth = state.threats[ti];
      if (tth.type === 'crust' || tth.type === 'peck') continue;
      var nowCov = canCoverCell(state, tth.r, tth.c);
      if (tth._cov !== false && !nowCov) state.telemetry.coverageLost++;
      tth._cov = nowCov;
    }
    if (!anyMoveExists(state)) { state.over = true; state.overCause = 'no-space'; }
    state.events = ev;
    return ev;
  }

  // trayPos: 트레이 슬롯 index (0~2), r/c: 좌상단 보드 좌표
  function place(state, trayPos, r, c) {
    if (state.over) return false;
    var shapeIdx = state.tray[trayPos];
    if (shapeIdx == null) return false;
    if (!canPlace(state, shapeIdx, r, c)) return false;

    var ev = newEv();
    var pieceColor = state.trayColors ? state.trayColors[trayPos] : null;
    resolveAction(state, shapeIdx, r, c, ev, pieceColor);
    state.placements++;
    state.tray[trayPos] = null;
    if (state.trayColors) state.trayColors[trayPos] = null;
    state.score += ev.gained;
    state.totalRescued += ev.rescued;

    // 아기 피탈 = 즉시 게임오버 (작가 확정) — 이후 단계 전부 생략, 보드 동결
    if (state.over) { state.events = ev; return ev; }

    // 세션13: 임무 달성 = 즉시 승리
    checkGoal(state);
    if (state.over) { state.events = ev; return ev; }

    // 보상 사다리 (세션3·4): 구출 = 마카롱 > 3연쇄 = 롤링핀(가로/세로 교대) > 2연쇄 = 폭탄.
    // 방금 쓴 슬롯에 즉시 등장. 특수 보유 중 중복 미지급. 연쇄 보상은 일반 조각 배치로만(아이템 연쇄 재보상 금지). RNG 미사용.
    var hasSpecial = false;
    for (var hs = 0; hs < 3; hs++) if (state.tray[hs] != null && state.tray[hs] >= BOMB) hasSpecial = true;
    if (!hasSpecial) {
      var lineSteps = 0;
      for (var li = 0; li < ev.chain.length; li++) if (ev.chain[li].clearedLines > 0) lineSteps++;
      var grant = null;
      if (ev.rescued > 0) grant = MACARON;
      else if (ev.clearedLines >= 3 && shapeIdx < BOMB) { grant = state.rocketFlip ? ROCKET_V : ROCKET_H; state.rocketFlip = !state.rocketFlip; } // 한 수에 총 3줄+ = 빅 플레이
      else if (lineSteps >= 2 && shapeIdx < BOMB) grant = BOMB;
      if (grant != null) {
        state.tray[trayPos] = grant;
        state.trayColors[trayPos] = null;
        ev.granted = grant;
        ev.bombGranted = (grant === BOMB);
      }
    }

    // 트레이 리필 — 스폰 검증(과제 A)이 "플레이어가 실제 쥘 트레이" 기준이 되도록 스폰보다 먼저
    if (state.tray[0] == null && state.tray[1] == null && state.tray[2] == null) refillTray(state);

    // 세션14 디펜스: 웨이브 — 10배치마다 까마귀 습격(1~3마리), 자리 없으면 방벽 쪼기. 생존 보너스, 3웨이브마다 폭탄 지급.
    if (state.mode === 'defense' && state.placements > 0 && state.placements % WAVE_EVERY === 0) {
      var waveN = state.placements / WAVE_EVERY;
      state.wave = waveN;
      ev.waveStart = waveN;
      if (waveN > 1) { var wb = 30 * (waveN - 1); state.score += wb; ev.waveBonus = wb; ev.waveCleared = waveN - 1; } // 이전 웨이브 생존 보너스
      var crowN = Math.min(1 + ((waveN / 2) | 0), 3);
      for (var wv = 0; wv < crowN; wv++) {
        if (state.threats.length >= 6) break; // 디펜스 절대 상한 (가독성)
        spawnCrowOrPeck(state, ev);
      }
      if (waveN % 3 === 0) { // 정비 보급
        var hasSp = false;
        for (var hs2 = 0; hs2 < 3; hs2++) if (state.tray[hs2] != null && state.tray[hs2] >= BOMB) hasSp = true;
        if (!hasSp) {
          var slot2 = state.tray[0] == null ? 0 : state.tray[1] == null ? 1 : state.tray[2] == null ? 2 : 0;
          state.tray[slot2] = BOMB;
          state.trayColors[slot2] = null;
          ev.granted = BOMB;
          ev.bombGranted = true;
        }
      }
    }

    // 초코 슬라임 번짐 (세션4): 4배치마다, 그 턴에 슬라임을 잡았으면 억제. 무RNG 결정적(가장 위-왼쪽 슬라임의 상>우>하>좌 첫 빈 칸) — Pillar 1 유지.
    if (!ev.slimeKilled && state.placements % 4 === 0) {
      var slimeN = countCells(state, SLIME);
      if (slimeN >= 1 && slimeN < 6) {
        spread: for (var sr = 0; sr < N; sr++) for (var sc = 0; sc < N; sc++) {
          if (state.grid[sr][sc] !== SLIME) continue;
          var SD = [[-1, 0], [0, 1], [1, 0], [0, -1]];
          for (var sd = 0; sd < 4; sd++) {
            var tr = sr + SD[sd][0], tc = sc + SD[sd][1];
            if (tr >= 0 && tc >= 0 && tr < N && tc < N && state.grid[tr][tc] === EMPTY && !threatAt(state, tr, tc)) {
              state.grid[tr][tc] = SLIME;
              ev.slimeSpread = [tr, tc];
              break spread;
            }
          }
        }
      }
    }

    // 아기 쿠키 등장 (세션4): 티어2부터, 보드에 1명, 12배치 간격. 구출 가능성 보장(행 또는 열에 구멍 없는 칸만).
    var effP = state.placements + (state.diffBoost || 0);
    if (state.mode !== 'defense' && difficulty(effP).tier >= 2 && !findBaby(state) && effP - state.lastBabyAt >= 12) {
      var bpool = [];
      for (var br2 = 0; br2 < N; br2++) for (var bc2 = 0; bc2 < N; bc2++) {
        if (state.grid[br2][bc2] !== EMPTY || threatAt(state, br2, bc2)) continue;
        var rowOk = true, colOk = true;
        for (var q3 = 0; q3 < N; q3++) {
          var rv = state.grid[br2][q3], cv2 = state.grid[q3][bc2];
          if (rv === HOLE || rv === CRUST || rv === SLIME) rowOk = false;
          if (cv2 === HOLE || cv2 === CRUST || cv2 === SLIME) colOk = false;
        }
        if (rowOk || colOk) bpool.push([br2, bc2]);
      }
      if (bpool.length > 0) {
        var bpick = bpool[randInt(state, bpool.length)];
        state.grid[bpick[0]][bpick[1]] = BABY;
        state.lastBabyAt = state.placements;
        ev.babySpawn = [bpick[0], bpick[1]];
      }
    }

    // 새 위협 예고 — 과제 A(coverable 검증) + 세션4 티어별 위협 풀.
    // ⚠️ 반드시 슬라임 번짐·아기 등장 등 모든 보드 변동 이후에 실행 — 스폰 후 보드가 바뀌면 coverable 보장이 깨진다 (세션4 시뮬에서 실측된 순서 결함 수정).
    var diff = difficulty(state.placements + (state.diffBoost || 0)); // 세션13: 스테이지/디펜스 난이도 부스트
    if (state.placements % diff.spawnEvery === 0) {
      for (var sn = 0; sn < diff.spawnCount; sn++) {
        if (state.threats.length >= diff.maxThreats) break;
        spawnThreat(state, ev, diff);
      }
    }

    // coverable 텔레메트리 (세션3): 위협별 "대응 가능성 상실" 전이 계수 (설탕 예고는 덮기 개념 없음 — 제외)
    if (!state.telemetry) state.telemetry = { coverageLost: 0 };
    for (var ti = 0; ti < state.threats.length; ti++) {
      var tth = state.threats[ti];
      if (tth.type === 'crust' || tth.type === 'peck') continue;
      var nowCov = canCoverCell(state, tth.r, tth.c);
      if (tth._cov !== false && !nowCov) state.telemetry.coverageLost++;
      tth._cov = nowCov;
    }

    // 세션13: 수 제한 임무 — 기회 소진
    checkMovesLimit(state);

    // 게임오버 판정 (사인 가독)
    if (!state.over && !anyMoveExists(state)) {
      state.over = true;
      state.overCause = 'no-space'; // 배치할 곳 없음 — 화면에서 구멍/젤리 개수와 함께 표기
    }

    state.events = ev;
    return ev;
  }

  // 위협 스폰 (세션4): 티어 가중치 롤 → 타입별 후보 풀 → 후보 없으면 균열로 폴백, 그래도 없으면 보류.
  // 공정성: 빈 칸 타겟 위협(crack/jelly/slime/crow)은 coverable 검증. 설탕은 내 블록 타겟(비치명) — 검증 제외.
  function spawnThreat(state, ev, diff) {
    var type = null;
    var baby = findBaby(state);
    // 세션13 디펜스: 까마귀 웨이브 — 확률 0.6, 동시 2마리 (일반 모드: diff 확률, 동시 1마리)
    var crowChance = state.mode === 'defense' ? 0.6 : diff.crowChance;
    var crowCap = state.mode === 'defense' ? 2 : 1;
    var crowCount = 0;
    for (var ci = 0; ci < state.threats.length; ci++) if (state.threats[ci].type === 'crow') crowCount++;
    if (crowChance > 0 && baby && crowCount < crowCap && rand(state) < crowChance) {
      type = 'crow';
    } else {
      var roll = rand(state), acc = 0;
      for (var w = 0; w < diff.weights.length; w++) {
        acc += diff.weights[w][1];
        if (roll < acc) { type = diff.weights[w][0]; break; }
      }
      if (type == null) type = 'crack';
    }
    var pool = [];
    if (type === 'crust') {
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++)
        if (state.grid[r][c] === BLOCK && !threatAt(state, r, c)) pool.push([r, c]);
      if (pool.length === 0) type = 'crack'; // 굳힐 블록 없음 → 폴백
    }
    if (type === 'crow') {
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var rr = baby[0] + dr, cc = baby[1] + dc;
        if (rr >= 0 && cc >= 0 && rr < N && cc < N && state.grid[rr][cc] === EMPTY && !threatAt(state, rr, cc) && canCoverCell(state, rr, cc)) pool.push([rr, cc]);
      }
      if (pool.length === 0) type = 'crack'; // 앉을 자리 없음 → 폴백
    }
    if (type === 'crack' || type === 'jelly' || type === 'slime') {
      pool = emptyCellsWithoutThreat(state).filter(function (cell) { return canCoverCell(state, cell[0], cell[1]); });
    }
    if (pool.length === 0) return; // 스폰 보류 (과제 A 규칙)
    var pick = pool[randInt(state, pool.length)];
    state.threats.push({ r: pick[0], c: pick[1], type: type, countdown: COUNTDOWN, _cov: true });
    ev.spawned.push([pick[0], pick[1], type]);
  }

  // 낙하/연쇄 미리보기 (세션3 — 완전 정보 강화): 클론 위에서 resolveAction 실행. 실상태·RNG 무변형(순수).
  function previewPlace(state, shapeIdx, r, c, pieceColor) {
    if (!canPlace(state, shapeIdx, r, c)) return null;
    var clone = {
      grid: JSON.parse(JSON.stringify(state.grid)),
      colors: JSON.parse(JSON.stringify(state.colors)),
      threats: JSON.parse(JSON.stringify(state.threats)),
      combo: state.combo, over: false, overCause: null,
      mode: state.mode // 디펜스 보호 대상 로직 정합 (colorCleared 등은 guard로 생략 — 순수성 유지)
    };
    var ev = newEv();
    resolveAction(clone, shapeIdx, r, c, ev, pieceColor);
    return ev;
  }

  // 가득 찬 줄 탐색 (BLOCK/JELLY/BABY = 채움 — 아기 포함 줄 클리어 = 구출 / HOLE·CRUST·SLIME = 방해)
  function isFillCell(v) { return v === BLOCK || v === JELLY || v === BABY; }
  function findFullLines(state) {
    var fullRows = [], fullCols = [];
    for (var r = 0; r < N; r++) {
      var full = true;
      for (var c = 0; c < N; c++) { if (!isFillCell(state.grid[r][c])) { full = false; break; } }
      if (full) fullRows.push(r);
    }
    for (var c2 = 0; c2 < N; c2++) {
      var full2 = true;
      for (var r2 = 0; r2 < N; r2++) { if (!isFillCell(state.grid[r2][c2])) { full2 = false; break; } }
      if (full2) fullCols.push(c2);
    }
    var set = {};
    fullRows.forEach(function (rr) { for (var c3 = 0; c3 < N; c3++) set[rr + ',' + c3] = true; });
    fullCols.forEach(function (cc) { for (var r3 = 0; r3 < N; r3++) set[r3 + ',' + cc] = true; });
    return { count: fullRows.length + fullCols.length, keys: Object.keys(set) };
  }

  // 중력 (과제 B) — 열 단위 아래로 압축. 결정론: 좌→우, 아래→위 고정 순서, RNG 미사용.
  // HOLE = 지형: 그 위에서부터 다시 쌓인다(관통 금지). 색 동반 이동. 반환: [fromR, fromC, toR, toC, 값] 목록.
  function applyGravity(state) {
    var moved = [];
    for (var c = 0; c < N; c++) {
      var write = N - 1;
      for (var r = N - 1; r >= 0; r--) {
        var v = state.grid[r][c];
        if (v === HOLE) { write = r - 1; continue; }
        if (v === BABY && state.mode === 'defense') { write = r - 1; continue; } // 디펜스: 보호 대상 = 지형 (고정)
        if (v !== EMPTY) {
          if (r !== write) {
            state.grid[write][c] = v;
            state.colors[write][c] = state.colors[r][c];
            state.grid[r][c] = EMPTY;
            state.colors[r][c] = null;
            moved.push([r, c, write, c, v]);
          }
          write--;
        }
      }
    }
    return moved;
  }

  // 색 마카롱 타겟 — 세션12 (작가 피드백): 원하는 젤리 '위에' 드롭 = 그 젤리의 맛. 빈 칸 드롭 시 인접 최다 색 폴백(세션4 규칙).
  function macaronTarget(state, r, c) {
    if (state.grid[r][c] === BLOCK && state.colors[r][c] != null) return state.colors[r][c];
    var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    var counts = {}, order = [];
    for (var i = 0; i < 4; i++) {
      var rr = r + DIRS[i][0], cc = c + DIRS[i][1];
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
      if (state.grid[rr][cc] === BLOCK && state.colors[rr][cc] != null) {
        var col = state.colors[rr][cc];
        if (!(col in counts)) { counts[col] = 0; order.push(col); }
        counts[col]++;
      }
    }
    if (order.length === 0) return null;
    var best = order[0];
    for (var j = 1; j < order.length; j++) if (counts[order[j]] > counts[best]) best = order[j];
    return best;
  }

  // (r,c)를 현재 트레이의 어떤 조각으로든 덮을 수 있는가 — 과제 A 스폰 검증의 핵심 술어
  function canCoverCell(state, r, c) {
    for (var i = 0; i < state.tray.length; i++) {
      var s = state.tray[i];
      if (s == null) continue;
      var m = SHAPES[s].m;
      for (var dr = 0; dr < m.length; dr++)
        for (var dc = 0; dc < m[dr].length; dc++)
          if (m[dr][dc] && canPlace(state, s, r - dr, c - dc)) return true;
    }
    return false;
  }

  function anyMoveExists(state) {
    for (var i = 0; i < state.tray.length; i++) {
      var s = state.tray[i];
      if (s == null) continue;
      for (var r = 0; r < N; r++)
        for (var c = 0; c < N; c++)
          if (canPlace(state, s, r, c)) return true;
    }
    return false;
  }

  // 🔔 위기 지연 (판당 1회) — Ugly Support: grid defense 원리. 사용률 텔레메트리 감시 대상.
  function ringBell(state) {
    if (state.bellUsed || state.over || state.threats.length === 0) return false;
    state.threats.forEach(function (t) { t.countdown++; });
    state.bellUsed = true;
    return true;
  }

  function snapshot(state) {
    return JSON.stringify({ g: state.grid, cl: state.colors, s: state.score, t: state.tray, tc: state.trayColors, th: state.threats, p: state.placements });
  }

  function countCells(state, type) {
    var n = 0;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (state.grid[r][c] === type) n++;
    return n;
  }

  return {
    N: N, EMPTY: EMPTY, BLOCK: BLOCK, JELLY: JELLY, HOLE: HOLE,
    BABY: BABY, CRUST: CRUST, SLIME: SLIME, NCOLORS: NCOLORS,
    BOMB: BOMB, ROCKET_H: ROCKET_H, ROCKET_V: ROCKET_V, MACARON: MACARON,
    SHAPES: SHAPES, SPAWN_EVERY: SPAWN_EVERY, COUNTDOWN: COUNTDOWN, STAGES: STAGES, DEFENSE_BABY: DEFENSE_BABY, WAVE_EVERY: WAVE_EVERY,
    difficulty: difficulty, previewPlace: previewPlace, discard: discard,
    newGame: newGame, canPlace: canPlace, place: place, anyMoveExists: anyMoveExists,
    ringBell: ringBell, shapeCells: shapeCells, threatAt: threatAt, snapshot: snapshot, countCells: countCells,
    canCoverCell: canCoverCell, applyGravity: applyGravity
  };
});
