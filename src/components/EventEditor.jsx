import React, { useEffect, useRef, useState } from 'react';
import { POOP_COLORS, POOP_FORMS, getVisibleEventTypes, resolveEventMeta } from '../lib/eventTypes.js';
import { fromDatetimeLocal, toDatetimeLocal } from '../lib/format.js';
import { newId } from '../lib/storage.js';
import { putPhoto, deletePhoto, getPhoto, compressImageFile } from '../lib/photoStore.js';

/**
 * 事件编辑面板（底部 sheet）
 * 可改时间、切类型、填备注、加照片，并按当前类型动态显示对应字段。
 * 类型网格按「当前宠物物种」过滤；若被编辑的老事件 type 不在当前物种集内，仍保留可选（避免老记录类型被吞）。
 * @param {object} props
 * @param {object | null} props.event 正在编辑的事件；null 表示关闭
 * @param {object | null} [props.pet] 当前宠物（用于物种化类型集与 label/emoji）
 * @param {(event: object) => void} props.onSave 保存
 * @param {(id: string) => void} props.onDelete 删除
 * @param {() => void} props.onClose 关闭
 * @param {(message: string) => void} [props.onError] 图片存储失败时的错误回调（用于弹 toast）
 */
export default function EventEditor({ event, pet, onSave, onDelete, onClose, onError }) {
  // 本地草稿，保存时才回写
  const [draft, setDraft] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  // 已选照片的展示态：[{ id, url }]，url 由 IndexedDB 取出的 Blob 生成 objectURL
  const [photoItems, setPhotoItems] = useState([]);
  // 正在压缩 / 保存图片中的计数，用于禁用保存按钮避免重复提交
  const [savingPhoto, setSavingPhoto] = useState(false);

  // 用 ref 持有最新 photoItems，便于卸载时精准释放 objectURL
  const itemsRef = useRef([]);
  itemsRef.current = photoItems;

  // 每次打开/切换编辑对象时重建草稿，并异步载入已有照片缩略图
  useEffect(() => {
    if (!event) {
      // 释放上一轮缩略图 objectURL
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url));
      itemsRef.current = [];
      setDraft(null);
      setConfirmDelete(false);
      setError('');
      setPhotoItems([]);
      return undefined;
    }
    // 载入新事件前先释放上一轮的缩略图 objectURL，避免内存泄漏
    itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url));
    itemsRef.current = [];
    setDraft({
      ...event,
      photoIds: Array.isArray(event.photoIds) ? event.photoIds : [],
      timeValue: toDatetimeLocal(event.ts),
    });
    setConfirmDelete(false);
    setError('');

    // 载入已有照片：从 IndexedDB 取 Blob → objectURL
    const ids = Array.isArray(event.photoIds) ? event.photoIds : [];
    let cancelled = false;
    Promise.all(
      ids.map(async (pid) => {
        try {
          const blob = await getPhoto(pid);
          if (blob && !cancelled) return { id: pid, url: URL.createObjectURL(blob) };
        } catch (err) {
          /* 读取失败忽略 */
        }
        return null;
      })
    ).then((list) => {
      if (!cancelled) setPhotoItems(list.filter(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, [event]);

  // 卸载时释放所有缩略图 objectURL，避免内存泄漏
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url));
    };
  }, []);

  if (!event || !draft) return null;

  const meta = resolveEventMeta(draft.type, pet);

  // 类型网格候选：物种可见集；若被编辑的老事件 type 不在其中，则补充保留（老记录不丢类型）
  const typeOptions = getVisibleEventTypes(pet);
  if (!typeOptions.some((t) => t.type === draft.type)) {
    typeOptions.push(resolveEventMeta(draft.type, pet));
  }

  /** 更新单个字段 */
  const patch = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  /** 切换类型时按新类型重置单位与无关字段 */
  const changeType = (type) => {
    const newMeta = resolveEventMeta(type, pet);
    setDraft((prev) => ({
      ...prev,
      type,
      unit: newMeta.unit || '',
      amount: newMeta.fields.indexOf('amount') !== -1 ? prev.amount : null,
      durationMin: newMeta.fields.indexOf('durationMin') !== -1 ? prev.durationMin : null,
      poopForm: newMeta.fields.indexOf('poopForm') !== -1 ? prev.poopForm : '',
      poopColor: newMeta.fields.indexOf('poopColor') !== -1 ? prev.poopColor : '',
    }));
  };

  /** 选中图片：压缩 → 存 IndexedDB → 记录 id 与缩略图 */
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setSavingPhoto(true);
    for (const file of files) {
      try {
        const compressed = await compressImageFile(file);
        const id = newId();
        await putPhoto(id, compressed); // 先落库成功，再记 id，保证 photoIds 与实际存图一一对应
        const url = URL.createObjectURL(compressed);
        setPhotoItems((prev) => [...prev, { id, url }]);
        setDraft((prev) => (prev ? { ...prev, photoIds: [...(prev.photoIds || []), id] } : prev));
      } catch (err) {
        // 压缩或存储失败（如隐私环境无 IndexedDB）：跳过该图并提示
        if (onError) onError('这张照片未能保存（当前环境不支持本地图片）');
      }
    }
    setSavingPhoto(false);
  };

  /** 删除某张已选照片：从 IndexedDB 删除 + 移除缩略图 + 移除 id */
  const removePhoto = async (id) => {
    try {
      await deletePhoto(id);
    } catch (err) {
      /* 忽略删除失败 */
    }
    setPhotoItems((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
    setDraft((prev) => (prev ? { ...prev, photoIds: (prev.photoIds || []).filter((x) => x !== id) } : prev));
  };

  const handleSave = () => {
    const ts = fromDatetimeLocal(draft.timeValue);
    if (!Number.isFinite(ts)) {
      setError('时间格式不正确，请重新选择');
      return;
    }
    const amountRaw = draft.amount;
    const amount = amountRaw === '' || amountRaw == null ? null : Number(amountRaw);
    if (amount != null && !Number.isFinite(amount)) {
      setError('数量必须是数字');
      return;
    }
    const durationRaw = draft.durationMin;
    const durationMin = durationRaw === '' || durationRaw == null ? null : Number(durationRaw);
    if (durationMin != null && !Number.isFinite(durationMin)) {
      setError('时长必须是数字');
      return;
    }

    onSave({
      ...draft,
      ts,
      amount,
      durationMin,
      note: typeof draft.note === 'string' ? draft.note : '',
      unit: draft.unit || '',
      // 保存时把当前 photoIds 一并写回；此时图片已在 IndexedDB 落库，一一对应
      photoIds: Array.isArray(draft.photoIds) ? draft.photoIds : [],
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(draft.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* 遮罩：点击关闭 */}
      <div className="absolute inset-0 animate-fade-in bg-stone-900/40" onClick={onClose} />

      {/* 面板 */}
      <div className="relative max-h-[88vh] w-full animate-sheet-up overflow-y-auto rounded-t-3xl bg-cream px-4 pb-safe pt-3 shadow-xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-stone-300" />

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-stone-800">编辑记录</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-full px-3 text-sm text-stone-500 active:bg-stone-100"
          >
            取消
          </button>
        </div>

        {/* 时间 */}
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-stone-500">时间</span>
          <input
            type="datetime-local"
            value={draft.timeValue}
            onChange={(e) => patch('timeValue', e.target.value)}
            className="h-11 w-full rounded-xl bg-white px-3 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </label>

        {/* 类型：紧凑网格 */}
        <div className="mb-3">
          <span className="mb-1 block text-xs font-medium text-stone-500">类型</span>
          <div className="grid grid-cols-5 gap-1.5">
            {typeOptions.map((item) => {
              const active = item.type === draft.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => changeType(item.type)}
                  className={[
                    'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] transition',
                    active ? 'bg-orange-500 text-white' : `${item.color} active:opacity-70`,
                  ].join(' ')}
                >
                  <span className="text-lg leading-none">{item.emoji}</span>
                  <span className="leading-none">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 当前类型专属字段：跟着类型动态显示 */}
        {meta.fields.indexOf('durationMin') !== -1 ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-stone-500">时长（分钟）</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={draft.durationMin == null ? '' : draft.durationMin}
              onChange={(e) => patch('durationMin', e.target.value)}
              placeholder="例如 30"
              className="h-11 w-full rounded-xl bg-white px-3 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </label>
        ) : null}

        {meta.fields.indexOf('amount') !== -1 ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-stone-500">
              数量（{meta.unit || '无单位'}）
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={draft.amount == null ? '' : draft.amount}
              onChange={(e) => patch('amount', e.target.value)}
              placeholder={meta.unit === 'kg' ? '例如 12.5' : '例如 100'}
              className="h-11 w-full rounded-xl bg-white px-3 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </label>
        ) : null}

        {meta.fields.indexOf('poopForm') !== -1 ? (
          <div className="mb-3">
            <span className="mb-1 block text-xs font-medium text-stone-500">性状</span>
            <div className="flex flex-wrap gap-1.5">
              {POOP_FORMS.map((form) => (
                <button
                  key={form}
                  type="button"
                  onClick={() => patch('poopForm', draft.poopForm === form ? '' : form)}
                  className={[
                    'h-9 rounded-full px-3 text-sm transition',
                    draft.poopForm === form
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-stone-600 ring-1 ring-stone-200 active:bg-stone-100',
                  ].join(' ')}
                >
                  {form}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {meta.fields.indexOf('poopColor') !== -1 ? (
          <div className="mb-3">
            <span className="mb-1 block text-xs font-medium text-stone-500">颜色</span>
            <div className="flex flex-wrap gap-1.5">
              {POOP_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => patch('poopColor', draft.poopColor === color ? '' : color)}
                  className={[
                    'h-9 rounded-full px-3 text-sm transition',
                    draft.poopColor === color
                      ? 'bg-orange-500 text-white'
                      : 'bg-white text-stone-600 ring-1 ring-stone-200 active:bg-stone-100',
                  ].join(' ')}
                >
                  {color}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* 照片：在备注上方 */}
        <div className="mb-3">
          <span className="mb-1 block text-xs font-medium text-stone-500">照片</span>
          {/* 已选缩略图网格 */}
          {photoItems.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {photoItems.map((it) => (
                <div key={it.id} className="relative h-20 w-20 overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
                  <img src={it.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(it.id)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900/70 text-xs text-white active:bg-stone-900"
                    aria-label="删除照片"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-orange-600 ring-1 ring-orange-200 active:bg-orange-50">
            <span aria-hidden="true">📷</span>
            <span>{savingPhoto ? '处理中…' : '拍照 / 选图（可多选）'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              disabled={savingPhoto}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = ''; // 允许重复选择同一文件
              }}
            />
          </label>
        </div>

        {/* 备注：所有类型都可填 */}
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-stone-500">备注</span>
          <textarea
            rows={2}
            value={draft.note || ''}
            onChange={(e) => patch('note', e.target.value)}
            placeholder="写点什么…（可留空）"
            className="w-full resize-none rounded-xl bg-white px-3 py-2 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </label>

        {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            className={[
              'h-12 rounded-xl px-4 text-base font-medium transition',
              confirmDelete ? 'bg-rose-500 text-white' : 'bg-white text-rose-500 ring-1 ring-rose-200',
            ].join(' ')}
          >
            {confirmDelete ? '再点一次确认删除' : '删除'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="h-12 flex-1 rounded-xl bg-orange-500 text-base font-semibold text-white transition active:bg-orange-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
