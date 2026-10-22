
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';

import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.error('ERROR: dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

function walk(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }

  return files;
}

const files = walk(DIST);
const htmlFiles = files.filter(file => extname(file).toLowerCase() === '.html');

const knownPages = new Set();

for (const file of htmlFiles) {
  const rel = relative(DIST, file).replaceAll('\\', '/');

  knownPages.add('/' + rel);

  if (rel.endsWith('/index.html')) {
    knownPages.add('/' + rel.slice(0, -'index.html'.length));
  } else if (rel === 'index.html') {
    knownPages.add('/');
  }
}

const errors = [];
let checkedLinks = 0;

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const relFile = relative(DIST, file).replaceAll('\\', '/');

  const hrefPattern = /\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let match;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1].trim();

// Skip JavaScript template expressions that cannot be
// resolved by scanning static HTML alone.
if (
  !href ||
  href.includes('${') ||
  href.startsWith('//') ||
  /^[a-z][a-z\d+.-]*:/i.test(href)
) {
  continue;
}
    const pathname = decodePath(href.split(/[?#]/)[0]);
    if (!pathname) continue;

    checkedLinks++;

    let target;

    if (pathname.startsWith('/')) {
      target = pathname;
    } else {
      const currentDir = '/' + relFile.split('/').slice(0, -1).join('/');
      const segments = (currentDir + '/' + pathname).split('/');
      const normalized = [];

      for (const segment of segments) {
        if (!segment || segment === '.') continue;
        if (segment === '..') normalized.pop();
        else normalized.push(segment);
      }

      target = '/' + normalized.join('/');
    }

    const candidates = new Set([target]);

    if (target.endsWith('/')) {
      candidates.add(target + 'index.html');
    } else {
      candidates.add(target + '/');
      candidates.add(target + '/index.html');
    }

    const exists = [...candidates].some(candidate => knownPages.has(candidate));

    if (!exists) {
      const assetPath = join(DIST, target.replace(/^\/+/, ''));

      if (existsSync(assetPath)) continue;

      errors.push(
        `${relFile}: broken internal link "${href}" -> "${target}"`
      );
    }
  }
}

console.log('');
console.log('HAD IT GONE — Internal Link Check');
console.log('────────────────────────────────');
console.log(`HTML pages scanned: ${htmlFiles.length}`);
console.log(`Internal links checked: ${checkedLinks}`);
console.log(`Errors: ${errors.length}`);
console.log('');

if (errors.length) {
  for (const error of errors) console.log(`✗ ${error}`);
  process.exit(1);
}

console.log('✓ No broken internal links found.');