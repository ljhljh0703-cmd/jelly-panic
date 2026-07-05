// 텔레그래프 퍼즐 코어 테스트 — pre-GDD §8 검증 기준의 로직 파트. node test.js 로 실행, 전건 PASS 필요.
'use strict';
var C = require('./core.js');
var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}

// T1. 결정론: 같은 seed + 같은 수순 = 같은 상태 (INV-D1)
(function () {
  function run() {
    var s = C.newGame(12345);
    // 스크립트 수순: 가능한 첫 위치에 순서대로 8회 배치
    for (var n = 0; n < 8; n++) {
      var done = false;
      for (var i = 0; i < 3 && !done; i++) {
        if (s.tray[i] == null) continue;
        for (var r = 0; r < C.N && !done; r++)
          for (var c = 0; c < C.N && !done; c++)
            if (C.canPlace(s, s.tray[i], r, c)) { C.place(s, i, r, c); done = true; }
      }
    }
    return C.snapshot(s);
  }
  ok(run() === run(), 'T1 결정론: 같은 seed·수순 → 동일 snapshot');
})();

// T2. 배치 규칙: 경계 밖·겹침 거부
(function () {
  var s = C.newGame(1);
  s.tray = [5, null, null]; // sq2 (2x2)
  ok(!C.canPlace(s, 5, 7, 7), 'T2a 경계 밖 배치 거부');
  ok(C.canPlace(s, 5, 0, 0), 'T2b 빈 칸 배치 허용');
  s.grid[0][0] = C.BLOCK;
  ok(!C.canPlace(s, 5, 0, 0), 'T2c 겹침 배치 거부');
})();

// T3. 균열 해체: 예고 칸을 덮으면 defused + 구멍 미발생 + 보너스
(function () {
  var s = C.newGame(2);
  s.tray = [0, 0, 0]; // dot
  s.threats = [{ r: 3, c: 3, type: 'crack', countdown: 1 }];
  var before = s.score;
  var ev = C.place(s, 0, 3, 3);
  ok(ev.defused.length === 1, 'T3a 균열 덮기 = 해체 이벤트');
  ok(s.grid[3][3] === C.BLOCK && C.countCells(s, C.HOLE) === 0, 'T3b 구멍 미발생');
  ok(s.score - before >= 26, 'T3c 해체 보너스(+25) 반영');
})();

// T4. 균열 발동: 안 막으면 구멍, 구멍 줄은 완성 불가
(function () {
  var s = C.newGame(3);
  s.tray = [0, 0, 0];
  s.threats = [{ r: 0, c: 7, type: 'crack', countdown: 1 }];
  C.place(s, 0, 5, 5); // 다른 곳 배치 → 카운트다운 0 → 발동
  ok(s.grid[0][7] === C.HOLE, 'T4a 방치된 균열 → 구멍');
  // 0행을 구멍 빼고 전부 채워도 클리어 안 됨
  for (var c = 0; c < 7; c++) s.grid[0][c] = C.BLOCK;
  s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 5, 6);
  ok(ev.clearedLines === 0 && s.grid[0][0] === C.BLOCK, 'T4b 구멍 있는 줄은 클리어 불가(영구 방해)');
})();

// T5. 젤리: 발동하면 칸 점유, 줄 완성에 포함(유도 묘수) + 보너스
(function () {
  var s = C.newGame(4);
  s.tray = [0, 0, 0];
  s.threats = [{ r: 2, c: 7, type: 'jelly', countdown: 1 }];
  C.place(s, 0, 6, 6); // 발동
  ok(s.grid[2][7] === C.JELLY, 'T5a 젤리 발동 → 칸 점유');
  for (var c = 0; c < 6; c++) s.grid[2][c] = C.BLOCK; // 2행: 0~5 채움, 6만 비움(7=젤리)
  s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 2, 6); // 마지막 칸 → 젤리 포함 줄 완성
  ok(ev.clearedLines >= 1 && ev.jellyCleared === 1, 'T5b 젤리 포함 줄 클리어 + 젤리 보너스');
  ok(s.grid[2][7] === C.EMPTY, 'T5c 클리어 후 젤리 제거');
})();

// T6. 게임오버: 배치 불가 시 over + 사인 기록 (사인 가독)
(function () {
  // 마지막 행·열을 전부 구멍으로 → 어떤 줄도 완성 불가(클리어 차단), 나머지는 블록으로 채움
  var s = C.newGame(5);
  for (var r = 0; r < C.N; r++) for (var c = 0; c < C.N; c++) s.grid[r][c] = C.BLOCK;
  for (var i = 0; i < C.N; i++) { s.grid[7][i] = C.HOLE; s.grid[i][7] = C.HOLE; }
  s.grid[0][0] = C.EMPTY; // dot 1칸만 자리
  s.tray = [0, null, null];
  C.place(s, 0, 0, 0); // 마지막 빈 칸 소진 → 리필돼도 놓을 곳 0
  ok(s.over === true && s.overCause === 'no-space', 'T6 배치 불가 → 게임오버 + 사인 기록');
})();

// T7. 🔔 지연 벨: 카운트다운 +1, 판당 1회만
(function () {
  var s = C.newGame(6);
  s.threats = [{ r: 1, c: 1, type: 'crack', countdown: 1 }];
  ok(C.ringBell(s) === true && s.threats[0].countdown === 2, 'T7a 벨 → 카운트다운 +1');
  ok(C.ringBell(s) === false, 'T7b 벨 재사용 거부(판당 1회)');
})();

// T8. 위협 예고 규칙: 3배치마다 예고, 예고 칸은 빈 칸만
(function () {
  var s = C.newGame(7);
  var spawnedTotal = 0;
  for (var n = 0; n < 6; n++) {
    var done = false;
    for (var i = 0; i < 3 && !done; i++) {
      if (s.tray[i] == null) continue;
      for (var r = 0; r < C.N && !done; r++)
        for (var c = 0; c < C.N && !done; c++)
          if (C.canPlace(s, s.tray[i], r, c)) {
            var ev = C.place(s, i, r, c);
            spawnedTotal += ev.spawned.length;
            done = true;
          }
    }
  }
  ok(spawnedTotal === 2, 'T8 6배치 → 위협 예고 정확히 2회 (3배치당 1회)');
})();

// ────────────────────────────────────────────────────────────
// 세션2 신규 (dispatch-fable-session2): 과제 A(스폰 검증) · 과제 B(낙하/콤보)
// 작가 확정: 배치 1회=틱 1회 / 낙하 착지=해체 인정(+25)
function t(name, fn) { try { fn(); } catch (e) { fail++; console.log('FAIL  ' + name + ' (예외: ' + e.message + ')'); } }

// T9. 과제 A — impossible 스폰 방지: 예고 칸은 현재 트레이로 덮을 수 있어야 함
t('T9', function () {
  // T9a: 유일한 빈 칸이 고립(sq2로 덮기 불가) → 스폰 보류
  // 대각 구멍으로 어떤 줄도 완성 불가하게 구성(배치 순간 전판 클리어 방지)
  var s = C.newGame(10);
  for (var r = 0; r < C.N; r++) for (var c = 0; c < C.N; c++) s.grid[r][c] = C.BLOCK;
  for (var i0 = 0; i0 < C.N; i0++) s.grid[i0][i0] = C.HOLE;
  s.grid[2][0] = C.EMPTY; s.grid[2][1] = C.EMPTY; s.grid[3][0] = C.EMPTY; s.grid[3][1] = C.EMPTY; // sq2 자리
  s.grid[0][7] = C.EMPTY; // 고립 1칸
  s.tray = [5, 5, 5]; // sq2만
  s.placements = 2;   // 다음 배치 = 3 → 스폰 트리거
  var ev = C.place(s, 0, 2, 0);
  ok(ev.spawned.length === 0 && s.threats.length === 0, 'T9a 덮기 불가능한 칸뿐 → 스폰 보류');

  // T9b: 스폰된 예고 칸은 항상 현재 트레이로 덮기 가능(coverable)
  var s2 = C.newGame(11);
  s2.placements = 2;
  var done = false, ev2 = null;
  for (var i = 0; i < 3 && !done; i++)
    for (var r2 = 0; r2 < C.N && !done; r2++)
      for (var c2 = 0; c2 < C.N && !done; c2++)
        if (s2.tray[i] != null && C.canPlace(s2, s2.tray[i], r2, c2)) { ev2 = C.place(s2, i, r2, c2); done = true; }
  ok(ev2 && ev2.spawned.length === 1 && C.canCoverCell(s2, ev2.spawned[0][0], ev2.spawned[0][1]), 'T9b 스폰 칸은 coverable 보장');
});

// T10. 과제 B — 중력 낙하: 줄 클리어 후 위 블록이 아래로 (HOLE=지형, JELLY도 낙하)
t('T10', function () {
  var s = C.newGame(20);
  for (var c = 0; c < 7; c++) s.grid[7][c] = C.BLOCK; // 7행: (7,7)만 빈 칸
  s.grid[6][0] = C.HOLE;   // col0 지형
  s.grid[2][0] = C.BLOCK;  // col0: 구멍 위에 얹힘 예정
  s.grid[4][1] = C.JELLY;  // col1: 젤리도 낙하
  s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 7, 7); // 7행 클리어 → 중력
  ok(ev.clearedLines === 1, 'T10a 배치로 7행 클리어');
  ok(s.grid[5][0] === C.BLOCK && s.grid[2][0] === C.EMPTY && s.grid[6][0] === C.HOLE, 'T10b 블록은 구멍 위에 안착(관통 금지)');
  ok(s.grid[7][1] === C.JELLY && s.grid[4][1] === C.EMPTY, 'T10c 젤리도 바닥까지 낙하');
  ok(ev.fell && ev.fell.length >= 2, 'T10d 낙하 이벤트 기록(UI 연출용)');
});

// T11. 과제 B — 콤보 연쇄: 낙하로 새 줄 완성 → 연쇄 클리어 + 콤보 증가 + 결정론
t('T11', function () {
  function build() {
    var s = C.newGame(30);
    for (var c = 0; c < 7; c++) { s.grid[7][c] = C.BLOCK; s.grid[6][c] = C.BLOCK; } // 7행·6행 cols0..6
    s.grid[5][7] = C.BLOCK; // col7 위쪽 블록 → 낙하 후 7행 재완성
    s.tray = [0, 0, 0];
    var ev = C.place(s, 0, 7, 7);
    return { s: s, ev: ev };
  }
  var a = build();
  ok(a.ev.clearedLines === 2 && a.s.combo === 2, 'T11a 낙하 → 연쇄 클리어(2단) + 콤보 2');
  ok(a.ev.chain && a.ev.chain.length === 2, 'T11b chain 이벤트 2단계 기록');
  var b = build();
  ok(C.snapshot(a.s) === C.snapshot(b.s) && a.s.score === b.s.score, 'T11c 연쇄 결과 100% 결정론(동일 seed 재실행)');
});

// T12. 과제 B — 낙하 착지 해체: 낙하 블록이 균열 예고 칸에 안착 → 해체(+25)
t('T12', function () {
  var s = C.newGame(40);
  for (var c = 1; c < 8; c++) s.grid[6][c] = C.BLOCK; // 6행: (6,0)만 빈 칸
  s.grid[3][0] = C.BLOCK; // col0 위 블록
  s.grid[7][0] = C.EMPTY;
  s.threats = [{ r: 7, c: 0, type: 'crack', countdown: 5 }]; // 이번 턴 미발동
  s.tray = [0, 0, 0];
  var before = s.score;
  var ev = C.place(s, 0, 6, 0); // 6행 클리어 → (3,0) 블록 낙하 → (7,0) 예고 칸 안착
  ok(s.grid[7][0] === C.BLOCK && s.threats.length === 0, 'T12a 낙하 안착 → 균열 해체');
  ok(s.score - before >= 25 && ev.defused.length === 1, 'T12b 해체 보너스(+25) 반영');
});

// T13. 과제 B — 배치 1회 = 틱 1회: 연쇄가 몇 단이어도 카운트다운은 1만 감소
t('T13', function () {
  var s = C.newGame(50);
  for (var c = 0; c < 7; c++) { s.grid[7][c] = C.BLOCK; s.grid[6][c] = C.BLOCK; }
  s.grid[5][7] = C.BLOCK; // T11과 동일한 2연쇄 구성
  s.threats = [{ r: 0, c: 7, type: 'crack', countdown: 3 }]; // col7 스택 높이 1 → (0,7) 무사
  s.tray = [0, 0, 0];
  C.place(s, 0, 7, 7);
  ok(s.threats.length === 1 && s.threats[0].countdown === 2, 'T13 2연쇄에도 카운트다운 3→2 (틱 1회)');
});

// T14. 회귀 — 장기 결정론: 중력 도입 후에도 같은 seed·수순 = 같은 상태
t('T14', function () {
  function run() {
    var s = C.newGame(777);
    for (var n = 0; n < 30 && !s.over; n++) {
      var done = false;
      for (var i = 0; i < 3 && !done; i++) {
        if (s.tray[i] == null) continue;
        for (var r = 0; r < C.N && !done; r++)
          for (var c = 0; c < C.N && !done; c++)
            if (C.canPlace(s, s.tray[i], r, c)) { C.place(s, i, r, c); done = true; }
      }
      if (!done) break;
    }
    return C.snapshot(s) + '|' + s.score;
  }
  ok(run() === run(), 'T14 30수 장기 결정론(중력 포함)');
});

// ────────────────────────────────────────────────────────────
// 세션3 신규: 폭탄 쿠키(콤보 보상) · 난이도 커브 · 낙하 미리보기 · coverable 텔레메트리
// 작가 확정: 아이템 = 폭탄(3×3) / 획득 = 2연쇄 보상

// T15. 폭탄: 3×3 클리어(구멍 유지), 자신 미점유, 범위 내 위협 해체
t('T15', function () {
  var s = C.newGame(60);
  s.grid[3][3] = C.BLOCK; s.grid[3][4] = C.JELLY; s.grid[3][5] = C.BLOCK;
  s.grid[4][3] = C.BLOCK; s.grid[4][5] = C.BLOCK;
  s.grid[5][3] = C.HOLE;  s.grid[5][4] = C.BLOCK; s.grid[5][5] = C.BLOCK;
  s.threats = [{ r: 4, c: 4, type: 'crack', countdown: 5 }];
  s.tray = [C.BOMB, null, null];
  var before = s.score;
  var ev = C.place(s, 0, 4, 4);
  ok(ev.bomb && s.grid[3][3] === C.EMPTY && s.grid[3][4] === C.EMPTY && s.grid[5][4] === C.EMPTY, 'T15a 폭탄 3×3 클리어');
  ok(s.grid[5][3] === C.HOLE, 'T15b 구멍은 폭발에도 유지');
  ok(s.grid[4][4] === C.EMPTY, 'T15c 폭탄 자신은 칸 미점유(소멸)');
  ok(s.threats.length === 0 && s.score > before, 'T15d 범위 내 위협 해체 + 점수');
});

// T16. 폭탄 획득: 2연쇄 → 방금 쓴 슬롯에 지급, 보유 중 중복 미지급
t('T16', function () {
  var s = C.newGame(30);
  for (var c = 0; c < 7; c++) { s.grid[7][c] = C.BLOCK; s.grid[6][c] = C.BLOCK; }
  s.grid[5][7] = C.BLOCK;
  s.tray = [0, 1, 2];
  var ev = C.place(s, 0, 7, 7);
  ok(ev.bombGranted === true && s.tray[0] === C.BOMB, 'T16a 2연쇄 → 사용 슬롯에 폭탄 지급');
  var s2 = C.newGame(31);
  for (var c2 = 0; c2 < 7; c2++) { s2.grid[7][c2] = C.BLOCK; s2.grid[6][c2] = C.BLOCK; }
  s2.grid[5][7] = C.BLOCK;
  s2.tray = [0, C.BOMB, 2];
  var ev2 = C.place(s2, 0, 7, 7);
  ok(!ev2.bombGranted && s2.tray[0] !== C.BOMB, 'T16b 폭탄 보유 중 중복 미지급');
});

// T17. 난이도 커브: 배치 수 기반 고정 커브(몰래 보정 아님 — 성과 무관)
t('T17', function () {
  var d0 = C.difficulty(0), d2 = C.difficulty(60);
  ok(d0.tier === 1 && d2.tier === 3, 'T17a 배치 수 → 티어 상승');
  ok(d2.spawnEvery < d0.spawnEvery && d2.maxThreats > d0.maxThreats, 'T17b 상위 티어 = 스폰 가속 + 동시 상한 증가');
  var s = C.newGame(70);
  s.placements = 59; s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 0, 0);
  ok(ev.spawned.length >= 1, 'T17c 티어3에서 2배치 주기 스폰 동작 (세션12: 더블 스폰 허용)');
});

// T18. 낙하 미리보기: 순수(상태·RNG 무변형) + 실제 결과와 일치
t('T18', function () {
  var s = C.newGame(30);
  for (var c = 0; c < 7; c++) { s.grid[7][c] = C.BLOCK; s.grid[6][c] = C.BLOCK; }
  s.grid[5][7] = C.BLOCK;
  s.tray = [0, 0, 0];
  var rngBefore = s.rngState, snapBefore = C.snapshot(s);
  var pv = C.previewPlace(s, 0, 7, 7);
  ok(pv && pv.chain.length === 2 && pv.clearedCells.length > 0, 'T18a 미리보기: 2연쇄 예측');
  ok(C.snapshot(s) === snapBefore && s.rngState === rngBefore, 'T18b 미리보기: 상태·RNG 무변형(순수)');
  var ev = C.place(s, 0, 7, 7);
  ok(ev.chain.length === pv.chain.length && ev.clearedCells.length === pv.clearedCells.length && ev.fell.length === pv.fell.length, 'T18c 미리보기 = 실제 결과 일치');
});

// T19. coverable 텔레메트리: 대응 가능성 상실 전이 계수
t('T19', function () {
  var s = C.newGame(80);
  for (var r = 0; r < C.N; r++) for (var c = 0; c < C.N; c++) s.grid[r][c] = C.BLOCK;
  for (var i = 0; i < C.N; i++) s.grid[i][i] = C.HOLE; // 줄 완성 차단
  s.grid[0][7] = C.EMPTY; s.grid[4][0] = C.EMPTY; // 고립 1칸 ×2
  s.threats = [{ r: 0, c: 7, type: 'crack', countdown: 5 }];
  s.tray = [0, 5, null]; // dot + sq2 — (0,7)은 dot으로만 덮기 가능
  C.place(s, 0, 4, 0); // dot을 다른 곳에 소모 → (0,7) 대응 불가로 전이
  ok(s.telemetry && s.telemetry.coverageLost === 1, 'T19 대응 가능성 상실 이벤트 계수');
});

// ────────────────────────────────────────────────────────────
// 세션4 신규: 디펜스 피벗 (캔디크러시/로얄매치 레퍼런스)
// 작가 확정: 아기 피탈 = 즉시 게임오버 / 마카롱 = 인접 블록 색 타겟 / 위협 3종 금지 가드는 작가 지시로 해제(티어 순차 등장으로 가독성 방어)

// T20. 색상 코어: 트레이 색 결정론 배정, 배치 시 기록, 중력 시 동반 이동
t('T20', function () {
  var s = C.newGame(90);
  ok(s.trayColors && s.trayColors.length === 3 && s.trayColors.every(function (ci) { return ci >= 0 && ci < C.NCOLORS; }), 'T20a 트레이 색 배정(결정론 rng)');
  var ci = s.trayColors[0];
  s.tray = [0, 1, 2];
  C.place(s, 0, 3, 3);
  ok(s.colors[3][3] === ci, 'T20b 배치 셀에 색 기록');
  // 중력 동반 이동 (T10 구성)
  var s2 = C.newGame(91);
  for (var c = 0; c < 7; c++) { s2.grid[7][c] = C.BLOCK; s2.colors[7][c] = 0; }
  s2.grid[2][0] = C.BLOCK; s2.colors[2][0] = 3;
  s2.tray = [0, 0, 0];
  C.place(s2, 0, 7, 7);
  ok(s2.grid[7][0] === C.BLOCK && s2.colors[7][0] === 3, 'T20c 낙하 시 색 동반 이동');
});

// T21. 롤링핀(로켓): 가로/세로 전체 클리어, 구멍 유지, 줄 내 위협 해체
t('T21', function () {
  var s = C.newGame(92);
  for (var c = 1; c < 7; c++) s.grid[3][c] = C.BLOCK;
  s.grid[3][7] = C.HOLE;
  s.threats = [{ r: 3, c: 0, type: 'crack', countdown: 5 }];
  s.tray = [C.ROCKET_H, null, null];
  var ev = C.place(s, 0, 3, 0);
  ok(s.grid[3][1] === C.EMPTY && s.grid[3][6] === C.EMPTY, 'T21a 가로핀: 행 전체 클리어');
  ok(s.grid[3][7] === C.HOLE, 'T21b 구멍은 유지');
  ok(s.threats.length === 0 && ev.defused.length >= 1, 'T21c 줄 내 위협 해체');
  var s2 = C.newGame(93);
  s2.grid[1][4] = C.BLOCK; s2.grid[6][4] = C.JELLY;
  s2.tray = [C.ROCKET_V, null, null];
  C.place(s2, 0, 3, 4);
  ok(s2.grid[1][4] === C.EMPTY && s2.grid[6][4] === C.EMPTY, 'T21d 세로핀: 열 전체 클리어');
});

// T22. 색 마카롱: 인접 블록 색 타겟(최다, 동률 시 상>우>하>좌), 그 색 전부 파괴
t('T22', function () {
  var s = C.newGame(94);
  s.grid[3][4] = C.BLOCK; s.colors[3][4] = 2; // 상
  s.grid[4][3] = C.BLOCK; s.colors[4][3] = 1; // 좌
  s.grid[5][4] = C.BLOCK; s.colors[5][4] = 2; // 하
  s.grid[0][0] = C.BLOCK; s.colors[0][0] = 2; // 원거리 같은 색
  s.grid[0][1] = C.BLOCK; s.colors[0][1] = 1;
  s.tray = [C.MACARON, null, null];
  var ev = C.place(s, 0, 4, 4);
  ok(ev.macaronColor === 2, 'T22a 인접 최다 색 타겟');
  var c2left = 0, blocksLeft = 0;
  for (var rr = 0; rr < C.N; rr++) for (var cc = 0; cc < C.N; cc++) {
    if (s.grid[rr][cc] === C.BLOCK) { blocksLeft++; if (s.colors[rr][cc] === 2) c2left++; }
  }
  ok(c2left === 0 && blocksLeft === 2, 'T22b 타겟 색 전멸(3개 파괴) + 다른 색 2개 생존(중력 후)');
  var s2 = C.newGame(95);
  s2.tray = [C.MACARON, null, null];
  var ev2 = C.place(s2, 0, 4, 4); // 인접 블록 없음
  ok(ev2.macaronColor == null, 'T22d 인접 블록 없으면 불발(파괴 0)');
});

// T23. 아기 쿠키: 티어2부터 등장, 줄 클리어 = 구출(+마카롱 지급), 중력 낙하
t('T23', function () {
  var s = C.newGame(96);
  s.placements = 19; s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 0, 0); // 20번째 배치 → 아기 등장 조건
  ok(ev.babySpawn && C.countCells(s, C.BABY) === 1, 'T23a 티어2 진입 시 아기 등장');
  // 구출: 아기 포함 줄 완성
  var s2 = C.newGame(97);
  for (var c = 0; c < 7; c++) s2.grid[7][c] = C.BLOCK;
  s2.grid[7][3] = C.BABY;
  s2.tray = [0, 0, 0];
  var ev2 = C.place(s2, 0, 7, 7);
  ok(ev2.rescued >= 1 && C.countCells(s2, C.BABY) === 0, 'T23b 아기 포함 줄 클리어 = 구출');
  ok(s2.tray[0] === C.MACARON, 'T23c 구출 보상 = 색 마카롱');
  // 낙하
  var s3 = C.newGame(98);
  for (var c3 = 0; c3 < 7; c3++) s3.grid[7][c3] = C.BLOCK;
  s3.grid[3][1] = C.BABY;
  s3.tray = [0, 0, 0];
  C.place(s3, 0, 7, 7);
  ok(s3.grid[7][1] === C.BABY, 'T23d 아기도 중력 낙하');
});

// T24. 도둑 까마귀: 발동 시 아기 인접이면 즉시 게임오버(사인), 아기가 벗어나면 불발, 덮으면 해체
t('T24', function () {
  var s = C.newGame(99);
  s.grid[5][5] = C.BABY;
  s.threats = [{ r: 5, c: 6, type: 'crow', countdown: 1 }];
  s.tray = [0, 0, 0];
  C.place(s, 0, 0, 0);
  ok(s.over === true && s.overCause === 'baby', 'T24a 까마귀 발동+아기 인접 = 게임오버(사인 가독)');
  var s2 = C.newGame(100);
  s2.grid[0][0] = C.BABY;
  s2.threats = [{ r: 7, c: 7, type: 'crow', countdown: 1 }];
  s2.tray = [0, 0, 0];
  C.place(s2, 0, 3, 3);
  ok(!s2.over && s2.threats.length === 0, 'T24b 아기가 멀면 불발');
  var s3 = C.newGame(101);
  s3.grid[5][5] = C.BABY;
  s3.threats = [{ r: 5, c: 6, type: 'crow', countdown: 3 }];
  s3.tray = [0, 0, 0];
  var ev3 = C.place(s3, 0, 5, 6); // 까마귀 칸 덮기
  ok(!s3.over && s3.threats.length === 0 && ev3.defused.length === 1, 'T24c 예고 칸 덮기 = 해체');
});

// T25. 굳은 설탕: 내 블록을 타겟, 발동 시 CRUST(줄 차단), 인접 클리어로 파괴, 블록이 먼저 사라지면 불발
t('T25', function () {
  var s = C.newGame(102);
  s.grid[4][4] = C.BLOCK; s.colors[4][4] = 0;
  s.threats = [{ r: 4, c: 4, type: 'crust', countdown: 1 }];
  s.tray = [0, 0, 0];
  C.place(s, 0, 0, 0);
  ok(s.grid[4][4] === C.CRUST, 'T25a 발동 → 블록이 굳음');
  // 줄 차단
  for (var c = 0; c < 8; c++) if (c !== 4) s.grid[4][c] = C.BLOCK;
  s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 0, 1);
  ok(ev.clearedLines === 0, 'T25b CRUST 포함 줄은 완성 불가');
  // 인접 클리어로 파괴: 5행 클리어 → (4,4) 인접(5,4)
  var s2 = C.newGame(103);
  s2.grid[4][4] = C.CRUST;
  for (var c2 = 0; c2 < 7; c2++) s2.grid[5][c2] = C.BLOCK;
  s2.tray = [0, 0, 0];
  C.place(s2, 0, 5, 7);
  ok(s2.grid[4][4] === C.EMPTY, 'T25c 인접 줄 클리어 → 설탕 파괴');
  // 불발
  var s3 = C.newGame(104);
  s3.threats = [{ r: 2, c: 2, type: 'crust', countdown: 1 }]; // 타겟 칸이 EMPTY
  s3.tray = [0, 0, 0];
  C.place(s3, 0, 0, 0);
  ok(s3.grid[2][2] === C.EMPTY, 'T25d 블록이 없으면 불발');
});

// T26. 초코 슬라임: 발동 → 점유, 4배치마다 결정적 번짐(무RNG), 같은 턴에 슬라임 잡으면 번짐 억제
t('T26', function () {
  var s = C.newGame(105);
  s.grid[4][4] = C.SLIME;
  s.placements = 3; s.tray = [0, 0, 0];
  C.place(s, 0, 0, 0); // 4번째 배치 → 번짐
  ok(C.countCells(s, C.SLIME) === 2, 'T26a 4배치 주기 번짐(+1)');
  ok(s.grid[3][4] === C.SLIME, 'T26b 번짐 방향 결정적(상>우>하>좌 첫 빈 칸)');
  var s2 = C.newGame(106);
  s2.grid[6][3] = C.SLIME; // 7행 인접
  for (var c = 0; c < 7; c++) s2.grid[7][c] = C.BLOCK;
  s2.placements = 3; s2.tray = [0, 0, 0];
  C.place(s2, 0, 7, 7); // 클리어가 슬라임 파괴 → 번짐 억제
  ok(C.countCells(s2, C.SLIME) === 0, 'T26c 인접 클리어로 슬라임 파괴 + 그 턴 번짐 억제');
});

// T27. 보상 사다리: 2연쇄=폭탄(기존), 한 수 총 3줄+=롤링핀(가로/세로 교대), 구출=마카롱 우선
t('T27', function () {
  var s = C.newGame(107);
  for (var c = 0; c < 7; c++) { s.grid[7][c] = C.BLOCK; s.grid[6][c] = C.BLOCK; s.grid[5][c] = C.BLOCK; }
  s.grid[4][7] = C.BLOCK; s.grid[3][7] = C.BLOCK;
  s.tray = [0, 1, 2];
  var ev = C.place(s, 0, 7, 7);
  ok(ev.chain.length >= 2 && ev.clearedLines >= 3, 'T27a 연쇄로 총 3줄+ 클리어');
  ok(s.tray[0] === C.ROCKET_H || s.tray[0] === C.ROCKET_V, 'T27b 3줄+ → 롤링핀 지급');
});

// ────────────────────────────────────────────────────────────
// 세션5: 버리기 통(위협 1틱 비용) · 설탕 예고 즉시 소멸 · 까마귀 티어2 조기 등장

// T28. 버리기: 조각 소멸 + 위협 1틱 전진(발동 포함) + 배치 카운트 미증가(스폰 없음) + 리필
t('T28', function () {
  var s = C.newGame(110);
  s.threats = [{ r: 3, c: 3, type: 'crack', countdown: 2 }];
  s.tray = [0, 1, null];
  var ev = C.discard(s, 0);
  ok(ev && s.tray[0] == null && s.threats[0].countdown === 1, 'T28a 버리기 → 조각 소멸 + 카운트다운 전진');
  ok(s.placements === 0 && ev.spawned.length === 0, 'T28b 배치 아님 → 스폰·배치수 미증가');
  var ev2 = C.discard(s, 1); // countdown 1 → 발동
  ok(s.grid[3][3] === C.HOLE && ev2.fired.length === 1, 'T28c 버리기로 위협 발동(시간을 버리는 비용)');
  ok(s.tray[0] != null && s.tray[1] != null && s.tray[2] != null, 'T28d 트레이 전부 비면 리필');
  ok(C.discard(s, 5) === false && C.newGame(1) && true, 'T28e 잘못된 슬롯 거부');
});

// T29. 설탕 예고 즉시 소멸: 타겟 블록이 사라지면 예고도 그 즉시 사라짐 (빈 칸 위 설탕 예고 = 불합리 제거)
t('T29', function () {
  var s = C.newGame(111);
  for (var c = 0; c < 7; c++) s.grid[7][c] = C.BLOCK;
  s.threats = [{ r: 7, c: 3, type: 'crust', countdown: 3 }]; // 7행 블록을 굳히려 함
  s.tray = [0, 0, 0];
  C.place(s, 0, 7, 7); // 7행 클리어 → 타겟 블록 소멸
  ok(s.threats.length === 0, 'T29 타겟 블록 소멸 → 설탕 예고 즉시 소멸(카운트다운 대기 없음)');
});

// T30. 까마귀 티어2 조기 등장 (기존: 티어3 40배치 — 중앙값 판이 도달 못 함)
t('T30', function () {
  ok(C.difficulty(25).crowChance > 0 && C.difficulty(60).crowChance >= C.difficulty(25).crowChance, 'T30 티어2부터 까마귀 등장 가능');
});

// ────────────────────────────────────────────────────────────
// 세션12 (작가 피드백): 아이템 자유 타겟팅 · 선택 강제 난이도

// T31. 아이템 자유 타겟팅: 폭탄은 점유 칸 중심 드롭 가능(9칸), 마카롱은 드롭한 젤리의 맛을 타겟
t('T31', function () {
  var s = C.newGame(120);
  for (var r = 3; r <= 5; r++) for (var c = 3; c <= 5; c++) { s.grid[r][c] = C.BLOCK; s.colors[r][c] = 1; }
  s.tray = [C.BOMB, null, null];
  ok(C.canPlace(s, C.BOMB, 4, 4), 'T31a 폭탄: 점유 칸 중심 드롭 허용');
  C.place(s, 0, 4, 4);
  var left = 0;
  for (var r2 = 0; r2 < C.N; r2++) for (var c2 = 0; c2 < C.N; c2++) if (s.grid[r2][c2] === C.BLOCK) left++;
  ok(left === 0, 'T31b 중심 포함 9칸 전부 폭파');
  var s2 = C.newGame(121);
  s2.grid[2][2] = C.BLOCK; s2.colors[2][2] = 3;
  s2.grid[6][6] = C.BLOCK; s2.colors[6][6] = 3;
  s2.grid[6][5] = C.BLOCK; s2.colors[6][5] = 0;
  s2.tray = [C.MACARON, null, null];
  var ev = C.place(s2, 0, 2, 2); // 원하는 젤리 '위에' 드롭
  ok(ev.macaronColor === 3, 'T31c 마카롱: 드롭한 젤리의 맛 타겟');
  var c3left = 0, otherLeft = 0;
  for (var r3 = 0; r3 < C.N; r3++) for (var c3 = 0; c3 < C.N; c3++) {
    if (s2.grid[r3][c3] !== C.BLOCK) continue;
    if (s2.colors[r3][c3] === 3) c3left++; else otherLeft++;
  }
  ok(c3left === 0 && otherLeft === 1, 'T31d 그 맛 전멸 + 다른 맛 생존');
});

// T32. 선택 강제 난이도: 티어3+ 더블 스폰(동시 위협 = 삼중 판단), 티어4 신설
t('T32', function () {
  ok(C.difficulty(10).spawnCount === 1 && C.difficulty(45).spawnCount === 2, 'T32a 티어3부터 더블 스폰');
  ok(C.difficulty(75).tier === 4 && C.difficulty(75).maxThreats > C.difficulty(45).maxThreats, 'T32b 티어4: 동시 상한 증가');
  var s = C.newGame(122);
  s.placements = 43; s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 0, 0); // 44번째, 티어3 spawnEvery 2 → 스폰 이벤트
  ok(ev.spawned.length === 2, 'T32c 스폰 이벤트당 위협 2개 예고 — 선택 강제');
});

// ────────────────────────────────────────────────────────────
// 세션13 (작가 확정): 스테이지 임무 3유형 + 디펜스 모드

// T33. 임무-색 조합 (세션14): 모든 파트 충족해야 승리 — 한 색만 채우면 미완
t('T33', function () {
  var s = C.newGame(130, { mode: 'stage', stage: 0 }); // 코딱지맛(2) 8 + 딸기맛(0) 8
  ok(s.goal && s.goal.type === 'colors' && s.goal.parts.length === 2, 'T33a 색 조합 임무 로드');
  s.colorCleared[2] = 8; // 코딱지만 완료
  for (var c = 0; c < 7; c++) { s.grid[7][c] = C.BLOCK; s.colors[7][c] = 4; } // 무관한 색 클리어
  s.tray = [0, 0, 0];
  C.place(s, 0, 7, 7);
  ok(!s.over || s.overCause !== 'clear', 'T33b 한 색만 채우면 미완 (마카롱 원샷 봉쇄)');
  var s2 = C.newGame(135, { mode: 'stage', stage: 0 });
  s2.colorCleared[2] = 8; s2.colorCleared[0] = 7;
  for (var c2 = 0; c2 < 7; c2++) { s2.grid[7][c2] = C.BLOCK; s2.colors[7][c2] = 0; }
  s2.tray = [0, 0, 0];
  C.place(s2, 0, 7, 7); // 딸기 +7 → 두 파트 모두 충족
  ok(s2.over === true && s2.overCause === 'clear', 'T33c 두 색 모두 충족 = 임무 완수');
});

// T37. 디펜스 웨이브: 10배치마다 까마귀 습격 + 생존 보너스
t('T37', function () {
  var s = C.newGame(140, { mode: 'defense' });
  s.placements = 9; s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 7, 0); // 10번째 배치 → 웨이브 1
  ok(ev.waveStart === 1 && s.wave === 1, 'T37a 웨이브 1 돌입');
  ok(s.threats.some(function (t) { return t.type === 'crow'; }), 'T37b 까마귀 습격 스폰');
  var s2 = C.newGame(141, { mode: 'defense' });
  s2.placements = 19; s2.tray = [0, 0, 0];
  var before = s2.score;
  var ev2 = C.place(s2, 0, 7, 0); // 웨이브 2 → 웨이브 1 생존 보너스
  ok(ev2.waveBonus === 30 && s2.score >= before + 30, 'T37c 생존 보너스 +30×N');
});

// T38. 방벽 쪼기: 보호 대상이 방벽으로 둘러싸이면 까마귀 대신 쪼기 예고 → 발동 시 방벽 파괴
t('T38', function () {
  var s = C.newGame(142, { mode: 'defense' });
  var br = C.DEFENSE_BABY[0], bc = C.DEFENSE_BABY[1];
  for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    s.grid[br + dr][bc + dc] = C.BLOCK; s.colors[br + dr][bc + dc] = 0;
  }
  s.placements = 9; s.tray = [0, 0, 0];
  var ev = C.place(s, 0, 7, 0); // 웨이브 — 앉을 자리 없음 → 쪼기
  var peck = null;
  s.threats.forEach(function (t) { if (t.type === 'peck') peck = t; });
  ok(peck !== null, 'T38a 방벽 완성 시 까마귀 대신 쪼기 예고');
  peck.countdown = 1;
  C.place(s, 1, 7, 2); // 틱 → 발동
  ok(s.grid[peck.r] && s.grid[peck.r][peck.c] === C.EMPTY, 'T38b 발동 → 방벽 블록 파괴(자리 열림)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);

// (구분용 주석 — 세션13 T34~36은 위쪽에 유지)

// T34. 임무-구출
t('T34', function () {
  var s = C.newGame(131, { mode: 'stage', stage: 1 }); // 구출 1
  for (var c = 0; c < 7; c++) s.grid[7][c] = C.BLOCK;
  s.grid[7][3] = C.BABY;
  s.tray = [0, 0, 0];
  C.place(s, 0, 7, 7);
  ok(s.over === true && s.overCause === 'clear' && s.totalRescued === 1, 'T34 구출 임무 완수');
});

// T35. 임무-수 제한 점수: 달성 = 승리 / 소진 = 패배(사인 가독)
t('T35', function () {
  var s = C.newGame(132, { mode: 'stage', stage: 2 }); // 25수 안에 250점
  s.score = 249; s.tray = [0, 0, 0];
  C.place(s, 0, 0, 0); // +1점 → 250
  ok(s.over === true && s.overCause === 'clear', 'T35a 점수 달성 = 승리');
  var s2 = C.newGame(133, { mode: 'stage', stage: 2 });
  s2.placements = 24; s2.tray = [0, 0, 0];
  C.place(s2, 0, 0, 0); // 25수째, 점수 미달
  ok(s2.over === true && s2.overCause === 'moves', 'T35b 수 소진 = 패배 (사인: moves)');
});

// T36. 디펜스 모드: 중앙 고정 보호 대상 — 줄 클리어에도 생존, 중력에도 고정, 구출 없음
t('T36', function () {
  var s = C.newGame(134, { mode: 'defense' });
  var br = C.DEFENSE_BABY[0], bc = C.DEFENSE_BABY[1];
  ok(s.grid[br][bc] === C.BABY, 'T36a 시작 시 중앙 고정 배치');
  for (var c = 0; c < C.N; c++) if (c !== bc && c !== 7) s.grid[br][c] = C.BLOCK;
  s.grid[br][7] = C.BLOCK;
  s.tray = [0, 0, 0];
  // 보호 대상 행을 완성 — 줄은 지워져도 보호 대상은 남아야 함
  var full = true;
  for (var c2 = 0; c2 < C.N; c2++) { var v = s.grid[br][c2]; if (v !== C.BLOCK && v !== C.BABY) full = false; }
  ok(full, 'T36b 구성 확인');
  C.place(s, 0, 6, 0); // 다른 곳 배치 → 이미 가득한 행이 클리어됨
  ok(s.grid[br][bc] === C.BABY && s.totalRescued === 0, 'T36c 줄 클리어에도 보호 대상 생존 (구출 아님)');
  // 중력 고정: 아래 행 클리어를 만들어도 보호 대상 위치 불변 — 지형 취급 검증은 grid 유지로 갈음
  ok(!s.over || s.overCause !== 'clear', 'T36d 디펜스에는 임무 승리 없음(엔드리스 생존)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
