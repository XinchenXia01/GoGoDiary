/**
 * src/lib/format.js 纯函数测试
 * 重点：本地时区正确性（绝不走 toISOString / UTC）
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays,
  dateToKey,
  endOfDay,
  formatBytes,
  formatDateCN,
  formatGap,
  formatGapSince,
  formatShortDate,
  formatTime,
  fromDatetimeLocal,
  isToday,
  pad2,
  startOfDay,
  toDatetimeLocal,
  toDateKey,
  todayKey,
  weekdayCN,
} from '../src/lib/format.js';

/* ------------------------------ pad2 / 基础 ------------------------------ */

test('pad2: 补零与不补零', () => {
  assert.equal(pad2(0), '00');
  assert.equal(pad2(7), '07');
  assert.equal(pad2(12), '12');
  assert.equal(pad2(2024), '2024');
});

/* ------------------------------ 本地时区 ------------------------------ */

test('toDateKey: 使用本地时区而非 UTC', () => {
  // 东八区 2026-09-07 23:59:59 —— UTC 上是 15:59:59，同一天，尚不足以区分
  // 关键边界：UTC 与本地跨日
  const lateNight = new Date(2026, 8, 7, 23, 59, 59).getTime();
  const earlyNextDay = new Date(2026, 8, 8, 0, 0, 1).getTime();

  assert.equal(toDateKey(lateNight), '2026-09-07');
  assert.equal(toDateKey(earlyNextDay), '2026-09-08');
  assert.notEqual(toDateKey(lateNight), toDateKey(earlyNextDay));
});

test('toDateKey: 跨零点必须落到两个不同的日期键', () => {
  const before = new Date(2026, 0, 1, 23, 59, 59, 999).getTime();
  const after = new Date(2026, 0, 2, 0, 0, 0, 0).getTime();
  assert.equal(toDateKey(before), '2026-01-01');
  assert.equal(toDateKey(after), '2026-01-02');
});

test('toDateKey: 一天内的首尾时刻落到同一个键', () => {
  const start = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
  const end = new Date(2026, 5, 15, 23, 59, 59, 999).getTime();
  assert.equal(toDateKey(start), toDateKey(end));
  assert.equal(toDateKey(start), '2026-06-15');
});

test('toDateKey: 与 UTC 日期不同的场景（东八区早 8 点前）', () => {
  // 本地 2026-03-01 00:30 -> UTC 2026-02-28 16:30。
  // 若实现误用 toISOString().slice(0,10)，会得到 2026-02-28（错误）。
  const ts = new Date(2026, 2, 1, 0, 30).getTime();
  assert.equal(toDateKey(ts), '2026-03-01');
  assert.notEqual(toDateKey(ts), new Date(ts).toISOString().slice(0, 10));
});

test('dateToKey / todayKey / isToday 一致性', () => {
  const d = new Date(2026, 8, 7, 12, 0, 0);
  assert.equal(dateToKey(d), '2026-09-07');
  assert.equal(todayKey(), toDateKey(Date.now()));
  assert.equal(isToday(todayKey()), true);
  assert.equal(isToday('1999-01-01'), false);
});

test('startOfDay / endOfDay 落在同一天且首尾正确', () => {
  // 注意：2026 不是闰年，闰日用例必须用 2024-02-29
  const s = startOfDay('2024-02-29');
  const e = endOfDay('2024-02-29');
  assert.equal(new Date(s).getHours(), 0);
  assert.equal(new Date(s).getMinutes(), 0);
  assert.equal(new Date(e).getHours(), 23);
  assert.equal(new Date(e).getMinutes(), 59);
  assert.equal(toDateKey(s), '2024-02-29');
  assert.equal(toDateKey(e), '2024-02-29');
  assert.ok(e > s);
  assert.equal(e - s, 24 * 3600 * 1000 - 1);
});

/* ------------------------------ addDays ------------------------------ */

test('addDays: 跨月 1/31 + 1 = 2/1', () => {
  assert.equal(addDays('2024-01-31', 1), '2024-02-01');
});

test('addDays: 跨年 12/31 + 1 = 次年 1/1', () => {
  assert.equal(addDays('2024-12-31', 1), '2025-01-01');
});

test('addDays: 负数回退 3/1 - 1（闰年 → 2/29）', () => {
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
});

test('addDays: 负数回退 3/1 - 1（平年 → 2/28）', () => {
  assert.equal(addDays('2023-03-01', -1), '2023-02-28');
});

test('addDays: 跨闰日 2/28 + 1', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
});

test('addDays: 0 天返回自身，多天累加正确', () => {
  assert.equal(addDays('2026-09-07', 0), '2026-09-07');
  assert.equal(addDays('2026-09-07', 7), '2026-09-14');
  assert.equal(addDays('2026-09-07', -7), '2026-08-31');
});

test('addDays: 连续 7 天可生成最近一周（统计视图用法）', () => {
  const today = '2026-03-01';
  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDays(today, -i));
  assert.deepEqual(days, [
    '2026-02-23',
    '2026-02-24',
    '2026-02-25',
    '2026-02-26',
    '2026-02-27',
    '2026-02-28',
    '2026-03-01',
  ]);
});

/* ------------------------------ datetime-local ------------------------------ */

test('toDatetimeLocal / fromDatetimeLocal 往返一致', () => {
  const samples = [
    new Date(2026, 8, 7, 9, 5).getTime(),
    new Date(2026, 0, 1, 0, 0).getTime(),
    new Date(2026, 11, 31, 23, 59).getTime(),
    new Date(2024, 1, 29, 12, 30).getTime(),
  ];
  samples.forEach((ts) => {
    const text = toDatetimeLocal(ts);
    assert.equal(fromDatetimeLocal(text), ts, `往返失败：${text}`);
  });
});

test('toDatetimeLocal: 格式为 YYYY-MM-DDTHH:mm 且为本地时间', () => {
  const ts = new Date(2026, 8, 7, 9, 5).getTime();
  assert.equal(toDatetimeLocal(ts), '2026-09-07T09:05');
  assert.match(toDatetimeLocal(ts), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('fromDatetimeLocal: 非法输入返回 NaN', () => {
  assert.ok(Number.isNaN(fromDatetimeLocal('')));
  assert.ok(Number.isNaN(fromDatetimeLocal(null)));
  assert.ok(Number.isNaN(fromDatetimeLocal('undefined')));
  assert.ok(Number.isNaN(fromDatetimeLocal('2026/09/07 09:05')));
  assert.ok(Number.isNaN(fromDatetimeLocal('不是时间')));
});

/* ------------------------------ formatGap ------------------------------ */

test('formatGap: 不足 1 分钟 / 刚刚', () => {
  assert.equal(formatGap(0), '刚刚');
  assert.equal(formatGap(59 * 1000), '刚刚');
});

test('formatGap: 不足 1 小时', () => {
  assert.equal(formatGap(60 * 1000), '1 分钟');
  assert.equal(formatGap(35 * 60 * 1000), '35 分钟');
  assert.equal(formatGap(59 * 60 * 1000 + 59_000), '59 分钟');
});

test('formatGap: 超过 1 小时但不足 1 天', () => {
  assert.equal(formatGap(60 * 60 * 1000), '1 小时');
  assert.equal(formatGap(90 * 60 * 1000), '1 小时 30 分');
  assert.equal(formatGap(23 * 3600 * 1000 + 59 * 60 * 1000), '23 小时 59 分');
});

test('formatGap: 超过 1 天', () => {
  assert.equal(formatGap(24 * 3600 * 1000), '1 天');
  assert.equal(formatGap(25 * 3600 * 1000), '1 天 1 小时');
  assert.equal(formatGap(50 * 3600 * 1000), '2 天 2 小时');
});

test('formatGap: 从未记录过（空输入）应显示占位文案', () => {
  assert.equal(formatGap(null), '暂无记录');
  assert.equal(formatGap(undefined), '暂无记录');
  assert.equal(formatGap(NaN), '暂无记录');
  assert.equal(formatGap(-1), '暂无记录');
  assert.equal(formatGap(Infinity), '暂无记录');
});

test('formatGapSince: 从未记录过（lastTs 为 null）应显示"暂无记录"，不会算出巨大天数', () => {
  // 需求：StatsView 已改用 formatGapSince(lastTs, now) 封装。
  // lastTs 为 null/undefined 时统一返回占位文案，而非把 null 当 0 参与减法。
  const now = Date.now();
  assert.equal(formatGapSince(null, now), '暂无记录');
  assert.equal(formatGapSince(undefined, now), '暂无记录');
  // 反向验证：formatGap 自身不处理 null（保持原函数不动，由上层统一调用 formatGapSince 兜底）
  assert.notEqual(
    formatGap(now - null),
    '暂无记录',
    'formatGap(now-null) 仍会给出巨大天数，必须由 formatGapSince 兜底'
  );
});

test('formatGapSince: 有记录时正确计算间隔', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatGapSince(now - 2 * 3600 * 1000, now), '2 小时');
  assert.equal(formatGapSince(now - 90 * 60 * 1000, now), '1 小时 30 分');
  assert.equal(formatGapSince(now - 3 * 24 * 3600 * 1000, now), '3 天');
});

/* ------------------------------ 其他格式化 ------------------------------ */

test('formatTime: 本地 24 小时制补零', () => {
  assert.equal(formatTime(new Date(2026, 8, 7, 9, 5).getTime()), '09:05');
  assert.equal(formatTime(new Date(2026, 8, 7, 0, 0).getTime()), '00:00');
  assert.equal(formatTime(new Date(2026, 8, 7, 23, 59).getTime()), '23:59');
});

test('formatDateCN / formatShortDate / weekdayCN', () => {
  assert.equal(formatDateCN('2026-09-07'), '2026 年 9 月 7 日');
  assert.equal(formatShortDate('2026-09-07'), '9/7');
  assert.equal(weekdayCN('2026-09-07'), '周一'); // 2026-09-07 是周一
  assert.equal(weekdayCN('2026-09-06'), '周日');
});

test('formatBytes: 边界与单位切换', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(-5), '0 B');
  assert.equal(formatBytes(NaN), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1024 * 1024), '1.00 MB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
});
