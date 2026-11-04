import { createDeck, evaluateDeal, compareHands } from './poker.js';

function randomIndex(length, rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('난수는 0 이상 1 미만이어야 합니다.');
  return Math.floor(value * length);
}

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function randomDeal(rng) {
  const cards = shuffle(createDeck(), rng);
  return { players: [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6, 9)], community: cards.slice(9, 14) };
}

// Authored layouts encode dealer pitfalls. Suit/seat/card permutations and checked
// rank variations retain the teaching comparison and physical card uniqueness.
const HARD_SCENARIOS = [
  {
    board: 'AS 9S 8D 5C 2H', holes: ['KS QS JS', 'AC KD 3C', 'TC 8C 4D'],
    text: '홀카드 3장으로 만드는 플러시는 무효입니다. 홀카드를 최대 2장만 사용하면 A 원페어가 승리합니다.',
  },
  {
    board: 'AS TD 7C 4H 2D', holes: ['KH QS JC', 'AC 9H 3C', '9D 7S 5H'],
    text: 'A·K·Q·J·10은 홀카드 3장이 필요해 스트레이트로 인정되지 않습니다. 합법적인 A 원페어를 찾아야 합니다.',
  },
  {
    board: 'KS KH 9D 9C 2H', holes: ['AD 7C 3C', 'QS JD 6C', '8S 7H 4D'],
    text: '보드의 K·9 투페어를 공유합니다. 두 페어가 같으므로 최종 다섯 번째 카드인 킥커로 승부를 가립니다.',
  },
  {
    board: 'AC 2D 3H 4S 9C', holes: ['5H KD QS', '5D 6C TD', 'AS JC 8D'],
    text: 'A·2·3·4·5는 5 하이 스트레이트입니다. 홀카드 5·6을 사용하는 6 하이 스트레이트가 더 높습니다.',
  },
  {
    board: 'KC QD 8H 3S 2C', holes: ['KH 3D 9C', 'QH 8C AD', 'QS 2D JS'],
    text: '투페어는 높은 페어부터 비교합니다. K·3 투페어가 Q·8 투페어를 이기며 낮은 페어를 먼저 비교하지 않습니다.',
  },
  {
    board: 'KH 9C 7D 4S 2H', holes: ['AD KC 3C', 'QS KD JC', 'TS 9H 8C'],
    text: '같은 K 원페어에서 첫 번째 킥커 A와 Q를 비교합니다. 홀카드 3장을 모두 넣어 킥커를 늘릴 수 없습니다.',
  },
  {
    board: 'AS KS 9D 4H 2S', holes: ['KH QD 3C', 'KD JD 6C', 'QS QC 8H'],
    text: 'K 원페어와 첫 번째 킥커 A가 같습니다. 두 번째 킥커 Q와 J에서 승부가 나며 홀카드는 페어 카드와 킥커에 각각 1장씩 사용합니다.',
  },
  {
    board: 'AS KS QD 4H 2S', holes: ['KH JD 3C', 'KD TD 6C', '9C 8H 7D'],
    text: 'K 원페어와 첫 두 킥커 A·Q까지 같습니다. 마지막 킥커 J가 10보다 높습니다. 족보 이름만 보고 동점으로 판정하면 안 됩니다.',
  },
];

const EXPERT_SCENARIOS = [
  {
    board: 'AH 9H 4H KC 2S', holes: ['QH JH 3C', 'KH 8H AD', 'TH 7H KS'],
    text: '세 명 모두 같은 최고 카드의 플러시입니다. 두 번째 플러시 카드에서 승부가 나며 홀카드는 각각 2장만 사용합니다.',
    varyRanks: true,
  },
  {
    board: 'KH KD 7C 7S 2D', holes: ['KC AS QC', '7D AH QD', '2C 2H JD'],
    text: '풀하우스는 트리플의 숫자를 먼저 비교합니다. 페어가 더 높아 보여도 트리플이 낮으면 패배합니다.',
    varyRanks: true,
  },
  {
    board: '9S 9H 9D KC 2C', holes: ['KH QD JD', '2D AD QC', '8C 8D 7C'],
    text: '보드의 같은 트리플을 공유하는 풀하우스 대결입니다. 다음 비교 대상은 페어이며, 높은 별도 홀카드는 킥커로 추가하지 않습니다.',
    varyRanks: true,
  },
  {
    board: 'AS KD QC 7H 2C', holes: ['JD TC 3H', 'JH TD 4H', 'AH 9C 8S'],
    text: '서로 다른 무늬의 J·10으로 같은 A 하이 스트레이트를 만들면 2명 공동 승리입니다. 남는 홀카드는 비교하지 않습니다.',
  },
  {
    board: '9S 9H 9D 9C 2H', holes: ['AS KD QC', 'AH JD TC', 'KS QD JC'],
    text: '보드의 포카드를 공유하므로 킥커를 비교합니다. 가장 높은 킥커가 같은 두 명은 공동 승리하며 여섯 번째 카드는 비교하지 않습니다.',
    varyRanks: true,
  },
  {
    board: '2S 3S 4D 5C 6H', holes: ['AS KS QS', 'AH KH QC', 'AC KD JD'],
    text: '세 명 모두 보드 5장으로 6 하이 스트레이트입니다. 같은 무늬 홀카드 3장을 쓰는 플러시는 무효이므로 3명 공동 승리입니다.',
  },
  {
    board: '7H 8H 9H 9D 7C', holes: ['TH JH AS', '9C 9S KD', '7D 7S AC'],
    text: '홀카드 2장의 스트레이트 플러시가 포카드 9와 포카드 7을 이깁니다. 모든 최종 족보는 정확히 5장입니다.',
  },
  {
    board: 'AH KH 7C 7D 2S', holes: ['QH JH TH', '7H 2C AD', 'AS KC 9C'],
    text: '보이는 로열 플러시는 홀카드 3장을 요구하므로 무효입니다. 홀카드 7·A를 쓰는 7 풀하우스가 승리합니다.',
  },
  {
    board: 'AH AD 7H 5H 2C', holes: ['AS KC KD', 'QH JH 8S', '7C 5C 2D'],
    text: 'A 트리플과 K 페어를 모두 쓰는 풀하우스는 홀카드가 3장이라 무효입니다. 홀카드 2장과 같은 무늬 보드 3장의 합법적인 플러시가 승리합니다.',
  },
  {
    board: 'TH JH QH 9D 9C', holes: ['KH AH 2S', '9H 9S AD', 'QD QC AC'],
    text: '홀카드 A·K와 보드 10·J·Q로 합법적인 로열 플러시가 됩니다. 포카드와 풀하우스보다 높은 족보입니다.',
    weight: 2,
  },
  {
    board: 'TS JS QS KS AS', holes: ['2C 3D 4H', 'KH QD JD', '9H 9C 8D'],
    text: '보드의 로열 플러시 5장을 그대로 사용하므로 3명 공동 승리입니다. 홀카드 0장도 허용됩니다.',
    weight: 1,
  },
  {
    board: 'AH KH QH 4H 2C', holes: ['9H 3D 5S', '8H JS TC', '7H AD KC'],
    text: '세 명의 플러시에서 첫 세 카드가 같습니다. 네 번째 카드에서 처음 차이가 납니다. 다른 무늬의 높은 홀카드는 플러시 비교에 넣지 않습니다.',
    varyRanks: true,
  },
  {
    board: 'AH KH QH JH 2C', holes: ['9H 4S 3D', '8H AD KC', '7H QS JD'],
    text: '플러시의 첫 네 카드가 같습니다. 다섯 번째 카드에서 승부가 납니다. 높은 홀카드가 추가로 있어도 다른 무늬라면 이 플러시를 높이지 못합니다.',
    varyRanks: true,
  },
  {
    board: 'KS KH KD 7C 7D', holes: ['7H AS QC', 'AH QD JC', '7S AD 2C'],
    text: '홀카드로 낮은 트리플의 풀하우스를 만들어도 보드의 높은 트리플 풀하우스를 넘지 못합니다. 세 명 모두 보드 5장이 최선이므로 홀카드 0장으로 공동 승리입니다.',
    varyRanks: true,
  },
  {
    board: 'KS KH KD 7C 2D', holes: ['AC AH QC', 'AS AD JC', '7H QD TD'],
    text: '같은 트리플에 같은 높은 페어를 만든 두 명은 같은 풀하우스입니다. 쓰지 않은 홀카드는 여섯 번째 카드이므로 비교하지 않습니다. 다른 플레이어의 낮은 페어 풀하우스보다 높습니다.',
    varyRanks: true,
  },
  {
    board: 'KS 9D 7C 4H 2S', holes: ['KH AD 6C', 'KD AH 8C', 'QS JD TC'],
    text: '두 명 모두 같은 원페어와 같은 킥커 3장입니다. 남는 홀카드를 더 비교하려면 홀카드 3장이 필요하므로 무효입니다. 최선의 5장이 같아 공동 승리입니다.',
    varyRanks: true,
  },
];

function expertScenario(rng) {
  // Spend more time on late kickers, counterfeit boards and exact-five ties.
  // The obvious royal-flush board is retained as a rare zero-hole reminder.
  const total = EXPERT_SCENARIOS.reduce((sum, scenario) => sum + (scenario.weight ?? 4), 0);
  let choice = randomIndex(total, rng);
  for (const scenario of EXPERT_SCENARIOS) {
    choice -= scenario.weight ?? 4;
    if (choice < 0) return scenario;
  }
  return EXPERT_SCENARIOS[EXPERT_SCENARIOS.length - 1];
}

function fromScenario(template, rng) {
  const deck = new Map(createDeck().map(card => [card.id, card]));
  const parse = text => text.split(' ').map(id => deck.get(id));
  let original = { players: template.holes.map(parse), community: parse(template.board) };
  if (template.varyRanks) original = varyRanks(original, rng);
  const suits = ['S', 'H', 'D', 'C'];
  const permutation = shuffle(suits, rng);
  const suitMap = Object.fromEntries(suits.map((suit, index) => [suit, permutation[index]]));
  const cards = hand => hand.map(card => deck.get(`${card.id[0]}${suitMap[card.suit]}`));
  return { players: shuffle(original.players.map(hand => shuffle(cards(hand), rng)), rng), community: shuffle(cards(original.community), rng), scenario: template.text };
}

function dealSignature(deal) {
  const result = evaluateDeal(deal);
  return JSON.stringify({ winners: result.winners, hands: result.hands.map(hand => [hand.category, hand.holeCount]) });
}

function varyRanks(deal, rng) {
  const ranks = [...new Set([...deal.players.flat(), ...deal.community].map(card => card.rank))].sort((a, b) => a - b);
  const signature = dealSignature(deal);
  const tokens = '23456789TJQKA';
  // An increasing one-to-one rank mapping preserves pair/kicker ordering.
  // Reject any incidental new straight or change in the representative hand.
  for (let attempt = 0; attempt < 8; attempt++) {
    const selected = shuffle(Array.from({ length: 13 }, (_, i) => i + 2), rng).slice(0, ranks.length).sort((a, b) => a - b);
    const mapping = new Map(ranks.map((rank, index) => [rank, selected[index]]));
    const remap = hand => hand.map(card => ({ id: `${tokens[mapping.get(card.rank) - 2]}${card.suit}`, rank: mapping.get(card.rank), suit: card.suit }));
    const candidate = { players: deal.players.map(remap), community: remap(deal.community) };
    if (dealSignature(candidate) === signature) return candidate;
  }
  return deal;
}

export function generateDeal(difficulty = 'normal', rng = Math.random) {
  if (!['normal', 'hard', 'expert'].includes(difficulty)) throw new RangeError('알 수 없는 난이도입니다.');
  if (typeof rng !== 'function') throw new TypeError('난수 생성 함수가 필요합니다.');
  if (difficulty === 'expert') {
    return { ...fromScenario(expertScenario(rng), rng), difficulty };
  }
  if (difficulty === 'hard' && randomIndex(2, rng) === 0) {
    return { ...fromScenario(HARD_SCENARIOS[randomIndex(HARD_SCENARIOS.length, rng)], rng), difficulty };
  }
  // A bounded rejection sampler conditions random, nonduplicated 52-card deals.
  // It changes question selection, never hand legality or comparison rules.
  for (let attempt = 0; attempt < 160; attempt++) {
    const deal = randomDeal(rng);
    const result = evaluateDeal(deal);
    if (result.winners.length !== 1) continue;
    const ranked = [...result.hands].sort((a, b) => compareHands(b, a));
    const category = ranked[0].category;
    if (difficulty === 'normal' && category <= 3 && category > ranked[1].category) {
      return { ...deal, difficulty, scenario: '먼저 족보의 종류를 비교합니다. 각 플레이어의 홀카드는 최대 2장까지만 사용할 수 있습니다.' };
    }
    if (difficulty === 'hard' && [1, 2, 4].includes(category) && category === ranked[1].category) {
      return { ...deal, difficulty, scenario: '상위 두 플레이어의 족보 종류가 같습니다. 숫자와 킥커를 비교 순서대로 끝까지 확인해야 합니다.' };
    }
  }
  // A custom RNG may repeat one permutation indefinitely. Legal, validated
  // fallback keeps the UI responsive while retaining the selected difficulty.
  const fallback = difficulty === 'normal'
    ? { board: 'AS TD 7C 4H 2D', holes: ['KH QS JC', 'AC 9H 3C', '9D 8S 5H'], text: 'A 원페어가 하이카드보다 높습니다. 3장의 홀카드로 만드는 스트레이트는 인정되지 않습니다.' }
    : HARD_SCENARIOS[2];
  return { ...fromScenario(fallback, rng), difficulty };
}
