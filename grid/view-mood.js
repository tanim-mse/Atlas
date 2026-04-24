import { sb } from "./supabase-client.js";
import { $, el, isoDate, prettyDate, lastNDays } from "./util.js";

export async function renderMood(root, user) {
  root.innerHTML = "";

  const actions = document.getElementById("stage-actions");
  actions.innerHTML = "";
  const rangePicker = el("select", {
    class: "chip",
    style: { padding: "6px 12px", cursor: "pointer" }
  });
  [[7,"7 days"],[30,"30 days"],[90,"90 days"],[365,"1 year"]].forEach(([v,l]) => {
    const o = el("option", { value: v }, l); rangePicker.appendChild(o);
  });
  rangePicker.value = "30";
  rangePicker.addEventListener("change", () => draw(Number(rangePicker.value)));
  actions.appendChild(rangePicker);

  const card = el("article", { class: "card chart-card" });
  const head = el("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "20px" } });
  head.appendChild(el("div", {},
    el("div", { class: "card__eyebrow" }, "Mood & Energy"),
    el("h3", { class: "card__title" }, "Over time")
  ));
  const stats = el("div", { style: { display: "flex", gap: "20px" } });
  stats.id = "mood-stats";
  head.appendChild(stats);
  card.appendChild(head);

  const chartWrap = el("div", { id: "mood-chart" });
  card.appendChild(chartWrap);

  root.appendChild(card);

  await draw(30);
}

async function draw(days) {
  const from = isoDate(new Date(Date.now() - (days - 1) * 86400000));
  const { data, error } = await sb.from("journal_entries")
    .select("entry_date, mood, energy")
    .gte("entry_date", from)
    .order("entry_date");
  if (error) return;

  const byDate = new Map((data || []).map(d => [d.entry_date, d]));
  const allDays = lastNDays(days).map(d => {
    const iso = isoDate(d);
    const e = byDate.get(iso);
    return { date: d, iso, mood: e?.mood ?? null, energy: e?.energy ?? null };
  });

  const moods = allDays.filter(d => d.mood != null).map(d => d.mood);
  const energies = allDays.filter(d => d.energy != null).map(d => d.energy);
  const avgMood = moods.length ? (moods.reduce((a,b) => a+b, 0) / moods.length).toFixed(1) : "—";
  const avgEnergy = energies.length ? (energies.reduce((a,b) => a+b, 0) / energies.length).toFixed(1) : "—";

  const stats = document.getElementById("mood-stats");
  stats.innerHTML = "";
  stats.appendChild(statBlock("avg mood", avgMood, "#7c5cff"));
  stats.appendChild(statBlock("avg energy", avgEnergy, "#2ad9ff"));
  stats.appendChild(statBlock("logged", `${moods.length}/${days}`, "#3ddc97"));

  const wrap = document.getElementById("mood-chart");
  wrap.innerHTML = "";
  wrap.appendChild(chart(allDays, days));
}

function statBlock(label, value, color) {
  const n = el("div", { style: { textAlign: "right" } });
  n.appendChild(el("div", { style: { fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-3)" } }, label));
  n.appendChild(el("div", { style: { fontFamily: "var(--serif)", fontSize: "26px", color } }, value));
  return n;
}

function chart(days, total) {
  const W = 900, H = 320, P = 40;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("preserveAspectRatio", "none");

  const xScale = i => P + (i / (days.length - 1)) * (W - P * 2);
  const yScale = v => H - P - ((v - 1) / 9) * (H - P * 2);

  // Grid
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  [1,3,5,7,10].forEach(v => {
    const y = yScale(v);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", P); line.setAttribute("x2", W - P);
    line.setAttribute("y1", y); line.setAttribute("y2", y);
    line.setAttribute("class", "grid-line");
    g.appendChild(line);

    const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lbl.setAttribute("x", P - 6); lbl.setAttribute("y", y + 3);
    lbl.setAttribute("text-anchor", "end");
    lbl.textContent = v;
    g.appendChild(lbl);
  });
  svg.appendChild(g);

  // Gradients
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <linearGradient id="moodGrad" x1="0" x2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#ff5fa2"/></linearGradient>
    <linearGradient id="energyGrad" x1="0" x2="1"><stop offset="0%" stop-color="#2ad9ff"/><stop offset="100%" stop-color="#3ddc97"/></linearGradient>
    <linearGradient id="moodArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#7c5cff" stop-opacity="0.3"/><stop offset="100%" stop-color="#7c5cff" stop-opacity="0"/></linearGradient>
    <linearGradient id="energyArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#2ad9ff" stop-opacity="0.3"/><stop offset="100%" stop-color="#2ad9ff" stop-opacity="0"/></linearGradient>
  `;
  svg.appendChild(defs);

  // Build paths (gaps on null)
  const build = (key) => {
    const segments = [];
    let cur = [];
    days.forEach((d, i) => {
      if (d[key] == null) { if (cur.length) { segments.push(cur); cur = []; } return; }
      cur.push(`${xScale(i).toFixed(1)} ${yScale(d[key]).toFixed(1)}`);
    });
    if (cur.length) segments.push(cur);
    return segments.map(s => "M" + s.join(" L")).join(" ");
  };

  const moodPath = build("mood");
  const energyPath = build("energy");

  if (moodPath) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", moodPath); p.setAttribute("class", "line");
    p.setAttribute("stroke", "url(#moodGrad)");
    svg.appendChild(p);
  }
  if (energyPath) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", energyPath); p.setAttribute("class", "line");
    p.setAttribute("stroke", "url(#energyGrad)");
    svg.appendChild(p);
  }

  // Dots
  days.forEach((d, i) => {
    if (d.mood != null) svg.appendChild(dot(xScale(i), yScale(d.mood), "#7c5cff"));
    if (d.energy != null) svg.appendChild(dot(xScale(i), yScale(d.energy), "#2ad9ff"));
  });

  // X axis labels (sparse)
  const labelCount = Math.min(6, days.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.round(i * (days.length - 1) / (labelCount - 1));
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", xScale(idx));
    t.setAttribute("y", H - P + 16);
    t.setAttribute("text-anchor", "middle");
    const d = days[idx].date;
    t.textContent = d.toLocaleDateString([], { month: "short", day: "numeric" });
    svg.appendChild(t);
  }

  // Legend
  const leg = document.createElementNS("http://www.w3.org/2000/svg", "g");
  leg.innerHTML = `
    <circle cx="${W - 180}" cy="${P - 18}" r="4" fill="#7c5cff"/>
    <text x="${W - 170}" y="${P - 14}" fill="#a8adc2">mood</text>
    <circle cx="${W - 110}" cy="${P - 18}" r="4" fill="#2ad9ff"/>
    <text x="${W - 100}" y="${P - 14}" fill="#a8adc2">energy</text>
  `;
  svg.appendChild(leg);

  return svg;
}

function dot(x, y, color) {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 3);
  c.setAttribute("fill", color);
  c.setAttribute("class", "dot");
  return c;
}
