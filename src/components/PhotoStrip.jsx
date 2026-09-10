import React, { useEffect, useRef, useState } from 'react';
import { getPhoto } from '../lib/photoStore.js';

/**
 * 照片缩略图条 + 点击放大查看。
 * 职责：根据一组图片 id，从 IndexedDB 异步取 Blob 并渲染 <img>；
 * 用 useEffect 管理 objectURL 的生命周期，卸载时 revokeObjectURL，避免内存泄漏。
 * @param {object} props
 * @param {string[]} props.photoIds 图片 id 列表（来自事件的 photoIds）
 */
export default function PhotoStrip({ photoIds }) {
  const [items, setItems] = useState([]); // [{ id, url }]
  const [active, setActive] = useState(null); // 放大查看的 { id, url }
  const loadedRef = useRef([]); // 已创建的 objectURL，用于释放

  // 用逗号拼接作为依赖，避免数组引用变化导致反复重取
  const key = Array.isArray(photoIds) ? photoIds.join(',') : '';

  useEffect(() => {
    if (!key) {
      // 没有照片：释放上一轮的 url
      loadedRef.current.forEach((u) => URL.revokeObjectURL(u));
      loadedRef.current = [];
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    const ids = key.split(',');
    Promise.all(
      ids.map(async (id) => {
        try {
          const blob = await getPhoto(id);
          if (blob && !cancelled) return { id, url: URL.createObjectURL(blob) };
        } catch (err) {
          // 读取失败（如图片已丢失）：忽略该张
        }
        return null;
      })
    ).then((list) => {
      if (cancelled) {
        // 已取消：刚创建的 url 也要释放
        list.forEach((it) => {
          if (it) URL.revokeObjectURL(it.url);
        });
        return;
      }
      // 释放上一轮创建的 url，避免泄漏
      loadedRef.current.forEach((u) => URL.revokeObjectURL(u));
      const next = list.filter(Boolean);
      loadedRef.current = next.map((i) => i.url);
      setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // 组件卸载时释放所有 objectURL
  useEffect(() => {
    return () => {
      loadedRef.current.forEach((u) => URL.revokeObjectURL(u));
      loadedRef.current = [];
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <>
      {/* 缩略图行：小图，点击放大 */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setActive(it)}
            className="h-14 w-14 overflow-hidden rounded-lg bg-stone-100 ring-1 ring-stone-200 active:opacity-80"
            aria-label="查看照片"
          >
            <img src={it.url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {/* 放大查看：全屏遮罩，点击任意处关闭 */}
      {active ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 animate-fade-in"
          onClick={() => setActive(null)}
        >
          <img src={active.url} alt="" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
          <button
            type="button"
            onClick={() => setActive(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl text-white"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
}
