import { sb } from "./supabase-client.js";
import { el, isoDate, lastNDays, money, longDate, greeting, tickNumber, stagger, observeReveal, REDUCED } from "./util.js";

const ARROW_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H9M17 7v8"/></svg>`;
const ICON = {
  journal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  habits:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 12l4 4L20 6"/></svg>`,
  mood:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 17l5-6 4 4 4-7 5 9"/></svg>`,
  finance: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2v20M17 6H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7"/></svg>`,
  health:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/></svg>`,
  gaming:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="7" width="18" height="12" rx="3"/><path d="M8 13h.01M12 13h.01M16 13h.01"/></svg>`
};

function go(view, fromCard) {
  window.dispatchEvent(new CustomEvent("atlas:navigate", { detail: { view, fromCard } }));
}

export async function renderToday(root, user) {
  root.innerHTML = "";

  // Replace header with cinematic greeting
  const head = document.querySelector(".stage__head > div");
  head.innerHTML = "";
  head.appendChild(el("div", { class: "stage__date" }, longDate(new Date())));
  const name = (user.email || "").split("@")[0].split(".")[0];
  const cap = name ? name.charAt(0).toUpperCase() + name.slice(1) : "you";
  const g = el("h1", { class: "stage__greeting" });
  g.innerHTML = `<span class="word">${greeting()},</span> <span class="word accent">${cap}.</span>`;
  head.appendChild(g);

  document.getElementById("stage-actions").innerHTML = "";

  // Animate greeting words
  if (window.gsap) {
    gsap.from(g.querySelectorAll(".word"), {
      y: 40,
      opacity: 0,
      duration: 0.9,
      stagger: 0.08,
      ease: "power3.out"
    });
  }

  const grid = el("div", { class: "bento" });
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

  const cards = [
    journalCard(journalRes.data, "bento__journal"),
    habitsCard(habitsRes.data || [], habitLogsRes.data || [], "bento__habits"),
    moodCard(moodRes.data || [], "bento__mood"),
    financeCard(txRes.data || [], "bento__finance"),
    healthCard(healthRes.data, "bento__health"),
    gamingCard(gamingRes.data || [], "bento__gaming")
  ];
  cards.forEach(c => grid.appendChild(c));

  if (window.gsap && !REDUCED) {
    gsap.from(cards, {
      y: 24,
      opacity: 0,
      duration: 0.8,
      stagger: 0.06,
      ease: "power3.out",
      delay: 0.2,
      clearProps: "all"
    });
  }

  // After paint: trigger number tickers
  requestAnimationFrame(() => {
    grid.querySelectorAll("[data-tick]").forEach(node => {
      const target = Number(node.dataset.tick);
      const decimals = Number(node.dataset.decimals || 0);
      const prefix = node.dataset.prefix || "";
      const suffix = node.dataset.suffix || "";
      tickNumber(node, target, { duration: 850, decimals, prefix, suffix });
    });
  });
}

function makeCard(accentClass, viewTo, extraClass = "") {
  const card = el("article", {
    class: `card card--clickable ${accentClass} ${extraClass}`,
    onClick: () => go(viewTo, card)
  });
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

function journalCard(entry, slot) {
  const card = makeCard("card--violet", "journal", slot);
  card.appendChild(cardHead("Journal · today", ICON.journal));
  if (entry) {
    card.appendChild(el("h3", { class: "card__title", style: { fontSize: "26px", marginBottom: "12px" } }, entry.title || "Untitled entry"));
    const preview = (entry.content || "").slice(0, 220);
    card.appendChild(el("p", {
      class: "card__sub",
      style: { fontFamily: "var(--serif)", fontSize: "16px", lineHeight: "1.6", color: "var(--ink-2)", marginTop: "4px" }
    }, preview + ((entry.content || "").length > 220 ? "…" : "")));
    const chips = el("div", { style: { display: "flex", gap: "8px", marginTop: "auto", paddingTop: "20px", flexWrap: "wrap" } });
    if (entry.mood) chips.appendChild(el("span", { class: "chip" }, `mood ${entry.mood}`));
    if (entry.energy) chips.appendChild(el("span", { class: "chip" }, `energy ${entry.energy}`));
    chips.appendChild(el("span", { class: "chip", style: { color: "var(--a-violet)" } }, "Continue writing →"));
    card.appendChild(chips);
  } else {
    card.appendChild(el("h3", { class: "card__title", style: { fontSize: "30px" } }, "The page is waiting."));
    card.appendChild(el("p", { class: "card__sub", style: { marginTop: "10px", fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "15px" } }, "Start with today."));
    const cta = el("div", { style: { marginTop: "auto", paddingTop: "20px", display: "flex" } });
    cta.appendChild(el("span", { class: "chip", style: { color: "var(--a-violet)" } }, "Open editor →"));
    card.appendChild(cta);
  }
  return card;
}

function habitsCard(habits, logs, slot) {
  const card = makeCard("card--cyan", "habits", slot);
  card.appendChild(cardHead("Habits", ICON.habits));
  if (!habits.length) {
    card.appendChild(el("h3", { class: "card__title" }, "No habits."));
    card.appendChild(el("p", { class: "card__sub", style: { marginTop: "6px" } }, "Build the scaffolding."));
    return card;
  }
  const today = isoDate();
  const doneToday = logs.filter(l => l.log_date === today).length;
  const pct = habits.length ? doneToday / habits.length : 0;

  // Ring
  const ringWrap = el("div", { style: { display: "flex", justifyContent: "center", margin: "8px 0 14px" } });
  const ring = el("div", { class: "ring", style: { "--ring-color": "var(--a-jade)" } });
  const C = 2 * Math.PI * 50;
  const target = C * (1 - pct);
  ring.innerHTML = `
    <svg viewBox="0 0 132 132">
      <circle class="ring__bg" cx="66" cy="66" r="58"/>
      <circle class="ring__fg" cx="66" cy="66" r="58" style="--circ:${2*Math.PI*58}; --ring-target:${(2*Math.PI*58)*(1-pct)}"/>
    </svg>
    <div class="ring__center">
      <div class="ring__value" data-tick="${doneToday}">${doneToday}</div>
      <div class="ring__label">of ${habits.length}</div>
    </div>
  `;
  ringWrap.appendChild(ring);
  card.appendChild(ringWrap);

  card.appendChild(el("div", {
    style: { textAlign: "center", fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--ink-3)" }
  }, `${Math.round(pct * 100)}% complete today`));

  return card;
}

function moodCard(entries, slot) {
  const card = makeCard("card--cyan", "mood", slot);
  card.appendChild(cardHead("Mood · 30 days", ICON.mood));
  const vals = entries.filter(e => e.mood).map(e => e.mood);
  const avg = vals.length ? +(vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : 0;
  card.appendChild(el("div", {
    class: "card__big",
    style: { "--card-grad": "var(--grad-cosmic)" },
    "data-tick": String(avg),
    "data-decimals": "1"
  }, "0.0"));
  card.appendChild(el("div", { class: "card__sub" }, vals.length ? `avg across ${vals.length} entries` : "no data yet"));
  if (vals.length > 1) card.appendChild(sparkline(entries.map(e => e.mood), 60, "spark1", ["#6c8cff","#22d3ee"]));
  return card;
}

function financeCard(txs, slot) {
  const card = makeCard("card--jade", "finance", slot);
  card.appendChild(cardHead("Finance · 30 days", ICON.finance));
  const income = txs.filter(t => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const net = income - expense;
  const grad = net >= 0 ? "var(--grad-ocean)" : "var(--grad-ember)";
  const big = el("div", {
    class: "card__big",
    style: { "--card-grad": grad },
    "data-tick": String(Math.abs(net)),
    "data-prefix": net < 0 ? "−৳" : "৳"
  }, "৳0");
  card.appendChild(big);
  const row = el("div", { style: { display: "flex", gap: "14px", marginTop: "8px", fontSize: "12px", fontFamily: "var(--mono)", color: "var(--ink-3)" } });
  row.appendChild(el("span", { style: { color: "var(--a-jade)" } }, `↑ ${money(income)}`));
  row.appendChild(el("span", { style: { color: "var(--a-rose)" } }, `↓ ${money(expense)}`));
  card.appendChild(row);
  return card;
}

function healthCard(h, slot) {
  const card = makeCard("card--jade", "health", slot);
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

function gamingCard(sessions, slot) {
  const card = makeCard("card--amber", "gaming", slot);
  card.appendChild(cardHead("Gaming · this week", ICON.gaming));
  const mins = sessions.reduce((s, x) => s + (x.duration_minutes || 0), 0);
  const h = Math.floor(mins / 60), m = mins % 60;
  card.appendChild(el("div", { class: "card__big", style: { "--card-grad": "var(--grad-violet)" } }, mins ? `${h}h ${m}m` : "0h"));
  card.appendChild(el("div", { class: "card__sub" }, `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`));
  return card;
}

function stat(label, value) {
  const n = el("div", {});
  n.appendChild(el("div", { style: { fontFamily: "var(--mono)", fontSize: "10px", color: "var(--ink-3)", letterSpacing: "0.2em", textTransform: "uppercase" } }, label));
  n.appendChild(el("div", { style: { fontFamily: "var(--serif)", fontSize: "22px", marginTop: "4px" } }, value));
  return n;
}

function sparkline(data, height = 60, gradId = "spark", colors = ["#7c5cff","#ff5fa2"]) {
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
  svg.setAttribute("class", "spark");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.height = h + "px";
  svg.style.marginTop = "14px";
  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradId}" x1="0" x2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="${colors[1]}"/></linearGradient>
    </defs>
    <path d="${d}" class="line" stroke="url(#${gradId})"/>
  `;
  return svg;
}
