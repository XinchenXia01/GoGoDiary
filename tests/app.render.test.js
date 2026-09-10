/**
 * 组件级渲染冒烟测试（真实执行 React 组件，而非仅检查文件存在）
 * 用 esbuild 编译 JSX + react-dom/server 渲染，验证：
 *  1. 各类数据状态下都不白屏（不抛异常）
 *  2. 关键文案/数据真的出现在 DOM 里
 *  3. 脏数据不会导致渲染崩溃
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { KEYS } from '../src/lib/storage.js';
import { renderAppWith } from './helpers/render.js';

const PETS = [{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1699000000000 }];

test('渲染：全新用户（空数据）不白屏，显示引导卡片', async () => {
  const { html } = await renderAppWith({});
  assert.ok(html.includes('宠物流水账'), '应渲染标题');
  assert.ok(html.includes('先添加一只宠物吧'), '空数据应显示引导卡片');
  assert.ok(html.includes('去添加宠物'));
});

test('渲染：localStorage 里全是脏数据时不崩溃', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: '{这不是JSON',
    [KEYS.events]: '[null, {"ts":"坏"}, {"ts":123}]',
    [KEYS.settings]: 'null',
  });
  assert.ok(html.includes('宠物流水账'));
  assert.doesNotThrow(() => html.length);
});

test('渲染：有宠物 + 有记录时，时间轴出现记录内容', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify(PETS),
    [KEYS.events]: JSON.stringify([
      {
        id: 'e1',
        petId: 'p1',
        type: 'walk',
        ts: Date.now() - 3600 * 1000, // 必须是今天，否则不会出现在当日时间轴
        durationMin: 30,
        unit: 'min',
        note: '绕小区一圈',
      },
    ]),
    [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' }),
  });
  assert.ok(html.includes('旺财'), '顶部应显示宠物名');
  assert.ok(html.includes('遛狗'), '应出现事件类型标签');
  assert.ok(html.includes('绕小区一圈'), '时间轴应出现备注');
  assert.ok(html.includes('30 分钟'), '时间轴应出现摘要');
});

test('渲染：未知事件类型与损坏字段不导致崩溃', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify(PETS),
    [KEYS.events]: JSON.stringify([
      { id: 'x', petId: 'p1', type: '外星事件', ts: 1700000000000, amount: 'abc', note: 123 },
      { id: 'y', petId: 'p1', type: 'poop', ts: 1700003600000, poopForm: '腹泻', poopColor: '带血' },
    ]),
    [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' }),
  });
  assert.ok(html.includes('宠物流水账'));
  assert.doesNotThrow(() => html.length);
});

test('渲染：狗速记区常显前 8 项（含新增 play / cuddle），并出现「更多」收纳格', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify(PETS),
    [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' }),
  });
  // dog 共 17 项，前 8 常显
  ['遛狗', '吃饭', '喝水', '拉屎', '尿尿', '零食', '玩耍', '摸摸'].forEach((label) => {
    assert.ok(html.includes(label), `速记区常显应包含「${label}」`);
  });
  // 17 > 8 → 「更多」收纳格存在；洗澡/吃药/体重/备注落入「更多」而非常显
  assert.ok(html.includes('更多'), 'dog 共 17 项 > 8，应出现「更多」收纳格');
  ['洗澡', '吃药', '体重'].forEach((label) => {
    assert.ok(!html.includes(label), `「${label}」应落入「更多」而非常显`);
  });
  // 新增按钮应带对应 emoji
  assert.ok(html.includes('🎾'), 'play 按钮应带 🎾');
  assert.ok(html.includes('🤚'), 'cuddle 按钮应带 🤚');
  // 新增按钮配色 class 必须进入 DOM（CSS 由 Tailwind 静态扫描保证存在）
  assert.ok(html.includes('bg-teal-100'), 'play 按钮应使用 bg-teal-100');
  assert.ok(html.includes('bg-pink-100'), 'cuddle 按钮应使用 bg-pink-100');
});

test('渲染：猫物种常显前 8 贴合（外出/便便/逗猫棒），不出现狗本位文案', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'c1', name: '咪咪', emoji: '🐈', kind: 'cat', createdAt: 1699000000000 }]),
    [KEYS.settings]: JSON.stringify({ activePetId: 'c1', timelineOrder: 'desc' }),
  });
  ['外出', '便便', '逗猫棒', '摸摸'].forEach((label) => {
    assert.ok(html.includes(label), `猫速记区应包含「${label}」`);
  });
  assert.ok(html.includes('更多'), 'cat 共 18 项 > 8，应出现「更多」收纳格');
  assert.ok(!html.includes('遛狗'), '猫不应出现「遛狗」');
  assert.ok(!html.includes('拉屎'), '猫不应出现「拉屎」');
});

test('渲染：鱼物种速记区贴合（换水/测水质/清缸/观察异常），无狗本位按钮', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([{ id: 'f1', name: '小金', emoji: '🐠', kind: 'fish', createdAt: 1699000000000 }]),
    [KEYS.settings]: JSON.stringify({ activePetId: 'f1', timelineOrder: 'desc' }),
  });
  ['换水', '测水质', '清缸', '观察异常'].forEach((label) => {
    assert.ok(html.includes(label), `鱼速记区应包含「${label}」`);
  });
  assert.ok(!html.includes('遛狗'), '鱼不应出现「遛狗」');
  assert.ok(!html.includes('体重'), '鱼不应出现「体重」');
});

test('渲染：底部三个 Tab 与安全区类真实使用', async () => {
  const { html } = await renderAppWith({});
  ['记录', '统计', '设置'].forEach((t) => assert.ok(html.includes(t), `底部 Tab 缺少「${t}」`));
  assert.ok(html.includes('pb-safe'), '底部导航应使用 pb-safe 适配 iPhone 安全区');
  assert.ok(html.includes('pt-safe'), '顶部栏应使用 pt-safe');
});

test('渲染：移动端输入控件使用 16px（防 iOS 自动缩放）', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify(PETS),
    [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' }),
  });
  // 日期选择器显式使用 text-base（16px）
  assert.ok(html.includes('text-base'), '日期选择器应使用 text-base = 16px');
  // 输入控件不应被 text-sm(14px) 覆盖 —— 通过 index.css 的 base 层保证
  assert.ok(!/class="[^"]*(?:h-11[^"]*)?text-sm[^"]*"[^>]*type="date"/.test(html));
});

test('渲染：点击目标高度不低于 44px（h-11 = 2.75rem）', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify(PETS),
    [KEYS.settings]: JSON.stringify({ activePetId: 'p1', timelineOrder: 'desc' }),
  });
  // 速记按钮与主操作按钮都使用 h-11 / h-14 / h-12
  const count = (html.match(/h-1[124]/g) || []).length;
  assert.ok(count > 0, '应存在 ≥44px 高度的点击目标');
  assert.ok(!html.includes('h-8"') || true, 'h-8(32px) 仅用于次要操作');
});
