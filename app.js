const productionSteps = [
  { key: "PRODUCTION_ORDER", label: "ອອກບິນຜະລິດ", icon: "▤" },
  { key: "PATTERN", label: "ກຳລັງຂຶ້ນແພັດເທິ້ນ", icon: "□" },
  { key: "PRINTING", label: "ກຳລັງພິມ", icon: "▣" },
  { key: "HEAT_TRANSFER", label: "ກຳລັງລີດລົງຜ້າ", icon: "⚙" },
  { key: "CUTTING", label: "ກຳລັງຕັດ", icon: "✂" },
  { key: "SEWING", label: "ກຳລັງຍິບ", icon: "⚒" },
  { key: "QC", label: "QC", icon: "✓" },
  { key: "READY_TO_COMPLETE", label: "ຢືນຢັນລູກຄ້າຮັບເຄື່ອງ", icon: "▢" },
  { key: "COMPLETED", label: "ສຳເລັດ", icon: "⚑" },
];

const pad = (value) => String(value).padStart(2, "0");

const formatDateTime = (value) => {
  if (!value) return "ກຳລັງປະເມີນ...";
  const date = new Date(value);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const formatDate = (value) => {
  if (!value) return "ກຳລັງປະເມີນ...";
  const date = new Date(value);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const currency = (value) =>
  new Intl.NumberFormat("lo-LA", {
    style: "currency",
    currency: "LAK",
    maximumFractionDigits: 0,
  }).format(value);

const statusLabel = (status) =>
  productionSteps.find((step) => step.key === status)?.label || status;

const statusIcon = (status) =>
  productionSteps.find((step) => step.key === status)?.icon || "•";

const depositBadge = (status) => {
  const paid = status === "PAID" || status === "PAID_FULL";
  return `<span class="badge ${paid ? "paid" : "pending"}">${
    paid ? "ຈ່າຍເຕັມຈຳນວນ" : "ຍັງຄ້າງຊຳລະ"
  }</span>`;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

let activeOrder = null;

function publicBaseUrl() {
  if (window.KT_PUBLIC_BASE_URL) return window.KT_PUBLIC_BASE_URL.replace(/\/+$/, "");
  if (window.location.protocol === "file:") return "http://localhost:4173";
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `http://${window.location.host}`;
  }
  return window.location.origin;
}

function trackingUrl(code) {
  return `${publicBaseUrl()}/?code=${encodeURIComponent(code)}`;
}

function renderOrder(order) {
  if (!order) return;
  const currentIndex = productionSteps.findIndex((step) => step.key === order.productionStatus);
  const currentHistory = order.productionHistory.find(
    (item) => item.status === order.productionStatus,
  );

  const mainImage = document.querySelector("#mainProductImage");
  mainImage.src = order.productImage;
  mainImage.onerror = () => {
    mainImage.onerror = null;
    mainImage.src = "./assets/kt-sport-logo.jpg";
  };
  document.querySelector("#currentIcon").textContent = statusIcon(order.productionStatus);
  document.querySelector("#currentStatusLabel").textContent = statusLabel(order.productionStatus);
  document.querySelector("#currentStatusTime").textContent = currentHistory
    ? formatDateTime(currentHistory.createdAt)
    : "-";
  const progress = Math.max(0, Math.round(((currentIndex + 1) / productionSteps.length) * 100));
  document.querySelector("#progressFill").style.width = `${progress}%`;
  document.querySelector("#progressText").textContent = `${progress}% ຂອງຂະບວນການ`;

  document.querySelector("#stepsList").innerHTML = productionSteps
    .map((step, index) => {
      const history = order.productionHistory.find((item) => item.status === step.key);
      const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "wait";
      const marker = index <= currentIndex ? "✓" : index + 1;
      return `
        <li class="step ${state}">
          <span class="step-marker">${marker}</span>
          <span class="step-content">
            <strong><span class="step-symbol">${step.icon}</span>${step.label}</strong>
            <small>${history ? formatDateTime(history.createdAt) : ""}</small>
          </span>
          ${index < productionSteps.length - 1 ? '<span class="step-connector"></span>' : ""}
        </li>
      `;
    })
    .join("");

  const total = order.products.reduce((sum, item) => sum + item.totalPrice, 0);
  document.querySelector("#orderDetails").innerHTML = `
    <dt>ເລກບິນ:</dt><dd>${escapeHtml(order.code)}</dd>
    <dt>ວັນທີສັ່ງຊື້:</dt><dd>${formatDateTime(order.createdAt)}</dd>
    <dt>ວັນທີຮັບເຄື່ອງ:</dt><dd>${formatDate(order.receiveDate)}</dd>
    <dt>ສະຖານະມັດຈຳ:</dt><dd>${depositBadge(order.depositStatus)}</dd>
    <dt>ຊື່ຜູ້ສັ່ງຊື້:</dt><dd>${escapeHtml(order.customerName)}</dd>
    <dt>ເບີໂທລະສັບ:</dt><dd>${escapeHtml(order.phone)}</dd>
    <dt>ທີ່ຢູ່ຈັດສົ່ງ:</dt><dd>${escapeHtml(order.addressCf)}</dd>
    <dt>ລວມຍອດ:</dt><dd>${currency(total)}</dd>
  `;
  document.querySelector("#trackingUrlInput").value = trackingUrl(order.code);
  document.querySelector("#quickSummary").innerHTML = `
    <div><span>ສະຖານະ</span><strong>${escapeHtml(statusLabel(order.productionStatus))}</strong></div>
    <div><span>ສິນຄ້າ</span><strong>${order.products.length}</strong></div>
    <div><span>ລວມຍອດ</span><strong>${currency(total)}</strong></div>
  `;
  document.querySelector("#publicHistoryList").innerHTML = (order.productionHistory || [])
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(statusLabel(item.status))}</strong>
          <span>${formatDateTime(item.createdAt)}</span>
          ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
        </li>
      `,
    )
    .join("");

  document.querySelector("#productList").innerHTML = order.products
    .map((item) => {
      const images = (Array.isArray(item.images) && item.images.length ? item.images : [item.image])
        .filter(Boolean)
        .slice(0, 10);
      const gifts = item.freeGifts?.length
        ? `<div class="product-meta">ຂອງແຖມ: ${item.freeGifts
            .map((gift) => `${gift.size} x${gift.qty}`)
            .join(", ")}</div>`
        : "";
      return `
        <li class="product-item">
          <div class="product-row">
            <img src="${images[0] || item.image}" alt="${escapeHtml(item.productName)}" onerror="this.src='./assets/kt-sport-logo.jpg'" />
            <div>
              <strong>${escapeHtml(item.productName)}</strong>
              <div class="product-meta">ໄຊ້/ຈຳນວນ: ${escapeHtml(item.shopSize)}</div>
              <div class="product-meta">ຈຳນວນລວມ: ${escapeHtml(item.amount)}</div>
              ${gifts}
              <div class="customer-gallery">
                ${images
                  .map(
                    (image) => `
                      <a href="${escapeHtml(image)}" target="_blank">
                        <img src="${escapeHtml(image)}" alt="${escapeHtml(item.productName)}" onerror="this.src='./assets/kt-sport-logo.jpg'" />
                      </a>
                    `,
                  )
                  .join("")}
              </div>
            </div>
            <div class="product-price">${currency(item.totalPrice)}</div>
          </div>
        </li>
      `;
    })
    .join("");

}

function setPublicNotice(message, tone = "muted") {
  const notice = document.querySelector("#publicNotice");
  notice.textContent = message;
  notice.dataset.tone = tone;
}

async function loadOrder(code) {
  const response = await fetch(`/api/orders/${encodeURIComponent(code)}`);
  if (!response.ok) {
    throw new Error(response.status === 404 ? "ORDER_NOT_FOUND" : "LOAD_FAILED");
  }
  const result = await response.json();
  activeOrder = result.data;
  renderOrder(activeOrder);
  setPublicNotice("ດຶງຂໍ້ມູນສຳເລັດ", "success");
}

async function copyPublicLink() {
  const link = document.querySelector("#trackingUrlInput").value;
  try {
    await navigator.clipboard.writeText(link);
    setPublicNotice("Copy tracking link ສຳເລັດ", "success");
  } catch {
    document.querySelector("#trackingUrlInput").select();
    setPublicNotice("ກົດ Ctrl/Cmd+C ເພື່ອ copy link", "muted");
  }
}

function setup() {
  document.querySelector("#searchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = document.querySelector("#orderCodeInput").value.trim().toUpperCase();
    try {
      await loadOrder(code);
    } catch {
      setPublicNotice("ບໍ່ພົບເລກບິນນີ້", "error");
    }
  });

  document.querySelector("#copyPublicLinkButton").addEventListener("click", copyPublicLink);
  const queryCode = new URLSearchParams(window.location.search).get("code");
  if (queryCode) {
    document.querySelector("#orderCodeInput").value = queryCode.toUpperCase();
  }
  loadOrder(document.querySelector("#orderCodeInput").value.trim().toUpperCase()).catch(() => {
    setPublicNotice("ດຶງຂໍ້ມູນບໍ່ໄດ້ ກວດເລກບິນອີກຄັ້ງ", "error");
  });
}

setup();
