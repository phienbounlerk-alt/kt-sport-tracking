import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dbPath = path.join(root, "data", "db.json");
const ordersDir = path.join(root, "published", "orders");
const mockupsDir = path.join(root, "published", "mockups");

fs.mkdirSync(ordersDir, { recursive: true });
fs.mkdirSync(mockupsDir, { recursive: true });

function extensionForMime(mime) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function publishOrder(order) {
  const publicOrder = { ...order };
  const image = String(order.mockupImage || "");

  if (image.startsWith("data:image/")) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error(`Invalid mockup image for ${order.token}`);

    const ext = extensionForMime(match[1]);
    const relativeImagePath = `published/mockups/${order.token}.${ext}`;
    const imagePath = path.join(root, relativeImagePath);
    fs.writeFileSync(imagePath, Buffer.from(match[2], "base64"));
    publicOrder.mockupImage = relativeImagePath;
  }

  fs.writeFileSync(
    path.join(ordersDir, `${order.token}.json`),
    `${JSON.stringify(publicOrder, null, 2)}\n`,
  );
}

const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
for (const order of db.orders || []) {
  if (!order.token) continue;
  publishOrder(order);
}

console.log(`Published ${(db.orders || []).length} orders`);
