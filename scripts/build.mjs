import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, 'dist');
// The only recursively replaced directory is this project's own dist folder.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error('안전하지 않은 빌드 출력 경로입니다.');
}
for (const name of ['index.html', 'styles.css', 'src']) {
  await stat(path.join(root, name));
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'src']) {
  await cp(path.join(root, name), path.join(output, name), {
    recursive: true,
    filter: (source) => !path.basename(source).startsWith('.') && !source.endsWith('.test.js'),
  });
}
try {
  await stat(path.join(root, 'public'));
  await cp(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('빌드 완료: dist/ (의존성 없는 정적 웹앱)');
