import {
  db, collection, getDocs, doc, updateDoc, query, where, getDoc
} from './firebase-init.js';
import { state } from './state.js';
import { $, show, hide, esc, fmtDate, fmtDuration, getGradeFromClass } from './utils.js';
import { parseQuestionsHtml } from './quiz.js';

// ⭐ State cho filter + collapse
let _myFilterStatus = 'all';
let _mySearchKeyword = '';
let _myCollapsedLessons = new Set();
let _myAllSubsCache = [];
let _myAllLogsCache = [];

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
export function initSubmissions() {
  $('studentDetailCloseBtn')?.addEventListener('click', () => hide($('studentDetailModal')));
  $('studentDetailModal')?.addEventListener('click', (e) => {
    if (e.target === $('studentDetailModal')) hide($('studentDetailModal'));
  });
}

// ══════════════════════════════════════════
// LOAD MY SUBMISSIONS — ⭐ v2: chỉ load theo khối
// ══════════════════════════════════════════
export async function loadMySubmissions() {
  const wrap = $('mySubmissions');
  if (!wrap) return;
  if (!state.currentUser || state.currentProfile?.role === 'teacher') {
    wrap.innerHTML = state.currentUser
      ? '<div class="empty">GV không có bài làm.</div>'
      : '<div class="empty">Đăng nhập để xem kết quả.</div>';
    return;
  }
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';
  try {
    const q = query(collection(db, 'submissions'), where('studentId', '==', state.currentUser.uid));
    const snap = await getDocs(q);
    const vlq = query(collection(db, 'viewLogs'), where('studentId', '==', state.currentUser.uid));
    const vls = await getDocs(vlq);
    const myLogs = vls.docs.map(d => ({ id: d.id, ...d.data() }));
    if (snap.empty && myLogs.length === 0) {
      wrap.innerHTML = '<div class="empty">Chưa có hoạt động nào.</div>';
      return;
    }
    // ⭐ v2: Chỉ load assignments/lessons theo khối của HS (nhanh hơn nhiều)
    const myGrade = getGradeFromClass(state.currentProfile.class);
    const [aSnap, lSnap] = await Promise.all([
      myGrade ? getDocs(query(collection(db, 'assignments'), where('grade', '==', myGrade))) : getDocs(collection(db, 'assignments')),
      myGrade ? getDocs(query(collection(db, 'lessons'), where('grade', '==', myGrade))) : getDocs(collection(db, 'lessons'))
    ]);
    const allAssignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allLessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const existingAssignmentIds = new Set(allAssignments.map(a => a.id));
    const hiddenLessonIds = new Set(allLessons.filter(l => l.hidden === true).map(l => l.id));
    const hiddenAssignmentIds = new Set(allAssignments.filter(a => a.hidden === true).map(a => a.id));
    const isAssignmentHiddenOrDeleted = (assignmentId) => {
      if (!existingAssignmentIds.has(assignmentId)) return true;
      if (hiddenAssignmentIds.has(assignmentId)) return true;
      const a = allAssignments.find(x => x.id === assignmentId);
      if (a && a.lessonId && hiddenLessonIds.has(a.lessonId)) return true;
      return false;
    };
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(s => !isAssignmentHiddenOrDeleted(s.assignmentId));
    const externalLogs = myLogs
      .filter(l => l.mode === 'external')
      .filter(l => !isAssignmentHiddenOrDeleted(l.assignmentId));
    _myAllSubsCache = items;
    _myAllLogsCache = externalLogs;
    renderMySubmissions(allLessons, allAssignments);
  } catch (err) {
    console.error('Load submissions error:', err);
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

// ... (giữ nguyên phần renderMySubmissions, bindMySubmissionsEvents, showStudentDetail, renderTeacherDetail từ file cũ)