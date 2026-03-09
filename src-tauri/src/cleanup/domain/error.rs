use thiserror::Error;

#[derive(Debug, Error)]
pub enum CleanupError {
    #[error("scan roots are empty; please add roots before planning cleanup")]
    ScanRootsEmpty,
    #[error("cleanup item does not belong to target project")]
    ForeignProjectItem,
    #[error("cleanup plan missing; please refresh plan and retry")]
    MissingCleanupPlanItem,
    #[cfg(not(target_os = "macos"))]
    #[error("system trash is not supported on current platform")]
    SystemTrashUnsupported,
    #[cfg(target_os = "macos")]
    #[error("move to system trash failed: {0}")]
    SystemTrashCommandFailed(String),
}
