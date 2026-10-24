use chrono::{DateTime, Utc};
use rusqlite::Connection;
use somnia_vibespace_sched::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
fn ms(s: &str) -> i64 {
    DateTime::parse_from_rfc3339(s)
        .unwrap()
        .with_timezone(&Utc)
        .timestamp_millis()
}
struct Owner(AtomicBool);
impl OwnershipPort for Owner {
    fn ensure_owner(&self) -> Result<()> {
        if self.0.load(Ordering::SeqCst) {
            Ok(())
        } else {
            Err(Error::Ownership)
        }
    }
}
fn spec() -> ScheduleSpec {
    ScheduleSpec {
        name: "Daily check".into(),
        studio_id: "studio".into(),
        cron_expr: "* * * * *".into(),
        timezone: "Europe/Berlin".into(),
        misfire_policy: MisfirePolicy::default(),
        consent_level: ConsentLevel::default(),
        auto_apply: false,
    }
}
fn manager(config: Config) -> (tempfile::TempDir, Manager, Arc<Owner>) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v.sqlite");
    let store = somnia_vibespace_storage::Store::open(
        &path,
        somnia_vibespace_storage::StoreOptions::default(),
    )
    .unwrap();
    drop(store);
    let c = Connection::open(&path).unwrap();
    c.execute_batch("INSERT INTO spaces(id,name,scope_kind,created_at,updated_at) VALUES('space','Test','personal','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'); INSERT INTO studios(id,space_id,goal,model_provider,model_name,model_locality,created_at) VALUES('studio','space','Test','fixture','fixture','local','2026-01-01T00:00:00Z');").unwrap();
    drop(c);
    let owner = Arc::new(Owner(AtomicBool::new(true)));
    let m = Manager::open(&path, owner.clone(), config).unwrap();
    (dir, m, owner)
}
#[test]
fn dst_matrix_skips_gaps_and_fires_only_first_fold() {
    for (tz, cron, before, expected) in [
        (
            "Europe/Berlin",
            "30 2 * * *",
            "2026-03-28T23:00:00Z",
            "2026-03-30T00:30:00Z",
        ),
        (
            "Europe/Berlin",
            "30 2 * * *",
            "2026-10-24T23:00:00Z",
            "2026-10-25T00:30:00Z",
        ),
        (
            "Europe/Berlin",
            "30 2 * * *",
            "2026-10-25T00:30:00Z",
            "2026-10-26T01:30:00Z",
        ),
        (
            "Europe/Berlin",
            "30 2 * * *",
            "2026-10-25T01:00:00Z",
            "2026-10-26T01:30:00Z",
        ),
        (
            "America/New_York",
            "30 2 * * *",
            "2026-03-08T05:00:00Z",
            "2026-03-09T06:30:00Z",
        ),
        (
            "America/New_York",
            "30 1 * * *",
            "2026-11-01T04:00:00Z",
            "2026-11-01T05:30:00Z",
        ),
        (
            "America/New_York",
            "30 1 * * *",
            "2026-11-01T05:30:00Z",
            "2026-11-02T06:30:00Z",
        ),
        (
            "America/New_York",
            "30 1 * * *",
            "2026-11-01T06:00:00Z",
            "2026-11-02T06:30:00Z",
        ),
    ] {
        assert_eq!(
            next_occurrence(cron, tz, ms(before)).unwrap(),
            ms(expected),
            "{tz} {before}"
        );
    }
}
#[test]
fn defaults_and_invalid_input_are_safe() {
    let s:ScheduleSpec=serde_json::from_value(serde_json::json!({"name":"Test","studioId":"studio","cronExpr":"0 9 * * 1","timezone":"Europe/Berlin"})).unwrap();
    assert!(!s.auto_apply);
    assert_eq!(s.misfire_policy, MisfirePolicy::Coalesce);
    assert_eq!(s.consent_level, ConsentLevel::AskForWrites);
    let p = preview(&s, ms("2026-10-11T12:00:00Z")).unwrap();
    assert_eq!(p.next_fire_times.len(), 3);
    assert!(p.app_must_be_open);
    let mut s = s;
    s.auto_apply = true;
    assert!(matches!(s.validate(), Err(Error::AutoApplyDenied)));
    s.auto_apply = false;
    s.timezone = "Berlin".into();
    assert!(s.validate().is_err());
    s.timezone = "Europe/Berlin".into();
    s.cron_expr = "* * * * * *".into();
    assert!(s.validate().is_err());
}
#[test]
fn skip_coalesce_capped_catchup_and_live_grace() {
    let slots = [60_000, 120_000, 180_000, 240_000];
    for (policy, expected) in [
        (MisfirePolicy::Skip, vec![240_000]),
        (MisfirePolicy::Coalesce, vec![180_000, 240_000]),
        (
            MisfirePolicy::CatchUp { cap: 2 },
            vec![120_000, 180_000, 240_000],
        ),
    ] {
        let p = plan_misfires(&slots, 240_000, 1000, &policy);
        assert_eq!(p.enqueue, expected);
        assert_eq!(p.missed, 3);
        assert_eq!(p.omitted, 4 - expected.len());
    }
}
#[test]
fn atomic_planning_is_idempotent_and_misfires_visible() {
    let (_dir, mut m, _) = manager(Config {
        grace_ms: 1000,
        ..Config::default()
    });
    let base = ms("2026-10-11T12:00:00Z");
    m.create(spec(), base).unwrap();
    assert_eq!(m.plan(base + 240_000).unwrap(), 2);
    assert_eq!(m.plan(base + 240_000).unwrap(), 0);
    let card = m.return_card(0).unwrap();
    assert_eq!(card.misfires.len(), 1);
    assert_eq!(card.misfires[0].payload["omitted"], 2);
    let last = card.last_seq;
    assert!(m.return_card(last).unwrap().misfires.is_empty());
}
#[test]
fn lease_heartbeat_recovery_fencing_and_parallel_bound() {
    let (_dir, mut m, owner) = manager(Config {
        concurrency: 1,
        lease_ms: 3000,
        grace_ms: 1000,
        ..Config::default()
    });
    let base = ms("2026-10-11T12:00:00Z");
    m.create(spec(), base).unwrap();
    m.plan(base + 240_000).unwrap();
    let now = base + 240_000;
    let old = m.claim("gui", now).unwrap().unwrap();
    assert!(m.claim("cli", now).unwrap().is_none());
    assert_eq!(m.heartbeat_interval_ms(), 1000);
    m.heartbeat(&old, now + 1000).unwrap();
    assert!(m.validate_fence(&old, now + 3500).is_ok());
    assert!(matches!(m.heartbeat(&old, now + 4000), Err(Error::Fenced)));
    assert_eq!(m.recover_expired(now + 4000).unwrap(), 1);
    assert!(matches!(
        m.finish(&old, now + 4001, RunOutcome::Done),
        Err(Error::Fenced)
    ));
    let other = m.claim("gui", now + 4001).unwrap().unwrap();
    m.finish(&other, now + 4002, RunOutcome::Done).unwrap();
    let fresh = m.claim("gui", now + 6000).unwrap().unwrap();
    assert_eq!(old.job_id, fresh.job_id);
    assert!(fresh.fencing_token > old.fencing_token);
    assert!(matches!(
        m.validate_fence(&old, now + 6000),
        Err(Error::Fenced)
    ));
    owner.0.store(false, Ordering::SeqCst);
    assert!(matches!(m.plan(now + 6000), Err(Error::Ownership)));
    assert!(matches!(
        m.heartbeat(&fresh, now + 6001),
        Err(Error::Ownership)
    ));
}
struct Port;
impl RunPort for Port {
    fn start(&self, r: &Dispatch) -> Result<String> {
        assert!(!r.auto_apply_requested);
        Ok(format!("run-{}", r.request_id))
    }
    fn state(&self, _: &str) -> Result<RunOutcome> {
        Ok(RunOutcome::Ready)
    }
    fn stop(&self, _: &str) -> Result<()> {
        Ok(())
    }
}
#[test]
fn runtime_dispatch_return_card_and_auto_apply_default_off() {
    let (_d, mut m, _) = manager(Config::default());
    let base = ms("2026-10-11T12:00:00Z");
    m.create(spec(), base).unwrap();
    m.plan(base + 60_000).unwrap();
    let c = m.claim("gui", base + 60_000).unwrap().unwrap();
    m.dispatch(&c, base + 60_000, &Port).unwrap();
    let mut called = false;
    assert!(matches!(
        m.with_auto_apply(&c, base + 60_001, true, || {
            called = true;
            Ok(())
        }),
        Err(Error::AutoApplyDenied)
    ));
    assert!(!called);
    m.finish(&c, base + 60_002, RunOutcome::Ready).unwrap();
    let card = m.return_card(0).unwrap();
    assert_eq!(card.needs_you.len(), 1);
    assert_eq!(card.needs_you[0].kind, "ready");
}
#[test]
fn retry_exhaustion_and_lookback_are_visible() {
    let (_d, mut m, _) = manager(Config {
        max_attempts: 1,
        ..Config::default()
    });
    let base = ms("2026-10-11T12:00:00Z");
    m.create(spec(), base).unwrap();
    let now = base + 2 * 86_400_000;
    m.plan(now).unwrap();
    let c = m.claim("gui", now).unwrap().unwrap();
    m.recover_expired(now + 30_000).unwrap();
    assert!(m.validate_fence(&c, now + 30_000).is_err());
    let card = m.return_card(0).unwrap();
    assert!(card.misfires.iter().any(|e| e.kind == "lookback_capped"));
    assert!(card.failed.iter().any(|e| e.kind == "failed"));
}
#[test]
fn restart_keeps_schedule_and_events() {
    let (dir, mut m, owner) = manager(Config::default());
    let base = ms("2026-10-11T12:00:00Z");
    let s = m.create(spec(), base).unwrap();
    m.plan(base + 240_000).unwrap();
    drop(m);
    let m = Manager::open(dir.path().join("v.sqlite"), owner, Config::default()).unwrap();
    assert_eq!(m.list().unwrap()[0].id, s.id);
    assert!(!m.return_card(0).unwrap().misfires.is_empty());
}
#[test]
fn ownership_denial_never_creates_a_database() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("absent.sqlite");
    let owner = Arc::new(Owner(AtomicBool::new(false)));
    assert!(matches!(
        Manager::open(&path, owner, Config::default()),
        Err(Error::Ownership)
    ));
    assert!(!path.exists());
}
#[test]
fn claims_are_atomic_across_connections_and_wrong_instance_cannot_finish() {
    let (dir, mut a, owner) = manager(Config {
        concurrency: 1,
        ..Config::default()
    });
    let base = ms("2026-10-11T12:00:00Z");
    a.create(spec(), base).unwrap();
    a.plan(base + 60_000).unwrap();
    let mut b = Manager::open(
        dir.path().join("v.sqlite"),
        owner,
        Config {
            concurrency: 1,
            ..Config::default()
        },
    )
    .unwrap();
    let claim = a.claim("a", base + 60_000).unwrap().unwrap();
    assert!(b.claim("b", base + 60_000).unwrap().is_none());
    let mut fake = claim.clone();
    fake.owner = "b".into();
    assert!(matches!(
        b.finish(&fake, base + 60_001, RunOutcome::Done),
        Err(Error::Fenced)
    ));
    a.finish(&claim, base + 60_001, RunOutcome::Done).unwrap();
}
struct AllowPort;
impl RunPort for AllowPort {
    fn start(&self, r: &Dispatch) -> Result<String> {
        assert!(r.auto_apply_requested);
        Ok(format!("run-{}", r.request_id))
    }
    fn state(&self, _: &str) -> Result<RunOutcome> {
        Ok(RunOutcome::Running)
    }
    fn stop(&self, _: &str) -> Result<()> {
        Ok(())
    }
}
#[test]
fn auto_apply_requires_opt_in_broker_and_live_fence() {
    let (_d, mut m, _) = manager(Config::default());
    let base = ms("2026-10-11T12:00:00Z");
    let mut s = spec();
    s.auto_apply = true;
    s.consent_level = ConsentLevel::AutonomousInScope;
    m.create(s, base).unwrap();
    m.plan(base + 60_000).unwrap();
    let c = m.claim("gui", base + 60_000).unwrap().unwrap();
    m.dispatch(&c, base + 60_000, &AllowPort).unwrap();
    let mut called = false;
    assert!(matches!(
        m.with_auto_apply(&c, base + 60_001, false, || {
            called = true;
            Ok(())
        }),
        Err(Error::AutoApplyDenied)
    ));
    assert!(!called);
    assert!(m
        .with_auto_apply(&c, base + 60_001, true, || Ok(()))
        .is_ok());
    assert!(matches!(
        m.with_auto_apply(&c, base + 60_002, true, || Ok(())),
        Err(Error::Fenced)
    ));
    assert!(matches!(
        m.with_auto_apply(&c, base + 90_000, true, || Ok(())),
        Err(Error::Fenced)
    ));
}
#[test]
fn disabling_schedule_cancels_pending_and_blocks_auto_apply() {
    let (_d, mut m, _) = manager(Config::default());
    let base = ms("2026-10-11T12:00:00Z");
    let s = m.create(spec(), base).unwrap();
    m.plan(base + 60_000).unwrap();
    m.set_enabled(&s.id, false, base + 60_001).unwrap();
    assert!(m.claim("gui", base + 60_002).unwrap().is_none());
    assert!(!m.list().unwrap()[0].enabled);
}
#[test]
fn needs_you_return_card_is_durable_not_chat_and_not_repeated_each_heartbeat() {
    let (_d, mut m, _) = manager(Config::default());
    let base = ms("2026-10-11T12:00:00Z");
    m.create(spec(), base).unwrap();
    m.plan(base + 60_000).unwrap();
    let c = m.claim("gui", base + 60_000).unwrap().unwrap();
    m.dispatch(&c, base + 60_000, &Port).unwrap();
    m.observe_needs_you(&c, base + 60_001).unwrap();
    m.observe_needs_you(&c, base + 60_002).unwrap();
    assert_eq!(m.return_card(0).unwrap().needs_you.len(), 1);
}
#[test]
fn return_card_does_not_report_resolved_consent_as_still_pending() {
    let (_d, mut m, _) = manager(Config::default());
    let base = ms("2026-10-11T12:00:00Z");
    m.create(spec(), base).unwrap();
    m.plan(base + 60_000).unwrap();
    let c = m.claim("gui", base + 60_000).unwrap().unwrap();
    m.dispatch(&c, base + 60_000, &Port).unwrap();
    m.observe_needs_you(&c, base + 60_001).unwrap();
    m.finish(&c, base + 60_002, RunOutcome::Done).unwrap();
    let card = m.return_card(0).unwrap();
    assert!(card.needs_you.is_empty());
    assert_eq!(card.done.len(), 1);
}
#[test]
fn descriptions_are_owned_by_parser() {
    assert_eq!(
        describe("0 9 * * 1", "Europe/Berlin"),
        "Every Monday at 09:00 (Europe/Berlin)"
    );
    assert_eq!(describe("30 8 * * *", "UTC"), "Every day at 08:30 (UTC)");
}
