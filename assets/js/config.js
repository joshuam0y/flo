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
  // With neither set, the "notify me" spots point people to Instagram instead.
  signupUrl: "", // e.g. "https://flo-checkout.yourname.workers.dev/subscribe"
  instagram: "https://www.instagram.com/jomohoops/",

  // Launch discount shown in the top banner while the store is live. Create the same
  // code in Stripe (Product catalogue, Coupons, then a promotion code) so it works at payment.
  // Set code to "" to hide it.
  launch: { code: "DROP001", offer: "15% off Drop 001" },

  // Homepage and about-page photos (hero, editorial, about). Drop a file in assets/img and add it here,
  // e.g. hero: "assets/img/hero.jpg". Until then each slot shows an illustration.
  photos: {
    hero: "",
    editorial: "",
    about: ""
  }
};
