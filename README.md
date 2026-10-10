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
| Products, prices, colours, sizes, descriptions | `assets/data/products.json` |
| Product photos | add paths to a product's `"photos"` list: `[front, back, lifestyle]` |
| Homepage photos | drop files in `assets/img` and list them under `photos` in `assets/js/config.js` (slots: hero, tile-tops, tile-bottoms, tile-accessories, editorial, about) |
| Colours, fonts, spacing | `assets/css/style.css` (tokens at the top) |
| Checkout URL, photos | `assets/js/config.js` |

After changing CSS or JS, bump the `?v=` number on the `<link>` and `<script>` tags in every page so browsers fetch the new files.

Until a photo exists, the site draws a clean illustration of the garment in the selected colour, so nothing looks broken.

Preview locally with `python -m http.server` in this folder, then open http://localhost:8000. The site needs a local server, not a double-clicked file.

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
