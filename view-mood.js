import { sb } from "./supabase-client.js";
import { el, isoDate, lastNDays, tickNumber, REDUCED } from "./util.js";

export async function renderMood(root, user) {
  root.innerHTML = "";

  const actions = document.getElementById("stage-actions");
  actions.innerHTML = "";
  const rangePicker = el("select", {
    class: "chip",
    style: { padding: "6px 12px", cursor: "pointer" }
  });
  [[7,"7 days"],[30,"30 days"],[90,"90 days"],[365,"1 year"]].forEach(([v,l]) => {
    rangePicker.appendChild(el("option", { value: v }, l));
  });
  rangePicker.value = "30";
  rangePicker.addEventListener("change", () => draw(Number(rangePicker.value)));
  actions.appendChild(rangePicker);

  // Stat cards above chart
  const statsRow = el("div", { class: "grid grid--3", id: "mood-stats", style: { marginBottom: "20px" } });
  root.appendChild(statsRow);

  const card = el("article", { class: "card chart-card card--violet" });
  const head = el("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "20px" } });
  head.appendChild(el("div", {},
    el("div", { class: "card__eyebrow" }, "Mood & Energy"),
    el("h3", { class: "card__title" }, "Over time")
  ));
  card.appendChild(head);
  const chartWrap = el("div", { id: "mood-chart" });
  card.appendChild(chartWrap);
  root.appendChild(card);

  // Insight
  const insight = el("div", { id: "mood-insight", class: "card card--cyan", style: { marginTop: "16px", padding: "20px 24px" } });
  root.appendChild(insight);

  await draw(30);

  if (window.gsap && !REDUCED) {
    gsap.from([statsRow, card, insight], { y: 18, opacity: 0, duration: 0.7, stagger: 0.08, ease: "power3.out" });
  }
}

async function draw(days) {
  const from = isoDate(new Date(Date.now() - (days - 1) * 86400000));
  const { data } = await sb.from("journal_entries")
    .select("entry_date, mood, energy")
    .gte("entry_date", from)
    .order("entry_date");

  const byDate = new Map((data || []).map(d => [d.entry_date, d]));
  const allDays = lastNDays(days).map(d => {
    const iso = isoDate(d);
    const e = byDate.get(iso);
    return { date: d, iso, mood: e?.mood ?? null, energy: e?.energy ?? null };
  });

  const moods = allDays.filter(d => d.mood != null).map(d => d.mood);
  const energies = allDays.filter(d => d.energy != null).map(d => d.energy);
  const avgMood = moods.length ? +(moods.reduce((a,b) => a+b, 0) / moods.length).toFixed(1) : 0;
  const avgEnergy = energies.length ? +(energies.reduce((a,b) => a+b, 0) / energies.length).toFixed(1) : 0;

  const stats = document.getElementById("mood-stats");
  stats.innerHTML = "";
  stats.appendChild(statBigCard("Avg mood", avgMood, "var(--grad-cosmic)", "card--violet", { decimals: 1 }));
  stats.appendChild(statBigCard("Avg energy", avgEnergy, "var(--grad-ocean)", "card--cyan", { decimals: 1 }));
  stats.appendChild(statBigCard("Days logged", moods.length, "var(--grad-aurora)", "card--jade", { decimals: 0, suffix: `/${days}` }));

  // Tickers
  requestAnimationFrame(() => {
    stats.querySelectorAll("[data-tick]").forEach(node => {
      const target = Number(node.dataset.tick);
      const decimals = Number(node.dataset.decimals || 0);
      const suffix = node.dataset.suffix || "";
      tickNumber(node, target, { duration: 900, decimals, suffix });
    });
  });

  const wrap = document.getElementById("mood-chart");
  wrap.innerHTML = "";
  wrap.appendChild(chart(allDays, days));

  // Insight
  const insight = document.getElementById("mood-insight");
  insight.innerHTML = "";
  insight.appendChild(el("div", { class: "card__eyebrow" }, "Pattern"));
  let txt = "Not enough data yet — keep logging.";
  if (moods.length >= 7) {
    const range = Math.max(...moods) - Math.min(...moods);
    if (range <= 2) txt = "Your mood has been remarkably stable in this window.";
    else if (avgMood >= 7) txt = "You've been trending well — average mood above 7.";
    else if (avgMood <= 4) txt = "It's been a heavy stretch. The average sits below 5.";
    else txt = `You averaged ${avgMood} for mood and ${avgEnergy} for energy across ${moods.length} entries.`;
  }
  insight.appendChild(el("p", { style: { fontFamily: "var(--serif)", fontSize: "18px", margin: "8px 0 0", color: "var(--ink-1)", lineHeight: "1.5" } }, txt));
}

function statBigCard(label, value, gradient, accentClass, opts = {}) {
  const c = el("article", { class: `card ${accentClass}` });
  c.appendChild(el("div", { class: "card__eyebrow" }, label));
  const big = el("div", {
    class: "card__big",
    style: { "--card-grad": gradient },
    "data-tick": String(value),
    "data-decimals": String(opts.decimals || 0),
    "data-suffix": opts.suffix || ""
  }, "0");
  c.appendChild(big);
  return c;
}

function chart(days, total) {
  const W = 900, H = 320, P = 40;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("preserveAspectRatio", "none");

  const xScale = i => P + (i / (days.length - 1)) * (W - P * 2);
  const yScale = v => H - P - ((v - 1) / 9) * (H - P * 2);

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

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <linearGradient id="moodGrad" x1="0" x2="1"><stop offset="0%" stop-color="#6c8cff"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient>
    <linearGradient id="energyGrad" x1="0" x2="1"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient>
  `;
  svg.appendChild(defs);

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
    p.setAttribute("d", moodPath); p.setAttribute("class", "line"); p.setAttribute("stroke", "url(#moodGrad)");
    svg.appendChild(p);
  }
  if (energyPath) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", energyPath); p.setAttribute("class", "line"); p.setAttribute("stroke", "url(#energyGrad)");
    p.style.animationDelay = "0.4s";
    svg.appendChild(p);
  }

  // Stagger dots in
  let dotIdx = 0;
  days.forEach((d, i) => {
    if (d.mood != null) { svg.appendChild(dot(xScale(i), yScale(d.mood), "#6c8cff", dotIdx++ * 22)); }
    if (d.energy != null) { svg.appendChild(dot(xScale(i), yScale(d.energy), "#34d399", dotIdx++ * 22)); }
  });

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

  const leg = document.createElementNS("http://www.w3.org/2000/svg", "g");
  leg.innerHTML = `
    <circle cx="${W - 180}" cy="${P - 18}" r="4" fill="#6c8cff"/>
    <text x="${W - 170}" y="${P - 14}" fill="#a8adc2">mood</text>
    <circle cx="${W - 110}" cy="${P - 18}" r="4" fill="#34d399"/>
    <text x="${W - 100}" y="${P - 14}" fill="#a8adc2">energy</text>
  `;
  svg.appendChild(leg);

  return svg;
}

function dot(x, y, color, delay) {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 3);
  c.setAttribute("fill", color);
  c.setAttribute("class", "dot");
  c.style.animationDelay = (1200 + delay) + "ms";
  return c;
}
