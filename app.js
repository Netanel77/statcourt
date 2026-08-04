import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { translations, t } from "./i18n.js";

const CONFIGURED =
  SUPABASE_URL && !SUPABASE_URL.includes("PASTE_YOUR") &&
  SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("PASTE_YOUR");

const supabase = CONFIGURED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ---------------- state ----------------
let lang = localStorage.getItem("statcourt_lang") || "he";
let session = null;
let clips = [];
let notesByClip = {};
let openClipId = null;
let activeTab = "clips";
let editingNote = null; // { clipId, noteId } or null

const ZONES = ["ft", "paint", "mid", "three"];

const root = document.getElementById("root");

// ---------------- helpers ----------------

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function pct(made, att) {
  const m = Number(made) || 0;
  const a = Number(att) || 0;
  if (a <= 0) return null;
  return Math.round((m / a) * 100);
}

function overallPct(fields) {
  let madeSum = 0, attSum = 0;
  for (const z of ZONES) {
    madeSum += Number(fields[`${z}_made`]) || 0;
    attSum += Number(fields[`${z}_att`]) || 0;
  }
  if (attSum <= 0) return null;
  return Math.round((madeSum / attSum) * 100);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function setLang(newLang) {
  lang = newLang;
  localStorage.setItem("statcourt_lang", lang);
  render();
}

function tr(key) { return t(lang, key); }

// ---------------- data access ----------------

async function loadClips() {
  const { data, error } = await supabase
    .from("clips")
    .select("*")
    .order("created_at", { ascending: false });
  if (!error) clips = data || [];
}

async function loadNotesForClip(clipId) {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("clip_id", clipId)
    .order("created_at", { ascending: false });
  if (!error) notesByClip[clipId] = data || [];
}

async function loadAllNotes() {
  const { data, error } = await supabase
    .from("notes")
    .select("*");
  return error ? [] : (data || []);
}

// ---------------- render: shell ----------------

function render() {
  document.documentElement.setAttribute("dir", translations[lang].dir);
  document.documentElement.setAttribute("lang", lang);

  if (!CONFIGURED) {
    root.innerHTML = renderConfigWarning();
    return;
  }

  if (!session) {
    root.innerHTML = renderAuth();
    attachAuthHandlers();
    return;
  }

  root.innerHTML = renderApp();
  attachAppHandlers();
}

function renderConfigWarning() {
  return `
    <div class="app-shell">
      <div class="auth-wrap">
        <div class="center-logo">
          <h1>Stat<span>Court</span></h1>
        </div>
        <div class="warning-banner">${tr("configWarning")}</div>
      </div>
    </div>
  `;
}

// ---------------- render: auth ----------------

function renderAuth() {
  return `
    <div class="app-shell">
      <div class="auth-wrap">
        <div class="center-logo">
          <h1>Stat<span>Court</span></h1>
          <p>${tr("tagline")}</p>
        </div>
        <div class="card">
          <h2 id="auth-title">${tr("login")}</h2>
          <div id="auth-error" class="error-msg hidden"></div>
          <label>${tr("email")}</label>
          <input type="email" id="auth-email" autocomplete="email" />
          <label>${tr("password")}</label>
          <input type="password" id="auth-password" autocomplete="current-password" />
          <button class="btn-primary" id="auth-submit" style="width:100%">${tr("loginBtn")}</button>
          <button class="link-btn" id="auth-toggle">${tr("noAccount")}</button>
        </div>
        <div style="text-align:center; margin-top: 16px;">
          <button class="lang-toggle" id="lang-toggle">${lang === "he" ? "English" : "עברית"}</button>
        </div>
      </div>
    </div>
  `;
}

let authMode = "login";

function attachAuthHandlers() {
  document.getElementById("lang-toggle").onclick = () => setLang(lang === "he" ? "en" : "he");

  document.getElementById("auth-toggle").onclick = () => {
    authMode = authMode === "login" ? "signup" : "login";
    document.getElementById("auth-title").textContent = authMode === "login" ? tr("login") : tr("signup");
    document.getElementById("auth-submit").textContent = authMode === "login" ? tr("loginBtn") : tr("signupBtn");
    document.getElementById("auth-toggle").textContent = authMode === "login" ? tr("noAccount") : tr("haveAccount");
  };

  document.getElementById("auth-submit").onclick = async () => {
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const errBox = document.getElementById("auth-error");
    errBox.classList.add("hidden");

    let result;
    if (authMode === "login") {
      result = await supabase.auth.signInWithPassword({ email, password });
    } else {
      result = await supabase.auth.signUp({ email, password });
    }

    if (result.error) {
      errBox.textContent = result.error.message || tr("authError");
      errBox.classList.remove("hidden");
      return;
    }

    session = result.data.session;
    if (session) {
      await loadClips();
      render();
    } else if (authMode === "signup") {
      errBox.textContent = "Check your email to confirm your account, then log in.";
      errBox.classList.remove("hidden");
    }
  };
}

// ---------------- render: main app ----------------

function renderApp() {
  return `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <h1>Stat<span>Court</span></h1>
          <span class="tagline">${tr("tagline")}</span>
        </div>
        <div class="topbar-actions">
          <button class="lang-toggle" id="lang-toggle">${lang === "he" ? "English" : "עברית"}</button>
          <button class="btn-logout" id="logout-btn">${tr("logout")}</button>
        </div>
      </header>

      <nav class="tabs">
        <button data-tab="clips" class="${activeTab === "clips" ? "active" : ""}">${tr("navClips")}</button>
        <button data-tab="new" class="${activeTab === "new" ? "active" : ""}">${tr("navNew")}</button>
        <button data-tab="summary" class="${activeTab === "summary" ? "active" : ""}">${tr("navSummary")}</button>
      </nav>

      <div id="tab-content">
        ${activeTab === "clips" ? renderClipsTab() : ""}
        ${activeTab === "new" ? renderNewClipTab() : ""}
        ${activeTab === "summary" ? renderSummaryTab() : ""}
      </div>
    </div>
  `;
}

function renderZoneInputs(prefix, values = {}) {
  return ZONES.map((z) => {
    const made = values[`${z}_made`] ?? "";
    const att = values[`${z}_att`] ?? "";
    const p = pct(made, att);
    return `
      <div class="zone-box">
        <div class="zone-name">${tr(z)}</div>
        <div class="zone-inputs">
          <input type="number" min="0" inputmode="numeric" class="zone-made" data-zone="${z}" placeholder="${tr("made")}" value="${escapeHtml(String(made))}" />
          <span class="zone-slash">/</span>
          <input type="number" min="0" inputmode="numeric" class="zone-att" data-zone="${z}" placeholder="${tr("att")}" value="${escapeHtml(String(att))}" />
        </div>
        <div class="zone-pct" data-zone-pct="${z}">${p === null ? "—" : p + "%"}</div>
      </div>
    `;
  }).join("");
}

function renderNoteForm(formId, existing = null) {
  const v = existing || {};
  return `
    <div class="zone-grid" id="${formId}-zones">
      ${renderZoneInputs(formId, v)}
    </div>
    <div class="overall-pct-box">
      <span class="label">${tr("overallPct")}</span>
      <span class="value" id="${formId}-overall">—</span>
    </div>
    <div class="misc-grid">
      <div>
        <label>${tr("turnovers")}</label>
        <input type="number" id="${formId}-turnovers" value="${escapeHtml(String(v.turnovers ?? ""))}" />
      </div>
      <div>
        <label>${tr("assists")}</label>
        <input type="number" id="${formId}-assists" value="${escapeHtml(String(v.assists ?? ""))}" />
      </div>
      <div>
        <label>${tr("rebounds")}</label>
        <input type="number" id="${formId}-rebounds" value="${escapeHtml(String(v.rebounds ?? ""))}" />
      </div>
      <div>
        <label>${tr("defense")}</label>
        <input type="number" id="${formId}-defense" value="${escapeHtml(String(v.defense_rating ?? ""))}" />
      </div>
    </div>
    <div>
      <label>${tr("efficiency")}</label>
      <input type="number" id="${formId}-efficiency" value="${escapeHtml(String(v.efficiency ?? ""))}" style="max-width:160px;" />
    </div>
    <label>${tr("noteTextLabel")}</label>
    <textarea id="${formId}-text" placeholder="${tr("noteTextPlaceholder")}">${escapeHtml(v.note_text || "")}</textarea>
  `;
}

function renderNewClipTab() {
  return `
    <div class="card">
      <h2>${tr("newClipTitle")}</h2>
      <div id="new-clip-error" class="error-msg hidden"></div>
      <label>${tr("youtubeUrlLabel")}</label>
      <input type="url" id="new-clip-url" placeholder="${tr("youtubeUrlPlaceholder")}" />
      <label>${tr("clipTitleLabel")}</label>
      <input type="text" id="new-clip-title" placeholder="${tr("clipTitlePlaceholder")}" />
      <button class="btn-primary" id="add-clip-btn">${tr("addClipBtn")}</button>
    </div>
  `;
}

function renderClipsTab() {
  if (!clips.length) {
    return `<div class="card"><div class="empty-state">${tr("noClipsYet")}</div></div>`;
  }
  return clips.map((c) => renderClipCard(c)).join("");
}

function renderClipCard(clip) {
  const isOpen = openClipId === clip.id;
  const notes = notesByClip[clip.id] || [];
  return `
    <div class="clip-card" data-clip-id="${clip.id}">
      <div class="clip-header" data-toggle-clip="${clip.id}">
        <div>
          <div class="clip-title">${escapeHtml(clip.title) || tr("navClips")}</div>
          <div class="clip-meta">${notes.length} ${tr("notesCount")} · ${new Date(clip.created_at).toLocaleDateString(lang === "he" ? "he-IL" : "en-US")}</div>
        </div>
        <div class="chevron ${isOpen ? "open" : ""}">▶</div>
      </div>
      ${isOpen ? renderClipBody(clip) : ""}
    </div>
  `;
}

function renderClipBody(clip) {
  const notes = notesByClip[clip.id] || [];
  const isEditingHere = editingNote && editingNote.clipId === clip.id;
  return `
    <div class="clip-body">
      <div class="video-wrap">
        <iframe src="https://www.youtube.com/embed/${clip.video_id}" allowfullscreen></iframe>
      </div>

      <h2 style="font-size:15px;">${editingNote && isEditingHere ? tr("edit") : tr("addNote")}</h2>
      ${renderNoteForm("note-form-" + clip.id, isEditingHere ? notes.find(n => n.id === editingNote.noteId) : null)}
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button class="btn-primary" data-save-note="${clip.id}">
          ${isEditingHere ? tr("update") : tr("saveNote")}
        </button>
        ${isEditingHere ? `<button class="btn-secondary" data-cancel-edit="1">${tr("cancel")}</button>` : ""}
      </div>

      <h2 style="font-size:15px; margin-top:26px;">${tr("savedNotes")}</h2>
      ${notes.length ? notes.map((n) => renderNoteItem(clip.id, n)).join("") : `<div class="empty-state">${tr("noNotesYet")}</div>`}
    </div>
  `;
}

function renderNoteItem(clipId, note) {
  const op = overallPct({
    ft_made: note.ft_made, ft_att: note.ft_att,
    paint_made: note.paint_made, paint_att: note.paint_att,
    mid_made: note.mid_made, mid_att: note.mid_att,
    three_made: note.three_made, three_att: note.three_att,
  });
  const pills = [
    [tr("ft"), pct(note.ft_made, note.ft_att), note.ft_made, note.ft_att],
    [tr("paint"), pct(note.paint_made, note.paint_att), note.paint_made, note.paint_att],
    [tr("mid"), pct(note.mid_made, note.mid_att), note.mid_made, note.mid_att],
    [tr("three"), pct(note.three_made, note.three_att), note.three_made, note.three_att],
  ];
  return `
    <div class="note-item" data-note-id="${note.id}">
      ${note.note_text ? `<div class="note-text">${escapeHtml(note.note_text)}</div>` : ""}
      <div class="stat-pills">
        ${pills.map(([label, p, made, att]) => (made || att) ? `<span class="pill">${label}: <strong>${made || 0}/${att || 0}${p !== null ? " (" + p + "%)" : ""}</strong></span>` : "").join("")}
        ${op !== null ? `<span class="pill">${tr("overallPct")}: <strong>${op}%</strong></span>` : ""}
        ${note.turnovers ? `<span class="pill">${tr("turnovers")}: <strong>${note.turnovers}</strong></span>` : ""}
        ${note.assists ? `<span class="pill">${tr("assists")}: <strong>${note.assists}</strong></span>` : ""}
        ${note.rebounds ? `<span class="pill">${tr("rebounds")}: <strong>${note.rebounds}</strong></span>` : ""}
        ${note.defense_rating ? `<span class="pill">${tr("defense")}: <strong>${note.defense_rating}</strong></span>` : ""}
        ${note.efficiency ? `<span class="pill">${tr("efficiency")}: <strong>${note.efficiency}</strong></span>` : ""}
      </div>
      <div class="note-actions">
        <button data-edit-note="${clipId}:${note.id}">${tr("edit")}</button>
        <button class="danger" data-delete-note="${clipId}:${note.id}">${tr("delete")}</button>
      </div>
    </div>
  `;
}

function renderSummaryTab() {
  return `<div class="card"><div class="empty-state">${tr("loading")}</div></div>`;
}

async function renderSummaryTabAsync() {
  const allNotes = await loadAllNotes();
  const container = document.getElementById("tab-content");
  if (!allNotes.length) {
    container.innerHTML = `<div class="card"><div class="empty-state">${tr("noDataYet")}</div></div>`;
    return;
  }

  const sums = {
    ft_made: 0, ft_att: 0, paint_made: 0, paint_att: 0,
    mid_made: 0, mid_att: 0, three_made: 0, three_att: 0,
    turnovers: 0, assists: 0, rebounds: 0, defense_rating: 0, efficiency: 0,
    countTurnovers: 0, countAssists: 0, countRebounds: 0, countDefense: 0, countEfficiency: 0,
  };

  for (const n of allNotes) {
    sums.ft_made += Number(n.ft_made) || 0;
    sums.ft_att += Number(n.ft_att) || 0;
    sums.paint_made += Number(n.paint_made) || 0;
    sums.paint_att += Number(n.paint_att) || 0;
    sums.mid_made += Number(n.mid_made) || 0;
    sums.mid_att += Number(n.mid_att) || 0;
    sums.three_made += Number(n.three_made) || 0;
    sums.three_att += Number(n.three_att) || 0;
    if (n.turnovers !== null && n.turnovers !== undefined) { sums.turnovers += Number(n.turnovers); sums.countTurnovers++; }
    if (n.assists !== null && n.assists !== undefined) { sums.assists += Number(n.assists); sums.countAssists++; }
    if (n.rebounds !== null && n.rebounds !== undefined) { sums.rebounds += Number(n.rebounds); sums.countRebounds++; }
    if (n.defense_rating !== null && n.defense_rating !== undefined) { sums.defense_rating += Number(n.defense_rating); sums.countDefense++; }
    if (n.efficiency !== null && n.efficiency !== undefined) { sums.efficiency += Number(n.efficiency); sums.countEfficiency++; }
  }

  const overallMade = sums.ft_made + sums.paint_made + sums.mid_made + sums.three_made;
  const overallAtt = sums.ft_att + sums.paint_att + sums.mid_att + sums.three_att;
  const overall = overallAtt > 0 ? Math.round((overallMade / overallAtt) * 100) : null;

  const avg = (sum, count) => (count > 0 ? (sum / count).toFixed(1) : "—");

  container.innerHTML = `
    <div class="card">
      <h2>${tr("summaryTitle")}<span class="sub">${tr("summarySubtitle")}</span></h2>
      <div class="summary-headline">
        <div>
          <div class="big-num">${clips.length}</div>
          <div class="big-lbl">${tr("totalClips")}</div>
        </div>
        <div>
          <div class="big-num">${allNotes.length}</div>
          <div class="big-lbl">${tr("totalNotes")}</div>
        </div>
        <div>
          <div class="big-num"><span>${overall === null ? "—" : overall + "%"}</span></div>
          <div class="big-lbl">${tr("avgOverallPct")}</div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-tile"><div class="num">${pct(sums.ft_made, sums.ft_att) ?? "—"}%</div><div class="lbl">${tr("avgFt")}</div></div>
        <div class="stat-tile"><div class="num">${pct(sums.paint_made, sums.paint_att) ?? "—"}%</div><div class="lbl">${tr("avgPaint")}</div></div>
        <div class="stat-tile"><div class="num">${pct(sums.mid_made, sums.mid_att) ?? "—"}%</div><div class="lbl">${tr("avgMid")}</div></div>
        <div class="stat-tile"><div class="num">${pct(sums.three_made, sums.three_att) ?? "—"}%</div><div class="lbl">${tr("avgThree")}</div></div>
        <div class="stat-tile"><div class="num">${avg(sums.turnovers, sums.countTurnovers)}</div><div class="lbl">${tr("avgTurnovers")}</div></div>
        <div class="stat-tile"><div class="num">${avg(sums.assists, sums.countAssists)}</div><div class="lbl">${tr("avgAssists")}</div></div>
        <div class="stat-tile"><div class="num">${avg(sums.rebounds, sums.countRebounds)}</div><div class="lbl">${tr("avgRebounds")}</div></div>
        <div class="stat-tile"><div class="num">${avg(sums.defense_rating, sums.countDefense)}</div><div class="lbl">${tr("avgDefense")}</div></div>
        <div class="stat-tile"><div class="num">${avg(sums.efficiency, sums.countEfficiency)}</div><div class="lbl">${tr("avgEfficiency")}</div></div>
      </div>
    </div>
  `;
}

// ---------------- event wiring ----------------

function wireZoneLiveCalc(formId) {
  const container = document.getElementById(`${formId}-zones`);
  if (!container) return;
  const updateAll = () => {
    const fields = {};
    ZONES.forEach((z) => {
      const made = container.querySelector(`.zone-made[data-zone="${z}"]`).value;
      const att = container.querySelector(`.zone-att[data-zone="${z}"]`).value;
      fields[`${z}_made`] = made;
      fields[`${z}_att`] = att;
      const p = pct(made, att);
      const pctEl = container.querySelector(`[data-zone-pct="${z}"]`);
      if (pctEl) pctEl.textContent = p === null ? "—" : p + "%";
    });
    const overallEl = document.getElementById(`${formId}-overall`);
    if (overallEl) {
      const op = overallPct(fields);
      overallEl.textContent = op === null ? "—" : op + "%";
    }
  };
  container.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", updateAll));
  updateAll();
}

function readNoteForm(formId) {
  const val = (id) => document.getElementById(id)?.value ?? "";
  const num = (v) => (v === "" ? null : Number(v));
  const container = document.getElementById(`${formId}-zones`);
  const fields = { note_text: val(`${formId}-text`) || null };
  ZONES.forEach((z) => {
    fields[`${z}_made`] = num(container.querySelector(`.zone-made[data-zone="${z}"]`).value);
    fields[`${z}_att`] = num(container.querySelector(`.zone-att[data-zone="${z}"]`).value);
  });
  fields.turnovers = num(val(`${formId}-turnovers`));
  fields.assists = num(val(`${formId}-assists`));
  fields.rebounds = num(val(`${formId}-rebounds`));
  fields.defense_rating = num(val(`${formId}-defense`));
  fields.efficiency = num(val(`${formId}-efficiency`));
  return fields;
}

function attachAppHandlers() {
  document.getElementById("lang-toggle").onclick = () => setLang(lang === "he" ? "en" : "he");
  document.getElementById("logout-btn").onclick = async () => {
    await supabase.auth.signOut();
    session = null;
    clips = [];
    notesByClip = {};
    render();
  };

  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.onclick = () => {
      activeTab = btn.dataset.tab;
      editingNote = null;
      render();
      if (activeTab === "summary") renderSummaryTabAsync();
    };
  });

  if (activeTab === "new") {
    document.getElementById("add-clip-btn").onclick = async () => {
      const url = document.getElementById("new-clip-url").value.trim();
      const title = document.getElementById("new-clip-title").value.trim();
      const errBox = document.getElementById("new-clip-error");
      errBox.classList.add("hidden");
      const videoId = extractYouTubeId(url);
      if (!videoId) {
        errBox.textContent = tr("invalidUrl");
        errBox.classList.remove("hidden");
        return;
      }
      const { data, error } = await supabase
        .from("clips")
        .insert({ youtube_url: url, video_id: videoId, title: title || null, user_id: session.user.id })
        .select()
        .single();
      if (error) {
        errBox.textContent = error.message;
        errBox.classList.remove("hidden");
        return;
      }
      clips.unshift(data);
      openClipId = data.id;
      notesByClip[data.id] = [];
      activeTab = "clips";
      render();
    };
  }

  if (activeTab === "clips") {
    document.querySelectorAll("[data-toggle-clip]").forEach((el) => {
      el.onclick = async () => {
        const id = el.getAttribute("data-toggle-clip");
        if (openClipId === id) {
          openClipId = null;
        } else {
          openClipId = id;
          if (!notesByClip[id]) await loadNotesForClip(id);
        }
        render();
      };
    });

    if (openClipId) {
      const formId = "note-form-" + openClipId;
      wireZoneLiveCalc(formId);

      const saveBtn = document.querySelector(`[data-save-note="${openClipId}"]`);
      if (saveBtn) {
        saveBtn.onclick = async () => {
          const fields = readNoteForm(formId);
          if (editingNote && editingNote.clipId === openClipId) {
            const { error } = await supabase.from("notes").update(fields).eq("id", editingNote.noteId);
            if (!error) {
              editingNote = null;
              await loadNotesForClip(openClipId);
              render();
            }
          } else {
            const { error } = await supabase.from("notes").insert({
              ...fields,
              clip_id: openClipId,
              user_id: session.user.id,
            });
            if (!error) {
              await loadNotesForClip(openClipId);
              render();
            }
          }
        };
      }

      const cancelBtn = document.querySelector(`[data-cancel-edit]`);
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          editingNote = null;
          render();
        };
      }

      document.querySelectorAll("[data-edit-note]").forEach((el) => {
        el.onclick = () => {
          const [clipId, noteId] = el.getAttribute("data-edit-note").split(":");
          editingNote = { clipId, noteId };
          render();
        };
      });

      document.querySelectorAll("[data-delete-note]").forEach((el) => {
        el.onclick = async () => {
          if (!confirm(tr("confirmDelete"))) return;
          const [clipId, noteId] = el.getAttribute("data-delete-note").split(":");
          const { error } = await supabase.from("notes").delete().eq("id", noteId);
          if (!error) {
            await loadNotesForClip(clipId);
            render();
          }
        };
      });
    }
  }
}

// ---------------- boot ----------------

async function boot() {
  if (!CONFIGURED) {
    render();
    return;
  }
  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (session) await loadClips();
  render();

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session = newSession;
  });
}

boot();
