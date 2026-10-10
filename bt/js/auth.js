import {
  auth, db, TEACHER_EMAIL,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  doc, setDoc, getDoc, updateDoc, serverTimestamp
} from './firebase-init.js';
import { state, emit, EVENTS } from './state.js';
import {
  $, show, hide, esc, toast,
  buildClassName, getGradeFromClass
} from './utils.js';

let authMode = 'login';
let forgotCooldown = 0;
let forgotCooldownInterval = null;

// ══════════════════════════════════════════
// INIT AUTH
// ══════════════════════════════════════════
export function initAuth({ onLogin, onLogout }) {
  // AUTH BUTTON
  $('authBtn')?.addEventListener('click', () => {
    if (state.currentUser) {
      signOut(auth).then(() => toast('Đã đăng xuất'));
    } else {
      openAuthModal('login');
    }
  });

  // MODAL CLOSE
  $('authCancelBtn')?.addEventListener('click', () => hide($('authModal')));
  $('authModalCloseX')?.addEventListener('click', () => hide($('authModal')));
  $('authModal')?.addEventListener('click', (e) => {
    if (e.target === $('authModal')) hide($('authModal'));
  });

  // TOGGLE LOGIN/REGISTER
  $('toggleAuthMode')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthModal(authMode === 'login' ? 'register' : 'login');
  });

  // FORGOT PASSWORD
  $('forgotPasswordLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    showForgotForm();
  });
  $('forgotBackBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    hideForgotForm();
  });
  $('forgotSubmitBtn')?.addEventListener('click', handleForgotPassword);
  $('forgotEmail')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleForgotPassword(); }
  });

  // AUTH SUBMIT
  $('authSubmitBtn')?.addEventListener('click', handleAuthSubmit);
  $('authPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && authMode === 'login') {
      e.preventDefault();
      handleAuthSubmit();
    }
  });

  // PREVIEW CLASS NAME
  $('authGrade')?.addEventListener('change', updateAuthClassPreview);
  $('authClassNum')?.addEventListener('input', updateAuthClassPreview);

  // AUTH STATE CHANGE
  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;
    // ⭐ v2: dừng poll cũ nếu có
    stopVerifyWatch();
    if (user) {
      await loadUserProfile(user);
      await loadGlobalSettings();
      updateUIForUser();
      if (onLogin) await onLogin(user, state.currentProfile, state.globalSettings);
    } else {
      state.currentProfile = null;
      updateUIForGuest();
      if (onLogout) onLogout();
    }
    emit(user ? EVENTS.USER_LOGIN : EVENTS.USER_LOGOUT, { user, profile: state.currentProfile });
  });

  // VERIFY EMAIL — nút thủ công
  $('resendVerifyBtn')?.addEventListener('click', async () => {
    if (!state.currentUser) return;
    try {
      await sendEmailVerification(state.currentUser);
      toast('📧 Đã gửi lại email xác thực!', 'success');
    } catch (err) {
      toast('Lỗi: ' + err.message, 'error');
    }
  });
  $('checkVerifiedBtn')?.addEventListener('click', async () => {
    if (!state.currentUser) return;
    await state.currentUser.reload();
    if (state.currentUser.emailVerified) {
      await markVerified();
    } else {
      toast('Email chưa xác thực. Kiểm tra hộp thư (cả Spam).', 'error');
    }
  });
}

// ⭐ v2: Theo dõi xác thực bằng sự kiện (thay poll 5s)
function startVerifyWatch() {
  stopVerifyWatch();
  const check = async () => {
    if (!state.currentUser || state.currentUser.emailVerified) return;
    try {
      await state.currentUser.reload();
      if (state.currentUser.emailVerified) await markVerified();
    } catch (e) {}
  };
  state._verifyOnFocus = check;
  state._verifyOnVis = () => { if (document.visibilityState === 'visible') check(); };
  window.addEventListener('focus', state._verifyOnFocus);
  document.addEventListener('visibilitychange', state._verifyOnVis);
}
function stopVerifyWatch() {
  if (state._verifyOnFocus) window.removeEventListener('focus', state._verifyOnFocus);
  if (state._verifyOnVis) document.removeEventListener('visibilitychange', state._verifyOnVis);
  state._verifyOnFocus = null;
  state._verifyOnVis = null;
}
async function markVerified() {
  hide($('verifyBanner'));
  toast('🎉 Email đã xác thực!', 'success');
  try {
    await updateDoc(doc(db, 'users', state.currentUser.uid), { emailVerified: true });
    state.currentProfile.emailVerified = true;
  } catch (e) {}
  stopVerifyWatch();
  emit('verify:done');
}

// ══════════════════════════════════════════
// LOAD USER PROFILE
// ═════════════════════════════════════════
async function loadUserProfile(user) {
  const isTeacherEmail = user.email.toLowerCase() === TEACHER_EMAIL.toLowerCase();
  const snap = await getDoc(doc(db, 'users', user.uid));
  if (snap.exists()) {
    state.currentProfile = snap.data();
    if (isTeacherEmail && state.currentProfile.role !== 'teacher') {
      try {
        await updateDoc(doc(db, 'users', user.uid), { role: 'teacher' });
        state.currentProfile.role = 'teacher';
      } catch (e) {}
    }
  } else {
    state.currentProfile = {
      email: user.email,
      name: user.email,
      class: '',
      role: isTeacherEmail ? 'teacher' : 'student',
      emailVerified: user.emailVerified,
      createdAt: serverTimestamp()
    };
    try { await setDoc(doc(db, 'users', user.uid), state.currentProfile); } catch (e) {}
  }
  if (state.currentProfile.emailVerified !== user.emailVerified) {
    try {
      await updateDoc(doc(db, 'users', user.uid), { emailVerified: user.emailVerified });
      state.currentProfile.emailVerified = user.emailVerified;
    } catch (e) {}
  }
}

// ══════════════════════════════════════════
// UI FOR USER
// ══════════════════════════════════════════
function updateUIForUser() {
  $('authBtn').textContent = 'Đăng xuất';
  const isTeacher = state.currentProfile.role === 'teacher';
  if (isTeacher) {
    $('userLabel').textContent = state.currentProfile.name || state.currentUser.email;
    hide($('viewTabBtn'));
    hide($('submitTabBtn'));
    show($('teacherTabBtn'));
    show($('studentsTabBtn'));
    show($('assignmentsTabBtn'));
    hide($('verifyBanner'));
    hide($('changeClassBtn'));
    show($('gradeTabsWrap'));
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    $('teacherTabBtn').classList.add('active');
    $('tab-teacher').classList.add('active');
  } else {
    show($('viewTabBtn'));
    show($('submitTabBtn'));
    hide($('teacherTabBtn'));
    hide($('studentsTabBtn'));
    hide($('assignmentsTabBtn'));
    hide($('gradeTabsWrap'));
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    $('viewTabBtn').classList.add('active');
    $('tab-view').classList.add('active');
    if (state.globalSettings.allowChangeClass) show($('changeClassBtn'));
    else hide($('changeClassBtn'));
    const hsGrade = getGradeFromClass(state.currentProfile.class);
    const className = state.currentProfile.class || '';
    const name = state.currentProfile.name || state.currentUser.email;
    if (hsGrade) state.currentGrade = hsGrade;
    else toast('⚠️ Vui lòng cập nhật lớp để xem bài tập', 'error');
    $('userLabel').textContent = className ? `${name} · ${className}` : name;
    if (!state.currentUser.emailVerified) {
      show($('verifyBanner'));
      startVerifyWatch(); // ⭐ v2: sự kiện thay vì poll 5s
    } else {
      hide($('verifyBanner'));
    }
  }
}

function updateUIForGuest() {
  $('userLabel').textContent = 'Khách';
  $('authBtn').textContent = 'Đăng nhập';
  $('notificationBanners').innerHTML = '';
  show($('viewTabBtn'));
  show($('submitTabBtn'));
  hide($('teacherTabBtn'));
  hide($('studentsTabBtn'));
  hide($('assignmentsTabBtn'));
  hide($('verifyBanner'));
  hide($('changeClassBtn'));
  show($('gradeTabsWrap'));
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  $('viewTabBtn').classList.add('active');
  $('tab-view').classList.add('active');
}

async function loadGlobalSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'system'));
    if (snap.exists()) state.globalSettings = { ...state.globalSettings, ...snap.data() };
    else await setDoc(doc(db, 'settings', 'system'), { allowChangeClass: false, updatedAt: serverTimestamp() });
  } catch (e) { console.error('Load settings error:', e); }
}

export function openAuthModal(mode) {
  authMode = mode;
  $('authModalTitle').textContent = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';
  $('authSubmitBtn').textContent = mode === 'login' ? 'Đăng nhập' : 'Đăng ký';
  $('authNameGroup').classList.toggle('hidden', mode !== 'register');
  $('authClassGroup').classList.toggle('hidden', mode !== 'register');
  $('toggleAuthMode').textContent = mode === 'login'
    ? 'Chưa có tài khoản? Đăng ký'
    : 'Đã có tài khoản? Đăng nhập';
  $('authError').innerHTML = '';
  $('authSuccess').innerHTML = '';
  $('authFormWrap').classList.remove('hidden');
  $('forgotFormWrap').classList.add('hidden');
  if (mode === 'register') updateAuthClassPreview();
  show($('authModal'));
}

function showForgotForm() {
  $('authFormWrap').classList.add('hidden');
  $('forgotFormWrap').classList.remove('hidden');
  $('forgotError').innerHTML = '';
  $('forgotSuccess').innerHTML = '';
  const emailInput = $('authEmail').value.trim();
  if (emailInput) $('forgotEmail').value = emailInput;
  setTimeout(() => $('forgotEmail').focus(), 100);
}
function hideForgotForm() {
  $('forgotFormWrap').classList.add('hidden');
  $('authFormWrap').classList.remove('hidden');
  $('authError').innerHTML = '';
}

function updateAuthClassPreview() {
  const grade = $('authGrade').value;
  const num = $('authClassNum').value.trim();
  const previewEl = $('authClassPreview');
  if (!num) {
    previewEl.innerHTML = `💡 Gõ <strong>số lớp</strong> (VD: <code>12</code> → lớp <strong>${grade}a12</strong>)`;
    previewEl.style.color = '#666';
  } else {
    const result = buildClassName(grade, num);
    if (!result) {
      previewEl.innerHTML = '⚠️ Số lớp không hợp lệ (1-99)';
      previewEl.style.color = '#c0392b';
    } else {
      previewEl.innerHTML = `✅ Sẽ tạo lớp: <strong style="color:#0066CC;">${result}</strong>`;
      previewEl.style.color = '#666';
    }
  }
}

async function handleAuthSubmit() {
  const email = $('authEmail').value.trim();
  const pass = $('authPassword').value;
  $('authError').innerHTML = '';
  $('authSuccess').innerHTML = '';
  if (!email || pass.length < 6) {
    $('authError').innerHTML = '<div class="alert alert-error">Email hợp lệ và mật khẩu ≥ 6 ký tự.</div>';
    return;
  }
  const btn = $('authSubmitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Đang xử lý...';
  try {
    if (authMode === 'login') {
      await signInWithEmailAndPassword(auth, email, pass);
      toast('Đăng nhập thành công', 'success');
      hide($('authModal'));
    } else {
      const name = $('authName').value.trim();
      if (!name) {
        $('authError').innerHTML = '<div class="alert alert-error">Vui lòng nhập họ tên.</div>';
        return;
      }
      const grade = $('authGrade').value;
      const classNum = $('authClassNum').value.trim();
      let cls = grade;
      if (classNum) {
        cls = buildClassName(grade, classNum);
        if (!cls) {
          $('authError').innerHTML = '<div class="alert alert-error">Số lớp không hợp lệ (1-99).</div>';
          return;
        }
      }
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const isTeacher = email.toLowerCase() === TEACHER_EMAIL.toLowerCase();
      try { await sendEmailVerification(cred.user); } catch (e) { console.error(e); }
      await setDoc(doc(db, 'users', cred.user.uid), {
        email, name, class: cls,
        role: isTeacher ? 'teacher' : 'student',
        emailVerified: false,
        createdAt: serverTimestamp()
      });
      $('authSuccess').innerHTML = `<div class="alert alert-success">
        ✅ Đã tạo tài khoản! Mail xác thực gửi đến <strong>${esc(email)}</strong>.
        <br>Lớp: <strong>${esc(cls)}</strong>
      </div>`;
    }
  } catch (err) {
    $('authError').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Đăng nhập' : 'Đăng ký';
  }
}

async function handleForgotPassword() {
  if (forgotCooldown > 0) {
    toast(`Vui lòng chờ ${forgotCooldown}s trước khi gửi lại`, 'error');
    return;
  }
  const email = $('forgotEmail').value.trim();
  $('forgotError').innerHTML = '';
  $('forgotSuccess').innerHTML = '';
  if (!email) {
    $('forgotError').innerHTML = '<div class="alert alert-error">Vui lòng nhập email.</div>';
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    $('forgotError').innerHTML = '<div class="alert alert-error">Email không hợp lệ.</div>';
    return;
  }
  const btn = $('forgotSubmitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Đang gửi...';
  try {
    await sendPasswordResetEmail(auth, email, {
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: false
    });
    $('forgotSuccess').innerHTML = `
      <div class="alert alert-success">
        ✅ Đã gửi link đặt lại mật khẩu đến <strong>${esc(email)}</strong>.<br>
        📬 Vui lòng kiểm tra hộp thư (cả <em>Spam</em>).<br>
        ⏱ Link có hiệu lực trong <strong>1 giờ</strong>.
      </div>
    `;
    toast('📧 Đã gửi email đặt lại mật khẩu!', 'success');
    startForgotCooldown();
  } catch (err) {
    console.error('Password reset error:', err);
    let errMsg = err.message;
    if (err.code === 'auth/user-not-found') errMsg = 'Không tìm thấy tài khoản với email này.';
    else if (err.code === 'auth/invalid-email') errMsg = 'Email không hợp lệ.';
    else if (err.code === 'auth/too-many-requests') errMsg = 'Quá nhiều yêu cầu. Vui lòng thử lại sau vài phút.';
    $('forgotError').innerHTML = `<div class="alert alert-error">❌ ${esc(errMsg)}</div>`;
    btn.disabled = false;
    btn.textContent = '📧 Gửi link đặt lại';
  }
}
function startForgotCooldown() {
  forgotCooldown = 60;
  const btn = $('forgotSubmitBtn');
  btn.disabled = true;
  if (forgotCooldownInterval) clearInterval(forgotCooldownInterval);
  forgotCooldownInterval = setInterval(() => {
    forgotCooldown--;
    if (forgotCooldown <= 0) {
      clearInterval(forgotCooldownInterval);
      forgotCooldownInterval = null;
      btn.disabled = false;
      btn.textContent = '📧 Gửi link đặt lại';
    } else {
      btn.textContent = `⏳ Chờ ${forgotCooldown}s...`;
    }
  }, 1000);
}

export { auth, signOut, updateDoc, doc, serverTimestamp };