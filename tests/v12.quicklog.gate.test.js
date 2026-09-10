/**
 * QA 独立验证（v1.2 增量）—— 速记区「前 8 常显 + 第 9 格『更多』原地展开」
 *
 * 与工程师既有 `quicklog.more.test.js` 的差异：
 *  - 该文件走 App 级 SSR，只断言文本存在性；本文件**直连 QuickLog 组件**，用
 *    `<button` 计数 + aria-expanded 区分「事件按钮 / 收纳格」，对 8 这个阈值做**边界压测**；
 *  - 并通过 `helpers/quicklog-harness.js` 的 react shim 真实渲染**展开态**分支
 *    （不是读源码推断），验证展开后事件按钮数 = N，且收纳格切换为「收起」。
 *
 * 覆盖：N=8 恰好、N=9（阈值+1）、N>8 收起/展开、隐藏后 N≤8 / N>8、计时类是否仍在前 8。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { getVisibleEventTypes, isTimerType, resolveEventMeta } from '../src/lib/eventTypes.js';
import { countButtons, renderQuickLog } from './helpers/quicklog-harness.js';

/** 用可见元数据构造 QuickLog 的 types（真实物种数据） */
const typesOf = (kind, hidden = []) =>
  getVisibleEventTypes({ kind, hiddenTypes: hidden });

/** 合成 N 个非计时事件（用于边界压测，隔离物种数据） */
const synth = (n) =>
  Array.from({ length: n }, (_, i) => ({
    type: `x${i}`,
    label: `B${i}`,
    emoji: '▪',
    color: 'bg-stone-100 text-stone-700',
  }));

const toggles = (html) => (html.match(/aria-expanded/g) || []).length;
const eventButtons = (html) => countButtons(html) - toggles(html);

/* --------------------------- 1. 阈值边界压测 --------------------------- */

test('[8+更多] N=8 恰好：无收纳格，8 个事件按钮常显', async () => {
  const html = await renderQuickLog(synth(8));
  assert.equal(countButtons(html), 8, 'N=8 不应多出收纳格');
  assert.equal(toggles(html), 0, 'N=8 不应渲染收纳格（无 aria-expanded）');
  assert.ok(!html.includes('更多'), 'N=8 不应出现「更多」字样');
  for (let i = 0; i < 8; i += 1) assert.ok(html.includes(`B${i}`), `N=8 应常显 B${i}`);
});

test('[8+更多] N=9（阈值+1）：收起态 8 事件 + 1 收纳格「更多 · 1」', async () => {
  const html = await renderQuickLog(synth(9));
  assert.equal(countButtons(html), 9, 'N=9 收起态应为 8+1');
  assert.equal(toggles(html), 1, 'N=9 应收起：有 1 个收纳格');
  assert.equal(eventButtons(html), 8, 'N=9 收起态事件按钮 = 8');
  assert.ok(html.includes('更多 · 1'), 'N=9 余数应为 1 → 「更多 · 1」');
  assert.ok(!html.includes('B8'), 'N=9 收起态不应渲染第 9 项 B8');
});

test('[8+更多] N=9 展开态：9 事件按钮全渲染，收纳格变「收起」，无「更多 · 」', async () => {
  const html = await renderQuickLog(synth(9), { expanded: true });
  assert.equal(eventButtons(html), 9, '展开后事件按钮数应为 N=9');
  assert.equal(toggles(html), 1, '展开态仍有 1 个切换格');
  assert.ok(html.includes('B8'), '展开后应渲染第 9 项 B8');
  assert.ok(html.includes('收起'), '展开态收纳格文案应为「收起」');
  assert.ok(!html.includes('更多 · '), '展开态不应再出现「更多 · N」');
});

/* --------------------------- 2. 真实物种：收起态 = 前 8 + 收纳N-8 --------------------------- */

const REAL = [
  { kind: 'dog', total: 17, more: 9 },
  { kind: 'cat', total: 18, more: 10 },
  { kind: 'rabbit', total: 12, more: 4 },
  { kind: 'bird', total: 12, more: 4 },
  { kind: 'rodent', total: 10, more: 2 },
  { kind: 'reptile', total: 11, more: 3 },
  { kind: 'other', total: 12, more: 4 },
];

for (const { kind, total, more } of REAL) {
  test(`[8+更多] ${kind}（N=${total}）收起态：8 事件按钮 + 1 收纳格「更多 · ${more}」`, async () => {
    const types = typesOf(kind);
    assert.equal(types.length, total, `${kind} 可见数应为 ${total}`);
    const html = await renderQuickLog(types);
    assert.equal(eventButtons(html), 8, `${kind} 收起态事件按钮应为 8`);
    assert.equal(toggles(html), 1, `${kind} 收起态应有 1 个收纳格`);
    assert.ok(html.includes(`更多 · ${more}`), `${kind} 应收纳 ${more} 项`);
    // 第 9 项及以后不出现在收起态
    for (const t of types.slice(8)) {
      assert.ok(!html.includes(t.label), `${kind} 收起态不应渲染收纳项「${t.label}」`);
    }
  });

  test(`[8+更多] ${kind} 展开态：事件按钮 = ${total}，全量标签可见，无「更多 ·」`, async () => {
    const types = typesOf(kind);
    const html = await renderQuickLog(types, { expanded: true });
    assert.equal(eventButtons(html), total, `${kind} 展开后事件按钮应 = ${total}`);
    assert.ok(html.includes('收起'), `${kind} 展开后应收起`);
    assert.ok(!html.includes('更多 · '), `${kind} 展开后不应再有「更多 ·」`);
    for (const t of types) {
      assert.ok(html.includes(t.label), `${kind} 展开后应含「${t.label}」`);
    }
  });
}

/* --------------------------- 3. N≤8（fish）：无收纳格 --------------------------- */

test('[8+更多] fish（恰 8）：无收纳格，8 个按钮全常显', async () => {
  const types = typesOf('fish');
  assert.equal(types.length, 8);
  const html = await renderQuickLog(types);
  assert.equal(countButtons(html), 8);
  assert.equal(toggles(html), 0, 'fish 恰 8 项不应有收纳格');
  assert.ok(!html.includes('更多'), 'fish 不应出现「更多」');
  for (const t of types) assert.ok(html.includes(t.label), `fish 应常显「${t.label}」`);
});

/* --------------------------- 4. 计时类必须留在前 8 --------------------------- */

test('[8+更多] 计时类在前 8：dog.walk / cat.walk / bird.flight 均在收起态常显', async () => {
  const checks = [
    ['dog', 'walk'],
    ['cat', 'walk'],
    ['bird', 'flight'],
  ];
  for (const [kind, type] of checks) {
    assert.ok(isTimerType(type), `${type} 应为计时类`);
    const types = typesOf(kind);
    const idx = types.findIndex((t) => t.type === type);
    assert.ok(idx >= 0 && idx < 8, `${kind}.${type} 应落在前 8（实际位 ${idx + 1}）`);
    const html = await renderQuickLog(types);
    const label = resolveEventMeta(type, { kind }).label;
    assert.ok(html.includes(label), `${kind} 收起态应常显计时按钮「${label}」`);
    // 计时类按钮应带 ⏱ 标记
    assert.ok(html.includes('⏱'), `${kind} 收起态应有 ⏱ 计时标识`);
  }
});

/* --------------------------- 5. 隐藏项：既不常显也不在展开里 --------------------------- */

test('[8+更多] dog 隐藏 9 项 → N=8：收纳格消失，且隐藏项不出现', async () => {
  const hidden = ['bath', 'med', 'weight', 'brushTeeth', 'cleanEars', 'deworm', 'brushCoat', 'nailTrim', 'other'];
  const types = typesOf('dog', hidden);
  assert.equal(types.length, 8, 'dog 17 − 9 = 8');
  const html = await renderQuickLog(types);
  assert.equal(toggles(html), 0, 'N=8 不应有收纳格');
  for (const t of hidden) {
    const label = resolveEventMeta(t, { kind: 'dog' }).label;
    assert.ok(!html.includes(label), `隐藏项 ${t}（${label}）不应出现`);
  }
});

test('[8+更多] dog 隐藏 2 项 → N=15：收纳格余数正确，隐藏项收起/展开都不出现', async () => {
  const types = typesOf('dog', ['walk', 'meal']);
  assert.equal(types.length, 15);
  const collapsed = await renderQuickLog(types);
  assert.ok(collapsed.includes('更多 · 7'), 'N=15 → 余 7');
  const expanded = await renderQuickLog(types, { expanded: true });
  assert.equal(eventButtons(expanded), 15);
  assert.ok(!expanded.includes('遛狗'), '被隐藏的 walk(遛狗) 不应出现在展开态');
  assert.ok(!expanded.includes('吃饭'), '被隐藏的 meal(吃饭) 不应出现在展开态');
});

/* --------------------------- 6. 收起态标签的相对顺序 = 可见集顺序 --------------------------- */

test('[8+更多] dog 收起态前 8 标签顺序与可见集一致', async () => {
  const types = typesOf('dog').slice(0, 8);
  const html = await renderQuickLog(typesOf('dog'));
  let cursor = -1;
  for (const t of types) {
    const at = html.indexOf(t.label, cursor + 1);
    assert.ok(at > cursor, `标签「${t.label}」应在其前一个之后出现`);
    cursor = at;
  }
});
