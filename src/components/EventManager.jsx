import React, { useState } from 'react';
import { CUSTOM_COLOR_OPTIONS, getPresetEventTypes } from '../lib/eventTypes.js';
import { newId } from '../lib/storage.js';

/** 自定义事件可选 emoji（覆盖常见宠物相关） */
const EMOJI_OPTIONS = [
  '⭐', '🐾', '🍎', '🥕', '🌿', '🥛', '🧴', '🧼', '🧹', '💊', '🩺', '🌡️',
  '🎯', '🧸', '🪥', '🧺', '🚿', '🌊', '☀️', '🌙', '🏃', '🎵', '📸', '🐛',
];

/** 分组标题 */
const GROUP_LABELS = { base: '基础事件', special: '专属事件' };

/**
 * 事件管理：按宠物列出物种预设的显示/隐藏开关；仅「其他」物种可新建/编辑/删除自定义事件。
 * 删除自定义事件只删定义、保留历史（历史经 label 快照兜底显示）。
 * @param {object} props
 * @param {object | null} props.pet 当前管理的宠物
 * @param {(id: string, patch: object) => void} props.onUpdatePet 更新宠物字段
 */
export default function EventManager({ pet, onUpdatePet }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [formEmoji, setFormEmoji] = useState('⭐');
  const [formLabel, setFormLabel] = useState('');
  const [formColor, setFormColor] = useState(CUSTOM_COLOR_OPTIONS[0]);
  const [formDuration, setFormDuration] = useState(false);
  const [formError, setFormError] = useState('');

  if (!pet) {
    return (
      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
        <h2 className="mb-2 text-base font-semibold text-stone-800">🎛 事件管理</h2>
        <p className="text-sm text-stone-400">先添加一只宠物后，可在这里裁剪它的速记按钮。</p>
      </section>
    );
  }

  const hiddenSet = new Set(Array.isArray(pet.hiddenTypes) ? pet.hiddenTypes : []);
  const presets = getPresetEventTypes(pet.kind);
  const grouped = [
    { group: 'base', list: presets.filter((p) => p.group !== 'special') },
    { group: 'special', list: presets.filter((p) => p.group === 'special') },
  ].filter((g) => g.list.length > 0);
  const isOther = pet.kind === 'other';
  const customTypes = Array.isArray(pet.customTypes) ? pet.customTypes.slice().sort((a, b) => a.order - b.order) : [];

  /** 写入新的 hiddenTypes */
  const setHidden = (nextSet) => {
    onUpdatePet(pet.id, { hiddenTypes: Array.from(nextSet) });
  };

  const toggleType = (type) => {
    const next = new Set(hiddenSet);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setHidden(next);
  };

  const restoreDefaults = () => setHidden(new Set());

  const resetForm = () => {
    setShowForm(false);
    setEditingId('');
    setFormEmoji('⭐');
    setFormLabel('');
    setFormColor(CUSTOM_COLOR_OPTIONS[0]);
    setFormDuration(false);
    setFormError('');
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (ct) => {
    setShowForm(true);
    setEditingId(ct.id);
    setFormEmoji(ct.emoji || '⭐');
    setFormLabel(ct.label || '');
    setFormColor(CUSTOM_COLOR_OPTIONS.indexOf(ct.color) !== -1 ? ct.color : CUSTOM_COLOR_OPTIONS[0]);
    setFormDuration(Array.isArray(ct.fields) && ct.fields.indexOf('durationMin') !== -1);
    setFormError('');
  };

  const saveCustom = () => {
    const label = formLabel.trim();
    if (!label) {
      setFormError('请填写名字');
      return;
    }
    if (label.length > 6) {
      setFormError('名字最多 6 个字');
      return;
    }
    // 同宠物内不可重名（编辑时排除自身）
    const duplicated = customTypes.some((c) => c.id !== editingId && c.label === label);
    if (duplicated) {
      setFormError('已有同名事件，请换一个名字');
      return;
    }
    const fields = formDuration ? ['durationMin', 'note'] : ['note'];
    let nextCustom;
    if (editingId) {
      nextCustom = customTypes.map((c) =>
        c.id === editingId ? { ...c, label, emoji: formEmoji, color: formColor, fields } : c
      );
    } else {
      nextCustom = [
        ...customTypes,
        {
          id: `custom_${newId()}`,
          label,
          emoji: formEmoji,
          color: formColor,
          unit: '',
          fields,
          order: Date.now(),
        },
      ];
    }
    onUpdatePet(pet.id, { customTypes: nextCustom });
    resetForm();
  };

  const deleteCustom = (id) => {
    // 仅删定义，不级联删历史记录（历史经 resolveEventDisplay 用 label 快照兜底）
    onUpdatePet(pet.id, { customTypes: customTypes.filter((c) => c.id !== id) });
    if (editingId === id) resetForm();
  };

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-stone-800">🎛 事件管理</h2>
        <button
          type="button"
          onClick={restoreDefaults}
          className="h-8 rounded-full px-3 text-xs text-orange-600 ring-1 ring-orange-200 active:bg-orange-50"
        >
          恢复默认
        </button>
      </div>
      <p className="mb-3 text-xs text-stone-500">
        管理「{pet.name}」的速记按钮：关闭用不到的按钮，让速记区更清爽。
      </p>

      {/* 预设事件（基础 / 专属分组） */}
      {grouped.map((g) => (
        <div key={g.group} className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-stone-400">{GROUP_LABELS[g.group] || g.group}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {g.list.map((item) => {
              const hidden = hiddenSet.has(item.type);
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => toggleType(item.type)}
                  className={[
                    'flex h-11 items-center gap-2 rounded-xl px-3 text-sm transition',
                    hidden ? 'bg-stone-100 text-stone-400' : `${item.color} active:opacity-70`,
                  ].join(' ')}
                >
                  <span className="text-lg leading-none">{item.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  <span
                    className={[
                      'flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition',
                      hidden ? 'bg-stone-300' : 'justify-end bg-emerald-500',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    <span className="h-4 w-4 rounded-full bg-white" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* 自定义事件：仅「其他」物种 */}
      {isOther ? (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-stone-400">自定义事件</p>
            <button
              type="button"
              onClick={startCreate}
              className="h-8 rounded-full bg-orange-500 px-3 text-xs font-semibold text-white active:bg-orange-600"
            >
              ＋ 新建
            </button>
          </div>

          {customTypes.length === 0 && !showForm ? (
            <p className="rounded-xl bg-cream px-3 py-2 text-xs text-stone-400">
              还没有自定义事件，点「＋ 新建」添加专属按钮。
            </p>
          ) : null}

          <ul className="space-y-1.5">
            {customTypes.map((ct) => (
              <li key={ct.id} className="flex items-center gap-2 rounded-xl bg-cream px-2 py-1.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${ct.color}`}>
                  {ct.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-stone-700">
                  {ct.label}
                  {Array.isArray(ct.fields) && ct.fields.indexOf('durationMin') !== -1 ? (
                    <span className="ml-1 text-xs text-stone-400">⏱</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(ct)}
                  className="h-8 rounded-lg px-2 text-xs text-stone-500 ring-1 ring-stone-200 active:bg-stone-100"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => deleteCustom(ct.id)}
                  className="h-8 rounded-lg px-2 text-xs text-rose-500 ring-1 ring-rose-100 active:bg-rose-50"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>

          {/* 新建 / 编辑表单 */}
          {showForm ? (
            <div className="mt-2 rounded-xl bg-cream p-3">
              <p className="mb-2 text-xs font-medium text-stone-500">
                {editingId ? '编辑自定义事件' : '新建自定义事件'}
              </p>

              {/* emoji 选择 */}
              <div className="mb-2 grid grid-cols-8 gap-1">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setFormEmoji(emoji)}
                    className={[
                      'flex h-8 items-center justify-center rounded-lg text-lg transition',
                      formEmoji === emoji ? 'bg-orange-100 ring-1 ring-orange-400' : 'active:bg-stone-100',
                    ].join(' ')}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* 名字 */}
              <label className="mb-2 block">
                <span className="mb-1 block text-xs text-stone-500">名字（1–6 个字）</span>
                <input
                  type="text"
                  value={formLabel}
                  maxLength={6}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="例如：散步"
                  className="h-11 w-full rounded-xl bg-white px-3 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </label>

              {/* 颜色 */}
              <div className="mb-2">
                <span className="mb-1 block text-xs text-stone-500">颜色</span>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOM_COLOR_OPTIONS.map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setFormColor(cls)}
                      aria-label={`颜色 ${cls}`}
                      className={[
                        'h-8 w-8 rounded-lg transition',
                        cls,
                        formColor === cls ? 'ring-2 ring-orange-500' : '',
                      ].join(' ')}
                    />
                  ))}
                </div>
              </div>

              {/* 是否计时 */}
              <label className="mb-2 flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={formDuration}
                  onChange={(e) => setFormDuration(e.target.checked)}
                  className="h-5 w-5 rounded border-stone-300 text-orange-500 focus:ring-orange-400"
                />
                支持填写时长（分钟）
              </label>

              {formError ? <p className="mb-2 text-xs text-rose-600">{formError}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 flex-1 rounded-xl bg-white text-sm text-stone-600 ring-1 ring-stone-200 active:bg-stone-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveCustom}
                  className="h-10 flex-1 rounded-xl bg-orange-500 text-sm font-semibold text-white active:bg-orange-600"
                >
                  保存
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-xs text-stone-400">
          自定义事件仅「其他」物种可用；如需自由增删按钮，请到上方把物种改为「其他」。
        </p>
      )}
    </section>
  );
}
