import { db, collection, doc, addDoc, updateDoc, deleteDoc,
         getDocs, getDoc, setDoc, query, orderBy, serverTimestamp } from './firebase-config.js';

const MEMBERS = 'members';
const HISTORY = 'history';
const SETTINGS_DOC = 'shared';

// ---------- Союз ----------
export async function getMembers() {
  try {
    const snap = await getDocs(query(collection(db, MEMBERS), orderBy('nick')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Не удалось получить состав союза:', e);
    return [];
  }
}

export async function addMember(nick, power = 0) {
  try {
    const all = await getMembers();
    if (all.find(m => m.nick.toLowerCase() === nick.toLowerCase())) return null;
    const ref = await addDoc(collection(db, MEMBERS), {
      nick, power, createdAt: serverTimestamp()
    });
    return { id: ref.id, nick, power };
  } catch (e) {
    console.warn('Не удалось добавить в союз:', e);
    return null;
  }
}

export async function updateMember(id, data) {
  try {
    await updateDoc(doc(db, MEMBERS, id), data);
  } catch (e) {
    console.warn('Не удалось обновить участника:', e);
  }
}

export async function deleteMember(id) {
  try {
    await deleteDoc(doc(db, MEMBERS, id));
  } catch (e) {
    console.warn('Не удалось удалить участника:', e);
  }
}

// ---------- История ----------
export async function getHistory() {
  try {
    const snap = await getDocs(query(collection(db, HISTORY), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Не удалось получить историю:', e);
    return [];
  }
}

export async function saveHistory(entry) {
  try {
    return await addDoc(collection(db, HISTORY), {
      ...entry, createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn('Не удалось сохранить в историю:', e);
    return null;
  }
}

export async function deleteHistory(id) {
  try {
    await deleteDoc(doc(db, HISTORY, id));
  } catch (e) {
    console.warn('Не удалось удалить из истории:', e);
  }
}

export async function bulkSaveHistory(entries) {
  const results = [];
  for (const e of entries) {
    try {
      const { id, createdAt, ...clean } = e;
      const ref = await addDoc(collection(db, HISTORY), {
        ...clean,
        createdAt: serverTimestamp()
      });
      results.push(ref.id);
    } catch (err) {
      console.warn('Не удалось сохранить запись:', err);
    }
  }
  return results;
}

// ---------- Общие настройки ----------
export async function getSharedSettings() {
  try {
    const ref = doc(db, 'settings', SETTINGS_DOC);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (e) {
    console.warn('Не удалось загрузить общие настройки:', e);
    return null;
  }
}

export async function saveSharedSettings(settings) {
  try {
    const ref = doc(db, 'settings', SETTINGS_DOC);
    await setDoc(ref, {
      ...settings,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn('Не удалось сохранить общие настройки:', e);
    return false;
  }
}

const PRESETS = 'presets';

// ---------- Пользовательские пресеты ----------
export async function getPresets() {
  try {
    const snap = await getDocs(query(collection(db, PRESETS), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Не удалось загрузить пресеты:', e);
    return [];
  }
}

export async function addPreset(preset) {
  try {
    const ref = await addDoc(collection(db, PRESETS), {
      ...preset,
      createdAt: serverTimestamp()
    });
    return { id: ref.id, ...preset };
  } catch (e) {
    console.warn('Не удалось сохранить пресет:', e);
    return null;
  }
}

export async function deletePreset(id) {
  try {
    await deleteDoc(doc(db, PRESETS, id));
    return true;
  } catch (e) {
    console.warn('Не удалось удалить пресет:', e);
    return false;
  }
}

export async function bulkSavePresets(entries) {
  const results = [];
  for (const e of entries) {
    try {
      const { id, createdAt, ...clean } = e;
      const ref = await addDoc(collection(db, PRESETS), {
        ...clean,
        createdAt: serverTimestamp()
      });
      results.push(ref.id);
    } catch (err) {
      console.warn('Не удалось сохранить пресет:', err);
    }
  }
  return results;
}