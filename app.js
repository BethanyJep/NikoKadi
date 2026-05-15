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

  // ── DOM refs ──
  var screens = {
    auth: document.getElementById('authScreen'),
    lobby: document.getElementById('lobbyScreen'),
    room: document.getElementById('roomScreen'),
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

  async function handleStartGame() {
    showError('roomError', '');
    try {
      var players = roomPlayers.map(function (p) {
        return { name: p.display_name, userId: p.user_id };
      });
      gameState = KadiGame.startRound(players, scores);
      await Multiplayer.saveGameState(currentRoom.id, gameState, currentUser.id);
      await Lobby.startGame(currentRoom.id);
      enterGame();
    } catch (err) { showError('roomError', 'Failed to start: ' + err.message); }
  }

  async function handleLeaveRoom() {
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

    Multiplayer.subscribeToGameState(currentRoom.id, function (newState, updatedBy) {
      if (updatedBy !== currentUser.id) {
        gameState = newState;
        findMyPlayerIndex();
        selectedCardIds = [];
        renderGame();
        if (isMyTurn()) showToast("It's your turn!");
      }
    });

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

  function cardHtml(card) {
    if (card.rank === 'JOKER') {
      return '<span class="card-rank">★</span><span class="card-suit">JKR</span>';
    }
    return '<span class="card-rank">' + escapeHtml(card.rank) + '</span>'
      + '<span class="card-suit">' + escapeHtml(card.suit) + '</span>';
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

    KadiGame.playCards(gameState, myPlayerIndex, selectedCardIds.slice(), suitChoice);
    selectedCardIds = [];

    if (gameState.winner) {
      scores[gameState.winner] = gameState.players.find(function (p) {
        return p.name === gameState.winner;
      }).score;
    }
    renderGame();
    await Multiplayer.saveGameState(currentRoom.id, gameState, currentUser.id);
  }

  async function drawCard() {
    if (!isMyTurn()) return;
    if (gameState.pendingQuestion) return;
    KadiGame.drawOrTakePenalty(gameState, myPlayerIndex);
    selectedCardIds = [];
    renderGame();
    await Multiplayer.saveGameState(currentRoom.id, gameState, currentUser.id);
  }

  async function declareNiko() {
    // Can declare right after playing, even if turn has passed
    KadiGame.declareNiko(gameState, myPlayerIndex);
    renderGame();
    await Multiplayer.saveGameState(currentRoom.id, gameState, currentUser.id);
  }

  async function submitAnswer() {
    if (!isMyPendingQuestion() || selectedCardIds.length === 0) return;
    KadiGame.answerQuestion(gameState, myPlayerIndex, selectedCardIds.slice());
    selectedCardIds = [];

    if (gameState.winner) {
      scores[gameState.winner] = gameState.players.find(function (p) {
        return p.name === gameState.winner;
      }).score;
    }
    renderGame();
    await Multiplayer.saveGameState(currentRoom.id, gameState, currentUser.id);
  }

  async function nextRound() {
    var players = gameState.players.map(function (p) {
      return { name: p.name, userId: p.userId };
    });
    gameState = KadiGame.startRound(players, scores);
    selectedCardIds = [];
    renderGame();
    await Multiplayer.saveGameState(currentRoom.id, gameState, currentUser.id);
  }

  // ── Player card list rendering ──
  function playerCardList(player, playerIndex) {
    var isMe = playerIndex === myPlayerIndex;
    var isCurrent = playerIndex === gameState.currentPlayer;

    var cards = player.hand.map(function (card) {
      if (!isMe) return '<span class="card hidden">🂠</span>';
      var isSelected = selectedCardIds.indexOf(card.id) >= 0;
      var cls = 'card ' + suitClass(card.suit) + (isSelected ? ' selected' : '');
      return '<button class="' + cls + '" data-card-id="' + card.id + '">'
        + cardHtml(card) + '</button>';
    }).join('');

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
          turnActions = '<label style="font-size:0.8rem;opacity:0.8;">Ace suit</label>'
            + '<select id="suitChoice">'
            + '<option value="♠">♠ Spades</option>'
            + '<option value="♥">♥ Hearts</option>'
            + '<option value="♦">♦ Diamonds</option>'
            + '<option value="♣">♣ Clubs</option>'
            + '</select>'
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
      ? '<div class="player-body"><div class="hand">' + cards + '</div>' + actionsHtml + '</div>'
      : '<div class="hand">' + cards + '</div>';

    var turnBadge = isCurrent && !gameState.winner
      ? '<span class="turn-badge">TURN</span>' : '';

    return '<section class="player ' + (isMe ? 'active' : '') + '">'
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

  // ── Main game render ──
  function renderGame() {
    if (!gameState) return;

    var board = document.getElementById('board');
    var top = KadiGame.topDiscard(gameState);
    var topCls = 'card ' + suitClass(top.suit);

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

    var tableHtml = '<div class="table-center">'
      + '<div class="discard-area">'
      + '<span class="top-card-display"><span class="' + topCls + '">' + cardHtml(top) + '</span></span>'
      + '<div class="draw-pile">' + gameState.drawPile.length + '<br>cards</div>'
      + '</div>'
      + '<div class="table-info">'
      + topInfo
      + '<p>' + (gameState.direction === 1 ? '↻' : '↺') + ' ' + turnText + '</p>'
      + (gameState.pendingPenalty ? '<p style="color:var(--warn);">⚠ Penalty: ' + gameState.pendingPenalty.amount + ' cards</p>' : '')
      + (gameState.requiredSuit ? '<p>Suit: ' + escapeHtml(gameState.requiredSuit) + '</p>' : '')
      + (gameState.winner ? '<p class="winner">🏆 ' + escapeHtml(gameState.message) + '</p>' : '<p>' + escapeHtml(gameState.message) + '</p>')
      + '</div>'
      + '</div>';

    board.innerHTML = '<div class="table-layout">'
      + '<div class="player-slot top">' + slotContent.top + '</div>'
      + '<div class="player-slot left">' + slotContent.left + '</div>'
      + tableHtml
      + '<div class="player-slot right">' + slotContent.right + '</div>'
      + '<div class="player-slot bottom">' + slotContent.bottom + '</div>'
      + '</div>';

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
  document.getElementById('createRoomBtn').addEventListener('click', handleCreateRoom);
  document.getElementById('joinRoomBtn').addEventListener('click', handleJoinRoom);
  document.getElementById('roomCodeInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleJoinRoom();
  });
  document.getElementById('startGameBtn').addEventListener('click', handleStartGame);
  document.getElementById('leaveRoomBtn').addEventListener('click', handleLeaveRoom);
  document.getElementById('backToLobbyBtn').addEventListener('click', handleLeaveRoom);

  // ── Init: restore saved display name ──
  (function init() {
    var saved = Auth.getDisplayName();
    if (saved) document.getElementById('displayName').value = saved;
  })();
}());
