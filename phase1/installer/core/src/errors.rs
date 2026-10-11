use serde::Serialize;

/// User-visible error kinds. Codes follow error-screens-spec (SOM-NET-01, SOM-DSK-02).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InstallError {
    Download,
    DiskFull { required: u64, free: u64, drive: String },
    NoWritePermission { path: String },
    AppRunning,
    CorruptPayload,
    LeftoverFiles { path: String },
    WebView2Missing,
    Generic { detail: String },
}

impl InstallError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Download => "SOM-NET-01",
            Self::DiskFull { .. } => "SOM-DSK-02",
            Self::NoWritePermission { .. } => "SOM-PRM-03",
            Self::AppRunning => "SOM-RUN-04",
            Self::CorruptPayload => "SOM-PAY-05",
            Self::LeftoverFiles { .. } => "SOM-OLD-06",
            Self::WebView2Missing => "SOM-WV2-07",
            Self::Generic { .. } => "SOM-GEN-00",
        }
    }
    /// i18n key of the error title; body key is the same with `.body`.
    pub fn i18n_key(&self) -> &'static str {
        match self {
            Self::Download => "error.download",
            Self::DiskFull { .. } => "error.disk",
            Self::NoWritePermission { .. } => "error.permission",
            Self::AppRunning => "error.running",
            Self::CorruptPayload => "error.corrupt",
            Self::LeftoverFiles { .. } => "error.leftover",
            Self::WebView2Missing => "error.webview2",
            Self::Generic { .. } => "error.generic",
        }
    }
    /// Retry is offered for everything except a damaged installer file.
    pub fn retryable(&self) -> bool {
        !matches!(self, Self::CorruptPayload)
    }
}
