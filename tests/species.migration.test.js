/**
 * QA 独立验证（v1.1 物种化事件增量）
 * 主题二：老数据迁移 / 脏数据兜底 / 自定义事件生命周期 / 计时会话持久化。
 *
 * 主动构造 v1.0 形态的 localStorage（pet 无 hiddenTypes/customTypes、event 无 startTs/endTs/label、
 * 未知 type、非法 kind、老备份缺新字段），验证"绝不白屏、按钮不消失、历史不丢"。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { afterEach } from 'node:test';

import { installDomEnv, uninstallDomEnv } from './helpers/dom-env.js';
import { renderAppWith } from './helpers/render.js';
import {
  getEventType,
  getVisibleEventTypes,
  resolveEventDisplay,
  resolveEventMeta,
} from '../src/lib/eventTypes.js';
import {
  KEYS,
  addEvent,
  addPet,
  clearTimer,
  deletePet,
  exportData,
  importData,
  readActiveTimer,
  readEvents,
  readPets,
  startTimer,
  updatePet,
} from '../src/lib/storage.js';

const LEGACY12 = ['walk', 'meal', 'treat', 'water', 'poop', 'pee', 'play', 'cuddle', 'bath', 'med', 'weight', 'other'];

afterEach(() => {
  uninstallDomEnv();
});

/* ------------------------------ 1. v1.0 宠物对象迁移 ------------------------------ */

test('[迁移] v1.0 老宠物（无 hiddenTypes/customTypes）读取后自动补齐、kind 原样保留', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([
      { id: 'a', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 },
      { id: 'b', name: '咪咪', emoji: '🐱', kind: 'cat', createdAt: 2 },
      { id: 'c', name: '小宠', emoji: '🐾', kind: 'other', createdAt: 3 },
    ]),
  });
  const pets = readPets();
  assert.deepEqual(pets.map((p) => p.kind), ['dog', 'cat', 'other'], '老 kind 映射 dog/cat/other 原样保留');
  pets.forEach((p) => {
    assert.deepEqual(p.hiddenTypes, [], '缺失 hiddenTypes 应补 []');
    assert.deepEqual(p.customTypes, [], '缺失 customTypes 应补 []');
  });
});

test('[迁移] 决策 7A：老 kind:other 宠物升级后可见集仍为 legacy 12（按钮不消失）', () => {
  installDomEnv({ [KEYS.pets]: JSON.stringify([{ id: 'c', name: '小宠', kind: 'other', createdAt: 1 }]) });
  const pet = readPets()[0];
  const visible = getVisibleEventTypes(pet);
  assert.equal(visible.length, 12, 'other 老用户升级后按钮数必须仍为 12');
  assert.deepEqual([...visible.map((t) => t.type)].sort(), [...LEGACY12].sort());
});

test('[迁移] 老 kind:cat 宠物升级后可见集正确，且 walk 为「外出」、poop 为「便便」', () => {
  installDomEnv({ [KEYS.pets]: JSON.stringify([{ id: 'b', name: '咪咪', kind: 'cat', createdAt: 1 }]) });
  const pet = readPets()[0];
  const visible = getVisibleEventTypes(pet);
  assert.equal(visible.find((t) => t.type === 'walk').label, '外出');
  assert.equal(visible.find((t) => t.type === 'poop').label, '便便');
  assert.ok(visible.some((t) => t.type === 'play' && t.label === '逗猫棒'));
  // v1.2：cat 补齐护理项并新增备注（other），故此处断言其包含备注与清洁项
  assert.ok(visible.some((t) => t.type === 'clean' && t.label === '清理猫砂'), 'cat 应含「清理猫砂」');
  assert.ok(visible.some((t) => t.type === 'other'), 'v1.2：cat 预设已含备注（other）');
});

test('[迁移] 非法/缺失 kind 一律兜底 other（不抛异常）', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([
      { id: 'd', name: '龙', kind: 'dragon', createdAt: 1 },
      { id: 'e', name: '无名', createdAt: 2 },
    ]),
  });
  assert.deepEqual(readPets().map((p) => p.kind), ['other', 'other']);
});

/* ------------------------------ 2. v1.0 事件对象迁移 ------------------------------ */

test('[迁移] 老事件无 startTs/endTs/label → 读取后兜底 null/null/空串，不抛异常', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([
      { id: 'e1', petId: 'b', type: 'walk', ts: 1700000000000, durationMin: 30, unit: 'min' },
    ]),
  });
  const [e] = readEvents();
  assert.equal(e.startTs, null);
  assert.equal(e.endTs, null);
  assert.equal(e.label, '');
  assert.equal(e.durationMin, 30, '老时长字段保留');
});

test('[迁移] 老事件 type=walk 在 cat 宠物下渲染为「外出」（type 稳定 + 物种化覆盖）', () => {
  const evt = { type: 'walk', ts: 1700000000000 };
  assert.equal(resolveEventDisplay(evt, { kind: 'cat' }).label, '外出');
  assert.equal(resolveEventDisplay(evt, { kind: 'dog' }).label, '遛狗');
});

test('[迁移] 未知 type 事件三级兜底：有 label 快照用快照，无快照用占位文案', () => {
  assert.doesNotThrow(() => resolveEventDisplay({ type: 'xyz' }, { kind: 'dog' }));
  assert.equal(resolveEventDisplay({ type: 'xyz', label: '神秘旧事件' }, { kind: 'dog' }).label, '神秘旧事件');
  assert.equal(resolveEventDisplay({ type: 'xyz' }, { kind: 'dog' }).label, '已删除的自定义事件');
  // getEventType 对未知 type 永远兜底 other，保证 sanitize/describe 不炸
  assert.equal(getEventType('xyz').type, 'other');
});

test('[迁移] 脏事件（ts 非法）被丢弃，其余保留，读取不抛异常', () => {
  installDomEnv({
    [KEYS.events]: JSON.stringify([null, { ts: '坏' }, { ts: 1700000000000, type: 'xyz' }]),
  });
  assert.doesNotThrow(() => readEvents());
  assert.equal(readEvents().length, 1);
  assert.equal(readEvents()[0].type, 'xyz');
});

test('[迁移] 老备份（无 hiddenTypes/customTypes/activeTimer）导入不报错、不残留脏设置', async () => {
  installDomEnv({});
  const oldSnap = {
    app: 'petlog',
    version: 1,
    exportedAt: 1700000000000,
    pets: [{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }],
    events: [{ id: 'e1', petId: 'p1', type: 'walk', ts: 1700000000000, durationMin: 30 }],
    settings: { activePetId: 'p1', timelineOrder: 'desc' },
  };
  const r = await importData(JSON.stringify(oldSnap), 'overwrite');
  assert.equal(r.ok, true);
  assert.deepEqual(readActiveTimer(), null, '老备份无 activeTimer → 覆盖后置 null');
  assert.deepEqual(readPets()[0].hiddenTypes, []);
  assert.equal(readEvents()[0].startTs, null);
});

/* ------------------------------ 3. 自定义事件生命周期 ------------------------------ */

test('[自定义] 新建 → 可见（追加末尾） → 隐藏后从速记区移除', () => {
  installDomEnv({});
  const pet = addPet({ name: '小宠', emoji: '🐾', kind: 'other' });
  updatePet(pet.id, {
    customTypes: [
      { id: 'custom_walk2', label: '散步', emoji: '🚶', color: 'bg-lime-100 text-lime-700', unit: '', fields: ['note'], order: 1 },
    ],
  });
  let p = readPets()[0];
  let visible = getVisibleEventTypes(p);
  assert.equal(visible[visible.length - 1].type, 'custom_walk2', '自定义事件应追加末尾');
  assert.equal(resolveEventMeta('custom_walk2', p).label, '散步');
  assert.equal(resolveEventMeta('custom_walk2', p).isCustom, true);

  // 隐藏：加入 hiddenTypes
  updatePet(pet.id, { hiddenTypes: ['custom_walk2'] });
  p = readPets()[0];
  visible = getVisibleEventTypes(p);
  assert.ok(!visible.some((t) => t.type === 'custom_walk2'), '隐藏的自定义事件不应出现在速记区');
});

test('[自定义] 删除定义后，历史仍能用 label 快照取回原名（决策 6）', async () => {
  installDomEnv({});
  const pet = addPet({ name: '小宠', emoji: '🐾', kind: 'other' });
  updatePet(pet.id, {
    customTypes: [
      { id: 'custom_foo', label: '散步', emoji: '🚶', color: 'bg-lime-100 text-lime-700', unit: '', fields: ['note'], order: 1 },
    ],
  });
  // 记录一条自定义事件（写入 label 快照）
  const meta = resolveEventMeta('custom_foo', readPets()[0]);
  addEvent({ petId: pet.id, type: 'custom_foo', ts: 1700000000000, label: meta.label });

  // 删除自定义定义
  updatePet(pet.id, { customTypes: [] });
  const afterPet = readPets()[0];
  assert.equal(afterPet.customTypes.length, 0, '定义已删除');
  assert.ok(!getVisibleEventTypes(afterPet).some((t) => t.type === 'custom_foo'));

  // 历史仍在，且用快照兜底显示原名
  const hist = readEvents().find((e) => e.type === 'custom_foo');
  assert.ok(hist, '删除定义不应级联删除历史记录');
  assert.equal(resolveEventDisplay(hist, afterPet).label, '散步', '应显示删除前的原名字');
});

test('[自定义] customTypes 清洗：id 撞基础 type 会重生成、非法颜色回退白名单首项', () => {
  installDomEnv({
    [KEYS.pets]: JSON.stringify([
      {
        id: 'p1',
        name: 'x',
        kind: 'other',
        customTypes: [{ id: 'walk', label: '撞名', emoji: '⭐', color: 'bg-not-a-color', fields: ['note'] }],
      },
    ]),
  });
  const ct = readPets()[0].customTypes[0];
  assert.notEqual(ct.id, 'walk');
  assert.ok(ct.id.startsWith('custom_'));
  assert.equal(ct.color, 'bg-stone-100 text-stone-700');
});

/* ------------------------------ 4. 计时会话持久化 ------------------------------ */

test('[计时] startTimer 全局单会话：第二次开始直接覆盖第一次', () => {
  installDomEnv({});
  startTimer('p1', 'walk', 1000);
  startTimer('p2', 'flight', 2000);
  assert.deepEqual(readActiveTimer(), { petId: 'p2', type: 'flight', startTs: 2000 });
  clearTimer();
  assert.equal(readActiveTimer(), null);
});

test('[计时] 会话随导出携带；覆盖导入可恢复', async () => {
  installDomEnv({});
  startTimer('p1', 'walk', 555);
  const out = await exportData();
  assert.deepEqual(out.activeTimer, { petId: 'p1', type: 'walk', startTs: 555 });
  clearTimer();
  await importData(JSON.stringify(out), 'overwrite');
  assert.deepEqual(readActiveTimer(), { petId: 'p1', type: 'walk', startTs: 555 });
});

/* ------------------------------ 5. 隐藏 / 换物种语义 ------------------------------ */

test('[隐藏] 隐藏某类型后，历史记录仍照常显示（设计风险 7）', async () => {
  const now = Date.now();
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([
      { id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', hiddenTypes: ['walk'], customTypes: [], createdAt: 1 },
    ]),
    [KEYS.events]: JSON.stringify([
      { id: 'e1', petId: 'p1', type: 'walk', ts: now, durationMin: 30, note: '绕小区一圈' },
    ]),
    [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' }),
  });
  assert.ok(html.includes('绕小区一圈'), '隐藏类型的历史记录不应消失');
  assert.ok(html.includes('遛狗'), '时间轴仍应按物种显示隐藏类型的历史 label');
});

test('[换物种] 保留自定义事件与历史，仅重置隐藏集（决策 11）', async () => {
  installDomEnv({});
  const pet = addPet({ name: '小宠', emoji: '🐾', kind: 'other' });
  updatePet(pet.id, {
    hiddenTypes: ['bath'],
    customTypes: [
      { id: 'custom_keep', label: '散步', emoji: '🚶', color: 'bg-lime-100 text-lime-700', unit: '', fields: ['note'], order: 1 },
    ],
  });
  addEvent({ petId: pet.id, type: 'walk', ts: 1700000000000 });

  // 模拟换物种（与 SettingsView.changeKind 一致：{ kind, hiddenTypes: [] }）
  updatePet(pet.id, { kind: 'cat', hiddenTypes: [] });
  const after = readPets()[0];
  assert.equal(after.kind, 'cat');
  assert.deepEqual(after.hiddenTypes, [], '换物种应重置隐藏集');
  assert.equal(after.customTypes.length, 1, '换物种应保留自定义事件');
  assert.equal(after.customTypes[0].label, '散步');
  assert.equal(readEvents().length, 1, '换物种应保留历史记录');
  assert.ok(getVisibleEventTypes(after).some((t) => t.type === 'custom_keep'), '自定义事件在换物种后仍可见');
});

test('[计时] 会话指向已删宠物：存储层保留原值，App 渲染层隐藏横幅（不白屏）', async () => {
  // 存储层不负责跨表清理（由 App 负责），这里验证两层各自的契约
  installDomEnv({});
  const pet = addPet({ name: '旺财', emoji: '🐕', kind: 'dog' });
  startTimer(pet.id, 'walk', 1000);
  await deletePet(pet.id);
  assert.deepEqual(readActiveTimer(), { petId: pet.id, type: 'walk', startTs: 1000 }, '存储层保留会话原值');

  // 渲染层：petId 指向已不存在宠物 → 不渲染计时横幅
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'p1', name: '旺财', emoji: '🐕', kind: 'dog', createdAt: 1 }]),
    [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' }),
    [KEYS.activeTimer]: JSON.stringify({ petId: 'ghost', type: 'walk', startTs: 1000 }),
  });
  assert.ok(html.includes('GoGoDiary'), '页面应正常渲染');
  assert.ok(!html.includes('进行中'), '失效会话不应出现计时横幅');
});
