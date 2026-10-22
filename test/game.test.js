const test = require('node:test');
const assert = require('node:assert/strict');
const KadiGame = require('../game.js');

test('deck has 54 cards including 2 jokers', () => {
  const deck = KadiGame.createDeck();
  assert.equal(deck.length, 54);
  assert.equal(deck.filter((c) => c.rank === 'JOKER').length, 2);
});

test('deal count follows player count rule', () => {
  assert.equal(KadiGame.dealCount(2), 4);
  assert.equal(KadiGame.dealCount(3), 4);
  assert.equal(KadiGame.dealCount(4), 3);
  assert.equal(KadiGame.dealCount(6), 3);
});

test('starting discard cannot be action-only cards', () => {
  assert.equal(KadiGame.canStartDiscard({ rank: '4' }), true);
  assert.equal(KadiGame.canStartDiscard({ rank: 'A' }), false);
  assert.equal(KadiGame.canStartDiscard({ rank: '2' }), false);
  assert.equal(KadiGame.canStartDiscard({ rank: 'JOKER' }), false);
});

test('penalty values are correct', () => {
  assert.equal(KadiGame.penaltyValue({ rank: '2' }), 2);
  assert.equal(KadiGame.penaltyValue({ rank: '3' }), 3);
  assert.equal(KadiGame.penaltyValue({ rank: 'JOKER' }), 5);
});

test('round score sums remaining card points', () => {
  const state = {
    players: [
      { hand: [] },
      { hand: [{ rank: 'JOKER' }, { rank: '5' }] },
      { hand: [{ rank: 'K' }, { rank: '2' }] }
    ]
  };
  // Joker 500 + 5 + K 10 + 2 (75) = 590; the winner's hand is not counted
  assert.equal(KadiGame.roundScore(state, 0), 590);
});

function makeState(hands, top, extra) {
  let id = 1000;
  const mk = (label) => {
    const rank = label.slice(0, -1);
    const suit = label.slice(-1);
    return { id: id++, rank, suit, label, type: KadiGame.cardType(rank) };
  };
  const topCard = mk(top);
  return Object.assign({
    players: hands.map((h, i) => ({
      name: i === 0 ? 'Bot' : 'P' + i,
      userId: null,
      isBot: i === 0,
      hand: h.map(mk),
      declaredNiko: false,
      score: 0
    })),
    drawPile: [mk('9♣'), mk('9♦'), mk('4♣'), mk('5♣'), mk('6♣'), mk('7♣')],
    discardPile: [topCard],
    currentPlayer: 0,
    direction: 1,
    pendingPenalty: null,
    pendingQuestion: null,
    requiredSuit: null,
    winner: null,
    message: ''
  }, extra || {});
}

test('bot plays only legal cards and draws when it has none', () => {
  const state = makeState([['9♣', 'K♣'], ['4♦', '5♦', '6♦']], '4♥');
  KadiGame.botMove(state, 0);
  assert.equal(state.players[0].hand.length, 3);
  assert.equal(state.currentPlayer, 1);
});

test('bot plays a matching card', () => {
  const state = makeState([['4♣', '9♦', '10♠'], ['4♦', '5♦', '6♦']], '4♥');
  KadiGame.botMove(state, 0);
  assert.equal(KadiGame.topDiscard(state).rank, '4');
  assert.equal(state.players[0].hand.length, 2);
});

test('bot takes a penalty when it cannot block', () => {
  const state = makeState([['5♠', '6♠', '7♠'], ['4♦', '5♦', '6♦']], '2♥', {
    pendingPenalty: { rank: '2', amount: 2 }
  });
  KadiGame.botMove(state, 0);
  assert.equal(state.players[0].hand.length, 5);
  assert.equal(state.pendingPenalty, null);
});

test('bot blocks a large penalty with a matching 3', () => {
  const state = makeState([['3♥', '6♠', '7♠'], ['4♦', '5♦', '6♦']], '3♦', {
    pendingPenalty: { rank: '3', amount: 3 }
  });
  KadiGame.botMove(state, 0);
  assert.equal(state.pendingPenalty.amount, 6);
  assert.equal(state.players[0].hand.length, 2);
});

test('bot declares Niko Kadi and wins by going out on a number card', () => {
  const state = makeState([['5♥', '5♠'], ['4♦', '5♦', '6♦']], '5♦');
  KadiGame.botMove(state, 0);
  assert.equal(state.winner, 'Bot');
});

test('bot answers its own question', () => {
  const state = makeState([['Q♥', '7♥', '9♠'], ['4♦', '5♦', '6♦']], 'Q♦');
  KadiGame.botMove(state, 0);
  assert.ok(state.pendingQuestion);
  assert.equal(KadiGame.actingPlayerIndex(state), 0);
  KadiGame.botMove(state, 0);
  assert.equal(state.pendingQuestion, null);
  assert.equal(state.players[0].hand.length, 1);
});

test('bots finish full games without stalling', () => {
  for (let game = 0; game < 200; game += 1) {
    const state = KadiGame.startRound([
      { name: 'A', isBot: true }, { name: 'B', isBot: true }, { name: 'C', isBot: true }
    ], {});
    let moves = 0;
    while (!state.winner && moves < 2000) {
      KadiGame.botMove(state, KadiGame.actingPlayerIndex(state));
      moves += 1;
    }
    assert.ok(state.winner, 'game ' + game + ' did not finish');
  }
});

function idsOf(state, index, labels) {
  return labels.map((l) => state.players[index].hand.find((c) => c.label === l).id);
}

test('playing 2+2 together passes the turn once (2 players)', () => {
  const s = makeState([['2♥', '2♠', '7♦'], ['4♦', '5♦', '6♦']], '5♥');
  KadiGame.playCards(s, 0, idsOf(s, 0, ['2♥', '2♠']));
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.pendingPenalty.amount, 4);
});

test('playing 2+2 together does not skip anyone (3 players)', () => {
  const s = makeState([['2♥', '2♠', '7♦'], ['4♦', '5♦'], ['4♠', '5♠']], '5♥');
  KadiGame.playCards(s, 0, idsOf(s, 0, ['2♥', '2♠']));
  assert.equal(s.currentPlayer, 1);
});

test('stacking penalty cards together passes the turn once', () => {
  const s = makeState([['2♥', '3♦', '7♦'], ['4♦', '5♦'], ['4♠', '5♠']], '2♦', {
    pendingPenalty: { rank: '2', amount: 2 }
  });
  KadiGame.playCards(s, 0, idsOf(s, 0, ['2♥', '3♦']));
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.pendingPenalty.amount, 7);
});

test('multi-card play does not depend on selection order', () => {
  [['7♥', '7♠'], ['7♠', '7♥']].forEach((order) => {
    const s = makeState([['7♥', '7♠', '9♦'], ['4♦', '5♦']], '5♠');
    KadiGame.playCards(s, 0, idsOf(s, 0, order));
    assert.equal(s.players[0].hand.length, 1, order.join(' '));
    assert.equal(s.discardPile.length, 3, order.join(' '));
  });
});

test('multi-card play is rejected when no card matches', () => {
  const s = makeState([['7♥', '7♣', '9♦'], ['4♦', '5♦']], '5♠');
  KadiGame.playCards(s, 0, idsOf(s, 0, ['7♥', '7♣']));
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(s.currentPlayer, 0);
});

test('a Joker cannot be bundled with a different rank', () => {
  const s = makeState([['7♠', '9♦', '4♥'], ['4♦']], '5♠');
  s.players[0].hand.push({ id: 999, rank: 'JOKER', suit: 'JOKER', label: 'JOKER', type: 'penalty' });
  KadiGame.playCards(s, 0, [s.players[0].hand[0].id, 999]);
  assert.equal(s.players[0].hand.length, 4);
  assert.equal(s.pendingPenalty, null);
});

test('double Jump never skips the player who played it', () => {
  const two = makeState([['J♥', 'J♠', '7♦'], ['4♦', '5♦']], '5♥');
  KadiGame.playCards(two, 0, idsOf(two, 0, ['J♥', 'J♠']));
  assert.equal(two.currentPlayer, 0);

  const three = makeState([['J♥', 'J♠', '7♦'], ['4♦', '5♦'], ['4♠', '5♠']], '5♥');
  KadiGame.playCards(three, 0, idsOf(three, 0, ['J♥', 'J♠']));
  assert.equal(three.currentPlayer, 0);

  const single = makeState([['J♥', '7♦'], ['4♦'], ['4♠']], '5♥');
  KadiGame.playCard(single, 0, idsOf(single, 0, ['J♥'])[0]);
  assert.equal(single.currentPlayer, 2);
});

test('the starting player can be chosen for a new round', () => {
  const s = KadiGame.startRound([{ name: 'A' }, { name: 'B' }, { name: 'C' }], {}, 2);
  assert.equal(s.currentPlayer, 2);
  assert.equal(s.message, 'C starts!');
  assert.equal(KadiGame.startRound(['A', 'B'], {}).currentPlayer, 0);
});

test('bot can play a Q/8 chain in either order', () => {
  const s = makeState([['Q♠', '8♠', '7♠'], ['4♦', '5♦']], 'Q♥');
  KadiGame.botMove(s, 0);
  assert.ok(s.players[0].hand.length < 3);
});

test('two players: a Jump brings the turn back to the player who played it', () => {
  const state = makeState([['J♦', '5♦', '6♣'], ['4♦', '9♣']], '9♦');
  state.players[0].isBot = false;
  KadiGame.playCards(state, 0, idsOf(state, 0, ['J♦']));
  assert.equal(state.currentPlayer, 0);
  assert.match(state.message, /plays again/);
});

test('two players: a single Kickback gives the same player another turn', () => {
  const state = makeState([['K♦', '5♦', '6♣'], ['4♦', '9♣']], '9♦');
  KadiGame.playCards(state, 0, idsOf(state, 0, ['K♦']));
  assert.equal(state.currentPlayer, 0);
  assert.equal(state.direction, -1);
});

test('two players: two Kickbacks cancel out and the opponent plays', () => {
  const state = makeState([['K♦', 'K♣', '6♣'], ['4♦', '9♣']], '9♦');
  KadiGame.playCards(state, 0, idsOf(state, 0, ['K♦', 'K♣']));
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.direction, 1);
});

test('three players: Kickback reverses direction to the previous player', () => {
  const state = makeState([['5♣', 'K♦', '6♣'], ['4♦', '9♣'], ['4♣', '7♣']], '9♦', { currentPlayer: 1 });
  state.players[1].hand = [{ id: 7, rank: 'K', suit: '♦', label: 'K♦', type: 'kickback' }, { id: 8, rank: '5', suit: '♦', label: '5♦', type: 'answer' }];
  KadiGame.playCards(state, 1, [7]);
  assert.equal(state.currentPlayer, 0);
  assert.equal(state.direction, -1);
});
