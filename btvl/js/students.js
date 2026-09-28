import {
  db, collection, getDocs, doc, deleteDoc
} from './firebase-init.js';
import { state } from './state.js';
import { $, esc, toast, fmtDate, getGradeFromClass } from './utils.js';

export function renderStudentsTab() {
  const tab = $('tab-students');
  if (!tab) return;

  tab.innerHTML = `
    <div class="card">
      <div class="space-between mb-2">
        <h3>👥 Quản Lý Học Sinh</h3>
        <button class="btn btn-light btn-sm" id="refreshStudentsBtn">🔄 Tải lại</button>
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
        <select id="stuFilterClass">
          <option value="all">Tất cả lớp</option>
        </select>
        <label>📧 Trạng thái:</label>
        <select id="stuFilterVerified">
          <option value="all">Tất cả</option>
          <option value="verified">Đã xác thực</option>
          <option value="unverified">Chưa xác thực</option>
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
  $('stuFilterGrade').addEventListener('change', renderStudentsTree);
  $('stuFilterVerified').addEventListener('change', renderStudentsTree);
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

async function loadUserManagement() {
  const wrap = $('userManagementTree');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';

  try {
    const snap = await getDocs(collection(db, 'users'));
    state.studentsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.role === 'student');

    const classSet = new Set();
    state.studentsCache.forEach(u => { if (u.class) classSet.add(u.class); });
    const classes = Array.from(classSet).sort();

    const classSelect = $('stuFilterClass');
    if (classSelect) {
      classSelect.innerHTML = '<option value="all">Tất cả lớp</option>' +
        classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }

    renderStudentsTree();
  } catch (err) {
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

function renderStudentsTree() {
  const wrap = $('userManagementTree');
  if (!wrap) return;

  const filterGrade = $('stuFilterGrade')?.value || 'all';
  const filterClass = $('stuFilterClass')?.value || 'all';
  const filterVerified = $('stuFilterVerified')?.value || 'all';
  const keyword = ($('stuSearchInput')?.value || '').toLowerCase().trim();

  let filtered = [...state.studentsCache];

  if (filterGrade !== 'all') {
    if (filterGrade === 'none') {
      filtered = filtered.filter(u => !u.class || !getGradeFromClass(u.class));
    } else {
      filtered = filtered.filter(u => getGradeFromClass(u.class) === filterGrade);
    }
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

  filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));

  const byGrade = { '10': {}, '11': {}, '12': {}, 'none': {} };
  filtered.forEach(u => {
    const g = getGradeFromClass(u.class) || 'none';
    const cls = u.class || '(Chưa có lớp)';
    if (!byGrade[g][cls]) byGrade[g][cls] = [];
    byGrade[g][cls].push(u);
  });

  $('stuResultCount').textContent = `Hiển thị ${filtered.length}/${state.studentsCache.length} HS`;

  if (filtered.length === 0) {
    wrap.innerHTML = '<div class="empty">Không tìm thấy học sinh nào.</div>';
    return;
  }

  const gradeNames = { '10': '📚 Khối 10', '11': '📚 Khối 11', '12': '📚 Khối 12', 'none': '❓ Chưa có lớp' };
  const gradeOrder = ['10', '11', '12', 'none'];

  let html = '';
  gradeOrder.forEach(g => {
    const classesInGrade = byGrade[g];
    const totalInGrade = Object.values(classesInGrade).reduce((s, arr) => s + arr.length, 0);
    if (totalInGrade === 0) return;

    const classCount = Object.keys(classesInGrade).length;
    html += `
      <div class="tree-group">
        <div class="tree-header lv1">
          <div class="tree-title"><span>${gradeNames[g]}</span></div>
          <div class="tree-badges">
            <span class="count-badge">${classCount} lớp</span>
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

      html += `
        <div class="tree-group" style="margin:0; border:none; border-radius:0; box-shadow:none; border-top:1px solid #E0E0E0;">
          <div class="tree-header lv2">
            <div class="tree-title"><span>🏫 ${esc(cls)}</span></div>
            <div class="tree-badges">
              ${vCount > 0 ? `<span class="count-badge" style="background:#0066CC;">✓ ${vCount}</span>` : ''}
              ${uCount > 0 ? `<span class="count-badge" style="background:#999;">⏳ ${uCount}</span>` : ''}
              <span class="count-badge">${students.length} HS</span>
              <span class="tree-toggle">▼</span>
            </div>
          </div>
          <div class="tree-body">
            ${students.map(s => {
              const verified = s.emailVerified === true;
              const verBadge = verified
                ? '<span class="badge badge-verified">✅ Đã xác thực</span>'
                : '<span class="badge badge-unverified">⏳ Chưa xác thực</span>';
              return `
                <div class="student-row">
                  <div class="s-info">
                    <div class="s-name">${esc(s.name || '(Chưa có tên)')}</div>
                    <div class="s-meta">📧 ${esc(s.email)} • ĐK: ${fmtDate(s.createdAt)}</div>
                    <div style="margin-top:4px;">${verBadge}</div>
                  </div>
                  <button class="btn btn-danger btn-sm" data-del-user="${s.id}" data-email="${esc(s.email)}" data-name="${esc(s.name || '')}">🗑 Xoá</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  wrap.innerHTML = html;

  wrap.querySelectorAll('.tree-header').forEach(h => {
    h.addEventListener('click', (e) => {
      e.stopPropagation();
      h.classList.toggle('collapsed');
      const body = h.nextElementSibling;
      if (body) body.classList.toggle('collapsed');
    });
  });

  wrap.querySelectorAll('[data-del-user]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const email = btn.dataset.email;
      if (!confirm(`Xoá HS "${name || email}"?\n\n⚠️ Không thể hoàn tác!`)) return;

      try {
        await deleteDoc(doc(db, 'users', btn.dataset.delUser));
        toast('✅ Đã xoá HS.', 'success');
        loadUserManagement();
      } catch (err) {
        toast('Lỗi: ' + err.message, 'error');
      }
    });
  });
}