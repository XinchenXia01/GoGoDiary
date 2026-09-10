import React from 'react';
import { getStatsMetrics, resolveEventMeta } from '../lib/eventTypes.js';
import {
  addDays,
  formatDuration,
  formatGapSince,
  formatShortDate,
  formatTime,
  todayKey,
  toDateKey,
  weekdayCN,
} from '../lib/format.js';

/**
 * 柱状图填充色（**完整 Tailwind 类字符串**，静态可扫描）。
 * 与事件无关，只与 type 对应；未知 type 用灰色兜底。
 */
const BAR_COLORS = {
  walk: 'bg-emerald-400',
  flight: 'bg-sky-400',
  meal: 'bg-amber-400',
  poop: 'bg-yellow-500',
  water: 'bg-sky-300',
  clean: 'bg-lime-400',
  waterChange: 'bg-blue-400',
  play: 'bg-teal-400',
  sunbask: 'bg-orange-400',
  cuddle: 'bg-pink-400',
  med: 'bg-rose-400',
  testWater: 'bg-cyan-400',
};
const FALLBACK_BAR = 'bg-stone-400';

const BAR_MAX_PX = 88; // 柱子最大高度

/**
 * 统计视图：按物种动态选指标 —— 最近 7 天计数（纯 CSS 柱状图）+ 间隔卡片 + 外出/放风总时长。
 * 无对应指标的物种自动隐藏相关卡片（如鱼无"便便/外出"）。
 * @param {object} props
 * @param {object[]} props.events 当前宠物的全部事件
 * @param {object} [props.pet] 当前宠物（用于物种化指标与 label/emoji）
 * @param {string} props.petName 当前宠物名（用于空态文案与统计范围）
 */
export default function StatsView({ events, pet, petName }) {
  const kind = pet && pet.kind ? pet.kind : 'dog';
  // 缺省 pet 时构造最小 viewPet，保证 resolveEventMeta 能取到物种化 label（如 dog 的「遛狗」）
  const viewPet = pet && pet.kind ? pet : { kind };
  const metrics = getStatsMetrics(kind);
  const barTypes = metrics.bars;
  const durationTypes = metrics.durationTypes;

  const today = todayKey();

  // 最近 7 天（含今天）的日期键
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    days.push(addDays(today, -i));
  }
  const daySet = new Set(days);

  // 按天聚合（只统计柱状图指标）
  const byDay = {};
  days.forEach((key) => {
    byDay[key] = { total: 0 };
    barTypes.forEach((t) => {
      byDay[key][t] = 0;
    });
  });
  events.forEach((e) => {
    const key = toDateKey(e.ts);
    if (!byDay[key]) return;
    if (byDay[key][e.type] === undefined) return;
    byDay[key][e.type] += 1;
    byDay[key].total += 1;
  });

  const maxTotal = days.reduce((max, key) => Math.max(max, byDay[key].total), 0) || 1;
  const weekTotals = barTypes.map((type) => ({
    type,
    ...resolveEventMeta(type, viewPet),
    count: days.reduce((sum, key) => sum + byDay[key][type], 0),
  }));
  const hasWeekData = days.some((key) => byDay[key].total > 0);

  /** 取某类型最近一次事件的时间戳；没有返回 null */
  const lastTsOf = (type) => {
    let result = null;
    events.forEach((e) => {
      if (e.type !== type) return;
      if (result === null || e.ts > result) result = e.ts;
    });
    return result;
  };

  const todayCount = (type) =>
    events.filter((e) => e.type === type && toDateKey(e.ts) === today).length;

  const now = Date.now();

  // ---------- 外出/放风总时长（Σ durationMin over durationTypes，近 7 天） ----------
  const weekDurationMin = events.reduce((sum, e) => {
    if (durationTypes.indexOf(e.type) === -1) return sum;
    if (!daySet.has(toDateKey(e.ts))) return sum;
    const d = Number(e.durationMin);
    return Number.isFinite(d) ? sum + d : sum;
  }, 0);

  // 最近一次外出/放风（取 durationTypes 中最新一条带时长的记录）
  let lastDurationEvent = null;
  events.forEach((e) => {
    if (durationTypes.indexOf(e.type) === -1) return;
    const d = Number(e.durationMin);
    if (!Number.isFinite(d)) return;
    if (!lastDurationEvent || e.ts > lastDurationEvent.ts) lastDurationEvent = e;
  });
  const durationLabel = durationTypes.length ? resolveEventMeta(durationTypes[0], viewPet).label : '外出';

  return (
    <div className="space-y-4">
      {/* 最近 7 天柱状图 */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-stone-800">最近 7 天</h2>
          {weekTotals.length > 0 ? (
            <span className="text-xs text-stone-400">
              {weekTotals.map((t) => `${t.emoji} ${t.label}`).join(' · ')}
            </span>
          ) : null}
        </div>

        {!hasWeekData ? (
          <p className="py-8 text-center text-sm text-stone-400">最近 7 天还没有记录</p>
        ) : (
          <>
            {/* 柱子：flex 等分 + 内层堆叠，宽度自适应不会溢出 */}
            <div className="mt-3 flex items-end gap-1.5">
              {days.map((key) => {
                const day = byDay[key];
                const barPx = day.total === 0 ? 0 : Math.max(10, Math.round((day.total / maxTotal) * BAR_MAX_PX));
                return (
                  <div key={key} className="flex min-w-0 flex-1 flex-col items-center">
                    <span className="mb-1 h-4 text-[11px] font-semibold tabular-nums text-stone-500">
                      {day.total > 0 ? day.total : ''}
                    </span>
                    <div className="flex h-[88px] w-full items-end justify-center">
                      {day.total === 0 ? (
                        <div className="h-1.5 w-full rounded-full bg-stone-100" />
                      ) : (
                        <div
                          className="flex w-full flex-col-reverse overflow-hidden rounded-lg"
                          style={{ height: `${barPx}px` }}
                        >
                          {barTypes.map((type) =>
                            day[type] > 0 ? (
                              <div
                                key={type}
                                className={BAR_COLORS[type] || FALLBACK_BAR}
                                style={{ height: `${(day[type] / day.total) * 100}%` }}
                              />
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                    <span className="mt-1.5 text-[11px] leading-none text-stone-500">
                      {formatShortDate(key)}
                    </span>
                    <span className="mt-0.5 text-[10px] leading-none text-stone-400">
                      {key === today ? '今天' : weekdayCN(key)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-stone-100 pt-2 text-xs text-stone-500">
              {weekTotals.map((t) => (
                <span key={t.type}>
                  {t.emoji} {t.label} <b className="text-stone-700">{t.count}</b> 次
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 间隔卡片（按物种动态生成） */}
      {barTypes.length > 0 ? (
        <section className="grid grid-cols-2 gap-2">
          {barTypes.map((type) => {
            const meta = resolveEventMeta(type, viewPet);
            const lastTs = lastTsOf(type);
            return (
              <div key={type} className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
                <p className="text-xs text-stone-500">
                  {meta.emoji} 距上次{meta.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-stone-800">{formatGapSince(lastTs, now)}</p>
                <p className="mt-0.5 text-[11px] text-stone-400">
                  {lastTs ? `${toDateKey(lastTs) === today ? '今天' : toDateKey(lastTs)} ${formatTime(lastTs)}` : '暂无记录'}
                </p>
              </div>
            );
          })}

          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
            <p className="text-xs text-stone-500">
              📅 今日已{barTypes[0] ? resolveEventMeta(barTypes[0], viewPet).label : '记'}
              {barTypes[1] ? ` / 已${resolveEventMeta(barTypes[1], viewPet).label}` : ''}
            </p>
            <p className="mt-1 text-lg font-semibold text-stone-800">
              {todayCount(barTypes[0])}
              {barTypes[1] ? (
                <>
                  {' '}
                  <span className="text-stone-300">/</span> {todayCount(barTypes[1])}
                </>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11px] text-stone-400">
              今日共 {events.filter((e) => toDateKey(e.ts) === today).length} 条记录
            </p>
          </div>
        </section>
      ) : null}

      {/* 外出/放风总时长（仅当该物种有 walk/flight 时显示） */}
      {durationTypes.length > 0 ? (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
          <h2 className="mb-2 text-base font-semibold text-stone-800">⏱ 本周{durationLabel}总时长</h2>
          <p className="text-2xl font-bold text-stone-800">
            {weekDurationMin > 0 ? formatDuration(weekDurationMin) : '暂无记录'}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            最近一次{durationLabel}：
            {lastDurationEvent ? formatDuration(Number(lastDurationEvent.durationMin)) : '暂无记录'}
          </p>
        </section>
      ) : null}

      {!petName ? null : (
        <p className="px-1 text-xs text-stone-400">统计范围：{petName} 的全部本地记录</p>
      )}
    </div>
  );
}
