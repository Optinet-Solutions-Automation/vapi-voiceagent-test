import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const SUPABASE_URL = "https://mfnebrospbqhbrxfexie.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0CSebHk0k2ToTg7-F4KeDA_ZjRpz7q5";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
