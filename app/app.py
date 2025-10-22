import os, json, uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
import psycopg2.extras as extras

DATABASE_URL = os.environ.get("DATABASE_URL")
ALLOW_ORIGINS = [o.strip() for o in os.environ.get("ALLOW_ORIGINS", "").split(",") if o.strip()]

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ALLOW_ORIGINS or "*"}})

def db():
    return psycopg2.connect(DATABASE_URL)

def row_to_category(r):
    return {"id": r["id"], "name": r["name"], "slug": r["slug"], "image": r["image"]}

def row_to_product(r):
    images = []
    if r.get("images_json"):
        try: images = json.loads(r["images_json"])
        except: images = []
    return {
        "id": r["id"], "name": r["name"], "price": float(r["price"]),
        "old_price": float(r["old_price"]) if r["old_price"] is not None else None,
        "discount_percent": r["discount_percent"], "free_shipping": r["free_shipping"],
        "short_description": r["short_description"], "description": r["description"],
        "images": images, "category": {"slug": r["category_slug"]} if r.get("category_slug") else None
    }

def ensure_orders_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
        create extension if not exists pgcrypto;
        create table if not exists public.orders (
          id uuid primary key default gen_random_uuid(),
          order_code text not null,
          customer jsonb not null,
          created_at timestamptz not null default now()
        );
        create table if not exists public.order_items (
          id uuid primary key default gen_random_uuid(),
          order_id uuid not null references public.orders(id) on delete cascade,
          product_id uuid not null,
          quantity int not null,
          price numeric(12,2) not null
        );
        """)
    conn.commit()

@app.get("/api/categories")
def list_categories():
    conn = db()
    try:
      with conn.cursor(cursor_factory=extras.RealDictCursor) as cur:
        cur.execute("select id,name,slug,image from public.categories order by name asc")
        rows = cur.fetchall()
        return jsonify([row_to_category(r) for r in rows])
    finally:
      conn.close()

@app.get("/api/products")
def list_products():
    q = request.args.get("search","").strip()
    category = request.args.get("category","").strip()
    sort = (request.args.get("sort","relevance") or "relevance").lower()
    min_p = request.args.get("min"); max_p = request.args.get("max")
    tag = (request.args.get("tag") or "").lower()
    try: limit = max(1, min(int(request.args.get("limit","24")), 100))
    except: limit = 24

    where, params = [], {}
    if q:
        where.append("(p.name ilike %(q)s or p.short_description ilike %(q)s or p.description ilike %(q)s)")
        params["q"] = f"%{q}%"
    if category:
        where.append("c.slug = %(cat)s"); params["cat"] = category
    if min_p:
        where.append("p.price >= %(minp)s"); params["minp"] = float(min_p)
    if max_p:
        where.append("p.price <= %(maxp)s"); params["maxp"] = float(max_p)
    if tag == "offer":
        where.append("p.discount_percent is not null")
    elif tag == "recommended":
        where.append("(p.free_shipping = true or p.discount_percent >= 10)")

    order_by = {"price_asc":"p.price asc","price_desc":"p.price desc","new":"p.created_at desc"}.get(sort,"p.created_at desc")
    where_sql = ("where " + " and ".join(where)) if where else ""

    sql = f"""
    select
      p.id, p.name, p.price, p.old_price, p.discount_percent, p.free_shipping,
      p.short_description, p.description,
      c.slug as category_slug,
      coalesce(
        json_agg(json_build_object('url', pi.url, 'sort_order', pi.sort_order)
                 order by pi.sort_order) filter (where pi.id is not null),
        '[]'::json
      ) as images_json
    from public.products p
    join public.categories c on c.id = p.category_id
    left join public.product_images pi on pi.product_id = p.id
    {where_sql}
    group by p.id, c.slug
    order by {order_by}
    limit %(lim)s
    """
    params["lim"] = limit

    conn = db()
    try:
      with conn.cursor(cursor_factory=extras.RealDictCursor) as cur:
        cur.execute(sql, params); rows = cur.fetchall()
        return jsonify({"items": [row_to_product(r) for r in rows]})
    finally:
      conn.close()

@app.get("/api/products/<uuid:pid>")
def product_detail(pid):
    conn = db()
    try:
      with conn.cursor(cursor_factory=extras.RealDictCursor) as cur:
        cur.execute("""
        select
          p.id, p.name, p.price, p.old_price, p.discount_percent, p.free_shipping,
          p.short_description, p.description, c.slug as category_slug,
          coalesce(
            json_agg(json_build_object('url', pi.url, 'sort_order', pi.sort_order)
                     order by pi.sort_order) filter (where pi.id is not null),
            '[]'::json
          ) as images_json
        from public.products p
        join public.categories c on c.id = p.category_id
        left join public.product_images pi on pi.product_id = p.id
        where p.id = %s
        group by p.id, c.slug
        """, (str(pid),))
        r = cur.fetchone()
        if not r: return jsonify({"error":"not_found"}), 404
        return jsonify(row_to_product(r))
    finally:
      conn.close()

@app.post("/api/orders/checkout")
def checkout():
    payload = request.get_json(silent=True) or {}
    customer = payload.get("customer") or {}
    items = payload.get("items") or []
    if not items or not customer.get("full_name") or not customer.get("email"):
        return jsonify({"error":"invalid_payload"}), 400
    order_code = f"ORD-{uuid.uuid4().hex[:8].upper()}"

    conn = db()
    try:
      ensure_orders_tables(conn)
      with conn.cursor() as cur:
        cur.execute("insert into public.orders (order_code, customer) values (%s,%s) returning id",
                    (order_code, json.dumps(customer)))
        order_id = cur.fetchone()[0]
        for it in items:
          cur.execute("insert into public.order_items (order_id, product_id, quantity, price) values (%s,%s,%s,%s)",
                      (order_id, it.get("product_id"), int(it.get("quantity",1)), float(it.get("price",0))))
      conn.commit()
    except Exception as e:
      conn.rollback()
      return jsonify({"error":"checkout_failed","detail":str(e)}), 500
    finally:
      conn.close()
    return jsonify({"order_id": order_code})

@app.get("/api/health")
def health(): return jsonify({"ok": True})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
