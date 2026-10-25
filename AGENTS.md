# 젤리 패닉 작업 규칙 (Codex용)

이 저장소는 브라우저 퍼즐 게임 「지켜줘! 젤리 패닉」이다. 8×8 판에 젤리 조각을 놓아 줄을 지우고, 미리 예고된 위협(균열·시럽·설탕·초코 슬라임·도둑 까마귀)을 덮어 막으며 「소중한 것」을 지킨다.

지금 하는 일은 `docs/codex/ROADMAP.md` 에 있다. 맡은 단계의 지시 파일(`docs/codex/M*.md`)을 먼저 끝까지 읽고 시작한다. 지시와 이 파일이 부딪히면 이 파일이 이긴다. 판단이 갈리면 멈추고 변경 요청(PR) 댓글로 묻는다.

## 구조

- `src/core.js` 규칙. 결정론(같은 seed·같은 수 → 같은 판). `Math.random`·시각 금지, 무작위는 `rand(state)` 만. 화면 코드 없음. 브라우저(`window.CORE`)와 Node(`module.exports`)가 같이 쓴다.
- `src/ui.js` 화면·입력·소리·진동·익명 기록. 규칙 계산을 여기서 하지 않는다(규칙은 core 에서 이벤트로 받는다).
- `index.html` 공개 파일. 두 `<script>` 칸은 `node tools/build.js` 가 `src` 를 넣어 만든다. **스크립트 칸을 손으로 고치지 않는다.** HTML 뼈대와 CSS 는 `index.html` 을 직접 고친다.
- `toss/` 토스 미니앱 묶음(`bridge.js` 가 `window.PLATFORM` 을 심는다). `PLATFORM` 이 없을 때(브라우저)도 그대로 돌아야 한다.
- `tools/` 공개 파일 만들기(`build.js`), 밸런스 측정(`balance.js`), 기록 분석(`analyze.js`).
- `test/` `test.js`(규칙), `smoke.js`(화면, DOM 흉내), `sim.js`(공정성), `analyze.test.js`.

## 꼭 지킬 것

1. **공정성 규칙**: 빈 칸을 노리는 위협은 그 칸을 덮을 수 있는 조각이 있을 때만 예고한다(`canCoverCell`). 새 위협·장애물·보스 공격도 이 규칙을 따른다. `node test/sim.js 500` 에서 「회피 불가능한 스폰 0건」이 유지돼야 한다.
2. **결정론**: 새 규칙의 무작위도 `rand(state)` 로. `previewPlace` 는 실제 판을 바꾸지 않는다(새 규칙도 미리보기에 반영).
3. **외부 라이브러리 0**, HTML 한 장. 그림은 캔버스로 그리거나 이모지. 이미지 파일을 새로 넣지 않는다(그림이 필요하면 PR 에 「그림 필요」로 적고 자리만 만든다).
4. `eval`·`new Function` 금지(토스 검수).
5. 공개 API 유지: `window.CORE` 의 `newGame/place/discard/canPlace/previewPlace/SHAPES/N/STAGES/daily/ringBell` 는 이름·인자를 바꾸지 않는다(광고 녹화 도구가 쓴다). 늘리는 건 괜찮다.
6. 익명 기록(`track`)이 보내는 항목을 늘리거나 바꾸지 않는다. 필요하면 PR 에 적고 멈춘다(수집 서버와 같이 바꿔야 함).
7. 저장 키(`cp-*`)의 뜻을 바꾸지 않는다. 새 키는 `cp-` 로 시작.
8. 오늘의 임무는 모두 같은 판: 오늘의 임무 판에 기기마다 다른 것(보상 아이템, 반반 비교 규칙)을 넣지 않는다.
9. 흔들림 줄이기: 화면 흔들림·번쩍임·멈칫(히트스톱)은 「흔들림 줄이기」 설정과 `prefers-reduced-motion` 을 따른다.
10. 성능: 폰에서 60fps 목표. 파티클 개수 상한을 둔다. 한 프레임에 할당을 늘리지 않는다(배열 재사용).

## 끝내기 전에 (PR 마다)

```sh
node tools/build.js && node tools/build.js --check
node test/test.js && node test/smoke.js && node test/analyze.test.js
node test/sim.js 500        # 회피 불가능한 스폰 0건
node tools/balance.js --quick --compare docs/codex/baseline-quick.json   # 규칙을 건드렸으면: node tools/balance.js --compare docs/codex/baseline.json
```

- 규칙을 바꾸면 `test/test.js` 에 시험을 추가한다(바뀐 규칙 하나당 최소 1개, 이름은 `T41`… 이어서).
- PR 본문: 무엇을 바꿨는지, 지시 파일의 「다 됐다고 보는 기준」 항목별 결과, 시험 숫자, 밸런스 비교 출력 그대로, 눈으로 확인할 주소(`index.html?seed=7` 등)와 재현 순서.
- 화면 글자는 한국어 반말 없이 「~해요」체. 기존 게임 말투(짧고 귀엽게)를 따른다.

## Code Review Rules

- 공정성·결정론·공개 API·익명 기록 항목·저장 키 뜻이 바뀌었으면 막는다.
- `index.html` 스크립트 칸이 `src` 와 다르면(`node tools/build.js --check` 가 「다름」) 막는다.
- 새 규칙에 시험이 없으면 막는다.
- 흔들림 줄이기 설정을 따르지 않는 새 연출이 있으면 막는다.
