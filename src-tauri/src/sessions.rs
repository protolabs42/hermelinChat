use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub model: Option<String>,
    pub started_at: Option<f64>,
    pub message_count: i64,
    pub source: Option<String>,
}

pub fn list_sessions(limit: usize) -> Result<Vec<SessionSummary>, String> {
    let mut all_sessions: Vec<SessionSummary> = Vec::new();

    // Read from all available state.db files
    for db_path in all_state_db_paths() {
        if let Ok(mut sessions) = list_sessions_from_db(&db_path, limit) {
            // Tag with source
            let source = if db_path.to_string_lossy().contains("wsl.localhost")
                || db_path.to_string_lossy().contains("/home/")
            {
                "wsl"
            } else {
                "local"
            };
            for s in &mut sessions {
                s.source = Some(source.to_string());
            }
            all_sessions.append(&mut sessions);
        }
    }

    // Sort by started_at descending, dedup by id
    all_sessions.sort_by(|a, b| {
        b.started_at.unwrap_or(0.0).partial_cmp(&a.started_at.unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Dedup — keep the first (most recent) if same session ID appears in both
    let mut seen = std::collections::HashSet::new();
    all_sessions.retain(|s| seen.insert(s.id.clone()));

    all_sessions.truncate(limit);
    Ok(all_sessions)
}

fn list_sessions_from_db(db_path: &std::path::Path, limit: usize) -> Result<Vec<SessionSummary>, String> {
    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("failed to open state.db: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.model, s.started_at, s.message_count,
             (SELECT m.content FROM messages m
              WHERE m.session_id = s.id AND m.role = 'user'
              AND m.content IS NOT NULL AND m.content != ''
              ORDER BY m.timestamp ASC LIMIT 1) AS first_user_message
             FROM sessions s
             ORDER BY s.started_at DESC
             LIMIT ?1",
        )
        .map_err(|e| format!("query error: {}", e))?;

    let rows = stmt
        .query_map([limit], |row| {
            let id: String = row.get(0)?;
            let db_title: Option<String> = row.get(1)?;
            let model: Option<String> = row.get(2)?;
            let started_at: Option<f64> = row.get(3)?;
            let message_count: i64 = row.get(4).unwrap_or(0);
            let first_msg: Option<String> = row.get(5)?;

            let title = db_title
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    first_msg.as_deref().and_then(|s| s.lines().next()).map(|s| {
                        if s.len() > 50 {
                            format!("{}...", &s[..47])
                        } else {
                            s.to_string()
                        }
                    })
                })
                .unwrap_or_else(|| id[..8.min(id.len())].to_string());

            Ok(SessionSummary {
                id,
                title,
                model,
                started_at,
                message_count,
                source: None,
            })
        })
        .map_err(|e| format!("row error: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect error: {}", e))
}

#[derive(Debug, Serialize)]
pub struct SessionMessage {
    pub id: i64,
    pub role: String,
    pub content: Option<String>,
    pub timestamp: Option<f64>,
}

pub fn get_session_messages(session_id: &str, limit: usize) -> Result<Vec<SessionMessage>, String> {
    // Search all databases for this session's messages
    for db_path in all_state_db_paths() {
        if let Ok(msgs) = get_session_messages_from_db(&db_path, session_id, limit) {
            if !msgs.is_empty() {
                return Ok(msgs);
            }
        }
    }
    Ok(vec![])
}

fn get_session_messages_from_db(db_path: &std::path::Path, session_id: &str, limit: usize) -> Result<Vec<SessionMessage>, String> {
    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("failed to open state.db: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, role, content, timestamp
             FROM messages
             WHERE session_id = ?1 AND role IN ('user', 'assistant')
             AND content IS NOT NULL AND content != ''
             ORDER BY timestamp ASC
             LIMIT ?2",
        )
        .map_err(|e| format!("query error: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![session_id, limit], |row| {
            Ok(SessionMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                timestamp: row.get(3)?,
            })
        })
        .map_err(|e| format!("row error: {}", e))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect error: {}", e))
}

/// Return all known state.db paths (local + WSL if on Windows).
fn all_state_db_paths() -> Vec<PathBuf> {
    let local = hermes_state_db_path();
    eprintln!("state.db local path: {} (exists: {})", local.display(), local.exists());
    let mut paths = vec![local];

    // On Windows, also check WSL state.db
    #[cfg(windows)]
    {
        for distro in &["Ubuntu-24.04", "Ubuntu-22.04", "Ubuntu", "Debian"] {
            let wsl_home = PathBuf::from(format!(
                "\\\\wsl.localhost\\{}\\home",
                distro
            ));
            eprintln!("checking WSL distro '{}': {} (exists: {})", distro, wsl_home.display(), wsl_home.exists());
            if wsl_home.exists() {
                if let Ok(entries) = std::fs::read_dir(&wsl_home) {
                    for entry in entries.flatten() {
                        let db = entry.path().join(".hermes").join("state.db");
                        eprintln!("  WSL user '{}': state.db exists: {}", entry.file_name().to_string_lossy(), db.exists());
                        if db.exists() && !paths.contains(&db) {
                            paths.push(db);
                        }
                    }
                }
            }
        }
    }

    eprintln!("total state.db paths: {}", paths.len());
    paths
}

fn hermes_state_db_path() -> PathBuf {
    if let Ok(home) = std::env::var("HERMES_HOME") {
        return PathBuf::from(home).join("state.db");
    }

    #[cfg(windows)]
    {
        if let Some(app_data) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(app_data).join("hermes").join("state.db");
        }
    }

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".hermes").join("state.db")
}
