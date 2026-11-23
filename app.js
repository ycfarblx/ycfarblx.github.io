/* YCFA site. Reads /data/league.json (written by the stats bot after every posted game) and renders
   every page client-side. No build step, no framework. */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $("#app");
  let D = null;
  let lastUpdated = 0;
  const state = { sort: {}, rankView: "standings", week: null };

  // ------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n == null || n === "" ? "–" : Number.isInteger(+n) ? String(+n) : (+n).toFixed(1));
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
  const weekNum = (w) => parseInt(String(w || "").replace(/\D/g, ""), 10) || 0;
  const ARW = `<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  const BACK = `<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`;
  const tab = (k) => D.tabs.find((t) => t.key === k);
  const teamBy = (name) => (name ? D.teams.find((t) => t.name === name) || D.teams.find((t) => t.name.toLowerCase() === String(name).toLowerCase()) : null);
  const teamHref = (name) => { const t = teamBy(name); return t ? `/team/${t.id}` : null; };
  const playerHref = (key) => `/player/${encodeURIComponent(key)}`;
  const gameHref = (id) => `/game/${id}`;
  const recOf = (t) => (t ? `${t.w}-${t.l}${t.t ? "-" + t.t : ""}` : "");
  const ago = (ts) => {
    const s = Math.max(1, Math.round(Date.now() / 1000 - ts));
    if (s < 60) return "just now";
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24); return `${d} day${d > 1 ? "s" : ""} ago`;
  };
  const lum = (hex) => { const n = parseInt(String(hex || "#1a40c4").slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  function abbr(name) {
    const w = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
    if (!w.length) return "?";
    return (w.length > 1 ? w.map((x) => x[0]).join("") : w[0].slice(0, 3)).slice(0, 3).toUpperCase();
  }
  function mark(name, size = "") {
    if (!name) return `<span class="mark none ${size}">–</span>`;
    const t = teamBy(name);
    const c = (t && t.color) || "#1a40c4";
    if (t && t.logo) return `<span class="mark logo ${size}" title="${esc(name)}"><img src="${esc(t.logo)}" alt="${esc(name)}" loading="lazy"></span>`;
    const ab = (t && t.abbr) || abbr(name);
    const inner = t && t.emoji_url ? `<img src="${esc(t.emoji_url)}" alt="" loading="lazy">` : esc(ab);
    return `<span class="mark ${size} ${lum(c) > 0.62 ? "light" : ""} ${ab.length > 3 ? "a4" : ""}" style="--tc:${c}" title="${esc(name)}">${inner}</span>`;
  }
  function hs(key, name, size = "") {
    const p = D.players[key];
    const url = p && p.avatar;
    const ini = esc(String(name || (p && p.name) || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase());
    return `<span class="hs ${size}">${url ? `<img src="${esc(url)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${ini}'">` : ini}</span>`;
  }
  const teamLink = (name) => { const h = teamHref(name); return h ? `<a href="${h}" data-link>${esc(name)}</a>` : esc(name || ""); };
  const empty = (title, text) => `<div class="card empty"><b>${esc(title)}</b>${esc(text)}</div>`;
  const page = (html) => `<div class="page">${html}</div>`;
  const heroAttr = (color) => `class="hero${lum(color) > 0.62 ? " light" : ""}" style="--tc:${color || "#1a40c4"}"`;
  const scored = (g) => g && g.home && g.away && g.hs != null && g.as != null;
  const diffCls = (d) => (d > 0 ? "up" : d < 0 ? "down" : "");
  const diffTxt = (d) => (d > 0 ? "+" : "") + d;
  const confRec = (t) => `${t.cw}-${t.cl}${t.ct ? "-" + t.ct : ""}`;
  const teamById = (id) => D.teams.find((t) => t.id === id);
  const confTeams = (c) => c.teams.map(teamById).filter(Boolean);
  const form = (s) => `<span class="form">${[...(s || "")].map((c) => `<i class="${c}">${c}</i>`).join("")}</span>`;

  // ------------------------------------------------------------ data
  async function load(first) {
    try {
      const r = await fetch(`/data/league.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      const changed = data.league.updated !== lastUpdated;
      D = data;
      if (first || changed) {
        if (!first) toast("New stats posted");
        lastUpdated = data.league.updated;
        chrome();
        render(!first);
      }
    } catch (e) {
      if (first) app.innerHTML = page(empty("Stats unavailable", "Couldn't load the stats right now. Refresh in a moment."));
    }
  }

  function chrome() {
    const L = D.league;
    const ss = $("#sideSeason"); if (ss) ss.textContent = L.season;
    const fin = D.games.slice(0, 16);
    const strip = $("#strip");
    if (fin.length) {
      strip.innerHTML = `<div class="strip-inner">
        <div class="strip-label"><span>Score</span><span>board</span></div>
        <div class="strip-track" id="stripTrack">${fin.map((g) => {
          const ok = scored(g), hw = ok && g.hs > g.as, aw = ok && g.as > g.hs;
          return `<a class="sg" href="${gameHref(g.id)}" data-link>
            <div class="st"><span>Final</span><span>${esc(g.week)}</span></div>
            ${ok ? `<div class="tr ${hw ? "w" : ""}">${mark(g.home, "sm")}<span class="nm">${esc(g.home)}</span><span class="sc">${g.hs}</span></div>
            <div class="tr ${aw ? "w" : ""}">${mark(g.away, "sm")}<span class="nm">${esc(g.away)}</span><span class="sc">${g.as}</span></div>`
            : `<div class="tr w"><span class="nm">Game #${g.id}</span></div><div class="tr"><span class="nm">${g.potg ? "POTG " + esc(g.potg.player) : "Box score"}</span></div>`}
          </a>`;
        }).join("")}</div>
        <button class="strip-btn rp" id="stripNext" aria-label="More scores">${ARW}</button></div>`;
      $("#stripNext").addEventListener("click", () => { const t = $("#stripTrack"); t.scrollBy({ left: t.clientWidth * 0.8 }); });
    } else {
      strip.innerHTML = `<div class="strip-inner"><div class="strip-label"><span>Score</span><span>board</span></div><div class="strip-empty">★ ${esc(L.name)} Season ${L.season} · first kickoff coming soon ★</div></div>`;
    }
    if (L.discord) {
      $("#discordBtn").hidden = false;
      $("#ftDiscord").hidden = false;
      $("#joinGo").href = L.discord;
    }
    $("#updated").textContent = `Stats update automatically after every game. Last update ${ago(L.updated)}.`;
    if (L.demo && !$(".demo-flag")) document.body.insertAdjacentHTML("beforeend", `<div class="demo-flag">DEMO DATA</div>`);
  }

  // ------------------------------------------------------------ shared blocks
  function gameCard(g) {
    const ok = scored(g);
    const row = (name, sc, win, lose) => `<div class="gc-row ${win ? "w" : ""} ${lose ? "l" : ""}">${mark(name)}<span class="nm">${esc(name)}<span class="rec">${esc(recOf(teamBy(name)))}</span></span><span class="sc">${sc}</span><span class="tri"></span></div>`;
    return `<a class="card hov gc rp" href="${gameHref(g.id)}" data-link>
      <div class="gc-top"><span class="fin">Final</span><span>${esc(g.week)}</span></div>
      ${ok ? row(g.home, g.hs, g.hs > g.as, g.hs < g.as) + row(g.away, g.as, g.as > g.hs, g.as < g.hs)
        : `<div class="gc-row w">${mark("")}<span class="nm">Game #${g.id}</span></div><div class="gc-row l">${mark("")}<span class="nm">Teams not entered</span></div>`}
      <div class="gc-foot"><span class="potg">${g.potg ? `POTG <b>${esc(g.potg.player)}</b> · ${fmt(g.potg.pts)} PTS` : ""}</span><span class="go">Box score ${ARW}</span></div>
    </a>`;
  }

  function leaderCard(t, rows) {
    const top = rows[0];
    return `<div class="card lcard">
      <div class="lcard-head"><h3>${esc(t.label)}<span>${t.pos}</span></h3><a class="go" href="/stats/${t.key.toLowerCase()}" data-link>Full list ${ARW}</a></div>
      ${top ? `<a class="lcard-top" href="${playerHref(top.key)}" data-link>${hs(top.key, top.player, "md")}
          <span class="who"><b>${esc(top.player)}</b><small>${esc(top.team || "Free agent")} · ${top.gp} GP</small></span>
          <span class="v">${fmt(top.pts)}<small>PTS</small></span></a>
        ${rows.slice(1, 5).map((r, i) => `<a class="lrow" href="${playerHref(r.key)}" data-link><span class="n">${i + 2}</span>${hs(r.key, r.player, "sm")}<span class="nm">${esc(r.player)}</span><span class="v">${fmt(r.pts)}</span></a>`).join("")}`
        : `<div class="empty-mini">No ${esc(t.label.toLowerCase())} stats yet.</div>`}
    </div>`;
  }

  function standingsTable(teams, compact) {
    if (!teams.length) return `<div class="empty"><b>No standings yet</b>Teams show up here once they are set up or play a game.</div>`;
    return `<div class="tablewrap"><table>
      <thead><tr><th class="l" style="width:44px">#</th><th class="l">Team</th>${compact ? "" : "<th class=\"l\">Conf</th>"}<th>W</th><th>L</th>${compact ? "" : "<th>T</th><th>PF</th><th>PA</th>"}<th>Diff</th>${compact ? "" : "<th>Strk</th>"}<th>Last 5</th></tr></thead>
      <tbody>${teams.map((t, i) => `<tr class="link" data-href="/team/${t.id}">
        <td class="rk">${i + 1}</td>
        <td class="l"><span class="pl">${mark(t.name)}<span class="nm">${esc(t.name)}</span></span></td>
        ${compact ? "" : `<td class="l dim">${esc(t.conf || "–")}</td>`}<td class="key">${t.w}</td><td>${t.l}</td>${compact ? "" : `<td class="dim">${t.t}</td><td>${t.pf}</td><td>${t.pa}</td>`}
        <td class="${diffCls(t.diff)}">${diffTxt(t.diff)}</td>
        ${compact ? "" : `<td class="dim">${esc(t.streak)}</td>`}
        <td>${form(t.last5)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function confCard(c, compact) {
    const list = confTeams(c);
    return `<div class="card conf">
      <div class="conf-head"><h3>${esc(c.name)}</h3><span class="sub">${compact ? "W-L · Conf · PD" : `${list.length} teams`}</span></div>
      <div class="tablewrap"><table>
        ${compact ? "" : `<thead><tr><th class="l" style="width:40px">#</th><th class="l">Team</th><th>W-L</th><th>Conf</th><th>PF</th><th>PA</th><th>PD</th><th class="c-strk">Strk</th><th>Last 5</th></tr></thead>`}
        <tbody>${list.map((t, i) => `<tr class="link" data-href="/team/${t.id}">
          <td class="rk">${i + 1}</td>
          <td class="l"><span class="pl">${mark(t.name)}<span class="nm">${esc(t.name)}</span></span></td>
          <td class="key">${recOf(t)}</td><td class="dim">${confRec(t)}</td>
          ${compact ? "" : `<td>${t.pf}</td><td>${t.pa}</td>`}
          <td class="${diffCls(t.diff)}">${diffTxt(t.diff)}</td>
          ${compact ? "" : `<td class="dim c-strk">${esc(t.streak)}</td><td>${form(t.last5)}</td>`}</tr>`).join("")}
        </tbody></table></div></div>`;
  }

  function mvpTable(rows, full) {
    if (!rows.length) return `<div class="empty"><b>No points yet</b>The Heisman race starts with the first posted game.</div>`;
    return `<div class="tablewrap"><table>
      <thead><tr><th class="l" style="width:44px">#</th><th class="l">Player</th>${full ? `<th class="l">Points from</th><th>GP</th>` : ""}<th>PTS</th></tr></thead>
      <tbody>${rows.map((e, i) => `<tr class="link" data-href="${playerHref(e.key)}">
        <td class="rk">${i + 1}</td>
        <td class="l"><span class="pl">${hs(e.key, e.player)}<span><span class="nm">${esc(e.player)}</span><br><span class="tm">${esc(e.team || "Free agent")}</span></span></span></td>
        ${full ? `<td class="l dim">${Object.entries(e.tabs).map(([c, v]) => `${esc(tab(c)?.label || c)} ${fmt(v)}`).join(" · ")}</td><td class="dim">${e.gp}</td>` : ""}
        <td class="key">${fmt(e.pts)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  // ------------------------------------------------------------ pages
  // stadium scoreboard digits: each character in its own lit panel
  const digits = (n) => `<span class="digits">${String(n ?? "").split("").map((c) => `<i>${esc(c)}</i>`).join("")}</span>`;

  function homePage() {
    const L = D.league, s = String(L.season);
    const games = D.games.filter((g) => g.season === L.season);
    const latest = games.find(scored);
    const played = D.teams.filter((t) => t.gp);
    const board = D.leaders[s] || {};
    const confs = (D.conferences || []).map((c) => ({ name: c.name, teams: confTeams(c) }));

    // ---- gameday hero
    let hero;
    if (latest) {
      const side = (name, sc, win) => `<a class="gd-team ${win ? "win" : ""}" href="${teamHref(name) || gameHref(latest.id)}" data-link>
          <span class="gd-logo">${mark(name, "lg")}</span>
          <span class="gd-name">${esc(name)}</span><span class="gd-rec">${esc(recOf(teamBy(name)))}${win ? " · <b>Winner</b>" : ""}</span>
          ${digits(sc)}</a>`;
      const p = latest.potg;
      hero = `<section class="gameday">
        <div class="gd-top"><span class="gd-pill">★ Final</span><span>${esc(latest.week)}</span><span class="gd-dot"></span><span>Season ${latest.season}</span></div>
        <div class="gd-board">${side(latest.away, latest.as, latest.as > latest.hs)}
          <div class="gd-vs"><b>@</b></div>
          ${side(latest.home, latest.hs, latest.hs > latest.as)}</div>
        <div class="gd-foot">
          <p>${esc(latest.recap || "")}</p>
          ${p ? `<a class="gd-potg" href="${playerHref(p.key)}" data-link>${hs(p.key, p.player)}<span><small>Player of the game</small><b>${esc(p.player)}</b></span><em>${fmt(p.pts)}</em></a>` : ""}
          <a class="gd-btn rp" href="${gameHref(latest.id)}" data-link>Box score ${ARW}</a>
        </div></section>`;
    } else {
      hero = `<section class="gameday pre">
        <div class="gd-top"><span class="gd-pill">★ Season ${L.season}</span><span>Week 1 kicks off soon</span></div>
        <h1 class="gd-title">The road to the<br><em>${esc(L.name)} title</em> starts here</h1>
        <p class="gd-dek">${D.teams.length} programs. ${confs.length} conferences. Every final lands here with a full box score about a minute after the refs post it.</p>
        <div class="gd-logos">${confs.flatMap((c) => c.teams).map((t, i) => `<a class="gd-chip" href="/team/${t.id}" data-link style="--i:${i}" title="${esc(t.name)}">${mark(t.name, "md")}</a>`).join("")}</div>
        <div class="gd-actions"><a class="gd-btn rp" href="/scores" data-link>See the schedule ${ARW}</a>${L.discord ? `<a class="gd-btn ghost rp" href="#join" id="koJoin">Join the league</a>` : ""}</div>
      </section>`;
    }

    // ---- stat leaders as trading cards
    const cards = `<section><div class="sh"><h2>Stat leaders</h2><a class="go" href="/stats/qb" data-link>All stats ${ARW}</a></div>
      <div class="tcards">${D.tabs.map((t, i) => {
        const r = (board[t.key] || [])[0];
        if (!r) return `<div class="tcard6 empty" style="--i:${i}"><span class="tc6-pos">${t.pos}</span><span class="tc6-q">?</span><span class="tc6-name">Open spot</span><span class="tc6-team">${esc(t.label)} leader</span><span class="tc6-pts">–<small>PTS</small></span></div>`;
        const tm = teamBy(r.team);
        return `<a class="tcard6" href="${playerHref(r.key)}" data-link style="--tc:${(tm && tm.color) || "#1a40c4"};--i:${i}">
          <span class="tc6-pos">${t.pos}</span><span class="tc6-shine"></span>
          ${hs(r.key, r.player, "lg")}
          <span class="tc6-name">${esc(r.player)}</span>
          <span class="tc6-team">${r.team ? mark(r.team, "sm") : ""}<span>${esc(r.team || "Free agent")}</span></span>
          <span class="tc6-pts">${fmt(r.pts)}<small>PTS · ${esc(t.label)}</small></span></a>`;
      }).join("")}</div></section>`;

    // ---- results ledger
    const recent = games.slice(0, 7);
    const ledger = recent.length ? `<div class="card ledger">${recent.map((g) => {
        if (!scored(g)) return `<a class="lg-row rp" href="${gameHref(g.id)}" data-link><span class="lg-wk">${esc(g.week || "")}</span><span class="lg-t a">Game #${g.id}</span><span class="lg-sc"></span><span class="lg-t h">${g.potg ? "POTG " + esc(g.potg.player) : ""}</span></a>`;
        const aw = g.as > g.hs, hw = g.hs > g.as;
        return `<a class="lg-row rp" href="${gameHref(g.id)}" data-link><span class="lg-wk">${esc((g.week || "").replace(/week\s*/i, "WK "))}</span>
          <span class="lg-t a ${aw ? "w" : ""}"><span class="nm">${esc(g.away)}</span>${mark(g.away, "sm")}</span>
          <span class="lg-sc"><b class="${aw ? "w" : ""}">${g.as}</b><i>–</i><b class="${hw ? "w" : ""}">${g.hs}</b></span>
          <span class="lg-t h ${hw ? "w" : ""}">${mark(g.home, "sm")}<span class="nm">${esc(g.home)}</span></span></a>`;
      }).join("")}</div>`
      : `<div class="card ledger"><div class="lg-empty"><b>No finals yet</b>Results appear here the moment a ref posts a game.</div></div>`;

    // ---- conference race (pennants)
    const race = `<div class="race">${confs.map((c) => `<div class="race-conf"><div class="pennant"><span>${esc(c.name)}</span></div>
        ${c.teams.map((t, i) => `<a class="race-row" href="/team/${t.id}" data-link><span class="n">${i + 1}</span>${mark(t.name, "sm")}<span class="nm">${esc(t.name)}</span><span class="rec">${recOf(t)}</span></a>`).join("")}
      </div>`).join("")}</div>`;

    // ---- Heisman podium
    const mv = D.mvp[s] || [];
    const step = (e, place) => e
      ? `<a class="pod p${place}" href="${playerHref(e.key)}" data-link>${hs(e.key, e.player, place === 1 ? "lg" : "md")}<b>${esc(e.player)}</b><small>${esc(e.team || "Free agent")}</small><span class="pod-block"><i>${place}</i><em>${fmt(e.pts)} PTS</em></span></a>`
      : `<div class="pod p${place} ghost"><span class="hs ${place === 1 ? "lg" : "md"}">?</span><b>TBD</b><small>Up for grabs</small><span class="pod-block"><i>${place}</i><em>0 PTS</em></span></div>`;
    const podium = `<div class="card podium-card"><div class="podium">${step(mv[1], 2)}${step(mv[0], 1)}${step(mv[2], 3)}</div>
      ${mv.slice(3, 6).map((e, i) => `<a class="rail-row" href="${playerHref(e.key)}" data-link><span class="pos">${i + 4}</span>${hs(e.key, e.player)}<span class="who"><b>${esc(e.player)}</b><small>${esc(e.team || "Free agent")}</small></span><span class="v">${fmt(e.pts)}<small>PTS</small></span></a>`).join("")}</div>`;

    // ---- top-6 poll
    const pollList = played.length ? [...played].sort((a, b) => (a.prank || 99) - (b.prank || 99)).slice(0, 6) : confs.flatMap((c) => c.teams).slice(0, 6);
    const poll = `<div class="card poll">${pollList.map((t, i) => `<a class="poll-row" href="/team/${t.id}" data-link style="--tc:${t.color || "#1a40c4"}">
        <span class="poll-n">${i + 1}</span>${mark(t.name, "md")}
        <span class="who"><b>${esc(t.name)}</b><small>${played.length ? recOf(t) + " · " : ""}${esc(t.conf || "")}</small></span>
        ${t.move > 0 ? `<span class="up">▲ ${t.move}</span>` : t.move < 0 ? `<span class="down">▼ ${-t.move}</span>` : `<span class="dim">–</span>`}</a>`).join("")}</div>`;

    return page(`
      ${hero}
      ${cards}
      <div class="duo">
        <section><div class="sh"><h2>Results</h2><a class="go" href="/scores" data-link>All scores ${ARW}</a></div>${ledger}</section>
        <section><div class="sh"><h2>Conference race</h2><a class="go" href="/standings" data-link>Standings ${ARW}</a></div>${race}</section>
      </div>
      <div class="duo">
        <section><div class="sh"><h2>Heisman watch</h2><a class="go" href="/heisman" data-link>Full race ${ARW}</a></div>${podium}</section>
        <section><div class="sh"><h2>${played.length ? "The Top 6" : "Preseason poll"}</h2><a class="go" href="/standings?view=power" data-link>Power rankings ${ARW}</a></div>${poll}</section>
      </div>
      ${games.length ? "" : howScores()}`);
  }

  function statsPage(key) {
    const t = tab(String(key).toUpperCase()) || D.tabs[0];
    const params = new URLSearchParams(location.search);
    const ask = params.get("season");
    const season = ask === "all" || D.league.seasons.map(String).includes(ask) ? ask : String(D.league.season);
    const rows = ((D.leaders[season] || {})[t.key] || []).map((r, i) => ({ ...r, rank: i + 1 }));
    const q = season !== String(D.league.season) ? `?season=${season}` : "";
    setTimeout(() => {
      const draw = () => drawStatTable(t, rows, ($("#statSearch")?.value || "").toLowerCase());
      draw();
      $("#statSearch")?.addEventListener("input", draw);
      $("#seasonSel")?.addEventListener("change", (e) => nav(`/stats/${t.key.toLowerCase()}${e.target.value !== String(D.league.season) ? `?season=${e.target.value}` : ""}`));
    });
    return page(`
      <div class="pagehead"><div><div class="kick">${season === "all" ? "All time" : `Season ${esc(season)}`}</div><h1>Stat leaders</h1></div>
        <div class="controls">
          <select class="select" id="seasonSel" aria-label="Season">${D.league.seasons.map((s) => `<option value="${s}" ${String(s) === season ? "selected" : ""}>Season ${s}</option>`).join("")}<option value="all" ${season === "all" ? "selected" : ""}>All time</option></select>
          <input class="input" id="statSearch" placeholder="Filter players or teams" aria-label="Filter players or teams">
        </div></div>
      <div>
        <div class="card" style="overflow:hidden">
          <nav class="utabs" role="tablist" style="padding:0 8px">${D.tabs.map((x) => `<a class="${x.key === t.key ? "is-on" : ""}" role="tab" href="/stats/${x.key.toLowerCase()}${q}" data-link>${esc(x.label)}<span class="pos">${x.pos}</span></a>`).join("")}<span class="bar"></span></nav>
          <div class="tablewrap" id="statTable"></div>
        </div>
        <p class="note"><b>PTS</b> · ${esc(t.guide)}. <a href="/points" data-link>How PTS work</a></p>
      </div>`);
  }

  const numVal = (v) => { const n = parseFloat(String(v ?? "").replace("%", "")); return isNaN(n) ? -Infinity : n; };

  function drawStatTable(t, rows, q) {
    const el = $("#statTable");
    if (!el) return;
    const st = state.sort[t.key] || { col: "pts", dir: -1 };
    let list = rows.filter((r) => !q || r.player.toLowerCase().includes(q) || (r.team || "").toLowerCase().includes(q));
    const val = (r) => st.col === "pts" ? r.pts : st.col === "gp" ? r.gp : st.col === "player" ? r.player.toLowerCase() : numVal(r.cols[st.col]);
    list = [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir || a.rank - b.rank; });
    if (!rows.length) { el.innerHTML = `<div class="empty"><b>No ${esc(t.label.toLowerCase())} stats yet</b>They appear here automatically after a game is posted.</div>`; return; }
    const on = (c) => st.col === c;
    const th = (col, label, cls = "") => `<th class="sortable ${cls} ${on(col) ? "sorted" : ""} ${on(col) && st.dir === 1 ? "asc" : ""}" data-col="${col}">${label}<span class="ar">▼</span></th>`;
    const tdc = (col, v, cls = "") => `<td class="${cls} ${on(col) ? "sorted-col" : ""}">${v}</td>`;
    el.innerHTML = `<table>
      <thead><tr><th class="l stk1" style="width:44px">#</th>${th("player", "Player", "l stk2")}${th("pts", "PTS")}${t.cols.map((c, i) => th(i, esc(c))).join("")}${th("gp", "GP")}</tr></thead>
      <tbody>${list.map((r) => `<tr class="link" data-href="${playerHref(r.key)}">
        <td class="rk stk1">${r.rank}</td>
        <td class="l stk2"><span class="pl">${hs(r.key, r.player)}<span><span class="nm">${esc(r.player)}</span><br><span class="tm">${r.team ? esc(r.team) : "Free agent"}</span></span></span></td>
        ${tdc("pts", fmt(r.pts), "key")}
        ${r.cols.map((v, i) => tdc(i, esc(v))).join("")}${tdc("gp", r.gp, "dim")}</tr>`).join("")}
        ${list.length ? "" : `<tr><td colspan="${t.cols.length + 4}" class="l dim">No one matches “${esc(q)}”.</td></tr>`}
      </tbody></table>`;
    $$("th.sortable", el).forEach((h) => h.addEventListener("click", () => {
      const col = isNaN(+h.dataset.col) ? h.dataset.col : +h.dataset.col;
      const cur = state.sort[t.key] || { col: "pts", dir: -1 };
      state.sort[t.key] = { col, dir: cur.col === col ? -cur.dir : col === "player" ? 1 : -1 };
      drawStatTable(t, rows, ($("#statSearch")?.value || "").toLowerCase());
    }));
  }

  // ---------- standings
  function powerTable(list, compact) {
    if (!list.length) return `<div class="empty"><b>No rankings yet</b>Power rankings start after the first scored game.</div>`;
    return `<div class="tablewrap"><table>
      <thead><tr><th class="l" style="width:44px">#</th><th class="l">Team</th><th>Record</th>${compact ? "" : "<th class=\"l\">Conf</th><th>Diff</th><th>Last 5</th>"}<th>Move</th><th>Power</th></tr></thead>
      <tbody>${list.map((t, i) => `<tr class="link" data-href="/team/${t.id}"><td class="rk">${i + 1}</td>
        <td class="l"><span class="pl">${mark(t.name)}<span class="nm">${esc(t.name)}</span></span></td>
        <td>${recOf(t)}</td>${compact ? "" : `<td class="l dim">${esc(t.conf || "–")}</td><td class="${diffCls(t.diff)}">${diffTxt(t.diff)}</td><td>${form(t.last5)}</td>`}
        <td>${t.move > 0 ? `<span class="up">▲ ${t.move}</span>` : t.move < 0 ? `<span class="down">▼ ${-t.move}</span>` : `<span class="dim">–</span>`}</td>
        <td class="key">${fmt(t.power)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function standingsPage() {
    const qv = new URLSearchParams(location.search).get("view");
    if (qv && !state.viewSet) { state.rankView = qv; state.viewSet = true; }
    const view = ["conf", "league", "power"].includes(state.rankView) ? state.rankView : "conf";
    const teams = D.teams.filter((t) => t.gp);
    let body, note;
    if (view === "conf" && (D.conferences || []).length) {
      body = `<div class="confgrid two">${D.conferences.map((c) => confCard(c, false)).join("")}</div>`;
      note = "W-L is the overall record, Conf is the record against the same conference, PD is point differential. Ranked by win percentage, then conference record, then PD.";
    } else if (view === "power") {
      body = `<div class="card">${powerTable([...teams].sort((a, b) => (a.prank || 99) - (b.prank || 99)), false)}</div>`;
      note = "Power = 60% win rate, 25% average margin, 15% last three games. Move is the change since last week.";
    } else {
      body = `<div class="card">${standingsTable(D.teams, false)}</div>`;
      note = "Whole league, ranked by win percentage, then point differential, then points scored.";
    }
    setTimeout(() => $$("#rankSeg button").forEach((b) => b.addEventListener("click", () => { state.rankView = b.dataset.v; state.viewSet = true; render(true); })));
    const title = { conf: "Standings", league: "League table", power: "Power rankings" }[view];
    return page(`
      <div class="pagehead"><div><div class="kick">Season ${D.league.season}</div><h1>${title}</h1></div>
        <div class="seg" id="rankSeg">${[["conf", "Conferences"], ["league", "League"], ["power", "Power"]].map(([v, l]) => `<button class="rp ${view === v ? "is-on" : ""}" data-v="${v}">${l}</button>`).join("")}</div></div>
      <div>${body}<p class="note">${note}</p></div>`);
  }

  // ---------- scores
  function scoresPage() {
    const s = D.league.season;
    const weeks = (D.schedule || []);
    const played = (w) => w.matchups.some((m) => m.hs != null && m.as != null);
    const pick = weeks.find((w) => w.week === state.week)
      || [...weeks].reverse().find(played) || weeks[0];
    const anyFinal = weeks.some(played);
    return page(`
      <div class="pagehead"><div><div class="kick">Season ${s}</div><h1>Scores</h1></div></div>
      ${anyFinal ? "" : kickoff(false)}
      ${weeks.length ? `<section>
          <nav class="utabs">${weeks.map((w) => `<button class="${w === pick ? "is-on" : ""}" data-week="${esc(w.week)}">${esc(w.week)}</button>`).join("")}<span class="bar"></span></nav>
          <div class="sh" style="margin-top:18px"><h2>The field</h2><span class="sub">${esc(pick.week)} · ${pick.matchups.length} game${pick.matchups.length !== 1 ? "s" : ""}</span></div>
          ${fieldMatchups(pick)}
        </section>`
        : `<section><div class="sh"><h2>The field</h2><span class="sub">Matchups and final scores appear here once the schedule is posted</span></div>
          ${fieldTeams()}</section>`}
      ${anyFinal ? "" : howScores()}`);
  }

  // the four conference columns, listing each matchup (and its final once played)
  function fieldMatchups(w) {
    const confOf = (name) => (teamBy(name) || {}).conf || "";
    const cols = (D.conferences || []).map((c) => ({ name: c.name, games: [] }));
    const other = { name: "Other", games: [] };
    for (const m of w.matchups) (cols.find((c) => c.name === confOf(m.home)) || other).games.push(m);
    if (other.games.length) cols.push(other);
    const side = (name, sc, win, lose) => `<div class="mu-team ${win ? "w" : ""} ${lose ? "l" : ""}">${mark(name)}<span class="nm">${esc(name)}</span><span class="sc">${sc ?? ""}</span></div>`;
    const card = (c, m) => {
      const done = m.hs != null && m.as != null;
      const hw = done && m.hs > m.as, aw = done && m.as > m.hs;
      const xc = confOf(m.away) && confOf(m.away) !== c.name ? `<span class="mu-tag">vs ${esc(confOf(m.away))}</span>` : "";
      const body = `${side(m.away, done ? m.as : null, aw, done && !aw && hw)}${side(m.home, done ? m.hs : null, hw, done && !hw && aw)}
        <div class="mu-foot">${done ? `<span class="fin">Final</span>` : `<span class="up">Upcoming</span>`}${xc}${m.game_id ? `<span class="go">Box score ${ARW}</span>` : ""}</div>`;
      return m.game_id ? `<a class="mu rp" href="${gameHref(m.game_id)}" data-link>${body}</a>` : `<div class="mu">${body}</div>`;
    };
    return `<div class="field">${cols.map((c) => `<div class="card field-conf">
        <div class="conf-head"><h3>${esc(c.name)}</h3><span class="sub">${c.games.length} game${c.games.length !== 1 ? "s" : ""}</span></div>
        ${c.games.length ? c.games.map((m) => card(c, m)).join("") : `<div class="empty-mini">No ${esc(c.name)} home games this week.</div>`}
      </div>`).join("")}</div>`;
  }

  // before the schedule exists: just the teams, by conference (no records)
  function fieldTeams() {
    const confs = (D.conferences || []).map((c) => ({ name: c.name, teams: confTeams(c) }));
    return `<div class="field">${confs.map((c) => `<div class="card field-conf">
        <div class="conf-head"><h3>${esc(c.name)}</h3><span class="sub">${c.teams.length} teams</span></div>
        ${c.teams.map((t) => `<a class="field-team rp" href="/team/${t.id}" data-link>${mark(t.name, "md")}<span class="nm">${esc(t.name)}</span></a>`).join("")}
      </div>`).join("")}</div>`;
  }

  function howScores() {
    return `<section><div class="sh"><h2>How scores get here</h2></div>
        <div class="steps3">
          <div class="card step"><span class="n">1</span><b>Final whistle</b><p>The game ends in Roblox and the ref screenshots each stats tab.</p></div>
          <div class="card step"><span class="n">2</span><b>Ref posts it</b><p>One <code>/stats</code> in Discord with the teams, score, week and screenshots.</p></div>
          <div class="card step"><span class="n">3</span><b>Live on the site</b><p>About a minute later: score, box score, standings, leaders and the Heisman race.</p></div>
        </div></section>`;
  }

  function kickoff(full) {
    const L = D.league;
    const confs = (D.conferences || []).map((c) => ({ name: c.name, teams: confTeams(c) }));
    const banner = `<section class="kickoff">
        <div class="ko-text">
          <div class="ko-kick"><span class="ko-dot"></span>Season ${L.season} · Week 1</div>
          <h2>Kickoff is coming</h2>
          <p>Every final lands here with a full box score about a minute after the refs post it. No refreshing needed.</p>
          <div class="ko-actions">
            <a class="ko-btn rp" href="/standings" data-link>See the standings ${ARW}</a>
            ${L.discord ? `<a class="ko-btn ghost rp" href="#join" id="koJoin">Join the league</a>` : ""}
          </div>
        </div>
        <div class="ko-art" aria-hidden="true">
          ${confs.flatMap((c) => c.teams).slice(0, 16).map((t, i) => `<span class="ko-logo" style="--i:${i}">${mark(t.name, "md")}</span>`).join("")}
        </div>
      </section>`;
    return full ? banner + `<section><div class="sh"><h2>The field</h2></div>${fieldTeams()}</section>` + howScores() : banner;
  }

  // ---------- box score
  function gamePage(id) {
    const g = D.games.find((x) => String(x.id) === String(id));
    if (!g) return notFound();
    const ok = scored(g);
    const side = (name, sc, cls) => `<div class="side ${cls}">${mark(name, "lg")}<div style="min-width:0"><div class="nm">${name ? teamLink(name) : "TBD"}</div><div class="rec">${esc(recOf(teamBy(name)))}</div></div>${ok ? `<div class="sc">${sc}</div>` : ""}</div>`;
    const byTab = D.tabs.map((t) => ({ t, lines: g.lines.filter((l) => l.cat === t.key) })).filter((x) => x.lines.length);
    return page(`
      <div>
        <a class="crumb" href="/scores" data-link>${BACK} Scores</a>
        <div class="card" style="overflow:hidden">
          ${g.home || g.away ? `<div class="board">${side(g.home, g.hs, ok && g.hs < g.as ? "l" : "")}<div class="mid"><b>Final</b>${esc(g.week)}</div>${side(g.away, g.as, (ok && g.as < g.hs ? "l " : "") + "r")}</div>`
            : `<div class="lead-top"><div class="kick">Final<span class="sep"></span><span class="grey">${esc(g.week)}</span></div><h1 style="font-family:var(--display);font-size:44px;text-transform:uppercase;margin-top:8px;line-height:1">Game #${g.id}</h1></div>`}
          ${g.recap || g.potg ? `<div class="board-foot">${g.recap ? `<p>${esc(g.recap)}</p>` : "<p></p>"}
            ${g.potg ? `<a class="potg-chip" href="${playerHref(g.potg.key)}" data-link>${hs(g.potg.key, g.potg.player)}<span><small>Player of the game</small><b>${esc(g.potg.player)}</b></span><span class="v">${fmt(g.potg.pts)}</span></a>` : ""}</div>` : ""}
        </div>
      </div>
      ${byTab.length ? byTab.map(({ t, lines }) => `<section><div class="sh"><h2>${esc(t.label)}</h2><span class="sub">${t.pos}</span></div>
        <div class="card"><div class="tablewrap"><table>
          <thead><tr><th class="l">Player</th><th>PTS</th>${t.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${lines.map((l) => `<tr class="link" data-href="${playerHref(l.key)}">
            <td class="l"><span class="pl">${hs(l.key, l.player)}<span><span class="nm">${esc(l.player)}</span><br><span class="tm">${esc(l.team || "–")}</span></span></span></td>
            <td class="key">${fmt(l.pts)}</td>${l.cols.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div></div></section>`).join("") : empty("No player stats", "This game has a score but no stat lines.")}`);
  }

  // ---------- teams
  function teamsPage() {
    const card = (t) => `<a class="card hov tcard" style="--tc:${t.color || "#1a40c4"}" href="/team/${t.id}" data-link>
        ${mark(t.name, "md")}<span class="nm"><b>${esc(t.name)}</b><small>${recOf(t)} · ${confRec(t)} conf · ${diffTxt(t.diff)} PD</small></span></a>`;
    const groups = (D.conferences || []).map((c) => ({ name: c.name, teams: confTeams(c) }));
    const others = D.teams.filter((t) => !t.conf);
    if (others.length) groups.push({ name: "Other teams", teams: others });
    return page(`<div class="pagehead"><div><div class="kick">Season ${D.league.season}</div><h1>Teams</h1></div></div>
      ${groups.length ? groups.map((g) => `<section><div class="sh"><h2>${esc(g.name)}</h2><span class="sub">${g.teams.length} teams</span></div><div class="tgrid">${g.teams.map(card).join("")}</div></section>`).join("")
        : empty("No teams yet", "Teams appear once games are posted with team names.")}`);
  }

  function teamPage(id) {
    const t = D.teams.find((x) => x.id === id);
    if (!t) return notFound();
    const conf = (D.conferences || []).find((c) => c.name === t.conf);
    const crank = conf ? conf.teams.indexOf(t.id) + 1 : 0;
    const sched = [...t.results].reverse();
    const ranks = Object.entries(t.ranks || {});
    return page(`
      <div>
        <a class="crumb" href="/standings" data-link>${BACK} Standings</a>
        <section ${heroAttr(t.color)}>
          ${mark(t.name, "xl")}
          <div><div class="k">${esc(t.conf || D.league.name)}${crank ? ` · ${ord(crank)} in conference` : ""}</div><h1>${esc(t.name)}</h1></div>
          <div class="big">${recOf(t)}<small>Record</small></div>
        </section>
        <div class="statbar" style="margin-top:12px">
          ${t.conf ? `<div><b>${confRec(t)}</b><span>${esc(t.conf)} record</span></div>` : ""}
          <div><b>${t.pf}</b><span>Points for</span></div><div><b>${t.pa}</b><span>Points against</span></div>
          <div><b class="${diffCls(t.diff)}">${diffTxt(t.diff)}</b><span>Differential</span></div>
          <div><b>${esc(t.streak)}</b><span>Streak</span></div>
          ${t.prank ? `<div><b>${ord(t.prank)}</b><span>Power rank</span></div>` : ""}
        </div>
      </div>
      <div class="cols">
        <section><div class="sh"><h2>Schedule &amp; results</h2></div>
          <div class="card">${sched.length ? sched.map((r) => `<a class="sched" href="${gameHref(r.game_id)}" data-link>
            <span class="wk">${esc(r.week || "")}</span>
            <span class="opp"><span class="vs">vs</span>${mark(r.opp, "sm")}<span>${esc(r.opp)}</span></span>
            <span class="res"><i class="${r.res}">${r.res}</i>${r.pf}–${r.pa}</span></a>`).join("") : `<div class="empty-mini">No games yet.</div>`}</div></section>
        <aside class="card">
          ${t.coach ? (() => {
            const c = t.coach, p = D.players[c.key];
            const pic = p ? hs(c.key, c.name, "md") : `<span class="hs md">${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : esc(c.name.slice(0, 2).toUpperCase())}</span>`;
            const inner = `${pic}<span class="who"><small class="coach-tag">Head coach</small><b>${esc(c.name)}</b>${p ? `<small>${fmt(p.pts)} PTS as a player</small>` : ""}</span>`;
            return `<div class="rail-head"><h3>Head coach</h3></div>` + (p ? `<a class="rail-row coach-row" href="${playerHref(c.key)}" data-link>${inner}</a>` : `<div class="rail-row coach-row">${inner}</div>`);
          })() : ""}
          <div class="rail-head"><h3>Team leaders</h3></div>
          ${D.tabs.filter((x) => t.leaders[x.key]).map((x) => { const l = t.leaders[x.key]; return `<a class="rail-row" href="${playerHref(l.key)}" data-link><span class="pos">${x.pos}</span>${hs(l.key, l.player)}<span class="who"><b>${esc(l.player)}</b><small>${esc(l.phrase)}</small></span><span class="v">${fmt(l.pts)}<small>PTS</small></span></a>`; }).join("") || `<div class="empty-mini">No leaders yet.</div>`}
        </aside>
      </div>
      ${ranks.length ? `<section><div class="sh"><h2>Per game</h2><span class="sub">League rank</span></div>
        <div class="statbar">${ranks.map(([k, [v, r]]) => `<div><b>${fmt(v)}</b><span>${esc(k)}</span><em>${ord(r)}</em></div>`).join("")}</div></section>` : ""}
      ${(t.members || []).length ? `<section><div class="sh"><h2>Roster</h2><span class="sub">${t.members.length} on the team · from the Discord team role</span></div>
        <div class="roster-grid">${t.members.map((m) => {
          const p = D.players[m.key];
          const pic = m.avatar ? `<span class="hs md"><img src="${esc(m.avatar)}" alt="" loading="lazy"></span>` : (p ? hs(m.key, m.name, "md") : `<span class="hs md">${esc(m.name.slice(0, 2).toUpperCase())}</span>`);
          const inner = `${pic}<span class="who"><b>${esc(m.name)}</b><small>${m.tag ? `<span class="tag">${esc(m.tag)}</span>` : (p ? `${fmt(p.pts)} PTS · ${p.gp} GP` : "No stats yet")}</small></span>`;
          return p ? `<a class="card hov roster-card" href="${playerHref(m.key)}" data-link>${inner}</a>` : `<div class="card roster-card">${inner}</div>`;
        }).join("")}</div></section>` : ""}
      ${t.roster.length ? `<section><div class="sh"><h2>Player stats</h2><span class="sub">By total PTS</span></div><div class="card"><div class="tablewrap"><table>
        <thead><tr><th class="l" style="width:44px">#</th><th class="l">Player</th><th>GP</th><th>PTS</th></tr></thead>
        <tbody>${t.roster.map((p, i) => `<tr class="link" data-href="${playerHref(p.key)}"><td class="rk">${i + 1}</td>
          <td class="l"><span class="pl">${hs(p.key, p.player)}<span class="nm">${esc(p.player)}</span></span></td><td class="dim">${p.gp}</td><td class="key">${fmt(p.pts)}</td></tr>`).join("")}</tbody></table></div></div></section>` : ""}`);
  }

  // ---------- player
  function playerPage(key) {
    key = decodeURIComponent(key);
    const p = D.players[key];
    if (!p) return notFound();
    const t = teamBy(p.team);
    const s = String(D.league.season);
    const cur = p.totals[s] || {}, all = p.totals.all || {};
    const tabsHere = D.tabs.filter((x) => cur[x.key] || all[x.key]);
    const curPts = Math.round(Object.values(cur).reduce((a, x) => a + x.pts, 0) * 10) / 10;
    return page(`
      <div>
        <a class="crumb" href="/stats/qb" data-link>${BACK} Stat leaders</a>
        <section ${heroAttr(t && t.color)}>
          ${hs(key, p.name, "xl")}
          <div><div class="k">${p.team ? teamLink(p.team) : "Free agent"}${p.role ? ` · <span class="role">${esc(p.role)}</span>` : ""}${tabsHere.length ? " · " + tabsHere.map((x) => x.pos).join(" / ") : ""}</div><h1 class="nocase">${esc(p.name)}</h1></div>
          <div class="big">${fmt(curPts)}<small>Season ${s} PTS</small></div>
        </section>
        <div class="statbar" style="margin-top:12px">
          <div><b>${p.gp}</b><span>Games</span></div>
          ${p.mvp_rank ? `<div><b>${ord(p.mvp_rank)}</b><span>Heisman race</span></div>` : ""}
          ${Object.entries(p.ranks).map(([c, [r, n]]) => `<div><b>${ord(r)}</b><span>${esc(tab(c)?.label || c)}</span><em>of ${n}</em></div>`).join("")}
          <div><b>${fmt(p.pts)}</b><span>Career PTS</span></div>
        </div>
      </div>
      ${tabsHere.map((x) => {
        const rows = [[`Season ${s}`, cur[x.key]], ["Career", all[x.key]]].filter((r) => r[1]);
        return `<section><div class="sh"><h2>${esc(x.label)}</h2><span class="sub">${x.pos}</span></div><div class="card"><div class="tablewrap"><table>
          <thead><tr><th class="l"></th><th>GP</th><th>PTS</th>${x.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${rows.map(([lbl, r]) => `<tr><td class="l"><b>${lbl}</b></td><td class="dim">${r.gp}</td><td class="key">${fmt(r.pts)}</td>${r.cols.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div></div></section>`;
      }).join("")}
      <div class="cols">
        <section><div class="sh"><h2>Game log</h2></div><div class="card"><div class="tablewrap"><table>
          <thead><tr><th class="l">Week</th><th class="l">Opponent</th><th class="l">Line</th><th>PTS</th></tr></thead>
          <tbody>${p.log.map((g) => `<tr class="link" data-href="${gameHref(g.game_id)}">
            <td class="l dim">${esc(g.week)}</td>
            <td class="l">${g.opp ? `<span class="pl">${mark(g.opp, "sm")}<span>${esc(g.opp)}</span>${g.result ? `<span class="res" style="font-size:15px"><i class="${g.result[0]}">${g.result[0]}</i>${esc(g.result.slice(2))}</span>` : ""}</span>` : `Game #${g.game_id}`}</td>
            <td class="l dim" style="white-space:normal;min-width:180px">${g.lines.map((l) => esc(l.phrase)).join(" · ") || "–"}</td>
            <td class="key">${fmt(g.pts)}</td></tr>`).join("")}</tbody></table></div></div></section>
        <aside class="card"><div class="rail-head"><h3>Career highs</h3></div>
          ${p.highs.map((h) => `<div class="rail-row"><span class="who"><b>${esc(h.label)}</b><small>${esc([h.week, h.opp ? "vs " + h.opp : ""].filter(Boolean).join(" · "))}</small></span><span class="v">${esc(h.value)}</span></div>`).join("") || `<div class="empty-mini">No highs yet.</div>`}
        </aside>
      </div>`);
  }

  // ---------- mvp / records / awards / points
  function mvpPage() {
    const s = String(D.league.season);
    return page(`<div class="pagehead"><div><div class="kick">Season ${s}</div><h1>Heisman race</h1></div></div>
      <div><div class="card">${mvpTable(D.mvp[s] || [], true)}</div><p class="note">Total PTS across every position a player has stats at.</p></div>`);
  }

  function recordsPage() {
    const r = D.records;
    const card = (x, season) => `<a class="card hov rcard" href="${playerHref(x.key)}" data-link>
      <span class="lbl">${esc(x.label)}</span><span class="val">${esc(x.value)}</span>
      <span class="by">${hs(x.key, x.player, "sm")}<span>${esc(x.player)}<small>${season ? `Season ${x.season}` : esc([x.week, x.opp ? "vs " + x.opp : "", `Season ${x.season}`].filter(Boolean).join(" · "))}</small></span></span></a>`;
    return page(`<div class="pagehead"><div><div class="kick">All time</div><h1>Record book</h1></div></div>
      <section><div class="sh"><h2>Single game</h2></div>${r.game.length ? `<div class="rgrid">${r.game.map((x) => card(x, false)).join("")}</div>` : empty("No records yet", "Records are set as games are posted.")}</section>
      <section><div class="sh"><h2>Single season</h2></div>${r.season.length ? `<div class="rgrid">${r.season.map((x) => card(x, true)).join("")}</div>` : empty("No records yet", "Season records fill in as the season goes.")}</section>`);
  }

  function awardsPage() {
    return page(`<div class="pagehead"><div><div class="kick">Season ${D.league.season}</div><h1>Weekly awards</h1></div></div>
      ${D.awards.length ? D.awards.map((a) => `<section class="card">
        <div class="week-head"><h3>${esc(a.week)}</h3><span class="muted">Season ${a.season}</span></div>
        <a class="potw" href="${playerHref(a.potw.key)}" data-link>${hs(a.potw.key, a.potw.player, "lg")}<span><small>Player of the week</small><b>${esc(a.potw.player)}</b><span class="muted">${esc(a.potw.team || "Free agent")}</span></span><span class="v">${fmt(a.potw.pts)}</span></a>
        <div class="totw">${D.tabs.filter((t) => a.totw[t.key]).map((t) => { const x = a.totw[t.key]; return `<a href="${playerHref(x.key)}" data-link><span class="pos">${t.pos}</span>${hs(x.key, x.player, "sm")}<span class="nm">${esc(x.player)}</span><span class="v">${fmt(x.pts)}</span></a>`; }).join("")}</div>
      </section>`).join("") : empty("No awards yet", "Player and Team of the Week are picked from each week's games.")}`);
  }

  function pointsPage() {
    return page(`<div class="pagehead"><div><div class="kick">Scoring</div><h1>How PTS work</h1></div></div>
      <p class="muted" style="max-width:70ch;font-size:16px;margin-top:-18px">Every stat line earns ${esc(D.league.name)} points. Big plays (yards, touchdowns, takeaways, clutch downs) carry the score and turnovers cost you. The best players finish a season with a couple hundred PTS.</p>
      <div class="cols-2">${D.tabs.map((t) => `<div class="card guide"><h3>${esc(t.label)}<span>${t.pos}</span></h3><p>${esc(t.guide)}</p></div>`).join("")}</div>`);
  }


  // ---------- rule book (from rulebook/YCFA Rule Book.md, via league.json)
  function md(text) {
    // tiny Markdown: **bold**, "- " lists, "1. " lists, | tables |, paragraphs. Escaped first, so nothing unsafe gets in.
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
      .replace(/^<b>(\d+\.\d+)<\/b>/, '<span class="rule-no">$1</span>');
    const out = []; let list = null, table = null;
    const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; }
      if (table) { const [h, ...rows] = table; out.push(`<table class="rule-table"><thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); table = null; } };
    for (const raw of String(text || "").split("\n")) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (/^\|.*\|$/.test(line)) {
        const cells = line.slice(1, -1).split("|").map((c) => c.trim());
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
        if (list) flush();
        (table = table || []).push(cells); continue;
      }
      let m = line.match(/^[-*] (.+)/), n = line.match(/^\d+\. (.+)/);
      if (m || n) { const tag = m ? "ul" : "ol"; if (table || (list && list.tag !== tag)) flush(); list = list || { tag, items: [] }; list.items.push(inline((m || n)[1])); continue; }
      flush();
      out.push(`<p>${inline(line)}</p>`);
    }
    flush();
    return out.join("");
  }

  function rulesPage() {
    const rb = D.rulebook;
    if (!rb || !rb.articles || !rb.articles.length) return page(empty("No rule book yet", "League staff haven't published the rule book."));
    const slug = (a) => `article-${a.num}`;
    setTimeout(() => {
      const links = $$(".rules-toc a");
      const cards = $$(".rule-art");
      const spy = () => { let on = cards[0]; for (const c of cards) if (c.getBoundingClientRect().top < 160) on = c;
        links.forEach((l) => l.classList.toggle("is-on", l.getAttribute("href") === "#" + on.id)); };
      window.removeEventListener("scroll", window.__ruleSpy || (() => {}));
      window.__ruleSpy = spy; window.addEventListener("scroll", spy, { passive: true }); spy();
      links.forEach((l) => l.addEventListener("click", (e) => { e.preventDefault(); const t = document.getElementById(l.getAttribute("href").slice(1)); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" }); }));
    });
    return page(`
      <div class="pagehead"><div><div class="kick">Season ${D.league.season} · Official</div><h1>Rule book</h1></div></div>
      <p class="rules-intro">${esc(rb.intro || "")}</p>
      <div class="rules">
        <nav class="rules-toc card" aria-label="Articles">
          <div class="rules-toc-head">Articles</div>
          ${rb.articles.map((a) => `<a href="#${slug(a)}"><span class="n">${a.num}</span><span>${esc(a.title)}</span></a>`).join("")}
        </nav>
        <div class="rules-body">
          ${rb.articles.map((a) => `<section class="card rule-art" id="${slug(a)}">
              <header class="rule-head"><span class="rule-num">${a.num}</span><div><small>Article ${a.num}</small><h2>${esc(a.title)}</h2></div></header>
              <div class="rule-text">${md(a.body)}</div></section>`).join("")}
          <p class="note">Cite rules by number, for example “Rule 4.3”. League staff may update the rules; changes are announced in Discord.</p>
        </div>
      </div>`);
  }

  function notFound() {
    return page(`${empty("Page not found", "That page doesn't exist, or its stats haven't been posted yet.")}<p style="text-align:center"><a class="btn rp" href="/" data-link>Back to home</a></p>`);
  }

  // ------------------------------------------------------------ router
  const routes = [
    [/^\/$/, homePage, "home"],
    [/^\/stats\/?$/, () => statsPage("qb"), "stats"],
    [/^\/stats\/([a-z]+)\/?$/, (m) => statsPage(m[1]), "stats"],
    [/^\/(standings|rankings)\/?$/, standingsPage, "standings"],
    [/^\/scores\/?$/, scoresPage, "scores"],
    [/^\/game\/(\d+)\/?$/, (m) => gamePage(m[1]), "scores"],
    [/^\/teams\/?$/, teamsPage, "teams"],
    [/^\/team\/([^/]+)\/?$/, (m) => teamPage(m[1]), "teams"],
    [/^\/player\/([^/]+)\/?$/, (m) => playerPage(m[1]), "stats"],
    [/^\/records\/?$/, recordsPage, "records"],
    [/^\/awards\/?$/, awardsPage, "awards"],
    [/^\/(heisman|mvp)\/?$/, mvpPage, "heisman"],
    [/^\/points\/?$/, pointsPage, "points"],
    [/^\/(rules|rulebook)\/?$/, rulesPage, "rules"],
  ];

  function render(keepScroll) {
    if (!D) return;
    let html = null, section = null;
    for (const [re, fn, sec] of routes) {
      const m = location.pathname.match(re);
      if (m) { html = fn(m); section = sec; break; }
    }
    if (html == null) html = notFound();
    const y = window.scrollY;
    app.innerHTML = html;
    if (keepScroll) window.scrollTo(0, y);
    setNav(section);
    $$(".utabs").forEach(initTabs);
    const h = $(".page h1");
    document.title = h && section !== "home" ? `${h.textContent.trim().replace(/\s+/g, " ")} · ${D.league.name}` : `${D.league.name} · Scores, standings and stats`;
  }

  function nav(href) {
    if (href === location.pathname + location.search) return;
    history.pushState({}, "", href);
    closeOverlays();
    render(false);
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", (e) => {
    const wk = e.target.closest("[data-week]");
    if (wk) { state.week = wk.dataset.week; render(true); return; }
    const a = e.target.closest("a[data-link]");
    if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
      const href = a.getAttribute("href");
      if (href && href.startsWith("/")) { e.preventDefault(); nav(href); return; }
    }
    const row = e.target.closest("tr[data-href]");
    if (row && !e.target.closest("a")) nav(row.dataset.href);
  });
  window.addEventListener("popstate", () => { closeOverlays(); render(false); });

  // underline tabs: the bar sits under the active tab and follows the pointer
  function placeBar(nav, el) {
    const bar = $(".bar", nav); if (!bar) return;
    if (!el) { bar.style.width = "0px"; return; }
    bar.style.width = el.offsetWidth + "px";
    bar.style.transform = `translateX(${el.offsetLeft}px)`;
  }
  function initTabs(nav) {
    const bar = $(".bar", nav); if (!bar) return;
    const active = () => $(".is-on", nav);
    bar.style.transition = "none"; placeBar(nav, active()); void bar.offsetWidth; bar.style.transition = "";
    nav.addEventListener("mouseover", (e) => { const t = e.target.closest("a, button"); if (t && nav.contains(t)) placeBar(nav, t); });
    nav.addEventListener("mouseleave", () => placeBar(nav, active()));
    const on = active(); if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - 16);
  }
  window.addEventListener("resize", () => $$(".utabs").forEach((n) => placeBar(n, $(".is-on", n))));

  function setNav(section) {
    const dockSec = ["teams", "heisman", "records", "awards", "points", "rules"].includes(section) ? "more" : section;
    $$(".mainnav a").forEach((el) => el.classList.toggle("is-on", el.dataset.nav === section));
    $$(".dock [data-nav]").forEach((el) => el.classList.toggle("is-on", el.dataset.nav === dockSec));
  }

  // ------------------------------------------------------------ overlays
  const sheet = $("#moreSheet"), moreBtn = $("#moreBtn");
  moreBtn.addEventListener("click", () => { const open = sheet.hidden; closeOverlays(); sheet.hidden = !open; moreBtn.setAttribute("aria-expanded", String(open)); });
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeOverlays(); });

  const search = $("#search"), sIn = $("#searchInput"), sRes = $("#searchResults");
  let sIdx = 0;
  function openSearch() { closeOverlays(); search.hidden = false; sIn.value = ""; sIdx = 0; drawSearch(); setTimeout(() => sIn.focus(), 30); }
  function drawSearch() {
    if (!D) return;
    const q = sIn.value.trim().toLowerCase();
    const teams = D.teams.filter((t) => !q || t.name.toLowerCase().includes(q)).slice(0, 5).map((t) => ({ href: `/team/${t.id}`, html: `${mark(t.name)}<span class="nm">${esc(t.name)}</span><small>${recOf(t)}</small>` }));
    const players = Object.entries(D.players).filter(([, p]) => !q || p.name.toLowerCase().includes(q)).sort((a, b) => b[1].pts - a[1].pts).slice(0, 8)
      .map(([k, p]) => ({ href: playerHref(k), html: `${hs(k, p.name)}<span class="nm">${esc(p.name)}</span><small>${esc(p.team || "Free agent")} · ${fmt(p.pts)} PTS</small>` }));
    const total = teams.length + players.length;
    sIdx = Math.min(sIdx, Math.max(0, total - 1));
    let i = -1;
    const item = (r) => { i++; return `<a class="sr ${i === sIdx ? "is-on" : ""}" href="${r.href}" data-link>${r.html}</a>`; };
    sRes.innerHTML = total ? `${teams.length ? `<div class="sr-group">Teams</div>${teams.map(item).join("")}` : ""}${players.length ? `<div class="sr-group">Players</div>${players.map(item).join("")}` : ""}` : `<div class="sr-empty">Nothing matches “${esc(q)}”.</div>`;
  }
  sIn.addEventListener("input", () => { sIdx = 0; drawSearch(); });
  sIn.addEventListener("keydown", (e) => {
    const items = $$(".sr", sRes);
    if (e.key === "ArrowDown") { sIdx = Math.min(items.length - 1, sIdx + 1); drawSearch(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sIdx = Math.max(0, sIdx - 1); drawSearch(); e.preventDefault(); }
    if (e.key === "Enter" && items[sIdx]) nav(items[sIdx].getAttribute("href"));
  });
  search.addEventListener("click", (e) => { if (e.target === search) closeOverlays(); });
  $("#searchBtn").addEventListener("click", openSearch);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlays();
    if ((e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  });
  function closeOverlays() { sheet.hidden = true; search.hidden = true; joinBox.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); }

  // "Join the league" pop-up: steps + the Discord invite
  const joinBox = $("#joinBox");
  function openJoin(e) {
    if (e) e.preventDefault();
    if (!D || !D.league.discord) return;
    closeOverlays();
    joinBox.hidden = false;
    setTimeout(() => $("#joinGo").focus(), 30);
  }
  $("#discordBtn").addEventListener("click", openJoin);
  document.addEventListener("click", (e) => { if (e.target.closest("#koJoin")) openJoin(e); });
  $("#ftDiscord").addEventListener("click", openJoin);
  $("#joinClose").addEventListener("click", closeOverlays);
  joinBox.addEventListener("click", (e) => { if (e.target === joinBox) closeOverlays(); });
  $("#joinCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(D.league.discord); toast("Invite link copied"); }
    catch (err) { toast(D.league.discord); }
  });
  if (location.hash === "#join") setTimeout(() => openJoin(), 400);

  // ------------------------------------------------------------ theme
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("ycfa-theme", next); } catch (e) {}
  });

  // ------------------------------------------------------------ ripple (click feedback)
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.addEventListener("pointerdown", (e) => {
    if (reduce || e.button !== 0) return;
    const el = e.target.closest(".rp, .hov, .tcard6, .race-row, .poll-row, .gd-team, .pod, .rail-row, .lrow, .lcard-top, .sched, .sg, .sr, .lb-team, .potw, .totw a, .utabs a, .utabs button, tr.link");
    if (!el) return;
    const host = el.tagName === "TR" ? e.target.closest("td") : el;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.4;
    const s = document.createElement("span");
    s.className = "ripple";
    s.style.width = s.style.height = size + "px";
    s.style.left = e.clientX - r.left + "px";
    s.style.top = e.clientY - r.top + "px";
    const cs = getComputedStyle(host);
    if (cs.position === "static") host.style.position = "relative";
    if (cs.overflow === "visible") host.style.overflow = "hidden";
    host.appendChild(s);
    setTimeout(() => s.remove(), 600);
  });

  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3000); }

  load(true);
  setInterval(() => { if (!document.hidden) load(false); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
})();
