(function () {
  var state = null;
  var scores = {};
  var selectedCardIds = [];

  var namesInput = document.getElementById('playerNames');
  var startBtn = document.getElementById('startBtn');
  var gameArea = document.getElementById('gameArea');
  var board = document.getElementById('board');

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function suitClass(suit) {
    if (suit === '♥') return 'suit-hearts';
    if (suit === '♦') return 'suit-diamonds';
    if (suit === '♠') return 'suit-spades';
    if (suit === '♣') return 'suit-clubs';
    return 'suit-joker';
  }

  function cardHtml(card, classes) {
    if (card.rank === 'JOKER') {
      return '<span class="card-rank">★</span><span class="card-suit">JKR</span>';
    }
    return '<span class="card-rank">' + escapeHtml(card.rank) + '</span>'
      + '<span class="card-suit">' + escapeHtml(card.suit) + '</span>';
  }

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
    selectedCardIds = [];
    render();
  }

  function currentPlayer() {
    return state.players[state.currentPlayer];
  }

  function toggleCard(cardId) {
    var player = currentPlayer();
    var card = player.hand.find(function (c) { return c.id === cardId; });
    if (!card) return;

    var idx = selectedCardIds.indexOf(cardId);
    if (idx >= 0) {
      selectedCardIds.splice(idx, 1);
    } else {
      selectedCardIds.push(cardId);
    }
    render();
  }

  function playSelected() {
    if (selectedCardIds.length === 0) return;

    var suitChoice;
    var player = currentPlayer();
    var hasAce = selectedCardIds.some(function (id) {
      var c = player.hand.find(function (h) { return h.id === id; });
      return c && c.rank === 'A';
    });
    if (hasAce) {
      var suitSelect = document.getElementById('suitChoice');
      suitChoice = suitSelect ? suitSelect.value : '♠';
    }

    KadiGame.playCards(state, state.currentPlayer, selectedCardIds.slice(), suitChoice);
    selectedCardIds = [];

    if (state.winner) {
      scores[state.winner] = state.players.find(function (p) { return p.name === state.winner; }).score;
    }

    render();
  }

  function draw() {
    KadiGame.drawOrTakePenalty(state, state.currentPlayer);
    selectedCardIds = [];
    render();
  }

  function declare() {
    KadiGame.declareNiko(state, state.currentPlayer);
    render();
  }

  function playerCardList(player, active) {
    var cards = player.hand.map(function (card) {
      if (!active) {
        return '<span class="card hidden">🂠</span>';
      }
      var isSelected = selectedCardIds.indexOf(card.id) >= 0;
      var cls = 'card ' + suitClass(card.suit) + (isSelected ? ' selected' : '');
      return '<button class="' + cls + '" data-card-id="' + card.id + '">'
        + cardHtml(card)
        + '</button>';
    }).join('');

    var actionsHtml = '';
    if (active && !state.winner) {
      actionsHtml = '<div class="player-actions">'
        + '<label style="font-size:0.8rem;opacity:0.8;">Ace suit</label>'
        + '<select id="suitChoice">'
        + '<option value="♠">♠ Spades</option>'
        + '<option value="♥">♥ Hearts</option>'
        + '<option value="♦">♦ Diamonds</option>'
        + '<option value="♣">♣ Clubs</option>'
        + '</select>'
        + (selectedCardIds.length > 0 ? '<button id="playSelectedBtn">▶ Play Cards</button>' : '')
        + '<button id="drawBtn">🃏 Draw / Penalty</button>'
        + '<button id="declareBtn">📢 Niko Kadi</button>'
        + '</div>';
    }
    if (active && state.winner) {
      actionsHtml = '<div class="player-actions">'
        + '<button id="nextRoundBtn">🔄 Next Round</button>'
        + '</div>';
    }

    var bodyHtml = active
      ? '<div class="player-body"><div class="hand">' + cards + '</div>' + actionsHtml + '</div>'
      : '<div class="hand">' + cards + '</div>';

    return '<section class="player ' + (active ? 'active' : '') + '">'
      + '<h3>' + escapeHtml(player.name) + ' <small>(' + player.hand.length + ' cards)</small></h3>'
      + bodyHtml
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
    var topCls = 'card ' + suitClass(top.suit);

    // Position players around the table
    var positions = assignPositions(state.players.length);
    var slots = { top: '', left: '', right: '', bottom: '' };

    state.players.forEach(function (p, i) {
      var pos = positions[i];
      slots[pos] += playerCardList(p, i === state.currentPlayer);
    });

    // Table center
    var tableHtml = '<div class="table-center">'
      + '<div class="discard-area">'
      + '<span class="top-card-display"><span class="' + topCls + '">' + cardHtml(top) + '</span></span>'
      + '<div class="draw-pile">' + state.drawPile.length + '<br>cards</div>'
      + '</div>'
      + '<div class="table-info">'
      + '<p>' + (state.direction === 1 ? '↻' : '↺') + ' ' + escapeHtml(currentPlayer().name) + '\'s turn</p>'
      + (state.pendingPenalty ? '<p style="color:var(--warn);">⚠ Penalty: ' + state.pendingPenalty.amount + ' cards</p>' : '')
      + (state.requiredSuit ? '<p>Suit: ' + escapeHtml(state.requiredSuit) + '</p>' : '')
      + (state.winner ? '<p class="winner">🏆 ' + escapeHtml(state.message) + '</p>' : '<p>' + escapeHtml(state.message) + '</p>')
      + '</div>'
      + '</div>';

    board.innerHTML = '<div class="table-layout">'
      + '<div class="player-slot top">' + slots.top + '</div>'
      + '<div class="player-slot left">' + slots.left + '</div>'
      + tableHtml
      + '<div class="player-slot right">' + slots.right + '</div>'
      + '<div class="player-slot bottom">' + slots.bottom + '</div>'
      + '</div>';

    // Bind buttons rendered inside player actions
    var playBtn = document.getElementById('playSelectedBtn');
    var drawBtn = document.getElementById('drawBtn');
    var declareBtn = document.getElementById('declareBtn');
    var nextRoundBtn = document.getElementById('nextRoundBtn');

    if (playBtn) playBtn.addEventListener('click', playSelected);
    if (drawBtn) drawBtn.addEventListener('click', draw);
    if (declareBtn) declareBtn.addEventListener('click', declare);
    if (nextRoundBtn) nextRoundBtn.addEventListener('click', startRound);
  }

  function assignPositions(count) {
    // Distribute players around the table: bottom, top, left, right
    if (count === 2) return ['bottom', 'top'];
    if (count === 3) return ['bottom', 'top', 'right'];
    if (count === 4) return ['bottom', 'top', 'left', 'right'];
    // 5+ just wrap
    var order = ['bottom', 'top', 'left', 'right'];
    var result = [];
    for (var i = 0; i < count; i++) {
      result.push(order[i % order.length]);
    }
    return result;
  }

  board.addEventListener('click', function (event) {
    var cardButton = event.target.closest('[data-card-id]');
    if (!cardButton) return;
    toggleCard(Number(cardButton.getAttribute('data-card-id')));
  });

  startBtn.addEventListener('click', startRound);

  render();
}());
