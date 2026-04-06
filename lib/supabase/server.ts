import { createClient } from '@supabase/supabase-js'

// Server-side Supabase instance (service role key — bypasses RLS)
// NEVER import this in client components
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
