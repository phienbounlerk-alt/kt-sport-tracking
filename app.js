const STORAGE_KEY = "order-tracker-mvp-v1";
const SETTINGS_KEY = "order-tracker-settings-v1";
const ADMIN_UNLOCK_KEY = "kt-sport-admin-unlocked";
const ADMIN_PIN = "2026";
const SHARE_IMAGE_MAX_BYTES = 140000;
const SHARE_IMAGE_MAX_EDGE = 900;

const statuses = [
  "ຮັບອໍເດີ້ແລ້ວ",
  "ກວດຂໍ້ມູນ/ໄຟລ໌",
  "ກຳລັງອອກແບບ",
  "ລໍຖ້າອະນຸມັດແບບ",
  "ກຳລັງພິມ/ຜະລິດ",
  "ກຳລັງຕັດ/ຫຍິບ",
  "QC ກວດຄຸນນະພາບ",
  "ແພັກສິນຄ້າ",
  "ພ້ອມຮັບ/ກຳລັງສົ່ງ",
  "ສຳເລັດແລ້ວ",
];

const productTypes = ["ເສື້ອບານ", "ເສື້ອວິ່ງ", "ເສື້ອທີມ", "ເສື້ອພະນັກງານ", "ອື່ນໆ"];
const paymentStatuses = ["ຍັງບໍ່ຈ່າຍ", "ມັດຈຳແລ້ວ", "ຈ່າຍຄົບແລ້ວ"];
const defaultSettings = {
  shopName: "KT SPORT",
  tagline: "ເຄທີສະປອສ · ຮ້ານເສື້ອກິລາ ແລະງານ custom",
  initials: "KT",
  phone: "",
  primaryColor: "#e21d2b",
  accentColor: "#8f111b",
  logoUrl: "assets/kt-sport-logo.jpg",
};

const app = document.querySelector("#app");
let apiOnline = true;

function icon(id) {
  return `<svg class="ico"><use href="#${id}"></use></svg>`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function makeToken() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function makeOrderCode() {
  const date = new Date();
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const tail = String(Math.floor(Math.random() * 900) + 100);
  return `J${y}${m}${d}${tail}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function loadOrders() {
  if (apiOnline) {
    try {
      return (await apiRequest("/api/orders")).map(normalizeOrder);
    } catch {
      apiOnline = false;
      toast("API ບໍ່ພ້ອມ, ກັບໄປໃຊ້ຂໍ້ມູນໃນ browser ຊົ່ວຄາວ");
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved).map(normalizeOrder);

  const seed = [
    {
      id: crypto.randomUUID(),
      token: makeToken(),
      code: "J260523101",
      customerName: "ທີມ ສິງທອງ FC",
      phone: "020 5555 1234",
      productType: "ເສື້ອບານ",
      teamName: "Singthong FC",
      quantity: 24,
      orderDate: today(),
      dueDate: addDays(10),
      statusIndex: 4,
      paymentStatus: "ມັດຈຳແລ້ວ",
      totalAmount: 2400000,
      depositAmount: 1000000,
      mockupImage: "",
      note: "ແບບຖືກອະນຸມັດແລ້ວ ກຳລັງເຂົ້າຂັ້ນຕອນຜະລິດ.",
    },
  ];
  await saveOrders(seed);
  return seed;
}

function normalizeOrder(order) {
  return {
    paymentStatus: paymentStatuses[0],
    totalAmount: 0,
    depositAmount: 0,
    mockupImage: "",
    ...order,
  };
}

async function saveOrders(orders) {
  if (apiOnline) {
    try {
      await apiRequest("/api/orders", { method: "PUT", body: JSON.stringify(orders) });
      return;
    } catch {
      apiOnline = false;
      toast("ບັນທຶກຜ່ານ API ບໍ່ໄດ້, ເກັບໃນ browser ຊົ່ວຄາວ");
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

async function loadSettings() {
  if (apiOnline) {
    try {
      return { ...defaultSettings, ...(await apiRequest("/api/settings")) };
    } catch {
      apiOnline = false;
    }
  }

  const saved = localStorage.getItem(SETTINGS_KEY);
  const settings = saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
  const wasOldDefault = settings.shopName === "JACK SPORT" && settings.initials === "JS";
  if (wasOldDefault) return { ...settings, ...defaultSettings };
  return settings;
}

async function saveSettings(settings) {
  if (apiOnline) {
    try {
      await apiRequest("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
      return;
    } catch {
      apiOnline = false;
      toast("ບັນທຶກ brand ຜ່ານ API ບໍ່ໄດ້, ເກັບໃນ browser ຊົ່ວຄາວ");
    }
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function getOrders() {
  return (await loadOrders()).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function trackingUrl(order) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/track/${order.token}?o=${encodeShareData(publicOrder(order))}`;
}

async function trackingUrlForShare(order) {
  return trackingUrl(await shareReadyOrder(order));
}

function publicOrder(order) {
  const mockupImage = String(order.mockupImage || "");
  return {
    ...order,
    mockupImage: mockupImage.length <= SHARE_IMAGE_MAX_BYTES ? mockupImage : "",
  };
}

async function shareReadyOrder(order) {
  const mockupImage = String(order.mockupImage || "");
  if (!mockupImage || mockupImage.length <= SHARE_IMAGE_MAX_BYTES) return order;
  const compressed = await compressImageSource(mockupImage);
  return { ...order, mockupImage: compressed.length <= SHARE_IMAGE_MAX_BYTES ? compressed : "" };
}

function encodeShareData(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeShareData(value) {
  if (!value) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function loadPublishedOrder(token) {
  if (!token) return null;
  try {
    const response = await fetch(`published/orders/${encodeURIComponent(token)}.json`, { cache: "no-store" });
    if (!response.ok) return null;
    return normalizeOrder(await response.json());
  } catch {
    return null;
  }
}

function whatsappPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("856")) return digits;
  if (digits.startsWith("0")) return `856${digits.slice(1)}`;
  return digits;
}

function whatsappMessage(order) {
  return `ສະບາຍດີ ${order.customerName}, ນີ້ແມ່ນ link ຕິດຕາມອໍເດີ້ ${order.code}: ${trackingUrl(order)}`;
}

function whatsappUrl(order) {
  const phone = whatsappPhone(order.phone);
  const text = encodeURIComponent(whatsappMessage(order));
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

async function whatsappUrlForShare(order) {
  const shareOrder = await shareReadyOrder(order);
  const phone = whatsappPhone(shareOrder.phone);
  const text = encodeURIComponent(`ສະບາຍດີ ${shareOrder.customerName}, ນີ້ແມ່ນ link ຕິດຕາມອໍເດີ້ ${shareOrder.code}: ${trackingUrl(shareOrder)}`);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

function money(value) {
  const amount = Number(value || 0);
  if (!amount) return "-";
  return `${amount.toLocaleString("lo-LA")} LAK`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlSize(value) {
  return Math.ceil(String(value || "").length * 0.75);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function compressImageSource(src) {
  if (!src || dataUrlSize(src) <= SHARE_IMAGE_MAX_BYTES) return src || "";
  const image = await loadImage(src);
  let maxEdge = SHARE_IMAGE_MAX_EDGE;

  for (let pass = 0; pass < 5; pass += 1) {
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (let quality = 0.82; quality >= 0.42; quality -= 0.1) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlSize(dataUrl) <= SHARE_IMAGE_MAX_BYTES) return dataUrl;
    }
    maxEdge = Math.round(maxEdge * 0.82);
  }

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 420 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.38);
}

async function fileToShareImage(file) {
  if (!file) return "";
  const raw = await fileToDataUrl(file);
  return compressImageSource(raw);
}

async function copyText(text, message = "ຄັດລອກແລ້ວ") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  toast(message);
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2200);
}

function shell(content, actions = "", settings = defaultSettings) {
  return `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          ${brandMark(settings)}
          <div>
            <h1>ລະບົບຕິດຕາມອໍເດີ້</h1>
            <p>${h(settings.shopName)} · ${h(settings.tagline)}</p>
          </div>
        </div>
        <div class="top-actions">${actions}</div>
      </header>
      ${content}
    </div>
  `;
}

function brandMark(settings, size = "") {
  const style = `--brand:${h(settings.primaryColor)};--blue:${h(settings.accentColor)}`;
  const className = `brand-mark ${settings.logoUrl ? "with-logo" : ""} ${size}`;
  if (settings.logoUrl) {
    return `<div class="${className}" style="${style}"><img src="${h(settings.logoUrl)}" alt="${h(settings.shopName)} logo" /></div>`;
  }
  return `<div class="${className}" style="${style}">${h(settings.initials)}</div>`;
}

async function renderAdmin() {
  const orders = await getOrders();
  const settings = await loadSettings();
  const selectedId = new URLSearchParams(location.hash.split("?")[1] || "").get("edit");
  const editing = orders.find((order) => order.id === selectedId);

  app.innerHTML = shell(
    `
      <main class="page dashboard-grid grid">
        <div class="grid">
          <section class="panel">
            <div class="section-title">
              <div>
                <h2>ຕັ້ງຄ່າຮ້ານ</h2>
                <p>ປ່ຽນ brand ໃນຫນ້າລູກຄ້າ</p>
              </div>
            </div>
            ${settingsForm(settings)}
          </section>
          <section class="panel">
            <div class="section-title">
              <div>
                <h2>${editing ? "ແກ້ໄຂອໍເດີ້" : "ສ້າງອໍເດີ້ໃໝ່"}</h2>
                <p>ກອກຂໍ້ມູນແລ້ວສົ່ງ link ໃຫ້ລູກຄ້າ</p>
              </div>
            </div>
            ${orderForm(editing)}
          </section>
        </div>
        <section class="panel">
          <div class="section-title">
            <div>
              <h2>ອໍເດີ້ທັງໝົດ</h2>
              <p>${orders.length} ລາຍການໃນລະບົບ</p>
            </div>
          </div>
          <div class="toolbar">
            <label class="searchbox">
              ${icon("icon-search")}
              <input id="searchInput" type="search" placeholder="ຄົ້ນຫາລະຫັດ, ຊື່ລູກຄ້າ, ຊື່ທີມ" />
            </label>
            <div class="filters">
              <select class="select filter-select" id="statusFilter" aria-label="ກັ່ນຕາມສະຖານະ">
                <option value="">ສະຖານະທັງໝົດ</option>
                ${statuses.map((status, index) => `<option value="${index}">${index + 1}. ${status}</option>`).join("")}
              </select>
              <select class="select filter-select" id="paymentFilter" aria-label="ກັ່ນຕາມການຈ່າຍ">
                <option value="">ການຈ່າຍທັງໝົດ</option>
                ${paymentStatuses.map((status) => `<option>${status}</option>`).join("")}
              </select>
              <select class="select filter-select" id="dueFilter" aria-label="ກັ່ນຕາມກຳນົດສົ່ງ">
                <option value="">ກຳນົດສົ່ງທັງໝົດ</option>
                <option value="due7">ໃກ້ກຳນົດ 7 ມື້</option>
                <option value="overdue">ເກີນກຳນົດ</option>
              </select>
            </div>
          </div>
          <div id="filterSummary" class="filter-summary">${orders.length} ລາຍການກຳລັງສະແດງ</div>
          <div id="orderList" class="order-list">${orderRows(orders)}</div>
        </section>
      </main>
    `,
    `<button class="btn primary" id="newOrderBtn">${icon("icon-plus")}ອໍເດີ້ໃໝ່</button>`,
    settings
  );

  bindAdmin();
}

async function renderAdminLock() {
  const settings = await loadSettings();
  app.innerHTML = shell(
    `
      <main class="page">
        <section class="panel admin-lock">
          <div class="section-title">
            <div>
              <h2>ໜ້າ Admin ຖືກລັອກ</h2>
              <p>ໃສ່ PIN ເພື່ອເຂົ້າແກ້ໄຂອໍເດີ້</p>
            </div>
          </div>
          <form id="adminLockForm" class="form-grid compact-form">
            <div class="field full">
              <label>Admin PIN</label>
              <input class="input" name="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="ໃສ່ PIN" autofocus />
            </div>
            <div class="field full">
              <button class="btn primary" type="submit">${icon("icon-link")}ເຂົ້າ Admin</button>
            </div>
          </form>
        </section>
      </main>
    `,
    "",
    settings
  );
  document.querySelector("#adminLockForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = new FormData(event.currentTarget).get("pin");
    if (pin !== ADMIN_PIN) {
      toast("PIN ບໍ່ຖືກ");
      return;
    }
    sessionStorage.setItem(ADMIN_UNLOCK_KEY, "yes");
    await renderAdmin();
  });
}

function settingsForm(settings) {
  const value = (key) => h(settings[key]);
  return `
    <form id="settingsForm" class="form-grid compact-form">
      <div class="field full">
        <label>ຊື່ຮ້ານ</label>
        <input class="input" name="shopName" value="${value("shopName")}" required />
      </div>
      <div class="field full">
        <label>ຄຳອະທິບາຍສັ້ນ</label>
        <input class="input" name="tagline" value="${value("tagline")}" />
      </div>
      <div class="field">
        <label>ຕົວຫຍໍ້ logo</label>
        <input class="input" name="initials" maxlength="4" value="${value("initials")}" />
      </div>
      <div class="field">
        <label>ເບີຮ້ານ</label>
        <input class="input" name="phone" value="${value("phone")}" />
      </div>
      <div class="field">
        <label>ສີຫຼັກ</label>
        <input class="input color-input" name="primaryColor" type="color" value="${value("primaryColor")}" />
      </div>
      <div class="field">
        <label>ສີຮອງ</label>
        <input class="input color-input" name="accentColor" type="color" value="${value("accentColor")}" />
      </div>
      <div class="field full">
        <label>Logo ຮ້ານ</label>
        <input type="hidden" name="logoUrl" value="${value("logoUrl")}" />
        <div class="brand-logo-preview">
          ${brandMark(settings, "large")}
          <span>${h(settings.logoUrl ? "ໃຊ້ logo KT SPORT ແລ້ວ" : "ຍັງບໍ່ມີ logo")}</span>
        </div>
      </div>
      <div class="field full">
        <button class="btn" type="submit">${icon("icon-save")}ບັນທຶກ brand</button>
      </div>
    </form>
  `;
}

function orderForm(order) {
  const value = (key, fallback = "") => h(order?.[key] ?? fallback);
  return `
    <form id="orderForm" class="form-grid">
      <input type="hidden" name="id" value="${value("id")}" />
      <input type="hidden" name="token" value="${value("token")}" />
      <div class="field">
        <label>ລະຫັດອໍເດີ້</label>
        <input class="input" name="code" value="${value("code", makeOrderCode())}" required />
      </div>
      <div class="field">
        <label>ສະຖານະ</label>
        <select class="select" name="statusIndex">
          ${statuses.map((status, index) => `<option value="${index}" ${Number(order?.statusIndex ?? 0) === index ? "selected" : ""}>${index + 1}. ${status}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>ສະຖານະຈ່າຍເງິນ</label>
        <select class="select" name="paymentStatus">
          ${paymentStatuses.map((status) => `<option ${order?.paymentStatus === status || (!order?.paymentStatus && status === paymentStatuses[0]) ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>ຊື່ລູກຄ້າ</label>
        <input class="input" name="customerName" value="${value("customerName")}" required />
      </div>
      <div class="field">
        <label>ເບີໂທ/WhatsApp</label>
        <input class="input" name="phone" value="${value("phone")}" />
      </div>
      <div class="field">
        <label>ປະເພດງານ</label>
        <select class="select" name="productType">
          ${productTypes.map((type) => `<option ${order?.productType === type || (!order?.productType && type === productTypes[0]) ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>ຈຳນວນ</label>
        <input class="input" name="quantity" type="number" min="1" value="${value("quantity", 1)}" />
      </div>
      <div class="field">
        <label>ຊື່ທີມ/ຊື່ງານ</label>
        <input class="input" name="teamName" value="${value("teamName")}" />
      </div>
      <div class="field">
        <label>ວັນທີຮັບອໍເດີ້</label>
        <input class="input" name="orderDate" type="date" value="${value("orderDate", today())}" />
      </div>
      <div class="field">
        <label>ວັນທີຄາດວ່າສຳເລັດ</label>
        <input class="input" name="dueDate" type="date" value="${value("dueDate", addDays(10))}" />
      </div>
      <div class="field">
        <label>ຍອດລວມ (LAK)</label>
        <input class="input" name="totalAmount" type="number" min="0" value="${value("totalAmount", 0)}" />
      </div>
      <div class="field">
        <label>ມັດຈຳ/ຈ່າຍແລ້ວ (LAK)</label>
        <input class="input" name="depositAmount" type="number" min="0" value="${value("depositAmount", 0)}" />
      </div>
      <div class="field full">
        <label>ຮູບ mockup ເສື້ອ</label>
        <input type="hidden" name="mockupImage" value="${value("mockupImage")}" />
        <input class="input" id="mockupInput" name="mockupFile" type="file" accept="image/*" />
        <button id="mockupPreview" class="mockup-preview ${order?.mockupImage ? "has-image" : ""}" type="button" ${order?.mockupImage ? `data-open-mockup="${h(order.mockupImage)}"` : ""}>
          ${order?.mockupImage ? `<img src="${h(order.mockupImage)}" alt="Mockup preview" />` : `<span>ຍັງບໍ່ມີຮູບ mockup</span>`}
        </button>
      </div>
      <div class="field full">
        <label>ຫມາຍເຫດໃຫ້ລູກຄ້າເຫັນ</label>
        <textarea class="textarea" name="note" placeholder="ເຊັ່ນ: ແບບຖືກອະນຸມັດແລ້ວ ກຳລັງເຂົ້າຜະລິດ">${value("note")}</textarea>
      </div>
      <div class="field full">
        <button class="btn primary" type="submit">${icon("icon-save")}${order ? "ບັນທຶກການແກ້ໄຂ" : "ສ້າງອໍເດີ້"}</button>
      </div>
    </form>
  `;
}

function orderRows(orders) {
  if (!orders.length) {
    return `<div class="empty">ຍັງບໍ່ມີອໍເດີ້</div>`;
  }

  return orders.map((order) => `
    <article class="order-row" data-search="${h([order.code, order.customerName, order.teamName, order.phone].join(" ").toLowerCase())}" data-status="${order.statusIndex}" data-payment="${h(order.paymentStatus || paymentStatuses[0])}" data-due="${h(order.dueDate)}">
      <div class="order-main">
        ${order.mockupImage ? `<button class="order-thumb" type="button" data-open-mockup="${h(order.mockupImage)}" aria-label="ເບິ່ງ mockup ${h(order.code)}"><img src="${h(order.mockupImage)}" alt="" /></button>` : ""}
        <h3>${h(order.code)} · ${h(order.customerName)}</h3>
        <div class="meta">
          <span>${h(order.productType)}</span>
          <span>${order.quantity || 0} ໂຕ</span>
          <span>ສົ່ງ: ${formatDate(order.dueDate)}</span>
          <span class="badge">${statuses[order.statusIndex]}</span>
          <span class="badge payment">${h(order.paymentStatus || paymentStatuses[0])}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn icon-only" title="ເບິ່ງຫນ້າລູກຄ້າ" data-track="${order.id}">${icon("icon-eye")}</button>
        <button class="btn icon-only" title="ຄັດລອກ link" data-copy="${order.id}">${icon("icon-copy")}</button>
        <button class="btn icon-only" title="ເປີດ WhatsApp" data-whatsapp="${order.id}">${icon("icon-message")}</button>
        <button class="btn" data-edit="${order.id}">ແກ້ໄຂ</button>
        <button class="btn danger icon-only" title="ລຶບ" data-delete="${order.id}">${icon("icon-trash")}</button>
      </div>
    </article>
  `).join("");
}

function bindAdmin() {
  document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await saveSettings({
      shopName: data.shopName || defaultSettings.shopName,
      tagline: data.tagline || defaultSettings.tagline,
      initials: (data.initials || defaultSettings.initials).toUpperCase(),
      phone: data.phone || "",
      primaryColor: data.primaryColor || defaultSettings.primaryColor,
      accentColor: data.accentColor || defaultSettings.accentColor,
      logoUrl: data.logoUrl || defaultSettings.logoUrl,
    });
    await renderAdmin();
    toast("ບັນທຶກ brand ແລ້ວ");
  });

  document.querySelector("#newOrderBtn").addEventListener("click", () => {
    location.hash = "#/admin";
  });

  document.querySelector("#mockupInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const dataUrl = await fileToShareImage(file);
    document.querySelector('input[name="mockupImage"]').value = dataUrl;
    document.querySelector("#mockupPreview").className = "mockup-preview has-image";
    document.querySelector("#mockupPreview").dataset.openMockup = dataUrl;
    document.querySelector("#mockupPreview").innerHTML = `<img src="${h(dataUrl)}" alt="Mockup preview" />`;
    bindImageModal();
  });

  document.querySelector("#orderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const uploadedMockup = await fileToShareImage(event.currentTarget.mockupFile.files[0]);
    const existingMockup = data.mockupImage ? await compressImageSource(data.mockupImage) : "";
    const orders = await loadOrders();
    const record = {
      ...data,
      id: data.id || crypto.randomUUID(),
      token: data.token || makeToken(),
      statusIndex: Number(data.statusIndex),
      quantity: Number(data.quantity || 0),
      totalAmount: Number(data.totalAmount || 0),
      depositAmount: Number(data.depositAmount || 0),
      mockupImage: uploadedMockup || existingMockup || "",
    };
    delete record.mockupFile;
    const index = orders.findIndex((order) => order.id === record.id);
    if (index >= 0) {
      orders[index] = record;
    } else {
      orders.push(record);
    }
    await saveOrders(orders);
    location.hash = "#/admin";
    await renderAdmin();
    toast("ບັນທຶກອໍເດີ້ແລ້ວ");
  });

  document.querySelector("#searchInput").addEventListener("input", (event) => {
    applyOrderFilters();
  });
  document.querySelector("#searchInput").value = "";
  document.querySelector("#statusFilter").value = "";
  document.querySelector("#paymentFilter").value = "";
  document.querySelector("#dueFilter").value = "";
  document.querySelector("#statusFilter").addEventListener("change", applyOrderFilters);
  document.querySelector("#paymentFilter").addEventListener("change", applyOrderFilters);
  document.querySelector("#dueFilter").addEventListener("change", applyOrderFilters);
  applyOrderFilters();
  bindImageModal();

  document.querySelector("#orderList").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.openMockup) return;
    const orders = await loadOrders();
    const id = button.dataset.edit || button.dataset.copy || button.dataset.track || button.dataset.delete || button.dataset.whatsapp;
    const order = orders.find((item) => item.id === id);
    if (!order) return;

    if (button.dataset.edit) {
      location.hash = `#/admin?edit=${order.id}`;
      await renderAdmin();
    }

    if (button.dataset.track) {
      location.hash = `#/track/${order.token}`;
    }

    if (button.dataset.copy) {
      copyText(await trackingUrlForShare(order), "ຄັດລອກ link ພ້ອມຮູບ mockup ແລ້ວ");
    }

    if (button.dataset.whatsapp) {
      window.open(await whatsappUrlForShare(order), "_blank", "noopener");
    }

    if (button.dataset.delete) {
      if (!confirm(`ລຶບອໍເດີ້ ${order.code}?`)) return;
      await saveOrders(orders.filter((item) => item.id !== order.id));
      await renderAdmin();
      toast("ລຶບອໍເດີ້ແລ້ວ");
    }
  });
}

function applyOrderFilters() {
  const term = document.querySelector("#searchInput").value.trim().toLowerCase();
  const status = document.querySelector("#statusFilter").value;
  const payment = document.querySelector("#paymentFilter").value;
  const due = document.querySelector("#dueFilter").value;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const sevenDays = new Date(now);
  sevenDays.setDate(sevenDays.getDate() + 7);

  let visible = 0;
  document.querySelectorAll(".order-row").forEach((row) => {
    const dueDate = row.dataset.due ? new Date(`${row.dataset.due}T00:00:00`) : null;
    const matchesSearch = !term || row.dataset.search.includes(term);
    const matchesStatus = !status || row.dataset.status === status;
    const matchesPayment = !payment || row.dataset.payment === payment;
    const matchesDue = !due ||
      (due === "due7" && dueDate && dueDate >= now && dueDate <= sevenDays) ||
      (due === "overdue" && dueDate && dueDate < now);
    const show = matchesSearch && matchesStatus && matchesPayment && matchesDue;
    row.hidden = !show;
    if (show) visible += 1;
  });
  document.querySelector("#filterSummary").textContent = `${visible} ລາຍການກຳລັງສະແດງ`;
}

async function renderTracker(token) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const sharedOrder = decodeShareData(params.get("o"));
  const localOrder = (await loadOrders()).find((item) => item.token === token);
  const publishedOrder = await loadPublishedOrder(token);
  const order = localOrder || sharedOrder || publishedOrder
    ? normalizeOrder({
      ...(sharedOrder || {}),
      ...(publishedOrder || {}),
      ...(localOrder || {}),
      mockupImage: publishedOrder?.mockupImage || localOrder?.mockupImage || sharedOrder?.mockupImage || "",
    })
    : null;
  const settings = await loadSettings();
  if (!order) {
    app.innerHTML = `
      <main class="customer-page">
        <div class="customer-wrap">
          <div class="tracking-card">
            <div class="empty">
              <h2>ບໍ່ພົບອໍເດີ້</h2>
              <p>ກວດສອບ link ອີກຄັ້ງ ຫຼືຕິດຕໍ່ຮ້ານ.</p>
            </div>
          </div>
        </div>
      </main>
    `;
    return;
  }

  app.innerHTML = `
    <main class="customer-page">
      <div class="customer-wrap">
        <header class="tracking-header">
          <div class="brand">
            ${brandMark(settings)}
            <div>
              <h1>${h(settings.shopName)}</h1>
              <p>${h(settings.tagline)}</p>
            </div>
          </div>
        </header>
        <article class="tracking-card">
          <section class="jersey-hero">
            ${mockupBlock(order)}
            <div class="hero-copy">
              <span class="badge">${statuses[order.statusIndex]}</span>
              <span class="badge payment">${h(order.paymentStatus || paymentStatuses[0])}</span>
              <h2>${h(order.teamName || order.customerName)}</h2>
              <p>ອໍເດີ້ ${h(order.code)} ຂອງທ່ານກຳລັງດຳເນີນງານຕາມຂັ້ນຕອນດ້ານລຸ່ມ.</p>
              <a class="btn blue contact-btn" href="${h(whatsappUrl(order))}" target="_blank" rel="noopener">${icon("icon-message")}ສົ່ງ WhatsApp</a>
            </div>
          </section>
          <section class="tracking-body">
            <div class="detail-grid">
              <div class="detail"><span>ລູກຄ້າ</span><strong>${h(order.customerName)}</strong></div>
              <div class="detail"><span>ຈຳນວນ</span><strong>${order.quantity || 0} ໂຕ</strong></div>
              <div class="detail"><span>ຄາດວ່າສຳເລັດ</span><strong>${formatDate(order.dueDate)}</strong></div>
              <div class="detail"><span>ຍອດລວມ</span><strong>${money(order.totalAmount)}</strong></div>
              <div class="detail"><span>ຈ່າຍແລ້ວ</span><strong>${money(order.depositAmount)}</strong></div>
              <div class="detail"><span>ສະຖານະຈ່າຍເງິນ</span><strong>${h(order.paymentStatus || paymentStatuses[0])}</strong></div>
            </div>
            <div>
              <div class="section-title">
                <div>
                  <h3>ສະຖານະອໍເດີ້</h3>
                  <p>ອັບເດດຫຼ້າສຸດຈາກທີມງານ</p>
                </div>
              </div>
              <div class="status-strip">${statusTimeline(order.statusIndex)}</div>
            </div>
            <div class="detail">
              <span>ຫມາຍເຫດຈາກຮ້ານ</span>
              <strong>${h(order.note || "ບໍ່ມີຫມາຍເຫດເພີ່ມເຕີມ")}</strong>
            </div>
          </section>
        </article>
      </div>
    </main>
  `;
  bindImageModal();
}

function mockupBlock(order) {
  if (order.mockupImage) {
    return `
      <button class="mockup-art" type="button" data-open-mockup="${h(order.mockupImage)}" aria-label="ເບິ່ງ mockup ຂະໜາດໃຫຍ່">
        <img src="${h(order.mockupImage)}" alt="Mockup ເສື້ອ ${h(order.code)}" />
      </button>
    `;
  }
  return `
    <div class="jersey-art" aria-hidden="true">
      <div class="shirt"><div class="shirt-number">${String(order.quantity || "10").slice(0, 2)}</div></div>
    </div>
  `;
}

function bindImageModal() {
  document.querySelectorAll("[data-open-mockup]").forEach((button) => {
    if (button.dataset.modalBound) return;
    button.dataset.modalBound = "true";
    button.addEventListener("click", () => openImageModal(button.dataset.openMockup));
  });
}

function openImageModal(src) {
  if (!src) return;
  const old = document.querySelector(".image-modal");
  if (old) old.remove();
  const modal = document.createElement("div");
  modal.className = "image-modal";
  modal.innerHTML = `
    <div class="image-modal-backdrop" data-close-modal></div>
    <div class="image-modal-panel" role="dialog" aria-modal="true" aria-label="Mockup preview">
      <button class="btn icon-only image-modal-close" type="button" data-close-modal aria-label="ປິດ">×</button>
      <img src="${h(src)}" alt="Mockup preview" />
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", () => modal.remove());
  });
}

function statusTimeline(current) {
  return statuses.map((status, index) => {
    const state = index < current ? "done" : index === current ? "active" : "";
    return `
      <div class="status-step ${state}">
        <div class="step-dot">${index < current ? "✓" : index + 1}</div>
        <div>
          <strong>${status}</strong>
          <div class="meta">${index === current ? "ກຳລັງດຳເນີນງານຂັ້ນຕອນນີ້" : index < current ? "ສຳເລັດແລ້ວ" : "ລໍຖ້າຂັ້ນຕອນຕໍ່ໄປ"}</div>
        </div>
      </div>
    `;
  }).join("");
}

async function router() {
  const hash = location.hash || "#/admin";
  if (hash.startsWith("#/track/")) {
    await renderTracker(hash.replace("#/track/", "").split("?")[0]);
  } else if (sessionStorage.getItem(ADMIN_UNLOCK_KEY) !== "yes") {
    await renderAdminLock();
  } else {
    await renderAdmin();
  }
}

window.addEventListener("hashchange", router);
router();
