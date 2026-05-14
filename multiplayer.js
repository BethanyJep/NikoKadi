/**
 * Multiplayer state synchronisation module.
 * Pushes game state to Supabase and subscribes to changes from other players.
 */
var Multiplayer = (function () {
  var channel = null;

  async function saveGameState(roomId, state, userId) {
    var result = await supabase
      .from('game_state')
      .upsert({
        room_id: roomId,
        state: state,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        version: (state._version || 0) + 1
      });
    if (result.error) throw result.error;
  }

  async function loadGameState(roomId) {
    var result = await supabase
      .from('game_state')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle();
    if (result.error) return null;
    return result.data ? result.data.state : null;
  }

  function subscribeToGameState(roomId, onStateChange) {
    channel = supabase
      .channel('game-' + roomId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_state',
        filter: 'room_id=eq.' + roomId
      }, function (payload) {
        if (payload.new && payload.new.state) {
          onStateChange(payload.new.state, payload.new.updated_by);
        }
      })
      .subscribe();
    return channel;
  }

  function unsubscribe() {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  }

  return {
    saveGameState: saveGameState,
    loadGameState: loadGameState,
    subscribeToGameState: subscribeToGameState,
    unsubscribe: unsubscribe
  };
})();
