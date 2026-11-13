import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses row-level security. Server-side use only, and only after
// the caller's permissions have been checked in code (invites, login gating, reminders).
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
