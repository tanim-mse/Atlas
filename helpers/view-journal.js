import { sb } from "./supabase-client.js";
import { $, el, isoDate, longDate, prettyDate, relativeDate, debounce, toast, modal } from "./util.js";

let state = { entries: [], current: null, dirty: false };

export async function renderJournal(root, user) {
  root.innerHTML = "";
  const layout = el("div", { class: "journal" });
  root.appendChild(layout);

  const listCol = el("div", { class: "journal__list" });
  const editorCol = el("div", { id: "journal-editor" });
  layout.appendChild(listCol);
  layout.appendChild(editorCol);

  await loadEntries();
  renderList(listCol);
  await openToday(user.id, editorCol, listCol);
}

async function loadEntries() {
  const { data, error } = await sb.from("journal_entries")
    .select("id, entry_date, title, content, mood, energy, tags, created_at")
    .order("entry_date", { ascending: false });
  if (error) toast("Couldn't load entries");
  state.entries = data || [];
}

function renderList(col) {
  col.innerHTML = "";
  // "New today" button
  const newBtn = el("button", {
    class: "journal__item",
    style: { border: "1px dashed var(--line-2)", textAlign: "center" },
    onClick: () => openDate(isoDate(), document.getElementById("journal-editor"), col)
  });
  newBtn.appendChild(el("div", { class: "journal__item-title", style: { color: "var(--a-cyan)" } }, "+ New entry · today"));
  col.appendChild(newBtn);

  if (!state.entries.length) {
    col.appendChild(el("div", { class: "empty", style: { padding: "30px 10px" } },
      el("div", { class: "empty__sub" }, "No entries yet. Start with today.")
    ));
    return;
  }

  state.entries.forEach(e => {
    const item = el("button", {
      class: "journal__item" + (state.current?.id === e.id ? " is-active" : ""),
      onClick: () => openEntry(e, document.getElementById("journal-editor"), col)
    });
    item.appendChild(el("div", { class: "journal__item-date" }, relativeDate(e.entry_date)));
    item.appendChild(el("div", { class: "journal__item-title" }, e.title || "Untitled"));
    item.appendChild(el("div", { class: "journal__item-preview" }, (e.content || "").slice(0, 80)));
    col.appendChild(item);
  });
}

async function openToday(userId, editorCol, listCol) {
  const existing = state.entries.find(e => e.entry_date === isoDate());
  if (existing) openEntry(existing, editorCol, listCol);
  else openDate(isoDate(), editorCol, listCol);
}

async function openDate(date, editorCol, listCol) {
  const existing = state.entries.find(e => e.entry_date === date);
  if (existing) return openEntry(existing, editorCol, listCol);
  // create blank draft in-memory; it persists on first save
  const draft = {
    id: null, entry_date: date, title: "", content: "", mood: null, energy: null, tags: [], _draft: true
  };
  state.current = draft;
  renderEditor(editorCol, listCol);
  renderList(listCol);
}

function openEntry(entry, editorCol, listCol) {
  state.current = { ...entry, tags: entry.tags || [] };
  state.dirty = false;
  renderEditor(editorCol, listCol);
  renderList(listCol);
}

function renderEditor(root, listCol) {
  const e = state.current;
  root.innerHTML = "";
  const frame = el("div", { class: "editor" });
  frame.appendChild(el("div", { class: "editor__date" }, longDate(e.entry_date)));

  const titleInput = el("input", {
    class: "editor__title",
    placeholder: "A title, if it needs one",
    value: e.title || ""
  });
  titleInput.addEventListener("input", () => {
    e.title = titleInput.value; state.dirty = true; autosave(listCol);
  });
  frame.appendChild(titleInput);

  // Meta: mood/energy sliders + tags
  const meta = el("div", { class: "editor__meta" });

  const moodGroup = el("div", { class: "slider-group" });
  const moodLabel = el("label", {});
  moodLabel.appendChild(el("span", {}, "mood"));
  const moodRange = el("input", { type: "range", min: "1", max: "10", value: e.mood || 5 });
  const moodVal = el("span", { class: "val" }, String(e.mood || 5));
  moodRange.addEventListener("input", () => {
    e.mood = Number(moodRange.value); moodVal.textContent = moodRange.value;
    state.dirty = true; autosave(listCol);
  });
  moodLabel.appendChild(moodRange); moodLabel.appendChild(moodVal);
  moodGroup.appendChild(moodLabel);
  meta.appendChild(moodGroup);

  const enGroup = el("div", { class: "slider-group" });
  const enLabel = el("label", {});
  enLabel.appendChild(el("span", {}, "energy"));
  const enRange = el("input", { type: "range", min: "1", max: "10", value: e.energy || 5 });
  const enVal = el("span", { class: "val" }, String(e.energy || 5));
  enRange.addEventListener("input", () => {
    e.energy = Number(enRange.value); enVal.textContent = enRange.value;
    state.dirty = true; autosave(listCol);
  });
  enLabel.appendChild(enRange); enLabel.appendChild(enVal);
  enGroup.appendChild(enLabel);
  meta.appendChild(enGroup);

  frame.appendChild(meta);

  // Tags
  const tagsWrap = el("div", { class: "editor__tags" });
  const renderTags = () => {
    tagsWrap.innerHTML = "";
    (e.tags || []).forEach((t, i) => {
      const chip = el("span", { class: "chip" }, "#" + t);
      chip.style.cursor = "pointer";
      chip.title = "Click to remove";
      chip.addEventListener("click", () => {
        e.tags.splice(i, 1); state.dirty = true; renderTags(); autosave(listCol);
      });
      tagsWrap.appendChild(chip);
    });
    const tagIn = el("input", { class: "tag-input", placeholder: "+ tag" });
    tagIn.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && tagIn.value.trim()) {
        ev.preventDefault();
        e.tags = [...(e.tags || []), tagIn.value.trim().toLowerCase()];
        state.dirty = true; renderTags(); autosave(listCol);
      }
    });
    tagsWrap.appendChild(tagIn);
  };
  renderTags();
  frame.appendChild(tagsWrap);

  // Content
  const content = el("textarea", {
    class: "editor__content",
    placeholder: "What happened today? What did you notice?",
    rows: "14"
  });
  content.value = e.content || "";
  content.addEventListener("input", () => {
    e.content = content.value; state.dirty = true; autosave(listCol);
    autogrow(content);
  });
  frame.appendChild(content);
  setTimeout(() => autogrow(content), 0);

  // Footer
  const foot = el("div", { class: "editor__foot" });
  const statusEl = el("span", { id: "save-status" }, e._draft ? "draft" : "saved");
  foot.appendChild(statusEl);

  const actions = el("div", { style: { display: "flex", gap: "8px" } });
  if (!e._draft) {
    const delBtn = el("button", {
      class: "btn btn--sm btn--danger",
      onClick: () => confirmDelete(listCol)
    }, "Delete");
    actions.appendChild(delBtn);
  }
  foot.appendChild(actions);
  frame.appendChild(foot);

  root.appendChild(frame);
  requestAnimationFrame(() => content.focus({ preventScroll: true }));
}

function autogrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.max(400, ta.scrollHeight) + "px";
}

const autosave = debounce(async (listCol) => {
  const e = state.current;
  if (!state.dirty) return;
  const setStatus = (s) => { const n = document.getElementById("save-status"); if (n) n.textContent = s; };
  setStatus("saving…");
  const payload = {
    entry_date: e.entry_date,
    title: e.title || null,
    content: e.content || "",
    mood: e.mood || null,
    energy: e.energy || null,
    tags: e.tags || []
  };
  if (e.id) {
    const { error } = await sb.from("journal_entries").update(payload).eq("id", e.id);
    if (error) { setStatus("error"); return; }
  } else {
    const { data, error } = await sb.from("journal_entries").insert(payload).select().single();
    if (error) { setStatus("error"); return; }
    e.id = data.id; delete e._draft;
  }
  state.dirty = false;
  await loadEntries();
  renderList(listCol);
  setStatus("saved · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
}, 700);

function confirmDelete(listCol) {
  modal({
    title: "Delete this entry?",
    sub: "This can't be undone.",
    actions: [
      { label: "Cancel", onClick: (close) => close() },
      { label: "Delete", variant: "btn--danger", onClick: async (close) => {
        await sb.from("journal_entries").delete().eq("id", state.current.id);
        await loadEntries();
        renderList(listCol);
        const root = document.getElementById("journal-editor");
        if (state.entries.length) openEntry(state.entries[0], root, listCol);
        else openDate(isoDate(), root, listCol);
        close();
        toast("Entry deleted");
      }}
    ]
  });
}
