// ═══════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════

import './firebase-init.js';
import { db, updateDoc, doc, serverTimestamp } from './firebase-init.js';
import { state, on, EVENTS } from './state.js';
import {
  $, show, hide, toast,
  getGradeFromClass, buildClassName, normalizeClass
} from './utils.js';

import { initAuth, openAuthModal } from './auth.js';
import { initAssignments, loadAssignments } from './assignments.js';
import { initEssayExternal } from './essay-external.js';
import { initQuiz } from './quiz.js';
import { initSubmissions, loadMySubmissions } from './submissions.js';
import { initStats } from './stats.js';
import { loadNotificationsForUser } from './notifications.js';
import {
  initTeacher, renderTeacherTab, initAddLessonModal, initNotifModals,
  renderAssignmentsTab
} from './teacher.js';
import { renderStudentsTab } from './students.js';

// ══════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════
async function bootstrap() {
  console.log('%c📚 Bài Tập Vật Lý THPT', 'color:#8B5A2B; font-size:16px; font-weight:bold;');
  console.log('🚀 Bootstrap started');

  // ─── GLOBAL: open login modal ───
  window.addEventListener('open:login', () => openAuthModal('login'));

  // ─── TABS ───
  bindTabs();

  // ─── AUTH ───
  initAuth({
    onLogin: handleLogin,
    onLogout: handleLogout
  });

  // ─── MODULES ───
  initAssignments();
  initEssayExternal();
  initQuiz();
  initSubmissions();
  initStats();
  initTeacher();
  initAddLessonModal();
  initNotifModals();

  // ─── CLASS CHANGE BUTTON ───
  initChangeClassButton();

  // ─── LISTEN data:refresh ───
  window.addEventListener('data:refresh', () => {
    loadAssignments();
    loadMySubmissions();
  });

  // ─── LISTEN verify:done ───
  window.addEventListener('verify:done', () => {
    loadAssignments();
    loadMySubmissions();
    loadNotificationsForUser();
  });

  console.log('✅ App initialized');
}

// ══════════════════════════════════════════
// LOGIN HANDLER
// ══════════════════════════════════════════
async function handleLogin(user, profile, settings) {
  await loadNotificationsForUser();

  if (profile?.role === 'teacher') {
    renderTeacherTab();
    renderStudentsTab();
    renderAssignmentsTab();
  } else {
    await loadAssignments();
    await loadMySubmissions();
  }
}

// ══════════════════════════════════════════
// LOGOUT HANDLER
// ══════════════════════════════════════════
function handleLogout() {
  const ids = ['assignmentsList', 'mySubmissions', 'tab-teacher', 'tab-students', 'tab-assignments'];
  ids.forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = '';
  });
}

// ══════════════════════════════════════════
// TABS BINDING
// ══════════════════════════════════════════
function bindTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabEl = $('tab-' + tabName);
      if (tabEl) tabEl.classList.add('active');

      // Lazy render teacher tabs
      if (state.currentProfile?.role === 'teacher') {
        if (tabName === 'teacher') renderTeacherTab();
        if (tabName === 'students') renderStudentsTab();
        if (tabName === 'assignments') renderAssignmentsTab();
      }
    });
  });
}

// ══════════════════════════════════════════
// CHANGE CLASS
// ══════════════════════════════════════════
function initChangeClassButton() {
  const btn = $('changeClassBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!state.currentUser || state.currentProfile?.role !== 'student') return;
      if (!state.globalSettings.allowChangeClass) {
        toast('Giáo viên chưa cho phép đổi lớp', 'error');
        return;
      }

      $('currentClassDisplay').value = state.currentProfile.class || '(chưa có)';

      const currentCls = state.currentProfile.class || '';
      const gradeFromClass = getGradeFromClass(currentCls);
      const match = normalizeClass(currentCls).match(/^(10|11|12)a(\d+)/);

      if (gradeFromClass) $('newGradeSelect').value = gradeFromClass;
      if (match && match[2]) $('newClassNum').value = match[2];
      else $('newClassNum').value = '';

      updateNewClassPreview();
      show($('changeClassModal'));
    });
  }

  $('changeClassCancel')?.addEventListener('click', () => hide($('changeClassModal')));

  const modal = $('changeClassModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hide($('changeClassModal'));
    });
  }

  $('newGradeSelect')?.addEventListener('change', updateNewClassPreview);
  $('newClassNum')?.addEventListener('input', updateNewClassPreview);

  $('changeClassSave')?.addEventListener('click', async () => {
    const grade = $('newGradeSelect').value;
    const num = $('newClassNum').value.trim();

    if (!num) {
      toast('Vui lòng nhập số lớp', 'error');
      return;
    }

    const newClass = buildClassName(grade, num);
    if (!newClass) {
      toast('Số lớp không hợp lệ. VD: 1, 2, ..., 16', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', state.currentUser.uid), {
        class: newClass,
        updatedAt: serverTimestamp()
      });

      state.currentProfile.class = newClass;
      hide($('changeClassModal'));
      toast(`✅ Đã đổi lớp thành ${newClass}`, 'success');

      $('userLabel').textContent = state.currentProfile.name || state.currentUser.email;

      state.currentGrade = grade;
      await loadAssignments();
      await loadMySubmissions();
      await loadNotificationsForUser();
    } catch (err) {
      toast('Lỗi: ' + err.message, 'error');
    }
  });
}

function updateNewClassPreview() {
  const grade = $('newGradeSelect').value;
  const num = $('newClassNum').value.trim();
  const previewEl = $('newClassPreview');

  if (!num) {
    previewEl.innerHTML = `💡 Nhập số lớp (VD: <code>1</code> → <strong>${grade}a1</strong>)`;
    previewEl.style.color = '#666';
  } else {
    const result = buildClassName(grade, num);
    if (!result) {
      previewEl.innerHTML = '⚠️ Số lớp không hợp lệ (1-99)';
      previewEl.style.color = '#c0392b';
    } else {
      previewEl.innerHTML = `✅ Kết quả: <strong style="color:#0066CC;">${result}</strong>`;
      previewEl.style.color = '#666';
    }
  }
}

// ══════════════════════════════════════════
// START
// ══════════════════════════════════════════
bootstrap();