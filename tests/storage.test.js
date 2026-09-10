/**
 * src/lib/storage.js 测试
 * 重点：脏数据兜底、导入校验与导入语义、写入失败降级
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { afterEach, beforeEach } from 'node:test';

import { installBrokenDomEnv, installDomEnv, makeSnapshot, uninstallDomEnv } from './helpers/dom-env.js';
import { SPECIES_KINDS } from '../src/lib/eventTypes.js';
import {
  KEYS,
  addEvent,
  addPet,
  clearAll,
  clearTimer,
  deleteEvent,
  deletePet,
  estimateStorageBytes,
  exportData,
  importData,
  newId,
  readActiveTimer,
  readEvents,
  readPets,
  readSettings,
  setStorageErrorListener,
  startTimer,
  updateEvent,
  updatePet,
  validateImport,
  writeActiveTimer,
  writeEvents,
  writePets,
  writeSettings,
} from '../src/lib/storage.js';

/** 每个用例前后重置环境，保证互相独立 */
beforeEach(() => {
  installDomEnv();
  setStorageErrorListener(null);
});
afterEach(() => {
  setStorageErrorListener(null);
  uninstallDomEnv();
});

/* ------------------------------ key 定义 ------------------------------ */

test('KEYS 全部使用 petlog.v1. 前缀', () => {
  assert.deepEqual(Object.keys(KEYS).sort(), ['activeTimer', 'events', 'pets', 'settings']);
  Object.values(KEYS).forEach((k) => assert.ok(k.startsWith('petlog.v1.'), `${k} 缺少前缀`));
});

test('newId 返回非空唯一字符串', () => {
  const a = newId();
  const b = newId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

/* ------------------------------ 脏数据兜底：pets ------------------------------ */

test('readPets: 完全损坏的 JSON（不是 JSON）返回空数组且不抛异常', () => {
  installDomEnv({ [KEYS.pets]: '{这不是JSON' });
  assert.doesNotThrow(() => {
    assert.deepEqual(readPets(), []);
  });
});

test('readPets: 非数组（对象 / 字符串 / 数字）返回空数组', () => {
  ['{"a":1}', '"我是字符串"', '42', 'null', 'true'].forEach((raw) => {
    installDomEnv({ [KEYS.pets]: raw });
    assert.deepEqual(readPets(), [], `输入 ${raw} 应返回 []`);
  });
});

test('readPets: 数组里混入 null / 基础类型 / 空对象，非法项被丢弃或兜底', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([null, 0, 'x', true, {}, { id: 'ok', name: '旺财' }]),
  });
  const pets = readPets();
  // null / 0 / 'x' / true 被丢弃；{} 和 {id:'ok'} 被兜底为"未命名"
  assert.ok(Array.isArray(pets));
  pets.forEach((p) => {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.name, 'string');
    assert.ok(SPECIES_KINDS.includes(p.kind), `kind 必须是 8 物种之一，实际 ${p.kind}`);
    assert.ok(Number.isFinite(p.createdAt));
    assert.ok(Array.isArray(p.hiddenTypes), 'hiddenTypes 必须被兜底为数组');
    assert.ok(Array.isArray(p.customTypes), 'customTypes 必须被兜底为数组');
  });
  const ok = pets.find((p) => p.id === 'ok');
  assert.ok(ok, '合法项必须保留');
  assert.equal(ok.name, '旺财');
});

test('readPets: 字段类型全错时兜底为默认值', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([
      { id: 123, name: 456, emoji: {}, kind: 'dragon', createdAt: '昨天' },
    ]),
  });
  const pets = readPets();
  assert.equal(pets.length, 1);
  assert.equal(pets[0].name, '未命名');
  assert.equal(pets[0].emoji, '🐾');
  assert.equal(pets[0].kind, 'other');
  assert.ok(Number.isFinite(pets[0].createdAt));
});

test('readPets: 空字符串与空白名兜底为「未命名」', () => {
  installDomEnv({ [KEYS.pets]: JSON.stringify([{ name: '   ' }, { name: '' }]) });
  assert.deepEqual(readPets().map((p) => p.name), ['未命名', '未命名']);
});

test('readPets: 按 createdAt 升序', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([
      { id: 'b', name: '后', createdAt: 2000 },
      { id: 'a', name: '先', createdAt: 1000 },
    ]),
  });
  assert.deepEqual(readPets().map((p) => p.id), ['a', 'b']);
});

/* ------------------------------ 脏数据兜底：events ------------------------------ */

test('readEvents: 损坏 JSON 返回空数组且不抛异常', () => {
  installDomEnv({ [KEYS.events]: '{这不是JSON' });
  assert.doesNotThrow(() => {
    assert.deepEqual(readEvents(), []);
  });
});

test('readEvents: 数组里混入 null 与 ts 非法的记录，非法项被丢弃', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([null, { ts: '坏' }, { ts: 123 }, { ts: 1700000000000, type: 'walk' }]),
  });
  const events = readEvents();
  assert.equal(events.length, 2, 'ts:"坏" 与 null 必须被丢弃');
  assert.ok(events.some((e) => e.ts === 123));
  assert.ok(events.some((e) => e.ts === 1700000000000));
});

test('readEvents: 没有 ts 字段的记录被丢弃', () => {
  installDomEnv({ [KEYS.events]: JSON.stringify([{ type: 'walk', note: '没时间' }]) });
  assert.deepEqual(readEvents(), []);
});

test('readEvents: 未知 type 保留但字段类型安全（describe/render 不会崩）', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([
      { ts: 1700000000000, type: '外星事件', amount: 'abc', durationMin: {}, note: 42 },
    ]),
  });
  const events = readEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, '外星事件');
  assert.equal(events[0].amount, null);
  assert.equal(events[0].durationMin, null);
  assert.equal(events[0].note, '');
});

test('readEvents: 按 ts 升序', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([{ ts: 3000 }, { ts: 1000 }, { ts: 2000 }]),
  });
  assert.deepEqual(readEvents().map((e) => e.ts), [1000, 2000, 3000]);
});

test('readEvents: 非数组返回空数组', () => {
  installDomEnv({ [KEYS.events]: '{"events":[]}' });
  assert.deepEqual(readEvents(), []);
});

/* ------------------------------ 脏数据兜底：settings ------------------------------ */

test('readSettings: 脏数据返回默认设置', () => {
  const cases = ['{这不是JSON', '[]', '"str"', '42', 'null', JSON.stringify({ activePetId: 1, timelineOrder: 99 })];
  cases.forEach((raw) => {
    installDomEnv({ [KEYS.settings]: raw });
    const s = readSettings();
    assert.deepEqual(Object.keys(s).sort(), ['activePetId', 'timelineOrder']);
    assert.equal(typeof s.activePetId, 'string');
    assert.ok(['asc', 'desc'].includes(s.timelineOrder));
  });
});

test('readSettings: 合法值原样保留；非法 timelineOrder 回落 desc', () => {
  installDomEnv({ [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'asc' }) });
  assert.deepEqual(readSettings(), { activePetId: 'p1', timelineOrder: 'asc' });

  installDomEnv({ [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: '乱写' }) });
  assert.deepEqual(readSettings(), { activePetId: 'p1', timelineOrder: 'desc' });
});

/* ------------------------------ 隐私模式 / 写入失败 ------------------------------ */

test('readPets/readEvents: localStorage 完全不可用时降级为空且不抛异常', () => {
  installBrokenDomEnv();
  const messages = [];
  setStorageErrorListener((m) => messages.push(m));
  assert.doesNotThrow(() => {
    assert.deepEqual(readPets(), []);
    assert.deepEqual(readEvents(), []);
  });
  assert.ok(messages.length > 0, '应当通过监听器上报一次错误');
});

test('writePets: 配额超限时返回 false 并上报配额文案', () => {
  const store = installDomEnv({}, { quotaLimit: 10 });
  const messages = [];
  setStorageErrorListener((m) => messages.push(m));
  const ok = writePets([{ id: 'x'.repeat(100), name: '超长名字'.repeat(20) }]);
  assert.equal(ok, false);
  assert.ok(messages.some((m) => m.includes('空间已满')), `实际提示：${JSON.stringify(messages)}`);
  void store;
});

test('clearAll: 清除全部 petlog key', async () => {
  installDomEnv({
    [KEYS.pets]: '[]',
    [KEYS.events]: '[]',
    [KEYS.settings]: '{}',
    'other.app.key': '保留',
  });
  await clearAll();
  assert.equal(globalThis.window.localStorage.getItem(KEYS.pets), null);
  assert.equal(globalThis.window.localStorage.getItem(KEYS.events), null);
  assert.equal(globalThis.window.localStorage.getItem(KEYS.settings), null);
  assert.equal(globalThis.window.localStorage.getItem('other.app.key'), '保留', '不应误删其它应用数据');
});

/* ------------------------------ CRUD ------------------------------ */

test('addPet / updatePet / deletePet 正常链路', async () => {
  const pet = addPet({ name: ' 旺财 ', emoji: '🐶', kind: 'dog' });
  assert.ok(pet);
  assert.equal(pet.name, '旺财', '名字应被 trim');
  assert.equal(readPets().length, 1);

  updatePet(pet.id, { name: '来福', kind: 'cat' });
  const after = readPets()[0];
  assert.equal(after.name, '来福');
  assert.equal(after.kind, 'cat');
  assert.equal(after.id, pet.id);

  const r = await deletePet(pet.id);
  assert.equal(r.pets.length, 0);
});

test('deletePet: 连带删除该宠物的全部记录，且不误删其它宠物', async () => {
  const a = addPet({ name: 'A', emoji: '🐶', kind: 'dog' });
  const b = addPet({ name: 'B', emoji: '🐱', kind: 'cat' });
  addEvent({ petId: a.id, type: 'walk', ts: 1000 });
  addEvent({ petId: a.id, type: 'meal', ts: 2000 });
  addEvent({ petId: b.id, type: 'meal', ts: 3000 });

  const r = await deletePet(a.id);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].petId, b.id);
  assert.equal(readEvents().length, 1);
});

test('addEvent / updateEvent / deleteEvent 正常链路', async () => {
  const pet = addPet({ name: '旺财', emoji: '🐶', kind: 'dog' });
  const evt = addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000, durationMin: 30 });
  assert.ok(evt);
  assert.equal(evt.durationMin, 30);
  assert.equal(evt.unit, 'min', '单位应取自事件类型定义');

  updateEvent(evt.id, { durationMin: 45, note: '绕了小区一圈' });
  const updated = readEvents().find((e) => e.id === evt.id);
  assert.equal(updated.durationMin, 45);
  assert.equal(updated.note, '绕了小区一圈');

  await deleteEvent(evt.id);
  assert.equal(readEvents().length, 0);
});

test('updateEvent: 传入非法 ts 时保留原值而不是写坏数据', () => {
  const pet = addPet({ name: '旺财', emoji: '🐶', kind: 'dog' });
  const evt = addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000 });
  const list = updateEvent(evt.id, { ts: NaN });
  assert.equal(list.length, 1);
  assert.equal(list[0].ts, 1700000000000, '非法 ts 不应覆盖原有合法值');
});

test('exportData: 结构完整且可被自身validateImport 接受', async () => {
  const pet = addPet({ name: '旺财', emoji: '🐶', kind: 'dog' });
  addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000 });
  writeSettings({ activePetId: pet.id, timelineOrder: 'asc' });

  const data = await exportData();
  assert.equal(data.app, 'petlog');
  assert.equal(data.version, 1);
  assert.ok(Number.isFinite(data.exportedAt));
  assert.equal(data.pets.length, 1);
  assert.equal(data.events.length, 1);
  assert.deepEqual(validateImport(data), { ok: true });
});

test('estimateStorageBytes: 返回非负整数，中文按 UTF-8 正确计字节', () => {
  writePets([{ id: 'p1', name: '旺财旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }]);
  const bytes = estimateStorageBytes();
  assert.ok(Number.isFinite(bytes) && bytes >= 0);
  // 4 个中文 = 12 字节（UTF-8），若按 UTF-16 length*2 会得到 8；只要 >12 即可确认含中文内容
  assert.ok(bytes > 12, `实际字节数 ${bytes}`);
});

/* ------------------------------ 导入校验：5 类非法输入 ------------------------------ */

test('validateImport: 拒绝 null / 数组 / 基础类型（非对象）', () => {
  [null, undefined, 42, 'str', true, []].forEach((v) => {
    const r = validateImport(v);
    assert.equal(r.ok, false, `输入 ${JSON.stringify(v)} 应被拒绝`);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0);
  });
});

test('importData: 非 JSON 字符串 → 明确报错，不崩溃', async () => {
  const r = await importData('{这不是JSON', 'merge');
  assert.equal(r.ok, false);
  assert.ok(String(r.error).includes('JSON'), `报错文案应说明 JSON 问题，实际：${r.error}`);
});

test('importData: 空对象 {} → 报错（缺少 pets/events）', async () => {
  const r = await importData('{}', 'merge');
  assert.equal(r.ok, false);
  assert.ok(String(r.error).includes('缺少'), `实际：${r.error}`);
});

test('importData: {pets:[],events:[]} 之外的残缺结构', async () => {
  // 只有 pets，没有 events —— 合法（events 视为空）
  assert.equal((await importData(JSON.stringify({ app: 'petlog', pets: [] }), 'merge')).ok, true);
  // 什么都没有
  assert.equal((await importData(JSON.stringify({ app: 'petlog', foo: 1 }), 'merge')).ok, false);
});

test('importData: events 非数组 → 报错', async () => {
  const r = await importData(JSON.stringify({ app: 'petlog', pets: [], events: {} }), 'merge');
  assert.equal(r.ok, false);
  assert.ok(String(r.error).includes('events'), `实际：${r.error}`);
});

test('importData: pets 非数组 → 报错', async () => {
  const r = await importData(JSON.stringify({ app: 'petlog', pets: 'x', events: [] }), 'merge');
  assert.equal(r.ok, false);
  assert.ok(String(r.error).includes('pets'), `实际：${r.error}`);
});

test('importData: 结构对但 ts 非法 → 该条被丢弃，整体仍成功且不写入坏数据', async () => {
  const r = await importData(
    JSON.stringify({
      app: 'petlog',
      pets: [{ id: 'p1', name: '旺财' }],
      events: [
        { id: 'bad', ts: '坏时间', type: 'walk' },
        { id: 'good', ts: 1700000000000, type: 'walk' },
      ],
    }),
    'overwrite'
  );
  assert.equal(r.ok, true);
  assert.equal(r.addedEvents, 1, '非法 ts 记录应被丢弃');
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].id, 'good');
});

test('importData: 未知来源 app 字段 → 报错', async () => {
  const r = await importData(JSON.stringify({ app: 'other-app', pets: [], events: [] }), 'merge');
  assert.equal(r.ok, false);
  assert.ok(String(r.error).includes('未知来源'), `实际：${r.error}`);
});

test('importData: 空文本 / 空白文本 → 报错而不是崩溃', async () => {
  for (const t of ['', '   ', '\n']) {
    const r = await importData(t, 'merge');
    assert.equal(r.ok, false);
    assert.equal(typeof r.error, 'string');
  }
});

/* ------------------------------ 导入语义 ------------------------------ */

test('importData merge: 按 id 去重，同一 id 不重复插入', async () => {
  const pet = addPet({ name: '旺财', emoji: '🐶', kind: 'dog' });
  addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000 });
  const existing = readEvents()[0];

  const snap = makeSnapshot({
    pets: [{ id: pet.id, name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }],
    events: [
      { id: existing.id, petId: pet.id, type: 'walk', ts: 1700000000000 },
      { id: 'e-new', petId: pet.id, type: 'meal', ts: 1700003600000 },
    ],
  });

  const r = await importData(JSON.stringify(snap), 'merge');
  assert.equal(r.ok, true);
  assert.equal(r.addedPets, 0, '同 id 宠物不应重复插入');
  assert.equal(r.addedEvents, 1, '同 id 事件不应重复插入，只新增 1 条');
  assert.equal(readPets().length, 1);
  assert.equal(readEvents().length, 2);
});

test('importData merge: 重复导入同一文件第二次，新增数为 0', async () => {
  const snap = JSON.stringify(makeSnapshot());
  const first = await importData(snap, 'merge');
  assert.equal(first.addedPets, 1);
  assert.equal(first.addedEvents, 1);
  const second = await importData(snap, 'merge');
  assert.equal(second.addedPets, 0);
  assert.equal(second.addedEvents, 0);
  assert.equal(readEvents().length, 1, '不应出现重复记录');
});

test('importData merge: 保留本地已有数据', async () => {
  const local = addPet({ name: '本地宠物', emoji: '🐱', kind: 'cat' });
  addEvent({ petId: local.id, type: 'bath', ts: 1600000000000 });
  await importData(JSON.stringify(makeSnapshot()), 'merge');
  const pets = readPets();
  assert.equal(pets.length, 2);
  assert.ok(pets.some((p) => p.name === '本地宠物'), '本地宠物不应被合并模式删除');
  assert.equal(readEvents().length, 2);
});

test('importData overwrite: 整体替换 pets / events', async () => {
  const local = addPet({ name: '本地宠物', emoji: '🐱', kind: 'cat' });
  addEvent({ petId: local.id, type: 'bath', ts: 1600000000000 });
  addEvent({ petId: local.id, type: 'bath', ts: 1600003600000 });

  const r = await importData(JSON.stringify(makeSnapshot()), 'overwrite');
  assert.equal(r.ok, true);
  const pets = readPets();
  const events = readEvents();
  assert.equal(pets.length, 1);
  assert.equal(pets[0].name, '旺财', '本地宠物应被覆盖');
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'e1');
});

test('importData overwrite: 覆盖 settings', async () => {
  writeSettings({ activePetId: 'local-pet', timelineOrder: 'asc' });
  const r = await importData(
    JSON.stringify(makeSnapshot({ settings: { activePetId: 'p1', timelineOrder: 'desc' } })),
    'overwrite'
  );
  assert.equal(r.ok, true);
  assert.deepEqual(readSettings(), { activePetId: 'p1', timelineOrder: 'desc' });
});

test('importData overwrite: 备份文件未携带 settings 时不应残留旧宠物的 activePetId', async () => {
  writeSettings({ activePetId: 'local-pet', timelineOrder: 'asc' });
  const snap = makeSnapshot();
  delete snap.settings;
  const r = await importData(JSON.stringify(snap), 'overwrite');
  assert.equal(r.ok, true);
  const s = readSettings();
  assert.equal(
    s.activePetId,
    '',
    `覆盖导入后本地旧宠物已不存在，activePetId 应复位为默认空串，实际为「${s.activePetId}」`
  );
});

test('importData: 导入后数据可再次被 exportData 导出（闭环）', async () => {
  await importData(JSON.stringify(makeSnapshot()), 'overwrite');
  const out = await exportData();
  assert.equal(out.pets.length, 1);
  assert.equal(out.events.length, 1);
  assert.deepEqual(validateImport(out), { ok: true });
  assert.equal((await importData(JSON.stringify(out), 'merge')).addedEvents, 0, '再导入自身不应产生重复');
});

/* ------------------------------ 写入非数组入参 ------------------------------ */

test('writePets / writeEvents 传入非数组时写空数组而不是崩溃', () => {
  assert.doesNotThrow(() => {
    writePets(null);
    writeEvents('x');
  });
  assert.deepEqual(readPets(), []);
  assert.deepEqual(readEvents(), []);
});

/* ------------------------------ 物种化：8 kind + hiddenTypes + customTypes ------------------------------ */

test('readPets: 8 物种 kind 均被保留，非法 kind 兜底 other', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify(SPECIES_KINDS.map((k, i) => ({ id: `p${i}`, name: k, kind: k, createdAt: i }))),
  });
  assert.deepEqual(readPets().map((p) => p.kind), SPECIES_KINDS);
  // 老 kind dog/cat/other 原样保留
  installDomEnv({
    [KEYS.pets]: JSON.stringify([
      { id: 'a', name: 'a', kind: 'dog' },
      { id: 'b', name: 'b', kind: 'cat' },
      { id: 'c', name: 'c', kind: 'other' },
    ]),
  });
  assert.deepEqual(readPets().map((p) => p.kind), ['dog', 'cat', 'other']);
});

test('readPets: hiddenTypes 去重并丢弃非字符串；非法值兜底为 []', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([{ id: 'p1', name: 'x', kind: 'dog', hiddenTypes: ['bath', 'bath', 1, null, 'walk', ''] }]),
  });
  assert.deepEqual(readPets()[0].hiddenTypes, ['bath', 'walk']);
  installDomEnv({ [KEYS.pets]: JSON.stringify([{ id: 'p1', name: 'x', hiddenTypes: 'oops' }]) });
  assert.deepEqual(readPets()[0].hiddenTypes, []);
});

test('readPets: customTypes 清洗（id 冲突重生成 / 颜色白名单 / fields 交集 / order 兜底）', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([
      {
        id: 'p1',
        name: 'x',
        kind: 'other',
        customTypes: [
          { id: 'walk', label: ' 散步 ', emoji: '🚶', color: 'bg-rainbow-999', unit: 5, fields: ['durationMin', 'bogus'], order: 1 },
          'not-an-object',
          { label: '', color: 'bg-emerald-100 text-emerald-700', fields: [] },
        ],
      },
    ]),
  });
  const pet = readPets()[0];
  assert.equal(pet.customTypes.length, 2, '非对象项应被丢弃');
  const first = pet.customTypes[0];
  assert.notEqual(first.id, 'walk', 'id 与基础 type 冲突时须重新生成');
  assert.ok(first.id.startsWith('custom_'));
  assert.equal(first.label, '散步');
  assert.equal(first.color, 'bg-stone-100 text-stone-700', '非法颜色回落第 0 项');
  assert.deepEqual(first.fields, ['durationMin']);
  assert.equal(first.unit, '');
  const second = pet.customTypes[1];
  assert.equal(second.label, '自定义');
  assert.equal(second.emoji, '⭐');
  assert.deepEqual(second.fields, ['note'], '空字段集回填 note');
});

/* ------------------------------ 事件可选字段（startTs / endTs / label） ------------------------------ */

test('sanitizeEvent: 老事件无 startTs/endTs/label → 兜底 null/null/空串', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([{ id: 'e', petId: 'p', type: 'walk', ts: 1700000000000, durationMin: 30 }]),
  });
  const e = readEvents()[0];
  assert.equal(e.startTs, null);
  assert.equal(e.endTs, null);
  assert.equal(e.label, '');
});

test('sanitizeEvent: 保留计时事件的 startTs/endTs/label 与小数时长', () => {
  const pet = addPet({ name: 'x', emoji: '🐕', kind: 'dog' });
  const e = addEvent({
    petId: pet.id,
    type: 'walk',
    ts: 1700000000000,
    startTs: 1700000000000,
    endTs: 1700003000000,
    durationMin: 12.5,
    label: '自定义名',
  });
  assert.equal(e.startTs, 1700000000000);
  assert.equal(e.endTs, 1700003000000);
  assert.equal(e.durationMin, 12.5);
  assert.equal(e.label, '自定义名');
  assert.equal(readEvents()[0].durationMin, 12.5);
});

/* ------------------------------ 计时会话（activeTimer） ------------------------------ */

test('startTimer / readActiveTimer / clearTimer：读写闭环 + 全局单会话覆盖', () => {
  assert.equal(readActiveTimer(), null, '初始无会话');
  startTimer('p1', 'walk', 1000);
  assert.deepEqual(readActiveTimer(), { petId: 'p1', type: 'walk', startTs: 1000 });
  // 全局单会话：再次开始直接覆盖
  startTimer('p2', 'flight', 2000);
  assert.deepEqual(readActiveTimer(), { petId: 'p2', type: 'flight', startTs: 2000 });
  assert.equal(clearTimer(), true);
  assert.equal(readActiveTimer(), null);
});

test('readActiveTimer: 脏数据 / 缺字段 → null，不抛异常', () => {
  [
    '{不是JSON',
    'null',
    '"str"',
    '42',
    JSON.stringify({ petId: 'p' }),
    JSON.stringify({ type: 'walk', startTs: 1 }),
    JSON.stringify({ petId: 'p', type: 'walk', startTs: 'x' }),
  ].forEach((raw) => {
    installDomEnv({ [KEYS.activeTimer]: raw });
    assert.equal(readActiveTimer(), null, `输入 ${raw} 应返回 null`);
  });
});

test('writeActiveTimer(null) 可清除会话；写入非法会话等同清空', () => {
  startTimer('p1', 'walk', 1);
  writeActiveTimer(null);
  assert.equal(readActiveTimer(), null);
  startTimer('p1', 'walk', 1);
  writeActiveTimer({ petId: '', type: 'walk', startTs: 1 });
  assert.equal(readActiveTimer(), null, '非法会话写入后应为 null');
});

test('exportData 携带 activeTimer', async () => {
  startTimer('p1', 'walk', 1234);
  const data = await exportData();
  assert.deepEqual(data.activeTimer, { petId: 'p1', type: 'walk', startTs: 1234 });
});

test('importData overwrite: 恢复备份里的 activeTimer；缺失则置 null', async () => {
  const snap = makeSnapshot({ activeTimer: { petId: 'p1', type: 'walk', startTs: 555 } });
  await importData(JSON.stringify(snap), 'overwrite');
  assert.deepEqual(readActiveTimer(), { petId: 'p1', type: 'walk', startTs: 555 });

  startTimer('local', 'flight', 9);
  const snap2 = makeSnapshot();
  delete snap2.activeTimer;
  await importData(JSON.stringify(snap2), 'overwrite');
  assert.equal(readActiveTimer(), null, '老备份无 activeTimer → 覆盖后为 null');
});

test('importData merge: 不改动本地 activeTimer', async () => {
  startTimer('local', 'walk', 777);
  await importData(
    JSON.stringify(makeSnapshot({ activeTimer: { petId: 'p1', type: 'flight', startTs: 1 } })),
    'merge'
  );
  assert.deepEqual(readActiveTimer(), { petId: 'local', type: 'walk', startTs: 777 });
});

test('clearAll: 也会清除 activeTimer', async () => {
  startTimer('p1', 'walk', 1);
  await clearAll();
  assert.equal(readActiveTimer(), null);
  assert.equal(globalThis.window.localStorage.getItem(KEYS.activeTimer), null);
});

test('estimateStorageBytes: 覆盖 activeTimer key', () => {
  startTimer('p1', 'walk', 1);
  const withTimer = estimateStorageBytes();
  clearTimer();
  const without = estimateStorageBytes();
  assert.ok(withTimer > without, `写入会话后占用应增大（${withTimer} vs ${without}）`);
});
