import { functions, httpsCallable } from './firebase-init.js';

// ⭐ Cầu nối client → Cloud Functions (chấm điểm & phiên làm bài chạy trên server)
export const callCreateQuizSession = httpsCallable(functions, 'createQuizSession');
export const callSubmitQuizAnswers = httpsCallable(functions, 'submitQuizAnswers');
export const callCreateAssignment  = httpsCallable(functions, 'createAssignment');
export const callMigrateAssignments = httpsCallable(functions, 'migrateAssignments');

// Wrapper bắt lỗi thống nhất, trả về { ok, data | error }
export async function safeCall(fn, payload) {
  try {
    const res = await fn(payload || {});
    return { ok: true, data: res.data };
  } catch (e) {
    console.error('Callable error:', e);
    return { ok: false, error: e };
  }
}