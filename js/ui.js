import { BUILDINGS } from './allocator.js';

const IS_TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;

// ---------- Участники ----------
export function renderParticipants(players, allocation, hidePlaced = false) {
  const list = document.getElementById('participants-list');
  list.innerHTML = '';
  const placedIds = new Set();
  Object.values(allocation || {}).forEach(arr => arr.forEach(p => placedIds.add(p.id)));

  let shown = 0;
  players.forEach(p => {
    const isPlaced = placedIds.has(p.id);
    if (hidePlaced && isPlaced) return;
    list.appendChild(makePlayerChip(p, isPlaced, 'pool'));
    shown++;
  });

  if (shown === 0) {
    const empty = document.createElement('div');
    empty.className = 'building-card__empty';
    empty.textContent = players.length === 0
      ? 'Список пуст. Нажмите «Добавить».'
      : 'Все участники распределены по точкам.';
    list.appendChild(empty);
  }
}

export function makePlayerChip(player, placed = false, from = 'pool') {
  const chip = document.createElement('div');
  chip.className = 'player-chip' + (placed ? ' placed' : '');
  chip.draggable = !placed && !IS_TOUCH_DEVICE;
  chip.dataset.id = player.id;
  chip.dataset.from = from;

  const roles = (player.roles || []).map(r => {
    if (r === 'barrel') return '<i class="fa-solid fa-bottle-water" data-role="barrel" title="Бочка"></i>';
    if (r === 'pilot') return '<i class="fa-solid fa-jet-fighter" data-role="pilot" title="Летчик"></i>';
    return '';
  }).join('');

  chip.innerHTML = `
    <span class="player-chip__nick">${escapeHtml(player.nick)}</span>
    <span class="player-chip__type ${player.type}" data-action="toggle-type" title="Клик — переключить Основа/Резерв">
      ${player.type === 'main' ? 'Основа' : 'Резерв'}
    </span>
    <input class="player-chip__power" type="number" value="${player.power || 0}" min="0" step="0.01" placeholder="БМ" />
    <span class="player-chip__roles">${roles}</span>
    <button class="player-chip__remove" title="Убрать из участников"><i class="fa-solid fa-xmark"></i></button>
  `;

  const input = chip.querySelector('.player-chip__power');
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('focus', () => {
    if (input.value === '0' || input.value === '') input.value = '';
  });
  input.addEventListener('input', () => {
    player.power = input.value === '' ? 0 : Number(input.value) || 0;
  });
  input.addEventListener('blur', () => {
    if (input.value === '') {
      input.value = '0';
      player.power = 0;
    } else {
      player.power = Number(input.value) || 0;
    }
    chip.dispatchEvent(new CustomEvent('chip:power-changed', {
      bubbles: true,
      detail: { id: player.id, power: player.power }
    }));
  });
  if (placed) input.disabled = true;

  chip.querySelector('.player-chip__remove').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:remove', { bubbles: true, detail: { id: player.id } }));
  });

  chip.querySelector('[data-action="toggle-type"]').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:toggle-type', { bubbles: true, detail: { id: player.id } }));
  });

  chip.querySelectorAll('.player-chip__roles i').forEach(icon => {
    icon.addEventListener('click', e => {
      e.stopPropagation();
      chip.dispatchEvent(new CustomEvent('chip:remove-role', {
        bubbles: true, detail: { id: player.id, role: icon.dataset.role }
      }));
    });
  });

  if (!placed) {
    chip.addEventListener('click', e => {
      if (e.target.closest('input, button, .player-chip__type, .player-chip__roles i')) return;
      openPoolChipMenu(chip, player);
    });
  }

  return chip;
}

// ---------- Чип в таблице ----------
export function makePlacedChip(player, from) {
  const chip = document.createElement('div');
  chip.className = 'player-chip player-chip--placed';
  chip.dataset.id = player.id;
  chip.dataset.from = from;
  chip.draggable = !IS_TOUCH_DEVICE;

  const roles = (player.roles || []).map(r => {
    if (r === 'barrel') return '<i class="fa-solid fa-bottle-water" title="Бочка"></i>';
    if (r === 'pilot') return '<i class="fa-solid fa-jet-fighter" title="Летчик"></i>';
    return '';
  }).join('');

  const stage = computeStage(player, from);
  const flights = (player.flights || []);

  const flightNotes = [];
  flights.forEach(f => {
    const target = BUILDINGS.find(x => x.id === f.toBuildingId);
    if (!target) return;
    const flightStage = getFlightStage(player, f.toBuildingId);
    if (flightStage <= stage) return;
    flightNotes.push(
      `<span class="building-card__pilot-note building-card__flight-note" title="Перелёт в ${f.atMinute} мин">` +
      `<i class="fa-solid fa-share"></i> (${flightStage}) ${escapeHtml(target.name)}</span>`
    );
  });

  const roleNotes = [];
  if ((player.roles || []).includes('barrel')) {
    roleNotes.push('<span class="building-card__pilot-note building-card__barrel-note">Бочки</span>');
  }

  chip.innerHTML = `
    <div class="player-chip__row1">
      <span class="player-chip__stage" title="Этап игрока">(${stage})</span>
      <span class="player-chip__nick">${escapeHtml(player.nick)}</span>
      <span class="player-chip__power-text" title="Боевая мощь">${formatPower(player.power || 0)}</span>
      <button class="building-card__remove" title="Убрать из точки">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="player-chip__row2">
      <span class="player-chip__type ${player.type}" data-action="toggle-type" title="Клик — переключить Основа/Резерв">
        ${player.type === 'main' ? 'О' : 'Р'}
      </span>
      <span class="player-chip__roles">${roles}</span>
      ${flightNotes.join('')}
      ${roleNotes.join('')}
    </div>
  `;

  chip.querySelector('[data-action="toggle-type"]').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:toggle-type', { bubbles: true, detail: { id: player.id } }));
  });

  chip.querySelector('.building-card__remove').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:remove-from-building', {
      bubbles: true, detail: { id: player.id, buildingId: from }
    }));
  });

  chip.addEventListener('click', e => {
    if (e.target.closest('input, button, .player-chip__type, .player-chip__roles i, .building-card__remove')) return;
    openPlacedChipMenu(chip, player, from);
  });

  return chip;
}

function computeStage(player, buildingId) {
  const flights = player.flights || [];
  if (flights.length === 0) return 1;

  const sorted = [...flights].sort((a, b) => (a.atMinute || 0) - (b.atMinute || 0));
  const isTarget = sorted.some(f => f.toBuildingId === buildingId);
  if (!isTarget) return 1;

  const idx = sorted.findIndex(f => f.toBuildingId === buildingId);
  return idx + 2;
}

function getFlightStage(player, toBuildingId) {
  const flights = player.flights || [];
  const sorted = [...flights].sort((a, b) => (a.atMinute || 0) - (b.atMinute || 0));
  const idx = sorted.findIndex(f => f.toBuildingId === toBuildingId);
  return idx >= 0 ? idx + 2 : 1;
}

function formatPower(p) {
  const n = Number(p) || 0;
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

// ---------- Оверлей / центр экрана ----------
function positionMenu(menu, anchor) {
  document.querySelectorAll('.menu-overlay').forEach(m => m.remove());

  const overlay = document.createElement('div');
  overlay.className = 'menu-overlay';
  overlay.appendChild(menu);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('menu-overlay--visible'));
}

function closeMenu(overlay) {
  if (!overlay) return;
  overlay.classList.remove('menu-overlay--visible');
  setTimeout(() => {
    if (overlay.parentElement) overlay.remove();
  }, 180);
}

function bindMenuClose(menu) {
  const overlay = menu.parentElement;
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeMenu(overlay);
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeMenu(overlay);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ---------- Меню для игрока в пуле ----------
function openPoolChipMenu(chip, player) {
  document.querySelectorAll('.menu-overlay').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'flights-menu';

  const roles = player.roles || [];
  const hasPilot = roles.includes('pilot');
  const hasBarrel = roles.includes('barrel');

  const buttons = BUILDINGS.map(b => `
    <button class="flights-menu__add" data-target="${b.id}">
      <i class="fa-solid fa-location-dot"></i>
      ${escapeHtml(b.name)}
    </button>
  `).join('');

  menu.innerHTML = `
    <div class="flights-menu__section">
      <div class="flights-menu__title">Роли</div>
      <div class="flights-menu__role-list">
        <button class="flights-menu__role ${hasPilot ? 'active' : ''}" data-role="pilot">
          <i class="fa-solid fa-jet-fighter"></i>
          Летчик
          <span class="flights-menu__check">${hasPilot ? '✓' : ''}</span>
        </button>
        <button class="flights-menu__role ${hasBarrel ? 'active' : ''}" data-role="barrel">
          <i class="fa-solid fa-bottle-water"></i>
          Бочка
          <span class="flights-menu__check">${hasBarrel ? '✓' : ''}</span>
        </button>
      </div>
    </div>
    <div class="flights-menu__section">
      <div class="flights-menu__title">Отправить на точку</div>
      <div class="flights-menu__add-list">${buttons}</div>
    </div>
  `;

  positionMenu(menu, chip);

  menu.querySelectorAll('[data-role]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const role = btn.dataset.role;
      const isActive = btn.classList.contains('active');
      btn.classList.toggle('active', !isActive);
      const check = btn.querySelector('.flights-menu__check');
      if (check) check.textContent = !isActive ? '✓' : '';
      if (typeof window.__onToggleRole === 'function') {
        window.__onToggleRole(player.id, role);
      }
    };
  });

  menu.querySelectorAll('.flights-menu__add').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const target = btn.dataset.target;
      closeMenu(menu.parentElement);
      if (typeof window.__onSendToBuilding === 'function') {
        window.__onSendToBuilding(player.id, target);
      }
    };
  });

  bindMenuClose(menu);
}

// ---------- Меню для игрока в таблице ----------
function openPlacedChipMenu(chip, player, fromBuildingId) {
  document.querySelectorAll('.menu-overlay').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'flights-menu';

  const roles = player.roles || [];
  const hasPilot = roles.includes('pilot');
  const hasBarrel = roles.includes('barrel');

  const flights = player.flights || [];
  const flightTargets = new Set(flights.map(f => f.toBuildingId));

  const flightButtons = BUILDINGS
    .filter(b => b.id !== fromBuildingId && !flightTargets.has(b.id))
    .map(b => `
      <button class="flights-menu__add" data-flight="${b.id}">
        <i class="fa-solid fa-share"></i>
        ${escapeHtml(b.name)}
      </button>
    `).join('');

  const moveButtons = BUILDINGS
    .filter(b => b.id !== fromBuildingId)
    .map(b => `
      <button class="flights-menu__add" data-move="${b.id}">
        <i class="fa-solid fa-arrow-right-arrow-left"></i>
        ${escapeHtml(b.name)}
      </button>
    `).join('');

  menu.innerHTML = `
    <div class="flights-menu__section">
      <div class="flights-menu__title">Роли</div>
      <div class="flights-menu__role-list">
        <button class="flights-menu__role ${hasPilot ? 'active' : ''}" data-role="pilot">
          <i class="fa-solid fa-jet-fighter"></i>
          Летчик
          <span class="flights-menu__check">${hasPilot ? '✓' : ''}</span>
        </button>
        <button class="flights-menu__role ${hasBarrel ? 'active' : ''}" data-role="barrel">
          <i class="fa-solid fa-bottle-water"></i>
          Бочка
          <span class="flights-menu__check">${hasBarrel ? '✓' : ''}</span>
        </button>
      </div>
    </div>
    <div class="flights-menu__section">
      <div class="flights-menu__title">Перелёт на точку (останется здесь)</div>
      <div class="flights-menu__add-list">${flightButtons || '<div class="flights-menu__empty">Нет доступных точек</div>'}</div>
    </div>
    <div class="flights-menu__section">
      <div class="flights-menu__title">Переместить на точку</div>
      <div class="flights-menu__add-list">${moveButtons}</div>
    </div>
    <div class="flights-menu__section">
      <button class="flights-menu__add flights-menu__add--danger" data-action="remove">
        <i class="fa-solid fa-xmark"></i>
        Убрать из точки
      </button>
    </div>
  `;

  positionMenu(menu, chip);

  menu.querySelectorAll('[data-role]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const role = btn.dataset.role;
      const isActive = btn.classList.contains('active');
      btn.classList.toggle('active', !isActive);
      const check = btn.querySelector('.flights-menu__check');
      if (check) check.textContent = !isActive ? '✓' : '';
      if (typeof window.__onToggleRole === 'function') {
        window.__onToggleRole(player.id, role);
      }
    };
  });

  menu.querySelectorAll('[data-flight]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const target = btn.dataset.flight;
      closeMenu(menu.parentElement);
      if (typeof window.__onAddFlight === 'function') {
        window.__onAddFlight(player.id, target);
      }
    };
  });

  menu.querySelectorAll('[data-move]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const target = btn.dataset.move;
      closeMenu(menu.parentElement);
      if (typeof window.__onMoveToBuilding === 'function') {
        window.__onMoveToBuilding(player.id, fromBuildingId, target);
      }
    };
  });

  const removeBtn = menu.querySelector('[data-action="remove"]');
  if (removeBtn) {
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      closeMenu(menu.parentElement);
      chip.dispatchEvent(new CustomEvent('chip:remove-from-building', {
        bubbles: true, detail: { id: player.id, buildingId: fromBuildingId }
      }));
    };
  }

  bindMenuClose(menu);
}

// ---------- Здания ----------
export function renderBuildings(allocation, players, filter = 'all', openMinutes = {}, minPlayers = {}) {
  const container = document.getElementById('buildings');
  container.innerHTML = '';

  const list = BUILDINGS
    .filter(b => {
      if (filter === 'all') return true;
      return b.kind === filter;
    })
    .sort((a, b) => {
      const ta = openMinutes[a.id] ?? a.openAt ?? 0;
      const tb = openMinutes[b.id] ?? b.openAt ?? 0;
      if (ta !== tb) return ta - tb;
      return a.priority - b.priority;
    });

  const byId = new Map();
  players.forEach(p => byId.set(p.id, p));

  list.forEach(b => {
    const card = document.createElement('div');
    card.className = 'building-card';
    card.dataset.buildingId = b.id;

    const openAt = openMinutes[b.id] ?? b.openAt ?? 0;
    const minRequired = minPlayers[b.id] ?? b.minPlayers ?? 0;

    const onThisPoint = (allocation?.[b.id] || []).map(p => {
      const player = byId.get(p.id) || p;
      return { ...player, isPilot: p.isPilot };
    });

    const additions = [];
    players.forEach(p => {
      const flights = p.flights || [];
      const fliesHere = flights.some(f => f.toBuildingId === b.id);
      if (!fliesHere) return;
      if (onThisPoint.find(x => x.id === p.id)) return;
      const inAllocation = Object.values(allocation).some(arr => arr.some(x => x.id === p.id));
      if (!inAllocation) return;
      additions.push(p);
    });

    const finalList = [...onThisPoint, ...additions];
    finalList.sort((a, b2) => computeStage(a, b.id) - computeStage(b2, b.id));

    const sum = finalList.reduce((s, p) => s + (p.power || 0), 0);
    const isUnderstaffed = finalList.length < minRequired;

    const bonusHtml = b.bonus
      ? `<span class="meta-item"><i class="fa-solid ${b.bonus.icon} bonus"></i> <span class="bonus">${b.bonus.label}</span></span>`
      : '';

    const openLabel = openAt > 0
      ? `<span class="building-card__open-label" title="Время открытия">` +
        `<i class="fa-solid fa-clock"></i> Открывается на ${openAt} мин</span>`
      : `<span class="building-card__open-label building-card__open-label--early">` +
        `<i class="fa-solid fa-clock"></i> Открыто с начала</span>`;

    if (isUnderstaffed) card.classList.add('building-card--understaffed');

    card.innerHTML = `
      <div class="building-card__header">
        <div class="building-card__icon"><i class="fa-solid ${b.icon}"></i></div>
        <div style="flex:1; min-width:0;">
          <div class="building-card__title">${b.name}</div>
          <div class="building-card__meta">
            <span class="meta-item"><i class="fa-solid fa-droplet water"></i> ${b.water}/мин</span>
            <span class="meta-item"><i class="fa-solid fa-droplet gold"></i> ${b.first}</span>
            ${bonusHtml}
          </div>
          <div class="building-card__open">${openLabel}</div>
        </div>
        <div class="building-card__sum">
          ${isUnderstaffed ? `<span class="building-card__warn" title="Меньше минимума (${minRequired})"><i class="fa-solid fa-triangle-exclamation"></i> ${finalList.length}/${minRequired}</span>` : ''}
          Итого: <b>${sum.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</b>
        </div>
        <div class="building-card__actions">
          <button class="icon-btn building-card__copy" title="Скопировать список">
            <i class="fa-solid fa-copy"></i>
          </button>
        </div>
      </div>
      <div class="building-card__body">
        <div class="building-card__dropzone" data-drop="${b.id}"></div>
      </div>
    `;

    const zone = card.querySelector('.building-card__dropzone');
    if (finalList.length === 0) {
      zone.innerHTML = '<div class="building-card__empty">Кликните по игроку в списке участников, чтобы отправить его сюда</div>';
    } else {
      finalList.forEach(p => {
        const chip = makePlacedChip(p, b.id);
        zone.appendChild(chip);
      });
    }

    card.querySelector('.building-card__copy').onclick = () => {
      const text = buildCopyText(b, allocation, players);
      copyTextToClipboard(text);
    };

    container.appendChild(card);
  });
}

function buildCopyText(building, allocation, players) {
  const list = allocation[building.id] || [];

  const byId = new Map();
  players.forEach(p => byId.set(p.id, p));

  const finalList = list.slice();
  players.forEach(p => {
    const flights = p.flights || [];
    const fliesHere = flights.some(f => f.toBuildingId === building.id);
    if (!fliesHere) return;
    if (finalList.find(x => x.id === p.id)) return;
    const inAllocation = Object.values(allocation).some(arr => arr.some(x => x.id === p.id));
    if (!inAllocation) return;
    finalList.push(p);
  });

  if (finalList.length === 0) return `${building.name}\n(пусто)`;

  finalList.sort((a, b) => computeStage(a, building.id) - computeStage(b, building.id));

  const lines = [building.name];
  let n = 1;

    finalList.forEach(p => {
    const player = byId.get(p.id) || p;
    const roles = player.roles || [];
    const stage = computeStage(player, building.id);
    const tags = [];

    const flights = (player.flights || []).sort((a, b) => (a.atMinute || 0) - (b.atMinute || 0));
    flights.forEach(f => {
      const flightStage = getFlightStage(player, f.toBuildingId);
      if (flightStage <= stage) return;
      const target = BUILDINGS.find(x => x.id === f.toBuildingId);
      if (target) tags.push(target.name);
    });

    if (roles.includes('barrel')) {
      tags.push('Бочки');
    }

    // Пометка роли в имени
    const isPilot = roles.includes('pilot');
    const nick = isPilot ? `${player.nick} (летчик)` : player.nick;

    const suffix = tags.length ? ` → ${tags.join(' → ')}` : '';
    lines.push(`${n}. ${nick}${suffix}`);
    n++;
  });

  return lines.join('\n');
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (typeof window.__toast === 'function') window.__toast('Список скопирован');
  } catch (e) {
    if (typeof window.__toast === 'function') window.__toast('Не удалось скопировать');
  }
}

// ---------- Список союза (модалка) ----------
export function renderAllianceManageList(members, addedIds, handlers) {
  const list = document.getElementById('alliance-manage-list');
  list.innerHTML = '';
  if (members.length === 0) {
    list.innerHTML = '<div class="building-card__empty">Список пуст. Создайте первого игрока выше.</div>';
    return;
  }

  const sorted = [...members].sort((a, b) => {
    const aAdd = addedIds.has(a.id) ? 1 : 0;
    const bAdd = addedIds.has(b.id) ? 1 : 0;
    if (aAdd !== bAdd) return aAdd - bAdd;
    return a.nick.localeCompare(b.nick, 'ru');
  });

  sorted.forEach(m => {
    const isAdded = addedIds.has(m.id);
    const item = document.createElement('div');
    item.className = 'alliance-item' + (isAdded ? ' alliance-item--added' : '');
    item.innerHTML = `
      <span class="alliance-item__nick">${escapeHtml(m.nick)}</span>
      <input class="alliance-item__power" type="number" value="${m.power || 0}" step="0.01" min="0" />
      <button class="btn btn--ghost btn-edit" title="Переименовать">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="btn btn--ghost btn-del" title="Удалить из союза">
        <i class="fa-solid fa-trash"></i>
      </button>
      <button class="btn ${isAdded ? 'btn--ghost btn-unpick' : 'btn--primary btn-pick'}">
        ${isAdded
          ? '<i class="fa-solid fa-minus"></i> Убрать'
          : '<i class="fa-solid fa-plus"></i> Добавить'}
      </button>
    `;

    item.querySelector('.alliance-item__power').onchange = async (e) => {
      await handlers.onPowerChange(m.id, Number(e.target.value) || 0);
    };
    item.querySelector('.btn-edit').onclick = () => {
      const span = item.querySelector('.alliance-item__nick');
      span.contentEditable = 'true';
      span.focus();
      span.onblur = async () => {
        span.contentEditable = 'false';
        const v = span.textContent.trim();
        if (v && v !== m.nick) await handlers.onRename(m.id, v);
      };
    };
    item.querySelector('.btn-del').onclick = () => handlers.onDelete(m.id);

    if (isAdded) {
      item.querySelector('.btn-unpick').onclick = () => handlers.onUnpick(m);
    } else {
      item.querySelector('.btn-pick').onclick = () => handlers.onPick(m);
    }

    list.appendChild(item);
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}