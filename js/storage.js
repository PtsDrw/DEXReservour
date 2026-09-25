import { db, collection, doc, addDoc, updateDoc, deleteDoc,
         getDocs, getDoc, setDoc, query, orderBy, serverTimestamp } from './firebase-config.js';

const MEMBERS = 'members';
const HISTORY = 'history';
const SETTINGS_DOC = 'shared';

export async function getMembers() {
  const snap = await getDocs(query(collection(db, MEMBERS), orderBy('nick')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addMember(nick, power = 0) {
  const all = await getMembers();
  if (all.find(m => m.nick.toLowerCase() === nick.toLowerCase())) return null;
  const ref = await addDoc(collection(db, MEMBERS), {
    nick, power, createdAt: serverTimestamp()
  });
  return { id: ref.id, nick, power };
}

export async function updateMember(id, data) {
  await updateDoc(doc(db, MEMBERS, id), data);
}

export async function deleteMember(id) {
  await deleteDoc(doc(db, MEMBERS, id));
}

export async function getHistory() {
  const snap = await getDocs(query(collection(db, HISTORY), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveHistory(entry) {
  return addDoc(collection(db, HISTORY), {
    ...entry, createdAt: serverTimestamp()
  });
}

export async function deleteHistory(id) {
  await deleteDoc(doc(db, HISTORY, id));
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