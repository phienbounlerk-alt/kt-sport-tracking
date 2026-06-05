const params = new URLSearchParams(window.location.search);
const code = (params.get("code") || "").trim().toUpperCase();
const statusKey = (params.get("status") || "").trim().toUpperCase();
const token = params.get("token") || "";

function setStepNotice(message, tone = "muted") {
  const notice = document.querySelector("#stepNotice");
  notice.textContent = message;
  notice.dataset.tone = tone;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fileToImageBitmap(file, dataUrl) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function normalizeImageFileForUpload(file) {
  if (file.size > 25_000_000) throw new Error("IMAGE_TOO_LARGE");
  const dataUrl = await readFileAsDataUrl(file);
  if (String(file.type || "").toLowerCase() === "image/gif") return dataUrl;

  try {
    const image = await fileToImageBitmap(file, dataUrl);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    if (!width || !height) return dataUrl;
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (typeof image.close === "function") image.close();
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return dataUrl;
  }
}

async function readFilesAsDataUrls(files) {
  const selectedFiles = [...(files || [])].slice(0, 10);
  if (selectedFiles.some((file) => file.size > 25_000_000)) {
    throw new Error("IMAGE_TOO_LARGE");
  }
  const dataUrls = [];
  for (const file of selectedFiles) {
    dataUrls.push(await normalizeImageFileForUpload(file));
  }
  return dataUrls;
}

async function loadStep() {
  const response = await fetch(
    `/api/workflow/${encodeURIComponent(code)}/${encodeURIComponent(statusKey)}?token=${encodeURIComponent(token)}`,
  );
  if (!response.ok) throw new Error("INVALID_LINK");
  const result = await response.json();
  document.querySelector("#stepTitle").textContent = result.data.label;
  document.querySelector("#stepSummary").innerHTML = `
    <div><span>ເລກບິນ</span><strong>${result.data.code}</strong></div>
    <div><span>ລູກຄ້າ</span><strong>${result.data.customerName || "-"}</strong></div>
    <div><span>ສະຖານະປັດຈຸບັນ</span><strong>${result.data.currentStatusLabel}</strong></div>
  `;
  setStepNotice("Link ຖືກຕ້ອງ ສາມາດອັບເດດໄດ້", "success");
}

async function submitStep(event) {
  event.preventDefault();
  const button = document.querySelector("#stepSubmitButton");
  button.disabled = true;
  setStepNotice("ກຳລັງ upload ແລະອັບເດດ...", "muted");

  let images = [];
  try {
    images = await readFilesAsDataUrls(document.querySelector("#stepImagesInput").files);
  } catch {
    button.disabled = false;
    setStepNotice("ຮູບໃຫຍ່ເກີນ 25MB ຕໍ່ຮູບ", "error");
    return;
  }

  const response = await fetch(
    `/api/workflow/${encodeURIComponent(code)}/${encodeURIComponent(statusKey)}?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: document.querySelector("#stepNoteInput").value.trim(),
        images,
      }),
    },
  );

  if (!response.ok) {
    button.disabled = false;
    setStepNotice("ອັບເດດບໍ່ສຳເລັດ ກວດ link ຫຼື ລອງໃໝ່", "error");
    return;
  }

  setStepNotice("ອັບເດດສຳເລັດແລ້ວ ລູກຄ້າຈະເຫັນແບບ real time", "success");
  document.querySelector("#stepImagesInput").value = "";
  button.disabled = false;
}

document.querySelector("#stepForm").addEventListener("submit", submitStep);

loadStep().catch(() => {
  document.querySelector("#stepTitle").textContent = "Link ບໍ່ຖືກຕ້ອງ";
  document.querySelector("#stepSubmitButton").disabled = true;
  setStepNotice("Link ນີ້ໃຊ້ບໍ່ໄດ້ ຫຼື ບິນບໍ່ມີ", "error");
});
