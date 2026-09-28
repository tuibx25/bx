import {
  db, collection, getDocs, doc, getDoc
} from './firebase-init.js';
import { state } from './state.js';
import { $, esc, toast, getGradeFromClass } from './utils.js';

export function initStats() {
  window.addEventListener('load:stats', loadStats);
  window.addEventListener('export:stats', exportStatsToCSV);
  window.addEventListener('update:stats-assignment', updateStatsAssignmentFilter);
}

async function updateStatsAssignmentFilter() {
  const grade = $('statsGrade')?.value;
  const filterClass = $('statsClass')?.value || '';
  const filterLesson = $('statsLesson')?.value || '';
  const select = $('statsAssignment');
  if (!select) return;

  try {
    const aSnap = await getDocs(collection(db, 'assignments'));
    let assignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (grade) assignments = assignments.filter(a => a.grade === grade);
    if (filterLesson) assignments = assignments.filter(a => a.lessonId === filterLesson);
    if (filterClass) {
      assignments = assignments.filter(a =>
        a.assignedAllGrade ||
        (a.assignedClasses && a.assignedClasses.includes(filterClass))
      );
    }
    assignments = assignments.filter(a => a.mode === 'inline' && a.type === 'quiz');
    assignments.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Chọn đề --</option>' +
      assignments.map(a => {
        const lesson = state.teacherLessonsMapCache[a.lessonId];
        const lessonName = lesson ? lesson.name : '';
        return `<option value="${a.id}">🎯 ${esc(a.title)}${lessonName ? ` (${esc(lessonName)})` : ''}</option>`;
      }).join('');

    if (assignments.some(a => a.id === currentVal)) select.value = currentVal;
    else select.value = '';
  } catch (err) {
    console.error('Update stats filter error:', err);
  }
}

async function loadStats() {
  const wrap = $('statsResult');
  const exportBtn = $('exportStatsBtn');
  if (!wrap) return;

  wrap.innerHTML = '<div class="empty">Đang tải...</div>';
  if (exportBtn) exportBtn.disabled = true;

  const grade = $('statsGrade').value;
  const filterClass = $('statsClass').value;
  const filterLesson = $('statsLesson').value;
  const assignmentId = $('statsAssignment').value;
  const searchStudent = ($('statsSearchStudent').value || '').toLowerCase().trim();

  if (!assignmentId) {
    wrap.innerHTML = '<div class="empty">⚠️ Vui lòng chọn <strong>Đề cụ thể</strong>.</div>';
    return;
  }

  try {
    const [usersSnap, aSnap, sSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'assignments')),
      getDocs(collection(db, 'submissions'))
    ]);

    const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.role === 'student');
    const allAssignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allSubs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const assignment = allAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      wrap.innerHTML = '<div class="empty">Không tìm thấy đề.</div>';
      return;
    }

    const maxAttempts = assignment.maxAttempts || 3;

    // Tên đề
    let assignmentDisplayName = assignment.title;
    if (assignment.lessonId && state.teacherLessonsMapCache[assignment.lessonId]) {
      const lesson = state.teacherLessonsMapCache[assignment.lessonId];
      const assignmentsInLesson = allAssignments
        .filter(a => a.lessonId === assignment.lessonId)
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      const idx = assignmentsInLesson.findIndex(a => a.id === assignmentId) + 1;
      assignmentDisplayName = `Đề ${idx} / ${lesson.name}`;
    }

    // Filter HS
    let filteredStudents = allUsers.filter(u => {
      const gradeFromClass = getGradeFromClass(u.class);
      if (grade !== 'all' && gradeFromClass !== grade) return false;
      if (filterClass && u.class !== filterClass) return false;
      if (searchStudent) {
        const nameMatch = (u.name || '').toLowerCase().includes(searchStudent);
        const emailMatch = (u.email || '').toLowerCase().includes(searchStudent);
        if (!nameMatch && !emailMatch) return false;
      }
      return true;
    });

    if (filteredStudents.length === 0) {
      wrap.innerHTML = '<div class="empty">Không có HS nào phù hợp bộ lọc.</div>';
      return;
    }

    const subsOfAssignment = allSubs.filter(s =>
      s.assignmentId === assignmentId &&
      s.status !== 'in_progress' &&
      s.status !== 'abandoned'
    );

    const studentScores = {};
    filteredStudents.forEach(st => {
      studentScores[st.id] = { attempts: [], maxScore: 0 };
    });

    subsOfAssignment.forEach(s => {
      if (!studentScores[s.studentId]) return;
      const score = s.score != null ? s.score : (s.autoScore != null ? s.autoScore : null);
      if (score === null) return;
      studentScores[s.studentId].attempts.push({
        score,
        maxScore: s.autoMax || 7,
        submittedAt: s.submittedAt
      });
    });

    Object.values(studentScores).forEach(st => {
      st.attempts.sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
      if (st.attempts.length > 0) st.maxScore = st.attempts[0].maxScore;
    });

    let studentsDone = 0;
    let totalAttempts = 0;
    let allScoresFlat = [];

    filteredStudents.forEach(st => {
      const info = studentScores[st.id];
      if (info.attempts.length > 0) {
        studentsDone++;
        totalAttempts += info.attempts.length;
        info.attempts.forEach(a => allScoresFlat.push(a.score));
      }
    });

    const maxScoreOfAssignment = filteredStudents.find(st => studentScores[st.id].maxScore > 0)
      ? studentScores[filteredStudents.find(st => studentScores[st.id].maxScore > 0).id].maxScore
      : 7;

    const avgOfAllScores = allScoresFlat.length > 0
      ? Math.round((allScoresFlat.reduce((s, x) => s + x, 0) / allScoresFlat.length) * 100) / 100
      : 0;
    const maxGot = allScoresFlat.length > 0 ? Math.max(...allScoresFlat) : 0;
    const minGot = allScoresFlat.length > 0 ? Math.min(...allScoresFlat) : 0;

    let html = `
      <div class="stats-summary">
        <span class="item">📝 <strong>${esc(assignmentDisplayName)}</strong></span>
        <span class="score-scale">Thang điểm: 0 → ${maxScoreOfAssignment}</span>
        <span class="item">👥 Sĩ số: <strong>${filteredStudents.length}</strong> HS</span>
        <span class="item">✅ Đã làm: <strong>${studentsDone}</strong> HS</span>
        <span class="item">📊 Tổng lượt: <strong>${totalAttempts}</strong></span>
        <span class="item">📈 Điểm TB: <strong>${avgOfAllScores}</strong></span>
        <span class="item">🏆 Cao nhất: <strong>${maxGot}</strong></span>
        <span class="item">📉 Thấp nhất: <strong>${minGot}</strong></span>
      </div>
    `;

    const attemptColumns = Array.from({ length: maxAttempts }, (_, i) => `Lần ${i + 1}`);

    html += `
      <div class="stats-table-wrap">
      <table class="stats-table">
        <thead>
          <tr>
            <th style="width:40px;">STT</th>
            <th style="text-align:left; min-width:180px;">Họ và tên</th>
            <th style="width:80px;">Lớp</th>
            ${attemptColumns.map(col => `<th style="min-width:70px;">${col}</th>`).join('')}
            <th style="min-width:110px;">Điểm cao nhất</th>
            <th style="min-width:100px;">Điểm TB</th>
          </tr>
        </thead>
        <tbody>
          ${filteredStudents.map((st, idx) => {
            const info = studentScores[st.id];
            const attempts = info.attempts;

            const attemptCells = Array.from({ length: maxAttempts }, (_, i) => {
              const att = attempts[i];
              if (!att) return `<td class="score-empty">—</td>`;
              return `<td class="score-cell">${att.score}</td>`;
            }).join('');

            let maxCell = '<td class="score-empty">—</td>';
            if (attempts.length > 0) {
              const maxScoreGot = Math.max(...attempts.map(a => a.score));
              maxCell = `<td class="max-cell">${maxScoreGot}</td>`;
            }

            let avgCell = '<td class="score-empty">—</td>';
            if (attempts.length > 0) {
              const sumScore = attempts.reduce((sum, a) => sum + a.score, 0);
              const avgScore = Math.round((sumScore / attempts.length) * 100) / 100;
              avgCell = `<td class="avg-cell">
                <strong>${avgScore}</strong>
                <div style="font-size:10px; color:#666;">(${attempts.length} lần)</div>
              </td>`;
            }

            return `
              <tr>
                <td>${idx + 1}</td>
                <td class="student-name">${esc(st.name)}</td>
                <td class="class-col">${esc(st.class || '—')}</td>
                ${attemptCells}
                ${maxCell}
                ${avgCell}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      </div>
    `;

    html += `
      <div class="alert alert-info" style="margin-top:14px;">
        💡 <strong>Chú thích:</strong>
        <ul style="margin-left:20px; margin-top:6px;">
          <li>Điểm hiển thị là <strong>số điểm</strong>. Đề tối đa <strong>${maxScoreOfAssignment} điểm</strong>.</li>
          <li><strong>Điểm cao nhất</strong> = max trong các lần làm.</li>
          <li><strong>Điểm TB</strong> = trung bình cộng điểm các lần làm.</li>
          <li>Đề cho phép tối đa <strong>${maxAttempts} lần</strong>.</li>
        </ul>
      </div>
    `;

    wrap.innerHTML = html;

    state.lastStatsData = {
      filteredStudents,
      studentScores,
      assignment,
      assignmentDisplayName,
      maxScoreOfAssignment,
      maxAttempts,
      grade,
      filterClass,
      filterLesson
    };
    if (exportBtn) exportBtn.disabled = false;
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

function exportStatsToCSV() {
  if (!state.lastStatsData) {
    toast('Chưa có dữ liệu. Bấm "🔄 Xem thống kê" trước.', 'error');
    return;
  }

  const { filteredStudents, studentScores, assignmentDisplayName, maxScoreOfAssignment, maxAttempts } = state.lastStatsData;

  const headers = ['STT', 'Họ và tên', 'Lớp'];
  for (let i = 1; i <= maxAttempts; i++) headers.push(`Lần ${i}`);
  headers.push('Điểm cao nhất', 'Điểm TB', 'Số lần làm');

  const rows = [headers];

  filteredStudents.forEach((st, idx) => {
    const info = studentScores[st.id];
    const attempts = info.attempts;

    const row = [idx + 1, st.name || '', st.class || ''];

    for (let i = 0; i < maxAttempts; i++) {
      const att = attempts[i];
      row.push(att ? att.score : '—');
    }

    if (attempts.length > 0) {
      row.push(Math.max(...attempts.map(a => a.score)));
    } else {
      row.push('—');
    }

    if (attempts.length > 0) {
      const sumScore = attempts.reduce((sum, a) => sum + a.score, 0);
      const avgScore = Math.round((sumScore / attempts.length) * 100) / 100;
      row.push(avgScore);
    } else {
      row.push('—');
    }

    row.push(attempts.length);
    rows.push(row);
  });

  const infoRows = [
    [`Đề: ${assignmentDisplayName}`],
    [`Thang điểm: 0 - ${maxScoreOfAssignment}`],
    []
  ];

  const allRows = [...infoRows, ...rows];

  const csvContent = allRows.map(row =>
    row.map(cell => {
      const s = String(cell == null ? '' : cell);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(',')
  ).join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  const safeName = assignmentDisplayName.replace(/[^\w\sàáảãạăâđêôơưÀÁẢÃẠĂÂĐÊÔƠƯ]/g, '').replace(/\s+/g, '_').substring(0, 40);
  const fileName = `ThongKe_${safeName}_${dateStr}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast(`✅ Đã xuất file: ${fileName}`, 'success');
}