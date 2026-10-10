/* fló checkout worker (Cloudflare Workers)
 *
 *   POST /checkout  bag items -> Stripe Checkout Session -> { url }
 *   POST /webhook   Stripe "checkout.session.completed" -> Printful order
 *
 * Prices always come from the published products.json, never from the browser,
 * so nobody can edit the bag in devtools and pay $1 for a hoodie.
 */

const STRIPE = "https://api.stripe.com/v1";
const PRINTFUL = "https://api.printful.com";
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (request.method === "POST" && url.pathname === "/checkout") return await checkout(request, env, cors);
      if (request.method === "POST" && url.pathname === "/webhook") return await webhook(request, env);
      return json({ ok: true, service: "flo-checkout" }, 200, cors);
    } catch (err) {
      console.error(err);
      return json({ error: "Server error" }, 500, cors);
    }
  }
};

/* ---------- Checkout ---------- */

async function checkout(request, env, cors) {
  const { items } = await request.json();
  if (!Array.isArray(items) || !items.length || items.length > 30) {
    return json({ error: "Your bag is empty." }, 400, cors);
  }

  const catalog = await (await fetch(env.CATALOG_URL, { cf: { cacheTtl: 60 } })).json();
  const lines = [];
  for (const { sku, qty } of items) {
    const line = resolveSku(catalog, sku);
    const q = Number(qty);
    if (!line || !Number.isInteger(q) || q < 1 || q > 20) {
      return json({ error: "An item in your bag is no longer available." }, 400, cors);
    }
    lines.push({ ...line, qty: q });
  }

  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const { flatRate, freeOver } = catalog.shipping;
  const shipping = subtotal >= freeOver ? 0 : flatRate;
  const currency = catalog.currency || "usd";

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${env.SITE_URL}/shop.html`);
  form.set("phone_number_collection[enabled]", "true");
  form.set("billing_address_collection", "auto");
  (env.SHIP_COUNTRIES || "US").split(",").forEach((c, i) =>
    form.set(`shipping_address_collection[allowed_countries][${i}]`, c.trim()));

  form.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  form.set("shipping_options[0][shipping_rate_data][display_name]", shipping ? "Standard shipping" : "Free shipping");
  form.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(shipping * 100));
  form.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", currency);

  lines.forEach((l, i) => {
    const p = `line_items[${i}]`;
    form.set(`${p}[quantity]`, String(l.qty));
    form.set(`${p}[price_data][currency]`, currency);
    form.set(`${p}[price_data][unit_amount]`, String(Math.round(l.product.price * 100)));
    form.set(`${p}[price_data][product_data][name]`, `${l.product.name} — ${l.color.name} / ${l.size}`);
    form.set(`${p}[price_data][product_data][metadata][sku]`, l.sku);
  });

  const res = await stripe(env, "/checkout/sessions", { method: "POST", body: form });
  if (!res.url) return json({ error: "Could not start checkout." }, 502, cors);
  return json({ url: res.url }, 200, cors);
}

function resolveSku(catalog, sku) {
  if (typeof sku !== "string") return null;
  const [id, colorSlug, sizeSlug] = sku.split("_");
  const product = catalog.products.find(p => p.id === id);
  if (!product) return null;
  const color = product.colors.find(c => slug(c.name) === colorSlug);
  const size = product.sizes.find(s => slug(s) === sizeSlug);
  if (!color || !size) return null;
  return { sku, product, color, size };
}

/* ---------- Webhook -> Printful ---------- */

async function webhook(request, env) {
  const body = await request.text();
  const ok = await verifyStripeSignature(body, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response("Bad signature", { status: 400 });

  const event = JSON.parse(body);
  if (event.type !== "checkout.session.completed") return new Response("ignored");

  const session = event.data.object;
  if (session.payment_status !== "paid") return new Response("not paid");

  const items = await stripe(env,
    `/checkout/sessions/${session.id}/line_items?limit=100&expand[]=data.price.product`, { method: "GET" });

  const ship = (session.collected_information && session.collected_information.shipping_details) || session.shipping_details;
  const cust = session.customer_details || {};
  const addr = ship.address;

  const variantMap = env.PRINTFUL_VARIANTS ? JSON.parse(env.PRINTFUL_VARIANTS) : {};
  const order = {
    // Printful rejects a repeated external_id, which makes Stripe's retries safe
    external_id: String(session.payment_intent || session.id).slice(-32),
    shipping: "STANDARD",
    recipient: {
      name: ship.name || cust.name,
      address1: addr.line1,
      address2: addr.line2 || undefined,
      city: addr.city,
      state_code: addr.state || undefined,
      country_code: addr.country,
      zip: addr.postal_code,
      email: cust.email,
      phone: cust.phone || undefined
    },
    items: items.data.map(li => {
      const sku = li.price.product.metadata.sku;
      return variantMap[sku]
        ? { sync_variant_id: variantMap[sku], quantity: li.quantity }
        : { external_variant_id: sku, quantity: li.quantity };
    })
  };

  const confirm = env.PRINTFUL_AUTO_CONFIRM === "true";
  const headers = { Authorization: `Bearer ${env.PRINTFUL_TOKEN}`, "Content-Type": "application/json" };
  if (env.PRINTFUL_STORE_ID) headers["X-PF-Store-Id"] = env.PRINTFUL_STORE_ID;

  const pf = await fetch(`${PRINTFUL}/orders?confirm=${confirm}`, {
    method: "POST", headers, body: JSON.stringify(order)
  });
  const pfBody = await pf.text();
  if (!pf.ok && !/already exists/i.test(pfBody)) {
    console.error("Printful order failed", pf.status, pfBody);
    return new Response("Printful error", { status: 500 }); // Stripe will retry
  }
  return new Response("ok");
}

/* ---------- Helpers ---------- */

async function stripe(env, path, init) {
  const res = await fetch(STRIPE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${JSON.stringify(data.error)}`);
  return data;
}

async function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(kv => kv.split("=")));
  const t = parts.t;
  const sigs = header.split(",").filter(kv => kv.startsWith("v1=")).map(kv => kv.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  return sigs.some(s => timingSafeEqual(s, expected));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...headers, "Content-Type": "application/json" }
  });
}
