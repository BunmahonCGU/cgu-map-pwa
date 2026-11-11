// ------------------------------------------------------------
// DICTATION + HANDOVER NOTES (V2.20)
// ------------------------------------------------------------
// attachDictation() turns a 🎙 button into hold-to-talk for a text box,
// using the phone's own speech recognition (Web Speech API: free, no
// key; Google or Apple turn the speech into text). The words land in the
// text box so they can be checked before posting. Where the browser has
// no speech recognition, the button says to use the keyboard's own mic.
//
// The Handover Notes panel (Display → Handover Notes, in red) keeps
// notes for handing casualties over to the emergency services, one tab
// per casualty. See HANDOVER NOTES in worker-updated.js for who sees
// what and when it expires. Uses apiFetch, isAdminNow, requireAdmin,
// escapeHtml, closeMenus and replayMode from map.js.

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const DICTATION_LANG = "en-IE";
const HOLD_MS = 350; // a press shorter than this is a tap: nothing kept, just a hint

function attachDictation(button, textarea, statusEl) {
  const say = text => { if (statusEl) statusEl.textContent = text || ""; };
  let rec = null;
  let base = "";       // text box contents when recording started
  let finalText = "";  // finished phrases so far
  let pressedAt = 0;

  const show = interim => {
    const spoken = (finalText + interim).trim();
    textarea.value = base + (base && spoken ? " " : "") + spoken;
    textarea.dispatchEvent(new Event("input"));
  };

  function start() {
    if (rec) return;
    if (!SpeechRec) {
      say("This phone's browser can't dictate here. Tap the text box and use the 🎤 on your keyboard instead.");
      textarea.focus();
      return;
    }
    base = textarea.value.trim();
    finalText = "";
    rec = new SpeechRec();
    rec.lang = DICTATION_LANG;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = e => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      show(interim);
    };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        say("Microphone or speech recognition is blocked. Allow it in the phone's settings, or use the keyboard's 🎤.");
      } else if (e.error === "network") {
        say("Dictation needs signal. Use the keyboard's 🎤 or type the note.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        say("Dictation stopped (" + e.error + "). Try again, or type the note.");
      }
    };
    rec.onend = () => {
      show("");
      rec = null;
      button.classList.remove("recording");
      if (statusEl && statusEl.textContent === "Listening…") say("Check the text, then post it.");
    };
    try {
      rec.start();
      button.classList.add("recording");
      say("Listening…");
    } catch (err) {
      rec = null;
      say("Couldn't start dictation. Try again, or use the keyboard's 🎤.");
    }
  }

  function stop() {
    if (rec) rec.stop();
  }

  button.addEventListener("pointerdown", e => {
    e.preventDefault();
    pressedAt = Date.now();
    start();
  });
  const release = () => {
    if (!pressedAt) return;
    const held = Date.now() - pressedAt;
    pressedAt = 0;
    if (!rec) return;
    // Hold to record only (V2.21): letting go always stops it, so it
    // can never be left listening by accident.
    stop();
    if (held < HOLD_MS) say("Keep holding the button while you speak, then let go.");
  };
  // Switching away from the app also stops it.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") { pressedAt = 0; stop(); }
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("contextmenu", e => e.preventDefault());
  button.addEventListener("click", e => e.preventDefault());
}

// Post Update gets the same button.
attachDictation(
  document.getElementById("admin-dictate"),
  document.getElementById("admin-message"),
  document.getElementById("admin-dictate-status")
);

// ------------------------------------------------------------
// HANDOVER NOTES PANEL
// ------------------------------------------------------------
const HANDOVER_POLL_MS = 15000;
const handoverPanel = document.getElementById("handover-panel");
const handoverToggle = document.getElementById("handoverToggle");
const handoverTabsEl = document.getElementById("handover-tabs");
const handoverStatus = document.getElementById("handover-status");

const handover = {
  tabs: [],
  notes: [],
  selected: localStorage.getItem("handoverTab") || null,
  editing: null,     // id of the note being edited
  timer: null,
  replay: null,      // { tabs, notes, t } while replaying
};

const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const myName = () => localStorage.getItem("displayName") || "Unknown";
const draftKey = tabId => "handoverDraft:" + tabId;

function handoverLeft(ms) {
  if (ms <= 0) return "expiring";
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `${h}h left` : `${Math.max(1, Math.round(ms / 60000))}m left`;
}

async function handoverPost(path, body) {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author: myName(), ...body })
  });
  const data = await res.json();
  if (data.status !== "ok") {
    const err = new Error(data.error || "Something went wrong");
    err.admin = !!data.admin;
    throw err;
  }
  return data;
}

async function refreshHandover() {
  if (replayMode || handoverPanel.classList.contains("hidden")) return;
  try {
    const res = await apiFetch("/handover?cb=" + Date.now(), { cache: "no-store" });
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.error);
    handover.tabs = data.tabs;
    handover.notes = data.notes;
    handoverStatus.textContent = "";
  } catch (err) {
    handoverStatus.textContent = "No signal: showing the notes as last loaded.";
  }
  renderHandover();
}

function openHandover() {
  closeMenus();
  handoverPanel.classList.remove("hidden");
  checkCards.open(); // IRCG check cards behind the panel (js/checkcards.js)
  handoverToggle.checked = true;
  clearInterval(handover.timer);
  handover.timer = setInterval(() => {
    if (document.visibilityState === "visible") refreshHandover();
  }, HANDOVER_POLL_MS);
  if (handover.replay) renderHandover();
  else refreshHandover();
}

function closeHandover() {
  handoverPanel.classList.add("hidden");
  checkCards.close();
  handoverToggle.checked = false;
  clearInterval(handover.timer);
  handover.timer = null;
}

handoverToggle.addEventListener("change", () => (handoverToggle.checked ? openHandover() : closeHandover()));
document.getElementById("handover-close").addEventListener("click", closeHandover);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshHandover();
});

// What to draw: live data, or the replay's notes at its current time.
function handoverView() {
  return handover.replay || { tabs: handover.tabs, notes: handover.notes };
}

// The composer (text box + 🎙 + Post) is fixed in the page, so the
// 15-second refresh never interrupts someone dictating or typing.
const handoverText = document.getElementById("handover-text");
const handoverCompose = document.getElementById("handover-compose");
const handoverListEl = document.getElementById("handover-list");
const handoverActions = document.getElementById("handover-actions");
const handoverHint = document.getElementById("handover-hint");
let composerTab = null; // the tab the text box's draft belongs to

function saveDraft() {
  if (!composerTab) return;
  try { localStorage.setItem(draftKey(composerTab), handoverText.value); } catch (err) {}
}
handoverText.addEventListener("input", saveDraft);
attachDictation(document.getElementById("handover-dictate"), handoverText, document.getElementById("handover-dictate-status"));
document.getElementById("handover-send").addEventListener("click", sendHandoverNote);

function selectHandoverTab(id) {
  handover.selected = id;
  handover.editing = null;
  try { localStorage.setItem("handoverTab", id); } catch (err) {}
  renderHandover();
}

function renderHandover() {
  const { tabs, notes } = handoverView();
  const inReplay = !!handover.replay;
  if (!tabs.some(t => t.id === handover.selected)) handover.selected = tabs.length ? tabs[tabs.length - 1].id : null;
  const tab = tabs.find(t => t.id === handover.selected);
  const admin = isAdminNow();

  // Tabs row
  handoverTabsEl.innerHTML = "";
  tabs.forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "handover-tab" + (t.id === handover.selected ? " selected" : "");
    b.innerHTML = `${escapeHtml(t.name)}<small>${inReplay ? "" : handoverLeft(t.left)}</small>`;
    b.addEventListener("click", () => selectHandoverTab(t.id));
    handoverTabsEl.appendChild(b);
  });
  if (!inReplay) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "handover-tab add";
    add.textContent = "+ Casualty";
    add.addEventListener("click", addHandoverTab);
    handoverTabsEl.appendChild(add);
  }

  // The text box follows the selected tab, keeping each tab's draft.
  const newComposerTab = !inReplay && tab ? tab.id : null;
  if (newComposerTab !== composerTab) {
    saveDraft();
    composerTab = newComposerTab;
    let draft = "";
    try { draft = (composerTab && localStorage.getItem(draftKey(composerTab))) || ""; } catch (err) {}
    handoverText.value = draft;
    document.getElementById("handover-dictate-status").textContent = "";
  }
  handoverCompose.classList.toggle("hidden", !composerTab);
  handoverHint.textContent = composerTab && !admin ? "You see only your own notes here. Admins see everyone's." : "";

  if (!tab) {
    handoverListEl.classList.remove("has-notes", "editing");
    delete handoverListEl.dataset.key;
    handoverActions.innerHTML = "";
    handoverListEl.innerHTML = inReplay
      ? '<li class="handover-hint">No handover notes at this point in the replay.</li>'
      : '<li class="handover-hint">No casualties yet. Tap <b>+ Casualty</b> to start a tab, then hold 🎙 to dictate a note.</li>';
    return;
  }

  // Don't redraw under someone editing a note.
  if (handover.editing && handoverListEl.querySelector(".handover-edit")) return;

  const tabNotes = notes.filter(n => n.tabId === tab.id).sort((a, b) => a.t - b.t);
  let actions = "";
  if (!inReplay) {
    actions += '<button type="button" id="handover-crew">📋 Show crew</button>';
    if (admin) actions += '<button type="button" id="handover-close-tab">Close tab</button>';
  }
  handoverActions.innerHTML = actions;

  let html = "";
  if (tab.hidden && !admin) {
    html += `<li class="handover-hint">${tab.hidden} more note${tab.hidden === 1 ? "" : "s"} from others: only admins can see them.</li>`;
  }
  if (!tabNotes.length) html += '<li class="handover-hint">No notes in this tab yet.</li>';
  tabNotes.forEach(n => {
    const canChange = !inReplay && !n.deleted && (n.mine || admin);
    const meta = `${fmtTime(n.t)} · ${escapeHtml(n.author)}`;
    if (handover.editing === n.id) {
      html += `<li class="handover-note handover-edit" data-id="${n.id}">
        <div class="handover-meta">${meta}</div>
        <textarea>${escapeHtml(n.text)}</textarea>
        <div class="dialog-buttons"><button type="button" class="primary" data-act="save">Save</button><button type="button" data-act="cancel">Cancel</button></div>
      </li>`;
      return;
    }
    const icons = canChange
      ? '<span class="handover-icons"><button type="button" data-act="edit" title="Edit">✏️</button><button type="button" data-act="delete" title="Delete">🗑</button></span>'
      : "";
    const edited = n.edited ? `<div class="handover-edited">edited ${fmtTime(n.edited.t)} by ${escapeHtml(n.edited.by)}</div>` : "";
    const deleted = n.deleted ? `<div class="handover-edited">deleted ${fmtTime(n.deleted.t)} by ${escapeHtml(n.deleted.by)}</div>` : "";
    html += `<li class="handover-note${n.deleted ? " deleted" : ""}" data-id="${n.id}">
      <div class="handover-meta">${meta}${icons}</div>
      <div class="handover-text">${escapeHtml(n.text)}</div>${edited}${deleted}
    </li>`;
  });
  // V2.24: the list is a small scrolling box. Show the newest note when a
  // tab is opened or a note arrives; otherwise keep the reader's place.
  const list = handoverListEl;
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  const prevTop = list.scrollTop;
  const prevKey = list.dataset.key;
  const key = tab.id + ":" + tabNotes.length;
  list.innerHTML = html;
  list.classList.add("has-notes");
  list.classList.toggle("editing", !!handover.editing);
  list.dataset.key = key;
  if (handover.editing) {
    const box = list.querySelector(".handover-edit");
    if (box) box.scrollIntoView({ block: "nearest" });
  } else if (atBottom || prevKey !== key) {
    list.scrollTop = list.scrollHeight;
  } else {
    list.scrollTop = prevTop;
  }

  if (inReplay) return;
  document.getElementById("handover-crew").addEventListener("click", () => showCrewView(tab, tabNotes));
  const closeBtn = document.getElementById("handover-close-tab");
  if (closeBtn) closeBtn.addEventListener("click", () => closeHandoverTab(tab));
  handoverListEl.querySelectorAll(".handover-note [data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const li = btn.closest(".handover-note");
      const note = tabNotes.find(n => n.id === li.dataset.id);
      if (note) noteAction(btn.dataset.act, note, li);
    });
  });
}

async function addHandoverTab() {
  if (replayMode) return;
  const count = handover.tabs.length + 1;
  const name = prompt("Name for this casualty tab (a description, not the person's name):", "Casualty " + count);
  if (!name || !name.trim()) return;
  try {
    const data = await handoverPost("/handover/tab", { name: name.trim() });
    handover.selected = data.tab.id;
    try { localStorage.setItem("handoverTab", data.tab.id); } catch (err) {}
    await refreshHandover();
  } catch (err) {
    alert(err.message === "Failed to fetch" ? "No signal: couldn't add the tab. Try again when you have signal." : err.message);
  }
}

async function sendHandoverNote() {
  const tabId = composerTab;
  const text = handoverText.value.trim();
  if (!tabId || !text) {
    handoverText.focus();
    return;
  }
  const btn = document.getElementById("handover-send");
  btn.disabled = true;
  try {
    await handoverPost("/handover/note", { tabId, text });
    if (composerTab === tabId) handoverText.value = "";
    try { localStorage.removeItem(draftKey(tabId)); } catch (err) {}
    await refreshHandover();
  } catch (err) {
    // The text stays in the box (and on the phone), so nothing is lost.
    alert(err.message === "Failed to fetch"
      ? "No signal: the note wasn't posted. It's kept here; tap Post note again when you have signal."
      : err.message);
  } finally {
    btn.disabled = false;
  }
}

async function noteAction(act, note, li) {
  if (act === "edit") {
    handover.editing = note.id;
    renderHandover();
    const box = handoverListEl.querySelector(".handover-edit textarea");
    if (box) box.focus();
    return;
  }
  if (act === "cancel") {
    handover.editing = null;
    renderHandover();
    return;
  }
  const run = async () => {
    if (act === "save") {
      const text = li.querySelector("textarea").value.trim();
      await handoverPost("/handover/edit", { tabId: note.tabId, id: note.id, text });
      handover.editing = null;
    } else if (act === "delete") {
      await handoverPost("/handover/delete", { tabId: note.tabId, id: note.id });
    }
    await refreshHandover();
  };
  if (act === "delete" && !confirm("Delete this note?\n\n" + note.text)) return;
  try {
    await run();
  } catch (err) {
    if (err.admin) {
      requireAdmin("Admin PIN to change someone else's note", () => run().catch(e => alert(e.message)));
    } else {
      alert(err.message === "Failed to fetch" ? "No signal: try again when you have signal." : err.message);
    }
  }
}

function closeHandoverTab(tab) {
  if (!confirm(`Close "${tab.name}"? Its notes leave the app now (they stay in replay).`)) return;
  requireAdmin("Admin PIN to close a casualty tab", async () => {
    try {
      await handoverPost("/handover/close-tab", { tabId: tab.id });
      try { localStorage.removeItem(draftKey(tab.id)); } catch (err) {}
      await refreshHandover();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ------------------------------------------------------------
// SHOW CREW: one casualty's notes in large text, to hand the phone to
// the ambulance crew, with Copy to paste them into a message.
// ------------------------------------------------------------
const crewView = document.getElementById("handover-crew-view");

function crewPlainText(tab, notes) {
  return tab.name + "\n" + notes.map(n => `${fmtTime(n.t)} ${n.author}: ${n.text}`).join("\n");
}

function showCrewView(tab, notes) {
  document.getElementById("handover-crew-title").textContent = tab.name;
  document.getElementById("handover-crew-list").innerHTML = notes.length
    ? notes.map(n => `<li><b>${fmtTime(n.t)}</b> <span>${escapeHtml(n.author)}</span><p>${escapeHtml(n.text)}</p></li>`).join("")
    : "<li>No notes yet.</li>";
  document.getElementById("handover-crew-note").textContent = isAdminNow()
    ? "" : "Only your own notes are shown. An admin's phone shows everyone's.";
  crewView.dataset.text = crewPlainText(tab, notes);
  crewView.classList.remove("hidden");
}

document.getElementById("handover-crew-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(crewView.dataset.text || "");
    document.getElementById("handover-crew-note").textContent = "Copied. Paste it into a message.";
  } catch (err) {
    document.getElementById("handover-crew-note").textContent = "Couldn't copy on this phone.";
  }
});
document.getElementById("handover-crew-close").addEventListener("click", () => crewView.classList.add("hidden"));

// ------------------------------------------------------------
// REPLAY: rebuilds the notes as they stood at time t from the archive's
// hn-* events (js/replay.js calls these). Deleted notes stay visible,
// struck through, so replay keeps the full record.
// ------------------------------------------------------------
function handoverReplayAt(events, t) {
  const tabs = new Map();
  const notes = new Map();
  for (const e of events) {
    if (e.t > t) break;
    if (e.kind === "hn-tab" && e.tab) {
      tabs.set(e.tab.id, { ...e.tab, closed: false });
    } else if (e.kind === "hn-note" && e.note) {
      notes.set(e.note.id, { ...e.note });
      const tab = tabs.get(e.note.tabId);
      if (tab && !tab.firstNote) tab.firstNote = e.note.t;
    } else if (e.kind === "hn-edit" && notes.has(e.noteId)) {
      Object.assign(notes.get(e.noteId), { text: e.text, edited: { t: e.t, by: e.by } });
    } else if (e.kind === "hn-delete" && notes.has(e.noteId)) {
      notes.get(e.noteId).deleted = { t: e.t, by: e.by };
    } else if (e.kind === "hn-close" && tabs.has(e.tabId)) {
      tabs.get(e.tabId).closed = true;
    }
  }
  const live = [...tabs.values()].filter(tab =>
    !tab.closed && (tab.firstNote || tab.created) + 24 * 60 * 60 * 1000 > t
  ).sort((a, b) => a.created - b.created);
  return { tabs: live, notes: [...notes.values()], t };
}

window.handoverApi = {
  showReplay(events, t) {
    handover.replay = handoverReplayAt(events, t);
    handover.editing = null;
    document.getElementById("handover-title").textContent = "Handover Notes (replay)";
    if (!handoverPanel.classList.contains("hidden")) renderHandover();
  },
  endReplay() {
    handover.replay = null;
    document.getElementById("handover-title").textContent = "Handover Notes";
    if (!handoverPanel.classList.contains("hidden")) refreshHandover();
  },
};

// Clear Post Update's dictation note when the box is sent or closed.
["admin-submit", "admin-close"].forEach(id =>
  document.getElementById(id).addEventListener("click", () => {
    document.getElementById("admin-dictate-status").textContent = "";
  })
);
