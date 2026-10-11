# flò · maison de confort

Storefront for flò: a static site on GitHub Pages, with card payments handled by Stripe and orders made and shipped automatically by Printify.

```
Customer ──► flò site (GitHub Pages) ──► Checkout worker (Cloudflare) ──► Stripe payment page
                                                  ▲                               │ paid
                                                  └──── webhook ◄──────────────────┘
                                                  │
                                                  └──► Printify prints, packs & ships
```

## Editing the store

| What | Where |
| --- | --- |
| Products, prices, colours, sizes, descriptions | `assets/data/products.json` (add `"hidden": true` to take a product off the site without deleting it; add `"flag": "reason"` to show it as a Concept that can't be bought, with the reason kept here) |
| Product photos | add paths to a product's `"photos"` list: `[front, back, lifestyle]` |
| Homepage photos | drop files in `assets/img` and list them under `photos` in `assets/js/config.js` (slots: hero, editorial, about) |
| Colours, fonts, spacing | `assets/css/style.css` (tokens at the top) |
| Store mode (pre-launch or live), checkout URL, sign-ups, launch code, photos | `assets/js/config.js` |
| Shipping, refund, privacy and terms | `policies.html` |
| Print artwork (sources and Printify-ready files) | `artwork/` (see `artwork/README.md`) |

After changing CSS or JS, bump the `?v=` number on the `<link>` and `<script>` tags in every page so browsers fetch the new files.

Until a photo exists, the site draws a clean illustration of the garment in the selected colour, so nothing looks broken.

Preview locally with `python -m http.server` in this folder, then open http://localhost:8000. The site needs a local server, not a double-clicked file.

## Pre-launch and launch day

The store starts in pre-launch mode (`mode: "prelaunch"` in `assets/js/config.js`): people can browse every product and price, but there's no bag or checkout. Product pages and the homepage offer a "notify me" sign-up instead, or point to Instagram until the email list is connected (step 7 below). This is the version to link from Instagram and TikTok.

On drop day, once the steps below are done and a test order has worked:

1. In Stripe, create the launch code: Product catalogue, Coupons, a 15% coupon, then a promotion code `DROP001` with an end date two weeks out. Make friend codes the same way (10% each, one per person) to see who sends sales.
2. Set `mode: "live"` in `assets/js/config.js` and push. The top banner switches to "15% off Drop 001 with code DROP001", and Add to bag and checkout turn on.

## Promos, the welcome code and My orders

- **Welcome code:** joining the email list (homepage, product pages or the account page) asks the checkout worker for a personal code, like `WELCOME-7K2QXF`, for `WELCOME_PERCENT` (20%) off a first order. The worker creates the coupon in Stripe the first time, then one promotion code per email: single use, first-time customers only, expiring after `WELCOME_DAYS` (60). The code shows on screen and is saved on that device (account page, checkout). With the SUBSCRIBERS KV namespace bound, signing up again with the same email shows the same code. Change the percent in both `worker/wrangler.toml` and `welcome` in `assets/js/config.js`.
- **Promo codes:** create them in Stripe (Product catalogue, Coupons, then promotion codes); customers type them on Stripe's payment page. Stripe takes one code per order, so a welcome code and a launch code can't be combined.
- **My orders:** every order creates a Stripe customer and an invoice, so customers can see past orders and receipts in Stripe's customer portal. In Stripe: Settings, Billing, Customer portal, turn on the login link, and paste it into `ordersUrl` in `assets/js/config.js`. The account page's "View my orders" button then opens it; customers sign in with their email and a one-time code. Stripe may charge a small fee per invoice; check Stripe's Invoicing pricing.
- **Promotional emails (Brevo, free):** sign-ups from the pop-up and every other sign-up form go to a Brevo list, with their welcome code saved on the contact (WELCOME_CODE, WELCOME_PERCENT, WELCOME_EXPIRES). In Brevo: create a list (note its number), create those three contact attributes (Contacts, Settings, Contact attributes; text), make an API key (SMTP & API, API keys), then `npx wrangler secret put BREVO_API_KEY` and set `BREVO_LIST_ID` in `worker/wrangler.toml`. Send promotions as Brevo campaigns, and set up a welcome automation (when a contact is added to the list) that includes `{{ contact.WELCOME_CODE }}`. US law (CAN-SPAM) needs a postal address in marketing emails; a P.O. box works.
- **Sign-up pop-up:** shows once, 6 seconds into a visit, not on checkout or the account page, not for anyone who already joined, and not again for 14 days after it's closed. Before sign-ups are connected it points to Instagram instead.
- **Points-style rewards** (points per order, redeemed for codes) aren't built yet; they'd need a small database on Cloudflare.

## Turning on real sales

1. **Printify**: in Printify, add a store connected through the API option (Manage my stores, Add new store, then API). Make each product in that store, the way the Palm Springs Tee was made; if the Palm Springs Tee lives in a different Printify store, copy it over. For every variant, set its SKU to the site's SKU, `productid_colour_size`, for example `palm-springs-tee_black_m` or `cloud-hoodie_bone_m`, then publish the product. If you'd rather not edit SKUs, put a `{ "sku": { "product_id": "...", "variant_id": 12345 } }` map in the `PRINTIFY_VARIANTS` secret instead. Then create a personal access token under My account, Connections, with the orders scopes. Your shop ID is the number in the store's address in Printify, or the `id` from `https://api.printify.com/v1/shops.json`.
2. **Stripe**: create an account, finish business verification, and copy your secret key. Use test mode (`sk_test_…`) first.
3. **Deploy the worker**: install Node.js, then:
   ```
   cd worker
   npx wrangler login
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put PRINTIFY_TOKEN
   npx wrangler secret put PRINTIFY_SHOP_ID
   npx wrangler deploy
   ```
4. **Stripe webhook**: in Stripe, Developers, Webhooks, add the endpoint `https://<your-worker>.workers.dev/webhook` for the event `checkout.session.completed`. Copy its signing secret, then run `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.
5. Paste `https://<your-worker>.workers.dev/checkout` into `assets/js/config.js` and push.
6. Place a test order with Stripe's test card `4242 4242 4242 4242`. Confirm the order appears in Printify under *On hold*, then switch to live keys and set `PRINTIFY_AUTO_SEND = "true"` in `worker/wrangler.toml` once you trust it.
7. **Email sign-ups (optional)**: run `npx wrangler kv namespace create SUBSCRIBERS`, paste the id into `worker/wrangler.toml` where it says, uncomment those lines and redeploy. To see who signed up: `npx wrangler kv key list --binding SUBSCRIBERS`. Until then the sign-up form says sign-ups open soon.

Discount codes: once checkout is live, create them in Stripe (Product catalogue, Coupons, then a promotion code). The `FLO10` and `WELCOME15` codes only work in demo mode.

## Custom domain later

Buy the domain, add it under the repo's Settings → Pages → Custom domain, and point the DNS at GitHub Pages. Then update `SITE_URL`, `CATALOG_URL` and `ALLOWED_ORIGINS` in `worker/wrangler.toml` and redeploy the worker.

## Credits

Fonts: Bodoni Moda and Jost, both under the SIL Open Font License, self-hosted in `assets/fonts`.
