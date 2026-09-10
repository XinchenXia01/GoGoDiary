/**
 * 速记区「前 8 常显 + 更多原地展开」渲染用例（v1.2）。
 * 真实渲染 App（react-dom/server），验证折叠态下的收纳行为：
 *   - N > 8：只渲染前 8 个事件按钮 + 一个「更多 · 余数」收纳格；
 *   - N ≤ 8：全部渲染，且不出现「更多」格；
 *   - 被隐藏的类型不出现在任何位置（前 8 与「更多」均不含）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { KEYS } from '../src/lib/storage.js';
import { renderAppWith } from './helpers/render.js';

const pet = (id, kind) => ({ id, name: '测试', emoji: '🐾', kind, createdAt: 1 });
const withPet = (id, kind, extra = {}) => ({
  [KEYS.pets]: JSON.stringify([{ ...pet(id, kind), ...extra }]),
  [KEYS.settings]: JSON.stringify({ activePetId: id, timelineOrder: 'desc' }),
});

test('[更多] dog（17 项）：常显前 8 + 「更多 · 9」收纳格', async () => {
  const { html } = await renderAppWith(withPet('d1', 'dog'));
  // 前 8 常显
  ['遛狗', '吃饭', '喝水', '拉屎', '尿尿', '零食', '玩耍', '摸摸'].forEach((l) =>
    assert.ok(html.includes(l), `dog 常显应含「${l}」`)
  );
  // 余下 9 项收纳
  assert.ok(html.includes('更多 · 9'), 'dog 余 9 项 → 应显示「更多 · 9」');
  // 收纳项不出现在折叠态
  ['洗澡', '吃药', '体重', '刷牙'].forEach((l) =>
    assert.ok(!html.includes(l), `dog「${l}」应被收纳，折叠态不渲染`)
  );
});

test('[更多] cat（18 项）：常显前 8 + 「更多 · 10」收纳格', async () => {
  const { html } = await renderAppWith(withPet('c1', 'cat'));
  assert.ok(html.includes('更多 · 10'), 'cat 余 10 项 → 应显示「更多 · 10」');
  assert.ok(!html.includes('剪指甲'), 'cat「剪指甲」应被收纳');
});

test('[更多] rabbit（12 项）：常显前 8 + 「更多 · 4」收纳格', async () => {
  const { html } = await renderAppWith(withPet('r1', 'rabbit'));
  ['吃饭', '喝水', '便便', '尿尿', '放风', '摸摸', '梳毛'].forEach((l) =>
    assert.ok(html.includes(l), `rabbit 常显应含「${l}」`)
  );
  assert.ok(html.includes('更多 · 4'), 'rabbit 余 4 项 → 应显示「更多 · 4」');
});

test('[更多] fish（恰 8 项）：全部常显，无「更多」收纳格', async () => {
  const { html } = await renderAppWith(withPet('f1', 'fish'));
  ['喂食', '换水', '清缸', '测水质', '加水', '清洗滤材', '观察异常', '用药'].forEach((l) =>
    assert.ok(html.includes(l), `fish 应常显「${l}」`)
  );
  assert.ok(!html.includes('更多'), 'fish 恰 8 项 → 不应出现「更多」收纳格');
});

test('[更多] 被隐藏的类型不出现在任何位置（dog 隐藏 walk）', async () => {
  const { html } = await renderAppWith(withPet('d2', 'dog', { hiddenTypes: ['walk'] }));
  assert.ok(!html.includes('遛狗'), '被隐藏的 walk 不应出现在速记区');
  // 隐藏后仍 16 项 > 8 → 仍有「更多」格
  assert.ok(html.includes('更多'), '隐藏一项后仍 > 8，应保留「更多」格');
});
