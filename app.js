import { CONFIG } from "./config.js";
import { sb, signInWithPassword, signUp, signOut, currentUser, signInWithPasskey, hasPasskey } from "./supabase-client.js";
import { el, longDate, toast, splitWords, REDUCED } from "./util.js";

import { renderToday } from "./view-today.js";
import { renderJournal } from "./view-journal.js";
import { renderHabits } from "./view-habits.js";
import { renderMood } from "./view-mood.js";
import { renderGoals } from "./view-goals.js";
import { renderMedia, renderGaming, renderEdits, renderFinance, renderHealth } from "./view-tables.js";

// ---------- Boot ----------
(async function boot() {
  await sleep(REDUCED ? 200 : 2800);
  const bootEl = document.getElementById("boot");
  bootEl.classList.add("is-leaving");
  await sleep(REDUCED ? 0 : 700);
  bootEl.style.display = "none";

  const user = await currentUser();
  if (user && user.email?.toLowerCase() === CONFIG.OWNER_EMAIL.toLowerCase()) {
    showApp(user);
  } else {
    showAuth();
  }
})();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- Auth ----------
function showAuth() {
  const auth = document.getElementById("auth");
  auth.classList.remove("hidden");

  const form = document.getElementById("auth-form");
  const emailIn = document.getElementById("auth-email");
  const passIn = document.getElementById("auth-password");
  const submitBtn = document.getElementById("auth-submit");
  const errorEl = document.getElementById("auth-error");
  const passkeyBtn = document.getElementById("passkey-btn");
  const tabs = document.querySelectorAll(".auth__tab");

  let mode = "signin";
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("is-active"));
    t.classList.add("is-active");
    mode = t.dataset.tab;
    submitBtn.querySelector(".btn__label").textContent = mode === "signin" ? "Enter Atlas" : "Create account";
  }));

  emailIn.value = CONFIG.OWNER_EMAIL;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    submitBtn.disabled = true;
    try {
      if (mode === "signin") {
        const { user } = await signInWithPassword(emailIn.value.trim(), passIn.value);
        await onSignedIn(user);
      } else {
        await signUp(emailIn.value.trim(), passIn.value);
        toast("Check your email to confirm, then sign in.");
      }
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  passkeyBtn.addEventListener("click", async () => {
    errorEl.textContent = "";
    try {
      await signInWithPasskey();
      const user = await currentUser();
      await onSignedIn(user);
    } catch (err) {
      errorEl.textContent = err.message || "Passkey sign-in failed.";
    }
  });
}

async function onSignedIn(user) {
  if (!user || user.email?.toLowerCase() !== CONFIG.OWNER_EMAIL.toLowerCase()) {
    toast("Unauthorized.");
    await signOut();
    return;
  }
  document.getElementById("auth").classList.add("hidden");
  showApp(user);

  if (!(await hasPasskey()) && window.PublicKeyCredential) {
    setTimeout(() => toast("Tip: enroll a passkey for one-tap sign-in next time."), 1500);
  }
}

// ---------- Routes ----------
const ROUTES = {
  today:   { title: "Today",   render: renderToday,   eyebrow: "00 — DASHBOARD",  showDate: false, showGreeting: true },
  journal: { title: "Journal", render: renderJournal, eyebrow: "01 — JOURNAL" },
  habits:  { title: "Habits",  render: renderHabits,  eyebrow: "02 — HABITS" },
  mood:    { title: "Mood",    render: renderMood,    eyebrow: "03 — MOOD" },
  goals:   { title: "Goals",   render: renderGoals,   eyebrow: "04 — GOALS" },
  media:   { title: "Media",   render: renderMedia,   eyebrow: "05 — MEDIA" },
  gaming:  { title: "Gaming",  render: renderGaming,  eyebrow: "06 — GAMING" },
  edits:   { title: "Edits",   render: renderEdits,   eyebrow: "07 — EDITS" },
  finance: { title: "Finance", render: renderFinance, eyebrow: "08 — FINANCE" },
  health:  { title: "Health",  render: renderHealth,  eyebrow: "09 — HEALTH" }
};

let currentUserRef = null;
let currentView = null;
let renderToken = 0;
let lenis = null;

function showApp(user) {
  currentUserRef = user;
  const app = document.getElementById("app");
  app.classList.remove("hidden");

  // Restore collapse preference
  if (localStorage.getItem("atlas-rail-collapsed") === "1") {
    app.classList.add("is-collapsed");
  }

  // Initialize Lenis smooth scroll
  if (window.Lenis && !REDUCED) {
    lenis = new window.Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false
    });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
  }

  // Rail nav clicks
  document.querySelectorAll(".rail__link[data-view]").forEach(link => {
    link.addEventListener("click", () => navigate(link.dataset.view));
  });

  // Rail collapse
  document.getElementById("rail-toggle").addEventListener("click", () => {
    app.classList.toggle("is-collapsed");
    localStorage.setItem("atlas-rail-collapsed", app.classList.contains("is-collapsed") ? "1" : "0");
    setTimeout(updateRailIndicator, 420);
  });

  document.getElementById("sign-out").addEventListener("click", async () => {
    await signOut();
    location.reload();
  });

  // External navigate event from cards
  window.addEventListener("atlas:navigate", (e) => {
    const detail = e.detail;
    if (typeof detail === "string") navigate(detail);
    else navigate(detail.view, { fromCard: detail.fromCard });
  });

  // Hash sync
  window.addEventListener("hashchange", () => {
    const v = (location.hash || "#today").slice(1);
    if (ROUTES[v] && v !== currentView) navigate(v);
  });

  // Initial nav
  const initial = (location.hash || "#today").slice(1);
  navigate(ROUTES[initial] ? initial : "today", { initial: true });
}

// ---------- Rail indicator ----------
function updateRailIndicator() {
  const nav = document.getElementById("rail-nav");
  const indicator = document.getElementById("rail-indicator");
  if (!nav || !indicator) return;
  const active = nav.querySelector(".rail__link.is-active");
  if (!active) return;
  const navRect = nav.getBoundingClientRect();
  const linkRect = active.getBoundingClientRect();
  const top = linkRect.top - navRect.top + nav.scrollTop + (linkRect.height - 28) / 2;
  indicator.style.top = top + "px";
  indicator.classList.add("is-ready");
}

// ---------- Navigation ----------
async function navigate(view, opts = {}) {
  if (!ROUTES[view]) return;
  if (view === currentView && !opts.initial) return;

  const previous = currentView;
  currentView = view;

  // Update root data attribute (drives accent CSS)
  document.getElementById("app").setAttribute("data-view", view);

  // Update hash silently
  if (location.hash !== "#" + view) {
    history.replaceState(null, "", "#" + view);
  }

  const myToken = ++renderToken;

  // Update rail
  document.querySelectorAll(".rail__link[data-view]").forEach(l => {
    l.classList.toggle("is-active", l.dataset.view === view);
  });
  updateRailIndicator();

  const route = ROUTES[view];
  const head = document.querySelector(".stage__head > div");
  const actions = document.getElementById("stage-actions");
  const body = document.getElementById("view");

  // Outgoing animation
  if (!opts.initial && window.gsap && !REDUCED) {
    await new Promise(resolve => {
      gsap.to(body, {
        opacity: 0,
        y: -8,
        scale: 0.99,
        filter: "blur(4px)",
        duration: 0.22,
        ease: "power2.in",
        onComplete: resolve
      });
    });
    if (myToken !== renderToken) return;
  }

  // Reset header
  head.innerHTML = "";
  if (!route.showGreeting) {
    head.appendChild(el("div", { class: "stage__eyebrow" }, route.eyebrow));
    const t = el("h1", { class: "stage__title" }, route.title);
    head.appendChild(t);
    if (window.gsap && !REDUCED) {
      const words = splitWords(t);
      gsap.from(words, { y: 30, opacity: 0, duration: 0.8, stagger: 0.05, ease: "power3.out" });
      gsap.from(head.querySelector(".stage__eyebrow"), { opacity: 0, y: 8, duration: 0.5, ease: "power3.out" });
    }
  }

  actions.innerHTML = "";

  // Reset body
  body.innerHTML = "";
  body.style.opacity = "0";
  body.style.transform = "";
  body.style.filter = "";

  if (myToken !== renderToken) return;

  try {
    await route.render(body, currentUserRef);
  } catch (err) {
    console.error(err);
    if (myToken !== renderToken) return;
    body.innerHTML = "";
    body.appendChild(el("div", { class: "empty" },
      el("div", { class: "empty__icon" }, "⚠"),
      el("h3", { class: "empty__title" }, "Something went wrong"),
      el("p", { class: "empty__sub" }, err.message || "Check the console.")
    ));
  }
  if (myToken !== renderToken) return;

  // Incoming
  if (window.gsap && !REDUCED) {
    gsap.to(body, {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.5,
      ease: "power3.out",
      clearProps: "transform,filter"
    });
  } else {
    body.style.opacity = "1";
  }

  // Scroll to top
  if (lenis) lenis.scrollTo(0, { duration: 0.6 });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

window.addEventListener("resize", () => updateRailIndicator());
