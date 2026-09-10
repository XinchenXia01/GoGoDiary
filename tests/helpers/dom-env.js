/**
 * 测试环境辅助：在 Node 里模拟浏览器环境（window.localStorage / Blob / crypto）
 * src/lib/storage.js 只依赖 window.localStorage，因此可以无浏览器运行。
 */

/** 内存版 localStorage，行为对齐 WHATWG Storage 规范的字符串语义 */
export class MemoryStorage {
  /**
   * @param {Record<string, string>} [initial] 初始原始字符串
   * @param {{ quotaLimit?: number, throwRead?: boolean, throwWrite?: boolean }} [opts]
   */
  constructor(initial = {}, opts = {}) {
    this.map = new Map(Object.entries(initial));
    this.quotaLimit = opts.quotaLimit ?? Infinity;
    this.throwRead = opts.throwRead === true;
    this.throwWrite = opts.throwWrite === true;
  }

  getItem(key) {
    if (this.throwRead) {
      const err = new Error('SecurityError: localStorage is disabled');
      err.name = 'SecurityError';
      throw err;
    }
    return this.map.has(String(key)) ? this.map.get(String(key)) : null;
  }

  setItem(key, value) {
    if (this.throwWrite) {
      const err = new Error('SecurityError: localStorage is disabled');
      err.name = 'SecurityError';
      throw err;
    }
    const next = String(value);
    if (next.length > this.quotaLimit) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      err.code = 22;
      throw err;
    }
    this.map.set(String(key), next);
  }

  removeItem(key) {
    this.map.delete(String(key));
  }

  clear() {
    this.map.clear();
  }

  key(i) {
    return Array.from(this.map.keys())[i] ?? null;
  }

  get length() {
    return this.map.size;
  }
}

/**
 * 装载浏览器环境
 * @param {Record<string, string>} [raw] 以 localStorage key 为键的原始字符串
 * @param {object} [opts] MemoryStorage 选项
 * @returns {MemoryStorage}
 */
export function installDomEnv(raw = {}, opts = {}) {
  const store = new MemoryStorage(raw, opts);
  globalThis.window = { localStorage: store };
  globalThis.localStorage = store;
  return store;
}

/** 卸载浏览器环境（模拟隐私模式：完全没有 localStorage） */
export function installBrokenDomEnv() {
  globalThis.window = {};
  return globalThis.window;
}

/** 清理全局，避免测试间互相污染 */
export function uninstallDomEnv() {
  delete globalThis.window;
  delete globalThis.localStorage;
}

/**
 * 构造一个合法的导出快照（供导入测试使用）
 * @param {object} [override]
 */
export function makeSnapshot(override = {}) {
  return {
    app: 'petlog',
    version: 1,
    exportedAt: 1700000000000,
    pets: [{ id: 'p1', name: '旺财', emoji: '🐶', kind: 'dog', createdAt: 1699000000000 }],
    events: [
      { id: 'e1', petId: 'p1', type: 'walk', ts: 1700000000000, durationMin: 30, unit: 'min' },
    ],
    settings: { activePetId: 'p1', timelineOrder: 'desc' },
    ...override,
  };
}
