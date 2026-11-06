#!/usr/bin/env node
// lint.mjs — 零依赖的记忆库自检器。
//
// 用法：
//   node tools/lint.mjs                 # 检查脚本所在库（tools/ 的上一级）
//   node tools/lint.mjs --root <目录>   # 检查指定库
//   node tools/lint.mjs --json          # 机器可读输出
//
// 查什么：
//   1. 每个页面都有 frontmatter，且 title / date / type / salience 四件齐
//   2. salience 只能是 1 | 2 | 3
//   3. trust 写了就必须是 fact | infer | revision | unknown（不写＝unknown，合法）
//   4. summary 不超过 48 字（它要进 index，一行放得下）
//   5. 每个页面都在 index.md 里有一行；index 里的链接都指向存在的文件
//   6. 换行/BOM 提醒（这两样会让别的解析器静默出错，这里只警告不算错）
//
// 退出码：0 干净 · 1 有问题 · 2 用法错。
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rootArg = args.indexOf('--root');
const SELF = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = rootArg >= 0 ? path.resolve(args[rootArg + 1] || '') : path.dirname(SELF);

const META = new Set(['SOUL.md', 'MEMORY.md', 'BOOTSTRAP.md', 'index.md', 'log.md']);
const REQUIRED = ['title', 'date', 'type', 'salience'];
const TRUST = new Set(['fact', 'infer', 'revision', 'unknown']);
const SUMMARY_MAX = 48;

const errors = [];
const warnings = [];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function frontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = {};
  for (const line of text.slice(3, end).split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

if (!fs.existsSync(path.join(ROOT, 'MEMORY.md'))) {
  console.error(`不是记忆库（没有 MEMORY.md）：${ROOT}`);
  process.exit(2);
}

const index = fs.readFileSync(path.join(ROOT, 'index.md'), 'utf8');
// 注释掉的示例行不算链接，否则模板会被自己的示例绊倒
const indexLive = index.replace(/<!--[\s\S]*?-->/g, '');
const linked = new Set([...indexLive.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1].replace(/^\.\//, '')));

const files = walk(ROOT).filter((f) => !META.has(path.basename(f)));
const seen = new Set();

for (const f of files) {
  const r = rel(f);
  seen.add(r);
  const raw = fs.readFileSync(f, 'utf8');

  if (raw.charCodeAt(0) === 0xfeff) warnings.push(`${r}: 文件带 BOM（建议 UTF-8 无 BOM）`);
  if (raw.includes('\r\n')) warnings.push(`${r}: 有 CRLF 换行（建议统一 LF）`);

  const fm = frontmatter(raw);
  if (!fm) { errors.push(`${r}: 缺少 frontmatter`); continue; }

  for (const k of REQUIRED) if (!fm[k]) errors.push(`${r}: 缺少 frontmatter 字段 "${k}"`);
  if (fm.salience && !['1', '2', '3'].includes(fm.salience)) {
    errors.push(`${r}: salience 只能是 1|2|3，现在是 "${fm.salience}"`);
  }
  if (fm.trust && !TRUST.has(fm.trust)) {
    errors.push(`${r}: trust 只能是 fact|infer|revision|unknown，现在是 "${fm.trust}"`);
  }
  if (fm.summary && [...fm.summary].length > SUMMARY_MAX) {
    errors.push(`${r}: summary 声明 ${[...fm.summary].length} 字（上限 ${SUMMARY_MAX}）`);
  }
  if (!linked.has(r)) errors.push(`orphan page not in index.md: ${r}`);
}

for (const l of linked) {
  if (!fs.existsSync(path.join(ROOT, l))) errors.push(`index.md 指向不存在的页：${l}`);
}

const result = { root: ROOT, pages: files.length, errors, warnings };

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const e of errors) console.log(`error ${e}`);
  if (!errors.length) console.log(`ok — ${files.length} pages, no problems found`);
  else console.log(`failed — ${files.length} pages, ${errors.length} problem(s)`);
}

process.exit(errors.length ? 1 : 0);
