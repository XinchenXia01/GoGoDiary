/**
 * 增量回归（QA 独立验证）：本轮新增 play / cuddle 两种事件类型。
 * 目的：不依赖工程师已写的 eventTypes.test.js 的结论，独立证明
 *   - play / cuddle 存在于基础池，且字段齐全
 *   - getEventType('play') / getEventType('cuddle') 的取值正确
 *   - describeEvent 对 play / cuddle 的行为符合预期（含空字段兜底）
 *   - 未知类型兜底为 other，绝不抛错
 *
 * 备注（v1.1 物种化增量）：EVENT_TYPES 现为完整基础池（不再等于 12），
 * 故断言从「长度为 12」改为「play / cuddle 在池内」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { EVENT_TYPES, describeEvent, getEventType } from '../src/lib/eventTypes.js';

test('[增量] EVENT_TYPES 含 play / cuddle，且仍保留全部 legacy 12 个 type', () => {
  const types = EVENT_TYPES.map((t) => t.type);
  assert.ok(types.includes('play'), '应包含 play');
  assert.ok(types.includes('cuddle'), '应包含 cuddle');
  // 保留 legacy 12 个 type（保证老数据渲染）
  ['walk', 'meal', 'treat', 'water', 'poop', 'pee', 'play', 'cuddle', 'bath', 'med', 'weight', 'other'].forEach(
    (t) => assert.ok(types.includes(t), `应保留 legacy type：${t}`)
  );
  // 顺序要求：在 pee 之后、bath 之前
  assert.ok(types.indexOf('pee') < types.indexOf('play'), 'play 应在 pee 之后');
  assert.ok(types.indexOf('play') < types.indexOf('cuddle'), 'cuddle 应在 play 之后');
  assert.ok(types.indexOf('cuddle') < types.indexOf('bath'), 'cuddle 应在 bath 之前');
});

test('[增量] play / cuddle 字段齐全（type/label/emoji/color/unit/fields）', () => {
  const play = EVENT_TYPES.find((t) => t.type === 'play');
  const cuddle = EVENT_TYPES.find((t) => t.type === 'cuddle');
  for (const [name, meta] of [['play', play], ['cuddle', cuddle]]) {
    assert.ok(meta, `${name} 必须存在`);
    assert.equal(typeof meta.type, 'string', `${name}.type`);
    assert.equal(typeof meta.label, 'string', `${name}.label`);
    assert.equal(typeof meta.emoji, 'string', `${name}.emoji`);
    assert.equal(typeof meta.color, 'string', `${name}.color`);
    assert.equal(typeof meta.unit, 'string', `${name}.unit`);
    assert.ok(Array.isArray(meta.fields), `${name}.fields 必须是数组`);
  }
});

test('[增量] play: 玩耍 🎾 / teal 配色 / unit=min / fields=[durationMin]', () => {
  const play = EVENT_TYPES.find((t) => t.type === 'play');
  assert.equal(play.label, '玩耍');
  assert.equal(play.emoji, '🎾');
  assert.equal(play.color, 'bg-teal-100 text-teal-700');
  assert.equal(play.unit, 'min');
  assert.deepEqual(play.fields, ['durationMin']);
});

test('[增量] cuddle: 摸摸 🤚 / pink 配色 / unit 空 / fields 为空数组', () => {
  const cuddle = EVENT_TYPES.find((t) => t.type === 'cuddle');
  assert.equal(cuddle.label, '摸摸');
  assert.equal(cuddle.emoji, '🤚');
  assert.equal(cuddle.color, 'bg-pink-100 text-pink-700');
  assert.equal(cuddle.unit, '');
  assert.deepEqual(cuddle.fields, []);
});

test('[增量] getEventType('+"'play'"+') 返回 unit=min 且 fields 含 durationMin', () => {
  const meta = getEventType('play');
  assert.equal(meta.type, 'play');
  assert.equal(meta.unit, 'min');
  assert.ok(meta.fields.includes('durationMin'), 'play 应支持 durationMin 字段');
});

test('[增量] getEventType('+"'cuddle'"+') 的 fields 为空数组', () => {
  const meta = getEventType('cuddle');
  assert.equal(meta.type, 'cuddle');
  assert.deepEqual(meta.fields, [], 'cuddle 无特有字段');
});

test('[增量] describeEvent(play, 30min) 摘要含「30 分钟」', () => {
  const s = describeEvent({ type: 'play', durationMin: 30 });
  assert.equal(s, '30 分钟');
});

test('[增量] describeEvent(cuddle) 无附加字段时不报错，返回合理空串', () => {
  // cuddle 无任何特有字段，正常情况应返回空摘要而非抛错
  assert.doesNotThrow(() => describeEvent({ type: 'cuddle' }));
  assert.equal(describeEvent({ type: 'cuddle' }), '');
});

test('[增量] describeEvent(cuddle, 带 note) 仅含 note', () => {
  // cuddle 若被复用并挂了 note，也应正常拼接
  assert.equal(describeEvent({ type: 'cuddle', note: '宝宝很乖' }), '宝宝很乖');
});

test('[增量] getEventType 未知类型兜底为 other，不抛错', () => {
  const unknown = '不存在的类型';
  assert.doesNotThrow(() => getEventType(unknown));
  const meta = getEventType(unknown);
  assert.equal(meta.type, 'other', '未知类型应兜底到 other 定义');
  assert.ok(meta.fields.includes('note'), '兜底 other 应保留 note 字段');
});
