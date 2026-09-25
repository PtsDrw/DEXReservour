// ---------- Конфигурация зданий ----------
export const BUILDINGS = [
  {
    id: 'wp1', name: 'Водоперерабатывающий завод 1',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    kind: 'main', weight: 600 * 10 + 3000
  },
  {
    id: 'wp2', name: 'Водоперерабатывающий завод 2',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    kind: 'main', weight: 600 * 10 + 3000
  },
  {
    id: 'wp3', name: 'Водоперерабатывающий завод 3',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    kind: 'main', weight: 600 * 10 + 3000
  },
  {
    id: 'wp4', name: 'Водоперерабатывающий завод 4',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    kind: 'main', weight: 600 * 10 + 3000
  },
  {
    id: 'tc1', name: 'Водоочистительный центр 1',
    icon: 'fa-filter', water: 1200, first: 6000, openAt: 0,
    minPlayers: 2, maxPlayers: 5, priority: 2, category: 'key',
    kind: 'main', weight: 1200 * 10 + 6000
  },
  {
    id: 'tc2', name: 'Водоочистительный центр 2',
    icon: 'fa-filter', water: 1200, first: 6000, openAt: 0,
    minPlayers: 2, maxPlayers: 5, priority: 2, category: 'key',
    kind: 'main', weight: 1200 * 10 + 6000
  },
  {
    id: 'solar', name: 'Солнечная станция',
    icon: 'fa-solar-panel', water: 240, first: 1200, openAt: 0,
    minPlayers: 2, maxPlayers: 3, priority: 1, category: 'buff',
    kind: 'aux', weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-house', label: '-50% захват' }
  },
  {
    id: 'helipad', name: 'Вертолетная площадка',
    icon: 'fa-helicopter', water: 240, first: 1200, openAt: 0,
    minPlayers: 2, maxPlayers: 3, priority: 1, category: 'buff',
    kind: 'aux', weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-arrows-rotate', label: '-50% перезар.' }
  },
  {
    id: 'milfac', name: 'Военный завод',
    icon: 'fa-gears', water: 240, first: 1200, openAt: 10,
    minPlayers: 2, maxPlayers: 3, priority: 1, category: 'buff',
    kind: 'aux', weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-burst', label: '+20% урон' }
  },
  {
    id: 'dev', name: 'Комплекс разработки',
    icon: 'fa-flask', water: 240, first: 1200, openAt: 10,
    minPlayers: 1, maxPlayers: 3, priority: 5, category: 'late',
    kind: 'aux', weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-biohazard', label: 'зараженные' }
  },
  {
    id: 'center', name: 'Центральный резервуар',
    icon: 'fa-water', water: 1800, first: 6000, openAt: 15,
    minPlayers: 3, maxPlayers: 3, priority: 0, category: 'center',
    kind: 'main', weight: 1800 * 10 + 6000
  }
];

// ---------- Основной алгоритм ----------
export function allocatePlayers(players, settings) {
  const PILOT_COUNT = settings?.pilotCount ?? 3;
  const BARREL_COUNT = settings?.barrelCount ?? 6;

    const CONFIG = BUILDINGS.map(b => {
    const prio = settings?.priorities?.[b.id] || (b.priority <= 1 ? 'high' : b.priority <= 4 ? 'medium' : 'low');
    const min = settings?.minPlayers?.[b.id] ?? b.minPlayers;
    const openAt = settings?.openMinutes?.[b.id] ?? b.openAt ?? 0;
    return {
      ...b,
      minPlayers: min,
      openAt,
      priority: prio === 'high' ? 0 : prio === 'low' ? 10 : 5,
      // Точка поздняя, если открывается после старта И включены авто-перелёты
      isLate: openAt > 0 && settings?.autoFlights?.enabled
    };
  });

  const copy = players.map(p => ({
    ...p,
    roles: [...(p.roles || [])],
    flights: [...(p.flights || [])]
  }));

  const byPowerDesc = [...copy].sort((a, b) => (b.power || 0) - (a.power || 0));
  const byPowerAsc  = [...byPowerDesc].reverse();

  const pilotCount = Math.min(PILOT_COUNT, byPowerDesc.length);
  const pilots = byPowerDesc.slice(0, pilotCount);
  const pilotIds = new Set(pilots.map(p => p.id));
  copy.forEach(p => {
    if (pilotIds.has(p.id)) {
      if (!p.roles.includes('pilot')) p.roles.push('pilot');
      p.roles = p.roles.filter(r => r !== 'barrel');
    }
  });

  const barrelCandidates = byPowerAsc.filter(p => !pilotIds.has(p.id));
  const barrelCount = Math.min(BARREL_COUNT, barrelCandidates.length);
  const barrels = barrelCandidates.slice(0, barrelCount);
  const barrelIds = new Set(barrels.map(p => p.id));
  copy.forEach(p => {
    if (barrelIds.has(p.id)) {
      if (!p.roles.includes('barrel')) p.roles.push('barrel');
      p.roles = p.roles.filter(r => r !== 'pilot');
    }
  });

  const nonBarrel = copy.filter(p => !barrelIds.has(p.id) && !pilotIds.has(p.id));
  let remainingNonBarrel = [...nonBarrel].sort((a, b) => (b.power || 0) - (a.power || 0));
  let remainingBarrels = copy.filter(p => barrelIds.has(p.id))
                             .sort((a, b) => (b.power || 0) - (a.power || 0));

    // Поздние точки (кроме центра) исключаем из прямого распределения,
  // если включены авто-перелёты. Игроки попадут туда только через перелёты.
  const nonCenter = CONFIG.filter(b => b.category !== 'center' && !b.isLate);

  const totalToDistribute = remainingNonBarrel.length + remainingBarrels.length;
  const capacity = calcCapacity(totalToDistribute, nonCenter);

  const allocation = {};
  CONFIG.forEach(b => allocation[b.id] = []);

  pilots.forEach(p => {
    allocation['center'].push({ ...p, isPilot: true });
  });

  const buffPoints = nonCenter
    .filter(b => b.category === 'buff')
    .sort((a, b) => a.priority - b.priority);
  const keyPoints = nonCenter
    .filter(b => b.category === 'key')
    .sort((a, b) => a.priority - b.priority);
  const latePoints = nonCenter
    .filter(b => b.category === 'late')
    .sort((a, b) => a.priority - b.priority);

  for (const b of buffPoints) {
    const need = Math.min(b.minPlayers, capacity[b.id] || 0);
    for (let i = 0; i < need && remainingNonBarrel.length; i++) {
      allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
    }
  }

  for (const b of keyPoints) {
    const need = Math.min(b.minPlayers, capacity[b.id] || 0);
    for (let i = 0; i < need; i++) {
      if (remainingNonBarrel.length) {
        allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
      } else if (remainingBarrels.length) {
        allocation[b.id].push({ ...remainingBarrels.shift(), isPilot: false });
      } else break;
    }
  }

  for (const b of latePoints) {
    const need = Math.min(b.minPlayers, capacity[b.id] || 0);
    for (let i = 0; i < need; i++) {
      if (remainingBarrels.length) {
        allocation[b.id].push({ ...remainingBarrels.shift(), isPilot: false });
      } else if (remainingNonBarrel.length) {
        allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
      } else break;
    }
  }

  for (const b of buffPoints) {
    const target = capacity[b.id] || 0;
    while (allocation[b.id].length < target) {
      if (remainingNonBarrel.length) {
        allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
      } else if (remainingBarrels.length) {
        allocation[b.id].push({ ...remainingBarrels.shift(), isPilot: false });
      } else break;
    }
  }

  for (const b of keyPoints) {
    const target = capacity[b.id] || 0;
    while (allocation[b.id].length < target) {
      if (remainingNonBarrel.length) {
        allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
      } else if (remainingBarrels.length) {
        allocation[b.id].push({ ...remainingBarrels.shift(), isPilot: false });
      } else break;
    }
  }

  for (const b of latePoints) {
    const target = capacity[b.id] || 0;
    while (allocation[b.id].length < target) {
      if (remainingBarrels.length) {
        allocation[b.id].push({ ...remainingBarrels.shift(), isPilot: false });
      } else if (remainingNonBarrel.length) {
        allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
      } else break;
    }
  }

  const allNonCenter = [...buffPoints, ...keyPoints, ...latePoints];
  const overflow = [];
  while (remainingNonBarrel.length) {
    let placed = false;
    for (const b of allNonCenter) {
      if (allocation[b.id].length < b.maxPlayers) {
        allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
        placed = true;
        break;
      }
    }
    if (!placed) overflow.push(remainingNonBarrel.shift());
  }
  while (remainingBarrels.length) {
    overflow.push(remainingBarrels.shift());
  }

  // Авто-перелёты
  if (settings?.autoFlights?.enabled && settings?.autoFlights?.rules?.length) {
    applyAutoFlights(allocation, CONFIG, copy, settings);
  }

  // Дублируем игроков с перелётами на целевые точки
  copy.forEach(p => {
    (p.flights || []).forEach(f => {
      allocation[f.toBuildingId] = allocation[f.toBuildingId] || [];
      if (!allocation[f.toBuildingId].find(x => x.id === p.id)) {
        allocation[f.toBuildingId].push({ ...p, isPilot: (p.roles || []).includes('pilot') });
      }
    });
  });

  return {
    allocation,
    pilots,
    barrels: [...barrels.filter(b => !copy.find(x => x.id === b.id)?.__placed), ...overflow],
    players: copy
  };
}

// ---------- Авто-перелёты ----------
function applyAutoFlights(allocation, config, allPlayers, settings) {
  const rules = settings?.autoFlights?.rules || [];
  if (rules.length === 0) return;

  // Приоритет точки: high=0, medium=5, low=10 (меньше — важнее)
  const prioVal = (b) => b.priority;

  // Сортируем правила: сначала на точки с высоким приоритетом,
  // потом средним, потом низким. Внутри одного приоритета — по времени открытия.
  const sortedRules = [...rules]
    .filter(r => r.enabled)
    .sort((r1, r2) => {
      const t1 = config.find(b => b.id === r1.to);
      const t2 = config.find(b => b.id === r2.to);
      if (!t1 || !t2) return 0;
      const p1 = prioVal(t1);
      const p2 = prioVal(t2);
      if (p1 !== p2) return p1 - p2;
      return (t1.openAt || 0) - (t2.openAt || 0);
    });

  // Считаем, сколько игроков «доступно» на каждой исходной точке
  // с учётом minPlayers — не опускаем точку ниже минимума.
  const sourceStats = {};
  Object.entries(allocation).forEach(([bid, arr]) => {
    const building = config.find(b => b.id === bid);
    if (!building) return;
      const eligible = arr.filter(p => {
      const roles = p.roles || [];
      // Только пилоты исключаются — они и так на центре.
      // Бочки тоже могут перелетать, пока не ушли на бочки (30/40 мин).
      return !roles.includes('pilot');
    });
    sourceStats[bid] = {
      total: arr.length,
      eligible: eligible.length,
      minPlayers: building.minPlayers || 0,
      // Сколько МОЖНО отправить = eligible - minPlayers (но не меньше 0)
      // Если после отправки на точке останется < minPlayers, не отправляем.
      // Если в точке не хватает и так, отправлять нельзя.
      availableToSend: Math.max(0, eligible.length - Math.max(0, building.minPlayers)),
      // Список игроков, которых можно отправить (сильнейшие первыми)
      pool: eligible.sort((a, b) => (b.power || 0) - (a.power || 0)).slice()
    };
  });

  // Множество игроков, которые уже получили перелёт — исключаем их из дальнейших
  const alreadySent = new Set();

  sortedRules.forEach(rule => {
    const from = rule.from;
    const to = rule.to;
    const limit = rule.limit || 3;

    const target = config.find(b => b.id === to);
    if (!target) return;

    // Собираем кандидатов
    let candidateSources;
    if (from === 'any') {
      candidateSources = Object.keys(sourceStats).filter(id => id !== to);
    } else {
      candidateSources = [from];
    }

    // Сортируем источники по количеству доступных игроков (больше — раньше),
    // но внутри — по силе игроков
    const candidates = [];
    candidateSources.forEach(sid => {
      if (!sourceStats[sid]) return;
      const stats = sourceStats[sid];
      stats.pool.forEach(p => {
        if (alreadySent.has(p.id)) return;
        candidates.push({ player: p, fromId: sid });
      });
    });

    // Сортируем кандидатов по силе (сильнейшие первыми)
    candidates.sort((a, b) => (b.player.power || 0) - (a.player.power || 0));

    let sent = 0;
    for (const c of candidates) {
      if (sent >= limit) break;
      if (alreadySent.has(c.player.id)) continue;

      // Проверяем, что на исходной точке останется минимум
      const stats = sourceStats[c.fromId];
      const remainingEligible = stats.pool.filter(
        p => !alreadySent.has(p.id) && p.id !== c.player.id
      ).length;
      if (remainingEligible < stats.minPlayers) {
        // Нельзя отправлять — на точке останется меньше минимума
        continue;
      }

      const p = allPlayers.find(x => x.id === c.player.id);
      if (!p) continue;
      p.flights = p.flights || [];
      if (p.flights.find(f => f.toBuildingId === to)) continue;

      p.flights.push({
        toBuildingId: to,
        atMinute: target.openAt
      });

      alreadySent.add(c.player.id);
      sent++;
    }
  });
}

// ---------- Утилиты ----------
function calcCapacity(totalPlayers, buildings) {
  const totalMin = buildings.reduce((s, b) => s + b.minPlayers, 0);
  const totalMax = buildings.reduce((s, b) => s + b.maxPlayers, 0);
  const cap = {};

  if (totalPlayers <= totalMin) {
    buildings.forEach(b => cap[b.id] = b.minPlayers);
    return cap;
  }
  if (totalPlayers >= totalMax) {
    buildings.forEach(b => cap[b.id] = b.maxPlayers);
    return cap;
  }

  buildings.forEach(b => cap[b.id] = b.minPlayers);
  let left = totalPlayers - totalMin;

  const catMul = { buff: 3, key: 2, late: 1 };
  const weighted = buildings.map(b => ({
    b,
    w: b.weight * (catMul[b.category] || 1)
  }));
  const totalW = weighted.reduce((s, x) => s + x.w, 0);

  const freeByPoint = {};
  buildings.forEach(b => freeByPoint[b.id] = b.maxPlayers - b.minPlayers);

  let allocated = 0;
  weighted.forEach(({ b, w }) => {
    const share = Math.floor(left * (w / totalW));
    const add = Math.min(share, freeByPoint[b.id]);
    cap[b.id] += add;
    freeByPoint[b.id] -= add;
    allocated += add;
  });

  let diff = left - allocated;
  const ordered = [...buildings].sort((a, b) => {
    const mA = catMul[a.category] || 1;
    const mB = catMul[b.category] || 1;
    if (mA !== mB) return mB - mA;
    return a.priority - b.priority;
  });
  let i = 0;
  while (diff > 0 && i < 1000) {
    const b = ordered[i % ordered.length];
    if (freeByPoint[b.id] > 0) {
      cap[b.id]++;
      freeByPoint[b.id]--;
      diff--;
    }
    i++;
  }

  return cap;
}