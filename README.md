# fló — maison de confort

Storefront for fló: a static site on GitHub Pages, with card payments handled by Stripe and orders made and shipped automatically by Printful.

```
Customer ──► fló site (GitHub Pages) ──► Checkout worker (Cloudflare) ──► Stripe payment page
                                                  ▲                               │ paid
                                                  └──── webhook ◄──────────────────┘
                                                  │
                                                  └──► Printful prints, packs & ships
```

## Editing the store

| What | Where |
| --- | --- |
| Products, prices, colours, sizes, descriptions | `assets/data/products.json` |
| Product photos | add paths to a product's `"photos"` list: `[front, back, lifestyle]` |
| Homepage photos | drop files at `assets/img/hero.jpg`, `tile-tops.jpg`, `tile-bottoms.jpg`, `tile-accessories.jpg`, `editorial.jpg`, `about.jpg` |
| Colours, fonts, spacing | `assets/css/style.css` (tokens at the top) |
| Checkout URL | `assets/js/config.js` |

Until a photo exists, the site draws a clean illustration of the garment in the selected colour, so nothing looks broken.

Preview locally with `python -m http.server` in this folder, then open http://localhost:8000. The site needs a local server, not a double-clicked file.

## Turning on real sales

1. **Printful**: create an account and add a store using *Manual order platform / API*. Design each product. For every variant, set the external ID to the site's SKU, `productid_colour_size`, for example `cloud-hoodie_bone_m` or `signature-cap_onyx_one-size`. If you'd rather not set external IDs, put a `{ "sku": syncVariantId }` map in the `PRINTFUL_VARIANTS` secret instead. Then create a private API token under Settings → API.
2. **Stripe**: create an account, finish business verification, and copy your secret key. Use test mode (`sk_test_…`) first.
3. **Deploy the worker**: install Node.js, then:
   ```
   cd worker
   npx wrangler login
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put PRINTFUL_TOKEN
   npx wrangler deploy
   ```
4. **Stripe webhook**: in Stripe → Developers → Webhooks, add the endpoint `https://<your-worker>.workers.dev/webhook` for the event `checkout.session.completed`. Copy its signing secret, then run `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.
5. Paste `https://<your-worker>.workers.dev/checkout` into `assets/js/config.js` and push.
6. Place a test order with Stripe's test card `4242 4242 4242 4242`. Confirm that a draft order appears in Printful, then switch to live keys and set `PRINTFUL_AUTO_CONFIRM = "true"` once you trust it.

## Custom domain later

Buy the domain, add it under the repo's Settings → Pages → Custom domain, and point the DNS at GitHub Pages. Then update `SITE_URL`, `CATALOG_URL` and `ALLOWED_ORIGINS` in `worker/wrangler.toml` and redeploy the worker.

## Credits

Fonts: Bodoni Moda and Jost, both under the SIL Open Font License, self-hosted in `assets/fonts`.
