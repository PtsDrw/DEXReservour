// Короткие имена для цепочек перелётов и копирования
export const SHORT_NAMES = {
  wp1: 'ВПЗ1',
  wp2: 'ВПЗ2',
  wp3: 'ВПЗ3',
  wp4: 'ВПЗ4',
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