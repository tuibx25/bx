import {
  db, collection, getDocs
} from './firebase-init.js';
import { state } from './state.js';
import { $, esc, toast, getGradeFromClass } from './utils.js';

// ═══ LOCAL STATE cho 3 grid ═══
export const classGridState = {
  // Grid "Giao bài" (assign)
  assign: {
    selected: new Set(),
    allGrade: false,
    currentGrade: '10'
  },
  // Grid "Sửa đề" (edit)
  edit: {
    selected: new Set(),
    allGrade: false,
    currentGrade: '10'
  },
  // Grid "Thông báo" (notif)
  notif: {
    selected: new Set(),
    allGrade: false,
    currentGrade: '10'
  }
};

export async function loadAvailableClasses() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => d.data()).filter(u => u.role === 'student');

    const countMap = {};
    users.forEach(u => {
      if (u.class) countMap[u.class] = (countMap[u.class] || 0) + 1;
    });

    state.availableClassesByGrade = { '10': [], '11': [], '12': [] };

    Object.keys(countMap).forEach(cls => {
      const grade = getGradeFromClass(cls);
      if (grade && state.availableClassesByGrade[grade]) {
        state.availableClassesByGrade[grade].push({ name: cls, count: countMap[cls] });
      }
    });

    ['10', '11', '12'].forEach(g => {
      state.availableClassesByGrade[g].sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+$/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+$/)?.[0] || 0);
        return numA - numB;
      });
    });

    renderAllGrids();
  } catch (e) {
    console.error('Load classes error:', e);
  }
}

function renderAllGrids() {
  renderGrid('assign');
  renderGrid('edit');
  renderGrid('notif');
}

// ═══ RENDER CHUNG ═══
function renderGrid(type) {
  const grid = classGridState[type];
  const tabPrefix = type === 'assign' ? 'class' : (type === 'edit' ? 'editClass' : 'notifClass');
  const gridBodyId = type === 'assign' ? 'classGridBody'
                   : (type === 'edit' ? 'editClassGridBody' : 'notifClassGridBody');

  const gridBody = $(gridBodyId);
  if (!gridBody) return;

  const classes = state.availableClassesByGrade[grid.currentGrade] || [];

  // Update tab counts
  ['10', '11', '12'].forEach(g => {
    const count = (state.availableClassesByGrade[g] || []).length;
    const badge = $(`${tabPrefix}TabCount${g}`);
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('empty', count === 0);
    }
  });

  // Update checkbox "Cả khối"
  const allGradeCb = $(type === 'assign' ? 'assignGradeAll' : (type === 'edit' ? 'editAssignGradeAll' : 'notifSendAll'));
  const allGradeWrap = $(type === 'assign' ? 'assignGradeAllWrap' : (type === 'edit' ? 'editAssignGradeAllWrap' : 'notifSendAllWrap'));
  if (allGradeCb && allGradeWrap) {
    allGradeCb.checked = grid.allGrade;
    allGradeWrap.classList.toggle('checked', grid.allGrade);
  }

  // Update count HS
  const allGradeCountId = type === 'assign' ? 'assignGradeAllCount'
                        : (type === 'edit' ? 'editAssignGradeAllCount' : null);
  if (allGradeCountId) {
    const el = $(allGradeCountId);
    if (el) {
      const totalHS = (state.availableClassesByGrade[grid.currentGrade] || [])
        .reduce((s, c) => s + c.count, 0);
      el.textContent = `${totalHS} HS`;
    }
  }

  gridBody.classList.toggle('disabled', grid.allGrade);

  if (classes.length === 0) {
    gridBody.innerHTML = `<div class="class-grid-empty">📭 Khối ${grid.currentGrade} chưa có lớp nào có HS.</div>`;
    updateSummary(type);
    return;
  }

  const dataAttr = type === 'assign' ? 'data-class-name'
                 : (type === 'edit' ? 'data-edit-class-name' : 'data-notif-class-name');

  gridBody.innerHTML = classes.map(c => {
    const isChecked = grid.selected.has(c.name);
    return `
      <label class="class-checkbox ${isChecked ? 'checked' : ''}" data-class="${esc(c.name)}">
        <input type="checkbox" ${isChecked ? 'checked' : ''} ${dataAttr}="${esc(c.name)}" ${grid.allGrade ? 'disabled' : ''}>
        <span class="cb-name">${esc(c.name)}</span>
        <span class="cb-count">(${c.count})</span>
      </label>
    `;
  }).join('');

  gridBody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const cls = e.target.dataset.className
              || e.target.dataset.editClassName
              || e.target.dataset.notifClassName;
      if (!cls) return;

      if (e.target.checked) grid.selected.add(cls);
      else grid.selected.delete(cls);

      e.target.closest('.class-checkbox').classList.toggle('checked', e.target.checked);
      updateSummary(type);
    });
  });

  updateSummary(type);
}

// ═══ SUMMARY ═══
function updateSummary(type) {
  const grid = classGridState[type];
  const summaryId = type === 'assign' ? 'classSelectedList'
                  : (type === 'edit' ? 'editClassSelectedList' : 'notifClassSelectedList');
  const summaryList = $(summaryId);
  if (!summaryList) return;

  if (grid.allGrade) {
    const label = type === 'notif'
      ? '🌐 TẤT CẢ HS TOÀN TRƯỜNG'
      : `🌐 Cả khối ${grid.currentGrade}`;
    const removeAttr = type === 'assign' ? 'data-remove-all-grade'
                     : (type === 'edit' ? 'data-edit-remove-all-grade' : 'data-notif-remove-all');

    summaryList.innerHTML = `
      <span class="class-chip all-grade">
        ${label}
        <button type="button" class="chip-remove" ${removeAttr} title="Bỏ chọn">×</button>
      </span>
    `;

    summaryList.querySelector('.chip-remove').addEventListener('click', (e) => {
      e.preventDefault();
      grid.allGrade = false;
      renderGrid(type);
    });
    return;
  }

  if (grid.selected.size === 0) {
    summaryList.innerHTML = '<span class="empty-hint">Chưa chọn lớp nào</span>';
    return;
  }

  const removeAttr = type === 'assign' ? 'data-remove-class'
                   : (type === 'edit' ? 'data-edit-remove-class' : 'data-notif-remove-class');

  const sorted = Array.from(grid.selected).sort();
  summaryList.innerHTML = sorted.map(cls => `
    <span class="class-chip">
      ${esc(cls)}
      <button type="button" class="chip-remove" ${removeAttr}="${esc(cls)}" title="Bỏ chọn">×</button>
    </span>
  `).join('');

  summaryList.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cls = btn.dataset.removeClass
              || btn.dataset.editRemoveClass
              || btn.dataset.notifRemoveClass;
      grid.selected.delete(cls);
      renderGrid(type);
    });
  });
}

// ═══ BIND EVENTS ═══
export function bindClassGridEvents() {
  bindGridEvents('assign');
}

export function bindEditClassGridEvents() {
  bindGridEvents('edit');
}

export function bindNotifClassGridEvents() {
  bindGridEvents('notif');
}

function bindGridEvents(type) {
  const grid = classGridState[type];
  const tabClass = type === 'assign' ? 'class-grid-tab:not(.notif-class-grid-tab):not(.edit-class-grid-tab)'
                 : (type === 'edit' ? 'edit-class-grid-tab' : 'notif-class-grid-tab');

  document.querySelectorAll(tabClass).forEach(tab => {
    // Tránh bind nhiều lần
    if (tab.dataset.bound) return;
    tab.dataset.bound = 'true';

    tab.addEventListener('click', () => {
      document.querySelectorAll(tabClass).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (type === 'assign') grid.currentGrade = tab.dataset.grade;
      else if (type === 'edit') grid.currentGrade = tab.dataset.editGrade;
      else grid.currentGrade = tab.dataset.notifGrade;

      renderGrid(type);
    });
  });

  // Checkbox "Cả khối / Tất cả"
  const allGradeCbId = type === 'assign' ? 'assignGradeAll'
                    : (type === 'edit' ? 'editAssignGradeAll' : 'notifSendAll');
  const allGradeCb = $(allGradeCbId);

  if (allGradeCb && !allGradeCb.dataset.bound) {
    allGradeCb.dataset.bound = 'true';
    allGradeCb.addEventListener('change', (e) => {
      grid.allGrade = e.target.checked;
      if (grid.allGrade) grid.selected.clear();
      renderGrid(type);
    });
  }

  // Nút "Tất cả" / "Bỏ chọn"
  const selectAllId = type === 'assign' ? 'classGridSelectAll'
                    : (type === 'edit' ? 'editClassGridSelectAll' : 'notifClassGridSelectAll');
  const deselectAllId = type === 'assign' ? 'classGridDeselectAll'
                      : (type === 'edit' ? 'editClassGridDeselectAll' : 'notifClassGridDeselectAll');

  const selectAllBtn = $(selectAllId);
  if (selectAllBtn && !selectAllBtn.dataset.bound) {
    selectAllBtn.dataset.bound = 'true';
    selectAllBtn.addEventListener('click', () => {
      if (grid.allGrade) {
        toast('Bỏ tick "Cả khối / Tất cả" trước.', 'error');
        return;
      }
      const classes = state.availableClassesByGrade[grid.currentGrade] || [];
      classes.forEach(c => grid.selected.add(c.name));
      renderGrid(type);
    });
  }

  const deselectAllBtn = $(deselectAllId);
  if (deselectAllBtn && !deselectAllBtn.dataset.bound) {
    deselectAllBtn.dataset.bound = 'true';
    deselectAllBtn.addEventListener('click', () => {
      const classes = state.availableClassesByGrade[grid.currentGrade] || [];
      classes.forEach(c => grid.selected.delete(c.name));
      renderGrid(type);
    });
  }
}

// ═══ RESET ═══
export function resetClassGrid(type) {
  const grid = classGridState[type];
  grid.selected.clear();
  grid.allGrade = false;
  grid.currentGrade = '10';
  renderGrid(type);
}