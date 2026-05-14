/**
 * Supabase configuration.
 * Replace the placeholder values with your Supabase project credentials.
 * The anon key is safe to commit — RLS policies secure data access.
 */
var SUPABASE_URL = 'https://yntivqvehkhjrigiuylx.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InludGl2cXZlaGtoanJpZ2l1eWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjQyMjgsImV4cCI6MjA5NDM0MDIyOH0.w1tttrZT4fQ14XcWYN8XkR-a7m4MwhDAOUwfzWXWE_s';

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
