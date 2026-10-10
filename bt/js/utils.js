// ═══════════════════════════════════════════════════
// UTILS — HÀM TIỆN ÍCH DÙNG CHUNG (bản đã sửa lỗi)
// ═══════════════════════════════════════════════════

export const $ = (id) => document.getElementById(id);
export const show = (el) => el?.classList.remove('hidden');
export const hide = (el) => el?.classList.add('hidden');

// ⭐ Escape HTML chuẩn — CHỐNG XSS (bản cũ chỗ này bị hỏng)
export const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// ⭐ Bảng lỗi tiếng Việt
const ERROR_MAP = {
  'auth/invalid-login-credentials': 'Email hoặc mật khẩu không đúng.',
  'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
  'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
  'auth/email-already-in-use': 'Email này đã được đăng ký.',
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/weak-password': 'Mật khẩu phải ít nhất 6 ký tự.',
  'auth/too-many-requests': 'Thao tác quá nhanh. Vui lòng chờ vài phút rồi thử lại.',
  'auth/quota-exceeded': 'Hệ thống gửi thư đang quá tải. Thử lại sau 15 phút hoặc báo GV.',
  'auth/network-request-failed': 'Mất kết nối mạng. Kiểm tra lại internet.',
  'auth/popup-blocked': 'Trình duyệt chặn cửa sổ bật lên. Vui lòng cho phép popup.',
  'permission-denied': 'Bạn không có quyền thực hiện thao tác này.',
  'unauthenticated': 'Vui lòng đăng nhập.',
  'failed-precondition': 'Điều kiện chưa hợp lệ để thực hiện.',
  'not-found': 'Không tìm thấy dữ liệu.',
  'invalid-argument': 'Dữ liệu gửi lên không hợp lệ.',
  'internal': 'Lỗi hệ thống. Thử lại sau ít phút.'
};

export function mapError(err) {
  const raw = (err && err.code) ? String(err.code) : '';
  const key = raw.replace(/^functions\//, '');
  return ERROR_MAP[key] || ERROR_MAP[raw] || (err && err.message) || 'Lỗi không xác định.';
}

export function toast(msg, type = 'info') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = type === 'error' ? '#c0392b'
    : type === 'success' ? '#0066CC'
    : '#8B4513';
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 3000);
}

export function normalizeClass(className) {
  if (!className) return '';
  return className.toString().trim().toLowerCase().replace(/[\s-_.]+/g, '');
}

export function getGradeFromClass(className) {
  const norm = normalizeClass(className);
  const m = norm.match(/^(10|11|12)/);
  return m ? m[1] : '';
}

export function buildClassName(grade, classNum) {
  if (!grade || !/^(10|11|12)$/.test(grade)) return null;
  const num = parseInt(classNum);
  if (!num || num < 1 || num > 99) return null;
  return `${grade}a${num}`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('vi-VN');
}

export function fmtDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s} giây`;
  return `${m} phút ${s} giây`;
}

// ⭐ Đồng hồ mm:ss
export function fmtClock(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function resolveUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (/^https?:\/\//i.test(url)) return url;
  try {
    let cleanUrl = url;
    if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
    return new URL(cleanUrl, window.location.href).href;
  } catch (e) { return url; }
}

export function convertGDriveUrl(url) {
  if (!url) return '';
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  return url;
}

export function isMobile() {
  return window.matchMedia('(max-width: 640px)').matches;
}

// ══════════════════════════════════════════
// ⭐ XÁO CÂU / XÁO ĐÁP ÁN THEO SEED
// (giữ nguyên data-id / value → chấm điểm không ảnh hưởng)
// ══════════════════════════════════════════
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyShuffle(questions, seed) {
  if (!seed) return questions;
  const rnd = mulberry32(seed);
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const groups = { choice: [], truefalse: [], short: [] };
  questions.forEach(q => { (groups[q.type] || (groups[q.type] = [])).push(q); });
  const result = [];
  ['choice', 'truefalse', 'short'].forEach(t => {
    let list = shuffle(groups[t] || []);
    if (t === 'choice') list = list.map(q => ({ ...q, options: shuffle(q.options) }));
    if (t === 'truefalse') list = list.map(q => ({ ...q, statements: shuffle(q.statements) }));
    result.push(...list);
  });
  return result;
}

// ⭐ v2.1: seed luôn ≥ 1 (seed 0 = không xáo, phải tránh)
export function randomSeed() {
  return Math.floor(Math.random() * 1e9) + 1;
}

// Tổng điểm tối đa của đề
export function totalPoints(questions) {
  return Math.round((questions || []).reduce((s, q) => s + Number(q.points || 1), 0) * 100) / 100;
}