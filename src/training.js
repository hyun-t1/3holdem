export const DIFFICULTIES = { normal: '일반', hard: '어려움', expert: '전문가' };
export const STORAGE_KEY = 'three-card-dealer:v1';

export function winnerLabel(indices) {
  return `플레이어 ${indices.map(i => i + 1).join(' + ')}${indices.length > 1 ? ' 공동 승리' : ''}`;
}
const validSet = value => Array.isArray(value) && value.length > 0 && value.length <= 3 && new Set(value).size === value.length && value.every(i => Number.isInteger(i) && i >= 0 && i < 3);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function createSession(saved = null) {
  const total = count(saved?.total);
  const correct = Math.min(total, count(saved?.correct));
  const streak = Math.min(correct, count(saved?.streak));
  const history = Array.isArray(saved?.history) ? saved.history.filter(item => item && validSet(item.selection) && validSet(item.winners) && typeof item.correct === 'boolean' && typeof item.id === 'string' && typeof item.answeredAt === 'string' && !Number.isNaN(Date.parse(item.answeredAt)) && DIFFICULTIES[item.difficulty] && typeof item.summary === 'string' && typeof item.handLabel === 'string').slice(0, 30) : [];
  return { total, correct, streak, dealtCount: Math.max(total, count(saved?.dealtCount)), bestStreak: Math.max(streak, Math.min(correct, count(saved?.bestStreak))), history, difficulty: DIFFICULTIES[saved?.difficulty] ? saved.difficulty : 'normal' };
}
export function loadSession(storage) {
  try { return createSession(JSON.parse((storage ?? globalThis.localStorage).getItem(STORAGE_KEY))); }
  catch { return createSession(); }
}
export function saveSession(session, storage) {
  try { (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, JSON.stringify(session)); return true; }
  catch { return false; }
}
export const accuracy = session => session.total ? Math.round(session.correct / session.total * 100) : 0;
export function recordAnswer(session, answer) {
  if (!validSet(answer.selection) || !validSet(answer.winners) || !DIFFICULTIES[answer.difficulty]) throw new Error('유효하지 않은 정답 기록입니다.');
  const correct = answer.selection.length === answer.winners.length && answer.selection.every(i => answer.winners.includes(i));
  const streak = correct ? session.streak + 1 : 0;
  const item = { ...answer, selection: [...answer.selection].sort(), winners: [...answer.winners].sort(), correct, id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${session.total}`, answeredAt: new Date().toISOString() };
  return { ...session, total: session.total + 1, correct: session.correct + Number(correct), streak, bestStreak: Math.max(session.bestStreak, streak), history: [item, ...session.history].slice(0, 30) };
}
