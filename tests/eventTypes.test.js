/**
 * src/lib/eventTypes.js 测试
 * 重点：未知类型兜底、摘要生成
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_TYPES,
  CUSTOM_COLOR_OPTIONS,
  EVENT_TYPES,
  POOP_COLORS,
  POOP_FORMS,
  SPECIES,
  SPECIES_KINDS,
  TIMER_TYPES,
  describeEvent,
  getEventType,
  getPresetEventTypes,
  getSpecies,
  getStatsMetrics,
  getVisibleEventTypes,
  hasField,
  isTimerType,
  resolveEventDisplay,
  resolveEventMeta,
  speciesEmoji,
} from '../src/lib/eventTypes.js';

const LEGACY = ['walk', 'meal', 'treat', 'water', 'poop', 'pee', 'play', 'cuddle', 'bath', 'med', 'weight', 'other'];

test('EVENT_TYPES: 含全部 legacy 12 个 type 且 type 唯一', () => {
  const types = EVENT_TYPES.map((t) => t.type);
  assert.equal(new Set(types).size, types.length, 'type 不允许重复');
  LEGACY.forEach((t) => assert.ok(types.includes(t), `基础池应保留 legacy type：${t}`));
  // EVENT_TYPES 为 BASE_TYPES 的向后兼容别名
  assert.equal(EVENT_TYPES, BASE_TYPES);
});

test('EVENT_TYPES: 每项都有 label / emoji / color / fields', () => {
  EVENT_TYPES.forEach((t) => {
    assert.ok(t.label, `${t.type} 缺 label`);
    assert.ok(t.emoji, `${t.type} 缺 emoji`);
    assert.equal(typeof t.color, 'string');
    assert.ok(t.color.length > 0, `${t.type} 缺 color`);
    assert.ok(Array.isArray(t.fields), `${t.type} fields 必须是数组`);
  });
});

test('getEventType: 未知类型 / 空值兜底为 other，不返回 undefined', () => {
  ['外星事件', '', null, undefined, 0, {}].forEach((v) => {
    const meta = getEventType(v);
    assert.ok(meta, `getEventType(${String(v)}) 不应返回空`);
    assert.equal(meta.type, 'other');
  });
});

test('getEventType: 已知类型返回基础池定义（与物种无关的默认值）', () => {
  assert.equal(getEventType('walk').label, '外出');
  assert.equal(getEventType('weight').unit, 'kg');
  assert.equal(getEventType('meal').unit, 'g');
});

test('hasField: 正确判断是否包含字段', () => {
  assert.equal(hasField('walk', 'durationMin'), true);
  assert.equal(hasField('walk', 'amount'), false);
  assert.equal(hasField('poop', 'poopForm'), true);
  assert.equal(hasField('poop', 'poopColor'), true);
  // 未知类型兜底为 other（fields: ['note']）
  assert.equal(hasField('外星事件', 'note'), true);
  assert.equal(hasField('外星事件', 'amount'), false);
});

test('describeEvent: 空输入返回空串', () => {
  assert.equal(describeEvent(null), '');
  assert.equal(describeEvent(undefined), '');
});

test('describeEvent: 遛狗显示时长', () => {
  assert.equal(describeEvent({ type: 'walk', durationMin: 30 }), '30 分钟');
});

test('describeEvent: 吃饭显示数量带单位', () => {
  assert.equal(describeEvent({ type: 'meal', amount: 100, unit: 'g' }), '100g');
  assert.equal(describeEvent({ type: 'weight', amount: 12.5, unit: 'kg' }), '12.5kg');
});

test('describeEvent: 拉屎显示性状 · 颜色', () => {
  assert.equal(describeEvent({ type: 'poop', poopForm: '偏软', poopColor: '深棕' }), '偏软 · 深棕');
});

test('describeEvent: 多字段按 时长 → 数量 → 性状 → 颜色 → 备注 顺序拼接', () => {
  const s = describeEvent({
    durationMin: 30,
    amount: 200,
    unit: 'g',
    poopForm: '正常',
    poopColor: '棕',
    note: '精神很好',
  });
  assert.equal(s, '30 分钟 · 200g · 正常 · 棕 · 精神很好');
});

test('describeEvent: 空值字段被忽略（undefined / null / 空串 / 0 处理）', () => {
  assert.equal(describeEvent({ type: 'water', amount: null, note: '' }), '');
  assert.equal(describeEvent({ type: 'water' }), '');
});

test('POOP_FORMS / POOP_COLORS 为非空字符串数组', () => {
  assert.ok(POOP_FORMS.length > 0);
  assert.ok(POOP_COLORS.length > 0);
  [...POOP_FORMS, ...POOP_COLORS].forEach((v) => assert.equal(typeof v, 'string'));
});

/* ------------------------------ 物种层 ------------------------------ */

test('SPECIES: 8 个物种且 kind 唯一', () => {
  assert.equal(SPECIES.length, 8);
  assert.equal(new Set(SPECIES_KINDS).size, 8);
  assert.deepEqual(SPECIES_KINDS, ['dog', 'cat', 'rabbit', 'bird', 'fish', 'rodent', 'reptile', 'other']);
});

test('getSpecies / speciesEmoji: 已知返回自身，未知兜底 other（🐾）', () => {
  assert.equal(getSpecies('cat').label, '猫');
  assert.equal(getSpecies('fish').emoji, '🐠');
  assert.equal(getSpecies('other').emoji, '🐾');
  assert.equal(getSpecies('dragon').kind, 'other');
  assert.equal(getSpecies(undefined).kind, 'other');
  assert.equal(speciesEmoji('bird'), '🐦');
  assert.equal(speciesEmoji('不存在'), '🐾');
});

/* ------------------------------ 预设 / 解析 / 过滤 ------------------------------ */

test('getPresetEventTypes: 物种化 label/emoji 覆盖（同 type 不同词）', () => {
  const dogWalk = getPresetEventTypes('dog').find((m) => m.type === 'walk');
  const catWalk = getPresetEventTypes('cat').find((m) => m.type === 'walk');
  const rabbitWalk = getPresetEventTypes('rabbit').find((m) => m.type === 'walk');
  assert.equal(dogWalk.label, '遛狗');
  assert.equal(catWalk.label, '外出');
  assert.equal(catWalk.emoji, '🐈');
  assert.equal(rabbitWalk.label, '放风');
  // 鱼不含 walk
  assert.equal(getPresetEventTypes('fish').some((m) => m.type === 'walk'), false);
  // 每项都合并了 color / unit / fields（来自基础池）
  getPresetEventTypes('cat').forEach((m) => {
    assert.ok(m.color, `${m.type} 缺 color`);
    assert.ok(Array.isArray(m.fields), `${m.type} fields 必须是数组`);
  });
});

test('other 物种预设 = legacy 12 类，且 3 处用词微调（外出/便便/备注）', () => {
  const list = getPresetEventTypes('other');
  assert.equal(list.length, 12, 'other 通用池兜底必须保留 12 个按钮');
  const types = list.map((m) => m.type);
  LEGACY.forEach((t) => assert.ok(types.includes(t), `other 应含 ${t}`));
  assert.equal(list.find((m) => m.type === 'walk').label, '外出');
  assert.equal(list.find((m) => m.type === 'poop').label, '便便');
  assert.equal(list.find((m) => m.type === 'other').label, '备注');
});

test('resolveEventMeta: 预设覆盖 / 基础兜底 / 未知兜底三态', () => {
  const dog = { kind: 'dog' };
  assert.equal(resolveEventMeta('walk', dog).label, '遛狗');
  // 老 type nailTrim 不属于 dog 预设，仍有全局定义兜底
  assert.equal(resolveEventMeta('nailTrim', dog).label, '剪指甲');
  // 未知 type 兜底 other
  assert.equal(resolveEventMeta('外星事件', dog).type, 'other');
  // 自定义事件
  const pet = { kind: 'other', customTypes: [{ id: 'custom_x', label: '散步', emoji: '🚶', color: CUSTOM_COLOR_OPTIONS[1], unit: '', fields: ['note'], order: 1 }] };
  const meta = resolveEventMeta('custom_x', pet);
  assert.equal(meta.isCustom, true);
  assert.equal(meta.label, '散步');
  assert.equal(meta.group, 'custom');
});

test('resolveEventDisplay: 已删除自定义事件用 label 快照兜底显示原名', () => {
  const pet = { kind: 'other', customTypes: [] };
  const orphan = { type: 'custom_gone', label: '散步' };
  assert.equal(resolveEventDisplay(orphan, pet).label, '散步');
  // 无快照 → 兜底文案
  assert.equal(resolveEventDisplay({ type: 'custom_gone' }, pet).label, '已删除的自定义事件');
  // 物种化覆盖
  assert.equal(resolveEventDisplay({ type: 'walk' }, { kind: 'cat' }).label, '外出');
  // 未知类型 + 有快照 → 用快照
  assert.equal(resolveEventDisplay({ type: '外星', label: '神秘' }, pet).label, '神秘');
});

test('getVisibleEventTypes: 预设 − 隐藏 + 自定义（追加末尾）', () => {
  const pet = {
    kind: 'cat',
    hiddenTypes: ['bath'],
    customTypes: [{ id: 'custom_a', label: 'A', emoji: '⭐', color: CUSTOM_COLOR_OPTIONS[0], unit: '', fields: ['note'], order: 2 }],
  };
  const visible = getVisibleEventTypes(pet);
  const types = visible.map((t) => t.type);
  assert.ok(!types.includes('bath'), '隐藏项应从可见集移除');
  assert.equal(types[types.length - 1], 'custom_a', '自定义事件应追加在末尾');
  assert.equal(visible.find((t) => t.type === 'walk').label, '外出');
  // 无宠物返回空
  assert.deepEqual(getVisibleEventTypes(null), []);
});

/* ------------------------------ 计时 ------------------------------ */

test('TIMER_TYPES / isTimerType: 仅 walk / flight', () => {
  assert.deepEqual(TIMER_TYPES, ['walk', 'flight']);
  assert.equal(isTimerType('walk'), true);
  assert.equal(isTimerType('flight'), true);
  assert.equal(isTimerType('play'), false);
  assert.equal(isTimerType('sunbask'), false);
});

/* ------------------------------ 统计 ------------------------------ */

test('getStatsMetrics: 按物种动态选指标（去狗本位）', () => {
  const dog = getStatsMetrics('dog');
  assert.deepEqual(dog.bars, ['walk', 'meal', 'poop']);
  assert.deepEqual(dog.durationTypes, ['walk']);
  assert.equal(dog.hasPoop, true);

  const bird = getStatsMetrics('bird');
  assert.deepEqual(bird.durationTypes, ['walk', 'flight']);

  const fish = getStatsMetrics('fish');
  assert.equal(fish.hasPoop, false);
  assert.ok(!fish.bars.includes('walk'), '鱼不应有外出指标');
  assert.ok(fish.bars.includes('waterChange') || fish.bars.includes('meal'));

  const reptile = getStatsMetrics('reptile');
  assert.deepEqual(reptile.durationTypes, [], '爬宠无 walk/flight → 无计时指标');
});

/* ------------------------------ 时长展示 ------------------------------ */

test('describeEvent: 时长段按 formatDuration 取整展示', () => {
  assert.equal(describeEvent({ type: 'walk', durationMin: 30 }), '30 分钟');
  assert.equal(describeEvent({ type: 'walk', durationMin: 90 }), '1 小时 30 分钟');
  assert.equal(describeEvent({ type: 'walk', durationMin: 0.4 }), '不到 1 分钟');
  assert.equal(describeEvent({ type: 'walk', durationMin: 12.5 }), '13 分钟');
});
