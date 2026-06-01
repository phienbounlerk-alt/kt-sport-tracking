function setLoginNotice(message, tone = "muted") {
  const notice = document.querySelector("#loginNotice");
  notice.textContent = message;
  notice.dataset.tone = tone;
}

async function checkSession() {
  const response = await fetch("/api/session");
  const result = await response.json();
  if (result.authenticated) {
    window.location.href = "/admin.html";
  }
}

async function login(event) {
  event.preventDefault();
  const password = document.querySelector("#passwordInput").value;
  setLoginNotice("ກຳລັງ login...", "muted");

  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    setLoginNotice("Password ບໍ່ຖືກຕ້ອງ", "error");
    return;
  }

  setLoginNotice("Login ສຳເລັດ", "success");
  window.location.href = "/admin.html";
}

document.querySelector("#loginForm").addEventListener("submit", login);
document.querySelector("#togglePasswordButton").addEventListener("click", () => {
  const input = document.querySelector("#passwordInput");
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  document.querySelector("#togglePasswordButton").setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
});
checkSession();
