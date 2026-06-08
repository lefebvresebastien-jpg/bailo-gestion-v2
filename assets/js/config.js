// ============================================================
// BAILO GESTION v2 — Config & Supabase Init
// ============================================================

const SUPABASE_URL = 'https://nltuysmnxsomlhgvbtwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sdHV5c21ueHNvbWxoZ3ZidHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDAyOTUsImV4cCI6MjA5MjI3NjI5NX0.ekmk4ujs0H1UfuDopnd_RNop1obgZgRM3ilj0yzqgM0';

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
