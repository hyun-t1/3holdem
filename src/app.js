import { evaluateDeal } from './poker.js';
import { generateDeal } from './deals.js';
import { DIFFICULTIES, loadSession, saveSession, recordAnswer, accuracy, winnerLabel } from './training.js';

const $ = selector => document.querySelector(selector);
const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES = { S: '스페이드', H: '하트', D: '다이아몬드', C: '클럽' };
const RANKS = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' };
const rank = n => RANKS[n] ?? String(n);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const descriptions = {
  normal: '족보의 서열과 기본적인 승자 판정을 연습합니다.',
  hard: '같은 족보의 킥커, 투페어 순서, 스트레이트 함정을 비교합니다.',
  expert: '미세한 숫자 차이, 공동 승리, 홀카드 사용 제한의 함정을 판별합니다.'
};
const rankGuide = [
  ['로열 플러시', '같은 무늬의 10·J·Q·K·A. 가장 높은 스트레이트 플러시입니다.', 'A♠ K♠ Q♠ J♠ 10♠'],
  ['스트레이트 플러시', '같은 무늬의 연속된 5장. 가장 높은 숫자로 비교합니다.', '9♥ 8♥ 7♥ 6♥ 5♥'],
  ['포카드', '같은 숫자 4장. 포카드 숫자, 남은 킥커 순으로 비교합니다.', 'K♠ K♥ K♦ K♣ A♠'],
  ['풀하우스', '트리플과 페어. 트리플 숫자를 먼저, 페어 숫자를 다음으로 비교합니다.', 'Q♠ Q♥ Q♦ 8♠ 8♥'],
  ['플러시', '같은 무늬 5장. 높은 카드부터 다섯 숫자를 차례로 비교합니다.', 'A♦ J♦ 8♦ 5♦ 2♦'],
  ['스트레이트', '무늬와 관계없이 연속된 5장. 최고 숫자로 비교합니다.', '8♠ 7♥ 6♦ 5♣ 4♠'],
  ['트리플', '같은 숫자 3장. 트리플 숫자, 높은 킥커 2장 순서로 비교합니다.', '7♠ 7♥ 7♦ A♣ J♠'],
  ['투페어', '페어 2개. 높은 페어, 낮은 페어, 마지막 킥커 순서로 비교합니다.', 'J♠ J♥ 4♦ 4♣ A♠'],
  ['원페어', '같은 숫자 2장. 페어 숫자, 높은 킥커 3장 순서로 비교합니다.', '10♠ 10♥ A♦ K♣ 8♠'],
  ['하이카드', '위 족보가 없으면 높은 카드부터 다섯 숫자를 차례로 비교합니다.', 'A♠ J♥ 9♦ 6♣ 3♠']
];
let session = loadSession();
let deal, result, selection = [], revealed = false, focusPlayer = 0, handNumber = session.dealtCount;
let storageAvailable = true;

function persist() {
  storageAvailable = saveSession(session);
  $('.stats-note').innerHTML = storageAvailable ? '<span class="live-dot"></span>훈련 기록 자동 저장<span class="stats-sub">이 브라우저에서 이어서 연습하세요</span>' : '<span class="live-dot"></span>현재 세션에서 기록 중<span class="stats-sub">브라우저 저장소를 사용할 수 없습니다</span>';
}
function cardHTML(card, { face = true, used = false, dim = false, mini = false } = {}) {
  if (!face) return `<div class="playing-card card-back${mini ? ' mini-card' : ''}" role="img" aria-label="뒷면 카드"><div class="back-border"><span>♠</span><small>RR</small></div></div>`;
  const red = card.suit === 'H' || card.suit === 'D';
  return `<div class="playing-card card-face${red ? ' red' : ''}${used ? ' used-card' : ''}${dim ? ' unused-card' : ''}${mini ? ' mini-card' : ''}" role="img" aria-label="${SUIT_NAMES[card.suit]} ${rank(card.rank)}${used ? ', 최종 족보에 사용' : ''}" data-card="${card.id}"><span class="card-corner">${rank(card.rank)}<small>${SUITS[card.suit]}</small></span><span class="card-pip">${SUITS[card.suit]}</span><span class="card-corner bottom">${rank(card.rank)}<small>${SUITS[card.suit]}</small></span>${used ? '<span class="used-check" aria-hidden="true">✓</span>' : ''}</div>`;
}
function renderTable() {
  const hand = revealed ? result.hands[focusPlayer] : null;
  const communityUsed = new Set(hand?.communityCards.map(c => c.id));
  $('#community').innerHTML = deal.community.map(c => cardHTML(c, { used: communityUsed.has(c.id), dim: revealed && !communityUsed.has(c.id) })).join('');
  $('#players').innerHTML = deal.players.map((cards, i) => {
    const player = revealed ? result.hands[i] : null;
    const used = new Set(player?.holeCards.map(c => c.id));
    const winner = revealed && result.winners.includes(i);
    const isFocus = revealed && focusPlayer === i;
    const chosen = !revealed && selection.includes(i);
    return `<button class="player-seat${winner ? ' winning-seat' : ''}${isFocus ? ' focused-seat' : ''}${chosen ? ' chosen-seat' : ''}" data-player="${i}" aria-label="플레이어 ${i + 1}${revealed ? ', 구성 카드 보기' : ', 단독 승리 선택'}" ${revealed ? `aria-pressed="${isFocus}"` : ''}><div class="seat-heading"><span class="seat-avatar">${String(i + 1).padStart(2, '0')}</span><span class="seat-name">플레이어 ${i + 1}</span>${winner ? '<span class="winner-chip">WINNER</span>' : '<span class="seat-dots">···</span>'}</div><div class="cards hole-cards">${cards.map(c => cardHTML(c, { used: used.has(c.id), dim: revealed && !used.has(c.id) })).join('')}</div><div class="seat-bottom">${revealed ? `<strong>${player.name}</strong><span>홀 ${player.holeCount} + 공용 ${player.communityCount}</span>` : '<span>HOLE CARDS</span><span>3 CARDS</span>'}</div></button>`;
  }).join('');
  $('#hand-label').textContent = `HAND ${String(handNumber).padStart(3, '0')}`;
  $('#table-level').textContent = DIFFICULTIES[deal.difficulty];
  $('#reveal-status').innerHTML = revealed ? '<span class="live-dot"></span> 판정 완료' : '<span class="live-dot"></span> 승자 판단 중';
  $('#board-hint').textContent = revealed ? `플레이어 ${focusPlayer + 1}의 최종 족보에 사용된 공용 카드` : '카드 숫자와 무늬를 보고 승자를 판단하세요';
  $('#legend-text').textContent = revealed ? '금색 테두리 = 사용 카드 · 흐린 카드 = 미사용' : '각 플레이어 홀카드 3장 · 커뮤니티 5장';
}
function renderOptions() {
  const options = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];
  $('#winner-options').innerHTML = options.map((option, i) => {
    const value = option.join(',');
    const checked = selection.join(',') === value;
    const label = option.length === 1 ? `<span class="option-player">P${option[0] + 1}</span><span>플레이어 ${option[0] + 1}</span>` : `<span class="option-pair">${option.map(n => `P${n + 1}`).join(' <small>+</small> ')}</span><span>공동 승리</span>`;
    return `<label class="winner-option${checked ? ' selected' : ''}${i === 6 ? ' all-players' : ''}${revealed && result.winners.join(',') === value ? ' actual-winner' : ''}"><input type="radio" name="winner" value="${value}" aria-label="${winnerLabel(option)}"${checked ? ' checked' : ''}${revealed ? ' disabled' : ''}>${label}<span class="option-check">✓</span></label>`;
  }).join('');
  $('#check-answer').disabled = !selection.length || revealed;
  $('#check-answer').innerHTML = revealed ? '<span>판정 완료</span><span>✓</span>' : '<span>정답 확인</span><span>↗</span>';
  const correct = revealed && selection.length === result.winners.length && selection.every(i => result.winners.includes(i));
  $('#selection-status').textContent = revealed ? `${correct ? '정답' : '오답'} · 실제 ${winnerLabel(result.winners)}` : selection.length ? `${winnerLabel(selection)} 선택됨` : '승자 선택 후 정답을 확인하세요';
}
function describeValue(hand) {
  const t = hand.tiebreak.map(rank);
  const cat = hand.category;
  if (cat === 9) return 'A 하이 · 같은 로열 플러시는 공동 승리';
  if (cat === 8 || cat === 4) return `${t[0]} 하이${hand.tiebreak[0] === 5 ? ' (A·2·3·4·5)' : ''}`;
  if (cat === 7) return `포카드 ${t[0]} · 킥커 ${t[1]}`;
  if (cat === 6) return `트리플 ${t[0]} · 페어 ${t[1]}`;
  if (cat === 3) return `트리플 ${t[0]} · 킥커 ${t.slice(1).join(' → ')}`;
  if (cat === 2) return `높은 페어 ${t[0]} · 낮은 페어 ${t[1]} · 킥커 ${t[2]}`;
  if (cat === 1) return `페어 ${t[0]} · 킥커 ${t.slice(1).join(' → ')}`;
  return `높은 카드 순서 ${t.join(' → ')}`;
}
function renderAnalysis() {
  if (!revealed) {
    $('#analysis-panel').innerHTML = '<div class="analysis-empty"><span class="empty-icon">♧</span><div><h3>판정의 근거까지 확인하세요</h3><p>정답을 확인하면 최종 5장, 킥커 비교, 공동 승리 이유가 표시됩니다.</p></div></div>';
    $('#analysis-dot').classList.remove('has-result');
    return;
  }
  const correct = selection.length === result.winners.length && selection.every(i => result.winners.includes(i));
  $('#analysis-dot').classList.add('has-result');
  $('#analysis-panel').innerHTML = `<div class="answer-banner ${correct ? 'answer-correct' : 'answer-incorrect'}"><span class="answer-symbol">${correct ? '✓' : '×'}</span><div><span class="result-eyebrow">${correct ? 'CORRECT CALL' : 'REVIEW YOUR CALL'}</span><h3>${correct ? '정확한 판정입니다.' : '판정의 차이를 확인해보세요.'}</h3><p>내 선택: ${winnerLabel(selection)}<br><strong>실제 승자: ${winnerLabel(result.winners)}</strong></p></div><span class="result-score">${correct ? '정답' : '오답'}</span></div><div class="comparison-box"><span class="analysis-label">판정 포인트</span><p>${escape(result.comparison)}</p>${result.tieReason ? `<p class="tie-reason"><strong>공동 승리 이유</strong> ${escape(result.tieReason)}</p>` : ''}<p class="scenario-text">${escape(deal.scenario ?? '')}</p></div><div class="hand-details">${result.hands.map((hand, i) => `<article class="hand-detail${result.winners.includes(i) ? ' winner-detail' : ''}"><div class="detail-title"><span>플레이어 ${i + 1}${result.winners.includes(i) ? ' <b>WINNER</b>' : ''}</span><strong>${hand.name}</strong></div><div class="cards final-cards">${hand.cards.map(c => cardHTML(c, { face: true, mini: true })).join('')}</div><p class="hand-origin"><span>홀카드 <b>${hand.holeCount}장</b></span><span>커뮤니티 <b>${hand.communityCount}장</b></span></p><p class="hand-value">${describeValue(hand)}</p><div class="unused-row"><span>미사용 홀카드</span>${hand.unusedHoleCards.map(c => `<span class="inline-card${c.suit === 'H' || c.suit === 'D' ? ' red' : ''}">${rank(c.rank)}${SUITS[c.suit]}</span>`).join('')}</div><button class="focus-hand text-link" data-focus="${i}">테이블에서 구성 확인 <span>↗</span></button></article>`).join('')}</div><p class="analysis-footnote">숫자와 킥커가 모두 같으면 무늬와 관계없이 공동 승리입니다. 동등한 최종 조합이 여러 개면 홀카드를 적게 쓰는 조합을 표시합니다.</p>`;
}
function renderStats() {
  $('#accuracy').innerHTML = `${accuracy(session)}<small>%</small>`;
  $('#total').innerHTML = `${session.total}<small>핸드</small>`;
  $('#streak').innerHTML = `${session.streak}<small>회</small>`;
  $('#history-count').textContent = session.history.length;
  renderHistory();
}
function renderHistory() {
  $('#history-panel').innerHTML = session.history.length ? `<div class="history-heading"><p>최근 ${session.history.length}문제의 판정 기록</p><span>최고 연속 정답 ${session.bestStreak}회</span></div><ol class="history-list">${session.history.map(item => `<li><span class="history-icon ${item.correct ? 'good' : 'bad'}">${item.correct ? '✓' : '×'}</span><div><div class="history-title">${escape(item.handLabel)} <span>${DIFFICULTIES[item.difficulty]}</span></div><p>내 선택 ${winnerLabel(item.selection)} <span class="history-arrow">→</span> 정답 ${winnerLabel(item.winners)}</p><small>${escape(item.summary)}</small></div><span class="history-time">${new Date(item.answeredAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></li>`).join('')}</ol>` : '<div class="analysis-empty"><span class="empty-icon">↺</span><div><h3>첫 판정을 기다리고 있어요</h3><p>정답을 확인한 문제부터 이 브라우저에 기록됩니다.</p></div></div>';
}
function setTab(tab) {
  for (const name of ['analysis', 'history']) {
    $(`#${name}-panel`).hidden = name !== tab;
    $(`#${name}-tab`).classList.toggle('active', name === tab);
    $(`#${name}-tab`).setAttribute('aria-selected', String(name === tab));
    $(`#${name}-tab`).tabIndex = name === tab ? 0 : -1;
  }
}
function newHand(scrollToTable = false) {
  try {
    deal = generateDeal(session.difficulty);
    result = null;
    selection = [];
    revealed = false;
    focusPlayer = 0;
    handNumber = ++session.dealtCount;
    persist();
    renderTable(); renderOptions(); renderAnalysis(); setTab('analysis');
    if (scrollToTable && window.innerWidth <= 760) $('.table-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error(error);
    showToast('핸드를 만들지 못했습니다. 새 핸드를 다시 눌러주세요.');
  }
}
function showToast(message) {
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}
function checkAnswer() {
  if (revealed || !selection.length) return;
  try {
    result = evaluateDeal(deal);
    session = recordAnswer(session, { selection, winners: result.winners, difficulty: deal.difficulty, handLabel: `HAND ${String(handNumber).padStart(3, '0')}`, summary: result.hands.map((hand, i) => `P${i + 1} ${hand.name}`).join(' · ') });
    revealed = true;
    focusPlayer = result.winners[0];
    persist(); renderTable(); renderOptions(); renderAnalysis(); renderStats(); setTab('analysis');
    if (window.innerWidth <= 760) $('.review-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { console.error(error); showToast('판정 중 오류가 발생했습니다. 새 핸드를 시작해주세요.'); }
}
$('#difficulty').value = session.difficulty;
$('#difficulty-description').textContent = descriptions[session.difficulty];
$('#difficulty').addEventListener('change', event => {
  session.difficulty = event.target.value;
  $('#difficulty-description').textContent = descriptions[session.difficulty];
  persist(); newHand(true); showToast(`${DIFFICULTIES[session.difficulty]} 난이도로 새 핸드를 시작합니다.`);
});
$('#winner-options').addEventListener('change', event => {
  if (revealed || event.target.name !== 'winner') return;
  selection = event.target.value.split(',').map(Number); renderOptions(); renderTable();
  $('#winner-options input:checked')?.focus({ preventScroll: true });
});
$('#players').addEventListener('click', event => {
  const player = event.target.closest('[data-player]');
  if (!player) return;
  if (revealed) focusPlayer = Number(player.dataset.player);
  else { selection = [Number(player.dataset.player)]; renderOptions(); }
  renderTable();
});
$('#analysis-panel').addEventListener('click', event => {
  const button = event.target.closest('[data-focus]');
  if (button) { focusPlayer = Number(button.dataset.focus); renderTable(); $('.table-panel').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});
$('#check-answer').addEventListener('click', checkAnswer);
$('#new-hand').addEventListener('click', () => newHand(true));
for (const tab of ['analysis', 'history']) {
  $(`#${tab}-tab`).addEventListener('click', () => setTab(tab));
  $(`#${tab}-tab`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'analysis' : event.key === 'End' ? 'history' : tab === 'analysis' ? 'history' : 'analysis';
    setTab(next); $(`#${next}-tab`).focus();
  });
}
function openGuide() { $('#guide-dialog').showModal(); }
$('#guide-open').addEventListener('click', openGuide);
$('#rule-guide').addEventListener('click', openGuide);
$('#guide-close').addEventListener('click', () => $('#guide-dialog').close());
$('#guide-dialog').addEventListener('click', event => { if (event.target === $('#guide-dialog')) { const bounds = event.target.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close(); } });
$('#rank-guide').innerHTML = rankGuide.map(([name, description, example], i) => `<article><span class="rank-position">${String(i + 1).padStart(2, '0')}</span><div><h3>${name}</h3><p>${description}</p><span class="rank-example">${example}</span></div></article>`).join('');
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'n' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('#guide-dialog').open) { event.preventDefault(); newHand(true); }
});
persist(); renderStats(); newHand();
