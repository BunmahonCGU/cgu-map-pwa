// ------------------------------------------------------------
// DEVICE SIGN-IN, DEVICES PANEL AND REPLAY PANEL (V2.5)
// ------------------------------------------------------------
// A device without a token sees the sign-in screen: it can use an
// enrolment code (from Tools → Devices on a signed-in device, as a QR
// code or typed) or the admin PIN. apiFetch() in map.js reopens this
// screen whenever the Worker answers 401.

const signinOverlay = document.getElementById("signin-overlay");
const signinName = document.getElementById("signin-name");
const signinCode = document.getElementById("signin-code");
const signinPin = document.getElementById("signin-pin");
const signinError = document.getElementById("signin-error");
const signinNote = document.getElementById("signin-note");

function deviceLabel() {
  const ua = navigator.userAgent;
  const kind = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows"
    : "Browser";
  const name = signinName.value.trim();
  return name ? `${name} (${kind})` : kind;
}

function showSignIn() {
  if (!signinOverlay.classList.contains("hidden")) return;
  signinNote.textContent = deviceToken
    ? "This device's sign-in has expired or was ended. Use a new code or the admin PIN."
    : "This device isn't signed in yet.";
  signinError.textContent = "";
  signinName.value = localStorage.getItem("displayName") || "";
  signinOverlay.classList.remove("hidden");
}

async function finishSignIn(path, body) {
  signinError.textContent = "";
  const name = signinName.value.trim();
  if (name) {
    localStorage.setItem("displayName", name);
    const profileName = document.getElementById("displayNameInput");
    if (profileName) profileName.value = name;
  }
  try {
    const res = await fetch(WORKER_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, name: deviceLabel() })
    });
    const data = await res.json();
    if (data.status !== "ok") {
      signinError.textContent = data.error || "Sign-in failed";
      return;
    }
    deviceToken = data.token;
    try { localStorage.setItem("deviceToken", deviceToken); } catch (err) {}
    signinOverlay.classList.add("hidden");
    signinCode.value = "";
    signinPin.value = "";
    refreshAlerts();
    if (window.liveUsersApi) liveUsersApi.refreshLiveUsers();
  } catch (err) {
    console.error("Sign-in failed:", err);
    signinError.textContent = "Couldn't reach the server — check your connection and try again.";
  }
}

document.getElementById("signin-code-btn").addEventListener("click", () => {
  const code = signinCode.value.trim();
  if (!code) {
    signinCode.focus();
    return;
  }
  finishSignIn("/auth/redeem", { code });
});

document.getElementById("signin-pin-btn").addEventListener("click", async () => {
  const pin = signinPin.value.trim();
  if (!pin) {
    signinPin.focus();
    return;
  }
  finishSignIn("/auth/pin-login", { pinHash: await hashPin(pin) });
});

// ---- Scan QR in the app (mainly for iPhone home-screen apps, which
// don't share sign-in with Safari). The decoder loads only when needed.
const scanBox = document.getElementById("signin-scan");
const scanVideo = document.getElementById("signin-video");
let scanStream = null;

function loadQrReader() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "js/vendor/jsqr.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// An enrolment QR holds the app link with ?enrol=CODE; accept a bare code too.
function enrolCodeFrom(text) {
  try {
    return new URL(text).searchParams.get("enrol");
  } catch (err) {
    return /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(text.trim()) ? text.trim() : null;
  }
}

function stopScan() {
  if (scanStream) scanStream.getTracks().forEach(track => track.stop());
  scanStream = null;
  scanVideo.srcObject = null;
  scanBox.classList.add("hidden");
}

async function startScan() {
  signinError.textContent = "";
  try {
    await loadQrReader();
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  } catch (err) {
    console.warn("Camera unavailable:", err);
    signinError.textContent = "Couldn't open the camera. Type the code instead.";
    stopScan();
    return;
  }
  scanVideo.srcObject = scanStream;
  scanBox.classList.remove("hidden");
  await scanVideo.play().catch(() => {});

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const look = () => {
    if (!scanStream) return;
    if (scanVideo.readyState >= 2 && scanVideo.videoWidth) {
      const scale = Math.min(1, 640 / scanVideo.videoWidth);
      canvas.width = Math.round(scanVideo.videoWidth * scale);
      canvas.height = Math.round(scanVideo.videoHeight * scale);
      ctx.drawImage(scanVideo, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
      const code = found && enrolCodeFrom(found.data);
      if (code) {
        stopScan();
        signinCode.value = code;
        if (signinName.value.trim()) {
          finishSignIn("/auth/redeem", { code });
        } else {
          signinNote.textContent = "Code scanned. Enter your name, then tap Use code.";
          signinName.focus();
        }
        return;
      }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

document.getElementById("signin-scan-btn").addEventListener("click", startScan);
document.getElementById("signin-scan-cancel").addEventListener("click", stopScan);

// Opened from an enrolment QR code: fill in the code, then tidy the URL.
const enrolParam = new URLSearchParams(location.search).get("enrol");
if (enrolParam) {
  history.replaceState(null, "", location.pathname);
  showSignIn();
  signinCode.value = enrolParam;
  signinNote.textContent = "Enter your name, then tap Use code.";
} else if (!deviceToken) {
  showSignIn();
}

// ------------------------------------------------------------
// DEVICES PANEL (Tools → Devices)
// ------------------------------------------------------------
const devicesPanel = document.getElementById("devices-panel");
const enrolBox = document.getElementById("enrol-box");
const devicesList = document.getElementById("devices-list");
let enrolTimer = null;
let devicesPinHash = null;

document.getElementById("menu-devices").addEventListener("click", e => {
  e.stopPropagation();
  closeMenus();
  devicesPanel.classList.remove("hidden");
});

function closeDevicesPanel() {
  devicesPanel.classList.add("hidden");
  clearInterval(enrolTimer);
  enrolBox.classList.add("hidden");
  devicesList.innerHTML = "";
  devicesPinHash = null;
}
document.getElementById("devices-close").addEventListener("click", closeDevicesPanel);

document.getElementById("enrol-btn").addEventListener("click", async () => {
  try {
    const res = await apiFetch("/devices/enrol-code", { method: "POST" });
    const data = await res.json();
    if (data.status !== "ok") {
      alert("Couldn't make a code: " + (data.error || res.status));
      return;
    }
    const link = location.origin + location.pathname + "?enrol=" + data.code;
    const qr = qrcode(0, "M");
    qr.addData(link);
    qr.make();
    document.getElementById("enrol-qr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    document.getElementById("enrol-code").textContent = data.code.slice(0, 4) + "-" + data.code.slice(4);
    enrolBox.classList.remove("hidden");

    const expiryLabel = document.getElementById("enrol-expiry");
    const tick = () => {
      const left = Math.max(0, data.expires - Date.now());
      if (left === 0) {
        clearInterval(enrolTimer);
        expiryLabel.textContent = "Expired. Make a new code.";
        enrolBox.classList.add("expired");
        return;
      }
      const m = Math.floor(left / 60000);
      const s = String(Math.floor(left / 1000) % 60).padStart(2, "0");
      expiryLabel.textContent = `Works once, for ${m}:${s}`;
    };
    enrolBox.classList.remove("expired");
    clearInterval(enrolTimer);
    tick();
    enrolTimer = setInterval(tick, 1000);
  } catch (err) {
    console.error("Enrolment code failed:", err);
    alert("Couldn't make a code — check your connection and try again.");
  }
});

const STATE_LABELS = { active: "Active", expired: "Expired", terminated: "Terminated" };

function formatDate(t) {
  return new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function loadDevices() {
  const res = await apiFetch("/devices/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinHash: devicesPinHash })
  });
  const data = await res.json();
  if (data.status !== "ok") {
    devicesPinHash = null;
    alert("Couldn't load devices: " + (data.error || res.status));
    return;
  }
  devicesList.innerHTML = "";
  data.devices.forEach(d => {
    const li = document.createElement("li");
    li.className = "device-row state-" + d.state;
    const info = document.createElement("div");
    info.className = "device-info";
    const name = document.createElement("strong");
    name.textContent = d.name + (d.id === data.you ? " (this device)" : "");
    const detail = document.createElement("div");
    detail.className = "device-detail";
    detail.textContent =
      `${STATE_LABELS[d.state]} · signed in by ${d.via === "pin" ? "PIN" : "code"} · last used ${formatDate(d.lastSeen)}` +
      (d.state === "active" ? ` · expires ${formatDate(d.expires)}` : "");
    info.append(name, detail);

    const actions = document.createElement("div");
    actions.className = "device-actions";
    const addAction = (label, action, confirmText) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.className = "device-" + action;
      btn.addEventListener("click", () => deviceAction(d, action, confirmText));
      actions.appendChild(btn);
    };
    if (d.state === "active") addAction("Terminate", "terminate", `End ${d.name}'s sign-in? It stays on the list and can be re-enlisted.`);
    else addAction("Re-enlist", "renew");
    addAction("Remove", "remove", `Remove ${d.name} from the list? It will need a new code to sign in again.`);

    li.append(info, actions);
    devicesList.appendChild(li);
  });
  if (data.devices.length === 0) devicesList.textContent = "No devices yet.";
}

async function deviceAction(device, action, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  const res = await apiFetch("/devices/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinHash: devicesPinHash, action, id: device.id })
  });
  const data = await res.json();
  if (data.status !== "ok") {
    alert("That didn't work: " + (data.error || res.status));
    return;
  }
  loadDevices();
}

document.getElementById("devices-load-btn").addEventListener("click", () => {
  askPin("Admin PIN to manage devices", pinHash => {
    devicesPinHash = pinHash;
    loadDevices();
  });
});

// ------------------------------------------------------------
// REPLAY PANEL (Tools → Replay, admin PIN)
// ------------------------------------------------------------
const replayPanel = document.getElementById("replay-panel");
let replayPinHash = null;

document.getElementById("menu-replay").addEventListener("click", e => {
  e.stopPropagation();
  askPin("Admin PIN for replay", async pinHash => {
    const res = await apiFetch("/auth/check-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinHash })
    });
    const data = await res.json();
    if (data.status !== "ok") {
      alert(data.error || "Invalid PIN");
      return;
    }
    replayPinHash = pinHash;
    replayPanel.classList.remove("hidden");
    document.dispatchEvent(new Event("replay-panel-opened"));
  });
});

function closeReplayPanel() {
  replayPanel.classList.add("hidden");
}
document.getElementById("replay-close").addEventListener("click", closeReplayPanel);
