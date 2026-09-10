import React from 'react';

/**
 * 今日概览：一行横向小卡片，只显示当天次数 > 0 的类型。
 * @param {object} props
 * @param {object[]} props.counts [{ type, label, emoji, color, count }]
 */
export default function DaySummary({ counts }) {
  const visible = counts.filter((c) => c.count > 0);

  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold text-stone-500">今日概览</h2>
      {visible.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-stone-400 ring-1 ring-stone-100">
          今天还没有记录，点上面的按钮记一笔吧 🐾
        </p>
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {visible.map((c) => (
            <div
              key={c.type}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${c.color}`}
            >
              <span className="text-base leading-none">{c.emoji}</span>
              <span>{c.label}</span>
              <span className="font-bold">{c.count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
