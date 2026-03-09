use thiserror::Error;

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("unknown settings section: {0}")]
    UnknownSettingsSection(String),
}
