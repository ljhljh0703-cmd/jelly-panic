import { defineConfig } from '@apps-in-toss/web-framework/config';

// appName 은 앱인토스 콘솔에 등록한 앱 이름과 같아야 한다(콘솔에서 정한 뒤 바꿀 것).
export default defineConfig({
  appName: 'jelly-panic',
  brand: {
    primaryColor: '#FF9EB5',
  },
  permissions: [],
  // 게임: 내비게이션 바는 '더보기'와 '닫기(X)'만, 배경 투명 (앱인토스 내비게이션 바 문서)
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
    theme: 'light',
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsBackForwardNavigationGestures: false,
    mediaPlaybackRequiresUserAction: false,
    allowsInlineMediaPlayback: true,
  },
  webBundleDir: 'dist',
});
