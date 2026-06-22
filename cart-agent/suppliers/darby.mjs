// Darby Dental buying-agent adapter.
//
// Darby (darbydental.com) runs Magento 2 with a Hyvä (Tailwind + Alpine) theme.
// The flow:
//   1. Log in at /customer/account/login/ so the cart binds to the practice's
//      account. Magento persists the cart server-side, so the buyer sees it when
//      they later log in themselves — that's the handoff model.
//   2. For each line, open the stored product URL and click "Add to Cart",
//      setting the quantity field first. Add-to-cart is GATED BEHIND LOGIN: an
//      unauthenticated add redirects to /customer/account/login/loginrequired/,
//      which we detect as an auth failure rather than a silent miss. Out-of-stock
//      products hide the add button / show an out-of-stock label, also detected.
//   3. Return the cart URL for the buyer to open.
//
// Selectors confirmed live (logged-out) against darbydental.com 2026-06-22:
//   login form #login-form (username #form-login-username, password
//   #form-login-password, submit button[name="send"]); PDP add button
//   #product-addtocart-button in form #product_addtocart_form; qty input[name="qty"].
// The LOGGED-IN indicator and the post-add success toast can only be seen with a
// real account, so those candidate selectors are best-effort and MUST be
// confirmed headful on the NUC first run (CART_AGENT_HEADFUL=1) per the README.

const LOGIN_URL = "https://www.darbydental.com/customer/account/login/";
const CART_URL = "https://www.darbydental.com/checkout/cart/";

const SEL = {
  email: [
    "#form-login-username",
    '#login-form input[name="username"]',
    '#header-form-login-username',
    'input[name="username"]',
    'input[type="email"]',
  ],
  password: [
    "#form-login-password",
    '#login-form input[name="password"]',
    "#header-form-login-password",
    'input[name="password"]',
  ],
  loginSubmit: [
    '#login-form button[name="send"]',
    '#login-form button[type="submit"]',
    'button:has-text("Sign In")',
  ],
  // Logged-in chrome: Magento exposes a "Sign Out" / account link once authed.
  loggedIn: [
    'a[href*="customer/account/logout"]',
    'a[href*="logout"]',
    '.my-account-mini-header[href*="customer/account"]:not([href*="login"])',
  ],
  qty: ['input[name="qty"]', "#product_addtocart_form input[name='qty']"],
  addToCart: [
    "#product-addtocart-button",
    '#product_addtocart_form button[type="submit"]',
    'button[title="Add to Cart"]',
  ],
  outOfStock: [
    "text=/out of stock/i",
    ".stock.unavailable",
    'button[disabled]#product-addtocart-button',
  ],
  // Magento renders a success message after a logged-in add; the minicart also
  // stops reading "Cart is empty". Either confirms the line landed.
  addConfirm: [
    ".message.success",
    ".messages .message-success",
    'text=/added .*to your (shopping )?cart/i',
    '[role="alert"]:has-text("cart")',
  ],
};

async function firstVisible(scope, selectors, timeout = 8000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const sel of selectors) {
      const loc = scope.locator(sel).first();
      if (await loc.count().catch(() => 0)) {
        if (await loc.isVisible().catch(() => false)) return loc;
      }
    }
    if (Date.now() > deadline) return null;
    await scope.waitForTimeout(250);
  }
}

async function isPresent(scope, selectors, timeout = 1500) {
  return Boolean(await firstVisible(scope, selectors, timeout));
}

export async function login(page, { username, password }) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

  // Already authenticated (cookie reuse) — nothing to do.
  if (await isPresent(page, SEL.loggedIn, 2000)) return;

  const email = await firstVisible(page, SEL.email);
  const pass = await firstVisible(page, SEL.password);
  if (!email || !pass) throw new Error("login form not found");
  await email.fill(username);
  await pass.fill(password);

  const submit = await firstVisible(page, SEL.loginSubmit);
  if (!submit) throw new Error("login submit not found");
  await submit.click();

  // Success = the logged-in chrome appears. A visible password field still
  // present after a beat means the credentials were rejected.
  await page.waitForTimeout(2500);
  if (!(await isPresent(page, SEL.loggedIn, 6000))) {
    const err = new Error("login failed — credentials rejected or blocked");
    err.code = "auth_failed";
    throw err;
  }
}

// Add one line to the cart. Returns { status, note }.
export async function addLine(page, line) {
  await page.goto(line.productUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

  if (await isPresent(page, SEL.outOfStock, 2500)) {
    return { status: "out_of_stock", note: "" };
  }

  const add = await firstVisible(page, SEL.addToCart, 8000);
  if (!add) {
    return { status: "not_found", note: "no add-to-cart control on page" };
  }

  const qty = await firstVisible(page, SEL.qty, 1500);
  if (qty && line.qty > 1) {
    // Alpine syncs the reactive qty via @input/@change, which fill() fires.
    await qty.fill(String(line.qty));
  }

  await add.click();

  // An unauthenticated add bounces to the login-required page — the session
  // lapsed mid-build, so surface it as an auth failure rather than a soft miss.
  await page.waitForTimeout(1500);
  if (/\/customer\/account\/login\/loginrequired/i.test(page.url())) {
    const err = new Error("session lost — add-to-cart requires login");
    err.code = "auth_failed";
    throw err;
  }

  // Confirm the add landed; Magento shows a success message / minicart update.
  if (await isPresent(page, SEL.addConfirm, 6000)) {
    return { status: "added", note: "" };
  }
  // No confirmation surfaced — treat as a soft failure so the buyer re-checks.
  return { status: "failed", note: "add-to-cart not confirmed" };
}

export const cartUrl = CART_URL;
