const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 5173);

const defaultSettings = {
  shopName: "KT SPORT",
  tagline: "ເຄທີສະປອສ · ຮ້ານເສື້ອກິລາ ແລະງານ custom",
  initials: "KT",
  phone: "",
  primaryColor: "#e21d2b",
  accentColor: "#8f111b",
  logoUrl: "assets/kt-sport-logo.jpg",
};

const seedDb = {
  settings: defaultSettings,
  orders: [
    {
      id: crypto.randomUUID(),
      token: "demo-order",
      code: "KT260523101",
      customerName: "ທີມ ສິງທອງ FC",
      phone: "020 5555 1234",
      productType: "ເສື້ອບານ",
      teamName: "Singthong FC",
      quantity: 24,
      orderDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      statusIndex: 4,
      paymentStatus: "ມັດຈຳແລ້ວ",
      totalAmount: 2400000,
      depositAmount: 1000000,
      mockupImage: "",
      note: "ແບບຖືກອະນຸມັດແລ້ວ ກຳລັງເຂົ້າຂັ້ນຕອນຜະລິດ.",
    },
  ],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

async function readDb() {
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    const db = JSON.parse(raw);
    return {
      settings: { ...defaultSettings, ...(db.settings || {}) },
      orders: Array.isArray(db.orders) ? db.orders : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeDb(seedDb);
    return seedDb;
  }
}

async function writeDb(db) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function sendError(res, message, status = 500) {
  sendJson(res, { error: message }, status);
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, { ok: true, dataDir });
    return true;
  }

  const db = await readDb();

  if (req.method === "GET" && pathname === "/api/orders") {
    sendJson(res, db.orders);
    return true;
  }

  if (req.method === "PUT" && pathname === "/api/orders") {
    const orders = await readBody(req);
    db.orders = Array.isArray(orders) ? orders : [];
    await writeDb(db);
    sendJson(res, db.orders);
    return true;
  }

  if (req.method === "GET" && pathname === "/api/settings") {
    sendJson(res, db.settings);
    return true;
  }

  if (req.method === "PUT" && pathname === "/api/settings") {
    db.settings = { ...defaultSettings, ...(await readBody(req)) };
    await writeDb(db);
    sendJson(res, db.settings);
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendError(res, "Not found", 404);
    return true;
  }

  return false;
}

async function serveStatic(req, res, pathname) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(root)) {
    sendError(res, "Forbidden", 403);
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
    });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      const index = await fs.readFile(path.join(root, "index.html"));
      res.writeHead(200, { "Content-Type": mimeTypes[".html"], "Cache-Control": "no-store" });
      res.end(index);
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (await handleApi(req, res, url.pathname)) return;
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendError(res, "Server error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`KT SPORT order tracker running at http://localhost:${port}`);
});
