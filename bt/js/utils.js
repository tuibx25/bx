// ═══════════════════════════════════════════════════
// UTILS — HÀM TIỆN ÍCH DÙNG CHUNG (bản v3.0)
// ═══════════════════════════════════════════════════

export const $ = (id) => document.getElementById(id);
export const show = (el) => el?.classList.remove('hidden');
export const hide = (el) => el?.classList.add('hidden');

// ⭐ Escape HTML chuẩn — CHỐNG XSS (fallback nếu DOMPurify lỗi)
export const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// ═══════════════════════════════════════════════════
// ⭐ v3.0: SANITIZE HTML — dùng DOMPurify
//   - Dùng cho HTML do GV nhập (câu hỏi, đáp án)
//   - Giữ data-* (rất quan trọng: data-id, data-answer, data-points)
//   - Chặn script, iframe, object, form, event handler
//   - Fallback esc() nếu DOMPurify chưa load xong
// ═══════════════════════════════════════════════════
export function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  if (typeof window === 'undefined' || !window.DOMPurify) {
    // DOMPurify chưa load → fallback escape toàn bộ (an toàn nhưng mất format)
    console.warn('[utils] DOMPurify chưa load, fallback esc()');
    return esc(html);
  }
  return window.DOMPurify.sanitize(html, {
    ALLOW_DATA_ATTR: true,              // ⭐ giữ data-id, data-answer, data-points
    ADD_ATTR: ['target', 'rel'],        // cho phép link mở tab mới
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout',
      'onfocus', 'onblur', 'onchange', 'onsubmit', 'oninput',
      'onkeydown', 'onkeyup', 'onkeypress'
    ]
  });
}

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

// ═══════════════════════════════════════════════════
// ⭐ v3.0: resolveUrl — chặn scheme nguy hiểm
//   Trước: `javascript:alert(1)` có thể lọt vào iframe.src
//   Sau:   block ngay từ đầu
// ═══════════════════════════════════════════════════
export function resolveUrl(url) {
  if (!url) return '';
  url = url.trim();

  // Chặn scheme nguy hiểm ngay từ đầu
  if (/^(javascript|data|vbscript|file|blob):/i.test(url)) {
    console.warn('[utils] Blocked dangerous URL scheme:', url.slice(0, 60));
    return '';
  }

  if (/^https?:\/\//i.test(url)) return url;

  try {
    let cleanUrl = url;
    if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
    const resolved = new URL(cleanUrl, window.location.href);
    // Double-check scheme sau khi resolve
    if (!/^https?:$/i.test(resolved.protocol)) {
      console.warn('[utils] Blocked non-http(s) URL after resolve:', resolved.href.slice(0, 60));
      return '';
    }
    return resolved.href;
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

// ═══════════════════════════════════════════════════
// ⭐ v3.0: DIALOG HELPERS — thay thế native confirm/prompt
//   Native confirm/prompt bị chặn ở nhiều browser mobile
//   + Không đồng bộ style với web.
// ═══════════════════════════════════════════════════
export function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const title = options.title || '⚠️ Xác nhận';
    const okText = options.okText || 'Đồng ý';
    const cancelText = options.cancelText || 'Hủy';
    const danger = options.danger !== false;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '99999';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 480px;">
        <h2>${esc(title)}</h2>
        <div style="white-space: pre-wrap; font-size: 15px; line-height: 1.6; margin: 12px 0 20px;">${esc(message)}</div>
        <div class="modal-actions">
          <button class="btn btn-light" data-dialog-cancel>${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-dialog-ok>${esc(okText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelector('[data-dialog-ok]').addEventListener('click', () => cleanup(true));
    overlay.querySelector('[data-dialog-cancel]').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
    const keyHandler = (e) => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', keyHandler); cleanup(false); }
      if (e.key === 'Enter') { document.removeEventListener('keydown', keyHandler); cleanup(true); }
    };
    document.addEventListener('keydown', keyHandler);
  });
}

export function showPrompt(message, defaultValue = '', options = {}) {
  return new Promise((resolve) => {
    const title = options.title || '📝 Nhập thông tin';
    const placeholder = options.placeholder || '';
    const okText = options.okText || 'OK';
    const cancelText = options.cancelText || 'Hủy';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '99999';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 480px;">
        <h2>${esc(title)}</h2>
        <div style="white-space: pre-wrap; font-size: 15px; line-height: 1.6; margin: 12px 0;">${esc(message)}</div>
        <div class="form-group">
          <input type="text" data-dialog-input value="${esc(defaultValue)}" placeholder="${esc(placeholder)}" />
        </div>
        <div class="modal-actions">
          <button class="btn btn-light" data-dialog-cancel>${esc(cancelText)}</button>
          <button class="btn btn-primary" data-dialog-ok>${esc(okText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('[data-dialog-input]');
    setTimeout(() => { input.focus(); input.select(); }, 50);
    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelector('[data-dialog-ok]').addEventListener('click', () => cleanup(input.value));
    overlay.querySelector('[data-dialog-cancel]').addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cleanup(input.value);
      if (e.key === 'Escape') cleanup(null);
    });
  });
}

// ══════════════════════════════════════════
// ⭐ XÁO CÂU / XÁO ĐÁP ÁN THEO SEED
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

export function randomSeed() {
  return Math.floor(Math.random() * 1e9) + 1;
}

export function totalPoints(questions) {
  return Math.round((questions || []).reduce((s, q) => s + Number(q.points || 1), 0) * 100) / 100;
}

// ═══════════════════════════════════════════════════
// ⭐ MathJax — render công thức Toán/Lý cho modal
// ═══════════════════════════════════════════════════
export function typesetMath(container) {
  const render = (mj) => {
    if (!mj || typeof mj.typesetPromise !== 'function') return;
    const el = container || document.body;
    mj.typesetPromise([el]).catch(e => console.warn('MathJax typeset error:', e));
  };
  const tryRender = () => {
    if (!window.MathJax) return false;
    if (window.MathJax.startup?.promise) {
      window.MathJax.startup.promise.then(() => render(window.MathJax)).catch(() => {});
    } else {
      render(window.MathJax);
    }
    return true;
  };
  if (tryRender()) return;
  let n = 0;
  const timer = setInterval(() => {
    n++;
    if (tryRender() || n > 30) clearInterval(timer);
  }, 200);
}