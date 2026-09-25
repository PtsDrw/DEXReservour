import { BUILDINGS } from './allocator.js';

// Цвета для canvas (нельзя использовать CSS-переменные)
const COLORS = {
  bg:        '#0f172a',
  bgCard:    '#1e293b',
  bgCard2:   '#334155',
  text:      '#e2e8f0',
  textDim:   '#94a3b8',
  border:    '#334155',
  accent:    '#3b82f6',
  success:   '#10b981',
  danger:    '#ef4444',
  warning:   '#f59e0b'
};

// Иконки FontAwesome заменяем на текстовые эмодзи
const ICON_EMOJI = {
  'fa-industry': '🏭',
  'fa-filter': '🚰',
  'fa-solar-panel': '☀️',
  'fa-helicopter': '🚁',
  'fa-gears': '⚙️',
  'fa-flask': '🧪',
  'fa-water': '💧'
};

// Общие размеры карточек
const CARD_GAP = 20;
const CARD_HEADER_HEIGHT = 40;
const CARD_ROW_HEIGHT = 28;
const CARD_PADDING = 16;
const CARD_BOTTOM_MARGIN = 20;

// Лимит canvas по площади (iOS Safari ломается на больших размерах)
const MAX_CANVAS_AREA = 14_000_000;

export async function exportMapAsJpg({
  positions,
  barrelZones,
  allocation,
  participants,
  settings,
  filename = 'raid-planner-map.jpg'
}) {
  // ---- размеры canvas ----
  let DPR = 2;
  let CANVAS_WIDTH = 1400;
  const MAP_AREA_HEIGHT = 900;
  const PADDING = 40;

  // ---- агрегация данных по точкам ----
  const byPoint = {};
  const playerById = new Map();
  participants.forEach(p => playerById.set(p.id, p));

  Object.entries(allocation).forEach(([bid, arr]) => {
    if (!byPoint[bid]) byPoint[bid] = [];
    arr.forEach(p => {
      const player = playerById.get(p.id) || p;
      byPoint[bid].push({ player, isPilot: p.isPilot });
    });
  });

  // ---- карточки зданий ----
  const cards = BUILDINGS.map(b => {
    const players = (byPoint[b.id] || []).slice();
    players.sort((a, b2) => {
      const aFl = (a.player.flights || []).length;
      const bFl = (b2.player.flights || []).length;
      if (aFl !== bFl) return bFl - aFl;
      return (b2.player.power || 0) - (a.player.power || 0);
    });
    return { building: b, players };
  });

  const columns = 3;
  const rows = Math.ceil(cards.length / columns);

  // ---- высота блока карточек ----
  let totalCardsHeight = 0;
  for (let r = 0; r < rows; r++) {
    let maxRows = 1;
    for (let c = 0; c < columns; c++) {
      const card = cards[r * columns + c];
      if (!card) continue;
      maxRows = Math.max(maxRows, card.players.length);
    }
    totalCardsHeight += CARD_HEADER_HEIGHT + maxRows * CARD_ROW_HEIGHT + CARD_PADDING;
    if (r < rows - 1) totalCardsHeight += CARD_BOTTOM_MARGIN;
  }

  let CANVAS_HEIGHT = PADDING + MAP_AREA_HEIGHT + PADDING + totalCardsHeight + PADDING;

  // ---- проверка лимита площади ----
  let area = CANVAS_WIDTH * DPR * CANVAS_HEIGHT * DPR;
  while (area > MAX_CANVAS_AREA && DPR > 1) {
    DPR -= 0.5;
    area = CANVAS_WIDTH * DPR * CANVAS_HEIGHT * DPR;
  }
  while (area > MAX_CANVAS_AREA && CANVAS_WIDTH > 600) {
    CANVAS_WIDTH -= 100;
    area = CANVAS_WIDTH * DPR * CANVAS_HEIGHT * DPR;
  }

  console.log('Canvas:', {
    logical: `${CANVAS_WIDTH}×${CANVAS_HEIGHT}`,
    DPR,
    physical: `${Math.round(CANVAS_WIDTH * DPR)}×${Math.round(CANVAS_HEIGHT * DPR)}`,
    areaMpx: (area / 1_000_000).toFixed(1)
  });

  // ---- создаём canvas ----
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CANVAS_WIDTH * DPR);
  canvas.height = Math.round(CANVAS_HEIGHT * DPR);
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // Фон
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // ---- карта ----
    // ---- вычисляем bounding box по всем маркерам ----
  // Запас в единицах viewBox (примерно 5 = отступ под подписи и кружки)
  const BB_PADDING = 6;

  let minX = 100, minY = 100, maxX = 0, maxY = 0;
  let hasPoints = false;

  BUILDINGS.forEach(b => {
    const pos = positions[b.id];
    if (!pos) return;
    hasPoints = true;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x);
    maxY = Math.max(maxY, pos.y);
  });

  (barrelZones || []).forEach(z => {
    hasPoints = true;
    minX = Math.min(minX, z.x);
    minY = Math.min(minY, z.y);
    maxX = Math.max(maxX, z.x);
    maxY = Math.max(maxY, z.y);
  });

  if (!hasPoints) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  // Расширяем область: подписи снизу (y + 10), кружки сверху (y - 5)
  minX = Math.max(0, minX - BB_PADDING);
  minY = Math.max(0, minY - BB_PADDING);
  maxX = Math.min(100, maxX + BB_PADDING);
  maxY = Math.min(100, maxY + BB_PADDING + 4);  // запас под подписи снизу

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;

  // Соотношение сторон области
  const bboxAspect = bboxW / bboxH;

  // Целевая ширина карты (та же, что и раньше)
  const mapW = CANVAS_WIDTH - PADDING * 2;

  // Подбираем высоту карты: сохраняем пропорции bbox
  // НО ограничиваем разумно — не больше MAP_AREA_HEIGHT * 1.3
  let mapH = mapW / bboxAspect;

  // Если карта получилась слишком высокой — сжимаем по ширине
  const MAX_MAP_H = MAP_AREA_HEIGHT;
  const MIN_MAP_H = 400;
  if (mapH > MAX_MAP_H) {
    mapH = MAX_MAP_H;
  } else if (mapH < MIN_MAP_H) {
    mapH = MIN_MAP_H;
  }

  const mapX = PADDING;
  const mapY = PADDING;

  // Функции перевода: из viewBox 0..100 в пиксели, но с учётом обрезки
  const tx = (x) => mapX + ((x - minX) / bboxW) * mapW;
  const ty = (y) => mapY + ((y - minY) / bboxH) * (mapH - 40); // 40 — резерв под подписи

  // Рисуем фон карты
  ctx.fillStyle = COLORS.bgCard;
  roundRect(ctx, mapX, mapY, mapW, mapH, 16);
  ctx.fill();

  // ---- стрелки перелётов ----
  const arrowPairs = {};
  participants.forEach(p => {
    const flights = p.flights || [];
    if (flights.length === 0) return;
    const sourceId = Object.keys(allocation).find(bid =>
      allocation[bid].some(x => x.id === p.id)
    );
    if (!sourceId) return;
    flights.forEach(f => {
      const key = `${sourceId}->${f.toBuildingId}`;
      arrowPairs[key] = (arrowPairs[key] || 0) + 1;
    });
  });

  const R_POINT_PX = 22;

  Object.entries(arrowPairs).forEach(([key, count]) => {
    const [fromId, toId] = key.split('->');
    const from = positions[fromId];
    const to = positions[toId];
    if (!from || !to) return;

    const x1 = tx(from.x), y1 = ty(from.y);
    const x2 = tx(to.x), y2 = ty(to.y);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;

    const sx = x1 + ux * R_POINT_PX;
    const sy = y1 + uy * R_POINT_PX;
    const ex = x2 - ux * R_POINT_PX;
    const ey = y2 - uy * R_POINT_PX;

    const nx = -uy, ny = ux;
    const offset = 20;
    const cx = (sx + ex) / 2 + nx * offset;
    const cy = (sy + ey) / 2 + ny * offset;

    ctx.save();
    ctx.strokeStyle = COLORS.accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();

    // Наконечник
    const headLen = 12;
    const headW = 7;
    const angle = Math.atan2(ey - cy, ex - cx);
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(
      ex - headLen * Math.cos(angle) + headW * Math.sin(angle),
      ey - headLen * Math.sin(angle) - headW * Math.cos(angle)
    );
    ctx.lineTo(
      ex - headLen * Math.cos(angle) - headW * Math.sin(angle),
      ey - headLen * Math.sin(angle) + headW * Math.cos(angle)
    );
    ctx.closePath();
    ctx.fill();

    // Подпись количества
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillStyle = COLORS.accent;
    ctx.strokeStyle = COLORS.bgCard;
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelText = String(count);
    ctx.strokeText(labelText, cx, cy - 6);
    ctx.fillText(labelText, cx, cy - 6);
    ctx.restore();
  });

  // ---- маркеры точек ----
  BUILDINGS.forEach(b => {
    const pos = positions[b.id];
    if (!pos) return;
    const players = byPoint[b.id] || [];
    const sum = players.reduce((s, p) => s + (p.player.power || 0), 0);
    const minReq = settings.minPlayers?.[b.id] ?? b.minPlayers ?? 0;
    const under = players.length < minReq;

    const x = tx(pos.x), y = ty(pos.y);

    ctx.beginPath();
    ctx.arc(x, y, R_POINT_PX, 0, Math.PI * 2);
    ctx.fillStyle = under ? COLORS.danger : COLORS.accent;
    ctx.fill();
    ctx.strokeStyle = COLORS.bgCard;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(ICON_EMOJI[b.icon] || '●', x, y + 1);

    // Название
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.strokeStyle = COLORS.bgCard;
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.strokeText(b.name, x, y + R_POINT_PX + 16);
    ctx.fillText(b.name, x, y + R_POINT_PX + 16);

    // Счётчик
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = under ? COLORS.danger : COLORS.textDim;
    const counterText = `${players.length}/${minReq} • ${sum.toLocaleString('ru-RU')}`;
    ctx.strokeText(counterText, x, y + R_POINT_PX + 32);
    ctx.fillText(counterText, x, y + R_POINT_PX + 32);
  });

  // ---- маркеры бочек ----
  (barrelZones || []).forEach(zone => {
    const x = tx(zone.x), y = ty(zone.y);
    ctx.fillStyle = COLORS.bgCard2;
    ctx.strokeStyle = COLORS.success;
    ctx.lineWidth = 2;
    const size = 40;
    roundRect(ctx, x - size / 2, y - size / 2, size, size, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.success;
    ctx.fillText('🛢️', x, y + 1);
  });

  // ---- таблицы ----
  const cardsStartY = mapY + mapH + PADDING;
  const cardsTotalW = CANVAS_WIDTH - PADDING * 2;
  const colWidth = (cardsTotalW - (columns - 1) * CARD_GAP) / columns;

  let currentY = cardsStartY;

  for (let r = 0; r < rows; r++) {
    let rowHeight = CARD_HEADER_HEIGHT + CARD_ROW_HEIGHT + CARD_PADDING;
    for (let c = 0; c < columns; c++) {
      const card = cards[r * columns + c];
      if (!card) continue;
      const h = CARD_HEADER_HEIGHT + card.players.length * CARD_ROW_HEIGHT + CARD_PADDING;
      rowHeight = Math.max(rowHeight, h);
    }

    for (let c = 0; c < columns; c++) {
      const card = cards[r * columns + c];
      if (!card) continue;
      const cardX = PADDING + c * (colWidth + CARD_GAP);
      drawCard(ctx, {
        x: cardX,
        y: currentY,
        width: colWidth,
        height: rowHeight,
        building: card.building,
        players: card.players,
        settings
      });
    }
    currentY += rowHeight + CARD_BOTTOM_MARGIN;
  }

  // ---- скачиваем ----
  return new Promise((resolve, reject) => {
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      resolve(null);
    } catch (e) {
      reject(e);
    }
  });
}

function drawCard(ctx, { x, y, width, height, building, players, settings }) {
  // Фон
  ctx.fillStyle = COLORS.bgCard;
  roundRect(ctx, x, y, width, height, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  const sum = players.reduce((s, p) => s + (p.player.power || 0), 0);
  const minReq = settings.minPlayers?.[building.id] ?? building.minPlayers ?? 0;
  const under = players.length < minReq;

  // Заголовок слева
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = under ? COLORS.danger : COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(building.name, x + CARD_PADDING, y + CARD_HEADER_HEIGHT / 2 + 4);

  // Счётчик справа
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = under ? COLORS.danger : COLORS.textDim;
  ctx.fillText(
    `${players.length}/${minReq} • ${sum.toLocaleString('ru-RU')}`,
    x + width - CARD_PADDING,
    y + CARD_HEADER_HEIGHT / 2 + 4
  );

  // Разделитель
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(x + CARD_PADDING, y + CARD_HEADER_HEIGHT);
  ctx.lineTo(x + width - CARD_PADDING, y + CARD_HEADER_HEIGHT);
  ctx.stroke();

  // Игроки
  players.forEach((p, i) => {
    const rowY = y + CARD_HEADER_HEIGHT + CARD_PADDING / 2 + i * CARD_ROW_HEIGHT + CARD_ROW_HEIGHT / 2;

    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const roles = p.player.roles || [];
    const pilot = roles.includes('pilot') ? ' ✈️' : '';
    const barrel = roles.includes('barrel') ? ' 🛢️' : '';

    let nameText = `${i + 1}. ${p.player.nick}${pilot}${barrel}`;

    const flights = (p.player.flights || []).slice()
      .sort((a, b) => (a.atMinute || 0) - (b.atMinute || 0));
    if (flights.length > 0) {
      const targets = flights.map(f => {
        const t = BUILDINGS.find(b => b.id === f.toBuildingId);
        return t ? t.name : f.toBuildingId;
      });
      nameText += ` → ${targets.join(' → ')}`;
    }

    const maxNameWidth = width - CARD_PADDING * 2 - 80;
    ctx.fillText(truncateText(ctx, nameText, maxNameWidth), x + CARD_PADDING, rowY);

    ctx.textAlign = 'right';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(
      (p.player.power || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }),
      x + width - CARD_PADDING,
      rowY
    );
  });

  // Пусто
  if (players.length === 0) {
    ctx.font = 'italic 12px system-ui, sans-serif';
    ctx.fillStyle = COLORS.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'Пусто',
      x + width / 2,
      y + CARD_HEADER_HEIGHT + CARD_ROW_HEIGHT / 2 + CARD_PADDING / 2
    );
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 0 && ctx.measureText(result + '…').width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + '…';
}