import { BUILDINGS } from './allocator.js';

// Стандартные позиции точек
export const DEFAULT_POSITIONS = {
  wp3:     { x: 18, y: 10 },
  wp2:     { x: 82, y: 10 },
  tc2:     { x: 82, y: 30 },
  solar:   { x: 10, y: 35 },
  dev:     { x: 40, y: 45 },
  center:  { x: 55, y: 60 },
  tc1:     { x: 40, y: 78 },
  milfac:  { x: 85, y: 78 },
  wp1:     { x: 12, y: 88 },
  wp4:     { x: 75, y: 92 },
  helipad: { x: 92, y: 70 }
};

// 4 фиксированные зоны бочек
export const DEFAULT_BARREL_ZONES = [
  { x: 55, y: 30 },
  { x: 30, y: 55 },
  { x: 55, y: 78 },
  { x: 30, y: 65 }
];

const NS = 'http://www.w3.org/2000/svg';

let editMode = false;
let editPositions = {};
let editBarrelZones = [];
let currentSettings = null;
let currentAllocation = null;
let currentParticipants = null;
let onMarkerClickCallback = null;

export function renderMap({
  allocation,
  participants,
  settings,
  onMarkerClick
}) {
  console.log('=== renderMap ===');
  console.log('settings.mapPositions:', settings.mapPositions);
  const svg = document.getElementById('map-svg');
  if (!svg) return;

  currentAllocation = allocation;
  currentParticipants = participants;
  currentSettings = settings;
  onMarkerClickCallback = onMarkerClick;

  const saved = settings.mapPositions || {};

  // Точки
  editPositions = {};
  BUILDINGS.forEach(b => {
    editPositions[b.id] = saved[b.id]
      ? { ...saved[b.id] }
      : { ...DEFAULT_POSITIONS[b.id] };
  });

  // Зоны бочек — всегда 4, берём сохранённые или дефолтные
  if (Array.isArray(saved.__barrels) && saved.__barrels.length === DEFAULT_BARREL_ZONES.length) {
    editBarrelZones = saved.__barrels.map(z => ({ x: z.x, y: z.y }));
  } else {
    editBarrelZones = DEFAULT_BARREL_ZONES.map(z => ({ ...z }));
  }

  drawSvg();
}

function drawSvg() {
  const svg = document.getElementById('map-svg');
  if (!svg) return;
  svg.innerHTML = '';

 const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `
    <marker id="arrowhead" markerWidth="6" markerHeight="6"
      refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
      <polygon points="0 0, 6 3, 0 6" fill="var(--accent)" fill-opacity="0.5" />
    </marker>
  `;
  svg.appendChild(defs);

  // Данные по точкам
  const byPoint = {};
  const playerById = new Map();
  currentParticipants.forEach(p => playerById.set(p.id, p));

  Object.entries(currentAllocation).forEach(([bid, arr]) => {
    if (!byPoint[bid]) byPoint[bid] = [];
    arr.forEach(p => {
      const player = playerById.get(p.id) || p;
      byPoint[bid].push({ player, isPilot: p.isPilot });
    });
  });

  // Стрелки перелётов
  const arrows = [];
  currentParticipants.forEach(p => {
    const flights = p.flights || [];
    if (flights.length === 0) return;
    const sourceId = Object.keys(currentAllocation).find(bid =>
      currentAllocation[bid].some(x => x.id === p.id)
    );
    if (!sourceId) return;
    flights.forEach(f => {
      arrows.push({ fromId: sourceId, toId: f.toBuildingId });
    });
  });

  const arrowPairs = {};
  arrows.forEach(a => {
    const key = `${a.fromId}->${a.toId}`;
    arrowPairs[key] = (arrowPairs[key] || 0) + 1;
  });

    // Радиусы маркеров (в единицах viewBox 0..100)
  // Точка — кружок r=3.2, добавляем 0.8 отступа
  const R_POINT = 3.2 + 0.8;

  Object.entries(arrowPairs).forEach(([key, count]) => {
    const [fromId, toId] = key.split('->');
    const from = editPositions[fromId];
    const to = editPositions[toId];
    if (!from || !to) return;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    // Начало и конец стрелки — отступаем от центров на радиусы маркеров
    const startX = from.x + ux * R_POINT;
    const startY = from.y + uy * R_POINT;
    const endX = to.x - ux * R_POINT;
    const endY = to.y - uy * R_POINT;

    // Смещение кривой — для разделения параллельных стрелок
    const nx = -uy;
    const ny = ux;
    const offset = 2.5;
    const cx = (startX + endX) / 2 + nx * offset;
    const cy = (startY + endY) / 2 + ny * offset;

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--accent)');
    path.setAttribute('stroke-width', String(0.3 + Math.min(count, 5) * 0.1));
    path.setAttribute('stroke-opacity', '0.35');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('stroke-dasharray', '2 1.5');
    path.setAttribute('pointer-events', 'none');
    svg.appendChild(path);

    // Подпись с количеством — в середине кривой, но сдвинута вверх/вбок
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', String(cx + nx * 1.2));
    label.setAttribute('y', String(cy + ny * 1.2 - 0.6));
    label.setAttribute('fill', 'var(--accent)');
    label.setAttribute('font-size', '1.8');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('pointer-events', 'none');
    // Обводка вокруг цифры, чтобы читалась даже на стрелке
    label.setAttribute('stroke', 'var(--bg)');
    label.setAttribute('stroke-width', '0.5');
    label.setAttribute('paint-order', 'stroke fill');
    label.textContent = String(count);
    svg.appendChild(label);
  });

  // Маркеры точек
  BUILDINGS.forEach(b => {
    const pos = editPositions[b.id];
    if (!pos) return;

    const players = byPoint[b.id] || [];
    const sum = players.reduce((s, p) => s + (p.player.power || 0), 0);
    const minReq = currentSettings.minPlayers?.[b.id] ?? b.minPlayers ?? 0;
    const under = players.length < minReq;

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'map-point' + (under ? ' map-point--under' : '') + (editMode ? ' map-point--editable' : ''));
    g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
    g.style.cursor = editMode ? 'grab' : 'pointer';
    g.dataset.buildingId = b.id;

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', 3.2);
    circle.setAttribute('fill', under ? 'var(--danger)' : 'var(--accent)');
    circle.setAttribute('stroke', 'var(--bg-elev)');
    circle.setAttribute('stroke-width', '0.5');
    g.appendChild(circle);

    const fo = document.createElementNS(NS, 'foreignObject');
    fo.setAttribute('x', -3.2);
    fo.setAttribute('y', -3.2);
    fo.setAttribute('width', 6.4);
    fo.setAttribute('height', 6.4);
    fo.setAttribute('pointer-events', 'none');
    const div = document.createElement('div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:2.4px;';
    div.innerHTML = `<i class="fa-solid ${b.icon}"></i>`;
    fo.appendChild(div);
    g.appendChild(fo);

        const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', 0);
    label.setAttribute('y', 6);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '1.8');
    label.setAttribute('fill', 'var(--text)');
    label.setAttribute('font-weight', '700');
    label.setAttribute('pointer-events', 'none');
    // Обводка — читаемость на фоне стрелок
    label.setAttribute('stroke', 'var(--bg)');
    label.setAttribute('stroke-width', '0.4');
    label.setAttribute('paint-order', 'stroke fill');
    label.textContent = b.name;
    g.appendChild(label);

    const counter = document.createElementNS(NS, 'text');
    counter.setAttribute('x', 0);
    counter.setAttribute('y', 8.2);
    counter.setAttribute('text-anchor', 'middle');
    counter.setAttribute('font-size', '1.6');
    counter.setAttribute('fill', under ? 'var(--danger)' : 'var(--text-dim)');
    counter.setAttribute('font-weight', '700');
    counter.setAttribute('pointer-events', 'none');
    counter.setAttribute('stroke', 'var(--bg)');
    counter.setAttribute('stroke-width', '0.4');
    counter.setAttribute('paint-order', 'stroke fill');
    counter.textContent = `${players.length}/${minReq}  •  ${sum.toLocaleString('ru-RU')}`;
    g.appendChild(counter);

    if (editMode) {
      attachDragHandlers(g, 'point', b.id);
    } else {
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onMarkerClickCallback) onMarkerClickCallback(b, players);
      });
    }

    svg.appendChild(g);
  });

  // Маркеры бочек — 4 фиксированные, можно только перетаскивать
  editBarrelZones.forEach((zone, index) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${zone.x}, ${zone.y})`);
    g.setAttribute('class', 'map-barrel-zone' + (editMode ? ' map-barrel-zone--editable' : ''));
    if (!editMode) {
      g.setAttribute('pointer-events', 'none');
    } else {
      g.style.cursor = 'grab';
    }

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', -2.8);
    rect.setAttribute('y', -2.8);
    rect.setAttribute('width', 5.6);
    rect.setAttribute('height', 5.6);
    rect.setAttribute('rx', 1);
    rect.setAttribute('fill', 'var(--bg-elev)');
    rect.setAttribute('stroke', 'var(--success)');
    rect.setAttribute('stroke-width', editMode ? '0.7' : '0.4');
    g.appendChild(rect);

    const icon = document.createElementNS(NS, 'foreignObject');
    icon.setAttribute('x', -2.5);
    icon.setAttribute('y', -2.5);
    icon.setAttribute('width', 5);
    icon.setAttribute('height', 5);
    icon.setAttribute('pointer-events', 'none');
    const div = document.createElement('div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--success);font-size:2.2px;';
    div.innerHTML = `<i class="fa-solid fa-bottle-water"></i>`;
    icon.appendChild(div);
    g.appendChild(icon);

    if (editMode) {
      attachDragHandlers(g, 'barrel', index);
    }

    svg.appendChild(g);
  });
}

// ---------- Перетаскивание ----------
function attachDragHandlers(g, type, id) {
  let dragging = false;

  const getSvgCoords = (clientX, clientY) => {
    const svg = document.getElementById('map-svg');
    const rect = svg.getBoundingClientRect();
    const vbW = 100, vbH = 100;
    const scale = Math.min(rect.width / vbW, rect.height / vbH);
    const offsetX = (rect.width - vbW * scale) / 2;
    const offsetY = (rect.height - vbH * scale) / 2;
    const x = (clientX - rect.left - offsetX) / scale;
    const y = (clientY - rect.top - offsetY) / scale;
    return { x, y };
  };

  const updatePosition = (x, y) => {
    if (type === 'point') {
      editPositions[id] = { x, y };
    } else {
      editBarrelZones[id] = { x, y };
    }
  };

  const onDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    g.style.cursor = 'grabbing';
    g.setAttribute('filter', 'drop-shadow(0 0 1px var(--accent))');
  };

  const onMove = (clientX, clientY) => {
    if (!dragging) return;
    const { x, y } = getSvgCoords(clientX, clientY);
    const cx = Math.max(3, Math.min(97, x));
    const cy = Math.max(3, Math.min(97, y));
    updatePosition(cx, cy);
    g.setAttribute('transform', `translate(${cx}, ${cy})`);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    g.style.cursor = 'grab';
    g.removeAttribute('filter');
  };

  g.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onUp);

  g.addEventListener('touchstart', onDown, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches[0];
    onMove(t.clientX, t.clientY);
  }, { passive: false });
  document.addEventListener('touchend', onUp);
}

// ---------- Публичные методы ----------
export function setEditMode(enabled) {
  editMode = enabled;
  drawSvg();
}

export function resetPositions() {
  BUILDINGS.forEach(b => {
    editPositions[b.id] = { ...DEFAULT_POSITIONS[b.id] };
  });
  editBarrelZones = DEFAULT_BARREL_ZONES.map(z => ({ ...z }));
  drawSvg();
}

export function getPositions() {
  const result = { ...editPositions };
  result.__barrels = editBarrelZones.map(z => ({ x: z.x, y: z.y }));
  return result;
}