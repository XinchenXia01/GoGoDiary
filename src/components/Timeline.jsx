import React, { useEffect, useRef, useState } from 'react';
import { describeEvent, resolveEventDisplay } from '../lib/eventTypes.js';
import { formatTime } from '../lib/format.js';
import PhotoStrip from './PhotoStrip.jsx';

/**
 * 当天时间轴：时间 + emoji + 类型名 + 详情摘要（+ 照片缩略图），右侧删除（二次确认）。
 * 类型名/emoji 走 resolveEventDisplay(event, pet)：物种化覆盖 + 已删除自定义的 label 快照兜底。
 * @param {object} props
 * @param {object[]} props.events 当天事件（已排序、已按宠物过滤）
 * @param {object | null} [props.pet] 当前宠物（用于物种化 label/emoji）
 * @param {'desc' | 'asc'} props.order 排序方向
 * @param {() => void} props.onToggleOrder 切换排序
 * @param {(event: object) => void} props.onEdit 点击某条打开编辑
 * @param {(id: string) => void} props.onDelete 删除
 */
export default function Timeline({ events, pet, order, onToggleOrder, onEdit, onDelete }) {
  // 待二次确认删除的事件 id
  const [confirmId, setConfirmId] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const askDelete = (id) => {
    setConfirmId(id);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    // 3 秒无操作自动取消确认态，避免误触
    timerRef.current = window.setTimeout(() => setConfirmId(''), 3000);
  };

  const confirmDelete = (id) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setConfirmId('');
    onDelete(id);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-stone-500">时间轴 · {events.length} 条</h2>
        <button
          type="button"
          onClick={onToggleOrder}
          className="flex h-8 items-center gap-1 rounded-full bg-white px-3 text-xs text-stone-500 ring-1 ring-stone-200 active:bg-stone-100"
        >
          {order === 'desc' ? '最新在前' : '最早在前'}
          <span aria-hidden="true">⇅</span>
        </button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-8 text-center ring-1 ring-stone-100">
          <div className="mb-2 text-3xl">🌤️</div>
          <p className="text-sm text-stone-500">这一天还很安静，什么都没有记</p>
          <p className="mt-1 text-xs text-stone-400">点上方按钮一键记录，或切换到其他日期看看</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => {
            const meta = resolveEventDisplay(event, pet);
            const detail = describeEvent(event);
            const confirming = confirmId === event.id;
            const hasPhotos = Array.isArray(event.photoIds) && event.photoIds.length > 0;
            return (
              <li
                key={event.id}
                className="rounded-2xl bg-white px-3 py-2.5 ring-1 ring-stone-100"
              >
                <div className="flex items-center gap-3">
                  {/* 点击主体进入编辑 */}
                  <button
                    type="button"
                    onClick={() => onEdit(event)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-stone-500">
                      {formatTime(event.ts)}
                    </span>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${meta.color}`}
                    >
                      {meta.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-stone-800">{meta.label}</span>
                      {detail ? (
                        <span className="block truncate text-xs text-stone-500">{detail}</span>
                      ) : null}
                    </span>
                  </button>

                  {/* 删除：第一次点变红要求确认，第二次才真正删除 */}
                  <button
                    type="button"
                    onClick={() => (confirming ? confirmDelete(event.id) : askDelete(event.id))}
                    className={[
                      'flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2 text-xs font-medium transition',
                      confirming ? 'bg-rose-500 text-white' : 'text-stone-300 active:bg-stone-100',
                    ].join(' ')}
                    aria-label={confirming ? '确认删除' : '删除'}
                  >
                    {confirming ? '确认删除' : '🗑'}
                  </button>
                </div>

                {/* 照片缩略图行（与编辑按钮平级，有图才显示） */}
                {hasPhotos ? <PhotoStrip photoIds={event.photoIds} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
