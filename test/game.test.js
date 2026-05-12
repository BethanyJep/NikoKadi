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
  assert.equal(KadiGame.roundScore(state, 0), 37);
});
