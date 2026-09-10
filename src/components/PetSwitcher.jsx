import React from 'react';

/**
 * 顶部宠物切换条：横向滚动 chips，当前宠物高亮；右侧设置齿轮。
 * @param {object} props
 * @param {object[]} props.pets 宠物列表
 * @param {string} props.activePetId 当前宠物 id
 * @param {(petId: string) => void} props.onSelect 切换宠物
 * @param {() => void} props.onOpenSettings 打开设置页
 */
export default function PetSwitcher({ pets, activePetId, onSelect, onOpenSettings }) {
  return (
    <div className="flex items-center gap-2">
      {/* 横向滚动的宠物 chips */}
      <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
        {pets.map((pet) => {
          const active = pet.id === activePetId;
          return (
            <button
              key={pet.id}
              type="button"
              onClick={() => onSelect(pet.id)}
              aria-pressed={active}
              className={[
                'flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-base font-medium transition',
                active
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-white text-stone-600 ring-1 ring-stone-200 active:bg-stone-100',
              ].join(' ')}
            >
              <span className="text-lg leading-none">{pet.emoji}</span>
              <span className="max-w-[7rem] truncate">{pet.name}</span>
            </button>
          );
        })}
      </div>

      {/* 设置入口：内联 SVG 齿轮，不引图标库 */}
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="设置"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 ring-1 ring-stone-200 active:bg-stone-100"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3.2" />
          <path
            strokeLinecap="round"
            d="M12 2.8v2.2M12 19v2.2M4.5 4.5l1.6 1.6M17.9 17.9l1.6 1.6M2.8 12H5M19 12h2.2M4.5 19.5l1.6-1.6M17.9 6.1l1.6-1.6"
          />
        </svg>
      </button>
    </div>
  );
}
