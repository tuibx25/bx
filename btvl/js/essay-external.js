import {
  db, collection, addDoc, doc, deleteDoc, updateDoc, serverTimestamp
} from './firebase-init.js';
import { state } from './state.js';
import { $, show, hide, esc, toast, resolveUrl, convertGDriveUrl, fmtDuration } from './utils.js';

export function initEssayExternal() {
  // Listen custom events từ assignments.js
  window.addEventListener('open:essay', (e) => openEssayModal(e.detail));
  window.addEventListener('open:external', (e) => openExternalAssignment(e.detail));

  // Close essay modal
  $('htmlCloseBtn').addEventListener('click', closeEssayModal);
  $('htmlModal').addEventListener('click', (e) => {
    if (e.target === $('htmlModal')) closeEssayModal();
  });

  // Cleanup external sessions khi unload
  window.addEventListener('beforeunload', () => {
    Object.values(state.externalSessions).forEach(sess => {
      if (sess.heartbeatInterval) clearInterval(sess.heartbeatInterval);
    });
  });
}

// ═══ EXTERNAL ═══
async function openExternalAssignment(a) {
  if (!a) return;

  if (!state.currentUser) {
    toast('Vui lòng đăng nhập', 'error');
    window.dispatchEvent(new CustomEvent('open:login'));
    return;
  }

  // GV mở trực tiếp
  if (state.currentProfile?.role === 'teacher') {
    window.open(resolveUrl(a.externalUrl), '_blank');
    return;
  }

  if (!state.currentUser.emailVerified) {
    toast('Vui lòng xác thực email', 'error');
    return;
  }

  const maxAttempts = a.maxAttempts || 0;
  const viewLogsOfA = state.myViewLogsCache.filter(v => v.assignmentId === a.id);
  if (maxAttempts > 0 && viewLogsOfA.length >= maxAttempts) {
    toast(`Đã mở tối đa ${maxAttempts} lần`, 'error');
    return;
  }

  const startedAt = Date.now();
  let logId = null;

  try {
    const docRef = await addDoc(collection(db, 'viewLogs'), {
      assignmentId: a.id,
      assignmentTitle: a.title,
      grade: a.grade,
      mode: 'external',
      studentId: state.currentUser.uid,
      studentName: state.currentProfile.name || state.currentUser.email,
      studentClass: state.currentProfile.class || '',
      openedAt: serverTimestamp(),
      startedAt: startedAt,
      durationSec: 0,
      closedAt: null,
      lastHeartbeat: startedAt
    });
    logId = docRef.id;
  } catch (e) {
    console.error('Không ghi được log:', e);
  }

  const url = resolveUrl(a.externalUrl);
  const win = window.open(url, '_blank');

  if (!win) {
    toast('Trình duyệt chặn popup! Vui lòng cho phép popup.', 'error');
    if (logId) {
      try { await deleteDoc(doc(db, 'viewLogs', logId)); } catch (e) {}
    }
    return;
  }

  toast('✅ Đã mở file luyện tập', 'success');

  if (logId) {
    const heartbeatInterval = setInterval(async () => {
      try {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        await updateDoc(doc(db, 'viewLogs', logId), {
          durationSec: elapsed,
          lastHeartbeat: Date.now()
        });
      } catch (e) {}
    }, 30000);

    state.externalSessions[logId] = { assignmentId: a.id, logId, startedAt, heartbeatInterval };

    state.myViewLogsCache.push({
      id: logId,
      assignmentId: a.id,
      studentId: state.currentUser.uid,
      mode: 'external',
      startedAt,
      durationSec: 0
    });
  }
}

// ═══ ESSAY ═══
async function openEssayModal(a) {
  if (!a) return;

  if (!state.currentUser) {
    toast('Vui lòng đăng nhập', 'error');
    window.dispatchEvent(new CustomEvent('open:login'));
    return;
  }

  // GV xem trực tiếp, không log
  if (state.currentProfile?.role === 'teacher') {
    $('htmlTitle').textContent = a.title + ' (GV)';
    $('viewTimeInfo').style.display = 'none';
    $('htmlFrame').src = a.isGDrive ? convertGDriveUrl(a.url) : resolveUrl(a.url);
    show($('htmlModal'));
    return;
  }

  if (!state.currentUser.emailVerified) {
    toast('Vui lòng xác thực email', 'error');
    return;
  }

  const startedAt = Date.now();
  let logId = null;

  try {
    const docRef = await addDoc(collection(db, 'viewLogs'), {
      assignmentId: a.id,
      assignmentTitle: a.title,
      grade: a.grade,
      mode: 'essay',
      studentId: state.currentUser.uid,
      studentName: state.currentProfile.name || state.currentUser.email,
      studentClass: state.currentProfile.class || '',
      openedAt: serverTimestamp(),
      startedAt,
      durationSec: 0,
      closedAt: null
    });
    logId = docRef.id;
  } catch (e) {
    console.error(e);
  }

  $('htmlTitle').textContent = a.title;
  $('viewTimeInfo').style.display = 'block';
  $('viewTimeInfo').innerHTML = `⏱ Bắt đầu: <strong>${new Date(startedAt).toLocaleTimeString('vi-VN')}</strong>`;
  $('htmlFrame').src = a.isGDrive ? convertGDriveUrl(a.url) : resolveUrl(a.url);
  show($('htmlModal'));

  state.currentViewSession = {
    logId,
    assignmentId: a.id,
    startedAt,
    heartbeatInterval: null,
    tickInterval: null
  };

  state.currentViewSession.heartbeatInterval = setInterval(async () => {
    if (!state.currentViewSession) return;
    const elapsed = Math.round((Date.now() - state.currentViewSession.startedAt) / 1000);
    try {
      await updateDoc(doc(db, 'viewLogs', state.currentViewSession.logId), {
        durationSec: elapsed
      });
    } catch (e) {}
  }, 30000);

  state.currentViewSession.tickInterval = setInterval(() => {
    if (!state.currentViewSession) return;
    const elapsed = Math.round((Date.now() - state.currentViewSession.startedAt) / 1000);
    $('viewTimeInfo').innerHTML = `⏱ Đã xem: <strong>${Math.floor(elapsed / 60)} phút ${elapsed % 60} giây</strong>`;
  }, 1000);
}

async function closeEssayModal() {
  if (state.currentViewSession) {
    const elapsed = Math.round((Date.now() - state.currentViewSession.startedAt) / 1000);
    if (state.currentViewSession.heartbeatInterval) clearInterval(state.currentViewSession.heartbeatInterval);
    if (state.currentViewSession.tickInterval) clearInterval(state.currentViewSession.tickInterval);
    try {
      await updateDoc(doc(db, 'viewLogs', state.currentViewSession.logId), {
        durationSec: elapsed,
        closedAt: serverTimestamp()
      });
    } catch (e) {}
    state.currentViewSession = null;
  }
  $('htmlFrame').src = 'about:blank';
  hide($('htmlModal'));
}