// Global state + event bus (tránh circular imports)
export const state = {
  currentUser: null,
  currentProfile: null,
  currentGrade: '10',
  globalSettings: { allowChangeClass: false },
  currentQuizSession: null,
  currentQuizAssignment: null,
  currentViewSession: null,
  currentGradeSubmission: null,
  verifyPollInterval: null,
  quizTimerInterval: null,

  // Caches
  allLessonsCache: [],
  allAssignmentsCache: [],
  mySubsCache: [],
  myViewLogsCache: [],
  studentsCache: [],
  teacherAssignmentsCache: [],
  teacherSubmissionsCache: [],
  teacherViewLogsCache: [],
  teacherLessonsMapCache: {},
  notificationsCache: [],
  availableClassesByGrade: { '10': [], '11': [], '12': [] },
  externalSessions: {},
  lastStatsData: null,
  _lessonsForSelect: []
};

// ═══ Event bus ═══
const listeners = {};

export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== fn);
}

export function emit(event, data) {
  (listeners[event] || []).forEach(fn => {
    try { fn(data); } catch (e) { console.error(`Event ${event} error:`, e); }
  });
}

// ═══ Events ═══
export const EVENTS = {
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  PROFILE_UPDATE: 'profile:update',
  CLASS_CHANGE: 'class:change',
  SETTINGS_UPDATE: 'settings:update',
  NOTIFICATIONS_LOADED: 'notifications:loaded'
};