import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/);

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function testProfiles() {
  const { data: profs, error } = await supabase.from("profiles").select("*");
  console.log("Profiles count:", profs?.length, "Error:", error?.message);
  if (profs && profs.length > 0) {
    console.log("Profiles sample:", profs.slice(0, 3));
  }
}

testProfiles().catch(console.error);
