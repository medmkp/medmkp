const products = [
  {
    id: "theraband-yellow",
    name: "Resistance Band Roll, Yellow",
    category: "Therapy Exercise",
    unit: "50 yd roll",
    score: 94,
    tags: ["best value", "PT staple"],
    offers: [
      { seller: "Rehab Supply Co.", price: 42.5, deliveryDays: 2, rating: 4.8, stock: 68 },
      { seller: "Clinical Direct", price: 39.9, deliveryDays: 5, rating: 4.6, stock: 120 },
      { seller: "OrthoPro Wholesale", price: 44.0, deliveryDays: 1, rating: 4.9, stock: 22 },
    ],
  },
  {
    id: "kinesiology-tape",
    name: "Kinesiology Tape, Beige",
    category: "Taping",
    unit: "6-pack case",
    score: 91,
    tags: ["fast ship"],
    offers: [
      { seller: "MotionMed", price: 58.25, deliveryDays: 1, rating: 4.7, stock: 41 },
      { seller: "Rehab Supply Co.", price: 55.1, deliveryDays: 3, rating: 4.8, stock: 35 },
      { seller: "Summit Therapy", price: 52.4, deliveryDays: 4, rating: 4.4, stock: 76 },
    ],
  },
  {
    id: "electrodes-2x2",
    name: "Reusable Electrodes, 2 x 2",
    category: "Electrotherapy",
    unit: "40-pack",
    score: 88,
    tags: ["clinic favorite"],
    offers: [
      { seller: "Clinical Direct", price: 31.75, deliveryDays: 2, rating: 4.5, stock: 91 },
      { seller: "NeuroStim Supply", price: 34.2, deliveryDays: 1, rating: 4.9, stock: 48 },
      { seller: "MotionMed", price: 29.95, deliveryDays: 6, rating: 4.2, stock: 200 },
    ],
  },
  {
    id: "cold-pack-standard",
    name: "Reusable Cold Pack, Standard",
    category: "Hot & Cold Therapy",
    unit: "12-pack",
    score: 86,
    tags: ["bulk savings"],
    offers: [
      { seller: "OrthoPro Wholesale", price: 72.0, deliveryDays: 2, rating: 4.7, stock: 27 },
      { seller: "Summit Therapy", price: 68.5, deliveryDays: 5, rating: 4.3, stock: 88 },
      { seller: "Rehab Supply Co.", price: 74.25, deliveryDays: 1, rating: 4.8, stock: 16 },
    ],
  },
  {
    id: "massage-lotion",
    name: "Clinical Massage Lotion",
    category: "Treatment Room",
    unit: "1 gal, 4-pack",
    score: 84,
    tags: ["low scent"],
    offers: [
      { seller: "MotionMed", price: 49.0, deliveryDays: 3, rating: 4.7, stock: 34 },
      { seller: "Clinical Direct", price: 46.9, deliveryDays: 4, rating: 4.4, stock: 58 },
      { seller: "Summit Therapy", price: 52.1, deliveryDays: 2, rating: 4.6, stock: 21 },
    ],
  },
  {
    id: "exam-table-paper",
    name: "Exam Table Paper, Smooth",
    category: "Treatment Room",
    unit: "12 rolls",
    score: 82,
    tags: ["reorder common"],
    offers: [
      { seller: "Clinical Direct", price: 63.5, deliveryDays: 2, rating: 4.5, stock: 110 },
      { seller: "Rehab Supply Co.", price: 66.75, deliveryDays: 1, rating: 4.8, stock: 44 },
      { seller: "OrthoPro Wholesale", price: 60.8, deliveryDays: 6, rating: 4.1, stock: 180 },
    ],
  },
];

const adminQueue = [
  {
    title: "Seller SKU THERA-Y-50 needs category confirmation",
    detail: "Likely maps to Resistance Band Roll, Yellow. Confidence 92%.",
    risk: "Medium",
  },
  {
    title: "Duplicate electrode listing detected",
    detail: "Three sellers submitted 2 x 2 reusable electrodes with inconsistent pack sizes.",
    risk: "High",
  },
  {
    title: "Massage lotion compliance doc expires soon",
    detail: "Seller MotionMed certificate expires in 21 days.",
    risk: "Low",
  },
];

let state = {
  view: "buyer",
  search: "",
  category: "All categories",
  sort: "best",
  cart: JSON.parse(localStorage.getItem("medmkp-cart") || "[]"),
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const byId = (id) => document.getElementById(id);

function bestOffer(product) {
  return [...product.offers].sort((a, b) => {
    const aScore = a.price * 0.55 + a.deliveryDays * 4 - a.rating * 3;
    const bScore = b.price * 0.55 + b.deliveryDays * 4 - b.rating * 3;
    return aScore - bScore;
  })[0];
}

function filteredProducts() {
  const query = state.search.toLowerCase().trim();
  let list = products.filter((product) => {
    const matchesQuery = !query || `${product.name} ${product.category}`.toLowerCase().includes(query);
    const matchesCategory = state.category === "All categories" || product.category === state.category;
    return matchesQuery && matchesCategory;
  });

  return list.sort((a, b) => {
    if (state.sort === "price") return bestOffer(a).price - bestOffer(b).price;
    if (state.sort === "delivery") return bestOffer(a).deliveryDays - bestOffer(b).deliveryDays;
    if (state.sort === "rating") return bestOffer(b).rating - bestOffer(a).rating;
    return b.score - a.score;
  });
}

function renderCategories() {
  const select = byId("categoryFilter");
  const categories = ["All categories", ...new Set(products.map((product) => product.category))];
  select.innerHTML = categories.map((category) => `<option>${category}</option>`).join("");
  select.value = state.category;
}

function productCard(product) {
  const offers = [...product.offers]
    .sort((a, b) => {
      if (state.sort === "delivery") return a.deliveryDays - b.deliveryDays;
      if (state.sort === "rating") return b.rating - a.rating;
      return a.price - b.price;
    })
    .map((offer) => {
      return `
        <div class="offer-row">
          <div>
            <strong>${offer.seller}</strong>
            <span>${money.format(offer.price)} · ${offer.deliveryDays}d · ${offer.stock} in stock · ${offer.rating}★</span>
          </div>
          <button data-add="${product.id}" data-seller="${offer.seller}" title="Add offer">Add</button>
        </div>
      `;
    })
    .join("");

  return `
    <article class="product-card">
      <div class="product-image">
        <div class="product-visual" aria-hidden="true"></div>
        <div class="product-score">${product.score}</div>
      </div>
      <div class="product-body">
        <div class="product-title-row">
          <h3>${product.name}</h3>
          <span class="badge">${product.tags[0]}</span>
        </div>
        <p class="product-meta">${product.category} · ${product.unit}</p>
        <div class="offer-list">${offers}</div>
      </div>
    </article>
  `;
}

function renderProducts() {
  const list = filteredProducts();
  byId("resultCount").textContent = list.length;
  byId("productGrid").innerHTML = list.map(productCard).join("");
}

function renderCart() {
  const items = byId("cartItems");
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  byId("cartCount").textContent = count;
  byId("cartTotal").textContent = money.format(total);
  byId("approvalState").textContent = total > 500 ? "Approval needed" : "Ready";

  if (!state.cart.length) {
    items.innerHTML = `<div class="cart-empty">Compare offers, then add the best seller option.</div>`;
    return;
  }

  items.innerHTML = state.cart
    .map((item) => {
      return `
        <div class="cart-item">
          <div>
            <strong>${item.name}</strong>
            <span>${item.seller} · Qty ${item.quantity}</span>
          </div>
          <strong>${money.format(item.price * item.quantity)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderSeller() {
  const rows = products
    .flatMap((product) => product.offers.map((offer) => ({ product, offer })))
    .slice(0, 8)
    .map(({ product, offer }, index) => {
      const needsReview = index === 2 || index === 6;
      return `
        <tr>
          <td><strong>${product.name}</strong><br><span>${offer.seller}</span></td>
          <td>${offer.stock}</td>
          <td>${money.format(offer.price)}</td>
          <td>${offer.deliveryDays} days</td>
          <td class="${needsReview ? "status-review" : "status-live"}">${needsReview ? "Review" : "Live"}</td>
        </tr>
      `;
    })
    .join("");

  byId("sellerRows").innerHTML = rows;
}

function renderAdmin() {
  byId("adminQueue").innerHTML = adminQueue
    .map((item) => {
      return `
        <article class="queue-card">
          <div class="queue-title">
            <div>
              <h3>${item.title}</h3>
              <p>${item.detail}</p>
            </div>
            <span class="badge">${item.risk}</span>
          </div>
          <div class="queue-actions">
            <button data-toast="Approved catalog match">Approve</button>
            <button data-toast="Sent back to seller">Request fix</button>
            <button data-toast="Merged duplicate listing">Merge</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function persistCart() {
  localStorage.setItem("medmkp-cart", JSON.stringify(state.cart));
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  byId(`${view}View`).classList.add("active");

  const titles = {
    buyer: "Find the best clinical supplies",
    seller: "Operate a trusted seller storefront",
    admin: "Keep the marketplace catalog clean",
  };
  byId("viewTitle").textContent = titles[view];
}

function addToCart(productId, seller) {
  const product = products.find((item) => item.id === productId);
  const offer = product.offers.find((item) => item.seller === seller);
  const existing = state.cart.find((item) => item.productId === productId && item.seller === seller);

  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({
      productId,
      seller,
      name: product.name,
      price: offer.price,
      quantity: 1,
    });
  }

  persistCart();
  renderCart();
  showToast(`${product.name} added from ${seller}`);
}

function bindEvents() {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });

  byId("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderProducts();
  });

  byId("categoryFilter").addEventListener("change", (event) => {
    state.category = event.target.value;
    renderProducts();
  });

  byId("sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderProducts();
  });

  byId("productGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    addToCart(button.dataset.add, button.dataset.seller);
  });

  byId("clearCart").addEventListener("click", () => {
    state.cart = [];
    persistCart();
    renderCart();
    showToast("Cart cleared");
  });

  byId("submitOrder").addEventListener("click", () => {
    if (!state.cart.length) {
      showToast("Add at least one offer before submitting");
      return;
    }
    showToast("Buy order submitted for review");
  });

  byId("addOffer").addEventListener("click", () => showToast("Offer intake form is next MVP slice"));
  byId("approveAll").addEventListener("click", () => showToast("Clean catalog matches approved"));

  byId("adminQueue").addEventListener("click", (event) => {
    const button = event.target.closest("[data-toast]");
    if (button) showToast(button.dataset.toast);
  });
}

function init() {
  renderCategories();
  renderProducts();
  renderCart();
  renderSeller();
  renderAdmin();
  bindEvents();
}

init();
