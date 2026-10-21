# Jelly Panic / 지켜줘! 젤리 패닉

> 「위협은 덮을 칸이 있을 때만 생긴다」는 재미 규칙을 먼저 정하고, 무작위 500판에서 막을 수 없는 위협 0건으로 증명한 수읽기 퍼즐 디펜스. 설치할 것 없는 브라우저 데모.
> A placement puzzle defense game built rule-first: every threat is shown before it fires and always has a cell that can cover it, verified over 500 random games; zero-dependency browser demo.
>
> 작품 페이지: https://ljhljh0703-cmd.github.io/jelly-panic/portfolio.html · 플레이: https://ljhljh0703-cmd.github.io/jelly-panic/

**실행**

`index.html`을 브라우저로 연다. 빌드·설치·키 없음.

**시험** (Node만 있으면 됨)

```sh
node test/test.js       # 게임 규칙
node test/smoke.js      # 화면 동작
node test/sim.js 200    # 200판 시뮬레이션: 피할 수 없는 위협이 나오는지
```

2026-10-21 컨테이너에서 돌린 결과: `test.js` 90개 통과 · `smoke.js` 16개 통과 · `sim.js 200` 피할 수 없는 위협 0건(0.00%).

**구조**

```
index.html      배포용 단일 파일(GitHub Pages)
src/core.js     게임 규칙. 브라우저와 Node 테스트가 같이 쓴다
src/ui.js       화면·입력
test/           규칙·화면·공정성 시험 (core.js · ui.js는 src로 가는 링크)
portfolio.html  작품 페이지
```

**누가 무엇을**

- 내가 정한 것: 기획·설계·판정 (이주형)
- AI가 짠 것: 코드 작성, AI 코딩 도구와 함께
- 내가 확인한 것: 검증 (이주형)

---

Playable demo: https://ljhljh0703-cmd.github.io/jelly-panic/

`Jelly Panic` is a zero-dependency, single-file browser demo for a telegraphed placement puzzle defense game. Every threat is previewed before it fires, so the core challenge is reading the board rather than reacting quickly.

## What It Shows

- Pure vanilla JavaScript, no external runtime dependencies.
- Deterministic game logic shared by browser and Node tests.
- A release `index.html` for GitHub Pages.
- A public verification suite that checks logic, UI smoke behavior, and fairness simulation.

## Verification

Run from the repository root:

```sh
node test/test.js
node test/smoke.js
node test/sim.js 200
```

Current local gate before publish:

- `node test/test.js`: 90 passed, 0 failed.
- `node test/smoke.js`: 16 passed, 0 failed.
- `node test/sim.js 200`: unavoidable unfair spawns 0.00%.
- Counterfactual legacy pool risk: 19.1% of candidate cells would have been uncoverable without the coverability rule.

## Structure

```text
.
├── index.html
├── src/
│   ├── core.js
│   └── ui.js
└── test/
    ├── test.js
    ├── smoke.js
    └── sim.js
```

The test directory also contains symlinks to `src/core.js` and `src/ui.js` so the original test files can run unchanged.
