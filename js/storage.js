import { db, collection, doc, addDoc, updateDoc, deleteDoc,
         getDocs, query, orderBy, serverTimestamp } from './firebase-config.js';

const MEMBERS = 'members';
const HISTORY = 'history';

// ---------- Союз ----------
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

// ---------- История ----------
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