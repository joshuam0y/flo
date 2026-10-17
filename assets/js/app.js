(function () {
  const BAG_KEY = "flo-bag";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  // every price and total with cents ($25.00, $44.99); sums are done in whole cents so they never drift
  const money = n => "$" + (Math.round(Number(n) * 100) / 100).toFixed(2);
  // Some products cost more in bigger sizes: "sizePrices": { "2XL": 60 } overrides "price" for that size
  const priceFor = (p, size) => (p.sizePrices && size in p.sizePrices ? p.sizePrices[size] : p.price);
  const fromPrice = p => (p.sizePrices ? `From ${money(Math.min(p.price, ...Object.values(p.sizePrices)))}` : money(p.price));
  const cents = n => Math.round(Number(n) * 100);
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const skuOf = (id, color, size) => `${id}_${slug(color)}_${slug(size)}`;

  let catalog = null;

  /* ---------- Store mode ---------- */
  const CFG = window.FLO_CONFIG || {};
  const prelaunch = CFG.mode !== "live";
  // The worker's base URL. Signups, rewards and contact all work off this directly, so they're live
  // even while checkoutUrl is still empty (prelaunch only needs to gate Add to bag, nothing else).
  const workerUrl = CFG.workerUrl || (CFG.checkoutUrl ? CFG.checkoutUrl.replace(/\/checkout$/, "") : "");
  const signupEndpoint = CFG.signupUrl || (workerUrl ? `${workerUrl}/subscribe` : "");
  const rewardsEndpoint = workerUrl ? `${workerUrl}/rewards` : "";
  const contactEndpoint = workerUrl ? `${workerUrl}/contact` : "";
  const chatEndpoint = workerUrl ? `${workerUrl}/chat` : "";
  const ordersEndpoint = workerUrl ? `${workerUrl}/orders` : "";
  const authRequestEndpoint = workerUrl ? `${workerUrl}/auth/request` : "";
  const authVerifyEndpoint = workerUrl ? `${workerUrl}/auth/verify` : "";
  const authSignOutEndpoint = workerUrl ? `${workerUrl}/auth/signout` : "";
  // Real sign-in (magic link, no password): our own, through the worker and Brevo - no third-party
  // auth vendor, so nothing but flò ever shows up in the browser or the email. Gated by its own
  // config flag, independent of prelaunch/checkout, so it can be tested live without also turning
  // on Add to bag.
  const authEnabled = !!CFG.signIn?.enabled && !!authRequestEndpoint;
  const SESSION_KEY = "flo-session";
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function setSession(session) {
    try { session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // The welcome code from joining the list, kept on this device so the account page and checkout can show it
  const WELCOME_KEY = "flo-welcome";
  const readWelcome = () => {
    try { const w = JSON.parse(localStorage.getItem(WELCOME_KEY)); return w && w.expires * 1000 > Date.now() ? w : null; } catch { return null; }
  };
  // the first-order discount for joining, shown only once sign-ups really work
  const offer = () => (CFG.welcome && signupEndpoint ? CFG.welcome.percent : 0);

  async function joinList(email) {
    const res = await fetch(signupEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    if (data.code) { try { localStorage.setItem(WELCOME_KEY, JSON.stringify({ code: data.code, percent: data.percent, expires: data.expires })); } catch { /* private mode */ } }
    return data;
  }

  const shortDate = sec => new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  function joinedHtml(data, fallback) {
    if (!data.code) return esc(fallback);
    return `You're in. Your ${data.percent}% off code for your first order: <b class="code">${esc(data.code)}</b> (until ${shortDate(data.expires)}). It's saved on this device and on your <a class="link-u" href="account.html">account page</a>.`;
  }

  // A sign-up form wired to the list, or a pointer to TikTok while sign-ups aren't connected
  function notifyMarkup(lead) {
    if (offer() && !/% off/.test(lead)) lead += ` Join the list for ${offer()}% off your first order.`;
    if (!signupEndpoint) {
      return `<p>${lead}</p><a class="btn btn--solid" href="${esc(CFG.tiktok || CFG.instagram || "#")}" target="_blank" rel="noopener">Follow for the drop date</a>`;
    }
    return `<p>${lead}</p>
      <form class="notify__form">
        <input type="email" required placeholder="Email address" aria-label="Email address">
        <button type="submit">Notify me</button>
      </form>
      <p class="notify__msg" aria-live="polite"></p>`;
  }

  function bindNotify(root) {
    const form = root.querySelector(".notify__form");
    if (!form) return;
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const msg = root.querySelector(".notify__msg");
      msg.textContent = "Joining…";
      try {
        const data = await joinList(form.querySelector("input").value);
        msg.innerHTML = joinedHtml(data, "You're on the list. We'll email you when the drop opens.");
        form.reset();
      } catch (err) { msg.textContent = err.message; }
    });
  }

  // Points aren't kept on this device (they come from past orders, maybe on another device), so
  // checking them is a quick email lookup, the same no-password pattern as the welcome code.
  function loyaltyHtml(data) {
    const pct = data.reward?.percent ?? CFG.loyalty?.percent ?? 15;
    let html = `<span>${data.points} point${data.points === 1 ? "" : "s"} so far &middot; ${data.toNextReward} to your next ${pct}% off.</span>`;
    if (data.reward) {
      html += `<p class="account__code"><b>${esc(data.reward.code)}</b> <button class="label link-u" data-copy="${esc(data.reward.code)}">Copy</button></p>
        <p class="account__fine">${data.reward.percent}% off, one use, until ${shortDate(data.reward.expires)}.</p>`;
    }
    return html;
  }

  function bindLoyalty(card) {
    const form = card && card.querySelector(".loyalty__form");
    if (!form) return;
    form.addEventListener("submit", async e => {
      e.preventDefault();
      await fetchLoyalty(card, form.querySelector("input").value);
    });
  }

  async function fetchLoyalty(card, email) {
    const out = card.querySelector(".loyalty__result");
    out.textContent = "Checking…";
    try {
      const res = await fetch(rewardsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      out.innerHTML = loyaltyHtml(data);
    } catch (err) { out.textContent = err.message; }
  }

  // Signed in: one /rewards call fills both the welcome code and the loyalty points, so the
  // welcome code shows up on any device now, not just the one it was issued on.
  async function loadAccountRewards(root, email) {
    const rewardsCard = root.querySelector("#account-rewards");
    const loyaltyCard = root.querySelector("#account-loyalty");
    const rewardsOut = rewardsCard?.querySelector(".rewards__body");
    const loyaltyOut = loyaltyCard?.querySelector(".loyalty__result");
    try {
      const res = await fetch(rewardsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      if (rewardsOut) {
        rewardsOut.outerHTML = data.welcome
          ? `<p>Your ${data.welcome.percent}% off first-order code:</p>
             <p class="account__code"><b>${esc(data.welcome.code)}</b> <button class="label link-u" data-copy="${esc(data.welcome.code)}">Copy</button></p>
             <p class="account__fine">Enter it on the payment page. One use, first order only, until ${shortDate(data.welcome.expires)}.</p>`
          : `<p>No welcome code on this account &mdash; those are for first-time sign-ups only.</p>`;
      }
      if (loyaltyOut) loyaltyOut.innerHTML = loyaltyHtml(data);
    } catch (err) {
      if (rewardsOut) rewardsOut.textContent = err.message;
      if (loyaltyOut) loyaltyOut.textContent = err.message;
    }
  }

  // The contact page: a form that emails the inbox directly (via the worker), so nobody's mail
  // app has to open. Falls back to a plain address if the worker isn't connected yet.
  function bindContactForm() {
    const form = $("#contact-form");
    if (!form) return;
    const msg = form.querySelector(".contact-form__msg");
    if (!contactEndpoint) {
      form.hidden = true;
      msg.textContent = "Email us directly at hello@floshops.com.";
      return;
    }
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      msg.textContent = "Sending…";
      try {
        const res = await fetch(contactEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.email.value,
            subject: form.subject.value,
            message: form.message.value,
            company: form.company.value // honeypot: real visitors never fill this in
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        form.reset();
        msg.textContent = "Thanks, that's sent. We'll reply by email, usually within a day or two.";
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  function setAnnounce() {
    const el = $("#announce");
    if (!el || !catalog) return;
    const free = `Free shipping over ${money(catalog.shipping.freeOver)}`;
    const code = CFG.launch && CFG.launch.code;
    if (prelaunch) el.innerHTML = `Drop 001 is coming soon<span class="hide-sm"> &nbsp;·&nbsp; ${free}</span>`;
    else if (code) el.innerHTML = `${esc(CFG.launch.offer)} with code ${esc(code)}<span class="hide-sm"> &nbsp;·&nbsp; ${free}</span>`;
    else el.innerHTML = `${free}<span class="hide-sm"> &nbsp;·&nbsp; Every piece made to order</span>`;
  }

  /* ---------- Catalog ---------- */
  // Menu and footer links to shop sections with nothing in them right now (hoodies before any hoodie is out)
  function hideEmptyLinks() {
    const cats = new Set(catalog.products.map(p => p.category));
    $$('a[href^="shop.html?c="]').forEach(a => {
      const c = new URL(a.href, location.href).searchParams.get("c");
      const has = cats.has(c) || cats.has(LEGACY[c]);
      (a.closest("li") || a).hidden = !has;
    });
  }

  async function loadCatalog() {
    // no-cache: the browser asks GitHub Pages every time (a cheap 304 when nothing changed), so a
    // catalog change shows on the next page load instead of up to 10 minutes later
    const res = await fetch("assets/data/products.json", { cache: "no-cache" });
    catalog = await res.json();
    catalog.products = catalog.products.filter(p => !p.hidden); // hidden products stay in the file for later drops
    hideEmptyLinks();
    return catalog;
  }
  const findProduct = id => catalog.products.find(p => p.id === id);

  // Recently viewed: kept on this device only, newest first, so a product page can show what
  // someone was just looking at without any account or server round trip.
  const RECENT_KEY = "flo-recent";
  function recordRecentlyViewed(id) {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { /* private mode */ }
    ids = [id, ...ids.filter(x => x !== id)].slice(0, 10);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
  }
  function readRecentlyViewed() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
  }

  function art(p, color, side, className) {
    const set = (color && color.photos) || p.photos; // Printify colours carry their own mockups
    const photo = side === "back" ? set[1] : set[0];
    if (photo) return `<img class="photo photo--product ${className || ""}" src="${photo}" alt="${p.name} in ${color.name}, ${side}" loading="lazy">`;
    return garmentSVG(p.type, color.hex, { front: p.front, back: p.back }, {
      side, className, ink: color.ink, label: `${p.name} in ${color.name}, ${side} view`
    });
  }

  function card(p) {
    const c = p.colors[0];
    const hasBack = p.back !== "none" || p.photos[1];
    // graphic pieces lead with the back print; hovering shows the other side
    const [first, second] = p.lead === "back" ? ["back", "front"] : ["front", "back"];
    return `<a class="card reveal" href="product.html?id=${p.id}">
      <div class="card__media${p.whiteBg ? " is-white" : ""}">
        ${art(p, c, first, "is-front")}
        ${hasBack ? art(p, c, second, "is-back") : ""}
        ${p.flag ? `<span class="card__badge card__badge--concept label">${p.badge ? `${p.badge} · ` : ""}Coming soon</span>` : p.badge ? `<span class="card__badge label">${p.badge}</span>` : ""}
      </div>
      <div class="card__info">
        <div>
          <div class="card__name">${p.name}</div>
          <div class="card__meta">${p.colors.length} colour${p.colors.length > 1 ? "s" : ""}</div>
          <div class="dots">${p.colors.map(x => `<i style="background:${x.hex}" title="${x.name}"></i>`).join("")}</div>
        </div>
        <div class="card__price">${fromPrice(p)}</div>
      </div>
    </a>`;
  }

  /* ---------- Bag state ---------- */
  const readBag = () => {
    try { return JSON.parse(localStorage.getItem(BAG_KEY)) || []; } catch { return []; }
  };
  const writeBag = items => {
    try { localStorage.setItem(BAG_KEY, JSON.stringify(items)); } catch { /* private mode */ }
    renderBag();
  };

  function addToBag(id, color, size, qty = 1) {
    const items = readBag();
    const sku = skuOf(id, color, size);
    const hit = items.find(i => i.sku === sku);
    if (hit) hit.qty += qty; else items.push({ sku, id, color, size, qty });
    writeBag(items);
  }

  function totals(items) {
    const sub = items.reduce((sum, i) => {
      const p = findProduct(i.id);
      return p ? sum + cents(priceFor(p, i.size)) * i.qty : sum;
    }, 0);
    const { flatRate, freeOver } = catalog.shipping;
    const ship = sub === 0 || sub >= cents(freeOver) ? 0 : cents(flatRate);
    return { subtotal: sub / 100, shipping: ship / 100, total: (sub + ship) / 100 };
  }

  function renderBag() {
    if (!catalog) return;
    const items = readBag().filter(i => findProduct(i.id));
    const count = items.reduce((n, i) => n + i.qty, 0);
    $$(".bag-count").forEach(el => (el.textContent = count));
    const list = $("#bag-items");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<p class="bag__empty">Your bag is empty.</p>`;
    } else {
      list.innerHTML = items.map(i => {
        const p = findProduct(i.id);
        const c = p.colors.find(x => x.name === i.color) || p.colors[0];
        return `<div class="line">
          <a class="line__img" href="product.html?id=${p.id}">${art(p, c, "front")}</a>
          <div>
            <div class="line__name">${p.name}</div>
            <div class="line__meta">${c.name} · ${i.size}</div>
            <div class="qty">
              <button data-qty="-1" data-sku="${i.sku}" aria-label="Decrease quantity">−</button>
              <span>${i.qty}</span>
              <button data-qty="1" data-sku="${i.sku}" aria-label="Increase quantity">+</button>
            </div>
            <div><button class="line__remove" data-remove="${i.sku}">Remove</button></div>
          </div>
          <div class="card__price">${money(priceFor(p, i.size) * i.qty)}</div>
        </div>`;
      }).join("");
    }
    const t = totals(items);
    $("#bag-subtotal").textContent = money(t.subtotal);
    $("#bag-shipping").textContent = t.subtotal === 0 ? "" : t.shipping === 0 ? "Free" : money(t.shipping);
    $("#bag-checkout").disabled = !items.length;
    const left = catalog.shipping.freeOver - t.subtotal;
    $("#bag-free").textContent = t.subtotal > 0 && left > 0
      ? `${money(left)} away from free shipping`
      : t.subtotal > 0 ? "You've unlocked free shipping" : `Free shipping over ${money(catalog.shipping.freeOver)}`;
    const bar = $("#bag-free-bar");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, catalog.shipping.freeOver ? (t.subtotal / catalog.shipping.freeOver) * 100 : 0))}%`;
  }

  function changeQty(sku, delta) {
    const items = readBag();
    const hit = items.find(i => i.sku === sku);
    if (!hit) return;
    hit.qty += delta;
    writeBag(items.filter(i => i.qty > 0));
  }

  function checkout() {
    if (prelaunch) return;
    if (readBag().length) location.href = "checkout.html";
  }

  /* ---------- UI chrome ---------- */
  function openBag() { $("#bag").classList.add("is-open"); $("#scrim").classList.add("is-open"); }
  function closeBag() { $("#bag").classList.remove("is-open"); $("#scrim").classList.remove("is-open"); }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 3200);
  }

  // Instagram isn't live yet (CFG.instagram is empty) - once it is, this adds it next to TikTok
  // in the footer automatically, same icon treatment, no HTML edits needed.
  function addInstagramLink() {
    if (!CFG.instagram) return;
    const list = $(".footer__cols .social-link")?.closest("ul");
    if (!list) return;
    list.insertAdjacentHTML("beforeend", `
      <li><a class="social-link" href="${esc(CFG.instagram)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>Instagram</a></li>`);
  }

  function bindChrome() {
    const header = $(".header");
    const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    $$("[data-open-bag]").forEach(b => b.addEventListener("click", openBag));
    $$("[data-close-bag]").forEach(b => b.addEventListener("click", closeBag));
    $("#bag-checkout").addEventListener("click", checkout);
    $("#bag-items").addEventListener("click", e => {
      const q = e.target.closest("[data-qty]");
      const r = e.target.closest("[data-remove]");
      if (q) changeQty(q.dataset.sku, +q.dataset.qty);
      if (r) changeQty(r.dataset.remove, -Infinity);
    });

    const menu = $("#menu");
    $$("[data-open-menu]").forEach(b => b.addEventListener("click", () => menu.classList.add("is-open")));
    $$("[data-close-menu]").forEach(b => b.addEventListener("click", () => menu.classList.remove("is-open")));

    addEventListener("keydown", e => {
      if (e.key === "Escape") { closeBag(); menu.classList.remove("is-open"); }
    });

    // The email list: sign-ups go to the worker's /subscribe, or to TikTok until that's connected
    $$(".signup__form").forEach(form => {
      const msg = form.nextElementSibling;
      if (!signupEndpoint) {
        form.outerHTML = `<a class="btn btn--white" href="${esc(CFG.tiktok || CFG.instagram || "#")}" target="_blank" rel="noopener">Follow for the drop date</a>`;
        return;
      }
      if (offer()) form.insertAdjacentHTML("beforebegin", `<p class="signup__offer">Join the list and get ${offer()}% off your first order.</p>`);
      form.addEventListener("submit", async e => {
        e.preventDefault();
        msg.textContent = "Joining…";
        try {
          const data = await joinList(form.querySelector("input[type=email]").value);
          msg.innerHTML = joinedHtml(data, "You're on the list. We'll be in touch before the drop.");
          form.reset();
        } catch (err) { msg.textContent = err.message; }
      });
    });
  }

  // Sign-up pop-up: once, a few seconds into a visit. Not on checkout or the account page, not for anyone who already
  // joined, and not again for two weeks after it's closed.
  const POPUP_KEY = "flo-popup";
  const isHome = () => !!$("#bestsellers");
  function maybePopup() {
    const page = document.body.dataset.page;
    if (page === "checkout" || page === "success" || $("#account")) return;
    // config popup: "always" = the full-screen pop-up on every home page load, every visitor,
    // even someone already on the list - other pages stay clear so it's not repeated on every
    // click; "home" = same page restriction but respects already-joined (testing); "corner" = a
    // small, non-blocking bottom-corner card instead of a takeover; anything else = the full
    // pop-up once, then not for 14 days
    if (CFG.popup === "always") { if (isHome()) setTimeout(openPopup, 1000); return; }
    if (readWelcome()) return;
    if (CFG.popup === "home") { if (isHome()) setTimeout(openPopup, 1200); return; }
    let last = 0;
    try { last = +localStorage.getItem(POPUP_KEY) || 0; } catch { /* private mode: show it */ }
    if (Date.now() - last < 14 * 864e5) return;
    setTimeout(CFG.popup === "corner" ? openCornerPopup : openPopup, 6000);
  }

  // The gentler alternative to the full pop-up: a small card that hovers in the corner instead of
  // blocking the page, so browsing isn't interrupted. Same list, same welcome code, lower pressure.
  function openCornerPopup() {
    if (!signupEndpoint || $(".corner-popup") || $(".popup") || $(".bag.is-open") || $(".menu.is-open")) return;
    const pct = offer();
    document.body.insertAdjacentHTML("beforeend", `
      <div class="corner-popup" role="dialog" aria-labelledby="corner-popup-title">
        <button class="corner-popup__close label" aria-label="Close">✕</button>
        <h2 class="corner-popup__title" id="corner-popup-title">${pct ? `${pct}% off <em>your first order</em>` : `First to <em>know</em>`}</h2>
        <p class="corner-popup__lead">${pct ? "Join the list for your code." : "Be the first to hear when Drop 001 opens."}</p>
        <form class="corner-popup__form">
          <input type="email" required placeholder="Email address" aria-label="Email address">
          <button type="submit">${pct ? "Get code" : "Join"}</button>
        </form>
        <p class="corner-popup__msg" aria-live="polite"></p>
      </div>`);
    const box = $(".corner-popup");
    const close = () => {
      try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch { /* private mode */ }
      box.remove();
    };
    box.querySelector(".corner-popup__close").addEventListener("click", close);
    requestAnimationFrame(() => box.classList.add("is-open"));
    box.querySelector(".corner-popup__form").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = box.querySelector(".corner-popup__msg");
      msg.textContent = "Joining…";
      try {
        const data = await joinList(box.querySelector("input[type=email]").value);
        msg.innerHTML = joinedHtml(data, "You're on the list.");
        box.querySelector(".corner-popup__form").hidden = true;
      } catch (err) { msg.textContent = err.message; }
    });
  }

  // A small AI assistant, grounded only in flò's own shipping/returns/sizing/discount facts
  // (see the worker's FLO_FACTS) - never on checkout, so nothing distracts from paying.
  function bindChat() {
    if (!chatEndpoint || document.body.dataset.page === "checkout") return;
    document.body.insertAdjacentHTML("beforeend", `
      <button class="chat-launcher" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Chat with us"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4.5 4V5.5Z"/></svg></button>
      <div class="chat-panel" role="dialog" aria-label="Chat with flò">
        <div class="chat-panel__head">
          <p class="label">Ask flò</p>
          <button class="chat-panel__close label" aria-label="Close">✕</button>
        </div>
        <div class="chat-panel__log"><p class="chat-msg chat-msg--bot">Hey, ask me about shipping, sizing, returns or your discount code.</p></div>
        <form class="chat-panel__form">
          <input type="text" required maxlength="500" placeholder="Type a question…" aria-label="Your question">
          <button type="submit" aria-label="Send">→</button>
        </form>
      </div>`);
    const launcher = $(".chat-launcher"), panel = $(".chat-panel"), log = $(".chat-panel__log"), form = $(".chat-panel__form");
    const history = [];
    const addMsg = (cls, text) => {
      log.insertAdjacentHTML("beforeend", `<p class="chat-msg ${cls}">${esc(text)}</p>`);
      log.scrollTop = log.scrollHeight;
    };
    const toggle = open => {
      panel.classList.toggle("is-open", open);
      launcher.setAttribute("aria-expanded", String(open));
      if (open) form.querySelector("input").focus({ preventScroll: true });
    };
    launcher.addEventListener("click", () => toggle(!panel.classList.contains("is-open")));
    $(".chat-panel__close").addEventListener("click", () => toggle(false));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const input = form.querySelector("input");
      const message = input.value.trim();
      if (!message) return;
      addMsg("chat-msg--user", message);
      input.value = "";
      input.disabled = true;
      // A free-tier fallback chain can take a while under load, so show it's thinking rather
      // than leaving the panel looking frozen.
      log.insertAdjacentHTML("beforeend", `<p class="chat-msg chat-msg--bot chat-msg--typing" aria-live="polite"><span></span><span></span><span></span></p>`);
      log.scrollTop = log.scrollHeight;
      try {
        const res = await fetch(chatEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        $(".chat-msg--typing", log)?.remove();
        addMsg("chat-msg--bot", data.reply);
        history.push({ role: "user", text: message }, { role: "model", text: data.reply });
      } catch (err) {
        $(".chat-msg--typing", log)?.remove();
        addMsg("chat-msg--error", err.message);
      } finally {
        input.disabled = false;
        input.focus({ preventScroll: true });
      }
    });
  }

  function openPopup() {
    if ($(".popup") || $(".bag.is-open") || $(".menu.is-open")) return;
    const pct = offer();
    const pick = catalog.products.find(p => p.photos && p.photos.length);
    const img = pick ? (pick.lead === "back" && pick.photos[1] ? pick.photos[1] : pick.photos[0]) : "";
    document.body.insertAdjacentHTML("beforeend", `
      <div class="popup" role="dialog" aria-modal="true" aria-labelledby="popup-title">
        <div class="popup__card">
          <button class="popup__close label" aria-label="Close">✕</button>
          ${img ? `<div class="popup__img"><img src="${esc(img)}" alt=""></div>` : ""}
          <div class="popup__body">
            <p class="label label--mute">The list</p>
            <h2 class="display popup__title" id="popup-title">${pct ? `${pct}% off <em>your first order.</em>` : `First to <em>know.</em>`}</h2>
            <p class="popup__lead">${pct ? "Join for early access to drops, restocks and members-only promos." : "Drop 001 is on the way. Be the first to hear when it opens."}</p>
            ${signupEndpoint
              ? `<form class="popup__form"><input type="email" required placeholder="Email address" aria-label="Email address"><button class="btn btn--solid" type="submit">${pct ? "Get my code" : "Join the list"}</button></form>
                 <p class="popup__msg" aria-live="polite"></p>`
              : `<a class="btn btn--solid" href="${esc(CFG.tiktok || CFG.instagram || "#")}" target="_blank" rel="noopener">Follow for the drop date</a>`}
            ${signupEndpoint ? `<p class="popup__fine">By joining you agree to get emails from flò about drops and promotions. Unsubscribe anytime. <a class="link-u" href="policies.html#privacy">Privacy</a></p>` : ""}
          </div>
        </div>
      </div>`);
    const box = $(".popup");
    const close = () => {
      try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch { /* private mode */ }
      box.remove();
      removeEventListener("keydown", onKey);
    };
    const onKey = e => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    box.addEventListener("click", e => { if (e.target === box || e.target.closest(".popup__close")) close(); });
    requestAnimationFrame(() => box.classList.add("is-open"));
    const form = box.querySelector(".popup__form");
    if (form) {
      form.querySelector("input").focus({ preventScroll: true });
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const msg = box.querySelector(".popup__msg");
        msg.textContent = "Joining…";
        try {
          const data = await joinList(form.querySelector("input").value);
          try { localStorage.setItem(POPUP_KEY, String(Date.now())); } catch { /* private mode */ }
          form.remove();
          msg.innerHTML = joinedHtml(data, "You're on the list. We'll email you before the drop.");
        } catch (err) { msg.textContent = err.message; }
      });
    } else box.querySelector(".popup__close").focus({ preventScroll: true });
  }

  // Finishes a magic-link sign-in: the token in the URL (emailed via Brevo, our own, no third-party
  // auth vendor) is exchanged here for a session token, then stored on this device.
  async function completeMagicLink() {
    if (!authEnabled) return;
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    if (!token) return;
    try {
      const res = await fetch(authVerifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sessionToken) setSession({ sessionToken: data.sessionToken, email: data.email });
    } catch { /* network hiccup: they stay signed out and can request a fresh link */ }
    params.delete("token");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash);
  }

  // Account page: a clear signed-in/out status bar up top, then orders (Stripe's customer portal),
  // the welcome code and how promo codes work.
  async function renderAccount() {
    const root = $("#account");
    if (!root) return;
    const pct = offer();
    // Only used to adjust wording below (already on the list or not) - never to show the actual
    // code. Sign-in stays off entirely until config.js's signIn.enabled is turned on. Deliberately
    // not using the locally-saved welcome code to reveal anything here: once sign-in is on, this
    // page only ever shows personal info (orders, codes, points) after a real sign-in, never just
    // from this browser's storage - that's what makes "signed in" vs "signed out" meaningful.
    const onList = !!readWelcome();
    const session = authEnabled ? getSession() : null;
    const email = session?.email || null;
    root.innerHTML = `
      <p class="label label--mute">Your account</p>
      <h1 class="display account__title">Orders &amp; <em>rewards</em></h1>
      ${authEnabled ? (
        email
          ? `<div class="account__status account__status--in" id="account-signin">
               <p class="account__status-who"><span class="account__status-dot" aria-hidden="true"></span>Signed in as <b>${esc(email)}</b></p>
               <button class="label link-u" data-signout>Sign out</button>
             </div>`
          : `<div class="account__status account__status--out" id="account-signin">
               <form class="account__signin-form notify__form">
                 <input type="email" required placeholder="Email address" aria-label="Email address">
                 <button type="submit">Send magic link</button>
               </form>
               <p class="account__signin-msg account__fine" aria-live="polite">Sign in to see your orders, welcome code and points below, no password.</p>
             </div>`
      ) : ""}
      <div class="account__grid">
        <div class="account__card" id="account-orders">
          <p class="label">Your orders</p>
          ${email
            ? `<p class="orders__list">Loading your orders…</p>`
            : authEnabled
            ? `<p>Sign in above to see your order history and receipts.</p>`
            : `<p>Your orders will show up here once Drop 001 is on sale. Every order also comes with an email receipt and tracking.</p>`}
          ${CFG.ordersUrl ? `<p class="account__fine"><a class="link-u" href="${esc(CFG.ordersUrl)}" target="_blank" rel="noopener">Or look up an order directly through Stripe</a></p>` : ""}
        </div>
        <div class="account__card" id="account-rewards">
          <p class="label">Rewards</p>
          ${email
            ? `<p class="rewards__body">Loading…</p>`
            : authEnabled
            ? `<p>Sign in above to see your welcome code.</p>${!onList && pct ? `<p class="account__fine">Not on the list yet? <a class="link-u" href="index.html#signup">Join for ${pct}% off your first order</a>.</p>` : ""}`
            : pct
            ? `<div class="notify">${notifyMarkup(`Join the list and get ${pct}% off your first order. Your code shows up here right away.`)}</div>`
            : `<p>Rewards open with Drop 001.</p><a class="btn btn--solid" href="${esc(CFG.tiktok || CFG.instagram || "#")}" target="_blank" rel="noopener">Follow for the drop date</a>`}
        </div>
        <div class="account__card">
          <p class="label">Promo codes</p>
          <p>Codes go in on the payment page, one per order.</p>
          ${CFG.launch?.code && !prelaunch
            ? `<p class="account__code"><b>${esc(CFG.launch.code)}</b> <button class="label link-u" data-copy="${esc(CFG.launch.code)}">Copy</button></p>
               <p class="account__fine">${esc(CFG.launch.offer)}.</p>`
            : ""}
        </div>
        <div class="account__card" id="account-loyalty">
          <p class="label">My offers</p>
          ${email
            ? `<p class="loyalty__result">Loading…</p>`
            : authEnabled
            ? `<p>Sign in above to see your points balance.</p>`
            : rewardsEndpoint
            ? `<p>1 point per dollar on every order. Hit ${CFG.loyalty?.threshold || 100} points and a ${CFG.loyalty?.percent || 15}% off code lands here automatically.</p>
               <form class="loyalty__form notify__form">
                 <input type="email" required placeholder="Email address" aria-label="Email address">
                 <button type="submit">Check</button>
               </form>
               <p class="loyalty__result notify__msg" aria-live="polite"></p>`
            : `<p>Points open once Drop 001 is on sale: 1 point per dollar, with a reward code every ${CFG.loyalty?.threshold || 100} points.</p>`}
        </div>
      </div>`;
    const box = root.querySelector("#account-rewards .notify");
    if (box) bindNotify(box);
    if (email) {
      loadAccountRewards(root, email);
      loadOrders(root.querySelector("#account-orders"));
    } else if (!authEnabled) {
      bindLoyalty(root.querySelector("#account-loyalty"));
    }
    bindSignIn(root);
    root.addEventListener("click", e => {
      const c = e.target.closest("[data-copy]");
      if (!c) return;
      navigator.clipboard?.writeText(c.dataset.copy).then(() => toast("Code copied"), () => toast(c.dataset.copy));
    });
  }

  // Magic-link sign-in: no password, just a one-time email link, entirely our own (worker + Brevo).
  // Real order history, in-page, for a signed-in shopper - no redirect to Stripe's portal needed
  // for the common case of just checking what you ordered.
  async function loadOrders(card) {
    const out = card?.querySelector(".orders__list");
    const session = getSession();
    if (!out || !ordersEndpoint || !session) return;
    try {
      const res = await fetch(ordersEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: session.sessionToken })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      if (!data.orders.length) { out.textContent = "No orders yet."; return; }
      out.outerHTML = `<div class="orders__list">${data.orders.map(o => `
        <div class="orders__item">
          <div class="orders__item-head">
            <span>${new Date(o.date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            <span>${money(o.total)}</span>
          </div>
          <p class="account__fine">${o.items.map(i => esc(i.name) + (i.qty > 1 ? ` &times;${i.qty}` : "")).join(", ")}</p>
          ${o.receiptUrl ? `<a class="label link-u" href="${esc(o.receiptUrl)}" target="_blank" rel="noopener">Receipt</a>` : ""}
        </div>`).join("")}</div>`;
    } catch (err) {
      out.textContent = err.message;
    }
  }

  function bindSignIn(root) {
    const box = root.querySelector("#account-signin");
    if (!box) return;
    const signOut = box.querySelector("[data-signout]");
    if (signOut) {
      signOut.addEventListener("click", async () => {
        const session = getSession();
        setSession(null);
        renderAccount();
        if (session && authSignOutEndpoint) {
          fetch(authSignOutEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken: session.sessionToken })
          }).catch(() => {});
        }
      });
      return;
    }
    const form = box.querySelector(".account__signin-form");
    if (!form) return;
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const msg = box.querySelector(".account__signin-msg");
      const email = form.querySelector("input").value;
      msg.textContent = "Sending…";
      try {
        const res = await fetch(authRequestEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        msg.textContent = `Check ${email} for a sign-in link.`;
        form.reset();
      } catch (err) { msg.textContent = err.message; }
    });
  }

  // Photo slots: only load photos that are listed in config.js
  function fillPhotos() {
    const photos = CFG.photos || {};
    $$("[data-photo]").forEach(img => {
      const src = photos[img.dataset.photo];
      if (!src) { img.remove(); return; }
      img.onerror = () => img.remove();
      img.src = src;
      img.hidden = false;
    });
  }

  function bindReveal() {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal").forEach(el => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal:not(.is-in)").forEach(el => io.observe(el));
    // never leave products invisible if the observer is slow or unsupported
    setTimeout(() => $$(".reveal").forEach(el => el.classList.add("is-in")), 1200);
  }

  /* ---------- Pages ---------- */
  function renderHome() {
    const lead = catalog.products[0];
    const grid = $("#bestsellers");
    if (grid) {
      if (catalog.products.length >= 3) {
        grid.innerHTML = catalog.products.slice(0, 4).map(card).join("");
        grid.classList.toggle("grid--3", catalog.products.length === 3);
      }
      else {
        // a small drop: feature the lead piece, both sides, instead of a mostly empty grid
        const c = lead.colors[0];
        const [first, second] = lead.lead === "back" ? ["back", "front"] : ["front", "back"];
        grid.className = "feature";
        grid.innerHTML = `
          <a class="feature__shot" href="product.html?id=${lead.id}">${art(lead, c, first)}<span class="label">${first}</span></a>
          <a class="feature__shot" href="product.html?id=${lead.id}">${art(lead, c, second)}<span class="label">${second}</span></a>
          <div class="feature__info">
            <div><p class="label label--mute">${esc(lead.badge || "")}</p><h3 class="feature__name">${esc(lead.name)}</h3><p class="feature__price">${fromPrice(lead)}</p></div>
            <p class="feature__desc">${esc(lead.description)}</p>
            <a class="btn btn--solid feature__cta" href="product.html?id=${lead.id}">See the tee</a>
          </div>`;
      }
    }
    const hero = $("#hero-art");
    if (hero && lead) {
      const c = lead.colors[0];
      const side = lead.lead === "back" ? "back" : "front";
      const photo = side === "back" ? lead.photos[1] : lead.photos[0];
      hero.innerHTML = photo
        ? `<img class="hero__product" src="${photo}" alt="${esc(lead.name)}, ${side}">`
        : garmentSVG(lead.type, c.hex, { front: lead.front, back: lead.back }, { side, ink: c.ink, label: lead.name });
    }
    $$("[data-art]").forEach(el => {
      const [id, colorName, side] = el.dataset.art.split(":");
      const p = findProduct(id) || lead;
      if (!p) return;
      const c = p.colors.find(x => x.name === colorName) || p.colors[0];
      el.insertAdjacentHTML("afterbegin", art(p, c, side || "front"));
    });
  }

  /* ---------- Postcards: the travel tees, each drawn as a postcard (products with a "postcard" block) ---------- */
  const postcardItems = () => catalog.products.filter(p => p.postcard).map(p => {
    const pc = p.postcard;
    const color = p.colors.find(c => c.name === pc.colour) || p.colors[0];
    const photos = color.photos || p.photos;
    return { p, pc, color, face: (p.lead === "back" ? photos[1] : photos[0]) || photos[0], front: photos[0] };
  });

  function postmark(id, pc) {
    const top = `${pc.place} · ${pc.code}`.toUpperCase();
    return `<svg class="pc__postmark" viewBox="0 0 200 110" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <path d="M2 34c12-7 24 7 36 0s24 7 36 0M2 50c12-7 24 7 36 0s24 7 36 0M2 66c12-7 24 7 36 0s24 7 36 0M2 82c12-7 24 7 36 0s24 7 36 0" stroke-width="1.6"/>
        <circle cx="140" cy="55" r="46" stroke-width="2"/><circle cx="140" cy="55" r="33" stroke-width="1"/>
      </g>
      <defs><path id="${id}-t" d="M100 55a40 40 0 0 1 80 0"/><path id="${id}-b" d="M98 55a42 42 0 0 0 84 0"/></defs>
      <text font-size="9.5" letter-spacing="1.6" fill="currentColor"><textPath href="#${id}-t" startOffset="50%" text-anchor="middle">${esc(top)}</textPath></text>
      <text font-size="8.5" letter-spacing="1.6" fill="currentColor"><textPath href="#${id}-b" startOffset="50%" text-anchor="middle" dominant-baseline="hanging">DROP 001 · 2026</textPath></text>
      <text x="140" y="60" font-size="15" font-style="italic" font-family="Bodoni Moda, Georgia, serif" text-anchor="middle" fill="currentColor">flò</text>
    </svg>`;
  }

  function renderPostcards() {
    const items = postcardItems();
    const list = $("#postcards");
    if (list) {
      list.innerHTML = items.map(({ p, pc, color, face, front }) => `
        <article class="pc" style="--tint:${esc(pc.tint)}">
          <a class="pc__face" href="product.html?id=${p.id}" aria-label="${esc(p.name)}">
            <p class="pc__greeting"><small class="label">Greetings from</small>${esc(pc.place)}</p>
            <img src="${face}" alt="${esc(p.name)} in ${esc(color.name)}" loading="lazy">
          </a>
          <div class="pc__back">
            <div class="pc__msg">
              <p class="label label--mute">${esc(pc.region)}</p>
              <p class="pc__note">${esc(pc.note)}</p>
              <p class="pc__sign">x, flò</p>
            </div>
            <div class="pc__addr">
              <div class="pc__corner">
                ${postmark("pm-" + p.id, pc)}
                <div class="pc__stamp" style="--tint:${esc(pc.tint)}"><div class="pc__stamp-in">
                  <img src="${front}" alt="" loading="lazy"><span>${esc(pc.code)}</span><b>${money(p.price)}</b>
                </div></div>
              </div>
              <p class="pc__line pc__name">${esc(p.name)}</p>
              <p class="pc__line label label--mute">${esc(pc.coords)}</p>
              <p class="pc__line">${fromPrice(p)} · ${p.colors.length} colour${p.colors.length === 1 ? "" : "s"}</p>
              <a class="btn btn--solid pc__cta" href="product.html?id=${p.id}">See the tee</a>
            </div>
          </div>
        </article>`).join("");
    }
    const stack = $("#pc-stack");
    if (stack) {
      stack.innerHTML = items.map(({ p, pc, color, face }) => `
        <span class="pc-mini" style="--tint:${esc(pc.tint)}">
          <span class="pc-mini__greeting"><small class="label">Greetings from</small>${esc(pc.place)}</span>
          <img src="${face}" alt="" loading="lazy">
        </span>`).join("");
      stack.closest("section").hidden = !items.length;
    }
  }

  const SECTIONS = [
    ["tees", "T-Shirts"], ["crewnecks", "Crewnecks"], ["hoodies", "Hoodies"],
    ["longsleeves", "Long Sleeves"], ["bottoms", "Bottoms"], ["accessories", "Accessories"]
  ];
  const LEGACY = { tops: "crewnecks", crews: "crewnecks", tshirts: "tees" }; // older links keep working

  function renderShop() {
    const root = $("#shop-grid");
    if (!root) return;
    const params = new URLSearchParams(location.search);
    const byCat = cat => catalog.products
      .filter(p => p.category === cat)
      .sort((a, b) => (a.flag ? 1 : 0) - (b.flag ? 1 : 0)); // ready-to-buy pieces before ones coming soon
    const present = SECTIONS.filter(([cat]) => byCat(cat).length);
    const wanted = LEGACY[params.get("c")] || params.get("c");
    let active = present.some(([cat]) => cat === wanted) ? wanted : "all";

    const section = ([cat, title], withLink) => {
      const list = byCat(cat);
      return `<section class="shop-sec" id="${cat}">
        <div class="shop-sec__head"${active === "all" ? "" : " hidden"}>
          <h2 class="display shop-sec__title">${title}</h2>
          <span class="label label--mute">${list.length} piece${list.length === 1 ? "" : "s"}</span>
          ${withLink ? `<button class="label link-u shop-sec__all" data-jump="${cat}">View all</button>` : ""}
        </div>
        <div class="grid">${list.map(card).join("")}</div>
      </section>`;
    };

    const draw = () => {
      const shown = active === "all" ? present : present.filter(([cat]) => cat === active);
      root.innerHTML = shown.map(sec => section(sec, active === "all" && present.length > 1)).join("");
      const total = shown.reduce((n, [cat]) => n + byCat(cat).length, 0);
      $("#shop-count").textContent = `${total} piece${total === 1 ? "" : "s"}`;
      $$("[data-filter]").forEach(b => {
        b.setAttribute("aria-pressed", b.dataset.filter === active);
        b.hidden = b.dataset.filter !== "all" && !present.some(([cat]) => cat === b.dataset.filter);
      });
      const title = $("#shop-title");
      if (title) title.innerHTML = active === "all" ? 'Shop <em class="serif">all</em>' : present.find(([c]) => c === active)[1];
      bindReveal();
    };
    const go = cat => {
      active = cat;
      history.replaceState(null, "", cat === "all" ? "shop.html" : `shop.html?c=${cat}`);
      draw();
      scrollTo({ top: 0, behavior: "smooth" });
    };
    $$("[data-filter]").forEach(b => b.addEventListener("click", () => go(b.dataset.filter)));
    root.addEventListener("click", e => { const j = e.target.closest("[data-jump]"); if (j) go(j.dataset.jump); });
    draw();
  }

  // Product schema (JSON-LD) so Google can show price, image and stock directly in search results
  function injectProductSchema(p, color) {
    const img = (color.photos && color.photos[0]) || p.photos[0];
    const data = {
      "@context": "https://schema.org/",
      "@type": "Product",
      name: p.name,
      description: p.description,
      image: img ? `https://floshops.com/${img.replace(/^\.?\/*/, "")}` : "https://floshops.com/assets/img/og.jpg",
      brand: { "@type": "Brand", name: "flò" },
      offers: {
        "@type": "Offer",
        url: `https://floshops.com/product.html?id=${p.id}`,
        priceCurrency: "USD",
        price: p.price.toFixed(2),
        availability: p.flag ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    };
    let tag = document.getElementById("product-schema");
    if (!tag) {
      tag = document.createElement("script");
      tag.type = "application/ld+json";
      tag.id = "product-schema";
      document.head.appendChild(tag);
    }
    tag.textContent = JSON.stringify(data);
  }

  /* ---------- Navigation: built from the catalog so it always matches what's for sale ---------- */
  function renderNav() {
    const live = catalog.products.filter(p => !p.hidden);
    const count = cat => live.filter(p => p.category === cat).length;
    // header: drop category links that have nothing in them
    $$('.header__left a[href*="shop.html?c="]').forEach(a => {
      const cat = new URLSearchParams(a.getAttribute("href").split("?")[1]).get("c");
      if (!count(LEGACY[cat] || cat)) a.remove();
    });
    const list = $(".menu__list");
    if (list) {
      const cats = SECTIONS.filter(([c]) => count(c));
      list.innerHTML = [
        `<li><a href="shop.html">Shop all <small>${live.length}</small></a></li>`,
        ...cats.map(([c, t]) => `<li><a href="shop.html?c=${c}">${t} <small>${count(c)}</small></a></li>`),
        ...(live.some(p => p.postcard) ? [`<li><a href="postcards.html">Postcards <small>${live.filter(p => p.postcard).length}</small></a></li>`] : []),
        `<li class="menu__minor"><a href="size-guide.html">Size guide</a></li>`,
        `<li class="menu__minor"><a href="account.html">Account</a></li>`,
        `<li class="menu__minor"><a href="about.html">The house</a></li>`
      ].join("");
    }
    const aside = $(".menu__aside");
    if (aside) {
      aside.innerHTML = `<p class="label">Every piece</p><div class="menu__products">${live.map(p => {
        const c = p.colors[0];
        return `<a class="menu__product" href="product.html?id=${p.id}">
          <span class="menu__thumb${p.whiteBg ? " is-white" : ""}">${art(p, c, p.lead === "back" ? "back" : "front")}</span>
          <span><span class="menu__pname">${esc(p.name)}</span><span class="menu__pprice">${fromPrice(p)}</span></span></a>`;
      }).join("")}</div>`;
    }
  }

  function renderProduct() {
    const root = $("#pdp");
    if (!root) return;
    const p = findProduct(new URLSearchParams(location.search).get("id")) || catalog.products[0];
    document.title = `${p.name} | flò`;
    let color = p.colors[0];
    let size = p.sizes.length === 1 ? p.sizes[0] : null;

    const drawGallery = () => {
      const hasBack = p.back !== "none" || p.photos[1];
      if (!hasBack && p.photos[0]) {
        // one photo only: show it once, full width, instead of the same shot twice
        $("#pdp-gallery").innerHTML = `<div class="pdp__shot pdp__shot--solo slot">${art(p, color, "front")}</div>`;
        return;
      }
      $("#pdp-gallery").innerHTML = `
        <div class="pdp__shot slot${p.whiteBg ? " is-white" : ""}">${art(p, color, p.lead === "back" ? "back" : "front")}</div>
        <div class="pdp__shot slot${p.whiteBg ? " is-white" : ""}">${hasBack ? art(p, color, p.lead === "back" ? "front" : "back") : art(p, color, "front")}</div>
        ${p.photos.length && !p.photos[2] ? "" : `<div class="pdp__shot pdp__shot--wide slot">${p.photos[2]
          ? `<img class="photo photo--product" src="${p.photos[2]}" alt="${p.name} detail" loading="lazy">`
          : garmentSVG(p.type, color.hex, { front: p.front, back: p.back }, { side: hasBack ? "back" : "front", ink: color.ink })}</div>`}`;
      // extra Printify shots for this colour (collar close-up, folded), after its front and back
      const extra = (color.photos || []).slice(2);
      if (extra.length) $("#pdp-gallery").insertAdjacentHTML("beforeend", extra.map((src, i) =>
        `<div class="pdp__shot slot is-white"><img class="photo photo--product" src="${src}" alt="${esc(p.name)} in ${esc(color.name)}, detail ${i + 1}" loading="lazy"></div>`).join(""));
      // on-model photos, shown with the colour they were shot in
      const life = p.lifestyle && p.lifestyle.colour === color.name ? p.lifestyle.photos : [];
      if (life.length) $("#pdp-gallery").insertAdjacentHTML("beforeend", life.map((src, i) =>
        `<div class="pdp__shot pdp__shot--life slot"><img class="photo" src="${src}" alt="${esc(p.name)} worn, photo ${i + 1}" loading="lazy"></div>`).join(""));
    };

    root.querySelector(".pdp__name").textContent = p.name;
    // breadcrumb: Shop › Category › Product
    const sec = SECTIONS.find(([c]) => c === p.category);
    const badge = $("#pdp-badge");
    if (badge && !$(".crumbs")) badge.insertAdjacentHTML("beforebegin", `<nav class="crumbs label" aria-label="You are here">
      <a href="shop.html">Shop</a>${sec ? ` <span aria-hidden="true">›</span> <a href="shop.html?c=${sec[0]}">${sec[1]}</a>` : ""}
      <span aria-hidden="true">›</span> <span aria-current="page">${esc(p.name)}</span></nav>`);
    root.querySelector(".pdp__price").textContent = size ? money(priceFor(p, size)) : fromPrice(p);
    root.querySelector(".pdp__desc").textContent = p.description;
    injectProductSchema(p, color);
    $("#pdp-badge").textContent = p.flag ? `${p.badge ? `${p.badge} · ` : ""}Coming soon` : p.badge || "flò essentials";
    $("#pdp-details").innerHTML = `<ul>${p.details.map(d => `<li>${d}</li>`).join("")}</ul>`;
    if (p.fit) $("#pdp-fit").textContent = p.fit;
    const sg = $("#pdp-sizeguide");
    if (sg) sg.href = `size-guide.html#${p.id}`; // opens this product's chart
    const sg2 = $("#pdp-sizeguide-2");
    if (sg2) sg2.href = `size-guide.html#${p.id}`;

    const swatches = $("#pdp-swatches");
    swatches.innerHTML = p.colors.map(c =>
      `<button class="swatch" style="background:${c.hex}" data-color="${c.name}" aria-label="${c.name}" aria-pressed="${c === color}"></button>`).join("");
    swatches.addEventListener("click", e => {
      const b = e.target.closest("[data-color]");
      if (!b) return;
      color = p.colors.find(c => c.name === b.dataset.color);
      $("#pdp-color").textContent = color.name;
      $$(".swatch", swatches).forEach(s => s.setAttribute("aria-pressed", s === b));
      drawGallery();
      markSizes();
    });
    $("#pdp-color").textContent = color.name;

    const sizes = $("#pdp-sizes");
    sizes.innerHTML = p.sizes.map(s =>
      `<button class="size" data-size="${s}" aria-pressed="${s === size}">${s}</button>`).join("");
    if (p.sizes.length === 1) sizes.style.gridTemplateColumns = "1fr";
    // some colours don't come in every size: grey those out, and drop a size that just became unavailable
    const markSizes = () => {
      const ok = color.sizes || p.sizes;
      $$(".size", sizes).forEach(b => { b.disabled = !ok.includes(b.dataset.size); });
      if (size && !ok.includes(size)) {
        size = null;
        $$(".size", sizes).forEach(b => b.setAttribute("aria-pressed", "false"));
        const add = $("#pdp-add");
        if (add) add.textContent = "Select a size";
      }
    };
    markSizes();
    sizes.addEventListener("click", e => {
      const b = e.target.closest("[data-size]");
      if (!b) return;
      size = b.dataset.size;
      $$(".size", sizes).forEach(s => s.setAttribute("aria-pressed", s === b));
      $("#pdp-add").textContent = `Add to bag · ${money(priceFor(p, size))}`;
      root.querySelector(".pdp__price").textContent = money(priceFor(p, size));
    });

    const add = $("#pdp-add");
    if (prelaunch || p.flag) {
      // before the drop, or a concept piece: no bag, just a way to hear when it opens
      add.hidden = true;
      const box = $("#pdp-notify");
      box.innerHTML = notifyMarkup(p.flag
        ? `${esc(p.name)} isn't available to order yet. Follow along to hear when it is.`
        : `Drop 001 is coming soon. ${esc(p.name)}, ${fromPrice(p).replace("From", "from")}.`);
      box.hidden = false;
      bindNotify(box);
    }
    add.textContent = size ? `Add to bag · ${money(priceFor(p, size))}` : "Select a size";
    add.addEventListener("click", () => {
      if (!size) { toast("Please choose a size."); return; }
      addToBag(p.id, color.name, size);
      openBag();
    });

    const more = catalog.products.filter(x => x.id !== p.id && x.category === p.category)
      .concat(catalog.products.filter(x => x.category !== p.category)).slice(0, 4);
    $("#pdp-more").innerHTML = more.map(card).join("");
    $("#pdp-more-section").hidden = !more.length;

    const recentSection = $("#pdp-recent-section");
    if (recentSection) {
      const recent = readRecentlyViewed().filter(id => id !== p.id).map(findProduct).filter(Boolean).slice(0, 4);
      $("#pdp-recent").innerHTML = recent.map(card).join("");
      recentSection.hidden = !recent.length;
    }
    recordRecentlyViewed(p.id);

    drawGallery();
  }

  function renderSuccess() {
    if (document.body.dataset.page !== "success") return;
    writeBag([]);
    let order = null;
    try { order = JSON.parse(localStorage.getItem("flo-last-order")); } catch { /* ignore */ }
    const num = new URLSearchParams(location.search).get("order");
    if (!order || order.number !== num) return; // Stripe orders keep the generic thank-you
    const m = money;
    const day = n => { const d = new Date(order.placed); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
    const [lo, hi] = order.method.id === "express" ? [4, 7] : [6, 12];
    $("#confirm").innerHTML = `
      <p class="label label--mute">Order ${order.number}${order.demo ? " · demo" : ""}</p>
      <h1 class="display confirm__title">Thank you, <em>${order.ship.name.split(" ")[0]}.</em></h1>
      <p style="color:var(--ink-2);max-width:520px">Your order is confirmed and your pieces are going into production. We've sent a receipt to <b>${order.email}</b>, and tracking will follow as soon as it ships.</p>
      ${order.demo ? `<p class="label" style="color:#8a5a12;margin-top:14px">Demo order: no payment was taken.</p>` : ""}
      <div class="track"><span class="on"></span><span></span><span></span><span></span></div>
      <div class="track-labels label label--mute"><span>Confirmed</span><span>In production</span><span>Shipped</span><span>Arrives ${day(lo)} to ${day(hi)}</span></div>
      <div class="confirm__grid">
        <div><p class="label">Shipping to</p><p>${order.ship.name}<br>${order.ship.lines.join("<br>")}</p></div>
        <div><p class="label">Delivery</p><p>${order.method.name} · ${order.method.note}<br>Paid with card ${order.card}</p></div>
      </div>
      ${order.items.map(i => `<div class="bag__row" style="padding:10px 0;border-bottom:1px solid var(--line)"><span>${i.name} <span class="label label--mute">${i.color} · ${i.size} × ${i.qty}</span></span><span>${m(i.price * i.qty)}</span></div>`).join("")}
      <div class="co-totals" style="border:0">
        <div class="bag__row"><span>Subtotal</span><span>${m(order.totals.subtotal)}</span></div>
        ${order.totals.off ? `<div class="bag__row"><span>Discount (${order.discount})</span><span>−${m(order.totals.off)}</span></div>` : ""}
        <div class="bag__row"><span>Shipping</span><span>${order.totals.ship ? m(order.totals.ship) : "Free"}</span></div>
        <div class="bag__row co-total"><span>Total</span><b>${m(order.totals.total)}</b></div>
      </div>
      <p style="margin-top:40px"><a class="btn btn--solid" style="width:auto" href="shop.html">Continue shopping</a></p>`;
  }

  /* ---------- Boot ---------- */
  // config reloadHome: a refresh (not a link someone opened) sends you back to the home page
  if (CFG.reloadHome && document.documentElement.dataset.reloadHome === "1") location.replace("index.html");

  document.addEventListener("DOMContentLoaded", async () => {
    document.body.classList.toggle("is-prelaunch", prelaunch);
    bindChrome();
    addInstagramLink();
    fillPhotos();
    try {
      await loadCatalog();
    } catch (err) {
      console.error("Could not load products.json. Preview the site through a local server, not file://", err);
      return;
    }
    setAnnounce();
    await completeMagicLink();
    renderAccount();
    bindContactForm();
    bindChat();
    maybePopup();
    renderHome();
    renderNav();
    renderShop();
    renderPostcards();
    renderProduct();
    renderSuccess();
    renderBag();
    bindReveal();
  });
})();
