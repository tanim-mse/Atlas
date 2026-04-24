import { sb, insertOwned } from "./supabase-client.js";
import { $, el, toast, modal, longDate } from "./util.js";

export async function renderGoals(root, user) {
  root.innerHTML = "";

  const actions = document.getElementById("stage-actions");
  actions.innerHTML = "";
  actions.appendChild(el("button", {
    class: "btn btn--sm btn--subtle",
    onClick: () => goalModal(null, () => renderGoals(root, user))
  }, "+ New goal"));

  const { data: goals } = await sb.from("goals").select("*").order("created_at", { ascending: false });

  if (!goals?.length) {
    root.appendChild(emptyState("No goals yet", "Define what you're moving toward."));
    return;
  }

  const active = goals.filter(g => g.status === "active");
  const other = goals.filter(g => g.status !== "active");

  if (active.length) {
    root.appendChild(el("div", { class: "card__eyebrow", style: { marginBottom: "10px" } }, "Active"));
    active.forEach(g => root.appendChild(goalCard(g, () => renderGoals(root, user))));
  }
  if (other.length) {
    root.appendChild(el("div", { class: "card__eyebrow", style: { margin: "24px 0 10px" } }, "Archive"));
    other.forEach(g => root.appendChild(goalCard(g, () => renderGoals(root, user))));
  }
}

function goalCard(g, refresh) {
  const card = el("article", { class: "goal" });
  const head = el("div", { class: "goal__head" });
  const left = el("div", {});
  left.appendChild(el("h3", { class: "goal__title" }, g.title));
  if (g.description) left.appendChild(el("p", { class: "goal__desc" }, g.description));
  head.appendChild(left);

  const right = el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } });
  right.appendChild(el("span", { class: `status-pill ${g.status}` }, g.status));
  const edit = el("button", {
    class: "btn btn--sm btn--subtle",
    onClick: () => goalModal(g, refresh)
  }, "Edit");
  right.appendChild(edit);
  head.appendChild(right);

  card.appendChild(head);

  // progress bar
  const bar = el("div", { class: "goal__bar" });
  bar.appendChild(el("div", { class: "goal__bar-fill", style: { width: g.progress + "%" } }));
  card.appendChild(bar);

  const meta = el("div", { class: "goal__meta" });
  meta.appendChild(el("span", {}, `${g.progress}%`));
  if (g.target_date) meta.appendChild(el("span", {}, `by ${longDate(g.target_date)}`));
  card.appendChild(meta);

  return card;
}

function goalModal(existing, onSaved) {
  const body = el("div", { class: "modal__form" });

  const titleF = el("label", { class: "field" });
  titleF.appendChild(el("span", {}, "Title"));
  const titleIn = el("input", { type: "text", value: existing?.title || "" });
  titleF.appendChild(titleIn);
  body.appendChild(titleF);

  const descF = el("label", { class: "field" });
  descF.appendChild(el("span", {}, "Description"));
  const descIn = el("textarea", { rows: "3" });
  descIn.value = existing?.description || "";
  descF.appendChild(descIn);
  body.appendChild(descF);

  const dateF = el("label", { class: "field" });
  dateF.appendChild(el("span", {}, "Target date"));
  const dateIn = el("input", { type: "date", value: existing?.target_date || "" });
  dateF.appendChild(dateIn);
  body.appendChild(dateF);

  const progF = el("label", { class: "field" });
  progF.appendChild(el("span", {}, `Progress: ${existing?.progress || 0}%`));
  const progIn = el("input", { type: "range", min: "0", max: "100", value: existing?.progress || 0 });
  progIn.addEventListener("input", () => progF.firstChild.textContent = `Progress: ${progIn.value}%`);
  progF.appendChild(progIn);
  body.appendChild(progF);

  if (existing) {
    const statusF = el("label", { class: "field" });
    statusF.appendChild(el("span", {}, "Status"));
    const statusIn = el("select", {});
    ["active","done","paused","abandoned"].forEach(s => {
      statusIn.appendChild(el("option", { value: s, selected: existing.status === s }, s));
    });
    statusF.appendChild(statusIn);
    body.appendChild(statusF);
    body._status = statusIn;
  }

  const actions = [
    { label: "Cancel", onClick: (c) => c() }
  ];
  if (existing) actions.push({ label: "Delete", variant: "btn--danger", onClick: async (c) => {
    await sb.from("goals").delete().eq("id", existing.id);
    c(); toast("Deleted"); onSaved();
  }});
  actions.push({ label: existing ? "Save" : "Create", variant: "btn--primary", onClick: async (c) => {
    if (!titleIn.value.trim()) return;
    const payload = {
      title: titleIn.value.trim(),
      description: descIn.value.trim() || null,
      target_date: dateIn.value || null,
      progress: Number(progIn.value)
    };
    if (existing) payload.status = body._status.value;
    if (existing) await sb.from("goals").update(payload).eq("id", existing.id);
    else await insertOwned("goals", payload);
    c(); toast("Saved"); onSaved();
  }});

  modal({
    title: existing ? "Edit goal" : "New goal",
    body,
    actions
  });
}

function emptyState(title, sub) {
  const e = el("div", { class: "empty" });
  e.appendChild(el("div", { class: "empty__icon" }, "◎"));
  e.appendChild(el("h3", { class: "empty__title" }, title));
  e.appendChild(el("p", { class: "empty__sub" }, sub));
  return e;
}
