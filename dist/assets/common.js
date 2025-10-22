// --- Config & helpers ---
const cfg = () => window.__CONFIG__ || {};
const apiBase = () => (cfg().API_BASE_URL || '').replace(/\/$/, '');
const fmtQ = n => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 }).format(n || 0);
const qs = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];

// Base relativa para GitHub Pages (si estás dentro de /dist/auth/ sube un nivel)
const BASE = (() => /\/auth\//.test(window.location.pathname) ? '../' : './')();
window.__BASE__ = BASE;

async function fetchJSON(path, opts={}) {
  const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    ...opts
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// --- Supabase Auth ---
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
  location.href = `${BASE}index.html`;
}

// --- Header / Footer ---
async function renderChrome() {
  const header = `
  <div class="topbar">
    <div class="container">
      <div class="tb-left">
        <a href="${BASE}index.html" class="logo">La Bodegona Demo</a>
        <a href="${BASE}categoria.html?slug=ofertas" class="link">Ofertas</a>
        <a href="${BASE}buscar.html" class="link">Lo + nuevo</a>
        <a href="#" class="link">Envíos</a>
        <a href="#" class="link">Ayuda</a>
      </div>
      <div class="tb-right">
        <form class="search" action="${BASE}buscar.html">
          <input name="q" type="search" placeholder="Buscar productos" />
          <button type="submit">Buscar</button>
        </form>
        <a href="${BASE}cart.html" class="cart">Carrito (<span id="cart-count">0</span>)</a>
        <div class="account" id="account-slot">
          <a href="${BASE}auth/login.html">Iniciar sesión</a>
          <span class="sep">|</span>
          <a href="${BASE}auth/register.html">Registrarse</a>
        </div>
      </div>
    </div>
    <nav class="mega">
      <a href="${BASE}categoria.html?slug=celulares">Celulares</a>
      <a href="${BASE}categoria.html?slug=laptops">Laptops</a>
      <a href="${BASE}categoria.html?slug=audio">Audio</a>
      <a href="${BASE}categoria.html?slug=gaming">Gaming</a>
      <a href="${BASE}categoria.html?slug=hogar">Hogar</a>
      <a href="${BASE}categoria.html?slug=herramientas">Herramientas</a>
      <a href="${BASE}categoria.html?slug=libros">Libros</a>
      <a href="${BASE}categoria.html?slug=mascotas">Mascotas</a>
      <a href="${BASE}categoria.html?slug=oficina">Oficina</a>
      <a href="${BASE}categoria.html?slug=tv-video">TV & Video</a>
      <a href="${BASE}categoria.html?slug=accesorios">Accesorios</a>
      <a href="${BASE}categoria.html?slug=deportes">Deportes</a>
    </nav>
  </div>`;

  const footer = `
  <div class="footer">
    <div class="container grid">
      <div>
        <h4>Atención</h4>
        <a href="#">Cómo comprar</a>
        <a href="#">Envíos y entregas</a>
        <a href="#">Cambios y devoluciones</a>
      </div>
      <div>
        <h4>Legal</h4>
        <a href="#">Privacidad</a>
        <a href="#">Términos y condiciones</a>
        <a href="#">Garantías</a>
      </div>
      <div>
        <h4>Contacto</h4>
        <p>WhatsApp: +502 5555-5555</p>
        <p>Soporte: soporte@demo.gt</p>
      </div>
    </div>
    <div class="copy">© ${new Date().getFullYear()} La Bodegona Demo</div>
  </div>`;

  const h = qs('#site-header');
  const f = qs('#site-footer');
  if (h) h.innerHTML = header;
  if (f) f.innerHTML = footer;

  // Sesión
  const slot = qs('#account-slot');
  const session = await getSession();
  if (slot && session?.user) {
    slot.innerHTML = `<span class="hi">Hola, ${(session.user.email||'Usuario')}</span> <span class="sep">|</span> <a href="${BASE}account/index.html">Mi cuenta</a> <span class="sep">|</span> <button id="btn-logout" class="linklike">Cerrar sesión</button>`;
    qs('#btn-logout')?.addEventListener('click', signOut);
  }

  // Contador carrito
  const count = (JSON.parse(localStorage.getItem('cart')||'[]')).reduce((a,i)=>a+i.qty,0);
  const cc = qs('#cart-count');
  if (cc) cc.textContent = count;
}

// --- Carrito ---
function cartRead(){ return JSON.parse(localStorage.getItem('cart')||'[]'); }
function cartWrite(items){ localStorage.setItem('cart', JSON.stringify(items)); renderChrome(); }
function cartAdd(item){
  const cart = cartRead();
  const i = cart.findIndex(x=>x.id===item.id);
  if (i>=0) cart[i].qty += item.qty||1; else cart.push({...item, qty:item.qty||1});
  cartWrite(cart);
}
function cartRemove(id){ cartWrite(cartRead().filter(i=>i.id!==id)); }
function cartTotal(){ return cartRead().reduce((s,i)=>s + (i.price*(i.qty||1)), 0); }

// --- Card de producto ---
function productCard(p){
  const discount = p.discount_percent ? `<span class="badge off">-${p.discount_percent}%</span>` : '';
  const shipping = p.free_shipping ? `<span class="badge ship">Envío GRATIS</span>` : '';
  const img = (p.images?.[0]?.url) || `${BASE}assets/placeholder.webp`;
  return `
  <article class="card">
    <a class="imgwrap" href="${BASE}producto.html?id=${p.id}"><img src="${img}" alt="${p.name}"></a>
    <div class="info">
      <a class="title" href="${BASE}producto.html?id=${p.id}">${p.name}</a>
      <div class="price">${fmtQ(p.price)} ${p.old_price?`<s>${fmtQ(p.old_price)}</s>`:''}</div>
      <div class="badges">${discount} ${shipping}</div>
      <button class="btn" data-add='${JSON.stringify({id:p.id,name:p.name,price:p.price,thumb:img})}'>Agregar</button>
    </div>
  </article>`;
}

// --- Estilos base ---
const baseStyles = `
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu}
  a{color:inherit;text-decoration:none}
  .container{max-width:1200px;margin:0 auto;padding:0 16px}
  .topbar{background:#111;color:#fff} .topbar .link{opacity:.9;margin:0 8px}
  .topbar .logo{font-weight:700;margin-right:16px}
  .topbar .container{display:flex;align-items:center;justify-content:space-between;padding:10px 0}
  .tb-right{display:flex;align-items:center;gap:12px}
  .search{display:flex;gap:6px} .search input{padding:8px 10px;border-radius:6px;border:1px solid #ddd;min-width:300px}
  .search button{padding:8px 12px;border:0;border-radius:6px;background:#ffd400;font-weight:700;cursor:pointer}
  .cart{font-weight:600}
  .mega{display:flex;gap:14px;flex-wrap:wrap;padding:10px 16px;background:#1c1c1c}
  .mega a{color:#eee;opacity:.95}
  .hero{position:relative;overflow:hidden}
  .hero .banner{width:100%;height:260px;background:#eee;border-radius:12px;display:grid;place-items:center;font-size:28px;font-weight:700}
  .section{padding:22px 0}
  .section h2{margin:0 0 12px}
  .grid{display:grid;gap:16px}
  .grid.cards{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
  .card{border:1px solid #eee;border-radius:12px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
  .imgwrap{display:block;background:#fafafa;aspect-ratio:1/1;overflow:hidden}
  .imgwrap img{width:100%;height:100%;object-fit:cover}
  .info{padding:10px}
  .title{display:block;min-height:44px;font-size:14px;margin-bottom:6px}
  .price{font-size:16px;font-weight:700} .price s{font-weight:400;color:#888;margin-left:6px}
  .badge{display:inline-block;padding:2px 6px;border-radius:6px;font-size:11px;margin-right:6px;background:#f2f2f2}
  .badge.off{background:#ffe3e3} .badge.ship{background:#e1ffe6}
  .btn{width:100%;padding:8px 10px;border:0;border-radius:8px;background:#111;color:#fff;margin-top:8px;cursor:pointer}
  .footer{background:#111;color:#ddd;margin-top:30px;padding:28px 0}
  .footer .grid{grid-template-columns:repeat(3,1fr)}
  .footer h4{margin:0 0 10px}
  .copy{text-align:center;color:#aaa;padding-top:12px;border-top:1px solid #222;margin-top:22px}
  .linklike{background:none;border:0;color:#ffd400;cursor:pointer}
`;

function injectBaseStyles(){
  const s = document.createElement('style');
  s.innerHTML = baseStyles;
  document.head.appendChild(s);
}

// --- Boot ---
window.addEventListener('DOMContentLoaded', async ()=>{
  injectBaseStyles();
  initSupabase();
  await renderChrome();
  // Agregar al carrito (delegado)
  document.body.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-add]');
    if (btn){ cartAdd(JSON.parse(btn.getAttribute('data-add'))); }
  });
});
