// ------------------------------------------------------------
// IRCG CHECK CARD BOXES (V2.25)
// Where each fill-in box sits on the check cards PDF, what kind of
// input it takes, and how its value is shown. js/checkcards.js draws
// the boxes and the picker; js/handover.js stores the values (one
// record per casualty tab per box, see HANDOVER NOTES in
// worker-updated.js).
//
// Positions are fractions of the page (x, y from the top left, w, h),
// measured on CC-CGU&S-001 V0 (March 2026). A new version of the
// cards needs them checked again. page = PDF page number (1 = cover).
//
// Field ids: lower case letters, digits and dots only (the Worker
// checks this). Values are always stored as text.
// ------------------------------------------------------------

const CARD_GREEN = "#138a36";
const CARD_RED = "#d00000";

const AVPU = [
  { v: "A", c: CARD_GREEN }, { v: "V", c: CARD_RED }, { v: "P", c: CARD_RED }, { v: "U", c: CARD_RED }
];
const CRT = [
  { v: "1", c: CARD_GREEN, label: "1 sec" }, { v: "2", c: CARD_GREEN, label: "2 secs" }, { v: "3+", c: CARD_RED, label: "3+ secs" }
];
const FAST = [
  { v: "-ve", c: CARD_GREEN, label: "FAST −ve" }, { v: "+ve", c: CARD_RED, label: "FAST +ve" }, { v: "Not done" }
];
const TCNTC = [
  { v: "TC", c: CARD_RED, label: "Time Critical" }, { v: "NTC", c: CARD_GREEN, label: "Non Time Critical" }
];
const YESNO = [{ v: "Yes", c: CARD_GREEN }, { v: "No", c: CARD_RED }];

// Breathing: green for 12–24 a minute (the card's 12, 18 or 24).
const BR = {
  type: "number", unit: "/min", x6: true,
  quick: ["0", "6", "12", "18", "24", "30", "30+"],
  colour: v => (v === "30+" ? CARD_RED : (+v >= 12 && +v <= 24 ? CARD_GREEN : CARD_RED)),
};
// Pulse: green for 42–120 a minute.
const PR = {
  type: "number", unit: "/min", x6: true,
  colour: v => (+v >= 42 && +v <= 120 ? CARD_GREEN : CARD_RED),
};

const CARD_FIELDS = [];
const addField = f => { CARD_FIELDS.push(f); return f; };

// ---- Assessment 1 (page 2): the five boxes down the right ----
addField({ id: "a1.time", page: 2, x: .7903, y: .0452, w: .1510, h: .1012, label: "Assessment time", type: "time" });
addField({ id: "a1.avpu", page: 2, x: .7953, y: .1738, w: .1409, h: .0571, label: "AVPU (first)", type: "choice", options: AVPU });
addField({ id: "a1.cat", page: 2, x: .7886, y: .3298, w: .1527, h: .0643, label: "Tourniquet (CAT) time", type: "time", extra: ["Not applied"] });
addField({ id: "a1.ht", page: 2, x: .7903, y: .4893, w: .1510, h: .0643, label: "Airway (HT / JT / OP)", type: "multi",
  options: [{ v: "HT" }, { v: "JT" }, { v: "OP" }, { v: "None" }] });
addField({ id: "a1.br", page: 2, x: .7953, y: .5929, w: .1409, h: .0560, label: "Breathing rate (first)", ...BR });

// ---- Assessment 2 (page 3): three boxes, plus Time Critical / Non Time Critical ----
addField({ id: "a2.pr", page: 3, x: .7953, y: .0750, w: .1409, h: .0560, label: "Pulse rate (first)", ...PR });
addField({ id: "a2.crt", page: 3, x: .7953, y: .1560, w: .1409, h: .0560, label: "Cap refill (first)", type: "choice", options: CRT });
addField({ id: "a2.fast", page: 3, x: .7936, y: .2536, w: .1426, h: .0607, label: "FAST (first)", type: "choice", options: FAST });
// Both boxes are one field: the chosen one gets a ring and a tick.
addField({ id: "a2.tc", page: 3, x: .4530, y: .4845, w: .1275, h: .0536, label: "Time Critical?", type: "choice", options: TCNTC, mark: "TC" });
addField({ id: "a2.tc", page: 3, x: .4530, y: .5643, w: .1275, h: .0536, label: "Time Critical?", type: "choice", options: TCNTC, mark: "NTC", alias: true });

// ---- S.A.M.P.L.E. (page 4) ----
const SAMPLE_X = .051, SAMPLE_W = .896;
addField({ id: "s.signs", page: 4, x: SAMPLE_X, y: .077, w: .68, h: .108, label: "Signs and symptoms", type: "text" });
addField({ id: "s.pain", page: 4, x: .7383, y: .0548, w: .1913, h: .1167, label: "Pain score", type: "choice",
  options: Array.from({ length: 11 }, (_, i) => ({ v: String(i), c: i >= 7 ? CARD_RED : undefined })), suffix: "/10", small: true });
addField({ id: "s.allergies", page: 4, x: SAMPLE_X, y: .230, w: SAMPLE_W, h: .108, label: "Allergies", type: "text", quick: ["None known"] });
addField({ id: "s.meds", page: 4, x: SAMPLE_X, y: .383, w: SAMPLE_W, h: .108, label: "Medications", type: "text", quick: ["None"] });
addField({ id: "s.history", page: 4, x: SAMPLE_X, y: .536, w: SAMPLE_W, h: .108, label: "Past relevant medical history", type: "text", quick: ["None"] });
addField({ id: "s.intake", page: 4, x: SAMPLE_X, y: .689, w: SAMPLE_W, h: .108, label: "Last oral intake", type: "text", stamp: true });
addField({ id: "s.events", page: 4, x: SAMPLE_X, y: .842, w: SAMPLE_W, h: .075, label: "Events leading to incident", type: "text" });

// ---- Casualty Monitoring (page 6): 10 rows ----
const MON_ROWS = [.2167, .2714, .3250, .3786, .4333, .4869, .5417, .5952, .6488, .7036];
const MON_COLS = [
  { key: "time", x: .055, w: .196, label: "Time", type: "time" },
  { key: "air", x: .2584, w: .0721, label: "Airway", type: "choice", options: YESNO },
  { key: "resp", x: .341, w: .118, label: "Response (AVPU)", type: "choice", options: AVPU },
  { key: "br", x: .470, w: .123, label: "Breathing rate", ...BR },
  { key: "crt", x: .604, w: .123, label: "Cap refill", type: "choice", options: CRT },
  { key: "pr", x: .738, w: .124, label: "Pulse rate", ...PR },
  { key: "tc", x: .8725, w: .0721, label: "TC or NTC", type: "choice", options: TCNTC },
];
MON_ROWS.forEach((y, r) => MON_COLS.forEach(col => {
  const { key, x, w, label, ...rest } = col;
  addField({ id: `mon.${r}.${key}`, page: 6, x, y, w, h: .048, label: `Reading ${r + 1}: ${label}`, row: r, col: key, small: true, ...rest });
}));

// ---- Notes (page 35): one per ruled line ----
const NOTE_LINES = [.0881, .1345, .1857, .2369, .2929, .3488, .4048, .4607, .5167, .5726, .6357];
NOTE_LINES.forEach((line, i) => addField({
  id: `note.${i}`, page: 35, x: .066, y: line - .042, w: .87, h: .042, label: `Note ${i + 1}`, type: "text", line: true, stamp: true,
}));

// ---- Medicines Record (page 37): three blocks of four lines ----
const MED_BLOCKS = [[.1274, .1726, .219, .2643], [.4012, .4476, .4929, .5381], [.6762, .7214, .7667, .8131]];
MED_BLOCKS.forEach((lines, b) => {
  const parts = [
    { key: "name", label: "Medicine name", type: "text" },
    { key: "method", label: "Administration method", type: "text" },
    { key: "dose", label: "Dosage", type: "text" },
    { key: "time", label: "Time given", type: "time" },
  ];
  parts.forEach((p, i) => addField({
    id: `med.${b}.${p.key}`, page: 37, x: .41, y: lines[i] - .036, w: .41, h: .036,
    label: `Medicine ${b + 1}: ${p.label}`, type: p.type, line: true,
  }));
});

// ---- Handover (page 38): N A T M I S T ----
addField({ id: "h.name", page: 38, x: .112, y: .046, w: .53, h: .040, label: "Name", type: "text", line: true });
addField({ id: "h.age", page: 38, x: .728, y: .046, w: .217, h: .040, label: "Age", type: "text", line: true,
  quick: ["Child", "Teens", "20s", "30s", "40s", "50s", "60s", "70s", "80+"] });
addField({ id: "h.time", page: 38, x: .29, y: .092, w: .40, h: .034, label: "Time of incident", type: "time", line: true });
addField({ id: "h.mech", page: 38, x: .112, y: .158, w: .83, h: .077, label: "Mechanism of injury", type: "text" });
addField({ id: "h.inj", page: 38, x: .112, y: .262, w: .83, h: .165, label: "Injuries", type: "text" });
// Signs and symptoms: Initial / Latest fill themselves from the
// Assessment and the newest monitoring reading unless typed over.
const HANDOVER_S = [
  { key: "avpu", label: "Response level (AVPU)", y: .4619, init: "a1.avpu", latest: "resp", type: "choice", options: AVPU },
  { key: "br", label: "Breathing (per minute)", y: .5060, init: "a1.br", latest: "br", ...BR },
  { key: "pr", label: "Pulse (per minute)", y: .5500, init: "a2.pr", latest: "pr", ...PR },
  { key: "crt", label: "Cap refill (seconds)", y: .5929, init: "a2.crt", latest: "crt", type: "choice", options: CRT },
  { key: "fast", label: "FAST (+ve or −ve)", y: .6369, init: "a2.fast", latest: null, type: "choice", options: FAST },
];
HANDOVER_S.forEach(s => {
  const { key, label, y, init, latest, ...input } = s;
  addField({ id: `h.s.${key}.init`, page: 38, x: .4740, y, w: .2299, h: .0381, label: `Handover ${label}: initial`, auto: { from: init }, small: true, ...input });
  addField({ id: `h.s.${key}.latest`, page: 38, x: .7131, y, w: .2299, h: .0381, label: `Handover ${label}: latest`, auto: { mon: latest }, small: true, ...input });
});
addField({ id: "h.treat", page: 38, x: .112, y: .715, w: .83, h: .225, label: "Treatment given", type: "text", prefill: true });

// ------------------------------------------------------------
// Helpers shared by checkcards.js and handover.js
// ------------------------------------------------------------
const cardFieldById = id => CARD_FIELDS.find(f => f.id === id && !f.alias);

// The newest filled monitoring row's value for a column, or "".
function latestMonitoring(values, col) {
  for (let r = MON_ROWS.length - 1; r >= 0; r--) {
    const v = values[`mon.${r}.${col}`];
    if (v) return v;
  }
  return "";
}

// What a box shows: its own value, or (Handover S rows) the automatic one.
// Returns { value, auto } where auto = true for a filled-in-for-you value.
function cardShownValue(f, values) {
  const own = values[f.id];
  if (own) return { value: own, auto: false };
  if (f.auto) {
    const v = f.auto.from ? values[f.auto.from] : (f.auto.mon ? latestMonitoring(values, f.auto.mon) : "");
    if (v) return { value: v, auto: true };
  }
  return { value: "", auto: false };
}

function cardValueColour(f, value) {
  if (!value) return null;
  if (f.colour) return f.colour(value);
  const opt = (f.options || []).find(o => o.v === value);
  return opt && opt.c ? opt.c : null;
}

function cardDisplay(f, value) {
  if (!value) return "";
  if (f.suffix) return value + f.suffix;
  return value;
}

// Suggested "Treatment given" text, from what's been filled in.
function cardTreatmentSummary(values) {
  const parts = [];
  if (values["a1.cat"] && values["a1.cat"] !== "Not applied") parts.push(`Tourniquet (CAT) ${values["a1.cat"]}.`);
  if (values["a1.ht"] && values["a1.ht"] !== "None") parts.push(`Airway: ${values["a1.ht"].replace(/, /g, " + ")}.`);
  MED_BLOCKS.forEach((_, b) => {
    const name = values[`med.${b}.name`];
    if (!name) return;
    const bits = [name, values[`med.${b}.dose`], values[`med.${b}.method`], values[`med.${b}.time`] && "at " + values[`med.${b}.time`]];
    parts.push(bits.filter(Boolean).join(" ") + ".");
  });
  return parts.join(" ");
}

// One casualty's card entries as label / value lines, in card order,
// for Show crew and Copy. Monitoring readings come one line per row.
function cardSummaryLines(values) {
  const lines = [];
  const seen = new Set();
  for (const f of CARD_FIELDS) {
    if (f.alias || seen.has(f.id)) continue;
    seen.add(f.id);
    if (f.page === 6) {
      if (f.col !== "time") continue;
      const r = f.row;
      const cells = MON_COLS.filter(c => c.key !== "time" && values[`mon.${r}.${c.key}`])
        .map(c => `${c.key === "resp" ? "AVPU" : c.key === "air" ? "Airway" : c.key.toUpperCase()} ${values[`mon.${r}.${c.key}`]}`);
      const time = values[`mon.${r}.time`];
      if (time || cells.length) lines.push({ label: `Reading ${r + 1}${time ? " (" + time + ")" : ""}`, value: cells.join(", ") });
      continue;
    }
    const v = values[f.id];
    if (v) lines.push({ label: f.label, value: cardDisplay(f, v) });
  }
  return lines;
}
