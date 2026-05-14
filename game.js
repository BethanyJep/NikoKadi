(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KadiGame = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function cardType(rank) {
    if (rank === 'A') return 'ace';
    if (rank === 'J') return 'jump';
    if (rank === 'K') return 'kickback';
    if (rank === 'Q' || rank === '8') return 'question';
    if (rank === '2' || rank === '3' || rank === 'JOKER') return 'penalty';
    return 'answer';
  }

  function penaltyValue(card) {
    if (card.rank === '2') return 2;
    if (card.rank === '3') return 3;
    if (card.rank === 'JOKER') return 5;
    return 0;
  }

  function cardPoints(card) {
    if (card.rank === 'JOKER') return 500;
    if (card.rank === 'A') return 100;
    if (card.rank === '2') return 75;
    if (card.rank === '3') return 50;
    if (['10', 'J', 'Q', 'K'].indexOf(card.rank) >= 0) return 10;
    return Number(card.rank);
  }

  function createDeck() {
    var id = 0;
    var deck = [];
    for (var s = 0; s < SUITS.length; s += 1) {
      for (var r = 0; r < RANKS.length; r += 1) {
        var rank = RANKS[r];
        var suit = SUITS[s];
        deck.push({
          id: id++,
          rank: rank,
          suit: suit,
          label: rank + suit,
          type: cardType(rank)
        });
      }
    }

    deck.push({ id: id++, rank: 'JOKER', suit: 'JOKER', label: 'JOKER', type: 'penalty' });
    deck.push({ id: id++, rank: 'JOKER', suit: 'JOKER', label: 'JOKER', type: 'penalty' });
    return deck;
  }

  function shuffle(deck, rng) {
    var rand = rng || Math.random;
    for (var i = deck.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
    }
    return deck;
  }

  function canStartDiscard(card) {
    return !(
      card.rank === '2' ||
      card.rank === '3' ||
      card.rank === 'A' ||
      card.rank === 'J' ||
      card.rank === 'K' ||
      card.rank === 'Q' ||
      card.rank === '8' ||
      card.rank === 'JOKER'
    );
  }

  function dealCount(playerCount) {
    return playerCount <= 3 ? 4 : 3;
  }

  function createPlayers(playerData, scoreBoard) {
    return playerData.map(function (item) {
      var name = typeof item === 'string' ? item : item.name;
      var userId = typeof item === 'string' ? null : (item.userId || null);
      return {
        name: name,
        userId: userId,
        hand: [],
        declaredNiko: false,
        score: scoreBoard[name] || 0
      };
    });
  }

  function drawCard(state, playerIndex, count) {
    var player = state.players[playerIndex];
    var drawCount = count || 1;
    for (var i = 0; i < drawCount; i += 1) {
      if (state.drawPile.length === 0) {
        refillDrawPile(state);
      }
      if (state.drawPile.length === 0) break;
      player.hand.push(state.drawPile.pop());
    }
  }

  function refillDrawPile(state) {
    if (state.discardPile.length <= 1) return;
    var top = state.discardPile.pop();
    var rest = state.discardPile;
    state.discardPile = [top];
    shuffle(rest);
    state.drawPile = rest;
  }

  function topDiscard(state) {
    return state.discardPile[state.discardPile.length - 1];
  }

  function cardMatches(card, top, requiredSuit) {
    if (!top) return true;
    if (card.rank === 'JOKER') return true;
    if (card.rank === 'A') return true;
    if (requiredSuit) {
      return card.suit === requiredSuit || card.rank === top.rank;
    }
    return card.rank === top.rank || card.suit === top.suit;
  }

  function nextPlayerIndex(state, skip) {
    var step = 1 + (skip || 0);
    var size = state.players.length;
    var idx = state.currentPlayer;
    for (var i = 0; i < step; i += 1) {
      idx = (idx + state.direction + size) % size;
    }
    return idx;
  }

  function availableAnswerCards(player, questionCard) {
    return player.hand.filter(function (card) {
      return card.type === 'answer' && (card.suit === questionCard.suit || card.rank === questionCard.rank);
    });
  }

  function winningAllowed(state, player) {
    if (!player.declaredNiko) return false;
    for (var i = 0; i < state.players.length; i += 1) {
      if (state.players[i] !== player && state.players[i].hand.length === 0) {
        return false;
      }
    }
    return true;
  }

  // Cards that can never be part of a winning play: A, 2, 3, J, K, Joker.
  // Q and 8 can win only when an answer card was auto-played alongside them
  // (if we reach the win check with hand=0 after a Q/8, the answer was found).
  function canWinWithCard(card) {
    if (card.type === 'answer') return true;
    if (card.type === 'question') return true;
    return false;
  }

  function canWinWithCards(cards) {
    for (var i = 0; i < cards.length; i += 1) {
      if (!canWinWithCard(cards[i])) return false;
    }
    return true;
  }

  function roundScore(state, winnerIndex) {
    var points = 0;
    for (var i = 0; i < state.players.length; i += 1) {
      if (i === winnerIndex) continue;
      points += state.players[i].hand.reduce(function (sum, card) {
        return sum + cardPoints(card);
      }, 0);
    }
    return points;
  }

  function startRound(names, scoreBoard) {
    var deck = shuffle(createDeck());
    var players = createPlayers(names, scoreBoard || {});
    var handCount = dealCount(players.length);

    for (var i = 0; i < handCount; i += 1) {
      for (var p = 0; p < players.length; p += 1) {
        players[p].hand.push(deck.pop());
      }
    }

    var discard = deck.pop();
    while (discard && !canStartDiscard(discard)) {
      deck.unshift(discard);
      shuffle(deck);
      discard = deck.pop();
    }

    return {
      players: players,
      drawPile: deck,
      discardPile: [discard],
      currentPlayer: 0,
      direction: 1,
      pendingPenalty: null,
      requiredSuit: null,
      winner: null,
      message: players[0].name + ' starts!'
    };
  }

  function playCard(state, playerIndex, cardId, suitChoice) {
    if (state.winner) return state;
    if (playerIndex !== state.currentPlayer) return state;

    var player = state.players[playerIndex];
    var cardPos = player.hand.findIndex(function (c) { return c.id === cardId; });
    if (cardPos < 0) return state;
    var card = player.hand[cardPos];

    if (state.pendingPenalty) {
      var top = topDiscard(state);
      var canBlock = card.rank === 'A' || card.rank === 'JOKER' ||
        ((card.rank === '2' || card.rank === '3') && (top.suit === 'JOKER' || card.suit === top.suit || card.rank === top.rank));
      if (!canBlock) {
        state.message = player.name + ' must play a matching 2/3, Joker, or Ace to block penalty.';
        return state;
      }
    } else if (!cardMatches(card, topDiscard(state), state.requiredSuit)) {
      state.message = card.label + ' does not match. Draw a card instead.';
      return state;
    }

    var previousTop = topDiscard(state);
    var previousRequiredSuit = state.requiredSuit;

    player.hand.splice(cardPos, 1);
    state.discardPile.push(card);
    state.requiredSuit = null;
    state.message = player.name + ' played ' + card.label;

    var skip = 0;

    if (card.type === 'penalty') {
      var amount = penaltyValue(card);
      if (state.pendingPenalty) {
        amount += state.pendingPenalty.amount;
      }
      state.pendingPenalty = {
        rank: card.rank,
        amount: amount
      };
      if (card.rank === 'JOKER') {
        if (previousTop && previousTop.suit !== 'JOKER') {
          state.requiredSuit = previousTop.suit;
        } else if (previousRequiredSuit) {
          state.requiredSuit = previousRequiredSuit;
        }
      }
    } else if (state.pendingPenalty && card.rank === 'A') {
      state.pendingPenalty = null;
      state.requiredSuit = suitChoice || topDiscard(state).suit;
    } else {
      state.pendingPenalty = null;

      if (card.type === 'jump') {
        skip = 1;
      }

      if (card.type === 'kickback') {
        state.direction = state.direction * -1;
      }

      if (card.rank === 'A') {
        state.requiredSuit = suitChoice || card.suit;
      }

      if (card.type === 'question') {
        var answers = availableAnswerCards(player, card);
        if (answers.length > 0) {
          var answer = answers[0];
          player.hand = player.hand.filter(function (c) { return c.id !== answer.id; });
          state.discardPile.push(answer);
          state.message += ' + answer ' + answer.label;
        } else {
          drawCard(state, playerIndex, 1);
          state.message += ' but had no answer, so drew 1 card.';
        }
      }
    }

    if (player.hand.length === 0) {
      if (winningAllowed(state, player) && canWinWithCard(card)) {
        state.winner = player.name;
        var score = roundScore(state, playerIndex);
        player.score += score;
        state.message = player.name + ' wins the round and earns ' + score + ' points!';
        return state;
      }
      drawCard(state, playerIndex, 1);
      if (!player.declaredNiko) {
        state.message = player.name + ' forgot to declare Niko Kadi and draws 1 card.';
      } else {
        state.message = player.name + ' cannot finish with ' + card.label + ' — drew 1 penalty card.';
      }
    }

    state.currentPlayer = nextPlayerIndex(state, skip);
    return state;
  }

  function drawOrTakePenalty(state, playerIndex) {
    if (state.winner) return state;
    if (playerIndex !== state.currentPlayer) return state;

    if (state.pendingPenalty) {
      drawCard(state, playerIndex, state.pendingPenalty.amount);
      state.message = state.players[playerIndex].name + ' took ' + state.pendingPenalty.amount + ' penalty cards.';
      state.pendingPenalty = null;
      var currentTop = topDiscard(state);
      if (!currentTop || currentTop.rank !== 'JOKER') {
        state.requiredSuit = null;
      }
    } else {
      drawCard(state, playerIndex, 1);
      state.message = state.players[playerIndex].name + ' drew a card.';
    }

    state.currentPlayer = nextPlayerIndex(state, 0);
    return state;
  }

  function declareNiko(state, playerIndex) {
    var player = state.players[playerIndex];
    if (!player) return state;
    if (player.hand.length <= 2) {
      player.declaredNiko = true;
      state.message = player.name + ' declared Niko Kadi!';
    }
    return state;
  }

  function playCards(state, playerIndex, cardIds, suitChoice) {
    if (state.winner) return state;
    if (playerIndex !== state.currentPlayer) return state;
    if (!cardIds || cardIds.length === 0) return state;

    // Single card – delegate to existing playCard
    if (cardIds.length === 1) {
      return playCard(state, playerIndex, cardIds[0], suitChoice);
    }

    var player = state.players[playerIndex];
    var top = topDiscard(state);
    var cards = [];

    // Resolve all cards from hand
    for (var i = 0; i < cardIds.length; i += 1) {
      var pos = player.hand.findIndex(function (c) { return c.id === cardIds[i]; });
      if (pos < 0) return state;
      cards.push(player.hand[pos]);
    }

    if (state.pendingPenalty) {
      // Penalty blocking: every card must be a penalty card
      for (var p = 0; p < cards.length; p += 1) {
        var pc = cards[p];
        if (pc.type !== 'penalty') {
          state.message = 'Only penalty cards (2, 3, Joker) can be played together to block.';
          return state;
        }
        if (pc.rank !== 'JOKER' && top.suit !== 'JOKER' && pc.suit !== top.suit && pc.rank !== top.rank) {
          state.message = pc.label + ' does not match the suit or rank of ' + top.label + '.';
          return state;
        }
      }

      // Remove from hand, push to discard, accumulate penalty
      var totalPenalty = state.pendingPenalty.amount;
      var labels = [];
      for (var j = 0; j < cards.length; j += 1) {
        player.hand = player.hand.filter(function (c) { return c.id !== cards[j].id; });
        state.discardPile.push(cards[j]);
        totalPenalty += penaltyValue(cards[j]);
        labels.push(cards[j].label);
      }

      var lastCard = cards[cards.length - 1];
      state.pendingPenalty = { rank: lastCard.rank, amount: totalPenalty };
      if (lastCard.rank === 'JOKER') {
        if (top && top.suit !== 'JOKER') {
          state.requiredSuit = top.suit;
        }
      } else {
        state.requiredSuit = null;
      }
      state.message = player.name + ' played ' + labels.join(' + ') + ' (penalty now ' + totalPenalty + ')';
    } else {
      // Normal multi-card play
      var firstCard = cards[0];
      if (!cardMatches(firstCard, top, state.requiredSuit)) {
        state.message = firstCard.label + ' does not match the top card.';
        return state;
      }

      // Determine if this is a valid multi-card combination:
      // 1) All same rank (e.g. 7♥ + 7♠)
      // 2) All question cards (Q/8) with suit chaining between consecutive cards
      var allSameRank = cards.every(function (c) {
        return c.rank === firstCard.rank || c.rank === 'JOKER';
      });

      var allQuestion = cards.every(function (c) {
        return c.type === 'question';
      });

      var questionChainValid = false;
      if (allQuestion && !allSameRank) {
        // Check suit chain: each consecutive pair must share a suit
        questionChainValid = true;
        for (var qc = 1; qc < cards.length; qc += 1) {
          if (cards[qc].suit !== cards[qc - 1].suit) {
            // Check if they share rank instead (e.g. Q♠ Q♥ both Q)
            if (cards[qc].rank !== cards[qc - 1].rank) {
              questionChainValid = false;
              break;
            }
          }
        }
      }

      if (!allSameRank && !questionChainValid) {
        state.message = 'Cards must share the same rank, or be Q/8 with connecting suits.';
        return state;
      }

      var skip = 0;
      var mLabels = [];
      for (var m = 0; m < cards.length; m += 1) {
        player.hand = player.hand.filter(function (c) { return c.id !== cards[m].id; });
        state.discardPile.push(cards[m]);
        mLabels.push(cards[m].label);

        var cc = cards[m];
        if (cc.type === 'penalty') {
          var amt = penaltyValue(cc);
          if (state.pendingPenalty) {
            amt += state.pendingPenalty.amount;
          }
          state.pendingPenalty = { rank: cc.rank, amount: amt };
        }
        if (cc.type === 'jump') skip += 1;
        if (cc.type === 'kickback') state.direction *= -1;
      }

      state.requiredSuit = null;
      state.message = player.name + ' played ' + mLabels.join(' + ');

      // Handle ace suit choice on last card if applicable
      var last = cards[cards.length - 1];
      if (last.rank === 'A') {
        state.requiredSuit = suitChoice || last.suit;
      } else if (last.rank === 'JOKER') {
        if (top && top.suit !== 'JOKER') {
          state.requiredSuit = top.suit;
        }
      }

      // Handle question on last card
      if (last.type === 'question') {
        var answers = availableAnswerCards(player, last);
        if (answers.length > 0) {
          var answer = answers[0];
          player.hand = player.hand.filter(function (c) { return c.id !== answer.id; });
          state.discardPile.push(answer);
          state.message += ' + answer ' + answer.label;
        } else {
          drawCard(state, playerIndex, 1);
          state.message += ' but had no answer, so drew 1 card.';
        }
      }

      if (!state.pendingPenalty) {
        state.currentPlayer = nextPlayerIndex(state, skip);
      } else {
        state.currentPlayer = nextPlayerIndex(state, 0);
      }
    }

    if (state.pendingPenalty) {
      state.currentPlayer = nextPlayerIndex(state, 0);
    }

    if (player.hand.length === 0) {
      if (winningAllowed(state, player) && canWinWithCards(cards)) {
        state.winner = player.name;
        var score = roundScore(state, playerIndex);
        player.score += score;
        state.message = player.name + ' wins the round and earns ' + score + ' points!';
        return state;
      }
      drawCard(state, playerIndex, 1);
      if (!player.declaredNiko) {
        state.message = player.name + ' forgot to declare Niko Kadi and draws 1 card.';
      } else {
        state.message = player.name + ' cannot finish with an action card — drew 1 penalty card.';
      }
    }

    return state;
  }

  return {
    SUITS: SUITS,
    cardType: cardType,
    createDeck: createDeck,
    canStartDiscard: canStartDiscard,
    startRound: startRound,
    playCard: playCard,
    playCards: playCards,
    drawOrTakePenalty: drawOrTakePenalty,
    declareNiko: declareNiko,
    cardMatches: cardMatches,
    dealCount: dealCount,
    penaltyValue: penaltyValue,
    roundScore: roundScore,
    topDiscard: topDiscard
  };
}));
