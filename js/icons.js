// Маппинг id точки → путь к PNG-иконке
// Имена файлов совпадают с id из BUILDINGS
export const ICON_FILES = {
  wp1: 'assets/icons/wp.png',
  wp2: 'assets/icons/wp.png',
  wp3: 'assets/icons/wp.png',
  wp4: 'assets/icons/wp.png',
  tc1: 'assets/icons/tc.png',
  tc2: 'assets/icons/tc.png',
  solar: 'assets/icons/solar.png',
  helipad: 'assets/icons/helipad.png',
  milfac: 'assets/icons/milfac.png',
  dev: 'assets/icons/dev.png',
  center: 'assets/icons/center.png'
};

// Кэш загруженных Image (для canvas и SVG)
const imageCache = new Map();
const loadPromises = new Map();

export function loadIcon(id) {
  if (imageCache.has(id)) return Promise.resolve(imageCache.get(id));
  if (loadPromises.has(id)) return loadPromises.get(id);

  const path = ICON_FILES[id];
  if (!path) return Promise.resolve(null);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(id, img);
      resolve(img);
    };
    img.onerror = () => {
      console.warn('Не загрузилась иконка:', id, path);
      resolve(null);
    };
    img.src = path;
  });

  loadPromises.set(id, promise);
  return promise;
}

export async function preloadAllIcons() {
  await Promise.all(Object.keys(ICON_FILES).map(id => loadIcon(id)));
}

export function getCachedIcon(id) {
  return imageCache.get(id) || null;
}