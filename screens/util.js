// ---------- DOM ----------
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") n.innerHTML = v;
    else if (v === false || v == null) continue;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}

// ---------- Dates ----------
const WEEKDAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function today() {
  const d = new Date(); d.setHours(0,0,0,0);
  return d;
}
export function isoDate(d = new Date()) {
  const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
  return z.toISOString().slice(0,10);
}
export function prettyDate(d) {
  const x = d instanceof Date ? d : new Date(d + "T00:00:00");
  return `${WEEKDAYS_SHORT[x.getDay()]}, ${MONTHS[x.getMonth()]} ${x.getDate()}`;
}
export function longDate(d) {
  const x = d instanceof Date ? d : new Date(d + "T00:00:00");
  return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
}
export function relativeDate(d) {
  const x = d instanceof Date ? d : new Date(d + "T00:00:00");
  const diff = Math.round((today() - x) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return prettyDate(x);
}
export function weekDays(offset = 0) {
  const t = today();
  const start = new Date(t);
  start.setDate(t.getDate() - t.getDay() + offset * 7);
  return Array.from({length: 7}, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return d;
  });
}
export function lastNDays(n) {
  const t = today();
  return Array.from({length: n}, (_, i) => {
    const d = new Date(t); d.setDate(t.getDate() - (n - 1 - i));
    return d;
  });
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, variant = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast is-visible " + variant;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast"; }, 2400);
}

// ---------- Modal ----------
export function modal({ title, sub, body, actions = [] }) {
  const host = document.getElementById("modal-host");
  const frame = document.getElementById("modal-frame");
  frame.innerHTML = "";

  const h = el("h2", { class: "modal__title" }, title);
  frame.appendChild(h);
  if (sub) frame.appendChild(el("p", { class: "modal__sub" }, sub));
  if (body) frame.appendChild(body);

  if (actions.length) {
    const row = el("div", { class: "modal__actions" });
    actions.forEach(a => {
      const b = el("button", { class: `btn btn--sm ${a.variant || "btn--subtle"}`, onClick: () => a.onClick?.(close) }, a.label);
      row.appendChild(b);
    });
    frame.appendChild(row);
  }

  host.classList.remove("hidden");
  host.setAttribute("aria-hidden", "false");

  function close() {
    host.classList.add("hidden");
    host.setAttribute("aria-hidden", "true");
    frame.innerHTML = "";
    host.removeEventListener("click", onBg);
  }
  function onBg(e) {
    if (e.target.dataset.close !== undefined) close();
  }
  host.addEventListener("click", onBg);
  return { close };
}

// ---------- Debounce ----------
export function debounce(fn, ms = 500) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------- Currency ----------
export function money(n) {
  const v = Number(n || 0);
  return (v < 0 ? "−" : "") + "৳" + Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
