let dragged = null;

let dndConfig = { scrollSpeed: 20, scrollZone: 100 };
export function setDnDConfig(cfg) {
  dndConfig = { ...dndConfig, ...cfg };
}

export const IS_TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;

let autoScrollDir = 0;
let autoScrollRAF = null;

function startAutoScrollLoop() {
  if (autoScrollRAF) return;
  const tick = () => {
    if (autoScrollDir !== 0) {
      window.scrollBy(0, autoScrollDir * dndConfig.scrollSpeed);
      autoScrollRAF = requestAnimationFrame(tick);
    } else {
      autoScrollRAF = null;
    }
  };
  autoScrollRAF = requestAnimationFrame(tick);
}

function updateAutoScroll(clientY) {
  const h = window.innerHeight;
  if (clientY < dndConfig.scrollZone) {
    autoScrollDir = -1;
    startAutoScrollLoop();
  } else if (clientY > h - dndConfig.scrollZone) {
    autoScrollDir = 1;
    startAutoScrollLoop();
  } else {
    autoScrollDir = 0;
  }
}

function stopAutoScroll() {
  autoScrollDir = 0;
  if (autoScrollRAF) cancelAnimationFrame(autoScrollRAF);
  autoScrollRAF = null;
}

export function initDnD({ onDropPlayer, onToggleRole, onClearRoles }) {
  // ===== DESKTOP: перетаскивание чипов между точками =====
  if (!IS_TOUCH_DEVICE) {
    document.addEventListener('dragstart', e => {
      const chip = e.target.closest('.player-chip');
      if (!chip) return;
      if (e.target.closest('input, .building-card__remove, .player-chip__type, .player-chip__roles i')) return;

      dragged = {
        kind: 'player',
        id: chip.dataset.id,
        from: chip.dataset.from || 'pool'
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragged.id);
      chip.classList.add('dragging');
    });

    document.addEventListener('dragend', () => {
      document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
      dragged = null;
      stopAutoScroll();
    });

    document.addEventListener('dragover', e => {
      if (!dragged) return;
      e.preventDefault();
      updateAutoScroll(e.clientY);
      const zone = e.target.closest('[data-drop]');
      if (zone) zone.classList.add('drop-target');
    });

    document.addEventListener('dragleave', e => {
      const zone = e.target.closest('[data-drop]');
      if (zone) zone.classList.remove('drop-target');
    });

    document.addEventListener('drop', e => {
      stopAutoScroll();
      if (!dragged) return;
      const zone = e.target.closest('[data-drop]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('drop-target');
      onDropPlayer(dragged.id, dragged.from, zone.dataset.drop);
      dragged = null;
    });
  }

  // ---------- Кастомные события от чипа ----------
  document.addEventListener('chip:remove', e => {
    if (typeof window.__onRemoveParticipant === 'function') {
      window.__onRemoveParticipant(e.detail.id);
    }
  });

  document.addEventListener('chip:toggle-type', e => {
    if (typeof window.__onToggleType === 'function') {
      window.__onToggleType(e.detail.id);
    }
  });

  document.addEventListener('chip:remove-role', e => {
    onToggleRole(e.detail.id, e.detail.role);
  });

  document.addEventListener('chip:remove-from-building', e => {
    if (typeof window.__onRemoveFromBuilding === 'function') {
      window.__onRemoveFromBuilding(e.detail.id, e.detail.buildingId);
    }
  });

  document.addEventListener('chip:power-changed', e => {
    if (typeof window.__onPowerChanged === 'function') {
      window.__onPowerChanged(e.detail.id, e.detail.power);
    }
  });

  document.addEventListener('chip:flights-changed', e => {
    if (typeof window.__onFlightsChanged === 'function') {
      window.__onFlightsChanged(e.detail.id, e.detail.removed);
    }
  });
}