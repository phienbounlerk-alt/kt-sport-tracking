const WEBHOOK_SECRET = "change-this-secret";
const SPREADSHEET_ID = "17eLY0G-JRvps41-8YsroWR3f4JWNZyNZRX1zH7zBAFc";

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
  const rows = [[
    "Code",
    "Customer",
    "Phone",
    "Sales",
    "Deposit",
    "Deposit Amount",
    "Balance Amount",
    "Production Status",
    "Current Actor",
    "Products",
    "Total LAK",
    "Created At",
    "Receive Date",
    "Deleted At",
  ]];
  orders.forEach((order) => {
    const products = (order.products || [])
      .map((product) => {
        return [
          product.productType || "",
          product.productName || "",
          product.shopSize || "",
          product.patternQty ? `pattern ${product.patternQty}` : "",
          product.fabricQty ? `fabric ${product.fabricQty}` : "",
          `x${product.amount || 0}`,
        ]
          .filter(Boolean)
          .join(" ");
      })
      .join(" / ");
    const total =
      Number(order.grandTotal || 0) ||
      (order.products || []).reduce((sum, product) => sum + Number(product.totalPrice || 0), 0);
    const currentHistory = (order.productionHistory || []).find((item) => item.status === order.productionStatus) || {};
    rows.push([
      order.code || "",
      order.customerName || "",
      order.phone || "",
      order.assignedAdmin || "",
      order.depositStatus || "",
      order.depositAmount || 0,
      order.balanceAmount || 0,
      order.productionStatus || "",
      currentHistory.actor || "",
      products,
      total,
      order.createdAt || "",
      order.receiveDate || "",
      order.deletedAt || "",
    ]);
  });
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  writeWorkflowHistory(orders);
}

function writeWorkflowHistory(orders) {
  const sheet = getSheet("Workflow History");
  sheet.clearContents();
  const rows = [["Code", "Status", "Actor", "Note", "Created At", "Images"]];
  orders.forEach((order) => {
    (order.productionHistory || []).forEach((item) => {
      rows.push([
        order.code || "",
        item.status || "",
        item.actor || "",
        item.note || "",
        item.createdAt || "",
        (item.images || []).join(" / "),
      ]);
    });
  });
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function writeCatalog(catalog) {
  const sheet = getSheet("Catalog");
  sheet.clearContents();
  const rows = [["ID", "Name", "Category", "Price", "MOQ", "Size", "Visible", "Image"]];
  catalog.forEach((item) => {
    rows.push([
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
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function writeSettings(settings) {
  const sheet = getSheet("Settings");
  sheet.clearContents();
  const rows = [["Key", "Value"]];
  Object.keys(settings).forEach((key) => {
    rows.push([key, JSON.stringify(settings[key])]);
  });
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function getSheet(name) {
  const spreadsheet = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
