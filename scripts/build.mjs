import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

// Version the entrypoint and every local module together so a new page never
// executes an older cached evaluator or training flow on GitHub Pages.
const scriptFiles = (await readdir(path.join(output, 'src'), { recursive: true }))
  .filter(name => name.endsWith('.js'))
  .map(name => path.join(output, 'src', name))
  .sort();
const versionHash = createHash('sha256');
for (const filename of [path.join(output, 'styles.css'), ...scriptFiles]) {
  versionHash.update(path.relative(output, filename).replaceAll('\\', '/'));
  versionHash.update(await readFile(filename));
}
const version = versionHash.digest('hex').slice(0, 12);
for (const filename of scriptFiles) {
  const source = await readFile(filename, 'utf8');
  const versioned = source.replace(/((?:from\s*|import\s*)['"])(\.{1,2}\/[^'"\r\n]+\.js)(['"])/g,
    (_match, prefix, modulePath, quote) => `${prefix}${modulePath}?v=${version}${quote}`);
  await writeFile(filename, versioned);
}
const entrypoint = path.join(output, 'index.html');
const html = await readFile(entrypoint, 'utf8');
await writeFile(entrypoint, html
  .replace('./styles.css', `./styles.css?v=${version}`)
  .replace('./src/app.js', `./src/app.js?v=${version}`));
try {
  await stat(path.join(root, 'public'));
  await cp(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('빌드 완료: dist/ (의존성 없는 정적 웹앱)');
