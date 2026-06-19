// DC Dental buying-agent adapter.
//
// DC Dental runs NetSuite SuiteCommerce Advanced (SCA). The flow:
//   1. Log in at the account page so the cart binds to the practice's account
//      (SCA persists the cart server-side, so the buyer sees it when they later
//      log in themselves — that's the whole handoff model).
//   2. For each line, open the stored product URL and click "Add to Cart",
//      bumping the quantity field first. SCA renders an out-of-stock product
//      with a disabled add button + an "Out of Stock" label, which we detect so
//      the line is reported rather than silently skipped.
//   3. Return the cart URL for the buyer to open.
//
// SELECTORS BELOW ARE BEST-EFFORT and must be confirmed against the live site on
// first run (SCA themes vary). They're isolated here so tuning one supplier
// never touches the runner. Each is tried in order; the first match wins.

const LOGIN_URL = "https://www.dcdental.com/login-register";
const CART_URL = "https://www.dcdental.com/cart";

const SEL = {
  email: ['input[name="email"]', 'input[type="email"]', "#login-email"],
  password: ['input[name="password"]', 'input[type="password"]', "#login-password"],
  loginSubmit: [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Log In")',
    'button:has-text("Sign In")',
  ],
  loggedIn: ['a[href*="logout"]', 'a:has-text("Log Out")', ".account-menu"],
  qty: ['input[name="quantity"]', 'input.quantity', '[data-action="quantity"] input'],
  addToCart: [
    'button[data-action="add-to-cart"]',
    'button:has-text("Add to Cart")',
    'button.add-to-cart',
  ],
  outOfStock: [
    'text=/out of stock/i',
    '.product-views-out-of-stock-message',
    'button[disabled]:has-text("Add to Cart")',
  ],
  addConfirm: [".global-views-message-success", "text=/added to (your )?cart/i"],
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
    await qty.fill(String(line.qty));
  }

  await add.click();
  // Confirm the add landed; SCA shows a success toast / mini-cart update.
  if (await isPresent(page, SEL.addConfirm, 6000)) {
    return { status: "added", note: "" };
  }
  // No confirmation surfaced — treat as a soft failure so the buyer re-checks.
  return { status: "failed", note: "add-to-cart not confirmed" };
}

export const cartUrl = CART_URL;
