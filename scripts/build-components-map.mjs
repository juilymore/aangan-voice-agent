// Generates docs/components_map.svg: Case 3 components map in the class format
// (swimlanes by actor; columns Trigger → Input → Context → Processing → AI → Output).
// Usage: node scripts/build-components-map.mjs
import { writeFileSync } from "node:fs";

const COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const ACTORS = [
  ["Caller", "(User)", "#e9efff"],
  ["Voice Agent", "(Vaani)", "#f1e9ff"],
  ["System", "(App Backend, during the call)", "#fff6dd"],
  ["System", "(App Backend, after the call)", "#fdeee2"],
  ["AI Models", "(LLM)", "#e8f7ee"],
  ["Integrations", "(Resend, HubSpot, Calendar)", "#e4f3f8"],
  ["Studio Team", "(Nikhil, Ruhi, Jay)", "#fde9ef"],
];
const STYLE = {
  user: ["#e3e5ff", "#4a4fd4"],
  input: ["#dfeeff", "#2f78d1"],
  voice: ["#eee0ff", "#8a4fd4"],
  ctx: ["#dff6e5", "#2e9e55"],
  proc: ["#fff0cd", "#e8991c"],
  ai: ["#ffdcec", "#df3487"],
  out: ["#ffe3de", "#e5483a"],
};

const W = 1500, ACT_W = 156, COL_W = (W - ACT_W) / 6, TITLE_H = 58, HEAD_H = 40, ROW_H = 108;
const top = TITLE_H + HEAD_H;
const H = top + ACTORS.length * ROW_H + 20;
const colX = (c) => ACT_W + c * COL_W;
const BW = COL_W - 22;

// box(col,row,style,text,[height])
const boxes = {};
function box(id, col, row, style, text, h = 90) {
  const lines = wrap(text, 33);
  const bh = Math.max(h, lines.length * 14.5 + 20);
  const x = colX(col) + 11, y = top + row * ROW_H + (ROW_H - bh) / 2;
  boxes[id] = { x, y, w: BW, h: bh, style, lines, cx: x + BW / 2, cy: y + bh / 2 };
}
function wrap(text, max) {
  const out = [];
  for (const para of text.split("\n")) {
    let cur = "";
    for (const word of para.split(" ")) {
      if ((cur + " " + word).trim().length > max) { out.push(cur); cur = word; } else cur = (cur + " " + word).trim();
    }
    out.push(cur);
  }
  return out;
}

// ---- Caller ----
box("t0", 0, 0, "user", "Calls the studio number (any hour, day or night)");
box("i0", 1, 0, "input", "Tells the agent about the project: area, size, scope, timeline");
box("o0", 5, 0, "out", "Gets a consultation booked, or a polite no");
// ---- Voice agent ----
box("c1", 2, 1, "ctx", "Studio services, rules and the 9 standard questions (no prices)");
box("p1", 3, 1, "proc", "Asks questions one at a time and spots the call type: lead, update, complaint or other");
box("a1", 4, 1, "ai", "Voice AI holds the conversation and calls the live tools");
// ---- System (live) ----
box("i2", 1, 2, "input", "Details collected so far");
box("c2", 2, 2, "ctx", "Lead rubric: 5 criteria, service area, budget check, calendar");
box("p2", 3, 2, "proc", "Checks fit, finds open slots, books with no double booking");
box("o2", 5, 2, "out", "Fit answer and booked slot go back to the agent");
// ---- System (after) ----
box("i3", 1, 3, "input", "Call ends: transcript sent to the system");
box("c3", 2, 3, "ctx", "Rubric, office hours, designers, past corrections");
box("p3", 3, 3, "proc", "Hides personal numbers, scores the lead, flags price mentions, assigns a designer, writes the brief");
box("o3", 5, 3, "out", "Verdict, hot / warm / cold, brief and flags saved");
// ---- AI ----
box("a4", 4, 4, "ai", "Reads the transcript and pulls out facts with the exact quote. Does not decide");
// ---- Integrations ----
box("p5", 3, 5, "proc", "Sends designer email, creates HubSpot deal, adds calendar event, alerts on complaints");
// ---- Team ----
box("t6", 0, 6, "user", "Opens the email or the dashboard");
box("i6", 1, 6, "input", "Corrects a verdict or fact, edits the rubric");
box("o6", 5, 6, "out", "Dashboard with calls, briefs, metrics and revenue estimate");

// ---- arrows (dashed, orthogonal) ----
const arrows = [];
const pt = (id, side, off = 0) => {
  const b = boxes[id];
  return side === "r" ? [b.x + b.w, b.cy + off] : side === "l" ? [b.x, b.cy + off] : side === "t" ? [b.cx + off, b.y] : [b.cx + off, b.y + b.h];
};
const rowEdge = (r) => top + r * ROW_H; // top edge of row r
function arrow(points) { arrows.push(points); }
const link = (a, as, b, bs, via = [], offA = 0, offB = 0) => arrow([pt(a, as, offA), ...via, pt(b, bs, offB)]);

link("t0", "r", "i0", "l");
// ② → ③ : down, across above row 1 chain, down into p1 top
arrow([pt("i0", "b"), [boxes.i0.cx, rowEdge(1) + 3], [boxes.p1.cx - 30, rowEdge(1) + 3], pt("p1", "t", -30)]);
link("p1", "r", "a1", "l");
// ④ → ⑤ tool request (down then left then down)
arrow([pt("a1", "b", -62), [boxes.a1.cx - 62, rowEdge(2) + 3], [boxes.i2.cx, rowEdge(2) + 3], pt("i2", "t")]);
link("i2", "r", "c2", "l");
link("c2", "r", "p2", "l");
link("p2", "r", "o2", "l");
// result back to the agent
arrow([pt("o2", "t", -20), [boxes.o2.cx - 20, rowEdge(2) + 12], [boxes.a1.cx, rowEdge(2) + 12], pt("a1", "b", 0)]);
// agent → caller (⑦)
arrow([pt("a1", "r"), [boxes.o0.cx, boxes.a1.cy], pt("o0", "b")]);
// call ends → webhook (⑧)
arrow([pt("a1", "b", 62), [boxes.a1.cx + 62, rowEdge(3) + 3], [boxes.i3.cx, rowEdge(3) + 3], pt("i3", "t")]);
link("i3", "r", "c3", "l");
link("c3", "r", "p3", "l");
// pipeline → Gemini and back
arrow([pt("p3", "b", -30), [boxes.p3.cx - 30, boxes.a4.cy], pt("a4", "l")]);
arrow([pt("a4", "r"), [boxes.o3.cx, boxes.a4.cy], pt("o3", "b")]);
// pipeline → integrations
arrow([pt("p3", "b", 30), pt("p5", "t", 30)]);
// integrations → dashboard output
arrow([pt("p5", "r"), [boxes.o6.cx, boxes.p5.cy], pt("o6", "t")]);
link("t6", "r", "i6", "l");
// feedback loop: corrections improve the rubric
arrow([pt("i6", "t", 40), [boxes.i6.cx + 40, rowEdge(5) + 2], [boxes.c3.cx, rowEdge(5) + 2], pt("c3", "b")]);

// ---- render ----
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="#14284b"/></marker></defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${W / 2}" y="38" text-anchor="middle" font-size="28" font-weight="700" fill="#14284b">Case 3 · Aangan Phone Agent — Components Map</text>`;

// header row
svg += `<rect x="12" y="${TITLE_H}" width="${W - 24}" height="${HEAD_H}" rx="6" fill="#14284b"/>`;
svg += `<text x="${12 + (ACT_W - 12) / 2}" y="${TITLE_H + 26}" text-anchor="middle" font-size="16" font-weight="600" fill="#fff">Actor</text>`;
COLS.forEach((c, i) => (svg += `<text x="${colX(i) + COL_W / 2}" y="${TITLE_H + 26}" text-anchor="middle" font-size="16" font-weight="600" fill="#fff">${c}</text>`));

// rows
ACTORS.forEach(([name, sub, color], r) => {
  const y = top + r * ROW_H;
  svg += `<rect x="12" y="${y}" width="${W - 24}" height="${ROW_H}" fill="${color}"/>`;
  svg += `<rect x="12" y="${y}" width="${ACT_W - 12}" height="${ROW_H}" fill="#14284b" stroke="#fff" stroke-width="1"/>`;
  svg += `<text x="${12 + (ACT_W - 12) / 2}" y="${y + ROW_H / 2 - 4}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">${esc(name)}</text>`;
  const subLines = wrap(sub, 20);
  subLines.forEach((l, i) => (svg += `<text x="${12 + (ACT_W - 12) / 2}" y="${y + ROW_H / 2 + 14 + i * 14}" text-anchor="middle" font-size="12" fill="#c9d3e6">${esc(l)}</text>`));
});
for (let c = 1; c < 6; c++) svg += `<line x1="${colX(c)}" y1="${top}" x2="${colX(c)}" y2="${top + ACTORS.length * ROW_H}" stroke="#ffffff" stroke-width="1.5" opacity="0.8"/>`;

// arrows first (under boxes)
for (const pts of arrows) {
  svg += `<polyline points="${pts.map((p) => p.map((n) => Math.round(n * 10) / 10).join(",")).join(" ")}" fill="none" stroke="#14284b" stroke-width="1.6" stroke-dasharray="6 4" marker-end="url(#ah)"/>`;
}
for (const b of Object.values(boxes)) {
  const [fill, stroke] = STYLE[b.style];
  svg += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/>`;
  const startY = b.cy - ((b.lines.length - 1) * 14.5) / 2 + 4;
  b.lines.forEach((l, i) => (svg += `<text x="${b.cx}" y="${startY + i * 14.5}" text-anchor="middle" font-size="12.2" fill="#14284b">${esc(l)}</text>`));
}
svg += `</svg>\n`;
writeFileSync("docs/components_map.svg", svg);
console.log(`docs/components_map.svg (${W}x${H}), ${Object.keys(boxes).length} boxes, ${arrows.length} arrows`);
