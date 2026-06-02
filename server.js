const http = require("http");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const rootDir = __dirname;
loadEnvFile(path.join(rootDir, ".env"));
const seedDataFile = path.join(rootDir, "data", "orders.json");
const seedCatalogFile = path.join(rootDir, "data", "catalog.json");
const seedSettingsFile = path.join(rootDir, "data", "settings.json");
const persistentDataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : "";
const dataFile = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : persistentDataDir
    ? path.join(persistentDataDir, "orders.json")
    : seedDataFile;
const catalogFile = persistentDataDir ? path.join(persistentDataDir, "catalog.json") : seedCatalogFile;
const settingsFile = persistentDataDir ? path.join(persistentDataDir, "settings.json") : seedSettingsFile;
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : persistentDataDir
    ? path.join(persistentDataDir, "uploads")
    : path.join(rootDir, "uploads");
const port = Number(process.env.PORT || 4173);
const adminPassword = process.env.ADMIN_PASSWORD || "KTSPORT2026";
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const googleSheetsWebhookUrl = String(process.env.GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
const googleSheetsWebhookSecret = String(process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || "").trim();
const sessions = new Map();
const maxImageBytes = 25_000_000;

function loadEnvFile(filePath) {
  try {
    const raw = require("fs").readFileSync(filePath, "utf8");
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((line) => {
        const index = line.indexOf("=");
        if (index === -1) return;
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
        if (key && process.env[key] === undefined) process.env[key] = value;
      });
  } catch {
    // .env is optional for local development.
  }
}

const mimeTypes = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "application/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const validStatuses = new Set([
  "PRODUCTION_ORDER",
  "DESIGN",
  "PATTERN",
  "PRINTING",
  "HEAT_TRANSFER",
  "CUTTING",
  "QC_BEFORE_SEWING",
  "SEWING",
  "QC_AFTER_SEWING",
  "DELIVERY",
  "COMPLETED",
]);

const workflowSteps = [
  { key: "PRODUCTION_ORDER", label: "ອອກບິນຜະລິດ", adminOnly: true },
  { key: "DESIGN", label: "ອອກແບບ" },
  { key: "PATTERN", label: "ກຳລັງຂຶ້ນແພັດເທິ້ນ" },
  { key: "PRINTING", label: "ກຳລັງພິມ" },
  { key: "HEAT_TRANSFER", label: "ກຳລັງລີດລົງຜ້າ" },
  { key: "CUTTING", label: "ກຳລັງຕັດ" },
  { key: "QC_BEFORE_SEWING", label: "QC ກ່ອນຫຍິບ" },
  { key: "SEWING", label: "ກຳລັງຍິບ" },
  { key: "QC_AFTER_SEWING", label: "QC ຫຼັງຫຍິບ" },
  { key: "DELIVERY", label: "ຂົນສົ່ງ" },
  { key: "COMPLETED", label: "ສຳເລັດແລ້ວ", adminOnly: true },
];

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
      }),
  );
}

function isAuthenticated(req) {
  const token = parseCookies(req).sp_admin_session;
  return Boolean(token && sessions.has(token));
}

function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  sendJson(res, 401, { error: "UNAUTHORIZED" });
  return false;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `sp_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "sp_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function extensionForMime(mimeType) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }[mimeType];
}

function workflowLabel(status) {
  return workflowSteps.find((step) => step.key === status)?.label || status;
}

function normalizeStatus(status) {
  const nextStatus = String(status || "").trim().toUpperCase();
  if (nextStatus === "QC") return "QC_BEFORE_SEWING";
  if (nextStatus === "READY_TO_COMPLETE") return "DELIVERY";
  return nextStatus;
}

function workflowToken(code, status) {
  return crypto
    .createHmac("sha256", adminPassword)
    .update(`${String(code).toUpperCase()}:${normalizeStatus(status)}`)
    .digest("hex");
}

function isValidWorkflowToken(code, status, token) {
  const expected = workflowToken(code, status);
  const received = String(token || "");
  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  );
}

function requestBaseUrl(req) {
  if (publicBaseUrl) return publicBaseUrl;
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host}`;
}

function makeOrderCode(orders) {
  const today = new Date();
  const prefix = `J${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(
    2,
    "0",
  )}`;
  let code = "";
  do {
    code = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
  } while (orders[code]);
  return code;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProduct(product, index) {
  const amount = Math.max(1, toNumber(product.amount, 1));
  const price = Math.max(0, toNumber(product.price, 0));
  const images = Array.isArray(product.images)
    ? product.images.map((image) => String(image || "").trim()).filter(Boolean).slice(0, 10)
    : [];
  const fallbackImage =
    String(product.image || images[0] || "").trim() ||
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=220&q=80";
  return {
    productType: String(product.productType || "ເສື້ອກິລາ").trim(),
    productName: String(product.productName || `ສິນຄ້າ ${index + 1}`).trim(),
    shopSize: String(product.shopSize || "-").trim(),
    patternQty: Math.max(0, toNumber(product.patternQty, 0)),
    fabricQty: Math.max(0, toNumber(product.fabricQty, 0)),
    amount,
    price,
    totalPrice: Math.max(0, toNumber(product.totalPrice, amount * price)),
    image: fallbackImage,
    images: images.length ? images : [fallbackImage],
    freeGifts: Array.isArray(product.freeGifts) ? product.freeGifts : [],
  };
}

async function saveDataUrlImage(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const error = new Error("INVALID_IMAGE");
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1];
  const extension = extensionForMime(mimeType);
  const buffer = Buffer.from(match[2], "base64");
  if (!extension || buffer.length > maxImageBytes) {
    const error = new Error("IMAGE_TOO_LARGE_OR_UNSUPPORTED");
    error.statusCode = 400;
    throw error;
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
  await fs.writeFile(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

function normalizeAdminName(name, index) {
  const fallback = `Admin ${index + 1}`;
  return String(name || fallback).trim().slice(0, 40) || fallback;
}

function normalizeSettings(settings = {}) {
  const names = Array.isArray(settings.adminNames) ? settings.adminNames : [];
  const rolePasscodes = settings.rolePasscodes && typeof settings.rolePasscodes === "object" ? settings.rolePasscodes : {};
  const rolePhotos = settings.rolePhotos && typeof settings.rolePhotos === "object" ? settings.rolePhotos : {};
  const staffPhotos = settings.staffPhotos && typeof settings.staffPhotos === "object" ? settings.staffPhotos : {};
  const staffPasscodes = settings.staffPasscodes && typeof settings.staffPasscodes === "object" ? settings.staffPasscodes : {};
  const staffMembers = Array.isArray(settings.staffMembers) ? settings.staffMembers : [];
  return {
    adminNames: Array.from({ length: 10 }, (_, index) => normalizeAdminName(names[index], index)),
    shopPhone: String(settings.shopPhone || "8562077728239").replace(/\D/g, "") || "8562077728239",
    rolePhotos,
    staffPhotos,
    staffPasscodes,
    staffMembers: staffMembers
      .map((staff, index) => ({
        name: String(staff.name || `Staff ${index + 1}`).trim(),
        birthDate: String(staff.birthDate || "ບໍ່ມີຂໍ້ມູນ").trim(),
        duties: Array.isArray(staff.duties)
          ? staff.duties.map((duty) => String(duty || "").trim()).filter(Boolean)
          : [],
      }))
      .filter((staff) => staff.name),
    rolePasscodes: {
      president: String(rolePasscodes.president || "1234"),
      vice: String(rolePasscodes.vice || "1234"),
      manager: String(rolePasscodes.manager || "1234"),
      accounting: String(rolePasscodes.accounting || "1234"),
      engineer: String(rolePasscodes.engineer || "1234"),
    },
  };
}

function normalizeCatalogItem(item = {}, index) {
  const price = Math.max(0, toNumber(item.price, 0));
  return {
    id: String(item.id || `KT-${String(index + 1).padStart(4, "0")}`).trim(),
    name: String(item.name || `ສິນຄ້າ ${index + 1}`).trim(),
    category: String(item.category || "ສິນຄ້າ").trim(),
    image: String(item.image || "./assets/kt-sport-logo.jpg").trim(),
    price,
    moq: Math.max(1, toNumber(item.moq, 1)),
    size: String(item.size || "Free size").trim(),
    sold: Math.max(0, toNumber(item.sold, 0)),
    visible: item.visible !== false,
  };
}

function normalizeOrder(payload, existingOrder = {}) {
  const products = Array.isArray(payload.products) && payload.products.length > 0 ? payload.products : [];
  const requestedStatus = normalizeStatus(payload.productionStatus);
  const existingStatus = normalizeStatus(existingOrder.productionStatus);
  const productionStatus = validStatuses.has(requestedStatus)
    ? requestedStatus
    : existingOrder.productionStatus || "PRODUCTION_ORDER";

  const productionHistory =
    Array.isArray(existingOrder.productionHistory) && existingOrder.productionHistory.length > 0
      ? existingOrder.productionHistory.map((item) => ({
          ...item,
          status: normalizeStatus(item.status),
          images: Array.isArray(item.images) ? item.images : [],
        }))
      : [
          {
            status: "PRODUCTION_ORDER",
            note: "ສ້າງບິນຜະລິດ",
            createdAt: new Date().toISOString(),
            images: [],
          },
        ];

  return {
    code: existingOrder.code || String(payload.code || "").trim().toUpperCase(),
    createdAt: existingOrder.createdAt || payload.createdAt || new Date().toISOString(),
    receiveDate: payload.receiveDate || existingOrder.receiveDate || null,
    depositStatus: String(payload.depositStatus || existingOrder.depositStatus || "PENDING")
      .trim()
      .toUpperCase(),
    customerName: String(payload.customerName || existingOrder.customerName || "ບໍ່ລະບຸຊື່...").trim(),
    phone: String(payload.phone || existingOrder.phone || "-").trim(),
    addressCf: String(payload.addressCf || existingOrder.addressCf || "-").trim(),
    depositAmount: Math.max(0, toNumber(payload.depositAmount ?? existingOrder.depositAmount, 0)),
    balanceAmount: Math.max(0, toNumber(payload.balanceAmount ?? existingOrder.balanceAmount, 0)),
    grandTotal: Math.max(0, toNumber(payload.grandTotal ?? existingOrder.grandTotal, 0)),
    assignedAdmin: String(payload.assignedAdmin || existingOrder.assignedAdmin || "Admin 1").trim(),
    productionStatus: validStatuses.has(productionStatus) ? productionStatus : existingStatus || "PRODUCTION_ORDER",
    productImage: String(
      payload.productImage ||
        existingOrder.productImage ||
        products[0]?.image ||
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=80",
    ).trim(),
    productionHistory,
    products: products.map(normalizeProduct),
    deletedAt: existingOrder.deletedAt || payload.deletedAt || null,
  };
}

async function ensureJsonFile(file, seedFile) {
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const seed = await fs.readFile(seedFile, "utf8");
    await fs.writeFile(file, seed);
  }
}

async function readOrders() {
  await ensureJsonFile(dataFile, seedDataFile);
  const raw = await fs.readFile(dataFile, "utf8");
  const orders = JSON.parse(raw);
  for (const [code, order] of Object.entries(orders)) {
    if (!order.assignedAdmin) orders[code] = { ...order, assignedAdmin: "Admin 1" };
    orders[code].productionStatus = validStatuses.has(normalizeStatus(order.productionStatus))
      ? normalizeStatus(order.productionStatus)
      : "PRODUCTION_ORDER";
    orders[code].productionHistory = Array.isArray(order.productionHistory)
      ? order.productionHistory.map((item) => ({
          ...item,
          status: validStatuses.has(normalizeStatus(item.status)) ? normalizeStatus(item.status) : "PRODUCTION_ORDER",
          images: Array.isArray(item.images) ? item.images : [],
        }))
      : [];
    orders[code].deletedAt = order.deletedAt || null;
  }
  return orders;
}

async function writeOrders(orders) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [code, order] of Object.entries(orders)) {
    if (order.deletedAt && new Date(order.deletedAt).getTime() < cutoff) {
      delete orders[code];
    }
  }
  await fs.writeFile(dataFile, `${JSON.stringify(orders, null, 2)}\n`);
  await syncGoogleSheets("orders", { orders: Object.values(orders) });
}

async function readSettings() {
  await ensureJsonFile(settingsFile, seedSettingsFile);
  const raw = await fs.readFile(settingsFile, "utf8");
  return normalizeSettings(JSON.parse(raw));
}

async function writeSettings(settings) {
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });
  await fs.writeFile(settingsFile, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`);
  await syncGoogleSheets("settings", { settings: normalizeSettings(settings) });
}

async function readCatalog() {
  await ensureJsonFile(catalogFile, seedCatalogFile);
  const raw = await fs.readFile(catalogFile, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data.map(normalizeCatalogItem).slice(0, 500) : [];
}

async function writeCatalog(catalog) {
  await fs.mkdir(path.dirname(catalogFile), { recursive: true });
  const data = Array.isArray(catalog) ? catalog.map(normalizeCatalogItem).slice(0, 500) : [];
  await fs.writeFile(catalogFile, `${JSON.stringify(data, null, 2)}\n`);
  await syncGoogleSheets("catalog", { catalog: data });
}

async function syncGoogleSheets(kind, data) {
  if (!googleSheetsWebhookUrl) return;
  try {
    const response = await fetch(googleSheetsWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: googleSheetsWebhookSecret,
        kind,
        syncedAt: new Date().toISOString(),
        ...data,
      }),
    });
    if (!response.ok) {
      console.warn(`Google Sheets sync failed: ${kind} ${response.status}`);
    }
  } catch (error) {
    console.warn(`Google Sheets sync failed: ${kind} ${error.message}`);
  }
}

async function applyWorkflowStatus(order, status, note = "", dataUrls = [], actor = "System") {
  const nextStatus = normalizeStatus(status);
  if (!validStatuses.has(nextStatus)) {
    const error = new Error("INVALID_STATUS");
    error.statusCode = 400;
    throw error;
  }

  const images = [];
  for (const dataUrl of (Array.isArray(dataUrls) ? dataUrls : []).slice(0, 10)) {
    images.push(await saveDataUrlImage(dataUrl));
  }

  order.productionStatus = nextStatus;
  order.productionHistory = Array.isArray(order.productionHistory) ? order.productionHistory : [];
  order.productionHistory = order.productionHistory.map((item) => ({
    ...item,
    status: normalizeStatus(item.status),
    images: Array.isArray(item.images) ? item.images : [],
  }));

  const historyItem = order.productionHistory.find((item) => item.status === nextStatus);
  if (historyItem) {
    if (historyItem.actor && historyItem.actor !== actor && actor !== "Admin") {
      const error = new Error("STATUS_LOCKED");
      error.statusCode = 409;
      throw error;
    }
    historyItem.note = note || historyItem.note || "";
    historyItem.createdAt = new Date().toISOString();
    historyItem.images = [...(historyItem.images || []), ...images].slice(0, 10);
    historyItem.actor = actor;
  } else {
    order.productionHistory.push({
      status: nextStatus,
      note,
      createdAt: new Date().toISOString(),
      images,
      actor,
    });
  }

  if (nextStatus === "COMPLETED" && !order.receiveDate) {
    order.receiveDate = new Date().toISOString();
  }

  return order;
}

function restorePreviousStatus(order, removedStatus) {
  const removedIndex = workflowSteps.findIndex((step) => step.key === removedStatus);
  const previous = [...(order.productionHistory || [])]
    .filter((item) => workflowSteps.findIndex((step) => step.key === normalizeStatus(item.status)) < removedIndex)
    .sort((a, b) => workflowSteps.findIndex((step) => step.key === normalizeStatus(b.status)) - workflowSteps.findIndex((step) => step.key === normalizeStatus(a.status)))[0];
  order.productionStatus = normalizeStatus(previous?.status || "PRODUCTION_ORDER");
}

async function readStaticFile(filePath, res) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const noCache = new Set([".html", ".js", ".css"]);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      ...(noCache.has(ext) ? { "Cache-Control": "no-store, max-age=0" } : {}),
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json;charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function collectJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 36_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  const statusMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  const workflowLinksMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/workflow-links$/);
  const publicWorkflowMatch = url.pathname.match(/^\/api\/workflow\/([^/]+)\/([^/]+)$/);

  if (req.method === "GET" && url.pathname === "/api/session") {
    return sendJson(res, 200, { authenticated: isAuthenticated(req) });
  }

  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/api/health") {
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json;charset=utf-8" });
      res.end();
      return;
    }
    return sendJson(res, 200, {
      ok: true,
      dataFile,
      catalogFile,
      settingsFile,
      uploadsDir,
      googleSheetsSync: Boolean(googleSheetsWebhookUrl),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const payload = await collectJson(req);
    if (String(payload.password || "") !== adminPassword) {
      return sendJson(res, 401, { error: "INVALID_PASSWORD" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { createdAt: Date.now() });
    setSessionCookie(res, token);
    return sendJson(res, 200, { authenticated: true });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const token = parseCookies(req).sp_admin_session;
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    return sendJson(res, 200, { authenticated: false });
  }

  if (req.method === "POST" && url.pathname === "/api/uploads") {
    if (!requireAuth(req, res)) return;
    const payload = await collectJson(req);
    try {
      return sendJson(res, 201, { url: await saveDataUrlImage(payload.dataUrl) });
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    const settings = await readSettings();
    return sendJson(res, 200, { data: settings });
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    if (!requireAuth(req, res)) return;
    const payload = await collectJson(req);
    await writeSettings(payload);
    return sendJson(res, 200, { data: await readSettings() });
  }

  if (req.method === "GET" && url.pathname === "/api/catalog") {
    const catalog = await readCatalog();
    return sendJson(res, 200, { data: catalog.filter((item) => item.visible !== false) });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/catalog") {
    if (!requireAuth(req, res)) return;
    return sendJson(res, 200, { data: await readCatalog() });
  }

  if (req.method === "PUT" && url.pathname === "/api/admin/catalog") {
    if (!requireAuth(req, res)) return;
    const payload = await collectJson(req);
    await writeCatalog(payload.data || payload.catalog || []);
    return sendJson(res, 200, { data: await readCatalog() });
  }

  if (req.method === "GET" && url.pathname === "/api/orders") {
    if (!requireAuth(req, res)) return;
    const orders = await readOrders();
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";
    const data = Object.values(orders)
      .filter((order) => includeDeleted || !order.deletedAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, { data });
  }

  if (req.method === "GET" && workflowLinksMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(workflowLinksMatch[1]).toUpperCase();
    const orders = await readOrders();
    if (!orders[code] || orders[code].deletedAt) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    const baseUrl = requestBaseUrl(req);
    const data = workflowSteps.map((step, index) => {
      const token = workflowToken(code, step.key);
      return {
        index: index + 1,
        status: step.key,
        label: step.label,
        adminOnly: Boolean(step.adminOnly),
        url: step.adminOnly
          ? null
          : `${baseUrl}/step.html?code=${encodeURIComponent(code)}&status=${encodeURIComponent(step.key)}&token=${token}`,
      };
    });
    return sendJson(res, 200, { data });
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    if (!requireAuth(req, res)) return;
    const payload = await collectJson(req);
    const orders = await readOrders();
    const code = String(payload.code || "").trim().toUpperCase() || makeOrderCode(orders);

    if (orders[code]) {
      return sendJson(res, 409, { error: "ORDER_CODE_EXISTS" });
    }

    const order = normalizeOrder({ ...payload, code });
    order.code = code;
    orders[code] = order;
    await writeOrders(orders);
    return sendJson(res, 201, { data: order });
  }

  if (req.method === "GET" && orderMatch) {
    const code = decodeURIComponent(orderMatch[1]).toUpperCase();
    const orders = await readOrders();
    const order = orders[code];
    if (!order || order.deletedAt) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    return sendJson(res, 200, { data: order });
  }

  if (req.method === "GET" && publicWorkflowMatch) {
    const code = decodeURIComponent(publicWorkflowMatch[1]).toUpperCase();
    const status = normalizeStatus(decodeURIComponent(publicWorkflowMatch[2]));
    const token = url.searchParams.get("token");
    const step = workflowSteps.find((item) => item.key === status);
    if (!step || step.adminOnly || !isValidWorkflowToken(code, status, token)) {
      return sendJson(res, 403, { error: "INVALID_WORKFLOW_LINK" });
    }
    const orders = await readOrders();
    const order = orders[code];
    if (!order || order.deletedAt) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    return sendJson(res, 200, {
      data: {
        code,
        status,
        label: workflowLabel(status),
        customerName: order.customerName,
        currentStatus: normalizeStatus(order.productionStatus),
        currentStatusLabel: workflowLabel(order.productionStatus),
      },
    });
  }

  if (req.method === "POST" && publicWorkflowMatch) {
    const code = decodeURIComponent(publicWorkflowMatch[1]).toUpperCase();
    const status = normalizeStatus(decodeURIComponent(publicWorkflowMatch[2]));
    const token = url.searchParams.get("token");
    const step = workflowSteps.find((item) => item.key === status);
    if (!step || step.adminOnly || !isValidWorkflowToken(code, status, token)) {
      return sendJson(res, 403, { error: "INVALID_WORKFLOW_LINK" });
    }
    const payload = await collectJson(req);
    const orders = await readOrders();
    const order = orders[code];
    if (!order || order.deletedAt) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    try {
      await applyWorkflowStatus(order, status, String(payload.note || "").trim(), payload.images, String(payload.actor || "Staff"));
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { error: error.message });
    }
    await writeOrders(orders);
    return sendJson(res, 200, { data: order });
  }

  if (req.method === "PUT" && orderMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(orderMatch[1]).toUpperCase();
    const payload = await collectJson(req);
    const orders = await readOrders();
    const existingOrder = orders[code];
    if (!existingOrder || existingOrder.deletedAt) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });

    orders[code] = normalizeOrder(payload, existingOrder);
    orders[code].code = code;
    await writeOrders(orders);
    return sendJson(res, 200, { data: orders[code] });
  }

  if (req.method === "PATCH" && statusMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(statusMatch[1]).toUpperCase();
    const payload = await collectJson(req);
    const status = normalizeStatus(payload.status);
    const note = String(payload.note || "").trim();

    if (!validStatuses.has(status)) {
      return sendJson(res, 400, { error: "INVALID_STATUS" });
    }

    const orders = await readOrders();
    const order = orders[code];
    if (!order || order.deletedAt) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });

    try {
      await applyWorkflowStatus(order, status, note, payload.images, String(payload.actor || "Admin"));
    } catch (error) {
      return sendJson(res, error.statusCode || 400, { error: error.message });
    }

    await writeOrders(orders);
    return sendJson(res, 200, { data: order });
  }

  if (req.method === "DELETE" && statusMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(statusMatch[1]).toUpperCase();
    const payload = await collectJson(req);
    const status = normalizeStatus(payload.status);
    const actor = String(payload.actor || "").trim();
    const orders = await readOrders();
    const order = orders[code];
    if (!order) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    const historyItem = (order.productionHistory || []).find((item) => normalizeStatus(item.status) === status);
    if (!historyItem) return sendJson(res, 404, { error: "STATUS_NOT_FOUND" });
    if (historyItem.actor && actor && historyItem.actor !== actor && actor !== "Admin") {
      return sendJson(res, 409, { error: "STATUS_LOCKED" });
    }
    order.productionHistory = order.productionHistory.filter((item) => normalizeStatus(item.status) !== status);
    restorePreviousStatus(order, status);
    await writeOrders(orders);
    return sendJson(res, 200, { data: order });
  }

  if (req.method === "DELETE" && orderMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(orderMatch[1]).toUpperCase();
    const orders = await readOrders();
    if (!orders[code]) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    orders[code].deletedAt = new Date().toISOString();
    await writeOrders(orders);
    return sendJson(res, 200, { data: orders[code] });
  }

  const restoreMatch = url.pathname.match(/^\/api\/orders\/([^/]+)\/restore$/);
  if (req.method === "POST" && restoreMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(restoreMatch[1]).toUpperCase();
    const orders = await readOrders();
    if (!orders[code]) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    orders[code].deletedAt = null;
    await writeOrders(orders);
    return sendJson(res, 200, { data: orders[code] });
  }

  return sendJson(res, 404, { error: "API_NOT_FOUND" });
}

async function serveStatic(req, res, url) {
  if (url.pathname === "/config.js") {
    res.writeHead(200, { "Content-Type": "application/javascript;charset=utf-8" });
    res.end(`window.KT_PUBLIC_BASE_URL = ${JSON.stringify(publicBaseUrl)};`);
    return;
  }

  if (url.pathname.startsWith("/uploads/")) {
    const relativeUploadPath = decodeURIComponent(url.pathname.replace(/^\/uploads\//, ""));
    const uploadFilePath = path.normalize(path.join(uploadsDir, relativeUploadPath));
    if (!uploadFilePath.startsWith(uploadsDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    await readStaticFile(uploadFilePath, res);
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  if (requestedPath === "/admin.html" && !isAuthenticated(req)) {
    res.writeHead(302, { Location: "/login.html" });
    res.end();
    return;
  }

  const normalizedRequest = path.posix.normalize(requestedPath);
  const publicExtensions = new Set([".html", ".css", ".js", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]);
  if (
    normalizedRequest.split("/").some((part) => part.startsWith(".")) ||
    normalizedRequest.startsWith("/data/") ||
    normalizedRequest === "/firebase.json" ||
    normalizedRequest === "/firestore.rules" ||
    normalizedRequest === "/package.json" ||
    !publicExtensions.has(path.extname(normalizedRequest))
  ) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  await readStaticFile(filePath, res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: "SERVER_ERROR", message: error.message });
  }
});

async function start() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
  await readOrders();
  await readCatalog();
  await readSettings();
  server.listen(port, "0.0.0.0", () => {
    console.log(`KT SPORT server running at http://0.0.0.0:${port}`);
    console.log(`Data file: ${dataFile}`);
    console.log(`Uploads: ${uploadsDir}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
