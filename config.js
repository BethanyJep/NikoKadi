/**
 * Supabase configuration.
 * Replace the placeholder values with your Supabase project credentials.
 * The anon key is safe to commit — RLS policies secure data access.
 */
var SUPABASE_URL = 'YOUR_SUPABASE_URL';
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
