// ═══════════════════════════════════════════════════
// ROSTER — Quản lý danh sách lớp theo kiểu sổ điểm
// ═══════════════════════════════════════════════════
import {
  db, collection, doc, getDoc, setDoc, deleteDoc,
  getDocs, serverTimestamp
} from './firebase-init.js';
import { state } from './state.js';
import { getGradeFromClass } from './utils.js';

let _rostersCache = null;

// ══════════════════════════════════════════
// LOAD / CACHE
// ══════════════════════════════════════════
export async function loadAllRosters(forceRefresh = false) {
  if (_rostersCache && !forceRefresh) return _rostersCache;
  try {
    const snap = await getDocs(collection(db, 'rosters'));
    _rostersCache = {};
    snap.docs.forEach(d => { _rostersCache[d.id] = { id: d.id, ...d.data() }; });
    return _rostersCache;
  } catch (e) {
    console.error('[roster] Load error:', e);
    _rostersCache = {};
    return _rostersCache;
  }
}

export function clearRostersCache() { _rostersCache = null; }

export function getRosterForClass(className) {
  if (!_rostersCache || !className) return null;
  return _rostersCache[className] || null;
}

// ══════════════════════════════════════════
// NORMALIZE TÊN — bỏ dấu, lowercase, xoá ký tự đặc biệt
// ══════════════════════════════════════════
export function normalizeName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

// ══════════════════════════════════════════
// MATCH HS VỚI ROSTER
//   Trả về { stt, matched, rosterName }
//   hoặc null nếu lớp chưa có roster
// ══════════════════════════════════════════
export function matchStudentToRoster(studentName, className) {
  const roster = getRosterForClass(className);
  if (!roster || !roster.students) return null;
  const normStudent = normalizeName(studentName);
  for (const entry of roster.students) {
    if (normalizeName(entry.name) === normStudent) {
      return { stt: entry.stt, matched: true, rosterName: entry.name };
    }
  }
  return { stt: null, matched: false, rosterName: null };
}

// ══════════════════════════════════════════
// PARSE TEXT → [{stt, name}, ...]
//   Hỗ trợ: "1. Tên", "1) Tên", "1- Tên", "1 Tên", hoặc chỉ "Tên"
// ══════════════════════════════════════════
export function parseRosterText(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const students = [];
  const errors = [];
  let autoStt = 1;

  lines.forEach((line, idx) => {
    // "1. Nguyễn Văn An" / "1) ..." / "1- ..." / "1: ..."
    let m = line.match(/^(\d+)\s*[.):\-–]\s*(.+)$/);
    if (m) {
      students.push({ stt: parseInt(m[1]), name: m[2].trim() });
      return;
    }
    // "1 Nguyễn Văn An"
    m = line.match(/^(\d+)\s+(.+)$/);
    if (m) {
      students.push({ stt: parseInt(m[1]), name: m[2].trim() });
      return;
    }
    // Chỉ tên
    if (line.length > 1 && !/^\d+$/.test(line)) {
      students.push({ stt: autoStt++, name: line });
      return;
    }
    errors.push(`Dòng ${idx + 1}: "${line}" không hợp lệ`);
  });

  return { students, errors };
}

// ══════════════════════════════════════════
// SAVE / DELETE
// ══════════════════════════════════════════
export async function saveRoster(className, students) {
  const grade = getGradeFromClass(className);
  if (!grade) throw new Error('Lớp không hợp lệ: ' + className);
  const ref = doc(db, 'rosters', className);
  const existing = await getDoc(ref);

  const data = {
    class: className,
    grade,
    students,
    updatedAt: serverTimestamp(),
    updatedBy: state.currentUser?.uid || null
  };
  if (!existing.exists()) {
    data.createdAt = serverTimestamp();
    data.createdBy = state.currentUser?.uid || null;
  }
  await setDoc(ref, data, { merge: true });
  clearRostersCache();
  return data;
}

export async function deleteRoster(className) {
  await deleteDoc(doc(db, 'rosters', className));
  clearRostersCache();
}

// ══════════════════════════════════════════
// SORT STUDENTS THEO ROSTER STT
//   - Dùng cho tab Thống Kê
//   - Students không match → xuống cuối
// ══════════════════════════════════════════
export function sortStudentsByRoster(students) {
  if (!_rostersCache) return students;

  // Build lookup: class|normalizedName → stt
  const lookup = {};
  Object.values(_rostersCache).forEach(r => {
    if (!r.students) return;
    r.students.forEach(s => {
      const key = (r.class || '') + '|' + normalizeName(s.name);
      lookup[key] = s.stt;
    });
  });

  students.forEach(s => {
    const key = (s.class || '') + '|' + normalizeName(s.name);
    s._rosterStt = lookup[key] ?? 9999;
  });

  students.sort((a, b) => {
    const clsCmp = String(a.class || '').localeCompare(String(b.class || ''), 'vi', { numeric: true });
    if (clsCmp !== 0) return clsCmp;
    return (a._rosterStt || 9999) - (b._rosterStt || 9999);
  });
  return students;
}

// ══════════════════════════════════════════
// LẤY HS CHƯA ĐĂNG KÝ TRONG 1 LỚP
//   Dựa vào danh sách users đã cache
// ══════════════════════════════════════════
export function getUnregisteredInRoster(className, allStudents) {
  const roster = getRosterForClass(className);
  if (!roster || !roster.students) return [];

  const normUsers = new Set(
    allStudents
      .filter(u => u.class === className)
      .map(u => normalizeName(u.name))
  );

  return roster.students.filter(entry => !normUsers.has(normalizeName(entry.name)));
}

// ══════════════════════════════════════════
// LẤY HS ĐĂNG KÝ NHƯNG KHÔNG CÓ TRONG ROSTER
// ══════════════════════════════════════════
export function getExtraUsersInClass(className, allStudents) {
  const roster = getRosterForClass(className);
  if (!roster || !roster.students) return [];

  const normRoster = new Set(roster.students.map(s => normalizeName(s.name)));
  return allStudents.filter(u =>
    u.class === className && !normRoster.has(normalizeName(u.name))
  );
}