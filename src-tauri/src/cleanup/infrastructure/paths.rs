use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn resolve_path_from_user_input(path: &str) -> PathBuf {
    let expanded_path = expand_home_path(path.trim());
    if expanded_path.is_absolute() {
        return expanded_path;
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(expanded_path)
}

pub(crate) fn canonicalize_or_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn expand_home_path(path: &str) -> PathBuf {
    let home_dir = std::env::var("HOME").unwrap_or_default();
    if path == "~" {
        return PathBuf::from(home_dir);
    }
    path.strip_prefix("~/").map_or_else(
        || PathBuf::from(path),
        |rest| PathBuf::from(home_dir).join(rest),
    )
}
