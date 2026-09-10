/**
 * QA 独立验证（v1.2 增量）—— 静态约束 + 老数据/脏数据兼容
 *
 * 静态约束（对 src/ 源码文本做真实扫描，非口头声称）：
 *  - 零网络调用（fetch / XMLHttpRequest / WebSocket / sendBeacon）；
 *  - localStorage key 前缀 `petlog.v1.` 仅出现在 src/lib/storage.js；
 *  - 第三方 import 仅限 react / react-dom（零第三方运行时依赖）。
 *
 * 兼容：老宠物（无 hiddenTypes/customTypes）、老事件（无 startTs/endTs/label/photoIds）、
 * 未知 type —— 读取与解析均不抛错。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { getEventType, getVisibleEventTypes, resolveEventDisplay } from '../src/lib/eventTypes.js';
import { KEYS, readEvents, readPets } from '../src/lib/storage.js';
import { installDomEnv, uninstallDomEnv } from './helpers/dom-env.js';

/** 递归收集 src/ 下所有源文件 */
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(js|jsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

const SRC_DIR = join(process.cwd(), 'src');
const files = walk(SRC_DIR);
const rel = (f) => f.replace(process.cwd(), '').replace(/\\/g, '/');
const read = (f) => readFileSync(f, 'utf8');

/* ------------------------------ 静态约束 ------------------------------ */

test('[静态] src/ 零网络调用：无 fetch( / XMLHttpRequest / WebSocket / sendBeacon', () => {
  const offenders = [];
  for (const f of files) {
    const text = read(f);
    for (const re of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bsendBeacon\b/, /\bEventSource\b/]) {
      if (re.test(text)) offenders.push(`${rel(f)} ← ${re}`);
    }
  }
  assert.deepEqual(offenders, [], `src/ 不应出现网络调用：${offenders.join(', ')}`);
});

test('[静态] localStorage key 前缀 petlog.v1. 仅定义于 src/lib/storage.js', () => {
  const hits = files.filter((f) => read(f).includes('petlog.v1.')).map(rel);
  assert.deepEqual(hits, ['/src/lib/storage.js'], `key 前缀应集中在 storage.js，实际命中：${hits.join(', ')}`);
});

test('[静态] 第三方 import 仅限 react / react-dom（零第三方运行时依赖）', () => {
  const allowed = new Set(['react', 'react-dom', 'react-dom/client', 'react-dom/server']);
  const offenders = [];
  for (const f of files) {
    const text = read(f);
    const re = /from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('/')) continue;
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!allowed.has(pkg)) offenders.push(`${rel(f)} → ${spec}`);
    }
  }
  assert.deepEqual(offenders, [], `不应引入第三方运行时依赖：${offenders.join(', ')}`);
});

test('[静态] storage.js 的 KEYS 仍为 petlog.v1.* 且含 activeTimer', () => {
  assert.equal(KEYS.pets, 'petlog.v1.pets');
  assert.equal(KEYS.events, 'petlog.v1.events');
  assert.equal(KEYS.settings, 'petlog.v1.settings');
  assert.equal(KEYS.activeTimer, 'petlog.v1.activeTimer');
});

/* ------------------------------ 老数据 / 脏数据 ------------------------------ */

test('[兼容] 老宠物（无 hiddenTypes/customTypes）读取不崩并补默认值', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([{ id: 'old1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }]),
  });
  try {
    const pets = readPets();
    assert.equal(pets.length, 1);
    assert.equal(pets[0].kind, 'dog', '老 kind 应原样保留');
    assert.deepEqual(pets[0].hiddenTypes, [], 'hiddenTypes 应补 []');
    assert.deepEqual(pets[0].customTypes, [], 'customTypes 应补 []');
    // 老宠物仍能算出可见事件集
    const visible = getVisibleEventTypes(pets[0]);
    assert.ok(visible.length >= 8, '老宠物可见集应正常计算');
  } finally {
    uninstallDomEnv();
  }
});

test('[兼容] 老事件（无 startTs/endTs/label/photoIds）读取不崩且保留 durationMin', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([
      { id: 'e1', petId: 'old1', type: 'walk', ts: 1700000000000, durationMin: 30, unit: 'min' },
    ]),
  });
  try {
    const events = readEvents();
    assert.equal(events.length, 1);
    const e = events[0];
    assert.equal(e.durationMin, 30, 'durationMin 应保留');
    assert.equal(e.startTs, null, 'startTs 应兜底 null');
    assert.equal(e.endTs, null, 'endTs 应兜底 null');
    assert.equal(e.label, '', 'label 应兜底空串');
    assert.deepEqual(e.photoIds, [], 'photoIds 应兜底 []');
  } finally {
    uninstallDomEnv();
  }
});

test('[兼容] 未知 type 事件：getEventType 兜底 other，显示层用快照/占位，不崩', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([
      { id: 'e2', petId: 'p', type: 'totally-unknown', ts: 1700000000000, label: '我家怪事' },
      { id: 'e3', petId: 'p', type: 'totally-unknown-2', ts: 1700000001000 },
    ]),
  });
  try {
    assert.equal(getEventType('totally-unknown').type, 'other', '基础池应兜底 other');
    const events = readEvents();
    const withSnapshot = events.find((e) => e.id === 'e2');
    const noSnapshot = events.find((e) => e.id === 'e3');
    assert.equal(resolveEventDisplay(withSnapshot, { kind: 'dog' }).label, '我家怪事', '有快照用快照');
    assert.equal(resolveEventDisplay(noSnapshot, { kind: 'dog' }).label, '已删除的自定义事件', '无快照用占位');
  } finally {
    uninstallDomEnv();
  }
});

test('[兼容] 脏 pets 数组（含 null / 非对象 / 非法 kind）被安全清洗', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([null, 42, { id: 'ok', name: 'A', kind: 'not-a-species', createdAt: 5 }]),
  });
  try {
    const pets = readPets();
    assert.equal(pets.length, 1, '非法项应被丢弃');
    assert.equal(pets[0].kind, 'other', '非法 kind 应落 other');
    assert.equal(getVisibleEventTypes(pets[0]).length, 12, 'other 兜底应给 legacy 12');
  } finally {
    uninstallDomEnv();
  }
});
