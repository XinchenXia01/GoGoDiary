/**
 * StatsView 渲染测试
 * 验证最近 7 天柱状图与"距上次…"间隔卡片在真实渲染下的表现
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { renderComponent } from './helpers/render.js';

const PETS = [{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1699000000000 }];

/** 取 HTML 里所有纯文本（去注释、去标签） */
function textOf(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '') // React SSR 会在相邻文本节点间插入 <!-- -->，先剥离
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('StatsView: 全新宠物（零记录）不应出现巨大的"距上次"天数', async () => {
  const { html } = await renderComponent('src/components/StatsView.jsx', '{ events: [], petName: "旺财" }');
  const text = textOf(html);

  // 小字提示确实写了"暂无记录"
  assert.ok(text.includes('暂无记录'), `应显示暂无记录，实际：${text.slice(0, 200)}`);

  // 但大字（间隔值）不应出现"上万天"这种荒谬数字
  const badDay = text.match(/\d{3,}\s*天/);
  assert.equal(
    badDay,
    null,
    `零记录时"距上次"不应显示巨大天数，实际渲染出「${badDay ? badDay[0] : ''}」。完整文本：${text.slice(0, 300)}`
  );
});

test('StatsView: 有记录时间隔显示正常', async () => {
  const now = Date.now();
  const { html } = await renderComponent(
    'src/components/StatsView.jsx',
    `{ events: [{ id: 'e1', petId: 'p1', type: 'walk', ts: ${now - 2 * 3600 * 1000} }], petName: '旺财' }`
  );
  const text = textOf(html);
  assert.ok(/2\s*小时/.test(text), `应显示"2 小时"，实际：${text.slice(0, 300)}`);
});

test('StatsView: 最近 7 天横轴渲染出 7 个日期', async () => {
  const now = Date.now();
  const events = [
    { id: 'e1', petId: 'p1', type: 'walk', ts: now - 3600 * 1000 },
    { id: 'e2', petId: 'p1', type: 'meal', ts: now - 7200 * 1000 },
    { id: 'e3', petId: 'p1', type: 'poop', ts: now - 10800 * 1000 },
  ];
  const { html } = await renderComponent(
    'src/components/StatsView.jsx',
    `{ events: ${JSON.stringify(events)}, petName: '旺财' }`
  );
  const text = textOf(html);
  assert.ok(text.includes('最近 7 天'));
  assert.ok(text.includes('今天'), '7 天中最后一天应标记为今天');
  // 7 个 "M/D" 形式的横轴标签
  const labels = text.match(/\d{1,2}\/\d{1,2}/g) || [];
  assert.equal(labels.length, 7, `横轴应有 7 个日期标签，实际 ${labels.length}：${labels.join(',')}`);
});

test('StatsView: 零记录时显示空态文案而非空白图表', async () => {
  const { html } = await renderComponent('src/components/StatsView.jsx', '{ events: [], petName: "旺财" }');
  const text = textOf(html);
  assert.ok(text.includes('最近 7 天还没有记录'), `实际：${text.slice(0, 200)}`);
});

test('StatsView: 统计范围限定在传入宠物的记录', async () => {
  const now = Date.now();
  const events = [
    { id: 'e1', petId: 'p1', type: 'walk', ts: now },
    { id: 'e2', petId: 'p2', type: 'walk', ts: now },
  ];
  const { html } = await renderComponent(
    'src/components/StatsView.jsx',
    `{ events: ${JSON.stringify(events)}, petName: '旺财' }`
  );
  const text = textOf(html);
  assert.ok(text.includes('旺财'), '应显示统计范围宠物名');
  void PETS;
});

test('StatsView: 传入 pet（猫）时指标物种化，出现「本周外出总时长」且按物种命名', async () => {
  const now = Date.now();
  const events = [
    { id: 'e1', petId: 'c1', type: 'walk', ts: now - 3600 * 1000, durationMin: 30 },
    { id: 'e2', petId: 'c1', type: 'poop', ts: now - 7200 * 1000 },
  ];
  const pet = { id: 'c1', name: '咪咪', emoji: '🐈', kind: 'cat' };
  const { html } = await renderComponent(
    'src/components/StatsView.jsx',
    `{ events: ${JSON.stringify(events)}, pet: ${JSON.stringify(pet)}, petName: '咪咪' }`
  );
  const text = textOf(html);
  assert.ok(text.includes('外出'), '猫的 walk 应显示「外出」');
  assert.ok(text.includes('本周外出总时长'), '应出现本周外出总时长卡片');
  assert.ok(text.includes('30 分钟'), '总时长应展示 30 分钟');
  assert.ok(text.includes('距上次外出'), '间隔卡文案应随物种变化');
});

test('StatsView: 鱼（无 walk / poop）自动隐藏外出与便便指标', async () => {
  const pet = { id: 'f1', name: '小金', emoji: '🐠', kind: 'fish' };
  const { html } = await renderComponent(
    'src/components/StatsView.jsx',
    `{ events: [], pet: ${JSON.stringify(pet)}, petName: '小金' }`
  );
  const text = textOf(html);
  assert.ok(!text.includes('遛狗'), '鱼不应出现「遛狗」');
  assert.ok(!text.includes('外出'), '鱼不应出现「外出」');
  assert.ok(!text.includes('总时长'), '鱼无 walk/flight → 不显示时长卡片');
});
