//! OS drop grants. Renderer-supplied paths never grant filesystem access.
use crate::service::{AppError, Result};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

pub struct DropGrant {
    token: String,
    paths: Vec<PathBuf>,
    created: Instant,
}
impl DropGrant {
    pub fn new(paths: Vec<PathBuf>) -> Self {
        Self {
            token: uuid::Uuid::new_v4().to_string(),
            paths,
            created: Instant::now(),
        }
    }
    pub fn token(&self) -> &str {
        &self.token
    }
    pub fn consume(slot: &mut Option<Self>, token: &str) -> Result<Vec<PathBuf>> {
        let grant = slot
            .as_ref()
            .ok_or_else(|| AppError::Denied("Drop expired. Drop again.".into()))?;
        if grant.token != token || grant.created.elapsed() > Duration::from_secs(120) {
            return Err(AppError::Denied("Drop expired. Drop again.".into()));
        }
        let grant = slot.take().unwrap();
        if grant.paths.is_empty() || grant.paths.len() > 64 {
            return Err(AppError::Limit);
        }
        Ok(grant.paths)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grant_is_exact_once_and_wrong_token_does_not_consume() {
        let mut slot = Some(DropGrant::new(vec![PathBuf::from("/tmp/site")]));
        let token = slot.as_ref().unwrap().token().to_owned();
        assert!(DropGrant::consume(&mut slot, "forged").is_err());
        assert_eq!(
            DropGrant::consume(&mut slot, &token).unwrap(),
            vec![PathBuf::from("/tmp/site")]
        );
        assert!(DropGrant::consume(&mut slot, &token).is_err());
    }
    #[test]
    fn expired_and_oversized_grants_are_refused() {
        let mut grant = DropGrant::new(vec![PathBuf::from("site")]);
        grant.created = Instant::now() - Duration::from_secs(121);
        let token = grant.token().to_owned();
        assert!(DropGrant::consume(&mut Some(grant), &token).is_err());
        let grant = DropGrant::new(vec![PathBuf::from("site"); 65]);
        let token = grant.token().to_owned();
        assert!(DropGrant::consume(&mut Some(grant), &token).is_err());
    }
}
