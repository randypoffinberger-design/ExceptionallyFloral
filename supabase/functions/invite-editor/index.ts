import {makeHandler} from './handler.js';
Deno.serve(makeHandler({url:Deno.env.get('SUPABASE_URL'),key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
