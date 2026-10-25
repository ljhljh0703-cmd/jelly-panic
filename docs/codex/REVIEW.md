# 검수 절차 (Claude)

Codex 가 PR 을 올리면 아래 순서로 본다. 결과는 PR 댓글로 남기고, 고칠 것은 `@codex` 에게 다시 맡긴다.

1. 지시 파일의 「다 됐다고 보는 기준」을 한 줄씩 대조한다.
2. 다시 돌린다: `node tools/build.js --check`, `node test/test.js`, `node test/smoke.js`, `node test/analyze.test.js`, `node test/sim.js 500`, `node tools/balance.js --compare docs/codex/baseline.json`.
3. 화면: `node tools/build.js --dev dev.html` 사본으로 폰 크기(390×844, 360×640)에서 캡처·녹화. 연출 단계는 `?fxdemo=1`, 흔들림 줄이기는 `&calm=1`.
4. 성능: 브라우저 CPU 4배 느리게 해서 3분 자동 플레이, 프레임 시간 95번째 값이 33ms 이하인지.
5. 토스 묶음: `cd toss && npm test`.
6. 「AGENTS.md」의 Code Review Rules 위반이 없는지.
7. 통과하면 작가에게 「합쳐도 됨」으로 올리고, 다음 단계 지시 파일을 넣는다.
