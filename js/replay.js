// ------------------------------------------------------------
// HISTORICAL REPLAY (V2, admin only)
// ------------------------------------------------------------
// Loads a block of archived history and redraws the map as it stood at
// any moment in it. While replay is on, replayMode (map.js) stops this
// device's live polling and blocks posting; other devices are unaffected.
//
// History format (the archive's, and data/replay-demo.json's):
//   events: [{ t, kind: "post" | "delete", id, alert }]  — alert feed changes
//   frames: [{ t, users: [{ userId, displayName, team, lat, lng, timestamp }] }]
// Everything is drawn through the same renderAlerts() / renderLiveUsers()
// as live mode, so the Show Zones / Cleared / Live Users toggles apply.

const REPLAY_TICK_MS = 250;

const replay = {
  events: [],
  frames: [],
  start: 0,
  end: 0,
  t: 0,
  timer: null,
};

const replayBar = document.getElementById("replay-bar");
const replaySlider = document.getElementById("replay-slider");
const replayTimeLabel = document.getElementById("replay-time");
const replayNameLabel = document.getElementById("replay-name");
const replayPlayBtn = document.getElementById("replay-play");
const replaySpeed = document.getElementById("replay-speed");

function startReplay(history) {
  replay.events = [...(history.events || [])].sort((a, b) => a.t - b.t);
  replay.frames = [...(history.frames || [])].sort((a, b) => a.t - b.t);
  const times = [...replay.events, ...replay.frames].map(x => x.t);
  if (times.length === 0) {
    alert("That history is empty.");
    return;
  }
  replay.start = history.meta?.start ?? Math.min(...times);
  replay.end = history.meta?.end ?? Math.max(...times);

  replayMode = true;
  liveUsersApi.clearLiveUserMarkers();
  replaySlider.min = replay.start;
  replaySlider.max = replay.end;
  replaySlider.step = 1000;
  replayNameLabel.textContent = history.meta?.name || "";
  replayBar.classList.remove("hidden");
  document.body.classList.add("replaying");
  replaySeek(replay.start);

  // Frame the area the history covers.
  const points = replay.frames.flatMap(f => f.users.map(u => [u.lat, u.lng]));
  if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
}

function exitReplay() {
  replayPause();
  replayMode = false;
  replayBar.classList.add("hidden");
  document.body.classList.remove("replaying");
  liveUsersApi.clearLiveUserMarkers();
  refreshAlerts();
  liveUsersApi.refreshLiveUsers();
}

// Alerts standing at time t: every post up to t, minus anything deleted by then.
function replayAlertsAt(t) {
  const standing = new Map();
  for (const e of replay.events) {
    if (e.t > t) break;
    if (e.kind === "post") standing.set(e.id, e.alert);
    else if (e.kind === "delete") standing.delete(e.id);
  }
  return [...standing.values()];
}

// Last position frame at or before t (binary search; frames are sorted).
function replayFrameAt(t) {
  let lo = 0, hi = replay.frames.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (replay.frames[mid].t <= t) { found = replay.frames[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}

function replaySeek(t) {
  replay.t = Math.min(replay.end, Math.max(replay.start, t));
  replaySlider.value = replay.t;
  replayTimeLabel.textContent = new Date(replay.t).toLocaleString([], {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  renderAlerts(replayAlertsAt(replay.t), replay.t, { readOnly: true });
  liveUsersApi.renderLiveUsers(replayFrameAt(replay.t)?.users || [], replay.t);
}

function replayPlay() {
  if (replay.timer) return;
  if (replay.t >= replay.end) replaySeek(replay.start);
  replayPlayBtn.textContent = "⏸";
  replay.timer = setInterval(() => {
    replaySeek(replay.t + REPLAY_TICK_MS * Number(replaySpeed.value));
    if (replay.t >= replay.end) replayPause();
  }, REPLAY_TICK_MS);
}

function replayPause() {
  clearInterval(replay.timer);
  replay.timer = null;
  replayPlayBtn.textContent = "▶";
}

replaySlider.addEventListener("input", () => replaySeek(Number(replaySlider.value)));
replayPlayBtn.addEventListener("click", () => (replay.timer ? replayPause() : replayPlay()));
document.getElementById("replay-exit").addEventListener("click", exitReplay);
replayBar.querySelectorAll("[data-step]").forEach(btn => {
  btn.addEventListener("click", () => replaySeek(replay.t + Number(btn.dataset.step) * 1000));
});

document.getElementById("replay-demo-btn").addEventListener("click", async () => {
  try {
    const res = await fetch("data/replay-demo.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    closeAdminPanel();
    startReplay(await res.json());
  } catch (err) {
    console.error("Could not load demo history:", err);
    alert("Could not load the demo history — check your connection and try again.");
  }
});
