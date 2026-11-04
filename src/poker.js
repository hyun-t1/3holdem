/** Standard five-card poker with a strict maximum of two of three hole cards. */
const SUITS = ['S', 'H', 'D', 'C'];
const TOKENS = '23456789TJQKA';
export const HAND_NAMES = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시', '로열 플러시'];

export function createDeck() {
  return SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ id: `${TOKENS[i]}${suit}`, rank: i + 2, suit })));
}

function validateCards(cards, count, label = '카드') {
  if (!Array.isArray(cards) || cards.length !== count) throw new TypeError(`${label}는 정확히 ${count}장이어야 합니다.`);
  for (const card of cards) {
    if (!card || !Number.isInteger(card.rank) || card.rank < 2 || card.rank > 14 || !SUITS.includes(card.suit) || card.id !== `${TOKENS[card.rank - 2]}${card.suit}`) {
      throw new TypeError('유효하지 않은 카드입니다.');
    }
  }
  if (new Set(cards.map(card => card.id)).size !== cards.length) throw new TypeError('중복된 카드는 사용할 수 없습니다.');
}

function evaluateUnchecked(cards) {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
  const ranks = sorted.map(card => card.rank);
  const counts = new Map();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(card => card.suit === cards[0].suit);
  const straightHigh = counts.size === 5 ? (ranks[0] - ranks[4] === 4 ? ranks[0] : ranks.join(',') === '14,5,4,3,2' ? 5 : 0) : 0;
  let category;
  let tiebreak;
  if (flush && straightHigh) {
    category = straightHigh === 14 ? 9 : 8;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 4) {
    category = 7;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 5;
    tiebreak = ranks;
  } else if (straightHigh) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreak = [groups[0][0], ...groups.slice(1).map(group => group[0])];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    tiebreak = [Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]];
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreak = [groups[0][0], ...groups.slice(1).map(group => group[0])];
  } else {
    category = 0;
    tiebreak = ranks;
  }
  return { category, name: HAND_NAMES[category], tiebreak, cards: sorted };
}

export function evaluateFive(cards) {
  validateCards(cards, 5);
  return evaluateUnchecked(cards);
}

export function compareHands(a, b) {
  const category = a.category - b.category;
  if (category) return category;
  for (let i = 0; i < a.tiebreak.length; i++) {
    if (a.tiebreak[i] !== b.tiebreak[i]) return a.tiebreak[i] - b.tiebreak[i];
  }
  return 0;
}

function combinations(cards, count) {
  if (count === 0) return [[]];
  const result = [];
  function visit(start, selected) {
    if (selected.length === count) { result.push(selected); return; }
    for (let i = start; i <= cards.length - (count - selected.length); i++) visit(i + 1, [...selected, cards[i]]);
  }
  visit(0, []);
  return result;
}

function bestUnchecked(hole, community) {
  let best = null;
  // 1 + (3 * 5) + (3 * 10) = 46 legal candidates. Never enumerate three hole cards.
  // Enumerate zero first so ties deterministically use the fewest hole cards.
  for (let holeCount = 0; holeCount <= 2; holeCount++) {
    for (const holeCards of combinations(hole, holeCount)) {
      for (const communityCards of combinations(community, 5 - holeCount)) {
        const evaluated = evaluateUnchecked([...holeCards, ...communityCards]);
        if (!best || compareHands(evaluated, best) > 0) {
          best = { ...evaluated, holeCards, communityCards, holeCount, communityCount: 5 - holeCount,
            unusedHoleCards: hole.filter(card => !holeCards.some(used => used.id === card.id)) };
        }
      }
    }
  }
  return best;
}

export function bestHand(hole, community) {
  validateCards(hole, 3, '홀카드');
  validateCards(community, 5, '커뮤니티 카드');
  validateCards([...hole, ...community], 8);
  return bestUnchecked(hole, community);
}

const COMPARISON_LABELS = [
  ['첫 번째 카드', '두 번째 카드', '세 번째 카드', '네 번째 카드', '다섯 번째 카드'],
  ['페어', '첫 번째 킥커', '두 번째 킥커', '세 번째 킥커'],
  ['높은 페어', '낮은 페어', '킥커'],
  ['트리플', '첫 번째 킥커', '두 번째 킥커'],
  ['스트레이트 최고 카드'],
  ['첫 번째 플러시 카드', '두 번째 플러시 카드', '세 번째 플러시 카드', '네 번째 플러시 카드', '다섯 번째 플러시 카드'],
  ['트리플', '페어'],
  ['포카드', '킥커'],
  ['스트레이트 플러시 최고 카드'],
  ['로열 플러시'],
];
const rankLabel = rank => rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : String(rank);

function pairComparison(left, right, leftIndex, rightIndex) {
  const difference = compareHands(left, right);
  const heading = `플레이어 ${leftIndex + 1} vs ${rightIndex + 1}`;
  if (!difference) return `${heading}: ${left.name}, 비교 순서 [${left.tiebreak.map(rankLabel).join(' · ')}]가 모두 같아 동점입니다.`;
  const winnerIndex = difference > 0 ? leftIndex : rightIndex;
  const winner = difference > 0 ? left : right;
  const loser = difference > 0 ? right : left;
  if (winner.category !== loser.category) return `${heading}: 플레이어 ${winnerIndex + 1} 우세 — ${winner.name}가 ${loser.name}보다 높습니다.`;
  const decidedAt = winner.tiebreak.findIndex((value, index) => value !== loser.tiebreak[index]);
  return `${heading}: 플레이어 ${winnerIndex + 1} 우세 — 같은 ${winner.name}에서 ${COMPARISON_LABELS[winner.category][decidedAt]} ${rankLabel(winner.tiebreak[decidedAt])}가 ${rankLabel(loser.tiebreak[decidedAt])}보다 높습니다.`;
}

export function evaluateDeal({ players, community }) {
  if (!Array.isArray(players) || players.length !== 3) throw new TypeError('플레이어는 정확히 3명이어야 합니다.');
  players.forEach(hole => validateCards(hole, 3, '홀카드'));
  validateCards(community, 5, '커뮤니티 카드');
  validateCards([...players.flat(), ...community], 14);
  const hands = players.map(hole => bestUnchecked(hole, community));
  let winners = [0];
  for (let i = 1; i < hands.length; i++) {
    const compared = compareHands(hands[i], hands[winners[0]]);
    if (compared > 0) winners = [i];
    else if (compared === 0) winners.push(i);
  }
  const comparison = [[0, 1], [0, 2], [1, 2]].map(([a, b]) => pairComparison(hands[a], hands[b], a, b)).join('\n');
  const winner = hands[winners[0]];
  const tieReason = winners.length > 1 ? `플레이어 ${winners.map(index => index + 1).join(' · ')}의 ${winner.name}와 모든 비교값 [${winner.tiebreak.map(rankLabel).join(' · ')}]가 같습니다. 최종 5장의 숫자 비교가 같으므로 공동 승리입니다. 무늬와 사용하지 않은 카드는 우열을 결정하지 않습니다.` : null;
  return { hands, winners, comparison, tieReason };
}
