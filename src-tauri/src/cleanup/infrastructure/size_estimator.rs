use std::fs;
use std::path::{Path, PathBuf};

#[cfg(unix)]
use std::process::Command;

fn walk_path_size_bytes(path: &Path) -> u64 {
    let mut total_size = 0_u64;
    let mut pending_paths = vec![path.to_path_buf()];

    while let Some(current_path) = pending_paths.pop() {
        let Ok(metadata) = fs::symlink_metadata(&current_path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_file() {
            total_size = total_size.saturating_add(metadata.len());
            continue;
        }
        if !metadata.is_dir() {
            continue;
        }

        let Ok(entries) = fs::read_dir(&current_path) else {
            continue;
        };
        entries.for_each(|entry| {
            if let Ok(entry) = entry {
                pending_paths.push(entry.path());
            }
        });
    }

    total_size
}

#[cfg(unix)]
fn parse_du_kilobytes(line: &str) -> Option<u64> {
    line.split_whitespace()
        .next()
        .and_then(|value| value.parse::<u64>().ok())
}

#[cfg(unix)]
fn estimate_path_size_with_du(path: &Path) -> Option<u64> {
    let output = Command::new("du").arg("-sk").arg(path).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    parse_du_kilobytes(stdout.lines().next()?).map(|kilobytes| kilobytes.saturating_mul(1024))
}

#[cfg(unix)]
fn estimate_paths_size_with_du(paths: &[PathBuf]) -> Option<u64> {
    if paths.is_empty() {
        return Some(0);
    }
    let output = Command::new("du")
        .arg("-sk")
        .args(paths.iter().map(|path| path.as_os_str()))
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    Some(
        stdout
            .lines()
            .filter_map(parse_du_kilobytes)
            .fold(0_u64, u64::saturating_add)
            .saturating_mul(1024),
    )
}

pub fn estimate_path_size_bytes(path: &Path) -> u64 {
    #[cfg(unix)]
    {
        if let Some(size) = estimate_path_size_with_du(path) {
            return size;
        }
    }
    walk_path_size_bytes(path)
}

pub fn estimate_paths_size_bytes(paths: &[PathBuf]) -> u64 {
    #[cfg(unix)]
    {
        if let Some(size) = estimate_paths_size_with_du(paths) {
            return size;
        }
    }
    paths.iter().fold(0_u64, |sum, path| {
        sum.saturating_add(walk_path_size_bytes(path))
    })
}
