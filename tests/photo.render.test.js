/**
 * PhotoStrip 轻量渲染冒烟测试
 *
 * 说明：react-dom/server 的 renderToString 不会执行 useEffect，
 * 因此图片（在 effect 里通过 getPhoto + URL.createObjectURL 异步加载）不会出现在服务端渲染结果里，
 * 组件在 items 为空时按设计返回 null。
 * 本测试的目标是验证「组件能安全渲染、不崩溃」，重点覆盖 PhotoStrip.jsx:17 的
 * `Array.isArray(photoIds) ? photoIds.join(',') : ''` 兜底 —— 即传入 null / 非数组时不应抛错。
 * 缩略图的可视化验证（objectURL 创建、<img> 渲染）依赖浏览器/jsdom + IndexedDB，超出本冒烟范围，
 * 列为后续 follow-up（见 TEST-REPORT.md 第 2 轮「已知限制」）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { renderComponent } from './helpers/render.js';

test('PhotoStrip: 传入正常 photoIds 可安全渲染（effect 不执行，返回字符串）', async () => {
  const { html } = await renderComponent('src/components/PhotoStrip.jsx', '{ photoIds: ["a", "b"] }');
  assert.equal(typeof html, 'string');
});

test('PhotoStrip: 传入 null photoIds 不应崩溃（Array.isArray 兜底）', async () => {
  const { html } = await renderComponent('src/components/PhotoStrip.jsx', '{ photoIds: null }');
  assert.equal(typeof html, 'string');
});

test('PhotoStrip: 传入空数组应安全渲染', async () => {
  const { html } = await renderComponent('src/components/PhotoStrip.jsx', '{ photoIds: [] }');
  assert.equal(typeof html, 'string');
});
