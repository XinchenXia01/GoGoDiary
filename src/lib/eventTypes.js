/**
 * 事件类型定义（v1.1 物种化增量 · 五层模型）
 *
 * ┌─ ⑤ 自定义层  pet.customTypes（仅 other 可新建，按宠物归属）
 * ├─ ④ 隐藏层    pet.hiddenTypes（按宠物裁剪预设）
 * ├─ ③ 覆盖层    SPECIES_PRESETS[kind] 条目的 label/emoji（同 type 不同物种不同词）
 * ├─ ② 物种预设  SPECIES_PRESETS[kind]：可见集合 + 顺序 + 分组
 * └─ ① 基础池    BASE_TYPES：稳定概念键注册表（唯一 color/unit/fields/group）
 *
 * 设计要点：
 *  - `type` 是写进历史记录的稳定概念键，绝不因换物种而失效；物种差异只走「预设裁剪 + label/emoji 覆盖」。
 *  - color 一律使用**完整 Tailwind 类字符串**（禁止拼接，否则 Tailwind 静态扫描不到 → 样式丢失）。
 *  - 向后兼容：`EVENT_TYPES` 保留为 `BASE_TYPES` 的别名；`getEventType/hasField/describeEvent` 契约不变。
 */

import { formatDuration } from './format.js';

/* ================================ ① 物种表 ================================ */

/** 8 个物种；顺序即「物种选择器」的展示顺序 */
export const SPECIES = [
  { kind: 'dog', label: '狗', emoji: '🐕' },
  { kind: 'cat', label: '猫', emoji: '🐈' },
  { kind: 'rabbit', label: '兔', emoji: '🐇' },
  { kind: 'bird', label: '鸟', emoji: '🐦' },
  { kind: 'fish', label: '鱼', emoji: '🐠' },
  { kind: 'rodent', label: '鼠', emoji: '🐹' },
  { kind: 'reptile', label: '爬宠', emoji: '🦎' },
  { kind: 'other', label: '其他', emoji: '🐾' },
];

/** 物种 kind 白名单（供 sanitizePet 校验）；非法值一律落 `other` */
export const SPECIES_KINDS = SPECIES.map((s) => s.kind);

/** kind → 物种对象 的索引，未知兜底 other */
const SPECIES_INDEX = SPECIES.reduce((acc, item) => {
  acc[item.kind] = item;
  return acc;
}, {});

/**
 * 取物种对象；未知/缺失 kind 兜底为 other。
 * @param {string} kind
 * @returns {{kind: string, label: string, emoji: string}}
 */
export function getSpecies(kind) {
  return SPECIES_INDEX[kind] || SPECIES_INDEX.other;
}

/**
 * 取物种 emoji（新建宠物时作为头像初值）。
 * @param {string} kind
 * @returns {string}
 */
export function speciesEmoji(kind) {
  return getSpecies(kind).emoji;
}

/* ================================ ② 基础池 ================================ */

/**
 * 基础池：与物种无关的概念注册表，持有唯一的 color / unit / fields / group。
 * group: 'base'（通用事件）| 'special'（物种专属/清洁/健康类）
 */
export const BASE_TYPES = [
  // ---------- 通用事件（base） ----------
  { type: 'walk', label: '外出', emoji: '🚶', color: 'bg-emerald-100 text-emerald-700', unit: 'min', fields: ['durationMin'], group: 'base' },
  { type: 'meal', label: '吃饭', emoji: '🍚', color: 'bg-amber-100 text-amber-700', unit: 'g', fields: ['amount'], group: 'base' },
  { type: 'treat', label: '零食', emoji: '🦴', color: 'bg-orange-100 text-orange-700', unit: '个', fields: ['amount'], group: 'base' },
  { type: 'water', label: '喝水', emoji: '💧', color: 'bg-sky-100 text-sky-700', unit: '', fields: [], group: 'base' },
  { type: 'poop', label: '便便', emoji: '💩', color: 'bg-yellow-100 text-yellow-800', unit: '', fields: ['poopForm', 'poopColor'], group: 'base' },
  { type: 'pee', label: '尿尿', emoji: '💦', color: 'bg-cyan-100 text-cyan-700', unit: '', fields: [], group: 'base' },
  { type: 'play', label: '玩耍', emoji: '🎾', color: 'bg-teal-100 text-teal-700', unit: 'min', fields: ['durationMin'], group: 'base' },
  { type: 'cuddle', label: '摸摸', emoji: '🤚', color: 'bg-pink-100 text-pink-700', unit: '', fields: [], group: 'base' },
  { type: 'bath', label: '洗澡', emoji: '🛁', color: 'bg-indigo-100 text-indigo-700', unit: '', fields: [], group: 'base' },
  { type: 'med', label: '吃药', emoji: '💊', color: 'bg-rose-100 text-rose-700', unit: '', fields: ['note'], group: 'base' },
  { type: 'weight', label: '体重', emoji: '⚖️', color: 'bg-violet-100 text-violet-700', unit: 'kg', fields: ['amount'], group: 'base' },
  { type: 'other', label: '备注', emoji: '📝', color: 'bg-stone-100 text-stone-700', unit: '', fields: ['note'], group: 'base' },
  // ---------- 物种专属 / 清洁 / 健康类（special） ----------
  { type: 'flight', label: '出笼飞', emoji: '🕊️', color: 'bg-sky-100 text-sky-700', unit: 'min', fields: ['durationMin'], group: 'special' },
  { type: 'sunbask', label: '晒太阳/晒灯', emoji: '☀️', color: 'bg-amber-100 text-amber-700', unit: 'min', fields: ['durationMin'], group: 'special' },
  { type: 'nailTrim', label: '剪指甲', emoji: '✂️', color: 'bg-slate-100 text-slate-700', unit: '', fields: [], group: 'special' },
  { type: 'clean', label: '清理容器', emoji: '🧽', color: 'bg-lime-100 text-lime-700', unit: '', fields: ['note'], group: 'special' },
  { type: 'waterChange', label: '换水', emoji: '🚰', color: 'bg-blue-100 text-blue-700', unit: '', fields: ['note'], group: 'special' },
  { type: 'topWater', label: '加水', emoji: '💧', color: 'bg-sky-100 text-sky-700', unit: '', fields: [], group: 'special' },
  { type: 'testWater', label: '测水质', emoji: '🧪', color: 'bg-cyan-100 text-cyan-700', unit: '', fields: ['note'], group: 'special' },
  { type: 'observe', label: '观察异常', emoji: '👀', color: 'bg-slate-100 text-slate-700', unit: '', fields: ['note'], group: 'special' },
  { type: 'soakMist', label: '泡水/喷水', emoji: '💦', color: 'bg-cyan-100 text-cyan-700', unit: '', fields: ['note'], group: 'special' },
  { type: 'shed', label: '蜕皮', emoji: '🐍', color: 'bg-emerald-100 text-emerald-700', unit: '', fields: ['note'], group: 'special' },
  // ---------- 清洁 / 护理类（special）：新增于 v1.2，各物种按需引用 ----------
  // 配色刻意选用此前未占用的色系（fuchsia/purple/green/red/gray/zinc），避免与既有事件撞色。
  { type: 'brushTeeth', label: '刷牙', emoji: '🪥', color: 'bg-fuchsia-100 text-fuchsia-700', unit: '', fields: [], group: 'special' },
  { type: 'cleanEars', label: '洗耳朵', emoji: '👂', color: 'bg-purple-100 text-purple-700', unit: '', fields: [], group: 'special' },
  { type: 'deworm', label: '驱虫', emoji: '🪱', color: 'bg-green-100 text-green-700', unit: '', fields: [], group: 'special' },
  { type: 'brushCoat', label: '梳毛', emoji: '🪮', color: 'bg-red-100 text-red-700', unit: '', fields: [], group: 'special' },
  { type: 'filterClean', label: '清洗滤材', emoji: '🧽', color: 'bg-gray-100 text-gray-700', unit: '', fields: [], group: 'special' },
  { type: 'shellBrush', label: '刷龟甲', emoji: '🐢', color: 'bg-zinc-100 text-zinc-700', unit: '', fields: [], group: 'special' },
  { type: 'custom', label: '自定义', emoji: '⭐', color: 'bg-stone-100 text-stone-700', unit: '', fields: ['note'], group: 'special' },
];

/** 向后兼容别名：历史命名 `EVENT_TYPES` 仍可用（现为完整基础池） */
export const EVENT_TYPES = BASE_TYPES;

/** 规范顺序（预设缺失时的排序依据）：即基础池声明顺序 */
export const TYPE_ORDER = BASE_TYPES.map((t) => t.type);

/** type → 基础定义 索引 */
const BASE_INDEX = BASE_TYPES.reduce((acc, item) => {
  acc[item.type] = item;
  return acc;
}, {});

/* ================================ ③ 物种预设 + 覆盖 ================================ */

/**
 * 物种预设：`{ [kind]: [{type, label, emoji}] }`，label/emoji 即该物种的最终展示值。
 * 「覆盖」= 同 type 不同声明（无需运行时 if-else 补丁）。
 * 注意：`other` 物种预设 = v1.0 legacy 12 类（决策 7A），保证老用户按钮不消失。
 */
export const SPECIES_PRESETS = {
  // 顺序约定：前 8 项为速记区常显（Top-8），其后落入「更多」收纳；计时类（walk）必须留在前 8。
  dog: [
    { type: 'walk', label: '遛狗', emoji: '🐕' },
    { type: 'meal', label: '吃饭', emoji: '🍚' },
    { type: 'water', label: '喝水', emoji: '💧' },
    { type: 'poop', label: '拉屎', emoji: '💩' },
    { type: 'pee', label: '尿尿', emoji: '💦' },
    { type: 'treat', label: '零食', emoji: '🦴' },
    { type: 'play', label: '玩耍', emoji: '🎾' },
    { type: 'cuddle', label: '摸摸', emoji: '🤚' },
    { type: 'bath', label: '洗澡', emoji: '🛁' },
    { type: 'med', label: '吃药', emoji: '💊' },
    { type: 'weight', label: '体重', emoji: '⚖️' },
    { type: 'brushTeeth', label: '刷牙', emoji: '🪥' },
    { type: 'cleanEars', label: '洗耳朵', emoji: '👂' },
    { type: 'deworm', label: '驱虫', emoji: '🪱' },
    { type: 'brushCoat', label: '梳毛', emoji: '🪮' },
    { type: 'nailTrim', label: '剪指甲', emoji: '✂️' },
    { type: 'other', label: '备注', emoji: '📝' },
  ],
  cat: [
    { type: 'walk', label: '外出', emoji: '🐈' },
    { type: 'meal', label: '吃饭', emoji: '🍚' },
    { type: 'water', label: '喝水', emoji: '💧' },
    { type: 'poop', label: '便便', emoji: '💩' },
    { type: 'pee', label: '尿尿', emoji: '💦' },
    { type: 'treat', label: '零食', emoji: '🦴' },
    { type: 'play', label: '逗猫棒', emoji: '🪶' },
    { type: 'cuddle', label: '摸摸', emoji: '🤚' },
    { type: 'bath', label: '洗澡', emoji: '🛁' },
    { type: 'med', label: '吃药', emoji: '💊' },
    { type: 'weight', label: '体重', emoji: '⚖️' },
    { type: 'nailTrim', label: '剪指甲', emoji: '✂️' },
    { type: 'brushTeeth', label: '刷牙', emoji: '🪥' },
    { type: 'cleanEars', label: '洗耳朵', emoji: '👂' },
    { type: 'deworm', label: '驱虫', emoji: '🪱' },
    { type: 'brushCoat', label: '梳毛', emoji: '🪮' },
    { type: 'clean', label: '清理猫砂', emoji: '🧽' },
    { type: 'other', label: '备注', emoji: '📝' },
  ],
  rabbit: [
    { type: 'meal', label: '吃饭', emoji: '🍚' },
    { type: 'water', label: '喝水', emoji: '💧' },
    { type: 'poop', label: '便便', emoji: '💩' },
    { type: 'pee', label: '尿尿', emoji: '💦' },
    { type: 'walk', label: '放风', emoji: '🐇' },
    { type: 'cuddle', label: '摸摸', emoji: '🤚' },
    { type: 'brushCoat', label: '梳毛', emoji: '🪮' },
    { type: 'nailTrim', label: '剪指甲', emoji: '✂️' },
    { type: 'med', label: '吃药', emoji: '💊' },
    { type: 'weight', label: '体重', emoji: '⚖️' },
    { type: 'clean', label: '清洁笼舍', emoji: '🧽' },
    { type: 'other', label: '备注', emoji: '📝' },
  ],
  bird: [
    { type: 'meal', label: '吃饭', emoji: '🍚' },
    { type: 'water', label: '喝水', emoji: '💧' },
    { type: 'poop', label: '便便', emoji: '💩' },
    { type: 'walk', label: '遛鸟', emoji: '🐦' },
    { type: 'flight', label: '出笼飞', emoji: '🕊️' },
    { type: 'bath', label: '鸟浴', emoji: '🛁' },
    { type: 'cuddle', label: '上手', emoji: '🤚' },
    { type: 'nailTrim', label: '修剪爪喙', emoji: '✂️' },
    { type: 'med', label: '吃药', emoji: '💊' },
    { type: 'weight', label: '体重', emoji: '⚖️' },
    { type: 'clean', label: '清洁笼舍', emoji: '🧽' },
    { type: 'other', label: '备注', emoji: '📝' },
  ],
  // 鱼预设恰好 8 项 → 速记区不出现「更多」格（验证 N≤8 分支）
  fish: [
    { type: 'meal', label: '喂食', emoji: '🍚' },
    { type: 'waterChange', label: '换水', emoji: '🚰' },
    { type: 'clean', label: '清缸', emoji: '🧽' },
    { type: 'testWater', label: '测水质', emoji: '🧪' },
    { type: 'topWater', label: '加水', emoji: '💧' },
    { type: 'filterClean', label: '清洗滤材', emoji: '🧽' },
    { type: 'observe', label: '观察异常', emoji: '👀' },
    { type: 'med', label: '用药', emoji: '💊' },
  ],
  rodent: [
    { type: 'meal', label: '喂食', emoji: '🍚' },
    { type: 'water', label: '喝水', emoji: '💧' },
    { type: 'clean', label: '换垫料', emoji: '🧺' },
    { type: 'walk', label: '放风', emoji: '🐹' },
    { type: 'bath', label: '浴沙', emoji: '🏖️' },
    { type: 'cuddle', label: '互动', emoji: '🤚' },
    { type: 'poop', label: '便便', emoji: '💩' },
    { type: 'weight', label: '体重', emoji: '⚖️' },
    { type: 'med', label: '吃药', emoji: '💊' },
    { type: 'other', label: '备注', emoji: '📝' },
  ],
  reptile: [
    { type: 'meal', label: '喂食', emoji: '🍚' },
    { type: 'soakMist', label: '泡水/喷水', emoji: '💦' },
    { type: 'sunbask', label: '晒太阳/晒灯', emoji: '☀️' },
    { type: 'cuddle', label: '上手互动', emoji: '🤚' },
    { type: 'clean', label: '清理饲养箱', emoji: '🧽' },
    { type: 'shed', label: '蜕皮', emoji: '🐍' },
    { type: 'weight', label: '体重', emoji: '⚖️' },
    { type: 'poop', label: '便便', emoji: '💩' },
    { type: 'med', label: '吃药', emoji: '💊' },
    { type: 'shellBrush', label: '刷龟甲', emoji: '🐢' },
    { type: 'other', label: '备注', emoji: '📝' },
  ],
  // 决策 7A：老 kind:'other' 用户升级后按钮不消失 → 保留 legacy 通用池兜底
  // 微调用词：遛狗→外出、拉屎→便便、其他→备注（集合不变，仍 12 项）
  other: [
    { type: 'walk', label: '外出', emoji: '🚶' },
    { type: 'meal', label: '吃饭', emoji: '🍚' },
    { type: 'treat', label: '零食', emoji: '🦴' },
    { type: 'water', label: '喝水', emoji: '💧' },
    { type: 'poop', label: '便便', emoji: '💩' },
    { type: 'pee', label: '尿尿', emoji: '💦' },
    { type: 'play', label: '玩耍', emoji: '🎾' },
    { type: 'cuddle', label: '摸摸', emoji: '🤚' },
    { type: 'bath', label: '洗澡', emoji: '🛁' },
    { type: 'med', label: '吃药', emoji: '💊' },
    { type: 'weight', label: '体重', emoji: '⚖️' },
    { type: 'other', label: '备注', emoji: '📝' },
  ],
};

/**
 * 取某物种的预设事件元数据（已与基础池合并，含 group / color / unit / fields）。
 * @param {string} kind 物种 kind
 * @returns {object[]}
 */
export function getPresetEventTypes(kind) {
  const list = SPECIES_PRESETS[kind] || SPECIES_PRESETS.other;
  return list.map((entry) => {
    const b = BASE_INDEX[entry.type] || BASE_INDEX.other;
    return {
      type: entry.type,
      label: entry.label,
      emoji: entry.emoji,
      color: b.color,
      unit: b.unit,
      fields: b.fields,
      group: b.group,
    };
  });
}

/* ================================ 基础访问（旧契约） ================================ */

/**
 * 获取事件类型的基础定义；未知类型兜底为 other，保证脏数据不会导致渲染崩溃。
 * @param {string} type
 * @returns {object}
 */
export function getEventType(type) {
  return BASE_INDEX[type] || BASE_INDEX.other;
}

/**
 * 判断某类型是否包含指定字段（基于基础池）。
 * @param {string} type
 * @param {string} field
 * @returns {boolean}
 */
export function hasField(type, field) {
  return getEventType(type).fields.indexOf(field) !== -1;
}

/* ================================ 解析 / 过滤 ================================ */

/**
 * 单个 type 的展示元数据（用于类型网格/按钮，无 event 上下文）。
 * 优先级：自定义 → 物种预设覆盖 → 基础池 → 兜底 other。
 * @param {string} type
 * @param {object|null} pet
 * @returns {object}
 */
export function resolveEventMeta(type, pet) {
  const ct = (pet && Array.isArray(pet.customTypes) ? pet.customTypes : []).find((c) => c.id === type);
  if (ct) {
    return {
      type: ct.id,
      label: ct.label,
      emoji: ct.emoji,
      color: ct.color,
      unit: ct.unit || '',
      fields: Array.isArray(ct.fields) && ct.fields.length ? ct.fields : ['note'],
      group: 'custom',
      isCustom: true,
    };
  }
  const base = BASE_INDEX[type];
  const ov = (pet && SPECIES_PRESETS[pet.kind] ? SPECIES_PRESETS[pet.kind] : []).find((e) => e.type === type);
  if (base || ov) {
    const b = base || BASE_INDEX.other;
    return {
      type,
      label: ov ? ov.label : b.label,
      emoji: ov ? ov.emoji : b.emoji,
      color: b.color,
      unit: b.unit,
      fields: b.fields,
      group: b.group,
    };
  }
  // 未知 type 三级兜底
  return { ...BASE_INDEX.other };
}

/**
 * 事件的展示元数据（多一层 `event.label` 快照兜底：删除自定义后仍显示原名）。
 * @param {object} event
 * @param {object|null} pet
 * @returns {{label: string, emoji: string, color: string}}
 */
export function resolveEventDisplay(event, pet) {
  const type = event && typeof event.type === 'string' ? event.type : '';
  const ct = (pet && Array.isArray(pet.customTypes) ? pet.customTypes : []).find((c) => c.id === type);
  if (ct) return { label: ct.label, emoji: ct.emoji, color: ct.color };

  const base = BASE_INDEX[type];
  const ov = (pet && SPECIES_PRESETS[pet.kind] ? SPECIES_PRESETS[pet.kind] : []).find((e) => e.type === type);
  if (base || ov) {
    const b = base || BASE_INDEX.other;
    return { label: ov ? ov.label : b.label, emoji: ov ? ov.emoji : b.emoji, color: b.color };
  }
  // 未知类型：优先用事件里的 label 快照（已删除的自定义事件）
  return {
    label: (event && event.label) || '已删除的自定义事件',
    emoji: '⭐',
    color: CUSTOM_COLOR_OPTIONS[0],
  };
}

/**
 * 可见事件列表 = 物种预设（按矩阵顺序）− 隐藏 + 自定义（按 order 追加末尾）。
 * @param {object} pet
 * @returns {object[]}
 */
export function getVisibleEventTypes(pet) {
  if (!pet) return [];
  const hidden = new Set(Array.isArray(pet.hiddenTypes) ? pet.hiddenTypes : []);
  const preset = getPresetEventTypes(pet.kind).filter((m) => !hidden.has(m.type));
  const customs = (Array.isArray(pet.customTypes) ? pet.customTypes : [])
    .filter((c) => c && !hidden.has(c.id))
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      type: c.id,
      label: c.label,
      emoji: c.emoji,
      color: c.color,
      unit: c.unit || '',
      fields: Array.isArray(c.fields) && c.fields.length ? c.fields : ['note'],
      group: 'custom',
      isCustom: true,
    }));
  return [...preset, ...customs];
}

/* ================================ 计时 ================================ */

/** 支持「开始→结束」自动计时的类型（决策 3：外出/放风类） */
export const TIMER_TYPES = ['walk', 'flight'];

/**
 * 是否为计时类事件。
 * @param {string} type
 * @returns {boolean}
 */
export function isTimerType(type) {
  return TIMER_TYPES.indexOf(type) !== -1;
}

/* ================================ 统计 ================================ */

/** 统计指标优先级（取该物种可见集与之交集的前 3 项作为柱状图） */
const STATS_PRIORITY = [
  'walk',
  'flight',
  'meal',
  'poop',
  'water',
  'clean',
  'waterChange',
  'play',
  'sunbask',
  'cuddle',
  'med',
  'testWater',
];

/**
 * 按物种动态给出统计指标。
 * @param {string} kind
 * @returns {{bars: string[], intervals: string[], durationTypes: string[], hasPoop: boolean, available: Set<string>}}
 */
export function getStatsMetrics(kind) {
  const available = new Set(getPresetEventTypes(kind).map((m) => m.type));
  const bars = STATS_PRIORITY.filter((t) => available.has(t)).slice(0, 3);
  const durationTypes = TIMER_TYPES.filter((t) => available.has(t));
  return { bars, intervals: bars, durationTypes, hasPoop: available.has('poop'), available };
}

/* ================================ 自定义 ================================ */

/** 自定义事件可选颜色（完整 Tailwind 类字符串，静态可扫描） */
export const CUSTOM_COLOR_OPTIONS = [
  'bg-stone-100 text-stone-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-orange-100 text-orange-700',
  'bg-sky-100 text-sky-700',
  'bg-cyan-100 text-cyan-700',
  'bg-teal-100 text-teal-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-lime-100 text-lime-700',
  'bg-blue-100 text-blue-700',
  'bg-yellow-100 text-yellow-800',
  'bg-slate-100 text-slate-700',
];

/** 自定义事件可选字段 */
export const CUSTOM_FIELD_OPTIONS = ['durationMin', 'note'];

/* ================================ 描述（保持既有契约） ================================ */

/** 便便性状候选 */
export const POOP_FORMS = ['正常', '偏软', '腹泻', '便秘', '带血'];

/** 便便颜色候选 */
export const POOP_COLORS = ['棕', '深棕', '黄', '黑', '绿', '带血'];

/**
 * 生成一条事件记录的一句话摘要，例如 "30 分钟"、"偏软 · 深棕"。
 * 时长段统一走 formatDuration()（取整到分钟）。
 * @param {object} event
 * @returns {string}
 */
export function describeEvent(event) {
  if (!event) return '';
  const parts = [];
  if (event.durationMin != null && event.durationMin !== '') {
    const text = formatDuration(event.durationMin);
    if (text) parts.push(text);
  }
  if (event.amount != null && event.amount !== '') {
    parts.push(`${event.amount}${event.unit || ''}`);
  }
  if (event.poopForm) parts.push(event.poopForm);
  if (event.poopColor) parts.push(event.poopColor);
  if (event.note) parts.push(event.note);
  // 有照片时追加相机标记，时间轴一眼可见「有几张图」
  if (Array.isArray(event.photoIds) && event.photoIds.length > 0) {
    parts.push(`📷${event.photoIds.length}`);
  }
  return parts.join(' · ');
}
