import { BUILDINGS } from './allocator.js';

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

// Чип в пуле — с input для БМ
export function makePlayerChip(player, placed = false, from = 'pool') {
  const chip = document.createElement('div');
  chip.className = 'player-chip' + (placed ? ' placed' : '');
  chip.draggable = !placed;
  chip.dataset.id = player.id;
  chip.dataset.from = from;

  const roles = (player.roles || []).map(r => {
    if (r === 'barrel') return '<i class="fa-solid fa-bottle-water" data-role="barrel" title="Бочка (клик — снять)"></i>';
    if (r === 'pilot') return '<i class="fa-solid fa-jet-fighter" data-role="pilot" title="Летчик (клик — снять)"></i>';
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

  return chip;
}

// Чип в таблице — БМ в виде текста, клик → редактирование
export function makePlacedChip(player, from) {
  const chip = document.createElement('div');
  chip.className = 'player-chip player-chip--placed';
  chip.dataset.id = player.id;
  chip.dataset.from = from;
  chip.draggable = true;

  const roles = (player.roles || []).map(r => {
    if (r === 'barrel') return '<i class="fa-solid fa-bottle-water" title="Бочка"></i>';
    if (r === 'pilot') return '<i class="fa-solid fa-jet-fighter" title="Летчик"></i>';
    return '';
  }).join('');

  const stage = computeStage(player, from);
  const flights = (player.flights || []);

  const maxStage = flights.length === 0 ? 1 : flights.length + 1;
  const isFinalStage = flights.length > 0 && stage === maxStage;
  const showFlightBtn = !isFinalStage;

  // Метки следующих перелётов
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

  // Метки ролей
  // «Центр» автоматически НЕ ставим — только реальные перелёты дают метку цели.
  // Роль «Бочка» — метка остаётся, потому что бочки по механике игры идут на бочки в 30/40 мин.
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
      ${showFlightBtn ? '<span class="chip-flight-btn" draggable="true" data-action="flight" title="Перетащите на точку — игрок полетит туда. Клик — список перелётов">📤</span>' : ''}
      ${roleNotes.join('')}
      ${flightNotes.join('')}
    </div>
  `;

  chip.querySelector('[data-action="toggle-type"]').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:toggle-type', { bubbles: true, detail: { id: player.id } }));
  });

  const flightBtn = chip.querySelector('.chip-flight-btn');
  if (flightBtn) {
    flightBtn.addEventListener('click', e => {
      e.stopPropagation();
      openFlightsMenu(chip, player, from);
    });
  }

  chip.querySelector('.building-card__remove').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:remove-from-building', {
      bubbles: true, detail: { id: player.id, buildingId: from }
    }));
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

// function openPowerEditor(viewEl, chip, player) {
//   const input = document.createElement('input');
//   input.className = 'player-chip__power player-chip__power--inline';
//   input.type = 'number';
//   input.step = '0.01';
//   input.min = '0';
//   input.value = player.power || 0;

//   input.addEventListener('click', ev => ev.stopPropagation());
//   input.addEventListener('focus', () => { if (input.value === '0') input.value = ''; });
//   input.addEventListener('blur', () => {
//     const val = Number(input.value) || 0;
//     player.power = val;
//     chip.dispatchEvent(new CustomEvent('chip:power-changed', {
//       bubbles: true, detail: { id: player.id, power: val }
//     }));
//     const view = document.createElement('span');
//     view.className = 'player-chip__power-view';
//     view.title = 'Клик — редактировать';
//     view.textContent = formatPower(val);
//     view.addEventListener('click', e => {
//       e.stopPropagation();
//       openPowerEditor(view, chip, player);
//     });
//     input.replaceWith(view);
//   });
//   input.addEventListener('keydown', ev => {
//     if (ev.key === 'Enter') input.blur();
//     if (ev.key === 'Escape') { input.value = player.power || 0; input.blur(); }
//   });

//   viewEl.replaceWith(input);
//   input.focus();
//   input.select();
// }

// ---------- Меню перелётов ----------
function openFlightsMenu(chip, player, fromBuildingId) {
  document.querySelectorAll('.flights-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'flights-menu';

  const flights = player.flights || [];

  if (flights.length === 0) {
    menu.innerHTML = `<div class="flights-menu__empty">Нет перелётов. Перетащите 📤 на другую точку.</div>`;
  } else {
    const sorted = [...flights].sort((a, b) => (a.atMinute || 0) - (b.atMinute || 0));
    menu.innerHTML = sorted.map((f, i) => {
      const target = BUILDINGS.find(x => x.id === f.toBuildingId);
      const name = target ? target.name : f.toBuildingId;
      const stage = i + 2;
      return `
        <div class="flights-menu__item">
          <i class="fa-solid fa-share"></i>
          <span>(${stage}) ${escapeHtml(name)}${f.atMinute ? ` — ${f.atMinute} мин` : ''}</span>
          <button class="flights-menu__del" data-target="${f.toBuildingId}" title="Удалить перелёт">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    }).join('');
  }

  const rect = chip.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = Math.min(rect.left, window.innerWidth - 260) + 'px';
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.zIndex = '300';
  document.body.appendChild(menu);

  menu.querySelectorAll('.flights-menu__del').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const target = btn.dataset.target;
      player.flights = (player.flights || []).filter(f => f.toBuildingId !== target);
      menu.remove();
      chip.dispatchEvent(new CustomEvent('chip:flights-changed', {
        bubbles: true, detail: { id: player.id, removed: target }
      }));
    };
  });

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
}

// ---------- Здания ----------
export function renderBuildings(allocation, players, filter = 'all', openMinutes = {}) {
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

    const bonusHtml = b.bonus
      ? `<span class="meta-item"><i class="fa-solid ${b.bonus.icon} bonus"></i> <span class="bonus">${b.bonus.label}</span></span>`
      : '';

    const openLabel = openAt > 0
      ? `<span class="building-card__open-label" title="Время открытия">` +
        `<i class="fa-solid fa-clock"></i> Открывается на ${openAt} мин</span>`
      : `<span class="building-card__open-label building-card__open-label--early">` +
        `<i class="fa-solid fa-clock"></i> Открыто с начала</span>`;

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
        <div class="building-card__sum">Итого: <b>${sum.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</b></div>
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
      zone.innerHTML = '<div class="building-card__empty">Перетащите игроков сюда</div>';
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

    // 1. Сначала перелёты в порядке времени (только будущие этапы)
    const flights = (player.flights || []).sort((a, b) => (a.atMinute || 0) - (b.atMinute || 0));
    flights.forEach(f => {
      const flightStage = getFlightStage(player, f.toBuildingId);
      if (flightStage <= stage) return;
      const target = BUILDINGS.find(x => x.id === f.toBuildingId);
      if (target) tags.push(target.name);
    });

    // 2. Финальные метки ролей
    // «Центр» больше не добавляем автоматически — только реальные перелёты.
    if (roles.includes('barrel')) {
      tags.push('Бочки');
    }

    const suffix = tags.length ? ` → ${tags.join(' → ')}` : '';
    lines.push(`${n}. ${player.nick}${suffix}`);
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