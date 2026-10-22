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
        isBot: typeof item === 'string' ? false : !!item.isBot,
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
    var size = state.players.length;
    var step = 1 + Math.min(skip || 0, size - 1);
    var idx = state.currentPlayer;
    for (var i = 0; i < step; i += 1) {
      idx = (idx + state.direction + size) % size;
    }
    return idx;
  }

  // Hand the turn on; in a two-player game a Jump or Kickback brings it straight back
  function advanceTurn(state, playerIndex, skip) {
    state.currentPlayer = nextPlayerIndex(state, skip);
    if (state.currentPlayer === playerIndex && !state.winner && state.players.length > 1) {
      state.message += ' — ' + state.players[playerIndex].name + ' plays again.';
    }
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

  function startRound(names, scoreBoard, starter) {
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

    var first = starter >= 0 && starter < players.length ? starter : 0;

    return {
      players: players,
      drawPile: deck,
      discardPile: [discard],
      currentPlayer: first,
      direction: 1,
      pendingPenalty: null,
      pendingQuestion: null,
      requiredSuit: null,
      winner: null,
      message: players[first].name + ' starts!'
    };
  }

  function playCard(state, playerIndex, cardId, suitChoice) {
    if (state.winner) return state;
    if (state.pendingQuestion) return state;
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
        if (state.players.length === 2) skip = 1;
      }

      if (card.rank === 'A') {
        state.requiredSuit = suitChoice || card.suit;
      }

      if (card.type === 'question') {
        var answers = availableAnswerCards(player, card);
        if (answers.length > 0) {
          state.pendingQuestion = { questionCard: card, playerIndex: playerIndex, skip: skip };
          return state;
        } else {
          drawCard(state, playerIndex, 1);
          state.message += ' but had no answer, so drew 1 card.';
        }
      }
    }

    if (player.hand.length === 0) {
      var wasDeclared = player.declaredNiko;
      if (winningAllowed(state, player) && canWinWithCard(card)) {
        state.winner = player.name;
        var score = roundScore(state, playerIndex);
        player.score += score;
        state.message = player.name + ' wins the round and earns ' + score + ' points!';
        return state;
      }
      drawCard(state, playerIndex, 1);
      if (!wasDeclared) {
        state.message = player.name + ' forgot to declare Niko Kadi and draws 1 card.';
      } else {
        state.message = player.name + ' cannot finish with ' + card.label + ' — drew 1 penalty card.';
      }
      player.declaredNiko = false;
    }

    advanceTurn(state, playerIndex, skip);
    return state;
  }

  function drawOrTakePenalty(state, playerIndex) {
    if (state.winner) return state;
    if (state.pendingQuestion) return state;
    if (playerIndex !== state.currentPlayer) return state;

    var player = state.players[playerIndex];

    if (state.pendingPenalty) {
      drawCard(state, playerIndex, state.pendingPenalty.amount);
      state.message = player.name + ' took ' + state.pendingPenalty.amount + ' penalty cards.';
      state.pendingPenalty = null;
      var currentTop = topDiscard(state);
      if (!currentTop || currentTop.rank !== 'JOKER') {
        state.requiredSuit = null;
      }
    } else {
      drawCard(state, playerIndex, 1);
      state.message = player.name + ' drew a card.';
    }

    player.declaredNiko = false;
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

  // The first card played must match the top card, whatever order the cards were picked in
  function orderForPlay(cards, top, requiredSuit) {
    var sameRank = cards.every(function (c) { return c.rank === cards[0].rank; });
    if (sameRank) {
      var m = cards.findIndex(function (c) { return cardMatches(c, top, requiredSuit); });
      if (m < 0) return null;
      return [cards[m]].concat(cards.filter(function (c, i) { return i !== m; }));
    }
    var reversed = cards.slice().reverse();
    var options = [cards, reversed];
    for (var i = 0; i < options.length; i += 1) {
      if (cardMatches(options[i][0], top, requiredSuit)) return options[i];
    }
    return null;
  }

  function playCards(state, playerIndex, cardIds, suitChoice) {
    if (state.winner) return state;
    if (state.pendingQuestion) return state;
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
      state.currentPlayer = nextPlayerIndex(state, 0);
    } else {
      // Normal multi-card play
      var ordered = orderForPlay(cards, top, state.requiredSuit);
      if (!ordered) {
        state.message = 'None of those cards match ' + top.label + '.';
        return state;
      }
      cards = ordered;
      var firstCard = cards[0];

      // Determine if this is a valid multi-card combination:
      // 1) All same rank (e.g. 7♥ + 7♠)
      // 2) All question cards (Q/8) with suit chaining between consecutive cards
      var allSameRank = cards.every(function (c) {
        return c.rank === firstCard.rank;
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
      var reversals = 0;
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
        if (cc.type === 'kickback') {
          state.direction *= -1;
          reversals += 1;
        }
      }
      if (state.players.length === 2 && reversals % 2 === 1) skip += 1;

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
          state.pendingQuestion = { questionCard: last, playerIndex: playerIndex, skip: skip };
          return state;
        } else {
          drawCard(state, playerIndex, 1);
          state.message += ' but had no answer, so drew 1 card.';
        }
      }

      if (!state.pendingPenalty) {
        advanceTurn(state, playerIndex, skip);
      } else {
        state.currentPlayer = nextPlayerIndex(state, 0);
      }
    }

    if (player.hand.length === 0) {
      var wasDeclared = player.declaredNiko;
      if (winningAllowed(state, player) && canWinWithCards(cards)) {
        state.winner = player.name;
        var score = roundScore(state, playerIndex);
        player.score += score;
        state.message = player.name + ' wins the round and earns ' + score + ' points!';
        return state;
      }
      drawCard(state, playerIndex, 1);
      if (!wasDeclared) {
        state.message = player.name + ' forgot to declare Niko Kadi and draws 1 card.';
      } else {
        state.message = player.name + ' cannot finish with an action card — drew 1 penalty card.';
      }
      player.declaredNiko = false;
    }

    return state;
  }

  function answerQuestion(state, playerIndex, answerCardIds) {
    if (!state.pendingQuestion) return state;
    if (playerIndex !== state.pendingQuestion.playerIndex) return state;
    if (!answerCardIds || answerCardIds.length === 0) return state;

    var player = state.players[playerIndex];
    var qCard = state.pendingQuestion.questionCard;
    var skip = state.pendingQuestion.skip || 0;

    // Resolve answer cards from hand
    var answerCards = [];
    for (var i = 0; i < answerCardIds.length; i += 1) {
      var pos = player.hand.findIndex(function (c) { return c.id === answerCardIds[i]; });
      if (pos < 0) return state;
      answerCards.push(player.hand[pos]);
    }

    // All must be answer-type cards
    for (var a = 0; a < answerCards.length; a += 1) {
      if (answerCards[a].type !== 'answer') {
        state.message = 'Only answer cards (4\u201310) can be used to answer.';
        return state;
      }
    }

    // All must share the same rank
    var answerRank = answerCards[0].rank;
    for (var r = 1; r < answerCards.length; r += 1) {
      if (answerCards[r].rank !== answerRank) {
        state.message = 'All answer cards must be the same number.';
        return state;
      }
    }

    // At least one must match the question card's suit
    var suitMatch = answerCards.some(function (c) {
      return c.suit === qCard.suit;
    });
    if (!suitMatch) {
      state.message = 'At least one answer must match the question card suit (' + qCard.suit + ').';
      return state;
    }

    // Discard answer cards
    var labels = [];
    for (var d = 0; d < answerCards.length; d += 1) {
      player.hand = player.hand.filter(function (c) { return c.id !== answerCards[d].id; });
      state.discardPile.push(answerCards[d]);
      labels.push(answerCards[d].label);
    }
    state.message = player.name + ' answered with ' + labels.join(' + ');
    state.pendingQuestion = null;

    // Win check
    if (player.hand.length === 0) {
      var wasDeclared = player.declaredNiko;
      if (winningAllowed(state, player) && canWinWithCard(qCard)) {
        state.winner = player.name;
        var score = roundScore(state, playerIndex);
        player.score += score;
        state.message = player.name + ' wins the round and earns ' + score + ' points!';
        return state;
      }
      drawCard(state, playerIndex, 1);
      if (!wasDeclared) {
        state.message = player.name + ' forgot to declare Niko Kadi and draws 1 card.';
      } else {
        state.message = player.name + ' cannot win \u2014 drew 1 penalty card.';
      }
      player.declaredNiko = false;
    }

    state.currentPlayer = nextPlayerIndex(state, skip);
    return state;
  }


  // ── Computer player ──
  // The bot never reimplements the rules: every candidate move is tried on a
  // copy of the state through the real engine and kept only if it was accepted.

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function subsetsUpTo(cards, maxSize) {
    var result = [];
    function walk(start, chosen) {
      if (chosen.length > 0) result.push(chosen.slice());
      if (chosen.length === maxSize) return;
      for (var i = start; i < cards.length; i += 1) {
        chosen.push(cards[i]);
        walk(i + 1, chosen);
        chosen.pop();
      }
    }
    walk(0, []);
    return result;
  }

  function sameKind(cards) {
    if (cards.length === 1) return true;
    var allPenalty = cards.every(function (c) { return c.type === 'penalty'; });
    var allQuestion = cards.every(function (c) { return c.type === 'question'; });
    var rank = cards[0].rank;
    var allSameRank = cards.every(function (c) { return c.rank === rank; });
    return allPenalty || allQuestion || allSameRank;
  }

  function mostCommonSuit(cards, fallback) {
    var counts = {};
    var best = fallback;
    var bestCount = 0;
    cards.forEach(function (c) {
      if (c.suit === 'JOKER') return;
      counts[c.suit] = (counts[c.suit] || 0) + 1;
      if (counts[c.suit] > bestCount) {
        bestCount = counts[c.suit];
        best = c.suit;
      }
    });
    return best;
  }

  function opponentPressure(state, playerIndex) {
    var size = state.players.length;
    var next = state.players[(playerIndex + state.direction + size) % size];
    return next ? next.hand.length : 99;
  }

  function scorePlay(before, after, playerIndex, cards) {
    var me = before.players[playerIndex];
    if (after.winner) return 100000;

    var score = cards.length * 12;
    var remaining = me.hand.filter(function (c) {
      return cards.every(function (p) { return p.id !== c.id; });
    });
    var nextHand = opponentPressure(before, playerIndex);

    cards.forEach(function (c) {
      if (c.type === 'answer') {
        score += cardPoints(c) / 2;
      } else if (c.rank === 'A') {
        score -= remaining.length <= 2 ? 0 : 30;
      } else if (c.rank === 'JOKER') {
        score -= remaining.length <= 2 ? 0 : 20;
        if (nextHand <= 2) score += 25;
      } else if (c.type === 'penalty') {
        score += penaltyValue(c) * 3 + (nextHand <= 2 ? 15 : 0);
      } else if (c.type === 'jump') {
        score += nextHand <= 3 ? 18 : 4;
      } else if (c.type === 'kickback') {
        score += before.players.length === 2 ? (nextHand <= 3 ? 18 : 4) : 3;
      }
    });

    if (cards.some(function (c) { return c.type === 'question'; })) {
      score += after.pendingQuestion ? 30 : -25;
    }

    var newTop = after.discardPile[after.discardPile.length - 1];
    var suit = after.requiredSuit || (newTop && newTop.suit);
    score += remaining.filter(function (c) { return c.suit === suit; }).length * 4;

    if (remaining.length === 0) {
      // Going out without winning costs a penalty card, so only dump a lone
      // action card when it is a penalty attack
      score -= cards.some(function (c) { return c.type === 'penalty'; }) ? 60 : 90;
    }
    if (remaining.length === 1 && canWinWithCard(remaining[0])) score += 15;
    return score;
  }

  function planBotMove(state, playerIndex) {
    var player = state.players[playerIndex];

    if (state.pendingQuestion && state.pendingQuestion.playerIndex === playerIndex) {
      var qCard = state.pendingQuestion.questionCard;
      var groups = {};
      availableAnswerCards(player, qCard).forEach(function (c) {
        (groups[c.rank] = groups[c.rank] || []).push(c);
      });
      var bestGroup = null;
      Object.keys(groups).forEach(function (rank) {
        var group = groups[rank];
        var points = group.reduce(function (sum, c) { return sum + cardPoints(c); }, 0);
        if (!bestGroup || points > bestGroup.points) bestGroup = { cards: group, points: points };
      });
      if (!bestGroup) return { type: 'none' };
      return { type: 'answer', cardIds: bestGroup.cards.map(function (c) { return c.id; }) };
    }

    if (state.currentPlayer !== playerIndex) return { type: 'none' };

    var penalty = state.pendingPenalty ? state.pendingPenalty.amount : 0;
    var best = { type: 'draw', score: penalty ? -penalty * 8 : -40 };

    var combos = [];
    subsetsUpTo(player.hand, 4).forEach(function (cards) {
      if (!sameKind(cards)) return;
      combos.push(cards);
      // Q/8 chains care about order, so also try the reverse
      if (cards.length > 1 && cards.every(function (c) { return c.type === 'question'; })) {
        combos.push(cards.slice().reverse());
      }
    });

    combos.forEach(function (cards) {
      var ids = cards.map(function (c) { return c.id; });
      var remaining = player.hand.filter(function (c) { return ids.indexOf(c.id) < 0; });
      var suitChoice = mostCommonSuit(remaining, cards[cards.length - 1].suit);
      if (suitChoice === 'JOKER') suitChoice = '♠';

      var trial = cloneState(state);
      playCards(trial, playerIndex, ids, suitChoice);
      var stillHeld = trial.players[playerIndex].hand.some(function (c) { return ids.indexOf(c.id) >= 0; });
      if (stillHeld) return;

      var score = scorePlay(state, trial, playerIndex, cards);
      if (penalty && !trial.winner) {
        // Blocking saves the penalty cards, so weigh that against what is spent
        score += penalty * 8;
      }
      score += Math.random();
      if (score > best.score) {
        best = { type: 'play', cardIds: ids, suit: suitChoice, score: score };
      }
    });

    return best;
  }

  // Plays one action for the bot on the real state and returns what it did.
  function botMove(state, playerIndex) {
    var player = state.players[playerIndex];
    if (!player || state.winner) return state;

    if (player.hand.length <= 2 && !player.declaredNiko) {
      declareNiko(state, playerIndex);
    }

    var plan = planBotMove(state, playerIndex);
    if (plan.type === 'answer') {
      answerQuestion(state, playerIndex, plan.cardIds);
    } else if (plan.type === 'play') {
      playCards(state, playerIndex, plan.cardIds, plan.suit);
    } else if (plan.type === 'draw') {
      drawOrTakePenalty(state, playerIndex);
    }
    return state;
  }

  function actingPlayerIndex(state) {
    return state.pendingQuestion ? state.pendingQuestion.playerIndex : state.currentPlayer;
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
    answerQuestion: answerQuestion,
    availableAnswerCards: availableAnswerCards,
    cardMatches: cardMatches,
    dealCount: dealCount,
    penaltyValue: penaltyValue,
    roundScore: roundScore,
    topDiscard: topDiscard,
    botMove: botMove,
    planBotMove: planBotMove,
    actingPlayerIndex: actingPlayerIndex
  };
}));
