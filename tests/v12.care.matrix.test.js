/**
 * QA 独立验证（v1.2 增量）—— 物种 × 清洁/护理事件矩阵 + 前 8/更多切分 + label 覆盖
 *
 * 真值来源：主理人本轮下发的「目标 Top-8 顺序」清单（前 8 常显，`|` 之后进「更多」）。
 * 本文件不复制工程师既有断言，而是把该清单直接编码为期望值逐物种比对；
 * 并独立核对 6 个新护理类型的 label/emoji/color，以及 clean / nailTrim 的物种级覆盖。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  POOP_COLORS,
  POOP_FORMS,
  SPECIES_KINDS,
  describeEvent,
  getEventType,
  getVisibleEventTypes,
  hasField,
  resolveEventDisplay,
  resolveEventMeta,
} from '../src/lib/eventTypes.js';

/** 产品目标：每物种「前 8 常显 | 其余进更多」 */
const TARGET = {
  dog: {
    top8: ['walk', 'meal', 'water', 'poop', 'pee', 'treat', 'play', 'cuddle'],
    more: ['bath', 'med', 'weight', 'brushTeeth', 'cleanEars', 'deworm', 'brushCoat', 'nailTrim', 'other'],
  },
  cat: {
    top8: ['walk', 'meal', 'water', 'poop', 'pee', 'treat', 'play', 'cuddle'],
    more: ['bath', 'med', 'weight', 'nailTrim', 'brushTeeth', 'cleanEars', 'deworm', 'brushCoat', 'clean', 'other'],
  },
  rabbit: {
    top8: ['meal', 'water', 'poop', 'pee', 'walk', 'cuddle', 'brushCoat', 'nailTrim'],
    more: ['med', 'weight', 'clean', 'other'],
  },
  bird: {
    top8: ['meal', 'water', 'poop', 'walk', 'flight', 'bath', 'cuddle', 'nailTrim'],
    more: ['med', 'weight', 'clean', 'other'],
  },
  fish: {
    top8: ['meal', 'waterChange', 'clean', 'testWater', 'topWater', 'filterClean', 'observe', 'med'],
    more: [],
  },
  rodent: {
    top8: ['meal', 'water', 'clean', 'walk', 'bath', 'cuddle', 'poop', 'weight'],
    more: ['med', 'other'],
  },
  reptile: {
    top8: ['meal', 'soakMist', 'sunbask', 'cuddle', 'clean', 'shed', 'weight', 'poop'],
    more: ['med', 'shellBrush', 'other'],
  },
  other: {
    top8: ['walk', 'meal', 'treat', 'water', 'poop', 'pee', 'play', 'cuddle'],
    more: ['bath', 'med', 'weight', 'other'],
  },
};

const LEGACY12 = ['walk', 'meal', 'treat', 'water', 'poop', 'pee', 'play', 'cuddle', 'bath', 'med', 'weight', 'other'];
const NEW_CARE = ['brushTeeth', 'cleanEars', 'deworm', 'brushCoat', 'filterClean', 'shellBrush'];

/* ------------------------- 1. 全量顺序 = 目标 top8 + more ------------------------- */

test('[矩阵] 8 物种可见集合/顺序精确等于「目标 Top-8 + 更多」拼接', () => {
  for (const kind of SPECIES_KINDS) {
    const actual = getVisibleEventTypes({ kind }).map((t) => t.type);
    const expected = [...TARGET[kind].top8, ...TARGET[kind].more];
    assert.deepEqual(actual, expected, `物种 ${kind} 顺序与产品目标不符`);
  }
});

test('[矩阵] 前 8 项切分即 top8；若 N>8 则存在非空「更多」', () => {
  for (const kind of SPECIES_KINDS) {
    const actual = getVisibleEventTypes({ kind }).map((t) => t.type);
    assert.deepEqual(actual.slice(0, 8), TARGET[kind].top8, `${kind} 前 8 应为常显`);
    if (actual.length > 8) {
      assert.deepEqual(actual.slice(8), TARGET[kind].more, `${kind} 第 9 项起应为收纳项`);
      assert.ok(TARGET[kind].more.length > 0, `${kind} N>8 时「更多」不应为空`);
    } else {
      assert.equal(TARGET[kind].more.length, 0, `${kind} N<=8 时不应有「更多」`);
    }
  }
});

/* ------------------------- 2. 新增护理项的物种归属 ------------------------- */

test('[护理] dog/cat 含 brushTeeth/cleanEars/deworm/brushCoat', () => {
  for (const kind of ['dog', 'cat']) {
    const types = getVisibleEventTypes({ kind }).map((t) => t.type);
    for (const t of ['brushTeeth', 'cleanEars', 'deworm', 'brushCoat']) {
      assert.ok(types.includes(t), `${kind} 应含护理项 ${t}`);
    }
  }
});

test('[护理] rabbit 含 brushCoat + 清洁笼舍；不含刷牙/洗耳朵/驱虫', () => {
  const types = getVisibleEventTypes({ kind: 'rabbit' }).map((t) => t.type);
  assert.ok(types.includes('brushCoat'), 'rabbit 应含 brushCoat 梳毛');
  assert.ok(types.includes('clean'), 'rabbit 应含 clean 清洁笼舍');
  for (const t of ['brushTeeth', 'cleanEars', 'deworm']) {
    assert.ok(!types.includes(t), `rabbit 不应含 ${t}`);
  }
});

test('[护理] bird 含 清洁笼舍 + 修剪爪喙；不含刷牙/洗耳朵/驱虫/梳毛', () => {
  const types = getVisibleEventTypes({ kind: 'bird' }).map((t) => t.type);
  assert.ok(types.includes('clean'), 'bird 应含 clean（清洁笼舍）');
  assert.ok(types.includes('nailTrim'), 'bird 应含 nailTrim（修剪爪喙）');
  for (const t of ['brushTeeth', 'cleanEars', 'deworm', 'brushCoat']) {
    assert.ok(!types.includes(t), `bird 不应含 ${t}`);
  }
});

test('[护理] fish 含 filterClean；reptile 含 shellBrush', () => {
  const fish = getVisibleEventTypes({ kind: 'fish' }).map((t) => t.type);
  const reptile = getVisibleEventTypes({ kind: 'reptile' }).map((t) => t.type);
  assert.ok(fish.includes('filterClean'), 'fish 应含 filterClean');
  assert.ok(reptile.includes('shellBrush'), 'reptile 应含 shellBrush');
});

test('[护理] rodent / other 未引入任何新护理类型', () => {
  for (const kind of ['rodent', 'other']) {
    const types = getVisibleEventTypes({ kind }).map((t) => t.type);
    for (const t of NEW_CARE) {
      assert.ok(!types.includes(t), `${kind} 不应含新护理项 ${t}`);
    }
  }
});

test('[护理] other 冻结为 legacy 12（数量与集合一致，老用户按钮不消失）', () => {
  const other = getVisibleEventTypes({ kind: 'other' }).map((t) => t.type);
  assert.equal(other.length, 12, 'other 必须保留 12 个');
  assert.deepEqual([...other].sort(), [...LEGACY12].sort(), 'other 集合应等于 legacy 12');
});

test('[护理] rodent 可见集合与其历史集合一致（未新增）', () => {
  const rodent = getVisibleEventTypes({ kind: 'rodent' }).map((t) => t.type);
  const historical = ['meal', 'water', 'clean', 'walk', 'bath', 'cuddle', 'poop', 'weight', 'med', 'other'];
  assert.deepEqual(rodent, historical, 'rodent 不应因本增量新增任何项');
});

/* ------------------------- 3. 新护理类型基础定义 ------------------------- */

test('[护理] 6 个新护理类型 label/emoji/unit/fields/color 与源码一致', () => {
  const expect = {
    brushTeeth: { label: '刷牙', emoji: '🪥', color: 'bg-fuchsia-100 text-fuchsia-700' },
    cleanEars: { label: '洗耳朵', emoji: '👂', color: 'bg-purple-100 text-purple-700' },
    deworm: { label: '驱虫', emoji: '🪱', color: 'bg-green-100 text-green-700' },
    brushCoat: { label: '梳毛', emoji: '🪮', color: 'bg-red-100 text-red-700' },
    filterClean: { label: '清洗滤材', emoji: '🧽', color: 'bg-gray-100 text-gray-700' },
    shellBrush: { label: '刷龟甲', emoji: '🐢', color: 'bg-zinc-100 text-zinc-700' },
  };
  for (const [type, e] of Object.entries(expect)) {
    const meta = getEventType(type);
    assert.equal(meta.type, type, `${type} 应存在于基础池`);
    assert.equal(meta.label, e.label, `${type} label`);
    assert.equal(meta.emoji, e.emoji, `${type} emoji`);
    assert.equal(meta.color, e.color, `${type} color 应为完整 Tailwind 类字符串`);
    assert.equal(meta.unit, '', `${type} unit 应为空`);
    assert.deepEqual(meta.fields, [], `${type} fields 应为空数组`);
  }
  // color 必须是「背景 + 文字」两段，禁止拼接残留（如缺少 text-* 或含 + ）
  for (const type of NEW_CARE) {
    const c = getEventType(type).color;
    assert.ok(/^bg-\S+ text-\S+$/.test(c), `${type} color 应为完整两段类名：${c}`);
  }
});

/* ------------------------- 4. label 覆盖（clean / nailTrim） ------------------------- */

test('[覆盖] clean 逐物种：猫清理猫砂 / 兔·鸟清洁笼舍 / 鼠换垫料 / 爬宠清理饲养箱 / 鱼清缸', () => {
  const cases = [
    ['cat', '清理猫砂'],
    ['rabbit', '清洁笼舍'],
    ['bird', '清洁笼舍'],
    ['rodent', '换垫料'],
    ['reptile', '清理饲养箱'],
    ['fish', '清缸'],
  ];
  for (const [kind, label] of cases) {
    const pet = { kind };
    assert.equal(resolveEventMeta('clean', pet).label, label, `${kind}.clean (resolveEventMeta)`);
    assert.equal(resolveEventDisplay({ type: 'clean' }, pet).label, label, `${kind}.clean (resolveEventDisplay)`);
  }
});

test('[覆盖] nailTrim 逐物种：鸟修剪爪喙 / 狗·猫·兔剪指甲', () => {
  const cases = [
    ['bird', '修剪爪喙'],
    ['dog', '剪指甲'],
    ['cat', '剪指甲'],
    ['rabbit', '剪指甲'],
  ];
  for (const [kind, label] of cases) {
    const pet = { kind };
    assert.equal(resolveEventMeta('nailTrim', pet).label, label, `${kind}.nailTrim (resolveEventMeta)`);
    assert.equal(resolveEventDisplay({ type: 'nailTrim' }, pet).label, label, `${kind}.nailTrim (resolveEventDisplay)`);
  }
});

test('[覆盖] 新护理项在无覆盖物种下退回基础 label（如 deworm 在 bird 下仍为「驱虫」）', () => {
  // bird 预设未含 deworm，但若被自定义/历史引用，resolveEventMeta 应回退到基础池 label
  const meta = resolveEventMeta('deworm', { kind: 'bird' });
  assert.equal(meta.label, '驱虫');
  assert.equal(meta.emoji, '🪱');
});

/* ------------------------- 5. 旧契约不变（v1.0 依赖） ------------------------- */

test('[旧契约] getEventType/hasField/describeEvent/POOP_* 行为未变', () => {
  assert.equal(getEventType('walk').label, '外出');
  assert.equal(getEventType('walk').unit, 'min');
  assert.equal(getEventType('unknown-xyz').type, 'other');
  assert.equal(hasField('poop', 'poopForm'), true);
  assert.equal(hasField('water', 'amount'), false);
  assert.equal(describeEvent({ type: 'walk', durationMin: 30 }), '30 分钟');
  assert.equal(describeEvent({ type: 'meal', amount: 100, unit: 'g' }), '100g');
  assert.equal(describeEvent({ type: 'poop', poopForm: '偏软', poopColor: '深棕' }), '偏软 · 深棕');
  assert.equal(describeEvent(null), '');
  assert.deepEqual(POOP_FORMS, ['正常', '偏软', '腹泻', '便秘', '带血']);
  assert.deepEqual(POOP_COLORS, ['棕', '深棕', '黄', '黑', '绿', '带血']);
});
