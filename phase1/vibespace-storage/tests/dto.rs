use serde_json::json;
use somnia_vibespace_storage::*;

#[test]
fn enums_serialize_as_snake_case_like_the_wire_contract() {
    let exec = [
        "pending", "claimed", "running", "paused", "stopped", "done", "failed", "crashed",
    ];
    let got: Vec<&str> = ExecutionState::ALL.iter().map(|s| s.as_str()).collect();
    assert_eq!(got, exec);
    let review: Vec<&str> = ReviewState::ALL.iter().map(|s| s.as_str()).collect();
    assert_eq!(
        review,
        ["none", "ready", "applied", "discarded", "conflict"]
    );
    assert_eq!(serde_json::to_value(ModelLocality::Cloud).unwrap(), "cloud");
}

#[test]
fn requests_use_camel_case_and_reject_unknown_fields() {
    let ok = json!({"spaceId":"s","goal":"g","model":{"provider":"ollama","model":"m","locality":"local"}});
    assert!(serde_json::from_value::<NewStudio>(ok).is_ok());
    let key = json!({"spaceId":"s","goal":"g","model":{"provider":"ollama","model":"m","locality":"local","apiKey":"x"}});
    assert!(serde_json::from_value::<NewStudio>(key).is_err());
    let snake =
        json!({"space_id":"s","goal":"g","model":{"provider":"o","model":"m","locality":"local"}});
    assert!(serde_json::from_value::<NewStudio>(snake).is_err());
    let space = json!({"name":"n","scope":{"kind":"project","folderGrantId":"grant"}});
    let s: NewSpace = serde_json::from_value(space).unwrap();
    assert_eq!(s.schema_version, 1);
    assert!(s.autonomy.is_none());
    let extra = json!({"name":"n","scope":{"kind":"project","folderGrantId":"g","path":"/etc"}});
    assert!(
        serde_json::from_value::<NewSpace>(extra).is_err(),
        "no free path in scope"
    );
    let t = json!({"execution":"done","scope":"/"});
    assert!(serde_json::from_value::<TransitionRequest>(t).is_err());
}

#[test]
fn outputs_carry_schema_version_and_roundtrip() {
    let store = Store::open_in_memory(StoreOptions {
        recovery: Recovery::None,
        ..Default::default()
    })
    .unwrap();
    let space = store.create_space(NewSpace::project("P", "grant")).unwrap();
    let v = serde_json::to_value(&space).unwrap();
    assert_eq!(v["schemaVersion"], 1);
    assert_eq!(v["autonomy"], "ask_for_writes");
    assert_eq!(v["scope"]["folderGrantId"], "grant");
    assert!(v.get("created_at").is_none() && v["createdAt"].is_string());
    let back: Space = serde_json::from_value(v).unwrap();
    assert_eq!(back, space);
    let caps = serde_json::to_value(store.capabilities()).unwrap();
    assert_eq!(caps["vector"]["status"], "opt_in");
    assert_eq!(caps["schemaVersion"], 1);
    let e = Error::NewerSchema {
        found: 5,
        supported: 1,
    }
    .to_dto();
    assert_eq!(serde_json::to_value(e).unwrap()["code"], "newer_schema");
}
