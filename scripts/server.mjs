import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const position = args.indexOf(flag);
  return position === -1 ? undefined : args[position + 1];
};
const port = Number(valueAfter('--port') ?? process.env.PORT ?? 4173);
const host = valueAfter('--host') ?? '127.0.0.1';
const root = args.includes('--dist') ? path.join(projectRoot, 'dist') : projectRoot;

if (!Number.isInteger(port) || port < 1 || port > 65535 || !host || host.startsWith('--')) {
  console.error('유효한 --host와 --port(1–65535)를 지정해 주세요.');
  process.exit(1);
}

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const server = createServer(async (request, response) => {
  const finish = (status, body) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : body);
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return finish(405, 'Method not allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    return finish(400, '잘못된 경로입니다.');
  }
  const segments = pathname.replaceAll('\\', '/').split('/');
  if (segments.some((part) => part.startsWith('.') || part.includes('\0'))) {
    return finish(403, '이 경로에는 접근할 수 없습니다.');
  }
  if (pathname === '/') pathname = '/index.html';
  const filename = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !types.has(path.extname(filename))) {
    return finish(403, '이 경로에는 접근할 수 없습니다.');
  }
  // Serve browser assets only; development scripts are never exposed over HTTP.
  if (relative.startsWith(`scripts${path.sep}`) || relative.startsWith(`tests${path.sep}`)) {
    return finish(403, '이 경로에는 접근할 수 없습니다.');
  }

  try {
    const information = await stat(filename);
    if (!information.isFile()) return finish(404, '파일을 찾을 수 없습니다.');
    const bytes = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': types.get(path.extname(filename)),
      'Content-Length': bytes.byteLength,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return finish(404, '파일을 찾을 수 없습니다.');
    console.error('정적 파일 처리 실패:', error.message);
    finish(500, '파일을 불러오지 못했습니다.');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `포트 ${port}가 사용 중입니다. npm start -- --port 4174 로 다른 포트를 사용해 주세요.`
    : `서버를 시작하지 못했습니다: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
  console.log(`\n3장 홀덤 딜러 트레이너${args.includes('--dist') ? ' · 빌드 미리보기' : ''}`);
  console.log(`Local: http://${displayHost}:${port}`);
  console.log('종료: Ctrl+C\n');
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
