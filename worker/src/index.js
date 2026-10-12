/* flò checkout worker (Cloudflare Workers)
 *
 *   POST /checkout   bag items -> Stripe Checkout Session -> { url }
 *   POST /webhook    Stripe "checkout.session.completed" -> Printify order
 *   POST /subscribe  email sign-up (saved in the SUBSCRIBERS KV namespace and added to the Brevo email list
 *                    for promotions) -> a personal one-time code for WELCOME_PERCENT off a first order,
 *                    created in Stripe
 *   POST /rewards    looks up a shopper's loyalty points and any unredeemed reward code, by email
 *   POST /chat       answers shopper questions with Gemini, grounded only in FLO_FACTS below
 *
 * Prices always come from the published products.json, never from the browser,
 * so nobody can edit the bag in devtools and pay $1 for a hoodie.
 */

const STRIPE = "https://api.stripe.com/v1";
import VARIANTS from "../printify-variants.json";

const PRINTIFY = "https://api.printify.com/v1";
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (request.method === "POST" && url.pathname === "/checkout") return await checkout(request, env, cors);
      if (request.method === "POST" && url.pathname === "/webhook") return await webhook(request, env);
      if (request.method === "POST" && url.pathname === "/subscribe") return await subscribe(request, env, cors);
      if (request.method === "POST" && url.pathname === "/rewards") return await rewards(request, env, cors);
      if (request.method === "POST" && url.pathname === "/contact") return await contact(request, env, cors);
      if (request.method === "POST" && url.pathname === "/chat") return await chat(request, env, cors);
      return json({ ok: true, service: "flo-checkout" }, 200, cors);
    } catch (err) {
      console.error(err);
      return json({ error: "Server error" }, 500, cors);
    }
  }
};

/* ---------- Checkout ---------- */

async function checkout(request, env, cors) {
  const { items, email } = await request.json();
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

  // in whole cents, so prices like $44.99 add up exactly (the free-shipping check depends on it)
  const subtotalCents = lines.reduce((s, l) => s + Math.round(unitPrice(l) * 100) * l.qty, 0);
  // Standard shipping only, matching shipping_method 1 in the Printify order below
  const { flatRate, freeOver } = catalog.shipping;
  const shipping = subtotalCents >= Math.round(freeOver * 100) ? 0 : flatRate;
  const currency = catalog.currency || "usd";

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${env.SITE_URL}/checkout.html`);
  form.set("allow_promotion_codes", "true"); // create codes under Stripe → Product catalogue → Coupons
  // a Stripe customer and an invoice for every order, so customers can sign in to Stripe's customer portal
  // (the "My orders" link) and see past orders and receipts
  form.set("customer_creation", "always");
  form.set("invoice_creation[enabled]", "true");
  if (typeof email === "string" && /^[^@\s]+@[^@\s]+$/.test(email)) form.set("customer_email", email);
  form.set("phone_number_collection[enabled]", "true");
  form.set("billing_address_collection", "auto");
  (env.SHIP_COUNTRIES || "US").split(",").forEach((c, i) =>
    form.set(`shipping_address_collection[allowed_countries][${i}]`, c.trim()));

  form.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  form.set("shipping_options[0][shipping_rate_data][display_name]", shipping ? "Standard shipping" : "Free shipping");
  form.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(Math.round(shipping * 100)));
  form.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", currency);

  lines.forEach((l, i) => {
    const p = `line_items[${i}]`;
    form.set(`${p}[quantity]`, String(l.qty));
    form.set(`${p}[price_data][currency]`, currency);
    form.set(`${p}[price_data][unit_amount]`, String(Math.round(unitPrice(l) * 100)));
    form.set(`${p}[price_data][product_data][name]`, `${l.product.name}, ${l.color.name} / ${l.size}`);
    form.set(`${p}[price_data][product_data][metadata][sku]`, l.sku);
  });

  const res = await stripe(env, "/checkout/sessions", { method: "POST", body: form });
  if (!res.url) return json({ error: "Could not start checkout." }, 502, cors);
  return json({ url: res.url }, 200, cors);
}

// "sizePrices": { "2XL": 60 } in products.json overrides the price for that size
const unitPrice = l => (l.product.sizePrices && l.size in l.product.sizePrices ? l.product.sizePrices[l.size] : l.product.price);

function resolveSku(catalog, sku) {
  if (typeof sku !== "string") return null;
  const [id, colorSlug, sizeSlug] = sku.split("_");
  const product = catalog.products.find(p => p.id === id);
  if (!product || product.hidden || product.flag) return null; // hidden and concept pieces can't be bought
  const color = product.colors.find(c => slug(c.name) === colorSlug);
  const size = (color && color.sizes || product.sizes).find(s => slug(s) === sizeSlug);
  if (!color || !size) return null;
  return { sku, product, color, size };
}

/* ---------- Webhook -> Printify ---------- */

async function webhook(request, env) {
  const body = await request.text();
  const ok = await verifyStripeSignature(body, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response("Bad signature", { status: 400 });

  const event = JSON.parse(body);
  if (event.type !== "checkout.session.completed") return new Response("ignored");

  const session = event.data.object;
  if (session.payment_status !== "paid") return new Response("not paid");

  // Stripe retries webhooks, so remember the Printify order on the payment and skip repeats
  const payment = session.payment_intent ? await stripe(env, `/payment_intents/${session.payment_intent}`, { method: "GET" }) : null;
  if (payment && payment.metadata && payment.metadata.printify_order) return new Response("already sent");

  const items = await stripe(env,
    `/checkout/sessions/${session.id}/line_items?limit=100&expand[]=data.price.product`, { method: "GET" });

  const ship = (session.collected_information && session.collected_information.shipping_details) || session.shipping_details;
  const cust = session.customer_details || {};
  const addr = ship.address;
  const [first, ...rest] = (ship.name || cust.name || "").trim().split(/\s+/);

  // Each site SKU (productid_colour_size) must match a variant's SKU in Printify, or be listed in
  // the PRINTIFY_VARIANTS secret as { "sku": { "product_id": "...", "variant_id": 12345 } }
  // printify-variants.json is generated by flo-designs/link_printify.py; the secret can override entries
  const variantMap = { ...VARIANTS, ...(env.PRINTIFY_VARIANTS ? JSON.parse(env.PRINTIFY_VARIANTS) : {}) };
  const order = {
    external_id: String(session.payment_intent || session.id),
    label: `Stripe ${session.id.slice(-8)}`,
    shipping_method: 1, // standard
    send_shipping_notification: true,
    address_to: {
      first_name: first || "Customer",
      last_name: rest.join(" ") || ".",
      email: cust.email,
      phone: cust.phone || undefined,
      country: addr.country,
      region: addr.state || "",
      address1: addr.line1,
      address2: addr.line2 || "",
      city: addr.city,
      zip: addr.postal_code
    },
    line_items: items.data.map(li => {
      const sku = li.price.product.metadata.sku;
      const mapped = variantMap[sku];
      return mapped
        ? { product_id: mapped.product_id, variant_id: Number(mapped.variant_id), quantity: li.quantity }
        : { sku, quantity: li.quantity };
    })
  };

  const headers = { Authorization: `Bearer ${env.PRINTIFY_TOKEN}`, "Content-Type": "application/json", "User-Agent": "flo-checkout" };
  const shop = env.PRINTIFY_SHOP_ID;
  const res = await fetch(`${PRINTIFY}/shops/${shop}/orders.json`, { method: "POST", headers, body: JSON.stringify(order) });
  const created = await res.json().catch(() => ({}));
  if (!res.ok || !created.id) {
    console.error("Printify order failed", res.status, JSON.stringify(created));
    return new Response("Printify error", { status: 500 }); // Stripe will retry
  }

  if (payment) {
    const form = new URLSearchParams({ "metadata[printify_order]": created.id });
    await stripe(env, `/payment_intents/${payment.id}`, { method: "POST", body: form });
  }

  // 1 point per dollar actually paid for goods (amount_total is post-discount, and excludes shipping,
  // which is billed separately from line_items in Stripe Checkout)
  const dollars = Math.floor(items.data.reduce((s, li) => s + li.amount_total, 0) / 100);
  if (cust.email) await awardPoints(env, cust.email, dollars);

  // Printify holds new orders until they're sent to production. Leave that to a person while testing.
  if (env.PRINTIFY_AUTO_SEND === "true") {
    const send = await fetch(`${PRINTIFY}/shops/${shop}/orders/${created.id}/send_to_production.json`, { method: "POST", headers });
    if (!send.ok) console.error("Printify send to production failed", send.status, await send.text());
  }
  return new Response("ok");
}

/* ---------- Email sign-up ---------- */

async function subscribe(request, env, cors) {
  const { email } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return json({ error: "Please enter a valid email address." }, 400, cors);
  }
  const key = email.trim().toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  let saved = null;
  if (env.SUBSCRIBERS) {
    const raw = await env.SUBSCRIBERS.get(key);
    try { saved = raw ? JSON.parse(raw) : null; } catch { saved = { joined: raw }; }   // early sign-ups stored just a date
  }
  // one welcome code per email: signing up again shows the same code
  if (saved?.code && saved.expires > now) return json({ ok: true, code: saved.code, percent: saved.percent, expires: saved.expires }, 200, cors);
  if (!env.STRIPE_SECRET_KEY) {
    // no Stripe yet: still build the email list (no welcome code until Stripe is connected)
    if (!env.SUBSCRIBERS && !env.BREVO_API_KEY) return json({ error: "Sign-ups aren't open yet." }, 503, cors);
    if (env.SUBSCRIBERS) await env.SUBSCRIBERS.put(key, JSON.stringify({ joined: saved?.joined || new Date().toISOString() }));
    await addToEmailList(env, key, null);
    return json({ ok: true }, 200, cors);
  }
  const percent = Number(env.WELCOME_PERCENT || 20);
  const expires = now + Number(env.WELCOME_DAYS || 60) * 86400;
  const code = `WELCOME-${randomCode(6)}`;
  // single use, and Stripe only accepts it from a customer with no earlier purchase
  await stripe(env, "/promotion_codes", { method: "POST", body: new URLSearchParams({
    coupon: await welcomeCoupon(env, percent), code, max_redemptions: "1", "restrictions[first_time_transaction]": "true",
    expires_at: String(expires), "metadata[email]": key
  }) });
  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(key, JSON.stringify({ joined: saved?.joined || new Date().toISOString(), code, percent, expires }));
  }
  await addToEmailList(env, key, { code, percent, expires });
  return json({ ok: true, code, percent, expires }, 200, cors);
}

/* ---------- Contact form ---------- */

// Emails a message straight to the inbox via Brevo, so visitors never have to have a mail app
// configured. `company` is a honeypot: left blank by people, often filled in by bots.
async function contact(request, env, cors) {
  const { email, subject, message, company } = await request.json().catch(() => ({}));
  if (company) return json({ ok: true }, 200, cors);
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return json({ error: "Please enter a valid email address." }, 400, cors);
  }
  if (typeof message !== "string" || !message.trim() || message.length > 5000) {
    return json({ error: "Please enter a message." }, 400, cors);
  }
  if (typeof subject !== "string" || !subject.trim() || subject.length > 200) {
    return json({ error: "Please enter a subject." }, 400, cors);
  }
  if (!env.BREVO_API_KEY) return json({ error: "The contact form isn't set up yet." }, 503, cors);

  const subj = subject.trim();
  const inbox = env.CONTACT_EMAIL || "hello@floshops.com";
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: inbox, name: "flò contact form" },
      to: [{ email: inbox }],
      replyTo: { email },
      subject: `Contact form: ${subj}`,
      textContent: `From: ${email}\nSubject: ${subj}\n\n${message.trim()}`
    })
  });
  if (!res.ok) {
    console.error("Brevo contact", res.status, await res.text());
    return json({ error: "Something went wrong. Please try again." }, 502, cors);
  }
  return json({ ok: true }, 200, cors);
}

/* ---------- AI chat ---------- */

// Everything the chat is allowed to know. Keep this in sync with about.html's FAQ by hand -
// it's duplicated on purpose so a bad fetch or a parsing slip can never feed the model garbage.
const FLO_FACTS = `
You are the shopping assistant on flò's website (a small, made-to-order clothing brand).
Answer ONLY using the facts below. If something isn't covered here, say you're not sure and
suggest the contact page (contact.html) instead of guessing. Keep answers short (2-4 sentences),
friendly, and never invent prices, shipping times, or policies not listed here.

- Shipping: every piece is printed to order, ships within 3-7 business days, then a few more
  days in transit. Tracking is emailed the moment it ships. US only for now, no international.
- Fit: tops run slightly oversized. Take your usual size for the intended look, size down for a
  closer fit.
- Returns/exchanges: no change-of-mind returns, since nothing is made until it's ordered. If
  something arrives damaged, misprinted, or wrong, email within 30 days with a photo for a free
  replacement or full refund.
- Cancelling: email within 12 hours of ordering to cancel and refund before production starts.
- Welcome code: join the email list for 10% off a first order, good for 60 days.
- Launch code: DROP001 is 10% off everything during the Drop 001 launch window.
- Loyalty: 1 point per dollar spent on clothing (shipping doesn't count). At 100 points, a 10%
  off code is created automatically - check it on the account page.
- Codes can't be combined - one per order, whichever the customer prefers.
- Free shipping on orders over $75.
- Sign-in on the account page is a one-time email link, no password needed.
`.trim();

async function chat(request, env, cors) {
  const { message, history } = await request.json().catch(() => ({}));
  if (typeof message !== "string" || !message.trim() || message.length > 500) {
    return json({ error: "Please enter a message." }, 400, cors);
  }
  if (!env.GEMINI_API_KEY) return json({ error: "Chat isn't set up yet." }, 503, cors);

  // Keep only the last few turns, and only ever what this request's own caller sent - never
  // trust a client-supplied "history" to inject new instructions beyond plain chat turns.
  const turns = (Array.isArray(history) ? history.slice(-6) : [])
    .filter(h => h && typeof h.text === "string" && (h.role === "user" || h.role === "model"))
    .map(h => ({ role: h.role, parts: [{ text: h.text.slice(0, 500) }] }));
  turns.push({ role: "user", parts: [{ text: message.trim() }] });

  // The free tier can stall for a long time under load rather than failing fast, so every call
  // gets its own hard timeout - better a quick "try again" than a shopper staring at a spinner.
  const call = model => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: FLO_FACTS }] },
        contents: turns,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.4 }
      }),
      signal: AbortSignal.timeout(10000)
    }
  );

  // The newest flash model gets hit hardest by everyone, so a 503 "high demand" on it falls
  // through to lighter/older models with their own, less contested capacity, rather than
  // retrying the same busy one repeatedly.
  // Free tier quotas (as low as 20 requests/day on some models) are set per model, so a 429 on
  // one doesn't mean the next is exhausted too - fall through on that, a 503, or a 404 (a model
  // name this key can't use at all) rather than giving up on the whole chain.
  const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-flash-latest", "gemini-flash-lite-latest"];
  let res = null, data;
  for (const model of MODELS) {
    try {
      res = await call(model);
      if (res.status !== 503 && res.status !== 429 && res.status !== 404) break;
    } catch (err) {
      // A timeout or network error on this model: move on and try the next one instead of
      // failing the whole request over one bad attempt.
      console.error("Gemini", model, err.name === "TimeoutError" ? "timed out" : err.message);
      res = null;
    }
  }
  if (!res) {
    return json({ error: "Our assistant is a little busy right now. Try again in a moment, or use the contact page." }, 502, cors);
  }
  data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Gemini", res.status, JSON.stringify(data));
    return json({ error: "Our assistant is a little busy right now. Try again in a moment, or use the contact page." }, 502, cors);
  }
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) return json({ error: "Something went wrong. Please try again." }, 502, cors);
  return json({ reply }, 200, cors);
}

/* ---------- Loyalty points ---------- */

// Adds points for an order and, on crossing a LOYALTY_THRESHOLD multiple, mints a fresh reward code.
// Never throws: a points hiccup should never fail an order that already succeeded in Stripe and Printify.
async function awardPoints(env, email, dollars) {
  if (!env.SUBSCRIBERS || !dollars) return;
  try {
    const key = email.trim().toLowerCase();
    const raw = await env.SUBSCRIBERS.get(key);
    let saved = null;
    try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
    saved = saved || {};

    const threshold = Number(env.LOYALTY_THRESHOLD || 100);
    const percent = Number(env.LOYALTY_PERCENT || 15);
    const points = (saved.points || 0) + dollars;
    const earned = saved.rewardsEarned || 0;
    const nowEarned = Math.floor(points / threshold);

    let reward = saved.reward || null;
    if (nowEarned > earned) {
      const now = Math.floor(Date.now() / 1000);
      const expires = now + Number(env.LOYALTY_DAYS || 30) * 86400;
      const code = `LOYALTY-${randomCode(6)}`;
      await stripe(env, "/promotion_codes", { method: "POST", body: new URLSearchParams({
        coupon: await getOrCreateCoupon(env, `flo-loyalty-${percent}`, percent), code, max_redemptions: "1",
        expires_at: String(expires), "metadata[email]": key
      }) });
      reward = { code, percent, expires };
    }
    await env.SUBSCRIBERS.put(key, JSON.stringify({ ...saved, points, rewardsEarned: nowEarned, reward }));
  } catch (err) {
    console.error("Loyalty points", err);
  }
}

// Looks up a shopper's points and any unredeemed reward code by email (no password: same lightweight
// model as the welcome code). Doesn't reveal whether an email has ever ordered beyond its own points.
async function rewards(request, env, cors) {
  const { email } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400, cors);
  }
  if (!env.SUBSCRIBERS) return json({ error: "Rewards aren't set up yet." }, 503, cors);
  const threshold = Number(env.LOYALTY_THRESHOLD || 100);
  const now = Math.floor(Date.now() / 1000);
  const raw = await env.SUBSCRIBERS.get(email.trim().toLowerCase());
  let saved = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
  const points = saved?.points || 0;
  const reward = saved?.reward && saved.reward.expires > now ? saved.reward : null;
  return json({ points, threshold, toNextReward: threshold - (points % threshold), reward }, 200, cors);
}

// Add a sign-up to the Brevo list you send promotions from, with their welcome code as contact attributes
// (WELCOME_CODE, WELCOME_PERCENT, WELCOME_EXPIRES) so Brevo's welcome email can include it. Never blocks a sign-up.
async function addToEmailList(env, email, w) {
  if (!env.BREVO_API_KEY) return;
  const send = (attributes) => fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, updateEnabled: true, ...(env.BREVO_LIST_ID ? { listIds: [Number(env.BREVO_LIST_ID)] } : {}), ...(attributes ? { attributes } : {}) })
  });
  try {
    const attrs = w ? { WELCOME_CODE: w.code, WELCOME_PERCENT: w.percent, WELCOME_EXPIRES: new Date(w.expires * 1000).toISOString().slice(0, 10) } : null;
    let res = await send(attrs);
    if (res.status === 400 && attrs) res = await send(null);   // attributes not created in Brevo yet: add the contact anyway
    if (!res.ok) console.error("Brevo", res.status, await res.text());
  } catch (err) {
    console.error("Brevo", err);
  }
}

// The coupon behind every welcome code, made the first time it's needed
async function welcomeCoupon(env, percent) {
  return getOrCreateCoupon(env, `flo-welcome-${percent}`, percent, `Welcome ${percent}% off`);
}

// A reusable percent-off coupon, made the first time its id is needed (coupons are shared across
// every promotion code at that percentage; each promotion code is still its own single-use code)
async function getOrCreateCoupon(env, id, percent, name) {
  try {
    await stripe(env, `/coupons/${id}`, { method: "GET" });
  } catch {
    await stripe(env, "/coupons", { method: "POST", body: new URLSearchParams({ id, percent_off: String(percent), duration: "once", name: name || `${percent}% off` }) });
  }
  return id;
}

// WELCOME-7K2QXF: no 0/O or 1/I/L, so codes are easy to read and type
function randomCode(n) {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map(x => abc[x % abc.length]).join("");
}

/* ---------- Helpers ---------- */

async function stripe(env, path, init) {
  const res = await fetch(STRIPE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // pinned so Stripe changing its API can't break checkout or the welcome codes
      "Stripe-Version": env.STRIPE_API_VERSION || "2024-06-20"
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
