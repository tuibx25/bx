import {
  db, collection, getDocs, query, where
} from './firebase-init.js';
import { state } from './state.js';
import {
  $, esc, toast, mapError, normalizeClass, getGradeFromClass, fmtDuration
} from './utils.js';

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
export function initAssignments() {
  $('searchInput')?.addEventListener('input', renderAssignmentsFiltered);
  $('filterStatus')?.addEventListener('change', renderAssignmentsFiltered);
  $('filterType')?.addEventListener('change', renderAssignmentsFiltered);
  document.querySelectorAll('.grade-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.currentProfile?.role !== 'teacher') {
        toast('Chỉ giáo viên mới đổi khối', 'error');
        return;
      }
      document.querySelectorAll('.grade-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentGrade = btn.dataset.grade;
      loadAssignments();
    });
  });
}

// ══════════════════════════════════════════
// ⭐ LOAD ASSIGNMENTS — TỐI ƯU TỐC ĐỘ
// ══════════════════════════════════════════
export async function loadAssignments() {
  const list = $('assignmentsList');
  if (!list) return;
  list.innerHTML = '<div class="empty">Đang tải...</div>';

  // Khách chưa đăng nhập → không query (tránh lỗi permission)
  if (!state.currentUser) {
    list.innerHTML = '<div class="empty">🔒 Đăng nhập để xem bài tập.</div>';
    return;
  }

  const isTeacher = state.currentProfile?.role === 'teacher';
  const isStudent = state.currentProfile?.role === 'student';
  const myUid = state.currentUser.uid;
  const myClassNorm = isStudent ? normalizeClass(state.currentProfile.class) : null;
  const myGrade = isStudent ? getGradeFromClass(state.currentProfile.class) : state.currentGrade;

  try {
    // ⭐ 1. Load lessons + assignments SONG SONG (chỉ theo khối)
    const [lSnap, aSnap] = await Promise.all([
      getDocs(query(collection(db, 'lessons'), where('grade', '==', myGrade))),
      getDocs(query(collection(db, 'assignments'), where('grade', '==', myGrade)))
    ]);
    let allLessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    let items = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allLessons.sort((a, b) => (a.order || 0) - (b.order || 0));

    // ⭐ 2. Filter ẩn (chỉ với HS)
    if (isStudent) {
      const hiddenLessonIds = new Set(allLessons.filter(l => l.hidden === true).map(l => l.id));
      items = items.filter(a =>
        !a.hidden &&
        (!a.lessonId || !hiddenLessonIds.has(a.lessonId))
      );
    }

    // ⭐ 3. Filter theo đối tượng giao bài (chỉ với HS)
    if (isStudent && myUid) {
      items = items.filter(a => {
        if (a.assignedAllGrade && a.grade === myGrade) return true;
        if (a.assignedTo?.includes(myUid)) return true;
        if (a.assignedClasses?.some(c => normalizeClass(c) === myClassNorm)) return true;
        return false;
      });
    }

    // ⭐ 4. Load submissions + viewLogs SONG SONG (chỉ với HS)
    let mySubs = [];
    let myViewLogs = [];
    if (isStudent && myUid) {
      const [sSnap, vSnap] = await Promise.all([
        getDocs(query(collection(db, 'submissions'), where('studentId', '==', myUid))),
        getDocs(query(collection(db, 'viewLogs'), where('studentId', '==', myUid)))
      ]);
      mySubs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      myViewLogs = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // ⭐ 5. Cache và render
    state.allLessonsCache = isStudent
      ? allLessons.filter(l => l.hidden !== true)
      : allLessons;
    state.allAssignmentsCache = items;
    state.mySubsCache = mySubs;
    state.myViewLogsCache = myViewLogs;
    renderAssignmentsFiltered();
  } catch (err) {
    console.error('Load assignments error:', err);
    list.innerHTML = `<div class="empty">Lỗi: ${esc(mapError(err))}</div>`;
  }
}

// ══════════════════════════════════════════
// RENDER FILTERED
// ══════════════════════════════════════════
function renderAssignmentsFiltered() {
  const list = $('assignmentsList');
  if (!list) return;
  const keyword = ($('searchInput')?.value || '').toLowerCase().trim();
  const filterStatus = $('filterStatus')?.value || 'all';
  const filterType = $('filterType')?.value || 'all';
  let lessons = [...state.allLessonsCache];
  let items = [...state.allAssignmentsCache];

  if (keyword) {
    items = items.filter(a =>
      (a.title || '').toLowerCase().includes(keyword) ||
      (a.desc || '').toLowerCase().includes(keyword) ||
      (a.note || '').toLowerCase().includes(keyword)
    );
    const matchedLessonIds = new Set(items.map(a => a.lessonId).filter(Boolean));
    lessons = lessons.filter(l =>
      (l.name || '').toLowerCase().includes(keyword) || matchedLessonIds.has(l.id)
    );
  }
  if (filterType !== 'all') items = items.filter(a => a.mode === filterType);
  if (filterStatus !== 'all' && state.currentProfile?.role === 'student') {
    items = items.filter(a => {
      const myClassNorm = normalizeClass(state.currentProfile.class);
      const toMe = a.assignedTo?.includes(state.currentUser?.uid) ||
        a.assignedClasses?.some(c => normalizeClass(c) === myClassNorm) ||
        a.assignedAllGrade === true;
      const mySubs = state.mySubsCache.filter(s =>
        s.assignmentId === a.id && s.status !== 'in_progress'
      );
      const hasDone = mySubs.length > 0;
      const hasGraded = mySubs.some(s => s.status === 'graded' || s.status === 'published');
      if (filterStatus === 'assigned') return toMe;
      if (filterStatus === 'notdone') return !hasDone;
      if (filterStatus === 'done') return hasDone;
      if (filterStatus === 'graded') return hasGraded;
      return true;
    });
  }

  const countEl = $('resultCount');
  if (countEl) countEl.textContent = `Hiển thị ${items.length} đề`;

  const byLesson = {};
  const unassigned = [];
  items.forEach(a => {
    if (a.lessonId) { (byLesson[a.lessonId] ||= []).push(a); }
    else unassigned.push(a);
  });

  let html = '';
  lessons.forEach(lesson => {
    const lessonAssigns = byLesson[lesson.id] || [];
    if ((keyword || filterStatus !== 'all' || filterType !== 'all') && lessonAssigns.length === 0) return;
    html += renderLessonBlock(lesson, lessonAssigns);
  });
  if (unassigned.length > 0) {
    html += renderLessonBlock(
      { id: '_unassigned', name: 'Chưa phân loại', description: 'Đề chưa gán vào bài học', _unassigned: true },
      unassigned
    );
  }
  if (!html.trim()) {
    list.innerHTML = '<div class="empty">Không tìm thấy bài tập phù hợp.</div>';
    return;
  }
  list.innerHTML = html;

  // Bind events
  list.querySelectorAll('.lesson-header').forEach(h => {
    h.addEventListener('click', () => {
      h.nextElementSibling?.classList.toggle('collapsed');
      h.classList.toggle('collapsed');
    });
  });
  list.querySelectorAll('[data-do-quiz]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = items.find(x => x.id === btn.dataset.doQuiz);
      if (a) window.dispatchEvent(new CustomEvent('open:quiz', { detail: a }));
    });
  });
  list.querySelectorAll('[data-open-external]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = items.find(x => x.id === btn.dataset.openExternal);
      if (a) window.dispatchEvent(new CustomEvent('open:external', { detail: a }));
    });
  });
  list.querySelectorAll('[data-view-essay]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = items.find(x => x.id === btn.dataset.viewEssay);
      if (a) window.dispatchEvent(new CustomEvent('open:essay', { detail: a }));
    });
  });
  list.querySelectorAll('[data-require-login]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('open:login'));
    });
  });
}

// ══════════════════════════════════════════
// RENDER LESSON BLOCK
// ══════════════════════════════════════════
function renderLessonBlock(lesson, lessonAssigns) {
  const isUnassigned = lesson._unassigned;
  const lessonName = esc(lesson.name || 'Bài học');
  const lessonDesc = esc(lesson.description || '');
  let bodyHtml = '';
  if (lessonAssigns.length === 0) {
    bodyHtml = '<div class="empty-lesson">📭 Chưa có đề nào.</div>';
  } else {
    lessonAssigns.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    bodyHtml = lessonAssigns.map(a => renderAssignmentRow(a)).join('');
  }
  return `<div class="lesson-block">
    <div class="lesson-header">
      <div class="lesson-info">
        <h3>${isUnassigned ? '📦 ' + lessonName : '📖 ' + lessonName}</h3>
        ${lessonDesc ? `<div class="lesson-desc">${lessonDesc}</div>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="badge badge-lesson">${lessonAssigns.length} đề</span>
        <span class="lesson-toggle">▼</span>
      </div>
    </div>
    <div class="lesson-body">${bodyHtml}</div>
  </div>`;
}

// ══════════════════════════════════════════
// RENDER ASSIGNMENT ROW
// ══════════════════════════════════════════
function renderAssignmentRow(a) {
  const isExternal = a.mode === 'external';
  const isTeacherView = state.currentProfile?.role === 'teacher';
  const modeBadge = isTeacherView
    ? (isExternal
      ? '<span class="badge badge-external">🔗 Luyện tập</span>'
      : '<span class="badge badge-inline">🎯 Đề có điểm</span>')
    : '';
  const hiddenBadge = (isTeacherView && a.hidden)
    ? '<span class="badge badge-hidden">🙈 Đã ẩn</span>'
    : '';

  let assignedBadge = '';
  let isAssignedToMe = false;
  if (state.currentProfile?.role === 'student' && state.currentUser) {
    const myClassNorm = normalizeClass(state.currentProfile.class);
    const toMe = a.assignedTo?.includes(state.currentUser.uid) ||
      a.assignedClasses?.some(c => normalizeClass(c) === myClassNorm) ||
      a.assignedAllGrade;
    if (toMe) {
      assignedBadge = '<span class="badge badge-assigned">📌 GV giao</span>';
      isAssignedToMe = true;
    }
  }

  const mySubsOfA = state.mySubsCache.filter(s =>
    s.assignmentId === a.id && s.status !== 'in_progress'
  );
  const newPublished = mySubsOfA.some(s => s.status === 'published' && !s.studentViewed);
  const newBadge = newPublished ? '<span class="badge badge-new">🆕 Có điểm mới</span>' : '';

  const maxAttempts = a.maxAttempts || 3;
  const doneCount = mySubsOfA.length;
  const viewLogsOfA = state.myViewLogsCache.filter(v => v.assignmentId === a.id);
  const accessCount = viewLogsOfA.length;
  const totalDuration = viewLogsOfA.reduce((s, v) => s + (v.durationSec || 0), 0);

  const isLoggedIn = !!state.currentUser;
  const isEmailVerified = state.currentUser?.emailVerified === true;
  const isTeacher = isTeacherView;

  let actionBtn = '';
  if (isExternal) {
    if (!isLoggedIn) actionBtn = `<button class="btn lock-btn btn-sm" data-require-login>🔒 Đăng nhập</button>`;
    else if (isTeacher) actionBtn = `<button class="btn btn-primary btn-sm" data-open-external="${a.id}">🔗 Mở (GV)</button>`;
    else if (!isEmailVerified) actionBtn = `<span class="text-sm" style="color:#c0392b;">📧 Xác thực email</span>`;
    else if (maxAttempts > 0 && accessCount >= maxAttempts) actionBtn = `<span class="text-sm" style="color:#c0392b;">✋ Đã mở ${maxAttempts} lần</span>`;
    else actionBtn = `<button class="btn btn-secondary btn-sm" data-open-external="${a.id}">🔗 Mở luyện tập (${accessCount}${maxAttempts > 0 ? '/' + maxAttempts : ''})</button>`;
  } else {
    if (a.type === 'essay') {
      if (!isLoggedIn) actionBtn = `<button class="btn lock-btn btn-sm" data-require-login>🔒 Đăng nhập</button>`;
      else if (isTeacher) actionBtn = `<button class="btn btn-primary btn-sm" data-view-essay="${a.id}">👁 Xem đề</button>`;
      else if (!isEmailVerified) actionBtn = `<span class="text-sm" style="color:#c0392b;">📧 Xác thực email</span>`;
      else actionBtn = `<button class="btn btn-primary btn-sm" data-view-essay="${a.id}">📖 Xem đề</button>`;
    } else {
      if (!isLoggedIn) actionBtn = `<button class="btn lock-btn btn-sm" data-require-login>🔒 Đăng nhập</button>`;
      else if (isTeacher) actionBtn = `<span class="text-sm" style="color:#8B4513;">👨‍🏫 GV</span>`;
      else if (!isEmailVerified) actionBtn = `<span class="text-sm" style="color:#c0392b;">📧 Xác thực email</span>`;
      else if (doneCount >= maxAttempts) actionBtn = `<span class="text-sm" style="color:#c0392b;">✋ Đã làm ${maxAttempts} lần</span>`;
      else actionBtn = `<button class="btn btn-primary btn-sm" data-do-quiz="${a.id}">🎯 Làm bài (${doneCount}/${maxAttempts})</button>`;
    }
  }

  let metaInfo = [];
  if (isExternal) {
    metaInfo.push(`🔗 File ngoài`);
    if (state.currentProfile?.role === 'student') {
      metaInfo.push(`Đã mở ${accessCount} lần${totalDuration > 0 ? ` • ${fmtDuration(totalDuration)}` : ''}`);
    }
    if (maxAttempts > 0) metaInfo.push(`Tối đa ${maxAttempts} lần`);
  } else {
    if (a.type === 'quiz') {
      if (a.duration) metaInfo.push(`⏱ ${a.duration} phút`);
      if (state.currentProfile?.role === 'student') metaInfo.push(`Đã làm ${doneCount}/${maxAttempts}`);
    }
  }
  if (a.deadline) metaInfo.push(`📅 Hạn: ${a.deadline}`);

  return `<div class="assignment-row ${isAssignedToMe ? 'assigned' : ''} ${isExternal ? 'external' : ''}" ${a.hidden ? 'style="opacity:0.7;"' : ''}>
    <div class="a-info">
      <div class="a-title">
        ${isExternal ? '📄' : '📝'} ${esc(a.title)}
        ${modeBadge}${hiddenBadge}${assignedBadge}${newBadge}
      </div>
      ${metaInfo.length ? `<div class="a-meta">${metaInfo.join(' • ')}</div>` : ''}
    </div>
    <div class="a-actions">${actionBtn}</div>
  </div>`;
}