# Jelly Panic / 지켜줘! 젤리 패닉

> 「위협은 덮을 칸이 있을 때만 생긴다」는 재미 규칙을 먼저 정하고, 무작위 500판에서 막을 수 없는 위협 0건으로 증명한 수읽기 퍼즐 디펜스. 설치할 것 없는 브라우저 데모.
> A placement puzzle defense game built rule-first: every threat is shown before it fires and always has a cell that can cover it, verified over 500 random games; zero-dependency browser demo.
>
> 작품 페이지: https://ljhljh0703-cmd.github.io/jelly-panic/portfolio.html · 플레이: https://ljhljh0703-cmd.github.io/jelly-panic/

**실행**

`index.html`을 브라우저로 연다. 설치·키 없음.

**고친 뒤 공개 파일 만들기**

규칙은 `src/core.js`, 화면은 `src/ui.js`에서 고친다. `index.html`은 두 파일을 넣어 만든 결과물이다.

```sh
node tools/build.js           # index.html 다시 만들기(개발용 구간은 뺌)
node tools/build.js --check   # 지금 index.html 이 src 와 같은지만 확인
```

**시험** (Node만 있으면 됨)

```sh
node test/test.js           # 게임 규칙
node test/smoke.js          # 화면 동작
node test/analyze.test.js   # 기록 분석 도구(답을 아는 가짜 기록으로)
node test/sim.js 500        # 500판 시뮬레이션: 피할 수 없는 위협이 나오는지
cd toss && npm install && npm test   # 토스 미니앱 연결(가짜 토스 SDK, playwright 필요)
```

2026-10-24 컨테이너에서 돌린 결과: `test.js` 105개 · `smoke.js` 16개 · `analyze.test.js` 14개 · 토스 연결 13개 통과, `sim.js 500` 피할 수 없는 위협 0건.

**플레이 기록 보기**

게임은 익명 기록(무작위 번호, 판 시작·첫 수·판 끝·도중 나감·공유)을 수집 서버로 보낸다. 무엇을 보내고 무엇을 보내지 않는지는 `src/ui.js` 맨 위 주석에 적어 두었다.

```sh
EXPORT_KEY=... node tools/fetch-export.js 2026-10-24 2026-10-25   # 하루치 받기 → data/
node tools/analyze.js data/*.ndjson --md report.md                # 흐름·스테이지·오늘의 임무·다음 날 재방문·유입·공유·A/B
```

**반반 비교(A/B)**

`src/ui.js`의 `EXPERIMENT.id`를 채우면 B 그룹 기기(기기마다 고정)만 바뀐 판을 본다. 비어 있으면 모두 같다.

- 규칙 후보: `id`와 함께 `B`에 규칙 묶음(`quietStart`, `fitTray`, `countdownEarly`)을 넣는다
- 화면 안내 후보: `id`만 넣는다. `crowline`(까마귀에서 소중한 것까지 선), `firsthint`(처음 뜬 위협 칸 가리키기), `dailyfirst`(다시 온 날 오늘의 임무로 시작)
- 눈으로 보기: 주소 끝에 `?abforce=crowline`. 그 탭은 기록을 보내지 않는다

**토스 미니앱**

`toss/`에서 `npm run build` 하면 같은 `index.html`을 앱인토스 웹 SDK로 묶은 `.ait`가 나온다. 토스 안에서는 토스 저장소·뒤로가기·닫기·햅틱·게임센터 순위·공유 시트를 쓰고, 토스 밖에서는 지금과 똑같이 돈다. 자세한 내용은 `toss/README.md`.

**구조**

```
index.html        배포용 단일 파일(GitHub Pages). tools/build.js 가 만든다
src/core.js       게임 규칙. 브라우저와 Node 시험이 같이 쓴다
src/ui.js         화면·입력·익명 기록
tools/            공개 파일 만들기, 기록 받기·분석
test/             규칙·화면·공정성·분석 시험 (core.js · ui.js는 src로 가는 링크)
toss/             토스 미니앱 묶기(bridge.js = 토스 기능 연결)
portfolio.html    작품 페이지
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
node tools/build.js --check
node test/test.js
node test/smoke.js
node test/analyze.test.js
node test/sim.js 500
```

Current local gate before publish (2026-10-24):

- `node test/test.js`: 105 passed, 0 failed.
- `node test/smoke.js`: 16 passed, 0 failed.
- `node test/analyze.test.js`: 14 passed, 0 failed.
- `cd toss && npm test`: 13 passed, 0 failed.
- `node test/sim.js 500`: unavoidable unfair spawns 0.
- Counterfactual legacy pool risk: 19.1% of candidate cells would have been uncoverable without the coverability rule.

## Structure

```text
.
├── index.html
├── src/
│   ├── core.js
│   └── ui.js
├── tools/        (build, fetch-export, analyze)
├── toss/         (Apps in Toss mini-app wrapper)
└── test/
    ├── test.js
    ├── smoke.js
    ├── analyze.test.js
    └── sim.js
```

The test directory also contains symlinks to `src/core.js` and `src/ui.js` so the original test files can run unchanged.
