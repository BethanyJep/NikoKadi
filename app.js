(function () {
  // ── State ──
  var currentUser = null;
  var currentRoom = null;
  var roomPlayers = [];
  var isHost = false;
  var gameState = null;
  var myPlayerIndex = -1;
  var selectedCardIds = [];
  var scores = {};
  var roomChannel = null;
  var soloMode = false;
  var soloReturn = 'auth';
  var onlineUser = null;
  var botTimer = null;
  var moveLog = [];
  var lastMoveKey = '';
  var shakeHand = false;
  var BOT_DELAY = 1100;
  var BOT_NAMES = ['Bot Juma', 'Bot Amani', 'Bot Zuri'];

  // ── DOM refs ──
  var screens = {
    auth: document.getElementById('authScreen'),
    lobby: document.getElementById('lobbyScreen'),
    room: document.getElementById('roomScreen'),
    solo: document.getElementById('soloScreen'),
    game: document.getElementById('gameScreen')
  };

  // ── Utility ──
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].style.display = key === name ? 'block' : 'none';
    });
  }

  function showError(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function showToast(msg) {
    var container = document.getElementById('toastContainer');
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(function () {
      t.classList.add('toast-exit');
      setTimeout(function () { t.remove(); }, 300);
    }, 3000);
  }

  var lastAnnouncement = '';
  function announce(text) {
    var el = document.getElementById('srStatus');
    if (!el || text === lastAnnouncement) return;
    lastAnnouncement = text;
    el.textContent = text;
  }

  // ── Auth Screen ──
  async function handleAuth() {
    var name = document.getElementById('displayName').value.trim();
    if (!name) { showError('authError', 'Please enter a display name.'); return; }
    showError('authError', '');
    try {
      Auth.setDisplayName(name);
      currentUser = await Auth.ensureAuth();
      document.getElementById('lobbyName').textContent = name;
      showScreen('lobby');

      var savedCode = Lobby.getSavedRoomCode();
      if (savedCode) { await tryRejoin(savedCode); }
    } catch (err) {
      showError('authError', 'Connection failed: ' + err.message);
    }
  }

  async function tryRejoin(code) {
    try {
      var room = await Lobby.getRoomByCode(code);
      if (!room || room.status === 'finished') { Lobby.clearSavedRoom(); return; }
      currentRoom = room;
      isHost = room.host_id === currentUser.id;
      await Lobby.joinRoom(code, currentUser.id, Auth.getDisplayName());
      if (room.status === 'playing') {
        await enterRoom();
        await startMultiplayerGame();
      } else {
        await enterRoom();
      }
    } catch (_) { Lobby.clearSavedRoom(); }
  }

  // ── Lobby Screen ──
  async function handleCreateRoom() {
    showError('lobbyError', '');
    try {
      currentRoom = await Lobby.createRoom(currentUser.id, Auth.getDisplayName());
      isHost = true;
      await enterRoom();
    } catch (err) { showError('lobbyError', 'Failed to create room: ' + err.message); }
  }

  async function handleJoinRoom() {
    var code = document.getElementById('roomCodeInput').value.trim();
    if (!code) { showError('lobbyError', 'Please enter a room code.'); return; }
    showError('lobbyError', '');
    try {
      currentRoom = await Lobby.joinRoom(code, currentUser.id, Auth.getDisplayName());
      isHost = currentRoom.host_id === currentUser.id;
      await enterRoom();
    } catch (err) { showError('lobbyError', err.message); }
  }

  // ── Room Screen ──
  async function enterRoom() {
    showScreen('room');
    document.getElementById('roomCodeDisplay').textContent = currentRoom.code;
    document.getElementById('shareWhatsAppLink').href = 'https://wa.me/?text=' + encodeURIComponent(
      'Join my Niko Kadi game! Room code: ' + currentRoom.code + ' — ' + inviteUrl(currentRoom.code));

    roomPlayers = await Lobby.getRoomPlayers(currentRoom.id);
    renderRoomPlayers();

    if (roomChannel) { supabase.removeChannel(roomChannel); }
    roomChannel = Lobby.subscribeToRoom(
      currentRoom.id,
      async function () {
        roomPlayers = await Lobby.getRoomPlayers(currentRoom.id);
        renderRoomPlayers();
      },
      async function (updatedRoom) {
        if (updatedRoom.status === 'playing') {
          currentRoom = updatedRoom;
          await startMultiplayerGame();
        }
      }
    );
  }

  function renderRoomPlayers() {
    var list = document.getElementById('roomPlayerList');
    list.innerHTML = roomPlayers.map(function (p) {
      var badge = p.is_host ? ' 👑' : '';
      var me = p.user_id === currentUser.id ? ' (you)' : '';
      return '<li>' + escapeHtml(p.display_name) + badge + me + '</li>';
    }).join('');

    document.getElementById('startGameBtn').style.display =
      isHost && roomPlayers.length >= 2 ? 'block' : 'none';

    var roomErr = document.getElementById('roomError');
    if (!isHost && roomPlayers.length >= 1) {
      roomErr.innerHTML = '<span class="waiting-indicator">⏳ Waiting for host to start…</span>';
      roomErr.style.display = 'block';
    } else {
      roomErr.style.display = 'none';
    }
  }

  function inviteUrl(code) {
    return location.origin + location.pathname + '?room=' + encodeURIComponent(code);
  }

  async function handleCopyCode() {
    if (!currentRoom) return;
    var code = currentRoom.code;
    try {
      await navigator.clipboard.writeText(code);
    } catch (_) {
      var range = document.createRange();
      range.selectNodeContents(document.getElementById('roomCodeDisplay'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
    }
    showToast('Room code ' + code + ' copied');
  }

  async function handleStartGame() {
    showError('roomError', '');
    try {
      var players = roomPlayers.map(function (p) {
        return { name: p.display_name, userId: p.user_id };
      });
      gameState = KadiGame.startRound(players, scores);
      await persistState();
      await Lobby.startGame(currentRoom.id);
      enterGame();
    } catch (err) { showError('roomError', 'Failed to start: ' + err.message); }
  }

  async function handleLeaveRoom() {
    if (soloMode) { exitSolo(); return; }
    try {
      if (roomChannel) { supabase.removeChannel(roomChannel); roomChannel = null; }
      Multiplayer.unsubscribe();
      if (currentRoom) {
        await Lobby.leaveRoom(currentRoom.id, currentUser.id);
      }
    } catch (_) { /* ignore */ }
    currentRoom = null;
    roomPlayers = [];
    gameState = null;
    selectedCardIds = [];
    showScreen('lobby');
  }

  // ── Solo (vs computer) ──
  async function persistState() {
    if (soloMode) return;
    await Multiplayer.saveGameState(currentRoom.id, gameState, currentUser.id);
  }

  function openSoloSetup(from) {
    soloReturn = from;
    if (from === 'auth') {
      var name = document.getElementById('displayName').value.trim();
      if (name) Auth.setDisplayName(name);
    }
    showScreen('solo');
  }

  function startSoloGame() {
    var count = Number(document.getElementById('botCount').value) || 1;
    var name = Auth.getDisplayName() || 'You';
    var players = [{ name: name, userId: 'local-player' }];
    for (var i = 0; i < count; i++) {
      players.push({ name: BOT_NAMES[i], userId: 'local-bot-' + i, isBot: true });
    }
    soloMode = true;
    onlineUser = currentUser;
    currentUser = { id: 'local-player' };
    currentRoom = null;
    scores = {};
    gameState = KadiGame.startRound(players, scores);
    enterGame();
  }

  function exitSolo() {
    clearTimeout(botTimer);
    botTimer = null;
    soloMode = false;
    gameState = null;
    selectedCardIds = [];
    scores = {};
    currentUser = onlineUser;
    onlineUser = null;
    showScreen(soloReturn === 'lobby' ? 'lobby' : 'auth');
  }

  function scheduleBot() {
    if (!soloMode || botTimer || !gameState || gameState.winner) return;
    var idx = KadiGame.actingPlayerIndex(gameState);
    var actor = gameState.players[idx];
    if (!actor || !actor.isBot) return;
    botTimer = setTimeout(function () {
      botTimer = null;
      if (!soloMode || !gameState || gameState.winner) return;
      KadiGame.botMove(gameState, idx);
      recordWinner();
      renderGame();
      if (isMyTurn() && !gameState.winner) showToast("It's your turn!");
    }, BOT_DELAY);
  }

  function recordWinner() {
    if (!gameState.winner) return;
    scores[gameState.winner] = gameState.players.find(function (p) {
      return p.name === gameState.winner;
    }).score;
  }

  // ── Game Screen ──
  async function startMultiplayerGame() {
    gameState = await Multiplayer.loadGameState(currentRoom.id);
    if (!gameState) {
      setTimeout(async function () {
        gameState = await Multiplayer.loadGameState(currentRoom.id);
        if (gameState) enterGame();
      }, 600);
      return;
    }
    enterGame();
  }

  function enterGame() {
    showScreen('game');
    findMyPlayerIndex();
    selectedCardIds = [];
    moveLog = [];
    lastMoveKey = '';

    if (!soloMode) {
      Multiplayer.subscribeToGameState(currentRoom.id, function (newState, updatedBy) {
        if (updatedBy !== currentUser.id) {
          gameState = newState;
          findMyPlayerIndex();
          selectedCardIds = [];
          renderGame();
          if (isMyTurn()) showToast("It's your turn!");
        }
      });
    }

    renderGame();
    if (isMyTurn()) showToast("It's your turn!");
  }

  function findMyPlayerIndex() {
    myPlayerIndex = -1;
    if (!gameState || !gameState.players) return;
    for (var i = 0; i < gameState.players.length; i++) {
      if (gameState.players[i].userId === currentUser.id) {
        myPlayerIndex = i;
        return;
      }
    }
  }

  function isMyTurn() {
    return gameState && gameState.currentPlayer === myPlayerIndex;
  }

  function isMyPendingQuestion() {
    return gameState && gameState.pendingQuestion &&
      gameState.pendingQuestion.playerIndex === myPlayerIndex;
  }

  // ── Card helpers ──
  function suitClass(suit) {
    if (suit === '♥') return 'suit-hearts';
    if (suit === '♦') return 'suit-diamonds';
    if (suit === '♠') return 'suit-spades';
    if (suit === '♣') return 'suit-clubs';
    return 'suit-joker';
  }

  // Pip positions (percent of the card) for number cards, laid out like a real deck
  var L = 31, C = 50, R = 69;
  var PIPS = {
    '2': [[C, 20], [C, 80]],
    '3': [[C, 20], [C, 50], [C, 80]],
    '4': [[L, 20], [R, 20], [L, 80], [R, 80]],
    '5': [[L, 20], [R, 20], [C, 50], [L, 80], [R, 80]],
    '6': [[L, 20], [R, 20], [L, 50], [R, 50], [L, 80], [R, 80]],
    '7': [[L, 20], [R, 20], [C, 35], [L, 50], [R, 50], [L, 80], [R, 80]],
    '8': [[L, 20], [R, 20], [C, 35], [L, 50], [R, 50], [C, 65], [L, 80], [R, 80]],
    '9': [[L, 20], [R, 20], [L, 40], [R, 40], [C, 50], [L, 60], [R, 60], [L, 80], [R, 80]],
    '10': [[L, 20], [R, 20], [C, 30], [L, 40], [R, 40], [L, 60], [R, 60], [C, 70], [L, 80], [R, 80]]
  };

  var SUIT_IDS = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };

  // Suits are drawn as SVG so they look the same on every device (no emoji substitution)
  function suitSvg(suit) {
    return '<svg class="suit" viewBox="0 0 100 100" aria-hidden="true"><use href="#suit-'
      + (SUIT_IDS[suit] || 's') + '"/></svg>';
  }

  // Inner markup of a card face: corner indices plus pips, a court figure or an ace
  function cardHtml(card) {
    if (card.rank === 'JOKER') {
      return '<span class="corner joker-corner"><b>JOKER</b></span><span class="corner joker-corner flip"><b>JOKER</b></span>'
        + '<span class="court joker"><svg class="court-art" viewBox="0 0 60 96" aria-hidden="true">'
        + '<use href="#jester"/></svg></span>';
    }
    var rank = escapeHtml(card.rank);
    var suit = suitSvg(card.suit);
    var corner = '<span class="corner"><b>' + rank + '</b>' + suit + '</span>'
      + '<span class="corner flip"><b>' + rank + '</b>' + suit + '</span>';
    var body = '';
    if (card.rank === 'A') {
      body = '<span class="pip ace" style="--x:50%;--y:50%">' + suit + '</span>';
    } else if (PIPS[card.rank]) {
      body = PIPS[card.rank].map(function (p) {
        return '<span class="pip' + (p[1] > 50 ? ' flip' : '') + '" style="--x:' + p[0] + '%;--y:' + p[1] + '%">'
          + suit + '</span>';
      }).join('');
    } else {
      body = '<span class="court"><svg class="court-art" viewBox="0 0 60 96" aria-hidden="true"><use href="#court-'
        + rank + '"/></svg>'
        + '<span class="court-pip">' + suit + '</span><span class="court-pip flip">' + suit + '</span></span>';
    }
    return corner + body;
  }

  // Fan geometry for a hand of n cards: tilt per card and how much the cards overlap
  function fanVars(n) {
    var ang = n <= 1 ? 0 : Math.min(6, 34 / (n - 1));
    var lap = n <= 6 ? 0.3 : n <= 10 ? 0.54 : n <= 14 ? 0.68 : 0.78;
    return '--n:' + n + ';--ang:' + ang.toFixed(2) + 'deg;--lap:' + lap;
  }

  function fanOffset(i, n) {
    return '--o:' + (i - (n - 1) / 2);
  }

  // ── Game actions ──
  function toggleCard(cardId) {
    if (!isMyTurn() && !isMyPendingQuestion()) return;
    var player = gameState.players[myPlayerIndex];
    if (!player) return;
    var card = player.hand.find(function (c) { return c.id === cardId; });
    if (!card) return;
    var idx = selectedCardIds.indexOf(cardId);
    if (idx >= 0) selectedCardIds.splice(idx, 1);
    else selectedCardIds.push(cardId);
    renderGame();
  }

  // Runs a move; if the engine rejects it, undo the message change, keep the
  // selection so it can be adjusted, and explain with a toast. Nothing is saved.
  function attempt(move) {
    var previousMessage = gameState.message;
    var discards = gameState.discardPile.length;
    move();
    if (gameState.discardPile.length !== discards) return true;

    var reason = gameState.message;
    gameState.message = previousMessage;
    if (reason && reason !== previousMessage) showToast(reason);
    shakeHand = true;
    renderGame();
    return false;
  }

  async function playSelected() {
    if (!isMyTurn() || selectedCardIds.length === 0) return;
    if (gameState.pendingQuestion) return;

    var suitChoice;
    var player = gameState.players[myPlayerIndex];
    var hasAce = selectedCardIds.some(function (id) {
      var c = player.hand.find(function (h) { return h.id === id; });
      return c && c.rank === 'A';
    });
    if (hasAce) {
      var sel = document.getElementById('suitChoice');
      suitChoice = sel ? sel.value : '♠';
    }

    var ids = selectedCardIds.slice();
    if (!attempt(function () { KadiGame.playCards(gameState, myPlayerIndex, ids, suitChoice); })) return;
    selectedCardIds = [];

    recordWinner();
    renderGame();
    await persistState();
  }

  async function drawCard() {
    if (!isMyTurn()) return;
    if (gameState.pendingQuestion) return;
    KadiGame.drawOrTakePenalty(gameState, myPlayerIndex);
    selectedCardIds = [];
    renderGame();
    await persistState();
  }

  async function declareNiko() {
    // Can declare right after playing, even if turn has passed
    KadiGame.declareNiko(gameState, myPlayerIndex);
    renderGame();
    await persistState();
  }

  async function submitAnswer() {
    if (!isMyPendingQuestion() || selectedCardIds.length === 0) return;
    var ids = selectedCardIds.slice();
    if (!attempt(function () { KadiGame.answerQuestion(gameState, myPlayerIndex, ids); })) return;
    selectedCardIds = [];

    recordWinner();
    renderGame();
    await persistState();
  }

  async function nextRound() {
    var players = gameState.players.map(function (p) {
      return { name: p.name, userId: p.userId, isBot: p.isBot };
    });
    var board = {};
    gameState.players.forEach(function (p) { board[p.name] = p.score; });
    scores = board;
    var starter = gameState.players.findIndex(function (p) { return p.name === gameState.winner; });
    gameState = KadiGame.startRound(players, scores, starter);
    selectedCardIds = [];
    moveLog = [];
    renderGame();
    await persistState();
  }

  // ── Player card list rendering ──
  function playerCardList(player, playerIndex) {
    var isMe = playerIndex === myPlayerIndex;
    var isCurrent = playerIndex === gameState.currentPlayer;

    var handSize = player.hand.length;
    var cards = player.hand.map(function (card, i) {
      var offset = fanOffset(i, handSize);
      if (!isMe) return '<span class="card hidden" style="' + offset + '" aria-hidden="true"></span>';
      var isSelected = selectedCardIds.indexOf(card.id) >= 0;
      var cls = 'card ' + suitClass(card.suit) + (isSelected ? ' selected' : '');
      return '<button class="' + cls + '" style="' + offset + '" data-card-id="' + card.id
        + '" aria-pressed="' + isSelected + '" aria-label="' + escapeHtml(card.label || card.rank + card.suit) + '">'
        + cardHtml(card) + '</button>';
    }).join('');
    var shake = isMe && shakeHand ? ' shake' : '';
    if (isMe) shakeHand = false;
    var handHtml = '<div class="hand' + shake + '" style="' + fanVars(handSize) + '">' + cards + '</div>';

    var actionsHtml = '';
    if (isMe && !gameState.winner) {
      if (isMyPendingQuestion()) {
        // Answer mode: player must choose answer cards for Q/8
        var qCard = gameState.pendingQuestion.questionCard;
        var nikoBtn = '';
        if (player.hand.length <= 2 && !player.declaredNiko) {
          nikoBtn = '<button id="declareBtn">📢 Niko Kadi</button>';
        }
        actionsHtml = '<div class="player-actions">'
          + '<p style="font-size:0.85rem;margin:0 0 0.3rem;">Answer ' + escapeHtml(qCard.label)
          + ' — pick card(s) of the same number</p>'
          + nikoBtn
          + (selectedCardIds.length > 0 ? '<button id="submitAnswerBtn">✓ Submit Answer</button>' : '')
          + '</div>';
      } else {
        var turnActions = '';
        if (isMyTurn() && !gameState.pendingQuestion) {
          var aceSelected = player.hand.some(function (c) {
            return c.rank === 'A' && selectedCardIds.indexOf(c.id) >= 0;
          });
          turnActions = (aceSelected
              ? '<label for="suitChoice" class="field-label">Request a suit with your Ace</label>'
                + '<select id="suitChoice">'
                + '<option value="♠">♠ Spades</option>'
                + '<option value="♥">♥ Hearts</option>'
                + '<option value="♦">♦ Diamonds</option>'
                + '<option value="♣">♣ Clubs</option>'
                + '</select>'
              : '')
            + (selectedCardIds.length > 0 ? '<button id="playSelectedBtn">▶ Play Cards</button>' : '')
            + '<button id="drawBtn">🃏 Draw / Penalty</button>';
        }
        // Niko Kadi can be declared right after playing, even if turn has passed
        var nikoBtn2 = '';
        if (player.hand.length <= 2 && !player.declaredNiko) {
          nikoBtn2 = '<button id="declareBtn">📢 Niko Kadi</button>';
        }
        if (turnActions || nikoBtn2) {
          actionsHtml = '<div class="player-actions">' + turnActions + nikoBtn2 + '</div>';
        }
      }
    }
    if (isMe && gameState.winner) {
      actionsHtml = '<div class="player-actions">'
        + '<button id="nextRoundBtn">🔄 Next Round</button>'
        + '</div>';
    }

    var bodyHtml = isMe
      ? '<div class="player-body">' + handHtml + actionsHtml + '</div>'
      : '<div class="fan-box" style="' + fanVars(handSize) + '">' + handHtml + '</div>';

    var turnBadge = isCurrent && !gameState.winner
      ? '<span class="turn-badge">TURN</span>' : '';

    var seatCls = 'seat-' + (playerIndex % 4);
    var currentCls = isCurrent && !gameState.winner ? ' current' : '';
    if (gameState.winner === player.name) currentCls += ' winner-seat';
    return '<section class="player ' + seatCls + currentCls + (isMe ? ' active' : '') + '">'
      + '<h3>' + escapeHtml(player.name) + (isMe ? ' (you)' : '')
      + ' <small>(' + player.hand.length + ' cards)</small> ' + turnBadge + '</h3>'
      + bodyHtml
      + '<p class="meta">Score: <strong>' + player.score + '</strong> '
      + (player.declaredNiko ? '• ✅ Niko Kadi declared' : '') + '</p>'
      + '</section>';
  }

  // ── Position players around table (me always at bottom) ──
  function assignPositions(playerCount, myIdx) {
    var slots = ['bottom', 'top', 'left', 'right'];
    var positions = [];
    for (var i = 0; i < playerCount; i++) {
      var adjusted = (i - myIdx + playerCount) % playerCount;
      positions[i] = slots[adjusted % slots.length];
    }
    return positions;
  }

  // Deterministic pieces so re-renders don't reshuffle the burst
  function confettiHtml() {
    var colors = ['--win', '--saffron', '--clay', '--teal'];
    var bits = '';
    for (var i = 0; i < 36; i++) {
      bits += '<i style="--x:' + ((i * 29) % 100) + 'vw;--c:var(' + colors[i % colors.length]
        + ');--t:' + (2.6 + (i % 5) * 0.5) + 's;--d:' + ((i % 9) * 0.12) + 's;--r:'
        + (360 + (i % 7) * 90) + 'deg"></i>';
    }
    return '<div class="confetti" aria-hidden="true">' + bits + '</div>';
  }

  // ── Status strip: the one place the current obligation is stated ──
  function buildStatusStrip(turnText) {
    var chips = [];
    var turnCls = 'chip chip-turn';
    var turnLabel = turnText;
    if (gameState.winner) {
      turnCls += ' chip-win';
      turnLabel = 'Round over';
    } else if (isMyPendingQuestion()) {
      turnLabel = 'Answer the ' + escapeHtml(gameState.pendingQuestion.questionCard.label);
      turnCls += ' chip-mine';
    } else if (isMyTurn()) {
      turnCls += ' chip-mine';
    }
    chips.push('<span class="' + turnCls + '">' + turnLabel + '</span>');

    if (gameState.pendingPenalty) {
      var amount = gameState.pendingPenalty.amount;
      chips.push('<span class="chip chip-penalty">Penalty: draw ' + amount + '</span>');
      if (isMyTurn()) {
        chips.push('<span class="chip chip-hint">Block with a matching 2/3, Joker or Ace — or take it</span>');
      }
    }
    if (gameState.requiredSuit) {
      chips.push('<span class="chip chip-suit ' + suitClass(gameState.requiredSuit) + '">Suit: '
        + escapeHtml(gameState.requiredSuit) + '</span>');
    }
    chips.push('<span class="chip chip-dir" title="Direction of play">'
      + (gameState.direction === 1 ? '↻' : '↺') + '</span>');
    return '<div class="status-strip">' + chips.join('') + '</div>';
  }

  // Keeps the last few table messages so back-to-back moves are not lost
  function trackMoves() {
    var key = [gameState.message, gameState.discardPile.length, gameState.drawPile.length,
      gameState.currentPlayer].concat(gameState.players.map(function (p) { return p.hand.length; })).join('|');
    if (key === lastMoveKey) return;
    lastMoveKey = key;
    moveLog.push(gameState.message);
    if (moveLog.length > 5) moveLog.shift();
  }

  function recentMovesHtml() {
    var earlier = moveLog.slice(0, -1);
    if (!earlier.length) return '';
    return '<ol class="move-log" aria-label="Recent moves">' + earlier.slice().reverse().map(function (m) {
      return '<li>' + escapeHtml(m) + '</li>';
    }).join('') + '</ol>';
  }

  // ── Main game render ──
  function renderGame() {
    if (!gameState) return;
    trackMoves();

    var board = document.getElementById('board');
    var top = KadiGame.topDiscard(gameState);
    var pileCards = gameState.discardPile.slice(-4);
    var pileShapes = [['-3deg', '0px', '0px'], ['9deg', '10px', '-3px'], ['-13deg', '-9px', '4px'], ['18deg', '6px', '-5px']];
    var pileHtml = pileCards.map(function (c, idx) {
      var depth = pileCards.length - 1 - idx;
      var s = pileShapes[depth];
      return '<span class="card ' + suitClass(c.suit) + '" role="img" aria-label="' + escapeHtml(c.label) + '" style="--rot:' + s[0] + ';--tx:' + s[1] + ';--ty:' + s[2] + '">'
        + cardHtml(c) + '</span>';
    }).join('');

    var positions = assignPositions(gameState.players.length, myPlayerIndex);
    var slotContent = { top: '', left: '', right: '', bottom: '' };

    gameState.players.forEach(function (p, i) {
      slotContent[positions[i]] += playerCardList(p, i);
    });

    var topLabel = top.rank === 'JOKER' ? 'JOKER' : top.label;
    var topInfo = '<p>Top card: <strong>' + escapeHtml(topLabel) + '</strong>';
    if (top.rank === 'JOKER' && gameState.requiredSuit) {
      topInfo += ' (play ' + escapeHtml(gameState.requiredSuit) + ')';
    }
    topInfo += '</p>';

    var cpName = gameState.players[gameState.currentPlayer]
      ? gameState.players[gameState.currentPlayer].name : '?';
    var turnText;
    if (gameState.pendingQuestion) {
      var qPlayer = gameState.players[gameState.pendingQuestion.playerIndex];
      turnText = isMyPendingQuestion()
        ? 'Choose your answer!'
        : escapeHtml(qPlayer ? qPlayer.name : '?') + ' is answering…';
    } else {
      turnText = isMyTurn() ? 'Your turn!' : escapeHtml(cpName) + "'s turn";
    }

    var statusHtml = buildStatusStrip(turnText);

    var tableHtml = '<div class="table-center">'
      + '<div class="discard-area">'
      + '<div class="pile top-card-display" aria-label="Discard pile">' + pileHtml + '</div>'
      + '<div class="deck" aria-label="Draw pile"><span class="card hidden"></span>'
      + '<span class="deck-count">' + gameState.drawPile.length + ' cards</span></div>'
      + '</div>'
      + '<div class="table-info">'
      + recentMovesHtml()
      + topInfo
      + (gameState.winner ? '<p class="winner">🏆 ' + escapeHtml(gameState.message) + '</p>' : '<p>' + escapeHtml(gameState.message) + '</p>')
      + '</div>'
      + '</div>';

    var confetti = gameState.winner ? confettiHtml() : '';
    board.innerHTML = confetti + statusHtml + '<div class="table-layout">'
      + '<div class="player-slot top">' + slotContent.top + '</div>'
      + '<div class="player-slot left">' + slotContent.left + '</div>'
      + tableHtml
      + '<div class="player-slot right">' + slotContent.right + '</div>'
      + '<div class="player-slot bottom">' + slotContent.bottom + '</div>'
      + '</div>';

    announce(turnText + '. ' + gameState.message
      + (gameState.pendingPenalty ? ' Penalty: ' + gameState.pendingPenalty.amount + ' cards.' : ''));

    var playBtn = document.getElementById('playSelectedBtn');
    var drawBtn = document.getElementById('drawBtn');
    var declareBtn = document.getElementById('declareBtn');
    var nextRoundBtn = document.getElementById('nextRoundBtn');
    var submitAnswerBtn = document.getElementById('submitAnswerBtn');

    if (playBtn) playBtn.addEventListener('click', playSelected);
    if (drawBtn) drawBtn.addEventListener('click', drawCard);
    if (declareBtn) declareBtn.addEventListener('click', declareNiko);
    if (nextRoundBtn) nextRoundBtn.addEventListener('click', nextRound);
    if (submitAnswerBtn) submitAnswerBtn.addEventListener('click', submitAnswer);

    scheduleBot();
  }

  // ── Event delegation for card clicks ──
  document.getElementById('board').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-card-id]');
    if (!btn) return;
    toggleCard(Number(btn.getAttribute('data-card-id')));
  });

  // ── Bind screen buttons ──
  document.getElementById('authBtn').addEventListener('click', handleAuth);
  document.getElementById('displayName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleAuth();
  });
  document.getElementById('authSoloBtn').addEventListener('click', function () { openSoloSetup('auth'); });
  document.getElementById('lobbySoloBtn').addEventListener('click', function () { openSoloSetup('lobby'); });
  document.getElementById('soloStartBtn').addEventListener('click', startSoloGame);
  document.getElementById('soloBackBtn').addEventListener('click', function () {
    showScreen(soloReturn === 'lobby' ? 'lobby' : 'auth');
  });
  document.getElementById('createRoomBtn').addEventListener('click', handleCreateRoom);
  document.getElementById('joinRoomBtn').addEventListener('click', handleJoinRoom);
  document.getElementById('roomCodeInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleJoinRoom();
  });
  document.getElementById('startGameBtn').addEventListener('click', handleStartGame);
  document.getElementById('rulesBtn').addEventListener('click', function () {
    document.getElementById('rulesDialog').showModal();
  });
  document.getElementById('copyCodeBtn').addEventListener('click', handleCopyCode);
  document.getElementById('leaveRoomBtn').addEventListener('click', handleLeaveRoom);
  document.getElementById('backToLobbyBtn').addEventListener('click', handleLeaveRoom);

  // ── Init: restore saved display name ──
  (function init() {
    var saved = Auth.getDisplayName();
    if (saved) document.getElementById('displayName').value = saved;

    // Invite links look like ?room=ABC123 — pre-fill the join box
    var invited = new URLSearchParams(location.search).get('room');
    if (invited) {
      document.getElementById('roomCodeInput').value = invited.toUpperCase().slice(0, 6);
    }
  })();
}());
