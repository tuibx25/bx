import {
  db, collection, getDocs, doc, deleteDoc, updateDoc,
  query, where, writeBatch, serverTimestamp
} from './firebase-init.js';
import { state } from './state.js';
import {
  $, esc, toast, fmtDate, getGradeFromClass,
  showConfirm, showPrompt
} from './utils.js';
import {
  loadAllRosters, clearRostersCache, matchStudentToRoster,
  getRosterForClass, parseRosterText, saveRoster, deleteRoster,
  getUnregisteredInRoster, getExtraUsersInClass, normalizeName
} from './roster.js';

const FIREBASE_PROJECT_ID = 'vlpt-bx';

// ══════════════════════════════════════════
// RENDER TAB
// ══════════════════════════════════════════
export function renderStudentsTab() {
  const tab = $('tab-students');
  if (!tab) return;

  tab.innerHTML = `
    <div class="card">
      <div class="space-between mb-2" style="flex-wrap:wrap; gap:8px;">
        <h3>👥 Quản Lý Học Sinh</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" id="uploadRosterBtn">📥 Nạp danh sách lớp</button>
          <button class="btn btn-light btn-sm" id="refreshStudentsBtn">🔄 Tải lại</button>
        </div>
      </div>

      <div class="alert alert-info" style="margin-bottom:12px;">
        💡 <strong>📥 Nạp danh sách lớp</strong>: Dán text danh sách HS theo mẫu
        <code>1. Nguyễn Văn An</code> (mỗi HS 1 dòng). Dùng để:
        <br>• Đối chiếu tên HS đã đăng ký với danh sách lớp
        <br>• Sắp xếp sổ điểm theo đúng thứ tự STT
        <br>• Phát hiện HS nào chưa đăng ký
      </div>

      <div class="filter-bar">
        <label>📚 Khối:</label>
        <select id="stuFilterGrade">
          <option value="all">Tất cả khối</option>
          <option value="10">Khối 10</option>
          <option value="11">Khối 11</option>
          <option value="12">Khối 12</option>
          <option value="none">Chưa có lớp</option>
        </select>

        <label>🏫 Lớp:</label>
        <select id="stuFilterClass"><option value="all">Tất cả lớp</option></select>

        <label>📧 Xác thực:</label>
        <select id="stuFilterVerified">
          <option value="all">Tất cả</option>
          <option value="verified">Đã xác thực</option>
          <option value="unverified">Chưa xác thực</option>
        </select>

        <label>🚦 Hiển thị:</label>
        <select id="stuFilterHidden">
          <option value="active">✅ Đang hoạt động</option>
          <option value="hidden">🙈 Đã ẩn</option>
          <option value="all">📋 Tất cả</option>
        </select>

        <label>📋 Danh sách:</label>
        <select id="stuFilterRoster">
          <option value="all">Tất cả</option>
          <option value="matched">✅ Khớp danh sách</option>
          <option value="unmatched">❌ Không khớp</option>
        </select>

        <input type="text" id="stuSearchInput" placeholder="🔍 Tìm theo tên/email..." />
        <button class="btn btn-light btn-sm" id="stuExpandAll">📂 Mở hết</button>
        <button class="btn btn-light btn-sm" id="stuCollapseAll">📁 Thu gọn</button>
        <span class="count" id="stuResultCount"></span>
      </div>

      <div id="userManagementTree"></div>
    </div>
  `;

  $('refreshStudentsBtn').addEventListener('click', loadUserManagement);
  $('uploadRosterBtn').addEventListener('click', () => openRosterUploadModal(''));
  ['stuFilterGrade','stuFilterVerified','stuFilterHidden','stuFilterRoster'].forEach(id => {
    $(id).addEventListener('change', renderStudentsTree);
  });
  $('stuSearchInput').addEventListener('input', renderStudentsTree);
  $('stuFilterClass').addEventListener('change', renderStudentsTree);
  $('stuExpandAll').addEventListener('click', () => {
    document.querySelectorAll('#userManagementTree .tree-body').forEach(b => b.classList.remove('collapsed'));
    document.querySelectorAll('#userManagementTree .tree-header').forEach(h => h.classList.remove('collapsed'));
  });
  $('stuCollapseAll').addEventListener('click', () => {
    document.querySelectorAll('#userManagementTree .tree-body').forEach(b => b.classList.add('collapsed'));
    document.querySelectorAll('#userManagementTree .tree-header').forEach(h => h.classList.add('collapsed'));
  });

  loadUserManagement();
}

// ══════════════════════════════════════════
// LOAD
// ══════════════════════════════════════════
async function loadUserManagement() {
  const wrap = $('userManagementTree');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';

  try {
    await loadAllRosters(true);
    const usersSnap = await getDocs(collection(db, 'users'));

    state.studentsCache = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.role === 'student');

    const classSet = new Set();
    state.studentsCache.forEach(u => { if (u.class) classSet.add(u.class); });
    const classes = Array.from(classSet).sort();

    const classSelect = $('stuFilterClass');
    if (classSelect) {
      const currentVal = classSelect.value;
      classSelect.innerHTML = '<option value="all">Tất cả lớp</option>' +
        classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      if (classes.includes(currentVal)) classSelect.value = currentVal;
    }

    renderStudentsTree();
  } catch (err) {
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

function isNameLikelyEmail(name, email) {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  const e = (email || '').trim().toLowerCase();
  if (!n) return true;
  if (n === e) return true;
  if (n.includes('@')) return true;
  return false;
}

// ══════════════════════════════════════════
// RENDER TREE
// ══════════════════════════════════════════
function renderStudentsTree() {
  const wrap = $('userManagementTree');
  if (!wrap) return;

  const filterGrade = $('stuFilterGrade')?.value || 'all';
  const filterClass = $('stuFilterClass')?.value || 'all';
  const filterVerified = $('stuFilterVerified')?.value || 'all';
  const filterHidden = $('stuFilterHidden')?.value || 'active';
  const filterRoster = $('stuFilterRoster')?.value || 'all';
  const keyword = ($('stuSearchInput')?.value || '').toLowerCase().trim();

  let filtered = [...state.studentsCache];

  if (filterHidden === 'active') filtered = filtered.filter(u => u.hidden !== true);
  else if (filterHidden === 'hidden') filtered = filtered.filter(u => u.hidden === true);

  if (filterGrade !== 'all') {
    if (filterGrade === 'none') filtered = filtered.filter(u => !u.class || !getGradeFromClass(u.class));
    else filtered = filtered.filter(u => getGradeFromClass(u.class) === filterGrade);
  }
  if (filterClass !== 'all') filtered = filtered.filter(u => u.class === filterClass);
  if (filterVerified === 'verified') filtered = filtered.filter(u => u.emailVerified === true);
  else if (filterVerified === 'unverified') filtered = filtered.filter(u => u.emailVerified !== true);

  if (keyword) {
    filtered = filtered.filter(u =>
      (u.name || '').toLowerCase().includes(keyword) ||
      (u.email || '').toLowerCase().includes(keyword)
    );
  }

  // Filter theo trạng thái roster
  if (filterRoster === 'matched') {
    filtered = filtered.filter(u => {
      const m = matchStudentToRoster(u.name, u.class);
      return m && m.matched;
    });
  } else if (filterRoster === 'unmatched') {
    filtered = filtered.filter(u => {
      const m = matchStudentToRoster(u.name, u.class);
      return m && !m.matched;
    });
  }

  // Sort theo STT roster (nếu có), rồi theo tên
  filtered.sort((a, b) => {
    const aHidden = a.hidden === true ? 1 : 0;
    const bHidden = b.hidden === true ? 1 : 0;
    if (aHidden !== bHidden) return aHidden - bHidden;
    const mA = matchStudentToRoster(a.name, a.class);
    const mB = matchStudentToRoster(b.name, b.class);
    const sttA = mA?.matched ? mA.stt : 9999;
    const sttB = mB?.matched ? mB.stt : 9999;
    if (sttA !== sttB) return sttA - sttB;
    return (a.name || '').localeCompare(b.name || '', 'vi');
  });

  const byGrade = { '10': {}, '11': {}, '12': {}, 'none': {} };
  filtered.forEach(u => {
    const g = getGradeFromClass(u.class) || 'none';
    const cls = u.class || '(Chưa có lớp)';
    if (!byGrade[g][cls]) byGrade[g][cls] = [];
    byGrade[g][cls].push(u);
  });

  const totalActive = state.studentsCache.filter(u => u.hidden !== true).length;
  const totalHidden = state.studentsCache.filter(u => u.hidden === true).length;
  const countText = filterHidden === 'hidden'
    ? `Hiển thị ${filtered.length}/${totalHidden} HS đã ẩn`
    : filterHidden === 'active'
    ? `Hiển thị ${filtered.length}/${totalActive} HS đang HĐ`
    : `Hiển thị ${filtered.length}/${state.studentsCache.length} HS (${totalHidden} ẩn)`;
  $('stuResultCount').textContent = countText;

  if (filtered.length === 0) {
    const msg = filterHidden === 'hidden' && totalHidden === 0
      ? '📭 Chưa có HS nào bị ẩn.'
      : 'Không tìm thấy học sinh nào.';
    wrap.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }

  const gradeNames = { '10': '📚 Khối 10', '11': '📚 Khối 11', '12': '📚 Khối 12', 'none': '❓ Chưa có lớp' };
  const gradeOrder = ['10', '11', '12', 'none'];

  let html = '';
  gradeOrder.forEach(g => {
    const classesInGrade = byGrade[g];
    const totalInGrade = Object.values(classesInGrade).reduce((s, arr) => s + arr.length, 0);
    if (totalInGrade === 0) return;

    html += `
      <div class="tree-group">
        <div class="tree-header lv1">
          <div class="tree-title"><span>${gradeNames[g]}</span></div>
          <div class="tree-badges">
            <span class="count-badge">${Object.keys(classesInGrade).length} lớp</span>
            <span class="count-badge">${totalInGrade} HS</span>
            <span class="tree-toggle">▼</span>
          </div>
        </div>
        <div class="tree-body">
    `;

    Object.keys(classesInGrade).sort().forEach(cls => {
      const students = classesInGrade[cls];
      const vCount = students.filter(s => s.emailVerified === true).length;
      const uCount = students.length - vCount;
      const hCount = students.filter(s => s.hidden === true).length;

      const hasRosterClass = !!getRosterForClass(cls);
      const rosterUnreg = hasRosterClass ? getUnregisteredInRoster(cls, state.studentsCache) : [];
      const rosterExtra = hasRosterClass ? getExtraUsersInClass(cls, state.studentsCache) : [];
      const rosterInfo = hasRosterClass
        ? `<button class="btn btn-light btn-sm" data-view-roster="${esc(cls)}" style="margin-left:auto;">
             📋 Xem danh sách lớp
             ${rosterUnreg.length > 0 ? `<span class="badge" style="background:#c0392b; color:#FFF; margin-left:4px;">${rosterUnreg.length} chưa ĐK</span>` : ''}
             ${rosterExtra.length > 0 ? `<span class="badge" style="background:#D4A017; color:#FFF; margin-left:4px;">${rosterExtra.length} lạ</span>` : ''}
           </button>`
        : `<button class="btn btn-light btn-sm" data-upload-roster-for="${esc(cls)}" style="margin-left:auto;">
             📥 Nạp danh sách
           </button>`;

      html += `
        <div class="tree-group" style="margin:0; border:none; border-radius:0; box-shadow:none; border-top:1px solid #E0E0E0;">
          <div class="tree-header lv2">
            <div class="tree-title"><span>🏫 ${esc(cls)}</span></div>
            <div class="tree-badges">
              ${vCount > 0 ? `<span class="count-badge" style="background:#0066CC;">✓ ${vCount}</span>` : ''}
              ${uCount > 0 ? `<span class="count-badge" style="background:#999;">⏳ ${uCount}</span>` : ''}
              ${hCount > 0 ? `<span class="count-badge" style="background:#c0392b;">🙈 ${hCount}</span>` : ''}
              <span class="count-badge">${students.length} HS</span>
              ${rosterInfo}
              <span class="tree-toggle">▼</span>
            </div>
          </div>
          <div class="tree-body">
            ${students.map(s => renderStudentRow(s)).join('')}
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  wrap.innerHTML = html;

  // Bind tree toggle
  wrap.querySelectorAll('.tree-header').forEach(h => {
    h.addEventListener('click', (e) => {
      if (e.target.closest('[data-view-roster]') || e.target.closest('[data-upload-roster-for]')) return;
      e.stopPropagation();
      h.classList.toggle('collapsed');
      const body = h.nextElementSibling;
      if (body) body.classList.toggle('collapsed');
    });
  });

  // Bind roster buttons
  wrap.querySelectorAll('[data-view-roster]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRosterViewModal(btn.dataset.viewRoster);
    });
  });
  wrap.querySelectorAll('[data-upload-roster-for]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRosterUploadModal(btn.dataset.uploadRosterFor);
    });
  });

  // Bind action buttons
  wrap.querySelectorAll('[data-edit-name]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const st = state.studentsCache.find(x => x.id === btn.dataset.editName);
      if (st) await editStudentName(st);
    });
  });
  wrap.querySelectorAll('[data-hide-user]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const st = state.studentsCache.find(x => x.id === btn.dataset.hideUser);
      if (st) await hideStudent(st);
    });
  });
  wrap.querySelectorAll('[data-unhide-user]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const st = state.studentsCache.find(x => x.id === btn.dataset.unhideUser);
      if (st) await unhideStudent(st);
    });
  });
}

// ══════════════════════════════════════════
// RENDER 1 ROW HS — có badge roster
// ══════════════════════════════════════════
function renderStudentRow(s) {
  const verified = s.emailVerified === true;
  const verBadge = verified
    ? '<span class="badge badge-verified">✅ Đã xác thực</span>'
    : '<span class="badge badge-unverified">⏳ Chưa xác thực</span>';
  const nameIsEmail = isNameLikelyEmail(s.name, s.email);
  const nameWarning = nameIsEmail
    ? '<span class="badge" style="background:#c0392b; color:#FFF; margin-left:6px;">⚠️ Tên chưa đặt</span>'
    : '';
  const displayName = nameIsEmail
    ? `<em style="color:#999;">(chưa đặt tên — đang hiển thị email)</em>`
    : esc(s.name);
  const isHidden = s.hidden === true;
  const hiddenBadge = isHidden
    ? '<span class="badge" style="background:#999; color:#FFF; margin-left:6px;">🙈 Đã ẩn</span>'
    : '';
  const hiddenInfo = isHidden
    ? `<div class="text-xs" style="color:#c0392b; margin-top:4px;">
        🚫 Đã ẩn lúc: ${fmtDate(s.hiddenAt)}${s.hiddenReason ? ` • 📝 ${esc(s.hiddenReason)}` : ''}
      </div>`
    : '';

  // Roster badge
  const match = matchStudentToRoster(s.name, s.class);
  let rosterBadge = '';
  if (match === null) {
    rosterBadge = '<span class="badge" style="background:#ddd; color:#666; margin-left:6px;">📋 Chưa có danh sách</span>';
  } else if (match.matched) {
    rosterBadge = `<span class="badge" style="background:#2E7D32; color:#FFF; margin-left:6px;">✅ STT ${match.stt}</span>`;
  } else {
    rosterBadge = '<span class="badge" style="background:#c0392b; color:#FFF; margin-left:6px;">❌ Không có trong danh sách</span>';
  }

  return `
    <div class="student-row ${isHidden ? 'hidden-item' : ''}" ${isHidden ? 'style="opacity:0.75; background:#FAF5F5;"' : ''}>
      <div class="s-info">
        <div class="s-name">
          <strong>${displayName}</strong>
          ${nameWarning}${hiddenBadge}${rosterBadge}
        </div>
        <div class="s-meta">📧 ${esc(s.email)} • ĐK: ${fmtDate(s.createdAt)}</div>
        <div style="margin-top:4px;">${verBadge}</div>
        ${hiddenInfo}
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-light btn-sm" data-edit-name="${s.id}">✏️ Sửa tên</button>
        ${isHidden
          ? `<button class="btn btn-success btn-sm" data-unhide-user="${s.id}">👁 Bỏ ẩn</button>`
          : `<button class="btn btn-light btn-sm" data-hide-user="${s.id}">🙈 Ẩn</button>`
        }
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════
// MODAL: NẠP DANH SÁCH LỚP
// ══════════════════════════════════════════
function openRosterUploadModal(prefilledClass = '') {
  const existing = $('rosterUploadModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'rosterUploadModal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '1100';
  modal.innerHTML = `
    <div class="modal modal-large" style="max-width: 700px;">
      <div class="modal-header">
        <h2>📥 Nạp danh sách lớp</h2>
        <button class="btn btn-light btn-sm" data-close-roster>✖ Đóng</button>
      </div>

      <div class="alert alert-info">
        💡 <strong>Cách dùng:</strong> Copy danh sách HS từ Excel/Word → paste vào ô bên dưới.
        <br>Mỗi HS 1 dòng, có thể có STT hoặc không.
        <br><strong>Ví dụ:</strong>
        <pre style="background:#FFF; padding:8px; border-radius:4px; margin-top:6px; font-size:12px;">1. Nguyễn Văn An
2. Trần Thị Bình
3. Lê Văn Cường</pre>
      </div>

      <div class="form-group">
        <label>🏫 Lớp *</label>
        <input type="text" id="rosterClassInput" value="${esc(prefilledClass)}"
               placeholder="VD: 10a1" />
        <div class="hint">Nhập đúng mã lớp (VD: 10a1, 11a5, 12a3)</div>
      </div>

      <div class="form-group">
        <label>📋 Dán danh sách HS *</label>
        <textarea id="rosterTextInput"
                  style="min-height: 250px; font-family: monospace; font-size: 13px;"
                  placeholder="1. Nguyễn Văn An&#10;2. Trần Thị Bình&#10;3. Lê Văn Cường"></textarea>
      </div>

      <div class="form-group">
        <label>📁 Hoặc upload file .txt</label>
        <input type="file" id="rosterFileInput" accept=".txt,.csv" />
        <div class="hint">File text/CSV chứa danh sách HS</div>
      </div>

      <div id="rosterPreview"></div>

      <div class="modal-actions">
        <button class="btn btn-light" data-close-roster>Hủy</button>
        <button class="btn btn-light" id="rosterPreviewBtn">🔍 Xem trước</button>
        <button class="btn btn-primary" id="rosterSaveBtn">💾 Lưu danh sách</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close-roster]').forEach(b => {
    b.addEventListener('click', () => modal.remove());
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  modal.querySelector('#rosterFileInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const txt = await f.text();
    modal.querySelector('#rosterTextInput').value = txt;
    toast('✅ Đã đọc file: ' + f.name, 'success');
  });

  modal.querySelector('#rosterPreviewBtn').addEventListener('click', () => {
    const text = modal.querySelector('#rosterTextInput').value;
    const result = parseRosterText(text);
    const preview = modal.querySelector('#rosterPreview');
    if (result.students.length === 0) {
      preview.innerHTML = '<div class="alert alert-error">❌ Không có HS nào. Kiểm tra lại định dạng.</div>';
      return;
    }
    let html = `<div class="alert alert-success">✅ Nhận diện ${result.students.length} HS</div>`;
    if (result.errors.length > 0) {
      html += `<div class="alert alert-warn"><strong>⚠️ ${result.errors.length} dòng lỗi:</strong><ul style="margin-left:20px;">${result.errors.slice(0,5).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    }
    html += `<div style="max-height: 250px; overflow-y: auto; border: 1px solid #D3D3D3; border-radius: 6px; padding: 10px; background: #FAFAFA;">`;
    result.students.forEach(s => {
      html += `<div style="padding:4px 0; border-bottom:1px solid #EEE; font-size:13px;">
        <strong style="color:#8B5A2B; min-width:35px; display:inline-block;">${s.stt}.</strong>
        ${esc(s.name)}
      </div>`;
    });
    html += '</div>';
    preview.innerHTML = html;
  });

  modal.querySelector('#rosterSaveBtn').addEventListener('click', async () => {
    const className = modal.querySelector('#rosterClassInput').value.trim();
    const text = modal.querySelector('#rosterTextInput').value;

    if (!className) { toast('Vui lòng nhập lớp', 'error'); return; }
    if (!/^(10|11|12)a\d{1,2}$/.test(className)) {
      toast('Lớp không hợp lệ. VD đúng: 10a1, 11a5, 12a3', 'error'); return;
    }

    const result = parseRosterText(text);
    if (result.students.length === 0) {
      toast('Không có HS nào để lưu', 'error'); return;
    }

    const existing = getRosterForClass(className);
    if (existing) {
      const ok = await showConfirm(
        `Lớp ${className} đã có danh sách ${existing.students?.length || 0} HS.\n\nGhi đè bằng danh sách mới ${result.students.length} HS?`,
        { title: '📋 Ghi đè danh sách?', okText: 'Ghi đè', danger: true }
      );
      if (!ok) return;
    }

    const btn = modal.querySelector('#rosterSaveBtn');
    btn.disabled = true; btn.textContent = '⏳ Đang lưu...';
    try {
      await saveRoster(className, result.students);
      toast(`✅ Đã lưu danh sách lớp ${className} — ${result.students.length} HS`, 'success');
      modal.remove();
      loadUserManagement();
    } catch (err) {
      toast('Lỗi: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = '💾 Lưu danh sách';
    }
  });
}

// ══════════════════════════════════════════
// MODAL: XEM DANH SÁCH LỚP + TRẠNG THÁI ĐĂNG KÝ
// ══════════════════════════════════════════
function openRosterViewModal(className) {
  const roster = getRosterForClass(className);
  if (!roster) { toast('Chưa có danh sách lớp ' + className, 'error'); return; }

  const existing = $('rosterViewModal');
  if (existing) existing.remove();

  const unreg = getUnregisteredInRoster(className, state.studentsCache);
  const extra = getExtraUsersInClass(className, state.studentsCache);

  const modal = document.createElement('div');
  modal.id = 'rosterViewModal';
  modal.className = 'modal-overlay';
  modal.style.zIndex = '1100';

  let studentsHtml = (roster.students || []).map(entry => {
    const isUnreg = unreg.some(u => u.stt === entry.stt);
    return `<div style="padding:8px 12px; border-bottom:1px solid #EEE; display:flex; justify-content:space-between; align-items:center; ${isUnreg ? 'background:#FFF5F5;' : ''}">
      <div><strong style="color:#8B5A2B; min-width:35px; display:inline-block;">${entry.stt}.</strong> ${esc(entry.name)}</div>
      ${isUnreg ? '<span class="badge" style="background:#c0392b; color:#FFF;">⚠️ Chưa đăng ký</span>' : '<span class="badge" style="background:#2E7D32; color:#FFF;">✅ Đã đăng ký</span>'}
    </div>`;
  }).join('');

  let extraHtml = '';
  if (extra.length > 0) {
    extraHtml = `<div class="alert alert-warn" style="margin-top:12px;">
      ⚠️ <strong>${extra.length} HS đăng ký nhưng KHÔNG có trong danh sách lớp:</strong>
      <ul style="margin-left:20px; margin-top:6px;">
        ${extra.map(u => `<li>${esc(u.name)} <small style="color:#666;">(${esc(u.email)})</small></li>`).join('')}
      </ul>
      <div style="margin-top:8px; font-size:13px;">💡 Có thể HS đăng ký sai lớp hoặc tên khác danh sách. Vào danh sách HS → bấm <strong>✏️ Sửa tên</strong> để khớp.</div>
    </div>`;
  }

  modal.innerHTML = `
    <div class="modal modal-large" style="max-width: 700px;">
      <div class="modal-header">
        <h2>📋 Danh sách lớp ${esc(className)}</h2>
        <button class="btn btn-light btn-sm" data-close-roster>✖ Đóng</button>
      </div>

      <div class="alert ${unreg.length > 0 ? 'alert-warn' : 'alert-success'}">
        ${unreg.length > 0
          ? `⚠️ <strong>${unreg.length}/${roster.students.length} HS chưa đăng ký tài khoản</strong>`
          : `✅ Tất cả ${roster.students.length} HS đã đăng ký`}
      </div>

      <div style="max-height: 400px; overflow-y: auto; border: 1px solid #D3D3D3; border-radius: 6px; background: #FAFAFA;">
        ${studentsHtml}
      </div>

      ${extraHtml}

      <div class="modal-actions">
        <button class="btn btn-light" data-close-roster>Đóng</button>
        <button class="btn btn-secondary" id="rosterReuploadBtn">📥 Nạp lại danh sách</button>
        <button class="btn btn-danger" id="rosterDeleteBtn">🗑 Xoá danh sách lớp</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close-roster]').forEach(b => {
    b.addEventListener('click', () => modal.remove());
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#rosterReuploadBtn').addEventListener('click', () => {
    modal.remove();
    openRosterUploadModal(className);
  });

  modal.querySelector('#rosterDeleteBtn').addEventListener('click', async () => {
    const ok = await showConfirm(
      `Xoá danh sách lớp ${className}?\n\nHS vẫn giữ nguyên, chỉ mất thứ tự STT.`,
      { title: '🗑 Xoá danh sách', okText: 'Xoá', danger: true }
    );
    if (!ok) return;
    try {
      await deleteRoster(className);
      toast('✅ Đã xoá danh sách lớp ' + className, 'success');
      modal.remove();
      loadUserManagement();
    } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
  });
}

// ══════════════════════════════════════════
// ẨN / BỎ ẨN HS
// ══════════════════════════════════════════
async function hideStudent(student) {
  const name = student.name || student.email;
  const reason = await showPrompt(
    `Ẩn tài khoản HS "${name}"?\n\n• HS sẽ KHÔNG thể đăng nhập\n• Bài làm + điểm vẫn giữ nguyên\n• Có thể "Bỏ ẩn" để khôi phục bất cứ lúc nào\n\nNhập LÝ DO ẩn (không bắt buộc):`,
    '',
    { title: '🙈 Ẩn học sinh', placeholder: 'VD: Vi phạm nội quy...', okText: '🙈 Ẩn' }
  );
  if (reason === null) return;
  try {
    await updateDoc(doc(db, 'users', student.id), {
      hidden: true,
      hiddenAt: serverTimestamp(),
      hiddenBy: state.currentUser.uid,
      hiddenReason: String(reason).trim() || null
    });
    toast(`🙈 Đã ẩn HS "${name}"`, 'success');
    loadUserManagement();
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

async function unhideStudent(student) {
  const name = student.name || student.email;
  const ok = await showConfirm(
    `Bỏ ẩn HS "${name}"?\n\nHS sẽ có thể đăng nhập lại bình thường.`,
    { title: '👁 Bỏ ẩn', okText: '👁 Bỏ ẩn', danger: false }
  );
  if (!ok) return;
  try {
    await updateDoc(doc(db, 'users', student.id), {
      hidden: false, hiddenAt: null, hiddenBy: null, hiddenReason: null
    });
    toast(`👁 Đã bỏ ẩn HS "${name}"`, 'success');
    loadUserManagement();
  } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
}

// ══════════════════════════════════════════
// SỬA TÊN HS
// ══════════════════════════════════════════
async function editStudentName(student) {
  const currentName = (student.name || '').trim();
  const emailLower = (student.email || '').toLowerCase();
  const isCurrentNameBad = !currentName || currentName.toLowerCase() === emailLower || currentName.includes('@');

  const prompt_msg = isCurrentNameBad
    ? `HS ${student.email} chưa có tên.\n\nNhập HỌ VÀ TÊN ĐẦY ĐỦ của HS:`
    : `Tên hiện tại: "${currentName}"\n\nNhập tên mới:`;

  const newName = await showPrompt(prompt_msg, isCurrentNameBad ? '' : currentName, {
    title: '✏️ Sửa tên HS', placeholder: 'VD: Nguyễn Văn A', okText: 'Lưu tên'
  });
  if (newName === null) return;

  const trimmed = newName.trim();
  if (!trimmed) { toast('Tên không được để trống', 'error'); return; }
  if (trimmed.toLowerCase() === emailLower) {
    toast('Tên không được trùng email', 'error'); return;
  }
  if (trimmed === currentName) { toast('Tên không thay đổi', 'info'); return; }

  toast('⏳ Đang cập nhật...', 'info');
  let subsOk = 0, logsOk = 0;

  try {
    await updateDoc(doc(db, 'users', student.id), { name: trimmed, updatedAt: serverTimestamp() });

    const subsSnap = await getDocs(query(collection(db, 'submissions'), where('studentId', '==', student.id)));
    for (let i = 0; i < subsSnap.docs.length; i += 500) {
      const batch = writeBatch(db);
      const slice = subsSnap.docs.slice(i, i + 500);
      slice.forEach(d => batch.update(d.ref, { studentName: trimmed }));
      await batch.commit();
      subsOk += slice.length;
    }

    const logsSnap = await getDocs(query(collection(db, 'viewLogs'), where('studentId', '==', student.id)));
    for (let i = 0; i < logsSnap.docs.length; i += 500) {
      const batch = writeBatch(db);
      const slice = logsSnap.docs.slice(i, i + 500);
      slice.forEach(d => batch.update(d.ref, { studentName: trimmed }));
      await batch.commit();
      logsOk += slice.length;
    }

    toast(`✅ Đổi tên thành "${trimmed}" — ${subsOk} bài + ${logsOk} log`, 'success');
    loadUserManagement();
  } catch (err) {
    toast('Lỗi: ' + (err.message || err), 'error');
  }
}