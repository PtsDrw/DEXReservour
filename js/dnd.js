let dragged = null;
let touchDragged = null;
let touchStartX = 0, touchStartY = 0;
let touchTimer = null;
let touchGhost = null;

// ---------- Автоскролл ----------
const SCROLL_ZONE = 100;    // px от края, где включается автопрокрутка
const SCROLL_SPEED = 20;    // px за тик
let autoScrollDir = 0;      // -1 вверх, 0 стоп, 1 вниз
let autoScrollRAF = null;

function startAutoScrollLoop() {
  if (autoScrollRAF) return;
  const tick = () => {
    if (autoScrollDir !== 0) {
      window.scrollBy(0, autoScrollDir * SCROLL_SPEED);
      autoScrollRAF = requestAnimationFrame(tick);
    } else {
      autoScrollRAF = null;
    }
  };
  autoScrollRAF = requestAnimationFrame(tick);
}

function updateAutoScroll(clientY) {
  const h = window.innerHeight;
  if (clientY < SCROLL_ZONE) {
    autoScrollDir = -1;
    startAutoScrollLoop();
  } else if (clientY > h - SCROLL_ZONE) {
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

// ---------- Основной модуль ----------
export function initDnD({ onDropPlayer, onToggleRole, onClearRoles }) {
  // ---------- HTML5 DnD (десктоп) ----------
  document.addEventListener('dragstart', e => {
    const chip = e.target.closest('.player-chip');
    if (chip && !chip.classList.contains('placed')) {
      dragged = { kind: 'player', id: chip.dataset.id, from: chip.dataset.from || 'pool' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragged.id);
      chip.classList.add('dragging');
    }
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

    // Автоскролл к краям экрана
    updateAutoScroll(e.clientY);

    const zone = e.target.closest('[data-drop]');
    const role = e.target.closest('.role-chip');
    if (zone || role) {
      (zone || role).classList.add('drop-target');
    }
  });

  document.addEventListener('dragleave', e => {
    const zone = e.target.closest('[data-drop]');
    const role = e.target.closest('.role-chip');
    if (zone) zone.classList.remove('drop-target');
    if (role) role.classList.remove('drop-target');
  });

  document.addEventListener('drop', e => {
    stopAutoScroll();
    if (!dragged) return;

    const roleEl = e.target.closest('.role-chip');
    if (roleEl) {
      e.preventDefault();
      roleEl.classList.remove('drop-target');
      const role = roleEl.dataset.role;
      if (role === 'clear') onClearRoles(dragged.id);
      else onToggleRole(dragged.id, role);
      dragged = null;
      return;
    }

    const zone = e.target.closest('[data-drop]');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('drop-target');
    onDropPlayer(dragged.id, dragged.from, zone.dataset.drop);
    dragged = null;
  });

  // ---------- Touch DnD (мобильные) ----------
  document.addEventListener('touchstart', e => {
    const chip = e.target.closest('.player-chip');
    if (!chip || chip.classList.contains('placed')) return;
    if (e.target.closest('input, button, .player-chip__type, .player-chip__roles')) return;

    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    touchTimer = setTimeout(() => {
      touchDragged = {
        id: chip.dataset.id,
        from: chip.dataset.from || 'pool',
        chip
      };
      chip.classList.add('dragging');
      createGhost(chip, touchStartX, touchStartY);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 200);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const touch = e.touches[0];

    if (!touchDragged && touchTimer) {
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      if (dx > 8 || dy > 8) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }

    if (!touchDragged) return;
    e.preventDefault();

    moveGhost(touch.clientX, touch.clientY);

    // Автоскролл к краям
    updateAutoScroll(touch.clientY);

    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const zone = target?.closest('[data-drop]');
    const roleEl = target?.closest('.role-chip');
    if (zone || roleEl) {
      (zone || roleEl).classList.add('drop-target');
    }
  }, { passive: false });

  document.addEventListener('touchend', e => {
    stopAutoScroll();
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }

    if (!touchDragged) return;

    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const roleEl = el?.closest('.role-chip');
    const zone = el?.closest('[data-drop]');

    if (roleEl) {
      const role = roleEl.dataset.role;
      if (role === 'clear') onClearRoles(touchDragged.id);
      else onToggleRole(touchDragged.id, role);
    } else if (zone) {
      onDropPlayer(touchDragged.id, touchDragged.from, zone.dataset.drop);
    }

    cleanupTouchDrag();
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    stopAutoScroll();
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    cleanupTouchDrag();
  }, { passive: true });

  // ---------- кастомные события от чипа ----------
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
}

// ---------- Хелперы для touch-ghost ----------
function createGhost(chip, x, y) {
  touchGhost = chip.cloneNode(true);
  touchGhost.style.position = 'fixed';
  touchGhost.style.pointerEvents = 'none';
  touchGhost.style.zIndex = '9999';
  touchGhost.style.opacity = '0.9';
  touchGhost.style.transform = 'scale(0.95)';
  touchGhost.style.boxShadow = '0 8px 24px rgba(0,0,0,.4)';
  touchGhost.style.width = chip.offsetWidth + 'px';
  touchGhost.classList.remove('placed');
  document.body.appendChild(touchGhost);
  moveGhost(x, y);
}

function moveGhost(x, y) {
  if (!touchGhost) return;
  const w = touchGhost.offsetWidth;
  const h = touchGhost.offsetHeight;
  touchGhost.style.left = (x - w / 2) + 'px';
  touchGhost.style.top = (y - h / 2) + 'px';
}

function cleanupTouchDrag() {
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  if (touchGhost) { touchGhost.remove(); touchGhost = null; }
  touchDragged = null;
}