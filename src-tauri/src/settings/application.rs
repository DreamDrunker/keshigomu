use serde_json::Value;
use tauri::AppHandle;

use super::store;
use super::types::{AppSettings, SettingsResult};

pub struct SettingsApplication<'a> {
    app: &'a AppHandle,
}

impl<'a> SettingsApplication<'a> {
    pub fn new(app: &'a AppHandle) -> Self {
        Self { app }
    }

    pub fn load(&self) -> SettingsResult<AppSettings> {
        store::load_settings(self.app)
    }

    pub fn save_patch(&self, patch: &Value) -> SettingsResult<AppSettings> {
        store::save_settings_patch(self.app, patch)
    }

    pub fn reset_section(&self, section: String) -> SettingsResult<AppSettings> {
        store::reset_settings_section(self.app, section)
    }
}
