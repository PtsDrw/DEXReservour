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
    <input class="player-chip__power" type="number" value="${player.power || 0}" min="0" placeholder="БМ" />
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
    // Оповещаем приложение — сохранить в союз, в allocation и в черновик
    chip.dispatchEvent(new CustomEvent('chip:power-changed', {
      bubbles: true,
      detail: { id: player.id, power: player.power }
    }));
  });
  if (placed) input.disabled = true;

  // Удаление участника
  chip.querySelector('.player-chip__remove').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:remove', { bubbles: true, detail: { id: player.id } }));
  });

  // Переключение типа
  chip.querySelector('[data-action="toggle-type"]').addEventListener('click', e => {
    e.stopPropagation();
    chip.dispatchEvent(new CustomEvent('chip:toggle-type', { bubbles: true, detail: { id: player.id } }));
  });

  // Клик по иконке роли — снять
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

// ---------- Здания ----------
export function renderBuildings(allocation, players) {
  const container = document.getElementById('buildings');
  container.innerHTML = '';

  BUILDINGS.forEach(b => {
    const card = document.createElement('div');
    card.className = 'building-card';
    card.dataset.buildingId = b.id;

    const assigned = (allocation?.[b.id] || []).map(p => {
      const player = players.find(x => x.id === p.id) || p;
      return { ...player, isPilot: p.isPilot };
    });

    const sum = assigned.reduce((s, p) => s + (p.power || 0), 0);

    const bonusHtml = b.bonus
      ? `<span class="meta-item"><i class="fa-solid ${b.bonus.icon} bonus"></i> <span class="bonus">${b.bonus.label}</span></span>`
      : '';

    card.innerHTML = `
      <div class="building-card__header">
        <div class="building-card__icon"><i class="fa-solid ${b.icon}"></i></div>
        <div>
          <div class="building-card__title">${b.name}</div>
          <div class="building-card__meta">
            <span class="meta-item"><i class="fa-solid fa-droplet water"></i> ${b.water}/мин</span>
            <span class="meta-item"><i class="fa-solid fa-droplet gold"></i> ${b.first}</span>
            ${bonusHtml}
          </div>
        </div>
        <div class="building-card__sum">Итого: <b>${sum.toLocaleString('ru-RU')}</b></div>
      </div>
      <div class="building-card__body">
        <div class="building-card__dropzone" data-drop="${b.id}"></div>
      </div>
    `;

    const zone = card.querySelector('.building-card__dropzone');
    if (assigned.length === 0) {
      zone.innerHTML = '<div class="building-card__empty">Перетащите игроков сюда</div>';
    } else {
      assigned.forEach(p => {
        const chip = makePlayerChip(p, false, b.id);

        // Крестик — убрать из точки
        const removeBtn = chip.querySelector('.player-chip__remove');
        removeBtn.className = 'building-card__remove';
        removeBtn.title = 'Убрать из точки';
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.replaceWith(removeBtn.cloneNode(true));
        const newBtn = chip.querySelector('.building-card__remove');
        newBtn.addEventListener('click', e => {
          e.stopPropagation();
          chip.dispatchEvent(new CustomEvent('chip:remove-from-building', {
            bubbles: true, detail: { id: p.id, buildingId: b.id }
          }));
        });

        // Метки ролей
        if (p.isPilot) {
          const note = document.createElement('span');
          note.className = 'building-card__pilot-note';
          note.textContent = 'Центр';
          chip.appendChild(note);
        }
        if ((p.roles || []).includes('barrel')) {
          const note = document.createElement('span');
          note.className = 'building-card__pilot-note building-card__barrel-note';
          note.textContent = 'Бочки';
          chip.appendChild(note);
        }

        zone.appendChild(chip);
      });
    }

    container.appendChild(card);
  });
}

// ---------- Список союза ----------
export function renderAllianceList(members, addedIds, onPick, onUnpick) {
  const list = document.getElementById('alliance-list');
  list.innerHTML = '';
  if (members.length === 0) {
    list.innerHTML = '<div class="building-card__empty">Список пуст. Добавьте игрока вручную выше.</div>';
    return;
  }

  // Сначала — НЕ добавленные, потом — добавленные
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
      ${m.power ? `<span class="alliance-item__power-badge">${m.power.toLocaleString('ru-RU')}</span>` : ''}
      <button class="btn ${isAdded ? 'btn--ghost btn-unpick' : 'btn--primary btn-pick'}">
        ${isAdded
          ? '<i class="fa-solid fa-minus"></i> Убрать'
          : '<i class="fa-solid fa-plus"></i> Добавить'}
      </button>
    `;
    if (isAdded) {
      item.querySelector('.btn-unpick').onclick = () => onUnpick(m);
    } else {
      item.querySelector('.btn-pick').onclick = () => onPick(m);
    }
    list.appendChild(item);
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}