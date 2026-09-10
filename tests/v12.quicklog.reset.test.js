/**
 * QA 独立补测（v1.2 增量 · 覆盖盲点）—— 「切换宠物/物种（types 变化）自动复位收起」
 *
 * 背景：既有 `v12.quicklog.gate.test.js` 用 react-dom/server 做 SSR，**SSR 不执行 useEffect**，
 * 因此 QuickLog 里 `useEffect(() => setExpanded(false), [types])` 这条「复位」逻辑一直没被真实验证。
 * 本文件分两层补上：
 *   A. 静态接线（source scan，与 `v12.compat.static.test.js` 同风格）：证明
 *      — QuickLog 存在依赖 [types] 且调用 setExpanded(false) 的 effect；
 *      — App 把 `types={visibleTypes}` 传给 QuickLog，且 visibleTypes 是依赖 activePet 的 useMemo
 *        （→ 切宠物/物种时引用变化 → effect 触发复位）。
 *   B. 行为层（真实 SSR）：customTypes 追加后仍计入「更多」余数，且展开态全量可见
 *      （证明速记区数据源 = getVisibleEventTypes 输出，含自定义）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getVisibleEventTypes } from '../src/lib/eventTypes.js';
import { countButtons, renderQuickLog } from './helpers/quicklog-harness.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');
const QUICKLOG = read('src/components/QuickLog.jsx');
const APP = read('src/App.jsx');

/* ---------------------------- A. 复位逻辑静态接线 ---------------------------- */

test('[复位] QuickLog 含依赖 [types] 的 effect 且调用 setExpanded(false)', () => {
  // 匹配：useEffect(() => { setExpanded(false); }, [types]);
  const re = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?setExpanded\s*\(\s*false\s*\)[\s\S]*?\}\s*,\s*\[\s*types\s*\]\s*\)/;
  assert.match(QUICKLOG, re, 'QuickLog 应有 useEffect(()=>setExpanded(false),[types]) 复位逻辑');
});

test('[复位] App 将 types={visibleTypes} 传给 QuickLog', () => {
  assert.match(APP, /<QuickLog\b[\s\S]*?types\s*=\s*\{\s*visibleTypes\s*\}/, 'QuickLog 的 types 应来自 visibleTypes');
});

test('[复位] visibleTypes 是依赖 activePet 的 useMemo（切宠物即换引用）', () => {
  const re = /const\s+visibleTypes\s*=\s*useMemo\s*\([\s\S]*?\[\s*activePet\s*\]\s*\)/;
  assert.match(APP, re, 'visibleTypes 应为 useMemo(..., [activePet])');
});

test('[复位] activePet 由 pets + activePetId 派生（换物种/换宠物都会换引用）', () => {
  const re = /const\s+activePet\s*=\s*useMemo\s*\([\s\S]*?\[\s*pets\s*,\s*settings\.activePetId\s*\]\s*\)/;
  assert.match(APP, re, 'activePet 应为 useMemo(..., [pets, settings.activePetId])');
});

/* ---------------------------- B. 自定义事件参与收纳/展开 ---------------------------- */

test('[复位] other + 3 个自定义：N=15 → 收起「更多 · 7」，展开全量 15', async () => {
  const pet = {
    kind: 'other',
    customTypes: [
      { id: 'custom_a', label: '剪羽', emoji: '✂️', color: 'bg-teal-100 text-teal-700', unit: '', fields: [], order: 0 },
      { id: 'custom_b', label: '称重器', emoji: '⚖️', color: 'bg-pink-100 text-pink-700', unit: '', fields: [], order: 1 },
      { id: 'custom_c', label: '毛发检查', emoji: '🔍', color: 'bg-lime-100 text-lime-700', unit: '', fields: [], order: 2 },
    ],
  };
  const types = getVisibleEventTypes(pet);
  assert.equal(types.length, 15, 'legacy 12 + 3 自定义 = 15');
  // 自定义按 order 追加末尾 → 全部进入「更多」
  assert.deepEqual(types.slice(12).map((t) => t.type), ['custom_a', 'custom_b', 'custom_c']);

  const collapsed = await renderQuickLog(types);
  assert.equal(countButtons(collapsed), 9, '收起态 = 8 事件 + 1 收纳格');
  assert.ok(collapsed.includes('更多 · 7'), 'N=15 → 余 7');
  for (const t of types.slice(8)) {
    assert.ok(!collapsed.includes(t.label), `收起态不应渲染收纳项「${t.label}」`);
  }

  const expanded = await renderQuickLog(types, { expanded: true });
  const toggles = (expanded.match(/aria-expanded/g) || []).length;
  assert.equal(countButtons(expanded) - toggles, 15, '展开态应有 15 个事件按钮');
  for (const t of types) {
    assert.ok(expanded.includes(t.label), `展开态应含「${t.label}」`);
  }
});

test('[复位] 不同物种 types 数组各自独立渲染对应前 8（无跨物种串扰）', async () => {
  const dog8 = getVisibleEventTypes({ kind: 'dog' }).slice(0, 8).map((t) => t.label);
  const cat8 = getVisibleEventTypes({ kind: 'cat' }).slice(0, 8).map((t) => t.label);
  // dog 常显含「遛狗」，cat 常显含「外出」——两者互不出现于对方的收起态
  assert.ok(dog8.includes('遛狗') && !dog8.includes('外出'));
  assert.ok(cat8.includes('外出') && !cat8.includes('遛狗'));
});
