//! Host-side intake policy. Network paths are denied before any filesystem access.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IntakePolicy {
    pub allow_unc: bool,
}
