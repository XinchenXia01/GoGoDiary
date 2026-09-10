/**
 * 时间 / 展示格式化工具
 * 全部按【本地时区】处理：判断"今天"一律用 YYYY-MM-DD 字符串比较，
 * 绝不使用 toISOString()（它会转成 UTC，在东八区会差 8 小时）。
 */

/** 数字补零到两位 */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 时间戳 → 本地日期键 "YYYY-MM-DD"
 * @param {number} ts epoch 毫秒
 * @returns {string}
 */
export function toDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Date 对象 → 本地日期键 "YYYY-MM-DD"
 * @param {Date} date
 * @returns {string}
 */
export function dateToKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 今天的日期键（本地时区） */
export function todayKey() {
  return toDateKey(Date.now());
}

/**
 * 时间戳 → "HH:MM"
 * @param {number} ts
 * @returns {string}
 */
export function formatTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 日期键 → 当天 00:00 的时间戳
 * @param {string} key "YYYY-MM-DD"
 * @returns {number}
 */
export function startOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0).getTime();
}

/**
 * 日期键 → 当天 23:59:59.999 的时间戳
 * @param {string} key "YYYY-MM-DD"
 * @returns {number}
 */
export function endOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999).getTime();
}

/**
 * 日期键加减天数
 * @param {string} key "YYYY-MM-DD"
 * @param {number} delta 正数向后，负数向前
 * @returns {string}
 */
export function addDays(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + delta);
  return dateToKey(date);
}

/**
 * 日期键 → "9月7日" 形式
 * @param {string} key
 * @returns {string}
 */
export function formatDateCN(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

/**
 * 日期键 → 星期中文 "周一"
 * @param {string} key
 * @returns {string}
 */
export function weekdayCN(key) {
  const [y, m, d] = key.split('-').map(Number);
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[new Date(y, (m || 1) - 1, d || 1).getDay()];
}

/** 日期键 → "9/7" 紧凑形式，用于统计柱状图横轴 */
export function formatShortDate(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

/**
 * 判断日期键是否为今天
 * @param {string} key
 * @returns {boolean}
 */
export function isToday(key) {
  return key === todayKey();
}

/**
 * 时间戳 → <input type="datetime-local"> 需要的本地字符串 "YYYY-MM-DDTHH:mm"
 * @param {number} ts
 * @returns {string}
 */
export function toDatetimeLocal(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

/**
 * <input type="datetime-local"> 的值 → 时间戳（本地时区解析）
 * @param {string} value "YYYY-MM-DDTHH:mm"
 * @returns {number} 非法输入返回 NaN
 */
export function fromDatetimeLocal(value) {
  if (!value) return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return NaN;
  const [, y, mo, d, h, mi] = match;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0).getTime();
}

/**
 * 毫秒差 → "X 小时 Y 分"，不足 1 分钟显示"刚刚"
 * @param {number} ms
 * @returns {string}
 */
export function formatGap(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '暂无记录';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '刚刚';
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours <= 0) return `${mins} 分钟`;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours > 0 ? `${days} 天 ${restHours} 小时` : `${days} 天`;
  }
  return mins > 0 ? `${hours} 小时 ${mins} 分` : `${hours} 小时`;
}

/**
 * 「距上次 X 多久」的统一封装。
 * 单独存在的原因：调用方很容易写成 `formatGap(now - lastTs)`，
 * 而 lastTs 为 null 时 `now - null` 会被强转成 now 本身（≈1.79e12），
 * 结果输出「20703 天」这种荒谬值。所以这里统一做空值保护。
 * @param {number | null | undefined} lastTs 上次事件发生的时间戳；没有记录时为 null
 * @param {number} [now] 当前时间戳，默认 Date.now()
 * @returns {string} 「暂无记录」或 "X 小时 Y 分"
 */
export function formatGapSince(lastTs, now) {
  const base = Number.isFinite(now) ? now : Date.now();
  if (!Number.isFinite(lastTs) || lastTs === null || lastTs === undefined) return '暂无记录';
  return formatGap(base - lastTs);
}

/**
 * 分钟数 → 可读时长（统一展示口径：取整到分钟）。
 * - `< 1`   → "不到 1 分钟"
 * - `30`    → "30 分钟"
 * - `90`    → "1 小时 30 分钟"
 * - 非法输入（NaN / 负数 / null）→ "暂无记录"
 * @param {number} minutes 时长（分钟，允许小数）
 * @returns {string}
 */
export function formatDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 0) return '暂无记录';
  const rounded = Math.round(m);
  if (rounded < 1) return '不到 1 分钟';
  if (rounded < 60) return `${rounded} 分钟`;
  const h = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest > 0 ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

/**
 * 时间区间 → "12:00–12:30"（本地时区）。
 * @param {number} startTs 开始时间戳
 * @param {number} endTs 结束时间戳
 * @returns {string} 任一非法 → 空串
 */
export function formatClockRange(startTs, endTs) {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return '';
  return `${formatTime(startTs)}–${formatTime(endTs)}`;
}

/**
 * 字节数 → 可读字符串 "12.3 KB"
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
