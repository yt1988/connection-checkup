// Network X-Ray (Connection Checkup) page. Press Start: the eight 1ms.dog tools run in frames, in three phases
// (src/tools.mjs), each posting its progress and result back (1ms-shell docs/checkup.md). The first screen shows the
// run as it goes: a progress ring, the phase, each tool's state, the key numbers and findings as the tools report.
// At the end: the overall grade, the five sections, the cross-tool findings (src/report.mjs), and a link and card to
// share (src/share.mjs). The frames sit in a collapsed "test log" that the visitor may open; collapsed frames keep a
// visible sliver so the browser keeps rendering them (a hidden cross-origin frame gets its timers throttled, which
// would skew the measurements). Strings: window.L1MS. ?mock=1 feeds the page the sample results in test/fixtures.
import { TOOLS, PHASES, SECTIONS, PHASE_TIMEOUT, DEFAULT_ORIGINS } from "./tools.mjs";
import { overall, crossFindings, keyStats, sectionFindings, sectionStats, topFindings, gradeTier, gradeLevel, gradeKey } from "./report.mjs";
import { encodeSummary, decodeSummary, encodeFull, decodeFull, sharePath, summaryOf } from "./share.mjs";

(function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const D = JSON.parse($("#data").textContent);
  const L = window.L1MS || {};
  const t = (k, v) => { let s = L[k] ?? k; if (v) for (const x in v) s = s.split("{" + x + "}").join(v[x]); return s; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const K = { theme: "checkup:theme", lang: "checkup:lang", auto: "checkup:auto" };
  const Q = new URLSearchParams(location.search);
  const MOCK = ["1", "block", "silent"].includes(Q.get("mock")), MOCK_MODE = Q.get("mock");
  const DEV = /^(localhost|127\.|\[)/.test(location.hostname);

  /* ---------- theme and language (synced across the 1ms.dog tools) ---------- */
  const thBtn = $("#theme"), TH = ["system", "light", "dark"];
  const applyTheme = th => {
    if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th); else document.documentElement.removeAttribute("data-theme");
    thBtn.dataset.th = th; thBtn.title = t("th_" + th); thBtn.setAttribute("aria-label", t("th_" + th));
  };
  thBtn.onclick = () => { const n = TH[(TH.indexOf(thBtn.dataset.th) + 1) % 3]; store.set(K.theme, n); applyTheme(n); };
  applyTheme(TH.includes(store.get(K.theme)) ? store.get(K.theme) : "system");
  $("#lang").onchange = e => { const l = e.target.value; store.set(K.lang, l); location.href = D.paths[l] + location.search; };

  /* ---------- dialogs ---------- */
  function openDlg(id) { $("#" + id).hidden = false; document.documentElement.style.overflow = "hidden"; $("#" + id + " [data-close]").focus(); }
  function closeDlg() { $$(".scrim").forEach(s => { s.hidden = true; }); document.documentElement.style.overflow = ""; }
  $$("[data-close]").forEach(b => { b.onclick = closeDlg; });
  $$(".scrim").forEach(s => s.addEventListener("click", e => { if (e.target === s) closeDlg(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDlg(); });
  let helpIdx = 0;
  const helpN = $$("#helpNav [data-hq]").length;
  $("#helpSel").innerHTML = $$("#helpNav [data-hq]").map((b, i) => `<option value="${i}">${i + 1} / ${helpN} · ${esc(b.textContent)}</option>`).join("");
  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(helpN - 1, i));
    $$("#helpNav [data-hq]").forEach(b => b.setAttribute("aria-selected", +b.dataset.hq === helpIdx));
    $$("#helpC [data-hqb]").forEach(a => { a.hidden = +a.dataset.hqb !== helpIdx; });
    $("#helpSel").value = helpIdx;
    $$("[data-hstep]").forEach(b => { b.disabled = helpIdx + +b.dataset.hstep < 0 || helpIdx + +b.dataset.hstep >= helpN; });
    $("#helpC").scrollTop = 0;
  }
  $("#helpBtn").onclick = () => { showHelp(helpIdx); openDlg("help"); };
  $$("#helpNav [data-hq]").forEach(b => { b.onclick = () => showHelp(+b.dataset.hq); });
  $("#helpSel").onchange = e => showHelp(+e.target.value);
  $$("[data-hstep]").forEach(b => { b.onclick = () => showHelp(helpIdx + +b.dataset.hstep); });

  /* ---------- where the tools live ---------- */
  // Each tool's origin comes from the <meta name="<id>"> the page announces (the shell injects one per tool). Without
  // the shell (local development, or the mock) the known addresses stand in; a self-hosted copy without them has no
  // tools to frame, and says so.
  const tool = id => { const m = document.querySelector(`meta[name="${id}"]`); return m ? m.content.replace(/\/+$/, "") : DEV || MOCK ? DEFAULT_ORIGINS[id] || "" : ""; };
  const toolHome = id => { const o = tool(id); return o ? o + D.paths[D.lang] : ""; };
  // the frame's address: the visitor's language folder (never the root, whose language redirect would change the
  // referrer the tool checks), plus the embed flag
  const embedURL = id => toolHome(id) + "?embed=checkup";
  const XL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 10v3.5H2.5V4H6"/></svg>';
  const xlink = (href, html) => `<a class="xl" href="${esc(href)}" target="_blank" rel="noopener">${html}${XL}</a>`;
  const country = cc => { if (!cc) return ""; try { return new Intl.DisplayNames([D.lang], { type: "region" }).of(cc); } catch (e) { return cc; } };

  /* ---------- state ---------- */
  const card = id => $(`.tool[data-tool="${id}"]`), chip = id => $(`#chips li[data-tool="${id}"]`);
  const S = { status: {}, results: {}, errors: {}, frames: {}, heights: {}, pct: {} };   // status: wait | run | done | timeout | error | na | stopped
  let RUN = null, LAST = null, OV = null, TIMER = null, SHARED = false, PHASE = 0, RECV = null;
  // Blocked: an ad blocker (uBlock, AdGuard…) stops the tools' probes, and they fail or say nothing. The run ends as
  // soon as that is clear, instead of waiting out every phase: nothing heard SILENCE ms into the first phase, or more
  // than half of a phase's tools failing (docs/checkup.md).
  const SILENCE = 30000;
  const TITLE = document.title;
  const mbps = v => v >= 10 ? String(Math.round(v)) : v.toFixed(1);

  function setStatus(id, st) {
    S.status[id] = st;
    const c = card(id); c.dataset.st = st; c.querySelector("[data-st-txt]").textContent = t("st_" + st);
    const ch = chip(id); ch.dataset.st = st; ch.querySelector("em").textContent = st === "run" ? (S.pct[id] != null ? S.pct[id] + "%" : "…") : st === "done" ? "✓" : st === "wait" ? "" : t("st_" + st);
    $("#toolsSum").textContent = t("tools_sum", { done: TOOLS.filter(x => S.results[x]).length, all: TOOLS.length });
  }
  const prog = n => { $("#progBar").style.transform = `scaleX(${Math.min(1, Math.max(0, n)).toFixed(3)})`; };
  const settle = { pending: new Set(), resolve: null };
  function done(id) { settle.pending.delete(id); if (!settle.pending.size && settle.resolve) settle.resolve(); }

  // a result as the tool posted it, trimmed to what the report shows; texts are plain strings, never markup
  const str = (v, n = 300) => (typeof v === "string" ? v.slice(0, n) : typeof v === "number" ? String(v) : "");
  function sanitize(d) {
    const g = ["A+", "A", "B", "C", "D", "F"].includes(d.grade) ? d.grade : null;
    const score = typeof d.score === "number" && d.score >= 0 && d.score <= 100 ? Math.round(d.score) : null;
    const stats = Array.isArray(d.stats) ? d.stats.filter(s => s && typeof s === "object").slice(0, 4).map(s => ({ label: str(s.label, 60), value: str(s.value, 60) })) : [];
    const findings = Array.isArray(d.findings) ? d.findings.filter(f => f && ["bad", "warn", "ok"].includes(f.level) && typeof f.text === "string").slice(0, 4).map(f => ({ level: f.level, text: f.text.slice(0, 300) })) : [];
    const facts = d.facts && typeof d.facts === "object" && !Array.isArray(d.facts) ? JSON.parse(JSON.stringify(d.facts).slice(0, 4000)) : {};
    const path = typeof d.path === "string" && /^\/[^\s]*$/.test(d.path) ? d.path.slice(0, 2000) : "";
    return { path, grade: g, score, headline: str(d.headline, 300), stats, findings, facts };
  }
  function handle(id, d) {
    if (!RUN || S.status[id] !== "run") return;
    const c = card(id);
    if (d.type === "progress" || d.type === "result") RUN.heard = true;
    if (d.type === "progress") {
      const total = typeof d.total === "number" && d.total > 0 ? d.total : 100;
      if (typeof d.done === "number") { S.pct[id] = Math.round(100 * Math.max(0, Math.min(1, d.done / total))); chip(id).querySelector("em").textContent = S.pct[id] + "%"; }
      c.querySelector("[data-st-txt]").textContent = t("st_run") + (S.pct[id] != null ? ` · ${S.pct[id]}%` : "");
      if (typeof d.text === "string") c.querySelector("[data-head]").textContent = d.text.slice(0, 160);
      liveLine();
    } else if (d.type === "size") {
      // remembered, applied when the card is open (a collapsed frame keeps a sliver's height)
      if (typeof d.height === "number" && d.height > 0) { S.heights[id] = Math.min(6000, Math.max(120, Math.ceil(d.height))); sizeFrame(id); }
    } else if (d.type === "result") {
      S.results[id] = sanitize(d);
      setStatus(id, "done");
      c.querySelector("[data-head]").textContent = S.results[id].headline;
      if (MOCK) { c.querySelector("[data-frame]").replaceChildren(); c.querySelector("[data-res]").innerHTML = resHTML(S.results[id]); }
      renderLive();
      done(id);
    } else if (d.type === "error") {
      S.errors[id] = str(d.text, 300);
      setStatus(id, "error");
      c.querySelector("[data-err]").textContent = S.errors[id];
      liveLine();
      if (phaseBlocked()) { RUN.blocked = true; settle.pending.clear(); }
      done(id);
      if (RUN && RUN.blocked && settle.resolve) settle.resolve();
    }
  }
  // only messages from the frame this page opened for that tool, from the tool's own origin, in the checkup's format
  addEventListener("message", e => {
    const d = e.data;
    if (!d || typeof d !== "object" || d.ms !== "checkup" || typeof d.tool !== "string" || !TOOLS.includes(d.tool)) return;
    const f = S.frames[d.tool];
    if (!f || e.source !== f.contentWindow || e.origin !== tool(d.tool)) return;
    handle(d.tool, d);
  });
  const sizeFrame = id => { const f = S.frames[id]; if (f && card(id).dataset.open === "1") f.style.height = (S.heights[id] || 220) + "px"; };

  function launch(id) {
    const c = card(id), slot = c.querySelector("[data-frame]");
    setStatus(id, "run");
    if (MOCK) return mockRun(id, slot);
    const f = document.createElement("iframe");
    f.className = "t-frame"; f.src = embedURL(id); f.title = D.names[id]; f.referrerPolicy = "strict-origin-when-cross-origin";
    f.setAttribute("loading", "eager");
    slot.replaceChildren(f);
    S.frames[id] = f;
  }
  let MOCKS = null;
  async function mockRun(id, slot) {
    slot.innerHTML = `<div class="mock"><span data-mtxt>…</span><div class="mbar"><i></i></div></div>`;
    const bar = slot.querySelector(".mbar i"), txt = slot.querySelector("[data-mtxt]");
    if (MOCK_MODE === "silent") return;
    if (MOCK_MODE === "block") { await new Promise(r => setTimeout(r, 600)); return handle(id, { type: "error", text: "Failed to fetch" }); }
    if (!MOCKS) MOCKS = await fetch(D.mock).then(r => r.json()).catch(() => ({}));
    const msg = MOCKS[id], steps = id === "speed" ? 12 : 6, me = RUN;
    for (let i = 1; i <= steps; i++) {
      await new Promise(r => setTimeout(r, id === "speed" ? 500 : 350));
      if (RUN !== me || S.status[id] !== "run") return;
      bar.style.transform = `scaleX(${i / steps})`; txt.textContent = `${i} / ${steps}`;
      handle(id, { type: "progress", done: i, total: steps, text: `${i} / ${steps}` });
    }
    if (msg) handle(id, msg); else handle(id, { type: "error", text: "no sample result" });
  }

  // more than half of this phase's tools failed
  const phaseBlocked = () => { const ids = PHASES[PHASE] || []; return ids.filter(id => S.status[id] === "error").length * 2 > ids.length; };
  const wait = (ids, ms) => new Promise(res => {
    settle.pending = new Set(ids.filter(id => S.status[id] === "run")); settle.resolve = res;
    if (!settle.pending.size) return res();
    setTimeout(res, ms);
  });

  function reset() {
    for (const id of TOOLS) { S.status[id] = "wait"; delete S.results[id]; delete S.errors[id]; delete S.frames[id]; delete S.heights[id]; delete S.pct[id]; const c = card(id); c.dataset.st = "wait";
      c.querySelector("[data-st-txt]").textContent = t("st_wait"); c.querySelector("[data-head]").textContent = ""; c.querySelector("[data-frame]").replaceChildren(); c.querySelector("[data-res]").replaceChildren(); c.querySelector("[data-err]").textContent = "";
      toggleTool(id, false); const ch = chip(id); ch.dataset.st = "wait"; ch.querySelector("em").textContent = ""; }
    toggleTools(false);
    LAST = null; OV = null; $("#shareBtn").disabled = true; prog(0); document.title = TITLE;
    $("#vGradeT").textContent = "–"; $("#vGrade").className = "g-big"; delete $("#vGrade").dataset.g; ring(0);
    $("#vHead").className = "v-head"; $("#vHead").innerHTML = "&nbsp;"; $("#vSub").innerHTML = "&nbsp;"; $("#vMiss").textContent = "";
    for (const k of ["Ipqs", "Unlock", "Down"]) { $("#k" + k).textContent = "–"; $("#k" + k + "S").textContent = ""; }
    $("#finds").replaceChildren();
    for (const s of SECTIONS) { const g = $("#sg-" + s.id); g.textContent = "–"; g.className = "sec-g"; delete g.dataset.g; $("#sh-" + s.id).className = "sec-head m"; $("#sh-" + s.id).innerHTML = "&nbsp;";
      $("#ss-" + s.id).replaceChildren(); $("#sf-" + s.id).replaceChildren(); $("#sl-" + s.id).replaceChildren(); }
    $("#toolsSum").textContent = "";
    $("#blocked").hidden = true;
  }
  function setGo(st) { $("#go").dataset.st = st; $("#goT").textContent = t({ idle: "start", run: "stop", done: "again" }[st]); }
  const ring = f => { $("#vRing").style.strokeDasharray = `${(Math.min(1, Math.max(0, f)) * 100).toFixed(1)} 100`; };

  /* ---------- the first screen while the run goes ---------- */
  // the ring: finished tools over all; the sentence: the phase; under it: the tools running now with their progress
  function liveLine() {
    if (!RUN) return;
    const doneN = TOOLS.filter(id => S.results[id]).length;
    $("#vGradeT").textContent = `${doneN}/${TOOLS.length}`;
    ring(doneN / TOOLS.length + (TOOLS.filter(id => S.status[id] === "run").reduce((a, id) => a + (S.pct[id] || 0), 0) / 100) / TOOLS.length);
    $("#vHead").textContent = t("ph_run", { n: PHASE + 1, text: t("ph_" + (PHASE + 1)) });
    const running = TOOLS.filter(id => S.status[id] === "run").map(id => D.names[id] + (S.pct[id] != null ? ` ${S.pct[id]}%` : " …"));
    $("#vSub").textContent = running.length ? running.join(" · ") : t("waiting");
  }
  // the key numbers and findings from the results so far: filled in as each tool reports
  function renderLive() {
    liveLine();
    renderKeys(S.results, S.status.speed === "run" ? t("k_running") + (S.pct.speed != null ? ` ${S.pct.speed}%` : "") : "");
    renderFinds(S.results);
  }
  function renderKeys(R, downNote) {
    const keys = keyStats(R);
    $("#kIpqs").innerHTML = keys.ipqs && (keys.ipqs.grade || keys.ipqs.score != null) ? `<span class="${gradeTier(keys.ipqs.grade)}">${esc(keys.ipqs.grade || "")}</span>${keys.ipqs.score != null ? `<small>${keys.ipqs.score} / 100</small>` : ""}` : "–";
    $("#kIpqsS").textContent = R.ipqs ? R.ipqs.headline : "";
    $("#kUnlock").innerHTML = keys.unlock ? `${keys.unlock.works}<small>/ ${keys.unlock.total}</small>` : "–";
    $("#kUnlockS").textContent = R.unlock && R.unlock.stats[1] ? `${R.unlock.stats[1].label} ${R.unlock.stats[1].value}` : "";
    $("#kDown").innerHTML = keys.down != null ? `${mbps(keys.down)}<small>Mbps</small>` : downNote ? `<small>${esc(downNote)}</small>` : "–";
    $("#kDownS").textContent = keys.up != null ? `${t("k_up")} ${mbps(keys.up)} Mbps` : "";
  }
  // findings: across the tools first, then the worst of the tools', four in all; the leak rule stands in for the
  // tools' own WebRTC lines
  function renderFinds(R) {
    const cross = crossFindings(R);
    const own = topFindings(R, 4).filter(f => !cross.some(x => x.key === "x_leak" && /webrtc/i.test(f.text)));
    $("#finds").innerHTML = cross.map(x => findLi({ level: x.level, text: crossText(x) }, t("cross_h"))).concat(own.map(f => findLi(f, D.names[f.tool]))).slice(0, 4).join("");
  }

  async function start() {
    if (RUN) { RUN.abort = true; return; }
    if (SHARED) { SHARED = false; history.replaceState(null, "", D.paths[D.lang] + location.search); }
    reset();
    const me = RUN = { abort: false, t0: performance.now(), heard: false, blocked: false };
    $("#hero").dataset.st = "run"; $("#secs").hidden = true; $("#tools").hidden = false; $("#mockNote").hidden = !MOCK;
    $("#vGrade").className = "g-big wait";
    setGo("run");
    for (const id of TOOLS) if (!tool(id)) setStatus(id, "na");
    const tick = (n, label) => { const s = Math.round((performance.now() - me.t0) / 1000); $("#progTxt").textContent = t("prog", { n, text: label, s }); document.title = `${t("running")} ${n}/3 · ${TITLE}`; };
    for (let i = 0; i < PHASES.length && !me.abort; i++) {
      PHASE = i;
      const ids = PHASES[i].filter(id => S.status[id] === "wait");
      const label = t("ph_" + (i + 1));
      tick(i + 1, label); clearInterval(TIMER); TIMER = setInterval(() => tick(i + 1, label), 1000);
      prog(i / PHASES.length + .02);
      for (const id of ids) launch(id);
      liveLine();
      const t0 = performance.now();
      await Promise.race([wait(ids, PHASE_TIMEOUT), new Promise(r => { const iv = setInterval(() => {
        // the first phase: nothing at all from any tool for SILENCE ms means the probes are being stopped
        if (i === 0 && !me.heard && performance.now() - t0 >= SILENCE) me.blocked = true;
        if (me.abort || me.blocked) { clearInterval(iv); r(); }
      }, 200); })]);
      for (const id of ids) if (S.status[id] === "run") setStatus(id, me.abort || me.blocked ? "stopped" : "timeout");
      if (me.blocked) break;
      if (!me.abort && performance.now() - t0 < 400) await new Promise(r => setTimeout(r, 400));   // let a quick phase be seen
    }
    for (const id of TOOLS) if (S.status[id] === "wait") setStatus(id, "stopped");
    clearInterval(TIMER); TIMER = null;
    if (RUN !== me) return;
    RUN = null;
    const s = Math.round((performance.now() - me.t0) / 1000);
    $("#progTxt").textContent = me.abort ? t("prog_stopped") : t("prog_done", { s });
    prog(1);
    finish(me.blocked);
  }
  function finish(blocked) {
    const missing = {};
    for (const id of TOOLS) if (!S.results[id]) missing[id] = S.status[id];
    LAST = { v: 1, ts: Date.now(), lang: D.lang, tools: { ...S.results }, missing };
    render(LAST, false);
    // the visitor's own report now stands where the shared one was: the "shared on" banner no longer applies
    if (RECV) { RECV.remove(); RECV = null; }
    if (blocked) {
      // what finished still counts; with nothing finished the sections would only say "not finished", so they go
      $("#blocked").hidden = false;
      $("#blocked").classList.toggle("none", !OV.done.length);   // the headline says it already
      if (!OV.done.length) { $("#secs").hidden = true; $("#shareBtn").disabled = true; $("#vHead").className = "v-head bad"; $("#vHead").textContent = t("blocked_h"); }
    }
    setGo("done");
    document.title = `${t("app_name")} ${OV.grade || "–"} · ${TITLE}`;
  }

  /* ---------- the report ---------- */
  const gradeEl = (el, g, txt = el) => { txt.textContent = g || "–"; el.className = el.className.replace(/\bt\d\b/g, "").trim() + (g ? " " + gradeTier(g) : ""); if (g) el.dataset.g = g; else delete el.dataset.g; };
  const findLi = (f, src) => `<li data-lv="${esc(f.level)}"><span>${esc(f.text)}</span>${src ? `<span class="src">${esc(src)}</span>` : ""}</li>`;
  const crossText = x => t(x.key, Object.fromEntries(Object.entries(x.params || {}).map(([k, v]) => [k, country(v)])));
  const resHTML = r => `<p class="sec-head ${gradeLevel(r.grade)}">${esc(r.headline)}</p><ul class="stats">${r.stats.map(s => `<li><span>${esc(s.label)}</span><b>${esc(s.value)}</b></li>`).join("")}</ul><ul class="finds">${r.findings.map(f => findLi(f)).join("")}</ul>`;

  // the whole report from the tools' results: `shared` is someone else's (no frames to show)
  function render(rep, shared) {
    const R = rep.tools;
    OV = overall(R);
    $("#hero").dataset.st = "done"; $("#secs").hidden = false; $("#tools").hidden = false;
    // the verdict
    const vg = $("#vGrade"); vg.className = "g-big"; gradeEl(vg, OV.grade, $("#vGradeT")); ring(1);
    const vh = $("#vHead"); vh.textContent = OV.grade ? t("v_" + gradeKey(OV.grade)) : t("v_none"); vh.className = "v-head " + gradeLevel(OV.grade);
    $("#vSub").innerHTML = esc(t("sub", { done: OV.done.length, all: TOOLS.length, w: Math.round(100 * OV.used / OV.total) }));
    $("#vMiss").textContent = OV.missing.length ? t("missing", { list: OV.missing.map(id => D.names[id]).join(", ") }) : "";
    renderKeys(R, "");
    renderFinds(R);
    // the sections
    for (const sec of SECTIONS) {
      const sr = OV.sections[sec.id];
      gradeEl($("#sg-" + sec.id), sr.grade);
      const sh = $("#sh-" + sec.id);
      if (!sr.done.length) { sh.className = "sec-head m"; sh.textContent = t("sec_none"); }
      else if (sec.tools.length === 1) { sh.className = "sec-head " + gradeLevel(sr.grade); sh.textContent = R[sec.tools[0]].headline || t("s_" + sec.id + "_" + (gradeLevel(sr.grade) || "ok")); }
      else { sh.className = "sec-head " + gradeLevel(sr.grade); sh.textContent = t(`s_${sec.id}_${gradeLevel(sr.grade) || "ok"}`); }
      $("#ss-" + sec.id).innerHTML = sectionStats(sec, R).map(s => `<li><span>${esc(s.label)}</span><b>${esc(s.value)}</b></li>`).join("");
      $("#sf-" + sec.id).innerHTML = sectionFindings(sec, R).map(f => findLi(f, sec.tools.length > 1 ? D.names[f.tool] : "")).join("");
      $("#sl-" + sec.id).innerHTML = sr.done.map(id => { const o = tool(id); if (!o) return ""; const href = R[id].path ? o + R[id].path : toolHome(id); return xlink(href, esc(sec.tools.length > 1 ? `${t("full")} · ${D.names[id]}` : t("full"))); }).join("");
    }
    // the tool cards: a shared report has no frames, so each shows its result in full
    if (shared) for (const id of TOOLS) {
      const c = card(id), r = R[id];
      setStatus(id, r ? "done" : (rep.missing && rep.missing[id]) || "stopped");
      c.querySelector("[data-head]").textContent = r ? r.headline : "";
      c.querySelector("[data-res]").innerHTML = r ? resHTML(r) : "";
    }
    $("#toolsSum").textContent = t("tools_sum", { done: OV.done.length, all: TOOLS.length });
    $("#shareBtn").disabled = false;
  }
  // the test log and its cards open only when the visitor asks; a collapsed frame keeps a sliver visible
  function toggleTool(id, open) {
    const c = card(id);
    c.dataset.open = open ? "1" : "0";
    c.querySelector("[data-tog]").setAttribute("aria-expanded", String(open));
    c.querySelector("[data-tog-txt]").textContent = t(open ? "collapse" : "expand");
    sizeFrame(id);
  }
  function toggleTools(open) {
    $("#tools").dataset.open = open ? "1" : "0";
    $("[data-tools-tog]").setAttribute("aria-expanded", String(open));
    $("[data-tools-txt]").textContent = t(open ? "tools_hide" : "tools_show");
  }
  $("#tools").addEventListener("click", e => {
    const tb = e.target.closest("[data-tools-tog]");
    if (tb) return toggleTools($("#tools").dataset.open !== "1");
    const b = e.target.closest("[data-tog]"); if (!b) return;
    const c = b.closest(".tool"); toggleTool(c.dataset.tool, c.dataset.open !== "1");
  });
  $("#go").onclick = start;
  // a fresh page after the visitor turns the blocker off: some extensions only let requests through after a reload
  $("#retry").onclick = () => { location.href = D.paths[D.lang] + "?start=1" + (MOCK ? "&mock=1" : ""); };

  /* ---------- share: the 1ms.dog share dialog (/assets/share/, copied verbatim from 1ms-shell), loaded on use ---------- */
  // The link: the summary in the path (the grades and key numbers, for the preview title), the whole report after
  // the # (never sent to the server). The card: the overall grade, the five sections, the top findings.
  const detail = () => { const keys = keyStats(LAST.tools), p = [`${t("app_name")} ${OV.grade || "–"}`]; if (OV.sections.ipqs.grade) p.push(`${t("k_ipqs")} ${OV.sections.ipqs.grade}`); if (keys.unlock) p.push(`${t("k_unlock")} ${keys.unlock.works}/${keys.unlock.total}`); if (keys.down != null) p.push(`${t("k_down")} ${mbps(keys.down)} Mbps`); return p.join(" · "); };
  const shareLink = () => location.origin + D.paths[D.lang] + "r/" + encodeSummary(summaryOf(LAST, OV, keyStats(LAST.tools))) + "#" + encodeFull(LAST);
  // Drawn at 1200×630, the link preview's own size, so the stored preview (share v2) is this card unscaled: the overall
  // grade and the five section grades are the largest things on it, the findings stay on the page.
  async function drawCard(x, kit) {
    const { W, P, F, v, roundRect, clip, top } = kit, y = n => top + n, g = OV.grade;
    const col = g ? v(gradeTier(g)) : v("muted");
    x.textBaseline = "alphabetic";
    x.fillStyle = col + "22"; roundRect(x, P, y(0), 170, 170, 32); x.fill();
    x.fillStyle = col; x.font = `800 ${g && g.length > 1 ? 112 : 128}px ${F}`; x.textAlign = "center"; x.fillText(g || "–", P + 85, y(130)); x.textAlign = "left";
    x.fillStyle = v("fg"); x.font = `700 40px ${F}`;
    const head = g ? t("v_" + gradeKey(g)) : t("v_none"), words = head.split(/(?<=[ ，、。：])/), lines = [], tw = W - P * 2 - 205;
    let cur = "";
    for (const w of words) { if (cur && x.measureText(cur + w).width > tw) { lines.push(cur); cur = ""; } cur += w; }
    if (cur) lines.push(cur);
    lines.slice(0, 2).forEach((l, i) => x.fillText(clip(x, l, tw), P + 205, y(56 + i * 50)));
    x.fillStyle = v("muted"); x.font = `500 27px ${F}`; x.fillText(clip(x, detail(), tw), P + 205, y(lines.length > 1 ? 158 : 112));
    // the five sections, each grade as large as the space allows
    const gap = 14, cw = (W - P * 2 - 4 * gap) / 5;
    SECTIONS.forEach((s, i) => {
      const sg = OV.sections[s.id].grade, c = sg ? v(gradeTier(sg)) : v("muted"), at = P + i * (cw + gap);
      x.fillStyle = sg ? c + "1f" : v("soft"); roundRect(x, at, y(192), cw, 160, 20); x.fill();
      x.textAlign = "center";
      x.fillStyle = c; x.font = `800 80px ${F}`; x.fillText(sg || "–", at + cw / 2, y(282));
      x.fillStyle = v("fg"); x.font = `600 24px ${F}`; x.fillText(clip(x, t("sec_" + s.id), cw - 20), at + cw / 2, y(328));
      x.textAlign = "left";
    });
  }
  $("#shareBtn").onclick = async () => {
    if (!LAST || !OV) return;
    const { share } = await import("/assets/share/share.js");
    share({
      lang: D.lang, name: t("app_name"), file: "connection-checkup",
      show: [], never: ["ip"],
      link: shareLink, home: location.origin + D.paths[D.lang],
      text: () => t("share_text", { detail: detail() }),
      height: 630, draw: drawCard,
      foot: () => [t("card_sub")],
      ts: LAST.ts,
    }).open();
  };

  /* ---------- a shared report ---------- */
  function showShared(sum, full) {
    SHARED = true;
    $("#tools").hidden = !full; $("#mockNote").hidden = true;
    if (full) { render(full, true); LAST = full; }
    else {
      // only the summary: the grades and the key numbers, nothing else
      $("#hero").dataset.st = "done"; $("#secs").hidden = false;
      OV = { grade: sum.total, sections: Object.fromEntries(SECTIONS.map(s => [s.id, { grade: sum.sections[s.id] }])) };
      gradeEl($("#vGrade"), sum.total, $("#vGradeT")); ring(1);
      const vh = $("#vHead"); vh.textContent = sum.total ? t("v_" + gradeKey(sum.total)) : t("v_none"); vh.className = "v-head " + gradeLevel(sum.total);
      $("#vSub").innerHTML = "&nbsp;";
      $("#kIpqs").innerHTML = sum.sections.ipqs ? `<span class="${gradeTier(sum.sections.ipqs)}">${esc(sum.sections.ipqs)}</span>${sum.ipqsScore != null ? `<small>${sum.ipqsScore} / 100</small>` : ""}` : "–";
      $("#kUnlock").innerHTML = sum.works != null ? `${sum.works}<small>/ ${sum.all}</small>` : "–";
      $("#kDown").innerHTML = sum.down != null ? `${mbps(sum.down)}<small>Mbps</small>` : "–";
      for (const s of SECTIONS) { gradeEl($("#sg-" + s.id), sum.sections[s.id]); const sh = $("#sh-" + s.id); sh.className = "sec-head m"; sh.textContent = sum.sections[s.id] ? "" : t("sec_none"); }
      $("#shareBtn").disabled = true;
    }
    if (!full) $("#vMiss").textContent = t("partial");
    // the shared-result banner is the share component's (1ms-shell docs/tool-contract.md §4): when it was measured,
    // and "test mine", which runs a whole checkup; no compare mode here, so no done()
    import("/assets/share/share.js").then(({ received }) => {
      if (!SHARED) return;
      RECV = received({ lang: D.lang, ts: sum.ts, at: $("#hero"), test: () => { if (!RUN) start(); } });
    }).catch(() => {});
    $("#progTxt").innerHTML = "&nbsp;";
    setGo("idle");
  }

  // a checkup moves data (the speed test) and takes 90 seconds, so the page waits for Start unless the visitor turned
  // auto-run on (remembered in this browser) or came by a link that asks for it
  const autoBox = $("#auto");
  autoBox.checked = store.get(K.auto) === "1";
  autoBox.onchange = () => store.set(K.auto, autoBox.checked ? "1" : "0");

  setGo("idle");
  toggleTools(false);
  const SP = sharePath(location.pathname), SUM = SP && decodeSummary(SP.code);
  if (SUM) {
    const full = location.hash.length > 1 ? decodeFull(location.hash.slice(1)) : null;
    showShared(SUM, full && full.tools ? full : null);
  } else if (Q.get("start") === "1" || MOCK || autoBox.checked) start();
})();
