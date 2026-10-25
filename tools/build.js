// 공개 파일 만들기: index.html의 두 <script> 자리에 src/core.js와 src/ui.js를 넣는다.
// ui.js의 [RELEASE-STRIP-START]~[RELEASE-STRIP-END] 구간(디버그 훅·자동 플레이)은 뺀다.
// 쓰는 법: node tools/build.js            → index.html 덮어쓰기
//          node tools/build.js --check    → 덮어쓰지 않고 지금 index.html과 같은지만 확인(다르면 종료 코드 1)
//          node tools/build.js --dev dev.html → 개발용 구간(디버그 훅 window.__CP, ?demo=1, ?fxdemo=1 등)을 남긴 확인용 사본(공개 안 함, .gitignore)
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var argv = process.argv.slice(2);
var coreFile = argv.indexOf('--core') >= 0 ? argv[argv.indexOf('--core') + 1] : path.join(root, 'src/core.js');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var core = fs.readFileSync(coreFile, 'utf8');
var ui = fs.readFileSync(path.join(root, 'src/ui.js'), 'utf8');
var devOut = argv.indexOf('--dev') >= 0 ? argv[argv.indexOf('--dev') + 1] : null;
if (!devOut) {
  ui = ui.replace(/  \/\/ \[RELEASE-STRIP-START\][\s\S]*?\/\/ \[RELEASE-STRIP-END\]\n/, '');
  if (/RELEASE-STRIP|__CP/.test(ui)) { console.error('디버그 구간 제거 실패'); process.exit(1); }
} else ui = ui.replace('window.__CP = { state:', 'window.__CP = { C: C, state:');
var parts = html.split(/(<script>\n|\n<\/script>)/);
// parts: [앞, '<script>\n', core, '\n</script>', 사이, '<script>\n', ui, '\n</script>', 뒤]
if (parts.length !== 9) { console.error('index.html의 <script> 구조가 예상과 다름: ' + parts.length); process.exit(1); }
parts[2] = core.replace(/\n$/, '');
parts[6] = ui.replace(/\n$/, '');
var out = parts.join('');
if (devOut) { fs.writeFileSync(path.resolve(devOut), out); console.log(devOut + ' 만듦 (개발용, 공개 금지)'); process.exit(0); }
if (argv.indexOf('--check') >= 0) { var same = out === html; console.log(same ? '같음' : '다름'); process.exit(same ? 0 : 1); }
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('index.html 만듦 (' + out.length + '자)');
