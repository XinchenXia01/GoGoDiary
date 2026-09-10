/**
 * 渲染顺序回归（QA 独立验证）：顺序调整增量。
 * 用真实 React 渲染 App，断言速记区「前 8 常显」按钮的 DOM 出现顺序与物种预设一致：
 *   dog 前 8 顺序 = 遛狗 · 吃饭 · 喝水 · 拉屎 · 尿尿 · 零食 · 玩耍 · 摸摸
 *   （v1.2：treat 已移至 pee 之后；后 9 项落入「更多」收纳格，收起态不渲染）
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { KEYS } from '../src/lib/storage.js';
import { renderAppWith } from './helpers/render.js';

const PETS = [{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1699000000000 }];
const SETTINGS = JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' });

test('[顺序增量] dog 前 8 常显顺序为 遛狗<吃饭<喝水<拉屎<尿尿<零食<玩耍<摸摸', async () => {
  const { html } = await renderAppWith({ [KEYS.pets]: JSON.stringify(PETS), [KEYS.settings]: SETTINGS });
  const order = ['遛狗', '吃饭', '喝水', '拉屎', '尿尿', '零食', '玩耍', '摸摸'];
  const idx = order.map((l) => html.indexOf(l));
  idx.forEach((v, i) => assert.ok(v !== -1, `速记区应含「${order[i]}」`));
  for (let i = 1; i < idx.length; i += 1) {
    assert.ok(idx[i - 1] < idx[i], `${order[i - 1]} 应在 ${order[i]} 之前：${idx[i - 1]} vs ${idx[i]}`);
  }
});

test('[顺序增量] dog 的「更多」收纳格出现，且位于前 8 常显之后', async () => {
  const { html } = await renderAppWith({ [KEYS.pets]: JSON.stringify(PETS), [KEYS.settings]: SETTINGS });
  const idxLastPrimary = html.indexOf('摸摸');
  const idxMore = html.indexOf('更多');
  assert.ok(idxLastPrimary !== -1, '前 8 常显末位「摸摸」应存在');
  assert.ok(idxMore !== -1, 'dog 共 17 项 > 8，应出现「更多」收纳格');
  assert.ok(idxLastPrimary < idxMore, `「更多」应收在前 8 常显之后：摸摸@${idxLastPrimary} 更多@${idxMore}`);
});

test('[顺序增量] 计时类 walk(遛狗) 位于首格，未被挤入「更多」', async () => {
  const { html } = await renderAppWith({ [KEYS.pets]: JSON.stringify(PETS), [KEYS.settings]: SETTINGS });
  const idxWalk = html.indexOf('遛狗');
  const idxMore = html.indexOf('更多');
  assert.ok(idxWalk !== -1, 'walk 按钮应存在');
  assert.ok(idxWalk < idxMore, `计时按钮 walk 必须在前 8 常显内：walk@${idxWalk} 更多@${idxMore}`);
});
