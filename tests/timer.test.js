/**
 * 计时会话（activeTimer）专项测试
 * 覆盖：持久化读写 / 覆盖（全局单会话）/ 脏数据清洗 / "重开恢复" / 失效会话隐藏。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { installDomEnv, uninstallDomEnv } from './helpers/dom-env.js';
import { renderAppWith } from './helpers/render.js';
import { KEYS, clearTimer, readActiveTimer, startTimer, writeActiveTimer } from '../src/lib/storage.js';

const PET = { id: 'p1', name: '旺财', emoji: '🐕', kind: 'dog', createdAt: 1699000000000 };
const SETTINGS = { activePetId: 'p1', timelineOrder: 'desc' };

test('startTimer 落库 → readActiveTimer 恢复（模拟重开）', () => {
  const store = installDomEnv({});
  startTimer('p1', 'walk', 1700000000000);
  // 直接从底层取出持久化字符串
  const raw = store.getItem(KEYS.activeTimer);
  assert.ok(raw && raw.includes('walk'));

  // 模拟"重开 App"：全新环境，仅还原持久化字符串
  installDomEnv({ [KEYS.activeTimer]: raw });
  assert.deepEqual(readActiveTimer(), { petId: 'p1', type: 'walk', startTs: 1700000000000 });
  uninstallDomEnv();
});

test('全局单会话：再次 startTimer 覆盖旧会话', () => {
  installDomEnv({});
  startTimer('p1', 'walk', 1000);
  startTimer('p2', 'flight', 2000);
  assert.deepEqual(readActiveTimer(), { petId: 'p2', type: 'flight', startTs: 2000 });
  uninstallDomEnv();
});

test('clearTimer / writeActiveTimer(null) 清除会话', () => {
  installDomEnv({});
  startTimer('p1', 'walk', 1000);
  clearTimer();
  assert.equal(readActiveTimer(), null);
  startTimer('p1', 'walk', 1000);
  writeActiveTimer(null);
  assert.equal(readActiveTimer(), null);
  uninstallDomEnv();
});

test('readActiveTimer: 非法/缺失字段一律清洗为 null', () => {
  [
    '{坏JSON',
    'null',
    '"str"',
    '42',
    JSON.stringify({ petId: 'p1' }),
    JSON.stringify({ type: 'walk', startTs: 1 }),
    JSON.stringify({ petId: 'p1', type: 'walk', startTs: 'NaN' }),
  ].forEach((raw) => {
    installDomEnv({ [KEYS.activeTimer]: raw });
    assert.equal(readActiveTimer(), null, `输入 ${raw} 应清洗为 null`);
  });
  uninstallDomEnv();
});

test('App 重开恢复：有进行中会话时渲染计时横幅（物种化事件名 + 结束按钮）', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([PET]),
    [KEYS.settings]: JSON.stringify(SETTINGS),
    [KEYS.activeTimer]: JSON.stringify({ petId: 'p1', type: 'walk', startTs: Date.now() - 65000 }),
  });
  assert.ok(html.includes('进行中'), '应渲染「进行中」横幅');
  assert.ok(html.includes('遛狗'), '横幅应用物种化 label（狗 walk = 遛狗）');
  assert.ok(html.includes('已用'), '横幅应显示实时已用时长');
  assert.ok(html.includes('结束'), '横幅应有结束按钮');
});

test('App 清理失效会话：activeTimer 指向已不存在的宠物时不渲染横幅', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([PET]),
    [KEYS.settings]: JSON.stringify(SETTINGS),
    [KEYS.activeTimer]: JSON.stringify({ petId: 'ghost', type: 'walk', startTs: 123 }),
  });
  assert.ok(html.includes('宠物流水账'), '页面仍应正常渲染');
  assert.ok(!html.includes('进行中'), '失效会话（宠物已删）不应显示计时横幅');
});

test('App 渲染：无会话时不应出现计时横幅', async () => {
  const { html } = await renderAppWith({
    [KEYS.pets]: JSON.stringify([PET]),
    [KEYS.settings]: JSON.stringify(SETTINGS),
  });
  assert.ok(!html.includes('进行中'));
  // 但 walk 按钮仍带 ⏱ 标识（计时类）
  assert.ok(html.includes('⏱'), 'walk 按钮应带 ⏱ 计时标识');
});
