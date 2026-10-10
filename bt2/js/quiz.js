import {
  db, collection, addDoc, doc, updateDoc, serverTimestamp
} from './firebase-init.js';
import { state } from './state.js';
import {
  $, show, hide, esc, toast, mapError, applyShuffle, fmtClock, randomSeed
} from './utils.js';

let _submitting = false;

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
export function initQuiz() {
  window.addEventListener('open:quiz', (e) => openStartQuizModal(e.detail));
  $('startQuizCancel')?.addEventListener('click', () => {
    hide($('startQuizModal'));
    state.currentQuizAssignment = null;
  });
  $('startQuizConfirm')?.addEventListener('click', startQuiz);
  $('abandonBtn')?.addEventListener('click', abandonQuiz);
  window.addEventListener('beforeunload', (e) => {
    if (state.currentQuizSession) {
      e.preventDefault();
      e.returnValue = 'Bạn đang làm bài. Bạn có chắc muốn rời đi?';
      return e.returnValue;
    }
  });
}

// ══════════════════════════════════════════
// PARSE HTML CÂU HỎI
// ══════════════════════════════════════════
export function parseQuestionsHtml(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const questions = [];
  doc.querySelectorAll('.question').forEach(qEl => {
    const id = qEl.dataset.id;
    const type = qEl.dataset.type;
    const answer = qEl.dataset.answer;
    const points = parseFloat(qEl.dataset.points || 1);
    if (!id || !type) return;
    const qTextEl = qEl.querySelector('.q-text');
    const qText = qTextEl?.textContent?.trim() || '';
    const qTextHtml = qTextEl?.innerHTML?.trim() || '';
    if (type === 'choice') {
      const options = [];
      qEl.querySelectorAll('input[type="radio"]').forEach(inp => {
        const parent = inp.parentElement;
        const rawHtml = parent.innerHTML.trim();
        let htmlAfterInput = rawHtml.replace(/^<input[^>]*>\s*/, '');
        htmlAfterInput = htmlAfterInput.replace(/^\s*[A-D]\s*[.\s]\s*/i, '').trim();
        options.push({
          value: inp.value,
          text: parent.textContent.trim().replace(/^[A-D].\s*/, ''),
          html: htmlAfterInput
        });
      });
      questions.push({ id, type: 'choice', text: qText, textHtml: qTextHtml, options, correctAnswer: answer, points });
    } else if (type === 'truefalse') {
      const statements = [];
      qEl.querySelectorAll('.tf-item').forEach(tfEl => {
        const stmtEl = tfEl.querySelector('.tf-stmt') || tfEl.querySelector('span:first-child');
        const stmtText = stmtEl?.textContent?.trim() || '';
        let stmtHtml = stmtEl?.innerHTML?.trim() || '';
        stmtHtml = stmtHtml.replace(/^\s*[a-d]\s*\)\s*/i, '');
        statements.push({
          statement: parseInt(tfEl.dataset.statement),
          text: stmtText,
          html: stmtHtml,
          correct: tfEl.dataset.answer === 'true'
        });
      });
      questions.push({ id, type: 'truefalse', text: qText, textHtml: qTextHtml, statements, points });
    } else if (type === 'short') {
      questions.push({ id, type: 'short', text: qText, textHtml: qTextHtml, correctAnswer: answer, points });
    }
  });
  return questions;
}

// ⭐ v2.1: BẢN CÔNG KHAI — fallback questionsHtml CHỈ dành cho GV
// (HS tuyệt đối không chạm bản chứa đáp án)
export function getPublicQuestions(a) {
  const isTeacher = state.currentProfile?.role === 'teacher';
  const html = a?.questionsPublicHtml || (isTeacher ? a?.questionsHtml : '') || '';
  if (!html) return [];
  return parseQuestionsHtml(html);
}

// ══════════════════════════════════════════
// ⭐ RENDER REVIEW CHUNG (HS xem lại + GV chấm)
// ══════════════════════════════════════════
export function renderReviewHtml(sub, questions) {
  if (!sub || !sub.details || !questions?.length) return '';
  const ordered = applyShuffle(questions, sub.shuffleSeed || 0);
  let html = `<h3 style="color:#8B4513; margin: 20px 0 12px;">📋 Chi tiết từng câu</h3>`;
  const part1 = ordered.filter(q => q.type === 'choice');
  const part2 = ordered.filter(q => q.type === 'truefalse');
  const part3 = ordered.filter(q => q.type === 'short');
  if (part1.length > 0) {
    html += `<div class="section-header part-1">I. PHẦN I — Trắc nghiệm</div>`;
    part1.forEach((q, idx) => {
      const detail = sub.details[q.id];
      if (!detail) return;
      const cls = detail.isCorrect ? 'correct' : 'wrong';
      const numCls = detail.isCorrect ? 'correct-bg' : 'wrong-bg';
      html += `<div class="question-detail ${cls}">
        <div class="q-num ${numCls}">Câu ${idx + 1} ${detail.isCorrect ? '✓' : '✗'} — ${detail.earned}/${detail.points} điểm</div>
        <div class="q-text">${q.textHtml || esc(q.text)}</div>
        ${(q.options || []).map(opt => {
          let optCls = '';
          let mark = '';
          if (opt.value === detail.correct) { optCls = 'correct-answer'; mark = '<span class="mark check">✓ Đáp án</span>'; }
          if (opt.value === detail.student && opt.value !== detail.correct) { optCls = 'student-wrong'; mark = '<span class="mark cross">✗ Bạn</span>'; }
          if (opt.value === detail.student && opt.value === detail.correct) { optCls = 'student-correct'; mark = '<span class="mark check">✓ Bạn</span>'; }
          let optHtml = opt.html || esc(opt.text);
          optHtml = optHtml.replace(/^\s*[A-D]\s*[.\s]\s*/i, '').trim();
          return `<div class="option-row ${optCls}">
            <span class="label">${opt.value}.</span>
            <span>${optHtml}</span>${mark}
          </div>`;
        }).join('')}
      </div>`;
    });
  }
  if (part2.length > 0) {
    html += `<div class="section-header part-2">II. PHẦN II — Đúng/Sai</div>`;
    part2.forEach((q, idx) => {
      const detail = sub.details[q.id];
      if (!detail) return;
      const stDetails = detail.details || {};
      const cls = detail.correctCount === detail.total ? 'correct' : (detail.correctCount === 0 ? 'wrong' : 'partial');
      const numCls = detail.correctCount === detail.total ? 'correct-bg' : (detail.correctCount === 0 ? 'wrong-bg' : 'partial-bg');
      html += `<div class="question-detail ${cls}">
        <div class="q-num ${numCls}">Câu ${idx + 1} — ${detail.correctCount}/${detail.total} ý — ${Number(detail.earned).toFixed(2)}/${detail.points} điểm</div>
        <div class="q-text">${q.textHtml || esc(q.text)}</div>
        ${(q.statements || []).map(st => {
          const d = stDetails[st.statement];
          if (!d) return '';
          return `<div class="tf-row-detail">
            <div class="stmt">${String.fromCharCode(97 + st.statement)}) ${st.html || esc(st.text)}</div>
            <div class="answers">
              <div class="item ${d.isCorrect ? 'correct' : 'wrong'}"><strong>ĐA:</strong> ${d.correct ? 'Đ' : 'S'}</div>
              <div class="item ${d.isCorrect ? 'correct' : 'wrong'}"><strong>Bạn:</strong> ${d.student === true ? 'Đ' : (d.student === false ? 'S' : '(bỏ)')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    });
  }
  if (part3.length > 0) {
    html += `<div class="section-header part-3">III. PHẦN III — Trả lời ngắn</div>`;
    part3.forEach((q, idx) => {
      const detail = sub.details[q.id];
      if (!detail) return;
      const cls = detail.isCorrect ? 'correct' : 'wrong';
      const numCls = detail.isCorrect ? 'correct-bg' : 'wrong-bg';
      html += `<div class="question-detail ${cls}">
        <div class="q-num ${numCls}">Câu ${idx + 1} ${detail.isCorrect ? '✓' : '✗'} — ${detail.earned}/${detail.points} điểm</div>
        <div class="q-text">${q.textHtml || esc(q.text)}</div>
        <div class="option-row ${detail.isCorrect ? 'student-correct' : 'student-wrong'}"><span class="label">Bạn:</span><span>${esc(detail.student || '(bỏ)')}</span></div>
        ${!detail.isCorrect ? `<div class="option-row correct-answer">
          <span class="label">ĐA:</span>
          <span>${esc(detail.correct)}</span>
        </div>` : ''}
      </div>`;
    });
  }
  return html;
}

// ══════════════════════════════════════════
// ⭐ v2.1: TỰ CHỐT PHIÊN MỒ CÔI (HS tắt máy giữa chừng)
// ══════════════════════════════════════════
async function finalizeOrphanSession(sub) {
  const answers = sub.draftAnswers || {};
  const now = Date.now();
  const startedAtMs = sub.startedAtMs || (sub.startedAt?.toMillis?.() || now);
  const deadlineAt = sub.deadlineAt || now;
  await updateDoc(doc(db, 'submissions', sub.id), {
    status: 'submitted',
    answers,
    answer: `[Hết giờ - tự động nộp] ${Object.keys(answers).length} câu`,
    submittedAt: serverTimestamp(),
    submittedAtMs: now,
    timeSpent: Math.max(0, Math.round((deadlineAt - startedAtMs) / 1000)),
    isLate: true,
    isTimeout: true
  });
}

// ══════════════════════════════════════════
// OPEN START MODAL
// ══════════════════════════════════════════
async function openStartQuizModal(a) {
  if (!a) return;
  if (!state.currentUser) {
    toast('Vui lòng đăng nhập', 'error');
    window.dispatchEvent(new CustomEvent('open:login'));
    return;
  }
  if (state.currentProfile?.role === 'teacher') { toast('GV không làm bài', 'error'); return; }
  if (!state.currentUser.emailVerified) { toast('Vui lòng xác thực email', 'error'); return; }
  // ⭐ v2.1: đề đã ẩn thì chặn luôn
  if (a.hidden === true || a.lessonHidden === true) {
    toast('Đề này đã bị ẩn. Không thể làm bài.', 'error');
    return;
  }
  const mySubs = state.mySubsCache.filter(s => s.assignmentId === a.id);
  // ⭐ v2.1: xử lý phiên "mồ côi" trước khi cho làm lượt mới
  const orphan = mySubs.find(s => s.status === 'in_progress');
  if (orphan) {
    const now = Date.now();
    if (now > (orphan.deadlineAt || 0) + 60000) {
      try {
        await finalizeOrphanSession(orphan);
        toast('⏱ Phiên làm dở đã quá hạn — hệ thống tự nộp từ bản nháp. Bấm "Làm bài" lần nữa để vào lượt mới.', 'info');
      } catch (e) {
        toast('Không tự chốt được phiên cũ. Nhờ GV bấm "⏱ Thu bài hết giờ".', 'error');
      }
      window.dispatchEvent(new CustomEvent('data:refresh'));
      return;
    }
    toast('Bạn còn phiên đang làm chưa hết hạn. Chờ hết giờ hoặc báo GV.', 'error');
    return;
  }
  const maxAttempts = a.maxAttempts || 3;
  if (mySubs.length >= maxAttempts) { toast(`Đã làm ${maxAttempts} lần`, 'error'); return; }
  state.currentQuizAssignment = a;
  const attempt = mySubs.length + 1;
  $('startQuizInfo').innerHTML = `<div style="background:#F5F5DC; padding:12px; border-radius:6px;">
    <strong>${esc(a.title)}</strong><br>
    <span style="font-size:13px; color:#555;">Lần ${attempt}/${maxAttempts}</span>
    <div style="margin-top:10px;">⏱ ${esc(a.duration || 25)} phút</div>
    <div style="margin-top:6px; font-size:12px; color:#0066CC;">🔀 Thứ tự câu hỏi & phương án xáo ngẫu nhiên mỗi lượt.</div>
  </div>`;
  show($('startQuizModal'));
}

// ══════════════════════════════════════════
// ⭐ START QUIZ — bản LITE: HS tự tạo phiên (Rules chặn ghi điểm)
// ══════════════════════════════════════════
async function startQuiz() {
  if (_submitting || !state.currentQuizAssignment) return;
  const a = state.currentQuizAssignment;
  const btn = $('startQuizConfirm');
  _submitting = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tạo phiên...'; }
  try {
    const mySubs = state.mySubsCache.filter(s => s.assignmentId === a.id);
    const maxAttempts = a.maxAttempts || 3;
    if (mySubs.length >= maxAttempts) { toast('Đã hết lượt làm', 'error'); return; }
    if (mySubs.some(s => s.status === 'in_progress')) { toast('Bạn đang có phiên chưa kết thúc', 'error'); return; }
    if (a.deadline && Date.now() > new Date(a.deadline + 'T23:59:59').getTime()) { toast('Đã quá hạn nộp', 'error'); return; }
    const shuffleSeed = randomSeed(); // ⭐ v2.1: seed luôn ≥ 1
    const questions = applyShuffle(getPublicQuestions(a), shuffleSeed);
    if (questions.length === 0) { toast('Đề không có câu hỏi hợp lệ! Báo GV nhé.', 'error'); return; }
    const duration = Number(a.duration) || 25;
    const now = Date.now();
    const ref = await addDoc(collection(db, 'submissions'), {
      assignmentId: a.id, assignmentTitle: a.title, grade: a.grade,
      type: 'quiz', mode: 'inline',
      studentId: state.currentUser.uid,
      studentName: state.currentProfile.name || state.currentUser.email,
      studentClass: state.currentProfile.class || '',
      answer: '[Đang làm]', status: 'in_progress', duration,
      sessionId: 'sess_' + now + '_' + Math.random().toString(36).slice(2, 10),
      shuffleSeed,
      startedAt: serverTimestamp(), startedAtMs: now,
      deadlineAt: now + duration * 60000,
      draftAnswers: {}, answers: null,
      autoScore: null, autoMax: null, score: null, comment: '',
      submittedAt: null
    });
    hide($('startQuizModal'));
    state.currentQuizSession = {
      attemptId: ref.id, startedAt: now, deadlineAt: now + duration * 60000,
      duration, seed: shuffleSeed, template: { questions }
    };
    showQuizInline(a, questions);
    startCountdownTimer();
    startDraftHeartbeat();
    const iframe = document.getElementById('inlineQuizFrame');
    if (iframe) {
      iframe.onload = () => setTimeout(injectQuizRuntime, 300);
      setTimeout(injectQuizRuntime, 800);
    }
  } catch (err) {
    console.error(err);
    toast(mapError(err), 'error');
  } finally {
    _submitting = false;
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Bắt đầu'; }
  }
}

// ══════════════════════════════════════════
// SHOW QUIZ INLINE (iframe KHÔNG nhúng đáp án)
// ══════════════════════════════════════════
function showQuizInline(a, questions) {
  const container = document.getElementById('quizFrameContainer');
  if (!container) return;
  const part1 = questions.filter(q => q.type === 'choice');
  const part2 = questions.filter(q => q.type === 'truefalse');
  const part3 = questions.filter(q => q.type === 'short');
  let questionsHtml = '';
  const stripCauPrefix = (html) => (html || '')
    .replace(/^<?strong>?Câu\s+\d+[.:]?\s*<?\/?strong>?/i, '')
    .replace(/^Câu\s+\d+[.:]?\s*/i, '')
    .trim();
  if (part1.length > 0) {
    questionsHtml += `<div class="section-header part-1">I. PHẦN I. Trắc nghiệm nhiều phương án lựa chọn</div>\n`;
    questionsHtml += `<p class="section-note">(Trả lời từ câu 1 đến câu ${part1.length}. Mỗi câu chọn một phương án)</p>\n`;
    part1.forEach((q, idx) => {
      const bodyHtml = stripCauPrefix(q.textHtml || esc(q.text));
      questionsHtml += `<div class="question" data-id="${q.id}" data-type="choice" data-points="${q.points || 1}">
        <div class="q-text"><strong>Câu ${idx + 1}.</strong> ${bodyHtml}</div>
        ${q.options.map(opt => {
          let optContent = opt.html || esc(opt.text);
          optContent = optContent.replace(/^\s*[A-D]\s*[.\s]\s*/i, '').trim();
          return `<label class="opt">
            <input type="radio" name="${q.id}" value="${opt.value}">
            ${opt.value}. ${optContent}
          </label>`;
        }).join('')}
      </div>`;
    });
  }
  if (part2.length > 0) {
    questionsHtml += `<div class="section-header part-2">II. PHẦN II. Trắc nghiệm đúng sai</div>\n`;
    questionsHtml += `<p class="section-note">(Trong mỗi ý a), b), c), d) ở mỗi câu, chọn đúng hoặc sai)</p>\n`;
    part2.forEach((q, idx) => {
      const bodyHtml = stripCauPrefix(q.textHtml || esc(q.text));
      questionsHtml += `<div class="question" data-id="${q.id}" data-type="truefalse" data-points="${q.points || 1}">
        <div class="q-text"><strong>Câu ${idx + 1}.</strong> ${bodyHtml}</div>
        ${q.statements.map(st => `<div class="tf-item" data-statement="${st.statement}">
          <span class="tf-stmt">${String.fromCharCode(97 + st.statement)}) ${st.html || esc(st.text)}</span>
          <span class="tf-btns">
            <button type="button" class="tf-btn" data-q="${q.id}" data-s="${st.statement}" data-val="true">Đúng</button>
            <button type="button" class="tf-btn" data-q="${q.id}" data-s="${st.statement}" data-val="false">Sai</button>
          </span>
        </div>`).join('')}
      </div>`;
    });
  }
  if (part3.length > 0) {
    questionsHtml += `<div class="section-header part-3">III. PHẦN III. Trắc nghiệm trả lời ngắn</div>\n`;
    questionsHtml += `<p class="section-note">(Trả lời từ câu 1 đến câu ${part3.length})</p>\n`;
    part3.forEach((q, idx) => {
      const bodyHtml = stripCauPrefix(q.textHtml || esc(q.text));
      questionsHtml += `<div class="question" data-id="${q.id}" data-type="short" data-points="${q.points || 1}">
        <div class="q-text"><strong>Câu ${idx + 1}.</strong> ${bodyHtml}</div>
        <input type="text" class="short-answer" placeholder="Nhập đáp án..." />
      </div>`;
    });
  }
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(a.title)}</title>
<script>
window.MathJax = { tex: { inlineMath: [['\\\\(', '\\\\)'], ['$', '$']], displayMath: [['\\\\[', '\\\\]'], ['$$', '$$']] }, svg: { fontCache: 'global' } };
<\/script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js" async><\/script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F5F5F5; padding: 16px; line-height: 1.7; -webkit-text-size-adjust: 100%; }
.quiz-container { max-width: 900px; margin: 0 auto; background: #FFF; padding: 20px; border-radius: 10px; border-left: 5px solid #8B5A2B; }
h1 { color: #8B4513; font-size: 1.4em; text-align: center; border-bottom: 2px solid #8B5A2B; padding-bottom: 8px; margin-bottom: 16px; }
.progress-info { text-align: center; color: #555; font-size: 0.9em; margin-bottom: 12px; }
.section-header { color: #FFF; padding: 14px 20px; border-radius: 8px; margin: 24px 0 14px; font-weight: 700; font-size: 16px; }
.section-header.part-1 { background: linear-gradient(135deg, #8B5A2B 0%, #8B4513 100%); }
.section-header.part-2 { background: linear-gradient(135deg, #0066CC 0%, #004488 100%); }
.section-header.part-3 { background: linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%); }
.section-note { font-style: italic; color: #555; font-size: 13px; margin-bottom: 12px; padding-left: 4px; }
.question { background: #F5F5F5; padding: 12px 14px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid #0066CC; }
.q-text { font-weight: 600; margin-bottom: 8px; }
img { max-width: 100%; height: auto; }
.q-text img { max-width: 100%; border-radius: 4px; margin: 6px 0; display: block; }
.opt img { max-height: 80px; vertical-align: middle; margin: 2px 4px; }
.tf-stmt img { max-width: 100%; vertical-align: middle; margin: 4px 0; }
.opt { display: block; padding: 8px 12px; margin: 4px 0; background: #FFF; border: 1px solid #D3D3D3; border-radius: 6px; cursor: pointer; }
.opt:hover { background: #F5F5DC; border-color: #8B5A2B; }
.opt input { margin-right: 8px; }
.opt.selected { background: #F5DEB3; border-color: #8B5A2B; }
.tf-item { display: flex; justify-content: space-between; padding: 10px 12px; background: #FFF; border: 1px solid #D3D3D3; border-radius: 6px; margin: 4px 0; gap: 10px; flex-wrap: wrap; }
.tf-stmt { flex: 1; min-width: 200px; }
.tf-btns { display: flex; gap: 6px; }
.tf-btn { padding: 6px 16px; border: 1px solid #D3D3D3; background: #FFF; border-radius: 4px; cursor: pointer; font-weight: 600; font-family: inherit; font-size: 14px; }
.tf-btn.selected-true { background: #0066CC; color: #FFF; border-color: #0066CC; }
.tf-btn.selected-false { background: #8B5A2B; color: #FFF; border-color: #8B5A2B; }
.short-answer { width: 100%; padding: 10px 12px; border: 1px solid #D3D3D3; border-radius: 6px; font-family: inherit; font-size: 15px; }
.submit-bar { position: sticky; bottom: 0; background: #FFF; padding: 12px 0; border-top: 2px solid #8B5A2B; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; box-shadow: 0 -2px 8px rgba(0,0,0,0.05); }
.btn { padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 15px; font-weight: 600; font-family: inherit; }
.btn-primary { background: #8B5A2B; color: #FFF; }
.btn-primary:hover { background: #8B4513; }
mjx-container { overflow-x: auto; max-width: 100%; }
@media (max-width: 640px) {
  body { padding: 8px; }
  .quiz-container { padding: 12px; border-radius: 0; border-left-width: 3px; padding-bottom: 90px; }
  h1 { font-size: 1.1em; }
  .section-header { padding: 10px 14px; font-size: 14px; margin: 16px 10px 10px 0; }
  .section-note { font-size: 12px; }
  .question { padding: 10px; margin-bottom: 10px; }
  .q-text { font-size: 14px; }
  .opt { padding: 12px; font-size: 14px; }
  .tf-item { padding: 10px; flex-direction: column; gap: 8px; }
  .tf-stmt { font-size: 14px; }
  .tf-btns { width: 100%; }
  .tf-btn { flex: 1; padding: 12px; font-size: 15px; }
  .short-answer { padding: 12px; font-size: 16px; }
  .submit-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 12px 16px; z-index: 100; }
}
</style>
</head>
<body>
<div class="quiz-container">
  <h1>${esc(a.title)}</h1>
  <div class="progress-info">Đã trả lời: <strong id="answeredCount">0</strong> / <strong id="totalCount">${questions.length}</strong> câu</div>
  <div id="quizArea">${questionsHtml}</div>
  <div class="submit-bar">
    <span id="statusMsg" style="color:#555; font-size:14px;"></span>
    <button class="btn btn-primary" id="submitBtn">Nộp bài</button>
  </div>
</div>
</body>
</html>`;
  container.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.id = 'inlineQuizFrame';
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  iframe.srcdoc = html;
  container.appendChild(iframe);
  show($('countdownOverlay'));
}

// ══════════════════════════════════════════
// INJECT RUNTIME — ⭐ v2.1: chống bind trùng 2 lần
// ══════════════════════════════════════════
function injectQuizRuntime() {
  const iframe = document.getElementById('inlineQuizFrame');
  if (!iframe) return;
  if (iframe.dataset.runtimeInjected === '1') return;
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return;
  iframe.dataset.runtimeInjected = '1';
  doc.querySelectorAll('input[type="radio"]').forEach(input => {
    input.addEventListener('change', (e) => {
      const qi = e.target.name;
      doc.querySelectorAll('.opt').forEach(l => {
        if (l.querySelector(`input[name="${qi}"]`)) l.classList.remove('selected');
      });
      e.target.closest('.opt')?.classList.add('selected');
      updateInlineAnsweredCount();
    });
  });
  doc.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q, s = btn.dataset.s;
      const val = btn.dataset.val === 'true';
      doc.querySelectorAll(`.tf-btn[data-q="${q}"][data-s="${s}"]`).forEach(b => {
        b.classList.remove('selected-true', 'selected-false');
      });
      btn.classList.add(val ? 'selected-true' : 'selected-false');
      updateInlineAnsweredCount();
    });
  });
  doc.querySelectorAll('.short-answer').forEach(inp => {
    inp.addEventListener('input', updateInlineAnsweredCount);
  });
  const submitBtn = doc.getElementById('submitBtn');
  if (submitBtn && !submitBtn.dataset.bound) {
    submitBtn.dataset.bound = 'true';
    submitBtn.addEventListener('click', async () => {
      const answers = collectInlineAnswers();
      const total = state.currentQuizSession?.template.questions.length || 0;
      const answered = Object.keys(answers).length;
      if (answered === 0) { alert('Em chưa trả lời câu nào!'); return; }
      if (answered < total && !confirm(`Còn ${total - answered} câu chưa trả lời. Vẫn nộp?`)) return;
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Đang nộp...';
      await submitQuizToServer(answers, false);
    });
  }
  if (doc.defaultView?.MathJax?.typesetPromise) {
    doc.defaultView.MathJax.typesetPromise().catch(e => console.warn(e));
  }
  updateInlineAnsweredCount();
}

function updateInlineAnsweredCount() {
  const iframe = document.getElementById('inlineQuizFrame');
  if (!iframe?.contentDocument) return;
  const doc = iframe.contentDocument;
  const answers = collectInlineAnswers();
  const total = state.currentQuizSession?.template.questions.length || 0;
  const answered = Object.keys(answers).length;
  const c = doc.getElementById('answeredCount');
  if (c) c.textContent = answered;
  const t = doc.getElementById('totalCount');
  if (t) t.textContent = total;
  const m = doc.getElementById('statusMsg');
  if (m) m.textContent = answered === total ? '✅ Đã trả lời hết' : `Còn ${total - answered} câu chưa trả lời`;
}

// ⭐ Chỉ tính câu ĐÃ trả lời thật
function collectInlineAnswers() {
  const iframe = document.getElementById('inlineQuizFrame');
  if (!iframe?.contentDocument) return {};
  const doc = iframe.contentDocument;
  const answers = {};
  doc.querySelectorAll('.question[data-type="choice"]').forEach(q => {
    const checked = q.querySelector('input[type="radio"]:checked');
    if (checked) answers[q.dataset.id] = checked.value;
  });
  doc.querySelectorAll('.question[data-type="truefalse"]').forEach(q => {
    const obj = {};
    q.querySelectorAll('.tf-item').forEach(tf => {
      const stmtId = parseInt(tf.dataset.statement);
      const sel = tf.querySelector('.tf-btn.selected-true, .tf-btn.selected-false');
      if (sel) obj[stmtId] = sel.dataset.val === 'true';
    });
    if (Object.keys(obj).length > 0) answers[q.dataset.id] = obj;
  });
  doc.querySelectorAll('.question[data-type="short"]').forEach(q => {
    const val = q.querySelector('.short-answer')?.value.trim();
    if (val) answers[q.dataset.id] = val;
  });
  return answers;
}

// ══════════════════════════════════════════
// DRAFT HEARTBEAT 30s
// ══════════════════════════════════════════
function startDraftHeartbeat() {
  stopDraftHeartbeat();
  state.quizDraftInterval = setInterval(async () => {
    if (!state.currentQuizSession) return;
    try {
      await updateDoc(doc(db, 'submissions', state.currentQuizSession.attemptId), {
        draftAnswers: collectInlineAnswers(),
        draftAt: Date.now()
      });
    } catch (e) {}
  }, 30000);
}
function stopDraftHeartbeat() {
  if (state.quizDraftInterval) clearInterval(state.quizDraftInterval);
  state.quizDraftInterval = null;
}

// ══════════════════════════════════════════
// TIMER
// ══════════════════════════════════════════
function startCountdownTimer() {
  if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
  updateCountdown();
  state.quizTimerInterval = setInterval(updateCountdown, 1000);
}
function updateCountdown() {
  if (!state.currentQuizSession) return;
  const remainMs = state.currentQuizSession.deadlineAt - Date.now();
  const timerEl = $('countdownTimer');
  if (!timerEl) return;
  if (remainMs <= 0) {
    timerEl.textContent = 'HẾT GIỜ';
    timerEl.classList.add('warning');
    clearInterval(state.quizTimerInterval);
    autoSubmitOnTimeout();
    return;
  }
  const sec = Math.floor(remainMs / 1000);
  timerEl.textContent = fmtClock(sec);
  if (sec < 60) timerEl.classList.add('warning');
  else timerEl.classList.remove('warning');
}

// ⭐ v2.1: hết giờ → nộp lại tối đa 3 lần nếu mất mạng
async function autoSubmitOnTimeout() {
  if (!state.currentQuizSession) return;
  const answers = collectInlineAnswers();
  for (let i = 0; i < 3; i++) {
    const ok = await submitQuizToServer(answers, true, { silentFail: true });
    if (ok) return;
    await new Promise(r => setTimeout(r, 2000));
  }
  toast('⚠️ Không nộp tự động được (mất mạng?). GV sẽ thu bằng nút "⏱ Thu bài hết giờ".', 'error');
}

// ══════════════════════════════════════════
// ⭐ NỘP BÀI — v2.1: nộp lỗi thì PHỤC HỒI để bấm nộp lại
// ══════════════════════════════════════════
async function submitQuizToServer(answers, isTimeout, opts = {}) {
  if (!state.currentQuizSession) return false;
  const session = state.currentQuizSession;
  stopDraftHeartbeat();
  if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
  const now = Date.now();
  try {
    await updateDoc(doc(db, 'submissions', session.attemptId), {
      status: 'submitted',
      answers,
      answer: isTimeout ? '[Hết giờ - tự động nộp]' : `[Đã nộp] ${Object.keys(answers).length} câu`,
      submittedAt: serverTimestamp(), submittedAtMs: now,
      timeSpent: Math.max(0, Math.round((now - session.startedAt) / 1000)),
      isLate: now > session.deadlineAt,
      isTimeout: !!isTimeout
    });
    toast(isTimeout ? '⏱ Hết giờ! Đã nộp bài.' : '✅ Đã nộp bài! GV sẽ chấm & công bố điểm.', 'success');
    cleanupSession();
    window.dispatchEvent(new CustomEvent('data:refresh'));
    return true;
  } catch (err) {
    console.error(err);
    if (!opts.silentFail) toast('❌ Nộp lỗi: ' + mapError(err) + ' — bấm Nộp bài thử lại.', 'error');
    // ⭐ phục hồi phiên để HS nộp lại
    startDraftHeartbeat();
    startCountdownTimer();
    const btn = document.getElementById('inlineQuizFrame')?.contentDocument?.getElementById('submitBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Nộp bài'; }
    return false;
  }
}

function cleanupSession() {
  stopDraftHeartbeat();
  if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
  state.quizTimerInterval = null;
  const iframe = document.getElementById('inlineQuizFrame');
  if (iframe) iframe.remove();
  hide($('countdownOverlay'));
  state.currentQuizSession = null;
  state.currentQuizAssignment = null;
  const timerEl = $('countdownTimer');
  if (timerEl) { timerEl.textContent = '--:--'; timerEl.classList.remove('warning'); }
}

// ══════════════════════════════════════════
// ABANDON
// ══════════════════════════════════════════
async function abandonQuiz() {
  if (!state.currentQuizSession) return;
  if (!confirm('⚠️ Hủy bài? Lượt này VẪN TÍNH.')) return;
  stopDraftHeartbeat();
  try {
    await updateDoc(doc(db, 'submissions', state.currentQuizSession.attemptId), {
      status: 'abandoned',
      answer: '[HS hủy]',
      abandonedAt: Date.now(),
      submittedAt: serverTimestamp()
    });
  } catch (e) {}
  cleanupSession();
  toast('Đã hủy lượt làm.', 'error');
  window.dispatchEvent(new CustomEvent('data:refresh'));
}