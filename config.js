/**
 * Supabase configuration.
 * Replace the placeholder values with your Supabase project credentials.
 * The anon key is safe to commit — RLS policies secure data access.
 */
var SUPABASE_URL = 'https://yntivqvehkhjrigiuylx.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_K3KQJ0nVOHugNoxA0RE3Rw_JLlexD73';

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
