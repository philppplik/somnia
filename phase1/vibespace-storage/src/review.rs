//! Explicit review-only operations. Terminal runs accept no generic agent events.
use crate::{
    error::{Error, Result},
    limits,
    model::check_version,
    runs::{append_event_tx, get_run_conn},
    store::{check_text, get_studio_conn, new_id},
    NewStudio, ReviewState, Store, Studio,
};
use rusqlite::params;
impl Store {
    /// Successor creation and audit are ONE transaction. Original run and proposal are immutable.
    /// Request identity makes ambiguous retries return the same successor, never another Studio.
    pub fn create_review_successor(
        &self,
        run_id: &str,
        expected_epoch: i64,
        request_id: &str,
        review_revision: &str,
        message: &str,
        request: NewStudio,
    ) -> Result<Studio> {
        check_version(request.schema_version)?;
        if uuid::Uuid::parse_str(request_id).is_err() {
            return Err(Error::InvalidInput("requestId must be UUID".into()));
        }
        check_text("change message", message, 2048, false)?;
        check_text("review revision", review_revision, 256, false)?;
        let goal = check_text("goal", &request.goal, 8192, false)?;
        if crate::redact::text_contains_secret(&goal)
            || crate::redact::text_contains_secret(message)
        {
            return Err(Error::InvalidInput(
                "change request contains credential-shaped data".into(),
            ));
        }

        let now = self.now_str();
        self.write(|tx| {
   let mut stmt=tx.prepare("SELECT payload_json FROM run_events WHERE run_id=?1 AND kind='review.changes_requested'")?;
   let payloads=stmt.query_map(params![run_id],|r|r.get::<_,String>(0))?.collect::<rusqlite::Result<Vec<_>>>()?;drop(stmt);
   for payload in payloads {let v:serde_json::Value=serde_json::from_str(&payload).map_err(|_|Error::Conflict("invalid successor audit".into()))?;if v["requestId"]==request_id {if v["message"]!=message || v["revision"]!=review_revision {return Err(Error::Conflict("change request identity conflict".into()));}return get_studio_conn(tx,v["studioId"].as_str().ok_or_else(||Error::Conflict("successor audit incomplete".into()))?);}}
   let run=get_run_conn(tx,run_id)?;let old=get_studio_conn(tx,&run.studio_id)?;
   if !run.execution.is_terminal()||!matches!(run.review,ReviewState::Ready|ReviewState::Conflict)||run.review_revision!=expected_epoch||request.space_id!=old.space_id||request.model!=old.model {return Err(Error::Conflict("review successor scope or revision changed".into()));}
   // Generic agent event cap still holds. No extra migration/table or hidden execution.
   if run.last_sequence>=limits::MAX_EVENTS_PER_RUN {return Err(Error::LimitExceeded("no review audit capacity".into()));}
   let id=new_id();
   tx.execute("INSERT INTO studios (id,space_id,goal,model_provider,model_name,model_locality,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![id,request.space_id,goal,request.model.provider,request.model.model,request.model.locality.as_str(),now])?;
   // Audit payload redaction remains in force.
   append_event_tx(tx,run_id,"review.changes_requested",&serde_json::json!({"requestId":request_id,"revision":review_revision,"message":message,"studioId":id}),&now,false)?;
   get_studio_conn(tx,&id)
  })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::*;
    fn setup() -> (tempfile::TempDir, Store, Run, NewStudio) {
        let d = tempfile::tempdir().unwrap();
        let s = Store::open(d.path().join("s.sqlite"), StoreOptions::default()).unwrap();
        let space = s.create_space(NewSpace::personal("space")).unwrap();
        let ns = NewStudio {
            schema_version: 1,
            space_id: space.id,
            goal: "base".into(),
            model: ModelRef {
                provider: "ollama".into(),
                model: "qwen".into(),
                locality: ModelLocality::Local,
            },
        };
        let st = s.create_studio(ns.clone()).unwrap();
        let r = s
            .start_run(StartRunRequest {
                schema_version: 1,
                studio_id: st.id,
                request_id: new_id(),
                retry_of_run_id: None,
            })
            .unwrap()
            .run;
        s.claim_run(&r.id, "owner", 1000).unwrap();
        s.transition_run(&r.id, TransitionRequest::execution(ExecutionState::Running))
            .unwrap();
        s.transition_run(&r.id, TransitionRequest::execution(ExecutionState::Done))
            .unwrap();
        s.transition_run(&r.id, TransitionRequest::review(ReviewState::Ready))
            .unwrap();
        let r = s.get_run(&r.id).unwrap();
        (d, s, r, ns)
    }
    #[test]
    fn successor_atomic_idempotent_scope_bound_and_terminal_agent_events_still_denied() {
        let (_d, s, r, ns) = setup();
        let req = new_id();
        assert!(s
            .append_event(&r.id, "agent.step", &serde_json::json!({}), None)
            .is_err());
        let st = s
            .create_review_successor(
                &r.id,
                r.review_revision,
                &req,
                "review1",
                "short",
                ns.clone(),
            )
            .unwrap();
        assert_eq!(
            s.create_review_successor(
                &r.id,
                r.review_revision,
                &req,
                "review1",
                "short",
                ns.clone()
            )
            .unwrap()
            .id,
            st.id
        );
        assert!(s
            .create_review_successor(
                &r.id,
                r.review_revision,
                &req,
                "review1",
                "different",
                ns.clone()
            )
            .is_err());
        let count = s.list_studios(&ns.space_id, 500).unwrap().len();
        let mut bad = ns.clone();
        bad.model.model = "other".into();
        assert!(s
            .create_review_successor(&r.id, r.review_revision, &new_id(), "review1", "short", bad)
            .is_err());
        assert_eq!(s.list_studios(&ns.space_id, 500).unwrap().len(), count);
        s.write(|tx| {tx.execute_batch("CREATE TRIGGER fail_review BEFORE INSERT ON run_events WHEN NEW.kind='review.changes_requested' BEGIN SELECT RAISE(ABORT,'injected'); END;")?;Ok(())}).unwrap();
        assert!(s
            .create_review_successor(
                &r.id,
                r.review_revision,
                &new_id(),
                "review1",
                "short",
                ns.clone()
            )
            .is_err());
        assert_eq!(s.list_studios(&ns.space_id, 500).unwrap().len(), count);
    }
}
