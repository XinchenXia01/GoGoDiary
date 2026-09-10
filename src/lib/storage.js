/**
 * localStorage 持久化统一封装
 * 所有读写必须经过本模块：
 *  - 读取：try/catch + JSON.parse 失败兜底 + 结构清洗（脏数据不会导致白屏）
 *  - 写入：try/catch，捕获 QuotaExceededError 并通过监听器上报 UI
 * 所有 key 统一前缀 petlog.v1.
 *
 * 注意：与「图片」相关的操作是异步的（图片存在 IndexedDB，见 photoStore.js）。
 * 本文件的同步函数（readPets / readEvents / …）保持不变；只有涉及图片的
 * exportData / importData / deleteEvent / deletePet / clearAll 改为 async。
 */

import { getEventType, SPECIES_KINDS, CUSTOM_COLOR_OPTIONS, CUSTOM_FIELD_OPTIONS, BASE_TYPES } from './eventTypes.js';
import {
  getAllPhotoBlobs,
  blobToDataURL,
  putPhotos,
  dataURLToBlob,
  deletePhotosByIds,
  deleteAllPhotos,
} from './photoStore.js';

const PREFIX = 'petlog.v1.';
export const KEYS = {
  pets: `${PREFIX}pets`,
  events: `${PREFIX}events`,
  settings: `${PREFIX}settings`,
  // 进行中的计时会话（全局单会话）：{ petId, type, startTs } | null
  activeTimer: `${PREFIX}activeTimer`,
};

/** 基础 type 集合：自定义事件 id 不得与之冲突 */
const BASE_TYPE_SET = new Set(BASE_TYPES.map((t) => t.type));

/** 自定义事件允许的颜色集合（完整 Tailwind 类字符串） */
const CUSTOM_COLOR_SET = new Set(CUSTOM_COLOR_OPTIONS);

/** 默认设置 */
const DEFAULT_SETTINGS = { activePetId: '', timelineOrder: 'desc' };

/** 写入错误监听器（App 里注册用于弹 toast） */
let errorListener = null;

/**
 * 注册写入错误回调
 * @param {(message: string) => void} fn
 */
export function setStorageErrorListener(fn) {
  errorListener = typeof fn === 'function' ? fn : null;
}

/** 上报一条错误/提示消息 */
function notifyError(message) {
  if (errorListener) errorListener(message);
}

/**
 * 生成唯一 id：优先 crypto.randomUUID，降级为时间戳 + 随机串
 * @returns {string}
 */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 安全读取原始字符串
 * @param {string} key
 * @returns {string | null}
 */
function rawGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    // 隐私模式 / 禁用 localStorage 时降级为内存模式
    notifyError('无法访问本地存储，本次记录不会被保存');
    return null;
  }
}

/**
 * 安全写入字符串
 * @param {string} key
 * @param {string} value
 * @returns {boolean} 是否成功
 */
function rawSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22);
    notifyError(isQuota ? '本地存储空间已满，请导出备份后清理旧记录' : '写入本地存储失败，数据未保存');
    return false;
  }
}

/**
 * JSON 解析并兜底：任何异常都返回 defaultValue
 * @param {string | null} raw
 * @param {*} defaultValue
 * @returns {*}
 */
function parseJSON(raw, defaultValue) {
  if (raw == null || raw === '') return defaultValue;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return defaultValue;
  }
  return parsed == null ? defaultValue : parsed;
}

/**
 * 读取并校验数组；非数组返回空数组
 * @param {string} key
 * @returns {any[]}
 */
function readArray(key) {
  const value = parseJSON(rawGet(key), []);
  return Array.isArray(value) ? value : [];
}

/* ------------------------------ 清洗函数 ------------------------------ */

/**
 * 清洗自定义事件；非法项返回 null。
 * 规则：
 *  - id 非空字符串且不与任何基础 type 冲突，否则重新生成 `custom_*`
 *  - label trim 后非空，否则 '自定义'
 *  - emoji 非空字符串，否则 '⭐'
 *  - color 必须属于 CUSTOM_COLOR_OPTIONS，否则取第 0 项
 *  - unit 字符串，否则 ''
 *  - fields ⊆ ['durationMin','note']，空集则回填 ['note']
 *  - order 有限数（创建序号），否则 Date.now()
 * @param {*} item
 * @returns {object | null}
 */
function sanitizeCustomType(item) {
  if (!item || typeof item !== 'object') return null;
  const id =
    typeof item.id === 'string' && item.id && !BASE_TYPE_SET.has(item.id) ? item.id : `custom_${newId()}`;
  const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : '自定义';
  const emoji = typeof item.emoji === 'string' && item.emoji ? item.emoji : '⭐';
  const color = CUSTOM_COLOR_SET.has(item.color) ? item.color : CUSTOM_COLOR_OPTIONS[0];
  const unit = typeof item.unit === 'string' ? item.unit : '';
  const fields = Array.isArray(item.fields)
    ? item.fields.filter((f) => CUSTOM_FIELD_OPTIONS.indexOf(f) !== -1)
    : [];
  return {
    id,
    label,
    emoji,
    color,
    unit,
    fields: fields.length > 0 ? fields : ['note'],
    order: Number.isFinite(item.order) ? item.order : Date.now(),
  };
}

/**
 * 清洗宠物对象；非法项返回 null。
 * kind 白名单扩为 8 物种（老 dog/cat/other 原样保留，非法/缺失 → other）；
 * 新增 hiddenTypes（去重字符串数组）与 customTypes（清洗后的自定义事件数组）。
 * @param {*} item
 * @returns {object | null}
 */
function sanitizePet(item) {
  if (!item || typeof item !== 'object') return null;
  const id = typeof item.id === 'string' && item.id ? item.id : newId();
  const kind = SPECIES_KINDS.indexOf(item.kind) !== -1 ? item.kind : 'other';
  const hiddenTypes = Array.isArray(item.hiddenTypes)
    ? Array.from(new Set(item.hiddenTypes.filter((t) => typeof t === 'string' && t.length > 0)))
    : [];
  const customTypes = Array.isArray(item.customTypes)
    ? item.customTypes.map(sanitizeCustomType).filter(Boolean)
    : [];
  return {
    id,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : '未命名',
    emoji: typeof item.emoji === 'string' && item.emoji ? item.emoji : '🐾',
    kind,
    hiddenTypes,
    customTypes,
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
  };
}

/**
 * 清洗事件对象；非法项返回 null（type / ts 不合法直接丢弃）
 * @param {*} item
 * @returns {object | null}
 */
function sanitizeEvent(item) {
  if (!item || typeof item !== 'object') return null;
  const ts = Number(item.ts);
  if (!Number.isFinite(ts)) return null; // 没有合法时间的记录无法进入时间轴，直接丢弃
  const type = typeof item.type === 'string' && item.type ? item.type : 'other';
  const meta = getEventType(type);
  const amount = item.amount === '' || item.amount == null ? null : Number(item.amount);
  const duration = item.durationMin === '' || item.durationMin == null ? null : Number(item.durationMin);
  // 计时事件的可选时间区间（老事件无此字段 → null）
  const startTsRaw = item.startTs === '' || item.startTs == null ? null : Number(item.startTs);
  const endTsRaw = item.endTs === '' || item.endTs == null ? null : Number(item.endTs);
  // 照片 id 列表：必须是字符串数组，否则兜底为空（脏数据不导致白屏）
  const photoIds = Array.isArray(item.photoIds)
    ? item.photoIds.filter((x) => typeof x === 'string' && x.length > 0)
    : [];
  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    petId: typeof item.petId === 'string' ? item.petId : '',
    type,
    ts,
    note: typeof item.note === 'string' ? item.note : '',
    amount: Number.isFinite(amount) ? amount : null,
    unit: typeof item.unit === 'string' ? item.unit : meta.unit || '',
    poopForm: typeof item.poopForm === 'string' ? item.poopForm : '',
    poopColor: typeof item.poopColor === 'string' ? item.poopColor : '',
    durationMin: Number.isFinite(duration) ? duration : null,
    startTs: Number.isFinite(startTsRaw) ? startTsRaw : null,
    endTs: Number.isFinite(endTsRaw) ? endTsRaw : null,
    label: typeof item.label === 'string' ? item.label : '',
    photoIds,
    createdAt: Number.isFinite(item.createdAt) ? item.createdAt : ts,
    updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : ts,
  };
}

/* ------------------------------ pets ------------------------------ */

/**
 * 读取宠物列表（已清洗，按创建时间升序）
 * @returns {object[]}
 */
export function readPets() {
  return readArray(KEYS.pets)
    .map(sanitizePet)
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * 写入宠物列表
 * @param {object[]} pets
 * @returns {boolean}
 */
export function writePets(pets) {
  return rawSet(KEYS.pets, JSON.stringify(Array.isArray(pets) ? pets : []));
}

/**
 * 新增宠物
 * @param {{name: string, emoji: string, kind: string}} input
 * @returns {object | null} 新增后的宠物对象
 */
export function addPet(input) {
  const pet = sanitizePet({ ...input, id: newId(), createdAt: Date.now() });
  const pets = readPets();
  pets.push(pet);
  return writePets(pets) ? pet : null;
}

/**
 * 更新宠物字段
 * @param {string} id
 * @param {object} patch
 * @returns {object[]} 更新后的全量列表
 */
export function updatePet(id, patch) {
  const pets = readPets().map((p) => (p.id === id ? sanitizePet({ ...p, ...patch, id: p.id }) : p));
  writePets(pets);
  return pets;
}

/**
 * 删除宠物，并连带删除它的全部记录与图片
 * @param {string} id
 * @returns {Promise<{pets: object[], events: object[]}>}
 */
export async function deletePet(id) {
  const pets = readPets().filter((p) => p.id !== id);
  const all = readEvents();
  const removed = all.filter((e) => e.petId === id);
  const events = all.filter((e) => e.petId !== id);
  // 收集被删宠物的全部照片 id，一并清理（失败不影响宠物数据删除）
  const photoIds = [];
  removed.forEach((e) => {
    if (Array.isArray(e.photoIds)) photoIds.push(...e.photoIds);
  });
  if (photoIds.length > 0) {
    try {
      await deletePhotosByIds(photoIds);
    } catch (err) {
      /* 图片清理失败忽略 */
    }
  }
  writePets(pets);
  writeEvents(events);
  return { pets, events };
}

/* ------------------------------ events ------------------------------ */

/**
 * 读取事件列表（已清洗，按时间升序归档，UI 层自行排序）
 * @returns {object[]}
 */
export function readEvents() {
  return readArray(KEYS.events)
    .map(sanitizeEvent)
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

/**
 * 写入事件列表
 * @param {object[]} events
 * @returns {boolean}
 */
export function writeEvents(events) {
  return rawSet(KEYS.events, JSON.stringify(Array.isArray(events) ? events : []));
}

/**
 * 新增一条事件
 * @param {object} input 事件字段（无需 id / createdAt）
 * @returns {object | null}
 */
export function addEvent(input) {
  const now = Date.now();
  const evt = sanitizeEvent({ ...input, id: newId(), createdAt: now, updatedAt: now });
  if (!evt) return null;
  const events = readEvents();
  events.push(evt);
  return writeEvents(events) ? evt : null;
}

/**
 * 更新一条事件
 * @param {string} id
 * @param {object} patch
 * @returns {object[]} 更新后的全量列表
 */
export function updateEvent(id, patch) {
  const events = readEvents().map((e) => sanitizeEvent({ ...e, ...patch, id: e.id }) || e);
  writeEvents(events);
  return events;
}

/**
 * 删除一条事件，连带删除它关联的照片
 * @param {string} id
 * @returns {Promise<object[]>} 删除后的全量列表
 */
export async function deleteEvent(id) {
  const all = readEvents();
  const target = all.find((e) => e.id === id);
  // 先清照片（失败不影响事件本身删除）
  if (target && Array.isArray(target.photoIds) && target.photoIds.length > 0) {
    try {
      await deletePhotosByIds(target.photoIds);
    } catch (err) {
      /* 图片清理失败忽略 */
    }
  }
  const events = all.filter((e) => e.id !== id);
  writeEvents(events);
  return events;
}

/* ------------------------------ settings ------------------------------ */

/**
 * 读取设置（缺字段用默认值补齐）
 * @returns {{activePetId: string, timelineOrder: 'desc' | 'asc'}}
 */
export function readSettings() {
  const value = parseJSON(rawGet(KEYS.settings), {});
  const obj = value && typeof value === 'object' ? value : {};
  return {
    activePetId: typeof obj.activePetId === 'string' ? obj.activePetId : DEFAULT_SETTINGS.activePetId,
    timelineOrder: obj.timelineOrder === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * 写入设置
 * @param {object} settings
 * @returns {boolean}
 */
export function writeSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  return rawSet(KEYS.settings, JSON.stringify(merged));
}

/* ------------------------------ 计时会话（新 key） ------------------------------ */

/**
 * 清洗计时会话对象；非法返回 null。
 * @param {*} item
 * @returns {{petId: string, type: string, startTs: number} | null}
 */
function sanitizeTimer(item) {
  if (!item || typeof item !== 'object') return null;
  const petId = typeof item.petId === 'string' ? item.petId : '';
  const type = typeof item.type === 'string' ? item.type : '';
  const startTs = Number(item.startTs);
  if (!petId || !type || !Number.isFinite(startTs)) return null;
  return { petId, type, startTs };
}

/**
 * 读取进行中的计时会话（清洗：字段非法返回 null）。
 * @returns {{petId: string, type: string, startTs: number} | null}
 */
export function readActiveTimer() {
  return sanitizeTimer(parseJSON(rawGet(KEYS.activeTimer), null));
}

/**
 * 写入/覆盖计时会话。
 * @param {{petId: string, type: string, startTs: number} | null} session
 * @returns {boolean}
 */
export function writeActiveTimer(session) {
  const clean = sanitizeTimer(session);
  return rawSet(KEYS.activeTimer, JSON.stringify(clean));
}

/**
 * 开始计时（全局单会话：直接覆盖已有会话），默认 startTs = now。
 * @param {string} petId
 * @param {string} type
 * @param {number} [startTs]
 * @returns {{petId: string, type: string, startTs: number}}
 */
export function startTimer(petId, type, startTs = Date.now()) {
  const session = { petId, type, startTs };
  writeActiveTimer(session);
  return session;
}

/**
 * 结束/取消计时（写入 null）。
 * @returns {boolean}
 */
export function clearTimer() {
  return writeActiveTimer(null);
}

/* ------------------------------ 导入导出 / 统计 ------------------------------ */

/**
 * 导出全部数据（含图片，图片以 base64 dataURL 内联进 photos 字段）
 * @returns {Promise<{app: string, version: number, exportedAt: number, pets: object[], events: object[], settings: object, photos: Record<string, string>}>}
 */
export async function exportData() {
  const pets = readPets();
  const events = readEvents();
  const settings = readSettings();
  // 读 IndexedDB 里的全部图片并转 base64；任何失败都降级为「无图片」，不阻断导出
  let photos = {};
  try {
    const blobs = await getAllPhotoBlobs();
    const entries = await Promise.all(
      Object.keys(blobs).map(async (pid) => [pid, await blobToDataURL(blobs[pid])])
    );
    entries.forEach(([pid, url]) => {
      if (url) photos[pid] = url;
    });
  } catch (err) {
    photos = {};
  }
  return {
    app: 'petlog',
    version: 1,
    exportedAt: Date.now(),
    pets,
    events,
    settings,
    // 进行中的计时会话（瞬时态，随备份携带；老备份无此字段 → null）
    activeTimer: readActiveTimer(),
    photos,
  };
}

/**
 * 估算 petlog 相关 localStorage 占用字节数（UTF-8 字节）
 * @returns {number}
 */
export function estimateStorageBytes() {
  let total = 0;
  Object.keys(KEYS).forEach((name) => {
    const raw = rawGet(KEYS[name]);
    if (raw == null) return;
    // Blob 可精确得到 UTF-8 字节数；不支持时退化为 UTF-16 长度 × 2
    if (typeof Blob === 'function') {
      total += new Blob([raw]).size;
    } else {
      total += raw.length * 2;
    }
  });
  return total;
}

/**
 * 校验导入数据是否为本应用导出的格式
 * @param {*} data 解析后的对象
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '文件内容不是有效的 JSON 对象' };
  }
  const hasPets = Object.prototype.hasOwnProperty.call(data, 'pets');
  const hasEvents = Object.prototype.hasOwnProperty.call(data, 'events');
  if (!hasPets && !hasEvents) {
    return { ok: false, error: '缺少 pets / events 字段，不是本应用导出的文件' };
  }
  if (hasPets && !Array.isArray(data.pets)) return { ok: false, error: 'pets 字段必须是数组' };
  if (hasEvents && !Array.isArray(data.events)) return { ok: false, error: 'events 字段必须是数组' };
  if (data.app && data.app !== 'petlog') {
    return { ok: false, error: `未知来源（app=${data.app}），不是本应用导出的文件` };
  }
  return { ok: true };
}

/**
 * 导入数据（含图片恢复）
 * @param {string} text 文件文本
 * @param {'merge' | 'overwrite'} mode 合并去重（by id）或覆盖
 * @returns {Promise<{ok: boolean, error?: string, addedPets?: number, addedEvents?: number, pets?: object[], events?: object[], settings?: object, photoWarning?: string}>}
 */
export async function importData(text, mode) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: '文件不是合法 JSON，无法解析' };
  }
  const check = validateImport(data);
  if (!check.ok) return { ok: false, error: check.error };

  const inPets = Array.isArray(data.pets) ? data.pets.map(sanitizePet).filter(Boolean) : [];
  const inEvents = Array.isArray(data.events) ? data.events.map(sanitizeEvent).filter(Boolean) : [];

  let result;
  if (mode === 'overwrite') {
    writePets(inPets);
    writeEvents(inEvents);
    // 覆盖模式整体替换三张表；备份里没有 settings 时复位为默认值，
    // 避免残留一个指向已被覆盖删除的宠物的 activePetId
    writeSettings(data.settings && typeof data.settings === 'object' ? data.settings : DEFAULT_SETTINGS);
    // 覆盖模式恢复计时会话（备份缺失/非法 → null，避免残留指向已删宠物的会话）
    writeActiveTimer(sanitizeTimer(data.activeTimer));
    result = {
      ok: true,
      addedPets: inPets.length,
      addedEvents: inEvents.length,
      pets: readPets(),
      events: readEvents(),
      settings: readSettings(),
    };
  } else {
    // 合并模式：按 id 去重，已存在的 id 跳过
    const pets = readPets();
    const petIds = new Set(pets.map((p) => p.id));
    let addedPets = 0;
    inPets.forEach((p) => {
      if (!petIds.has(p.id)) {
        pets.push(p);
        petIds.add(p.id);
        addedPets += 1;
      }
    });

    const events = readEvents();
    const eventIds = new Set(events.map((e) => e.id));
    let addedEvents = 0;
    inEvents.forEach((e) => {
      if (!eventIds.has(e.id)) {
        events.push(e);
        eventIds.add(e.id);
        addedEvents += 1;
      }
    });

    writePets(pets);
    writeEvents(events);
    result = {
      ok: true,
      addedPets,
      addedEvents,
      pets: readPets(),
      events: readEvents(),
      settings: readSettings(),
    };
  }

  // 向后兼容：老备份没有 photos 字段时直接跳过，不报错
  let photoWarning = '';
  if (data.photos && typeof data.photos === 'object') {
    try {
      const map = {};
      Object.keys(data.photos).forEach((pid) => {
        const blob = dataURLToBlob(data.photos[pid]);
        if (blob && blob.size > 0) map[pid] = blob;
      });
      await putPhotos(map);
    } catch (err) {
      // 图片恢复失败（如测试环境无 IndexedDB）：记录警告但不影响主体导入
      photoWarning = '图片未能恢复（当前环境不支持本地图片存储）';
    }
  }

  return { ...result, photoWarning: photoWarning || undefined };
}

/**
 * 清空全部 petlog 数据（含 IndexedDB 里的图片）
 * @returns {Promise<boolean>}
 */
export async function clearAll() {
  // 清空图片库（失败不影响 localStorage 清理）
  try {
    await deleteAllPhotos();
  } catch (err) {
    /* 忽略 */
  }
  try {
    Object.keys(KEYS).forEach((name) => window.localStorage.removeItem(KEYS[name]));
    return true;
  } catch (err) {
    notifyError('清理本地存储失败');
    return false;
  }
}
