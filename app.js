// SkillBound site: champion select, news, and patch notes from the public releases repo.
"use strict";

const REPO = "Ahmed-Achtatar/skillbound-releases";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=50`;
const LEDGER_FIRST = 6;

const $ = (id) => document.getElementById(id);

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) { /* storage blocked: the default champion is fine */ }
  return null;
}

async function getJson(url, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of [].concat(children)) node.append(child);
  return node;
}

function formatDate(iso) {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function formatSize(bytes) {
  return bytes >= 1e6 ? Math.round(bytes / 1048576) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

/* ---------- Champion select ---------- */

let heroes = [];
let currentId = "";

function applyHero(hero, animate) {
  if (hero.id === currentId) return;
  currentId = hero.id;
  const root = document.documentElement.style;
  const figure = document.querySelector(".champion");
  const art = $("hero-art");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const swap = () => {
    root.setProperty("--sky", hero.sky);
    root.setProperty("--ground", hero.ground);
    root.setProperty("--scene-ground", hero.scene_ground);
    root.setProperty("--accent", hero.accent);
    root.setProperty("--scene", `url("assets/scenes/${hero.id}.webp")`);
    document.querySelector('meta[name="theme-color"]').content = hero.scene_ground;
    art.src = `assets/heroes/${hero.id}.webp`;
    art.alt = hero.name;
    $("hero-name").textContent = hero.name;
    $("lore-name").textContent = hero.name;
    $("lore-text").replaceChildren(...hero.story.map((p) => el("p", { textContent: p })));
    figure.classList.remove("swapping");
  };

  for (const chip of document.querySelectorAll(".chip")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.id === hero.id));
  }

  if (!animate || reduce) return swap();
  figure.classList.add("swapping");
  const scene = new Image();
  scene.src = `assets/scenes/${hero.id}.webp`;
  const ready = Promise.all([scene.decode().catch(() => {}), new Promise((r) => setTimeout(r, 180))]);
  ready.then(swap);
}

async function initRoster() {
  try {
    heroes = await getJson("data/heroes.json");
  } catch (e) {
    $("roster").closest(".roster-wrap").hidden = true;
    return;
  }
  const roster = $("roster");
  for (const hero of heroes) {
    const chip = el("button", { type: "button", className: "plate chip", title: hero.name }, [
      el("img", { src: `assets/heroes/${hero.id}.webp`, alt: "", width: 72, height: 72, loading: "lazy" }),
    ]);
    chip.dataset.id = hero.id;
    chip.setAttribute("aria-label", hero.name);
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      applyHero(hero, true);
      store("champion", hero.id);
    });
    // Warm the scene before it is needed.
    const warm = () => { new Image().src = `assets/scenes/${hero.id}.webp`; };
    chip.addEventListener("pointerenter", warm, { once: true });
    chip.addEventListener("focus", warm, { once: true });
    roster.append(chip);
  }
  const saved = heroes.find((h) => h.id === store("champion")) || heroes[0];
  applyHero(saved, false);
}

/* ---------- News ---------- */

async function initNews() {
  const list = $("news-list");
  try {
    const items = await getJson("data/news.json");
    list.replaceChildren(...items.map((item) => el("article", { className: "plate news-item" }, [
      el("time", { dateTime: item.date, textContent: formatDate(item.date) }),
      el("h3", { textContent: item.title }),
      el("p", { textContent: item.body }),
    ])));
  } catch (e) {
    list.replaceChildren(el("p", { className: "muted", textContent: "News could not be loaded. Try again in a moment." }));
  }
}

/* ---------- Patch notes ---------- */

async function loadReleases() {
  try {
    return { releases: await getJson(RELEASES_API), live: true };
  } catch (e) {
    // GitHub unreachable or rate-limited: use the snapshot shipped with the site.
    return { releases: await getJson("data/releases.json"), live: false };
  }
}

function releaseKind(release) {
  const names = release.assets.map((a) => a.name);
  if (names.includes("SkillBound.apk")) return { label: "Full update", asset: release.assets.find((a) => a.name === "SkillBound.apk") };
  if (names.includes("patch.pck")) return { label: "Patch", asset: release.assets.find((a) => a.name === "patch.pck") };
  return { label: "Update", asset: null };
}

async function initPatchNotes() {
  const ledger = $("ledger");
  let data;
  try {
    data = await loadReleases();
  } catch (e) {
    ledger.replaceChildren(el("li", { className: "muted", textContent: "Patch notes could not be loaded. Try again in a moment." }));
    return;
  }
  const all = data.releases.filter((r) => !r.draft && /^v\d/.test(r.tag_name));
  all.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  const install = data.releases.find((r) => r.tag_name === "install");
  const apk = install && install.assets.find((a) => a.name === "SkillBound.apk");
  if (all[0]) for (const node of document.querySelectorAll("[data-version]")) node.textContent = all[0].tag_name;
  if (apk) for (const node of document.querySelectorAll("[data-size]")) node.textContent = formatSize(apk.size);

  ledger.replaceChildren(...all.map((release, i) => {
    const kind = releaseKind(release);
    const lines = (release.body || "Game update").split(/\r?\n/).map((s) => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    const meta = formatDate(release.published_at) + (kind.asset ? " · " + formatSize(kind.asset.size) : "");
    const item = el("li", { className: "entry" + (i === 0 ? " latest" : "") }, [
      el("div", { className: "plate tag" }, [
        el("span", { className: "ver", textContent: release.tag_name.replace(/^v/, "") }),
        el("span", { className: "kind", textContent: i === 0 ? "Latest · " + kind.label : kind.label }),
      ]),
      el("div", { className: "plate entry-body" }, [
        el("time", { dateTime: release.published_at, textContent: meta }),
        el("ul", {}, lines.map((line) => el("li", { textContent: line }))),
      ]),
    ]);
    item.hidden = i >= LEDGER_FIRST;
    return item;
  }));

  const more = $("ledger-more");
  if (all.length > LEDGER_FIRST) {
    more.hidden = false;
    more.addEventListener("click", () => {
      for (const item of ledger.children) item.hidden = false;
      more.hidden = true;
      ledger.children[LEDGER_FIRST].querySelector(".tag").setAttribute("tabindex", "-1");
      ledger.children[LEDGER_FIRST].querySelector(".tag").focus();
    });
  }
  if (!data.live) $("patch-source").textContent = "(Showing saved notes; the live list could not be reached.)";
}

initRoster();
initNews();
initPatchNotes();
