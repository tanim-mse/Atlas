import { sb } from "./supabase-client.js";
import { $, el, isoDate, longDate, lastNDays, money, prettyDate } from "./util.js";

export async function renderToday(root, user) {
  root.innerHTML = "";
  const grid = el("div", { class: "grid grid--3" });
  root.appendChild(grid);

  // Parallel fetches
  const d = isoDate();
  const weekStart = isoDate(new Date(Date.now() - 6 * 86400000));

  const [journalRes, habitsRes, habitLogsRes, moodRes, txRes, healthRes, gamingRes] = await Promise.all([
    sb.from("journal_entries").select("id, title, content, mood, energy, entry_date").eq("entry_date", d).maybeSingle(),
    sb.from("habits").select("id, name, icon, color").eq("archived", false),
    sb.from("habit_logs").select("habit_id, log_date").gte("log_date", weekStart),
    sb.from("journal_entries").select("entry_date, mood, energy").gte("entry_date", isoDate(new Date(Date.now() - 29 * 86400000))).order("entry_date"),
    sb.from("transactions").select("kind, amount, tx_date").gte("tx_date", isoDate(new Date(Date.now() - 29 * 86400000))),
    sb.from("health_logs").select("*").eq("log_date", d).maybeSingle(),
    sb.from("gaming_sessions").select("duration_minutes").gte("session_date", weekStart)
  ]);

  // --- Today's journal glimpse ---
  grid.appendChild(journalCard(journalRes.data));

  // --- Habits progress ---
  grid.appendChild(habitsCard(habitsRes.data || [], habitLogsRes.data || []));

  // --- Mood trend ---
  grid.appendChild(moodCard(moodRes.data || []));

  // --- Finance snapshot ---
  grid.appendChild(financeCard(txRes.data || []));

  // --- Health today ---
  grid.appendChild(healthCard(healthRes.data));

  // --- Gaming this week ---
  grid.appendChild(gamingCard(gamingRes.data || []));
}

function journalCard(entry) {
  const card = el("article", { class: "card" });
  card.appendChild(el("div", { class: "card__eyebrow" }, "Journal · today"));
  if (entry) {
    card.appendChild(el("h3", { class: "card__title" }, entry.title || "Untitled entry"));
    const preview = (entry.content || "").slice(0, 140);
    card.appendChild(el("p", { class: "card__sub", style: { marginTop: "8px" } }, preview + (entry.content.length > 140 ? "…" : "")));
    const chips = el("div", { style: { display: "flex", gap: "8px", marginTop: "14px" } });
    if (entry.mood) chips.appendChild(el("span", { class: "chip" }, `mood ${entry.mood}`));
    if (entry.energy) chips.appendChild(el("span", { class: "chip" }, `energy ${entry.energy}`));
    card.appendChild(chips);
  } else {
    card.appendChild(el("h3", { class: "card__title" }, "Nothing yet today."));
    card.appendChild(el("p", { class: "card__sub" }, "The page is waiting."));
    card.appendChild(el("button", {
      class: "btn btn--primary btn--sm",
      style: { marginTop: "14px" },
      onClick: () => window.dispatchEvent(new CustomEvent("atlas:navigate", { detail: "journal" }))
    }, el("span", { class: "btn__label" }, "Start writing")));
  }
  return card;
}

function habitsCard(habits, logs) {
  const card = el("article", { class: "card" });
  card.appendChild(el("div", { class: "card__eyebrow" }, "Habits · this week"));
  if (!habits.length) {
    card.appendChild(el("h3", { class: "card__title" }, "No habits yet."));
    card.appendChild(el("p", { class: "card__sub" }, "Build the scaffolding of your days."));
    return card;
  }
  const today = isoDate();
  const doneToday = logs.filter(l => l.log_date === today).length;
  card.appendChild(el("div", { class: "card__big" }, `${doneToday}/${habits.length}`));
  card.appendChild(el("div", { class: "card__sub" }, `${habits.length} habit${habits.length !== 1 ? "s" : ""} tracked`));

  const days = lastNDays(7);
  const row = el("div", { style: { display: "flex", gap: "4px", marginTop: "16px" } });
  days.forEach(d => {
    const iso = isoDate(d);
    const count = logs.filter(l => l.log_date === iso).length;
    const pct = habits.length ? count / habits.length : 0;
    const cell = el("div", {
      style: {
        flex: "1", height: "28px", borderRadius: "5px",
        background: pct > 0
          ? `linear-gradient(135deg, rgba(124,92,255,${0.25 + pct * 0.6}), rgba(42,217,255,${0.25 + pct * 0.6}))`
          : "rgba(255,255,255,0.04)",
        border: "1px solid var(--line)"
      }
    });
    row.appendChild(cell);
  });
  card.appendChild(row);
  return card;
}

function moodCard(entries) {
  const card = el("article", { class: "card" });
  card.appendChild(el("div", { class: "card__eyebrow" }, "Mood · 30 days"));
  const vals = entries.filter(e => e.mood).map(e => e.mood);
  const avg = vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : "—";
  card.appendChild(el("div", { class: "card__big" }, avg));
  card.appendChild(el("div", { class: "card__sub" }, vals.length ? `avg across ${vals.length} entries` : "no data yet"));

  if (vals.length > 1) {
    card.appendChild(sparkline(entries.map(e => e.mood), { stroke: "url(#g1)", height: 60 }));
  }
  return card;
}

function financeCard(txs) {
  const card = el("article", { class: "card" });
  card.appendChild(el("div", { class: "card__eyebrow" }, "Finance · 30 days"));
  const income = txs.filter(t => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = income - expense;
  card.appendChild(el("div", { class: "card__big", style: { color: net >= 0 ? undefined : "transparent", background: net < 0 ? "linear-gradient(120deg, var(--a-rose), var(--a-amber))" : undefined, "-webkit-background-clip": "text" } }, money(net)));
  const row = el("div", { style: { display: "flex", gap: "12px", marginTop: "8px", fontSize: "12px", fontFamily: "var(--mono)", color: "var(--ink-3)" } });
  row.appendChild(el("span", {}, `in ${money(income)}`));
  row.appendChild(el("span", {}, `out ${money(expense)}`));
  card.appendChild(row);
  return card;
}

function healthCard(h) {
  const card = el("article", { class: "card" });
  card.appendChild(el("div", { class: "card__eyebrow" }, "Health · today"));
  if (!h) {
    card.appendChild(el("h3", { class: "card__title" }, "Untracked."));
    card.appendChild(el("p", { class: "card__sub" }, "Log sleep, water, movement."));
    return card;
  }
  const row = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "6px" } });
  row.appendChild(stat("sleep", h.sleep_hours ? `${h.sleep_hours}h` : "—"));
  row.appendChild(stat("water", h.water_ml ? `${h.water_ml}ml` : "—"));
  row.appendChild(stat("move", h.workout_minutes ? `${h.workout_minutes}m` : "—"));
  card.appendChild(row);
  return card;
}

function gamingCard(sessions) {
  const card = el("article", { class: "card" });
  card.appendChild(el("div", { class: "card__eyebrow" }, "Gaming · this week"));
  const mins = sessions.reduce((s, x) => s + (x.duration_minutes || 0), 0);
  const h = Math.floor(mins / 60), m = mins % 60;
  card.appendChild(el("div", { class: "card__big" }, mins ? `${h}h ${m}m` : "0h"));
  card.appendChild(el("div", { class: "card__sub" }, `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`));
  return card;
}

function stat(label, value) {
  const n = el("div", {});
  n.appendChild(el("div", { style: { fontFamily: "var(--mono)", fontSize: "10px", color: "var(--ink-3)", letterSpacing: "0.2em", textTransform: "uppercase" } }, label));
  n.appendChild(el("div", { style: { fontFamily: "var(--serif)", fontSize: "22px", marginTop: "4px" } }, value));
  return n;
}

function sparkline(data, { stroke = "var(--a-violet)", height = 60 } = {}) {
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
      <linearGradient id="g1" x1="0" x2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#2ad9ff"/></linearGradient>
    </defs>
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
  return svg;
}
