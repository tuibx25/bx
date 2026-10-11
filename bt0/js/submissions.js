import {
  db, collection, getDocs, doc, updateDoc, query, where, getDoc
} from './firebase-init.js';
import { state } from './state.js';
import {
  $, show, hide, esc, fmtDate, fmtDuration, getGradeFromClass, mapError, totalPoints, typesetMath
} from './utils.js';
import { getPublicQuestions, renderReviewHtml } from './quiz.js';

// ⭐ State cho filter + collapse
let _myFilterStatus = 'all';
let _mySearchKeyword = '';
let _myCollapsedLessons = new Set();
let _myAllSubsCache = [];
let _myAllLogsCache = [];
const _maxCache = new Map();

// ⭐ Thang điểm thật của đề (thay hardcode 7)
function maxOf(a, sub) {
  if (sub && sub.autoMax != null) return sub.autoMax;
  if (!a) return '?';
  if (_maxCache.has(a.id)) return _maxCache.get(a.id);
  const t = totalPoints(getPublicQuestions(a));
  _maxCache.set(a.id, t);
  return t;
}

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
// LOAD MY SUBMISSIONS
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
    const snap = await getDocs(query(collection(db, 'submissions'), where('studentId', '==', state.currentUser.uid)));
    const vls = await getDocs(query(collection(db, 'viewLogs'), where('studentId', '==', state.currentUser.uid)));
    const myLogs = vls.docs.map(d => ({ id: d.id, ...d.data() }));
    if (snap.empty && myLogs.length === 0) {
      wrap.innerHTML = '<div class="empty">Chưa có hoạt động nào.</div>';
      return;
    }
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
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(mapError(err))}</div>`;
  }
}

// ══════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════
function renderMySubmissions(allLessons, allAssignments) {
  const wrap = $('mySubmissions');
  if (!wrap) return;
  const subs = _myAllSubsCache;
  const logs = _myAllLogsCache;
  const pendingCount = subs.filter(s => s.status === 'submitted').length;
  const gradedCount = subs.filter(s => s.status === 'published' || s.status === 'graded').length;
  const abandonedCount = subs.filter(s => s.status === 'abandoned').length;
  const totalCount = subs.length;
  let filteredSubs = subs;
  if (_myFilterStatus === 'pending') filteredSubs = subs.filter(s => s.status === 'submitted');
  else if (_myFilterStatus === 'graded') filteredSubs = subs.filter(s => s.status === 'published' || s.status === 'graded');
  else if (_myFilterStatus === 'abandoned') filteredSubs = subs.filter(s => s.status === 'abandoned');
  if (_mySearchKeyword) {
    const kw = _mySearchKeyword.toLowerCase();
    filteredSubs = filteredSubs.filter(s => (s.assignmentTitle || '').toLowerCase().includes(kw));
  }
  const grouped = {};
  filteredSubs.forEach(s => { (grouped[s.assignmentId] ||= []).push(s); });
  const byLesson = {};
  Object.keys(grouped).forEach(aId => {
    const a = allAssignments.find(x => x.id === aId);
    const lessonId = a?.lessonId || '_unassigned';
    (byLesson[lessonId] ||= []).push({ assignmentId: aId, subs: grouped[aId] });
  });
  const sortedLessonIds = Object.keys(byLesson).sort((a, b) => {
    if (a === '_unassigned') return 1;
    if (b === '_unassigned') return -1;
    const la = allLessons.find(x => x.id === a);
    const lb = allLessons.find(x => x.id === b);
    if (!la) return 1;
    if (!lb) return -1;
    if (la.grade !== lb.grade) return (la.grade || 0) - (lb.grade || 0);
    return (la.order || 0) - (lb.order || 0);
  });
  let html = `<div class="card" style="margin-bottom:16px;">
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
      <input type="text" id="mySearchInput" placeholder="🔍 Tìm theo tên đề..." value="${esc(_mySearchKeyword)}" style="flex:1; min-width:200px; padding:10px 14px; border:1px solid #D3D3D3; border-radius:8px; font-size:15px; font-family:inherit;" />
      <button class="btn btn-light btn-sm" id="myExpandAllBtn">📂 Mở hết</button>
      <button class="btn btn-light btn-sm" id="myCollapseAllBtn">📁 Thu gọn</button>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="my-chip ${_myFilterStatus === 'all' ? 'active' : ''}" data-my-filter="all">📋 Tất cả (${totalCount})</button>
      <button class="my-chip ${_myFilterStatus === 'pending' ? 'active' : ''}" data-my-filter="pending">⏳ Chờ công bố (${pendingCount})</button>
      <button class="my-chip ${_myFilterStatus === 'graded' ? 'active' : ''}" data-my-filter="graded">✅ Đã có điểm (${gradedCount})</button>
      ${abandonedCount > 0 ? `<button class="my-chip ${_myFilterStatus === 'abandoned' ? 'active' : ''}" data-my-filter="abandoned">⚠️ Đã hủy (${abandonedCount})</button>` : ''}
    </div>
  </div>`;
  if (Object.keys(grouped).length === 0) {
    html += '<div class="empty">Không có bài làm nào phù hợp bộ lọc.</div>';
    if (_myFilterStatus === 'all' && !_mySearchKeyword && logs.length > 0) {
      html += renderExternalLogsSection(logs);
    }
    wrap.innerHTML = html;
    bindMySubmissionsEvents(allLessons, allAssignments);
    return;
  }
  sortedLessonIds.forEach(lessonId => {
    const lesson = lessonId === '_unassigned' ? null : allLessons.find(x => x.id === lessonId);
    const lessonName = lesson ? lesson.name : '📦 Chưa phân loại';
    const lessonGrade = lesson?.grade || '';
    const assignmentsInLesson = byLesson[lessonId];
    let totalMaxScore = 0, totalBestScore = 0, countedAssigns = 0;
    assignmentsInLesson.forEach(({ assignmentId, subs: list }) => {
      const gradedSubs = list.filter(s => s.status === 'published' || s.status === 'graded');
      if (gradedSubs.length === 0) return;
      const a = allAssignments.find(x => x.id === assignmentId);
      const scores = gradedSubs.map(s => s.score != null ? s.score : (s.autoScore || 0));
      totalBestScore += Math.max(...scores);
      totalMaxScore += maxOf(a, gradedSubs[0]);
      countedAssigns++;
    });
    const avgScoreText = countedAssigns > 0
      ? `TB: ${Math.round((totalBestScore / countedAssigns) * 100) / 100}/${Math.round((totalMaxScore / countedAssigns) * 100) / 100}`
      : '';
    const isCollapsed = _myCollapsedLessons.has(lessonId);
    html += `
    <div class="my-lesson-group" style="margin-bottom:14px; border:1px solid #D3D3D3; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
      <div class="my-lesson-header" data-my-lesson-toggle="${lessonId}" style="
        background:linear-gradient(135deg, #8B5A2B, #8B4513); color:#FFF; padding:12px 18px; cursor:pointer;
        display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; user-select:none;">
        <div style="flex:1; min-width:200px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <strong style="font-size:15px;">📖 ${esc(lessonName)}</strong>
          ${lessonGrade ? `<span style="background:rgba(255,255,255,0.2); color:#FFF; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600;">Khối ${lessonGrade}</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="background:rgba(255,255,255,0.2); padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600;">${assignmentsInLesson.length} đề</span>
          ${avgScoreText ? `<span style="background:rgba(255,255,255,0.15); padding:3px 10px; border-radius:12px; font-size:12px;">🎯 ${avgScoreText}</span>` : ''}
          <span class="my-lesson-toggle-icon" style="font-size:18px; transition:transform 0.3s; ${isCollapsed ? 'transform:rotate(-90deg);' : ''}">▼</span>
        </div>
      </div>
      <div class="my-lesson-body" data-my-lesson-body="${lessonId}" ${isCollapsed ? 'style="display:none;"' : ''} style="padding:12px; background:#FAFAFA;">
        ${assignmentsInLesson.map(({ assignmentId, subs: list }) =>
          renderMyAssignmentCard(assignmentId, list, allAssignments)
        ).join('')}
      </div>
    </div>`;
  });
  if (_myFilterStatus === 'all' && !_mySearchKeyword && logs.length > 0) {
    html += renderExternalLogsSection(logs);
  }
  wrap.innerHTML = html;
  bindMySubmissionsEvents(allLessons, allAssignments);
}

// ══════════════════════════════════════════
// FILE LUYỆN TẬP
// ══════════════════════════════════════════
function renderExternalLogsSection(logs) {
  const groupedLogs = {};
  logs.forEach(l => { (groupedLogs[l.assignmentId] ||= []).push(l); });
  const logGroups = Object.values(groupedLogs);
  const isLogsCollapsed = !_myCollapsedLessons.has('external_logs_expanded');
  return `
  <div class="my-lesson-group" style="margin-top:20px; border:1px solid #0066CC; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,102,204,0.1);">
    <div class="my-lesson-header" data-my-logs-toggle="1" style="
      background:linear-gradient(135deg, #0066CC, #004488); color:#FFF; padding:12px 18px; cursor:pointer;
      display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; user-select:none;">
      <div style="flex:1; min-width:200px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <strong style="font-size:15px;">🔗 File luyện tập đã mở</strong>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="background:rgba(255,255,255,0.2); padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600;">${logGroups.length} file</span>
        <span style="background:rgba(255,255,255,0.15); padding:3px 10px; border-radius:12px; font-size:12px;">${logs.length} lượt</span>
        <span class="my-lesson-toggle-icon" style="font-size:18px; transition:transform 0.3s; ${isLogsCollapsed ? 'transform:rotate(-90deg);' : ''}">▼</span>
      </div>
    </div>
    <div class="my-lesson-body" data-my-logs-body="1" ${isLogsCollapsed ? 'style="display:none;"' : ''} style="padding:12px; background:#F5F9FF;">
      ${logGroups.map(list => {
        const a = list[0];
        const totalDur = list.reduce((s, l) => s + (l.durationSec || 0), 0);
        return `
        <div class="submission viewlog" style="margin-bottom:8px; border-left-color:#0066CC;">
          <div class="space-between">
            <strong>${esc(a.assignmentTitle)}</strong>
            <span class="badge badge-pending">Khối ${esc(a.grade)}</span>
          </div>
          <div class="text-sm mt-2">Đã mở <strong>${list.length} lần</strong> • Tổng thời gian: ${fmtDuration(totalDur)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ══════════════════════════════════════════
// RENDER 1 ĐỀ
// ══════════════════════════════════════════
function renderMyAssignmentCard(assignmentId, subsList, allAssignments) {
  const a = allAssignments.find(x => x.id === assignmentId);
  if (!a) return '';
  subsList.sort((a2, b2) =>
    (b2.submittedAt?.seconds || b2.startedAt?.seconds || 0) -
    (a2.submittedAt?.seconds || a2.startedAt?.seconds || 0)
  );
  const gradedSubs = subsList.filter(s => s.status === 'published' || s.status === 'graded');
  let bestScoreText = '—';
  if (gradedSubs.length > 0) {
    const scores = gradedSubs.map(s => s.score != null ? s.score : (s.autoScore || 0));
    bestScoreText = `${Math.max(...scores)}/${maxOf(a, gradedSubs[0])}`;
  }
  let overallStatus = 'pending';
  if (gradedSubs.length === subsList.length && subsList.length > 0) overallStatus = 'graded';
  else if (subsList.every(s => s.status === 'abandoned')) overallStatus = 'abandoned';
  const statusBadgeHtml = {
    pending: '<span class="badge badge-pending">⏳ Chờ công bố</span>',
    graded: '<span class="badge badge-published">✅ Đã có điểm</span>',
    abandoned: '<span class="badge badge-pending">⚠️ Đã hủy</span>'
  }[overallStatus];
  const collapseId = `my-subs-${assignmentId}`;
  return `<div class="my-assignment-card" style="margin-bottom:10px; background:#FFF; border:1px solid #E0E0E0; border-radius:8px; overflow:hidden;">
    <div class="my-assignment-header" data-my-subs-toggle="${collapseId}" style="
      padding:12px 16px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#FFF; border-left:4px solid ${overallStatus === 'graded' ? '#004488' : overallStatus === 'abandoned' ? '#c0392b' : '#8B5A2B'}; transition:background 0.15s;">
      <div style="flex:1; min-width:200px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong style="font-size:15px;">📝 ${esc(a.title)}</strong>
          ${statusBadgeHtml}
          ${gradedSubs.length > 0 ? `<span style="background:#E8F5E9; color:#004488; padding:2px 10px; border-radius:10px; font-size:12px; font-weight:700;">🎯 ${bestScoreText}</span>` : ''}
        </div>
        <div class="text-sm" style="margin-top:4px; color:#666;">Đã làm <strong>${subsList.length}/${a.maxAttempts || 3}</strong> lần</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn btn-light btn-sm" data-my-subs-expand="${collapseId}" style="pointer-events:none;">
          <span class="expand-text">👁 Xem ${subsList.length} lần</span>
        </button>
        <span class="my-subs-toggle-icon" style="font-size:16px; transition:transform 0.3s;">▼</span>
      </div>
    </div>
    <div class="my-subs-body hidden" data-my-subs-body="${collapseId}" style="padding:12px; background:#FAFAFA; border-top:1px solid #E0E0E0;">
      ${subsList.map((s, i) => renderSubmissionItem(s, subsList.length - i, a)).join('')}
    </div>
  </div>`;
}

// ══════════════════════════════════════════
// RENDER 1 LẦN LÀM
// ══════════════════════════════════════════
function renderSubmissionItem(s, attemptNum, a) {
  let statusHtml = '';
  let actionBtn = '';
  if (s.status === 'in_progress') statusHtml = `<span class="badge badge-inprogress">🔄 Đang làm</span>`;
  else if (s.status === 'abandoned') statusHtml = `<span class="badge badge-pending">⚠️ Hủy</span>`;
  else if (s.status === 'published' || s.status === 'graded') {
    statusHtml = `<span class="badge badge-published">✅ Đã công bố</span>`;
    actionBtn = `<button class="btn btn-light btn-sm" data-view-student-detail="${s.id}">👁 Xem chi tiết</button>`;
  } else statusHtml = `<span class="badge badge-pending">⏳ Chờ công bố</span>`;
  const showScore = s.status === 'published' || s.status === 'graded';
  const finalScore = s.score != null ? s.score : s.autoScore;
  const maxScore = maxOf(a, s);
  return `<div class="submission ${s.status === 'graded' || s.status === 'published' ? 'graded' : ''}" style="margin-bottom:8px;">
    <div class="space-between">
      <strong>Lần ${attemptNum}</strong>
      <div style="display:flex; gap:8px;">${statusHtml}${actionBtn}</div>
    </div>
    <div class="text-sm mt-2">Bắt đầu: ${fmtDate(s.startedAt)}${s.submittedAt ? ` • Nộp: ${fmtDate(s.submittedAt)}` : ''}</div>
    ${s.timeSpent ? `<div class="text-sm">⏱ ${Math.floor(s.timeSpent / 60)}p ${s.timeSpent % 60}s</div>` : ''}
    ${s.isTimeout ? `<div class="text-sm" style="color:#c0392b;">⏱ Hết giờ — hệ thống tự nộp</div>` : ''}
    ${showScore ? `<div class="mt-2" style="background:#E8F5E9; padding:12px; border-radius:6px; border-left:4px solid #0066CC;">
      <strong>Điểm: </strong><span class="score-display">${esc(finalScore)}/${esc(maxScore)}</span>
      ${s.comment ? `<div class="text-sm mt-2">💬 <strong>Nhận xét:</strong> ${esc(s.comment)}</div>` : ''}
    </div>` : ''}
  </div>`;
}

// ══════════════════════════════════════════
// BIND EVENTS
// ══════════════════════════════════════════
function bindMySubmissionsEvents(allLessons, allAssignments) {
  const wrap = $('mySubmissions');
  if (!wrap) return;
  const searchInput = $('mySearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      _mySearchKeyword = e.target.value.trim();
      renderMySubmissions(allLessons, allAssignments);
      const ni = $('mySearchInput');
      if (ni) {
        ni.focus();
        const L = ni.value.length;
        ni.setSelectionRange(L, L);
      }
    });
  }
  wrap.querySelectorAll('[data-my-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      _myFilterStatus = btn.dataset.myFilter;
      renderMySubmissions(allLessons, allAssignments);
    });
  });
  $('myExpandAllBtn')?.addEventListener('click', () => {
    _myCollapsedLessons.clear();
    if (_myAllLogsCache.length > 0) _myCollapsedLessons.add('external_logs_expanded');
    renderMySubmissions(allLessons, allAssignments);
  });
  $('myCollapseAllBtn')?.addEventListener('click', () => {
    const lessonIds = new Set();
    _myAllSubsCache.forEach(s => {
      const a = allAssignments.find(x => x.id === s.assignmentId);
      lessonIds.add(a?.lessonId || '_unassigned');
    });
    _myCollapsedLessons = lessonIds;
    renderMySubmissions(allLessons, allAssignments);
  });
  wrap.querySelectorAll('[data-my-lesson-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const lessonId = header.dataset.myLessonToggle;
      const body = wrap.querySelector(`[data-my-lesson-body="${lessonId}"]`);
      const icon = header.querySelector('.my-lesson-toggle-icon');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (isHidden) _myCollapsedLessons.delete(lessonId);
      else _myCollapsedLessons.add(lessonId);
      if (icon) icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
  });
  wrap.querySelectorAll('[data-my-subs-toggle]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('[data-view-student-detail]')) return;
      const collapseId = header.dataset.mySubsToggle;
      const body = wrap.querySelector(`[data-my-subs-body="${collapseId}"]`);
      const icon = header.querySelector('.my-subs-toggle-icon');
      const expandText = header.querySelector('.expand-text');
      if (!body) return;
      const isHidden = body.classList.contains('hidden');
      body.classList.toggle('hidden');
      if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      if (expandText) {
        const count = body.querySelectorAll('.submission').length;
        expandText.textContent = isHidden ? '🙈 Thu gọn' : `👁 Xem ${count} lần`;
      }
    });
  });
  wrap.querySelectorAll('[data-my-logs-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const body = wrap.querySelector('[data-my-logs-body]');
      const icon = header.querySelector('.my-lesson-toggle-icon');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (isHidden) _myCollapsedLessons.add('external_logs_expanded');
      else _myCollapsedLessons.delete('external_logs_expanded');
      if (icon) icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
  });
  wrap.querySelectorAll('[data-view-student-detail]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sub = _myAllSubsCache.find(x => x.id === btn.dataset.viewStudentDetail);
      if (sub) await showStudentDetail(sub);
    });
  });
}

// ══════════════════════════════════════════
// SHOW DETAIL
// ══════════════════════════════════════════
export async function showStudentDetail(sub) {
  try {
    await updateDoc(doc(db, 'submissions', sub.id), { studentViewed: true });
  } catch (e) {}
  let a = null;
  try {
    const aSnap = await getDoc(doc(db, 'assignments', sub.assignmentId));
    if (aSnap.exists()) a = { id: aSnap.id, ...aSnap.data() };
  } catch (e) {}
  const finalScore = sub.score != null ? sub.score : sub.autoScore;
  const maxScore = maxOf(a, sub);
  let body = `<div class="detail-header">
    <div class="info">
      <h2>${esc(sub.assignmentTitle)}</h2>
      <div class="meta">📅 Nộp: ${fmtDate(sub.submittedAt)}${sub.timeSpent ? ` • ⏱ ${Math.floor(sub.timeSpent / 60)}p ${sub.timeSpent % 60}s` : ''}</div>
    </div>
    <div class="score-box">
      <div class="score">${esc(finalScore)}/${esc(maxScore)}</div>
      <div class="label">Điểm trắc nghiệm</div>
    </div>
  </div>`;
  if (sub.comment) {
    body += `<div class="comment-box"><strong>💬 Nhận xét của GV:</strong><br>${esc(sub.comment)}</div>`;
  }
  body += `<div class="alert alert-info" style="margin-top:20px;">
    ℹ️ <strong>Lưu ý:</strong> Đây là <strong>điểm phần trắc nghiệm</strong> (tối đa ${esc(maxScore)} điểm).
    Điểm tự luận được GV chấm riêng.
  </div>`;
  const review = renderReviewHtml(sub, a ? getPublicQuestions(a) : []);
  if (review) body += review;
  $('studentDetailBody').innerHTML = body;
  // ⭐ v2.2: render công thức Toán/Lý
  typesetMath($('studentDetailBody'));
  show($('studentDetailModal'));
}