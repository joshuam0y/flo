(function () {
  const BAG_KEY = "flo-bag";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const money = n => "$" + n.toFixed(0);
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const skuOf = (id, color, size) => `${id}_${slug(color)}_${slug(size)}`;

  let catalog = null;

  /* ---------- Catalog ---------- */
  async function loadCatalog() {
    const res = await fetch("assets/data/products.json");
    catalog = await res.json();
    return catalog;
  }
  const findProduct = id => catalog.products.find(p => p.id === id);

  function art(p, color, side, className) {
    const photo = side === "back" ? p.photos[1] : p.photos[0];
    if (photo) return `<img class="photo ${className || ""}" src="${photo}" alt="${p.name} in ${color.name}" loading="lazy">`;
    return garmentSVG(p.type, color.hex, { front: p.front, back: p.back }, {
      side, className, label: `${p.name} in ${color.name}, ${side} view`
    });
  }

  function card(p) {
    const c = p.colors[0];
    const hasBack = p.back !== "none" || p.photos[1];
    // graphic pieces lead with the back print; hovering shows the other side
    const [first, second] = p.lead === "back" ? ["back", "front"] : ["front", "back"];
    return `<a class="card reveal" href="product.html?id=${p.id}">
      <div class="card__media">
        ${art(p, c, first, "is-front")}
        ${hasBack ? art(p, c, second, "is-back") : ""}
        ${p.badge ? `<span class="card__badge label">${p.badge}</span>` : ""}
      </div>
      <div class="card__info">
        <div>
          <div class="card__name">${p.name}</div>
          <div class="card__meta">${p.colors.length} colour${p.colors.length > 1 ? "s" : ""}</div>
          <div class="dots">${p.colors.map(x => `<i style="background:${x.hex}" title="${x.name}"></i>`).join("")}</div>
        </div>
        <div class="card__price">${money(p.price)}</div>
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
    const subtotal = items.reduce((sum, i) => {
      const p = findProduct(i.id);
      return p ? sum + p.price * i.qty : sum;
    }, 0);
    const { flatRate, freeOver } = catalog.shipping;
    const shipping = subtotal === 0 || subtotal >= freeOver ? 0 : flatRate;
    return { subtotal, shipping, total: subtotal + shipping };
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
          <div class="card__price">${money(p.price * i.qty)}</div>
        </div>`;
      }).join("");
    }
    const t = totals(items);
    $("#bag-subtotal").textContent = money(t.subtotal);
    $("#bag-shipping").textContent = t.subtotal === 0 ? "—" : t.shipping === 0 ? "Free" : money(t.shipping);
    $("#bag-checkout").disabled = !items.length;
    const left = catalog.shipping.freeOver - t.subtotal;
    $("#bag-free").textContent = t.subtotal > 0 && left > 0
      ? `${money(left)} away from free shipping`
      : t.subtotal > 0 ? "You've unlocked free shipping" : `Free shipping over ${money(catalog.shipping.freeOver)}`;
  }

  function changeQty(sku, delta) {
    const items = readBag();
    const hit = items.find(i => i.sku === sku);
    if (!hit) return;
    hit.qty += delta;
    writeBag(items.filter(i => i.qty > 0));
  }

  async function checkout() {
    const items = readBag();
    if (!items.length) return;
    const url = window.FLO_CONFIG && window.FLO_CONFIG.checkoutUrl;
    if (!url) {
      toast("Checkout opens with our first drop. Join the list to hear first.");
      return;
    }
    const btn = $("#bag-checkout");
    btn.disabled = true;
    btn.textContent = "Opening secure checkout…";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(i => ({ sku: i.sku, qty: i.qty })) })
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
      location.href = data.url;
    } catch (err) {
      toast("Something went wrong opening checkout. Please try again.");
      btn.disabled = false;
      btn.textContent = "Checkout";
    }
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

    $$(".signup__form").forEach(form => form.addEventListener("submit", e => {
      e.preventDefault();
      form.nextElementSibling.textContent = "You're on the list. We'll be in touch before the drop.";
      form.reset();
    }));
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
  }

  /* ---------- Pages ---------- */
  function renderHome() {
    const grid = $("#bestsellers");
    if (grid) grid.innerHTML = catalog.products.slice(0, 4).map(card).join("");
    const hero = $("#hero-art");
    if (hero) {
      const p = findProduct("cloud-hoodie");
      hero.innerHTML = garmentSVG(p.type, "#e9e2d6", { front: p.front, back: p.back }, { side: "back", label: "Cloud Hoodie, back" });
    }
    $$("[data-tile]").forEach(el => {
      const [id, colorName] = el.dataset.tile.split(":");
      const p = findProduct(id);
      const c = p.colors.find(x => x.name === colorName) || p.colors[0];
      el.insertAdjacentHTML("afterbegin", garmentSVG(p.type, c.hex, { front: p.front, back: p.back }, { label: p.name }));
    });
    $$("[data-art]").forEach(el => {
      const [id, colorName, side] = el.dataset.art.split(":");
      const p = findProduct(id);
      const c = p.colors.find(x => x.name === colorName) || p.colors[0];
      el.insertAdjacentHTML("afterbegin", garmentSVG(p.type, c.hex, { front: p.front, back: p.back }, { side, label: p.name }));
    });
  }

  function renderShop() {
    const grid = $("#shop-grid");
    if (!grid) return;
    const params = new URLSearchParams(location.search);
    let active = params.get("c") || "all";
    const draw = () => {
      const list = catalog.products.filter(p => active === "all" || p.category === active);
      grid.innerHTML = list.map(card).join("");
      $("#shop-count").textContent = `${list.length} piece${list.length === 1 ? "" : "s"}`;
      $$("[data-filter]").forEach(b => b.setAttribute("aria-pressed", b.dataset.filter === active));
      bindReveal();
    };
    $$("[data-filter]").forEach(b => b.addEventListener("click", () => {
      active = b.dataset.filter;
      history.replaceState(null, "", active === "all" ? "shop.html" : `shop.html?c=${active}`);
      draw();
    }));
    draw();
  }

  function renderProduct() {
    const root = $("#pdp");
    if (!root) return;
    const p = findProduct(new URLSearchParams(location.search).get("id")) || catalog.products[0];
    document.title = `${p.name} — fló`;
    let color = p.colors[0];
    let size = p.sizes.length === 1 ? p.sizes[0] : null;

    const drawGallery = () => {
      const hasBack = p.back !== "none" || p.photos[1];
      $("#pdp-gallery").innerHTML = `
        <div class="pdp__shot slot">${art(p, color, p.lead === "back" ? "back" : "front")}</div>
        <div class="pdp__shot slot">${hasBack ? art(p, color, p.lead === "back" ? "front" : "back") : art(p, color, "front")}</div>
        <div class="pdp__shot pdp__shot--wide slot">${p.photos[2]
          ? `<img class="photo" src="${p.photos[2]}" alt="${p.name} worn" loading="lazy">`
          : garmentSVG(p.type, color.hex, { front: p.front, back: p.back }, { side: hasBack ? "back" : "front" })}</div>`;
    };

    root.querySelector(".pdp__name").textContent = p.name;
    root.querySelector(".pdp__price").textContent = money(p.price);
    root.querySelector(".pdp__desc").textContent = p.description;
    $("#pdp-badge").textContent = p.badge || "fló essentials";
    $("#pdp-details").innerHTML = `<ul>${p.details.map(d => `<li>${d}</li>`).join("")}</ul>`;

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
    });
    $("#pdp-color").textContent = color.name;

    const sizes = $("#pdp-sizes");
    sizes.innerHTML = p.sizes.map(s =>
      `<button class="size" data-size="${s}" aria-pressed="${s === size}">${s}</button>`).join("");
    if (p.sizes.length === 1) sizes.style.gridTemplateColumns = "1fr";
    sizes.addEventListener("click", e => {
      const b = e.target.closest("[data-size]");
      if (!b) return;
      size = b.dataset.size;
      $$(".size", sizes).forEach(s => s.setAttribute("aria-pressed", s === b));
      $("#pdp-add").textContent = `Add to bag — ${money(p.price)}`;
    });

    const add = $("#pdp-add");
    add.textContent = size ? `Add to bag — ${money(p.price)}` : "Select a size";
    add.addEventListener("click", () => {
      if (!size) { toast("Please choose a size."); return; }
      addToBag(p.id, color.name, size);
      openBag();
    });

    const more = catalog.products.filter(x => x.id !== p.id && x.category === p.category)
      .concat(catalog.products.filter(x => x.category !== p.category)).slice(0, 4);
    $("#pdp-more").innerHTML = more.map(card).join("");

    drawGallery();
  }

  function renderSuccess() {
    if (document.body.dataset.page === "success") writeBag([]);
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    bindChrome();
    try {
      await loadCatalog();
    } catch (err) {
      console.error("Could not load products.json — preview the site through a local server, not file://", err);
      return;
    }
    renderHome();
    renderShop();
    renderProduct();
    renderSuccess();
    renderBag();
    bindReveal();
  });
})();
