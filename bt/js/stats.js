import {
  db, collection, getDocs, doc, getDoc, query, where
} from './firebase-init.js';
import { state } from './state.js';
import { $, esc, toast, getGradeFromClass, mapError, totalPoints } from './utils.js';
import { getPublicQuestions, parseQuestionsHtml } from './quiz.js';
import { loadAllRosters, sortStudentsByRoster, getRosterForClass, normalizeName } from './roster.js';

export function initStats() {
  window.addEventListener('load:stats', loadStats);
  window.addEventListener('export:stats', exportStatsToCSV);
  window.addEventListener('update:stats-assignment', updateStatsAssignmentFilter);
  window.addEventListener('print:stats', printStats);
}

async function updateStatsAssignmentFilter() {
  const grade = $('statsGrade')?.value;
  const filterClass = $('statsClass')?.value || '';
  const filterLesson = $('statsLesson')?.value || '';
  const select = $('statsAssignment');
  if (!select) return;
  try {
    const aSnap = grade
      ? await getDocs(query(collection(db, 'assignments'), where('grade', '==', grade)))
      : await getDocs(collection(db, 'assignments'));
    let assignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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

// ══════════════════════════════════════════════════════
// CHẤM ĐIỂM ON-THE-FLY
// ══════════════════════════════════════════════════════
function computeScoreFromAnswers(questions, answers = {}) {
  let total = 0, max = 0;
  for (const q of questions) {
    const pts = Number(q.points || 1); max += pts;
    const a = answers[q.id];
    if (q.type === 'choice') {
      if (a === q.correctAnswer) total += pts;
    } else if (q.type === 'truefalse') {
      const per = pts / q.statements.length;
      let c = 0;
      q.statements.forEach(st => {
        const sa = a ? a[st.statement] : undefined;
        if (sa === st.correct) c++;
      });
      total += Math.round(c * per * 100) / 100;
    } else if (q.type === 'short') {
      const norm = s => (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, '');
      if (norm(a) === norm(q.correctAnswer)) total += pts;
    }
  }
  return { score: Math.round(total * 100) / 100, max: Math.round(max * 100) / 100 };
}

async function loadAnswerKeyForStats(assignment) {
  try {
    const s = await getDoc(doc(db, 'assignments', assignment.id, 'answerKey', 'key'));
    if (s.exists()) {
      const qs = s.data().questions;
      if (qs && qs.length > 0) return qs;
    }
  } catch (e) {
    console.warn('[stats] answerKey read failed:', e);
  }
  const html = assignment.questionsHtml;
  if (html) {
    try {
      const qs = parseQuestionsHtml(html);
      const hasAnswers = qs.some(q =>
        q.correctAnswer != null ||
        (q.statements && q.statements.some(st => st.correct !== undefined))
      );
      if (hasAnswers) return qs;
    } catch (e) {
      console.warn('[stats] fallback parse failed:', e);
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════
// SORT HELPERS
// ══════════════════════════════════════════════════════
function parseVietnameseName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { ho: '', dem: '', ten: '' };
  if (parts.length === 1) return { ho: '', dem: '', ten: parts[0] };
  return {
    ho: parts[0],
    dem: parts.slice(1, -1).join(' '),
    ten: parts[parts.length - 1]
  };
}

function compareVietnamese(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'vi', {
    sensitivity: 'base',
    numeric: true
  });
}

function sortStudentsByName(students, mode) {
  students.sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';
    const classA = a.class || 'zzz';
    const classB = b.class || 'zzz';

    switch (mode) {
      case 'class_name': {
        const clsCmp = compareVietnamese(classA, classB);
        if (clsCmp !== 0) return clsCmp;
        const tA = parseVietnameseName(nameA);
        const tB = parseVietnameseName(nameB);
        let cmp = compareVietnamese(tA.ten, tB.ten);
        if (cmp !== 0) return cmp;
        cmp = compareVietnamese(tA.dem, tB.dem);
        if (cmp !== 0) return cmp;
        return compareVietnamese(tA.ho, tB.ho);
      }
      case 'name_only': {
        const tA = parseVietnameseName(nameA);
        const tB = parseVietnameseName(nameB);
        let cmp = compareVietnamese(tA.ten, tB.ten);
        if (cmp !== 0) return cmp;
        cmp = compareVietnamese(tA.dem, tB.dem);
        if (cmp !== 0) return cmp;
        return compareVietnamese(tA.ho, tB.ho);
      }
      case 'full_name': {
        return compareVietnamese(nameA, nameB);
      }
      case 'class_full': {
        const clsCmp = compareVietnamese(classA, classB);
        if (clsCmp !== 0) return clsCmp;
        return compareVietnamese(nameA, nameB);
      }
      default:
        return 0;
    }
  });
}

// ══════════════════════════════════════════════════════
// MERGE ROSTER + USERS
//   Khi filter 1 lớp cụ thể + sort = roster:
//   → Bảng bao gồm TẤT CẢ HS trong danh sách lớp
//   → HS chưa đăng ký / chưa verify → hiển thị mờ + điểm trống
// ══════════════════════════════════════════════════════
function buildRosterMergedStudents(allUsers, filterClass, searchStudent) {
  const roster = getRosterForClass(filterClass);
  if (!roster || !roster.students || roster.students.length === 0) return null;

  // Map users theo normalized name
  const usersByName = {};
  allUsers.forEach(u => {
    const key = normalizeName(u.name);
    if (!usersByName[key]) usersByName[key] = [];
    usersByName[key].push(u);
  });

  // Ghép từng entry roster
  let merged = roster.students.map(entry => {
    const key = normalizeName(entry.name);
    const matches = usersByName[key] || [];
    const verifiedUser = matches.find(u => u.emailVerified === true);
    const anyUser = matches[0];
    const finalUser = verifiedUser || anyUser;

    if (finalUser && finalUser.emailVerified === true) {
      return {
        ...finalUser,
        _rosterStt: entry.stt,
        _rosterName: entry.name,
        _status: 'verified'
      };
    } else if (finalUser) {
      return {
        ...finalUser,
        _rosterStt: entry.stt,
        _rosterName: entry.name,
        _status: 'unverified'
      };
    } else {
      return {
        id: null,
        name: entry.name,
        email: null,
        class: filterClass,
        emailVerified: false,
        _rosterStt: entry.stt,
        _rosterName: entry.name,
        _status: 'unregistered'
      };
    }
  });

  // Filter theo keyword tìm kiếm (nếu có)
  if (searchStudent) {
    merged = merged.filter(s =>
      (s._rosterName || '').toLowerCase().includes(searchStudent) ||
      (s.name || '').toLowerCase().includes(searchStudent) ||
      (s.email || '').toLowerCase().includes(searchStudent)
    );
  }

  // Sort theo STT
  merged.sort((a, b) => (a._rosterStt || 9999) - (b._rosterStt || 9999));

  return merged;
}

// ══════════════════════════════════════════════════════
// LOAD STATS
// ══════════════════════════════════════════════════════
async function loadStats() {
  const wrap = $('statsResult');
  const exportBtn = $('exportStatsBtn');
  const printBtn = $('printStatsBtn');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Đang tải...</div>';
  if (exportBtn) exportBtn.disabled = true;
  if (printBtn) printBtn.disabled = true;

  const grade = $('statsGrade').value;
  const filterClass = $('statsClass').value;
  const filterLesson = $('statsLesson').value;
  const assignmentId = $('statsAssignment').value;
  const searchStudent = ($('statsSearchStudent').value || '').toLowerCase().trim();
  const onlyAssigned = $('statsOnlyAssigned')?.checked === true;
  const sortMode = $('statsSortMode')?.value || 'roster';

  if (!assignmentId) {
    wrap.innerHTML = '<div class="empty">⚠️ Vui lòng chọn <strong>Đề cụ thể</strong>.</div>';
    return;
  }

  try {
    const [usersSnap, aSnap, sSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
      getDocs(query(collection(db, 'assignments'), where('grade', '==', grade))),
      getDocs(query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId)))
    ]);
    const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allAssignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allSubs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const assignment = allAssignments.find(a => a.id === assignmentId);
    if (!assignment) {
      wrap.innerHTML = '<div class="empty">Không tìm thấy đề.</div>';
      return;
    }
    const maxAttempts = assignment.maxAttempts || 3;

    const answerKeyQs = await loadAnswerKeyForStats(assignment);

    let maxScoreOfAssignment = 0;
    if (answerKeyQs) maxScoreOfAssignment = totalPoints(answerKeyQs);
    else maxScoreOfAssignment = totalPoints(getPublicQuestions(assignment));
    if (!maxScoreOfAssignment) maxScoreOfAssignment = 7;

    let assignmentDisplayName = assignment.title;
    if (assignment.lessonId && state.teacherLessonsMapCache[assignment.lessonId]) {
      const lesson = state.teacherLessonsMapCache[assignment.lessonId];
      const assignmentsInLesson = allAssignments
        .filter(a => a.lessonId === assignment.lessonId)
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      const idx = assignmentsInLesson.findIndex(a => a.id === assignmentId) + 1;
      assignmentDisplayName = `Đề ${idx} / ${lesson.name}`;
    }

    // ═══ BUILD DANH SÁCH HS ═══
    let filteredStudents = [];
    let isRosterMode = false;

    await loadAllRosters();

    // CHẾ ĐỘ MERGE ROSTER: khi sort = roster + đã chọn lớp cụ thể
    if (sortMode === 'roster' && filterClass && filterClass !== 'all') {
      const merged = buildRosterMergedStudents(allUsers, filterClass, searchStudent);
      if (merged) {
        filteredStudents = merged;
        isRosterMode = true;
      }
    }

    // CHẾ ĐỘ THƯỜNG: filter từ users như cũ
    if (!isRosterMode) {
      filteredStudents = allUsers.filter(u => {
        if (u.emailVerified !== true) return false;
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

      sortStudentsByRoster(filteredStudents);
      if (sortMode !== 'roster') {
        sortStudentsByName(filteredStudents, sortMode);
      }
    }

    // Filter theo "Chỉ HS được giao"
    if (onlyAssigned) {
      filteredStudents = filteredStudents.filter(st => {
        if (assignment.assignedAllGrade === true) return getGradeFromClass(st.class) === assignment.grade;
        if (assignment.assignedClasses?.includes(st.class)) return true;
        if (assignment.assignedTo?.includes(st.id)) return true;
        return false;
      });
    }

    if (filteredStudents.length === 0) {
      wrap.innerHTML = '<div class="empty">Không có HS nào phù hợp bộ lọc.</div>';
      return;
    }

    // ═══ TÍNH ĐIỂM ═══
    const subsOfAssignment = allSubs.filter(s =>
      s.status !== 'in_progress' &&
      s.status !== 'abandoned'
    );
    const studentScores = {};

    filteredStudents.forEach(st => {
      if (st.id) studentScores[st.id] = { attempts: [], maxScore: 0 };
    });

    let fixedOnTheFly = 0;
    subsOfAssignment.forEach(s => {
      if (!studentScores[s.studentId]) return;
      let score = s.score != null ? s.score : (s.autoScore != null ? s.autoScore : null);
      let maxScore = s.autoMax != null ? s.autoMax : maxScoreOfAssignment;
      if (score === null && s.answers && answerKeyQs) {
        const r = computeScoreFromAnswers(answerKeyQs, s.answers);
        score = r.score;
        maxScore = r.max;
        fixedOnTheFly++;
      }
      if (score === null) return;
      studentScores[s.studentId].attempts.push({
        score,
        maxScore,
        submittedAt: s.submittedAt
      });
    });
    Object.values(studentScores).forEach(st => {
      st.attempts.sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
      if (st.attempts.length > 0) st.maxScore = st.attempts[0].maxScore;
    });

    // ═══ THỐNG KÊ ═══
    let studentsDone = 0, totalAttempts = 0;
    const allScoresFlat = [];
    filteredStudents.forEach(st => {
      const info = st.id ? studentScores[st.id] : null;
      if (info && info.attempts.length > 0) {
        studentsDone++;
        totalAttempts += info.attempts.length;
        info.attempts.forEach(a => allScoresFlat.push(a.score));
      }
    });
    const avgOfAllScores = allScoresFlat.length > 0
      ? Math.round((allScoresFlat.reduce((s, x) => s + x, 0) / allScoresFlat.length) * 100) / 100 : 0;
    const maxGot = allScoresFlat.length > 0 ? Math.max(...allScoresFlat) : 0;
    const minGot = allScoresFlat.length > 0 ? Math.min(...allScoresFlat) : 0;

    // Đếm HS chưa verify + chưa đăng ký
    let unverifiedCount = 0;
    let unregisteredCount = 0;
    if (isRosterMode) {
      unverifiedCount = filteredStudents.filter(s => s._status === 'unverified').length;
      unregisteredCount = filteredStudents.filter(s => s._status === 'unregistered').length;
    } else {
      unverifiedCount = allUsers.filter(u => {
        if (u.emailVerified === true) return false;
        const gradeFromClass = getGradeFromClass(u.class);
        if (grade !== 'all' && gradeFromClass !== grade) return false;
        if (filterClass && u.class !== filterClass) return false;
        return true;
      }).length;
    }

    // ═══ RENDER SUMMARY ═══
    let html = `
      <div class="stats-summary">
        <span class="item">📝 <strong>${esc(assignmentDisplayName)}</strong></span>
        <span class="score-scale">Thang điểm: 0 → ${maxScoreOfAssignment}</span>
        <span class="item">👥 Sĩ số: <strong>${filteredStudents.length}</strong> HS${isRosterMode ? ' <span style="font-size:11px; color:#666;">(theo danh sách lớp)</span>' : ''}</span>
        ${isRosterMode && unverifiedCount > 0 ? `<span class="item" style="color:#D4A017;">📧 Chưa xác thực: <strong>${unverifiedCount}</strong></span>` : ''}
        ${isRosterMode && unregisteredCount > 0 ? `<span class="item" style="color:#999;">👤 Chưa đăng ký: <strong>${unregisteredCount}</strong></span>` : ''}
        ${!isRosterMode && unverifiedCount > 0 ? `<span class="item" style="color:#c0392b;">⏳ Chưa xác thực: <strong>${unverifiedCount}</strong> HS (đã loại)</span>` : ''}
        <span class="item">✅ Đã làm: <strong>${studentsDone}</strong> HS</span>
        <span class="item">📊 Tổng lượt: <strong>${totalAttempts}</strong></span>
        <span class="item">📈 Điểm TB: <strong>${avgOfAllScores}</strong></span>
        <span class="item">🏆 Cao nhất: <strong>${maxGot}</strong></span>
        <span class="item">📉 Thấp nhất: <strong>${minGot}</strong></span>
      </div>`;

    if (fixedOnTheFly > 0) {
      html += `<div class="alert alert-warn" style="margin-bottom:12px;">
        ⚡ <strong>${fixedOnTheFly} bài làm cũ</strong> chưa có điểm lưu trong DB — hệ thống vừa <strong>chấm tạm</strong> để hiển thị thống kê.
      </div>`;
    }

    // ═══ RENDER BẢNG ═══
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
            const isGhost = st._status === 'unregistered' || st._status === 'unverified';
            const info = st.id ? studentScores[st.id] : null;
            const attempts = info ? info.attempts : [];

            let attemptCells = '';
            if (isGhost || attempts.length === 0) {
              attemptCells = Array.from({ length: maxAttempts }, () => `<td class="score-empty">—</td>`).join('');
            } else {
              attemptCells = Array.from({ length: maxAttempts }, (_, i) => {
                const att = attempts[i];
                if (!att) return `<td class="score-empty">—</td>`;
                return `<td class="score-cell">${att.score}</td>`;
              }).join('');
            }

            let maxCell = '<td class="score-empty">—</td>';
            if (!isGhost && attempts.length > 0) {
              maxCell = `<td class="max-cell">${Math.max(...attempts.map(a => a.score))}</td>`;
            }
            let avgCell = '<td class="score-empty">—</td>';
            if (!isGhost && attempts.length > 0) {
              const avgScore = Math.round((attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) * 100) / 100;
              avgCell = `<td class="avg-cell"><strong>${avgScore}</strong><div style="font-size:10px; color:#666;">(${attempts.length} lần)</div></td>`;
            }

            let nameStyle = '';
            let nameTitle = '';
            let statusBadge = '';
            if (st._status === 'unregistered') {
              nameStyle = 'opacity:0.5; font-style:italic; color:#888;';
              nameTitle = 'HS có trong danh sách lớp nhưng CHƯA ĐĂNG KÝ tài khoản';
              statusBadge = '<span style="display:inline-block; margin-left:6px; padding:1px 6px; border-radius:8px; background:#F0F0F0; color:#888; font-size:10px; font-style:normal; font-weight:600;">Chưa đăng ký</span>';
            } else if (st._status === 'unverified') {
              nameStyle = 'opacity:0.65; font-style:italic; color:#8B4513;';
              nameTitle = 'HS đã đăng ký nhưng CHƯA XÁC THỰC email — không thể làm bài';
              statusBadge = '<span style="display:inline-block; margin-left:6px; padding:1px 6px; border-radius:8px; background:#FFF3CD; color:#8B4513; font-size:10px; font-style:normal; font-weight:600;">Chưa xác thực</span>';
            }

            const rosterStt = (st._rosterStt && st._rosterStt < 9999) ? st._rosterStt : null;
            const displayStt = rosterStt != null ? rosterStt : (idx + 1);
            const sttStyle = isGhost
              ? 'color:#999; font-style:italic; background:#FBF5F5;'
              : (rosterStt == null ? 'color:#999; font-style:italic; background:#FBF5F5;' : '');

            const displayName = isGhost ? st._rosterName : st.name;

            return `
              <tr style="${isGhost ? 'background:#FAFAFA;' : ''}">
                <td style="${sttStyle}" title="${rosterStt != null ? 'STT trong danh sách lớp' : 'Không có trong danh sách lớp'}">${displayStt}</td>
                <td class="student-name" style="${nameStyle}" title="${nameTitle}">${esc(displayName)}${statusBadge}</td>
                <td class="class-col" style="${isGhost ? 'opacity:0.5;' : ''}">${esc(st.class || '—')}</td>
                ${attemptCells}
                ${maxCell}
                ${avgCell}
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>`;

    // ═══ CHÚ THÍCH ═══
    html += `
      <div class="alert alert-info" style="margin-top:14px;">
        💡 <strong>Chú thích:</strong>
        <ul style="margin-left:20px; margin-top:6px;">
          <li>Đề tối đa <strong>${maxScoreOfAssignment} điểm</strong>${onlyAssigned ? ' • chỉ tính HS được giao đề' : ''}.</li>
          ${isRosterMode
            ? `<li>Bảng hiển thị theo <strong>danh sách lớp đã nạp</strong> — kể cả HS chưa đăng ký.</li>
               <li>HS <em style="color:#888;">mờ + ghi chú "Chưa đăng ký"</em> = có tên trong danh sách nhưng chưa tạo tài khoản.</li>
               <li>HS <em style="color:#8B4513;">mờ + ghi chú "Chưa xác thực"</em> = đã đăng ký nhưng chưa xác nhận email — không thể làm bài.</li>`
            : `<li>Chỉ tính <strong>HS đã xác thực email</strong>${unverifiedCount > 0 ? ` (đã loại ${unverifiedCount} HS chưa xác thực)` : ''}.</li>
               <li>Để xem theo danh sách lớp → chọn <strong>Lớp cụ thể</strong> + sắp xếp <strong>"Theo danh sách lớp"</strong>.</li>`}
          <li><strong>Điểm cao nhất</strong> = max trong các lần làm.</li>
          <li><strong>Điểm TB</strong> = trung bình cộng điểm các lần làm.</li>
          <li>Đề cho phép tối đa <strong>${maxAttempts} lần</strong>.</li>
        </ul>
      </div>`;

    wrap.innerHTML = html;
    state.lastStatsData = {
      filteredStudents, studentScores, assignment, assignmentDisplayName,
      maxScoreOfAssignment, maxAttempts, grade, filterClass, filterLesson,
      isRosterMode
    };
    if (exportBtn) exportBtn.disabled = false;
    if (printBtn) printBtn.disabled = false;
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(mapError(err))}</div>`;
  }
}

// ══════════════════════════════════════════════════════
// EXPORT CSV
// ══════════════════════════════════════════════════════
function exportStatsToCSV() {
  if (!state.lastStatsData) {
    toast('Chưa có dữ liệu. Bấm "🔄 Xem thống kê" trước.', 'error');
    return;
  }
  const { filteredStudents, studentScores, assignmentDisplayName, maxScoreOfAssignment, maxAttempts } = state.lastStatsData;
  const headers = ['STT', 'Họ và tên', 'Lớp', 'Trạng thái'];
  for (let i = 1; i <= maxAttempts; i++) headers.push(`Lần ${i}`);
  headers.push('Điểm cao nhất', 'Điểm TB', 'Số lần làm');
  const rows = [headers];
  filteredStudents.forEach((st, idx) => {
    const isGhost = st._status === 'unregistered' || st._status === 'unverified';
    const info = st.id ? studentScores[st.id] : null;
    const attempts = info ? info.attempts : [];

    const rosterStt = (st._rosterStt && st._rosterStt < 9999) ? st._rosterStt : null;
    const displayStt = rosterStt != null ? rosterStt : (idx + 1);
    const displayName = isGhost ? st._rosterName : st.name;

    let status = '';
    if (st._status === 'unregistered') status = 'Chưa đăng ký';
    else if (st._status === 'unverified') status = 'Chưa xác thực';
    else status = 'Đã đăng ký';

    const row = [displayStt, displayName || '', st.class || '', status];
    for (let i = 0; i < maxAttempts; i++) row.push(!isGhost && attempts[i] ? attempts[i].score : '—');
    row.push(!isGhost && attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : '—');
    row.push(!isGhost && attempts.length > 0
      ? Math.round((attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) * 100) / 100
      : '—');
    row.push(isGhost ? 0 : attempts.length);
    rows.push(row);
  });
  const infoRows = [
    [`Đề: ${assignmentDisplayName}`],
    [`Thang điểm: 0 - ${maxScoreOfAssignment}`],
    []
  ];
  const csvContent = [...infoRows, ...rows].map(row =>
    row.map(cell => {
      const s = String(cell == null ? '' : cell);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
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

// ══════════════════════════════════════════════════════
// PRINT SỔ ĐIỂM
// ══════════════════════════════════════════════════════
function printStats() {
  if (!state.lastStatsData) {
    toast('Chưa có dữ liệu. Bấm "🔄 Xem thống kê" trước.', 'error');
    return;
  }

  const { assignmentDisplayName, filteredStudents, studentScores, maxAttempts, maxScoreOfAssignment } = state.lastStatsData;

  const printWin = window.open('', '_blank');
  if (!printWin) {
    toast('Trình duyệt chặn popup. Vui lòng cho phép.', 'error');
    return;
  }

  let rows = '';
  filteredStudents.forEach((st, idx) => {
    const isGhost = st._status === 'unregistered' || st._status === 'unverified';
    const info = st.id ? studentScores[st.id] : null;
    const attempts = info ? info.attempts : [];

    let cells = '';
    for (let i = 0; i < maxAttempts; i++) {
      cells += `<td class="c">${!isGhost && attempts[i] ? attempts[i].score : '—'}</td>`;
    }
    const maxScore = !isGhost && attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null;
    const avgScore = !isGhost && attempts.length > 0
      ? Math.round((attempts.reduce((s, a) => s + a.score, 0) / attempts.length) * 100) / 100
      : null;
    const rosterStt = (st._rosterStt && st._rosterStt < 9999) ? st._rosterStt : null;
    const displayStt = rosterStt != null ? rosterStt : (idx + 1);
    const displayName = isGhost ? st._rosterName : st.name;

    const nameStyle = isGhost ? 'style="opacity:0.5; font-style:italic;"' : '';
    const sttStyle = isGhost ? 'style="opacity:0.5;"' : '';

    rows += `<tr>
      <td class="c" ${sttStyle}>${displayStt}</td>
      <td ${nameStyle}>${esc(displayName)}</td>
      <td class="c">${esc(st.class || '—')}</td>
      ${cells}
      <td class="c">${maxScore != null ? maxScore : '—'}</td>
      <td class="c">${avgScore != null ? avgScore : '—'}</td>
    </tr>`;
  });

  const headers = `<tr>
    <th style="width:40px;">STT</th>
    <th style="text-align:left;">Họ và tên</th>
    <th style="width:60px;">Lớp</th>
    ${Array.from({ length: maxAttempts }, (_, i) => `<th style="width:55px;">Lần ${i + 1}</th>`).join('')}
    <th style="width:80px;">Cao nhất</th>
    <th style="width:70px;">TB</th>
  </tr>`;

  printWin.document.write(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Bảng điểm — ${esc(assignmentDisplayName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; padding: 16px; color: #000; background: #FFF; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 6px; }
  .sub { text-align: center; font-size: 12pt; color: #555; margin-bottom: 16px; }
  .meta { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #333; padding: 5px 6px; text-align: left; }
  th { background: #8B5A2B; color: #FFF; text-align: center; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  td.c { text-align: center; }
  tbody tr:nth-child(even) { background: #F8F8F8; }
  .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 11pt; }
  .footer .sign-box { width: 45%; text-align: center; }
  .footer .sign-box .title { font-weight: 600; margin-bottom: 60px; }
  @page { margin: 1cm; size: A4 landscape; }
  @media print {
    body { padding: 0; }
    th { background: #8B5A2B !important; color: #FFF !important; }
  }
</style>
</head>
<body>
  <h1>BẢNG ĐIỂM</h1>
  <div class="sub">${esc(assignmentDisplayName)}</div>
  <div class="meta">
    <span>Thang điểm: 0 → ${maxScoreOfAssignment}</span>
    <span>Ngày in: ${new Date().toLocaleString('vi-VN')}</span>
  </div>
  <table>
    <thead>${headers}</thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <div class="sign-box">
      <div class="title">Giáo viên bộ môn</div>
      <div style="font-style: italic; font-size: 10pt;">(Ký, ghi rõ họ tên)</div>
    </div>
    <div class="sign-box">
      <div class="title">Ngày ..... tháng ..... năm .....</div>
      <div style="font-style: italic; font-size: 10pt;">(Ký, ghi rõ họ tên)</div>
    </div>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  <\/script>
</body>
</html>`);
  printWin.document.close();
}