/**
 * Anonymous authentication module.
 * Manages Supabase anonymous sessions and display names.
 */
var Auth = (function () {
  var DISPLAY_NAME_KEY = 'niko_display_name';

  async function signIn() {
    var result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
    return result.data.user;
  }

  async function getSession() {
    var result = await supabase.auth.getSession();
    return result.data.session;
  }

  async function getCurrentUser() {
    var result = await supabase.auth.getUser();
    return result.data.user;
  }

  function getDisplayName() {
    return localStorage.getItem(DISPLAY_NAME_KEY) || '';
  }

  function setDisplayName(name) {
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  }

  async function ensureAuth() {
    var session = await getSession();
    if (!session) {
      await signIn();
    }
    return getCurrentUser();
  }

  return {
    signIn: signIn,
    getSession: getSession,
    getCurrentUser: getCurrentUser,
    getDisplayName: getDisplayName,
    setDisplayName: setDisplayName,
    ensureAuth: ensureAuth
  };
})();
