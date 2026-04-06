use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub model: Option<String>,
    pub started_at: Option<f64>,
    pub message_count: i64,
    pub cwd: Option<String>,
}

pub fn list_sessions(limit: usize) -> Result<Vec<SessionSummary>, String> {
    let db_path = hermes_state_db_path();
    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("failed to open state.db: {}", e))?;

    // Only ACP sessions are loadable by the ACP adapter — CLI sessions
    // have a different session-id format and live in a separate slot of
    // hermes's session manager, so filtering them out here prevents the
    // "session not found" errors users see when clicking a CLI session.
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.model, s.started_at, s.message_count, s.model_config,
             (SELECT m.content FROM messages m
              WHERE m.session_id = s.id AND m.role = 'user'
              AND m.content IS NOT NULL AND m.content != ''
              ORDER BY m.timestamp ASC LIMIT 1) AS first_user_message
             FROM sessions s
             WHERE s.source = 'acp'
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
            let model_config: Option<String> = row.get(5)?;
            let first_msg: Option<String> = row.get(6)?;

            // Extract cwd from the JSON blob Hermes stores in model_config.
            // See hermes-agent/acp_adapter/session.py: model_config={"cwd": state.cwd}
            let cwd = model_config
                .as_deref()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                .and_then(|v| v.get("cwd").and_then(|c| c.as_str()).map(String::from))
                .filter(|s| !s.is_empty() && s != ".");

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
                cwd,
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
    let db_path = hermes_state_db_path();
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
