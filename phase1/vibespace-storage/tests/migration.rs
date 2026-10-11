mod common;
use common::*;
use somnia_vibespace_storage::*;

fn v2_ok() -> Vec<Migration> {
    let mut m = MIGRATIONS.to_vec();
    m.push(Migration { version: 2, sql: "ALTER TABLE spaces ADD COLUMN note TEXT;" });
    m
}

fn user_version(path: &std::path::Path) -> i64 {
    let c = rusqlite::Connection::open(path).unwrap();
    c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap()
}

#[test]
fn fresh_db_gets_current_version_and_reopen_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("m.db");
    let s = Store::open(&path, opts_none()).unwrap();
    let id = s.create_space(NewSpace::personal("keep")).unwrap().id;
    drop(s);
    assert_eq!(user_version(&path), SCHEMA_VERSION);
    let s = Store::open(&path, opts_none()).unwrap();
    assert_eq!(s.get_space(&id).unwrap().name, "keep");
}

#[test]
fn upgrade_preserves_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("up.db");
    let s = Store::open(&path, opts_none()).unwrap();
    let id = s.create_space(NewSpace::personal("old")).unwrap().id;
    drop(s);
    let s = Store::open_with_migrations(&path, opts_none(), &v2_ok()).unwrap();
    assert_eq!(s.get_space(&id).unwrap().name, "old");
    assert_eq!(s.capabilities().db_schema_version, 2);
    drop(s);
    assert_eq!(user_version(&path), 2);
}

#[test]
fn failed_migration_rolls_back_completely() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("fail.db");
    let s = Store::open(&path, opts_none()).unwrap();
    let id = s.create_space(NewSpace::personal("safe")).unwrap().id;
    drop(s);
    let mut bad = MIGRATIONS.to_vec();
    bad.push(Migration {
        version: 2,
        sql: "ALTER TABLE spaces ADD COLUMN half_done TEXT; INSERT INTO table_that_does_not_exist VALUES (1);",
    });
    let err = Store::open_with_migrations(&path, opts_none(), &bad).unwrap_err();
    assert!(matches!(err, Error::Migration { version: 2, .. }), "{err}");
    assert_eq!(user_version(&path), 1, "version unchanged");
    let raw = rusqlite::Connection::open(&path).unwrap();
    let cols: Vec<String> = raw
        .prepare("SELECT name FROM pragma_table_info('spaces')")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(!cols.contains(&"half_done".to_string()), "DDL rolled back");
    drop(raw);
    let s = Store::open(&path, opts_none()).unwrap();
    assert_eq!(s.get_space(&id).unwrap().name, "safe");
}

#[test]
fn newer_schema_fails_visibly_without_touching_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("new.db");
    {
        let s = Store::open(&path, opts_none()).unwrap();
        s.create_space(NewSpace::personal("future")).unwrap();
    }
    {
        let raw = rusqlite::Connection::open(&path).unwrap();
        raw.execute_batch("PRAGMA user_version = 99; CREATE TABLE from_the_future (x TEXT); INSERT INTO from_the_future VALUES ('data');").unwrap();
    }
    let before = std::fs::read(&path).unwrap();
    let err = Store::open(&path, opts_none()).unwrap_err();
    assert!(matches!(err, Error::NewerSchema { found: 99, supported: 1 }), "{err}");
    assert_eq!(err.code(), "newer_schema");
    assert_eq!(user_version(&path), 99);
    let raw = rusqlite::Connection::open(&path).unwrap();
    let x: String = raw.query_row("SELECT x FROM from_the_future", [], |r| r.get(0)).unwrap();
    assert_eq!(x, "data");
    let n: i64 = raw.query_row("SELECT count(*) FROM spaces", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1);
    drop(raw);
    // main database file bytes are unchanged (WAL side files may exist)
    let after = std::fs::read(&path).unwrap();
    assert_eq!(before.len(), after.len());
}

#[test]
fn foreign_database_is_rejected_unmodified() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("foreign.db");
    {
        let raw = rusqlite::Connection::open(&path).unwrap();
        raw.execute_batch("CREATE TABLE notes (t TEXT); INSERT INTO notes VALUES ('mine');").unwrap();
    }
    let err = Store::open(&path, opts_none()).unwrap_err();
    assert!(matches!(err, Error::ForeignDatabase));
    let raw = rusqlite::Connection::open(&path).unwrap();
    let t: String = raw.query_row("SELECT t FROM notes", [], |r| r.get(0)).unwrap();
    assert_eq!(t, "mine");
    let n: i64 = raw.query_row("SELECT count(*) FROM sqlite_master WHERE name='spaces'", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 0);
}

#[test]
fn non_sqlite_file_fails_visibly() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("garbage.db");
    std::fs::write(&path, "this is definitely not a sqlite database, it is only text. ".repeat(10).as_bytes()).unwrap();
    assert!(Store::open(&path, opts_none()).is_err());
    assert!(std::fs::read(&path).unwrap().starts_with(b"this is definitely"));
}

#[test]
fn non_contiguous_migrations_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gap.db");
    let gap = [Migration { version: 2, sql: "SELECT 1;" }];
    assert!(matches!(Store::open_with_migrations(&path, opts_none(), &gap), Err(Error::Migration { .. })));
}
