import React, { useEffect, useRef, useState } from 'react';
import { isTimerType } from '../lib/eventTypes.js';

/** 速记区常显的按钮数量；超出部分收进「更多」收纳格（原地展开） */
const PRIMARY_COUNT = 8;

/**
 * 速记区：事件类型大按钮网格（3 列）。
 * - 传入的 `types` 已由 App 按当前宠物物种过滤（预设 − 隐藏 + 自定义），此处只负责顺序渲染。
 * - 普通事件：点一下立即写入一条记录，按钮给出短暂 ✓ 反馈。
 * - 计时类事件（walk/flight）：按钮带 ⏱ 标识，点按进入"开始/结束"交互。
 * - 收纳策略（v1.2）：可见集长度 N ≤ 8 时全部常显；
 *   N > 8 时只常显前 8 个，第 9 格渲染「更多 · N-8」收纳格，点击原地展开第 9…N 个，
 *   再点一次收起。计时类按钮由数据层保证落在前 8，不会被挤进「更多」。
 * @param {object} props
 * @param {object[]} props.types 可见事件元数据数组（按物种裁剪，已去隐藏）
 * @param {(type: string) => void} props.onLog 普通事件一键写入
 * @param {boolean} [props.disabled] 是否禁用（例如还没有宠物）
 * @param {{petId: string, type: string, startTs: number} | null} [props.activeTimer] 进行中的计时会话
 * @param {(type: string) => void} [props.onStartTimer] 开始计时
 * @param {() => void} [props.onStopTimer] 结束计时
 */
export default function QuickLog({
  types,
  onLog,
  disabled = false,
  activeTimer = null,
  onStartTimer,
  onStopTimer,
}) {
  // 记录刚刚点击的类型，用于展示 ✓ 动画
  const [justLogged, setJustLogged] = useState('');
  // 「更多」展开态：默认收起；宠物/物种切换（types 变化）时自动复位为收起
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef(null);

  // 宠物或物种切换 → types 引用变更 → 收起展开态，回到"只显示前 8 个"
  useEffect(() => {
    setExpanded(false);
  }, [types]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = (item) => {
    if (disabled) return;
    const isTimer = isTimerType(item.type);
    if (isTimer && onStartTimer) {
      const running = activeTimer && activeTimer.type === item.type;
      if (running) {
        if (onStopTimer) onStopTimer();
        return;
      }
      onStartTimer(item.type);
      return;
    }
    onLog(item.type);
    setJustLogged(item.type);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setJustLogged(''), 700);
  };

  // N > 8 才启用收纳；展开时展示全集，收起时只展示前 8
  const hasMore = types.length > PRIMARY_COUNT;
  const restCount = Math.max(0, types.length - PRIMARY_COUNT);
  const shown = hasMore && !expanded ? types.slice(0, PRIMARY_COUNT) : types;

  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold text-stone-500">一键速记</h2>
      <div className="grid grid-cols-3 gap-2">
        {shown.map((item) => {
          const done = justLogged === item.type;
          const isTimer = isTimerType(item.type);
          const running = isTimer && activeTimer && activeTimer.type === item.type;
          return (
            <button
              key={item.type}
              type="button"
              disabled={disabled}
              onClick={() => handleClick(item)}
              className={[
                'relative flex h-[76px] flex-col items-center justify-center gap-1 rounded-2xl text-sm font-medium transition',
                item.color,
                disabled ? 'opacity-50' : 'active:scale-95',
                running ? 'ring-2 ring-orange-400' : '',
              ].join(' ')}
            >
              {isTimer && !running ? (
                <span className="absolute right-1.5 top-1 text-[10px] leading-none opacity-70">⏱</span>
              ) : null}
              {done ? (
                <span className="animate-pop-in text-2xl leading-none">✓</span>
              ) : (
                <span className="text-2xl leading-none">{running ? '⏹' : item.emoji}</span>
              )}
              <span className="text-[13px] leading-none">{running ? '结束' : item.label}</span>
            </button>
          );
        })}

        {/* 「更多」收纳格：样式与事件按钮区分（虚线边框 + 浅底），尺寸保持一致保证点击目标 ≥44px */}
        {hasMore ? (
          <button
            key="__quicklog_more__"
            type="button"
            disabled={disabled}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className={[
              'flex h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 text-sm font-medium text-stone-500 transition',
              disabled ? 'opacity-50' : 'active:scale-95 active:bg-stone-100',
            ].join(' ')}
          >
            <span className="text-2xl leading-none">{expanded ? '🔼' : '➕'}</span>
            <span className="text-[13px] leading-none">{expanded ? '收起' : `更多 · ${restCount}`}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
