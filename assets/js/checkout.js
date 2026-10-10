/* Checkout page. In demo mode (no checkoutUrl in config.js) it validates the form
   and creates a local order confirmation without charging anything. Once the
   worker is deployed it hands the bag to Stripe's hosted payment page instead. */
(function () {
  const BAG_KEY = "flo-bag";
  const ORDER_KEY = "flo-last-order";
  const DEMO_CODES = { FLO10: 0.10, WELCOME15: 0.15 };
  const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

  const $ = s => document.querySelector(s);
  const money = n => "$" + n.toFixed(2);
  const live = !!(window.FLO_CONFIG && window.FLO_CONFIG.checkoutUrl);

  let catalog, items, discount = null, shipChoice = "standard";

  const readBag = () => { try { return JSON.parse(localStorage.getItem(BAG_KEY)) || []; } catch { return []; } };
  const product = id => catalog.products.find(p => p.id === id);

  function shipOptions(subtotal) {
    const s = catalog.shipping;
    return [
      { id: "standard", name: "Standard", note: "Made to order · 3–7 business days", price: subtotal >= s.freeOver ? 0 : s.flatRate },
      { id: "express", name: "Express", note: "Made to order · 2–4 business days", price: s.express }
    ];
  }

  function totals() {
    const subtotal = items.reduce((n, i) => n + product(i.id).price * i.qty, 0);
    const off = discount ? Math.round(subtotal * discount.rate * 100) / 100 : 0;
    const ship = shipOptions(subtotal).find(o => o.id === shipChoice).price;
    return { subtotal, off, ship, total: subtotal - off + ship };
  }

  function thumb(p, colorName) {
    const c = p.colors.find(x => x.name === colorName) || p.colors[0];
    const shot = p.lead === "back" ? p.photos[1] || p.photos[0] : p.photos[0];
    if (shot) return `<img class="photo photo--product" src="${shot}" alt="">`;
    const side = p.lead === "back" ? "back" : "front";
    return garmentSVG(p.type, c.hex, { front: p.front, back: p.back }, { side, ink: c.ink, label: p.name });
  }

  function render() {
    $("#co-lines").innerHTML = items.map(i => {
      const p = product(i.id);
      return `<div class="co-line">
        <div class="co-line__img">${thumb(p, i.color)}<span class="co-qty">${i.qty}</span></div>
        <div><div class="line__name">${p.name}</div><div class="line__meta">${i.color} · ${i.size}</div></div>
        <div class="card__price">${money(p.price * i.qty)}</div>
      </div>`;
    }).join("");

    const t = totals();
    $("#ship-options").innerHTML = shipOptions(t.subtotal).map(o => `
      <label class="radio">
        <input type="radio" name="ship" value="${o.id}" ${o.id === shipChoice ? "checked" : ""}>
        <span><b>${o.name}</b><small>${o.note}</small></span>
        <span>${o.price === 0 ? "Free" : money(o.price)}</span>
      </label>`).join("");

    $("#t-sub").textContent = money(t.subtotal);
    $("#t-ship").textContent = t.ship === 0 ? "Free" : money(t.ship);
    $("#t-disc-row").hidden = !discount;
    if (discount) { $("#t-disc").textContent = "−" + money(t.off); $("#t-disc-code").textContent = discount.code; }
    $("#t-total").textContent = money(t.total);
    $("#co-toggle-total").textContent = money(t.total);
    $("#co-pay").textContent = live ? "Continue to secure payment" : `Pay ${money(t.total)}`;
  }

  /* ---------- Validation ---------- */
  function luhn(num) {
    let sum = 0, dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = +num[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      sum += d; dbl = !dbl;
    }
    return num.length >= 13 && sum % 10 === 0;
  }

  function validate(form) {
    const bad = [];
    const mark = (el, ok) => { el.closest(".field").classList.toggle("is-bad", !ok); if (!ok) bad.push(el); };
    form.querySelectorAll("input[required], select[required]").forEach(el => {
      if (live && el.closest("#pay-sec")) return;
      mark(el, el.checkValidity() && el.value.trim() !== "");
    });
    if (!live) {
      mark(form.card, luhn(form.card.value.replace(/\D/g, "")));
      const [mm, yy] = form.exp.value.split("/").map(s => parseInt(s, 10));
      const now = new Date(), expEnd = new Date(2000 + yy, mm, 1);
      mark(form.exp, mm >= 1 && mm <= 12 && expEnd > now);
      mark(form.cvc, /^\d{3,4}$/.test(form.cvc.value));
    }
    return bad;
  }

  /* ---------- Formatting ---------- */
  function bindFormatting(form) {
    form.card.addEventListener("input", () => {
      form.card.value = form.card.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
    });
    form.exp.addEventListener("input", e => {
      let v = form.exp.value.replace(/\D/g, "").slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + " / " + v.slice(2);
      else if (v.length === 2 && e.inputType !== "deleteContentBackward") v += " / ";
      form.exp.value = v;
    });
    form.cvc.addEventListener("input", () => { form.cvc.value = form.cvc.value.replace(/\D/g, "").slice(0, 4); });
    form.querySelectorAll("input, select").forEach(el =>
      el.addEventListener("input", () => el.closest(".field") && el.closest(".field").classList.remove("is-bad")));
  }

  /* ---------- Submit ---------- */
  async function submit(e) {
    e.preventDefault();
    const form = e.target;
    const err = $("#co-error");
    const bad = validate(form);
    if (bad.length) {
      err.textContent = "Please check the highlighted fields.";
      err.hidden = false;
      bad[0].focus();
      return;
    }
    err.hidden = true;
    const btn = $("#co-pay");
    btn.disabled = true;
    btn.textContent = live ? "Opening secure payment…" : "Processing…";

    if (live) {
      try {
        const res = await fetch(window.FLO_CONFIG.checkoutUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: items.map(i => ({ sku: i.sku, qty: i.qty })), shipping: shipChoice, email: form.email.value })
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error);
        location.href = data.url;
      } catch {
        err.textContent = "We couldn't open the payment page. Please try again.";
        err.hidden = false;
        btn.disabled = false;
        render();
      }
      return;
    }

    // demo: pretend to authorise, then record the order locally
    await new Promise(r => setTimeout(r, 1400));
    const t = totals();
    const order = {
      number: "FLO-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
      placed: new Date().toISOString(),
      email: form.email.value,
      ship: {
        name: `${form.first.value} ${form.last.value}`,
        lines: [form.address1.value, form.address2.value, `${form.city.value}, ${form.state.value} ${form.zip.value}`, "United States"].filter(Boolean)
      },
      method: shipOptions(t.subtotal).find(o => o.id === shipChoice),
      card: "•••• " + form.card.value.replace(/\D/g, "").slice(-4),
      items: items.map(i => ({ ...i, name: product(i.id).name, price: product(i.id).price })),
      totals: t,
      discount: discount && discount.code,
      demo: true
    };
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
      localStorage.setItem(BAG_KEY, "[]");
    } catch { /* private mode: the confirmation page falls back to a generic message */ }
    location.href = `success.html?order=${order.number}`;
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#state").innerHTML = `<option value="" disabled selected hidden></option>` + STATES.map(s => `<option>${s}</option>`).join("");
    const res = await fetch("assets/data/products.json?v=" + Date.now());
    catalog = await res.json();
    items = readBag().filter(i => product(i.id));
    if (!items.length) { location.href = "shop.html"; return; }

    $("#co-demo").hidden = live;
    $("#pay-sec").hidden = live;

    const form = $("#co-form");
    bindFormatting(form);
    form.addEventListener("submit", submit);
    $("#ship-options").addEventListener("change", e => { shipChoice = e.target.value; render(); });

    $("#discount-form").addEventListener("submit", e => {
      e.preventDefault();
      const code = $("#code").value.trim().toUpperCase();
      const msg = $("#code-msg");
      if (live) { msg.textContent = "You can enter discount codes on the payment page."; return; }
      if (DEMO_CODES[code]) {
        discount = { code, rate: DEMO_CODES[code] };
        msg.textContent = `${code} applied — ${DEMO_CODES[code] * 100}% off`;
      } else {
        discount = null;
        msg.textContent = code ? "That code isn't valid." : "";
      }
      render();
    });

    $("#co-toggle").addEventListener("click", () => {
      const open = $("#co-summary").classList.toggle("is-open");
      $("#co-toggle").setAttribute("aria-expanded", open);
    });
    document.querySelector("[data-open-bag-link]").addEventListener("click", e => { e.preventDefault(); history.back(); });

    render();
  });
})();
