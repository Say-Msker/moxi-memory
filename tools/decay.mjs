#!/usr/bin/env node
// 记忆衰减与锚点工具（记忆库自带，无依赖）
//
//   node tools/decay.mjs                 # 干跑：列出候选（改什么、为什么）
//   node tools/decay.mjs --apply         # 执行：降权 / 归档（archive/）+ 自动 git 提交
//   node tools/decay.mjs --lifecycle --dry-run  # 2.0 生命周期：只读预测
//   node tools/decay.mjs --lifecycle      # 2.0 生命周期：摘要 / 归档 / L3 细节归档
//   node tools/decay.mjs --anchors       # 重建 anchors.md（L4 热锚 / L3 温锚 / 归档锚）
//   node tools/decay.mjs --restore <路径> # 把一个归档页连同元数据接回原路径
//
// 规则（项目约定：按重要程度 + 时间分层下降，但原文必须留档、且不占上下文）：
//   L4 / salience:1            不动
//   L3                         超过 365 天 → 降为 L2；超过 730 天 → 归档
//   L2 / salience:2            超过 180 天 → 归档
//   L1 / salience:3            超过  90 天 → 归档
// 归档 = 原文整页移到 archive/（一字不改，只加 status/archived 字段），
//        页面从 index 路由里退场，但在 anchors.md 留一根锚，靠锚点词可以找回来。
// 备份层 = git：每次 --apply 自动 commit，任何一次归档都能 git show 还原。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOOLS = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.dirname(TOOLS);
const ARCHIVE = path.join(ROOT, 'archive');
const ANCHORS = path.join(ROOT, 'anchors.md');
const LOG = path.join(ROOT, 'log.md');

const DIRS = ['sea', 'identity', 'user', 'skills', 'decisions', 'projects', 'concepts'];
const SKIP_FILES = new Set(['index.md', 'log.md', 'SOUL.md', 'MEMORY.md', 'BOOTSTRAP.md', 'anchors.md']);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ANCHORS_ONLY = args.includes('--anchors');
const LIFECYCLE = args.includes('--lifecycle');
const DRY_RUN = args.includes('--dry-run');
const restoreIndex = args.findIndex((a) => a === '--restore');
const restoreEqArg = args.find((a) => a.startsWith('--restore='));
const restoreArg = restoreEqArg
  ? restoreEqArg.slice('--restore='.length)
  : restoreIndex >= 0
    ? args[restoreIndex + 1]
    : '';
const todayArg = args.find((a) => a.startsWith('--today='));
const TODAY = todayArg ? todayArg.split('=')[1] : new Date().toISOString().slice(0, 10);

const DAY = 86400000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LIFECYCLE_LIMIT = 20;

function dateValue(value) {
  const raw = String(value || '').slice(0, 10);
  if (!DATE_ONLY.test(raw)) return null;
  const time = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function days(a, b) {
  const av = dateValue(a);
  const bv = dateValue(b);
  if (av === null || bv === null) return null;
  return Math.round((bv - av) / DAY);
}

function normalizeRel(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fm: {}, body: text, hasFm: false };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!mm) continue;
    let v = mm[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    else v = v.replace(/^["']|["']$/g, '');
    fm[mm[1]] = v;
  }
  return { fm, body: text.slice(m[0].length), hasFm: true };
}

function serializeFrontmatter(fm) {
  const order = [
    'title', 'date', 'type', 'salience', 'last_access', 'weight', 'trust', 'status',
    'status_changed_at', 'archived', 'archived_from', 'archived_level',
    'archived_last_access', 'archived_at', 'details_archive', 'details_archived_at',
    'summary', 'tags', 'sources',
  ];
  const keys = [...new Set([...order.filter((k) => k in fm), ...Object.keys(fm)])];
  return '---\n' + keys.map((k) => {
    const v = fm[k];
    return Array.isArray(v) ? `${k}: [${v.join(', ')}]` : `${k}: ${v}`;
  }).join('\n') + '\n---\n';
}

function tierOf(fm) {
  const w = String(fm.weight || '').toUpperCase();
  if (/^L[0-4]$/.test(w)) return w;
  const s = Number(fm.salience || 2);
  if (s === 1) return 'L4';
  if (s === 3) return 'L1';
  return 'L2';
}

function walk(dir) {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const p = path.join(full, e.name);
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name)));
    else if (e.name.endsWith('.md') && !SKIP_FILES.has(e.name)) out.push(path.relative(ROOT, p));
  }
  return out;
}

function listMarkdown(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const abs = path.join(full, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMarkdown(path.relative(ROOT, abs)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(normalizeRel(path.relative(ROOT, abs)));
    }
  }
  return out;
}

function writeIfChanged(file, text) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function safeJoin(root, rel) {
  const target = path.resolve(root, normalizeRel(rel));
  const base = path.resolve(root);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`路径越界：${rel}`);
  }
  return target;
}

function statusOf(fm) {
  return String(fm.status || 'active').trim().toLowerCase();
}

function dateOf(fm) {
  return String(fm.last_access || fm.date || '').slice(0, 10);
}

function lifecycleEligible(fm) {
  const numericSalience = Number(fm.salience);
  return (Number.isFinite(numericSalience) && numericSalience >= 2)
    || ['L1', 'L2', 'L3'].includes(tierOf(fm));
}

function lifecycleSkipReason(fm, rel) {
  const normalized = normalizeRel(rel);
  if (normalized.startsWith('identity/') || normalized.startsWith('user/')) {
    return 'identity/user 页面永不自动降级';
  }
  if (statusOf(fm) === 'protected') return '受保护（protected）';
  // 3.0 吸收：被纠正过的页留着原文当证据，改不改由人拍，不自动瘦身/归档
  if (String(fm.revised_by || '').trim()) return '带修订记录（revised_by），不自动降级';
  if (statusOf(fm) === 'archived') return '已归档（archived）';
  if (statusOf(fm) === 'forgotten') return '已标记遗忘（forgotten）';
  if (statusOf(fm) === 'fading') return '旧版 fading 状态，交由显式处理';
  const tier = tierOf(fm);
  if (tier === 'L0') return 'L0 不入库';
  if (tier === 'L4') return 'L4 核心，不动';
  if (!lifecycleEligible(fm)) return '未达到 salience ≥ 2 / weight L1–L3 条件';
  return '';
}

function decideLifecycle(fm, rel, body = '') {
  const tier = tierOf(fm);
  const status = statusOf(fm);
  const last = dateOf(fm);
  const base = { rel: normalizeRel(rel), tier, status, last, age: null, why: '' };
  const skip = lifecycleSkipReason(fm, rel);
  if (skip) return { ...base, action: 'skip', why: skip };

  const age = days(last, TODAY);
  if (age === null) return { ...base, action: 'skip', why: '缺少有效 last_access/date' };
  if (age < 0) return { ...base, action: 'skip', why: `last_access 晚于今天（${last}）` };
  base.age = age;

  if (tier === 'L1' || tier === 'L2') {
    if (status === 'summarized') {
      const changed = String(fm.status_changed_at || '').slice(0, 10);
      const changedAge = days(changed, TODAY);
      const threshold = tier === 'L1' ? 90 : 180;
      if (changedAge === null) {
        return { ...base, action: 'skip', why: '已摘要化但缺少 status_changed_at' };
      }
      if (dateValue(last) > dateValue(changed)) {
        return { ...base, action: 'skip', why: '摘要后又被访问，等待升回 active' };
      }
      if (changedAge < 0) {
        return { ...base, action: 'skip', why: 'status_changed_at 晚于今天' };
      }
      if (changedAge < threshold) {
        return {
          ...base,
          action: 'skip',
          why: `已摘要 ${changedAge} 天，未满 ${threshold} 天归档阈值`,
        };
      }
      return {
        ...base,
        action: 'archive',
        age: changedAge,
        why: `${tier} 摘要后 ${changedAge} 天未访问，归档`,
        targetStatus: 'archived',
      };
    }
    if (status !== 'active' && status !== 'restored') {
      return { ...base, action: 'skip', why: `status=${status}，不在自动摘要范围` };
    }
    const threshold = tier === 'L1' ? 30 : 90;
    if (age < threshold) {
      return {
        ...base,
        action: 'skip',
        why: `${age} 天未访问，未满 ${threshold} 天摘要阈值`,
      };
    }
    if (!String(fm.summary || '').trim()) {
      return { ...base, action: 'skip', why: '缺少 summary，无法安全摘要' };
    }
    return {
      ...base,
      action: 'summarize',
      why: `${tier} 已 ${age} 天未访问，摘要化并保留结论`,
      targetStatus: 'summarized',
    };
  }

  if (tier === 'L3') {
    if (fm.details_archived_at || fm.details_archive) {
      return { ...base, action: 'skip', why: '对话细节已归档' };
    }
    if (age < 180) {
      return { ...base, action: 'skip', why: `${age} 天未访问，未满 L3 细节归档阈值 180 天` };
    }
    const detail = extractDetailSections(body);
    if (!detail.text) {
      return { ...base, action: 'skip', why: 'L3 已到期，但没有可分离的对话细节段落' };
    }
    return {
      ...base,
      action: 'archive-details',
      why: `L3 已 ${age} 天未访问，只归档对话细节，节点正文保留`,
      targetStatus: 'active',
      detail,
    };
  }

  return { ...base, action: 'skip', why: `${tier} 不在自动生命周期范围` };
}

function extractDetailSections(body) {
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const removed = [];
  const kept = [];

  for (let i = 0; i < lines.length;) {
    const h2 = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (h2 && /(对话|细节)/.test(h2[1])) {
      let end = i + 1;
      while (end < lines.length && !/^##\s+/.test(lines[end])) end += 1;
      removed.push(lines.slice(i, end).join('\n').trim());
      i = end;
      continue;
    }

    const bullet = /^-\s+\*\*(对话|细节|关键细节)\*\*\s*[:：]?/.exec(lines[i]);
    if (bullet) {
      let end = i + 1;
      while (end < lines.length) {
        if (lines[end] === '') {
          if (end + 1 < lines.length && /^\s{2,}-\s+/.test(lines[end + 1])) {
            end += 1;
            continue;
          }
          break;
        }
        if (/^\s{2,}-\s+/.test(lines[end])) {
          end += 1;
          continue;
        }
        break;
      }
      removed.push(lines.slice(i, end).join('\n').trim());
      i = end;
      continue;
    }

    kept.push(lines[i]);
    i += 1;
  }

  return {
    text: removed.filter(Boolean).join('\n\n'),
    body: kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n',
  };
}

function extractSummaryBody(body, fm) {
  const title = String(fm.title || path.basename(String(fm.path || ''), '.md') || '记忆页').trim();
  const summary = String(fm.summary || '').replace(/\s+/g, ' ').trim();
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  const conclusion = /^(结论|结果|影响|决定|规则|原因|当前状态|后续|为什么)/;
  for (let i = 0; i < lines.length;) {
    const h2 = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (h2 && conclusion.test(h2[1])) {
      let end = i + 1;
      while (end < lines.length && !/^##\s+/.test(lines[end])) end += 1;
      kept.push(lines.slice(i, end).join('\n').trim());
      i = end;
      continue;
    }
    const bullet = /^-\s+\*\*(结论|结果|影响|决定|规则|原因|当前状态|后续|为什么)\*\*\s*[:：]?/.exec(lines[i]);
    if (bullet) {
      let end = i + 1;
      while (end < lines.length && /^\s{2,}-\s+/.test(lines[end])) end += 1;
      kept.push(lines.slice(i, end).join('\n').trim());
      i = end;
      continue;
    }
    i += 1;
  }

  const links = [...String(body).matchAll(/\[[^\]]+\]\([^)]+\.md\)/g)]
    .map((m) => m[0])
    .filter((v, i, all) => all.indexOf(v) === i)
    .slice(0, 8);
  const output = [
    `# ${title}`,
    '',
    `> 已于 ${TODAY} 摘要化（${tierOf(fm)}）。详细过程保留在 git 历史中。`,
    '',
    '## 摘要',
    '',
    summary,
    '',
    '## 保留结论',
    '',
    kept.length ? kept.join('\n\n') : '- 原页没有单独列出的结论；以上摘要为保留内容。',
    ...(links.length ? ['', '## 关联', '', ...links.map((link) => `- ${link}`)] : []),
    '',
  ].join('\n');
  return { title, summary, output };
}

function decide(fm, file) {
  const tier = tierOf(fm);
  const last = String(fm.last_access || fm.date || '').slice(0, 10);
  if (!last) return { action: 'keep', tier, age: null, why: '无日期，跳过' };
  const age = days(last, TODAY);
  if (fm.status === 'forgotten') return { action: 'keep', tier, age, why: '已标记遗忘' };
  if (tier === 'L4') return { action: 'keep', tier, age, why: 'L4 核心，不动' };
  if (tier === 'L3') {
    if (age > 730) return { action: 'archive', tier, age, why: `L3 超 730 天（${age}）` };
    if (age > 365) return { action: 'demote', to: 'L2', tier, age, why: `L3 超 365 天（${age}），降 L2` };
    return { action: 'keep', tier, age, why: `L3 在温层（${age} 天）` };
  }
  if (tier === 'L2') {
    if (age > 180) return { action: 'archive', tier, age, why: `L2 超 180 天（${age}）` };
    return { action: 'keep', tier, age, why: `L2 在温层（${age} 天）` };
  }
  if (age > 90) return { action: 'archive', tier, age, why: `L1 超 90 天（${age}）` };
  return { action: 'keep', tier, age, why: `L1 短期（${age} 天）` };
}

function collect() {
  const rows = [];
  for (const dir of DIRS) {
    for (const rel of walk(dir)) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const { fm } = parseFrontmatter(text);
      rows.push({ rel, text, fm, ...decide(fm, rel) });
    }
  }
  return rows;
}

function applyRow(row) {
  const abs = path.join(ROOT, row.rel);
  const { fm, body } = parseFrontmatter(row.text);
  if (row.action === 'demote') {
    fm.weight = row.to;
    fm.status = fm.status || 'active';
    fs.writeFileSync(abs, serializeFrontmatter(fm) + body, 'utf8');
    return;
  }
  if (row.action === 'archive') {
    fs.mkdirSync(ARCHIVE, { recursive: true });
    fm.status = 'fading';
    fm.archived = TODAY;
    fm.archived_from = row.rel.replace(/\\/g, '/');
    const target = path.join(ARCHIVE, path.basename(row.rel));
    let out = path.join(ARCHIVE, path.basename(row.rel));
    if (fs.existsSync(out)) out = path.join(ARCHIVE, `${path.basename(row.rel, '.md')}-archived-${TODAY}.md`);
    fs.writeFileSync(out, serializeFrontmatter(fm) + body, 'utf8');
    fs.unlinkSync(abs);
  }
}

function anchorLine(fm, rel, where) {
  const title = String(fm.title || path.basename(rel, '.md')).trim();
  const tags = Array.isArray(fm.tags) ? fm.tags : String(fm.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const hooks = [...new Set([title, ...tags])].slice(0, 6).join('、');
  const sum = String(fm.summary || '').replace(/\s+/g, ' ').slice(0, 90);
  const last = String(fm.last_access || fm.date || '').slice(0, 10);
  return `- **${title}** — ${sum} ｜ 锚点：${hooks} ｜ ${where} ｜ 最后访问 ${last}`;
}

function rebuildAnchors(rows) {
  fs.mkdirSync(ARCHIVE, { recursive: true });
  const archived = listMarkdown('archive').map((rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return { rel, fm: parseFrontmatter(text).fm };
  }).filter((r) => r.fm.archived_from);
  const hot = rows.filter((r) => r.tier === 'L4' && r.fm.status !== 'fading');
  const warm = rows.filter((r) => r.tier === 'L3' && r.fm.status !== 'fading');
  const lines = [];
  lines.push('# 记忆锚点（Anchors）');
  lines.push('');
  lines.push('> 约定：重要记忆留一根锚，靠锚点词就能想起来，不必把整页塞进上下文。');
  lines.push('> 由 `node tools/decay.mjs --anchors` 自动生成，别手改。归档的页面原文在 `archive/`，靠锚点找回来。');
  lines.push('');
  lines.push(`最后重建：${TODAY}`);
  lines.push('');
  lines.push('## 热锚 · L4（不动，随时可回忆）');
  lines.push('');
  if (!hot.length) lines.push('- （空）');
  for (const r of hot) lines.push(anchorLine(r.fm, r.rel, `\`${r.rel}\``));
  lines.push('');
  lines.push('## 温锚 · L3（细节可能压过，骨架还在）');
  lines.push('');
  if (!warm.length) lines.push('- （空）');
  for (const r of warm) lines.push(anchorLine(r.fm, r.rel, `\`${r.rel}\``));
  lines.push('');
  lines.push('## 归档锚（已淡出，原文在 archive/，要细节再展开）');
  lines.push('');
  if (!archived.length) lines.push('- （还没有归档的页面）');
  for (const r of archived) lines.push(anchorLine(r.fm, r.rel, `\`${r.rel}\``));
  lines.push('');
  const previous = fs.existsSync(ANCHORS) ? fs.readFileSync(ANCHORS, 'utf8') : '';
  const parsed = parseFrontmatter(previous);
  const fm = parsed.hasFm ? parsed.fm : {
    title: '记忆锚点',
    date: TODAY,
    type: 'concept',
    salience: 1,
    last_access: TODAY,
    summary: '重要记忆各留一根锚（锚点词 + 路径 + 摘要），归档的靠它捞回来；由 tools/decay.mjs --anchors 生成。',
    tags: ['锚点', '索引'],
    sources: [],
  };
  writeIfChanged(ANCHORS, `${serializeFrontmatter(fm)}\n${lines.join('\n')}`, 'utf8');
  return { hot: hot.length, warm: warm.length, archived: archived.length };
}

function gitCommit(msg) {
  const run = (a) => execFileSync('git', [
    '-c', `safe.directory=${ROOT}`,
    ...a,
  ], { cwd: ROOT, stdio: 'pipe' }).toString();
  try {
    if (!fs.existsSync(path.join(ROOT, '.git'))) return 'no-git';
    run(['add', '-A']);
    const status = run(['status', '--porcelain']);
    if (!status.trim()) return 'clean';
    run(['commit', '-m', msg]);
    return 'committed';
  } catch (e) {
    return 'git-failed: ' + String(e.message || e).slice(0, 200);
  }
}

function appendLog(lines) {
  const enc = 'utf8';
  fs.appendFileSync(LOG, `\n## [${TODAY}] decay | 记忆衰减与锚点\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`, enc);
}

function lifecycleEntry(row, originalRel, reason, restoreCommand) {
  return [
    `## [${TODAY}] decay | ${row.rel} ${row.tier}→${row.tier} (${row.targetStatus || row.action})`,
    `理由：${reason}`,
    `原文：${originalRel}`,
    restoreCommand ? `恢复：${restoreCommand}` : '',
  ].filter((line) => line !== '').join('\n');
}

function appendLifecycleEntries(entries) {
  const text = entries.map((entry) => `${entry}\n`).join('\n');
  fs.appendFileSync(LOG, `\n${text}`, 'utf8');
}

function removeIndexEntry(rel) {
  const normalized = normalizeRel(rel);
  const text = fs.readFileSync(path.join(ROOT, 'index.md'), 'utf8');
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const targets = [...line.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => normalizeRel(m[1]));
    return !targets.includes(normalized);
  });
  return writeIfChanged(path.join(ROOT, 'index.md'), kept.join('\n'));
}

function retargetIndexEntry(from, to) {
  const a = normalizeRel(from);
  const b = normalizeRel(to);
  const indexPath = path.join(ROOT, 'index.md');
  const text = fs.readFileSync(indexPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let hit = false;
  const next = lines.map((line) => {
    for (const needle of [`](${a})`, `](./${a})`]) {
      if (line.includes(needle)) {
        hit = true;
        return line.replace(needle, `](${b})`);
      }
    }
    return line;
  });
  if (!hit) return false;
  return writeIfChanged(indexPath, next.join('\n'));
}

function addIndexEntry(rel, fm) {
  const normalized = normalizeRel(rel);
  const indexPath = path.join(ROOT, 'index.md');
  let text = fs.readFileSync(indexPath, 'utf8');
  const linked = [...text.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => normalizeRel(m[1]));
  if (linked.includes(normalized)) return false;

  const title = String(fm.title || path.basename(normalized, '.md')).trim();
  const summary = String(fm.summary || title).replace(/\s+/g, ' ').slice(0, 100);
  const tag = String(fm.weight || `salience:${fm.salience || 2}`).trim();
  const entry = `- [${title}](${normalized}) — ${summary} \`${tag}\``;
  const lines = text.split(/\r?\n/);
  const section = normalized.split('/')[0];
  const heading = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[（(\\s]|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && !/^##\s+/.test(lines[end])) end += 1;
    let insertAt = end;
    while (insertAt > start + 1 && lines[insertAt - 1] === '') insertAt -= 1;
    lines.splice(insertAt, 0, entry);
  } else {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push(`## ${section}`, '', entry, '');
  }
  text = lines.join('\n');
  writeIfChanged(indexPath, text);
  return true;
}

function runMemoryIndexWrite() {
  const candidates = [];
  if (process.env.DSH_MEMORY_CLI) candidates.push(process.env.DSH_MEMORY_CLI);
  for (const guess of [
    path.join(ROOT, 'node_modules', 'dsh-plugin-memory', 'scripts', 'memory.mjs'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'dsh-plugin-memory', 'scripts', 'memory.mjs')
  ]) candidates.push(guess);
  try {
    const found = execFileSync('where.exe', ['dsh-memory.cmd'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).find(Boolean);
    if (found) candidates.push(found.trim());
  } catch {
    // 没装 dsh-memory CLI 就跳过这一步：index.md 由人手动维护同样合法。
  }
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const env = { ...process.env, MEMORY_DIR: ROOT };
      if (/\.mjs$/i.test(candidate)) {
        execFileSync(process.execPath, [candidate, 'index', '--write'], {
          cwd: ROOT, env, stdio: 'pipe',
        });
      } else {
        execFileSync(candidate, ['index', '--write'], {
          cwd: ROOT, env, stdio: 'pipe', shell: process.platform === 'win32',
        });
      }
      return { ok: true, candidate };
    } catch (e) {
      return { ok: false, candidate, error: String(e.message || e).slice(0, 240) };
    }
  }
  return { ok: false, error: '未找到 dsh-memory；已用脚本内置规则维护 index.md' };
}

function findArchivePage(value) {
  const normalized = normalizeRel(value);
  if (!normalized) return null;
  const direct = normalized.startsWith('archive/')
    ? normalized
    : `archive/${normalized}`;
  if (fs.existsSync(safeJoin(ROOT, direct))) return direct;
  for (const rel of listMarkdown('archive')) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const fm = parseFrontmatter(text).fm;
    if (normalizeRel(fm.archived_from) === normalized) return rel;
  }
  return null;
}

function restoreLifecyclePage(value) {
  const archiveRel = findArchivePage(value);
  if (!archiveRel) {
    console.error(`没有这个归档页：${value}`);
    process.exit(1);
  }
  const archiveAbs = safeJoin(ROOT, archiveRel);
  const archivedText = fs.readFileSync(archiveAbs, 'utf8');
  const { fm, body } = parseFrontmatter(archivedText);
  const back = normalizeRel(fm.archived_from);
  if (!back) {
    console.error(`归档页缺少 archived_from，拒绝猜测恢复路径：${archiveRel}`);
    process.exit(1);
  }
  const target = safeJoin(ROOT, back);
  if (fs.existsSync(target)) {
    console.error(`原路径已有页面，拒绝覆盖：${back}`);
    process.exit(1);
  }

  const restoredLast = String(fm.archived_last_access || fm.last_access || fm.date || '').slice(0, 10);
  const restoredLevel = String(fm.archived_level || tierOf(fm));
  fm.status = 'restored';
  fm.last_access = restoredLast || TODAY;
  if (!fm.weight && restoredLevel) fm.weight = restoredLevel;
  delete fm.archived;
  delete fm.archived_from;
  delete fm.archived_level;
  delete fm.archived_last_access;
  delete fm.archived_at;
  delete fm.status_changed_at;

  writeAtomic(target, serializeFrontmatter(fm) + body);
  fs.unlinkSync(archiveAbs);
  if (!retargetIndexEntry(archiveRel, back)) addIndexEntry(back, fm);
  rebuildAnchors(collect());
  const indexResult = runMemoryIndexWrite();
  appendLifecycleEntries([
    [
      `## [${TODAY}] decay | ${back} ${restoredLevel}→${restoredLevel} (restored)`,
      `理由：从归档接回，恢复原路径、级别与 last_access`,
      `原文：${archiveRel}`,
      `恢复：node tools/decay.mjs --restore ${back}`,
    ].join('\n'),
  ]);
  console.log(`已还原到 ${back}（${restoredLevel}，last_access ${fm.last_access}）`);
  console.log(`index: ${indexResult.ok ? '已重写' : indexResult.error}`);
  console.log('git: ' + gitCommit(`restore ${TODAY}: ${back}`));
}

function collectLifecycleRows() {
  const rows = [];
  for (const dir of DIRS) {
    for (const rel of walk(dir)) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const { fm, body } = parseFrontmatter(text);
      rows.push({ rel: normalizeRel(rel), text, fm, body, ...decideLifecycle(fm, rel, body) });
    }
  }
  const archived = listMarkdown('archive').map((rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const { fm, body } = parseFrontmatter(text);
    if (!fm.archived_from) return null;
    return {
      rel,
      text,
      fm,
      body,
      action: 'skip',
      tier: tierOf(fm),
      status: statusOf(fm),
      last: dateOf(fm),
      age: days(dateOf(fm), TODAY),
      why: 'archive/ 只读，不参与二次降级',
    };
  }).filter(Boolean);
  return { rows, archived };
}

function prepareLifecyclePlan(rows) {
  const actionable = [];
  const skipped = [];
  for (const row of rows) {
    if (row.action === 'skip') {
      skipped.push(row);
      continue;
    }
    if (row.action === 'summarize') {
      const shortened = extractSummaryBody(row.body, { ...row.fm, path: row.rel });
      if (!shortened.summary) {
        skipped.push({ ...row, action: 'skip', why: '缺少 summary，无法安全摘要' });
        continue;
      }
      const bodyBytes = Buffer.byteLength(row.body, 'utf8');
      const outputBytes = Buffer.byteLength(shortened.output, 'utf8');
      if (outputBytes >= bodyBytes) {
        skipped.push({
          ...row,
          action: 'skip',
          why: `摘要未变短（${bodyBytes}→${outputBytes} 字节），保留原页`,
        });
        continue;
      }
      actionable.push({ ...row, summaryBody: shortened });
      continue;
    }
    actionable.push(row);
  }
  actionable.sort((a, b) => a.rel.localeCompare(b.rel, 'zh-CN'));
  const selected = actionable.slice(0, LIFECYCLE_LIMIT);
  for (const row of actionable.slice(LIFECYCLE_LIMIT)) {
    skipped.push({
      ...row,
      action: 'skip',
      why: `单次最多 ${LIFECYCLE_LIMIT} 页，本页留待下一批`,
    });
  }
  skipped.sort((a, b) => a.rel.localeCompare(b.rel, 'zh-CN'));
  return { selected, skipped };
}

function applyLifecycleRow(row) {
  const abs = safeJoin(ROOT, row.rel);
  const { fm, body } = parseFrontmatter(fs.readFileSync(abs, 'utf8'));

  if (row.action === 'summarize') {
    const short = extractSummaryBody(body, { ...fm, path: row.rel });
    if (Buffer.byteLength(short.output, 'utf8') >= Buffer.byteLength(body, 'utf8')) {
      throw new Error('摘要未变短，拒绝覆盖原文');
    }
    fm.status = 'summarized';
    fm.status_changed_at = TODAY;
    writeAtomic(abs, serializeFrontmatter(fm) + short.output);
    return {
      rel: row.rel,
      tier: row.tier,
      targetStatus: 'summarized',
      why: row.why,
      archiveRel: '',
      restore: `node tools/decay.mjs --lifecycle # 先用 dsh-memory touch 更正 last_access`,
    };
  }

  if (row.action === 'archive') {
    const archiveRel = `archive/${row.rel}`;
    const archiveAbs = safeJoin(ROOT, archiveRel);
    if (fs.existsSync(archiveAbs)) throw new Error(`归档目标已存在：${archiveRel}`);
    fm.status = 'archived';
    fm.archived_from = row.rel;
    fm.archived_level = row.tier;
    fm.archived_last_access = row.last;
    fm.archived_at = TODAY;
    writeAtomic(archiveAbs, serializeFrontmatter(fm) + body);
    fs.unlinkSync(abs);
    return {
      rel: row.rel,
      tier: row.tier,
      targetStatus: 'archived',
      why: row.why,
      archiveRel,
      restore: `node tools/decay.mjs --restore ${row.rel}`,
    };
  }

  if (row.action === 'archive-details') {
    const base = row.rel.replace(/\.md$/i, '');
    const detailRel = `archive/${base}/details.md`;
    const detailAbs = safeJoin(ROOT, detailRel);
    if (fs.existsSync(detailAbs)) throw new Error(`细节归档已存在：${detailRel}`);
    const detail = extractDetailSections(body);
    if (!detail.text) throw new Error('没有可分离的对话细节段落');
    const detailTitle = `${String(fm.title || path.basename(row.rel, '.md'))} · 对话细节`;
    const detailText = [
      '---',
      `title: ${detailTitle}`,
      `date: ${TODAY}`,
      'type: fact',
      'salience: 3',
      `summary: ${detailTitle}：从 ${row.rel} 归档的对话细节，L3 节点正文仍在原页`,
      'status: archived',
      `archived_from: ${row.rel}`,
      `archived_at: ${TODAY}`,
      '---',
      '',
      `# ${detailTitle}`,
      '',
      `- 来源：\`${row.rel}\``,
      `- 归档日期：${TODAY}`,
      `- 理由：${row.why}`,
      '',
      '---',
      '',
      detail.text,
      '',
    ].join('\n');
    writeAtomic(detailAbs, detailText);

    let nextBody = detail.body;
    if (!nextBody.includes('细节已归档')) {
      const marker = `> 细节已归档：\`${detailRel}\`（${TODAY}）。事件、原因与影响保留。\n\n`;
      const headingEnd = nextBody.indexOf('\n');
      nextBody = headingEnd >= 0
        ? `${nextBody.slice(0, headingEnd + 1)}\n${marker}${nextBody.slice(headingEnd + 1).replace(/^\n+/, '')}`
        : `${nextBody}\n\n${marker}`;
    }
    fm.status = 'active';
    fm.details_archive = detailRel;
    fm.details_archived_at = TODAY;
    writeAtomic(abs, serializeFrontmatter(fm) + nextBody);
    return {
      rel: row.rel,
      tier: row.tier,
      targetStatus: 'details-archived',
      why: row.why,
      archiveRel: detailRel,
      restore: `# L3 节点正文仍在 ${row.rel}；细节见 ${detailRel}`,
    };
  }

  throw new Error(`未知生命周期动作：${row.action}`);
}

function lifecycleCommand() {
  const { rows, archived } = collectLifecycleRows();
  const plan = prepareLifecyclePlan(rows);
  const scanned = rows.length + archived.length;
  console.log(`扫描 ${scanned} 页（活动页 ${rows.length} / archive 只读 ${archived.length}），今天 ${TODAY}`);
  console.log(`将降 ${plan.selected.length} 页`);
  for (const row of plan.selected) {
    console.log(`  [${row.action}] ${row.rel} ${row.tier}→${row.targetStatus} — ${row.why}`);
  }

  if (DRY_RUN) {
    const skipped = [...plan.skipped, ...archived];
    console.log('已降 0 页');
    console.log(`跳过 ${skipped.length} 页（逐条原因）`);
    for (const row of skipped) console.log(`  [skip] ${row.rel} — ${row.why}`);
    console.log('dry-run 结束：未写文件、未改索引、未重建锚点、未提交 git。');
    return;
  }

  const completed = [];
  const failed = [];
  for (const row of plan.selected) {
    try {
      completed.push(applyLifecycleRow(row));
    } catch (e) {
      failed.push({ ...row, why: `执行失败：${String(e.message || e)}` });
    }
  }

  let indexResult = { ok: true };
  if (completed.length) {
    for (const row of completed) {
      // 归档页仍留一行在 index.md（链接改指 archive/ 路径）：dsh-memory lint 要求
      // 每个 .md 都必须被 index 收录，否则算孤儿页。规范 §2.4 想让归档页退场，
      // 与 lint 的全局扫描冲突 —— 这里以代码为准，退场改为「改指归档路径」。
      if (row.targetStatus === 'archived' && row.archiveRel) {
        retargetIndexEntry(row.rel, row.archiveRel);
      }
      if (row.targetStatus === 'details-archived' && row.archiveRel) {
        addIndexEntry(row.archiveRel, {
          title: `${path.basename(row.rel, '.md')} · 对话细节`,
          summary: '对话细节（已归档，节点正文保留）',
          weight: 'details',
        });
      }
    }
    rebuildAnchors(collect());
    indexResult = runMemoryIndexWrite();
    appendLifecycleEntries(completed.map((row) => lifecycleEntry(
      row,
      row.archiveRel || row.rel,
      row.why,
      row.restore,
    )));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
    const git = gitCommit(`lifecycle-${stamp}`);
    console.log(`index: ${indexResult.ok ? '已重写' : indexResult.error}`);
    console.log(`git: ${git}`);
  }

  const skipped = [...plan.skipped, ...archived, ...failed];
  skipped.sort((a, b) => a.rel.localeCompare(b.rel, 'zh-CN'));
  console.log(`已降 ${completed.length} 页`);
  console.log(`跳过 ${skipped.length} 页（逐条原因）`);
  for (const row of skipped) console.log(`  [skip] ${row.rel} — ${row.why}`);
}

if (DRY_RUN && !LIFECYCLE) {
  console.error('--dry-run 只能和 --lifecycle 一起使用。');
  process.exit(1);
}
if ((restoreIndex >= 0 || restoreEqArg) && !restoreArg) {
  console.error('--restore 后面需要页面路径，例如 --restore skills/reading-books.md');
  process.exit(1);
}
if (restoreArg) {
  restoreLifecyclePage(restoreArg);
  process.exit(0);
}

const rows = collect();
if (ANCHORS_ONLY) {
  const r = rebuildAnchors(rows);
  console.log(`anchors.md 已重建：热锚 ${r.hot} / 温锚 ${r.warm} / 归档锚 ${r.archived}`);
  process.exit(0);
}
if (LIFECYCLE) {
  lifecycleCommand();
  process.exit(0);
}

const todo = rows.filter((r) => r.action !== 'keep');
console.log(`扫描 ${rows.length} 页，候选 ${todo.length} 页（今天 ${TODAY}）`);
for (const r of todo) console.log(`  [${r.action}${r.to ? '→' + r.to : ''}] ${r.rel}  ${r.fm.title || ''} — ${r.why}`);

if (!APPLY) {
  if (!todo.length) console.log('没有需要动的东西。');
  console.log('干跑结束。加 --apply 才真的执行；执行后会自动 git 提交。');
  process.exit(0);
}

const done = [];
for (const r of todo) {
  applyRow(r);
  done.push(`${r.action === 'demote' ? `降权 ${r.tier}→${r.to}` : '归档'}：${r.rel}（${r.why}）`);
}
if (done.length) {
  const { writeFile } = fs;
  // 归档后重算一次，保证 anchors 里热/温/归档三段都对
  rebuildAnchors(collect());
  appendLog(done);
  const g = gitCommit(`decay ${TODAY}: ${done.length} 项（降权/归档），原文留存`);
  console.log(`已执行 ${done.length} 项；git: ${g}`);
  for (const d of done) console.log('  - ' + d);
} else {
  console.log('无需执行。');
}
