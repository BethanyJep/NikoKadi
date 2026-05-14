/**
 * Room management module.
 * Handles room creation, joining, player tracking, and realtime subscriptions.
 */
var Lobby = (function () {
  var ROOM_KEY = 'niko_room_code';

  function generateRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function saveRoomCode(code) {
    localStorage.setItem(ROOM_KEY, code);
  }

  function getSavedRoomCode() {
    return localStorage.getItem(ROOM_KEY) || '';
  }

  function clearSavedRoom() {
    localStorage.removeItem(ROOM_KEY);
  }

  async function createRoom(userId, displayName) {
    var code = generateRoomCode();

    var roomResult = await supabase
      .from('rooms')
      .insert({ code: code, host_id: userId, status: 'waiting' })
      .select()
      .single();
    if (roomResult.error) throw roomResult.error;

    var room = roomResult.data;

    var playerResult = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        user_id: userId,
        display_name: displayName,
        is_host: true
      });
    if (playerResult.error) throw playerResult.error;

    saveRoomCode(code);
    return room;
  }

  async function joinRoom(code, userId, displayName) {
    var roomResult = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .in('status', ['waiting', 'playing'])
      .single();
    if (roomResult.error) throw new Error('Room not found or game already finished.');

    var room = roomResult.data;

    // Check if already joined
    var existResult = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (existResult.data) {
      saveRoomCode(code);
      return room;
    }

    if (room.status === 'playing') {
      throw new Error('Game already in progress. Cannot join.');
    }

    // Check capacity
    var countResult = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', room.id);
    if (countResult.data && countResult.data.length >= room.max_players) {
      throw new Error('Room is full (' + room.max_players + ' players max).');
    }

    var joinResult = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        user_id: userId,
        display_name: displayName,
        is_host: false
      });
    if (joinResult.error) throw joinResult.error;

    saveRoomCode(code);
    return room;
  }

  async function getRoomPlayers(roomId) {
    var result = await supabase
      .from('room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at');
    if (result.error) throw result.error;
    return result.data;
  }

  async function getRoomByCode(code) {
    var result = await supabase
      .from('rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle();
    return result.data;
  }

  async function leaveRoom(roomId, userId) {
    await supabase
      .from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);
    clearSavedRoom();
  }

  function subscribeToRoom(roomId, onPlayersChange, onRoomChange) {
    return supabase
      .channel('room-' + roomId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_players',
        filter: 'room_id=eq.' + roomId
      }, function () { onPlayersChange(); })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: 'id=eq.' + roomId
      }, function (payload) { onRoomChange(payload.new); })
      .subscribe();
  }

  async function startGame(roomId) {
    var result = await supabase
      .from('rooms')
      .update({ status: 'playing' })
      .eq('id', roomId);
    if (result.error) throw result.error;
  }

  async function finishGame(roomId) {
    var result = await supabase
      .from('rooms')
      .update({ status: 'finished' })
      .eq('id', roomId);
    if (result.error) throw result.error;
    clearSavedRoom();
  }

  return {
    createRoom: createRoom,
    joinRoom: joinRoom,
    getRoomPlayers: getRoomPlayers,
    getRoomByCode: getRoomByCode,
    leaveRoom: leaveRoom,
    subscribeToRoom: subscribeToRoom,
    startGame: startGame,
    finishGame: finishGame,
    saveRoomCode: saveRoomCode,
    getSavedRoomCode: getSavedRoomCode,
    clearSavedRoom: clearSavedRoom
  };
})();
