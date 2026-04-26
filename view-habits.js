import { sb, insertOwned } from "./supabase-client.js";
import { el, isoDate, lastNDays, prettyDate, toast, modal, REDUCED } from "./util.js";

const PALETTE = ["#7c5cff","#2ad9ff","#3ddc97","#ffb35a","#ff5fa2","#a78bfa"];
const ICONS = ["✦","◆","◉","❖","✧","△","◈","✿","☀","☾","⚘","✺"];

export async function renderHabits(root, user) {
  root.innerHTML = "";

  const actions = document.getElementById("stage-actions");
  actions.innerHTML = "";
  actions.appendChild(el("button", {
    class: "btn btn--sm btn--subtle",
    onClick: () => addHabitModal(() => renderHabits(root, user))
  }, "+ New habit"));

  const [habitsRes, logsRes] = await Promise.all([
    sb.from("habits").select("*").eq("archived", false).order("created_at"),
    sb.from("habit_logs").select("habit_id, log_date").gte("log_date", isoDate(new Date(Date.now() - 29 * 86400000)))
  ]);

  const habits = habitsRes.data || [];
  const logs = logsRes.data || [];

  if (!habits.length) {
    root.appendChild(emptyState("No habits yet", "Create one to start building momentum."));
    return;
  }

  const grid = el("div", { class: "habits-grid" });
  habits.forEach(h => grid.appendChild(habitCard(h, logs, () => renderHabits(root, user))));
  root.appendChild(grid);

  if (window.gsap && !REDUCED) {
    gsap.from(grid.children, { y: 18, opacity: 0, duration: 0.7, stagger: 0.05, ease: "power3.out" });
  }
}

function habitCard(habit, logs, refresh) {
  const card = el("article", { class: "habit", style: { "--habit-color": habit.color || "#8b5cff" } });
  const head = el("div", { class: "habit__head" });
  head.appendChild(el("div", { class: "habit__icon" }, habit.icon || "✦"));
  const streak = computeStreak(habit.id, logs);
  if (streak > 0) head.appendChild(el("div", { class: "habit__streak" }, `🔥 ${streak}D`));
  card.appendChild(head);

  card.appendChild(el("h3", { class: "habit__name" }, habit.name));

  const week = el("div", { class: "habit__week" });
  lastNDays(7).forEach(d => {
    const iso = isoDate(d);
    const done = logs.some(l => l.habit_id === habit.id && l.log_date === iso);
    const isToday = iso === isoDate();
    const cell = el("button", {
      class: "habit__day" + (done ? " is-done" : "") + (isToday ? " is-today" : ""),
      title: prettyDate(d),
      onClick: async (e) => {
        const btn = e.currentTarget;
        btn.classList.add("just-checked");
        if (done) {
          await sb.from("habit_logs").delete().eq("habit_id", habit.id).eq("log_date", iso);
        } else {
          await insertOwned("habit_logs", { habit_id: habit.id, log_date: iso });
        }
        setTimeout(refresh, 180);
      }
    }, d.toLocaleDateString([], { weekday: "narrow" }));
    week.appendChild(cell);
  });
  card.appendChild(week);

  const in30 = logs.filter(l => l.habit_id === habit.id).length;
  const pct = Math.round((in30 / 30) * 100);
  const foot = el("div", {
    style: { display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "var(--mono)", color: "var(--ink-3)", letterSpacing: "0.1em" }
  });
  foot.appendChild(el("span", {}, `${in30}/30`));
  foot.appendChild(el("span", {}, `${pct}%`));
  card.appendChild(foot);

  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    editHabitModal(habit, refresh);
  });

  return card;
}

function computeStreak(habitId, logs) {
  const myLogs = new Set(logs.filter(l => l.habit_id === habitId).map(l => l.log_date));
  let streak = 0;
  let d = new Date(); d.setHours(0,0,0,0);
  if (!myLogs.has(isoDate(d))) d.setDate(d.getDate() - 1);
  while (myLogs.has(isoDate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function addHabitModal(onSaved) {
  const body = el("div", { class: "modal__form" });
  const name = el("input", { type: "text", placeholder: "e.g. Read 30 minutes" });
  const nameField = el("label", { class: "field" });
  nameField.appendChild(el("span", {}, "Name"));
  nameField.appendChild(name);
  body.appendChild(nameField);

  const iconWrap = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } });
  let selectedIcon = "✦";
  ICONS.forEach(i => {
    const b = el("button", {
      type: "button", class: "chip",
      style: { fontSize: "16px", padding: "6px 10px", cursor: "pointer" },
      onClick: () => {
        selectedIcon = i;
        iconWrap.querySelectorAll("button").forEach(x => x.style.borderColor = "var(--line)");
        b.style.borderColor = "var(--a-violet)";
      }
    }, i);
    iconWrap.appendChild(b);
  });
  iconWrap.firstChild.style.borderColor = "var(--a-violet)";
  const iconField = el("label", { class: "field" });
  iconField.appendChild(el("span", {}, "Icon"));
  iconField.appendChild(iconWrap);
  body.appendChild(iconField);

  const colorWrap = el("div", { style: { display: "flex", gap: "8px" } });
  let selectedColor = PALETTE[0];
  PALETTE.forEach(c => {
    const b = el("button", {
      type: "button",
      style: { width: "26px", height: "26px", borderRadius: "7px", background: c, border: "2px solid transparent", cursor: "pointer" },
      onClick: () => {
        selectedColor = c;
        colorWrap.querySelectorAll("button").forEach(x => x.style.borderColor = "transparent");
        b.style.borderColor = "#fff";
      }
    });
    colorWrap.appendChild(b);
  });
  colorWrap.firstChild.style.borderColor = "#fff";
  const colorField = el("label", { class: "field" });
  colorField.appendChild(el("span", {}, "Color"));
  colorField.appendChild(colorWrap);
  body.appendChild(colorField);

  modal({
    title: "New habit",
    sub: "Something small, something daily.",
    body,
    actions: [
      { label: "Cancel", onClick: (c) => c() },
      { label: "Create", variant: "btn--primary", onClick: async (close) => {
        if (!name.value.trim()) return;
        await insertOwned("habits", { name: name.value.trim(), icon: selectedIcon, color: selectedColor });
        close(); toast("Habit added"); onSaved();
      }}
    ]
  });
}

function editHabitModal(habit, refresh) {
  const body = el("div", { class: "modal__form" });
  const name = el("input", { type: "text", value: habit.name });
  const nameField = el("label", { class: "field" });
  nameField.appendChild(el("span", {}, "Name"));
  nameField.appendChild(name);
  body.appendChild(nameField);

  modal({
    title: "Edit habit",
    body,
    actions: [
      { label: "Archive", variant: "btn--danger", onClick: async (close) => {
        await sb.from("habits").update({ archived: true }).eq("id", habit.id);
        close(); toast("Archived"); refresh();
      }},
      { label: "Cancel", onClick: (c) => c() },
      { label: "Save", variant: "btn--primary", onClick: async (close) => {
        await sb.from("habits").update({ name: name.value.trim() }).eq("id", habit.id);
        close(); toast("Saved"); refresh();
      }}
    ]
  });
}

function emptyState(title, sub) {
  const e = el("div", { class: "empty" });
  e.appendChild(el("div", { class: "empty__icon" }, "✦"));
  e.appendChild(el("h3", { class: "empty__title" }, title));
  e.appendChild(el("p", { class: "empty__sub" }, sub));
  return e;
}
