// The transparency/governance page: every recorded agent decision and run outcome,
// broken down per model, so "we're getting real win streaks, it's measurable" has an
// actual page to point at instead of living only in a SQLite file nobody but the
// developer can query. Pulls straight from GET /api/agent/stats (server/agent/history.ts's
// getStats()) -- no separate analytics pipeline, the decision_history.db rows already are
// the source of truth.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";

interface BackendModelStats {
  backend: string;
  model: string;
  totalDecisions: number;
  fallbackRate: number;
  disagreesWithMemoryRate: number;
  avgLatencyMs: number;
  outcomeBreakdown: Record<string, number>;
  choicesByDecisionType: Record<string, Record<string, number>>;
  totalRuns: number;
  wins: number;
  losses: number;
  winRate: number;
  fastestWinSeconds: number | null;
  currentStreak: { type: "win" | "loss"; length: number } | null;
  longestWinStreak: number;
  timeline: Array<{ runId: string; won: boolean; startedAt: string; seconds: number | null }>;
}

interface StatsResponse {
  totalDecisions: number;
  /** Decisions recorded before the current generation (see history.ts's
   * CURRENT_GENERATION) -- excluded from everything above since a fixed outcome-reporting
   * bug and a reworked prompt mean those numbers aren't a fair comparison to today's, but
   * still real history worth showing rather than hiding. */
  legacyDecisions: number;
  byBackendModel: BackendModelStats[];
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return "—";
  return `${seconds.toFixed(1)}s`;
}

function ChoiceBars({ choices }: { choices: Record<string, number> }) {
  const total = Object.values(choices).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;
  const entries = Object.entries(choices).sort((a, b) => b[1] - a[1]);
  return (
    <div className="choice-bars">
      {entries.map(([choice, count]) => (
        <div className="choice-bar-row" key={choice}>
          <span className="choice-bar-label">{choice.replace(/_/g, " ")}</span>
          <div className="choice-bar-track">
            <div className="choice-bar-fill" style={{ width: `${(count / total) * 100}%` }} />
          </div>
          <span className="choice-bar-value">{count} · {formatPercent(count / total)}</span>
        </div>
      ))}
    </div>
  );
}

function Timeline({ timeline }: { timeline: BackendModelStats["timeline"] }) {
  // Most recent run last, matching reading order (oldest to newest, left to right) --
  // only the tail end (the most recent stretch) matters for spotting a hot or cold streak
  // at a glance, so a long history doesn't need to fit on screen at once.
  const recent = timeline.slice(-40);
  return (
    <div className="run-timeline" aria-label={`Last ${recent.length} runs, oldest first`}>
      {recent.map((run) => (
        <span
          key={run.runId}
          className={`run-dot ${run.won ? "run-dot--win" : "run-dot--loss"}`}
          title={`${run.won ? "Win" : "Loss"} · ${new Date(run.startedAt).toLocaleString()}${run.seconds ? ` · ${run.seconds.toFixed(1)}s` : ""}`}
        />
      ))}
    </div>
  );
}

function ModelCard({ stats }: { stats: BackendModelStats }) {
  const isStruggling = stats.totalDecisions > 5 && stats.fallbackRate > 0.5;
  return (
    <article className="model-stats-card">
      <header className="model-stats-header">
        <h2>{stats.model}</h2>
        <span className="model-stats-backend">{stats.backend}</span>
        {stats.currentStreak && stats.currentStreak.length >= 2 && (
          <span className={`streak-chip streak-chip--${stats.currentStreak.type}`}>
            {stats.currentStreak.length}-{stats.currentStreak.type === "win" ? "win" : "loss"} streak
          </span>
        )}
        {isStruggling && (
          <span className="streak-chip streak-chip--warning" title="Over half of this model's calls never got a usable live reply">
            mostly fallback
          </span>
        )}
      </header>

      <div className="model-stats-row">
        <div className="model-stat">
          <b>{stats.wins}-{stats.losses}</b>
          <span>record</span>
        </div>
        <div className="model-stat">
          <b>{stats.totalRuns > 0 ? formatPercent(stats.winRate) : "—"}</b>
          <span>win rate</span>
        </div>
        <div className="model-stat">
          <b>{stats.longestWinStreak}</b>
          <span>best streak</span>
        </div>
        <div className="model-stat">
          <b>{formatSeconds(stats.fastestWinSeconds)}</b>
          <span>fastest win</span>
        </div>
        <div className="model-stat">
          <b>{stats.totalDecisions}</b>
          <span>decisions</span>
        </div>
        <div className="model-stat">
          <b>{formatPercent(stats.fallbackRate)}</b>
          <span>fallback</span>
        </div>
        <div className="model-stat">
          <b>{formatPercent(stats.disagreesWithMemoryRate)}</b>
          <span title="How often the model's own answer diverged sharply from what the data would have picked -- purely observational, its choice always executes as given">disagrees w/ data</span>
        </div>
        <div className="model-stat">
          <b>{Math.round(stats.avgLatencyMs)}ms</b>
          <span>avg latency</span>
        </div>
      </div>

      {stats.timeline.length > 0 && <Timeline timeline={stats.timeline} />}

      <div className="model-choice-columns">
        {stats.choicesByDecisionType.priorityAction && (
          <div>
            <h3>Goal choices</h3>
            <ChoiceBars choices={stats.choicesByDecisionType.priorityAction} />
          </div>
        )}
        {stats.choicesByDecisionType.enemyResponse && (
          <div>
            <h3>Enemy responses</h3>
            <ChoiceBars choices={stats.choicesByDecisionType.enemyResponse} />
          </div>
        )}
      </div>
    </article>
  );
}

export default function StatsPage() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/agent/stats")
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((json: StatsResponse) => {
          if (!cancelled) setData(json);
        })
        .catch((err) => {
          if (!cancelled) setError(String(err));
        });
    };
    load();
    const interval = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const models = data?.byBackendModel.slice().sort((a, b) => b.totalDecisions - a.totalDecisions) ?? [];

  return (
    <div className="stats-page">
      <header className="stats-page-header">
        <button type="button" className="stats-back-button" onClick={() => setLocation("/")}>
          ← BACK TO THE GAME
        </button>
        <h1>Agent Stats</h1>
        <p>Every recorded decision and run, straight from the same database the agents actually learn from.</p>
        {data && <p className="stats-total">{data.totalDecisions.toLocaleString()} decisions recorded across {models.length} model{models.length === 1 ? "" : "s"}.</p>}
        {data && data.legacyDecisions > 0 && (
          <p className="stats-legacy-note" title="A fixed outcome-reporting bug and a reworked priorityAction prompt mean older decisions aren't a fair comparison to today's -- they're kept, just kept separate.">
            + {data.legacyDecisions.toLocaleString()} earlier decisions from before the current generation, kept but not counted above.
          </p>
        )}
      </header>

      {error && <p className="stats-error">Couldn't load stats: {error}</p>}
      {!data && !error && <p className="stats-loading">Loading…</p>}

      <div className="model-stats-grid">
        {models.map((stats) => (
          <ModelCard key={`${stats.backend}::${stats.model}`} stats={stats} />
        ))}
      </div>

      {data && models.length === 0 && <p className="stats-loading">No agent runs recorded yet.</p>}
    </div>
  );
}
