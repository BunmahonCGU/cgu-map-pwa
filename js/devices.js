// ------------------------------------------------------------
// DEVICE SIGN-IN, DEVICES PANEL AND REPLAY PANEL (V2.5, admin unlock V2.7)
// ------------------------------------------------------------
// A device without a token sees the sign-in screen: it can use an
// enrolment code (from Tools → Devices, shown by an admin as a QR code
// or typed) or the admin PIN. apiFetch() in map.js reopens this
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
    setAdminLeft(data.adminLeft || 0); // signing in with the PIN unlocks admin too
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
// Picks up an admin unlock still running from before a reload.
if (deviceToken) refreshAdminStatus();

// ------------------------------------------------------------
// DEVICES PANEL (Tools → Devices, admin)
// ------------------------------------------------------------
const devicesPanel = document.getElementById("devices-panel");
const enrolBox = document.getElementById("enrol-box");
const enrolStatus = document.getElementById("enrol-expiry");
const devicesList = document.getElementById("devices-list");
let enrolTimer = null;
let enrolPoll = null;
let enrolCode = null; // the code on screen: { code, kind, usesLeft, uses, endsAt }

document.getElementById("menu-devices").addEventListener("click", e => {
  e.stopPropagation();
  requireAdmin("Admin PIN for devices", () => {
    closeMenus();
    devicesPanel.classList.remove("hidden");
    loadDevices();
  });
});

function stopEnrolTimers() {
  clearInterval(enrolTimer);
  clearInterval(enrolPoll);
  enrolTimer = enrolPoll = null;
}

function closeDevicesPanel() {
  devicesPanel.classList.add("hidden");
  stopEnrolTimers();
  enrolCode = null;
  enrolBox.classList.add("hidden");
  devicesList.innerHTML = "";
}
document.getElementById("devices-close").addEventListener("click", closeDevicesPanel);

const CODE_NAMES = { single: "Single-use code", group: "Group code" };

function showEnrolStatus() {
  if (!enrolCode) return;
  const left = Math.max(0, enrolCode.endsAt - Date.now());
  let ended = null;
  if (enrolCode.cancelled) ended = "Cancelled.";
  else if (enrolCode.usesLeft <= 0) ended = enrolCode.kind === "group" ? "All 10 uses taken." : "Used.";
  else if (left === 0) ended = "Expired.";
  if (ended) {
    stopEnrolTimers();
    enrolStatus.textContent = ended + " Make a new code if you need one.";
    enrolBox.classList.add("expired");
    return;
  }
  const m = Math.floor(left / 60000);
  const s = String(Math.floor(left / 1000) % 60).padStart(2, "0");
  enrolStatus.textContent = enrolCode.kind === "group"
    ? `${CODE_NAMES.group}: ${enrolCode.usesLeft} of ${enrolCode.uses} uses left · ${m}:${s} left`
    : `${CODE_NAMES.single}: 1 device · ${m}:${s} left`;
}

// Uses left, so the countdown drops as phones sign in.
async function pollEnrolCode() {
  if (!enrolCode) return;
  try {
    const res = await apiFetch("/devices/code-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: enrolCode.code })
    });
    const data = await res.json();
    if (data.status !== "ok" || !enrolCode || data.code !== enrolCode.code) return;
    const before = enrolCode.usesLeft;
    if (data.gone) {
      if (Date.now() < enrolCode.endsAt - 1000) enrolCode.usesLeft = 0;
    } else {
      enrolCode.usesLeft = data.usesLeft;
    }
    if (enrolCode.usesLeft !== before) loadDevices();
    showEnrolStatus();
  } catch (err) {}
}

function makeEnrolCode(kind) {
  adminPost("Admin PIN to make a code", "/devices/enrol-code", { kind }, data => {
    if (data.status !== "ok") {
      alert("Couldn't make a code: " + data.error);
      return;
    }
    const link = location.origin + location.pathname + "?enrol=" + data.code;
    const qr = qrcode(0, "M");
    qr.addData(link);
    qr.make();
    document.getElementById("enrol-qr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    document.getElementById("enrol-code").textContent = data.code.slice(0, 4) + "-" + data.code.slice(4);
    enrolBox.classList.remove("hidden", "expired");

    // Count down from the time left, not the server's clock time.
    enrolCode = {
      code: data.code,
      kind: data.kind,
      usesLeft: data.usesLeft,
      uses: data.uses,
      endsAt: Date.now() + data.left
    };
    stopEnrolTimers();
    showEnrolStatus();
    enrolTimer = setInterval(showEnrolStatus, 1000);
    enrolPoll = setInterval(pollEnrolCode, 5000);
  });
}
document.getElementById("enrol-single-btn").addEventListener("click", () => makeEnrolCode("single"));
document.getElementById("enrol-group-btn").addEventListener("click", () => makeEnrolCode("group"));

document.getElementById("enrol-cancel").addEventListener("click", () => {
  if (!enrolCode) return;
  const code = enrolCode.code;
  adminPost("Admin PIN to cancel the code", "/devices/cancel-code", { code }, data => {
    if (data.status !== "ok") {
      alert("Couldn't cancel the code: " + data.error);
      return;
    }
    if (enrolCode && enrolCode.code === code) {
      enrolCode.cancelled = true;
      showEnrolStatus();
    }
  });
});

const STATE_LABELS = { active: "Active", expired: "Expired", terminated: "Terminated" };

function formatDate(t) {
  return new Date(t).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatCode(code) {
  return code ? code.slice(0, 4) + "-" + code.slice(4) : "";
}

// How the device signed in. Devices from before V2.7 just say "code".
function joinedLabel(d) {
  if (d.via === "pin") return "PIN";
  if (d.via === "group") return "group code " + formatCode(d.joinedWith && d.joinedWith.code);
  if (d.via === "single") return "single-use code";
  return "code";
}

function loadDevices() {
  adminPost("Admin PIN for devices", "/devices/list", {}, data => {
    if (data.status !== "ok") {
      alert("Couldn't load devices: " + data.error);
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
        `${STATE_LABELS[d.state]} · joined ${formatDate(d.created)} by ${joinedLabel(d)} · last used ${formatDate(d.lastSeen)}` +
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
  });
}

function deviceAction(device, action, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  adminPost("Admin PIN for devices", "/devices/action", { action, id: device.id }, data => {
    if (data.status !== "ok") {
      alert("That didn't work: " + data.error);
      return;
    }
    loadDevices();
  });
}

document.getElementById("devices-load-btn").addEventListener("click", loadDevices);

// ------------------------------------------------------------
// REPLAY PANEL (Tools → Replay, admin)
// ------------------------------------------------------------
const replayPanel = document.getElementById("replay-panel");

document.getElementById("menu-replay").addEventListener("click", e => {
  e.stopPropagation();
  requireAdmin("Admin PIN for replay", () => {
    closeMenus();
    replayPanel.classList.remove("hidden");
    document.dispatchEvent(new Event("replay-panel-opened"));
  });
});

function closeReplayPanel() {
  replayPanel.classList.add("hidden");
}
document.getElementById("replay-close").addEventListener("click", closeReplayPanel);
