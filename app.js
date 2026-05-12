(function () {
  var state = null;
  var scores = {};

  var namesInput = document.getElementById('playerNames');
  var startBtn = document.getElementById('startBtn');
  var drawBtn = document.getElementById('drawBtn');
  var declareBtn = document.getElementById('declareBtn');
  var nextRoundBtn = document.getElementById('nextRoundBtn');
  var gameArea = document.getElementById('gameArea');
  var board = document.getElementById('board');

  function getNames() {
    return namesInput.value
      .split(',')
      .map(function (n) { return n.trim(); })
      .filter(Boolean);
  }

  function startRound() {
    var names = getNames();
    if (names.length < 2) {
      alert('Please enter at least 2 player names.');
      return;
    }
    state = KadiGame.startRound(names, scores);
    render();
  }

  function currentPlayer() {
    return state.players[state.currentPlayer];
  }

  function play(cardId) {
    var player = currentPlayer();
    var card = player.hand.find(function (c) { return c.id === cardId; });
    if (!card) return;

    var suitChoice;
    if (card.rank === 'A') {
      suitChoice = prompt('Choose suit for next player: ♠, ♥, ♦, ♣', card.suit || '♠');
      if (KadiGame.SUITS.indexOf(suitChoice) === -1) {
        suitChoice = card.suit;
      }
    }

    KadiGame.playCard(state, state.currentPlayer, cardId, suitChoice);

    if (state.winner) {
      scores[state.winner] = state.players.find(function (p) { return p.name === state.winner; }).score;
    }

    render();
  }

  function draw() {
    KadiGame.drawOrTakePenalty(state, state.currentPlayer);
    render();
  }

  function declare() {
    KadiGame.declareNiko(state, state.currentPlayer);
    render();
  }

  function playerCardList(player, active) {
    var cards = player.hand.map(function (card) {
      if (!active) return '<span class="card hidden">🂠</span>';
      return '<button class="card" data-card-id="' + card.id + '">' + card.label + '</button>';
    }).join('');

    return '<section class="player ' + (active ? 'active' : '') + '">'
      + '<h3>' + player.name + ' <small>(' + player.hand.length + ' cards)</small></h3>'
      + '<div class="hand">' + cards + '</div>'
      + '<p class="meta">Score: <strong>' + player.score + '</strong> '
      + (player.declaredNiko ? '• ✅ Niko Kadi declared' : '') + '</p>'
      + '</section>';
  }

  function render() {
    if (!state) {
      gameArea.style.display = 'none';
      return;
    }

    gameArea.style.display = 'block';
    var top = KadiGame.topDiscard(state);

    board.innerHTML = '<div class="status">'
      + '<p><strong>Top card:</strong> ' + top.label + '</p>'
      + '<p><strong>Draw pile:</strong> ' + state.drawPile.length + ' cards</p>'
      + '<p><strong>Direction:</strong> ' + (state.direction === 1 ? '↻ Clockwise' : '↺ Counter-clockwise') + '</p>'
      + '<p><strong>Current:</strong> ' + currentPlayer().name + '</p>'
      + (state.pendingPenalty ? '<p class="warning"><strong>Penalty:</strong> draw ' + state.pendingPenalty.amount + ' unless you play ' + state.pendingPenalty.rank + ' or Ace.</p>' : '')
      + (state.requiredSuit ? '<p><strong>Requested Suit:</strong> ' + state.requiredSuit + '</p>' : '')
      + (state.winner ? '<p class="winner">🏆 ' + state.message + '</p>' : '<p>' + state.message + '</p>')
      + '</div>'
      + '<div class="players">'
      + state.players.map(function (p, i) { return playerCardList(p, i === state.currentPlayer); }).join('')
      + '</div>';

    drawBtn.disabled = !!state.winner;
    declareBtn.disabled = !!state.winner;
    nextRoundBtn.style.display = state.winner ? 'inline-block' : 'none';

    Array.prototype.forEach.call(document.querySelectorAll('[data-card-id]'), function (el) {
      el.addEventListener('click', function () {
        play(Number(el.getAttribute('data-card-id')));
      });
    });
  }

  startBtn.addEventListener('click', startRound);
  drawBtn.addEventListener('click', draw);
  declareBtn.addEventListener('click', declare);
  nextRoundBtn.addEventListener('click', startRound);

  render();
}());
