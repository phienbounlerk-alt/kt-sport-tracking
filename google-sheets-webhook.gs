const WEBHOOK_SECRET = "change-this-secret";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  if (WEBHOOK_SECRET && payload.secret !== WEBHOOK_SECRET) {
    return jsonResponse({ ok: false, error: "INVALID_SECRET" });
  }

  if (payload.kind === "orders") {
    writeOrders(payload.orders || []);
  }
  if (payload.kind === "catalog") {
    writeCatalog(payload.catalog || []);
  }
  if (payload.kind === "settings") {
    writeSettings(payload.settings || {});
  }

  return jsonResponse({ ok: true, kind: payload.kind, syncedAt: new Date().toISOString() });
}

function writeOrders(orders) {
  const sheet = getSheet("Orders");
  sheet.clearContents();
  sheet.appendRow([
    "Code",
    "Customer",
    "Phone",
    "Sales",
    "Deposit",
    "Production Status",
    "Products",
    "Total LAK",
    "Created At",
    "Receive Date",
  ]);
  orders.forEach((order) => {
    const products = (order.products || [])
      .map((product) => `${product.productName || ""} ${product.shopSize || ""} x${product.amount || 0}`)
      .join(" / ");
    const total = (order.products || []).reduce((sum, product) => sum + Number(product.totalPrice || 0), 0);
    sheet.appendRow([
      order.code || "",
      order.customerName || "",
      order.phone || "",
      order.assignedAdmin || "",
      order.depositStatus || "",
      order.productionStatus || "",
      products,
      total,
      order.createdAt || "",
      order.receiveDate || "",
    ]);
  });
}

function writeCatalog(catalog) {
  const sheet = getSheet("Catalog");
  sheet.clearContents();
  sheet.appendRow(["ID", "Name", "Category", "Price", "MOQ", "Size", "Visible", "Image"]);
  catalog.forEach((item) => {
    sheet.appendRow([
      item.id || "",
      item.name || "",
      item.category || "",
      item.price || 0,
      item.moq || 1,
      item.size || "",
      item.visible !== false,
      item.image || "",
    ]);
  });
}

function writeSettings(settings) {
  const sheet = getSheet("Settings");
  sheet.clearContents();
  sheet.appendRow(["Key", "Value"]);
  Object.keys(settings).forEach((key) => {
    sheet.appendRow([key, JSON.stringify(settings[key])]);
  });
}

function getSheet(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
