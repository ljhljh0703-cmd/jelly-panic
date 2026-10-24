// 토스 미니앱 묶음 만들기: ../index.html 을 dist/index.html 로 복사하면서
// 게임 스크립트를 bridge(저장소 불러오기·식별키) 다음에 실행되도록 바꾸고, bridge.js 를 묶어 넣는다.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
// 공개 파일(index.html)이 src 와 같은지 먼저 확인 — 다르면 node tools/build.js 를 먼저 돌릴 것
execFileSync(process.execPath, [path.join(here, '..', 'tools', 'build.js'), '--check'], { stdio: 'inherit' });
const dist = path.join(here, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

await build({ entryPoints: [path.join(here, 'bridge.js')], bundle: true, format: 'iife', target: 'es2018', minify: true, outfile: path.join(dist, 'bridge.js') });

let html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const scripts = html.match(/<script>/g) || [];
if (scripts.length !== 2) throw new Error('index.html <script> 개수가 2가 아님: ' + scripts.length);
if (/\beval\(|new Function\(/.test(html)) throw new Error('eval·new Function 금지(검수표)');
html = html.replace(/<script>/g, '<script type="text/x-game">');
html = html.replace('</head>', '<script src="bridge.js"></script>\n</head>');
fs.writeFileSync(path.join(dist, 'index.html'), html);

// 그림 파일 복사 (게임이 assets/ 를 쓰면)
const assets = path.join(here, '..', 'assets');
if (fs.existsSync(assets) && /assets\//.test(html)) fs.cpSync(assets, path.join(dist, 'assets'), { recursive: true });
const size = fs.readdirSync(dist, { recursive: true }).reduce((a, f) => { const p = path.join(dist, f); return a + (fs.statSync(p).isFile() ? fs.statSync(p).size : 0); }, 0);
console.log('dist 만듦: ' + Math.round(size / 1024) + 'KB (한도 100MB)');
