// Server-only client for the voizo-sandbox Supabase project (campaigns DB).
// Never import this file from a client component — the service-role key it
// uses bypasses RLS and must never be shipped to the browser.
import { createClient } from "@supabase/supabase-js";

const url = process.env.CAMPAIGNS_SUPABASE_URL;
const serviceKey = process.env.CAMPAIGNS_SUPABASE_SERVICE_KEY;

export function getCampaignsSupabase() {
  if (!url || !serviceKey) {
    throw new Error(
      "CAMPAIGNS_SUPABASE_URL or CAMPAIGNS_SUPABASE_SERVICE_KEY not set. Add them to .env.local."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const campaignsConfigured = Boolean(url && serviceKey);
