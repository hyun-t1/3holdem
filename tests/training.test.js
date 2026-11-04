import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, loadSession, saveSession, recordAnswer, accuracy, STORAGE_KEY } from '../src/training.js';
const answer = (selection, winners) => ({ selection, winners, difficulty: 'hard', handLabel: 'HAND 001', summary: '테스트' });
test('통계는 정확히 같은 승자 집합에 대해서만 정답을 기록한다', () => {
  let state = createSession();
  state = recordAnswer(state, answer([1, 0], [0, 1]));
  assert.equal(state.correct, 1); assert.equal(state.streak, 1);
  state = recordAnswer(state, answer([0], [0, 1]));
  assert.equal(state.correct, 1); assert.equal(state.streak, 0);
  state = recordAnswer(state, answer([0, 1, 2], [0, 1, 2]));
  assert.equal(state.total, 3); assert.equal(state.correct, 2); assert.equal(accuracy(state), 67);
  assert.equal(state.bestStreak, 1);
});
test('문제 기록은 최근 30개를 보존하고 총 통계는 누적한다', () => {
  let state = createSession();
  for (let i = 0; i < 40; i++) state = recordAnswer(state, answer([0], [0]));
  assert.equal(state.total, 40); assert.equal(state.history.length, 30); assert.equal(state.streak, 40); assert.equal(state.bestStreak, 40);
});
test('기록 갱신은 이전 상태와 입력 배열을 변경하지 않는다', () => {
  const before = createSession(); const choice = [1, 0];
  const after = recordAnswer(before, answer(choice, [0, 1]));
  assert.equal(before.total, 0); assert.equal(before.history.length, 0); assert.deepEqual(choice, [1, 0]); assert.deepEqual(after.history[0].selection, [0, 1]);
});
test('빈 선택, 중복 승자, 잘못된 난이도를 거부한다', () => {
  for (const choice of [[], [0, 0], [-1], [3], ['0']]) assert.throws(() => recordAnswer(createSession(), answer(choice, [0])));
  assert.throws(() => recordAnswer(createSession(), { ...answer([0], [0]), difficulty: 'invalid' }));
});
test('손상된 저장소와 저장 차단은 앱 실행을 중단시키지 않는다', () => {
  assert.deepEqual(loadSession({ getItem: () => '{broken' }), createSession());
  assert.deepEqual(loadSession({ getItem() { throw Error('blocked'); } }), createSession());
  assert.equal(saveSession(createSession(), { setItem() { throw Error('quota'); } }), false);
  let saved;
  assert.equal(saveSession(createSession(), { setItem(key, value) { assert.equal(key, STORAGE_KEY); saved = value; } }), true);
  assert.deepEqual(loadSession({ getItem: () => saved }), createSession());
});
test('변조되거나 부정확한 저장 기록은 안전한 범위로 복구한다', () => {
  const state = createSession({ total: 2, correct: 40, streak: 9, bestStreak: 90, history: [null, { selection: [4] }], difficulty: 'invalid' });
  assert.equal(state.correct, 2); assert.equal(state.streak, 2); assert.equal(state.bestStreak, 2); assert.deepEqual(state.history, []); assert.equal(state.difficulty, 'normal');
  assert.equal(createSession({ total: Infinity }).total, 0);
  assert.equal(createSession({ total: 4, dealtCount: 9 }).dealtCount, 9);
  assert.equal(createSession({ total: 4, dealtCount: 1 }).dealtCount, 4);
});
