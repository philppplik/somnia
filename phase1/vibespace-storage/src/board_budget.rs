//! Device-local board policy, never telemetry or a provider billing guarantee.
use crate::{Store,Result,Error};use serde::{Serialize,Deserialize};use rusqlite::{params,OptionalExtension};
#[derive(Clone,Debug,Default,Serialize,Deserialize)]#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct BoardBudget{pub enabled:bool,pub reported_token_stop:u64}
impl BoardBudget{pub fn validate(&self)->Result<()>{if self.reported_token_stop==0||self.reported_token_stop>1_000_000_000{return Err(Error::InvalidInput("invalid reported usage threshold".into()));}Ok(())}}
impl Store{
 pub fn board_budget(&self,space_id:&str)->Result<BoardBudget>{self.read(|c|{let value:Option<(bool,i64)>=c.query_row("SELECT enabled,reported_token_stop FROM board_budgets WHERE space_id=?1",[space_id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;Ok(value.map(|(enabled,n)|BoardBudget{enabled,reported_token_stop:n as u64}).unwrap_or(BoardBudget{enabled:false,reported_token_stop:100000}))})}
 pub fn save_board_budget(&self,space_id:&str,budget:&BoardBudget)->Result<()>{budget.validate()?;self.write(|tx|{tx.execute("INSERT INTO board_budgets(space_id,enabled,reported_token_stop) VALUES(?1,?2,?3) ON CONFLICT(space_id) DO UPDATE SET enabled=excluded.enabled,reported_token_stop=excluded.reported_token_stop",params![space_id,budget.enabled,budget.reported_token_stop as i64])?;Ok(())})}
 pub fn board_reported_tokens(&self,space_id:&str)->Result<u64>{self.read(|c|{let mut statement=c.prepare("SELECT e.payload_json FROM run_events e JOIN runs r ON r.id=e.run_id WHERE r.space_id=?1 AND e.kind='agent.usage'")?;let rows=statement.query_map([space_id],|r|r.get::<_,String>(0))?;let mut total=0u64;for row in rows{let payload:serde_json::Value=serde_json::from_str(&row?).map_err(|_|Error::InvalidInput("invalid reported usage".into()))?;for key in ["inputTokens","outputTokens"]{let n=payload[key].as_u64().ok_or_else(||Error::InvalidInput("unknown reported usage".into()))?;total=total.saturating_add(n);}}Ok(total)})}
}
#[cfg(test)]mod tests{
 use super::*;use crate::*;
 #[test]fn budgets_persist_and_reported_usage_stays_local(){
  let d=tempfile::tempdir().unwrap();let path=d.path().join("db");let store=Store::open(&path,StoreOptions::default()).unwrap();let space=store.create_space(NewSpace::personal("board")).unwrap();assert!(!store.board_budget(&space.id).unwrap().enabled);
  store.save_board_budget(&space.id,&BoardBudget{enabled:true,reported_token_stop:100}).unwrap();assert_eq!(store.board_reported_tokens(&space.id).unwrap(),0);assert!(store.save_board_budget(&space.id,&BoardBudget{enabled:true,reported_token_stop:0}).is_err());drop(store);let store=Store::open(&path,StoreOptions::default()).unwrap();assert!(store.board_budget(&space.id).unwrap().enabled);assert_eq!(store.board_budget(&space.id).unwrap().reported_token_stop,100);
 }
}
