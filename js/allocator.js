// ---------- Конфигурация зданий ----------
export const BUILDINGS = [
  {
    id: 'wp1', name: 'Водоперерабатывающий завод 1',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    weight: 600 * 10 + 3000
  },
  {
    id: 'wp2', name: 'Водоперерабатывающий завод 2',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    weight: 600 * 10 + 3000
  },
  {
    id: 'wp3', name: 'Водоперерабатывающий завод 3',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    weight: 600 * 10 + 3000
  },
  {
    id: 'wp4', name: 'Водоперерабатывающий завод 4',
    icon: 'fa-industry', water: 600, first: 3000, openAt: 0,
    minPlayers: 2, maxPlayers: 4, priority: 4, category: 'key',
    weight: 600 * 10 + 3000
  },
  {
    id: 'tc1', name: 'Водоочистительный центр 1',
    icon: 'fa-filter', water: 1200, first: 6000, openAt: 0,
    minPlayers: 2, maxPlayers: 5, priority: 2, category: 'key',
    weight: 1200 * 10 + 6000
  },
  {
    id: 'tc2', name: 'Водоочистительный центр 2',
    icon: 'fa-filter', water: 1200, first: 6000, openAt: 0,
    minPlayers: 2, maxPlayers: 5, priority: 2, category: 'key',
    weight: 1200 * 10 + 6000
  },
  {
    id: 'solar', name: 'Солнечная станция',
    icon: 'fa-solar-panel', water: 240, first: 1200, openAt: 0,
    minPlayers: 2, maxPlayers: 3, priority: 1, category: 'buff',
    weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-house', label: '-50% захват' }
  },
  {
    id: 'helipad', name: 'Вертолетная площадка',
    icon: 'fa-helicopter', water: 240, first: 1200, openAt: 0,
    minPlayers: 2, maxPlayers: 3, priority: 1, category: 'buff',
    weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-arrows-rotate', label: '-50% перезар.' }
  },
  {
    id: 'milfac', name: 'Военный завод',
    icon: 'fa-gears', water: 240, first: 1200, openAt: 10,
    minPlayers: 2, maxPlayers: 3, priority: 1, category: 'buff',
    weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-burst', label: '+20% урон' }
  },
  {
    id: 'dev', name: 'Комплекс разработки',
    icon: 'fa-flask', water: 240, first: 1200, openAt: 10,
    minPlayers: 1, maxPlayers: 3, priority: 5, category: 'late',
    weight: 240 * 10 + 1200,
    bonus: { icon: 'fa-biohazard', label: 'зараженные' }
  },
  {
    id: 'center', name: 'Центральный резервуар',
    icon: 'fa-water', water: 1800, first: 6000, openAt: 15,
    minPlayers: 3, maxPlayers: 3, priority: 0, category: 'center',
    weight: 1800 * 10 + 6000
  }
];

const PILOT_COUNT = 3;
const BARREL_COUNT = 6;

// ---------- Основной алгоритм ----------
export function allocatePlayers(players) {
  // 0. Копия
  const copy = players.map(p => ({ ...p, roles: [...(p.roles || [])] }));

  // 1. Сортировка по БМ
  const byPowerDesc = [...copy].sort((a, b) => (b.power || 0) - (a.power || 0));
  const byPowerAsc  = [...byPowerDesc].reverse();

  // 2. Топ-3 → pilot
  const pilotCount = Math.min(PILOT_COUNT, byPowerDesc.length);
  const pilots = byPowerDesc.slice(0, pilotCount);
  const pilotIds = new Set(pilots.map(p => p.id));
  copy.forEach(p => {
    if (pilotIds.has(p.id)) {
      if (!p.roles.includes('pilot')) p.roles.push('pilot');
      p.roles = p.roles.filter(r => r !== 'barrel');
    }
  });

  // 3. 6 слабейших не-пилотов → barrel
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

  // 4. Разделяем пулы
  const nonBarrel = copy.filter(p => !barrelIds.has(p.id) && !pilotIds.has(p.id));
  let remainingNonBarrel = [...nonBarrel].sort((a, b) => (b.power || 0) - (a.power || 0));
  let remainingBarrels = copy.filter(p => barrelIds.has(p.id))
                             .sort((a, b) => (b.power || 0) - (a.power || 0));

  // 5. Точки
  const nonCenter = BUILDINGS.filter(b => b.category !== 'center');
  const centerBuilding = BUILDINGS.find(b => b.category === 'center');

  // 6. Capacity
  const totalToDistribute = remainingNonBarrel.length + remainingBarrels.length;
  const capacity = calcCapacity(totalToDistribute, nonCenter);

  // 7. Структура
  const allocation = {};
  BUILDINGS.forEach(b => allocation[b.id] = []);

  // 8. Пилоты → центр. Больше никого.
  pilots.forEach(p => {
    allocation['center'].push({ ...p, isPilot: true });
  });

  // 9. Группировка точек
  const buffPoints = nonCenter
    .filter(b => b.category === 'buff')
    .sort((a, b) => a.priority - b.priority);
  const keyPoints = nonCenter
    .filter(b => b.category === 'key')
    .sort((a, b) => a.priority - b.priority);
  const latePoints = nonCenter
    .filter(b => b.category === 'late')
    .sort((a, b) => a.priority - b.priority);

  // 10. BUFF минимум — только не-бочки
  for (const b of buffPoints) {
    const need = Math.min(b.minPlayers, capacity[b.id] || 0);
    for (let i = 0; i < need && remainingNonBarrel.length; i++) {
      allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
    }
  }

  // 11. KEY минимум — не-бочки, потом бочки
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

  // 12. LATE минимум — бочки, потом не-бочки
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

  // 13. Дозаполняем BUFF до capacity — не-бочки, потом бочки
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

  // 14. Дозаполняем KEY до capacity — не-бочки, потом бочки
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

  // 15. Дозаполняем LATE до capacity — бочки, потом не-бочки
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

  // 16. Если ещё остались не-бочки — раскидываем по точкам, где есть место
  const allNonCenter = [...buffPoints, ...keyPoints, ...latePoints];
  const overflow = [];
  while (remainingNonBarrel.length) {
    let placed = false;
    for (const b of allNonCenter) {
      const max = b.maxPlayers;
      if (allocation[b.id].length < max) {
        allocation[b.id].push({ ...remainingNonBarrel.shift(), isPilot: false });
        placed = true;
        break;
      }
    }
    if (!placed) {
      overflow.push(remainingNonBarrel.shift());
    }
  }
  // Бочки, что не влезли — в overflow
  while (remainingBarrels.length) {
    overflow.push(remainingBarrels.shift());
  }

  return {
    allocation,
    pilots,
    barrels: [...barrels.filter(b => !copy.find(x => x.id === b.id)?.__placed), ...overflow],
    players: copy
  };
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