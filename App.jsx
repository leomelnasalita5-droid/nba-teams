import { useEffect, useState } from "react";
import { CHAMPIONSHIPS } from "./championships.js";
import { ALL_TIME, RETIRED } from "./history.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const logoUrl = (t) =>
  t.logos?.[0]?.href ||
  `https://a.espncdn.com/i/teamlogos/nba/500/${t.abbreviation.toLowerCase()}.png`;

// Turn an ESPN injury entry into a short "Out for ~2 weeks" style label.
function injuryLabel(i) {
  const status = i.status || "Unknown";
  const ret = i.details?.returnDate;
  if (ret) {
    const days = Math.ceil((new Date(ret) - new Date()) / 86400000);
    const date = new Date(ret).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (days > 0) {
      const span = days >= 14 ? `~${Math.round(days / 7)} weeks` : `${days} day${days > 1 ? "s" : ""}`;
      return `${status} for ${span} (back ~${date})`;
    }
  }
  return status;
}

export default function App() {
  const [teams, setTeams] = useState([]);
  const [injuries, setInjuries] = useState({}); // teamId -> [injury]
  const [records, setRecords] = useState({}); // teamId -> "5-3"
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${BASE}/teams`)
      .then((r) => r.json())
      .then((d) =>
        setTeams(d.sports[0].leagues[0].teams.map((t) => t.team)
          .sort((a, b) => a.displayName.localeCompare(b.displayName)))
      )
      .catch(() => setError("Couldn't load teams."));

    fetch("https://site.api.espn.com/apis/v2/sports/basketball/nba/standings")
      .then((r) => r.json())
      .then((d) => {
        const m = {};
        (d.children || []).forEach((c) =>
          (c.standings?.entries || []).forEach((e) => {
            const st = Object.fromEntries((e.stats || []).map((x) => [x.name, x]));
            m[e.team.id] = st.overall?.displayValue ??
              (st.wins && st.losses ? `${st.wins.value}-${st.losses.value}` : "");
          })
        );
        setRecords(m);
      })
      .catch(() => {});

    fetch(`${BASE}/injuries`)
      .then((r) => r.json())
      .then((d) => {
        const map = {};
        (d.injuries || []).forEach((t) => (map[t.id] = t.injuries || []));
        setInjuries(map);
      })
      .catch(() => {}); // injuries are optional; app still works without them
  }, []);

  const shown = teams.filter((t) =>
    t.displayName.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="app">
      <header>
        <h1>🏀 NBA Teams</h1>
        <input
          placeholder="Search teams…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      {error && <p className="error">{error}</p>}
      {!teams.length && !error && <p className="muted">Loading teams…</p>}
      <div className="grid">
        {shown.map((t) => (
          <button
            key={t.id}
            className="card"
            style={{ "--team": `#${t.color || "444"}` }}
            onClick={() => setSelected(t)}
          >
            <img src={logoUrl(t)} alt={`${t.displayName} logo`} />
            <span>{t.displayName}</span>
            {records[t.id] && <small className="rec">{records[t.id]}</small>}
          </button>
        ))}
      </div>
      {selected && (
        <TeamModal
          team={selected}
          injuries={injuries[selected.id] || []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function TeamModal({ team, injuries, onClose }) {
  const [info, setInfo] = useState(null);
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("main");

  useEffect(() => {
    setInfo(null);
    setRoster(null);
    setError("");
    Promise.all([
      fetch(`${BASE}/teams/${team.id}`).then((r) => r.json()),
      fetch(`${BASE}/teams/${team.id}/roster`).then((r) => r.json()),
    ])
      .then(([t, r]) => {
        setInfo(t.team);
        setRoster(r.athletes || []);
      })
      .catch(() => setError("Couldn't load team details."));
  }, [team.id]);

  const record = info?.record?.items?.find((i) => i.type === "total")?.summary
    ?? info?.record?.items?.[0]?.summary ?? "—";
  const titles = CHAMPIONSHIPS[team.abbreviation] ?? 0;
  const allTime = ALL_TIME[team.abbreviation];
  const retired = (RETIRED[team.abbreviation] || []).map((r) => {
    const i = r.indexOf(" ");
    return { num: r.slice(0, i), who: r.slice(i + 1) };
  });
  const injuredById = Object.fromEntries(injuries.map((i) => [i.athlete?.id, i]));

  if (view === "players") {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" style={{ "--team": `#${team.color || "444"}` }} onClick={(e) => e.stopPropagation()}>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
          <PlayersView team={team} roster={roster} injuredById={injuredById} onBack={() => setView("main")} />
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ "--team": `#${team.color || "444"}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-head">
          <img src={logoUrl(team)} alt={`${team.displayName} logo`} />
          <div>
            <h2>{team.displayName}</h2>
            <p className="muted">{info?.standingSummary || ""}</p>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="stats">
          <div><b>{record}</b><span>This season</span></div>
          <div><b>{titles}</b><span>Championships</span></div>
          <div>
            <b>{allTime ? `${allTime[0].toLocaleString()}-${allTime[1].toLocaleString()}` : "—"}</b>
            <span>All-time record{allTime ? ` (${(allTime[0] / (allTime[0] + allTime[1]) * 100).toFixed(1)}%)` : ""}</span>
          </div>
          <div><b>{roster ? roster.length : "…"}</b><span>Active players</span></div>
        </div>

        {retired.length > 0 && (
          <>
            <h3>Retired jerseys</h3>
            <ul className="retired">
              {retired.map((r) => (
                <li key={r.num + r.who}>
                  <b>{r.num}</b>
                  <span>{r.who}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>Injury report</h3>
        {injuries.length === 0 ? (
          <p className="muted">No injuries reported 🎉</p>
        ) : (
          <ul className="injuries">
            {injuries.map((i) => (
              <li key={i.id}>
                <div className="inj-top">
                  <strong>{i.athlete?.displayName}</strong>
                  <span className={`badge ${/out/i.test(i.status) ? "out" : "dtd"}`}>
                    {injuryLabel(i)}
                  </span>
                </div>
                {i.shortComment && <p className="muted">{i.shortComment}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="sec-head">
          <h3>Players</h3>
          <button className="link" onClick={() => setView("players")}>See all</button>
        </div>
        {!roster && !error && <p className="muted">Loading roster…</p>}
        <RosterList players={roster?.slice(0, 6)} injuredById={injuredById} />
      </div>
    </div>
  );
}

function RosterList({ players, injuredById }) {
  return (
    <ul className="roster">
      {players?.map((p) => (
        <li key={p.id}>
          <img src={p.headshot?.href} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
          <div>
            <strong>{p.displayName}</strong>
            <span>{p.position?.abbreviation}{p.jersey ? ` · #${p.jersey}` : ""}</span>
          </div>
          {injuredById[p.id] && (
            <span className={`badge ${/out/i.test(injuredById[p.id].status) ? "out" : "dtd"}`}>
              {injuredById[p.id].status}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// All-time players come from Wikipedia's free API (team "players" categories).
const cache = {};
async function fetchCategory(cat) {
  let out = [], cont = "";
  for (let i = 0; i < 8; i++) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent("Category:" + cat)}&cmtype=page&cmlimit=500&format=json&origin=*${cont}`;
    const r = await fetch(url).then((x) => x.json());
    out.push(...(r.query?.categorymembers || []).map((m) => m.title));
    if (!r.continue) break;
    cont = "&cmcontinue=" + encodeURIComponent(r.continue.cmcontinue);
  }
  return out;
}
async function allTimePlayers(team) {
  const name = team.displayName.replace(/^LA /, "Los Angeles ");
  if (cache[name]) return cache[name];
  const cats = [`${name} players`];
  if (team.abbreviation === "OKC") cats.push("Seattle SuperSonics players");
  const lists = await Promise.all(cats.map(fetchCategory));
  const names = [...new Set(lists.flat().map((n) => n.replace(/\s*\(.*\)$/, "")))];
  names.sort((a, b) => a.split(" ").slice(-1)[0].localeCompare(b.split(" ").slice(-1)[0]));
  return (cache[name] = names);
}

function PlayersView({ team, roster, injuredById, onBack }) {
  const [tab, setTab] = useState("current");
  const [all, setAll] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (tab === "all" && !all) {
      allTimePlayers(team).then(setAll).catch(() => setErr("Couldn't load all-time players."));
    }
  }, [tab]);

  const shown = (all || []).filter((n) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <button className="link back" onClick={onBack}>← Back to {team.displayName}</button>
      <h2>Players</h2>
      <div className="tabs">
        <button className={tab === "current" ? "on" : ""} onClick={() => setTab("current")}>
          Current ({roster?.length ?? "…"})
        </button>
        <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
          All-time{all ? ` (${all.length})` : ""}
        </button>
      </div>
      {tab === "current" ? (
        <RosterList players={roster} injuredById={injuredById} />
      ) : (
        <>
          <input className="wide" placeholder="Search all-time players…" value={q} onChange={(e) => setQ(e.target.value)} />
          {err && <p className="error">{err}</p>}
          {!all && !err && <p className="muted">Loading all-time players…</p>}
          <ul className="alltime">
            {shown.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </>
      )}
    </>
  );
}
