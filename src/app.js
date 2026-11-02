// Network X-Ray (Connection Checkup) page. Press Start: the eight 1ms.dog tools run in frames, in three phases (src/tools.mjs), each
// showing its own progress and result and posting it back (1ms-shell docs/checkup.md). At the end: the overall
// grade, the five sections, the cross-tool findings (src/report.mjs), and a link and card to share (src/share.mjs).
// Strings: window.L1MS. ?mock=1 feeds the page the sample results in test/fixtures instead of framing the tools.
import { TOOLS, PHASES, SECTIONS, PHASE_TIMEOUT, DEFAULT_ORIGINS } from "./tools.mjs";
import { overall, crossFindings, keyStats, sectionFindings, sectionStats, topFindings, gradeTier, gradeLevel, gradeKey, sectionOf } from "./report.mjs";
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
  const MOCK = Q.get("mock") === "1";
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
  const card = id => $(`.tool[data-tool="${id}"]`);
  const S = { status: {}, results: {}, errors: {}, frames: {} };   // status: wait | run | done | timeout | error | na | stopped
  let RUN = null, LAST = null, OV = null, TIMER = null, SHARED = false;
  const TITLE = document.title;

  function setStatus(id, st) {
    S.status[id] = st;
    const c = card(id); c.dataset.st = st; c.querySelector("[data-st-txt]").textContent = t("st_" + st);
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
    if (d.type === "progress") {
      const total = typeof d.total === "number" && d.total > 0 ? d.total : 100, pct = typeof d.done === "number" ? Math.max(0, Math.min(1, d.done / total)) : null;
      c.querySelector("[data-st-txt]").textContent = t("st_run") + (pct != null ? ` · ${Math.round(pct * 100)}%` : "");
      if (typeof d.text === "string") c.querySelector("[data-head]").textContent = d.text.slice(0, 160);
    } else if (d.type === "size") {
      const f = S.frames[id];
      if (f && typeof d.height === "number" && d.height > 0) f.style.height = Math.min(6000, Math.max(120, Math.ceil(d.height))) + "px";
    } else if (d.type === "result") {
      S.results[id] = sanitize(d);
      setStatus(id, "done");
      c.querySelector("[data-head]").textContent = S.results[id].headline;
      if (MOCK) { c.querySelector("[data-frame]").replaceChildren(); c.querySelector("[data-res]").innerHTML = resHTML(S.results[id]); }
      done(id);
    } else if (d.type === "error") {
      S.errors[id] = str(d.text, 300);
      setStatus(id, "error");
      c.querySelector("[data-err]").textContent = S.errors[id];
      done(id);
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

  const wait = (ids, ms) => new Promise(res => {
    settle.pending = new Set(ids.filter(id => S.status[id] === "run")); settle.resolve = res;
    if (!settle.pending.size) return res();
    setTimeout(res, ms);
  });

  function reset() {
    for (const id of TOOLS) { S.status[id] = "wait"; delete S.results[id]; delete S.errors[id]; delete S.frames[id]; const c = card(id); c.dataset.st = "wait"; c.dataset.open = "1";
      c.querySelector("[data-st-txt]").textContent = t("st_wait"); c.querySelector("[data-head]").textContent = ""; c.querySelector("[data-frame]").replaceChildren(); c.querySelector("[data-res]").replaceChildren(); c.querySelector("[data-err]").textContent = "";
      c.querySelector("[data-tog-txt]").textContent = t("collapse"); c.querySelector("[data-tog]").setAttribute("aria-expanded", "true"); }
    LAST = null; OV = null; $("#shareBtn").disabled = true; prog(0); document.title = TITLE;
    $("#vGrade").textContent = "–"; $("#vGrade").className = "g-big"; delete $("#vGrade").dataset.g;
    $("#vHead").className = "v-head"; $("#vHead").innerHTML = "&nbsp;"; $("#vSub").innerHTML = "&nbsp;"; $("#vMiss").textContent = "";
    for (const k of ["Ipqs", "Unlock", "Down"]) { $("#k" + k).textContent = "–"; $("#k" + k + "S").textContent = ""; }
    $("#finds").replaceChildren(); $("#crossH").hidden = true;
    for (const s of SECTIONS) { const g = $("#sg-" + s.id); g.textContent = "–"; g.className = "sec-g"; delete g.dataset.g; $("#sh-" + s.id).className = "sec-head m"; $("#sh-" + s.id).innerHTML = "&nbsp;";
      $("#ss-" + s.id).replaceChildren(); $("#sf-" + s.id).replaceChildren(); $("#sl-" + s.id).replaceChildren(); }
  }
  function setGo(st) { $("#go").dataset.st = st; $("#goT").textContent = t({ idle: "start", run: "stop", done: "again" }[st]); }

  async function start() {
    if (RUN) { RUN.abort = true; return; }
    if (SHARED) { SHARED = false; $("#shared").hidden = true; history.replaceState(null, "", D.paths[D.lang] + location.search); }
    reset();
    const me = RUN = { abort: false, t0: performance.now() };
    $("#hero").dataset.st = "run"; $("#secs").hidden = true; $("#tools").hidden = false; $("#mockNote").hidden = !MOCK;
    $("#vGrade").className = "g-big wait"; $("#vGrade").textContent = "…"; $("#vHead").textContent = t("v_running");
    setGo("run");
    for (const id of TOOLS) if (!tool(id)) setStatus(id, "na");
    const tick = (n, label) => { const s = Math.round((performance.now() - me.t0) / 1000); $("#progTxt").textContent = t("prog", { n, text: label, s }); document.title = `${t("running")} ${n}/3 · ${TITLE}`; };
    for (let i = 0; i < PHASES.length && !me.abort; i++) {
      const ids = PHASES[i].filter(id => S.status[id] === "wait");
      const label = t("ph_" + (i + 1));
      tick(i + 1, label); clearInterval(TIMER); TIMER = setInterval(() => tick(i + 1, label), 1000);
      prog(i / PHASES.length + .02);
      for (const id of ids) launch(id);
      const t0 = performance.now();
      await Promise.race([wait(ids, PHASE_TIMEOUT), new Promise(r => { const iv = setInterval(() => { if (me.abort) { clearInterval(iv); r(); } }, 200); })]);
      for (const id of ids) if (S.status[id] === "run") setStatus(id, me.abort ? "stopped" : "timeout");
      if (!me.abort && performance.now() - t0 < 400) await new Promise(r => setTimeout(r, 400));   // let a quick phase be seen
    }
    for (const id of TOOLS) if (S.status[id] === "wait") setStatus(id, "stopped");
    clearInterval(TIMER); TIMER = null;
    if (RUN !== me) return;
    RUN = null;
    const s = Math.round((performance.now() - me.t0) / 1000);
    $("#progTxt").textContent = me.abort ? t("prog_stopped") : t("prog_done", { s });
    prog(1);
    finish(me.abort);
  }
  function finish(stopped) {
    const missing = {};
    for (const id of TOOLS) if (!S.results[id]) missing[id] = S.status[id];
    LAST = { v: 1, ts: Date.now(), lang: D.lang, tools: { ...S.results }, missing };
    render(LAST, false);
    for (const id of TOOLS) toggleTool(id, false);   // the frames fold into result cards
    setGo("done");
    document.title = `${t("app_name")} ${OV.grade || "–"} · ${TITLE}`;
  }

  /* ---------- the report ---------- */
  const gradeEl = (el, g) => { el.textContent = g || "–"; el.className = el.className.replace(/\bt\d\b/g, "").trim() + (g ? " " + gradeTier(g) : ""); if (g) el.dataset.g = g; else delete el.dataset.g; };
  const findLi = (f, src) => `<li data-lv="${esc(f.level)}"><span>${esc(f.text)}</span>${src ? `<span class="src">${esc(src)}</span>` : ""}</li>`;
  const mbps = v => v >= 10 ? String(Math.round(v)) : v.toFixed(1);
  const crossText = x => t(x.key, Object.fromEntries(Object.entries(x.params || {}).map(([k, v]) => [k, country(v)])));

  // the whole report from the tools' results: `shared` is someone else's (no frames to show)
  function render(rep, shared) {
    const R = rep.tools;
    OV = overall(R);
    const keys = keyStats(R), cross = crossFindings(R);
    $("#hero").dataset.st = "done"; $("#secs").hidden = false; $("#tools").hidden = false;
    // the verdict
    const vg = $("#vGrade"); vg.className = "g-big"; gradeEl(vg, OV.grade);
    const vh = $("#vHead"); vh.textContent = OV.grade ? t("v_" + gradeKey(OV.grade)) : t("v_none"); vh.className = "v-head " + gradeLevel(OV.grade);
    $("#vSub").innerHTML = esc(t("sub", { done: OV.done.length, all: TOOLS.length, w: Math.round(100 * OV.used / OV.total) }));
    $("#vMiss").textContent = OV.missing.length ? t("missing", { list: OV.missing.map(id => D.names[id]).join(", ") }) : "";
    // three key numbers
    $("#kIpqs").innerHTML = keys.ipqs && (keys.ipqs.grade || keys.ipqs.score != null) ? `<span class="${gradeTier(keys.ipqs.grade)}">${esc(keys.ipqs.grade || "")}</span>${keys.ipqs.score != null ? `<small>${keys.ipqs.score} / 100</small>` : ""}` : "–";
    $("#kIpqsS").textContent = R.ipqs ? R.ipqs.headline : "";
    $("#kUnlock").innerHTML = keys.unlock ? `${keys.unlock.works}<small>/ ${keys.unlock.total}</small>` : "–";
    $("#kUnlockS").textContent = R.unlock && R.unlock.stats[1] ? `${R.unlock.stats[1].label} ${R.unlock.stats[1].value}` : "";
    $("#kDown").innerHTML = keys.down != null ? `${mbps(keys.down)}<small>Mbps</small>` : "–";
    $("#kDownS").textContent = keys.up != null ? `${t("k_up")} ${mbps(keys.up)} Mbps` : "";
    // findings: across the tools first, then the worst of the tools', four in all
    const own = topFindings(R, 4).filter(f => !cross.some(x => x.key === "x_leak" && /webrtc/i.test(f.text)));
    $("#finds").innerHTML = cross.map(x => findLi({ level: x.level, text: crossText(x) }, t("cross_h"))).concat(own.map(f => findLi(f, D.names[f.tool]))).slice(0, 4).join("");
    $("#crossH").hidden = true;
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
    for (const id of TOOLS) {
      const c = card(id), r = R[id];
      if (shared) {
        setStatus(id, r ? "done" : (rep.missing && rep.missing[id]) || "stopped");
        c.querySelector("[data-head]").textContent = r ? r.headline : "";
        c.querySelector("[data-res]").innerHTML = r ? resHTML(r) : "";
        toggleTool(id, false);
      }
    }
    $("#shareBtn").disabled = false;
  }
  const resHTML = r => `<p class="sec-head ${gradeLevel(r.grade)}">${esc(r.headline)}</p><ul class="stats">${r.stats.map(s => `<li><span>${esc(s.label)}</span><b>${esc(s.value)}</b></li>`).join("")}</ul><ul class="finds">${r.findings.map(f => findLi(f)).join("")}</ul>`;
  function toggleTool(id, open) {
    const c = card(id);
    c.dataset.open = open ? "1" : "0";
    c.querySelector("[data-tog]").setAttribute("aria-expanded", String(open));
    c.querySelector("[data-tog-txt]").textContent = t(open ? "collapse" : "expand");
  }
  $("#tools").addEventListener("click", e => { const b = e.target.closest("[data-tog]"); if (!b) return; const c = b.closest(".tool"); toggleTool(c.dataset.tool, c.dataset.open !== "1"); });
  $("#go").onclick = start;
  $("#testMine").onclick = () => { if (!RUN) start(); };

  /* ---------- share: the 1ms.dog share dialog (/assets/share/, copied verbatim from 1ms-shell), loaded on use ---------- */
  // The link: the summary in the path (the grades and key numbers, for the preview title), the whole report after
  // the # (never sent to the server). The card: the overall grade, the five sections, the top findings.
  const detail = () => { const keys = keyStats(LAST.tools), p = [`${t("app_name")} ${OV.grade || "–"}`]; if (OV.sections.ipqs.grade) p.push(`${t("k_ipqs")} ${OV.sections.ipqs.grade}`); if (keys.unlock) p.push(`${t("k_unlock")} ${keys.unlock.works}/${keys.unlock.total}`); if (keys.down != null) p.push(`${t("k_down")} ${mbps(keys.down)} Mbps`); return p.join(" · "); };
  const shareLink = () => location.origin + D.paths[D.lang] + "r/" + encodeSummary(summaryOf(LAST, OV, keyStats(LAST.tools))) + "#" + encodeFull(LAST);
  async function drawCard(x, kit) {
    const { W, P, F, v, roundRect, clip, top } = kit, y = n => top + n, g = OV.grade;
    const col = g ? v(gradeTier(g)) : v("muted");
    x.textBaseline = "alphabetic";
    x.fillStyle = col + "22"; roundRect(x, P, y(0), 200, 200, 36); x.fill();
    x.fillStyle = col; x.font = `800 150px ${F}`; x.textAlign = "center"; x.fillText(g || "–", P + 100, y(150)); x.textAlign = "left";
    x.fillStyle = v("fg"); x.font = `700 36px ${F}`;
    const head = g ? t("v_" + gradeKey(g)) : t("v_none"), words = head.split(/(?<=[ ，、。：])/), lines = [];
    let cur = "";
    for (const w of words) { if (cur && x.measureText(cur + w).width > W - P * 2 - 240) { lines.push(cur); cur = ""; } cur += w; }
    if (cur) lines.push(cur);
    lines.slice(0, 2).forEach((l, i) => x.fillText(clip(x, l, W - P * 2 - 240), P + 240, y(62 + i * 48)));
    x.fillStyle = v("muted"); x.font = `500 26px ${F}`; x.fillText(clip(x, detail(), W - P * 2 - 240), P + 240, y(lines.length > 1 ? 172 : 124));
    // the five sections
    const cw = (W - P * 2 - 4 * 16) / 5;
    SECTIONS.forEach((s, i) => {
      const sg = OV.sections[s.id].grade, c = sg ? v(gradeTier(sg)) : v("muted"), at = P + i * (cw + 16);
      x.fillStyle = sg ? c + "1f" : v("soft"); roundRect(x, at, y(240), cw, 120, 18); x.fill();
      x.textAlign = "center";
      x.fillStyle = c; x.font = `800 52px ${F}`; x.fillText(sg || "–", at + cw / 2, y(305));
      x.fillStyle = v("muted"); x.font = `500 20px ${F}`; x.fillText(clip(x, t("sec_" + s.id), cw - 20), at + cw / 2, y(345));
      x.textAlign = "left";
    });
    // the top findings
    const cross = crossFindings(LAST.tools).map(c => ({ level: c.level, text: crossText(c) })), own = topFindings(LAST.tools, 3);
    const finds = cross.concat(own).slice(0, 3);
    finds.forEach((f, i) => {
      const yy = y(410 + i * 46);
      x.fillStyle = v(f.level === "bad" ? "t5" : f.level === "warn" ? "t3" : "t1"); x.beginPath(); x.arc(P + 10, yy - 9, 8, 0, Math.PI * 2); x.fill();
      x.fillStyle = v("fg"); x.font = `500 25px ${F}`; x.fillText(clip(x, f.text, W - P * 2 - 40), P + 34, yy);
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
      height: 790, draw: drawCard,
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
      gradeEl($("#vGrade"), sum.total);
      const vh = $("#vHead"); vh.textContent = sum.total ? t("v_" + gradeKey(sum.total)) : t("v_none"); vh.className = "v-head " + gradeLevel(sum.total);
      $("#vSub").innerHTML = "&nbsp;";
      $("#kIpqs").innerHTML = sum.sections.ipqs ? `<span class="${gradeTier(sum.sections.ipqs)}">${esc(sum.sections.ipqs)}</span>${sum.ipqsScore != null ? `<small>${sum.ipqsScore} / 100</small>` : ""}` : "–";
      $("#kUnlock").innerHTML = sum.works != null ? `${sum.works}<small>/ ${sum.all}</small>` : "–";
      $("#kDown").innerHTML = sum.down != null ? `${mbps(sum.down)}<small>Mbps</small>` : "–";
      for (const s of SECTIONS) { gradeEl($("#sg-" + s.id), sum.sections[s.id]); const sh = $("#sh-" + s.id); sh.className = "sec-head m"; sh.textContent = sum.sections[s.id] ? "" : t("sec_none"); }
      $("#shareBtn").disabled = true;
    }
    $("#sharedTxt").textContent = t("shared_on", { date: new Date(sum.ts).toLocaleString(D.lang, { dateStyle: "medium", timeStyle: "short" }) });
    $("#sharedNote").textContent = full ? "" : t("partial");
    $("#shared").hidden = false;
    $("#progTxt").innerHTML = "&nbsp;";
    setGo("idle");
  }

  // a checkup moves data (the speed test) and takes 90 seconds, so the page waits for Start unless the visitor turned
  // auto-run on (remembered in this browser) or came by a link that asks for it
  const autoBox = $("#auto");
  autoBox.checked = store.get(K.auto) === "1";
  autoBox.onchange = () => store.set(K.auto, autoBox.checked ? "1" : "0");

  setGo("idle");
  const SP = sharePath(location.pathname), SUM = SP && decodeSummary(SP.code);
  if (SUM) {
    const full = location.hash.length > 1 ? decodeFull(location.hash.slice(1)) : null;
    showShared(SUM, full && full.tools ? full : null);
  } else if (Q.get("start") === "1" || MOCK || autoBox.checked) start();
})();
