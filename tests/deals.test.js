import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDeal } from '../src/deals.js';
import { evaluateDeal, evaluateFive } from '../src/poker.js';

function rng(seed) {
  return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
}

const expertWeights = [4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 1, 4, 4, 4, 4, 4];
function expertProblem(index, seed = 2000 + index) {
  const random = rng(seed);
  const total = expertWeights.reduce((sum, weight) => sum + weight, 0);
  const start = expertWeights.slice(0, index).reduce((sum, weight) => sum + weight, 0);
  let first = true;
  return generateDeal('expert', () => {
    if (first) { first = false; return (start + expertWeights[index] / 2) / total; }
    return random();
  });
}

for (const [difficulty, seed] of [['normal', 11], ['hard', 22], ['expert', 33]]) {
  test(`${difficulty}: 80 generated problems use 14 unique cards and follow actual poker rules`, () => {
    const random = rng(seed);
    const fingerprints = new Set();
    for (let i = 0; i < 80; i++) {
      const deal = generateDeal(difficulty, random);
      assert.equal(deal.difficulty, difficulty);
      assert.equal(deal.players.length, 3);
      assert.ok(deal.players.every(player => player.length === 3));
      assert.equal(deal.community.length, 5);
      const all = [...deal.players.flat(), ...deal.community];
      assert.equal(new Set(all.map(card => card.id)).size, 14);
      assert.equal(typeof deal.scenario, 'string');
      const result = evaluateDeal(deal);
      assert.ok(result.winners.length >= 1 && result.winners.length <= 3);
      assert.ok(result.hands.every(hand => hand.holeCount <= 2 && hand.cards.length === 5));
      const winningCategory = result.hands[result.winners[0]].category;
      if (difficulty === 'normal') {
        assert.equal(result.winners.length, 1);
        assert.ok(winningCategory <= 3);
      } else if (difficulty === 'hard') {
        assert.ok([1, 2, 4].includes(winningCategory));
      } else {
        assert.ok(winningCategory >= 5 || result.winners.length > 1);
      }
      fingerprints.add(all.map(card => card.id).join(','));
    }
    assert.ok(fingerprints.size >= 75, 'randomized problems should not repeat a fixed fixture');
  });
}

test('expert includes both high hands and shared wins across a seeded sample', () => {
  const random = rng(83647);
  const categories = new Set();
  let ties = 0;
  for (let i = 0; i < 100; i++) {
    const result = evaluateDeal(generateDeal('expert', random));
    categories.add(result.hands[result.winners[0]].category);
    if (result.winners.length > 1) ties++;
  }
  assert.ok(ties > 0, 'expert must actually produce shared-win practice');
  assert.ok([...categories].some(category => category >= 5), 'expert must actually produce advanced hands');
});

test('default difficulty produces a valid normal deal', () => {
  const deal = generateDeal();
  assert.equal(deal.difficulty, 'normal');
  assert.ok(evaluateDeal(deal).winners.length > 0);
});

test('all eight hard teaching scenarios produce the intended legal hand category', () => {
  const expectedCategories = [1, 1, 2, 4, 2, 1, 1, 1];
  expectedCategories.forEach((category, index) => {
    const random = rng(1000 + index);
    const choices = [0.1, (index + 0.1) / expectedCategories.length];
    const deal = generateDeal('hard', () => choices.length ? choices.shift() : random());
    const result = evaluateDeal(deal);
    assert.equal(result.winners.length, 1, deal.scenario);
    assert.equal(result.hands[result.winners[0]].category, category, deal.scenario);
  });
});

test('all sixteen expert scenarios cover flushes, full houses, quads, straight flushes and ties', () => {
  const expected = [
    [5, 1], [6, 1], [6, 1], [4, 2], [7, 2], [4, 3],
    [8, 1], [6, 1], [5, 1], [9, 1], [9, 3], [5, 1],
    [5, 1], [6, 3], [6, 2], [1, 2],
  ];
  expected.forEach(([category, winners], index) => {
    const deal = expertProblem(index);
    const result = evaluateDeal(deal);
    assert.equal(result.winners.length, winners, deal.scenario);
    assert.equal(result.hands[result.winners[0]].category, category, deal.scenario);
  });
});

test('late flush comparisons reach the fourth and fifth card', () => {
  for (const [scenarioIndex, decidedAt] of [[11, 3], [12, 4]]) {
    const result = evaluateDeal(expertProblem(scenarioIndex));
    assert.ok(result.hands.every(hand => hand.category === 5));
    const winner = result.hands[result.winners[0]];
    for (const [index, hand] of result.hands.entries()) {
      if (index === result.winners[0]) continue;
      assert.equal(winner.tiebreak.findIndex((rank, i) => rank !== hand.tiebreak[i]), decidedAt);
      assert.ok(winner.tiebreak[decidedAt] > hand.tiebreak[decidedAt]);
    }
    assert.ok(result.comparison.includes(decidedAt === 3 ? '네 번째 플러시 카드' : '다섯 번째 플러시 카드'));
  }
});

test('a board full house beats a lower hole-card full house and all three players use zero holes', () => {
  const deal = expertProblem(13);
  const result = evaluateDeal(deal);
  const boardHand = evaluateFive(deal.community);
  assert.equal(result.winners.length, 3);
  for (const hand of result.hands) {
    assert.equal(hand.category, 6);
    assert.deepEqual(hand.tiebreak, boardHand.tiebreak);
    assert.equal(hand.holeCount, 0);
    assert.equal(hand.communityCount, 5);
  }
});

test('shared full houses use both hole cards and ignore distinct unused ranks', () => {
  const result = evaluateDeal(expertProblem(14));
  assert.equal(result.winners.length, 2);
  const unused = [];
  const winnerRanks = result.hands[result.winners[0]].tiebreak;
  for (const index of result.winners) {
    const hand = result.hands[index];
    assert.equal(hand.category, 6);
    assert.deepEqual(hand.tiebreak, winnerRanks);
    assert.equal(hand.holeCount, 2);
    assert.equal(hand.unusedHoleCards.length, 1);
    assert.ok(!hand.cards.some(card => card.id === hand.unusedHoleCards[0].id));
    unused.push(hand.unusedHoleCards[0].rank);
  }
  assert.equal(new Set(unused).size, 2);
  const loser = result.hands.find((_, index) => !result.winners.includes(index));
  assert.equal(loser.tiebreak[0], winnerRanks[0]);
  assert.ok(loser.tiebreak[1] < winnerRanks[1]);
});

test('shared pairs use two holes and cannot compare a sixth card', () => {
  const result = evaluateDeal(expertProblem(15));
  assert.equal(result.winners.length, 2);
  const unused = [];
  const winnerRanks = result.hands[result.winners[0]].tiebreak;
  for (const index of result.winners) {
    const hand = result.hands[index];
    assert.equal(hand.category, 1);
    assert.deepEqual(hand.tiebreak, winnerRanks);
    assert.equal(hand.holeCount, 2);
    assert.equal(hand.unusedHoleCards.length, 1);
    assert.ok(!hand.cards.some(card => card.id === hand.unusedHoleCards[0].id));
    unused.push(hand.unusedHoleCards[0].rank);
  }
  assert.equal(new Set(unused).size, 2);
});

test('rank-varying expert templates produce different ranks while preserving every teaching condition', () => {
  const varyingTemplates = [0, 1, 2, 4, 11, 12, 13, 14, 15];
  const signature = result => result.hands.map(hand => `${hand.category}:${hand.holeCount}:${hand.communityCount}`).sort();
  for (const index of varyingTemplates) {
    const baseline = evaluateDeal(expertProblem(index));
    const fingerprints = new Set();
    for (let variant = 0; variant < 50; variant++) {
      const deal = expertProblem(index, 30000 + index * 1000003 + variant * 7919);
      const result = evaluateDeal(deal);
      const all = [...deal.players.flat(), ...deal.community];
      fingerprints.add(all.map(card => card.rank).sort((a, b) => a - b).join(','));
      assert.equal(new Set(all.map(card => card.id)).size, 14);
      assert.equal(result.winners.length, baseline.winners.length, `template ${index}`);
      assert.deepEqual(signature(result), signature(baseline), `template ${index}`);
      if ([0, 11, 12].includes(index)) {
        const decidedAt = index === 0 ? 1 : index === 11 ? 3 : 4;
        const winner = result.hands[result.winners[0]];
        for (const [seat, hand] of result.hands.entries()) {
          if (seat === result.winners[0]) continue;
          assert.equal(winner.tiebreak.findIndex((rank, i) => rank !== hand.tiebreak[i]), decidedAt);
        }
      }
      if (index === 13) assert.ok(result.hands.every(hand => hand.holeCount === 0));
      if ([14, 15].includes(index)) {
        assert.ok(result.winners.every(seat => result.hands[seat].holeCount === 2));
      }
    }
    assert.ok(fingerprints.size > 1, `template ${index} must vary its actual card ranks, not just seats and suits`);
  }
});

test('teaching explanations do not hard-code suit names after randomized suit permutations', () => {
  for (let index = 0; index < expertWeights.length; index++) {
    const deal = expertProblem(index, 9000 + index);
    assert.ok(!/하트|다이아몬드|스페이드|클럽/.test(deal.scenario));
    assert.equal(new Set([...deal.players.flat(), ...deal.community].map(card => card.id)).size, 14);
    assert.ok(evaluateDeal(deal).hands.every(hand => hand.holeCount <= 2));
  }
});

test('constant valid randomness returns legal problems even when rejection sampling cannot progress', () => {
  for (const difficulty of ['normal', 'hard', 'expert']) {
    const deal = generateDeal(difficulty, () => 0);
    assert.equal(new Set([...deal.players.flat(), ...deal.community].map(card => card.id)).size, 14);
    assert.ok(evaluateDeal(deal).winners.length > 0);
  }
});

test('invalid difficulty and random-number sources fail explicitly', () => {
  assert.throws(() => generateDeal('invalid'));
  assert.throws(() => generateDeal('normal', 0.5));
  for (const value of [NaN, Infinity, -0.01, 1]) {
    assert.throws(() => generateDeal('normal', () => value));
  }
});
