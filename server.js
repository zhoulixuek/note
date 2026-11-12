const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8765;
const ROOT = path.join(__dirname, 'src');

// 在这里改响应头。值为 null 的不发送。
const headers = {
  // 'Cache-Control': 'no-store',
};

// 按文件修改时间带上 Last-Modified。没有 Cache-Control 时，浏览器会用它估算新鲜期。
const sendLastModified = true;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function filePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const full = path.normalize(path.join(ROOT, rel));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const full = filePath(req.url);
  if (!full) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const out = {
      'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream',
      'Content-Length': stat.size,
    };
    if (sendLastModified) out['Last-Modified'] = stat.mtime.toUTCString();
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) out[key] = value;
    }

    res.writeHead(200, out);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(full).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}/`);
});
