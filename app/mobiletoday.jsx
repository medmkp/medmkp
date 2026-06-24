"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { traceApi, traceErrorMessage, formatTraceDate } from "./lib";
import s from "./mobiletoday.module.css";

// Today tab — shows the active/recent scan session (Resume) and a Needs Attention
// summary card so staff sees what needs action before starting work.

export function MobileTodayView({ onResumeSession, onNavigate, onToast }) {
  const [sessions, setSessions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      traceApi.listSessions().catch(() => ({ sessions: [] })),
      traceApi.listLocations().catch(() => ({ locations: [] })),
    ]).then(([sRes, lRes]) => {
      if (cancelled) return;
      setSessions(sRes.sessions || []);
      setLocations(lRes.locations || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === "active") || null,
    [sessions]
  );

  const needsAttnItems = useMemo(
    () => locations.reduce((n, l) => n + (l.needs_attention_count || 0), 0),
    [locations]
  );
  const needsAttnLocs = useMemo(
    () => locations.filter((l) => (l.needs_attention_count || 0) > 0).length,
    [locations]
  );

  const recentSessions = useMemo(
    () => sessions.filter((s) => s.status !== "active").slice(0, 3),
    [sessions]
  );

  if (loading) {
    return <div className={s.loading}><Icon name="icon-loader" className={s.spinner} /></div>;
  }

  return (
    <div className={s.view}>
      <header className={s.header}>
        <h1 className={s.title}>Today</h1>
      </header>

      <div className={s.body}>
        {/* Needs attention card */}
        {needsAttnItems > 0 && (
          <button
            type="button"
            className={s.attnCard}
            onClick={() => onNavigate("needsAttention")}
          >
            <span className={s.attnIcon}><Icon name="icon-alert-triangle" /></span>
            <div className={s.attnBody}>
              <span className={s.attnTitle}>
                {needsAttnItems} item{needsAttnItems !== 1 ? "s" : ""} need attention
              </span>
              <span className={s.attnSub}>
                Across {needsAttnLocs} location{needsAttnLocs !== 1 ? "s" : ""} — expired, expiring, or below par
              </span>
            </div>
            <Icon name="icon-chevron-right" className={s.attnChevron} />
          </button>
        )}

        {/* Active / Resume session */}
        {activeSession && (
          <div className={s.section}>
            <div className={s.sectionLabel}>In progress</div>
            <button
              type="button"
              className={s.resumeCard}
              onClick={() => onResumeSession(activeSession.id)}
            >
              <span className={s.resumeIcon}><Icon name="icon-clock" /></span>
              <div className={s.resumeBody}>
                <span className={s.resumeName}>
                  {activeSession.location_name || "Scan session"}
                </span>
                <span className={s.resumeSub}>
                  {activeSession.counts?.total ?? 0} items scanned · Last updated {formatTraceDate(activeSession.updated_at)}
                </span>
              </div>
              <span className={s.resumeBtn}>Resume</span>
            </button>
          </div>
        )}

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div className={s.section}>
            <div className={s.sectionLabel}>Recent scan sessions</div>
            <div className={s.recentList}>
              {recentSessions.map((sess) => (
                <button
                  key={sess.id}
                  type="button"
                  className={s.recentRow}
                  onClick={() => onResumeSession(sess.id)}
                >
                  <div className={s.recentBody}>
                    <span className={s.recentName}>{sess.location_name || "Scan session"}</span>
                    <span className={s.recentSub}>
                      {sess.counts?.total ?? 0} scanned · {formatTraceDate(sess.updated_at)}
                    </span>
                  </div>
                  <span className={`${s.recentStatus} ${sess.status === "completed" ? s.recentStatusDone : ""}`}>
                    {sess.status === "completed" ? "Completed" : "In progress"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!activeSession && recentSessions.length === 0 && needsAttnItems === 0 && (
          <div className={s.empty}>
            <Icon name="icon-check-circle" className={s.emptyIcon} />
            <p className={s.emptyText}>All clear — no items need attention.</p>
            <p className={s.emptySub}>Tap Scan to start an inventory scan session.</p>
          </div>
        )}
      </div>
    </div>
  );
}
