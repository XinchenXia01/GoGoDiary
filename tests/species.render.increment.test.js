/**
 * QA 独立验证（v1.1 物种化事件增量）
 * 主题三：真实渲染断言 —— 速记区按物种裁剪、计时横幅、事件管理面板。
 * 用 esbuild 现场编译 JSX + react-dom/server 真实渲染组件（非静态检查）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { KEYS } from '../src/lib/storage.js';
import { renderAppWith, renderComponent } from './helpers/render.js';

const SETTINGS = (id) => JSON.stringify({ activePetId: id, timelineOrder: 'desc' });

test('[渲染] dog 物种：速记区出现「遛狗 / 拉屎 / 摸摸」', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'd1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }]),
    [KEYS.settings]: SETTINGS('d1'),
  });
  ['遛狗', '拉屎', '摸摸'].forEach((l) => assert.ok(html.includes(l), `狗速记区应含「${l}」`));
});

test('[渲染] cat 物种：常显前 8（外出/便便/逗猫棒/摸摸），并出现「更多」收纳格', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'c1', name: '咪咪', emoji: '🐈', kind: 'cat', createdAt: 1 }]),
    [KEYS.settings]: SETTINGS('c1'),
  });
  // 前 8 常显（cat 共 18 项，剪指甲已落入「更多」）
  ['外出', '便便', '逗猫棒', '摸摸'].forEach((l) => assert.ok(html.includes(l), `猫速记区应含「${l}」`));
  assert.ok(html.includes('更多'), 'cat 共 18 项 > 8，应出现「更多」收纳格');
  assert.ok(!html.includes('遛狗'), '猫不应出现「遛狗」');
  assert.ok(!html.includes('拉屎'), '猫不应出现「拉屎」');
});

test('[渲染] fish 物种：出现「换水 / 测水质 / 清缸」，不出现「摸摸 / 遛狗 / 体重」', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'f1', name: '小金', emoji: '🐠', kind: 'fish', createdAt: 1 }]),
    [KEYS.settings]: SETTINGS('f1'),
  });
  ['换水', '测水质', '清缸', '观察异常'].forEach((l) => assert.ok(html.includes(l), `鱼速记区应含「${l}」`));
  assert.ok(!html.includes('摸摸'), '鱼不应出现「摸摸」');
  assert.ok(!html.includes('遛狗'), '鱼不应出现「遛狗」');
  assert.ok(!html.includes('体重'), '鱼不应出现「体重」');
  // fish 恰好 8 项 ≤ 8 → 不出现「更多」收纳格
  assert.ok(!html.includes('更多'), 'fish 恰好 8 项，不应出现「更多」收纳格');
});

test('[渲染] other 物种（老用户升级）：legacy 12 前 8 常显 + 「更多」收纳，用词为 外出/便便/备注', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'o1', name: '小宠', emoji: '🐾', kind: 'other', createdAt: 1 }]),
    [KEYS.settings]: SETTINGS('o1'),
  });
  // 前 8 常显（legacy 12 的前 8 项）
  ['外出', '吃饭', '零食', '喝水', '便便', '尿尿', '玩耍', '摸摸'].forEach((l) => {
    assert.ok(html.includes(l), `other 速记区应含「${l}」`);
  });
  // 12 > 8 → 出现「更多」收纳格，其后 4 项（洗澡/吃药/体重/备注）收起不渲染
  assert.ok(html.includes('更多'), 'other 共 12 项 > 8，应出现「更多」收纳格');
  assert.ok(!html.includes('洗澡'), 'other 的「洗澡」应落入「更多」而非常显');
  assert.ok(!html.includes('备注'), 'other 的「备注」应落入「更多」而非常显');
  assert.ok(!html.includes('遛狗'), '决策 7A：other 用词已由「遛狗」调整为「外出」');
  assert.ok(!html.includes('拉屎'), '决策 7A：other 用词已由「拉屎」调整为「便便」');
});

test('[渲染] 脏数据 + 未知类型事件：不白屏，且时间轴用 label 快照兜底显示', async () => {
  const now = Date.now();
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1 }]),
    [KEYS.events]: JSON.stringify([
      { id: 'e1', petId: 'p1', type: 'xyz', ts: now, label: '神秘旧事件' },
      { id: 'e2', petId: 'p1', type: 'walk', ts: now - 1000, durationMin: 30 },
    ]),
    [KEYS.settings]: SETTINGS('p1'),
  });
  assert.ok(html.includes('宠物流水账'), '页面应正常渲染');
  assert.ok(html.includes('神秘旧事件'), '未知类型应使用 label 快照兜底');
  assert.ok(html.includes('遛狗'), '正常事件按物种渲染');
});

test('[渲染] TimerBar：进行中会话显示物种化事件名 + 实时已用 + 结束按钮', async () => {
  const { html } = await renderComponent(
    'src/components/TimerBar.jsx',
    `{ session: { petId: 'p1', type: 'walk', startTs: 1000 }, pet: { name: '旺财', kind: 'dog' }, now: 61000, onStop: () => {} }`
  );
  assert.ok(html.includes('进行中'), '应显示「进行中」');
  assert.ok(html.includes('遛狗'), 'dog 的 walk 应显示「遛狗」');
  assert.ok(html.includes('已用'), '应显示已用时长');
  assert.ok(html.includes('01:00'), '已用时长应为 01:00');
  assert.ok(html.includes('结束'), '应有结束按钮');
});

test('[渲染] EventManager（other）：显示自定义事件入口', async () => {
  const { html } = await renderComponent(
    'src/components/EventManager.jsx',
    `{ pet: { id: 'o1', name: '小宠', kind: 'other', hiddenTypes: [], customTypes: [] }, onUpdatePet: () => {} }`
  );
  assert.ok(html.includes('事件管理'), '应渲染事件管理区块');
  assert.ok(html.includes('自定义事件'), 'other 物种应显示自定义事件区块');
  assert.ok(html.includes('新建'), '应显示「＋ 新建」入口');
  assert.ok(html.includes('外出'), 'other 预设事件应展示物种化 label');
});

test('[渲染] EventManager（非 other）：自定义入口被关闭并给出提示', async () => {
  const { html } = await renderComponent(
    'src/components/EventManager.jsx',
    `{ pet: { id: 'd1', name: '旺财', kind: 'dog', hiddenTypes: [], customTypes: [] }, onUpdatePet: () => {} }`
  );
  assert.ok(html.includes('自定义事件仅「其他」物种可用'), 'dog 物种应提示自定义事件不可用');
  assert.ok(!html.includes('＋ 新建'), 'dog 物种不应出现自定义新建入口');
});
