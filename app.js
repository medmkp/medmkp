const lineItems = [
  {
    product: "Resistance Band Roll, Yellow",
    extractedFrom: "TheraBand Yellow 50 yd",
    qty: 12,
    unit: "rolls",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 48.2,
    neededBy: "May 24",
    status: "Parsed",
    outreach: "4 / 5",
    selected: {
      supplier: "Rehab Supply Co.",
      unitPrice: 42.5,
      total: 510,
      reason: "Exact brand, 2-day delivery",
    },
    lowest: "Clinical Direct · $39.90",
    fastest: "OrthoPro · 1 day",
    bestValue: "Rehab Supply Co. · $42.50",
  },
  {
    product: "Kinesiology Tape, Beige",
    extractedFrom: "K-tape beige 6 pack",
    qty: 18,
    unit: "cases",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 62.75,
    neededBy: "May 24",
    status: "Needs review",
    outreach: "3 / 5",
    selected: {
      supplier: "MotionMed",
      unitPrice: 58.25,
      total: 1048.5,
      reason: "Fastest delivery, vetted brand",
    },
    lowest: "Summit Therapy · $52.40",
    fastest: "MotionMed · 1 day",
    bestValue: "MotionMed · $58.25",
  },
  {
    product: "Reusable Electrodes, 2 x 2",
    extractedFrom: "Reusable electrodes 2x2",
    qty: 20,
    unit: "packs",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 38.4,
    neededBy: "May 28",
    status: "Parsed",
    outreach: "5 / 5",
    selected: {
      supplier: "NeuroStim Supply",
      unitPrice: 34.2,
      total: 684,
      reason: "Exact spec, top reliability",
    },
    lowest: "MotionMed · $29.95",
    fastest: "NeuroStim · 1 day",
    bestValue: "NeuroStim · $34.20",
  },
  {
    product: "Exam Table Paper, Smooth",
    extractedFrom: "Table paper smooth, 12 rolls",
    qty: 10,
    unit: "cases",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 71.1,
    neededBy: "May 30",
    status: "Parsed",
    outreach: "4 / 5",
    selected: {
      supplier: "Clinical Direct",
      unitPrice: 63.5,
      total: 635,
      reason: "Lowest total with 2-day delivery",
    },
    lowest: "OrthoPro · $60.80",
    fastest: "Rehab Supply Co. · 1 day",
    bestValue: "Clinical Direct · $63.50",
  },
  {
    product: "Nitrile Exam Gloves, Medium",
    extractedFrom: "Nitrile gloves M",
    qty: 24,
    unit: "boxes",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 9.6,
    neededBy: "May 30",
    status: "Alternative",
    outreach: "5 / 5",
    selected: {
      supplier: "PrimeMed Distributors",
      unitPrice: 8.75,
      total: 210,
      reason: "Vetted equivalent, lower unit cost",
    },
    lowest: "PrimeMed · $8.75",
    fastest: "HealthPro · 2 days",
    bestValue: "PrimeMed · $8.75",
  },
  {
    product: "Reusable Cold Pack, Standard",
    extractedFrom: "Cold pack standard 12 pack",
    qty: 9,
    unit: "cases",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 83.25,
    neededBy: "Jun 2",
    status: "Parsed",
    outreach: "3 / 5",
    selected: {
      supplier: "OrthoPro Wholesale",
      unitPrice: 72,
      total: 648,
      reason: "Best value, sufficient stock",
    },
    lowest: "Summit Therapy · $68.50",
    fastest: "Rehab Supply Co. · 1 day",
    bestValue: "OrthoPro · $72.00",
  },
];

const suppliers = [
  { name: "Rehab Supply Co.", signal: "EIN verified · PT catalog · 97% on-time" },
  { name: "Clinical Direct", signal: "ACH ready · 2-day Southeast lanes" },
  { name: "NeuroStim Supply", signal: "Electrotherapy specialist · certificate current" },
  { name: "PrimeMed Distributors", signal: "Thomasnet sourced · glove alternatives" },
  { name: "OrthoPro Wholesale", signal: "Bulk therapy equipment · stock confirmed" },
];

const orderSteps = [
  { label: "Approved", detail: "Buyer approved quote", done: true },
  { label: "PO sent", detail: "Supplier orders placed", done: true },
  { label: "Supplier confirmed", detail: "Awaiting confirmations", done: false },
  { label: "Shipped", detail: "Tracking pending", done: false },
  { label: "Reorder reminder", detail: "Scheduled for 30 days", done: false },
];

let activeOrderStep = 1;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const byId = (id) => document.getElementById(id);

function statusClass(status) {
  if (status === "Parsed") return "success";
  if (status === "Alternative" || status === "Needs review") return "warning";
  return "info";
}

function setView(view) {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });

  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  byId(`${view}View`).classList.add("active");
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMobileMenu() {
  document.body.classList.remove("menu-open");
  document.querySelector("[data-menu-toggle]")?.setAttribute("aria-expanded", "false");
}

function renderExtractedRows() {
  byId("extractedRows").innerHTML = lineItems
    .map((item) => {
      return `
        <tr>
          <td><strong>${item.product}</strong><br><span>${item.extractedFrom}</span></td>
          <td>${item.qty}</td>
          <td>${item.unit}</td>
          <td>${item.oldVendor}</td>
          <td>${money.format(item.oldUnitPrice)}</td>
          <td><span class="status-chip ${statusClass(item.status)}">${item.status}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderAdminRows() {
  byId("adminRows").innerHTML = lineItems
    .map((item) => {
      return `
        <tr>
          <td><strong>${item.product}</strong><br><span>${item.qty} ${item.unit}</span></td>
          <td>${item.extractedFrom}</td>
          <td>${item.outreach}</td>
          <td>${item.neededBy}</td>
          <td><span class="status-chip ${statusClass(item.status)}">${item.status}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderSupplierList() {
  byId("supplierList").innerHTML = suppliers
    .map((supplier) => {
      return `
        <div class="supplier-card">
          <strong>${supplier.name}</strong>
          <span>${supplier.signal}</span>
        </div>
      `;
    })
    .join("");
}

function renderQuoteRows() {
  byId("quoteRows").innerHTML = lineItems
    .map((item) => {
      return `
        <tr>
          <td><strong>${item.product}</strong><br><span>${item.qty} ${item.unit}</span></td>
          <td>${item.bestValue}</td>
          <td>${item.lowest}</td>
          <td>${item.fastest}</td>
          <td><span class="status-chip success">${item.selected.supplier}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderApprovalRows() {
  byId("approvalRows").innerHTML = lineItems
    .map((item) => {
      return `
        <tr>
          <td><strong>${item.product}</strong><br><span>${item.qty} ${item.unit}</span></td>
          <td>${item.selected.supplier}</td>
          <td>${money.format(item.selected.total)}</td>
          <td>${item.selected.reason}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTimeline() {
  byId("orderTimeline").innerHTML = orderSteps
    .map((step, index) => {
      const state = index <= activeOrderStep ? "done" : "pending";
      return `
        <div class="timeline-step ${state}">
          <div class="timeline-dot">${index + 1}</div>
          <div>
            <strong>${step.label}</strong>
            <span>${step.detail}</span>
          </div>
        </div>
      `;
    })
    .join("");

  byId("orderState").textContent = orderSteps[activeOrderStep].label;
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function bindEvents() {
  document.querySelector("[data-menu-toggle]").addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("menu-open");
    document.querySelector("[data-menu-toggle]").setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelectorAll("[data-view], [data-view-link]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view || button.dataset.viewLink));
  });

  byId("simulateUpload").addEventListener("click", () => {
    showToast("Invoice parsed into 6 normalized line items");
    setView("admin");
  });

  byId("sendRfqs").addEventListener("click", () => {
    showToast("RFQs sent to 5 vetted suppliers");
    setView("quote");
  });

  byId("approveQuote").addEventListener("click", () => {
    showToast("Quote approved. PO sent to suppliers.");
    activeOrderStep = 1;
    renderTimeline();
    setView("order");
  });

  byId("advanceOrder").addEventListener("click", () => {
    activeOrderStep = Math.min(activeOrderStep + 1, orderSteps.length - 1);
    renderTimeline();
    showToast(`Order moved to ${orderSteps[activeOrderStep].label}`);
  });
}

function init() {
  renderExtractedRows();
  renderAdminRows();
  renderSupplierList();
  renderQuoteRows();
  renderApprovalRows();
  renderTimeline();
  bindEvents();
}

init();
