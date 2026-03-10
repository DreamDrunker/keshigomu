use std::borrow::Cow;

use regex::Regex;

use crate::cleanup::domain::types::CleanupRisk;

use super::facts::{first_existing_file, json_string, read_text};
use super::{
    PathHint, ProjectFacts, StackSummary, COMMON_HINT_SEEDS, MODERN_CONFIG_FILES, NEXT_HINT_SEEDS,
    UMI_CONFIG_FILES, VITE_CONFIG_FILES,
};

pub(super) fn infer_path_hints(facts: &ProjectFacts, stack: &StackSummary) -> Vec<PathHint> {
    let mut path_hints = Vec::<PathHint>::new();
    match stack.bundler.as_str() {
        "vite" => add_vite_hints(facts, &mut path_hints),
        "webpack" | "rspack" => add_webpack_family_hints(facts, &stack.bundler, &mut path_hints),
        "umi" => add_umi_hints(facts, &mut path_hints),
        "modern" => add_modern_hints(facts, &mut path_hints),
        "next" => add_hint_seeds(&mut path_hints, NEXT_HINT_SEEDS),
        _ => {}
    }
    add_hint_seeds(&mut path_hints, COMMON_HINT_SEEDS);
    path_hints
}

struct HintSpec<'a> {
    relative_path: Cow<'a, str>,
    label: Cow<'a, str>,
    source: Cow<'a, str>,
    confidence: u8,
    category: Cow<'a, str>,
    risk: CleanupRisk,
    recommended: bool,
}

fn add_vite_hints(facts: &ProjectFacts, hints: &mut Vec<PathHint>) {
    if let Some((config_path, content)) =
        first_existing_file(&facts.project_path, VITE_CONFIG_FILES)
            .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(out_dir) = extract_by_pattern(&content, r#"outDir\s*:\s*["'`]([^"'`]+)["'`]"#) {
            add_hint(
                hints,
                HintSpec {
                    relative_path: out_dir.into(),
                    label: "Vite 构建输出".into(),
                    source: format!("{}:build.outDir", config_path.display()).into(),
                    confidence: 95,
                    category: "build".into(),
                    risk: CleanupRisk::Low,
                    recommended: true,
                },
            );
        }
        if let Some(cache_dir) =
            extract_by_pattern(&content, r#"cacheDir\s*:\s*["'`]([^"'`]+)["'`]"#)
        {
            add_hint(
                hints,
                HintSpec {
                    relative_path: cache_dir.into(),
                    label: "Vite 缓存目录".into(),
                    source: format!("{}:cacheDir", config_path.display()).into(),
                    confidence: 95,
                    category: "cache".into(),
                    risk: CleanupRisk::Low,
                    recommended: true,
                },
            );
        }
    }

    if let Some(out_dir) = facts
        .package_json
        .as_ref()
        .and_then(|value| json_string(value, &["scripts", "build"]))
        .and_then(|script| extract_by_pattern(&script, r#"--outDir(?:=|\s+)([^\s"'`]+)"#))
    {
        add_hint(
            hints,
            HintSpec {
                relative_path: out_dir.into(),
                label: "Vite 构建输出".into(),
                source: "package.json:scripts.build".into(),
                confidence: 80,
                category: "build".into(),
                risk: CleanupRisk::Low,
                recommended: true,
            },
        );
    }

    add_hint(
        hints,
        HintSpec {
            relative_path: "dist".into(),
            label: "Vite 默认构建目录".into(),
            source: "convention:vite-default".into(),
            confidence: 60,
            category: "build".into(),
            risk: CleanupRisk::Low,
            recommended: true,
        },
    );
    add_hint(
        hints,
        HintSpec {
            relative_path: "node_modules/.vite".into(),
            label: "Vite 预构建缓存".into(),
            source: "convention:vite-default".into(),
            confidence: 60,
            category: "cache".into(),
            risk: CleanupRisk::Low,
            recommended: true,
        },
    );
}

fn add_webpack_family_hints(facts: &ProjectFacts, bundler: &str, hints: &mut Vec<PathHint>) {
    let candidate_files = if bundler == "rspack" {
        super::RSPACK_CONFIG_FILES
    } else {
        super::WEBPACK_CONFIG_FILES
    };

    if let Some((config_path, content)) = first_existing_file(&facts.project_path, candidate_files)
        .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(out_dir) = extract_by_pattern(
            &content,
            r#"(?s)output\s*:\s*\{.*?path\s*:\s*path\.resolve\([^,]+,\s*["'`]([^"'`]+)["'`]"#,
        )
        .or_else(|| {
            extract_by_pattern(
                &content,
                r#"(?s)output\s*:\s*\{.*?path\s*:\s*["'`]([^"'`]+)["'`]"#,
            )
        }) {
            add_hint(
                hints,
                HintSpec {
                    relative_path: out_dir.into(),
                    label: "构建输出目录".into(),
                    source: format!("{}:output.path", config_path.display()).into(),
                    confidence: 95,
                    category: "build".into(),
                    risk: CleanupRisk::Low,
                    recommended: true,
                },
            );
        }
        if let Some(cache_dir) = extract_by_pattern(
            &content,
            r#"cacheDirectory\s*:\s*(?:path\.resolve\([^,]+,\s*)?["'`]([^"'`]+)["'`]"#,
        ) {
            add_hint(
                hints,
                HintSpec {
                    relative_path: cache_dir.into(),
                    label: "构建缓存目录".into(),
                    source: format!("{}:cache.cacheDirectory", config_path.display()).into(),
                    confidence: 90,
                    category: "cache".into(),
                    risk: CleanupRisk::Low,
                    recommended: true,
                },
            );
        }
    }

    add_hint(
        hints,
        HintSpec {
            relative_path: "dist".into(),
            label: "默认构建目录".into(),
            source: format!("convention:{bundler}-default").into(),
            confidence: 55,
            category: "build".into(),
            risk: CleanupRisk::Low,
            recommended: true,
        },
    );
    add_hint(
        hints,
        HintSpec {
            relative_path: "node_modules/.cache".into(),
            label: "构建工具缓存".into(),
            source: format!("convention:{bundler}-default").into(),
            confidence: 55,
            category: "cache".into(),
            risk: CleanupRisk::Low,
            recommended: true,
        },
    );
}

fn add_umi_hints(facts: &ProjectFacts, hints: &mut Vec<PathHint>) {
    if let Some((config_path, content)) = first_existing_file(&facts.project_path, UMI_CONFIG_FILES)
        .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(output_path) =
            extract_by_pattern(&content, r#"outputPath\s*:\s*["'`]([^"'`]+)["'`]"#)
                .or_else(|| {
                    extract_by_pattern(
                        &content,
                        r#"outputPath\s*:\s*path\.resolve\([^,]+,\s*["'`]([^"'`]+)["'`]\)"#,
                    )
                })
                .or_else(|| {
                    extract_by_pattern(&content, r#"outputPath\s*:\s*[^,\n]*["'`]([^"'`]+)["'`]"#)
                })
        {
            add_hint(
                hints,
                HintSpec {
                    relative_path: output_path.into(),
                    label: "Umi 构建输出".into(),
                    source: format!("{}:outputPath", config_path.display()).into(),
                    confidence: 95,
                    category: "build".into(),
                    risk: CleanupRisk::Low,
                    recommended: true,
                },
            );
        }
    }

    add_hint(
        hints,
        HintSpec {
            relative_path: "dist".into(),
            label: "Umi 默认构建目录".into(),
            source: "convention:umi-default".into(),
            confidence: 55,
            category: "build".into(),
            risk: CleanupRisk::Low,
            recommended: true,
        },
    );
}

fn add_modern_hints(facts: &ProjectFacts, hints: &mut Vec<PathHint>) {
    if let Some((config_path, content)) =
        first_existing_file(&facts.project_path, MODERN_CONFIG_FILES)
            .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(output_path) = extract_by_pattern(
            &content,
            r#"(?s)distPath\s*:\s*\{.*?root\s*:\s*["'`]([^"'`]+)["'`]"#,
        )
        .or_else(|| {
            extract_by_pattern(
                &content,
                r#"(?s)distPath\s*:\s*\{.*?root\s*:\s*path\.resolve\([^,]+,\s*["'`]([^"'`]+)["'`]\)"#,
            )
        })
        .or_else(|| {
            extract_by_pattern(
                &content,
                r#"(?s)distPath\s*:\s*\{.*?root\s*:\s*[^,\n]*["'`]([^"'`]+)["'`]"#,
            )
        }) {
            add_hint(
                hints,
                HintSpec {
                    relative_path: output_path.into(),
                    label: "Modern.js 构建输出".into(),
                    source: format!("{}:output.distPath.root", config_path.display()).into(),
                    confidence: 95,
                    category: "build".into(),
                    risk: CleanupRisk::Low,
                    recommended: true,
                },
            );
        }
    }

    add_hint(
        hints,
        HintSpec {
            relative_path: "dist".into(),
            label: "Modern.js 默认构建目录".into(),
            source: "convention:modern-default".into(),
            confidence: 55,
            category: "build".into(),
            risk: CleanupRisk::Low,
            recommended: true,
        },
    );
}

fn add_hint_seeds(hints: &mut Vec<PathHint>, seeds: &[super::HintSeed]) {
    seeds
        .iter()
        .copied()
        .map(|seed| HintSpec {
            relative_path: seed.relative_path.into(),
            label: seed.label.into(),
            source: seed.source.into(),
            confidence: seed.confidence,
            category: seed.category.into(),
            risk: seed.risk,
            recommended: seed.recommended,
        })
        .for_each(|spec| add_hint(hints, spec));
}

fn add_hint(hints: &mut Vec<PathHint>, spec: HintSpec<'_>) {
    let HintSpec {
        relative_path,
        label,
        source,
        confidence,
        category,
        risk,
        recommended,
    } = spec;
    let Some(path) = normalize_relative_path(&relative_path) else {
        return;
    };
    if is_editor_metadata_path(&path) || hints.iter().any(|existing| existing.relative_path == path)
    {
        return;
    }
    hints.push(PathHint {
        key: key_for_path(&path),
        label: label.into_owned(),
        relative_path: path,
        risk,
        recommended,
        source: source.into_owned(),
        confidence,
        category: category.into_owned(),
    });
}

fn key_for_path(path: &str) -> String {
    path.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}

fn normalize_relative_path(text: &str) -> Option<String> {
    let normalized = text.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') {
        return None;
    }
    let segments = normalized
        .trim_start_matches("./")
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.is_empty() || segments.contains(&"..") {
        return None;
    }
    Some(segments.join("/"))
}

fn is_editor_metadata_path(path: &str) -> bool {
    path.split('/')
        .any(|segment| segment == ".idea" || segment == ".vscode")
}

fn extract_by_pattern(content: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()
        .and_then(|regex| regex.captures(content))
        .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()))
}
