"use client";

import { Icon } from "./icons";
import { money } from "./lib";
import s from "./dashboard.module.css";

// The overview surface a practice lands on first: at-a-glance stats, the items
// that need attention, recent activity, and the handful of actions most people
// start their day with. Self-contained — renders standalone off the MOCK below,
// so the parent can drop it in and swap `data` for real practice data later.

const MOCK = {
  practiceName: "Bright Smiles Dental",
  stats: { locations: 7, items: 169, needsAttention: 11, auditReadiness: 86, potentialSavings: 1248.35 },
  needsAttention: [
    { id: 1, name: "Nitrile Exam Gloves, M", location: "Hygiene Cabinet", issue: "Expiring soon" },
    { id: 2, name: "CaviWipes Disinfectant", location: "Sterilization", issue: "Below par" },
    { id: 3, name: "Prophy Angles, Soft", location: "Operatory 1", issue: "Missing lot" },
  ],
  activity: [
    { id: 1, text: "Hygiene Cabinet scan completed — 37 items", time: "2h ago" },
    { id: 2, text: "Operatory 2 — 3 items added", time: "5h ago" },
    { id: 3, text: "SDS linked to CaviWipes Disinfectant", time: "Yesterday" },
  ],
};

// A circular progress ring for the audit-readiness percentage. SVG-only, no deps.
function AuditRing({ pct }) {
  const value = Math.max(0, Math.min(100, pct));
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return (
    <span className={s.ringWrap}>
      <svg className={s.ring} viewBox="0 0 38 38" aria-hidden="true">
        <circle className={s.ringTrack} cx="19" cy="19" r={radius} />
        <circle
          className={s.ringFill}
          cx="19"
          cy="19"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className={s.ringPct}>{value}%</span>
    </span>
  );
}

function Stat({ icon, label, value, alert, ring }) {
  return (
    <div className={`${s.stat} ${alert ? s.alert : ""}`}>
      {ring != null ? (
        <AuditRing pct={ring} />
      ) : (
        <span className={s.statIcon}><Icon name={icon} /></span>
      )}
      <div className={s.statBody}>
        <span className={s.statLabel}>{label}</span>
        <strong className={s.statValue}>{value}</strong>
      </div>
    </div>
  );
}

export function DashboardView({ data = MOCK, onStartScan, onAddLocation, onViewSavings, onViewNeedsAttention }) {
  const { practiceName, stats, needsAttention = [], activity = [] } = data;

  return (
    <div className={s.dash}>
      <header className={s.head}>
        <span className={s.eyebrow}>Overview</span>
        <h1 className={s.title}>Welcome back, {practiceName}</h1>
        <p className={s.subtitle}>Here&rsquo;s where your inventory and compliance stand today.</p>
      </header>

      <div className={s.stats}>
        <Stat icon="icon-map-pin" label="Locations" value={stats.locations} />
        <Stat icon="icon-package" label="Items tracked" value={stats.items} />
        <Stat
          icon="icon-alert-triangle"
          label="Needs attention"
          value={stats.needsAttention}
          alert={stats.needsAttention > 0}
        />
        <Stat label="Audit readiness" value="" ring={stats.auditReadiness} />
        <Stat icon="icon-dollar-circle" label="Potential savings" value={money.format(stats.potentialSavings)} />
      </div>

      <div className={s.grid}>
        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <Icon name="icon-alert-triangle" />
              Needs attention
            </span>
            <button type="button" className={s.viewAll} onClick={() => onViewNeedsAttention?.()}>
              View all
              <Icon name="icon-arrow-right" />
            </button>
          </div>
          {needsAttention.length === 0 ? (
            <p className={s.empty}>Nothing needs attention right now.</p>
          ) : (
            <div className={s.naList}>
              {needsAttention.map((item) => (
                <div className={s.naRow} key={item.id}>
                  <span className={s.naDot}><Icon name="icon-alert-triangle" /></span>
                  <span className={s.naInfo}>
                    <span className={s.naName}>{item.name}</span>
                    <span className={s.naLoc}>{item.location}</span>
                  </span>
                  <span className={s.naIssue}>{item.issue}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <span className={s.cardTitle}>
              <Icon name="icon-clock" />
              Recent activity
            </span>
          </div>
          {activity.length === 0 ? (
            <p className={s.empty}>No recent activity yet.</p>
          ) : (
            <div className={s.feed}>
              {activity.map((event) => (
                <div className={s.feedRow} key={event.id}>
                  <span className={s.feedDot}><Icon name="icon-check-circle" /></span>
                  <span className={s.feedInfo}>
                    <span className={s.feedText}>{event.text}</span>
                    <span className={s.feedTime}>{event.time}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className={s.actions}>
        <button type="button" className={`${s.action} ${s.actionPrimary}`} onClick={() => onStartScan?.()}>
          <Icon name="icon-scan" />
          Start scan
        </button>
        <button type="button" className={s.action} onClick={() => onAddLocation?.()}>
          <Icon name="icon-plus" />
          Add location
        </button>
        <button type="button" className={s.action} onClick={() => onViewSavings?.()}>
          <Icon name="icon-dollar-circle" />
          View savings
        </button>
      </div>
    </div>
  );
}
