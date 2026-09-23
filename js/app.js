import { getMembers, addMember, updateMember, deleteMember,
         getHistory, saveHistory, deleteHistory } from './storage.js';
import { BUILDINGS, allocatePlayers } from './allocator.js';
import { renderParticipants, renderBuildings, renderAllianceList, escapeHtml } from './ui.js';
import { initDnD } from './dnd.js';

// ---------- Состояние ----------
const state = {
  members: [],
  participants: [],
  allocation: {},
  pilots: [],
  barrels: [],
  hidePlaced: localStorage.getItem('raid_hide_placed') === '1'
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
  renderBuildings(state.allocation, state.participants);
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

// ---------- Инициализация ----------
async function init() {
  state.members = await getMembers();

  // Восстанавливаем черновик
  const draft = loadDraft();
  if (draft) {
    state.participants = draft.participants || [];
    state.allocation = draft.allocation || {};
    state.pilots = draft.pilots || [];
    state.barrels = draft.barrels || [];
  }

  refresh();
  updateAddCounter();

  initDnD({
    // Игрок перетащен на таблицу или в пул
    onDropPlayer: (id, from, to) => {
      const player = getParticipant(id);
      if (!player) return;

      if (to === 'pool') {
        if (from !== 'pool') clearPlayerFromAllocation(id);
      } else {
        if (from !== 'pool') clearPlayerFromAllocation(id);
        state.allocation[to] = state.allocation[to] || [];
        if (!state.allocation[to].find(p => p.id === id)) {
          state.allocation[to].push({
            ...player,
            isPilot: (player.roles || []).includes('pilot')
          });
        }
      }
      saveDraft();
      refresh();
    },

    // Toggle роли
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

    // Сброс всех ролей
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

  // Глобальные обработчики
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
    saveDraft();
    refresh();
  };

  window.__onRemoveFromBuilding = (id, buildingId) => {
    if (state.allocation[buildingId]) {
      state.allocation[buildingId] = state.allocation[buildingId].filter(p => p.id !== id);
    }
    saveDraft();
    refresh();
  };

  // Изменение БМ — сохраняем в союз, в allocation и в черновик
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
  if (el) el.textContent = `Добавлено: ${state.participants.length}`;
}

async function refreshAlliancePicker() {
  state.members = await getMembers();
  const filter = document.getElementById('search-nick').value;
  const filtered = state.members.filter(m =>
    m.nick.toLowerCase().includes(filter.toLowerCase())
  );
  renderAllianceList(
    filtered,
    addedIds(),
    // onPick — добавить
    (member) => {
      if (addedIds().has(member.id)) return;
      state.participants.push({
        id: member.id, nick: member.nick, power: member.power || 0,
        type: 'main', roles: []
      });
      saveDraft();
      refreshAlliancePicker();
      refresh();
      updateAddCounter();
    },
    // onUnpick — убрать
    (member) => {
      state.participants = state.participants.filter(p => p.id !== member.id);
      clearPlayerFromAllocation(member.id);
      saveDraft();
      refreshAlliancePicker();
      refresh();
      updateAddCounter();
    }
  );
}

document.getElementById('btn-add-player').onclick = async () => {
  await refreshAlliancePicker();
  updateAddCounter();
  openModal('modal-add-player');
  setTimeout(() => document.getElementById('new-nick').focus(), 100);
};

document.getElementById('btn-toggle-placed').onclick = () => {
  state.hidePlaced = !state.hidePlaced;
  localStorage.setItem('raid_hide_placed', state.hidePlaced ? '1' : '0');
  refresh();
};

document.getElementById('search-nick').oninput = refreshAlliancePicker;

document.getElementById('btn-create-player').onclick = async () => {
  const input = document.getElementById('new-nick');
  const nick = input.value.trim();
  const type = document.querySelector('input[name="new-type"]:checked').value;
  if (!nick) { toast('Введите ник'); return; }

  let member = state.members.find(m => m.nick.toLowerCase() === nick.toLowerCase());
  if (!member) {
    member = await addMember(nick, 0);
    if (!member) { toast('Ошибка добавления'); return; }
    state.members.push(member);
  }
  if (addedIds().has(member.id)) {
    toast('Этот игрок уже добавлен');
    return;
  }
  state.participants.push({
    id: member.id, nick: member.nick, power: member.power || 0,
    type, roles: []
  });
  input.value = '';
  input.focus();
  await refreshAlliancePicker();
  saveDraft();
  refresh();
  updateAddCounter();
  toast(`${member.nick} добавлен`);
};

document.getElementById('new-nick').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-create-player').click();
  }
});

document.getElementById('btn-add-done').onclick = () => {
  closeModal('modal-add-player');
};

// ---------- Автораспределение ----------
document.getElementById('btn-auto-allocate').onclick = () => {
  if (state.participants.length === 0) return toast('Сначала добавьте участников');

  const result = allocatePlayers(state.participants);

  // Обновляем роли у участников из результата
  result.players.forEach(updated => {
    const p = state.participants.find(x => x.id === updated.id);
    if (p) p.roles = [...updated.roles];
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
  state.participants.forEach(p => delete p.isPilot);
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
      type: p.type, roles: p.roles || []
    })),
    allocation: state.allocation,
    pilots: state.pilots.map(p => p.id),
    barrels: state.barrels.map(p => p.id)
  };
  await saveHistory(entry);
  localStorage.removeItem(DRAFT_KEY);
  toast('Расстановка сохранена в историю');
};

// ---------- Союз ----------
document.getElementById('btn-alliance').onclick = async () => {
  state.members = await getMembers();
  const list = document.getElementById('alliance-manage-list');
  list.innerHTML = '';
  if (state.members.length === 0) {
    list.innerHTML = '<div class="building-card__empty">Список пуст</div>';
  }
  state.members.forEach(m => {
    const item = document.createElement('div');
    item.className = 'alliance-item';
    item.innerHTML = `
      <span class="alliance-item__nick">${escapeHtml(m.nick)}</span>
      <input class="alliance-item__power" type="number" value="${m.power || 0}" />
      <button class="btn btn--ghost btn-edit" title="Переименовать"><i class="fa-solid fa-pen"></i></button>
      <button class="btn btn--ghost btn-del" title="Удалить"><i class="fa-solid fa-trash"></i></button>
    `;
    item.querySelector('.alliance-item__power').onchange = async e => {
      const newPower = Number(e.target.value) || 0;
      await updateMember(m.id, { power: newPower });
      // Обновляем также в participants и allocation
      const p = getParticipant(m.id);
      if (p) p.power = newPower;
      Object.values(state.allocation).forEach(arr => {
        arr.forEach(x => { if (x.id === m.id) x.power = newPower; });
      });
      saveDraft();
      refresh();
      toast('Сохранено');
    };
    item.querySelector('.btn-edit').onclick = () => {
      const span = item.querySelector('.alliance-item__nick');
      span.contentEditable = 'true';
      span.focus();
      span.onblur = async () => {
        span.contentEditable = 'false';
        const newNick = span.textContent.trim();
        if (newNick && newNick !== m.nick) {
          await updateMember(m.id, { nick: newNick });
          toast('Ник обновлён');
        }
      };
    };
    item.querySelector('.btn-del').onclick = async () => {
      if (!confirm(`Удалить ${m.nick}?`)) return;
      await deleteMember(m.id);
      item.remove();
      toast('Удалено');
    };
    list.appendChild(item);
  });
  openModal('modal-alliance');
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
            Участников: ${(h.participants || []).length} · Точек: ${buildingsCount} · Σ БМ: ${totalPower.toLocaleString('ru-RU')}
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

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, 2500);
}

// ---------- Старт ----------
init().catch(err => {
  console.error(err);
  toast('Ошибка загрузки. Проверьте Firebase-конфиг.');
});