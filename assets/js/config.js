/* Store settings. */
window.FLO_CONFIG = {
  // "prelaunch": shoppers can browse, but instead of Add to bag they get a "notify me" sign-up,
  //              and the bag and checkout are switched off.
  // "live":      Add to bag and checkout are on (connect the checkout worker first, see README).
  mode: "prelaunch",

  // The checkout worker's base URL. Powers sign-ups, loyalty and the contact form right away,
  // even in prelaunch - only the "live" mode above (and checkoutUrl below) gates actual buying.
  workerUrl: "https://flo-checkout.joshuamoy.workers.dev",

  // Once you're ready to take real payments, paste "<workerUrl>/checkout" here and switch mode
  // to "live" above - that's what turns on Add to bag.
  checkoutUrl: "", // e.g. "https://flo-checkout.yourname.workers.dev/checkout"

  // Where email sign-ups go. Leave empty to use workerUrl's /subscribe.
  // With neither workerUrl nor signupUrl set, the "notify me" spots point people to TikTok instead.
  signupUrl: "", // e.g. "https://flo-checkout.yourname.workers.dev/subscribe"
  tiktok: "https://www.tiktok.com/@www.floshops.com",
  instagram: "https://www.instagram.com/flo_shops/",

  // Launch discount shown in the top banner while the store is live. Create the same
  // code in Stripe (Product catalogue, Coupons, then a promotion code) so it works at payment.
  // Set code to "" to hide it.
  launch: { code: "DROP001", offer: "10% off Drop 001" },

  // Joining the email list gives a personal one-time code for this much off a first order (the worker makes it in
  // Stripe; keep it the same as WELCOME_PERCENT in worker/wrangler.toml). The offer only shows once sign-ups work.
  welcome: { percent: 10 },

  // 1 point per dollar spent on goods. Keep these the same as LOYALTY_THRESHOLD/LOYALTY_PERCENT in
  // worker/wrangler.toml; they're just for the account page's wording, the worker decides the real numbers.
  loyalty: { threshold: 100, percent: 10 },

  // The sign-up pop-up. "always": the full-screen takeover, every page load, every visitor - even
  // someone already on the list (what's live now). "corner": a small card that hovers bottom-right,
  // not blocking the page. "occasional": the full takeover instead, once, then not for 14 days.
  // "home": full pop-up every home load, only useful while testing.
  popup: "always",

  // Reloading any page except checkout goes back to the home page. Set to false to keep people where they were.
  reloadHome: true,

  // "View my orders" on the account page: Stripe's customer portal login link (Stripe Dashboard, Settings, Billing,
  // Customer portal, turn on the login link and paste it here). Empty: the page says orders come after the drop.
  ordersUrl: "https://billing.stripe.com/p/login/test_6oU9AV0km4c45OT5N943S00",

  // Real sign-in (magic link, no password). Our own, through workerUrl's /auth/request and
  // /auth/verify - no third-party auth vendor, so nothing but flò ever shows in the browser or email.
  // Separate from "mode" above on purpose: flip this on to test the real thing (go to account.html,
  // sign in with your own email, confirm the link works) without also turning on Add to bag.
  signIn: { enabled: false },

  // Homepage and about-page photos (hero, editorial, about). Drop a file in assets/img and add it here,
  // e.g. hero: "assets/img/hero.jpg". Until then each slot shows an illustration.
  photos: {
    hero: "assets/img/lifestyle/palm-springs-tee-2.webp?v=1",
    editorial: "assets/img/lifestyle/forward-crew-1.webp?v=3",
    about: "assets/img/lifestyle/apparel-crew-1.webp?v=3"
  }
};
