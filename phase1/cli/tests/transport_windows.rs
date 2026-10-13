//! Windows named-pipe transport tests (run in the windows-latest CI job).
#![cfg(windows)]

use somnia_cli::protocol::{Capability, Frame, Request, RequestBody, PROTOCOL_VERSION};
use somnia_cli::server::sock;
use somnia_cli::transport;
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

fn hello(id: &str) -> Request {
    Request { protocol: PROTOCOL_VERSION, request_id: id.into(), capability: Capability::Read, body: RequestBody::Hello }
}

fn pipe_path(task: &str) -> std::path::PathBuf {
    transport::socket_path("deadbeefcafe", task).unwrap()
}

#[test]
fn pipe_names_are_user_scoped_sanitized_and_local() {
    let sid = transport::current_user_sid().unwrap();
    let p = pipe_path("t-abc123").to_string_lossy().into_owned();
    assert!(p.starts_with(r"\\.\pipe\somnia-cli-"), "{p}");
    assert!(p.contains(&sid), "pipe name must be scoped to the user's SID: {p}");
    assert!(p.ends_with("-t-abc123"), "{p}");
    assert!(!p.contains('/'), "no path separators in the pipe namespace: {p}");
    // Hostile characters in a task id cannot escape into the pipe namespace.
    let dirty = pipe_path(r#"t-..\evil/name"#).to_string_lossy().into_owned();
    assert!(dirty.ends_with("-t-..__evil_name"), "{dirty}");
}

#[test]
fn sddl_grants_only_the_current_user() {
    let sid = transport::current_user_sid().unwrap();
    let sddl = transport::pipe_sddl().unwrap();
    assert!(sddl.starts_with("D:P"), "protected DACL: {sddl}");
    assert!(sddl.contains(&format!("(A;;GA;;;{sid})")), "only the current user gets access: {sddl}");
    for other in [";;;WD)", ";;;SY)", ";;;BA)", ";;;AN)"] {
        assert!(!sddl.contains(other), "no Everyone/SYSTEM/Administrators/Anonymous ACE: {sddl}");
    }
}

#[test]
fn second_bind_on_the_same_name_fails_closed() {
    let p = pipe_path("t-dupbind");
    let _l1 = transport::bind(&p).unwrap();
    match transport::bind(&p) {
        Ok(_) => panic!("second bind on a squatted/taken pipe name must fail closed"),
        Err(e) => assert!(e.message.contains("cannot create named pipe"), "{e}"),
    }
}

#[test]
fn hello_roundtrip_and_typed_error_over_serve() {
    let dir = tempfile::tempdir().unwrap();
    let sp = pipe_path("t-roundtrip");
    let listener = transport::bind(&sp).unwrap();
    let (cancel, stop) = (Arc::new(AtomicBool::new(false)), Arc::new(AtomicBool::new(false)));
    let server = {
        let (r, c, s) = (dir.path().to_path_buf(), cancel.clone(), stop.clone());
        std::thread::spawn(move || sock::serve(r, listener, c, s))
    };

    // 1. Hello over the real request path (first pipe instance).
    let mut got: Option<Frame> = None;
    sock::request(&sp, &hello("r-1"), &mut |f| {
        got = Some(f);
        false
    })
    .unwrap();
    match got {
        Some(Frame::Hello { protocol, server, .. }) => {
            assert_eq!(protocol, PROTOCOL_VERSION);
            assert!(server.starts_with("somnia-cli/"), "{server}");
        }
        other => panic!("expected Hello, got {other:?}"),
    }

    // 2. A malformed frame gets a typed error, not a hang (second pipe instance).
    let mut s = transport::connect(&sp).unwrap();
    writeln!(s, "{{not json").unwrap();
    s.flush().unwrap();
    let mut line = String::new();
    BufReader::new(&s).read_line(&mut line).unwrap();
    let f: Frame = serde_json::from_str(line.trim()).unwrap();
    assert!(matches!(f, Frame::Error { .. }), "{f:?}");
    drop(s);

    // 3. Stop flag + a wake-up connection (held open so the peer check passes) ends the loop.
    stop.store(true, Ordering::SeqCst);
    let _ = sock::request(&sp, &hello("r-wake"), &mut |_| false);
    server.join().expect("serve loop must exit after stop + wake-up connection");
}

#[test]
fn read_timeout_fires_and_the_pipe_stays_usable() {
    let sp = pipe_path("t-timeout");
    let listener = transport::bind(&sp).unwrap();
    let server = std::thread::spawn(move || {
        let s = listener.accept_same_user().unwrap().expect("own client must pass the same-user check");
        s.set_read_timeout(Some(Duration::from_millis(300))).unwrap();
        let mut buf = [0u8; 64];
        let err = std::io::Read::read(&mut &s, &mut buf).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::TimedOut, "{err}");
        // After a timed-out (cancelled) read the connection must still deliver later data.
        s.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let n = std::io::Read::read(&mut &s, &mut buf).unwrap();
        assert_eq!(&buf[..n], b"ping\n");
        n
    });
    std::thread::sleep(Duration::from_millis(100));
    let mut c = transport::connect(&sp).unwrap();
    std::thread::sleep(Duration::from_millis(600)); // let the server read hit its timeout first
    c.write_all(b"ping\n").unwrap();
    c.flush().unwrap();
    assert_eq!(server.join().unwrap(), 5);
}

#[test]
fn pid_alive_tracks_real_processes() {
    assert!(transport::pid_alive(std::process::id()));
    let mut child = std::process::Command::new("cmd").args(["/c", "exit 0"]).spawn().unwrap();
    let pid = child.id();
    child.wait().unwrap();
    for _ in 0..50 {
        if !transport::pid_alive(pid) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("pid {pid} still reported alive after the process exited");
}
