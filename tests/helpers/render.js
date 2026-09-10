/**
 * 用 esbuild 把 JSX 现场编译成可在 Node 里执行的 ESM，
 * 再用 react-dom/server 做真实渲染 —— 证明组件不只是"存在"，而是能跑出正确 DOM。
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { installDomEnv } from './dom-env.js';

const ENTRY = (compPath, propsLiteral) => `
import React from 'react';
import { renderToString } from 'react-dom/server';
import Component from ${JSON.stringify(compPath)};
export function renderApp() {
  return renderToString(React.createElement(Component, ${propsLiteral}));
}
`;

/** 编译缓存目录放在 node_modules/.cache 下，不污染 src/ 与 tests/ */
const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'petlog-tests');

let seq = 0;

/**
 * 编译并渲染任意组件（真实执行 React）
 * @param {string} compRelPath 相对项目根的路径，如 'src/components/StatsView.jsx'
 * @param {string} propsLiteral 传给组件的 props 字面量源码
 * @param {Record<string, string>} [raw] 预置 localStorage 原始字符串
 * @returns {Promise<{ html: string, storage: object }>}
 */
export async function renderComponent(compRelPath, propsLiteral = '{}', raw = {}) {
  mkdirSync(CACHE_DIR, { recursive: true });
  seq += 1;
  const entryPath = join(CACHE_DIR, `entry-${process.pid}-${seq}.jsx`);
  const outPath = join(CACHE_DIR, `out-${process.pid}-${seq}.mjs`);
  const compPath = join(process.cwd(), compRelPath).replace(/\\/g, '/');

  writeFileSync(entryPath, ENTRY(compPath, propsLiteral), 'utf8');

  await build({
    entryPoints: [entryPath],
    outfile: outPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    jsx: 'automatic',
    loader: { '.jsx': 'jsx', '.js': 'jsx' },
    // 只打包项目源码，react / react-dom 交给 Node 原生解析（避免 CJS 打进 ESM 报错）
    packages: 'external',
    nodePaths: [join(process.cwd(), 'node_modules')],
    logLevel: 'silent',
    absWorkingDir: process.cwd(),
  });

  const storage = installDomEnv(raw);
  const mod = await import(pathToFileURL(outPath).href);
  const html = mod.renderApp();
  return { html, storage };
}

/**
 * 渲染 App 根组件
 * @param {Record<string, string>} [raw] 预置 localStorage 原始字符串
 */
export function renderAppWith(raw = {}) {
  return renderComponent('src/App.jsx', '{}', raw);
}
