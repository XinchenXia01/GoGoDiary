import React, { useRef, useState } from 'react';
import { SPECIES, speciesEmoji } from '../lib/eventTypes.js';
import { formatBytes } from '../lib/format.js';
import EventManager from './EventManager.jsx';

/** 可选头像 emoji（宠物头像 ≠ 物种 emoji，表达"这只是谁"） */
const EMOJI_OPTIONS = [
  '🐶', '🐕', '🐩', '🐺', '🐱', '🐈', '🐰', '🐇', '🐹', '🐭', '🐦', '🦜',
  '🐢', '🦎', '🐍', '🐠', '🐟', '🐷', '🦊', '🐾',
];

/**
 * 设置视图：宠物管理（8 物种）+ 事件管理 + 数据导入导出 + 存储占用。
 * @param {object} props
 * @param {object[]} props.pets 宠物列表
 * @param {string} props.activePetId 当前宠物 id
 * @param {number} props.eventCount 记录总数
 * @param {number} props.storageBytes 估算的 localStorage 占用字节
 * @param {(input: {name: string, emoji: string, kind: string}) => void} props.onAddPet
 * @param {(id: string, patch: object) => void} props.onUpdatePet
 * @param {(id: string) => void} props.onDeletePet
 * @param {(id: string) => void} props.onSelectPet
 * @param {() => void} props.onExport
 * @param {(text: string, mode: 'merge' | 'overwrite') => void} props.onImport
 * @param {() => void} props.onClearAll
 * @param {boolean} [props.busy] 异步操作（导出 / 导入 / 清空）进行中，禁用按钮避免重复触发
 * @param {string} [props.busyText] 进行中提示文案
 */
export default function SettingsView({
  pets,
  activePetId,
  eventCount,
  storageBytes,
  onAddPet,
  onUpdatePet,
  onDeletePet,
  onSelectPet,
  onExport,
  onImport,
  onClearAll,
  busy = false,
  busyText = '',
}) {
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState(speciesEmoji('dog'));
  const [newKind, setNewKind] = useState('dog');

  // 哪个宠物正在展开 emoji 选择器：'' 表示无，'new' 表示新增表单
  const [emojiPickerFor, setEmojiPickerFor] = useState('');

  // 待确认删除的宠物 id
  const [confirmDeletePet, setConfirmDeletePet] = useState('');
  // 清空全部数据的二次确认
  const [confirmClear, setConfirmClear] = useState(false);

  // 导入相关
  const [importName, setImportName] = useState('');
  const [importText, setImportText] = useState('');
  const fileRef = useRef(null);

  const activePet = pets.find((p) => p.id === activePetId) || null;

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    onAddPet({ name, emoji: newEmoji, kind: newKind });
    setNewName('');
    setNewEmoji(speciesEmoji('dog'));
    setNewKind('dog');
    setEmojiPickerFor('');
  };

  /** 新增表单：选物种 → 自动带出物种 emoji 作为头像初值 */
  const pickNewKind = (kind) => {
    setNewKind(kind);
    setNewEmoji(speciesEmoji(kind));
  };

  /** 已有宠物换物种：保留自定义与历史，重置隐藏集合；切换前提醒 */
  const changeKind = (pet, kind) => {
    if (pet.kind === kind) return;
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('换物种会重置该宠物的「隐藏按钮」设置（自定义事件与历史记录会保留）。确定切换吗？')
        : true;
    if (!ok) return;
    onUpdatePet(pet.id, { kind, hiddenTypes: [] });
  };

  const handleFile = (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportName(file.name);
      setImportText(String(reader.result || ''));
    };
    reader.onerror = () => {
      setImportName('');
      setImportText('');
    };
    reader.readAsText(file);
    // 允许重复选择同一个文件
    e.target.value = '';
  };

  const handleImport = (mode) => {
    if (!importText) return;
    onImport(importText, mode);
    setImportName('');
    setImportText('');
  };

  return (
    <div className="space-y-4 pb-4">
      {/* ---------- 宠物管理 ---------- */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
        <h2 className="mb-3 text-base font-semibold text-stone-800">🐾 宠物管理</h2>

        <ul className="mb-3 space-y-3">
          {pets.map((pet) => (
            <li key={pet.id} className="rounded-xl bg-cream p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmojiPickerFor(emojiPickerFor === pet.id ? '' : pet.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl ring-1 ring-stone-200"
                  aria-label="更换头像"
                >
                  {pet.emoji}
                </button>
                <input
                  type="text"
                  defaultValue={pet.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== pet.name) onUpdatePet(pet.id, { name });
                  }}
                  className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <button
                  type="button"
                  onClick={() => (confirmDeletePet === pet.id ? onDeletePet(pet.id) : setConfirmDeletePet(pet.id))}
                  className={[
                    'h-11 shrink-0 rounded-xl px-3 text-sm transition',
                    confirmDeletePet === pet.id ? 'bg-rose-500 text-white' : 'text-rose-400 ring-1 ring-rose-100',
                  ].join(' ')}
                >
                  {confirmDeletePet === pet.id ? '确认删除？' : '删除'}
                </button>
              </div>

              {/* 物种选择：8 项带 emoji chips */}
              <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {SPECIES.map((s) => {
                  const on = pet.kind === s.kind;
                  return (
                    <button
                      key={s.kind}
                      type="button"
                      onClick={() => changeKind(pet, s.kind)}
                      aria-pressed={on}
                      className={[
                        'flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm transition',
                        on ? 'bg-orange-500 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 active:bg-stone-100',
                      ].join(' ')}
                    >
                      <span className="leading-none">{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 删除警告：明确提示会连带删除该宠物全部记录 */}
              {confirmDeletePet === pet.id ? (
                <p className="mt-2 px-1 text-xs text-rose-600">
                  删除「{pet.name}」会同时删除它的全部记录，且无法恢复。再点一次上方按钮确认。
                </p>
              ) : null}

              {/* 当前宠物标记 / 切换 */}
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-xs text-stone-400">
                  {pet.id === activePetId ? '当前正在记录' : ''}
                </span>
                {pet.id === activePetId ? null : (
                  <button
                    type="button"
                    onClick={() => onSelectPet(pet.id)}
                    className="h-8 rounded-full px-3 text-xs text-orange-600 ring-1 ring-orange-200 active:bg-orange-50"
                  >
                    切到这只
                  </button>
                )}
              </div>

              {/* emoji 选择器 */}
              {emojiPickerFor === pet.id ? (
                <div className="mt-2 grid grid-cols-8 gap-1 rounded-xl bg-white p-2 ring-1 ring-stone-200">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onUpdatePet(pet.id, { emoji });
                        setEmojiPickerFor('');
                      }}
                      className="flex h-9 items-center justify-center rounded-lg text-lg active:bg-stone-100"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {/* 新增宠物 */}
        <div className="rounded-xl bg-cream p-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEmojiPickerFor(emojiPickerFor === 'new' ? '' : 'new')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl ring-1 ring-stone-200"
              aria-label="选择头像"
            >
              {newEmoji}
            </button>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
              placeholder="给新宠物起个名"
              className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-stone-800 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="h-11 shrink-0 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white active:bg-orange-600"
            >
              添加
            </button>
          </div>

          {/* 物种选择 chips */}
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {SPECIES.map((s) => {
              const on = newKind === s.kind;
              return (
                <button
                  key={s.kind}
                  type="button"
                  onClick={() => pickNewKind(s.kind)}
                  aria-pressed={on}
                  className={[
                    'flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm transition',
                    on ? 'bg-orange-500 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 active:bg-stone-100',
                  ].join(' ')}
                >
                  <span className="leading-none">{s.emoji}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>

          {emojiPickerFor === 'new' ? (
            <div className="mt-2 grid grid-cols-8 gap-1 rounded-xl bg-white p-2 ring-1 ring-stone-200">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setNewEmoji(emoji);
                    setEmojiPickerFor('');
                  }}
                  className="flex h-9 items-center justify-center rounded-lg text-lg active:bg-stone-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------- 事件管理（隐藏 / 自定义） ---------- */}
      <EventManager pet={activePet} onUpdatePet={onUpdatePet} />

      {/* ---------- 数据 ---------- */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
        <h2 className="mb-3 text-base font-semibold text-stone-800">💾 数据备份</h2>
        <p className="mb-3 text-xs text-stone-500">
          全部数据只存在这台手机的浏览器里，不上传任何服务器。换机或清理前请先导出备份。
        </p>

        <button
          type="button"
          onClick={onExport}
          disabled={busy}
          className="mb-2 h-11 w-full rounded-xl bg-stone-800 text-sm font-semibold text-white active:bg-stone-900 disabled:opacity-50"
        >
          {busy ? busyText || '处理中…' : '导出 JSON 备份'}
        </button>

        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current && fileRef.current.click()}
          disabled={busy}
          className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-stone-700 ring-1 ring-stone-200 active:bg-stone-100 disabled:opacity-50"
        >
          选择备份文件导入
        </button>

        {importName ? (
          <div className="mt-3 rounded-xl bg-cream p-3">
            <p className="mb-2 truncate text-xs text-stone-500">已选择：{importName}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleImport('merge')}
                disabled={busy}
                className="h-11 flex-1 rounded-xl bg-orange-500 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
              >
                合并去重
              </button>
              <button
                type="button"
                onClick={() => handleImport('overwrite')}
                disabled={busy}
                className="h-11 flex-1 rounded-xl bg-white text-sm font-semibold text-rose-600 ring-1 ring-rose-200 active:bg-rose-50 disabled:opacity-50"
              >
                覆盖导入
              </button>
            </div>
            <p className="mt-2 text-[11px] text-stone-400">
              合并去重：按 id 跳过已有记录；覆盖：清空现有数据后写入备份。
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            setConfirmClear(false);
            onClearAll();
          }}
          className={[
            'mt-3 h-11 w-full rounded-xl text-sm font-semibold transition',
            confirmClear ? 'bg-rose-500 text-white' : 'bg-white text-rose-500 ring-1 ring-rose-200',
          ].join(' ')}
          disabled={busy}
        >
          {confirmClear ? '再点一次，清空全部数据' : '清空全部数据'}
        </button>
        {confirmClear ? (
          <p className="mt-2 text-xs text-rose-600">这会删除所有宠物与记录，且无法恢复。</p>
        ) : null}
      </section>

      {/* ---------- 存储占用 ---------- */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-100">
        <h2 className="mb-2 text-base font-semibold text-stone-800">📊 存储情况</h2>
        <div className="flex justify-between text-sm text-stone-600">
          <span>宠物数量</span>
          <b className="text-stone-800">{pets.length}</b>
        </div>
        <div className="mt-1 flex justify-between text-sm text-stone-600">
          <span>记录总数</span>
          <b className="text-stone-800">{eventCount}</b>
        </div>
        <div className="mt-1 flex justify-between text-sm text-stone-600">
          <span>本地占用</span>
          <b className="text-stone-800">{formatBytes(storageBytes)}</b>
        </div>
      </section>

      <p className="px-1 text-center text-xs text-stone-400">宠物流水账 v1.1 · 纯本地 · 无联网</p>
    </div>
  );
}
