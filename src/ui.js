// 쿠키 패닉 UI — 렌더(canvas)·입력(pointer 드래그 1종)·주스. 게임 로직은 core.js(CORE)만 사용, 여기선 규칙 재구현 금지.
(function () {
  'use strict';
  var C = window.CORE;

  // ── 색상 (쿠키/캔디 파스텔 — 오리지널). 세션4: 색이 코어 상태(NCOLORS=5)가 됨 — 마카롱 타겟팅용
  var PIECE_COLORS = ['#FF9EB5', '#FFC15E', '#9BDB8A', '#8FD4F0', '#C9A8F0'];
  var BOARD_BG = '#8D5B3F', CELL_BG = '#A9714F', CELL_INNER = '#F7E8D0';
  var JELLY_COLOR = '#B57EDC', HOLE_COLOR = '#4A3020';
  var CRACK_ACCENT = '#FF7043', JELLY_ACCENT = '#9C6ADE';
  var CRUST_COLOR = '#DCEFF5', SLIME_COLOR = '#7A4E2D', BABY_COLOR = '#FFDFAE', CROW_ACCENT = '#37474F';
  function cellColor(r, c) { var ci = state.colors[r][c]; return ci == null ? '#FFC15E' : PIECE_COLORS[ci % PIECE_COLORS.length]; }

  // ── 상태 ── (colorGrid 제거 — 세션4부터 색은 코어 state.colors가 단일 출처)
  var state, fx, cellPop, fallAnim, shakeT, mascotTimer, firstPlaceDone = false;
  var boardCv = document.getElementById('board'), bctx = boardCv.getContext('2d');
  var dragCv = document.getElementById('drag'), dctx = dragCv.getContext('2d');
  var slots = Array.prototype.slice.call(document.querySelectorAll('.slot'));
  var CS = 44, PAD = 10, GAP = 3; // 셀 크기/패딩 (resize에서 갱신)
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var drag = null; // {slot, shapeIdx, w, h}

  function urlSeed() {
    var m = /[?&]seed=(\d+)/.exec(location.search);
    if (m) return +m[1];
    return (Date.now() % 1000000) | 0; // seed 출처 기록용 — 게임 내 rng는 seed 단일 계통
  }

  var currentMode = 'classic', currentStage = 0; // 세션13: 모드 상태

  function reset(seed) {
    state = C.newGame(seed, { mode: currentMode, stage: currentStage });
    fx = []; cellPop = {}; fallAnim = {}; shakeT = 0;
    runRescued = 0; runMaxCombo = 0;
    var nb = document.getElementById('newbest');
    if (nb && nb.classList) nb.classList.remove('show');
    var rp = document.getElementById('replay');
    if (rp) rp.textContent = '다시 하기';
    document.getElementById('seed').textContent = 'seed ' + seed;
    document.getElementById('score').textContent = '0';
    var bell = document.getElementById('bell');
    bell.classList.remove('used');
    document.getElementById('over').classList.remove('show');
    setMascot('idle');
    updateTier();
    updateStatus();
    drawTray();
    if (!firstPlaceDone) showHint();
    showOnce('bin', '안 쓰는 조각은 통에 버려요 — 대신 위협이 다가와요');
  }

  // ── 레이아웃 (가로·세로 모두 반영 — 작은 창/랩탑 호환) ──
  function resize() {
    var headerH = 92, trayH = Math.min(120, window.innerHeight * 0.18), chrome = 70;
    var availW = Math.min(window.innerWidth - 24, 416);
    var availH = window.innerHeight - headerH - trayH - chrome;
    var target = Math.max(Math.min(availW, availH), 224);
    CS = Math.max(24, Math.floor((target - PAD * 2) / C.N));
    var side = CS * C.N + PAD * 2;
    boardCv.style.width = side + 'px'; boardCv.style.height = side + 'px';
    boardCv.width = side * dpr; boardCv.height = side * dpr;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── 그리기 유틸 ──
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // 귀여운 블록 셀 (얼굴 포함)
  function drawCuteCell(ctx, x, y, size, color, opts) {
    opts = opts || {};
    var s = size - GAP * 2, cx = x + size / 2, cy = y + size / 2;
    ctx.save();
    if (opts.scale && opts.scale !== 1) { ctx.translate(cx, cy); ctx.scale(opts.scale, opts.scale); ctx.translate(-cx, -cy); }
    // 몸통
    rrect(ctx, x + GAP, y + GAP, s, s, s * 0.3);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = shade(color, -40); ctx.lineWidth = 2; ctx.stroke();
    // 하이라이트
    rrect(ctx, x + GAP + s * 0.12, y + GAP + s * 0.08, s * 0.5, s * 0.22, s * 0.11);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
    if (opts.face !== false && s >= 22) {
      var er = s * 0.07;
      ctx.fillStyle = '#4A2E17';
      ctx.beginPath(); ctx.arc(cx - s * 0.18, cy + s * 0.02, er, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.18, cy + s * 0.02, er, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(cx - s * 0.18 + er * 0.35, cy + s * 0.02 - er * 0.35, er * 0.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.18 + er * 0.35, cy + s * 0.02 - er * 0.35, er * 0.4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4A2E17'; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.1, s * 0.13, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,150,.35)';
      ctx.beginPath(); ctx.arc(cx - s * 0.3, cy + s * 0.14, s * 0.08, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.3, cy + s * 0.14, s * 0.08, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawJellyCell(ctx, x, y, size, t) {
    var s = size - GAP * 2, cx = x + size / 2, cy = y + size / 2;
    var wob = Math.sin(t / 260 + x * 0.05) * s * 0.03;
    ctx.save();
    rrect(ctx, x + GAP - wob / 2, y + GAP + wob, s + wob, s - wob, s * 0.38);
    ctx.fillStyle = JELLY_COLOR; ctx.globalAlpha = 0.92; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = shade(JELLY_COLOR, -40); ctx.lineWidth = 2; ctx.stroke();
    rrect(ctx, x + GAP + s * 0.14, y + GAP + s * 0.1 + wob, s * 0.45, s * 0.18, s * 0.09);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill();
    // 젤리 얼굴 (동글 눈 + 벌린 입)
    if (s >= 22) {
      ctx.fillStyle = '#3D2350';
      ctx.beginPath(); ctx.arc(cx - s * 0.17, cy, s * 0.07, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.17, cy, s * 0.07, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.15, s * 0.09, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // 폭탄 쿠키 (세션3) — 콤보 보상 아이템. 귀여운 오리지널 디자인(clean-room).
  function drawBombCell(ctx, x, y, size) {
    var s = size - GAP * 2, cx = x + size / 2, cy = y + size / 2 + s * 0.06, rr = s * 0.36;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fillStyle = '#5B4A6B'; ctx.fill();
    ctx.strokeStyle = '#3D2F4A'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - rr * 0.35, cy - rr * 0.35, rr * 0.3, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    ctx.strokeStyle = '#C9A227'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + rr * 0.15, cy - rr * 0.95); ctx.quadraticCurveTo(cx + rr * 0.55, cy - rr * 1.35, cx + rr * 0.9, cy - rr * 1.15); ctx.stroke();
    ctx.fillStyle = '#FFB300'; ctx.beginPath(); ctx.arc(cx + rr * 0.95, cy - rr * 1.15, rr * 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(cx - rr * 0.3, cy - rr * 0.05, rr * 0.17, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + rr * 0.3, cy - rr * 0.05, rr * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = '#2A2135';
    ctx.beginPath(); ctx.arc(cx - rr * 0.27, cy - rr * 0.05, rr * 0.09, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + rr * 0.33, cy - rr * 0.05, rr * 0.09, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2A2135'; ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath(); ctx.arc(cx, cy + rr * 0.25, rr * 0.22, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  // 아기 쿠키 (세션4) — 지켜야 할 블록. 세션9: 사진 등록 시 소중한 것 사진으로 교체 (원형 클립 + 리본 유지)
  function drawBabyCell(ctx, x, y, size, t) {
    var s = size - GAP * 2, cx = x + size / 2, cy = y + size / 2;
    var bob = Math.sin(t / 320) * s * 0.03;
    var pimg = photoImgs.length ? photoImgs[runRescued % photoImgs.length] : null;
    if (pimg) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy + bob, s * 0.42, 0, 7); ctx.clip();
      try { ctx.drawImage(pimg, cx - s * 0.42, cy - s * 0.42 + bob, s * 0.84, s * 0.84); } catch (e) {}
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy + bob, s * 0.42, 0, 7);
      ctx.strokeStyle = '#FF6E9C'; ctx.lineWidth = 3; ctx.stroke();
      // 리본 (지킬 대상 시각 언어 유지)
      ctx.fillStyle = '#FF6E9C';
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.36 + bob); ctx.lineTo(cx - s * 0.16, cy - s * 0.5 + bob); ctx.lineTo(cx - s * 0.05, cy - s * 0.32 + bob); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.36 + bob); ctx.lineTo(cx + s * 0.16, cy - s * 0.5 + bob); ctx.lineTo(cx + s * 0.05, cy - s * 0.32 + bob); ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy + bob, s * 0.4, 0, 7);
    ctx.fillStyle = BABY_COLOR; ctx.fill();
    ctx.strokeStyle = '#E0A85C'; ctx.lineWidth = 2; ctx.stroke();
    // 리본
    ctx.fillStyle = '#FF6E9C';
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.34 + bob); ctx.lineTo(cx - s * 0.18, cy - s * 0.48 + bob); ctx.lineTo(cx - s * 0.06, cy - s * 0.3 + bob); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.34 + bob); ctx.lineTo(cx + s * 0.18, cy - s * 0.48 + bob); ctx.lineTo(cx + s * 0.06, cy - s * 0.3 + bob); ctx.closePath(); ctx.fill();
    // 왕눈이 + 볼터치
    ctx.fillStyle = '#4A2E17';
    ctx.beginPath(); ctx.arc(cx - s * 0.14, cy + bob, s * 0.1, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.14, cy + bob, s * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - s * 0.11, cy - s * 0.03 + bob, s * 0.045, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.17, cy - s * 0.03 + bob, s * 0.045, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,150,.5)';
    ctx.beginPath(); ctx.arc(cx - s * 0.27, cy + s * 0.1 + bob, s * 0.07, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.27, cy + s * 0.1 + bob, s * 0.07, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4A2E17'; ctx.lineWidth = Math.max(1.5, s * 0.04); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.12 + bob, s * 0.08, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  // 굳은 설탕 (세션4) — 줄 완성 차단, 인접 클리어로 파괴
  function drawCrustCell(ctx, x, y, size) {
    var s = size - GAP * 2;
    ctx.save();
    rrect(ctx, x + GAP, y + GAP, s, s, s * 0.2);
    ctx.fillStyle = CRUST_COLOR; ctx.fill();
    ctx.strokeStyle = '#A8CDE0'; ctx.lineWidth = 2; ctx.stroke();
    // 결정 무늬
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.5, y + s * 0.2); ctx.lineTo(x + s * 0.5, y + s * 0.8);
    ctx.moveTo(x + s * 0.24, y + s * 0.35); ctx.lineTo(x + s * 0.76, y + s * 0.65);
    ctx.moveTo(x + s * 0.76, y + s * 0.35); ctx.lineTo(x + s * 0.24, y + s * 0.65);
    ctx.stroke();
    ctx.restore();
  }

  // 초코 슬라임 (세션4) — 4배치마다 번짐. warn = 다음 배치에 번짐 임박
  function drawSlimeCell(ctx, x, y, size, t, warn) {
    var s = size - GAP * 2, cx = x + size / 2, cy = y + size / 2;
    var wob = Math.sin(t / 200 + x * 0.08) * s * 0.04;
    ctx.save();
    rrect(ctx, x + GAP - wob / 2, y + GAP + wob, s + wob, s - wob, s * 0.42);
    ctx.fillStyle = SLIME_COLOR; ctx.globalAlpha = 0.95; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#5A3820'; ctx.lineWidth = 2; ctx.stroke();
    rrect(ctx, x + GAP + s * 0.12, y + GAP + s * 0.1 + wob, s * 0.4, s * 0.16, s * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
    // 심술 눈
    if (s >= 22) {
      ctx.fillStyle = '#FFE9CE';
      ctx.beginPath(); ctx.arc(cx - s * 0.15, cy, s * 0.09, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.15, cy, s * 0.09, 0, 7); ctx.fill();
      ctx.fillStyle = '#3A2415';
      ctx.beginPath(); ctx.arc(cx - s * 0.13, cy + s * 0.02, s * 0.045, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.17, cy + s * 0.02, s * 0.045, 0, 7); ctx.fill();
    }
    if (warn) { // 번짐 임박 경고 (숨겨진 규칙 없음)
      var p2 = 0.5 + 0.5 * Math.sin(t / 110);
      rrect(ctx, x + GAP - 1, y + GAP - 1, s + 2, s + 2, s * 0.42);
      ctx.strokeStyle = 'rgba(122,78,45,' + (0.3 + p2 * 0.6) + ')'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // 롤링핀 (세션4) — 가로/세로. 나무 밀대 모양
  function drawRocketCell(ctx, x, y, size, vertical) {
    var s = size - GAP * 2, cx = x + size / 2, cy = y + size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    if (vertical) ctx.rotate(Math.PI / 2);
    // 몸통
    rrect(ctx, -s * 0.38, -s * 0.14, s * 0.76, s * 0.28, s * 0.14);
    ctx.fillStyle = '#D9A05B'; ctx.fill();
    ctx.strokeStyle = '#A9713A'; ctx.lineWidth = 2; ctx.stroke();
    // 손잡이
    rrect(ctx, -s * 0.52, -s * 0.07, s * 0.14, s * 0.14, s * 0.06);
    rrect(ctx, s * 0.38, -s * 0.07, s * 0.14, s * 0.14, s * 0.06);
    ctx.fillStyle = '#B5824A'; ctx.fill();
    // 진행 방향 반짝
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.25, -s * 0.04); ctx.lineTo(s * 0.2, -s * 0.04); ctx.stroke();
    ctx.restore();
  }

  // 색 마카롱 (세션4) — 인접 블록 색 전멸. 삼단 마카롱
  function drawMacaronCell(ctx, x, y, size, t) {
    var s = size - GAP * 2, cx = x + size / 2, cy = y + size / 2;
    var spin = (t || 0) / 600;
    ctx.save();
    for (var i = 0; i < 5; i++) { // 색상 링 (5색 = NCOLORS)
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.4, spin + i * Math.PI * 0.4, spin + (i + 1) * Math.PI * 0.4);
      ctx.strokeStyle = PIECE_COLORS[i]; ctx.lineWidth = s * 0.14; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.24, 0, 7);
    ctx.fillStyle = '#FFF6E8'; ctx.fill();
    ctx.strokeStyle = '#E8CFA8'; ctx.lineWidth = 1.5; ctx.stroke();
    if (s >= 22) {
      ctx.fillStyle = '#4A2E17';
      ctx.beginPath(); ctx.arc(cx - s * 0.08, cy - s * 0.02, s * 0.04, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.08, cy - s * 0.02, s * 0.04, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4A2E17'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.05, s * 0.06, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  // 특수 아이템 공용 드로어
  function drawSpecial(ctx, shapeIdx, x, y, size, t) {
    if (shapeIdx === C.BOMB) drawBombCell(ctx, x, y, size);
    else if (shapeIdx === C.ROCKET_H) drawRocketCell(ctx, x, y, size, false);
    else if (shapeIdx === C.ROCKET_V) drawRocketCell(ctx, x, y, size, true);
    else if (shapeIdx === C.MACARON) drawMacaronCell(ctx, x, y, size, t);
  }

  function drawHoleCell(ctx, x, y, size) {
    var s = size - GAP * 2;
    rrect(ctx, x + GAP, y + GAP, s, s, s * 0.25);
    ctx.fillStyle = HOLE_COLOR; ctx.fill();
    // 균열 무늬
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.3, y + s * 0.25); ctx.lineTo(x + s * 0.55, y + s * 0.5); ctx.lineTo(x + s * 0.42, y + s * 0.75);
    ctx.moveTo(x + s * 0.55, y + s * 0.5); ctx.lineTo(x + s * 0.8, y + s * 0.62);
    ctx.stroke();
  }

  // 위협 예고 오버레이 (칸 위 — 상시 하이라이트 + 카운트다운 배지)
  // 세션3 가독성: "결과 미리보기" — 균열은 구멍이 되어가는 모습, 젤리는 차오르는 모습이 카운트다운에 비례해 진해짐
  function drawThreat(ctx, th, t) {
    var x = PAD + th.c * CS, y = PAD + th.r * CS, s = CS - GAP * 2;
    var prog = Math.max(0, Math.min(1, (C.COUNTDOWN - th.countdown) / C.COUNTDOWN)); // 0=여유 → 1=임박
    var pulse = 0.55 + 0.45 * Math.sin(t / (240 - prog * 150)); // 임박할수록 빠른 맥동
    var accent = th.type === 'crack' ? CRACK_ACCENT : th.type === 'crust' ? '#7FB8D4' : th.type === 'slime' ? SLIME_COLOR : th.type === 'crow' ? CROW_ACCENT : JELLY_ACCENT;
    ctx.save();
    if (th.type === 'crack') {
      // 구멍 프리뷰: 점점 어두워지고 균열이 자람
      rrect(ctx, x + GAP + s * 0.15, y + GAP + s * 0.15, s * 0.7, s * 0.7, s * 0.2);
      ctx.fillStyle = HOLE_COLOR; ctx.globalAlpha = 0.12 + prog * 0.5; ctx.fill();
      ctx.globalAlpha = Math.min(1, 0.3 + prog);
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5 + prog * 1.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.35, y + s * 0.3); ctx.lineTo(x + s * 0.55, y + s * 0.5);
      if (prog > 0.3) { ctx.lineTo(x + s * 0.45, y + s * 0.72); ctx.moveTo(x + s * 0.55, y + s * 0.5); ctx.lineTo(x + s * 0.78, y + s * 0.6); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (th.type === 'crust') {
      // 내 블록 위에 서리가 덮여감 (결과 미리보기)
      rrect(ctx, x + GAP + 2, y + GAP + 2, s - 4, (s - 4) * (0.25 + prog * 0.75), s * 0.18);
      ctx.fillStyle = CRUST_COLOR; ctx.globalAlpha = 0.35 + prog * 0.45; ctx.fill();
      ctx.globalAlpha = 1;
    } else if (th.type === 'slime') {
      // 초코가 차오름
      var hgt2 = s * (0.2 + prog * 0.65);
      rrect(ctx, x + GAP + 2, y + GAP + (s - hgt2), s - 4, hgt2, Math.min(hgt2 * 0.4, s * 0.2));
      ctx.fillStyle = SLIME_COLOR; ctx.globalAlpha = 0.25 + prog * 0.45; ctx.fill();
      ctx.globalAlpha = 1;
    } else if (th.type === 'crow') {
      // 까마귀 그림자가 짙어짐 — 아기를 노림
      ctx.globalAlpha = 0.35 + prog * 0.55;
      var ccx = x + CS / 2, ccy = y + CS / 2;
      ctx.fillStyle = CROW_ACCENT;
      ctx.beginPath(); ctx.ellipse(ccx, ccy + s * 0.08, s * 0.24, s * 0.18, 0, 0, 7); ctx.fill(); // 몸통
      ctx.beginPath(); ctx.arc(ccx + s * 0.18, ccy - s * 0.08, s * 0.12, 0, 7); ctx.fill();      // 머리
      ctx.beginPath(); ctx.moveTo(ccx + s * 0.28, ccy - s * 0.1); ctx.lineTo(ccx + s * 0.42, ccy - s * 0.04); ctx.lineTo(ccx + s * 0.28, ccy - s * 0.01); ctx.closePath();
      ctx.fillStyle = '#FF9800'; ctx.fill(); // 부리
      ctx.fillStyle = CROW_ACCENT;
      ctx.beginPath(); ctx.moveTo(ccx - s * 0.1, ccy); ctx.quadraticCurveTo(ccx - s * 0.35, ccy - s * 0.28 - prog * s * 0.1, ccx - s * 0.42, ccy - s * 0.02); ctx.closePath(); ctx.fill(); // 날개
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ccx + s * 0.2, ccy - s * 0.1, s * 0.035, 0, 7); ctx.fill(); // 눈
      ctx.globalAlpha = 1;
    } else {
      // 젤리 프리뷰: 바닥부터 차오름
      var hgt = s * (0.2 + prog * 0.65);
      rrect(ctx, x + GAP + 2, y + GAP + (s - hgt), s - 4, hgt, Math.min(hgt * 0.4, s * 0.2));
      ctx.fillStyle = JELLY_COLOR; ctx.globalAlpha = 0.22 + prog * 0.45; ctx.fill();
      ctx.globalAlpha = 1;
    }
    rrect(ctx, x + GAP + 1, y + GAP + 1, s - 2, s - 2, s * 0.28);
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.35 + pulse * 0.55; ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t / 60; ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.12 + pulse * 0.1;
    ctx.fillStyle = accent; ctx.fill();
    ctx.globalAlpha = 1;
    // 아이콘 (텍스트 0 — 도형으로): 균열 = 지그재그, 젤리·슬라임 = 물방울, 설탕 = 눈결정, 까마귀 = 자체 실루엣
    ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    var cx = x + CS / 2, cy = y + CS / 2;
    if (th.type === 'crack') {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22, cy - s * 0.2); ctx.lineTo(cx, cy - s * 0.02); ctx.lineTo(cx - s * 0.1, cy + s * 0.12); ctx.lineTo(cx + s * 0.16, cy + s * 0.24);
      ctx.stroke();
    } else if (th.type === 'crust') {
      ctx.beginPath();
      for (var ic = 0; ic < 3; ic++) {
        var ang = ic * Math.PI / 3;
        ctx.moveTo(cx - Math.cos(ang) * s * 0.2, cy - Math.sin(ang) * s * 0.2);
        ctx.lineTo(cx + Math.cos(ang) * s * 0.2, cy + Math.sin(ang) * s * 0.2);
      }
      ctx.stroke();
    } else if (th.type === 'jelly' || th.type === 'slime') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.2);
      ctx.bezierCurveTo(cx + s * 0.22, cy + s * 0.05, cx + s * 0.14, cy + s * 0.22, cx, cy + s * 0.22);
      ctx.bezierCurveTo(cx - s * 0.14, cy + s * 0.22, cx - s * 0.22, cy + s * 0.05, cx, cy - s * 0.2);
      ctx.fill();
    } // crow: 위 실루엣이 곧 아이콘
    // 카운트다운 배지
    var br = s * 0.19;
    ctx.beginPath(); ctx.arc(x + CS - br - 2, y + br + 2, br, 0, 7);
    ctx.fillStyle = accent; ctx.fill();
    ctx.strokeStyle = '#FFFDF7'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(br * 1.3) + 'px Jua, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(th.countdown), x + CS - br - 2, y + br + 3);
    ctx.restore();
  }

  // ── 보드 그리기 ──
  function drawBoard(t) {
    var side = CS * C.N + PAD * 2;
    bctx.clearRect(0, 0, side, side);
    if (shakeT > 0) { bctx.save(); bctx.translate((Math.sin(t / 18) * 4) * (shakeT / 300), (Math.cos(t / 23) * 3) * (shakeT / 300)); shakeT -= 16; }
    else bctx.save();
    // 패널
    rrect(bctx, 0, 0, side, side, 22); bctx.fillStyle = BOARD_BG; bctx.fill();
    // 셀 바닥
    for (var r = 0; r < C.N; r++) for (var c = 0; c < C.N; c++) {
      var x = PAD + c * CS, y = PAD + r * CS;
      rrect(bctx, x + GAP, y + GAP, CS - GAP * 2, CS - GAP * 2, (CS - GAP * 2) * 0.22);
      bctx.fillStyle = ((r + c) % 2 === 0) ? CELL_INNER : shade(CELL_INNER, -12);
      bctx.fill();
    }
    // 내용물
    for (var r2 = 0; r2 < C.N; r2++) for (var c2 = 0; c2 < C.N; c2++) {
      var v = state.grid[r2][c2], x2 = PAD + c2 * CS, y2 = PAD + r2 * CS;
      var key = r2 + ',' + c2, scale = 1;
      if (cellPop[key]) {
        var dt = t - cellPop[key];
        if (dt > 320) delete cellPop[key];
        else { var p = dt / 320; scale = 1 + 0.25 * Math.sin(p * Math.PI) * (1 - p); }
      }
      // 낙하 애니메이션 (과제 B) — 그리드는 이미 최종 상태, 그리는 위치만 출발 행→도착 행 보간(가속 이징)
      var fa = fallAnim[key];
      if (fa && (v === C.BLOCK || v === C.JELLY)) {
        var dtf = t - fa.t0;
        if (dtf >= fa.dur) { delete fallAnim[key]; cellPop[key] = t; }
        else if (dtf < 0) y2 = PAD + fa.fromR * CS;
        else { var pf = (dtf / fa.dur); pf = pf * pf; y2 = PAD + (fa.fromR + (r2 - fa.fromR) * pf) * CS; }
      }
      if (v === C.BLOCK) drawCuteCell(bctx, x2, y2, CS, cellColor(r2, c2), { scale: scale });
      else if (v === C.JELLY) drawJellyCell(bctx, x2, y2, CS, t);
      else if (v === C.HOLE) drawHoleCell(bctx, x2, y2, CS);
      else if (v === C.BABY) drawBabyCell(bctx, x2, y2, CS, t);
      else if (v === C.CRUST) drawCrustCell(bctx, x2, y2, CS);
      else if (v === C.SLIME) drawSlimeCell(bctx, x2, y2, CS, t, state.placements % 4 === 3); // 다음 배치에 번짐 → 경고 맥동 (Pillar 1)
    }
    // 위협 예고
    for (var i = 0; i < state.threats.length; i++) drawThreat(bctx, state.threats[i], t);
    // 드래그 고스트 (배치 미리보기)
    if (drag && drag.target) {
      var tg = drag.target, valid = tg.valid;
      var cells = C.shapeCells(drag.shapeIdx, tg.r, tg.c);
      for (var k = 0; k < cells.length; k++) {
        var rr = cells[k][0], cc = cells[k][1];
        if (rr < 0 || cc < 0 || rr >= C.N || cc >= C.N) continue;
        var gx = PAD + cc * CS, gy = PAD + rr * CS;
        rrect(bctx, gx + GAP, gy + GAP, CS - GAP * 2, CS - GAP * 2, (CS - GAP * 2) * 0.3);
        bctx.fillStyle = valid ? 'rgba(120,220,140,.5)' : 'rgba(240,90,90,.45)';
        bctx.fill();
      }
      // 결과 미리보기 (세션3 — 완전 정보): 클리어될 줄·낙하 도착지·해체·폭발 범위를 배치 전에 표시
      if (valid) {
        var pvKey = tg.r + ',' + tg.c;
        if (drag.pvKey !== pvKey) { drag.pvKey = pvKey; drag.pv = C.previewPlace(state, drag.shapeIdx, tg.r, tg.c, state.trayColors[drag.slot]); }
        var pv = drag.pv;
        if (pv) {
          var glow = 0.35 + 0.25 * Math.sin(t / 140);
          // 파괴 예정 칸 통합 (줄 클리어 + 아이템 파괴 + 인접 파괴)
          var toClear = pv.clearedCells
            .concat(pv.bomb ? pv.bomb.cleared : [])
            .concat(pv.rocket ? pv.rocket.cleared : [])
            .concat(pv.macaron ? pv.macaron.cleared : [])
            .concat(pv.broke || []);
          toClear.forEach(function (p) {
            var px = PAD + p[1] * CS, py = PAD + p[0] * CS;
            rrect(bctx, px + GAP, py + GAP, CS - GAP * 2, CS - GAP * 2, (CS - GAP * 2) * 0.25);
            bctx.fillStyle = 'rgba(255,235,130,' + glow + ')'; bctx.fill();
          });
          // 아기 위험 경고 (완전 정보): 이 수를 두면 까마귀가 아기를 채감
          if (pv.babyEaten) {
            for (var wr = 0; wr < C.N; wr++) for (var wc = 0; wc < C.N; wc++) {
              if (state.grid[wr][wc] !== C.BABY) continue;
              var wx = PAD + wc * CS, wy = PAD + wr * CS, ws = CS - GAP * 2;
              rrect(bctx, wx + GAP - 2, wy + GAP - 2, ws + 4, ws + 4, ws * 0.3);
              bctx.strokeStyle = 'rgba(230,50,50,' + (glow + 0.35) + ')'; bctx.lineWidth = 4; bctx.stroke();
            }
          }
          // 구출 예고: 이 수로 아기가 구출됨
          if (pv.rescued > 0) {
            for (var gr = 0; gr < C.N; gr++) for (var gc = 0; gc < C.N; gc++) {
              if (state.grid[gr][gc] !== C.BABY) continue;
              var gx2 = PAD + gc * CS, gy2 = PAD + gr * CS, gs = CS - GAP * 2;
              rrect(bctx, gx2 + GAP - 2, gy2 + GAP - 2, gs + 4, gs + 4, gs * 0.3);
              bctx.strokeStyle = 'rgba(255,110,156,' + (glow + 0.35) + ')'; bctx.lineWidth = 4; bctx.stroke();
            }
          }
          pv.fell.forEach(function (mv) {
            var px = PAD + mv[3] * CS, py = PAD + mv[2] * CS, ss = CS - GAP * 2;
            rrect(bctx, px + GAP + 1, py + GAP + 1, ss - 2, ss - 2, ss * 0.28);
            bctx.strokeStyle = 'rgba(90,160,255,.8)'; bctx.lineWidth = 2; bctx.setLineDash([4, 4]); bctx.stroke(); bctx.setLineDash([]);
            bctx.strokeStyle = 'rgba(90,160,255,.9)'; bctx.lineWidth = 2.5; bctx.lineCap = 'round';
            bctx.beginPath(); // ▼ 낙하 표시
            bctx.moveTo(px + CS / 2 - 5, py + CS / 2 - 3); bctx.lineTo(px + CS / 2, py + CS / 2 + 4); bctx.lineTo(px + CS / 2 + 5, py + CS / 2 - 3);
            bctx.stroke();
          });
          pv.defused.forEach(function (p) {
            var px = PAD + p[1] * CS, py = PAD + p[0] * CS, ss = CS - GAP * 2;
            rrect(bctx, px + GAP, py + GAP, ss, ss, ss * 0.25);
            bctx.strokeStyle = 'rgba(255,200,40,' + (glow + 0.3) + ')'; bctx.lineWidth = 3; bctx.stroke();
          });
          if (pv.bomb) {
            var bx = PAD + (tg.c - 1) * CS, by = PAD + (tg.r - 1) * CS;
            rrect(bctx, Math.max(PAD, bx) + 2, Math.max(PAD, by) + 2,
              Math.min(CS * 3, PAD + C.N * CS - Math.max(PAD, bx)) - 4, Math.min(CS * 3, PAD + C.N * CS - Math.max(PAD, by)) - 4, 10);
            bctx.strokeStyle = 'rgba(255,110,60,' + (glow + 0.25) + ')'; bctx.lineWidth = 3; bctx.setLineDash([7, 5]); bctx.stroke(); bctx.setLineDash([]);
          }
        }
      }
    }
    // 까마귀 등장 경고 비네트 (세션5)
    if (vignetteT > 0) {
      vignetteT -= 16;
      var va = Math.min(0.55, vignetteT / 700);
      bctx.strokeStyle = 'rgba(224,52,52,' + va + ')';
      bctx.lineWidth = 12;
      rrect(bctx, 5, 5, side - 10, side - 10, 20);
      bctx.stroke();
    }
    // FX
    drawFx(t);
    bctx.restore();
  }

  // ── 로컬 저장 (세션7) — 베스트 스코어·뮤트 설정. file:// 환경 예외 대비 guard.
  function storeGet(k) { try { return window.localStorage ? localStorage.getItem(k) : null; } catch (e) { return null; } }
  function storeSet(k, v) { try { if (window.localStorage) localStorage.setItem(k, v); } catch (e) {} }

  // ── 사운드 (세션3·7) — WebAudio 합성음, 에셋 0개(단일 파일 유지). 마스터 게인 + 뮤트 토글(설정 기억).
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null, masterG = null;
  var muted = storeGet('cp-mute') === '1';
  function ensureAudio() {
    if (AC && !actx) {
      try {
        actx = new AC();
        masterG = actx.createGain();
        masterG.gain.value = muted ? 0 : 1;
        masterG.connect(actx.destination);
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function tone(freq, dur, type, vol, when, slide) {
    if (!actx) return;
    var t0 = actx.currentTime + (when || 0);
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(vol || 0.14, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(masterG || actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // kind별 프리셋. delaySec: 연쇄 시차와 동기화
  function sfx(kind, n, delaySec) {
    var d = delaySec || 0;
    if (kind === 'place') { tone(300, 0.07, 'sine', 0.1, d, 220); }
    else if (kind === 'clear') { tone(523, 0.1, 'triangle', 0.14, d); tone(659, 0.1, 'triangle', 0.12, d + 0.06); tone(784, 0.14, 'triangle', 0.11, d + 0.12); }
    else if (kind === 'combo') { var b = 523 * Math.pow(1.22, Math.min(n || 2, 7)); tone(b, 0.09, 'triangle', 0.16, d); tone(b * 1.25, 0.13, 'triangle', 0.13, d + 0.07); }
    else if (kind === 'defuse') { tone(880, 0.08, 'sine', 0.12, d); tone(1318, 0.11, 'sine', 0.09, d + 0.05); }
    else if (kind === 'spawn') { tone(185, 0.14, 'square', 0.06, d, 140); }
    else if (kind === 'fire') { tone(120, 0.22, 'sawtooth', 0.13, d, 55); }
    else if (kind === 'bell') { tone(1046, 0.28, 'triangle', 0.13, d); tone(1568, 0.36, 'sine', 0.07, d + 0.02); }
    else if (kind === 'bomb') { tone(90, 0.32, 'sawtooth', 0.2, d, 40); tone(55, 0.28, 'square', 0.14, d + 0.03, 30); }
    else if (kind === 'grant') { tone(659, 0.09, 'square', 0.09, d); tone(880, 0.13, 'square', 0.08, d + 0.06); }
    else if (kind === 'over') { tone(392, 0.16, 'triangle', 0.13, d); tone(311, 0.16, 'triangle', 0.12, d + 0.15); tone(233, 0.28, 'triangle', 0.11, d + 0.3); }
    else if (kind === 'rocket') { tone(200, 0.24, 'sawtooth', 0.13, d, 900); }
    else if (kind === 'macaron') { tone(523, 0.07, 'sine', 0.12, d); tone(659, 0.07, 'sine', 0.11, d + 0.05); tone(784, 0.07, 'sine', 0.1, d + 0.1); tone(1046, 0.12, 'sine', 0.1, d + 0.15); }
    else if (kind === 'rescue') { tone(523, 0.1, 'triangle', 0.15, d); tone(659, 0.1, 'triangle', 0.14, d + 0.09); tone(784, 0.1, 'triangle', 0.13, d + 0.18); tone(1046, 0.22, 'triangle', 0.14, d + 0.27); }
    else if (kind === 'caw') { tone(240, 0.09, 'square', 0.12, d, 180); tone(220, 0.11, 'square', 0.1, d + 0.11, 160); }
    else if (kind === 'crackle') { tone(1400, 0.05, 'square', 0.07, d); tone(900, 0.05, 'square', 0.07, d + 0.04); tone(1100, 0.06, 'square', 0.06, d + 0.09); }
    else if (kind === 'blub') { tone(160, 0.12, 'sine', 0.12, d, 90); }
    else if (kind === 'discard') { tone(420, 0.14, 'sine', 0.1, d, 160); tone(140, 0.1, 'square', 0.06, d + 0.1); }
  }
  function buzz(ms) { if (typeof navigator !== 'undefined' && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }
  // 세션8 (게임 출시 가이드): 백그라운드 전환 시 사운드 즉시 중지, 복귀 시 사용자 설정대로 재생
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (!actx) return;
      try {
        if (document.hidden) actx.suspend();
        else if (!muted) actx.resume();
      } catch (e) {}
    });
  }

  // ── 난이도 티어 핍 (세션3) — 커브를 상시 노출(숨겨진 규칙 없음), 텍스트 0
  function updateTier() {
    var el = document.getElementById('tierpips');
    if (!el) return;
    var tier = C.difficulty(state.placements).tier;
    var html = '';
    for (var i = 1; i <= 3; i++) html += '<i class="pip' + (i <= tier ? ' on' : '') + '"></i>';
    el.innerHTML = html;
  }

  // ── 세션5: 설명 토스트 (세션당 1회 — 작가 확정) + 행동 우선 카피 (Toss UX writing 게이트: 해요체·능동·결과 예고)
  var seenToast = {}, toastQ = [], toastBusy = false;
  function showToast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    toastQ.push(msg);
    if (toastBusy) return;
    toastBusy = true;
    (function next() {
      var m = toastQ.shift();
      if (!m) { toastBusy = false; return; }
      el.textContent = m;
      el.classList.add('show');
      setTimeout(function () { el.classList.remove('show'); setTimeout(next, 260); }, 2400);
    })();
  }
  function showOnce(key, msg) { if (seenToast[key]) return; seenToast[key] = 1; showToast(msg); }
  // 세션11 카피 리스킨: 조각(괴식 젤리)과 위협 '젤리' 명칭 충돌 해소 — 위협은 '시럽'으로
  var TH_COPY = {
    crack: '균열이 곧 구멍이 돼요 — 젤리로 덮으면 막아요',
    jelly: '끈적 시럽이 칸을 채워요 — 줄에 넣으면 지워져요',
    crust: '설탕이 젤리를 굳혀요 — 옆 줄을 지우면 깨져요',
    slime: '초코 슬라임이 번져요 — 옆 줄을 지우면 잡아요',
    crow: '도둑 까마귀가 소중한 걸 가져가요 — 예고 칸을 덮거나 먼저 구해요'
  };
  var ITEM_COPY = {};
  ITEM_COPY[12] = '폭탄을 받았어요 — 3×3을 부숴요';
  ITEM_COPY[13] = '롤링핀을 받았어요 — 가로 한 줄을 밀어요';
  ITEM_COPY[14] = '롤링핀을 받았어요 — 세로 한 줄을 밀어요';
  ITEM_COPY[15] = '마카롱을 받았어요 — 옆 젤리와 같은 맛을 다 지워요';

  // ── 세션5: 상태 스트립 (Toss 원칙: 1순위 신호 = 구할 대상 · 다음 위협) ──
  function updateStatus() {
    var el = document.getElementById('status');
    if (!el) return;
    var parts = [], hasBaby = false;
    // 세션13: 임무/디펜스 진행 — 1순위 신호
    if (state.mode === 'stage' && state.goal) {
      var g = state.goal;
      if (g.type === 'color') parts.push('🎯 ' + FLAVORS[g.color] + ' ' + Math.min(state.colorCleared[g.color], g.n) + '/' + g.n);
      else if (g.type === 'rescue') parts.push('🎯 구출 ' + Math.min(state.totalRescued, g.n) + '/' + g.n);
      else if (g.type === 'score') parts.push('🎯 ' + state.score + '/' + g.score + '점 · ' + Math.max(0, g.moves - state.placements) + '수');
    } else if (state.mode === 'defense') {
      parts.push('🛡️ 까마귀 ' + state.crowsDefused + '마리 방어');
    }
    for (var r = 0; r < C.N; r++) for (var c = 0; c < C.N; c++) if (state.grid[r][c] === C.BABY) hasBaby = true;
    if (hasBaby && state.mode !== 'defense') parts.push('🐣 지켜요');
    if (runRescued > 0) parts.push('🐥×' + runRescued);
    if (state.threats.length) {
      var min = 99;
      state.threats.forEach(function (th) { if (th.countdown < min) min = th.countdown; });
      parts.push('⚠️' + state.threats.length + ' · ⏳' + min);
    }
    el.textContent = parts.join('    ');
  }

  var vignetteT = 0; // 까마귀 등장 경고 (세션5 — "까마귀 못 봄" 피드백)
  var runRescued = 0, runMaxCombo = 0; // 세션7: 판 스탯 (결과 화면용)

  // ── 세션9: 괴식 젤리 아이덴티티 (작가 확정 — 코믹 바이럴). 색 = 맛. clean-room(외부 IP 명칭 미사용).
  var FLAVORS = ['딸기맛', '귀지맛', '코딱지맛', '치약맛', '가지맛'];

  // ── 세션9: 소중한 것 사진 (사람+반려동물, 최대 2장) — 100% 온디바이스(canvas 가공, 서버 전송 0 = 개인정보 소명 유지)
  var photos = [];
  try { var pj = storeGet('cp-photos'); if (pj) photos = JSON.parse(pj) || []; } catch (e) { photos = []; }
  var photoImgs = [];
  function loadPhotoImgs() {
    photoImgs = [];
    photos.forEach(function (durl, i) {
      var im = new Image();
      im.onload = function () { photoImgs[i] = im; };
      im.src = durl;
    });
  }
  if (typeof Image !== 'undefined' && photos.length) loadPhotoImgs();
  // 가공: 중앙 정사각 크롭 → 32px 픽셀화(레트로 에셋톤, 웃긴 저해상 감성) → 96px 확대
  function processPhoto(im) {
    var s = Math.min(im.width, im.height);
    var small = document.createElement('canvas'); small.width = 32; small.height = 32;
    small.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 32, 32);
    var out = document.createElement('canvas'); out.width = 96; out.height = 96;
    var octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(small, 0, 0, 96, 96);
    return out.toDataURL('image/png');
  }

  // ── FX (파티클 + 점수 플로트) — delayMs: 연쇄 단계별 시차 연출용 ──
  function addSparkles(r, c, color, n, delayMs) {
    for (var i = 0; i < n; i++) {
      fx.push({
        kind: 'p', x: PAD + c * CS + CS / 2, y: PAD + r * CS + CS / 2,
        vx: (Math.sin(i * 2.4 + r) * 2.2), vy: -2.5 - (i % 3), color: color,
        t0: performance.now() + (delayMs || 0), life: 600 + (i % 4) * 90
      });
    }
  }
  function addFloat(r, c, text, color, delayMs) {
    fx.push({ kind: 'f', x: PAD + c * CS + CS / 2, y: PAD + r * CS, text: text, color: color, t0: performance.now() + (delayMs || 0), life: 900 });
  }
  function drawFx(t) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i], dt = t - f.t0;
      if (dt < 0) continue; // 아직 시작 전(연쇄 시차)
      if (dt > f.life) { fx.splice(i, 1); continue; }
      var p = dt / f.life;
      if (f.kind === 'p') {
        var px = f.x + f.vx * dt / 16, py = f.y + f.vy * dt / 16 + 0.003 * dt * dt / 16;
        bctx.globalAlpha = 1 - p;
        bctx.fillStyle = f.color;
        bctx.beginPath(); bctx.arc(px, py, 3.5 * (1 - p * 0.6), 0, 7); bctx.fill();
        bctx.globalAlpha = 1;
      } else {
        bctx.globalAlpha = 1 - p * p;
        bctx.font = 'bold 20px Jua, sans-serif'; bctx.textAlign = 'center';
        bctx.fillStyle = f.color; bctx.strokeStyle = '#FFFDF7'; bctx.lineWidth = 4; bctx.lineJoin = 'round';
        bctx.strokeText(f.text, f.x, f.y - p * 34);
        bctx.fillText(f.text, f.x, f.y - p * 34);
        bctx.globalAlpha = 1;
      }
    }
  }

  // ── 트레이 ──
  function drawTray() {
    slots.forEach(function (slotEl, i) {
      var cv = slotEl.querySelector('canvas'), ctx = cv.getContext('2d');
      var size = 96 * dpr; cv.width = size; cv.height = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, 96, 96);
      var s = state.tray[i];
      slotEl.classList.toggle('used', s == null);
      if (s == null) return;
      if (s >= C.BOMB) { drawSpecial(ctx, s, 24, 24, 48, performance.now()); return; }
      var m = C.SHAPES[s].m, rows = m.length, cols = m[0].length;
      var cell = Math.min(26, Math.floor(84 / Math.max(rows, cols)));
      var ox = (96 - cols * cell) / 2, oy = (96 - rows * cell) / 2;
      var pcol = PIECE_COLORS[(state.trayColors[i] || 0) % PIECE_COLORS.length];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++)
        if (m[r][c]) drawCuteCell(ctx, ox + c * cell, oy + r * cell, cell, pcol, {});
    });
  }

  // ── 마스코트 ──
  function setMascot(cls, holdMs) {
    var el = document.getElementById('mascot');
    // SVG 요소는 className이 읽기 전용(SVGAnimatedString) — setAttribute 사용 (strict mode TypeError 방지)
    el.setAttribute('class', cls === 'idle' ? '' : cls);
    if (mascotTimer) clearTimeout(mascotTimer);
    if (holdMs) mascotTimer = setTimeout(updateMascotByThreat, holdMs);
  }
  function updateMascotByThreat() {
    if (state.over) { setMascot('ko'); return; }
    var urgent = state.threats.some(function (t) { return t.countdown <= 1; });
    setMascot(urgent ? 'worried' : 'idle');
  }

  // ── 첫 실행 힌트 (👆 트레이→보드, 텍스트 0) ──
  function showHint() {
    var h = document.getElementById('hint');
    var side = CS * C.N + PAD * 2;
    h.style.display = 'block';
    h.style.left = (side / 2 - 20) + 'px';
    h.style.top = (side - 20) + 'px';
  }
  function hideHint() { document.getElementById('hint').style.display = 'none'; }

  // ── 입력: 드래그 1종 ──
  function slotFromEvent(e) {
    var el = e.target.closest ? e.target.closest('.slot') : null;
    return el ? +el.dataset.slot : null;
  }
  document.getElementById('tray').addEventListener('pointerdown', function (e) {
    ensureAudio(); // 브라우저 오디오 정책: 첫 사용자 제스처에서 unlock
    if (state.over) return;
    var slot = slotFromEvent(e);
    if (slot == null || state.tray[slot] == null) return;
    var shapeIdx = state.tray[slot];
    var m = C.SHAPES[shapeIdx].m;
    drag = { slot: slot, shapeIdx: shapeIdx, rows: m.length, cols: m[0].length, target: null };
    // 포인터 캡처 — 요소 밖으로 나가도 move/up 보장 (브라우저 호환)
    if (e.pointerId != null && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    }
    dragCv.style.display = 'block';
    renderDragGhost();
    moveDrag(e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    moveDrag(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var tg = drag.target, wasBin = drag.overBin, slot = drag.slot;
    dragCv.style.display = 'none';
    var binEl2 = document.getElementById('bin');
    if (binEl2 && binEl2.classList) binEl2.classList.remove('hot');
    drag = null;
    if (wasBin) doDiscard(slot);
    else if (tg && tg.valid) doPlace(slot, tg.r, tg.c);
  });
  window.addEventListener('pointercancel', function () {
    if (drag) {
      dragCv.style.display = 'none';
      var b = document.getElementById('bin');
      if (b && b.classList) b.classList.remove('hot');
      drag = null;
    }
  });

  function renderDragGhost() {
    var w = drag.cols * CS, h = drag.rows * CS;
    dragCv.width = w * dpr; dragCv.height = h * dpr;
    dragCv.style.width = w + 'px'; dragCv.style.height = h + 'px';
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.clearRect(0, 0, w, h);
    if (drag.shapeIdx >= C.BOMB) { drawSpecial(dctx, drag.shapeIdx, 0, 0, CS, performance.now()); drag.w = w; drag.h = h; return; }
    var m = C.SHAPES[drag.shapeIdx].m;
    var dcol = PIECE_COLORS[(state.trayColors[drag.slot] || 0) % PIECE_COLORS.length];
    for (var r = 0; r < drag.rows; r++) for (var c = 0; c < drag.cols; c++)
      if (m[r][c]) drawCuteCell(dctx, c * CS, r * CS, CS, dcol, {});
    drag.w = w; drag.h = h;
  }

  // 띄우기: 터치(coarse)만 크게, 마우스는 거의 0 (데스크톱 드래그 위화감 제거)
  var LIFT = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 64 : 8;
  var SNAP = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]; // 관대한 스냅 (±1셀)
  function moveDrag(px, py) {
    var gx = px - drag.w / 2, gy = py - drag.h / 2 - LIFT;
    dragCv.style.transform = 'translate(' + gx + 'px,' + gy + 'px)';
    // 버리기 통 호버 (세션5)
    var binEl = document.getElementById('bin');
    if (binEl && binEl.getBoundingClientRect) {
      var br2 = binEl.getBoundingClientRect();
      var overBin = px >= br2.left && px <= br2.left + br2.width && py >= br2.top && py <= br2.top + br2.height;
      drag.overBin = overBin;
      binEl.classList.toggle('hot', overBin);
      if (overBin) { drag.target = null; return; }
    }
    // 고스트 "중심" 기준으로 타깃 셀 계산 → 주변 ±1셀에서 유효 위치 스냅
    var rect = boardCv.getBoundingClientRect();
    var cxg = px - rect.left, cyg = py - rect.top - LIFT;
    var side = CS * C.N + PAD * 2;
    if (cxg < -CS || cyg < -CS || cxg > side + CS || cyg > side + CS) { drag.target = null; return; }
    var idealC = Math.round((cxg - PAD) / CS - drag.cols / 2);
    var idealR = Math.round((cyg - PAD) / CS - drag.rows / 2);
    drag.target = null;
    for (var i = 0; i < SNAP.length; i++) {
      var r = idealR + SNAP[i][0], c = idealC + SNAP[i][1];
      if (C.canPlace(state, drag.shapeIdx, r, c)) { drag.target = { r: r, c: c, valid: true }; return; }
    }
    if (idealR > -drag.rows && idealC > -drag.cols && idealR < C.N && idealC < C.N)
      drag.target = { r: idealR, c: idealC, valid: false };
  }

  // ── 배치 실행 + 주스 ──
  function doPlace(slot, r, c) {
    var ev = C.place(state, slot, r, c);
    if (!ev) return;
    juice(ev);
  }

  // 버리기 (세션5, 작가 확정): 통에 드래그 → 조각 소멸 + 위협 1틱 전진
  function doDiscard(slot) {
    var ev = C.discard(state, slot);
    if (!ev) return;
    sfx('discard'); buzz(50);
    juice(ev);
  }

  // 이벤트 → 연출 공용 처리 (배치·버리기 공용 — ev가 전부 결정)
  function juice(ev) {
    var t = performance.now();
    if (!firstPlaceDone) { firstPlaceDone = true; hideHint(); }
    ev.placed.forEach(function (p) { cellPop[p[0] + ',' + p[1]] = t; });
    var itemGain = ev.gained - (ev.chain.length ? ev.chain.reduce(function (a, s2) { return a + s2.gained; }, 0) : 0);
    // 아이템 연출 (세션3·4)
    if (ev.bomb) {
      sfx('bomb'); buzz(120); shakeT = 340;
      ev.bomb.cleared.forEach(function (p) { addSparkles(p[0], p[1], '#FF7043', 6); });
      addSparkles(ev.bomb.r, ev.bomb.c, '#FFB300', 14);
      if (itemGain > 0) addFloat(ev.bomb.r, ev.bomb.c, '+' + itemGain, '#FF5722');
    } else if (ev.rocket) {
      sfx('rocket'); buzz(90); shakeT = 260;
      ev.rocket.cleared.forEach(function (p, pi) { addSparkles(p[0], p[1], '#D9A05B', 4, pi * 20); });
      if (itemGain > 0) addFloat(ev.rocket.r, ev.rocket.c, '+' + itemGain, '#D9822B');
    } else if (ev.macaron) {
      sfx('macaron'); buzz(70);
      ev.macaron.cleared.forEach(function (p, pi) { addSparkles(p[0], p[1], PIECE_COLORS[ev.macaronColor % PIECE_COLORS.length], 6, pi * 30); });
      if (itemGain > 0) addFloat(ev.macaron.r, ev.macaron.c, '+' + itemGain, ev.macaronColor != null ? PIECE_COLORS[ev.macaronColor % PIECE_COLORS.length] : '#E91E63');
      if (ev.macaronColor != null) addFloat(ev.macaron.r, ev.macaron.c, FLAVORS[ev.macaronColor % FLAVORS.length] + ' 전멸!', PIECE_COLORS[ev.macaronColor % PIECE_COLORS.length], 380); // 괴식 젤리 아이덴티티 (세션9)
    } else if (ev.discarded == null) sfx('place');
    // 직접 덮기 해체(배치 단계) — 연쇄 착지 해체는 아래 chain 루프에서 시차 연출
    var chainDefCount = 0;
    if (ev.chain) ev.chain.forEach(function (st) { chainDefCount += st.defused.length; });
    var directDef = ev.defused.slice(0, ev.defused.length - chainDefCount);
    if (ev.bomb) directDef = []; // 폭탄 해체는 폭발 연출에 포함
    directDef.forEach(function (p) { addSparkles(p[0], p[1], '#FFD700', 10); addFloat(p[0], p[1], '+25', '#FF9800'); sfx('defuse'); });
    ev.fired.forEach(function (p) {
      shakeT = 300;
      addSparkles(p[0], p[1], p[2] === 'crack' ? '#5D4037' : p[2] === 'crust' ? CRUST_COLOR : p[2] === 'slime' ? SLIME_COLOR : p[2] === 'crow' ? CROW_ACCENT : JELLY_COLOR, 8);
      sfx(p[2] === 'crust' ? 'crackle' : p[2] === 'slime' ? 'blub' : 'fire'); buzz(80);
    });
    ev.spawned.forEach(function (p) {
      sfx(p[2] === 'crow' ? 'caw' : 'spawn');
      showOnce('th-' + p[2], TH_COPY[p[2]]);
      if (p[2] === 'crow') { vignetteT = 700; setMascot('worried', 1600); } // 까마귀 가시성 (세션5)
    });
    if (ev.fizzled) ev.fizzled.forEach(function (p) { addSparkles(p[0], p[1], '#C9C9C9', 5); }); // 설탕 예고 소멸 포프
    if (ev.broke) ev.broke.forEach(function (p) { addSparkles(p[0], p[1], p[2] === 'crust' ? CRUST_COLOR : SLIME_COLOR, 8); addFloat(p[0], p[1], p[2] === 'crust' ? '+15' : '+10', '#8D6E63'); });
    if (ev.rescued > 0) { runRescued += ev.rescued; sfx('rescue'); buzz([60, 40, 80]); addFloat(3, 3, '+100', '#FF6E9C'); setMascot('cheer', 1400); }
    if (state.combo > runMaxCombo) runMaxCombo = state.combo;
    if (ev.babySpawn) { cellPop[ev.babySpawn[0] + ',' + ev.babySpawn[1]] = t; addSparkles(ev.babySpawn[0], ev.babySpawn[1], BABY_COLOR, 8); sfx('grant'); showOnce('baby', '아기 쿠키가 나왔어요 — 줄에 넣으면 구해져요'); }
    if (ev.slimeSpread) { addSparkles(ev.slimeSpread[0], ev.slimeSpread[1], SLIME_COLOR, 5); sfx('blub'); }
    if (ev.chain && ev.chain.length) {
      // 연쇄(과제 B): 단계별 시차 — 클리어 반짝 → 낙하 애니 → 착지 해체 → 콤보 배수 플로트(숫자·기호만, 텍스트 0)
      var STEP_MS = 170, lineSteps = 0;
      ev.chain.forEach(function (st) { if (st.clearedLines > 0) lineSteps++; });
      var comboN = state.combo - lineSteps;
      ev.chain.forEach(function (st, si) {
        var d0 = si * STEP_MS;
        st.clearedCells.forEach(function (p) { addSparkles(p[0], p[1], '#FFF59D', 3, d0); });
        if (st.broke) st.broke.forEach(function (p) { addSparkles(p[0], p[1], p[2] === 'crust' ? CRUST_COLOR : SLIME_COLOR, 6, d0 + 80); });
        st.fell.forEach(function (mv) {
          fallAnim[mv[2] + ',' + mv[3]] = { fromR: mv[0], t0: t + d0 + 60, dur: 200 };
        });
        st.defused.forEach(function (p) { addSparkles(p[0], p[1], '#FFD700', 10, d0 + 260); addFloat(p[0], p[1], '+25', '#FF9800', d0 + 260); sfx('defuse', 0, (d0 + 260) / 1000); });
        if (st.clearedLines > 0) {
          comboN++;
          var mid = st.clearedCells[(st.clearedCells.length / 2) | 0];
          addFloat(mid[0], mid[1], (comboN >= 2 ? '×' + comboN + ' ' : '') + '+' + st.gained, comboN >= 2 ? '#FF5722' : '#E91E63', d0);
          if (comboN >= 2) { sfx('combo', comboN, d0 / 1000); buzz(40); } else sfx('clear', 0, d0 / 1000);
        }
      });
      if (ev.chain.length >= 2) shakeT = 220; // 연쇄 손맛
      setMascot('cheer', 1100);
    } else if (ev.defused.length) {
      setMascot('cheer', 900);
    } else updateMascotByThreat();
    if (ev.granted != null) { sfx('grant', 0, 0.25); setMascot('cheer', 1200); showOnce('item-' + ev.granted, ITEM_COPY[ev.granted]); } // 보상: 트레이에 아이템 등장
    document.getElementById('score').textContent = String(state.score);
    updateTier();
    updateStatus();
    drawTray();
    if (state.over) endGame();
  }

  // ── 벨 / 리스타트 / 게임오버 ──
  document.getElementById('bell').addEventListener('click', function () {
    ensureAudio();
    if (C.ringBell(state)) {
      sfx('bell');
      this.classList.add('used');
      state.threats.forEach(function (th) { addFloat(th.r, th.c, '+1', '#42A5F5'); });
      updateMascotByThreat();
    }
  });
  // ── 세션9: 사진 등록 (📷) + 인스타그래머블 공유 카드 ──
  var photoBtn = document.getElementById('photo'), photoInput = document.getElementById('photoinput');
  if (photoBtn && photoInput && photoBtn.addEventListener) {
    photoBtn.addEventListener('click', function () {
      showOnce('photo-hint', '소중한 것(사람·반려동물) 사진을 골라주세요 — 기기 밖으로 나가지 않아요');
      if (photoInput.click) photoInput.click();
    });
    photoInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(photoInput.files || []).slice(0, 2);
      if (!files.length) return;
      photos = [];
      var done = 0;
      files.forEach(function (f, idx) {
        var rd = new FileReader();
        rd.onload = function () {
          var im = new Image();
          im.onload = function () {
            photos[idx] = processPhoto(im);
            done++;
            if (done === files.length) {
              storeSet('cp-photos', JSON.stringify(photos));
              loadPhotoImgs();
              showToast('등록 완료 — 이제 소중한 것을 지켜주세요');
            }
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(f);
      });
    });
  }

  // 공유 카드 1080×1080 (성공 = 지켰다! / 실패 = 괴식 젤리 범벅 — 코믹, 파괴 아님)
  function buildShareCard(saved) {
    var W = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = W;
    var x = cv.getContext('2d');
    var grad = x.createLinearGradient(0, 0, 0, W);
    grad.addColorStop(0, saved ? '#FFE9F0' : '#EFE7DC'); grad.addColorStop(1, '#FFF3DC');
    x.fillStyle = grad; x.fillRect(0, 0, W, W);
    x.textAlign = 'center';
    x.fillStyle = '#6B4226'; x.font = 'bold 76px Jua, sans-serif';
    x.fillText(saved ? '소중한 걸 지켰다!' : '괴식 젤리 범벅이 됐다…', W / 2, 150);
    var img = photoImgs[0];
    x.save();
    x.beginPath(); x.arc(W / 2, 470, 235, 0, 7); x.clip();
    if (img) { try { x.drawImage(img, W / 2 - 235, 235, 470, 470); } catch (e) {} }
    else { x.fillStyle = '#E8A25C'; x.fillRect(W / 2 - 235, 235, 470, 470); x.fillStyle = '#4A2E17'; x.font = '200px Jua, sans-serif'; x.fillText('🐣', W / 2, 540); }
    x.restore();
    x.lineWidth = 14; x.strokeStyle = saved ? '#FF6E9C' : '#7A4E2D';
    x.beginPath(); x.arc(W / 2, 470, 235, 0, 7); x.stroke();
    if (!saved) {
      [[390, 330, '#9BDB8A'], [700, 370, '#C9A87F'], [520, 640, '#B5C7F5'], [660, 590, '#FFE066'], [430, 560, '#8AE0C8']].forEach(function (b) {
        x.fillStyle = b[2]; x.globalAlpha = 0.85;
        x.beginPath(); x.ellipse(b[0], b[1], 74, 54, 0.5, 0, 7); x.fill();
      });
      x.globalAlpha = 1;
      x.font = '52px Jua, sans-serif'; x.fillStyle = '#6B4226';
      x.fillText('(코딱지맛에 파묻힘)', W / 2, 800);
    } else {
      x.font = '52px Jua, sans-serif'; x.fillStyle = '#FF6E9C';
      x.fillText('🎀 ' + runRescued + '번 구출 성공', W / 2, 790);
    }
    x.font = '44px Jua, sans-serif'; x.fillStyle = '#8D6B4A';
    x.fillText('점수 ' + state.score + ' · 최대 콤보 ×' + runMaxCombo, W / 2, 880);
    x.font = '38px Jua, sans-serif'; x.fillStyle = '#C9A87F';
    x.fillText('지켜줘! 젤리 패닉 — 소중한 것을 지키는 퍼즐', W / 2, 985);
    return cv;
  }
  var shareBtn = document.getElementById('share');
  if (shareBtn && shareBtn.addEventListener) shareBtn.addEventListener('click', function () {
    var cv = buildShareCard(state.overCause !== 'baby');
    if (cv.toBlob) cv.toBlob(function (blob) {
      if (!blob) return;
      try {
        var f = new File([blob], 'jelly-panic.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: '지켜줘! 젤리 패닉' }).catch(function () {});
          return;
        }
      } catch (e) {}
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'jelly-panic.png';
      a.click();
    });
  });

  // 세션7: 뮤트 토글 (설정 기억 — 상용 필수 요소)
  var muteEl = document.getElementById('mute');
  function syncMuteLabel() { if (muteEl) muteEl.textContent = muted ? '🔇' : '🔊'; }
  if (muteEl) muteEl.addEventListener('click', function () {
    muted = !muted;
    storeSet('cp-mute', muted ? '1' : '0');
    if (masterG) masterG.gain.value = muted ? 0 : 1;
    syncMuteLabel();
    if (!muted) { ensureAudio(); sfx('place'); }
  });
  syncMuteLabel();
  document.getElementById('restart').addEventListener('click', function () { reset((Date.now() % 1000000) | 0); });
  document.getElementById('replay').addEventListener('click', function () { reset((Date.now() % 1000000) | 0); });
  // 종료하기 (세션12 — 작가: "다시 하기와 종료하기만"). 앱인토스 런타임에서는 플랫폼 닫기 API로 교체 예정.
  var quitEl = document.getElementById('quit');
  if (quitEl && quitEl.addEventListener) quitEl.addEventListener('click', function () {
    try { window.close(); } catch (e) {}
    setTimeout(function () { showToast('탭을 닫으면 종료돼요'); }, 250);
  });

  // ── 세션12: 도감 (❓) — 위협·아이템 효과 팝업. 닫기 버튼 좌측 규칙(Toss 다이얼로그) 준수.
  function openDex() {
    var dex = document.getElementById('dex'), list = document.getElementById('dexlist');
    if (!dex || !list || !document.createElement) return;
    list.innerHTML = '';
    var entries = [
      { icon: function (x, s) { drawHoleCell(x, 0, 0, s); }, name: '균열 → 구멍', desc: TH_COPY.crack },
      { icon: function (x, s) { drawJellyCell(x, 0, 0, s, 300); }, name: '끈적 시럽', desc: TH_COPY.jelly },
      { icon: function (x, s) { drawCrustCell(x, 0, 0, s); }, name: '굳은 설탕', desc: TH_COPY.crust },
      { icon: function (x, s) { drawSlimeCell(x, 0, 0, s, 300, false); }, name: '초코 슬라임', desc: TH_COPY.slime },
      { icon: function (x, s) { drawCrowIcon(x, s); }, name: '도둑 까마귀', desc: TH_COPY.crow },
      { icon: function (x, s) { drawBabyCell(x, 0, 0, s, 300); }, name: '소중한 것', desc: '줄에 넣으면 구출돼요 (+100, 마카롱 보상)' },
      { icon: function (x, s) { drawBombCell(x, 0, 0, s); }, name: '폭탄', desc: '드롭한 칸 중심 3×3을 부숴요 (2연쇄 보상)' },
      { icon: function (x, s) { drawRocketCell(x, 0, 0, s, false); }, name: '롤링핀', desc: '가로 또는 세로 한 줄을 밀어요 (한 수 3줄+ 보상)' },
      { icon: function (x, s) { drawMacaronCell(x, 0, 0, s, 300); }, name: '색 마카롱', desc: '원하는 젤리 위에 드롭 — 그 맛을 전부 지워요 (구출 보상)' },
      { emoji: '🔔', name: '지연 벨', desc: '판당 1번, 모든 위협을 1턴 늦춰요' },
      { emoji: '🗑️', name: '버리기 통', desc: '조각을 버려요 — 대신 위협이 1턴 다가와요' }
    ];
    entries.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'dexrow';
      var iconEl;
      if (e.emoji) {
        iconEl = document.createElement('div');
        iconEl.className = 'dexemoji';
        iconEl.textContent = e.emoji;
      } else {
        iconEl = document.createElement('canvas');
        iconEl.width = 44; iconEl.height = 44;
        try { e.icon(iconEl.getContext('2d'), 44); } catch (err) {}
      }
      var txt = document.createElement('div');
      var b = document.createElement('b'); b.textContent = e.name;
      var sp = document.createElement('span'); sp.textContent = e.desc;
      txt.appendChild(b); txt.appendChild(sp);
      row.appendChild(iconEl); row.appendChild(txt);
      list.appendChild(row);
    });
    dex.classList.add('show');
  }
  function drawCrowIcon(ctx, s) { // 도감용 까마귀 실루엣
    var cx = s / 2, cy = s / 2;
    ctx.fillStyle = CROW_ACCENT;
    ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.08, s * 0.26, s * 0.19, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.19, cy - s * 0.08, s * 0.13, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + s * 0.3, cy - s * 0.1); ctx.lineTo(cx + s * 0.45, cy - s * 0.04); ctx.lineTo(cx + s * 0.3, cy - s * 0.01); ctx.closePath();
    ctx.fillStyle = '#FF9800'; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx + s * 0.21, cy - s * 0.1, s * 0.035, 0, 7); ctx.fill();
  }
  // ── 세션13: 모드 선택 (🎮) ──
  function unlockedStage() { return Math.min(parseInt(storeGet('cp-stage') || '0', 10) || 0, C.STAGES.length - 1); }
  function stageGoalDesc(i) {
    var g = C.STAGES[i].goal;
    if (g.type === 'color') return FLAVORS[g.color] + ' 젤리 ' + g.n + '개 부수기';
    if (g.type === 'rescue') return '소중한 것 ' + g.n + '번 구출하기';
    return g.moves + '수 안에 ' + g.score + '점 만들기';
  }
  function pickMode(m) {
    currentMode = m;
    currentStage = (m === 'stage') ? unlockedStage() : 0;
    var mp = document.getElementById('modes');
    if (mp && mp.classList) mp.classList.remove('show');
    reset((Date.now() % 1000000) | 0);
    if (m === 'stage') showToast('임무: ' + stageGoalDesc(currentStage));
    else if (m === 'defense') showToast('한가운데 소중한 것 — 까마귀가 몰려와요');
  }
  var modeBtnEl = document.getElementById('mode');
  if (modeBtnEl && modeBtnEl.addEventListener) modeBtnEl.addEventListener('click', function () {
    var mp = document.getElementById('modes'), si = document.getElementById('stageinfo');
    if (si) si.textContent = '스테이지 ' + (unlockedStage() + 1) + ' — ' + stageGoalDesc(unlockedStage());
    if (mp && mp.classList) mp.classList.add('show');
  });
  ['classic', 'stage', 'defense'].forEach(function (m) {
    var el = document.getElementById('mode-' + m);
    if (el && el.addEventListener) el.addEventListener('click', function () { pickMode(m); });
  });
  var modesCloseEl = document.getElementById('modesclose');
  if (modesCloseEl && modesCloseEl.addEventListener) modesCloseEl.addEventListener('click', function () {
    var mp = document.getElementById('modes');
    if (mp && mp.classList) mp.classList.remove('show');
  });

  var helpEl = document.getElementById('help'), dexCloseEl = document.getElementById('dexclose');
  if (helpEl && helpEl.addEventListener) helpEl.addEventListener('click', openDex);
  if (dexCloseEl && dexCloseEl.addEventListener) dexCloseEl.addEventListener('click', function () {
    var dex = document.getElementById('dex');
    if (dex && dex.classList) dex.classList.remove('show');
  });

  function endGame() {
    var won = state.overCause === 'clear'; // 세션13: 임무 완수
    if (won) { sfx('rescue'); buzz([60, 40, 80]); setMascot('cheer'); }
    else { sfx('over'); setMascot('ko'); }
    // 사인 가독 (Pillar 3) + 행동 우선 카피 (Toss 게이트: 감정 압박 대신 원인)
    var cause;
    if (won) {
      cause = '스테이지 ' + (state.stage + 1) + ' 임무 완수!';
      var unlocked = parseInt(storeGet('cp-stage') || '0', 10) || 0;
      var next = Math.min(state.stage + 1, C.STAGES.length - 1);
      if (next > unlocked) storeSet('cp-stage', String(next));
      currentStage = next;
      var rp2 = document.getElementById('replay');
      if (rp2) rp2.textContent = (state.stage + 1 < C.STAGES.length) ? '다음 스테이지' : '다시 하기';
    }
    else if (state.overCause === 'moves') cause = '수를 다 썼어요 — 다시 도전해요';
    else if (state.overCause === 'baby') cause = photoImgs.length ? '소중한 것이 코딱지맛 젤리 범벅이 됐어요…' : '아기 쿠키를 지키지 못했어요';
    else cause = '예고된 칸을 비우지 못했어요 (구멍 ' + C.countCells(state, C.HOLE) + '개)';
    document.getElementById('overcause').textContent = cause;
    // 세션7: 판 스탯 + 베스트 스코어(로컬 저장) + 신기록 배지
    var best = parseInt(storeGet('cp-best') || '0', 10) || 0;
    var isNew = state.score > best;
    if (isNew) { best = state.score; storeSet('cp-best', String(best)); }
    var statsEl = document.getElementById('overstats');
    if (statsEl) statsEl.textContent = '🐥 구출 ' + runRescued + ' · 🔥 최대 콤보 ×' + runMaxCombo + ' · 🏆 최고 ' + best;
    var nb = document.getElementById('newbest');
    if (nb && nb.classList && isNew && state.score > 0) nb.classList.add('show');
    // 세션10: 사진 미등록자 넛지 (세션당 1회 — 개인화가 리텐션 핵심 훅)
    if (!photoImgs.length) showOnce('photo-nudge', '📷 소중한 것 사진을 등록하면 지키는 맛이 달라져요');
    // 점수 카운트업 연출
    var scoreEl = document.getElementById('overscore');
    var target = state.score, shown = 0, steps = Math.max(1, Math.min(30, target));
    scoreEl.textContent = '0';
    var iv = setInterval(function () {
      shown += Math.ceil(target / steps);
      if (shown >= target) { shown = target; clearInterval(iv); if (isNew && target > 0) sfx('rescue'); }
      scoreEl.textContent = String(shown);
    }, 26);
    setTimeout(function () { document.getElementById('over').classList.add('show'); }, 550);
  }

  // ── 루프 ──
  function loop(t) { drawBoard(t); requestAnimationFrame(loop); }

  // 세션10: 런타임 오류 가드 (검수 요건: 흰 화면/무응답 방지) — 마지막 오류 기록 + 복구 안내
  window.addEventListener('error', function (e) {
    try {
      storeSet('cp-lasterror', String(e && e.message || '') .slice(0, 200));
      var el = document.getElementById('toast');
      if (el && el.classList) { el.textContent = '문제가 생겼어요 — 새로고침하면 이어서 할 수 있어요'; el.classList.add('show'); }
    } catch (e2) {}
  });

  resize();
  window.addEventListener('resize', function () { resize(); drawTray(); if (!firstPlaceDone) showHint(); });
  reset(urlSeed());
  requestAnimationFrame(loop);

  // [RELEASE-STRIP-START] — 아래 블록은 출시 빌드에서 자동 제거됨 (개발·검증·소재 촬영 전용)
  // 프로토 디버그 훅 — 스모크·실브라우저 검증 전용(게임플레이 미사용)
  window.__CP = { state: function () { return state; }, place: doPlace, discard: doDiscard, reset: reset };
  // ?demo=1 : 자동 플레이 (greedy — 광고 소재 촬영·어트랙트 모드). 아기 위험 수는 절대 두지 않음.
  if (/[?&]demo=1/.test(location.search)) {
    var demoIv = setInterval(function () {
      if (state.over) { clearInterval(demoIv); return; }
      var best = null, bestGain = -1;
      for (var di = 0; di < 3; di++) {
        var ds = state.tray[di];
        if (ds == null) continue;
        for (var dr = 0; dr < C.N; dr++) for (var dc = 0; dc < C.N; dc++) {
          if (!C.canPlace(state, ds, dr, dc)) continue;
          var pv2 = C.previewPlace(state, ds, dr, dc, state.trayColors[di]);
          if (!pv2) continue;
          var g = pv2.gained + (pv2.rescued ? 500 : 0) - (pv2.babyEaten ? 99999 : 0);
          if (g > bestGain) { bestGain = g; best = [di, dr, dc]; }
        }
      }
      if (best) doPlace(best[0], best[1], best[2]);
      else doDiscard(state.tray[0] != null ? 0 : state.tray[1] != null ? 1 : 2);
    }, 900);
  }
  // ?autochain=1 : 로드 후 2연쇄 시나리오 자동 실행 — 낙하·콤보 연출 육안 검증용 (T11과 동일 구성)
  if (/[?&]autochain=1/.test(location.search)) {
    setTimeout(function () {
      reset(30);
      for (var cc = 0; cc < 7; cc++) { state.grid[7][cc] = C.BLOCK; state.grid[6][cc] = C.BLOCK; colorGrid[7][cc] = '#9BDB8A'; colorGrid[6][cc] = '#8FD4F0'; }
      state.grid[5][7] = C.BLOCK; colorGrid[5][7] = '#FF9EB5';
      state.tray = [0, 0, 0];
      drawTray();
      setTimeout(function () { doPlace(0, 7, 7); }, 2500);
    }, 2500);
  }
  // [RELEASE-STRIP-END]
})();
