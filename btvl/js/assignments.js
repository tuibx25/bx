import {
  db, collection, getDocs, query, where
} from './firebase-init.js';
import { state } from './state.js';
import {
  $, esc, toast, normalizeClass, getGradeFromClass, fmtDuration
} from './utils.js';

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
export function initAssignments() {
  $('searchInput')?.addEventListener('input', renderAssignmentsFiltered);
  $('filterStatus')?.addEventListener('change', renderAssignmentsFiltered);
  $('filterType')?.addEventListener('change', renderAssignmentsFiltered);

  // Grade tabs (chỉ teacher đổi được)
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
// LOAD ASSIGNMENTS
// ══════════════════════════════════════════
export async function loadAssignments() {
  const list = $('assignmentsList');
  if (!list) return;
  list.innerHTML = '<div class="empty">Đang tải...</div>';

  try {
    // ⭐ Load TẤT CẢ lessons (chưa filter) để dùng cho filter ẩn
    const lq = query(collection(db, 'lessons'), where('grade', '==', state.currentGrade));
    const lSnap = await getDocs(lq);
    const allLessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allLessons.sort((a, b) => (a.order || 0) - (b.order || 0));

    // ⭐ HS KHÔNG thấy bài học bị ẩn (GV vẫn thấy để quản lý)
    let lessons = allLessons;
    if (state.currentProfile?.role !== 'teacher') {
      lessons = allLessons.filter(l => l.hidden !== true);
    }

    // Load assignments
    const aq = query(collection(db, 'assignments'), where('grade', '==', state.currentGrade));
    const aSnap = await getDocs(aq);
    let items = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ⭐ HS không thấy đề ẩn VÀ không thấy đề thuộc bài học bị ẩn
    if (state.currentProfile?.role !== 'teacher') {
      // Tập hợp ID các bài học bị ẩn (dùng allLessons, không phải lessons đã filter)
      const hiddenLessonIds = new Set(
        allLessons.filter(l => l.hidden === true).map(l => l.id)
      );

      // Bỏ đề bị ẩn riêng
      items = items.filter(a => !a.hidden);

      // Bỏ đề thuộc bài học bị ẩn
      items = items.filter(a => {
        if (!a.lessonId) return true; // Đề không thuộc bài học → vẫn hiện
        return !hiddenLessonIds.has(a.lessonId);
      });
    }

    // ⭐ HS chỉ thấy đề giao cho lớp/mình
    if (state.currentProfile?.role === 'student' && state.currentUser) {
      const myClassNorm = normalizeClass(state.currentProfile.class);
      const myGrade = getGradeFromClass(state.currentProfile.class);

      items = items.filter(a => {
        const hasClassAssign = a.assignedClasses && a.assignedClasses.length > 0;
        const hasStudentAssign = a.assignedTo && a.assignedTo.length > 0;
        const hasAllGradeAssign = a.assignedAllGrade === true;

        if (!hasClassAssign && !hasStudentAssign && !hasAllGradeAssign) return false;
        if (hasAllGradeAssign && a.grade === myGrade) return true;

        const toMe = a.assignedTo?.includes(state.currentUser.uid);
        const toMyClass = a.assignedClasses?.some(c => normalizeClass(c) === myClassNorm);
        return toMe || toMyClass;
      });
    }

    // Load submissions & view logs của HS
    let mySubs = [];
    let myViewLogs = [];
    if (state.currentUser && state.currentProfile?.role !== 'teacher') {
      const sq = query(collection(db, 'submissions'), where('studentId', '==', state.currentUser.uid));
      const ss = await getDocs(sq);
      mySubs = ss.docs.map(d => ({ id: d.id, ...d.data() }));

      const vlq = query(collection(db, 'viewLogs'), where('studentId', '==', state.currentUser.uid));
      const vls = await getDocs(vlq);
      myViewLogs = vls.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    state.allLessonsCache = lessons;
    state.allAssignmentsCache = items;
    state.mySubsCache = mySubs;
    state.myViewLogsCache = myViewLogs;

    renderAssignmentsFiltered();
  } catch (err) {
    console.error('Load assignments error:', err);
    list.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
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

  // Filter theo từ khóa
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

  // Filter theo loại
  if (filterType !== 'all') {
    items = items.filter(a => a.mode === filterType);
  }

  // Filter theo trạng thái (chỉ HS)
  if (filterStatus !== 'all' && state.currentProfile?.role === 'student') {
    items = items.filter(a => {
      const myClassNorm = normalizeClass(state.currentProfile.class);
      const toMe = a.assignedTo?.includes(state.currentUser?.uid) ||
                   a.assignedClasses?.some(c => normalizeClass(c) === myClassNorm);
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

  // Nhóm theo lesson
  const byLesson = {};
  const unassigned = [];

  items.forEach(a => {
    if (a.lessonId) {
      if (!byLesson[a.lessonId]) byLesson[a.lessonId] = [];
      byLesson[a.lessonId].push(a);
    } else {
      unassigned.push(a);
    }
  });

  let html = '';

  // Render các lesson (đã filter ẩn nếu là HS)
  lessons.forEach(lesson => {
    const lessonAssigns = byLesson[lesson.id] || [];
    if ((keyword || filterStatus !== 'all' || filterType !== 'all') && lessonAssigns.length === 0) return;
    html += renderLessonBlock(lesson, lessonAssigns);
  });

  // Render đề không thuộc bài học
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

  // ═══ Bind events ═══

  // Collapse lesson
  list.querySelectorAll('.lesson-header').forEach(h => {
    h.addEventListener('click', () => {
      h.nextElementSibling?.classList.toggle('collapsed');
      h.classList.toggle('collapsed');
    });
  });

  // Nút làm quiz
  list.querySelectorAll('[data-do-quiz]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = items.find(x => x.id === btn.dataset.doQuiz);
      if (a) window.dispatchEvent(new CustomEvent('open:quiz', { detail: a }));
    });
  });

  // Nút mở external
  list.querySelectorAll('[data-open-external]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = items.find(x => x.id === btn.dataset.openExternal);
      if (a) window.dispatchEvent(new CustomEvent('open:external', { detail: a }));
    });
  });

  // Nút xem essay
  list.querySelectorAll('[data-view-essay]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = items.find(x => x.id === btn.dataset.viewEssay);
      if (a) window.dispatchEvent(new CustomEvent('open:essay', { detail: a }));
    });
  });

  // Nút yêu cầu đăng nhập
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

  return `
    <div class="lesson-block">
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
    </div>
  `;
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
    const toMe = a.assignedTo?.includes(state.currentUser.uid);
    const toMyClass = a.assignedClasses?.some(c => normalizeClass(c) === myClassNorm);
    if (toMe || toMyClass || a.assignedAllGrade) {
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
  const isTeacher = state.currentProfile?.role === 'teacher';

  let actionBtn = '';

  if (isExternal) {
    if (!isLoggedIn) {
      actionBtn = `<button class="btn lock-btn btn-sm" data-require-login>🔒 Đăng nhập</button>`;
    } else if (isTeacher) {
      actionBtn = `<button class="btn btn-primary btn-sm" data-open-external="${a.id}">🔗 Mở (GV)</button>`;
    } else if (!isEmailVerified) {
      actionBtn = `<span class="text-sm" style="color:#c0392b;">📧 Xác thực email</span>`;
    } else if (maxAttempts > 0 && accessCount >= maxAttempts) {
      actionBtn = `<span class="text-sm" style="color:#c0392b;">✋ Đã mở ${maxAttempts} lần</span>`;
    } else {
      actionBtn = `<button class="btn btn-secondary btn-sm" data-open-external="${a.id}">🔗 Mở luyện tập (${accessCount}${maxAttempts > 0 ? '/' + maxAttempts : ''})</button>`;
    }
  } else {
    if (a.type === 'essay') {
      if (!isLoggedIn) {
        actionBtn = `<button class="btn lock-btn btn-sm" data-require-login>🔒 Đăng nhập</button>`;
      } else if (isTeacher) {
        actionBtn = `<button class="btn btn-primary btn-sm" data-view-essay="${a.id}">👁 Xem đề</button>`;
      } else if (!isEmailVerified) {
        actionBtn = `<span class="text-sm" style="color:#c0392b;">📧 Xác thực email</span>`;
      } else {
        actionBtn = `<button class="btn btn-primary btn-sm" data-view-essay="${a.id}">📖 Xem đề</button>`;
      }
    } else {
      if (!isLoggedIn) {
        actionBtn = `<button class="btn lock-btn btn-sm" data-require-login>🔒 Đăng nhập</button>`;
      } else if (isTeacher) {
        actionBtn = `<span class="text-sm" style="color:#8B4513;">👨‍🏫 GV</span>`;
      } else if (!isEmailVerified) {
        actionBtn = `<span class="text-sm" style="color:#c0392b;">📧 Xác thực email</span>`;
      } else if (doneCount >= maxAttempts) {
        actionBtn = `<span class="text-sm" style="color:#c0392b;">✋ Đã làm ${maxAttempts} lần</span>`;
      } else {
        actionBtn = `<button class="btn btn-primary btn-sm" data-do-quiz="${a.id}">🎯 Làm bài (${doneCount}/${maxAttempts})</button>`;
      }
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

  return `
    <div class="assignment-row ${isAssignedToMe ? 'assigned' : ''} ${isExternal ? 'external' : ''}" ${a.hidden ? 'style="opacity:0.7;"' : ''}>
      <div class="a-info">
        <div class="a-title">
          ${isExternal ? '📄' : '📝'} ${esc(a.title)}
          ${modeBadge}
          ${hiddenBadge}
          ${assignedBadge}
          ${newBadge}
        </div>
        ${metaInfo.length ? `<div class="a-meta">${metaInfo.join(' • ')}</div>` : ''}
      </div>
      <div class="a-actions">${actionBtn}</div>
    </div>
  `;
}