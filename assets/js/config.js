/* Store settings. */
window.FLO_CONFIG = {
  // "prelaunch": shoppers can browse, but instead of Add to bag they get a "notify me" sign-up,
  //              and the bag and checkout are switched off.
  // "live":      Add to bag and checkout are on (connect the checkout worker first, see README).
  mode: "prelaunch",

  // Once the checkout worker is deployed (see README), paste its URL here and the
  // bag's Checkout button starts taking real payments.
  checkoutUrl: "", // e.g. "https://flo-checkout.yourname.workers.dev/checkout"

  // Where email sign-ups go. Leave empty to use the checkout worker's /subscribe.
  // With neither set, the "notify me" spots point people to TikTok instead.
  signupUrl: "", // e.g. "https://flo-checkout.yourname.workers.dev/subscribe"
  tiktok: "https://www.tiktok.com/@www.floshops.com",
  instagram: "", // add the brand's Instagram here once it exists

  // Launch discount shown in the top banner while the store is live. Create the same
  // code in Stripe (Product catalogue, Coupons, then a promotion code) so it works at payment.
  // Set code to "" to hide it.
  launch: { code: "DROP001", offer: "20% off Drop 001" },

  // Joining the email list gives a personal one-time code for this much off a first order (the worker makes it in
  // Stripe; keep it the same as WELCOME_PERCENT in worker/wrangler.toml). The offer only shows once sign-ups work.
  welcome: { percent: 10 },

  // 1 point per dollar spent on goods. Keep these the same as LOYALTY_THRESHOLD/LOYALTY_PERCENT in
  // worker/wrangler.toml; they're just for the account page's wording, the worker decides the real numbers.
  loyalty: { threshold: 100, percent: 15 },

  // The sign-up pop-up. "home": every time the home page loads, until they join (handy while testing).
  // "occasional": once, a few seconds in, then not again for 14 days after it's closed (gentler for shoppers).
  popup: "home",

  // Reloading any page except checkout goes back to the home page. Set to false to keep people where they were.
  reloadHome: true,

  // "View my orders" on the account page: Stripe's customer portal login link (Stripe Dashboard, Settings, Billing,
  // Customer portal, turn on the login link and paste it here). Empty: the page says orders come after the drop.
  ordersUrl: "https://billing.stripe.com/p/login/test_6oU9AV0km4c45OT5N943S00",

  // Homepage and about-page photos (hero, editorial, about). Drop a file in assets/img and add it here,
  // e.g. hero: "assets/img/hero.jpg". Until then each slot shows an illustration.
  photos: {
    hero: "",
    editorial: "",
    about: ""
  }
};
