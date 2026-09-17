const URL='https://vevmmlvaowsvaiqwnvpa.supabase.co';
const KEY='sb_publishable_Dt8igAOI5ZJ4AexRZYzHng_wK_1epIn';
export const db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
