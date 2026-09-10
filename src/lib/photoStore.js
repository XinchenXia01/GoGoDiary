/**
 * IndexedDB 图片存储封装
 * ---------------------------------------------------------------------------
 * 职责单一：本模块只负责「图片 Blob」的增删查，绝不碰 localStorage 里的
 * 宠物 / 事件 / 设置数据（那些由 storage.js 管理）。
 *
 * 为什么用 IndexedDB 而不是 localStorage：
 *   - localStorage 只有约 5MB 配额，且只能存字符串；
 *   - 照片体积大，放 localStorage 很快会被挤爆；
 *   - IndexedDB 配额大得多（通常数百 MB），直接存 Blob 二进制，能存很多张。
 *
 * 所有导出函数都是 async（IndexedDB 本身是异步 API）。
 * 降级策略：测试 / 某些隐私环境里没有 indexedDB 全局，此时函数会 reject 一个
 * 明确的错误（文案含「IndexedDB 不可用」），由调用方 catch 处理，不会白屏。
 * 调用方（storage.js）已对读 / 写图片的异常做了兜底，失败不影响主体流程。
 */

const DB_NAME = 'petlog-photos'; // 独立的图片数据库，与 localStorage 互不干扰
const DB_VERSION = 1;
const STORE_NAME = 'photos';

/** 图片压缩：最大边长（像素） */
const MAX_DIM = 1600;
/** 图片压缩：JPEG 质量（0~1），0.82 在体积与清晰度间取得平衡 */
const JPEG_QUALITY = 0.82;

/** 数据库连接 Promise 缓存，避免重复 open */
let dbPromise = null;

/**
 * 判断当前运行环境是否支持 IndexedDB
 * @returns {boolean}
 */
function indexedDBAvailable() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * 打开（或惰性创建）图片数据库
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (!indexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB 不可用：当前环境不支持图片存储'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // 首次创建 / 版本升级时建表
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // 以 id 作为主键，值为 { id, blob }
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打开图片数据库失败'));
  });
  return dbPromise;
}

/* ------------------------------ 基础 CRUD ------------------------------ */

/**
 * 存一张图片
 * @param {string} id 图片 id（由调用方用 newId() 生成，保证与事件 photoIds 对应）
 * @param {Blob} blob 压缩后的图片二进制
 * @returns {Promise<string>} 存好的 id
 */
export async function putPhoto(id, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, blob });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error || new Error('保存图片失败'));
  });
}

/**
 * 取一张图片
 * @param {string} id
 * @returns {Promise<Blob | null>} 不存在时返回 null
 */
export async function getPhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    req.onsuccess = () => {
      const rec = req.result;
      resolve(rec && rec.blob ? rec.blob : null);
    };
    req.onerror = () => reject(req.error || new Error('读取图片失败'));
  });
}

/**
 * 删一张图片
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deletePhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('删除图片失败'));
  });
}

/* ------------------------------ 批量操作 ------------------------------ */

/**
 * 取出全部图片 Blob（用于导出打包）
 * @returns {Promise<Record<string, Blob>>} 以 id 为键的图片 map
 */
export async function getAllPhotoBlobs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const map = {};
      (req.result || []).forEach((rec) => {
        if (rec && rec.id && rec.blob) map[rec.id] = rec.blob;
      });
      resolve(map);
    };
    req.onerror = () => reject(req.error || new Error('批量读取图片失败'));
  });
}

/**
 * 批量写入图片（导入时用）
 * @param {Record<string, Blob>} map id -> Blob
 * @returns {Promise<void>}
 */
export async function putPhotos(map) {
  if (!map || typeof map !== 'object') return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    Object.keys(map).forEach((id) => {
      const blob = map[id];
      if (blob) store.put({ id, blob });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('批量写入图片失败'));
  });
}

/**
 * 按 id 列表批量删除图片（删除事件 / 宠物时连带清理）
 * @param {string[]} ids
 * @returns {Promise<void>}
 */
export async function deletePhotosByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('批量删除图片失败'));
  });
}

/**
 * 清空整个图片库（清空全部数据时调用）
 * @returns {Promise<void>}
 */
export async function deleteAllPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('清空图片失败'));
  });
}

/* ------------------------------ 图片处理（纯原生 canvas） ------------------------------ */

/**
 * 用 canvas 把图片压缩到最大边 1600px、image/jpeg quality 0.82。
 * 这是「稳妥方案能存很多张」的关键：原图动辄几 MB，压缩后通常 <300KB。
 * 不引第三方库，纯浏览器原生 API。EXIF 旋转忽略（移动端一般已处理）。
 * @param {File | Blob} file 用户选择的原图
 * @returns {Promise<Blob>} 压缩后的 JPEG Blob
 */
export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      reject(new Error('当前环境无法处理图片'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      // 等比缩放，最大边不超过 MAX_DIM
      const scale = Math.min(1, MAX_DIM / Math.max(width || 1, height || 1));
      const w = Math.max(1, Math.round((width || 1) * scale));
      const h = Math.max(1, Math.round((height || 1) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建画布上下文'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('图片压缩失败'));
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片文件'));
    };
    img.src = url;
  });
}

/* ------------------------------ base64 编解码（用于导出 / 导入） ------------------------------ */

/**
 * Blob -> dataURL（形如 data:image/jpeg;base64,xxxx），用于导出的 JSON 内联图片。
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片为 base64 失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * dataURL -> Blob（导入时把 base64 还原成二进制写回 IndexedDB）。
 * @param {string} dataURL
 * @returns {Blob}
 */
export function dataURLToBlob(dataURL) {
  if (typeof dataURL !== 'string') return new Blob([], { type: 'image/jpeg' });
  const comma = dataURL.indexOf(',');
  if (comma === -1) return new Blob([dataURL], { type: 'application/octet-stream' });
  const meta = dataURL.slice(0, comma);
  const isBase64 = meta.indexOf('base64') !== -1;
  const payload = dataURL.slice(comma + 1);
  if (isBase64) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const mimeMatch = /data:([^;]+)/.exec(meta);
    const mime = mimeMatch && mimeMatch[1] ? mimeMatch[1] : 'image/jpeg';
    return new Blob([bytes], { type: mime });
  }
  // 非 base64（罕见），按文本解码
  return new Blob([decodeURIComponent(payload)], { type: 'text/plain' });
}
