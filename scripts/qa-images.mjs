
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'src', 'content');
const PUBLIC_ROOT = path.join(ROOT, 'public');

const errors = [];
const warnings = [];
const primaryImages = new Map();

function getMarkdownFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return getMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  });
}

function readFrontmatter(content, file) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    errors.push(`Missing frontmatter: ${path.relative(ROOT, file)}`);
    return null;
  }

  try {
    return parseYaml(match[1]) ?? {};
  } catch (error) {
    errors.push(
      `Invalid frontmatter in ${path.relative(ROOT, file)}: ${error.message}`,
    );
    return null;
  }
}

function resolveLocalImage(image, file) {
  if (typeof image !== 'string' || !image.trim()) return null;

  const value = image.trim();

  // External URLs, data URLs and remote image sources are not local files.
  if (/^(https?:)?\/\//i.test(value) || /^(data|blob):/i.test(value)) {
    return null;
  }

  const cleanValue = value.split(/[?#]/, 1)[0];
  let absolutePath;

  if (cleanValue.startsWith('/')) {
    absolutePath = path.resolve(PUBLIC_ROOT, `.${cleanValue}`);
  } else {
    absolutePath = path.resolve(path.dirname(file), cleanValue);
  }

  const allowedRoots = [PUBLIC_ROOT, CONTENT_ROOT];
  const isAllowed = allowedRoots.some((root) => {
    const relativePath = path.relative(root, absolutePath);
    return relativePath === '' ||
      (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
  });

  if (!isAllowed) {
    errors.push(
      `Image path escapes allowed directories: ${path.relative(ROOT, file)} -> ${image}`,
    );
    return null;
  }

  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    errors.push(
      `Missing image: ${path.relative(ROOT, file)} -> ${image}`,
    );
    return null;
  }

  return absolutePath;
}

const markdownFiles = getMarkdownFiles(CONTENT_ROOT);

for (const file of markdownFiles) {
  const content = readFileSync(file, 'utf8');
  const frontmatter = readFrontmatter(content, file);

  if (!frontmatter) continue;

  const primaryImage = frontmatter.image;

  if (primaryImage) {
    const resolved = resolveLocalImage(primaryImage, file);

    if (resolved) {
      const previous = primaryImages.get(resolved) ?? [];
      previous.push(path.relative(ROOT, file));
      primaryImages.set(resolved, previous);
    }
  }

  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');

  // Markdown image syntax: ![alt](/images/example.jpg)
  const markdownImages = [...body.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g)];

  // HTML image sources: <img src="/images/example.jpg">
  const htmlImages = [...body.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)];

  for (const match of [...markdownImages, ...htmlImages]) {
    resolveLocalImage(match[1], file);
  }
}

for (const [image, articles] of primaryImages) {
  if (articles.length > 1) {
    warnings.push(
      `Duplicate primary image: ${path.relative(ROOT, image)}\n  ${articles.join('\n  ')}`,
    );
  }
}

console.log('\nHAD IT GONE — Image QA');
console.log('──────────────────────');
console.log(`Markdown files: ${markdownFiles.length}`);
console.log(`Primary images: ${primaryImages.size}`);
console.log(`Errors:         ${errors.length}`);
console.log(`Warnings:       ${warnings.length}`);

if (errors.length) {
  console.error('\nERRORS');
  for (const error of errors) console.error(`  ✗ ${error}`);
}

if (warnings.length) {
  console.warn('\nWARNINGS');
  for (const warning of warnings) console.warn(`  ! ${warning}`);
}

if (errors.length) process.exitCode = 1;