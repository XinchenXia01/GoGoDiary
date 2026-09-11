import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DaySummary from './components/DaySummary.jsx';
import EventEditor from './components/EventEditor.jsx';
import PetSwitcher from './components/PetSwitcher.jsx';
import QuickLog from './components/QuickLog.jsx';
import SettingsView from './components/SettingsView.jsx';
import StatsView from './components/StatsView.jsx';
import Timeline from './components/Timeline.jsx';
import TimerBar from './components/TimerBar.jsx';
import { getVisibleEventTypes, resolveEventMeta } from './lib/eventTypes.js';
import {
  addDays,
  formatDateCN,
  formatDuration,
  todayKey,
  toDateKey,
  weekdayCN,
} from './lib/format.js';
import * as storage from './lib/storage.js';

/** 底部三个 Tab */
const TABS = [
  { key: 'log', label: '记录', emoji: '📝' },
  { key: 'stats', label: '统计', emoji: '📊' },
  { key: 'settings', label: '设置', emoji: '⚙️' },
];

export default function App() {
  // ---------- 状态：全部来自 localStorage，初始化时就读一次 ----------
  const [pets, setPets] = useState(() => storage.readPets());
  const [events, setEvents] = useState(() => storage.readEvents());
  const [settings, setSettings] = useState(() => storage.readSettings());
  // 进行中的计时会话（全局单会话）：初始化时从持久化中恢复
  const [activeTimer, setActiveTimer] = useState(() => storage.readActiveTimer());
  // 计时横幅的实时刷新时间戳（每秒 +1，驱动 TimerBar 显示）
  const [nowTs, setNowTs] = useState(() => Date.now());

  const [view, setView] = useState('log');
  const [dateKey, setDateKey] = useState(() => todayKey());
  const [editingId, setEditingId] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false); // 导出 / 导入 / 清空等异步操作进行中
  const [busyText, setBusyText] = useState('');
  const toastTimer = useRef(null);

  /** 显示一条轻提示 */
  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2400);
  }, []);

  // 注册 localStorage 写入错误监听（配额不足等情况）
  useEffect(() => {
    storage.setStorageErrorListener((message) => showToast(message));
    return () => storage.setStorageErrorListener(null);
  }, [showToast]);

  // 卸载时清理 toast 定时器
  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // ---------- 当前宠物：设置里的 activePetId 失效时自动纠正 ----------
  const activePet = useMemo(
    () => pets.find((p) => p.id === settings.activePetId) || null,
    [pets, settings.activePetId]
  );

  useEffect(() => {
    if (pets.length === 0) {
      if (settings.activePetId !== '') {
        const next = { ...settings, activePetId: '' };
        setSettings(next);
        storage.writeSettings(next);
      }
      return;
    }
    if (!pets.some((p) => p.id === settings.activePetId)) {
      const next = { ...settings, activePetId: pets[0].id };
      setSettings(next);
      storage.writeSettings(next);
    }
  }, [pets, settings]);

  // ---------- 计时会话：宠物被删后自动清理（失效会话不残留） ----------
  useEffect(() => {
    if (!activeTimer) return;
    if (!pets.some((p) => p.id === activeTimer.petId)) {
      storage.clearTimer();
      setActiveTimer(null);
    }
  }, [pets, activeTimer]);

  // 计时进行中：每秒刷新一次时间戳，驱动横幅秒表
  useEffect(() => {
    if (!activeTimer) return undefined;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeTimer]);

  // ---------- 派生数据 ----------
  const petEvents = useMemo(
    () => (activePet ? events.filter((e) => e.petId === activePet.id) : []),
    [events, activePet]
  );

  // 仅当会话指向的宠物仍存在时才可见（失效会话在渲染期即隐藏，副作用里再落盘清理）
  const visibleTimer = useMemo(
    () => (activeTimer && pets.some((p) => p.id === activeTimer.petId) ? activeTimer : null),
    [activeTimer, pets]
  );

  // 当前宠物按物种裁剪 + 自定义追加后的可见事件集（速记/编辑/概览共用）
  const visibleTypes = useMemo(() => (activePet ? getVisibleEventTypes(activePet) : []), [activePet]);

  const dayEvents = useMemo(() => {
    const list = petEvents.filter((e) => toDateKey(e.ts) === dateKey);
    list.sort((a, b) => (settings.timelineOrder === 'asc' ? a.ts - b.ts : b.ts - a.ts));
    return list;
  }, [petEvents, dateKey, settings.timelineOrder]);

  // 今日概览：按物种可见集顺序统计当天次数
  const dayCounts = useMemo(() => {
    const map = {};
    dayEvents.forEach((e) => {
      map[e.type] = (map[e.type] || 0) + 1;
    });
    const list = visibleTypes.map((t) => ({
      type: t.type,
      label: t.label,
      emoji: t.emoji,
      color: t.color,
      count: map[t.type] || 0,
    }));
    // 补一串：历史里出现但当前不可见（隐藏项 / 已删除自定义）的类型，保证概览不漏
    const known = new Set(visibleTypes.map((t) => t.type));
    dayEvents.forEach((e) => {
      if (known.has(e.type)) return;
      if (list.some((x) => x.type === e.type)) return;
      const meta = resolveEventMeta(e.type, activePet);
      list.push({ type: e.type, label: meta.label, emoji: meta.emoji, color: meta.color, count: map[e.type] || 0 });
    });
    return list;
  }, [dayEvents, visibleTypes, activePet]);

  const editingEvent = useMemo(() => events.find((e) => e.id === editingId) || null, [events, editingId]);

  const storageBytes = useMemo(() => (view === 'settings' ? storage.estimateStorageBytes() : 0), [
    view,
    pets,
    events,
    settings,
  ]);

  // ---------- 事件操作 ----------
  /** 一键速记：立即写入一条 ts=now 的记录（自定义事件写入 label 快照） */
  const handleQuickLog = (type) => {
    if (!activePet) {
      showToast('请先添加一只宠物');
      return;
    }
    const meta = resolveEventMeta(type, activePet);
    const created = storage.addEvent({
      petId: activePet.id,
      type,
      ts: Date.now(),
      note: '',
      amount: null,
      unit: meta.unit || '',
      poopForm: '',
      poopColor: '',
      durationMin: null,
      label: meta.isCustom ? meta.label : '',
    });
    if (!created) return;
    setEvents(storage.readEvents());
    // 记完自动回到今天，避免用户在看历史日期时"记了看不到"
    setDateKey(toDateKey(created.ts));
    showToast(`已记录：${meta.label}`);
  };

  const handleSaveEvent = (draft) => {
    const meta = resolveEventMeta(draft.type, activePet);
    const next = storage.updateEvent(draft.id, {
      ...draft,
      // 自定义事件刷新 label 快照；非自定义保留原值（通常为空）
      label: meta.isCustom ? meta.label : draft.label || '',
    });
    setEvents(next);
    setEditingId('');
    setDateKey(toDateKey(draft.ts));
    showToast('已保存');
  };

  const handleDeleteEvent = async (id) => {
    const next = await storage.deleteEvent(id);
    setEvents(next);
    if (editingId === id) setEditingId('');
    showToast('已删除');
  };

  const toggleOrder = () => {
    const next = { ...settings, timelineOrder: settings.timelineOrder === 'desc' ? 'asc' : 'desc' };
    setSettings(next);
    storage.writeSettings(next);
  };

  // ---------- 计时操作（全局单会话） ----------
  /** 开始计时：覆盖已有会话并提醒 */
  const handleStartTimer = (type) => {
    if (!activePet) {
      showToast('请先添加一只宠物');
      return;
    }
    const overwriting = Boolean(activeTimer);
    const session = storage.startTimer(activePet.id, type, Date.now());
    setActiveTimer(session);
    setNowTs(Date.now());
    const meta = resolveEventMeta(type, activePet);
    showToast(overwriting ? `已切换计时：${meta.label}` : `开始计时：${meta.label}`);
  };

  /** 结束计时 → 生成带 startTs/endTs/durationMin 的记录（ts 取 startTs） */
  const handleStopTimer = () => {
    const session = activeTimer;
    if (!session) return;
    const endTs = Date.now();
    const elapsedMs = Math.max(0, endTs - session.startTs);
    // 时长（分钟，保留 1 位小数）
    const durationMin = Math.round((elapsedMs / 60000) * 10) / 10;
    const owner = pets.find((p) => p.id === session.petId) || activePet;
    const meta = resolveEventMeta(session.type, owner);
    storage.clearTimer();
    setActiveTimer(null);
    const created = storage.addEvent({
      petId: session.petId,
      type: session.type,
      ts: session.startTs,
      startTs: session.startTs,
      endTs,
      durationMin,
      note: '',
      amount: null,
      unit: meta.unit || '',
      poopForm: '',
      poopColor: '',
      label: meta.isCustom ? meta.label : '',
    });
    if (!created) return;
    setEvents(storage.readEvents());
    setDateKey(toDateKey(session.startTs));
    showToast(`已记录：${meta.label} · ${formatDuration(durationMin)}`);
  };

  // ---------- 宠物操作 ----------
  const handleSelectPet = (petId) => {
    const next = { ...settings, activePetId: petId };
    setSettings(next);
    storage.writeSettings(next);
  };

  const handleAddPet = (input) => {
    const pet = storage.addPet(input);
    if (!pet) return;
    const nextPets = storage.readPets();
    setPets(nextPets);
    const next = { ...settings, activePetId: pet.id };
    setSettings(next);
    storage.writeSettings(next);
    showToast(`已添加 ${pet.name}`);
  };

  const handleUpdatePet = (id, patch) => {
    setPets(storage.updatePet(id, patch));
  };

  const handleDeletePet = async (id) => {
    const pet = pets.find((p) => p.id === id);
    const result = await storage.deletePet(id);
    setPets(result.pets);
    setEvents(result.events);
    if (activeTimer && activeTimer.petId === id) {
      storage.clearTimer();
      setActiveTimer(null);
    }
    if (settings.activePetId === id) {
      const next = { ...settings, activePetId: result.pets.length > 0 ? result.pets[0].id : '' };
      setSettings(next);
      storage.writeSettings(next);
    }
    showToast(`已删除 ${pet ? pet.name : '宠物'} 及其全部记录`);
  };

  // ---------- 导入导出（均为异步：图片需要读写 IndexedDB） ----------

  const handleExport = async () => {
    setBusy(true);
    setBusyText('正在打包备份…');
    try {
      const data = await storage.exportData();
      const text = JSON.stringify(data, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `petlog-${todayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('已导出备份文件');
    } catch (err) {
      showToast('导出失败，请重试');
    } finally {
      setBusy(false);
      setBusyText('');
    }
  };

  const handleImport = async (text, mode) => {
    setBusy(true);
    setBusyText('正在导入…');
    try {
      const result = await storage.importData(text, mode);
      if (!result.ok) {
        showToast(`导入失败：${result.error}`);
        return;
      }
      setPets(result.pets || []);
      setEvents(result.events || []);
      setSettings(result.settings || settings);
      // 覆盖导入会恢复备份里的计时会话；合并导入不动本地计时
      setActiveTimer(storage.readActiveTimer());
      let msg =
        mode === 'overwrite'
          ? `已覆盖导入：${result.addedPets} 只宠物 / ${result.addedEvents} 条记录`
          : `已合并：新增 ${result.addedPets} 只宠物 / ${result.addedEvents} 条记录`;
      if (result.photoWarning) msg += `（${result.photoWarning}）`;
      showToast(msg);
    } catch (err) {
      showToast('导入失败，请重试');
    } finally {
      setBusy(false);
      setBusyText('');
    }
  };

  const handleClearAll = async () => {
    setBusy(true);
    setBusyText('正在清空…');
    try {
      await storage.clearAll();
      setPets([]);
      setEvents([]);
      setActiveTimer(null);
      const next = { activePetId: '', timelineOrder: 'desc' };
      setSettings(next);
      storage.writeSettings(next);
      showToast('已清空全部数据');
    } catch (err) {
      showToast('清空失败，请重试');
    } finally {
      setBusy(false);
      setBusyText('');
    }
  };

  // ---------- 渲染 ----------
  const isToday = dateKey === todayKey();
  const timerPet = visibleTimer ? pets.find((p) => p.id === visibleTimer.petId) || null : null;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-cream pb-24">
      {/* 顶部栏 */}
      <header className="pt-safe sticky top-0 z-30 bg-cream/95 px-4 pb-2 backdrop-blur">
        <h1 className="mb-2 text-lg font-bold text-stone-800">
          🐾 GoGoDiary
          {activePet ? <span className="ml-2 text-sm font-normal text-stone-500">{activePet.name}</span> : null}
        </h1>
        <PetSwitcher
          pets={pets}
          activePetId={settings.activePetId}
          onSelect={handleSelectPet}
          onOpenSettings={() => setView('settings')}
        />
      </header>

      {/* 轻提示 */}
      {toast ? (
        <div className="pointer-events-none fixed left-0 right-0 top-20 z-50 flex justify-center px-6">
          <div className="animate-pop-in rounded-full bg-stone-800/90 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}

      <main className="px-4 pt-3">
        {view === 'log' ? (
          <div className="space-y-4">
            {/* 计时进行中横幅（常驻，跨页面/重开恢复） */}
            <TimerBar session={visibleTimer} pet={timerPet} now={nowTs} onStop={handleStopTimer} />

            {/* 日期条 */}
            <div className="flex items-center justify-between rounded-2xl bg-white px-2 py-1.5 ring-1 ring-stone-100">
              <button
                type="button"
                onClick={() => setDateKey(addDays(dateKey, -1))}
                aria-label="前一天"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl text-stone-500 active:bg-stone-100"
              >
                ‹
              </button>

              <div className="flex min-w-0 flex-col items-center">
                {/* 中间是可点击的日期选择器，直达任意一天 */}
                <input
                  type="date"
                  value={dateKey}
                  onChange={(e) => {
                    if (e.target.value) setDateKey(e.target.value);
                  }}
                  className="h-11 w-[150px] bg-transparent text-center text-base font-semibold text-stone-800 focus:outline-none"
                />
                <span className="-mt-1 text-[11px] text-stone-400">
                  {isToday ? `今天 · ${weekdayCN(dateKey)}` : weekdayCN(dateKey)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setDateKey(addDays(dateKey, 1))}
                aria-label="后一天"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xl text-stone-500 active:bg-stone-100"
              >
                ›
              </button>
            </div>

            {!isToday ? (
              <button
                type="button"
                onClick={() => setDateKey(todayKey())}
                className="h-9 w-full rounded-xl bg-orange-50 text-sm font-medium text-orange-600 active:bg-orange-100"
              >
                回到今天（{formatDateCN(todayKey())}）
              </button>
            ) : null}

            {/* 没有宠物时的引导卡片 */}
            {!activePet ? (
              <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-stone-100">
                <div className="mb-2 text-4xl">🐾</div>
                <p className="mb-1 text-base font-semibold text-stone-800">先添加一只宠物吧</p>
                <p className="mb-4 text-sm text-stone-500">添加后就能一键记录吃饭、外出、便便…</p>
                <button
                  type="button"
                  onClick={() => setView('settings')}
                  className="h-11 w-full rounded-xl bg-orange-500 text-base font-semibold text-white active:bg-orange-600"
                >
                  去添加宠物
                </button>
              </div>
            ) : (
              <>
                <QuickLog
                  types={visibleTypes}
                  onLog={handleQuickLog}
                  activeTimer={visibleTimer}
                  onStartTimer={handleStartTimer}
                  onStopTimer={handleStopTimer}
                />
                <DaySummary counts={dayCounts} />
                <Timeline
                  events={dayEvents}
                  pet={activePet}
                  order={settings.timelineOrder}
                  onToggleOrder={toggleOrder}
                  onEdit={(e) => setEditingId(e.id)}
                  onDelete={handleDeleteEvent}
                />
              </>
            )}
          </div>
        ) : null}

        {view === 'stats' ? (
          activePet ? (
            <StatsView events={petEvents} pet={activePet} petName={activePet.name} />
          ) : (
            <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-stone-100">
              <p className="text-sm text-stone-500">还没有宠物，先去设置里添加一只 🐾</p>
            </div>
          )
        ) : null}

        {view === 'settings' ? (
          <SettingsView
            pets={pets}
            activePetId={settings.activePetId}
            eventCount={events.length}
            storageBytes={storageBytes}
            busy={busy}
            busyText={busyText}
            onAddPet={handleAddPet}
            onUpdatePet={handleUpdatePet}
            onDeletePet={handleDeletePet}
            onSelectPet={handleSelectPet}
            onExport={handleExport}
            onImport={handleImport}
            onClearAll={handleClearAll}
          />
        ) : null}
      </main>

      {/* 底部 Tab：避开 iPhone 底部安全区 */}
      <nav className="pb-safe fixed bottom-0 left-0 right-0 z-40 border-t border-stone-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {TABS.map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={[
                  'flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition',
                  active ? 'text-orange-600' : 'text-stone-400',
                ].join(' ')}
              >
                <span className="text-xl leading-none">{tab.emoji}</span>
                <span className={active ? 'font-semibold' : ''}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 事件编辑 bottom sheet */}
      <EventEditor
        event={editingEvent}
        pet={activePet}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        onClose={() => setEditingId('')}
        onError={showToast}
      />
    </div>
  );
}
