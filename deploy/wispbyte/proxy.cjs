const http = require('node:http');
const net = require('node:net');

function routeRequest(rawPath, referer, webPort = 3100, vttPort = 4200) {
  const path = rawPath || '/';
  if (path === '/vtt' || path.startsWith('/vtt/')) {
    return { port: vttPort, path: path === '/vtt' ? '/' : path.slice(4) };
  }
  if (/^\/(socket\.io|assets|campaign-assets|audio-assets|music-assets)(\/|\?|$)/.test(path) || path === '/favicon.svg') {
    return { port: vttPort, path };
  }
  if (path === '/api/xp/heartbeat') return { port: webPort, path };
  let gameReferer = false;
  try { gameReferer = /^\/vtt(?:\/|$)/.test(new URL(referer).pathname); } catch {}
  if (path.startsWith('/api/') && gameReferer) return { port: vttPort, path };
  return { port: webPort, path };
}

function headersFor(req) {
  return {
    ...req.headers,
    host: req.headers.host,
    'x-forwarded-host': req.headers['x-forwarded-host'] || req.headers.host || '',
    'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http',
    'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
  };
}

function startProxy(port, webPort = 3100, vttPort = 4200) {
  const server = http.createServer((req, res) => {
    const target = routeRequest(req.url, req.headers.referer, webPort, vttPort);
    const upstream = http.request({ hostname: '127.0.0.1', port: target.port, path: target.path, method: req.method, headers: headersFor(req) }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Upstream unavailable'); });
    req.pipe(upstream);
  });

  server.on('upgrade', (req, socket, head) => {
    const target = routeRequest(req.url, req.headers.referer, webPort, vttPort);
    const remote = net.connect(target.port, '127.0.0.1');
    remote.on('connect', () => {
      const headers = headersFor(req);
      remote.write(`${req.method} ${target.path} HTTP/${req.httpVersion}\r\n`);
      for (const [name, value] of Object.entries(headers)) {
        if (value !== undefined) remote.write(`${name}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`);
      }
      remote.write('\r\n');
      if (head.length) remote.write(head);
      socket.pipe(remote).pipe(socket);
    });
    remote.on('error', () => socket.destroy());
    socket.on('error', () => remote.destroy());
  });

  server.listen(port, '0.0.0.0', () => console.log(`Public proxy ready on ${port}`));
  return server;
}

module.exports = { routeRequest, startProxy };
