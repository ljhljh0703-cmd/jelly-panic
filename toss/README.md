# 토스 미니앱(앱인토스) 출시용 묶음

게임 본체는 저장소 맨 위 `index.html` 그대로다. 여기서는 그 파일을 토스 웹 SDK로 묶어 앱인토스에 올릴 `.ait` 파일을 만든다.

```sh
cd toss
npm install
npm run build        # dist/ 만들고 ait build → .ait 파일
npx ait deploy       # 콘솔 API 키가 있어야 함 (ait token add)
```

토스 안에서 달라지는 것 (`bridge.js`)
- 저장 값(최고 점수·스테이지·오늘의 임무 기록·소리 설정 등)을 토스 네이티브 저장소에 둔다. 처음 열 때 같은 기기 브라우저 기록이 있으면 가져온다.
- 사용자 식별키(`User.getAnonymousKey`)를 받아 기기 안에 저장한다. 수집 서버로는 보내지 않는다.
- 안드로이드 뒤로가기: 열린 창(도감·모드)을 먼저 닫고, 없으면 미니앱을 닫는다. 「종료하기」 버튼도 미니앱 닫기.
- 상단 닫기 버튼과 겹치지 않게 토스가 알려 주는 안전 영역만큼 위를 띄운다.
- 진동은 토스 햅틱으로.

올리기 전에 할 일
- [ ] 콘솔에서 앱 이름을 정하고 `apps-in-toss.config.ts` 의 `appName` 을 같게
- [ ] 게임 등급 증빙 (구글 플레이 자체등급 또는 게임물관리위원회 등급분류증명서)
- [ ] 수집 서버 접속 허용 목록에 `https://<appName>.apps.tossmini.com`, `https://<appName>.private-apps.tossmini.com` 추가
- [ ] 콘솔 「토스앱 테스트」 QR로 실제 토스 앱에서 1번 이상 실행 (검토 요청 조건)
