const defaultProductImage =
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=220&q=80";

const productionSteps = [
  { key: "PRODUCTION_ORDER", label: "ອອກບິນຜະລິດ" },
  { key: "PATTERN", label: "ກຳລັງຂຶ້ນແພັດເທິ້ນ" },
  { key: "PRINTING", label: "ກຳລັງພິມ" },
  { key: "HEAT_TRANSFER", label: "ກຳລັງລີດລົງຜ້າ" },
  { key: "CUTTING", label: "ກຳລັງຕັດ" },
  { key: "SEWING", label: "ກຳລັງຍິບ" },
  { key: "QC", label: "QC" },
  { key: "READY_TO_COMPLETE", label: "ຢືນຢັນລູກຄ້າຮັບເຄື່ອງ" },
  { key: "COMPLETED", label: "ສຳເລັດ" },
];

let orders = [];
let activeCode = null;
let settings = { adminNames: Array.from({ length: 10 }, (_, index) => `Admin ${index + 1}`), shopPhone: "8562077728239" };
let activeMenu = "ALL";
let catalogItems = [];
let catalogSearch = "";
let filters = {
  search: "",
  status: "ALL",
  deposit: "ALL",
};

const emptyProduct = () => ({
  productName: "",
  shopSize: "",
  amount: 1,
  price: 0,
  totalPrice: 0,
  image: defaultProductImage,
  images: [defaultProductImage],
  freeGifts: [],
});

const emptyOrder = () => ({
  code: "",
  depositStatus: "PENDING",
  assignedAdmin: settings.adminNames[0],
  customerName: "",
  phone: "",
  addressCf: "",
  receiveDate: null,
  products: [emptyProduct()],
});

const money = (value) =>
  new Intl.NumberFormat("lo-LA", {
    style: "currency",
    currency: "LAK",
    maximumFractionDigits: 0,
  }).format(value || 0);

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const pad = (value) => String(value).padStart(2, "0");

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const statusLabel = (status) =>
  productionSteps.find((step) => step.key === status)?.label || status || "-";

const depositLabel = (status) => (status === "PAID_FULL" || status === "PAID" ? "ຈ່າຍເຕັມ" : "ຄ້າງຊຳລະ");

function setAdminNotice(message, tone = "muted") {
  const notice = document.querySelector("#adminPageNotice");
  notice.textContent = message;
  notice.dataset.tone = tone;
}

function setCatalogNotice(message, tone = "muted") {
  setAdminNotice(message, tone);
}

async function ensureSession() {
  const response = await fetch("/api/session");
  const result = await response.json();
  if (!result.authenticated) {
    window.location.href = "/login.html";
  }
}

function trackingUrl(code) {
  const configuredUrl = window.KT_PUBLIC_BASE_URL ? window.KT_PUBLIC_BASE_URL.replace(/\/+$/, "") : "";
  if (configuredUrl) return `${configuredUrl}/?code=${encodeURIComponent(code)}`;
  if (window.location.protocol === "file:") return `http://localhost:4173/?code=${encodeURIComponent(code)}`;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `http://${window.location.host}/?code=${encodeURIComponent(code)}`;
  }
  return `${window.location.origin}/?code=${encodeURIComponent(code)}`;
}

function totalFor(order) {
  return (order.products || []).reduce((sum, product) => sum + Number(product.totalPrice || 0), 0);
}

function renderAssignedAdminSelect(selected = settings.adminNames[0]) {
  const select = document.querySelector("#assignedAdminInput");
  select.innerHTML = settings.adminNames
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("");
  select.value = settings.adminNames.includes(selected) ? selected : settings.adminNames[0];
}

function activeOrder() {
  return orders.find((order) => order.code === activeCode) || null;
}

function filteredOrders() {
  const search = filters.search.trim().toLowerCase();
  return orders.filter((order) => {
    const matchesSearch =
      !search ||
      [order.code, order.customerName, order.phone, order.addressCf]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    const matchesStatus = filters.status === "ALL" || order.productionStatus === filters.status;
    const matchesDeposit = filters.deposit === "ALL" || order.depositStatus === filters.deposit;
    const matchesAdmin = activeMenu === "ALL" || activeMenu === "CATALOG" || order.assignedAdmin === activeMenu;
    return matchesSearch && matchesStatus && matchesDeposit && matchesAdmin;
  });
}

function renderAdminMenu() {
  const counts = settings.adminNames.map((name) => orders.filter((order) => order.assignedAdmin === name).length);
  document.querySelector("#adminMenuTabs").innerHTML = [
    `<button class="admin-menu-tab ${activeMenu === "ALL" ? "active" : ""}" data-admin-menu="ALL" type="button">
      <strong>ອໍເດີ້ທັງໝົດ</strong><span>${orders.length}</span>
    </button>`,
    ...settings.adminNames.map(
      (name, index) => `
        <div class="admin-menu-tab admin-name-tab ${activeMenu === name ? "active" : ""}" data-admin-menu="${escapeHtml(name)}">
          <input data-admin-name-index="${index}" value="${escapeHtml(name)}" aria-label="Admin ${index + 1}" />
          <button type="button" data-admin-menu="${escapeHtml(name)}">${counts[index]}</button>
        </div>
      `,
    ),
    `<button class="admin-menu-tab ${activeMenu === "CATALOG" ? "active" : ""}" data-admin-menu="CATALOG" type="button">
      <strong>ສິນຄ້າ 500</strong><span>${catalogItems.length || 500}</span>
    </button>`,
  ].join("");
}

function setAdminView(menu) {
  activeMenu = menu;
  const catalogMode = activeMenu === "CATALOG";
  document.querySelector("#ordersPanel").hidden = catalogMode;
  document.querySelector("#orderEditorPanel").hidden = catalogMode;
  document.querySelector("#catalogPanel").hidden = !catalogMode;
  document.querySelector("#newOrderButton").hidden = catalogMode;
  renderAdminMenu();
  if (catalogMode) {
    renderCatalogEditor();
  } else {
    renderOrdersList();
  }
}

function renderStats() {
  const totalOrders = orders.length;
  const activeOrders = orders.filter((order) => order.productionStatus !== "COMPLETED").length;
  const completedOrders = orders.filter((order) => order.productionStatus === "COMPLETED").length;
  const pendingPayments = orders.filter((order) => order.depositStatus === "PENDING").length;
  const totalValue = orders.reduce((sum, order) => sum + totalFor(order), 0);

  document.querySelector("#adminStats").innerHTML = [
    ["ບິນທັງໝົດ", totalOrders],
    ["ກຳລັງຜະລິດ", activeOrders],
    ["ສຳເລັດ", completedOrders],
    ["ຄ້າງຊຳລະ", pendingPayments],
    ["ມູນຄ່າລວມ", money(totalValue)],
    ["Admin", activeMenu === "ALL" || activeMenu === "CATALOG" ? "ທັງໝົດ" : activeMenu],
  ]
    .map(
      ([label, value]) => `
        <article class="stat-tile">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderOrdersList() {
  const list = document.querySelector("#ordersList");
  const visibleOrders = filteredOrders();
  renderStats();
  renderAdminMenu();

  if (!visibleOrders.length) {
    list.innerHTML = `<p class="empty-state">ບໍ່ພົບບິນທີ່ກົງກັບ filter</p>`;
    return;
  }

  list.innerHTML = visibleOrders
    .map(
      (order) => `
        <button class="order-list-item ${order.code === activeCode ? "active" : ""}" data-code="${order.code}" type="button">
          <strong>${escapeHtml(order.code)}</strong>
          <span>${escapeHtml(order.customerName || "ບໍ່ລະບຸຊື່")} · ${money(totalFor(order))}</span>
          <small>${escapeHtml(order.assignedAdmin || "Admin 1")} · ${escapeHtml(statusLabel(order.productionStatus))} · ${escapeHtml(depositLabel(order.depositStatus))}</small>
        </button>
      `,
    )
    .join("");
}

function renderWorkflow(order) {
  const currentStatus = order?.productionStatus || "PRODUCTION_ORDER";
  document.querySelector("#workflowCurrentBadge").textContent = statusLabel(currentStatus);
  document.querySelector("#workflowStatusSelect").value = currentStatus;
  document.querySelector("#updateWorkflowButton").disabled = !order?.code;
  document.querySelector("#workflowNoteInput").disabled = !order?.code;
  document.querySelector("#workflowStatusSelect").disabled = !order?.code;

  const history = Array.isArray(order?.productionHistory) ? order.productionHistory : [];
  document.querySelector("#workflowHistory").innerHTML = history.length
    ? history
        .map(
          (item) => `
            <li>
              <strong>${escapeHtml(statusLabel(item.status))}</strong>
              <span>${formatDateTime(item.createdAt)}</span>
              ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
            </li>
          `,
        )
        .join("")
    : `<li class="empty-state">ຍັງບໍ່ມີ history</li>`;
}

function renderProducts(products) {
  document.querySelector("#productsEditor").innerHTML = products
    .map((product, index) => {
      const images = (Array.isArray(product.images) && product.images.length ? product.images : [product.image])
        .filter(Boolean)
        .slice(0, 10);
      const primaryImage = images[0] || defaultProductImage;
      return `
        <div class="product-editor" data-index="${index}">
          <div class="product-editor-head">
            <strong>ສິນຄ້າ ${index + 1}</strong>
            <button type="button" data-remove-product="${index}" title="Remove">×</button>
          </div>
          <div class="form-grid">
            <label>
              ຊື່ສິນຄ້າ
              <input data-product-field="productName" value="${escapeHtml(product.productName)}" required />
            </label>
            <label>
              ໄຊ້/ຈຳນວນ
              <input data-product-field="shopSize" value="${escapeHtml(product.shopSize)}" placeholder="M x2, L x3" />
            </label>
            <label>
              ຈຳນວນ
              <input data-product-field="amount" type="number" min="1" value="${product.amount || 1}" />
            </label>
            <label>
              ລາຄາ/ຊິ້ນ
              <input data-product-field="price" type="number" min="0" value="${product.price || 0}" />
            </label>
            <label class="full-span">
              ຮູບສິນຄ້າ URL
              <input data-product-field="image" value="${escapeHtml(primaryImage)}" />
              <input data-product-field="images" type="hidden" value="${escapeHtml(JSON.stringify(images))}" />
            </label>
            <div class="image-upload-row full-span">
              <div class="upload-preview-grid">
                ${images
                  .map(
                    (image, imageIndex) => `
                      <div class="upload-thumb">
                        <img src="${escapeHtml(image)}" alt="Product preview ${imageIndex + 1}" />
                        <button type="button" data-remove-image="${index}:${imageIndex}" title="Remove image">×</button>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
              <label>
                Upload ຮູບສິນຄ້າ 4K ສູງສຸດ 10 ຮູບ
                <input data-product-upload="${index}" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
              </label>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadProductImage(input) {
  const files = [...(input.files || [])].slice(0, 10);
  if (!files.length) return;
  const editor = input.closest(".product-editor");
  const imagesInput = editor.querySelector('[data-product-field="images"]');
  const currentImages = JSON.parse(imagesInput.value || "[]");
  const availableSlots = Math.max(0, 10 - currentImages.length);
  const selectedFiles = files.slice(0, availableSlots);

  if (!selectedFiles.length) {
    setAdminNotice("ອັບໄດ້ສູງສຸດ 10 ຮູບຕໍ່ສິນຄ້າ", "error");
    input.value = "";
    return;
  }
  if (selectedFiles.some((file) => file.size > 25_000_000)) {
    setAdminNotice("ຮູບໃຫຍ່ເກີນ 25MB ຕໍ່ຮູບ", "error");
    input.value = "";
    return;
  }

  setAdminNotice(`ກຳລັງ upload ${selectedFiles.length} ຮູບ...`, "muted");
  const uploadedUrls = [];

  for (const file of selectedFiles) {
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!response.ok) {
      setAdminNotice("Upload ຮູບບໍ່ສຳເລັດ", "error");
      input.value = "";
      return;
    }

    const result = await response.json();
    uploadedUrls.push(result.url);
  }

  const nextImages = [...currentImages, ...uploadedUrls].slice(0, 10);
  imagesInput.value = JSON.stringify(nextImages);
  editor.querySelector('[data-product-field="image"]').value = nextImages[0] || defaultProductImage;
  renderProducts(collectProducts());
  setAdminNotice(`Upload ຮູບສຳເລັດ ${uploadedUrls.length} ຮູບ ກົດບັນທຶກບິນເພື່ອໃຊ້`, "success");
}

function collectProducts() {
  return [...document.querySelectorAll(".product-editor")].map((editor) => {
    const get = (field) => editor.querySelector(`[data-product-field="${field}"]`)?.value || "";
    const amount = Math.max(1, Number(get("amount")) || 1);
    const price = Math.max(0, Number(get("price")) || 0);
    return {
      productName: get("productName").trim(),
      shopSize: get("shopSize").trim(),
      amount,
      price,
      totalPrice: amount * price,
      image: get("image").trim() || defaultProductImage,
      images: JSON.parse(get("images") || "[]").slice(0, 10),
      freeGifts: [],
    };
  });
}

function fillForm(order) {
  activeCode = order.code || null;
  document.querySelector("#formTitle").textContent = activeCode ? `ແກ້ບິນ ${activeCode}` : "ສ້າງບິນໃໝ່";
  document.querySelector("#codeInput").value = order.code || "";
  document.querySelector("#codeInput").disabled = Boolean(activeCode);
  document.querySelector("#depositStatusInput").value = order.depositStatus || "PENDING";
  document.querySelector("#receiveDateInput").value = toDateInput(order.receiveDate);
  renderAssignedAdminSelect(order.assignedAdmin || settings.adminNames[0]);
  document.querySelector("#customerNameInput").value = order.customerName || "";
  document.querySelector("#phoneInput").value = order.phone || "";
  document.querySelector("#addressInput").value = order.addressCf || "";
  renderProducts(order.products?.length ? order.products : [emptyProduct()]);

  const link = document.querySelector("#trackingLink");
  if (activeCode) {
    link.href = trackingUrl(activeCode);
    link.classList.remove("disabled");
    document.querySelector("#copyTrackingButton").disabled = false;
  } else {
    link.href = "./index.html";
    link.classList.add("disabled");
    document.querySelector("#copyTrackingButton").disabled = true;
  }
  renderWorkflow(order);
  renderOrdersList();
}

function collectOrderPayload() {
  const products = collectProducts();
  const firstProduct = products[0];
  const receiveDate = document.querySelector("#receiveDateInput").value;
  return {
    code: document.querySelector("#codeInput").value.trim().toUpperCase(),
    depositStatus: document.querySelector("#depositStatusInput").value,
    receiveDate: receiveDate ? `${receiveDate}T00:00:00` : null,
    assignedAdmin: document.querySelector("#assignedAdminInput").value || settings.adminNames[0],
    customerName: document.querySelector("#customerNameInput").value.trim(),
    phone: document.querySelector("#phoneInput").value.trim(),
    addressCf: document.querySelector("#addressInput").value.trim(),
    productImage: firstProduct?.image || defaultProductImage,
    products,
  };
}

async function loadOrders() {
  const response = await fetch("/api/orders");
  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  if (!response.ok) throw new Error("LOAD_FAILED");
  const result = await response.json();
  orders = result.data;
  renderOrdersList();
  if (!activeCode && orders[0]) fillForm(orders[0]);
  if (activeCode) {
    const selectedOrder = activeOrder();
    if (selectedOrder) fillForm(selectedOrder);
  }
  setAdminNotice("ດຶງຂໍ້ມູນສຳເລັດ", "success");
}

async function loadSettings() {
  const response = await fetch("/api/settings");
  if (!response.ok) throw new Error("SETTINGS_FAILED");
  const result = await response.json();
  settings = result.data;
  renderAssignedAdminSelect(settings.adminNames[0]);
  renderAdminMenu();
}

async function saveSettings() {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  if (!response.ok) {
    setAdminNotice("ບັນທຶກຊື່ Admin ບໍ່ສຳເລັດ", "error");
    return;
  }
  const result = await response.json();
  settings = result.data;
  if (activeMenu !== "CATALOG" && activeMenu !== "ALL" && !settings.adminNames.includes(activeMenu)) {
    activeMenu = settings.adminNames[0];
  }
  renderAssignedAdminSelect(document.querySelector("#assignedAdminInput").value);
  renderOrdersList();
  setAdminNotice("ບັນທຶກຊື່ Admin ສຳເລັດ", "success");
}

async function renameAssignedOrders(previousName, nextName) {
  const changedOrders = orders.filter((order) => order.assignedAdmin === nextName && previousName !== nextName);
  for (const order of changedOrders) {
    await fetch(`/api/orders/${encodeURIComponent(order.code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
  }
}

async function loadCatalog() {
  const response = await fetch("/api/admin/catalog");
  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  if (!response.ok) throw new Error("CATALOG_FAILED");
  const result = await response.json();
  catalogItems = result.data;
  renderAdminMenu();
}

function catalogVisibleItems() {
  const search = catalogSearch.trim().toLowerCase();
  return catalogItems.filter((item) => {
    if (!search) return true;
    return [item.id, item.name, item.category].some((value) => String(value || "").toLowerCase().includes(search));
  });
}

function renderCatalogEditor() {
  const items = catalogVisibleItems();
  document.querySelector("#catalogCountLabel").textContent = `${items.length} / ${catalogItems.length} ລາຍການ`;
  document.querySelector("#catalogEditor").innerHTML = items
    .slice(0, 500)
    .map(
      (item) => `
        <article class="catalog-edit-row" data-catalog-id="${escapeHtml(item.id)}">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.src='./assets/kt-sport-logo.jpg'" />
          <div class="catalog-edit-grid">
            <label>ID<input data-catalog-field="id" value="${escapeHtml(item.id)}" /></label>
            <label>ຊື່<input data-catalog-field="name" value="${escapeHtml(item.name)}" /></label>
            <label>ໝວດ<input data-catalog-field="category" value="${escapeHtml(item.category)}" /></label>
            <label>ລາຄາ<input data-catalog-field="price" type="number" min="0" value="${item.price || 0}" /></label>
            <label>MOQ<input data-catalog-field="moq" type="number" min="1" value="${item.moq || 1}" /></label>
            <label>ໄຊ້<input data-catalog-field="size" value="${escapeHtml(item.size)}" /></label>
            <label class="full-span">ຮູບ URL<input data-catalog-field="image" value="${escapeHtml(item.image)}" /></label>
            <label class="full-span catalog-upload-label">
              ປ່ຽນຮູບສິນຄ້າ
              <input data-catalog-upload="${escapeHtml(item.id)}" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
            </label>
            <label class="catalog-visible"><input data-catalog-field="visible" type="checkbox" ${item.visible !== false ? "checked" : ""} /> ສະແດງໃນ shop</label>
            <button type="button" data-remove-catalog="${escapeHtml(item.id)}">ລົບ</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function syncCatalogRow(row) {
  const originalId = row.dataset.catalogId;
  const item = catalogItems.find((entry) => entry.id === originalId);
  if (!item) return;
  const get = (field) => row.querySelector(`[data-catalog-field="${field}"]`);
  item.id = get("id").value.trim() || originalId;
  item.name = get("name").value.trim();
  item.category = get("category").value.trim() || "ສິນຄ້າ";
  item.price = Math.max(0, Number(get("price").value) || 0);
  item.moq = Math.max(1, Number(get("moq").value) || 1);
  item.size = get("size").value.trim() || "Free size";
  item.image = get("image").value.trim() || "./assets/kt-sport-logo.jpg";
  item.visible = get("visible").checked;
  row.dataset.catalogId = item.id;
}

function syncCatalogFromDom() {
  document.querySelectorAll(".catalog-edit-row").forEach(syncCatalogRow);
}

async function uploadCatalogImage(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 25_000_000) {
    setCatalogNotice("ຮູບໃຫຍ່ເກີນ 25MB", "error");
    input.value = "";
    return;
  }

  const row = input.closest(".catalog-edit-row");
  setCatalogNotice("ກຳລັງ upload ຮູບສິນຄ້າ...", "muted");
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });

  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  if (!response.ok) {
    setCatalogNotice("Upload ຮູບສິນຄ້າບໍ່ສຳເລັດ", "error");
    input.value = "";
    return;
  }

  const result = await response.json();
  row.querySelector('[data-catalog-field="image"]').value = result.url;
  row.querySelector("img").src = result.url;
  syncCatalogRow(row);
  input.value = "";
  setCatalogNotice("Upload ຮູບສຳເລັດ ກົດບັນທຶກ shop ເພື່ອໃຊ້ຮູບນີ້", "success");
}

async function saveCatalog() {
  syncCatalogFromDom();
  setCatalogNotice("ກຳລັງບັນທຶກ shop...", "muted");
  const response = await fetch("/api/admin/catalog", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: catalogItems.slice(0, 500) }),
  });
  if (response.status === 401) {
    window.location.href = "/login.html";
    return;
  }
  if (!response.ok) {
    setCatalogNotice("ບັນທຶກສິນຄ້າບໍ່ສຳເລັດ", "error");
    return;
  }
  const result = await response.json();
  catalogItems = result.data;
  renderCatalogEditor();
  renderAdminMenu();
  setCatalogNotice("ບັນທຶກສິນຄ້າ shop ສຳເລັດ", "success");
}

async function saveOrder(event) {
  event.preventDefault();
  const payload = collectOrderPayload();
  if (!payload.customerName || payload.products.some((product) => !product.productName)) {
    setAdminNotice("ກະລຸນາກອກຊື່ລູກຄ້າ ແລະ ຊື່ສິນຄ້າ", "error");
    return;
  }

  const url = activeCode ? `/api/orders/${encodeURIComponent(activeCode)}` : "/api/orders";
  const method = activeCode ? "PUT" : "POST";
  setAdminNotice("ກຳລັງບັນທຶກ...", "muted");

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    setAdminNotice(response.status === 409 ? "ເລກບິນນີ້ມີແລ້ວ" : "ບັນທຶກບໍ່ສຳເລັດ", "error");
    return;
  }

  const result = await response.json();
  activeCode = result.data.code;
  await loadOrders();
  fillForm(result.data);
  setAdminNotice(`ບັນທຶກສຳເລັດ: ${result.data.code}`, "success");
}

async function updateWorkflowStatus() {
  if (!activeCode) {
    setAdminNotice("ກະລຸນາເລືອກບິນກ່ອນ", "error");
    return;
  }

  const status = document.querySelector("#workflowStatusSelect").value;
  const note = document.querySelector("#workflowNoteInput").value.trim();
  const button = document.querySelector("#updateWorkflowButton");
  button.disabled = true;
  setAdminNotice("ກຳລັງອັບເດດ status...", "muted");

  const response = await fetch(`/api/orders/${encodeURIComponent(activeCode)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    button.disabled = false;
    setAdminNotice("ອັບເດດ status ບໍ່ສຳເລັດ", "error");
    return;
  }

  const result = await response.json();
  orders = orders.map((order) => (order.code === result.data.code ? result.data : order));
  document.querySelector("#workflowNoteInput").value = "";
  fillForm(result.data);
  setAdminNotice(`ອັບເດດ status ເປັນ ${statusLabel(status)} ແລ້ວ`, "success");
}

async function copyTrackingLink() {
  if (!activeCode) return;
  const url = trackingUrl(activeCode);
  try {
    await navigator.clipboard.writeText(url);
    setAdminNotice("Copy tracking link ສຳເລັດ", "success");
  } catch {
    setAdminNotice(url, "success");
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
}

function setupAdmin() {
  document.querySelector("#workflowStatusSelect").innerHTML = productionSteps
    .map((step) => `<option value="${step.key}">${step.label}</option>`)
    .join("");
  document.querySelector("#statusFilterSelect").innerHTML += productionSteps
    .map((step) => `<option value="${step.key}">${step.label}</option>`)
    .join("");
  document.querySelector("#newOrderButton").addEventListener("click", () => fillForm(emptyOrder()));
  document.querySelector("#refreshOrdersButton").addEventListener("click", () => loadOrders());
  document.querySelector("#orderForm").addEventListener("submit", saveOrder);
  document.querySelector("#updateWorkflowButton").addEventListener("click", updateWorkflowStatus);
  document.querySelector("#copyTrackingButton").addEventListener("click", copyTrackingLink);
  document.querySelector("#logoutButton").addEventListener("click", logout);
  document.querySelector("#adminMenuTabs").addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-admin-menu]");
    if (!menuButton || event.target.matches("[data-admin-name-index]")) return;
    setAdminView(menuButton.dataset.adminMenu);
  });
  document.querySelector("#adminMenuTabs").addEventListener("change", (event) => {
    const input = event.target.closest("[data-admin-name-index]");
    if (!input) return;
    const index = Number(input.dataset.adminNameIndex);
    const previousName = settings.adminNames[index];
    const nextName = input.value.trim() || `Admin ${index + 1}`;
    settings.adminNames[index] = nextName;
    orders = orders.map((order) => (order.assignedAdmin === previousName ? { ...order, assignedAdmin: nextName } : order));
    activeMenu = activeMenu === previousName ? nextName : activeMenu;
    saveSettings().then(() => renameAssignedOrders(previousName, nextName)).then(loadOrders);
  });
  document.querySelector("#orderSearchInput").addEventListener("input", (event) => {
    filters.search = event.target.value;
    renderOrdersList();
  });
  document.querySelector("#statusFilterSelect").addEventListener("change", (event) => {
    filters.status = event.target.value;
    renderOrdersList();
  });
  document.querySelector("#depositFilterSelect").addEventListener("change", (event) => {
    filters.deposit = event.target.value;
    renderOrdersList();
  });
  document.querySelector("#ordersList").addEventListener("click", (event) => {
    const item = event.target.closest("[data-code]");
    if (!item) return;
    const order = orders.find((entry) => entry.code === item.dataset.code);
    if (order) fillForm(order);
  });
  document.querySelector("#addProductButton").addEventListener("click", () => {
    renderProducts([...collectProducts(), emptyProduct()]);
  });
  document.querySelector("#productsEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-product]");
    const imageButton = event.target.closest("[data-remove-image]");
    if (button) {
      const index = Number(button.dataset.removeProduct);
      const products = collectProducts().filter((_, productIndex) => productIndex !== index);
      renderProducts(products.length ? products : [emptyProduct()]);
    }
    if (imageButton) {
      const [productIndex, imageIndex] = imageButton.dataset.removeImage.split(":").map(Number);
      const products = collectProducts();
      products[productIndex].images = products[productIndex].images.filter((_, index) => index !== imageIndex);
      products[productIndex].image = products[productIndex].images[0] || defaultProductImage;
      renderProducts(products);
    }
  });
  document.querySelector("#productsEditor").addEventListener("change", (event) => {
    const input = event.target.closest("[data-product-upload]");
    if (!input) return;
    uploadProductImage(input).catch(() => setAdminNotice("Upload ຮູບບໍ່ສຳເລັດ", "error"));
  });
  document.querySelector("#catalogSearchInput").addEventListener("input", (event) => {
    syncCatalogFromDom();
    catalogSearch = event.target.value;
    renderCatalogEditor();
  });
  document.querySelector("#addCatalogItemButton").addEventListener("click", () => {
    syncCatalogFromDom();
    const nextNumber = catalogItems.length + 1;
    catalogItems.unshift({
      id: `KT-${String(nextNumber).padStart(4, "0")}`,
      name: `ສິນຄ້າໃໝ່ ${nextNumber}`,
      category: "ສິນຄ້າ",
      image: "./assets/kt-sport-logo.jpg",
      price: 0,
      moq: 1,
      size: "Free size",
      sold: 0,
      visible: true,
    });
    renderCatalogEditor();
  });
  document.querySelector("#saveCatalogButton").addEventListener("click", saveCatalog);
  document.querySelector("#catalogEditor").addEventListener("input", (event) => {
    const row = event.target.closest(".catalog-edit-row");
    if (row) syncCatalogRow(row);
  });
  document.querySelector("#catalogEditor").addEventListener("change", (event) => {
    const input = event.target.closest("[data-catalog-upload]");
    if (!input) return;
    uploadCatalogImage(input).catch(() => setCatalogNotice("Upload ຮູບສິນຄ້າບໍ່ສຳເລັດ", "error"));
  });
  document.querySelector("#catalogEditor").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-catalog]");
    if (!button) return;
    catalogItems = catalogItems.filter((item) => item.id !== button.dataset.removeCatalog);
    renderCatalogEditor();
  });

  ensureSession();
  Promise.all([loadSettings(), loadCatalog()])
    .then(() => {
      fillForm(emptyOrder());
      return loadOrders();
    })
    .catch(() => setAdminNotice("ດຶງຂໍ້ມູນບໍ່ໄດ້", "error"));
}

setupAdmin();
