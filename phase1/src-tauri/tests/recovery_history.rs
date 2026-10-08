use somnia_desktop::service::{AppError, FileState, Project};
use std::{fs, thread, time::Duration};
use tempfile::TempDir;
#[test]
fn safe_restore_archives_disk_target_and_pending_and_never_autosaves() {
 let root=TempDir::new().unwrap(); let recovery=TempDir::new().unwrap();
 let path="Grüße with space.html";
 fs::write(root.path().join(path), "disk\r\n").unwrap();
 let mut p=Project::open(root.path(),recovery.path()).unwrap();
 let disk=p.read(path).unwrap().revision;
 p.stage(path,"target\r\n".into(),1).unwrap();
 let target=p.recovery_history_list().unwrap()[0].clone();
 let result=p.recovery_restore_safe(&target.id,path,2,&disk).unwrap();
 assert_eq!(result.safety_ids.len(),3); assert_eq!(result.content,"target\r\n");
 thread::sleep(Duration::from_millis(1100)); p.tick();
 assert_eq!(fs::read_to_string(root.path().join(path)).unwrap(),"disk\r\n");
 let histories=p.recovery_history_list().unwrap();
 assert!(histories.iter().any(|e| e.kind=="safety" && e.record.content=="disk\r\n"));
 assert!(histories.iter().any(|e| e.kind=="safety" && e.record.content=="target\r\n"));
 assert_eq!(p.save(path,&disk).unwrap().state,FileState::Saved);
 assert_eq!(p.recovery_history_list().unwrap().len(),3);
 drop(p);
 let p=Project::open(root.path(),recovery.path()).unwrap();
 assert_eq!(p.recovery_history_list().unwrap().len(),3);
}
#[test]
fn stale_snapshot_or_disk_revision_cannot_overwrite() {
 let root=TempDir::new().unwrap(); let recovery=TempDir::new().unwrap();
 fs::write(root.path().join("x.html"),"original").unwrap();
 let mut p=Project::open(root.path(),recovery.path()).unwrap();
 let disk=p.read("x.html").unwrap().revision;
 p.stage("x.html","old".into(),1).unwrap();
 let target=p.recovery_history_list().unwrap()[0].clone();
 p.stage("x.html","new".into(),2).unwrap();
 assert!(matches!(p.recovery_restore_safe(&target.id,"x.html",3,&disk),Err(AppError::StaleRevision)));
 let target=p.recovery_history_list().unwrap()[0].clone();
 fs::write(root.path().join("x.html"),"external").unwrap();
 assert!(matches!(p.recovery_restore_safe(&target.id,"x.html",3,&disk),Err(AppError::Conflict)));
 assert_eq!(p.recovery_read("x.html").unwrap().content,"new");
 assert_eq!(p.recovery_history_list().unwrap().len(),1);
}
#[test]
fn paths_and_revision_checks_precede_archiving() {
 let root=TempDir::new().unwrap(); let recovery=TempDir::new().unwrap();
 fs::write(root.path().join("x.html"),"disk").unwrap();
 let mut p=Project::open(root.path(),recovery.path()).unwrap(); let disk=p.read("x.html").unwrap().revision;
 p.stage("x.html","pending".into(),3).unwrap(); let target=p.recovery_history_list().unwrap()[0].clone();
 assert!(p.recovery_restore_safe(&target.id,"../x.html",4,&disk).is_err());
 assert!(matches!(p.recovery_restore_safe(&target.id,"x.html",3,&disk),Err(AppError::StaleRevision)));
 assert_eq!(p.recovery_history_list().unwrap().len(),1);
}
#[test]
fn restored_safety_preserves_a_reopened_journal_without_pending_document() {
 let root=TempDir::new().unwrap(); let recovery=TempDir::new().unwrap();
 fs::write(root.path().join("x.html"),"disk").unwrap();
 let mut p=Project::open(root.path(),recovery.path()).unwrap(); let disk=p.read("x.html").unwrap().revision;
 p.stage("x.html","target".into(),1).unwrap(); let target=p.recovery_history_list().unwrap()[0].clone();
 let result=p.recovery_restore_safe(&target.id,"x.html",2,&disk).unwrap();
 let safety_id=result.safety_ids[0].clone();
 p.stage("x.html","new journal".into(),3).unwrap(); drop(p);
 let mut p=Project::open(root.path(),recovery.path()).unwrap();
 let disk=p.read("x.html").unwrap().revision;
 p.recovery_restore_safe(&safety_id,"x.html",4,&disk).unwrap();
 assert!(p.recovery_history_list().unwrap().iter().any(|e|e.kind=="safety" && e.record.content=="new journal"));
}
