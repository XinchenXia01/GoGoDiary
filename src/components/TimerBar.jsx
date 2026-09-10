import React from 'react';
import { resolveEventMeta } from '../lib/eventTypes.js';
import { pad2 } from '../lib/format.js';

/**
 * 毫秒 → "MM:SS"（超过 1 小时显示 "H:MM:SS"）。
 * @param {number} ms
 * @returns {string}
 */
function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/**
 * 记录页顶部「计时进行中」横幅：物种化事件名 + 实时已用时长 + 「结束」按钮。
 * 会话类型可能已被隐藏或换物种后不可见，仍用 resolveEventMeta 取名，保证会话可正常收尾。
 * @param {object} props
 * @param {{petId: string, type: string, startTs: number} | null} props.session 计时会话
 * @param {object | null} props.pet 会话所属宠物（用于物种化 label/emoji）
 * @param {number} props.now 当前时间戳（由 App 每秒刷新）
 * @param {() => void} props.onStop 结束计时
 */
export default function TimerBar({ session, pet, now, onStop }) {
  if (!session) return null;
  const meta = resolveEventMeta(session.type, pet);
  const elapsedMs = Math.max(0, (Number.isFinite(now) ? now : Date.now()) - session.startTs);

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-orange-500 px-4 py-3 text-white shadow-sm">
      <span className="animate-pulse text-2xl leading-none" aria-hidden="true">
        ⏱
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          进行中 · {meta.emoji} {meta.label}
          {pet ? <span className="ml-1 font-normal opacity-80">（{pet.name}）</span> : null}
        </p>
        <p className="mt-0.5 text-xs tabular-nums opacity-90">已用 {formatElapsed(elapsedMs)}</p>
      </div>
      <button
        type="button"
        onClick={onStop}
        className="h-10 shrink-0 rounded-xl bg-white px-4 text-sm font-semibold text-orange-600 active:bg-orange-50"
      >
        结束
      </button>
    </div>
  );
}
