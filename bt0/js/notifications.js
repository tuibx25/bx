import {
  db, collection, getDocs
} from './firebase-init.js';
import { state } from './state.js';
import { $, esc, fmtDate, normalizeClass } from './utils.js';

// ⭐ Tên hiển thị của người gửi thông báo
const ADMIN_DISPLAY_NAME = 'Admin';

const HIDDEN_NOTIFS_KEY = 'hiddenNotifications';

function getHiddenNotifs() {
  try {
    const raw = localStorage.getItem(HIDDEN_NOTIFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function hideNotifLocally(notifId) {
  const hidden = getHiddenNotifs();
  if (!hidden.includes(notifId)) {
    hidden.push(notifId);
    localStorage.setItem(HIDDEN_NOTIFS_KEY, JSON.stringify(hidden));
  }
}

export async function loadNotificationsForUser() {
  const wrap = $('notificationBanners');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!state.currentUser || state.currentProfile?.role === 'teacher') return;
  if (!state.currentUser.emailVerified) return;

  try {
    const snap = await getDocs(collection(db, 'notifications'));
    const allNotifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const myClassNorm = normalizeClass(state.currentProfile.class);
    const hidden = getHiddenNotifs();

    const visible = allNotifs.filter(n => {
      if (hidden.includes(n.id)) return false;
      if (n.sendToAll === true) return true;
      if (n.targetClasses && n.targetClasses.length > 0) {
        return n.targetClasses.some(c => normalizeClass(c) === myClassNorm);
      }
      return false;
    });

    visible.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    if (visible.length === 0) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = visible.map(n => `
      <div class="notification-banner" data-notif-id="${n.id}">
        <div class="nb-icon">📢</div>
        <div class="nb-body">
          <div class="nb-title">${esc(n.title)}</div>
          <div class="nb-content">${esc(n.content)}</div>
          <div class="nb-meta">
            👨‍🏫 ${ADMIN_DISPLAY_NAME} • ${fmtDate(n.createdAt)}
          </div>
        </div>
        <button class="nb-close" data-hide-notif="${n.id}" title="Ẩn thông báo này">×</button>
      </div>
    `).join('');

    wrap.querySelectorAll('[data-hide-notif]').forEach(btn => {
      btn.addEventListener('click', () => {
        const notifId = btn.dataset.hideNotif;
        hideNotifLocally(notifId);
        const banner = btn.closest('.notification-banner');
        if (banner) {
          banner.style.transition = 'opacity 0.3s, transform 0.3s';
          banner.style.opacity = '0';
          banner.style.transform = 'translateX(-20px)';
          setTimeout(() => banner.remove(), 300);
        }
      });
    });
  } catch (e) {
    console.error('Load notifications error:', e);
  }
}