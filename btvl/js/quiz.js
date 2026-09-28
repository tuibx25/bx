import {
  db, collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, where, getDoc
} from './firebase-init.js';
import { state } from './state.js';
import { $, show, hide, esc, toast } from './utils.js';

export function initQuiz() {
  window.addEventListener('open:quiz', (e) => openStartQuizModal(e.detail));

  $('startQuizCancel').addEventListener('click', () => {
    hide($('startQuizModal'));
    state.currentQuizAssignment = null;
  });

  $('startQuizConfirm').addEventListener('click', startQuiz);

  $('abandonBtn').addEventListener('click', abandonQuiz);

  // Warn khi đóng tab
  window.addEventListener('beforeunload', (e) => {
    if (state.currentQuizSession) {
      e.preventDefault();
      e.returnValue = 'Bạn đang làm bài. Bạn có chắc muốn rời đi?';
      return e.returnValue;
    }
  });
}

// ═══ PARSE HTML CÂU HỎI ═══
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
          text: parent.textContent.trim().replace(/^[A-D]\.\s*/, ''),
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
        stmtHtml = stmtHtml.replace(/^[a-d]\)\s*/i, '');
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

// ═══ CHẤM ĐIỂM ═══
export function gradeSubmission(template, studentAnswers) {
  let totalScore = 0;
  let maxScore = 0;
  const details = {};

  template.questions.forEach(q => {
    const points = parseFloat(q.points || 1);
    maxScore += points;
    const studentAns = studentAnswers[q.id];

    if (q.type === 'choice') {
      const isCorrect = studentAns === q.correctAnswer;
      const earned = isCorrect ? points : 0;
      totalScore += earned;
      details[q.id] = { type: 'choice', student: studentAns, correct: q.correctAnswer, isCorrect, points, earned };
    } else if (q.type === 'truefalse') {
      const perStmt = points / q.statements.length;
      let correctCount = 0;
      const stDetails = {};
      q.statements.forEach(st => {
        const stAns = studentAns?.[st.statement];
        const isCorrect = stAns === st.correct;
        if (isCorrect) correctCount++;
        stDetails[st.statement] = { student: stAns, correct: st.correct, isCorrect, points: perStmt };
      });
      const earned = correctCount * perStmt;
      totalScore += earned;
      details[q.id] = {
        type: 'truefalse', details: stDetails,
        correctCount, total: q.statements.length,
        points, earned, perStmt
      };
    } else if (q.type === 'short') {
      const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
      const isCorrect = norm(studentAns) === norm(q.correctAnswer);
      const earned = isCorrect ? points : 0;
      totalScore += earned;
      details[q.id] = { type: 'short', student: studentAns, correct: q.correctAnswer, isCorrect, points, earned };
    }
  });

  return {
    score: Math.round(totalScore * 100) / 100,
    max: Math.round(maxScore * 100) / 100,
    details
  };
}

// ═══ OPEN START MODAL ═══
async function openStartQuizModal(a) {
  if (!a) return;
  if (!state.currentUser) {
    toast('Vui lòng đăng nhập', 'error');
    window.dispatchEvent(new CustomEvent('open:login'));
    return;
  }
  if (state.currentProfile?.role === 'teacher') {
    toast('GV không làm bài', 'error');
    return;
  }
  if (!state.currentUser.emailVerified) {
    toast('Vui lòng xác thực email', 'error');
    return;
  }

  const subQ = query(
    collection(db, 'submissions'),
    where('assignmentId', '==', a.id),
    where('studentId', '==', state.currentUser.uid)
  );
  const subSnap = await getDocs(subQ);
  const maxAttempts = a.maxAttempts || 3;

  if (subSnap.size >= maxAttempts) {
    toast(`Đã làm ${maxAttempts} lần`, 'error');
    return;
  }

  state.currentQuizAssignment = a;
  const attempt = subSnap.size + 1;

  $('startQuizInfo').innerHTML = `
    <div style="background:#F5F5DC; padding:12px; border-radius:6px;">
      <strong>${esc(a.title)}</strong><br>
      <span style="font-size:13px; color:#555;">Lần ${attempt}/${maxAttempts}</span><br>
      <div style="margin-top:10px;">⏱ ${esc(a.duration || 25)} phút</div>
    </div>
  `;
  show($('startQuizModal'));
}

// ═══ START QUIZ ═══
async function startQuiz() {
  if (!state.currentQuizAssignment) return;
  const a = state.currentQuizAssignment;
  hide($('startQuizModal'));

  const duration = Number(a.duration) || 25;
  const startedAt = new Date();
  const deadlineAt = new Date(startedAt.getTime() + duration * 60 * 1000);
  const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  try {
    if (!a.questionsHtml) {
      toast('Đề này không có câu hỏi!', 'error');
      return;
    }

    const questions = parseQuestionsHtml(a.questionsHtml);
    if (questions.length === 0) {
      toast('Đề không có câu hỏi hợp lệ!', 'error');
      return;
    }

    const template = { questions };

    const sessionRef = await addDoc(collection(db, 'submissions'), {
      assignmentId: a.id,
      assignmentTitle: a.title,
      grade: a.grade,
      type: 'quiz',
      mode: 'inline',
      studentId: state.currentUser.uid,
      studentName: state.currentProfile.name || state.currentUser.email,
      studentClass: state.currentProfile.class || '',
      answer: '[Đang làm]',
      autoScore: null,
      autoMax: null,
      answers: null,
      score: null,
      comment: '',
      status: 'in_progress',
      duration,
      sessionId,
      startedAt: serverTimestamp(),
      deadlineAt: deadlineAt.getTime(),
      submittedAt: null
    });

    state.currentQuizSession = {
      sessionId,
      attemptId: sessionRef.id,
      startedAt: startedAt.getTime(),
      deadlineAt: deadlineAt.getTime(),
      duration,
      template
    };

    showQuizInline(a, questions);
    startCountdownTimer();

    const iframe = document.getElementById('inlineQuizFrame');
    if (iframe) {
      iframe.onload = () => setTimeout(injectQuizRuntime, 300);
      setTimeout(injectQuizRuntime, 800);
    }
  } catch (err) {
    console.error(err);
    toast('Lỗi: ' + err.message, 'error');
  }
}

// ═══ SHOW QUIZ INLINE ═══
function showQuizInline(a, questions) {
  const container = document.getElementById('quizFrameContainer');
  if (!container) return;

  const part1 = questions.filter(q => q.type === 'choice');
  const part2 = questions.filter(q => q.type === 'truefalse');
  const part3 = questions.filter(q => q.type === 'short');

  let questionsHtml = '';

  const stripCauPrefix = (html) => {
    return (html || '')
      .replace(/^<?strong>?Câu\s+\d+[.:]?\s*<?\/?strong>?/i, '')
      .replace(/^Câu\s+\d+[.:]?\s*/i, '')
      .trim();
  };

  if (part1.length > 0) {
    questionsHtml += `<div class="section-header part-1">I. PHẦN I. Trắc nghiệm nhiều phương án lựa chọn</div>\n`;
    questionsHtml += `<p class="section-note">(Trả lời từ câu 1 đến câu ${part1.length}. Mỗi câu chọn một phương án)</p>\n`;

    part1.forEach((q, idx) => {
      const bodyHtml = stripCauPrefix(q.textHtml || esc(q.text));
      questionsHtml += `
        <div class="question" data-id="${q.id}" data-type="choice" data-answer="${q.correctAnswer}" data-points="${q.points || 1}">
          <div class="q-text"><strong>Câu ${idx + 1}.</strong> ${bodyHtml}</div>
          ${q.options.map(opt => {
            let optContent = opt.html || esc(opt.text);
            optContent = optContent.replace(/^\s*[A-D]\s*[.\s]\s*/i, '').trim();
            return `<label class="opt"><input type="radio" name="${q.id}" value="${opt.value}"> ${opt.value}. ${optContent}</label>`;
          }).join('')}
        </div>
      `;
    });
  }

  if (part2.length > 0) {
    questionsHtml += `<div class="section-header part-2">II. PHẦN II. Trắc nghiệm đúng sai</div>\n`;
    questionsHtml += `<p class="section-note">(Trong mỗi ý a), b), c), d) ở mỗi câu, chọn đúng hoặc sai)</p>\n`;

    part2.forEach((q, idx) => {
      const bodyHtml = stripCauPrefix(q.textHtml || esc(q.text));
      questionsHtml += `
        <div class="question" data-id="${q.id}" data-type="truefalse" data-points="${q.points || 1}">
          <div class="q-text"><strong>Câu ${idx + 1}.</strong> ${bodyHtml}</div>
          ${q.statements.map(st => {
            const stmtContent = st.html || esc(st.text);
            return `
              <div class="tf-item" data-statement="${st.statement}" data-answer="${st.correct}">
                <span class="tf-stmt">${String.fromCharCode(97 + st.statement)}) ${stmtContent}</span>
                <span class="tf-btns">
                  <button type="button" class="tf-btn" data-q="${q.id}" data-s="${st.statement}" data-val="true">Đúng</button>
                  <button type="button" class="tf-btn" data-q="${q.id}" data-s="${st.statement}" data-val="false">Sai</button>
                </span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    });
  }

  if (part3.length > 0) {
    questionsHtml += `<div class="section-header part-3">III. PHẦN III. Trắc nghiệm trả lời ngắn</div>\n`;
    questionsHtml += `<p class="section-note">(Trả lời từ câu 1 đến câu ${part3.length})</p>\n`;

    part3.forEach((q, idx) => {
      const bodyHtml = stripCauPrefix(q.textHtml || esc(q.text));
      questionsHtml += `
        <div class="question" data-id="${q.id}" data-type="short" data-answer="${esc(q.correctAnswer)}" data-points="${q.points || 1}">
          <div class="q-text"><strong>Câu ${idx + 1}.</strong> ${bodyHtml}</div>
          <input type="text" class="short-answer" placeholder="Nhập đáp án..." />
        </div>
      `;
    });
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(a.title)}</title>
<script>
window.MathJax = { tex: { inlineMath: [['\\\\(', '\\\\)'], ['$', '$']] }, svg: { fontCache: 'global' } };
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
    .quiz-container { padding: 12px; border-radius: 0; border-left-width: 3px; }
    h1 { font-size: 1.1em; }
    .section-header { padding: 10px 14px; font-size: 14px; margin: 16px 0 10px; }
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
    .quiz-container { padding-bottom: 90px; }
  }
<\/style>
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

// ═══ INJECT RUNTIME ═══
function injectQuizRuntime() {
  const iframe = document.getElementById('inlineQuizFrame');
  if (!iframe) return;
  const doc = iframe.contentDocument;
  if (!doc) return;

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
    submitBtn.addEventListener('click', () => {
      const answers = collectInlineAnswers();
      const total = state.currentQuizSession.template.questions.length;
      const answered = Object.keys(answers).length;

      if (answered === 0) {
        alert('Em chưa trả lời câu nào!');
        return;
      }
      if (answered < total) {
        if (!confirm(`Còn ${total - answered} câu chưa trả lời. Vẫn nộp?`)) return;
      }

      const result = gradeSubmission(state.currentQuizSession.template, answers);
      finishQuiz(result.score, result.max, answers, result.details, false);
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
    answers[q.dataset.id] = {};
    q.querySelectorAll('.tf-item').forEach(tf => {
      const stmtId = parseInt(tf.dataset.statement);
      const sel = tf.querySelector('.tf-btn.selected-true, .tf-btn.selected-false');
      if (sel) answers[q.dataset.id][stmtId] = sel.dataset.val === 'true';
    });
  });

  doc.querySelectorAll('.question[data-type="short"]').forEach(q => {
    const input = q.querySelector('.short-answer');
    if (input) answers[q.dataset.id] = input.value.trim();
  });

  return answers;
}

// ═══ TIMER ═══
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
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  timerEl.textContent = `${mm}:${ss}`;
  if (sec < 60) timerEl.classList.add('warning');
  else timerEl.classList.remove('warning');
}

async function autoSubmitOnTimeout() {
  if (!state.currentQuizSession) return;
  const maxScore = state.currentQuizSession.template.questions.reduce(
    (s, q) => s + parseFloat(q.points || 1), 0
  );
  await finishQuiz(0, Math.round(maxScore * 100) / 100, {}, {}, true);
}

// ═══ FINISH ═══
async function finishQuiz(score, total, answers, details, isTimeout) {
  if (!state.currentQuizSession) return;
  const session = state.currentQuizSession;
  if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);

  const submittedAt = Date.now();
  const isLate = submittedAt > session.deadlineAt;

  try {
    await updateDoc(doc(db, 'submissions', session.attemptId), {
      answer: isTimeout ? '[Hết giờ - tự động nộp]' : `[Đã nộp] ${Object.keys(answers).length} câu`,
      autoScore: score,
      autoMax: total,
      answers: answers,
      details: details,
      status: 'submitted',
      submittedAt: serverTimestamp(),
      isLate,
      isTimeout,
      timeSpent: Math.round((submittedAt - session.startedAt) / 1000)
    });

    toast(isTimeout ? '⏱ Hết giờ! Đã nộp.' : '✅ Đã nộp! Điểm công bố khi hết hạn.', 'success');

    const iframe = document.getElementById('inlineQuizFrame');
    if (iframe) iframe.remove();
    hide($('countdownOverlay'));

    state.currentQuizSession = null;
    state.currentQuizAssignment = null;
    const timerEl = $('countdownTimer');
    if (timerEl) {
      timerEl.textContent = '--:--';
      timerEl.classList.remove('warning');
    }

    // Refresh
    window.dispatchEvent(new CustomEvent('data:refresh'));
  } catch (err) {
    toast('Lỗi: ' + err.message, 'error');
  }
}

async function abandonQuiz() {
  if (!state.currentQuizSession) return;
  if (!confirm('⚠️ Hủy bài? Lượt này VẪN TÍNH.')) return;

  const session = state.currentQuizSession;
  if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);

  try {
    await updateDoc(doc(db, 'submissions', session.attemptId), {
      status: 'abandoned',
      answer: '[HS hủy]',
      submittedAt: serverTimestamp(),
      abandonedAt: serverTimestamp()
    });
  } catch (e) {}

  const iframe = document.getElementById('inlineQuizFrame');
  if (iframe) iframe.remove();
  hide($('countdownOverlay'));
  state.currentQuizSession = null;
  state.currentQuizAssignment = null;
  toast('Đã hủy.', 'error');

  window.dispatchEvent(new CustomEvent('data:refresh'));
}