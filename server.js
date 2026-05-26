const http = require("http");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const rootDir = __dirname;
const seedDataFile = path.join(rootDir, "data", "orders.json");
const persistentDataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : "";
const dataFile = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : persistentDataDir
    ? path.join(persistentDataDir, "orders.json")
    : seedDataFile;
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : persistentDataDir
    ? path.join(persistentDataDir, "uploads")
    : path.join(rootDir, "uploads");
const port = Number(process.env.PORT || 4173);
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const sessions = new Map();
const maxImageBytes = 25_000_000;

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
  "PATTERN",
  "PRINTING",
  "HEAT_TRANSFER",
  "CUTTING",
  "SEWING",
  "QC",
  "READY_TO_COMPLETE",
  "COMPLETED",
]);

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
    productName: String(product.productName || `ສິນຄ້າ ${index + 1}`).trim(),
    shopSize: String(product.shopSize || "-").trim(),
    amount,
    price,
    totalPrice: Math.max(0, toNumber(product.totalPrice, amount * price)),
    image: fallbackImage,
    images: images.length ? images : [fallbackImage],
    freeGifts: Array.isArray(product.freeGifts) ? product.freeGifts : [],
  };
}

function normalizeOrder(payload, existingOrder = {}) {
  const products = Array.isArray(payload.products) && payload.products.length > 0 ? payload.products : [];
  const productionStatus = validStatuses.has(payload.productionStatus)
    ? payload.productionStatus
    : existingOrder.productionStatus || "PRODUCTION_ORDER";

  const productionHistory =
    Array.isArray(existingOrder.productionHistory) && existingOrder.productionHistory.length > 0
      ? existingOrder.productionHistory
      : [
          {
            status: "PRODUCTION_ORDER",
            note: "ສ້າງບິນຜະລິດ",
            createdAt: new Date().toISOString(),
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
    productionStatus,
    productImage: String(
      payload.productImage ||
        existingOrder.productImage ||
        products[0]?.image ||
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=700&q=80",
    ).trim(),
    productionHistory,
    products: products.map(normalizeProduct),
  };
}

async function readOrders() {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const seed = await fs.readFile(seedDataFile, "utf8");
    await fs.writeFile(dataFile, seed);
  }
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeOrders(orders) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(dataFile, `${JSON.stringify(orders, null, 2)}\n`);
}

async function readStaticFile(filePath, res) {
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
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

  if (req.method === "GET" && url.pathname === "/api/session") {
    return sendJson(res, 200, { authenticated: isAuthenticated(req) });
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, dataFile, uploadsDir });
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
    const dataUrl = String(payload.dataUrl || "");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);

    if (!match) {
      return sendJson(res, 400, { error: "INVALID_IMAGE" });
    }

    const mimeType = match[1];
    const extension = extensionForMime(mimeType);
    const buffer = Buffer.from(match[2], "base64");

    if (!extension || buffer.length > maxImageBytes) {
      return sendJson(res, 400, { error: "IMAGE_TOO_LARGE_OR_UNSUPPORTED" });
    }

    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, buffer);
    return sendJson(res, 201, { url: `/uploads/${filename}` });
  }

  if (req.method === "GET" && url.pathname === "/api/orders") {
    if (!requireAuth(req, res)) return;
    const orders = await readOrders();
    const data = Object.values(orders).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    if (!order) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    return sendJson(res, 200, { data: order });
  }

  if (req.method === "PUT" && orderMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(orderMatch[1]).toUpperCase();
    const payload = await collectJson(req);
    const orders = await readOrders();
    const existingOrder = orders[code];
    if (!existingOrder) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });

    orders[code] = normalizeOrder(payload, existingOrder);
    orders[code].code = code;
    await writeOrders(orders);
    return sendJson(res, 200, { data: orders[code] });
  }

  if (req.method === "PATCH" && statusMatch) {
    if (!requireAuth(req, res)) return;
    const code = decodeURIComponent(statusMatch[1]).toUpperCase();
    const payload = await collectJson(req);
    const status = String(payload.status || "").trim().toUpperCase();
    const note = String(payload.note || "").trim();

    if (!validStatuses.has(status)) {
      return sendJson(res, 400, { error: "INVALID_STATUS" });
    }

    const orders = await readOrders();
    const order = orders[code];
    if (!order) return sendJson(res, 404, { error: "ORDER_NOT_FOUND" });

    order.productionStatus = status;
    order.productionHistory = Array.isArray(order.productionHistory) ? order.productionHistory : [];

    const historyItem = order.productionHistory.find((item) => item.status === status);
    if (historyItem) {
      historyItem.note = note || historyItem.note || "";
      historyItem.createdAt = historyItem.createdAt || new Date().toISOString();
    } else {
      order.productionHistory.push({
        status,
        note,
        createdAt: new Date().toISOString(),
      });
    }

    if (status === "COMPLETED" && !order.receiveDate) {
      order.receiveDate = new Date().toISOString();
    }

    await writeOrders(orders);
    return sendJson(res, 200, { data: order });
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
