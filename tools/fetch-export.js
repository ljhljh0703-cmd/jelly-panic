// 수집 서버에서 하루치 기록을 받아 data/<날짜>.ndjson 으로 저장한다.
// 쓰는 법: EXPORT_KEY=<수집 서버 설정의 열쇠> node tools/fetch-export.js 2026-10-24 [2026-10-25 ...]
// 날짜는 수집 서버 기준(UTC) 날짜. 한국 시간 하루를 다 보려면 그 날과 다음 날을 같이 받는다.
'use strict';
var fs = require('fs'), path = require('path'), https = require('https');
var KEY = process.env.EXPORT_KEY;
var URL = process.env.EXPORT_URL || 'https://jelly-panic-collector.vercel.app/api/export';
if (!KEY) { console.error('EXPORT_KEY 가 비어 있음'); process.exit(2); }
var days = process.argv.slice(2);
if (!days.length || !days.every(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })) { console.error('쓰는 법: EXPORT_KEY=... node tools/fetch-export.js YYYY-MM-DD ...'); process.exit(2); }
var outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });
(function next(i) {
  if (i >= days.length) return;
  https.get(URL + '?day=' + days[i], { headers: { 'x-export-key': KEY } }, function (res) {
    var body = '';
    res.setEncoding('utf8');
    res.on('data', function (c) { body += c; });
    res.on('end', function () {
      if (res.statusCode !== 200) { console.error(days[i] + ': ' + res.statusCode); process.exit(1); }
      var f = path.join(outDir, days[i] + '.ndjson');
      fs.writeFileSync(f, body);
      console.log(days[i] + ': ' + body.split('\n').filter(Boolean).length + '줄 → ' + f);
      next(i + 1);
    });
  }).on('error', function (e) { console.error(e.message); process.exit(1); });
})(0);
