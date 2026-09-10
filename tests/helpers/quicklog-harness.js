/**
 * QA 独立渲染工装（v1.2「前 8 + 更多」验证专用）
 *
 * 目的：既能验证 QuickLog 的**收起态**，又能真实验证**展开态**渲染分支。
 * 做法：
 *  - 用 esbuild 现场编译 QuickLog.jsx（jsx: 'transform'），配 react-dom/server 做真实 SSR；
 *  - 「展开」变体通过 alias 把 `react` 换成本地 shim，shim 用 createRequire 拿到**同一份**
 *    真实 react 实例（保证 hooks dispatcher 与 react-dom/server 一致），并把
 *    `useState(false)` 的初始值翻转为 true —— 即 QuickLog 的 expanded 起始为「已展开」。
 *    （QuickLog 内只有 expanded 一处以 false 初始化，故该翻转精准命中 expanded。）
 *
 * 说明：这是对「展开分支」的**行为级**验证（真的走到 `types` 全量渲染 + 「收起」按钮），
 * 而非仅静态读源码。
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'petlog-quicklog');

const ENTRY = (compPath) => `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Component from ${JSON.stringify(compPath)};
export function render() {
  return renderToStaticMarkup(React.createElement(Component, globalThis.__QUICKLOG_PROPS__));
}
`;

const SHIM = `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const RealReact = require('react');
export default RealReact;
export const useEffect = RealReact.useEffect;
export const useRef = RealReact.useRef;
export const useMemo = RealReact.useMemo;
export const useCallback = RealReact.useCallback;
export const createElement = RealReact.createElement;
export const useState = (init) => {
  const r = RealReact.useState(init);
  if (init === false) return [true, r[1]];
  return r;
};
`;

const moduleCache = new Map();
let seq = 0;

async function compile(expanded) {
  const cached = moduleCache.get(expanded);
  if (cached) return cached;

  mkdirSync(CACHE_DIR, { recursive: true });
  seq += 1;
  const tag = expanded ? 'expanded' : 'collapsed';
  const entryPath = join(CACHE_DIR, `entry-${tag}-${process.pid}-${seq}.jsx`);
  const outPath = join(CACHE_DIR, `out-${tag}-${process.pid}-${seq}.mjs`);
  const shimPath = join(CACHE_DIR, `shim-${process.pid}.js`);
  const compPath = join(process.cwd(), 'src/components/QuickLog.jsx').replace(/\\/g, '/');

  writeFileSync(entryPath, ENTRY(compPath), 'utf8');

  const options = {
    entryPoints: [entryPath],
    outfile: outPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    jsx: 'transform',
    loader: { '.jsx': 'jsx', '.js': 'jsx' },
    packages: 'external',
    nodePaths: [join(process.cwd(), 'node_modules')],
    logLevel: 'silent',
    absWorkingDir: process.cwd(),
  };
  if (expanded) {
    writeFileSync(shimPath, SHIM, 'utf8');
    options.alias = { react: shimPath };
  }

  await build(options);
  const mod = await import(pathToFileURL(outPath).href);
  moduleCache.set(expanded, mod);
  return mod;
}

/**
 * 真实渲染 QuickLog。
 * @param {object[]} types 传给 QuickLog 的可见事件元数据数组
 * @param {{ expanded?: boolean, disabled?: boolean }} [opts]
 * @returns {Promise<string>} SSR HTML
 */
export async function renderQuickLog(types, opts = {}) {
  const mod = await compile(opts.expanded === true);
  globalThis.__QUICKLOG_PROPS__ = {
    types,
    onLog: () => {},
    onStartTimer: () => {},
    onStopTimer: () => {},
    disabled: opts.disabled === true,
    activeTimer: null,
  };
  return mod.render();
}

/** 统计 HTML 里的 <button 数量（事件按钮 + 收纳格） */
export function countButtons(html) {
  return (html.match(/<button/g) || []).length;
}
