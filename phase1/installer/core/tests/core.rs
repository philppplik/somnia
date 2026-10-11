use somnia_installer_core::errors::InstallError;
use somnia_installer_core::i18n::*;
use somnia_installer_core::options::*;
use somnia_installer_core::payload::*;
use somnia_installer_core::platform::MockPlatform;
use somnia_installer_core::runner::*;
use somnia_installer_core::state::*;

fn plat() -> MockPlatform { MockPlatform { free: 10_000, writable: true, version: None, running: false, localappdata: "C:\\Users\\a\\AppData\\Local".into() } }

#[test]
fn defaults_are_opt_in_for_autostart_and_assoc() {
    let o = Options::default();
    assert!(!o.launch_at_signin && !o.file_associations);
    assert!(o.auto_update_check && o.start_menu && o.desktop_shortcut);
}
#[test]
fn expands_env_and_validates() {
    let p = plat();
    assert_eq!(expand(&p, DEFAULT_DIR), "C:\\Users\\a\\AppData\\Local\\Somnia");
    assert!(validate(&p, &Options::default(), 100).is_ok());
    let mut o = Options::default(); o.install_dir = " ".into();
    assert_eq!(validate(&p, &o, 1), Err(FieldError::Empty));
    o.install_dir = "relative\\x".into();
    assert_eq!(validate(&p, &o, 1), Err(FieldError::NotAbsolute));
}
#[test]
fn disk_full_and_permission_errors() {
    let mut p = plat(); p.free = 5;
    match validate(&p, &Options::default(), 100) { Err(FieldError::NoSpace { required: 100, free: 5, .. }) => {}, e => panic!("{e:?}") }
    p.free = 1000; p.writable = false;
    assert!(matches!(validate(&p, &Options::default(), 1), Err(FieldError::Unwritable { .. })));
    assert_eq!(InstallError::DiskFull { required: 1, free: 0, drive: "C:".into() }.code(), "SOM-DSK-02");
}
#[test]
fn running_app_blocks_preflight() {
    let mut p = plat(); p.running = true;
    assert_eq!(preflight(&p, &Options::default(), 1), Err(InstallError::AppRunning));
}
#[test]
fn upgrade_keeps_saved_settings() {
    let mut saved = Options::default(); saved.launch_at_signin = true;
    assert_eq!(merge_for_upgrade(Some(saved.clone()), Options::default(), true), saved);
    assert_eq!(merge_for_upgrade(Some(saved), Options::default(), false), Options::default());
}
#[test]
fn state_machine_cancel_rules() {
    let mut m = Machine::new();
    assert!(m.apply(Event::Start) && m.apply(Event::Prepared));
    assert!(m.can_cancel());
    assert!(m.apply(Event::PayloadDone));
    assert!(!m.can_cancel(), "finishing phase is not cancellable");
    assert!(!m.apply(Event::RequestCancel));
    assert!(m.apply(Event::Fail) && m.screen() == Screen::Error);
    assert!(m.apply(Event::RequestCancel) && m.apply(Event::CleanupDone));
    assert_eq!(m.screen(), Screen::Cancelled);
    assert!(m.apply(Event::Resume) && m.screen() == Screen::Welcome);
}
#[test]
fn back_keeps_flow() {
    assert_eq!(back_pre_install(Screen::Options), Some(Screen::Welcome));
    assert_eq!(next_pre_install(Screen::License), Some(Screen::Progress));
}
#[test]
fn payload_hash_and_download_error() {
    let h = hex(&sha2::Digest::finalize(<sha2::Sha256 as sha2::Digest>::new_with_prefix(b"abc")));
    assert!(verify_sha256(b"abc", &h).is_ok());
    assert_eq!(verify_sha256(b"abd", &h), Err(InstallError::CorruptPayload));
    struct Fail; impl Fetcher for Fail { fn fetch(&self, _: &str) -> Result<Vec<u8>, ()> { Err(()) } }
    assert_eq!(obtain(&Source::Download { url: "x".into() }, b"", &Fail), Err(InstallError::Download));
    assert!(obtain(&Source::Embedded, b"z", &Fail).is_ok());
}

#[derive(Default)] struct Rec { calls: Vec<String>, fail_at: Option<&'static str>, cancel_after_unpack: bool, rolled: bool }
impl Rec { fn step(&mut self, n: &'static str) -> Result<(), InstallError> { self.calls.push(n.into()); if self.fail_at == Some(n) { Err(InstallError::Generic { detail: n.into() }) } else { Ok(()) } } }
impl Executor for Rec {
    fn unpack(&mut self, _: &std::path::Path, on: &mut dyn FnMut(u64)) -> Result<(), InstallError> { on(50); on(100); self.step("unpack") }
    fn shortcuts(&mut self, _: &Options) -> Result<(), InstallError> { self.step("shortcuts") }
    fn associations(&mut self, e: &[&str]) -> Result<(), InstallError> { assert_eq!(e, FILE_ASSOC_ALLOWLIST); self.step("assoc") }
    fn app_config(&mut self, o: &Options) -> Result<(), InstallError> { assert!(o.auto_update_check); self.step("updater") }
    fn finish(&mut self, _: &Options) -> Result<(), InstallError> { self.step("finish") }
    fn rollback(&mut self, _: &std::path::Path) { self.rolled = true; }
    fn cancel_requested(&self) -> bool { self.cancel_after_unpack }
}
#[test]
fn run_success_progress_is_monotonic_and_real() {
    let mut ex = Rec::default(); let mut seen = vec![];
    let out = run(&plat(), &mut ex, &Options::default(), 100, &mut |p| seen.push(p));
    assert_eq!(out, Outcome::Success);
    assert_eq!(ex.calls, ["unpack", "shortcuts", "updater", "finish"]); // assoc off by default
    let f: Vec<f32> = seen.iter().filter_map(|p| p.fraction).collect();
    assert!(f.windows(2).all(|w| w[0] <= w[1]));
    assert_eq!(seen[0].fraction, None, "no guessed value before anything is measured");
    assert!(!seen.last().unwrap().cancellable);
}
#[test]
fn run_failure_rolls_back_and_cancel_works() {
    let mut ex = Rec { fail_at: Some("updater"), ..Default::default() };
    assert!(matches!(run(&plat(), &mut ex, &Options::default(), 1, &mut |_| {}), Outcome::Failed(_)));
    assert!(ex.rolled);
    let mut ex = Rec { cancel_after_unpack: true, ..Default::default() };
    assert_eq!(run(&plat(), &mut ex, &Options::default(), 1, &mut |_| {}), Outcome::Cancelled);
    assert!(ex.rolled);
}
#[test]
fn i18n_parity_and_placeholders() {
    let en = table("en");
    for (c, _) in LOCALES.iter() {
        let t = table(c);
        assert_eq!(t.keys().collect::<Vec<_>>(), en.keys().collect::<Vec<_>>(), "{c} keys");
        for (k, v) in &t { assert_eq!(placeholders(v), placeholders(&en[k]), "{c}:{k}"); assert!(!v.trim().is_empty()); }
    }
    assert_eq!(pick("pt-PT"), "pt-BR"); assert_eq!(pick("ja-JP"), "en"); assert_eq!(pick("de-AT"), "de");
    assert_eq!(fmt("A {x} B", &[("x", "1")]), "A 1 B");
}
