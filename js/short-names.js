// Короткие имена для цепочек перелётов и копирования
export const SHORT_NAMES = {
  wp1: 'ВОЗ1',
  wp2: 'ВОЗ2',
  wp3: 'ВОЗ3',
  wp4: 'ВОЗ4',
  tc1: 'ВЦ1',
  tc2: 'ВЦ2',
  solar: 'Солнце',
  helipad: 'Вертолётка',
  milfac: 'Военка',
  dev: 'Разработка',
  center: 'Центр'
};

export function shortName(id) {
  return SHORT_NAMES[id] || id;
}