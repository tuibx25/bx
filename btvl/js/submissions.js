import {
  db, collection, getDocs, doc, updateDoc, query, where, getDoc
} from './firebase-init.js';
import { state } from './state.js';
import { $, show, hide, esc, fmtDate, fmtDuration } from './utils.js';
import { parseQuestionsHtml } from './quiz.js';

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
export function initSubmissions() {
  $('studentDetailCloseBtn')?.addEventListener('click', () => hide($('studentDetailModal')));
  $('studentDetailModal')?.addEventListener('click', (e) => {
    if (e.target === $('studentDetailModal')) hide($('studentDetailModal'));
  });
}

// ══════════════════════════════════════════
// LOAD MY SUBMISSIONS
// ══════════════════════════════════════════
export async function loadMySubmissions() {
  const wrap = $('mySubmissions');
  if (!wrap) return;

  if (!state.currentUser || state.currentProfile?.role === 'teacher') {
    wrap.innerHTML = state.currentUser
      ? '<div class="empty">GV không có bài làm.</div>'
      : '<div class="empty">Đăng nhập để xem kết quả.</div>';
    return;
  }

  wrap.innerHTML = '<div class="empty">Đang tải...</div>';

  try {
    const q = query(collection(db, 'submissions'), where('studentId', '==', state.currentUser.uid));
    const snap = await getDocs(q);

    const vlq = query(collection(db, 'viewLogs'), where('studentId', '==', state.currentUser.uid));
    const vls = await getDocs(vlq);
    const myLogs = vls.docs.map(d => ({ id: d.id, ...d.data() }));

    if (snap.empty && myLogs.length === 0) {
      wrap.innerHTML = '<div class="empty">Chưa có hoạt động nào.</div>';
      return;
    }

    // ⭐ Load TẤT CẢ đề + bài học để lọc
    const [aSnap, lSnap] = await Promise.all([
      getDocs(collection(db, 'assignments')),
      getDocs(collection(db, 'lessons'))
    ]);
    const allAssignments = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allLessons = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ⭐ Tập hợp ID các đề + bài học bị ẩn
    const hiddenLessonIds = new Set(
      allLessons.filter(l => l.hidden === true).map(l => l.id)
    );
    const hiddenAssignmentIds = new Set(
      allAssignments.filter(a => a.hidden === true).map(a => a.id)
    );

    // ⭐ Hàm kiểm tra 1 assignment có bị ẩn không
    const isAssignmentHidden = (assignmentId) => {
      // Đề bị ẩn
      if (hiddenAssignmentIds.has(assignmentId)) return true;

      // Đề thuộc bài học bị ẩn
      const a = allAssignments.find(x => x.id === assignmentId);
      if (a && a.lessonId && hiddenLessonIds.has(a.lessonId)) return true;

      return false;
    };

    let html = '';

    // ═══ SUBMISSIONS ═══
    if (!snap.empty) {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // ⭐ Lọc bỏ bài làm của đề bị ẩn
      const visibleItems = items.filter(s => !isAssignmentHidden(s.assignmentId));

      visibleItems.sort((a, b) =>
        (b.submittedAt?.seconds || b.startedAt?.seconds || 0) -
        (a.submittedAt?.seconds || a.startedAt?.seconds || 0)
      );

      const grouped = {};
      visibleItems.forEach(s => { (grouped[s.assignmentId] ||= []).push(s); });

      html += Object.values(grouped).map(list => {
        const a = list[0];
        return `
          <div class="card">
            <div class="space-between">
              <h3>${esc(a.assignmentTitle)}</h3>
              <div><span class="badge badge-pending">Khối ${esc(a.grade)}</span></div>
            </div>
            ${list.map((s, i) => renderSubmissionItem(s, list.length - i)).join('')}
          </div>
        `;
      }).join('');
    }

    // ═══ EXTERNAL LOGS ═══
    const externalLogs = myLogs
      .filter(l => l.mode === 'external')
      .filter(l => !isAssignmentHidden(l.assignmentId)); // ⭐ Lọc ẩn

    if (externalLogs.length > 0) {
      const groupedLogs = {};
      externalLogs.forEach(l => { (groupedLogs[l.assignmentId] ||= []).push(l); });

      html += Object.values(groupedLogs).map(list => {
        const a = list[0];
        const totalDur = list.reduce((s, l) => s + (l.durationSec || 0), 0);
        return `
          <div class="card">
            <div class="space-between">
              <h3>${esc(a.assignmentTitle)}</h3>
              <div><span class="badge badge-pending">Khối ${esc(a.grade)}</span></div>
            </div>
            <div class="text-sm mt-2">
              <strong>Đã mở ${list.length} lần</strong> • Tổng thời gian: ${fmtDuration(totalDur)}
            </div>
          </div>
        `;
      }).join('');
    }

    if (!html.trim()) {
      wrap.innerHTML = '<div class="empty">Chưa có hoạt động nào.</div>';
      return;
    }

    wrap.innerHTML = html;

    // Bind view detail
    wrap.querySelectorAll('[data-view-student-detail]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const subId = btn.dataset.viewStudentDetail;
        const allSubs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const sub = allSubs.find(x => x.id === subId);
        if (sub) await showStudentDetail(sub);
      });
    });
  } catch (err) {
    console.error('Load submissions error:', err);
    wrap.innerHTML = `<div class="empty">Lỗi: ${esc(err.message)}</div>`;
  }
}

// ══════════════════════════════════════════
// RENDER SUBMISSION ITEM
// ══════════════════════════════════════════
function renderSubmissionItem(s, attemptNum) {
  let statusHtml = '';
  let actionBtn = '';

  if (s.status === 'in_progress') {
    statusHtml = `<span class="badge badge-inprogress">🔄 Đang làm</span>`;
  } else if (s.status === 'abandoned') {
    statusHtml = `<span class="badge badge-pending">⚠️ Hủy</span>`;
  } else if (s.status === 'published' || s.status === 'graded') {
    statusHtml = `<span class="badge badge-published">✅ Đã công bố</span>`;
    actionBtn = `<button class="btn btn-light btn-sm" data-view-student-detail="${s.id}">👁 Xem chi tiết</button>`;
  } else {
    statusHtml = `<span class="badge badge-pending">⏳ Chờ công bố</span>`;
  }

  const showScore = s.status === 'published' || s.status === 'graded';
  const finalScore = s.score != null ? s.score : s.autoScore;
  const maxScore = s.autoMax || 7;

  return `
    <div class="submission ${s.status === 'graded' || s.status === 'published' ? 'graded' : ''}">
      <div class="space-between">
        <strong>Lần ${attemptNum}</strong>
        <div style="display:flex; gap:8px;">${statusHtml}${actionBtn}</div>
      </div>
      <div class="text-sm mt-2">
        Bắt đầu: ${fmtDate(s.startedAt)}${s.submittedAt ? ` • Nộp: ${fmtDate(s.submittedAt)}` : ''}
      </div>
      ${s.timeSpent ? `<div class="text-sm">⏱ ${Math.floor(s.timeSpent / 60)}p ${s.timeSpent % 60}s</div>` : ''}
      ${showScore ? `
        <div class="mt-2" style="background:#E8F5E9; padding:12px; border-radius:6px; border-left:4px solid #0066CC;">
          <strong>Điểm:</strong>
          <span class="score-display">${esc(finalScore)}/${esc(maxScore)}</span>
          ${s.comment ? `<div class="text-sm mt-2">💬 <strong>Nhận xét:</strong> ${esc(s.comment)}</div>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ══════════════════════════════════════════
// SHOW STUDENT DETAIL
// ══════════════════════════════════════════
export async function showStudentDetail(sub) {
  try {
    await updateDoc(doc(db, 'submissions', sub.id), { studentViewed: true });
  } catch (e) {}

  const finalScore = sub.score != null ? sub.score : sub.autoScore;
  const maxScore = sub.autoMax || 7;

  let body = `
    <div class="detail-header">
      <div class="info">
        <h2>${esc(sub.assignmentTitle)}</h2>
        <div class="meta">
          📅 Nộp: ${fmtDate(sub.submittedAt)}
          ${sub.timeSpent ? ` • ⏱ ${Math.floor(sub.timeSpent / 60)}p ${sub.timeSpent % 60}s` : ''}
        </div>
      </div>
      <div class="score-box">
        <div class="score">${esc(finalScore)}/${esc(maxScore)}</div>
        <div class="label">Điểm trắc nghiệm</div>
      </div>
    </div>
  `;

  if (sub.comment) {
    body += `<div class="comment-box"><strong>💬 Nhận xét của GV:</strong><br>${esc(sub.comment)}</div>`;
  }

  body += `
    <div class="alert alert-info" style="margin-top:20px;">
      ℹ️ <strong>Lưu ý:</strong> Đây là <strong>điểm phần trắc nghiệm</strong>
      (tối đa ${esc(maxScore)} điểm). Điểm tự luận được GV chấm riêng.
    </div>
  `;

  if (state.currentProfile?.role === 'teacher') {
    body += await renderTeacherDetail(sub);
  }

  $('studentDetailBody').innerHTML = body;
  show($('studentDetailModal'));
}

// ══════════════════════════════════════════
// RENDER TEACHER DETAIL (chi tiết từng câu)
// ══════════════════════════════════════════
async function renderTeacherDetail(sub) {
  let html = '';
  let template = null;

  try {
    const aSnap = await getDoc(doc(db, 'assignments', sub.assignmentId));
    if (aSnap.exists()) {
      const aData = aSnap.data();
      if (aData.questionsHtml) {
        template = { questions: parseQuestionsHtml(aData.questionsHtml) };
      }
    }
  } catch (e) { console.warn(e); }

  if (!template || !sub.details) return '';

  html += `<h3 style="color:#8B4513; margin: 20px 0 12px;">📋 Chi tiết từng câu (chỉ GV thấy)</h3>`;

  const part1 = template.questions.filter(q => q.type === 'choice');
  const part2 = template.questions.filter(q => q.type === 'truefalse');
  const part3 = template.questions.filter(q => q.type === 'short');

  if (part1.length > 0) {
    html += `<div class="section-header part-1">I. PHẦN I — Trắc nghiệm</div>`;
    part1.forEach((q, idx) => {
      const detail = sub.details[q.id];
      if (!detail) return;
      const cls = detail.isCorrect ? 'correct' : 'wrong';
      const numCls = detail.isCorrect ? 'correct-bg' : 'wrong-bg';
      html += `
        <div class="question-detail ${cls}">
          <div class="q-num ${numCls}">Câu ${idx + 1} ${detail.isCorrect ? '✓' : '✗'} — ${detail.earned}/${detail.points} điểm</div>
          <div class="q-text">${q.textHtml || esc(q.text)}</div>
          ${q.options.map(opt => {
            let optCls = ''; let mark = '';
            if (opt.value === detail.correct) {
              optCls = 'correct-answer';
              mark = '<span class="mark check">✓ Đáp án</span>';
            }
            if (opt.value === detail.student && opt.value !== detail.correct) {
              optCls = 'student-wrong';
              mark = '<span class="mark cross">✗ HS</span>';
            }
            if (opt.value === detail.student && opt.value === detail.correct) {
              optCls = 'student-correct';
              mark = '<span class="mark check">✓ HS</span>';
            }
            let optHtml = opt.html || esc(opt.text);
            optHtml = optHtml.replace(/^\s*[A-D]\s*[.\s]\s*/i, '').trim();
            return `<div class="option-row ${optCls}"><span class="label">${opt.value}.</span><span>${optHtml}</span>${mark}</div>`;
          }).join('')}
        </div>
      `;
    });
  }

  if (part2.length > 0) {
    html += `<div class="section-header part-2">II. PHẦN II — Đúng/Sai</div>`;
    part2.forEach((q, idx) => {
      const detail = sub.details[q.id];
      if (!detail) return;
      const stDetails = detail.details || {};
      const cls = detail.correctCount === detail.total ? 'correct'
                : (detail.correctCount === 0 ? 'wrong' : 'partial');
      const numCls = detail.correctCount === detail.total ? 'correct-bg'
                   : (detail.correctCount === 0 ? 'wrong-bg' : 'partial-bg');
      html += `
        <div class="question-detail ${cls}">
          <div class="q-num ${numCls}">Câu ${idx + 1} — ${detail.correctCount}/${detail.total} ý — ${detail.earned.toFixed(2)}/${detail.points} điểm</div>
          <div class="q-text">${q.textHtml || esc(q.text)}</div>
          ${q.statements.map(st => {
            const d = stDetails[st.statement];
            if (!d) return '';
            return `
              <div class="tf-row-detail">
                <div class="stmt">${String.fromCharCode(97 + st.statement)}) ${st.html || esc(st.text)}</div>
                <div class="answers">
                  <div class="item ${d.isCorrect ? 'correct' : 'wrong'}"><strong>ĐA:</strong> ${st.correct ? 'Đ' : 'S'}</div>
                  <div class="item ${d.isCorrect ? 'correct' : 'wrong'}"><strong>HS:</strong> ${d.student === true ? 'Đ' : (d.student === false ? 'S' : '(bỏ)')}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    });
  }

  if (part3.length > 0) {
    html += `<div class="section-header part-3">III. PHẦN III — Trả lời ngắn</div>`;
    part3.forEach((q, idx) => {
      const detail = sub.details[q.id];
      if (!detail) return;
      const cls = detail.isCorrect ? 'correct' : 'wrong';
      const numCls = detail.isCorrect ? 'correct-bg' : 'wrong-bg';
      html += `
        <div class="question-detail ${cls}">
          <div class="q-num ${numCls}">Câu ${idx + 1} ${detail.isCorrect ? '✓' : '✗'} — ${detail.earned}/${detail.points} điểm</div>
          <div class="q-text">${q.textHtml || esc(q.text)}</div>
          <div class="option-row ${detail.isCorrect ? 'student-correct' : 'student-wrong'}">
            <span class="label">HS:</span><span>${esc(detail.student || '(bỏ)')}</span>
          </div>
          ${!detail.isCorrect ? `
            <div class="option-row correct-answer">
              <span class="label">ĐA:</span><span>${esc(detail.correct)}</span>
            </div>
          ` : ''}
        </div>
      `;
    });
  }

  return html;
}