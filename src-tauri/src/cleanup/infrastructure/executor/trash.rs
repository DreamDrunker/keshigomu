use std::fs;
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;

use crate::cleanup::domain::error::CleanupError;
use crate::cleanup::domain::types::CleanupResult;

fn safe_name(text: &str) -> String {
    text.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
}

fn resolve_existing_destination(base_dir: &Path, base_name: &str) -> PathBuf {
    let mut index = 0_u32;
    loop {
        let candidate_name = if index == 0 {
            base_name.to_string()
        } else {
            format!("{base_name}-{index}")
        };
        let destination = base_dir.join(candidate_name);
        if !destination.exists() {
            return destination;
        }
        if index == u32::MAX {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or(0);
            return base_dir.join(format!("{base_name}-{stamp}"));
        }
        index = index.saturating_add(1);
    }
}

fn copy_path_recursive(source: &Path, destination: &Path) -> CleanupResult<()> {
    let metadata = fs::symlink_metadata(source)
        .with_context(|| format!("read metadata for {}", source.display()))?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::copy(source, destination)
            .with_context(|| format!("copy {} to {}", source.display(), destination.display()))?;
        return Ok(());
    }
    if metadata.is_dir() {
        fs::create_dir_all(destination)
            .with_context(|| format!("create directory {}", destination.display()))?;
        fs::read_dir(source)
            .with_context(|| format!("read directory {}", source.display()))?
            .collect::<Result<Vec<_>, _>>()
            .with_context(|| format!("collect directory entries {}", source.display()))?
            .into_iter()
            .try_for_each(|entry| {
                copy_path_recursive(&entry.path(), &destination.join(entry.file_name()))
            })?;
    }
    Ok(())
}

fn move_path_to_destination(source: &Path, destination: &Path) -> CleanupResult<()> {
    fs::rename(source, destination)
        .with_context(|| format!("move {} to {}", source.display(), destination.display()))
        .or_else(|_| {
            copy_path_recursive(source, destination)?;
            remove_path(source)
        })
}

#[cfg(target_os = "macos")]
#[cfg_attr(test, allow(dead_code))]
fn move_to_system_trash(path: &Path) -> CleanupResult<()> {
    let path_text = path.to_string_lossy().into_owned();
    let output = Command::new("osascript")
        .arg("-e")
        .arg("on run argv")
        .arg("-e")
        .arg("set targetPath to POSIX file (item 1 of argv)")
        .arg("-e")
        .arg("tell application \"Finder\" to delete targetPath")
        .arg("-e")
        .arg("end run")
        .arg(&path_text)
        .output()
        .with_context(|| format!("run osascript for {}", path.display()))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(
        CleanupError::SystemTrashCommandFailed(if stderr.is_empty() { stdout } else { stderr })
            .into(),
    )
}

#[cfg(not(target_os = "macos"))]
fn move_to_system_trash(_path: &Path) -> CleanupResult<()> {
    Err(CleanupError::SystemTrashUnsupported.into())
}

fn move_to_managed_trash(path: &Path, run_id: &str, safe_trash_root: &Path) -> CleanupResult<()> {
    let trash_dir = safe_trash_root.join(run_id);
    fs::create_dir_all(&trash_dir)
        .with_context(|| format!("create managed trash directory {}", trash_dir.display()))?;
    let raw_name = path.file_name().map_or_else(
        || "item".to_string(),
        |name| name.to_string_lossy().into_owned(),
    );
    let destination = resolve_existing_destination(&trash_dir, &safe_name(&raw_name));
    move_path_to_destination(path, &destination)
}

pub(super) fn move_to_safe_trash(
    path: &Path,
    run_id: &str,
    safe_trash_root: &Path,
) -> CleanupResult<()> {
    #[cfg(test)]
    {
        return move_to_managed_trash(path, run_id, safe_trash_root);
    }
    #[cfg(not(test))]
    {
        if move_to_system_trash(path).is_ok() {
            return Ok(());
        }
        move_to_managed_trash(path, run_id, safe_trash_root)
    }
}

pub(super) fn remove_path(path: &Path) -> CleanupResult<()> {
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("read metadata for {}", path.display()))?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        return fs::remove_file(path).with_context(|| format!("remove file {}", path.display()));
    }
    if metadata.is_dir() {
        return fs::remove_dir_all(path)
            .with_context(|| format!("remove directory {}", path.display()));
    }
    Ok(())
}
