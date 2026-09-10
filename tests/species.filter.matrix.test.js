/**
 * QA 独立验证（v1.1 物种化事件增量）
 * 主题一：物种过滤矩阵 / label·emoji 覆盖 / 计时判定 / 统计指标 / 旧契约不变。
 *
 * 口径来源：docs/DESIGN-species-events.md §3.3 SPECIES_PRESETS 矩阵 + 主理人 10 条决策。
 * 本文件不复述工程师既有断言，而是以"设计矩阵"为唯一真值独立核对。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_TYPES,
  EVENT_TYPES,
  POOP_COLORS,
  POOP_FORMS,
  SPECIES_KINDS,
  TIMER_TYPES,
  describeEvent,
  getEventType,
  getStatsMetrics,
  getVisibleEventTypes,
  hasField,
  isTimerType,
  resolveEventDisplay,
  resolveEventMeta,
  speciesEmoji,
} from '../src/lib/eventTypes.js';

/** 8 物种权威可见集合（v1.2 清洁/护理补齐后的顺序，顺序即声明顺序） */
const EXPECTED_VISIBLE = {
  dog: [
    'walk', 'meal', 'water', 'poop', 'pee', 'treat', 'play', 'cuddle',
    'bath', 'med', 'weight', 'brushTeeth', 'cleanEars', 'deworm', 'brushCoat', 'nailTrim', 'other',
  ],
  cat: [
    'walk', 'meal', 'water', 'poop', 'pee', 'treat', 'play', 'cuddle',
    'bath', 'med', 'weight', 'nailTrim', 'brushTeeth', 'cleanEars', 'deworm', 'brushCoat', 'clean', 'other',
  ],
  rabbit: ['meal', 'water', 'poop', 'pee', 'walk', 'cuddle', 'brushCoat', 'nailTrim', 'med', 'weight', 'clean', 'other'],
  bird: ['meal', 'water', 'poop', 'walk', 'flight', 'bath', 'cuddle', 'nailTrim', 'med', 'weight', 'clean', 'other'],
  fish: ['meal', 'waterChange', 'clean', 'testWater', 'topWater', 'filterClean', 'observe', 'med'],
  rodent: ['meal', 'water', 'clean', 'walk', 'bath', 'cuddle', 'poop', 'weight', 'med', 'other'],
  reptile: ['meal', 'soakMist', 'sunbask', 'cuddle', 'clean', 'shed', 'weight', 'poop', 'med', 'shellBrush', 'other'],
  other: ['walk', 'meal', 'treat', 'water', 'poop', 'pee', 'play', 'cuddle', 'bath', 'med', 'weight', 'other'],
};

const LEGACY12 = ['walk', 'meal', 'treat', 'water', 'poop', 'pee', 'play', 'cuddle', 'bath', 'med', 'weight', 'other'];

/* ------------------------------ 1. 物种过滤矩阵 ------------------------------ */

test('[矩阵] 8 物种可见集合与顺序完全等于设计矩阵', () => {
  for (const kind of SPECIES_KINDS) {
    const actual = getVisibleEventTypes({ kind }).map((t) => t.type);
    assert.deepEqual(actual, EXPECTED_VISIBLE[kind], `物种 ${kind} 的可见集合/顺序与设计不符`);
  }
});

test('[矩阵] 关键负例：fish 不含 walk / cuddle / weight / poop / pee', () => {
  const fish = getVisibleEventTypes({ kind: 'fish' }).map((t) => t.type);
  ['walk', 'cuddle', 'weight', 'poop', 'pee'].forEach((t) => {
    assert.ok(!fish.includes(t), `fish 不应出现 ${t}`);
  });
});

test('[矩阵] 关键负例：reptile 不含 walk', () => {
  const reptile = getVisibleEventTypes({ kind: 'reptile' }).map((t) => t.type);
  assert.ok(!reptile.includes('walk'), '爬宠不应出现 walk（无外出/放风）');
  assert.ok(reptile.includes('sunbask') && reptile.includes('soakMist') && reptile.includes('shed'), '爬宠应含晒灯/泡水/蜕皮');
});

test('[矩阵] 决策 7A：other 物种 = 完整 legacy 12 项（集合与数量一致）', () => {
  const other = getVisibleEventTypes({ kind: 'other' }).map((t) => t.type);
  assert.equal(other.length, 12, 'other 必须保留 12 个按钮，老用户按钮不消失');
  assert.deepEqual([...other].sort(), [...LEGACY12].sort(), 'other 集合应等于 legacy 12');
});

test('[矩阵] dog 含 walk(遛狗)/poop(拉屎)，cat 含 walk 但 label 为「外出」/poop「便便」', () => {
  const dog = getVisibleEventTypes({ kind: 'dog' });
  const cat = getVisibleEventTypes({ kind: 'cat' });
  assert.equal(dog.find((t) => t.type === 'walk').label, '遛狗');
  assert.equal(dog.find((t) => t.type === 'poop').label, '拉屎');
  assert.equal(cat.find((t) => t.type === 'walk').label, '外出');
  assert.equal(cat.find((t) => t.type === 'poop').label, '便便');
  // cat 有 walk，dog 无 nailTrim
  assert.ok(cat.some((t) => t.type === 'walk'));
  // v1.2：清洁/护理补齐后 dog 也含 nailTrim（剪指甲）
  assert.ok(dog.some((t) => t.type === 'nailTrim'), 'dog 应含剪指甲（v1.2 新增）');
});

test('[矩阵] v1.2 清洁/护理补齐全物种可见：数量与集合断言', () => {
  const count = (kind) => getVisibleEventTypes({ kind }).length;
  // dog 12→17、cat 12→18、rabbit 10→12、bird 10→12、fish 7→8、rodent 不变 10、reptile 10→11、other 不变 12
  assert.equal(count('dog'), 17);
  assert.equal(count('cat'), 18);
  assert.equal(count('rabbit'), 12);
  assert.equal(count('bird'), 12);
  assert.equal(count('fish'), 8);
  assert.equal(count('rodent'), 10);
  assert.equal(count('reptile'), 11);
  assert.equal(count('other'), 12);
  // 各物种新护理项落位
  assert.ok(getVisibleEventTypes({ kind: 'dog' }).some((t) => t.type === 'brushTeeth'));
  assert.ok(getVisibleEventTypes({ kind: 'cat' }).some((t) => t.type === 'clean' && t.label === '清理猫砂'));
  assert.ok(getVisibleEventTypes({ kind: 'rabbit' }).some((t) => t.type === 'brushCoat'));
  assert.ok(getVisibleEventTypes({ kind: 'bird' }).some((t) => t.type === 'nailTrim' && t.label === '修剪爪喙'));
  assert.ok(getVisibleEventTypes({ kind: 'fish' }).some((t) => t.type === 'filterClean'));
  assert.ok(getVisibleEventTypes({ kind: 'reptile' }).some((t) => t.type === 'shellBrush'));
  // other 不加护理项（legacy 12 冻结）
  ['brushTeeth', 'cleanEars', 'deworm', 'brushCoat', 'filterClean', 'shellBrush'].forEach((t) => {
    assert.ok(!getVisibleEventTypes({ kind: 'other' }).some((x) => x.type === t), `other 不应含 ${t}`);
  });
});

/* ------------------------------ 2. label / emoji 覆盖 ------------------------------ */

test('[覆盖] walk 按物种差异化命名：狗遛狗 / 猫外出 / 兔·鼠放风 / 鸟遛鸟', () => {
  const label = (kind) => resolveEventMeta('walk', { kind }).label;
  assert.equal(label('dog'), '遛狗');
  assert.equal(label('cat'), '外出');
  assert.equal(label('rabbit'), '放风');
  assert.equal(label('rodent'), '放风');
  assert.equal(label('bird'), '遛鸟');
  assert.equal(label('other'), '外出'); // 决策 7A 用词微调
  // 物种 emoji 覆盖（与宠物头像两层区分）
  assert.equal(resolveEventMeta('walk', { kind: 'cat' }).emoji, '🐈');
  assert.equal(resolveEventMeta('walk', { kind: 'rabbit' }).emoji, '🐇');
  assert.equal(resolveEventMeta('walk', { kind: 'rodent' }).emoji, '🐹');
});

test('[覆盖] poop：狗「拉屎」，其余物种一律「便便」', () => {
  assert.equal(resolveEventMeta('poop', { kind: 'dog' }).label, '拉屎');
  ['cat', 'rabbit', 'bird', 'rodent', 'reptile', 'other'].forEach((kind) => {
    assert.equal(resolveEventMeta('poop', { kind }).label, '便便', `${kind} 的 poop 应为便便`);
  });
});

test('[覆盖] cuddle：鸟上手 / 鼠互动 / 爬宠上手互动 / 其余摸摸', () => {
  assert.equal(resolveEventMeta('cuddle', { kind: 'bird' }).label, '上手');
  assert.equal(resolveEventMeta('cuddle', { kind: 'rodent' }).label, '互动');
  assert.equal(resolveEventMeta('cuddle', { kind: 'reptile' }).label, '上手互动');
  ['dog', 'cat', 'rabbit', 'other'].forEach((kind) => {
    assert.equal(resolveEventMeta('cuddle', { kind }).label, '摸摸');
  });
});

test('[覆盖] bath：鸟「鸟浴」/ 鼠「浴沙」/ 其余「洗澡」', () => {
  assert.equal(resolveEventMeta('bath', { kind: 'bird' }).label, '鸟浴');
  assert.equal(resolveEventMeta('bath', { kind: 'rodent' }).label, '浴沙');
  assert.equal(resolveEventMeta('bath', { kind: 'dog' }).label, '洗澡');
});

test('[覆盖] meal：鼠·爬宠·鱼「喂食」/ 其余「吃饭」', () => {
  ['rodent', 'reptile', 'fish'].forEach((kind) => {
    assert.equal(resolveEventMeta('meal', { kind }).label, '喂食', `${kind} 的 meal 应为喂食`);
  });
  ['dog', 'cat', 'rabbit', 'bird', 'other'].forEach((kind) => {
    assert.equal(resolveEventMeta('meal', { kind }).label, '吃饭');
  });
});

test('[覆盖] clean：鼠换垫料 / 爬宠清理饲养箱 / 鱼清缸', () => {
  assert.equal(resolveEventMeta('clean', { kind: 'rodent' }).label, '换垫料');
  assert.equal(resolveEventMeta('clean', { kind: 'reptile' }).label, '清理饲养箱');
  assert.equal(resolveEventMeta('clean', { kind: 'fish' }).label, '清缸');
});

test('[覆盖] v1.2 clean 扩展：猫「清理猫砂」/ 兔·鸟「清洁笼舍」', () => {
  assert.equal(resolveEventMeta('clean', { kind: 'cat' }).label, '清理猫砂');
  assert.equal(resolveEventMeta('clean', { kind: 'rabbit' }).label, '清洁笼舍');
  assert.equal(resolveEventMeta('clean', { kind: 'bird' }).label, '清洁笼舍');
});

test('[覆盖] v1.2 nailTrim：鸟「修剪爪喙」，狗·猫·兔维持「剪指甲」', () => {
  assert.equal(resolveEventMeta('nailTrim', { kind: 'bird' }).label, '修剪爪喙');
  ['dog', 'cat', 'rabbit'].forEach((kind) => {
    assert.equal(resolveEventMeta('nailTrim', { kind }).label, '剪指甲');
  });
});

test('[护理] v1.2 新增 6 个护理类型：label/emoji/unit/fields/color 齐全', () => {
  const expect = {
    brushTeeth: ['刷牙', '🪥'],
    cleanEars: ['洗耳朵', '👂'],
    deworm: ['驱虫', '🪱'],
    brushCoat: ['梳毛', '🪮'],
    filterClean: ['清洗滤材', '🧽'],
    shellBrush: ['刷龟甲', '🐢'],
  };
  Object.entries(expect).forEach(([type, [label, emoji]]) => {
    const meta = getEventType(type);
    assert.equal(meta.type, type, `${type} 应存在于基础池`);
    assert.equal(meta.label, label);
    assert.equal(meta.emoji, emoji);
    assert.equal(meta.unit, '', `${type} unit 应为空`);
    assert.deepEqual(meta.fields, [], `${type} fields 应为空数组`);
    assert.equal(typeof meta.color, 'string');
    assert.ok(meta.color.length > 0, `${type} 应具完整 Tailwind 类字符串`);
  });
});

test('[覆盖] resolveEventDisplay 与 resolveEventMeta 对同一 (type,pet) 的 label/emoji 一致', () => {
  const cases = [
    ['walk', 'dog'],
    ['walk', 'cat'],
    ['poop', 'dog'],
    ['cuddle', 'reptile'],
    ['bath', 'rodent'],
  ];
  for (const [type, kind] of cases) {
    const meta = resolveEventMeta(type, { kind });
    const disp = resolveEventDisplay({ type }, { kind });
    assert.equal(disp.label, meta.label, `${kind}.${type} label 不一致`);
    assert.equal(disp.emoji, meta.emoji, `${kind}.${type} emoji 不一致`);
  }
});

/* ------------------------------ 3. 计时判定 ------------------------------ */

test('[计时] isTimerType 仅 walk / flight 为真；play / sunbask / meal 为假', () => {
  assert.deepEqual([...TIMER_TYPES], ['walk', 'flight']);
  assert.equal(isTimerType('walk'), true);
  assert.equal(isTimerType('flight'), true);
  assert.equal(isTimerType('play'), false);
  assert.equal(isTimerType('sunbask'), false);
  assert.equal(isTimerType('meal'), false);
  assert.equal(isTimerType('other'), false);
  assert.equal(isTimerType('custom_x'), false, '自定义事件永不进入自动计时');
});

/* ------------------------------ 4. 统计指标（去狗本位） ------------------------------ */

test('[统计] fish 无 walk/flight/poop → 无时长指标、无便便指标', () => {
  const m = getStatsMetrics('fish');
  assert.deepEqual(m.durationTypes, []);
  assert.equal(m.hasPoop, false);
  assert.ok(!m.bars.includes('walk'));
});

test('[统计] reptile 无 walk/flight → durationTypes 为空', () => {
  assert.deepEqual(getStatsMetrics('reptile').durationTypes, []);
});

test('[统计] bird 同时含 walk + flight 两个时长指标', () => {
  assert.deepEqual(getStatsMetrics('bird').durationTypes, ['walk', 'flight']);
});

/* ------------------------------ 5. 旧契约不变（老代码依赖） ------------------------------ */

test('[旧契约] EVENT_TYPES 仍为 BASE_TYPES 别名，且含全部 legacy 12', () => {
  assert.equal(EVENT_TYPES, BASE_TYPES);
  const types = EVENT_TYPES.map((t) => t.type);
  LEGACY12.forEach((t) => assert.ok(types.includes(t), `基础池缺 legacy type ${t}`));
});

test('[旧契约] getEventType / hasField / describeEvent / POOP_* 行为未变', () => {
  assert.equal(getEventType('walk').label, '外出');
  assert.equal(getEventType('unknown-xyz').type, 'other');
  assert.equal(hasField('walk', 'durationMin'), true);
  assert.equal(hasField('walk', 'amount'), false);
  assert.equal(describeEvent({ type: 'walk', durationMin: 30 }), '30 分钟');
  assert.equal(describeEvent({ type: 'meal', amount: 100, unit: 'g' }), '100g');
  assert.equal(describeEvent(null), '');
  assert.ok(Array.isArray(POOP_FORMS) && POOP_FORMS.length > 0);
  assert.ok(Array.isArray(POOP_COLORS) && POOP_COLORS.length > 0);
});

test('[两层 emoji] speciesEmoji 返回 8 物种表情；未知兜底 🐾', () => {
  assert.equal(speciesEmoji('dog'), '🐕');
  assert.equal(speciesEmoji('fish'), '🐠');
  assert.equal(speciesEmoji('other'), '🐾');
  assert.equal(speciesEmoji('dragon'), '🐾');
});
