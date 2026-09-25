import { getMembers, addMember, updateMember, deleteMember,
         getHistory, saveHistory, deleteHistory } from './storage.js';
import { BUILDINGS, allocatePlayers } from './allocator.js';
import {
  renderParticipants, renderBuildings, renderAllianceManageList, escapeHtml
} from './ui.js';
import { initDnD, setDnDConfig } from './dnd.js';

// ---------- Настройки ----------
const SETTINGS_KEY = 'raid_planner_settings_v1';

const DEFAULT_SETTINGS = {
  scrollSpeed: 20,
  scrollZone: 100,
  pilotCount: 3,
  barrelCount: 6,

  openMinutes: {
    wp1: 0, wp2: 0, wp3: 0, wp4: 0,
    tc1: 0, tc2: 0,
    solar: 0, helipad: 0,
    milfac: 10, dev: 10,
    center: 15
  },

  priorities: {
    center: 'high',
    tc1: 'high', tc2: 'high',
    wp1: 'medium', wp2: 'medium', wp3: 'medium', wp4: 'medium',
    solar: 'high', helipad: 'high', milfac: 'high',
    dev: 'low'
  },

  minPlayers: {
    center: 3,
    tc1: 2, tc2: 2,
    wp1: 2, wp2: 2, wp3: 2, wp4: 2,
    solar: 2, helipad: 2, milfac: 2,
    dev: 1
  },

  autoFlights: {
    enabled: false,
    rules: [
      { from: 'wp1', to: 'center', limit: 2, enabled: true },
      { from: 'wp2', to: 'center', limit: 2, enabled: true },
      { from: 'wp3', to: 'center', limit: 2, enabled: true },
      { from: 'wp4', to: 'center', limit: 2, enabled: true },
      { from: 'tc1', to: 'center', limit: 2, enabled: true },
      { from: 'tc2', to: 'center', limit: 2, enabled: true }
    ]
  }
};

let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...saved,
      openMinutes: { ...DEFAULT_SETTINGS.openMinutes, ...(saved.openMinutes || {}) },
      priorities: { ...DEFAULT_SETTINGS.priorities, ...(saved.priorities || {}) },
      minPlayers: { ...DEFAULT_SETTINGS.minPlayers, ...(saved.minPlayers || {}) },
      autoFlights: {
        enabled: !!(saved.autoFlights?.enabled),
        rules: saved.autoFlights?.rules?.length
          ? saved.autoFlights.rules
          : structuredClone(DEFAULT_SETTINGS.autoFlights.rules)
      }
    };
  } catch (e) {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------- Состояние ----------
const state = {
  members: [],
  participants: [],
  allocation: {},
  pilots: [],
  barrels: [],
  hidePlaced: localStorage.getItem('raid_hide_placed') === '1',
  buildingsFilter: localStorage.getItem('raid_buildings_filter') || 'all'
};

// ---------- Дата ----------
function nextSunday() {
  const d = new Date();
  const day = d.getDay();
  const diff = (7 - day) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 0 : diff));
  return d.toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}
document.getElementById('event-date').textContent = nextSunday();

// ---------- Тема ----------
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark';

// ---------- Хелперы ----------
function getParticipant(id) {
  return state.participants.find(p => p.id === id);
}

function clearPlayerFromAllocation(id) {
  Object.keys(state.allocation).forEach(k => {
    state.allocation[k] = state.allocation[k].filter(p => p.id !== id);
  });
}

function refresh() {
  renderParticipants(state.participants, state.allocation, state.hidePlaced);
  renderBuildings(state.allocation, state.participants, state.buildingsFilter, settings.openMinutes);
  updateTogglePlacedBtn();
}

function updateTogglePlacedBtn() {
  const btn = document.getElementById('btn-toggle-placed');
  if (!btn) return;
  if (state.hidePlaced) {
    btn.innerHTML = '<i class="fa-solid fa-eye"></i> Показать размещённых';
  } else {
    btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Скрыть размещённых';
  }
}

function syncFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === state.buildingsFilter);
  });
}

// ---------- Черновик ----------
const DRAFT_KEY = 'raid_planner_draft_v1';

function saveDraft() {
  try {
    const draft = {
      participants: state.participants,
      allocation: state.allocation,
      pilots: state.pilots.map(p => ({ id: p.id })),
      barrels: state.barrels.map(p => ({ id: p.id }))
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (e) { /* ignore */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    const findP = id => state.participants.find(p => p.id === id);
    d.pilots = (d.pilots || []).map(x => findP(x.id)).filter(Boolean);
    d.barrels = (d.barrels || []).map(x => findP(x.id)).filter(Boolean);
    return d;
  } catch (e) { return null; }
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, 2500);
}
window.__toast = toast;

// ---------- Инициализация ----------
async function init() {
  state.members = await getMembers();

  const draft = loadDraft();
  if (draft) {
    state.participants = draft.participants || [];
    state.allocation = draft.allocation || {};
    state.pilots = draft.pilots || [];
    state.barrels = draft.barrels || [];
  }

  setDnDConfig({ scrollSpeed: settings.scrollSpeed, scrollZone: settings.scrollZone });

  refresh();
  updateAddCounter();
  syncFilterButtons();

  initDnD({
        onDropPlayer: (id, from, to) => {
      const player = getParticipant(id);
      if (!player) return;

      // Убираем игрока со СТАРОЙ точки (не со всех)
      if (from !== 'pool' && from !== to) {
        if (state.allocation[from]) {
          state.allocation[from] = state.allocation[from].filter(p => p.id !== id);
        }
      }

      if (to === 'pool') {
        // В пул — убираем со ВСЕХ точек и снимаем перелёты
        clearPlayerFromAllocation(id);
        player.flights = [];
      } else {
        // На точку — добавляем
        state.allocation[to] = state.allocation[to] || [];
        if (!state.allocation[to].find(p => p.id === id)) {
          state.allocation[to].push({
            ...player,
            isPilot: (player.roles || []).includes('pilot')
          });
        }

        // Если у игрока есть перелёты, проверяем их актуальность
        // (например, если его перетащили на точку, которая уже была целью перелёта —
        //  этот перелёт можно удалить, чтобы не дублировать)
        player.flights = (player.flights || []).filter(f => f.toBuildingId !== to);
      }

      saveDraft();
      refresh();
    },

    onToggleRole: (id, role) => {
      const player = getParticipant(id);
      if (!player) return;
      player.roles = player.roles || [];
      const has = player.roles.includes(role);
      if (has) {
        player.roles = player.roles.filter(r => r !== role);
        Object.values(state.allocation).forEach(arr => {
          arr.forEach(p => { if (p.id === id) p.isPilot = false; });
        });
      } else {
        if (role === 'pilot') player.roles = player.roles.filter(r => r !== 'barrel');
        if (role === 'barrel') player.roles = player.roles.filter(r => r !== 'pilot');
        player.roles.push(role);
        if (role === 'pilot') {
          Object.values(state.allocation).forEach(arr => {
            arr.forEach(p => { if (p.id === id) p.isPilot = true; });
          });
        }
      }
      saveDraft();
      refresh();
    },

    onClearRoles: (id) => {
      const player = getParticipant(id);
      if (!player) return;
      player.roles = [];
      Object.values(state.allocation).forEach(arr => {
        arr.forEach(p => { if (p.id === id) p.isPilot = false; });
      });
      saveDraft();
      refresh();
    }
  });

  window.__onRemoveParticipant = (id) => {
    state.participants = state.participants.filter(p => p.id !== id);
    clearPlayerFromAllocation(id);
    saveDraft();
    refresh();
    updateAddCounter();
  };

  window.__onToggleType = (id) => {
    const p = getParticipant(id);
    if (!p) return;
    p.type = p.type === 'main' ? 'reserve' : 'main';
    Object.values(state.allocation).forEach(arr => {
      arr.forEach(x => { if (x.id === id) x.type = p.type; });
    });
    saveDraft();
    refresh();
  };

  window.__onRemoveFromBuilding = (id, buildingId) => {
    const p = getParticipant(id);
    if (!p) return;

    const flightToThis = (p.flights || []).find(f => f.toBuildingId === buildingId);

    if (flightToThis) {
      p.flights = (p.flights || []).filter(f => f.toBuildingId !== buildingId);
      if (state.allocation[buildingId]) {
        state.allocation[buildingId] = state.allocation[buildingId].filter(x => x.id !== id);
      }
    } else {
      if (state.allocation[buildingId]) {
        state.allocation[buildingId] = state.allocation[buildingId].filter(x => x.id !== id);
      }
      if ((p.flights || []).length > 0) {
        const flights = [...p.flights];
        p.flights = [];
        flights.forEach(f => {
          if (state.allocation[f.toBuildingId]) {
            state.allocation[f.toBuildingId] = state.allocation[f.toBuildingId].filter(x => x.id !== id);
          }
        });
      }
    }

    saveDraft();
    refresh();
  };

  window.__onPowerChanged = async (id, power) => {
    const p = getParticipant(id);
    if (p) p.power = power;

    Object.values(state.allocation).forEach(arr => {
      arr.forEach(x => { if (x.id === id) x.power = power; });
    });

    const m = state.members.find(x => x.id === id);
    if (m) m.power = power;

    try {
      await updateMember(id, { power });
    } catch (e) {
      console.warn('Не удалось сохранить БМ в союз:', e);
    }

    saveDraft();
    renderBuildings(state.allocation, state.participants, state.buildingsFilter, settings.openMinutes);
  };

  window.__onAddFlight = (playerId, toBuildingId) => {
    const p = getParticipant(playerId);
    if (!p) return;

    const alreadyHere = Object.entries(state.allocation).some(([bid, arr]) =>
      bid === toBuildingId && arr.some(x => x.id === playerId)
    );
    if (alreadyHere) {
      toast('Игрок уже стоит на этой точке');
      return;
    }

    p.flights = p.flights || [];
    if (p.flights.find(f => f.toBuildingId === toBuildingId)) {
      toast('Перелёт на эту точку уже есть');
      return;
    }

    const target = BUILDINGS.find(b => b.id === toBuildingId);
    p.flights.push({
      toBuildingId,
      atMinute: target ? (settings.openMinutes?.[target.id] ?? target.openAt ?? 0) : 0
    });

    // Дублируем игрока на целевую точку
    state.allocation[toBuildingId] = state.allocation[toBuildingId] || [];
    if (!state.allocation[toBuildingId].find(x => x.id === playerId)) {
      state.allocation[toBuildingId].push({
        ...p,
        isPilot: (p.roles || []).includes('pilot')
      });
    }

    saveDraft();
    refresh();
    toast(`Перелёт на ${target?.name || toBuildingId} добавлен`);
  };

  window.__onFlightsChanged = (id, removedTarget) => {
    const p = getParticipant(id);
    if (!p) return;
    if (removedTarget) {
      if (state.allocation[removedTarget]) {
        state.allocation[removedTarget] = state.allocation[removedTarget].filter(x => x.id !== id);
      }
    }
    saveDraft();
    refresh();
  };
}

// ---------- Модалки ----------
function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', e => {
    const modal = e.target.closest('.modal');
    if (modal) modal.hidden = true;
  });
});

// ---------- Добавление игроков ----------
const addedIds = () => new Set(state.participants.map(p => p.id));

function updateAddCounter() {
  const el = document.getElementById('add-counter');
  if (el) el.textContent = `В составе события: ${state.participants.length}`;
}


async function renderAllianceModal() {
  state.members = await getMembers();
  const query = document.getElementById('alliance-search').value.trim();
  const lower = query.toLowerCase();

  // Фильтруем по подстроке
  const filtered = query
    ? state.members.filter(m => m.nick.toLowerCase().includes(lower))
    : state.members;

  const addedSet = new Set(state.participants.map(p => p.id));

  renderAllianceManageList(filtered, addedSet, {
    onPowerChange: async (id, power) => {
      await updateMember(id, { power });
      const p = getParticipant(id);
      if (p) p.power = power;
      Object.values(state.allocation).forEach(arr => {
        arr.forEach(x => { if (x.id === id) x.power = power; });
      });
      saveDraft();
      refresh();
    },
    onRename: async (id, nick) => {
      await updateMember(id, { nick });
      const p = getParticipant(id);
      if (p) p.nick = nick;
      Object.values(state.allocation).forEach(arr => {
        arr.forEach(x => { if (x.id === id) x.nick = nick; });
      });
      saveDraft();
      refresh();
      toast('Ник обновлён');
    },
    onDelete: async (id) => {
      const m = state.members.find(x => x.id === id);
      if (!m) return;
      if (!confirm(`Удалить ${m.nick} из союза?`)) return;
      await deleteMember(id);
      state.participants = state.participants.filter(p => p.id !== id);
      clearPlayerFromAllocation(id);
      saveDraft();
      await renderAllianceModal();
      refresh();
      updateAddCounter();
    },
    onPick: (member) => {
      if (addedIds().has(member.id)) return;
      state.participants.push({
        id: member.id, nick: member.nick, power: member.power || 0,
        type: 'main', roles: []
      });
      saveDraft();
      renderAllianceModal();
      refresh();
      updateAddCounter();
    },
    onUnpick: (member) => {
      state.participants = state.participants.filter(p => p.id !== member.id);
      clearPlayerFromAllocation(member.id);
      saveDraft();
      renderAllianceModal();
      refresh();
      updateAddCounter();
    }
  });

  // Управление кнопкой «Создать» и подсказкой
  const createBtn = document.getElementById('btn-create-member');
  const hint = document.getElementById('search-hint');

  const exactMatch = query
    ? state.members.find(m => m.nick.toLowerCase() === lower)
    : null;

  if (!query) {
    createBtn.disabled = true;
    hint.textContent = '';
  } else if (exactMatch) {
    createBtn.disabled = true;
    hint.textContent = `Игрок «${exactMatch.nick}» уже есть в союзе.`;
  } else {
    createBtn.disabled = false;
    hint.textContent = filtered.length === 0
      ? `Нет совпадений. Можно создать игрока «${query}».`
      : `Показаны совпадения. Можно создать «${query}» (не найден в списке).`;
  }

  updateAddCounter();
}

document.getElementById('btn-alliance').onclick = async () => {
  document.getElementById('alliance-search').value = '';
  await renderAllianceModal();
  openModal('modal-alliance');
};

document.getElementById('btn-open-alliance-add').onclick = async () => {
  document.getElementById('alliance-search').value = '';
  await renderAllianceModal();
  openModal('modal-alliance');
  setTimeout(() => document.getElementById('alliance-search').focus(), 100);
};

document.getElementById('alliance-search').oninput = () => {
  renderAllianceModal();
};

document.getElementById('alliance-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const createBtn = document.getElementById('btn-create-member');
    if (!createBtn.disabled) createBtn.click();
  }
});

document.getElementById('btn-create-member').onclick = async () => {
  const input = document.getElementById('alliance-search');
  const nick = input.value.trim();
  if (!nick) { toast('Введите ник'); return; }

  // Проверяем, что такого нет (защита от гонки)
  const existing = state.members.find(m => m.nick.toLowerCase() === nick.toLowerCase());
  if (existing) {
    toast('Игрок с таким ником уже есть');
    return;
  }

  const member = await addMember(nick, 0);
  if (!member) { toast('Ошибка добавления'); return; }
  state.members.push(member);

  // Сразу добавляем в состав события
  state.participants.push({
    id: member.id, nick: member.nick, power: 0,
    type: 'main', roles: []
  });

  input.value = '';
  input.focus();
  saveDraft();
  await renderAllianceModal();
  refresh();
  toast(`${member.nick} добавлен`);
};

document.getElementById('btn-alliance-done').onclick = () => {
  closeModal('modal-alliance');
};

// document.getElementById('btn-create-member').onclick = async () => {
//   const input = document.getElementById('new-nick');
//   const nick = input.value.trim();
//   if (!nick) { toast('Введите ник'); return; }

//   let member = state.members.find(m => m.nick.toLowerCase() === nick.toLowerCase());
//   if (!member) {
//     member = await addMember(nick, 0);
//     if (!member) { toast('Ошибка добавления'); return; }
//     state.members.push(member);
//   }
//   if (!addedIds().has(member.id)) {
//     state.participants.push({
//       id: member.id, nick: member.nick, power: member.power || 0,
//       type: 'main', roles: []
//     });
//   }
//   input.value = '';
//   input.focus();
//   saveDraft();
//   await renderAllianceModal();
//   refresh();
//   toast(`${member.nick} добавлен`);
// };


document.getElementById('btn-alliance-done').onclick = () => {
  closeModal('modal-alliance');
};

// ---------- Скрыть/показать размещённых ----------
document.getElementById('btn-toggle-placed').onclick = () => {
  state.hidePlaced = !state.hidePlaced;
  localStorage.setItem('raid_hide_placed', state.hidePlaced ? '1' : '0');
  refresh();
};

// ---------- Фильтры точек ----------
document.getElementById('filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  state.buildingsFilter = btn.dataset.filter;
  localStorage.setItem('raid_buildings_filter', state.buildingsFilter);
  syncFilterButtons();
  renderBuildings(state.allocation, state.participants, state.buildingsFilter, settings.openMinutes);
});

// ---------- Автораспределение ----------
document.getElementById('btn-auto-allocate').onclick = () => {
  if (state.participants.length === 0) return toast('Сначала добавьте участников');

  const result = allocatePlayers(state.participants, settings);

  result.players.forEach(updated => {
    const p = state.participants.find(x => x.id === updated.id);
    if (p) {
      p.roles = [...updated.roles];
      if (updated.flights) p.flights = [...updated.flights];
    }
  });

  state.allocation = result.allocation;
  state.pilots = result.pilots;
  state.barrels = result.barrels;

  saveDraft();
  refresh();
  toast(`Распределено: ${result.pilots.length} на центр, ${result.barrels.length} на бочки`);
};

document.getElementById('btn-clear-allocate').onclick = () => {
  state.allocation = {};
  state.pilots = [];
  state.barrels = [];
  state.participants.forEach(p => {
    delete p.isPilot;
    delete p.flights;
  });
  saveDraft();
  refresh();
  toast('Распределение очищено');
};

// ---------- Утвердить ----------
document.getElementById('btn-approve').onclick = async () => {
  const entry = {
    date: nextSunday(),
    participants: state.participants.map(p => ({
      id: p.id, nick: p.nick, power: p.power,
      type: p.type, roles: p.roles || [],
      flights: p.flights || []
    })),
    allocation: state.allocation,
    pilots: state.pilots.map(p => p.id),
    barrels: state.barrels.map(p => p.id)
  };
  await saveHistory(entry);
  localStorage.removeItem(DRAFT_KEY);
  toast('Расстановка сохранена в историю');
};

// ---------- История ----------
document.getElementById('btn-history').onclick = async () => {
  const history = await getHistory();
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  if (history.length === 0) {
    list.innerHTML = '<div class="building-card__empty">История пуста</div>';
  }
  history.forEach(h => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const totalPower = (h.participants || []).reduce((s, p) => s + (p.power || 0), 0);
    const buildingsCount = Object.keys(h.allocation || {}).length;
    item.innerHTML = `
      <div class="history-item__head">
        <div>
          <div class="history-item__date">${h.date || '—'}</div>
          <div class="history-item__stats">
            Участников: ${(h.participants || []).length} · Точек: ${buildingsCount} · Σ БМ: ${totalPower.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div class="history-item__actions">
          <button class="btn btn--primary btn-load"><i class="fa-solid fa-upload"></i> Загрузить</button>
          <button class="btn btn--ghost btn-del"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
    item.querySelector('.btn-load').onclick = () => {
      state.participants = (h.participants || []).map(p => ({ ...p }));
      state.allocation = h.allocation || {};
      state.pilots = (h.pilots || []).map(id => state.participants.find(p => p.id === id)).filter(Boolean);
      state.barrels = (h.barrels || []).map(id => state.participants.find(p => p.id === id)).filter(Boolean);
      saveDraft();
      refresh();
      closeModal('modal-history');
      toast('Расстановка загружена');
    };
    item.querySelector('.btn-del').onclick = async () => {
      if (!confirm('Удалить запись из истории?')) return;
      await deleteHistory(h.id);
      item.remove();
    };
    list.appendChild(item);
  });
  openModal('modal-history');
};

// ---------- Тема ----------
document.getElementById('btn-theme').onclick = () => {
  const grid = document.getElementById('theme-grid');
  grid.querySelectorAll('.theme-swatch').forEach(b => {
    b.classList.toggle('active', b.dataset.themeValue === document.documentElement.dataset.theme);
  });
  openModal('modal-theme');
};
document.getElementById('theme-grid').addEventListener('click', e => {
  const btn = e.target.closest('.theme-swatch');
  if (!btn) return;
  document.documentElement.dataset.theme = btn.dataset.themeValue;
  localStorage.setItem('theme', btn.dataset.themeValue);
  closeModal('modal-theme');
});

// ---------- Настройки ----------
function renderSettingsModal() {
  document.getElementById('inp-scroll-speed').value = settings.scrollSpeed;
  document.getElementById('lbl-scroll-speed').textContent = settings.scrollSpeed;
  document.getElementById('inp-scroll-zone').value = settings.scrollZone;
  document.getElementById('lbl-scroll-zone').textContent = settings.scrollZone;

  document.getElementById('inp-pilot-count').value = settings.pilotCount;
  document.getElementById('inp-barrel-count').value = settings.barrelCount;

  const container = document.getElementById('settings-buildings');
  container.innerHTML = '';
  BUILDINGS.forEach(b => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = `
      <span class="settings-row__name">${escapeHtml(b.name)}</span>
      <select data-id="${b.id}" data-kind="priority">
        <option value="high">Высокий</option>
        <option value="medium">Средний</option>
        <option value="low">Низкий</option>
      </select>
      <input type="number" data-id="${b.id}" data-kind="min" min="0" max="10" />
      <input type="number" data-id="${b.id}" data-kind="open" min="0" max="120" />
    `;
    row.querySelector('select').value = settings.priorities[b.id] || 'medium';
    row.querySelector('input[data-kind="min"]').value = settings.minPlayers[b.id] ?? b.minPlayers;
    row.querySelector('input[data-kind="open"]').value = settings.openMinutes[b.id] ?? b.openAt ?? 0;
    container.appendChild(row);
  });

  document.getElementById('inp-auto-flights').checked = !!settings.autoFlights?.enabled;
  renderFlightRules();
}

function renderFlightRules() {
  const container = document.getElementById('flights-rules');
  container.innerHTML = '';
  const rules = settings.autoFlights?.rules || [];

  if (rules.length === 0) {
    container.innerHTML = '<div class="building-card__empty" style="padding:8px;">Правил нет. Нажмите «Добавить правило».</div>';
    return;
  }

  rules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'flight-rule';
    row.innerHTML = `
      <input type="checkbox" data-idx="${idx}" data-field="enabled" ${rule.enabled ? 'checked' : ''} />
      <select data-idx="${idx}" data-field="from"></select>
      <span class="flight-rule__arrow">→</span>
      <select data-idx="${idx}" data-field="to"></select>
      <input type="number" data-idx="${idx}" data-field="limit" min="1" max="20" value="${rule.limit || 1}" />
      <button class="flight-rule__del" data-idx="${idx}" title="Удалить правило">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;

    const fromSel = row.querySelector('select[data-field="from"]');
    const toSel = row.querySelector('select[data-field="to"]');

    fromSel.innerHTML = '<option value="any">Любая</option>' +
      BUILDINGS.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    toSel.innerHTML = BUILDINGS.map(b =>
      `<option value="${b.id}">${escapeHtml(b.name)}</option>`
    ).join('');

    fromSel.value = rule.from || 'any';
    toSel.value = rule.to || 'center';

    row.querySelector('input[type="checkbox"]').onchange = e => {
      settings.autoFlights.rules[idx].enabled = e.target.checked;
    };
    fromSel.onchange = e => { settings.autoFlights.rules[idx].from = e.target.value; };
    toSel.onchange = e => { settings.autoFlights.rules[idx].to = e.target.value; };
    row.querySelector('input[type="number"]').onchange = e => {
      settings.autoFlights.rules[idx].limit = Number(e.target.value) || 1;
    };
    row.querySelector('.flight-rule__del').onclick = () => {
      settings.autoFlights.rules.splice(idx, 1);
      renderFlightRules();
    };

    container.appendChild(row);
  });
}

document.getElementById('btn-settings').onclick = () => {
  renderSettingsModal();
  openModal('modal-settings');
};

document.getElementById('inp-scroll-speed').oninput = e => {
  document.getElementById('lbl-scroll-speed').textContent = e.target.value;
};
document.getElementById('inp-scroll-zone').oninput = e => {
  document.getElementById('lbl-scroll-zone').textContent = e.target.value;
};

document.getElementById('btn-settings-save').onclick = () => {
  settings.scrollSpeed = Number(document.getElementById('inp-scroll-speed').value);
  settings.scrollZone = Number(document.getElementById('inp-scroll-zone').value);
  settings.pilotCount = Number(document.getElementById('inp-pilot-count').value);
  settings.barrelCount = Number(document.getElementById('inp-barrel-count').value);
  settings.autoFlights = settings.autoFlights || { enabled: false, rules: [] };
  settings.autoFlights.enabled = document.getElementById('inp-auto-flights').checked;

  document.querySelectorAll('#settings-buildings .settings-row').forEach(row => {
    const sel = row.querySelector('select');
    const min = row.querySelector('input[data-kind="min"]');
    const open = row.querySelector('input[data-kind="open"]');
    settings.priorities[sel.dataset.id] = sel.value;
    settings.minPlayers[min.dataset.id] = Number(min.value);
    settings.openMinutes[open.dataset.id] = Number(open.value);
  });

  saveSettings();
  setDnDConfig({ scrollSpeed: settings.scrollSpeed, scrollZone: settings.scrollZone });
  closeModal('modal-settings');
  toast('Настройки сохранены');
};

document.getElementById('btn-settings-reset').onclick = () => {
  if (!confirm('Сбросить все настройки к значениям по умолчанию?')) return;
  settings = structuredClone(DEFAULT_SETTINGS);
  saveSettings();
  setDnDConfig({ scrollSpeed: settings.scrollSpeed, scrollZone: settings.scrollZone });
  renderSettingsModal();
  toast('Сброшено');
};

document.getElementById('btn-add-flight-rule').onclick = () => {
  settings.autoFlights = settings.autoFlights || { enabled: false, rules: [] };
  settings.autoFlights.rules = settings.autoFlights.rules || [];
  settings.autoFlights.rules.push({
    from: 'any', to: 'center', limit: 3, enabled: true
  });
  renderFlightRules();
};

// ---------- Старт ----------
init().catch(err => {
  console.error(err);
  toast('Ошибка загрузки. Проверьте Firebase-конфиг.');
});