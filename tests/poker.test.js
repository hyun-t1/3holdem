import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, evaluateFive, compareHands, bestHand, evaluateDeal } from '../src/poker.js';

const tokens = '23456789TJQKA';
function cards(text) {
  return text.split(' ').map(id => ({ id, rank: tokens.indexOf(id[0]) + 2, suit: id[1] }));
}
function evaluate(text) { return evaluateFive(cards(text)); }
function rng(seed = 123456789) {
  return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
}
function shuffledDeck(random) {
  const result = createDeck();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Independent test oracle: rank any five-card subset, then filter all 8C5
// subsets by their original source indices. This does not call the app evaluator.
function referenceFive(hand) {
  const ranks = hand.map(card => card.rank).sort((a, b) => b - a);
  const unique = [...new Set(ranks)];
  const flush = hand.every(card => card.suit === hand[0].suit);
  const straight = unique.length === 5 && (unique[0] - unique[4] === 4
    ? unique[0] : unique.join(',') === '14,5,4,3,2' ? 5 : 0);
  const counts = new Map();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (straight && flush) return [straight === 14 ? 9 : 8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, ...groups.map(group => group[0])];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...groups.map(group => group[0])];
  if (groups[0][1] === 2) return [1, ...groups.map(group => group[0])];
  return [0, ...ranks];
}
function vectorCompare(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) - (right[i] ?? 0);
  }
  return 0;
}
function referenceBest(hole, community, limit = 2) {
  const all = [...hole, ...community];
  let best = null;
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 5; b++)
    for (let c = b + 1; c < 6; c++) for (let d = c + 1; d < 7; d++)
      for (let e = d + 1; e < 8; e++) {
        const indices = [a, b, c, d, e];
        if (indices.filter(index => index < 3).length > limit) continue;
        const rank = referenceFive(indices.map(index => all[index]));
        if (!best || vectorCompare(rank, best) > 0) best = rank;
      }
  return best;
}

test('the deck contains exactly 52 valid unique physical cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(card => card.id)).size, 52);
  for (const suit of ['S', 'H', 'D', 'C']) {
    assert.deepEqual(deck.filter(card => card.suit === suit).map(card => card.rank).sort((a, b) => a - b),
      Array.from({ length: 13 }, (_, i) => i + 2));
  }
});

test('all ten hand categories are correctly ranked', () => {
  const examples = [
    'AS KD 9H 6C 2S', 'AS AD 9H 6C 2S', 'AS AD 9H 9C 2S', 'AS AD AH 6C 2S',
    '9S 8D 7H 6C 5S', 'AS JS 9S 6S 2S', 'AS AD AH 6C 6S', 'AS AD AH AC 2S',
    '9S 8S 7S 6S 5S', 'AS KS QS JS TS',
  ].map(evaluate);
  examples.forEach((hand, category) => assert.equal(hand.category, category));
  for (let i = 1; i < examples.length; i++) assert.ok(compareHands(examples[i], examples[i - 1]) > 0);
});

test('wheel straights and wheel straight flushes are five-high', () => {
  assert.equal(evaluate('AS 2D 3H 4C 5S').category, 4);
  assert.equal(evaluate('AS 2S 3S 4S 5S').category, 8);
  assert.ok(compareHands(evaluate('6H 2D 3H 4C 5S'), evaluate('AS 2D 3H 4C 5S')) > 0);
  assert.ok(compareHands(evaluate('6S 2S 3S 4S 5S'), evaluate('AS 2S 3S 4S 5S')) > 0);
  assert.equal(evaluate('QS KS AS 2S 3S').category, 5, 'ace never wraps in a straight');
});

test('every category uses all necessary rank and kicker comparisons', () => {
  const comparisons = [
    ['AS KD QH JC 9S', 'AS KD QH JC 8S'], // fifth high card
    ['KS KD QH JC 2S', 'QS QD AH KC JS'], // pair rank before kickers
    ['AS AD KH QC 9S', 'AS AD KH QC 8S'], // third pair kicker
    ['AS AD KH QC 8S', 'AS AD KH JC TS'], // second pair kicker
    ['AS AD KH QC 8S', 'AS AD QH JC TS'], // first pair kicker
    ['AS AD 2H 2C 3S', 'KS KD QH QC AS'], // highest pair first
    ['AS AD KH KC 2S', 'AS AD QH QC KS'], // second pair
    ['AS AD KH KC 9S', 'AS AD KH KC 8S'], // two-pair kicker
    ['7S 7D 7H AC KS', '7S 7D 7H AC QS'], // second trips kicker
    ['8S 8D 8H 3C 2S', '7S 7D 7H AC KS'], // trips before kickers
    ['AS KS 9S 7S 3S', 'AS KS 9S 7S 2S'], // fifth flush card
    ['3S 3D 3H 2C 2S', '2S 2D 2H AC AS'], // full-house trips first
    ['3S 3D 3H AC AS', '3S 3D 3H KC KS'], // full-house pair
    ['3S 3D 3H 3C AS', '3S 3D 3H 3C KS'], // quads kicker
  ];
  for (const [strong, weak] of comparisons) {
    assert.ok(compareHands(evaluate(strong), evaluate(weak)) > 0, `${strong} should beat ${weak}`);
    assert.ok(compareHands(evaluate(weak), evaluate(strong)) < 0);
  }
});

test('suits never break otherwise equal ranks', () => {
  assert.equal(compareHands(evaluate('AS KD QH JC 9S'), evaluate('AH KC QS JD 9D')), 0);
  assert.equal(compareHands(evaluate('AS KS 9S 7S 2S'), evaluate('AH KH 9H 7H 2H')), 0);
  assert.equal(compareHands(evaluate('AS KS QS JS TS'), evaluate('AH KH QH JH TH')), 0);
});

test('legal best hands can use zero, one, or two hole cards', () => {
  const zero = bestHand(cards('2H 3D 4C'), cards('AS KS QS JS TS'));
  const one = bestHand(cards('6C QD KS'), cards('2H 3D 4C 5S 9H'));
  const two = bestHand(cards('2C 9D AS'), cards('2H 2D 9C 8S 7H'));
  for (const [hand, count, category] of [[zero, 0, 9], [one, 1, 4], [two, 2, 6]]) {
    assert.equal(hand.holeCount, count);
    assert.equal(hand.communityCount, 5 - count);
    assert.equal(hand.category, category);
    assert.equal(hand.cards.length, 5);
    assert.equal(hand.holeCards.length, count);
    assert.equal(hand.communityCards.length, 5 - count);
    assert.equal(hand.unusedHoleCards.length, 3 - count);
    assert.equal(new Set(hand.cards.map(card => card.id)).size, 5);
  }
});

test('three-hole royal flush is illegal even when an unrestricted evaluator would choose it', () => {
  const hole = cards('QS JS TS');
  const community = cards('AS KS 8D 7C 2H');
  assert.equal(referenceBest(hole, community, 3)[0], 9);
  const legal = bestHand(hole, community);
  assert.equal(legal.category, 0);
  assert.ok(legal.holeCount <= 2);
  assert.deepEqual([legal.category, ...legal.tiebreak], referenceBest(hole, community));
});

test('three-hole seven-high straight cannot beat a legal six-high straight', () => {
  const hole = cards('5S 6C 7D');
  const community = cards('2H 3D 4C 9S KH');
  assert.deepEqual(referenceBest(hole, community, 3), [4, 7]);
  const legal = bestHand(hole, community);
  assert.equal(legal.category, 4);
  assert.deepEqual(legal.tiebreak, [6]);
  assert.equal(legal.holeCount, 2);
});

test('shared board chooses zero holes when tied alternate constructions exist', () => {
  const result = bestHand(cards('AH 3C 4D'), cards('AS KD QH JC TS'));
  assert.equal(result.holeCount, 0);
});

test('two players can share the exact best five ranks', () => {
  const result = evaluateDeal({
    players: [cards('AS KD 3C'), cards('AH KC 5D'), cards('QS TD 6C')],
    community: cards('2C 4D 7H 9S JC'),
  });
  assert.deepEqual(result.winners, [0, 1]);
  assert.equal(typeof result.tieReason, 'string');
  assert.ok(result.tieReason.length > 0);
  assert.ok(result.comparison.length > 0);
});

test('all three players share a royal-flush board', () => {
  const result = evaluateDeal({
    players: [cards('2H 3D 4C'), cards('5H 6D 7C'), cards('8H 9D TC')],
    community: cards('AS KS QS JS TS'),
  });
  assert.deepEqual(result.winners, [0, 1, 2]);
  assert.ok(result.hands.every(hand => hand.holeCount === 0));
  assert.ok(result.tieReason.length > 0);
});

test('a unique winner has no tie reason', () => {
  const result = evaluateDeal({
    players: [cards('AS AD AH'), cards('KS QD JH'), cards('TS 6D 3H')],
    community: cards('2C 4D 7H 9S JC'),
  });
  assert.deepEqual(result.winners, [0]);
  assert.equal(result.tieReason, null);
});

test('invalid counts, duplicate cards and inconsistent card data are rejected', () => {
  assert.throws(() => evaluateFive(cards('AS KD QH JC')));
  assert.throws(() => evaluateFive(cards('AS AS QH JC 2D')));
  assert.throws(() => evaluateFive([{ id: 'AS', rank: 2, suit: 'S' }, ...cards('KD QH JC 2D')]));
  assert.throws(() => evaluateFive([{ id: '1S', rank: 1, suit: 'S' }, ...cards('KD QH JC 2D')]));
  assert.throws(() => bestHand(cards('AS KD'), cards('2H 3D 4C 5S 9H')));
  assert.throws(() => bestHand(cards('AS KD QH'), cards('AS 3D 4C 5S 9H')));
  assert.throws(() => evaluateDeal({
    players: [cards('AS AD AH'), cards('AS QD JH'), cards('TS 8D 6H')],
    community: cards('2C 4D 7H 9S JC'),
  }));
});

test('200 random deals match an independent oracle and never use three hole cards', () => {
  const random = rng(47823);
  for (let trial = 0; trial < 200; trial++) {
    const deck = shuffledDeck(random);
    const deal = { players: [deck.slice(0, 3), deck.slice(3, 6), deck.slice(6, 9)], community: deck.slice(9, 14) };
    const actual = evaluateDeal(deal);
    const expected = deal.players.map(hole => referenceBest(hole, deal.community));
    const strongest = expected.reduce((best, rank) => vectorCompare(rank, best) > 0 ? rank : best);
    assert.deepEqual(actual.winners, expected.flatMap((rank, index) => vectorCompare(rank, strongest) === 0 ? [index] : []));
    actual.hands.forEach((hand, index) => {
      assert.deepEqual([hand.category, ...hand.tiebreak], expected[index], `deal ${trial}, player ${index}`);
      const holeIds = new Set(deal.players[index].map(card => card.id));
      const boardIds = new Set(deal.community.map(card => card.id));
      const usedHoles = hand.cards.filter(card => holeIds.has(card.id)).length;
      assert.ok(usedHoles <= 2, `deal ${trial}, player ${index} used three hole cards`);
      assert.equal(usedHoles, hand.holeCount);
      assert.equal(hand.cards.filter(card => boardIds.has(card.id)).length, 5 - usedHoles);
      assert.equal(hand.cards.length, 5);
      assert.equal(new Set(hand.cards.map(card => card.id)).size, 5);
    });
  }
});
