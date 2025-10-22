</script>


<!-- =========================================
PATH: /dist/assets/common.js
Desc: Utilidades compartidas (fetch, auth, header/footer, carrito)
========================================= -->
<script>
// --- Helpers ---
const cfg = () => window.__CONFIG__ || {};
const apiBase = () => (cfg().API_BASE_URL || '').replace(/\/$/, '');
const fmtQ = n => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 }).format(n || 0);
const qs = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];


async function fetchJSON(path, opts={}) {
const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
const res = await fetch(url, {
headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
...opts
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
return await res.json();
}


// --- Supabase Auth (opcional pero visible) ---
let supabaseClient = null;
function initSupabase() {
const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
}
async function getSession() {
try {
if (!supabaseClient) return null;
const { data } = await supabaseClient.auth.getSession();
return data?.session || null;
} catch { return null; }
}
async function signOut() {
if (supabaseClient) await supabaseClient.auth.signOut();
localStorage.removeItem('cart');
location.href = '/dist/index.html';
}
