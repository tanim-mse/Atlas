import { sb } from "./supabase-client.js";
import { el, isoDate, lastNDays, money } from "./util.js";

const ARROW_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>`;
const ICON = {
  journal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  habits:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 12l4 4L20 6"/></svg>`,
  mood:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 17l5-6 4 4 4-7 5 9"/></svg>`,
  finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2v20M17 6H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7"/></svg>`,
  health:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/></svg>`,
  gaming:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="7" width="18" height="12" rx="3"/><path d="M8 13h.01M12 13h.01M16 13h.01"/></svg>`
};

function go(view) {
  window.dispatchEvent(new CustomEvent("atlas:navigate", { detail: view }));
}

export async function renderToday(root, user) {
  root.innerHTML = "";
  const grid = el("div", { class: "grid grid--3" });
  root.appendChild(grid);

  const d = isoDate();
  const weekStart = isoDate(new Date(Date.now() - 6 * 86400000));
  const monthStart = isoDate(new Date(Date.now() - 29 * 86400000));

  const [journalRes, habitsRes, habitLogsRes, moodRes, txRes, healthRes, gamingRes] = await Promise.all([
    sb.from("journal_entries").select("id, title, content, mood, energy, entry_date").eq("entry_date", d).maybeSingle(),
    sb.from("habits").select("id, name, icon, color").eq("archived", false),
    sb.from("habit_logs").select("habit_id, log_date").gte("log_date", weekStart),
    sb.from("journal_entries").select("entry_date, mood, energy").gte("entry_date", monthStart).order("entry_date"),
    sb.from("transactions").select("kind, amount, tx_date").gte("tx_date", monthStart),
    sb.from("health_logs").select("*").eq("log_date", d).maybeSingle(),
    sb.from("gaming_sessions").select("duration_minutes").gte("session_date", weekStart)
  ]);

  grid.appendChild(journalCard(journalRes.data));
  grid.appendChild(habitsCard(habitsRes.data || [], habitLogsRes.data || []));
  grid.appendChild(moodCard(moodRes.data || []));
  grid.appendChild(financeCard(txRes.data || []));
  grid.appendChild(healthCard(healthRes.data));
  grid.appendChild(gamingCard(gamingRes.data || []));
}

function makeCard(accentClass, viewTo) {
  const card = el("article", { class: `card card--clickable ${accentClass}`, onClick: () => go(viewTo) });
  const arrow = el("div", { class: "card__arrow" });
  arrow.innerHTML = ARROW_SVG;
  card.appendChild(arrow);
  return card;
}

function cardHead(label, iconSvg) {
  const head = el("div", { class: "card__head" });
  head.appendChild(el("div", { class: "card__eyebrow" }, label));
  if (iconSvg) {
    const icon = el("div", { class: "card__icon" });
    icon.innerHTML = iconSvg;
    head.appendChild(icon);
  }
  return head;
}

function journalCard(entry) {
  const card = makeCard("card--violet", "journal");
  card.appendChild(cardHead("Journal · today", ICON.journal));
  if (entry) {
    card.appendChild(el("h3", { class: "card__title" }, entry.title || "Untitled entry"));
    const preview = (entry.content || "").slice(0, 130);
    card.appendChild(el("p", { class: "card__sub", style: { marginTop: "8px" } }, preview + ((entry.content || "").length > 130 ? "…" : "")));
    const chips = el("div", { style: { display: "flex", gap: "8px", marginTop: "14px" } });
    if (entry.mood) chips.appendChild(el("span", { class: "chip" }, `mood ${entry.mood}`));
    if (entry.energy) chips.appendChild(el("span", { class: "chip" }, `energy ${entry.energy}`));
    card.appendChild(chips);
  } else {
    card.appendChild(el("h3", { class: "card__title" }, "Nothing written yet."));
    card.appendChild(el("p", { class: "card__sub", style: { marginTop: "6px" } }, "The page is waiting."));
  }
  return card;
}

function habitsCard(habits, logs) {
  const card = makeCard("card--cyan", "habits");
  card.appendChild(cardHead("Habits · this week", ICON.habits));
  if (!habits.length) {
    card.appendChild(el("h3", { class: "card__title" }, "No habits yet."));
    card.appendChild(el("p", { class: "card__sub", style: { marginTop: "6px" } }, "Build the scaffolding of your days."));
    return card;
  }
  const today = isoDate();
  const doneToday = logs.filter(l => l.log_date === today).length;
  card.appendChild(el("div", { class: "card__big", style: { "--card-grad": "var(--grad-ocean)" } }, `${doneToday}/${habits.length}`));
  card.appendChild(el("div", { class: "card__sub" }, `${habits.length} habit${habits.length !== 1 ? "s" : ""} tracked`));

  const days = lastNDays(7);
  const row = el("div", { style: { display: "flex", gap: "4px", marginTop: "16px" } });
  days.forEach(d => {
    const iso = isoDate(d);
    const count = logs.filter(l => l.log_date === iso).length;
    const pct = habits.length ? count / habits.length : 0;
    const cell = el("div", {
      style: {
        flex: "1", height: "26px", borderRadius: "5px",
        background: pct > 0
          ? `linear-gradient(135deg, rgba(42,217,255,${0.25 + pct * 0.6}), rgba(61,220,151,${0.25 + pct * 0.6}))`
          : "rgba(255,255,255,0.04)",
        border: "1px solid var(--line)",
        boxShadow: pct > 0 ? `0 4px 12px rgba(42,217,255,${0.15 * pct})` : "none"
      }
    });
    row.appendChild(cell);
  });
  card.appendChild(row);
  return card;
}

function moodCard(entries) {
  const card = makeCard("card--lilac", "mood");
  card.appendChild(cardHead("Mood · 30 days", ICON.mood));
  const vals = entries.filter(e => e.mood).map(e => e.mood);
  const avg = vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : "—";
  card.appendChild(el("div", { class: "card__big", style: { "--card-grad": "var(--grad-cosmic)" } }, avg));
  card.appendChild(el("div", { class: "card__sub" }, vals.length ? `avg across ${vals.length} entries` : "no data yet"));

  if (vals.length > 1) {
    card.appendChild(sparkline(entries.map(e => e.mood), 60));
  }
  return card;
}

function financeCard(txs) {
  const card = makeCard("card--jade", "finance");
  card.appendChild(cardHead("Finance · 30 days", ICON.finance));
  const income = txs.filter(t => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = income - expense;
  const grad = net >= 0 ? "var(--grad-ocean)" : "var(--grad-ember)";
  card.appendChild(el("div", { class: "card__big", style: { "--card-grad": grad } }, money(net)));
  const row = el("div", { style: { display: "flex", gap: "12px", marginTop: "8px", fontSize: "12px", fontFamily: "var(--mono)", color: "var(--ink-3)" } });
  row.appendChild(el("span", { style: { color: "var(--a-jade)" } }, `↑ ${money(income)}`));
  row.appendChild(el("span", { style: { color: "var(--a-rose)" } }, `↓ ${money(expense)}`));
  card.appendChild(row);
  return card;
}

function healthCard(h) {
  const card = makeCard("card--rose", "health");
  card.appendChild(cardHead("Health · today", ICON.health));
  if (!h) {
    card.appendChild(el("h3", { class: "card__title" }, "Untracked."));
    card.appendChild(el("p", { class: "card__sub", style: { marginTop: "6px" } }, "Log sleep, water, movement."));
    return card;
  }
  const row = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "10px" } });
  row.appendChild(stat("sleep", h.sleep_hours ? `${h.sleep_hours}h` : "—"));
  row.appendChild(stat("water", h.water_ml ? `${h.water_ml}ml` : "—"));
  row.appendChild(stat("move", h.workout_minutes ? `${h.workout_minutes}m` : "—"));
  card.appendChild(row);
  return card;
}

function gamingCard(sessions) {
  const card = makeCard("card--amber", "gaming");
  card.appendChild(cardHead("Gaming · this week", ICON.gaming));
  const mins = sessions.reduce((s, x) => s + (x.duration_minutes || 0), 0);
  const h = Math.floor(mins / 60), m = mins % 60;
  card.appendChild(el("div", { class: "card__big", style: { "--card-grad": "var(--grad-ember)" } }, mins ? `${h}h ${m}m` : "0h"));
  card.appendChild(el("div", { class: "card__sub" }, `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`));
  return card;
}

function stat(label, value) {
  const n = el("div", {});
  n.appendChild(el("div", { style: { fontFamily: "var(--mono)", fontSize: "10px", color: "var(--ink-3)", letterSpacing: "0.2em", textTransform: "uppercase" } }, label));
  n.appendChild(el("div", { style: { fontFamily: "var(--serif)", fontSize: "22px", marginTop: "4px" } }, value));
  return n;
}

function sparkline(data, height = 60) {
  const vals = data.map(v => v == null ? null : Number(v));
  const real = vals.filter(v => v != null);
  if (real.length < 2) return el("div");
  const min = Math.min(...real), max = Math.max(...real);
  const w = 260, h = height, pad = 6;
  const span = max - min || 1;
  const points = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    const y = v == null ? null : h - pad - ((v - min) / span) * (h - pad * 2);
    return { x, y };
  }).filter(p => p.y != null);
  const d = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", h);
  svg.style.marginTop = "14px";
  svg.innerHTML = `
    <defs>
      <linearGradient id="spark1" x1="0" x2="1"><stop offset="0%" stop-color="#8b5cff"/><stop offset="100%" stop-color="#ff4d8f"/></linearGradient>
    </defs>
    <path d="${d}" fill="none" stroke="url(#spark1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
  return svg;
}
