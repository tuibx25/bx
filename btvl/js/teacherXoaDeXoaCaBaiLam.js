import {
  db, collection, addDoc, getDocs, doc, deleteDoc, updateDoc,
  query, where, getDoc, setDoc, serverTimestamp, writeBatch
} from './firebase-init.js';
import { state } from './state.js';
import { $, show, hide, esc, toast, fmtDate, fmtDuration, getGradeFromClass } from './utils.js';
import { parseQuestionsHtml } from './quiz.js';
import {
  loadAvailableClasses, bindClassGridEvents, bindEditClassGridEvents,
  bindNotifClassGridEvents, classGridState, resetClassGrid
} from './class-grid.js';

// ⭐ Tên hiển thị của người gửi thông báo
const ADMIN_DISPLAY_NAME = 'Admin';

let editingAssignmentId = null;
let _lessonsForSelect = [];
let currentLessonSelectSearch = '';
let currentLessonSelectOpen = false;

// ⭐ Cache danh sách lớp có HS
let _allClassesCache = null;

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
export function initTeacher() {
  // Nothing global
}

// ══════════════════════════════════════════
// TEACHER TAB
// ══════════════════════════════════════════
export function renderTeacherTab() {
  const tab = $('tab-teacher');
  if (!tab) return;
  if (tab.innerHTML.includes('Thêm Bài Học')) return;

  tab.innerHTML = `
    <div class="card" style="border-left: 5px solid #0066CC;">
      <h3>⚙️ Cài Đặt Hệ Thống</h3>
      <div class="form-group" style="padding:12px; background:#F5F5F5; border-radius:6px; margin-bottom:8px;">
        <label class="toggle-switch">
          <input type="checkbox" id="allowChangeClassToggle" />
          <span class="toggle-slider"></span>
          <span style="font-weight:600;">🔓 Cho phép HS tự đổi lớp</span>
        </label>
        <div class="hint" style="margin-top:8px;">
          💡 Bật khi đầu năm học để HS cập nhật lớp mới (VD: 10a12 → 11a12).
        </div>
      </div>
    </div>

    <div class="card">
      <div class="space-between mb-2">
        <h3>📖 Quản Lý Bài Học</h3>
        <button class="btn btn-primary btn-sm" id="showAddLessonBtn">➕ Thêm Bài Học</button>
      </div>
      <div class="hint" style="margin-bottom:10px; color:#666;">
        💡 Nút <strong>👁 Ẩn</strong> sẽ ẩn bài học khỏi HS. HS sẽ không thấy bài học đó và <strong>tất cả đề thuộc bài đó</strong>.
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
                <div class="ss-search-wrap">
                  <input type="text" class="ss-search" id="addLessonSearch" placeholder="🔍 Tìm bài học..." />
                </div>
                <div class="ss-options" id="addLessonOptions"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Tiêu đề đề bài</label>
          <input id="addTitle" placeholder="VD: Đề 1: Trắc nghiệm" />
        </div>

        <div class="form-group">
          <label>⭐ Loại đề</label>
          <div class="mode-toggle">
            <div class="mode-option selected" data-mode="inline">
              <div class="mode-title">🎯 Đề nhập trực tiếp</div>
              <div class="mode-desc">Dán HTML câu hỏi → HS làm trên web → Chấm điểm tự động</div>
            </div>
            <div class="mode-option" data-mode="external">
              <div class="mode-title">🔗 Đề file ngoài</div>
              <div class="mode-desc">Nhập URL file HTML → HS mở tab mới luyện tập</div>
            </div>
          </div>
          <input type="hidden" id="addMode" value="inline" />
        </div>

        <div id="inlineFields">
          <div class="alert alert-info">
            💡 Dán HTML câu hỏi vào ô bên dưới.
          </div>
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
            <div class="form-group" style="flex:1;">
              <label>⏱ Thời gian (phút)</label>
              <input type="number" id="addQuizDuration" value="25" min="1" max="180" />
            </div>
            <div class="form-group" style="flex:1;">
              <label>Số lượt tối đa</label>
              <input type="number" id="addQuizMaxAttempts" value="3" min="1" max="10" />
            </div>
          </div>
        </div>

        <div id="externalFields" class="hidden">
          <div class="form-group">
            <label>🔗 URL file HTML</label>
            <input id="addExternalUrl" placeholder="https://..." />
          </div>
          <div class="row">
            <div class="form-group" style="flex:1;">
              <label>Số lần mở tối đa (0 = không giới hạn)</label>
              <input type="number" id="addExternalMaxAttempts" value="0" min="0" max="100" />
            </div>
            <div class="form-group" style="flex:1;">
              <label>Mô tả ngắn</label>
              <input id="addExternalDesc" />
            </div>
          </div>
        </div>

        <div class="row" style="margin-top:14px;">
          <div class="form-group" style="flex:1;">
            <label>Hạn nộp</label>
            <input type="date" id="addDeadline" />
          </div>
        </div>

        <div class="form-group" style="margin-top:14px;">
          <label class="form-label-bold">🎯 Giao bài cho ai?</label>
          <div class="hint" style="margin-bottom:10px; color:#555;">
            Tick <strong>"Cả khối"</strong> để giao cho TẤT CẢ HS của khối đang chọn.
          </div>

          <div class="class-grid-wrap">
            <div class="class-grid-tabs">
              <button type="button" class="class-grid-tab active" data-grade="10">
                Khối 10 <span class="tab-count" id="classTabCount10">0</span>
              </button>
              <button type="button" class="class-grid-tab" data-grade="11">
                Khối 11 <span class="tab-count" id="classTabCount11">0</span>
              </button>
              <button type="button" class="class-grid-tab" data-grade="12">
                Khối 12 <span class="tab-count" id="classTabCount12">0</span>
              </button>
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
            <div class="class-grid-body" id="classGridBody">
              <div class="class-grid-empty">Đang tải...</div>
            </div>
            <div class="class-selected-summary">
              <span class="summary-label">📌 Sẽ giao cho:</span>
              <div class="summary-list" id="classSelectedList">
                <span class="empty-hint">Chưa chọn lớp nào</span>
              </div>
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
      <div id="notificationsList" style="border:1px solid #E0E0E0; border-radius:8px; overflow:hidden;">
        <div class="empty">Đang tải...</div>
      </div>
    </div>

    <div class="card">
      <h3>📊 Thống Kê Điểm</h3>
      <div id="statsPanel">
        <div class="stats-filters">
          <div>
            <label>Khối:</label>
            <select id="statsGrade">
              <option value="10">Vật Lý 10</option>
              <option value="11">Vật Lý 11</option>
              <option value="12">Vật Lý 12</option>
            </select>
          </div>
          <div>
            <label>Lớp:</label>
            <select id="statsClass">
              <option value="">-- Tất cả lớp --</option>
            </select>
          </div>
          <div>
            <label>Bài học:</label>
            <select id="statsLesson">
              <option value="">-- Tất cả bài --</option>
            </select>
          </div>
          <div>
            <label>📝 Đề:</label>
            <select id="statsAssignment">
              <option value="">-- Chọn đề --</option>
            </select>
          </div>
          <div>
            <label>🔍 Tìm HS:</label>
            <input type="text" id="statsSearchStudent" placeholder="Nhập tên HS..." />
          </div>
          <button class="btn btn-primary btn-sm" id="loadStatsBtn">🔄 Xem thống kê</button>
          <button class="btn btn-success btn-sm" id="exportStatsBtn" disabled>📥 Xuất Excel</button>
        </div>
        <div id="statsResult">
          <div class="empty">Bấm "🔄 Xem thống kê" để xem bảng điểm.</div>
        </div>
      </div>
    </div>

    <div class="card" style="border-left: 5px solid #c0392b;">
      <h3 style="color: #c0392b;">⚠️ Xoá Dữ Liệu Cuối Năm</h3>
      <p class="text-sm" style="margin-bottom: 12px;">
        Xoá <strong>toàn bộ bài làm và điểm</strong> của HS.
      </p>
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
    toggleEl.addEventListener('change', async () => {
      await saveGlobalSettings({ allowChangeClass: toggleEl.checked });
    });
  }

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
      const mode = opt.dataset.mode;
      $('addMode').value = mode;
      if (mode === 'inline') {
        show($('inlineFields')); hide($('externalFields'));
      } else {
        hide($('inlineFields')); show($('externalFields'));
      }
    });
  });

  $('previewQuestionsBtn')?.addEventListener('click', previewQuestions);
  $('addAssignmentBtn')?.addEventListener('click', addAssignment);
  $('clearSubmissionsBtn')?.addEventListener('click', clearAllSubmissions);
  $('viewDataStatsBtn')?.addEventListener('click', showDataStats);

  $('loadStatsBtn')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('load:stats'));
  });
  $('exportStatsBtn')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('export:stats'));
  });
  $('statsGrade')?.addEventListener('change', () => {
    loadStatsClassesAndLessons();
    window.dispatchEvent(new CustomEvent('update:stats-assignment'));
  });
  $('statsClass')?.addEventListener('change', () => {
    window.dispatchEvent(new CustomEvent('update:stats-assignment'));
  });
  $('statsLesson')?.addEventListener('change', () => {
    window.dispatchEvent(new CustomEvent('update:stats-assignment'));
  });
}

// ══════════════════════════════════════════
// SAVE SETTINGS
// ══════════════════════════════════════════
async function saveGlobalSettings(partial) {
  if (state.currentProfile?.role !== 'teacher') {
    toast('Chỉ GV mới đổi được cài đặt', 'error');
    return;
  }
  try {
    await setDoc(doc(db, 'settings', 'system'), {
      ...state.globalSettings,
      ...partial,
      updatedAt: serverTimestamp(),
      updatedBy: state.currentUser.uid
    }, { merge: true });
    state.globalSettings = { ...state.globalSettings, ...partial };
    toast('✅ Đã lưu cài đặt', 'success');
  } catch (e) {
    toast('Lỗi: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════
// LESSONS — có nút Ẩn/Hiện
// ══════════════════════════════════════════
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
    assignments.forEach(a => {
      if (a.lessonId) {
        assignmentCountByLesson[a.lessonId] = (assignmentCountByLesson[a.lessonId] || 0) + 1;
      }
    });

    _lessonsForSelect = lessons;

    if (lessons.length === 0) {
      wrap.innerHTML = '<div class="empty">Chưa có bài học nào.</div>';
      return;
    }

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
                    <div class="ltr-name">
                      ${esc(l.name)}
                      ${isHidden ? '<span class="badge badge-hidden" style="margin-left:6px;">🙈 Đã ẩn</span>' : ''}
                    </div>
                    ${l.description ? `<div class="ltr-desc">${esc(l.description)}</div>` : ''}
                  </div>
                  <div class="ltr-badges">
                    <span class="ltr-badge ${assignCount > 0 ? 'has-assign' : ''}">${assignCount} đề</span>
                  </div>
                  <div class="ltr-actions">
                    <button class="btn-icon btn-icon-edit" data-toggle-lesson-hide="${l.id}" title="${isHidden ? 'Hiện bài' : 'Ẩn bài'}" style="background:${isHidden ? '#F5DEB3' : '#F0F0F0'};">
                      ${isHidden ? '👁' : '🙈'}
                    </button>
                    <button class="btn-icon btn-icon-edit" data-edit-lesson="${l.id}" title="Sửa">✏️</button>
                    <button class="btn-icon btn-icon-danger" data-del-lesson="${l.id}" title="Xoá">🗑</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-grade-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        const body = header.nextElementSibling;
        if (body) body.classList.toggle('collapsed');
      });
    });

    // ⭐ Nút Ẩn/Hiện bài học
    wrap.querySelectorAll('[data-toggle-lesson-hide]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const lessonId = btn.dataset.toggleLessonHide;
        const lesson = lessons.find(l => l.id === lessonId);
        if (!lesson) return;

        const newHidden = !lesson.hidden;
        const assignCount = assignmentCountByLesson[lessonId] || 0;

        let msg = newHidden
          ? `Ẩn bài học "${lesson.name}"?`
          : `Hiện bài học "${lesson.name}"?`;

        if (newHidden && assignCount > 0) {
          msg += `\n\n⚠️ HS sẽ KHÔNG thấy bài học này và ${assignCount} đề thuộc bài này nữa.`;
        }

        if (!confirm(msg)) return;

        try {
          await updateDoc(doc(db, 'lessons', lessonId), {
            hidden: newHidden,
            updatedAt: serverTimestamp()
          });
          toast(newHidden ? '🙈 Đã ẩn bài học' : '👁 Đã hiện bài học', 'success');
          loadLessonsForTeacher();
          window.dispatchEvent(new CustomEvent('data:refresh'));
        } catch (err) {
          toast('Lỗi: ' + err.message, 'error');
        }
      });
    });

    // ⭐ Nút Xoá bài học — chỉ xoá lesson, không xoá đề con
    wrap.querySelectorAll('[data-del-lesson]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const lessonId = btn.dataset.delLesson;
        const lesson = lessons.find(l => l.id === lessonId);
        if (!lesson) return;

        const assignCount = assignmentCountByLesson[lessonId] || 0;

        let msg = `🗑 XOÁ BÀI HỌC\n\n`;
        msg += `📖 Bài: "${lesson.name}"\n`;
        msg += `📚 Khối: ${lesson.grade}\n\n`;

        if (assignCount > 0) {
          msg += `⚠️ Bài học này đang có ${assignCount} đề bài tập.\n`;
          msg += `Sau khi xoá, các đề vẫn được giữ nhưng sẽ chuyển sang mục "Chưa phân loại".\n\n`;
          msg += `💡 Nếu muốn xoá luôn đề + bài làm, hãy vào tab "📋 Đề & Bài Làm".`;
        }

        msg += `\nBấm OK để xác nhận xoá bài học.`;

        if (!confirm(msg)) {
          toast('Đã hủy xoá bài học', 'info');
          return;
        }

        try {
          await deleteDoc(doc(db, 'lessons', lessonId));
          toast('✅ Đã xoá bài học', 'success');
          loadLessonsForTeacher();
          window.dispatchEvent(new CustomEvent('data:refresh'));
        } catch (err) {
          toast('Lỗi: ' + err.message, 'error');
        }
      });
    });

    wrap.querySelectorAll('[data-edit-lesson]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lessonId = btn.dataset.editLesson;
        const lesson = lessons.find(l => l.id === lessonId);
        if (!lesson) return;
        openEditLessonModal(lesson);
      });
    });
  } catch (err) {
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

function openEditLessonModal(lesson) {
  const existing = $('editLessonModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'editLessonModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <button class="modal-close-x" data-close-edit-lesson>✖</button>
      <h2>✏️ Sửa Bài Học</h2>
      <div class="form-group">
        <label>Khối lớp</label>
        <select id="editLessonGrade">
          <option value="10" ${lesson.grade === '10' ? 'selected' : ''}>Vật Lý 10</option>
          <option value="11" ${lesson.grade === '11' ? 'selected' : ''}>Vật Lý 11</option>
          <option value="12" ${lesson.grade === '12' ? 'selected' : ''}>Vật Lý 12</option>
        </select>
      </div>
      <div class="form-group">
        <label>Tên bài học</label>
        <input id="editLessonName" value="${esc(lesson.name || '')}" />
      </div>
      <div class="form-group">
        <label>Mô tả</label>
        <textarea id="editLessonDesc">${esc(lesson.description || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-light" data-close-edit-lesson>Hủy</button>
        <button class="btn btn-primary" id="editLessonSave">💾 Lưu</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close-edit-lesson]').forEach(b => {
    b.addEventListener('click', () => modal.remove());
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  modal.querySelector('#editLessonSave').addEventListener('click', async () => {
    const newGrade = modal.querySelector('#editLessonGrade').value;
    const newName = modal.querySelector('#editLessonName').value.trim();
    const newDesc = modal.querySelector('#editLessonDesc').value.trim();

    if (!newName) {
      toast('Vui lòng nhập tên bài học', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'lessons', lesson.id), {
        grade: newGrade,
        name: newName,
        description: newDesc,
        updatedAt: serverTimestamp()
      });
      toast('✅ Đã cập nhật bài học', 'success');
      modal.remove();
      loadLessonsForTeacher();
      window.dispatchEvent(new CustomEvent('data:refresh'));
    } catch (err) {
      toast('Lỗi: ' + err.message, 'error');
    }
  });
}

// ══════════════════════════════════════════
// ADD LESSON MODAL
// ══════════════════════════════════════════
export function initAddLessonModal() {
  $('addLessonCancel')?.addEventListener('click', () => hide($('addLessonModal')));

  $('addLessonConfirm')?.addEventListener('click', async () => {
    const grade = $('lessonGrade').value;
    const name = $('lessonName').value.trim();
    const description = $('lessonDesc').value.trim();

    if (!name) {
      toast('Nhập tên bài học', 'error');
      return;
    }

    try {
      const lq = query(collection(db, 'lessons'), where('grade', '==', grade));
      const lSnap = await getDocs(lq);
      const order = lSnap.size + 1;

      await addDoc(collection(db, 'lessons'), {
        grade, name, description, order,
        hidden: false,
        teacherId: state.currentUser.uid,
        createdAt: serverTimestamp()
      });

      hide($('addLessonModal'));
      toast('✅ Đã thêm bài học!', 'success');
      loadLessonsForTeacher();
      window.dispatchEvent(new CustomEvent('data:refresh'));
    } catch (err) {
      toast('Lỗi: ' + err.message, 'error');
    }
  });

  const modal = $('addLessonModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hide($('addLessonModal'));
    });
  }
}

// ══════════════════════════════════════════
// LESSON SEARCHABLE SELECT
// ══════════════════════════════════════════
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateLessonSelectOptions(lessons) {
  const optionsEl = $('addLessonOptions');
  if (!optionsEl) return;

  const search = currentLessonSelectSearch.toLowerCase().trim();
  const selectedId = $('addLesson')?.value || '';
  const selectedGrade = $('addGrade')?.value || '';

  let lessonsToShow = lessons;
  if (selectedGrade && /^(10|11|12)$/.test(selectedGrade)) {
    lessonsToShow = lessons.filter(l => l.grade === selectedGrade);
  }

  const byGrade = { 10: [], 11: [], 12: [] };
  lessonsToShow.forEach(l => { if (byGrade[l.grade]) byGrade[l.grade].push(l); });

  let html = '';
  let totalVisible = 0;

  [10, 11, 12].forEach(g => {
    const lessonsInGrade = byGrade[g] || [];
    const filtered = search
      ? lessonsInGrade.filter(l => (l.name || '').toLowerCase().includes(search))
      : lessonsInGrade;

    if (filtered.length === 0) return;

    if (!selectedGrade || !/^(10|11|12)$/.test(selectedGrade)) {
      html += `<div class="ss-group-header">── KHỐI ${g} (${filtered.length} bài) ──</div>`;
    }

    filtered.forEach(l => {
      const allInGrade = lessons.filter(x => x.grade === l.grade);
      const idx = allInGrade.indexOf(l) + 1;
      const isSelected = l.id === selectedId;
      let nameHtml = esc(l.name || '');
      if (search) {
        const regex = new RegExp(`(${escapeRegex(search)})`, 'gi');
        nameHtml = nameHtml.replace(regex, '<mark>$1</mark>');
      }
      html += `
        <div class="ss-option ${isSelected ? 'selected' : ''}" data-lesson-id="${l.id}">
          <span class="ss-num">${idx}.</span>
          <span>${nameHtml}${l.hidden ? ' <span style="color:#999;font-size:11px;">(ẩn)</span>' : ''}</span>
        </div>
      `;
      totalVisible++;
    });
  });

  if (totalVisible === 0) {
    if (selectedGrade && /^(10|11|12)$/.test(selectedGrade)) {
      optionsEl.innerHTML = search
        ? `<div class="ss-empty">🔍 Không tìm thấy bài "${esc(search)}"</div>`
        : `<div class="ss-empty">📭 Khối ${selectedGrade} chưa có bài học nào.</div>`;
    } else {
      optionsEl.innerHTML = '<div class="ss-empty">📭 Chưa có bài học nào</div>';
    }
    return;
  }

  optionsEl.innerHTML = html;

  optionsEl.querySelectorAll('.ss-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const lessonId = opt.dataset.lessonId;
      const lesson = lessons.find(l => l.id === lessonId);
      if (!lesson) return;
      selectLesson(lesson);
    });
  });
}

function selectLesson(lesson) {
  const hiddenInput = $('addLesson');
  const displayInput = $('addLessonDisplay');
  const clearBtn = $('addLessonClear');
  const dropdown = $('addLessonDropdown');

  if (hiddenInput) hiddenInput.value = lesson.id;
  if (displayInput) {
    displayInput.value = `Khối ${lesson.grade}: ${lesson.name}`;
    displayInput.classList.add('has-value');
  }
  if (clearBtn) clearBtn.style.display = 'flex';
  if (dropdown) dropdown.classList.add('hidden');

  currentLessonSelectOpen = false;
  currentLessonSelectSearch = '';

  const gradeSelect = $('addGrade');
  if (gradeSelect && lesson.grade && gradeSelect.value !== lesson.grade) {
    gradeSelect.value = lesson.grade;
  }
}

function clearLessonSelection() {
  const hiddenInput = $('addLesson');
  const displayInput = $('addLessonDisplay');
  const clearBtn = $('addLessonClear');

  if (hiddenInput) hiddenInput.value = '';
  if (displayInput) {
    displayInput.value = '';
    displayInput.placeholder = '-- Chọn bài học --';
    displayInput.classList.remove('has-value');
  }
  if (clearBtn) clearBtn.style.display = 'none';
}

function bindLessonSearchableSelect() {
  const ssWrap = $('addLessonSS');
  const displayInput = $('addLessonDisplay');
  const dropdown = $('addLessonDropdown');
  const searchInput = $('addLessonSearch');
  const clearBtn = $('addLessonClear');
  if (!ssWrap || !displayInput || !dropdown) return;

  if (ssWrap.dataset.bound) return;
  ssWrap.dataset.bound = 'true';

  displayInput.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains('hidden');
    if (isOpen) {
      dropdown.classList.add('hidden');
      currentLessonSelectOpen = false;
    } else {
      dropdown.classList.remove('hidden');
      currentLessonSelectOpen = true;
      currentLessonSelectSearch = '';
      if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 50);
      }
      updateLessonSelectOptions(_lessonsForSelect || []);
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentLessonSelectSearch = e.target.value;
      updateLessonSelectOptions(_lessonsForSelect || []);
    });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearLessonSelection();
    });
  }

  document.addEventListener('click', (e) => {
    if (!ssWrap.contains(e.target)) {
      dropdown.classList.add('hidden');
      currentLessonSelectOpen = false;
    }
  });
}

// ══════════════════════════════════════════
// PREVIEW QUESTIONS
// ══════════════════════════════════════════
function previewQuestions() {
  const html = $('addQuestionsHtml').value.trim();
  if (!html) {
    toast('Chưa có HTML', 'error');
    return;
  }

  const questions = parseQuestionsHtml(html);
  if (questions.length === 0) {
    toast('Không parse được câu hỏi!', 'error');
    return;
  }

  const part1 = questions.filter(q => q.type === 'choice');
  const part2 = questions.filter(q => q.type === 'truefalse');
  const part3 = questions.filter(q => q.type === 'short');

  let previewHtml = `<div class="alert alert-success">✅ Parse được ${questions.length} câu</div>`;

  if (part1.length > 0) {
    previewHtml += `<h4 style="color:#8B4513;margin-top:12px;">I. Trắc nghiệm (${part1.length})</h4>`;
    part1.forEach((q, i) => {
      previewHtml += `<div class="question"><div class="q-text">Câu ${i + 1}. ${q.textHtml || esc(q.text)} <span style="color:#0066CC;">[ĐA: ${q.correctAnswer}, ${q.points}đ]</span></div>`;
      q.options.forEach(o => {
        let optHtml = o.html || esc(o.text);
        optHtml = optHtml.replace(/^\s*[A-D]\s*[.\s]\s*/i, '').trim();
        previewHtml += `<div class="opt">${o.value}. ${optHtml}</div>`;
      });
      previewHtml += `</div>`;
    });
  }
  if (part2.length > 0) {
    previewHtml += `<h4 style="color:#0066CC;margin-top:12px;">II. Đúng/Sai (${part2.length})</h4>`;
    part2.forEach((q, i) => {
      previewHtml += `<div class="question"><div class="q-text">Câu ${i + 1}. ${q.textHtml || esc(q.text)} <span style="color:#0066CC;">[${q.points}đ]</span></div>`;
      q.statements.forEach(st => {
        previewHtml += `<div class="tf-item" style="padding:6px;">${String.fromCharCode(97 + st.statement)}) ${st.html || esc(st.text)} → <strong>${st.correct ? 'Đ' : 'S'}</strong></div>`;
      });
      previewHtml += `</div>`;
    });
  }
  if (part3.length > 0) {
    previewHtml += `<h4 style="color:#2E7D32;margin-top:12px;">III. Trả lời ngắn (${part3.length})</h4>`;
    part3.forEach((q, i) => {
      previewHtml += `<div class="question"><div class="q-text">Câu ${i + 1}. ${q.textHtml || esc(q.text)} <span style="color:#0066CC;">[ĐA: ${q.correctAnswer}, ${q.points}đ]</span></div></div>`;
    });
  }

  $('questionsPreviewBox').innerHTML = previewHtml;
  show($('questionsPreview'));
}

// ══════════════════════════════════════════
// ADD ASSIGNMENT
// ══════════════════════════════════════════
async function addAssignment() {
  if (state.currentProfile?.role !== 'teacher') {
    toast('Chỉ GV', 'error');
    return;
  }

  const grade = $('addGrade').value;
  const lessonId = $('addLesson').value;
  const title = $('addTitle').value.trim();
  const mode = $('addMode').value;
  const deadline = $('addDeadline').value;

  if (!title) {
    toast('Nhập tiêu đề', 'error');
    return;
  }

  const payload = {
    grade, lessonId: lessonId || null, title, mode, deadline,
    hidden: false,
    teacherId: state.currentUser.uid,
    createdAt: serverTimestamp()
  };

  try {
    if (mode === 'inline') {
      const questionsHtml = $('addQuestionsHtml').value.trim();
      if (!questionsHtml) {
        toast('Dán HTML câu hỏi', 'error');
        return;
      }

      const questions = parseQuestionsHtml(questionsHtml);
      if (questions.length === 0) {
        toast('Không parse được câu hỏi!', 'error');
        return;
      }

      payload.type = 'quiz';
      payload.questionsHtml = questionsHtml;
      payload.duration = Number($('addQuizDuration').value) || 25;
      payload.maxAttempts = Number($('addQuizMaxAttempts').value) || 3;

      toast(`✅ Đã parse ${questions.length} câu`, 'success');
    } else {
      const externalUrl = $('addExternalUrl').value.trim();
      if (!externalUrl) {
        toast('Nhập URL file', 'error');
        return;
      }
      payload.type = 'external';
      payload.externalUrl = externalUrl;
      payload.maxAttempts = Number($('addExternalMaxAttempts').value) || 0;
      payload.desc = $('addExternalDesc').value.trim();
    }

    const assignGrid = classGridState.assign;
    payload.assignedAllGrade = assignGrid.allGrade;
    payload.assignedClasses = assignGrid.allGrade ? [] : Array.from(assignGrid.selected).sort();

    const emailsStr = $('addAssignEmails').value.trim();
    payload.assignedTo = [];
    payload.assignedEmails = [];

    if (emailsStr) {
      const emails = emailsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const uSnap = await getDocs(collection(db, 'users'));
      const foundUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(u => emails.includes((u.email || '').toLowerCase()));
      payload.assignedTo = foundUsers.map(u => u.id);
      payload.assignedEmails = foundUsers.map(u => u.email);
    }

    if (!payload.assignedAllGrade && payload.assignedClasses.length === 0 && payload.assignedTo.length === 0) {
      if (!confirm('⚠️ Bạn KHÔNG giao đề cho ai cả.\n\nĐề sẽ bị "treo".\n\nTiếp tục?')) {
        return;
      }
    }

    await addDoc(collection(db, 'assignments'), payload);

    $('addTitle').value = '';
    $('addQuestionsHtml').value = '';
    $('addExternalUrl').value = '';
    $('addExternalDesc').value = '';
    $('addDeadline').value = '';
    $('addAssignEmails').value = '';
    hide($('questionsPreview'));

    clearLessonSelection();
    resetClassGrid('assign');

    let classMsg = '';
    if (payload.assignedAllGrade) classMsg = ` cho CẢ KHỐI ${grade}`;
    else if (payload.assignedClasses.length > 0) classMsg = ` cho ${payload.assignedClasses.length} lớp`;
    else if (payload.assignedTo.length > 0) classMsg = ` cho ${payload.assignedTo.length} HS`;
    else classMsg = ' (chưa giao cho ai)';

    toast(`✅ Đã thêm đề${classMsg}!`, 'success');
    window.dispatchEvent(new CustomEvent('data:refresh'));
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════
async function openAddNotificationModal() {
  const grid = classGridState.notif;
  grid.selected.clear();
  grid.allGrade = false;
  grid.currentGrade = '10';

  $('notifTitle').value = '';
  $('notifContent').value = '';

  document.querySelectorAll('.notif-class-grid-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.notifGrade === '10');
  });

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
  if (!grid.allGrade && grid.selected.size === 0) {
    toast('Vui lòng chọn "Tất cả HS" hoặc ít nhất 1 lớp', 'error');
    return;
  }

  const saveBtn = $('addNotifSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Đang đăng...';

  try {
    const payload = {
      title, content,
      sendToAll: grid.allGrade,
      targetClasses: grid.allGrade ? [] : Array.from(grid.selected).sort(),
      createdBy: state.currentUser.uid,
      createdByName: ADMIN_DISPLAY_NAME,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'notifications'), payload);

    toast('✅ Đã đăng thông báo!', 'success');
    hide($('addNotificationModal'));

    $('notifTitle').value = '';
    $('notifContent').value = '';
    grid.allGrade = false;
    grid.selected.clear();

    loadTeacherNotifications();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '📢 Đăng thông báo';
  }
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
  } catch (err) {
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

function renderTeacherNotifications() {
  const wrap = $('notificationsList');
  if (!wrap) return;

  if (state.notificationsCache.length === 0) {
    wrap.innerHTML = '<div class="empty">📭 Chưa có thông báo nào.</div>';
    return;
  }

  wrap.innerHTML = state.notificationsCache.map(n => {
    let targetBadge = '';
    if (n.sendToAll) {
      targetBadge = `<span class="badge" style="background:#c0392b; color:#FFF;">🌐 Tất cả HS</span>`;
    } else if (n.targetClasses && n.targetClasses.length > 0) {
      targetBadge = n.targetClasses.map(c =>
        `<span class="badge" style="background:#8B5A2B; color:#FFF; margin-right:4px;">📌 ${esc(c)}</span>`
      ).join('');
    }

    return `
      <div class="notif-item">
        <div class="n-info">
          <div class="n-title">📢 ${esc(n.title)}</div>
          <div class="n-content">${esc(n.content)}</div>
          <div class="n-meta">
            ${targetBadge}
            <span>👨‍🏫 ${ADMIN_DISPLAY_NAME}</span>
            <span>📅 ${fmtDate(n.createdAt)}</span>
          </div>
        </div>
        <div class="n-actions">
          <button class="btn btn-danger btn-sm" data-del-notif="${n.id}">🗑 Xoá</button>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-del-notif]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const notifId = btn.dataset.delNotif;
      if (!confirm('Xoá thông báo này?')) return;

      try {
        await deleteDoc(doc(db, 'notifications', notifId));
        toast('✅ Đã xoá thông báo', 'success');
        loadTeacherNotifications();
      } catch (err) {
        toast('Lỗi: ' + err.message, 'error');
      }
    });
  });
}

export function initNotifModals() {
  $('addNotifCloseBtn')?.addEventListener('click', () => hide($('addNotificationModal')));
  $('addNotifCancelBtn')?.addEventListener('click', () => hide($('addNotificationModal')));
  $('addNotifSaveBtn')?.addEventListener('click', saveNotification);

  const modal = $('addNotificationModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hide($('addNotificationModal'));
    });
  }
}

// ══════════════════════════════════════════
// DATA STATS
// ══════════════════════════════════════════
async function showDataStats() {
  const statsDiv = $('dataStats');
  statsDiv.innerHTML = '<div class="empty">Đang đếm...</div>';

  try {
    const [subsSnap, logsSnap, usersSnap, aSnap, lSnap] = await Promise.all([
      getDocs(collection(db, 'submissions')),
      getDocs(collection(db, 'viewLogs')),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'assignments')),
      getDocs(collection(db, 'lessons'))
    ]);

    const studentCount = usersSnap.docs.filter(d => d.data().role === 'student').length;

    statsDiv.innerHTML = `
      <div class="alert alert-info">
        <strong>📊 Thống kê dữ liệu:</strong>
        <ul style="margin-left: 20px; margin-top: 8px;">
          <li>👥 Học sinh: <strong>${studentCount}</strong></li>
          <li>📖 Bài học: <strong>${lSnap.size}</strong></li>
          <li>📝 Đề bài tập: <strong>${aSnap.size}</strong></li>
          <li>📄 Bài làm: <strong>${subsSnap.size}</strong></li>
          <li>👁 Log truy cập: <strong>${logsSnap.size}</strong></li>
        </ul>
      </div>
    `;
  } catch (err) {
    statsDiv.innerHTML = `<div class="alert alert-error">Lỗi: ${esc(err.message)}</div>`;
  }
}

async function clearAllSubmissions() {
  if (!confirm('⚠️ XOÁ TẤT CẢ BÀI LÀM VÀ ĐIỂM?\n\nKhông thể hoàn tác!')) return;

  const confirmText = prompt('Gõ chính xác để xác nhận: XOA HET');
  if (confirmText !== 'XOA HET') {
    toast('Đã hủy', 'info');
    return;
  }

  toast('Đang xoá...', 'info');

  try {
    const subsSnap = await getDocs(collection(db, 'submissions'));
    const logsSnap = await getDocs(collection(db, 'viewLogs'));

    const subDocs = subsSnap.docs;
    for (let i = 0; i < subDocs.length; i += 500) {
      const batch = writeBatch(db);
      subDocs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    const logDocs = logsSnap.docs;
    for (let i = 0; i < logDocs.length; i += 500) {
      const batch = writeBatch(db);
      logDocs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    toast(`✅ Đã xoá ${subsSnap.size} bài làm + ${logsSnap.size} log!`, 'success');
    window.dispatchEvent(new CustomEvent('data:refresh'));
    showDataStats();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════
// STATS FILTERS
// ══════════════════════════════════════════
export async function loadStatsClassesAndLessons() {
  const grade = $('statsGrade')?.value;
  if (!grade) return;

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const users = usersSnap.docs.map(d => d.data()).filter(u => u.role === 'student');
    const classSet = new Set();
    users.forEach(u => {
      if (u.class && getGradeFromClass(u.class) === grade) classSet.add(u.class);
    });
    const classes = Array.from(classSet).sort();

    const lq = query(collection(db, 'lessons'), where('grade', '==', grade));
    const lSnap = await getDocs(lq);
    const lessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    lessons.sort((a, b) => (a.order || 0) - (b.order || 0));

    state.teacherLessonsMapCache = {};
    lessons.forEach(l => { state.teacherLessonsMapCache[l.id] = l; });

    const statsClassEl = $('statsClass');
    const statsLessonEl = $('statsLesson');

    if (statsClassEl) {
      statsClassEl.innerHTML = '<option value="">-- Tất cả lớp --</option>' +
        classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }
    if (statsLessonEl) {
      statsLessonEl.innerHTML = '<option value="">-- Tất cả bài --</option>' +
        lessons.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    }
  } catch (err) {
    console.error('Load stats filters error:', err);
  }
}

// ══════════════════════════════════════════
// RENDER ASSIGNMENTS TAB — với ĐẦY ĐỦ bộ lọc
// ══════════════════════════════════════════
let _teacherAsgCache = [];
let _teacherLessonsCache = {};

export function renderAssignmentsTab() {
  const tab = $('tab-assignments');
  if (!tab) return;
  if (tab.innerHTML.includes('Danh Sách Đề')) return;

  tab.innerHTML = `
    <div class="card">
      <div class="space-between mb-2">
        <h3>📋 Danh Sách Đề & Bài Làm</h3>
        <button class="btn btn-light btn-sm" id="refreshAssignmentsBtn">🔄 Tải lại</button>
      </div>
      <div class="filter-bar">
        <label>📚 Khối:</label>
        <select id="asgFilterGrade">
          <option value="all">Tất cả khối</option>
          <option value="10">Khối 10</option>
          <option value="11">Khối 11</option>
          <option value="12">Khối 12</option>
        </select>

        <label>🏫 Lớp:</label>
        <select id="asgFilterClass">
          <option value="all">Tất cả lớp</option>
        </select>

        <label>📖 Bài học:</label>
        <select id="asgFilterLesson">
          <option value="all">Tất cả bài</option>
        </select>

        <label>📝 Đề:</label>
        <select id="asgFilterAssignment">
          <option value="all">Tất cả đề</option>
        </select>

        <label>📋 Loại:</label>
        <select id="asgFilterType">
          <option value="all">Tất cả</option>
          <option value="quiz">🎯 Đề có điểm</option>
          <option value="external">🔗 Luyện tập</option>
        </select>

        <input type="text" id="asgSearchInput" placeholder="🔍 Tìm theo tên đề..." />
        <span class="count" id="asgResultCount"></span>
      </div>
      <div id="teacherAssignmentsList"></div>
    </div>
  `;

  $('refreshAssignmentsBtn')?.addEventListener('click', () => {
    _allClassesCache = null;
    loadTeacherAssignmentsList();
  });

  $('asgFilterGrade')?.addEventListener('change', async () => {
    await updateAsgClassFilter();
    updateAsgLessonFilter();
    updateAsgAssignmentFilter();
    renderTeacherAssignmentsList();
  });
  $('asgFilterClass')?.addEventListener('change', () => {
    updateAsgLessonFilter();
    updateAsgAssignmentFilter();
    renderTeacherAssignmentsList();
  });
  $('asgFilterLesson')?.addEventListener('change', () => {
    updateAsgAssignmentFilter();
    renderTeacherAssignmentsList();
  });
  $('asgFilterAssignment')?.addEventListener('change', renderTeacherAssignmentsList);
  $('asgFilterType')?.addEventListener('change', () => {
    updateAsgLessonFilter();
    updateAsgAssignmentFilter();
    renderTeacherAssignmentsList();
  });
  $('asgSearchInput')?.addEventListener('input', renderTeacherAssignmentsList);

  loadTeacherAssignmentsList();
}

async function loadTeacherAssignmentsList() {
  const wrap = $('teacherAssignmentsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';

  try {
    const [aSnap, sSnap, lSnap] = await Promise.all([
      getDocs(collection(db, 'assignments')),
      getDocs(collection(db, 'submissions')),
      getDocs(collection(db, 'lessons'))
    ]);

    _teacherAsgCache = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const subs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    _teacherLessonsCache = {};
    lSnap.docs.forEach(d => { _teacherLessonsCache[d.id] = { id: d.id, ...d.data() }; });

    _teacherAsgCache.forEach(a => {
      a._subCount = subs.filter(s => s.assignmentId === a.id).length;
      a._submittedCount = subs.filter(s => s.assignmentId === a.id && s.status === 'submitted').length;
    });

    state.teacherAssignmentsCache = _teacherAsgCache;
    state.teacherSubmissionsCache = subs;
    state.teacherLessonsMapCache = _teacherLessonsCache;

    await updateAsgClassFilter();
    updateAsgLessonFilter();
    updateAsgAssignmentFilter();
    renderTeacherAssignmentsList();
  } catch (err) {
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

// ⭐ Load TẤT CẢ các lớp có HS
async function loadAllClasses() {
  if (_allClassesCache) return _allClassesCache;

  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => d.data()).filter(u => u.role === 'student');

    const classSet = new Set();
    users.forEach(u => {
      if (u.class) classSet.add(u.class);
    });

    _allClassesCache = Array.from(classSet).sort((a, b) => {
      const gradeA = a.match(/^(\d+)/)?.[1] || '';
      const gradeB = b.match(/^(\d+)/)?.[1] || '';
      if (gradeA !== gradeB) return gradeA.localeCompare(gradeB);

      const numA = parseInt(a.match(/a(\d+)$/)?.[1] || 0);
      const numB = parseInt(b.match(/a(\d+)$/)?.[1] || 0);
      return numA - numB;
    });

    return _allClassesCache;
  } catch (err) {
    console.error('Load all classes error:', err);
    return [];
  }
}

async function updateAsgClassFilter() {
  const gradeFilter = $('asgFilterGrade')?.value || 'all';
  const select = $('asgFilterClass');
  if (!select) return;

  const allClasses = await loadAllClasses();

  let classes = allClasses;
  if (gradeFilter !== 'all') {
    classes = allClasses.filter(c => {
      const m = c.match(/^(10|11|12)/);
      return m && m[1] === gradeFilter;
    });
  }

  const currentVal = select.value;
  select.innerHTML = '<option value="all">Tất cả lớp</option>' +
    classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  if (classes.includes(currentVal)) select.value = currentVal;
  else select.value = 'all';
}

function updateAsgLessonFilter() {
  const gradeFilter = $('asgFilterGrade')?.value || 'all';
  const classFilter = $('asgFilterClass')?.value || 'all';
  const typeFilter = $('asgFilterType')?.value || 'all';

  const lessonIdsWithAssign = new Set();
  _teacherAsgCache.forEach(a => {
    if (gradeFilter !== 'all' && a.grade !== gradeFilter) return;
    if (typeFilter !== 'all' && a.mode !== typeFilter) return;
    if (classFilter !== 'all') {
      const classGrade = classFilter.match(/^(10|11|12)/)?.[1];
      const matchClass =
        (a.assignedClasses && a.assignedClasses.includes(classFilter)) ||
        (a.assignedAllGrade && a.grade === classGrade);
      if (!matchClass) return;
    }
    lessonIdsWithAssign.add(a.lessonId || '_unassigned');
  });

  const lessons = Object.values(_teacherLessonsCache)
    .filter(l => gradeFilter === 'all' || l.grade === gradeFilter)
    .filter(l => lessonIdsWithAssign.has(l.id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const select = $('asgFilterLesson');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="all">Tất cả bài</option>' +
    lessons.map(l => `<option value="${l.id}">${esc(l.name)}${l.hidden ? ' (ẩn)' : ''}</option>`).join('');

  if (lessons.some(l => l.id === currentVal)) select.value = currentVal;
  else select.value = 'all';
}

function updateAsgAssignmentFilter() {
  const gradeFilter = $('asgFilterGrade')?.value || 'all';
  const classFilter = $('asgFilterClass')?.value || 'all';
  const lessonFilter = $('asgFilterLesson')?.value || 'all';
  const typeFilter = $('asgFilterType')?.value || 'all';

  let filtered = [..._teacherAsgCache];

  if (gradeFilter !== 'all') filtered = filtered.filter(a => a.grade === gradeFilter);
  if (typeFilter !== 'all') filtered = filtered.filter(a => a.mode === typeFilter);
  if (lessonFilter !== 'all') {
    if (lessonFilter === '_unassigned') filtered = filtered.filter(a => !a.lessonId);
    else filtered = filtered.filter(a => a.lessonId === lessonFilter);
  }
  if (classFilter !== 'all') {
    const classGrade = classFilter.match(/^(10|11|12)/)?.[1];
    filtered = filtered.filter(a =>
      (a.assignedClasses && a.assignedClasses.includes(classFilter)) ||
      (a.assignedAllGrade && a.grade === classGrade)
    );
  }

  filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const select = $('asgFilterAssignment');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="all">Tất cả đề</option>' +
    filtered.map(a => {
      const modeIcon = a.mode === 'external' ? '🔗' : '🎯';
      const hiddenIcon = a.hidden ? '🙈' : '';
      return `<option value="${a.id}">${modeIcon} ${esc(a.title)} ${hiddenIcon}</option>`;
    }).join('');

  if (filtered.some(a => a.id === currentVal)) select.value = currentVal;
  else select.value = 'all';
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
  if (lessonFilter !== 'all') {
    if (lessonFilter === '_unassigned') items = items.filter(a => !a.lessonId);
    else items = items.filter(a => a.lessonId === lessonFilter);
  }
  if (assignmentFilter !== 'all') items = items.filter(a => a.id === assignmentFilter);

  if (classFilter !== 'all') {
    const classGrade = classFilter.match(/^(10|11|12)/)?.[1];
    items = items.filter(a =>
      (a.assignedClasses && a.assignedClasses.includes(classFilter)) ||
      (a.assignedAllGrade && a.grade === classGrade)
    );
  }

  if (keyword) items = items.filter(a => (a.title || '').toLowerCase().includes(keyword));

  items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const countEl = $('asgResultCount');
  if (countEl) countEl.textContent = `${items.length} đề`;

  if (items.length === 0) {
    wrap.innerHTML = '<div class="empty">Không có đề nào phù hợp.</div>';
    return;
  }

  wrap.innerHTML = items.map(a => renderAssignmentItem(a)).join('');

  // Bind: Publish
  wrap.querySelectorAll('[data-publish]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('📢 Công bố điểm cho tất cả bài đã nộp?')) return;
      try {
        const subQ = query(
          collection(db, 'submissions'),
          where('assignmentId', '==', btn.dataset.publish),
          where('status', '==', 'submitted')
        );
        const subSnap = await getDocs(subQ);
        const batch = writeBatch(db);
        subSnap.docs.forEach(sDoc => {
          batch.update(doc(db, 'submissions', sDoc.id), {
            status: 'published',
            publishedAt: serverTimestamp(),
            publishedReason: 'manual'
          });
        });
        await batch.commit();
        toast(`✅ Đã công bố ${subSnap.size} bài!`, 'success');
        loadTeacherAssignmentsList();
      } catch (err) {
        toast('Lỗi: ' + err.message, 'error');
      }
    });
  });

  // Bind: Toggle hide
  wrap.querySelectorAll('[data-toggle-hide]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aId = btn.dataset.toggleHide;
      const a = _teacherAsgCache.find(x => x.id === aId);
      if (!a) return;
      try {
        await updateDoc(doc(db, 'assignments', aId), { hidden: !a.hidden });
        toast(a.hidden ? '👁 Đã hiện đề' : '🙈 Đã ẩn đề', 'success');
        loadTeacherAssignmentsList();
        window.dispatchEvent(new CustomEvent('data:refresh'));
      } catch (err) {
        toast('Lỗi: ' + err.message, 'error');
      }
    });
  });

  // Bind: Edit
  wrap.querySelectorAll('[data-edit-assignment]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aId = btn.dataset.editAssignment;
      const a = _teacherAsgCache.find(x => x.id === aId);
      if (!a) return;
      await openEditAssignmentModal(a);
    });
  });

  // ⭐ Bind: Delete — xoá đề + xoá hết bài làm (2 lớp xác nhận)
  wrap.querySelectorAll('[data-del-assignment]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const aId = btn.dataset.delAssignment;
      const a = _teacherAsgCache.find(x => x.id === aId);
      if (!a) return;

      const subCount = a._subCount || 0;

      // ═══ LỚP XÁC NHẬN 1: Confirm dialog ═══
      let msg = `🗑 XOÁ ĐỀ BÀI TẬP\n\n`;
      msg += `📝 Đề: "${a.title}"\n`;
      msg += `📚 Khối: ${a.grade}\n\n`;

      if (subCount > 0) {
        msg += `⚠️ CẢNH BÁO: Đề này có ${subCount} bài làm của HS.\n`;
        msg += `Sẽ xoá luôn TẤT CẢ bài làm + điểm + log truy cập.\n\n`;
        msg += `❗ Không thể hoàn tác!\n\n`;
        msg += `Bấm OK để tiếp tục bước xác nhận cuối.`;
      } else {
        msg += `Đề này chưa có bài làm nào.\n\nBấm OK để xác nhận xoá.`;
      }

      if (!confirm(msg)) {
        toast('Đã hủy xoá đề', 'info');
        return;
      }

      // ═══ LỚP XÁC NHẬN 2: Prompt gõ chữ (chỉ khi có bài làm) ═══
      if (subCount > 0) {
        const confirmText = prompt(
          `⚠️ XÁC NHẬN LẦN CUỐI\n\n` +
          `Đề "${a.title}" sẽ bị xoá vĩnh viễn cùng với:\n` +
          `• ${subCount} bài làm của HS\n` +
          `• Điểm + nhận xét\n` +
          `• Log truy cập (nếu có)\n\n` +
          `Gõ chính xác chữ "XOA" (in hoa) để xác nhận:`
        );

        if (confirmText !== 'XOA') {
          toast('❌ Xác nhận sai. Đã hủy xoá.', 'error');
          return;
        }
      }

      // ═══ TIẾN HÀNH XOÁ ═══
      toast('⏳ Đang xoá...', 'info');

      try {
        // 1. Xoá submissions (bài làm)
        const subQ = query(collection(db, 'submissions'), where('assignmentId', '==', aId));
        const subSnap = await getDocs(subQ);

        if (subSnap.size > 0) {
          const subDocs = subSnap.docs;
          for (let i = 0; i < subDocs.length; i += 500) {
            const batch = writeBatch(db);
            subDocs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }

        // 2. Xoá viewLogs (log truy cập)
        const logQ = query(collection(db, 'viewLogs'), where('assignmentId', '==', aId));
        const logSnap = await getDocs(logQ);

        if (logSnap.size > 0) {
          const logDocs = logSnap.docs;
          for (let i = 0; i < logDocs.length; i += 500) {
            const batch = writeBatch(db);
            logDocs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }

        // 3. Xoá assignment (đề)
        await deleteDoc(doc(db, 'assignments', aId));

        toast(
          `✅ Đã xoá đề + ${subSnap.size} bài làm + ${logSnap.size} log`,
          'success'
        );
        loadTeacherAssignmentsList();
        window.dispatchEvent(new CustomEvent('data:refresh'));
      } catch (err) {
        console.error('Delete assignment error:', err);
        toast('❌ Lỗi: ' + err.message, 'error');
      }
    });
  });
}

function renderAssignmentItem(a) {
  const isExternal = a.mode === 'external';
  const lesson = a.lessonId ? _teacherLessonsCache[a.lessonId] : null;
  const lessonName = lesson ? lesson.name : '(Không thuộc bài học)';
  const lessonHidden = lesson?.hidden === true;

  const modeBadge = isExternal
    ? '<span class="badge badge-external">🔗 Luyện tập</span>'
    : '<span class="badge badge-inline">🎯 Đề có điểm</span>';

  const hiddenBadge = a.hidden ? '<span class="badge badge-hidden">🙈 Đã ẩn</span>' : '';
  const lessonHiddenBadge = lessonHidden ? '<span class="badge" style="background:#999;color:#FFF;">📖 Bài ẩn</span>' : '';

  const publishBtn = !isExternal && a._submittedCount > 0
    ? `<button class="btn btn-secondary btn-sm" data-publish="${a.id}">📢 Công bố (${a._submittedCount})</button>`
    : '';

  let classBadges = '';
  if (a.assignedAllGrade) {
    classBadges = `<span style="display:inline-block; background:#c0392b; color:#FFF; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:700;">🌐 CẢ KHỐI ${a.grade}</span>`;
  } else if (a.assignedClasses && a.assignedClasses.length > 0) {
    classBadges = a.assignedClasses.map(c =>
      `<span style="display:inline-block; background:#8B5A2B; color:#FFF; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; margin-right:4px;">📌 ${esc(c)}</span>`
    ).join('');
  } else if (!a.assignedTo || a.assignedTo.length === 0) {
    classBadges = `<span style="display:inline-block; background:#999; color:#FFF; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:700;">⚠️ Chưa giao</span>`;
  }

  return `
    <div class="assignment-item ${a.hidden ? 'hidden-item' : ''}">
      <div class="a-info">
        <div class="a-title">
          📝 ${esc(a.title)}
          ${modeBadge}
          ${hiddenBadge}
          ${lessonHiddenBadge}
        </div>
        <div class="a-meta">
          📖 <strong>${esc(lessonName)}</strong>
          • Khối ${esc(a.grade)}
          ${a.deadline ? ` • 📅 Hạn: ${esc(a.deadline)}` : ''}
          ${a.type === 'quiz' ? ` • ⏱ ${a.duration || 25}p • 🔄 ${a.maxAttempts || 3} lượt` : ''}
        </div>
        <div style="margin-top:6px;">${classBadges}</div>
        <div class="text-sm" style="margin-top:6px;">
          📊 <strong>${a._subCount}</strong> bài làm •
          <strong>${a._submittedCount}</strong> chờ công bố
        </div>
      </div>
      <div class="a-actions">
        ${publishBtn}
        <button class="btn btn-light btn-sm" data-edit-assignment="${a.id}">✏️ Sửa</button>
        <button class="btn btn-light btn-sm" data-toggle-hide="${a.id}">
          ${a.hidden ? '👁 Hiện' : '🙈 Ẩn'}
        </button>
        <button class="btn btn-danger btn-sm" data-del-assignment="${a.id}">🗑 Xoá</button>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════
// EDIT ASSIGNMENT MODAL
// ══════════════════════════════════════════
async function openEditAssignmentModal(assignment) {
  editingAssignmentId = assignment.id;

  const editGrid = classGridState.edit;
  editGrid.selected = new Set(assignment.assignedClasses || []);
  editGrid.allGrade = assignment.assignedAllGrade === true;
  editGrid.currentGrade = assignment.grade || '10';

  await loadAvailableClasses();

  const lessonsInGrade = Object.values(_teacherLessonsCache)
    .filter(l => l.grade === assignment.grade)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const relatedSubs = _teacherAsgCache.find(x => x.id === assignment.id);
  const subCount = relatedSubs?._subCount || 0;
  const gradedCount = relatedSubs?._submittedCount || 0;
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

      <div class="alert alert-info">
        ℹ️ <strong>Chỉ sửa thông tin đề</strong> (tiêu đề, hạn nộp, giao lớp, ...).
        <br>🚫 <strong>Không sửa nội dung câu hỏi</strong> để tránh làm lệch bài làm cũ của HS.
      </div>

      ${subCount > 0 ? `
        <div class="alert alert-warn">
          ⚠️ Đề này đã có <strong>${subCount}</strong> bài làm (${gradedCount} đã chấm).
          Việc sửa metadata <strong>KHÔNG ảnh hưởng</strong> bài làm cũ.
        </div>
      ` : ''}

      <div class="form-group">
        <label>Tiêu đề đề bài</label>
        <input id="editAssTitle" value="${esc(assignment.title || '')}" />
      </div>

      <div class="row">
        <div class="form-group" style="flex:1; min-width:200px;">
          <label>Khối lớp (không đổi)</label>
          <input value="${esc(assignment.grade === '10' ? 'Vật Lý 10' : assignment.grade === '11' ? 'Vật Lý 11' : 'Vật Lý 12')}" disabled />
        </div>
        <div class="form-group" style="flex:2; min-width:250px;">
          <label>Thuộc bài học</label>
          <select id="editAssLesson">
            <option value="">-- Không thuộc bài học nào --</option>
            ${lessonsInGrade.map(l => `
              <option value="${l.id}" ${l.id === assignment.lessonId ? 'selected' : ''}>
                ${esc(l.name)}${l.hidden ? ' (ẩn)' : ''}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      ${assignment.type === 'quiz' ? `
        <div class="row">
          <div class="form-group" style="flex:1;">
            <label>⏱ Thời gian (phút)</label>
            <input type="number" id="editAssDuration" value="${assignment.duration || 25}" min="1" max="180" />
          </div>
          <div class="form-group" style="flex:1;">
            <label>Số lượt tối đa</label>
            <input type="number" id="editAssMaxAttempts" value="${assignment.maxAttempts || 3}" min="1" max="10" />
          </div>
        </div>
      ` : `
        <div class="row">
          <div class="form-group" style="flex:1;">
            <label>Số lần mở tối đa</label>
            <input type="number" id="editAssMaxAttempts" value="${assignment.maxAttempts || 0}" min="0" max="100" />
          </div>
        </div>
      `}

      <div class="row">
        <div class="form-group" style="flex:1;">
          <label>Hạn nộp</label>
          <input type="date" id="editAssDeadline" value="${esc(assignment.deadline || '')}" />
        </div>
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
            <button type="button" class="edit-class-grid-tab class-grid-tab ${editGrid.currentGrade === '10' ? 'active' : ''}" data-edit-grade="10">
              Khối 10 <span class="tab-count" id="editClassTabCount10">0</span>
            </button>
            <button type="button" class="edit-class-grid-tab class-grid-tab ${editGrid.currentGrade === '11' ? 'active' : ''}" data-edit-grade="11">
              Khối 11 <span class="tab-count" id="editClassTabCount11">0</span>
            </button>
            <button type="button" class="edit-class-grid-tab class-grid-tab ${editGrid.currentGrade === '12' ? 'active' : ''}" data-edit-grade="12">
              Khối 12 <span class="tab-count" id="editClassTabCount12">0</span>
            </button>
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
          <div class="class-grid-body" id="editClassGridBody">
            <div class="class-grid-empty">Đang tải...</div>
          </div>
          <div class="class-selected-summary">
            <span class="summary-label">📌 Sẽ giao cho:</span>
            <div class="summary-list" id="editClassSelectedList">
              <span class="empty-hint">Chưa chọn lớp nào</span>
            </div>
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-top:14px;">
        <label style="font-size:13px;">Giao riêng cho HS (theo email, cách nhau dấu phẩy)</label>
        <input id="editAssAssignEmails" placeholder="VD: hs1@gmail.com" value="${esc((assignment.assignedEmails || []).join(', '))}" />
        <div class="hint">
          Hiện tại có <strong>${assignedToCount}</strong> HS được giao riêng.
          ${assignedToCount > 0 ? '<br>⚠️ Nếu để trống → sẽ bỏ giao cho các HS này.' : ''}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-light" data-close-edit-ass>Hủy</button>
        <button class="btn btn-primary" id="editAssSaveBtn">💾 Lưu thay đổi</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  bindEditClassGridEvents();

  setTimeout(() => {
    const activeTab = modal.querySelector('.edit-class-grid-tab.active');
    if (activeTab) activeTab.click();
  }, 50);

  modal.querySelectorAll('[data-close-edit-ass]').forEach(b => {
    b.addEventListener('click', () => modal.remove());
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  modal.querySelector('#editAssSaveBtn').addEventListener('click', async () => {
    const saveBtn = modal.querySelector('#editAssSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Đang lưu...';

    try {
      const newTitle = modal.querySelector('#editAssTitle').value.trim();
      if (!newTitle) {
        toast('Vui lòng nhập tiêu đề', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Lưu thay đổi';
        return;
      }

      const newLessonId = modal.querySelector('#editAssLesson').value;
      const newDeadline = modal.querySelector('#editAssDeadline').value;
      const newHidden = modal.querySelector('#editAssHidden').checked;
      const newMaxAttempts = Number(modal.querySelector('#editAssMaxAttempts')?.value) || 0;

      const emailsStr = modal.querySelector('#editAssAssignEmails').value.trim();
      let assignedTo = [];
      let assignedEmails = [];

      if (emailsStr) {
        const emails = emailsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const uSnap = await getDocs(collection(db, 'users'));
        const foundUsers = uSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(u => emails.includes((u.email || '').toLowerCase()));
        assignedTo = foundUsers.map(u => u.id);
        assignedEmails = foundUsers.map(u => u.email);

        if (assignedTo.length === 0 && editGrid.selected.size === 0 && !editGrid.allGrade) {
          if (!confirm('⚠️ Bạn KHÔNG giao đề cho ai cả. Tiếp tục?')) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Lưu thay đổi';
            return;
          }
        }
      } else {
        if (editGrid.selected.size === 0 && !editGrid.allGrade) {
          if (!confirm('⚠️ Bạn KHÔNG giao đề cho ai cả. Tiếp tục?')) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Lưu thay đổi';
            return;
          }
        }
      }

      const payload = {
        title: newTitle,
        lessonId: newLessonId || null,
        deadline: newDeadline,
        hidden: newHidden,
        assignedAllGrade: editGrid.allGrade,
        assignedClasses: editGrid.allGrade ? [] : Array.from(editGrid.selected).sort(),
        assignedTo: assignedTo,
        assignedEmails: assignedEmails,
        updatedAt: serverTimestamp()
      };

      if (assignment.type === 'quiz') {
        const newDuration = Number(modal.querySelector('#editAssDuration')?.value) || 25;
        payload.duration = newDuration;
      }
      if (newMaxAttempts >= 0) payload.maxAttempts = newMaxAttempts;

      await updateDoc(doc(db, 'assignments', assignment.id), payload);

      toast('✅ Đã cập nhật đề!', 'success');
      modal.remove();
      editingAssignmentId = null;
      loadTeacherAssignmentsList();
      window.dispatchEvent(new CustomEvent('data:refresh'));
    } catch (err) {
      toast('Lỗi: ' + err.message, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Lưu thay đổi';
    }
  });
}