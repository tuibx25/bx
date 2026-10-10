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
  console.log('🔐 initAuth called');
  
  // DEBUG: Kiểm tra element tồn tại
  const authBtn = $('authBtn');
  const authModal = $('authModal');
  
  if (!authBtn) {
    console.error('❌ authBtn không tồn tại trong DOM!');
  } else {
    console.log('✅ authBtn tìm thấy:', authBtn);
  }
  
  if (!authModal) {
    console.error('❌ authModal không tồn tại trong DOM!');
  } else {
    console.log('✅ authModal tìm thấy:', authModal);
  }

  // AUTH BUTTON
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      console.log('🖱️ authBtn clicked');
      if (state.currentUser) {
        console.log('👤 User đã đăng nhập, đăng xuất...');
        signOut(auth).then(() => toast('Đã đăng xuất'));
      } else {
        console.log(' User chưa đăng nhập, mở modal...');
        openAuthModal('login');
      }
    });
  }

  // MODAL CLOSE
  $('authCancelBtn')?.addEventListener('click', () => {
    console.log('❌ Đóng modal (cancel)');
    hide($('authModal'));
  });
  $('authModalCloseX')?.addEventListener('click', () => {
    console.log('❌ Đóng modal (X)');
    hide($('authModal'));
  });
  $('authModal')?.addEventListener('click', (e) => {
    if (e.target === $('authModal')) {
      console.log('❌ Đóng modal (click outside)');
      hide($('authModal'));
    }
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
    console.log('🔑 Auth state changed:', user ? 'logged in' : 'logged out');
    state.currentUser = user;
    if (state.verifyPollInterval) {
      clearInterval(state.verifyPollInterval);
      state.verifyPollInterval = null;
    }
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

  // VERIFY EMAIL
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
      hide($('verifyBanner'));
      toast('🎉 Email đã xác thực!', 'success');
      try {
        await updateDoc(doc(db, 'users', state.currentUser.uid), { emailVerified: true });
        state.currentProfile.emailVerified = true;
      } catch (e) {}
      emit('verify:done');
    } else {
      toast('Email chưa xác thực.', 'error');
    }
  });
}

// ══════════════════════════════════════════
// OPEN AUTH MODAL
// ══════════════════════════════════════════
export function openAuthModal(mode) {
  console.log('🔓 openAuthModal called với mode:', mode);
  
  const authModal = $('authModal');
  if (!authModal) {
    console.error('❌ authModal không tồn tại!');
    toast('Lỗi: Modal đăng nhập không tồn tại', 'error');
    return;
  }
  
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
  
  console.log('✅ Hiển thị modal, class list:', authModal.classList.toString());
  show(authModal);
  console.log('✅ Sau khi show, class list:', authModal.classList.toString());
}

// ... (giữ nguyên các hàm khác)