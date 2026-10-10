import {
  db, collection, addDoc, getDocs, doc, deleteDoc, updateDoc,
  query, where, getDoc, setDoc, serverTimestamp, writeBatch
} from './firebase-init.js';
import { state } from './state.js';
import { $, show, hide, esc, toast, fmtDate, fmtDuration, getGradeFromClass, mapError, totalPoints } from './utils.js';
import { parseQuestionsHtml, getPublicQuestions, renderReviewHtml } from './quiz.js';
import {
  loadAvailableClasses, bindClassGridEvents, bindEditClassGridEvents,
  bindNotifClassGridEvents, classGridState, resetClassGrid
} from './class-grid.js';

const ADMIN_DISPLAY_NAME = 'Admin';
let editingAssignmentId = null;
let _lessonsForSelect = [];
let currentLessonSelectSearch = '';
let currentLessonSelectOpen = false;
let _allClassesCache = null;
let _gradeAssignmentsCache = [];
let _gradeSubmissionsCache = [];
let _collapsedLessons = new Set();
const _maxCacheT = new Map();
const _keyCache = {};

function maxOfT(a, s) {
  if (s && s.autoMax != null) return s.autoMax;
  if (!a) return '?';
  if (_maxCacheT.has(a.id)) return _maxCacheT.get(a.id);
  const t = totalPoints(getPublicQuestions(a));
  _maxCacheT.set(a.id, t);
  return t;
}
async function getAnswerKey(assignmentId) {
  if (_keyCache[assignmentId] !== undefined) return _keyCache[assignmentId];
  try {
    const s = await getDoc(doc(db, 'assignments', assignmentId, 'answerKey', 'key'));
    _keyCache[assignmentId] = s.exists() ? s.data().questions : null;
  } catch (e) { _keyCache[assignmentId] = null; }
  return _keyCache[assignmentId];
}
function gradeAnswers(questions, answers = {}) {
  let total = 0, max = 0; const details = {};
  for (const q of questions) {
    const pts = Number(q.points || 1); max += pts;
    const a = answers[q.id];
    if (q.type === 'choice') {
      const ok = a === q.correctAnswer;
      total += ok ? pts : 0;
      details[q.id] = { type: 'choice', student: a ?? null, correct: q.correctAnswer, isCorrect: ok, points: pts, earned: ok ? pts : 0 };
    } else if (q.type === 'truefalse') {
      const per = pts / q.statements.length; let c = 0; const sd = {};
      q.statements.forEach(st => {
        const sa = a ? a[st.statement] : undefined;
        const ok = sa === st.correct; if (ok) c++;
        sd[st.statement] = { student: sa ?? null, correct: st.correct, isCorrect: ok };
      });
      const earned = Math.round(c * per * 100) / 100; total += earned;
      details[q.id] = { type: 'truefalse', details: sd, correctCount: c, total: q.statements.length, points: pts, earned, perStmt: per };
    } else {
      const norm = s => (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, '');
      const ok = norm(a) === norm(q.correctAnswer);
      total += ok ? pts : 0;
      details[q.id] = { type: 'short', student: a ?? '', correct: q.correctAnswer, isCorrect: ok, points: pts, earned: ok ? pts : 0 };
    }
  }
  return { score: Math.round(total * 100) / 100, max: Math.round(max * 100) / 100, details };
}
function stripPublicHtml(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('.question').forEach(q => q.removeAttribute('data-answer'));
  d.querySelectorAll('.tf-item').forEach(q => q.removeAttribute('data-answer'));
  return d.body.innerHTML;
}
async function writeAudit(action, target, extra = {}) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action, target, actor: state.currentUser.uid, ...extra, at: serverTimestamp()
    });
  } catch (e) {}
}

export function initTeacher() {}

export function renderTeacherTab() {
  const tab = $('tab-teacher');
  if (!tab) return;
  if (tab.innerHTML.includes('Thêm Bài Học')) return;
  tab.innerHTML = `
  <div class="card" style="border-left: 5px solid #2E7D32;">
    <h3>🧰 Công cụ GV</h3>
    <p class="text-sm" style="margin-bottom:10px;">
      ① <strong>Thu bài hết giờ</strong>: bấm sau mỗi hạn nộp — chấm điểm từ đáp án nháp của HS mất kết nối.<br>
      ② <strong>Backup</strong>: tải toàn bộ dữ liệu về máy (nên làm mỗi tháng / cuối năm).
    </p>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" id="collectDueBtn">⏱ Thu bài hết giờ</button>
      <button class="btn btn-light btn-sm" id="backupBtn">💾 Backup JSON</button>
    </div>
  </div>
  <div class="card" style="border-left: 5px solid #0066CC;">
    <h3>⚙️ Cài Đặt Hệ Thống</h3>
    <div class="form-group" style="padding:12px; background:#F5F5F5; border-radius:6px; margin-bottom:8px;">
      <label class="toggle-switch">
        <input type="checkbox" id="allowChangeClassToggle" />
        <span class="toggle-slider"></span>
        <span style="font-weight:600;">🔓 Cho phép HS tự đổi lớp</span>
      </label>
      <div class="hint" style="margin-top:8px;">💡 Bật khi đầu năm học để HS cập nhật lớp mới (VD: 10a12 → 11a12).</div>
    </div>
  </div>
  <div class="card">
    <div class="space-between mb-2">
      <h3>📖 Quản Lý Bài Học</h3>
      <button class="btn btn-primary btn-sm" id="showAddLessonBtn">➕ Thêm Bài Học</button>
    </div>
    <div class="hint" style="margin-bottom:10px; color:#666;">
      💡 Nút <strong>👁 Ẩn</strong> ẩn bài học + <strong>tất cả đề thuộc bài đó</strong> (tự cập nhật cờ lessonHidden).
    </div>
    <div id="lessonsList"></div>
  </div>
  <div class="card">
    <div class="space-between mb-2">
      <h3>📝 Thêm Đề Bài Tập</h3>
      <button class="btn btn-light btn-sm" id="showAddFormBtn">Hiện/Ẩn form</button>
    </div>
    <div id="addFormWrap" class="hidden">
      <div class="row">
        <div class="form-group" style="flex:1; min-width:140px;">
          <label>Khối lớp</label>
          <select id="addGrade">
            <option value="10">Vật Lý 10</option>
            <option value="11">Vật Lý 11</option>
            <option value="12">Vật Lý 12</option>
          </select>
        </div>
        <div class="form-group" style="flex:2; min-width:200px;">
          <label>Thuộc Bài học</label>
          <div class="searchable-select" id="addLessonSS">
            <input type="text" class="ss-display" id="addLessonDisplay" placeholder="-- Chọn bài học --" readonly />
            <input type="hidden" id="addLesson" value="" />
            <button type="button" class="ss-clear" id="addLessonClear" title="Bỏ chọn">×</button>
            <div class="ss-dropdown hidden" id="addLessonDropdown">
              <div class="ss-search-wrap"><input type="text" class="ss-search" id="addLessonSearch" placeholder="🔍 Tìm bài học..." /></div>
              <div class="ss-options" id="addLessonOptions"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="form-group"><label>Tiêu đề đề bài</label><input id="addTitle" placeholder="VD: Đề 1: Trắc nghiệm" /></div>
      <div class="form-group">
        <label>⭐ Loại đề</label>
        <div class="mode-toggle">
          <div class="mode-option selected" data-mode="inline">
            <div class="mode-title"> Đề nhập trực tiếp</div>
            <div class="mode-desc">Dán HTML → HS làm trên web → GV chấm tự động lúc công bố</div>
          </div>
          <div class="mode-option" data-mode="external">
            <div class="mode-title">🔗 Đề file ngoài</div>
            <div class="mode-desc">Nhập URL file HTML → HS mở tab mới luyện tập</div>
          </div>
        </div>
        <input type="hidden" id="addMode" value="inline" />
      </div>
      <div id="inlineFields">
        <div class="alert alert-info">💡 Dán HTML từ tool ccde2. Đáp án sẽ được <strong>tách ẩn</strong> ngay trên máy cô.</div>
        <div class="form-group">
          <label>📋 Dán HTML câu hỏi</label>
          <textarea id="addQuestionsHtml" placeholder='<div class="question" data-id="q1"...></div>' style="min-height: 250px; font-family: monospace; font-size: 12px;"></textarea>
          <button class="btn btn-light btn-sm" type="button" id="previewQuestionsBtn" style="margin-top:8px;">👁 Xem trước</button>
        </div>
        <div id="questionsPreview" class="hidden">
          <label style="font-weight:600; color:#8B4513;">Preview:</label>
          <div class="html-preview" id="questionsPreviewBox"></div>
        </div>
        <div class="row">
          <div class="form-group" style="flex:1;"><label>⏱ Thời gian (phút)</label><input type="number" id="addQuizDuration" value="25" min="1" max="180" /></div>
          <div class="form-group" style="flex:1;"><label>Số lượt tối đa</label><input type="number" id="addQuizMaxAttempts" value="3" min="1" max="10" /></div>
        </div>
      </div>
      <div id="externalFields" class="hidden">
        <div class="form-group"><label>🔗 URL file HTML</label><input id="addExternalUrl" placeholder="https://..." /></div>
        <div class="row">
          <div class="form-group" style="flex:1;"><label>Số lần mở tối đa (0 = không giới hạn)</label><input type="number" id="addExternalMaxAttempts" value="0" min="0" max="100" /></div>
          <div class="form-group" style="flex:1;"><label>Mô tả ngắn</label><input id="addExternalDesc" /></div>
        </div>
      </div>
      <div class="row" style="margin-top:14px;">
        <div class="form-group" style="flex:1;"><label>Hạn nộp</label><input type="date" id="addDeadline" /></div>
      </div>
      <div class="form-group" style="margin-top:14px;">
        <label class="form-label-bold">🎯 Giao bài cho ai?</label>
        <div class="hint" style="margin-bottom:10px; color:#555;">Tick <strong>"Cả khối"</strong> để giao cho TẤT CẢ HS của khối đang chọn.</div>
        <div class="class-grid-wrap">
          <div class="class-grid-tabs">
            <button type="button" class="class-grid-tab active" data-grade="10">Khối 10 <span class="tab-count" id="classTabCount10">0</span></button>
            <button type="button" class="class-grid-tab" data-grade="11">Khối 11 <span class="tab-count" id="classTabCount11">0</span></button>
            <button type="button" class="class-grid-tab" data-grade="12">Khối 12 <span class="tab-count" id="classTabCount12">0</span></button>
          </div>
          <label class="grade-all-checkbox" id="assignGradeAllWrap">
            <input type="checkbox" id="assignGradeAll" />
            <span class="gac-label">🌐 Giao cho CẢ KHỐI <span id="assignGradeAllCount" style="color:#c0392b;">0 HS</span></span>
          </label>
          <div class="class-grid-toolbar">
            <span class="toolbar-label">Hoặc tick các lớp cụ thể:</span>
            <div class="toolbar-actions">
              <button type="button" id="classGridSelectAll">✓ Tất cả</button>
              <button type="button" id="classGridDeselectAll">✗ Bỏ chọn</button>
            </div>
          </div>
          <div class="class-grid-body" id="classGridBody"><div class="class-grid-empty">Đang tải...</div></div>
          <div class="class-selected-summary">
            <span class="summary-label"> Sẽ giao cho:</span>
            <div class="summary-list" id="classSelectedList"><span class="empty-hint">Chưa chọn lớp nào</span></div>
          </div>
        </div>
      </div>
      <div class="form-group" style="margin-top:14px;">
        <label style="font-size:13px;">Giao riêng cho HS (theo email, cách nhau dấu phẩy)</label>
        <input id="addAssignEmails" placeholder="VD: hs1@gmail.com, hs2@gmail.com" />
      </div>
      <button class="btn btn-primary" id="addAssignmentBtn">✅ Thêm đề bài</button>
    </div>
  </div>
  <div class="card" style="border-left: 5px solid #D4A017;">
    <div class="space-between mb-2">
      <h3>📢 Quản Lý Thông Báo</h3>
      <button class="btn btn-primary btn-sm" id="showAddNotifBtn" style="background:#D4A017;">➕ Tạo thông báo mới</button>
    </div>
    <div id="notificationsList" style="border:1px solid #E0E0E0; border-radius:8px; overflow:hidden;"><div class="empty">Đang tải...</div></div>
  </div>
  <div class="card">
    <h3>📊 Thống Kê Điểm</h3>
    <div id="statsPanel">
      <div class="stats-filters">
        <div><label>Khối:</label>
          <select id="statsGrade"><option value="10">Vật Lý 10</option><option value="11">Vật Lý 11</option><option value="12">Vật Lý 12</option></select>
        </div>
        <div><label>Lớp:</label><select id="statsClass"><option value="">-- Tất cả lớp --</option></select></div>
        <div><label>Bài học:</label><select id="statsLesson"><option value="">-- Tất cả bài --</option></select></div>
        <div><label>📝 Đề:</label><select id="statsAssignment"><option value="">-- Chọn đề --</option></select></div>
        <div><label>🔍 Tìm HS:</label><input type="text" id="statsSearchStudent" placeholder="Nhập tên HS..." /></div>
        <div>
          <label class="toggle-switch" style="white-space:nowrap;">
            <input type="checkbox" id="statsOnlyAssigned" />
            <span class="toggle-slider"></span>
            <span style="font-weight:600; font-size:13px;">Chỉ HS được giao</span>
          </label>
        </div>
        <button class="btn btn-primary btn-sm" id="loadStatsBtn">🔄 Xem thống kê</button>
        <button class="btn btn-success btn-sm" id="exportStatsBtn" disabled>📥 Xuất Excel</button>
      </div>
      <div id="statsResult"><div class="empty">Bấm " Xem thống kê" để xem bảng điểm.</div></div>
    </div>
  </div>
  <div class="card" style="border-left: 5px solid #c0392b;">
    <h3 style="color: #c0392b;">⚠️ Xoá Dữ Liệu Cuối Năm</h3>
    <p class="text-sm" style="margin-bottom: 12px;">Xoá <strong>toàn bộ bài làm và điểm</strong> của HS. Nhớ 💾 Backup trước!</p>
    <div class="row">
      <button class="btn btn-danger" id="clearSubmissionsBtn">🗑 Xoá TẤT CẢ bài làm</button>
      <button class="btn btn-light" id="viewDataStatsBtn">📊 Xem thống kê dữ liệu</button>
    </div>
    <div id="dataStats" style="margin-top:12px;"></div>
  </div>
`;
  bindTeacherEvents();
  loadLessonsForTeacher();
  loadStatsClassesAndLessons();
  loadTeacherNotifications();
  loadAvailableClasses();
  bindClassGridEvents();
}

function bindTeacherEvents() {
  const tab = $('tab-teacher');
  if (!tab) return;
  const toggleEl = $('allowChangeClassToggle');
  if (toggleEl) {
    toggleEl.checked = state.globalSettings.allowChangeClass === true;
    toggleEl.addEventListener('change', async () => { await saveGlobalSettings({ allowChangeClass: toggleEl.checked }); });
  }
  $('collectDueBtn')?.addEventListener('click', collectDueSessions);
  $('backupBtn')?.addEventListener('click', backupJson);
  $('showAddLessonBtn')?.addEventListener('click', () => {
    $('lessonGrade').value = state.currentGrade;
    $('lessonName').value = '';
    $('lessonDesc').value = '';
    show($('addLessonModal'));
  });
  $('showAddFormBtn')?.addEventListener('click', () => {
    $('addFormWrap').classList.toggle('hidden');
    if (!$('addFormWrap').classList.contains('hidden')) {
      bindClassGridEvents();
      bindLessonSearchableSelect();
      updateLessonSelectOptions(_lessonsForSelect || []);
    }
  });
  $('addGrade')?.addEventListener('change', () => {
    clearLessonSelection();
    updateLessonSelectOptions(_lessonsForSelect || []);
  });
  $('showAddNotifBtn')?.addEventListener('click', openAddNotificationModal);
  tab.querySelectorAll('.mode-option').forEach(opt => {
    opt.addEventListener('click', () => {
      tab.querySelectorAll('.mode-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      $('addMode').value = opt.dataset.mode;
      if (opt.dataset.mode === 'inline') { show($('inlineFields')); hide($('externalFields')); }
      else { hide($('inlineFields')); show($('externalFields')); }
    });
  });
  $('previewQuestionsBtn')?.addEventListener('click', previewQuestions);
  $('addAssignmentBtn')?.addEventListener('click', addAssignment);
  $('clearSubmissionsBtn')?.addEventListener('click', clearAllSubmissions);
  $('viewDataStatsBtn')?.addEventListener('click', showDataStats);
  $('loadStatsBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('load:stats')));
  $('exportStatsBtn')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('export:stats')));
  $('statsGrade')?.addEventListener('change', () => {
    loadStatsClassesAndLessons();
    window.dispatchEvent(new CustomEvent('update:stats-assignment'));
  });
  $('statsClass')?.addEventListener('change', () => window.dispatchEvent(new CustomEvent('update:stats-assignment')));
  $('statsLesson')?.addEventListener('change', () => window.dispatchEvent(new CustomEvent('update:stats-assignment')));
}

// ══════════════════════════════════════════
// ⭐ THU BÀI HẾT GIỜ + ĐÓNG LOG MỒ CÔI
// ══════════════════════════════════════════
async function collectDueSessions() {
  if (!confirm('⏱ Thu bài các phiên ĐÃ QUÁ HẠN (>1 phút) và chấm từ đáp án nháp?\nĐồng thời đóng các log xem file bị treo.')) return;
  const now = Date.now();
  let n = 0, v = 0;
  try {
    const snap = await getDocs(query(collection(db, 'submissions'), where('status', '==', 'in_progress')));
    for (const d of snap.docs) {
      const s = d.data();
      if (!s.deadlineAt || now < s.deadlineAt + 60000) continue;
      let score = null, max = null, details = {}, ok = false;
      const key = await getAnswerKey(s.assignmentId);
      if (key) { const r = gradeAnswers(key, s.draftAnswers || {}); score = r.score; max = r.max; details = r.details; ok = true; }
      await updateDoc(d.ref, {
        status: 'submitted', answers: s.draftAnswers || {}, details,
        autoScore: score, autoMax: max, autoGraded: ok, needsManual: !ok,
        isTimeout: true, isLate: true,
        submittedAt: serverTimestamp(), submittedAtMs: now
      });
      n++;
    }
    const vSnap = await getDocs(query(collection(db, 'viewLogs'), where('closedAt', '==', null)));
    for (const d of vSnap.docs) {
      const l = d.data();
      const hb = l.lastHeartbeat || l.startedAt || 0;
      if (hb && hb < now - 120000) { await updateDoc(d.ref, { closedAt: hb, reconciled: true }); v++; }
    }
    toast(`✅ Đã thu ${n} bài hết giờ + đóng ${v} log treo`, 'success');
    if (n > 0) await writeAudit('collect_due', 'submissions', { count: n });
    loadTeacherAssignmentsList();
  } catch (e) { toast(mapError(e), 'error'); }
}

// ══════════════════════════════════════════
// ⭐ BACKUP JSON
// ══════════════════════════════════════════
async function backupJson() {
  toast('⏳ Đang backup...', 'info');
  try {
    const cols = ['users', 'lessons', 'assignments', 'submissions', 'viewLogs', 'notifications', 'settings'];
    const data = {};
    for (const c of cols) {
      const snap = await getDocs(collection(db, c));
      data[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_bxvlpt_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✅ Đã tải backup về máy!', 'success');
  } catch (e) { toast(mapError(e), 'error'); }
}

async function saveGlobalSettings(partial) {
  if (state.currentProfile?.role !== 'teacher') { toast('Chỉ GV mới đổi được cài đặt', 'error'); return; }
  try {
    await setDoc(doc(db, 'settings', 'system'), {
      ...state.globalSettings, ...partial,
      updatedAt: serverTimestamp(), updatedBy: state.currentUser.uid
    }, { merge: true });
    state.globalSettings = { ...state.globalSettings, ...partial };
    toast('✅ Đã lưu cài đặt', 'success');
  } catch (e) { toast(mapError(e), 'error'); }
}

async function loadLessonsForTeacher() {
  const wrap = $('lessonsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';
  try {
    const snap = await getDocs(collection(db, 'lessons'));
    const lessons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    lessons.sort((a, b) => (a.grade - b.grade) || (a.order || 0) - (b.order || 0));
    const aSnap = await getDocs(collection(db, 'assignments'));
    const assignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const assignmentCountByLesson = {};
    assignments.forEach(a => { if (a.lessonId) assignmentCountByLesson[a.lessonId] = (assignmentCountByLesson[a.lessonId] || 0) + 1; });
    _lessonsForSelect = lessons;
    if (lessons.length === 0) { wrap.innerHTML = '<div class="empty">Chưa có bài học nào.</div>'; return; }
    const byGrade = { 10: [], 11: [], 12: [] };
    lessons.forEach(l => { if (byGrade[l.grade]) byGrade[l.grade].push(l); });
    let html = '';
    [10, 11, 12].forEach(g => {
      const gradeLessons = byGrade[g];
      if (gradeLessons.length === 0) return;
      const totalAssign = gradeLessons.reduce((s, l) => s + (assignmentCountByLesson[l.id] || 0), 0);
      const hiddenCount = gradeLessons.filter(l => l.hidden).length;
      html += `
        <div class="lesson-tree-group" data-grade="${g}">
          <div class="lesson-tree-header" data-grade-toggle="${g}">
            <div class="lt-title">
              <span class="lt-icon">📚</span>
              <span class="lt-name">VẬT LÝ ${g}</span>
              <span class="lt-count">${gradeLessons.length} bài • ${totalAssign} đề${hiddenCount > 0 ? ` • ${hiddenCount} ẩn` : ''}</span>
            </div>
            <span class="lt-toggle">▼</span>
          </div>
          <div class="lesson-tree-body">
            ${gradeLessons.map((l, idx) => {
              const assignCount = assignmentCountByLesson[l.id] || 0;
              const isHidden = l.hidden === true;
              return `
                <div class="lesson-tree-row ${isHidden ? 'hidden-item' : ''}" ${isHidden ? 'style="opacity:0.6;"' : ''}>
                  <div class="ltr-num">${idx + 1}</div>
                  <div class="ltr-info">
                    <div class="ltr-name">${esc(l.name)}${isHidden ? '<span class="badge badge-hidden" style="margin-left:6px;">🙈 Đã ẩn</span>' : ''}</div>
                    ${l.description ? `<div class="ltr-desc">${esc(l.description)}</div>` : ''}
                  </div>
                  <div class="ltr-badges"><span class="ltr-badge ${assignCount > 0 ? 'has-assign' : ''}">${assignCount} đề</span></div>
                  <div class="ltr-actions">
                    <button class="btn-icon btn-icon-edit" data-toggle-lesson-hide="${l.id}" title="${isHidden ? 'Hiện bài' : 'Ẩn bài'}" style="background:${isHidden ? '#F5DEB3' : '#F0F0F0'};">${isHidden ? '👁' : '🙈'}</button>
                    <button class="btn-icon btn-icon-edit" data-edit-lesson="${l.id}" title="Sửa">✏️</button>
                    <button class="btn-icon btn-icon-danger" data-del-lesson="${l.id}" title="Xoá">🗑</button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-grade-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        header.nextElementSibling?.classList.toggle('collapsed');
      });
    });
    wrap.querySelectorAll('[data-toggle-lesson-hide]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const lessonId = btn.dataset.toggleLessonHide;
        const lesson = lessons.find(l => l.id === lessonId);
        if (!lesson) return;
        const newHidden = !lesson.hidden;
        const assignCount = assignmentCountByLesson[lessonId] || 0;
        let msg = newHidden ? `Ẩn bài học "${lesson.name}"?` : `Hiện bài học "${lesson.name}"?`;
        if (newHidden && assignCount > 0) msg += `\n\n️ HS sẽ KHÔNG thấy bài học này và ${assignCount} đề thuộc bài này nữa.`;
        if (!confirm(msg)) return;
        try {
          await updateDoc(doc(db, 'lessons', lessonId), { hidden: newHidden, updatedAt: serverTimestamp() });
          const aq = query(collection(db, 'assignments'), where('lessonId', '==', lessonId));
          const aSnap2 = await getDocs(aq);
          for (let i = 0; i < aSnap2.docs.length; i += 500) {
            const batch = writeBatch(db);
            aSnap2.docs.slice(i, i + 500).forEach(d => batch.update(d.ref, { lessonHidden: newHidden }));
            await batch.commit();
          }
          toast(newHidden ? '🙈 Đã ẩn bài học (+ đề)' : '👁 Đã hiện bài học (+ đề)', 'success');
          loadLessonsForTeacher();
          window.dispatchEvent(new CustomEvent('data:refresh'));
        } catch (err) { toast(mapError(err), 'error'); }
      });
    });
    wrap.querySelectorAll('[data-del-lesson]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const lessonId = btn.dataset.delLesson;
        const lesson = lessons.find(l => l.id === lessonId);
        if (!lesson) return;
        const assignCount = assignmentCountByLesson[lessonId] || 0;
        let msg = `Xoá bài học "${lesson.name}"?`;
        if (assignCount > 0) msg += `\n\n⚠️ Bài học này đang có ${assignCount} đề.`;
        if (!confirm(msg)) return;
        try {
          await deleteDoc(doc(db, 'lessons', lessonId));
          toast('✅ Đã xoá bài học', 'success');
          loadLessonsForTeacher();
          window.dispatchEvent(new CustomEvent('data:refresh'));
        } catch (err) { toast(mapError(err), 'error'); }
      });
    });
    wrap.querySelectorAll('[data-edit-lesson]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lesson = lessons.find(l => l.id === btn.dataset.editLesson);
        if (lesson) openEditLessonModal(lesson);
      });
    });
  } catch (err) {
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(mapError(err))}</div>`;
  }
}

function openEditLessonModal(lesson) {
  const existing = $('editLessonModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'editLessonModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal">
    <button class="modal-close-x" data-close-edit-lesson>✖</button>
    <h2>✏️ Sửa Bài Học</h2>
    <div class="form-group"><label>Khối lớp</label>
      <select id="editLessonGrade">
        <option value="10" ${lesson.grade === '10' ? 'selected' : ''}>Vật Lý 10</option>
        <option value="11" ${lesson.grade === '11' ? 'selected' : ''}>Vật Lý 11</option>
        <option value="12" ${lesson.grade === '12' ? 'selected' : ''}>Vật Lý 12</option>
      </select>
    </div>
    <div class="form-group"><label>Tên bài học</label><input id="editLessonName" value="${esc(lesson.name || '')}" /></div>
    <div class="form-group"><label>Mô tả</label><textarea id="editLessonDesc">${esc(lesson.description || '')}</textarea></div>
    <div class="modal-actions">
      <button class="btn btn-light" data-close-edit-lesson>Hủy</button>
      <button class="btn btn-primary" id="editLessonSave">💾 Lưu</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close-edit-lesson]').forEach(b => b.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#editLessonSave').addEventListener('click', async () => {
    const newName = modal.querySelector('#editLessonName').value.trim();
    if (!newName) { toast('Vui lòng nhập tên bài học', 'error'); return; }
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), {
        grade: modal.querySelector('#editLessonGrade').value,
        name: newName,
        description: modal.querySelector('#editLessonDesc').value.trim(),
        updatedAt: serverTimestamp()
      });
      toast('✅ Đã cập nhật bài học', 'success');
      modal.remove();
      loadLessonsForTeacher();
      window.dispatchEvent(new CustomEvent('data:refresh'));
    } catch (err) { toast(mapError(err), 'error'); }
  });
}

export function initAddLessonModal() {
  $('addLessonCancel')?.addEventListener('click', () => hide($('addLessonModal')));
  $('addLessonConfirm')?.addEventListener('click', async () => {
    const grade = $('lessonGrade').value;
    const name = $('lessonName').value.trim();
    const description = $('lessonDesc').value.trim();
    if (!name) { toast('Nhập tên bài học', 'error'); return; }
    try {
      const lSnap = await getDocs(query(collection(db, 'lessons'), where('grade', '==', grade)));
      await addDoc(collection(db, 'lessons'), {
        grade, name, description, order: lSnap.size + 1, hidden: false,
        teacherId: state.currentUser.uid, createdAt: serverTimestamp()
      });
      hide($('addLessonModal'));
      toast('✅ Đã thêm bài học!', 'success');
      loadLessonsForTeacher();
      window.dispatchEvent(new CustomEvent('data:refresh'));
    } catch (err) { toast(mapError(err), 'error'); }
  });
  const modal = $('addLessonModal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) hide($('addLessonModal')); });
}

function escapeRegex(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function updateLessonSelectOptions(lessons) {
  const optionsEl = $('addLessonOptions');
  if (!optionsEl) return;
  const search = currentLessonSelectSearch.toLowerCase().trim();
  const selectedId = $('addLesson')?.value || '';
  const selectedGrade = $('addGrade')?.value || '';
  let lessonsToShow = lessons;
  if (selectedGrade && /^(10|11|12)$/.test(selectedGrade)) lessonsToShow = lessons.filter(l => l.grade === selectedGrade);
  const byGrade = { 10: [], 11: [], 12: [] };
  lessonsToShow.forEach(l => { if (byGrade[l.grade]) byGrade[l.grade].push(l); });
  let html = ''; let totalVisible = 0;
  [10, 11, 12].forEach(g => {
    const filtered = search ? (byGrade[g] || []).filter(l => (l.name || '').toLowerCase().includes(search)) : (byGrade[g] || []);
    if (filtered.length === 0) return;
    if (!selectedGrade || !/^(10|11|12)$/.test(selectedGrade)) html += `<div class="ss-group-header">── KHỐI ${g} (${filtered.length} bài) ─</div>`;
    filtered.forEach(l => {
      const idx = lessons.filter(x => x.grade === l.grade).indexOf(l) + 1;
      let nameHtml = esc(l.name || '');
      if (search) nameHtml = nameHtml.replace(new RegExp(`(${escapeRegex(search)})`, 'gi'), '<mark>$1</mark>');
      html += `<div class="ss-option ${l.id === selectedId ? 'selected' : ''}" data-lesson-id="${l.id}"><span class="ss-num">${idx}.</span><span>${nameHtml}${l.hidden ? ' <span style="color:#999;font-size:11px;">(ẩn)</span>' : ''}</span></div>`;
      totalVisible++;
    });
  });
  if (totalVisible === 0) {
    optionsEl.innerHTML = (selectedGrade && /^(10|11|12)$/.test(selectedGrade))
      ? (search ? `<div class="ss-empty">🔍 Không tìm thấy bài "${esc(search)}"</div>` : `<div class="ss-empty">📭 Khối ${selectedGrade} chưa có bài học nào.</div>`)
      : '<div class="ss-empty">📭 Chưa có bài học nào</div>';
    return;
  }
  optionsEl.innerHTML = html;
  optionsEl.querySelectorAll('.ss-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const lesson = lessons.find(l => l.id === opt.dataset.lessonId);
      if (lesson) selectLesson(lesson);
    });
  });
}
function selectLesson(lesson) {
  $('addLesson').value = lesson.id;
  const d = $('addLessonDisplay');
  d.value = `Khối ${lesson.grade}: ${lesson.name}`;
  d.classList.add('has-value');
  $('addLessonClear').style.display = 'flex';
  $('addLessonDropdown').classList.add('hidden');
  currentLessonSelectOpen = false; currentLessonSelectSearch = '';
  const gs = $('addGrade');
  if (gs && lesson.grade && gs.value !== lesson.grade) gs.value = lesson.grade;
}
function clearLessonSelection() {
  $('addLesson').value = '';
  const d = $('addLessonDisplay');
  d.value = ''; d.placeholder = '-- Chọn bài học --'; d.classList.remove('has-value');
  $('addLessonClear').style.display = 'none';
}
function bindLessonSearchableSelect() {
  const ssWrap = $('addLessonSS'), displayInput = $('addLessonDisplay'), dropdown = $('addLessonDropdown'), searchInput = $('addLessonSearch'), clearBtn = $('addLessonClear');
  if (!ssWrap || !displayInput || !dropdown || ssWrap.dataset.bound) return;
  ssWrap.dataset.bound = 'true';
  displayInput.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains('hidden');
    if (isOpen) { dropdown.classList.add('hidden'); currentLessonSelectOpen = false; }
    else {
      dropdown.classList.remove('hidden'); currentLessonSelectOpen = true; currentLessonSelectSearch = '';
      if (searchInput) { searchInput.value = ''; setTimeout(() => searchInput.focus(), 50); }
      updateLessonSelectOptions(_lessonsForSelect || []);
    }
  });
  if (searchInput) {
    searchInput.addEventListener('input', (e) => { currentLessonSelectSearch = e.target.value; updateLessonSelectOptions(_lessonsForSelect || []); });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }
  if (clearBtn) clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearLessonSelection(); });
  document.addEventListener('click', (e) => {
    if (!ssWrap.contains(e.target)) { dropdown.classList.add('hidden'); currentLessonSelectOpen = false; }
  });
}

function previewQuestions() {
  const html = $('addQuestionsHtml').value.trim();
  if (!html) { toast('Chưa có HTML', 'error'); return; }
  const questions = parseQuestionsHtml(html);
  if (questions.length === 0) { toast('Không parse được câu hỏi!', 'error'); return; }
  const part1 = questions.filter(q => q.type === 'choice');
  const part2 = questions.filter(q => q.type === 'truefalse');
  const part3 = questions.filter(q => q.type === 'short');
  let previewHtml = `<div class="alert alert-success">✅ Parse được ${questions.length} câu — tổng ${totalPoints(questions)} điểm</div>`;
  if (part1.length > 0) {
    previewHtml += `<h4 style="color:#8B4513;margin-top:12px;">I. Trắc nghiệm (${part1.length})</h4>`;
    part1.forEach((q, i) => {
      previewHtml += `<div class="question"><div class="q-text">Câu ${i + 1}. ${q.textHtml || esc(q.text)} <span style="color:#0066CC;">[ĐA: ${q.correctAnswer}, ${q.points}đ]</span></div>`;
      q.options.forEach(o => { previewHtml += `<div class="opt">${o.value}. ${(o.html || esc(o.text)).replace(/^\s*[A-D]\s*[.\s]\s*/i, '').trim()}</div>`; });
      previewHtml += `</div>`;
    });
  }
  if (part2.length > 0) {
    previewHtml += `<h4 style="color:#0066CC;margin-top:12px;">II. Đúng/Sai (${part2.length})</h4>`;
    part2.forEach((q, i) => {
      previewHtml += `<div class="question"><div class="q-text">Câu ${i + 1}. ${q.textHtml || esc(q.text)} <span style="color:#0066CC;">[${q.points}đ]</span></div>`;
      q.statements.forEach(st => { previewHtml += `<div class="tf-item" style="padding:6px;">${String.fromCharCode(97 + st.statement)}) ${st.html || esc(st.text)} → <strong>${st.correct ? 'Đ' : 'S'}</strong></div>`; });
      previewHtml += `</div>`;
    });
  }
  if (part3.length > 0) {
    previewHtml += `<h4 style="color:#2E7D32;margin-top:12px;">III. Trả lời ngắn (${part3.length})</h4>`;
    part3.forEach((q, i) => { previewHtml += `<div class="question"><div class="q-text">Câu ${i + 1}. ${q.textHtml || esc(q.text)} <span style="color:#0066CC;">[ĐA: ${q.correctAnswer}, ${q.points}đ]</span></div></div>`; });
  }
  $('questionsPreviewBox').innerHTML = previewHtml;
  show($('questionsPreview'));
}

async function addAssignment() {
  if (state.currentProfile?.role !== 'teacher') { toast('Chỉ GV', 'error'); return; }
  const grade = $('addGrade').value;
  const lessonId = $('addLesson').value;
  const title = $('addTitle').value.trim();
  const mode = $('addMode').value;
  const deadline = $('addDeadline').value;
  if (!title) { toast('Nhập tiêu đề', 'error'); return; }
  const lesson = _lessonsForSelect.find(l => l.id === lessonId) || null;
  const assignGrid = classGridState.assign;
  const assignedAllGrade = assignGrid.allGrade;
  const assignedClasses = assignGrid.allGrade ? [] : Array.from(assignGrid.selected).sort();
  let assignedTo = [], assignedEmails = [];
  const emailsStr = $('addAssignEmails').value.trim();
  if (emailsStr) {
    const emails = emailsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const uSnap = await getDocs(collection(db, 'users'));
    const foundUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => emails.includes((u.email || '').toLowerCase()));
    assignedTo = foundUsers.map(u => u.id);
    assignedEmails = foundUsers.map(u => u.email);
  }
  if (!assignedAllGrade && assignedClasses.length === 0 && assignedTo.length === 0) {
    if (!confirm('⚠️ Bạn KHÔNG giao đề cho ai cả.\n\nĐề sẽ bị "treo".\n\nTiếp tục?')) return;
  }
  const payload = {
    grade, lessonId: lessonId || null, title, mode, deadline,
    hidden: false,
    lessonHidden: lesson ? lesson.hidden === true : false,
    teacherId: state.currentUser.uid,
    assignedAllGrade, assignedClasses, assignedTo, assignedEmails,
    createdAt: serverTimestamp()
  };
  const btn = $('addAssignmentBtn');
  btn.disabled = true; btn.textContent = '⏳ Đang lưu...';
  try {
    if (mode === 'inline') {
      const questionsHtml = $('addQuestionsHtml').value.trim();
      if (!questionsHtml) { toast('Dán HTML câu hỏi', 'error'); return; }
      const questions = parseQuestionsHtml(questionsHtml);
      if (questions.length === 0) { toast('Không parse được câu hỏi!', 'error'); return; }
      payload.type = 'quiz';
      payload.questionsPublicHtml = stripPublicHtml(questionsHtml);
      payload.totalPoints = totalPoints(questions);
      payload.duration = Number($('addQuizDuration').value) || 25;
      payload.maxAttempts = Number($('addQuizMaxAttempts').value) || 3;
      const ref = await addDoc(collection(db, 'assignments'), payload);
      await setDoc(doc(db, 'assignments', ref.id, 'answerKey', 'key'),
        { questions, questionsHtml, updatedAt: serverTimestamp() });
      let classMsg = assignedAllGrade ? ` cho CẢ KHỐI ${grade}` : assignedClasses.length ? ` cho ${assignedClasses.length} lớp` : assignedTo.length ? ` cho ${assignedTo.length} HS` : ' (chưa giao ai)';
      toast(`✅ Đã thêm đề${classMsg} — ${questions.length} câu, đáp án đã ẩn`, 'success');
    } else {
      const externalUrl = $('addExternalUrl').value.trim();
      if (!externalUrl) { toast('Nhập URL file', 'error'); return; }
      payload.type = 'external';
      payload.externalUrl = externalUrl;
      payload.maxAttempts = Number($('addExternalMaxAttempts').value) || 0;
      payload.desc = $('addExternalDesc').value.trim();
      await addDoc(collection(db, 'assignments'), payload);
      toast('✅ Đã thêm đề file ngoài!', 'success');
    }
    $('addTitle').value = ''; $('addQuestionsHtml').value = '';
    $('addExternalUrl').value = ''; $('addExternalDesc').value = '';
    $('addDeadline').value = ''; $('addAssignEmails').value = '';
    hide($('questionsPreview'));
    clearLessonSelection();
    resetClassGrid('assign');
    window.dispatchEvent(new CustomEvent('data:refresh'));
  } catch (err) { toast(mapError(err), 'error'); }
  finally { btn.disabled = false; btn.textContent = '✅ Thêm đề bài'; }
}

async function openAddNotificationModal() {
  const grid = classGridState.notif;
  grid.selected.clear(); grid.allGrade = false; grid.currentGrade = '10';
  $('notifTitle').value = ''; $('notifContent').value = '';
  document.querySelectorAll('.notif-class-grid-tab').forEach(t => t.classList.toggle('active', t.dataset.notifGrade === '10'));
  const sendAllCb = $('notifSendAll');
  if (sendAllCb) sendAllCb.checked = false;
  await loadAvailableClasses();
  bindNotifClassGridEvents();
  show($('addNotificationModal'));
}
async function saveNotification() {
  const title = $('notifTitle').value.trim();
  const content = $('notifContent').value.trim();
  const grid = classGridState.notif;
  if (!title) { toast('Vui lòng nhập tiêu đề', 'error'); return; }
  if (!content) { toast('Vui lòng nhập nội dung', 'error'); return; }
  if (!grid.allGrade && grid.selected.size === 0) { toast('Vui lòng chọn "Tất cả HS" hoặc ít nhất 1 lớp', 'error'); return; }
  const saveBtn = $('addNotifSaveBtn');
  saveBtn.disabled = true; saveBtn.textContent = '⏳ Đang đăng...';
  try {
    await addDoc(collection(db, 'notifications'), {
      title, content,
      sendToAll: grid.allGrade,
      targetClasses: grid.allGrade ? [] : Array.from(grid.selected).sort(),
      createdBy: state.currentUser.uid, createdByName: ADMIN_DISPLAY_NAME,
      createdAt: serverTimestamp()
    });
    toast('✅ Đã đăng thông báo!', 'success');
    hide($('addNotificationModal'));
    $('notifTitle').value = ''; $('notifContent').value = '';
    grid.allGrade = false; grid.selected.clear();
    loadTeacherNotifications();
  } catch (err) { toast(mapError(err), 'error'); }
  finally { saveBtn.disabled = false; saveBtn.textContent = '📢 Đăng thông báo'; }
}
async function loadTeacherNotifications() {
  const wrap = $('notificationsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';
  try {
    const snap = await getDocs(collection(db, 'notifications'));
    state.notificationsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.notificationsCache.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderTeacherNotifications();
  } catch (err) { wrap.innerHTML = `<div class="empty">Lỗi: ${esc(mapError(err))}</div>`; }
}
function renderTeacherNotifications() {
  const wrap = $('notificationsList');
  if (!wrap) return;
  if (state.notificationsCache.length === 0) { wrap.innerHTML = '<div class="empty">📭 Chưa có thông báo nào.</div>'; return; }
  wrap.innerHTML = state.notificationsCache.map(n => {
    let targetBadge = '';
    if (n.sendToAll) targetBadge = `<span class="badge" style="background:#c0392b; color:#FFF;">🌐 Tất cả HS</span>`;
    else if (n.targetClasses && n.targetClasses.length > 0) targetBadge = n.targetClasses.map(c => `<span class="badge" style="background:#8B5A2B; color:#FFF; margin-right:4px;"> ${esc(c)}</span>`).join('');
    return `
      <div class="notif-item">
        <div class="n-info">
          <div class="n-title">📢 ${esc(n.title)}</div>
          <div class="n-content">${esc(n.content)}</div>
          <div class="n-meta">${targetBadge}<span>‍ ${ADMIN_DISPLAY_NAME}</span><span>📅 ${fmtDate(n.createdAt)}</span></div>
        </div>
        <div class="n-actions"><button class="btn btn-danger btn-sm" data-del-notif="${n.id}"> Xoá</button></div>
      </div>`;
  }).join('');
  wrap.querySelectorAll('[data-del-notif]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Xoá thông báo này?')) return;
      try {
        await deleteDoc(doc(db, 'notifications', btn.dataset.delNotif));
        toast('✅ Đã xoá thông báo', 'success');
        loadTeacherNotifications();
      } catch (err) { toast(mapError(err), 'error'); }
    });
  });
}
export function initNotifModals() {
  $('addNotifCloseBtn')?.addEventListener('click', () => hide($('addNotificationModal')));
  $('addNotifCancelBtn')?.addEventListener('click', () => hide($('addNotificationModal')));
  $('addNotifSaveBtn')?.addEventListener('click', saveNotification);
  const modal = $('addNotificationModal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) hide($('addNotificationModal')); });
}

async function showDataStats() {
  const statsDiv = $('dataStats');
  statsDiv.innerHTML = '<div class="empty">Đang đếm...</div>';
  try {
    const [subsSnap, logsSnap, usersSnap, aSnap, lSnap] = await Promise.all([
      getDocs(collection(db, 'submissions')), getDocs(collection(db, 'viewLogs')),
      getDocs(collection(db, 'users')), getDocs(collection(db, 'assignments')), getDocs(collection(db, 'lessons'))
    ]);
    const studentCount = usersSnap.docs.filter(d => d.data().role === 'student').length;
    statsDiv.innerHTML = `
      <div class="alert alert-info">
        <strong> Thống kê dữ liệu:</strong>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li> Học sinh: <strong>${studentCount}</strong></li>
          <li>📖 Bài học: <strong>${lSnap.size}</strong></li>
          <li>📝 Đề bài tập: <strong>${aSnap.size}</strong></li>
          <li>📄 Bài làm: <strong>${subsSnap.size}</strong></li>
          <li>👁 Log truy cập: <strong>${logsSnap.size}</strong></li>
        </ul>
      </div>`;
  } catch (err) { statsDiv.innerHTML = `<div class="alert alert-error">Lỗi: ${esc(mapError(err))}</div>`; }
}
async function clearAllSubmissions() {
  if (!confirm('⚠️ XOÁ TẤT CẢ BÀI LÀM VÀ ĐIỂM?\n\nKhông thể hoàn tác!')) return;
  const confirmText = prompt('Gõ chính xác để xác nhận: XOA HET');
  if (confirmText !== 'XOA HET') { toast('Đã hủy', 'info'); return; }
  toast('Đang xoá...', 'info');
  try {
    const subsSnap = await getDocs(collection(db, 'submissions'));
    const logsSnap = await getDocs(collection(db, 'viewLogs'));
    for (let i = 0; i < subsSnap.docs.length; i += 500) {
      const batch = writeBatch(db);
      subsSnap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    for (let i = 0; i < logsSnap.docs.length; i += 500) {
      const batch = writeBatch(db);
      logsSnap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    toast(`✅ Đã xoá ${subsSnap.size} bài làm + ${logsSnap.size} log!`, 'success');
    window.dispatchEvent(new CustomEvent('data:refresh'));
    showDataStats();
  } catch (err) { toast(mapError(err), 'error'); }
}

export async function loadStatsClassesAndLessons() {
  const grade = $('statsGrade')?.value;
  if (!grade) return;
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const users = usersSnap.docs.map(d => d.data()).filter(u => u.role === 'student');
    const classSet = new Set();
    users.forEach(u => { if (u.class && getGradeFromClass(u.class) === grade) classSet.add(u.class); });
    const classes = Array.from(classSet).sort();
    const lSnap = await getDocs(query(collection(db, 'lessons'), where('grade', '==', grade)));
    const lessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    lessons.sort((a, b) => (a.order || 0) - (b.order || 0));
    state.teacherLessonsMapCache = {};
    lessons.forEach(l => { state.teacherLessonsMapCache[l.id] = l; });
    const sc = $('statsClass'), sl = $('statsLesson');
    if (sc) sc.innerHTML = '<option value="">-- Tất cả lớp --</option>' + classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (sl) sl.innerHTML = '<option value="">-- Tất cả bài --</option>' + lessons.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
  } catch (err) { console.error('Load stats filters error:', err); }
}

let _teacherAsgCache = [];
let _teacherLessonsCache = {};
let _teacherViewLogsCache = [];
export function renderAssignmentsTab() {
  const tab = $('tab-assignments');
  if (!tab) return;
  if (tab.innerHTML.includes('Danh Sách Đề')) return;
  tab.innerHTML = `
  <div class="card">
    <div class="space-between mb-2">
      <h3>📋 Danh Sách Đề & Bài Làm</h3>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-light btn-sm" id="expandAllBtn">📂 Mở hết</button>
        <button class="btn btn-light btn-sm" id="collapseAllBtn">📁 Thu gọn</button>
        <button class="btn btn-light btn-sm" id="refreshAssignmentsBtn">🔄 Tải lại</button>
      </div>
    </div>
    <div class="filter-bar">
      <label>📚 Khối:</label>
      <select id="asgFilterGrade"><option value="all">Tất cả khối</option><option value="10">Khối 10</option><option value="11">Khối 11</option><option value="12">Khối 12</option></select>
      <label>🏫 Lớp:</label><select id="asgFilterClass"><option value="all">Tất cả lớp</option></select>
      <label> Bài học:</label><select id="asgFilterLesson"><option value="all">Tất cả bài</option></select>
      <label>📝 Đề:</label><select id="asgFilterAssignment"><option value="all">Tất cả đề</option></select>
      <label>📋 Loại:</label>
      <select id="asgFilterType"><option value="all">Tất cả</option><option value="quiz">🎯 Đề có điểm</option><option value="external">🔗 Luyện tập</option></select>
      <input type="text" id="asgSearchInput" placeholder="🔍 Tìm theo tên đề..." />
      <span class="count" id="asgResultCount"></span>
    </div>
    <div id="teacherAssignmentsList"></div>
  </div>`;
  $('refreshAssignmentsBtn')?.addEventListener('click', () => { _allClassesCache = null; loadTeacherAssignmentsList(); });
  $('expandAllBtn')?.addEventListener('click', () => { _collapsedLessons.clear(); renderTeacherAssignmentsList(); });
  $('collapseAllBtn')?.addEventListener('click', () => {
    _collapsedLessons = new Set([...Object.keys(_teacherLessonsCache), '_unassigned']);
    renderTeacherAssignmentsList();
  });
  $('asgFilterGrade')?.addEventListener('change', async () => { await updateAsgClassFilter(); updateAsgLessonFilter(); updateAsgAssignmentFilter(); renderTeacherAssignmentsList(); });
  $('asgFilterClass')?.addEventListener('change', () => { updateAsgLessonFilter(); updateAsgAssignmentFilter(); renderTeacherAssignmentsList(); });
  $('asgFilterLesson')?.addEventListener('change', () => { updateAsgAssignmentFilter(); renderTeacherAssignmentsList(); });
  $('asgFilterAssignment')?.addEventListener('change', renderTeacherAssignmentsList);
  $('asgFilterType')?.addEventListener('change', () => { updateAsgLessonFilter(); updateAsgAssignmentFilter(); renderTeacherAssignmentsList(); });
  $('asgSearchInput')?.addEventListener('input', renderTeacherAssignmentsList);
  loadTeacherAssignmentsList();
}
async function loadTeacherAssignmentsList() {
  const wrap = $('teacherAssignmentsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';
  try {
    const [aSnap, sSnap, vSnap, lSnap] = await Promise.all([
      getDocs(collection(db, 'assignments')), getDocs(collection(db, 'submissions')),
      getDocs(collection(db, 'viewLogs')), getDocs(collection(db, 'lessons'))
    ]);
    _teacherAsgCache = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const subs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _teacherViewLogsCache = vSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _teacherLessonsCache = {};
    lSnap.docs.forEach(d => { _teacherLessonsCache[d.id] = { id: d.id, ...d.data() }; });
    _teacherAsgCache.forEach(a => {
      a._subCount = subs.filter(s => s.assignmentId === a.id).length;
      a._submittedCount = subs.filter(s => s.assignmentId === a.id && s.status === 'submitted').length;
      a._gradedCount = subs.filter(s => s.assignmentId === a.id && (s.status === 'graded' || s.status === 'published')).length;
    });
    state.teacherAssignmentsCache = _teacherAsgCache;
    state.teacherSubmissionsCache = subs;
    state.teacherLessonsMapCache = _teacherLessonsCache;
    _gradeAssignmentsCache = _teacherAsgCache;
    _gradeSubmissionsCache = subs;
    await updateAsgClassFilter();
    updateAsgLessonFilter();
    updateAsgAssignmentFilter();
    renderTeacherAssignmentsList();
  } catch (err) { wrap.innerHTML = `<div class="empty">Lỗi: ${esc(mapError(err))}</div>`; }
}
async function loadAllClasses() {
  if (_allClassesCache) return _allClassesCache;
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => d.data()).filter(u => u.role === 'student');
    const classSet = new Set();
    users.forEach(u => { if (u.class) classSet.add(u.class); });
    _allClassesCache = Array.from(classSet).sort((a, b) => {
      const gA = a.match(/^(\d+)/)?.[1] || '', gB = b.match(/^(\d+)/)?.[1] || '';
      if (gA !== gB) return gA.localeCompare(gB);
      return parseInt(a.match(/a(\d+)$/)?.[1] || 0) - parseInt(b.match(/a(\d+)$/)?.[1] || 0);
    });
    return _allClassesCache;
  } catch (err) { return []; }
}
async function updateAsgClassFilter() {
  const gradeFilter = $('asgFilterGrade')?.value || 'all';
  const select = $('asgFilterClass');
  if (!select) return;
  let classes = await loadAllClasses();
  if (gradeFilter !== 'all') classes = classes.filter(c => (c.match(/^(10|11|12)/)?.[1]) === gradeFilter);
  const currentVal = select.value;
  select.innerHTML = '<option value="all">Tất cả lớp</option>' + classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  select.value = classes.includes(currentVal) ? currentVal : 'all';
}
function updateAsgLessonFilter() {
  const gradeFilter = $('asgFilterGrade')?.value || 'all';
  const classFilter = $('asgFilterClass')?.value || 'all';
  const typeFilter = $('asgFilterType')?.value || 'all';
  const ids = new Set();
  _teacherAsgCache.forEach(a => {
    if (gradeFilter !== 'all' && a.grade !== gradeFilter) return;
    if (typeFilter !== 'all' && a.mode !== typeFilter) return;
    if (classFilter !== 'all') {
      const cg = classFilter.match(/^(10|11|12)/)?.[1];
      if (!((a.assignedClasses && a.assignedClasses.includes(classFilter)) || (a.assignedAllGrade && a.grade === cg))) return;
    }
    ids.add(a.lessonId || '_unassigned');
  });
  const lessons = Object.values(_teacherLessonsCache)
    .filter(l => gradeFilter === 'all' || l.grade === gradeFilter)
    .filter(l => ids.has(l.id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const select = $('asgFilterLesson');
  if (!select) return;
  const cur = select.value;
  select.innerHTML = '<option value="all">Tất cả bài</option>' + lessons.map(l => `<option value="${l.id}">${esc(l.name)}${l.hidden ? ' (ẩn)' : ''}</option>`).join('');
  select.value = lessons.some(l => l.id === cur) ? cur : 'all';
}
function updateAsgAssignmentFilter() {
  const gradeFilter = $('asgFilterGrade')?.value || 'all';
  const classFilter = $('asgFilterClass')?.value || 'all';
  const lessonFilter = $('asgFilterLesson')?.value || 'all';
  const typeFilter = $('asgFilterType')?.value || 'all';
  let filtered = [..._teacherAsgCache];
  if (gradeFilter !== 'all') filtered = filtered.filter(a => a.grade === gradeFilter);
  if (typeFilter !== 'all') filtered = filtered.filter(a => a.mode === typeFilter);
  if (lessonFilter !== 'all') filtered = filtered.filter(a => lessonFilter === '_unassigned' ? !a.lessonId : a.lessonId === lessonFilter);
  if (classFilter !== 'all') {
    const cg = classFilter.match(/^(10|11|12)/)?.[1];
    filtered = filtered.filter(a => (a.assignedClasses && a.assignedClasses.includes(classFilter)) || (a.assignedAllGrade && a.grade === cg));
  }
  filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const select = $('asgFilterAssignment');
  if (!select) return;
  const cur = select.value;
  select.innerHTML = '<option value="all">Tất cả đề</option>' + filtered.map(a => `<option value="${a.id}">${a.mode === 'external' ? '🔗' : '🎯'} ${esc(a.title)} ${a.hidden ? '' : ''}</option>`).join('');
  select.value = filtered.some(a => a.id === cur) ? cur : 'all';
}
function renderTeacherAssignmentsList() {
  const wrap = $('teacherAssignmentsList');
  if (!wrap) return;
  const gradeFilter = $('asgFilterGrade')?.value || 'all';
  const classFilter = $('asgFilterClass')?.value || 'all';
  const lessonFilter = $('asgFilterLesson')?.value || 'all';
  const assignmentFilter = $('asgFilterAssignment')?.value || 'all';
  const typeFilter = $('asgFilterType')?.value || 'all';
  const keyword = ($('asgSearchInput')?.value || '').toLowerCase().trim();
  let items = [..._teacherAsgCache];
  if (gradeFilter !== 'all') items = items.filter(a => a.grade === gradeFilter);
  if (typeFilter !== 'all') items = items.filter(a => a.mode === typeFilter);
  if (lessonFilter !== 'all') items = items.filter(a => lessonFilter === '_unassigned' ? !a.lessonId : a.lessonId === lessonFilter);
  if (assignmentFilter !== 'all') items = items.filter(a => a.id === assignmentFilter);
  if (classFilter !== 'all') {
    const cg = classFilter.match(/^(10|11|12)/)?.[1];
    items = items.filter(a => (a.assignedClasses && a.assignedClasses.includes(classFilter)) || (a.assignedAllGrade && a.grade === cg));
  }
  if (keyword) items = items.filter(a => (a.title || '').toLowerCase().includes(keyword));
  const countEl = $('asgResultCount');
  if (countEl) countEl.textContent = `${items.length} đề`;
  if (items.length === 0) { wrap.innerHTML = '<div class="empty">Không có đề nào phù hợp.</div>'; return; }
  const byLesson = {};
  items.forEach(a => { (byLesson[a.lessonId || '_unassigned'] ||= []).push(a); });
  const sortedLessonIds = Object.keys(byLesson).sort((a, b) => {
    if (a === '_unassigned') return 1;
    if (b === '_unassigned') return -1;
    const la = _teacherLessonsCache[a], lb = _teacherLessonsCache[b];
    if (!la) return 1; if (!lb) return -1;
    if (la.grade !== lb.grade) return (la.grade || 0) - (lb.grade || 0);
    return (la.order || 0) - (lb.order || 0);
  });
  let html = '';
  sortedLessonIds.forEach(lessonId => {
    const lesson = _teacherLessonsCache[lessonId];
    const lessonAssigns = byLesson[lessonId];
    const isCollapsed = _collapsedLessons.has(lessonId);
    const totalSubs = lessonAssigns.reduce((s, a) => s + (a._subCount || 0), 0);
    const totalSubmitted = lessonAssigns.reduce((s, a) => s + (a._submittedCount || 0), 0);
    html += `
      <div class="lesson-group" style="margin-bottom:16px; border:1px solid #D3D3D3; border-radius:10px; overflow:hidden; box-shadow:0 2px 6px rgba(0,0,0,0.05);">
        <div class="lesson-group-header" data-lesson-toggle="${lessonId}" style="background:linear-gradient(135deg, #8B5A2B, #8B4513); color:#FFF; padding:14px 20px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; user-select:none;">
          <div style="flex:1; min-width:200px;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <strong style="font-size:15px;">📖 ${esc(lesson ? lesson.name : '📦 Chưa phân loại')}</strong>
              ${lesson?.hidden === true ? '<span class="badge" style="background:#999; color:#FFF;">🙈 Bài ẩn</span>' : ''}
              ${lesson?.grade ? `<span class="badge" style="background:rgba(255,255,255,0.2); color:#FFF;">Khối ${lesson.grade}</span>` : ''}
            </div>
            ${lesson?.description ? `<div style="font-size:12px; opacity:0.85; margin-top:4px;">${esc(lesson.description)}</div>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="background:rgba(255,255,255,0.2); padding:4px 12px; border-radius:12px; font-size:13px; font-weight:600;">${lessonAssigns.length} đề</span>
            ${totalSubs > 0 ? `<span style="background:rgba(255,255,255,0.15); padding:4px 12px; border-radius:12px; font-size:12px;">📊 ${totalSubs} bài</span>` : ''}
            ${totalSubmitted > 0 ? `<span style="background:#c0392b; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600;">⏳ ${totalSubmitted} chờ</span>` : ''}
            <span class="lesson-toggle-icon" style="font-size:18px; transition:transform 0.3s; ${isCollapsed ? 'transform:rotate(-90deg);' : ''}">▼</span>
          </div>
        </div>
        <div class="lesson-group-body" data-lesson-body="${lessonId}" ${isCollapsed ? 'style="display:none;"' : ''} style="padding:14px; background:#FAFAFA;">
          ${lessonAssigns.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(a => renderAssignmentItem(a)).join('')}
        </div>
      </div>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-lesson-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const lessonId = header.dataset.lessonToggle;
      const body = wrap.querySelector(`[data-lesson-body="${lessonId}"]`);
      const icon = header.querySelector('.lesson-toggle-icon');
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (isHidden) _collapsedLessons.delete(lessonId); else _collapsedLessons.add(lessonId);
      if (icon) icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    });
  });
  wrap.querySelectorAll('[data-publish]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aId = btn.dataset.publish;
      const a = _teacherAsgCache.find(x => x.id === aId);
      if (!confirm(`📢 CÔNG BỐ ĐIỂM đề "${a?.title || ''}"?\n\nHệ thống sẽ TỰ CHẤM lại từ đáp án đã nộp rồi công bố cho HS xem.`)) return;
      try {
        const subSnap = await getDocs(query(collection(db, 'submissions'), where('assignmentId', '==', aId), where('status', '==', 'submitted')));
        const key = await getAnswerKey(aId);
        let gradedNow = 0;
        for (let i = 0; i < subSnap.docs.length; i += 500) {
          const batch = writeBatch(db);
          subSnap.docs.slice(i, i + 500).forEach(sDoc => {
            const s = sDoc.data();
            const upd = { status: 'published', publishedAt: serverTimestamp(), publishedReason: 'manual' };
            if (key && s.answers) {
              const r = gradeAnswers(key, s.answers);
              upd.autoScore = r.score; upd.autoMax = r.max; upd.details = r.details; upd.autoGraded = true;
              gradedNow++;
            }
            batch.update(sDoc.ref, upd);
          });
          await batch.commit();
        }
        await writeAudit('publish', 'assignments/' + aId, { count: subSnap.size, gradedNow });
        toast(`✅ Đã chấm + công bố ${subSnap.size} bài!`, 'success');
        loadTeacherAssignmentsList();
      } catch (err) { toast(mapError(err), 'error'); }
    });
  });
  wrap.querySelectorAll('[data-best-score]').forEach(btn => {
    btn.addEventListener('click', () => {
      const assignment = _teacherAsgCache.find(x => x.id === btn.dataset.bestScore);
      if (assignment) showBestScoreModal(assignment, _gradeSubmissionsCache.filter(s => s.assignmentId === assignment.id));
    });
  });
  wrap.querySelectorAll('[data-toggle-hide]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = _teacherAsgCache.find(x => x.id === btn.dataset.toggleHide);
      if (!a) return;
      try {
        await updateDoc(doc(db, 'assignments', a.id), { hidden: !a.hidden });
        toast(a.hidden ? '👁 Đã hiện đề' : '🙈 Đã ẩn đề', 'success');
        loadTeacherAssignmentsList();
        window.dispatchEvent(new CustomEvent('data:refresh'));
      } catch (err) { toast(mapError(err), 'error'); }
    });
  });
  wrap.querySelectorAll('[data-edit-assignment]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = _teacherAsgCache.find(x => x.id === btn.dataset.editAssignment);
      if (a) await openEditAssignmentModal(a);
    });
  });
  wrap.querySelectorAll('[data-del-assignment]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aId = btn.dataset.delAssignment;
      const a = _teacherAsgCache.find(x => x.id === aId);
      if (!a) return;
      const subCount = a._subCount || 0;
      let msg = `🗑 XOÁ ĐỀ BÀI TẬP\n\n📝 Đề: "${a.title}"\n📚 Khối: ${a.grade}\n\n`;
      msg += subCount > 0
        ? `⚠️ CẢNH BÁO: Đề này có ${subCount} bài làm của HS.\nSẽ xoá luôn TẤT CẢ bài làm + điểm + log.\n❗ Không thể hoàn tác!\n\nBấm OK để tiếp tục.`
        : `Đề này chưa có bài làm nào.\n\nBấm OK để xác nhận xoá.`;
      if (!confirm(msg)) { toast('Đã hủy xoá đề', 'info'); return; }
      if (subCount > 0) {
        const confirmText = prompt(`Gõ chính xác chữ "XOA" (in hoa) để xác nhận lần cuối:`);
        if (confirmText !== 'XOA') { toast('❌ Xác nhận sai. Đã hủy.', 'error'); return; }
      }
      toast('⏳ Đang xoá...', 'info');
      try {
        const subSnap = await getDocs(query(collection(db, 'submissions'), where('assignmentId', '==', aId)));
        for (let i = 0; i < subSnap.docs.length; i += 500) {
          const batch = writeBatch(db);
          subSnap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        const logSnap = await getDocs(query(collection(db, 'viewLogs'), where('assignmentId', '==', aId)));
        for (let i = 0; i < logSnap.docs.length; i += 500) {
          const batch = writeBatch(db);
          logSnap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        await deleteDoc(doc(db, 'assignments', aId));
        toast(`✅ Đã xoá đề + ${subSnap.size} bài làm + ${logSnap.size} log`, 'success');
        loadTeacherAssignmentsList();
        window.dispatchEvent(new CustomEvent('data:refresh'));
      } catch (err) { toast(mapError(err), 'error'); }
    });
  });
  wrap.querySelectorAll('[data-grade-sub]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const s = _gradeSubmissionsCache.find(x => x.id === btn.dataset.gradeSub);
      if (s) await showGradeModal(s, _gradeAssignmentsCache.find(x => x.id === s.assignmentId));
    });
  });
  wrap.querySelectorAll('[data-toggle-stats]').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = wrap.querySelector(`[data-stats-for="${btn.dataset.toggleStats}"]`);
      if (!section) return;
      const isHidden = section.classList.contains('hidden');
      section.classList.toggle('hidden');
      btn.innerHTML = isHidden ? '🙈 Thu gọn' : '👁 Xem chi tiết';
    });
  });
}
function renderAssignmentItem(a) {
  const isExternal = a.mode === 'external';
  const lesson = a.lessonId ? _teacherLessonsCache[a.lessonId] : null;
  const modeBadge = isExternal ? '<span class="badge badge-external">🔗 Luyện tập</span>' : '<span class="badge badge-inline">🎯 Đề có điểm</span>';
  const hiddenBadge = a.hidden ? '<span class="badge badge-hidden"> Đã ẩn</span>' : '';
  const lessonHiddenBadge = lesson?.hidden === true ? '<span class="badge" style="background:#999;color:#FFF;">📖 Bài ẩn</span>' : '';
  const publishBtn = (!isExternal && a._submittedCount > 0)
    ? `<button class="btn btn-secondary btn-sm" data-publish="${a.id}">📢 Công bố (${a._submittedCount})</button>` : '';
  const bestScoreBtn = (!isExternal && a.type === 'quiz' && a._subCount > 0)
    ? `<button class="btn btn-secondary btn-sm" data-best-score="${a.id}">👁 Điểm cao nhất</button>` : '';
  let classBadges = '';
  if (a.assignedAllGrade) classBadges = `<span style="display:inline-block; background:#c0392b; color:#FFF; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:700;"> CẢ KHỐI ${a.grade}</span>`;
  else if (a.assignedClasses && a.assignedClasses.length > 0) classBadges = a.assignedClasses.map(c => `<span style="display:inline-block; background:#8B5A2B; color:#FFF; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; margin-right:4px;">📌 ${esc(c)}</span>`).join('');
  else if (!a.assignedTo || a.assignedTo.length === 0) classBadges = `<span style="display:inline-block; background:#999; color:#FFF; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:700;">⚠️ Chưa giao</span>`;
  let statsSection = '';
  if (isExternal) {
    const logs = _teacherViewLogsCache.filter(v => v.assignmentId === a.id && v.mode === 'external');
    if (logs.length > 0) {
      const byStudent = {};
      logs.forEach(l => {
        if (!byStudent[l.studentId]) byStudent[l.studentId] = { name: l.studentName, cls: l.studentClass, count: 0, totalDur: 0 };
        byStudent[l.studentId].count++;
        byStudent[l.studentId].totalDur += (l.durationSec || 0);
      });
      statsSection = `
        <div class="viewlog-summary">
          <div style="margin-bottom:8px;">📊 <strong>${Object.keys(byStudent).length} HS</strong> đã truy cập • ${logs.length} lượt</div>
          ${Object.values(byStudent).map(st => `<div class="viewlog-row"><span><strong>${esc(st.name)}</strong>${st.cls ? ` — ${esc(st.cls)}` : ''}</span><span>${st.count} lần • ${fmtDuration(st.totalDur)}</span></div>`).join('')}
        </div>`;
    }
  } else if (a.type === 'quiz') {
    const subs = _gradeSubmissionsCache.filter(s => s.assignmentId === a.id);
    if (subs.length > 0) {
      statsSection = subs.map(s => {
        const maxScore = maxOfT(a, s);
        const autoInfo = s.autoScore != null ? `<div class="text-sm" style="color:#004488;">🎯 ${esc(s.autoScore)}/${esc(maxScore)}</div>` : '';
        const statusBadge = {
          in_progress: '<span class="badge badge-inprogress"> Đang làm</span>',
          abandoned: '<span class="badge badge-pending">⚠️ Hủy</span>',
          submitted: '<span class="badge badge-pending">⏳ Chưa công bố</span>',
          published: '<span class="badge badge-published">✅ Đã công bố</span>',
          graded: `<span class="badge badge-graded">Điểm: ${esc(s.score)}/${esc(maxScore)}</span>`
        }[s.status] || '';
        return `
          <div class="submission ${s.status === 'graded' || s.status === 'published' ? 'graded' : ''}">
            <div class="space-between">
              <div>
                <strong>${esc(s.studentName)}</strong>${s.studentClass ? ` — Lớp ${esc(s.studentClass)}` : ''}
                <div class="text-sm">${s.submittedAt ? `Nộp: ${fmtDate(s.submittedAt)}` : ''}</div>
              </div>
              <div style="display:flex; gap:6px;">
                ${statusBadge}
                ${s.status !== 'in_progress' && s.status !== 'abandoned' ? `<button class="btn btn-secondary btn-sm" data-grade-sub="${s.id}">Chấm</button>` : ''}
              </div>
            </div>
            ${autoInfo}
          </div>`;
      }).join('');
    } else statsSection = '<div class="text-sm" style="padding:8px; color:#999; font-style:italic;">Chưa có bài nộp.</div>';
  }
  const extCount = _teacherViewLogsCache.filter(v => v.assignmentId === a.id && v.mode === 'external').length;
  return `<div class="card" style="margin-bottom:12px; ${a.hidden ? 'opacity:0.7; border-left:4px solid #999;' : ''}">
    <div class="space-between">
      <div style="flex:1; min-width:200px;">
        <h3 style="margin-bottom:6px;">📝 ${esc(a.title)}</h3>
        <div class="meta">Khối ${esc(a.grade)} ${isExternal ? `• ${extCount} lượt` : `• ${a._subCount} bài`} ${modeBadge} ${hiddenBadge} ${lessonHiddenBadge}</div>
        <div style="margin-top:6px;">${classBadges}</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${publishBtn}
        ${bestScoreBtn}
        <button class="btn btn-light btn-sm" data-edit-assignment="${a.id}">✏️ Sửa</button>
        <button class="btn btn-light btn-sm" data-toggle-hide="${a.id}">${a.hidden ? '👁 Hiện' : '🙈 Ẩn'}</button>
        <button class="btn btn-danger btn-sm" data-del-assignment="${a.id}"> Xoá</button>
      </div>
    </div>
    <div style="margin-top:10px; padding:10px 14px; background:#F5F5DC; border-radius:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <div class="text-sm" style="color:#8B4513; font-weight:500;">
         <strong>${a._subCount}</strong> bài làm
        ${a._submittedCount > 0 ? `• <strong style="color:#c0392b;">${a._submittedCount}</strong> chờ công bố` : ''}
        ${a._gradedCount > 0 ? `• <strong style="color:#2E7D32;">${a._gradedCount}</strong> đã chấm` : ''}
        ${isExternal ? `• ${extCount} lượt mở` : ''}
      </div>
      ${statsSection ? `<button class="btn btn-light btn-sm" data-toggle-stats="${a.id}"> Xem chi tiết</button>` : ''}
    </div>
    ${statsSection ? `<div class="stats-section hidden" data-stats-for="${a.id}" style="margin-top:10px;">${statsSection}</div>` : ''}
  </div>`;
}

async function showBestScoreModal(assignment, subs) {
  const maxScore = maxOfT(assignment, subs[0]);
  const byStudent = {};
  subs.forEach(s => {
    if (s.status === 'in_progress' || s.status === 'abandoned') return;
    if (!byStudent[s.studentId]) byStudent[s.studentId] = { name: s.studentName, cls: s.studentClass || '', attempts: [] };
    const score = s.score != null ? s.score : (s.autoScore != null ? s.autoScore : null);
    if (score !== null) byStudent[s.studentId].attempts.push({ score, submittedAt: s.submittedAt });
  });
  const students = Object.values(byStudent).map(st => {
    st.attempts.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
    return { ...st, bestScore: Math.max(...st.attempts.map(a => a.score)) };
  });
  students.sort((a, b) => b.bestScore - a.bestScore);
  const scores = students.map(s => s.bestScore);
  const avgScore = scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 100) / 100 : 0;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal modal-large">
    <div class="space-between mb-2">
      <h2>🏆 Điểm cao nhất trong các lần làm</h2>
      <button class="btn btn-light btn-sm" id="bestScoreCloseBtn">✖ Đóng</button>
    </div>
    <div class="detail-header">
      <div class="info"><h2>${esc(assignment.title)}</h2><div class="meta">Khối ${esc(assignment.grade)} • Điểm tối đa: ${maxScore}</div></div>
      <div class="score-box"><div class="score">${students.length}</div><div class="label">HS đã làm</div></div>
    </div>
    <div class="stats-summary">
      <span class="item">📊 Điểm TB: <strong>${avgScore}/${maxScore}</strong></span>
      <span class="item">🏆 Cao nhất: <strong>${scores.length ? Math.max(...scores) : 0}/${maxScore}</strong></span>
      <span class="item">📉 Thấp nhất: <strong>${scores.length ? Math.min(...scores) : 0}/${maxScore}</strong></span>
    </div>
    <div style="overflow-x:auto;">
      <table class="stats-table">
        <thead><tr>
          <th style="width:40px;">STT</th><th style="text-align:left; min-width:180px;">Họ và tên</th><th style="width:80px;">Lớp</th>
          <th style="min-width:100px;">Điểm cao nhất</th><th style="min-width:80px;">Số lần</th><th style="min-width:200px;">Chi tiết</th>
        </tr></thead>
        <tbody>
          ${students.map((st, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td class="student-name">${esc(st.name)}</td>
              <td class="class-col">${esc(st.cls || '—')}</td>
              <td class="score-cell ${idx === 0 ? 'best-score' : ''}">${st.bestScore}/${maxScore}</td>
              <td>${st.attempts.length}/${assignment.maxAttempts || 3}</td>
              <td style="text-align:left; font-size:12px;">
                ${st.attempts.map((att, i) => `<span style="display:inline-block; margin-right:8px; ${att.score === st.bestScore ? 'color:#0066CC; font-weight:700;' : 'color:#555;'}">Lần ${st.attempts.length - i}: ${att.score}${att.score === st.bestScore ? ' 🏆' : ''}</span>`).join('')}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#bestScoreCloseBtn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function showGradeModal(s, a) {
  const existing = $('gradeModal');
  if (existing) existing.remove();
  if (s.autoScore == null && s.answers) {
    const key = await getAnswerKey(s.assignmentId);
    if (key) {
      const r = gradeAnswers(key, s.answers);
      try {
        await updateDoc(doc(db, 'submissions', s.id), { autoScore: r.score, autoMax: r.max, details: r.details, autoGraded: true });
        s.autoScore = r.score; s.autoMax = r.max; s.details = r.details;
      } catch (e) {}
    }
  }
  const maxScore = maxOfT(a, s);
  const modal = document.createElement('div');
  modal.id = 'gradeModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal modal-large">
    <div class="modal-header">
      <h2>🎯 Chấm bài</h2>
      <button class="btn btn-light btn-sm" id="gradeCloseBtn">✖ Đóng</button>
    </div>
    <div id="gradeInfo"></div>
    <div class="grade-inputs">
      <div class="form-group">
        <label>Điểm GV chấm (0 → ${maxScore})</label>
        <input type="number" id="gradeScore" min="0" max="${maxScore}" step="0.25" inputmode="decimal" value="${s.score ?? (s.autoScore ?? '')}" />
      </div>
      <div class="form-group"><label>Nhận xét</label><textarea id="gradeComment">${esc(s.comment || '')}</textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-light" id="gradeCancelBtn">Hủy</button>
      <button class="btn btn-primary" id="gradeSaveBtn">💾 Lưu điểm</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  let body = `
    <div class="detail-header">
      <div class="info">
        <h2>${esc(s.studentName)}</h2>
        <div class="meta">${s.studentClass ? `Lớp ${esc(s.studentClass)} • ` : ''}📅 ${fmtDate(s.submittedAt || s.startedAt)}${s.timeSpent ? ` •  ${Math.floor(s.timeSpent / 60)}p ${s.timeSpent % 60}s` : ''}</div>
      </div>
      <div class="score-box">
        <div class="score">${esc(s.autoScore != null ? s.autoScore : '?')}/${esc(maxScore)}</div>
        <div class="label">Điểm hệ thống chấm</div>
      </div>
    </div>`;
  if (s.isLate) body += `<div class="alert alert-error">️ HS nộp trễ</div>`;
  if (s.isTimeout) body += `<div class="alert alert-warn">⏱ Hết giờ — tự nộp</div>`;
  const review = renderReviewHtml(s, a ? getPublicQuestions(a) : []);
  if (review) body += review;
  modal.querySelector('#gradeInfo').innerHTML = body;
  const closeModal = () => modal.remove();
  modal.querySelector('#gradeCloseBtn').addEventListener('click', closeModal);
  modal.querySelector('#gradeCancelBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modal.querySelector('#gradeSaveBtn').addEventListener('click', async () => {
    const score = Number(modal.querySelector('#gradeScore').value);
    const comment = modal.querySelector('#gradeComment').value.trim();
    if (isNaN(score) || score < 0) { toast(`Điểm phải từ 0 đến ${maxScore}`, 'error'); return; }
    if (score > maxScore) { toast(`Điểm không được vượt quá ${maxScore}`, 'error'); return; }
    const saveBtn = modal.querySelector('#gradeSaveBtn');
    saveBtn.disabled = true; saveBtn.textContent = '⏳ Đang lưu...';
    try {
      await updateDoc(doc(db, 'submissions', s.id), {
        score, comment, status: 'graded',
        gradedAt: serverTimestamp(), gradedBy: state.currentUser.uid
      });
      await writeAudit('grade', 'submissions/' + s.id, { changed: { score: { from: s.score ?? null, to: score } } });
      toast(`✅ Đã lưu! Điểm: ${score}/${maxScore}`, 'success');
      closeModal();
      loadTeacherAssignmentsList();
    } catch (err) {
      toast(mapError(err), 'error');
      saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu điểm';
    }
  });
}

async function openEditAssignmentModal(assignment) {
  editingAssignmentId = assignment.id;
  const editGrid = classGridState.edit;
  editGrid.selected = new Set(assignment.assignedClasses || []);
  editGrid.allGrade = assignment.assignedAllGrade === true;
  editGrid.currentGrade = assignment.grade || '10';
  await loadAvailableClasses();
  const lessonsInGrade = Object.values(_teacherLessonsCache).filter(l => l.grade === assignment.grade).sort((a, b) => (a.order || 0) - (b.order || 0));
  const subCount = assignment._subCount || 0;
  const gradedCount = assignment._gradedCount || 0;
  const assignedToCount = (assignment.assignedTo || []).length;
  const existing = $('editAssignmentModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'editAssignmentModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
  <div class="modal modal-large" style="max-width: 800px;">
    <div class="modal-header">
      <h2>✏️ Sửa Đề Bài Tập</h2>
      <button class="btn btn-light btn-sm" data-close-edit-ass>✖ Đóng</button>
    </div>
    <div class="alert alert-info">ℹ️ <strong>Chỉ sửa thông tin đề</strong> (tiêu đề, hạn nộp, giao lớp...).<br>🚫 <strong>Không sửa nội dung câu hỏi</strong> để tránh lệch bài làm cũ.</div>
    ${subCount > 0 ? `<div class="alert alert-warn">⚠️ Đề đã có <strong>${subCount}</strong> bài làm (${gradedCount} đã chấm). Sửa metadata KHÔNG ảnh hưởng bài cũ.</div>` : ''}
    <div class="form-group"><label>Tiêu đề đề bài</label><input id="editAssTitle" value="${esc(assignment.title || '')}" /></div>
    <div class="row">
      <div class="form-group" style="flex:1; min-width:200px;">
        <label>Khối lớp (không đổi)</label>
        <input value="${assignment.grade === '10' ? 'Vật Lý 10' : assignment.grade === '11' ? 'Vật Lý 11' : 'Vật Lý 12'}" disabled />
      </div>
      <div class="form-group" style="flex:2; min-width:250px;">
        <label>Thuộc bài học</label>
        <select id="editAssLesson">
          <option value="">-- Không thuộc bài học nào --</option>
          ${lessonsInGrade.map(l => `<option value="${l.id}" ${l.id === assignment.lessonId ? 'selected' : ''}>${esc(l.name)}${l.hidden ? ' (ẩn)' : ''}</option>`).join('')}
        </select>
      </div>
    </div>
    ${assignment.type === 'quiz' ? `
      <div class="row">
        <div class="form-group" style="flex:1;"><label>⏱ Thời gian (phút)</label><input type="number" id="editAssDuration" value="${assignment.duration || 25}" min="1" max="180" /></div>
        <div class="form-group" style="flex:1;"><label>Số lượt tối đa</label><input type="number" id="editAssMaxAttempts" value="${assignment.maxAttempts || 3}" min="1" max="10" /></div>
      </div>` : `
      <div class="row">
        <div class="form-group" style="flex:1;"><label>Số lần mở tối đa</label><input type="number" id="editAssMaxAttempts" value="${assignment.maxAttempts || 0}" min="0" max="100" /></div>
      </div>`}
    <div class="row">
      <div class="form-group" style="flex:1;"><label>Hạn nộp</label><input type="date" id="editAssDeadline" value="${esc(assignment.deadline || '')}" /></div>
      <div class="form-group" style="flex:1; display:flex; align-items:end;">
        <label class="toggle-switch" style="padding:10px 0;">
          <input type="checkbox" id="editAssHidden" ${assignment.hidden ? 'checked' : ''} />
          <span class="toggle-slider"></span>
          <span style="font-weight:600;">🙈 Ẩn đề</span>
        </label>
      </div>
    </div>
    <div class="form-group" style="margin-top:14px;">
      <label class="form-label-bold">🎯 Giao bài cho ai?</label>
      <div class="class-grid-wrap">
        <div class="class-grid-tabs">
          <button type="button" class="edit-class-grid-tab class-grid-tab ${editGrid.currentGrade === '10' ? 'active' : ''}" data-edit-grade="10">Khối 10 <span class="tab-count" id="editClassTabCount10">0</span></button>
          <button type="button" class="edit-class-grid-tab class-grid-tab ${editGrid.currentGrade === '11' ? 'active' : ''}" data-edit-grade="11">Khối 11 <span class="tab-count" id="editClassTabCount11">0</span></button>
          <button type="button" class="edit-class-grid-tab class-grid-tab ${editGrid.currentGrade === '12' ? 'active' : ''}" data-edit-grade="12">Khối 12 <span class="tab-count" id="editClassTabCount12">0</span></button>
        </div>
        <label class="grade-all-checkbox" id="editAssignGradeAllWrap">
          <input type="checkbox" id="editAssignGradeAll" />
          <span class="gac-label">🌐 Giao cho CẢ KHỐI <span id="editAssignGradeAllCount" style="color:#c0392b;">0 HS</span></span>
        </label>
        <div class="class-grid-toolbar">
          <span class="toolbar-label">Hoặc tick các lớp cụ thể:</span>
          <div class="toolbar-actions">
            <button type="button" id="editClassGridSelectAll">✓ Tất cả</button>
            <button type="button" id="editClassGridDeselectAll">✗ Bỏ chọn</button>
          </div>
        </div>
        <div class="class-grid-body" id="editClassGridBody"><div class="class-grid-empty">Đang tải...</div></div>
        <div class="class-selected-summary">
          <span class="summary-label"> Sẽ giao cho:</span>
          <div class="summary-list" id="editClassSelectedList"><span class="empty-hint">Chưa chọn lớp nào</span></div>
        </div>
      </div>
    </div>
    <div class="form-group" style="margin-top:14px;">
      <label style="font-size:13px;">Giao riêng cho HS (theo email, cách nhau dấu phẩy)</label>
      <input id="editAssAssignEmails" placeholder="VD: hs1@gmail.com" value="${esc((assignment.assignedEmails || []).join(', '))}" />
      <div class="hint">Hiện có <strong>${assignedToCount}</strong> HS được giao riêng.${assignedToCount > 0 ? '<br>⚠️ Để trống → bỏ giao các HS này.' : ''}</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-light" data-close-edit-ass>Hủy</button>
      <button class="btn btn-primary" id="editAssSaveBtn">💾 Lưu thay đổi</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  bindEditClassGridEvents();
  setTimeout(() => { modal.querySelector('.edit-class-grid-tab.active')?.click(); }, 50);
  modal.querySelectorAll('[data-close-edit-ass]').forEach(b => b.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#editAssSaveBtn').addEventListener('click', async () => {
    const saveBtn = modal.querySelector('#editAssSaveBtn');
    saveBtn.disabled = true; saveBtn.textContent = ' Đang lưu...';
    try {
      const newTitle = modal.querySelector('#editAssTitle').value.trim();
      if (!newTitle) { toast('Vui lòng nhập tiêu đề', 'error'); saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thay đổi'; return; }
      const newLessonId = modal.querySelector('#editAssLesson').value;
      const newLesson = _teacherLessonsCache[newLessonId] || null;
      const emailsStr = modal.querySelector('#editAssAssignEmails').value.trim();
      let assignedTo = [], assignedEmails = [];
      if (emailsStr) {
        const emails = emailsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const uSnap = await getDocs(collection(db, 'users'));
        const foundUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => emails.includes((u.email || '').toLowerCase()));
        assignedTo = foundUsers.map(u => u.id);
        assignedEmails = foundUsers.map(u => u.email);
      }
      if (editGrid.selected.size === 0 && !editGrid.allGrade && assignedTo.length === 0) {
        if (!confirm('⚠️ Bạn KHÔNG giao đề cho ai cả. Tiếp tục?')) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thay đổi'; return; }
      }
      const payload = {
        title: newTitle,
        lessonId: newLessonId || null,
        lessonHidden: newLesson ? newLesson.hidden === true : false,
        deadline: modal.querySelector('#editAssDeadline').value,
        hidden: modal.querySelector('#editAssHidden').checked,
        assignedAllGrade: editGrid.allGrade,
        assignedClasses: editGrid.allGrade ? [] : Array.from(editGrid.selected).sort(),
        assignedTo, assignedEmails,
        updatedAt: serverTimestamp()
      };
      if (assignment.type === 'quiz') payload.duration = Number(modal.querySelector('#editAssDuration')?.value) || 25;
      const newMax = Number(modal.querySelector('#editAssMaxAttempts')?.value);
      if (newMax >= 0) payload.maxAttempts = newMax;
      await updateDoc(doc(db, 'assignments', assignment.id), payload);
      toast('✅ Đã cập nhật đề!', 'success');
      modal.remove();
      editingAssignmentId = null;
      loadTeacherAssignmentsList();
      window.dispatchEvent(new CustomEvent('data:refresh'));
    } catch (err) {
      toast(mapError(err), 'error');
      saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thay đổi';
    }
  });
}