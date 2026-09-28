export const $ = (id) => document.getElementById(id);
export const show = (el) => el?.classList.remove('hidden');
export const hide = (el) => el?.classList.add('hidden');
export const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

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
  return className.toString().trim().toLowerCase().replace(/[\s\-_.]+/g, '');
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