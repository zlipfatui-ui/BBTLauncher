const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const qaRoot = path.resolve(process.env.BBT_QA_ROOT || path.join(__dirname, '../../release/qa/update-e2e'));
if (path.basename(qaRoot) !== 'update-e2e') throw new Error('BBT_QA_ROOT must name a dedicated update-e2e directory.');
const server = http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1); } catch { res.writeHead(400); res.end(); return; }
  if (!['GET', 'HEAD'].includes(req.method) || !/^(latest\.yml|Update-QA-038-0\.3\.[78]\.exe(?:\.blockmap)?)$/.test(name)) { res.writeHead(404); res.end(); return; }
  const version = name.includes('0.3.7') ? '0.3.7' : '0.3.8';
  const file = path.join(qaRoot, 'build', version, name);
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) { res.writeHead(404); res.end(); return; }
    const size = stat.size;
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (req.headers.range && !range) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    res.writeHead(range ? 206 : 200, { 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Content-Type': name.endsWith('.yml') ? 'application/x-yaml' : 'application/octet-stream', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(19838, '127.0.0.1', () => console.log(`QA update feed: http://127.0.0.1:19838 (${qaRoot})`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
