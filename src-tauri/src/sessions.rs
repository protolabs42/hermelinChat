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
    // visible_count mirrors the filter used by get_session_messages so the
    // sidebar count matches what the chat view actually shows after loading
    // (hermes's raw sessions.message_count counts tool calls, thinking blocks,
    // system messages, etc — often 10-20x larger than the user-visible count).
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.title, s.model, s.started_at, s.model_config,
             (SELECT COUNT(*) FROM messages m
              WHERE m.session_id = s.id AND m.role IN ('user','assistant')
              AND m.content IS NOT NULL AND m.content != '') AS visible_count,
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
            let model_config: Option<String> = row.get(4)?;
            let message_count: i64 = row.get(5).unwrap_or(0);
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
    pub reasoning: Option<String>,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
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

    // Include 'tool' rows and rows with empty content so the frontend can
    // reconstruct thinking blocks, tool calls, and tool results on resume.
    // Before, the WHERE clause dropped everything except user/assistant
    // non-empty text — which is why resumed sessions showed only flat
    // conversations without any of the agent's mid-turn work.
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content, timestamp, reasoning, tool_calls, tool_call_id, tool_name
             FROM messages
             WHERE session_id = ?1
               AND role IN ('user', 'assistant', 'tool')
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
                reasoning: row.get(4)?,
                tool_calls: row.get(5)?,
                tool_call_id: row.get(6)?,
                tool_name: row.get(7)?,
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    // Tests mutate HERMES_HOME, which is process-global. Serialize them.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// Build a fixture state.db that mirrors the real hermes schema closely
    /// enough for these queries. We only populate the columns our code reads.
    fn make_fixture_db(path: &std::path::Path) -> Connection {
        let conn = Connection::open(path).expect("open fixture db");
        conn.execute_batch(
            "CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                title TEXT,
                model TEXT,
                model_config TEXT,
                started_at REAL NOT NULL
            );
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT,
                tool_call_id TEXT,
                tool_calls TEXT,
                tool_name TEXT,
                timestamp REAL NOT NULL,
                reasoning TEXT
            );",
        )
        .expect("create schema");
        conn
    }

    fn insert_session(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO sessions (id, source, title, started_at) VALUES (?1, 'acp', 'Test', 1000.0)",
            rusqlite::params![id],
        )
        .expect("insert session");
    }

    fn insert_msg(
        conn: &Connection,
        session_id: &str,
        role: &str,
        content: Option<&str>,
        ts: f64,
        reasoning: Option<&str>,
        tool_calls: Option<&str>,
        tool_call_id: Option<&str>,
        tool_name: Option<&str>,
    ) {
        conn.execute(
            "INSERT INTO messages
             (session_id, role, content, timestamp, reasoning, tool_calls, tool_call_id, tool_name)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                session_id, role, content, ts, reasoning, tool_calls, tool_call_id, tool_name
            ],
        )
        .expect("insert msg");
    }

    #[test]
    fn get_session_messages_returns_tool_rows_and_rich_columns() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = tempfile::tempdir().expect("tempdir");
        std::env::set_var("HERMES_HOME", dir.path());

        let conn = make_fixture_db(&dir.path().join("state.db"));
        let sid = "session-rich";
        insert_session(&conn, sid);
        // 1. user asks something
        insert_msg(&conn, sid, "user", Some("list files"), 100.0, None, None, None, None);
        // 2. assistant emits thinking + tool call, no visible content
        insert_msg(
            &conn, sid, "assistant", None, 101.0,
            Some("I should use the bash tool"),
            Some(r#"[{"id": "call_1", "name": "bash", "arguments": "{\"cmd\": \"ls\"}"}]"#),
            None, None,
        );
        // 3. tool result references call_1
        insert_msg(
            &conn, sid, "tool",
            Some(r#"{"output": "file1\nfile2", "exit_code": 0}"#),
            102.0, None, None, Some("call_1"), Some("bash"),
        );
        // 4. assistant final text reply
        insert_msg(
            &conn, sid, "assistant", Some("Found 2 files."), 103.0, None, None, None, None,
        );

        let msgs = get_session_messages(sid, 100).expect("query ok");
        assert_eq!(msgs.len(), 4, "should include tool row + empty-content assistant");

        // User row
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].content.as_deref(), Some("list files"));

        // Assistant with reasoning + tool_calls, empty content
        assert_eq!(msgs[1].role, "assistant");
        assert!(msgs[1].content.is_none() || msgs[1].content.as_deref() == Some(""));
        assert_eq!(msgs[1].reasoning.as_deref(), Some("I should use the bash tool"));
        assert!(msgs[1].tool_calls.as_deref().unwrap_or("").contains("call_1"));

        // Tool result row
        assert_eq!(msgs[2].role, "tool");
        assert_eq!(msgs[2].tool_call_id.as_deref(), Some("call_1"));
        assert_eq!(msgs[2].tool_name.as_deref(), Some("bash"));
        assert!(msgs[2].content.as_deref().unwrap_or("").contains("file1"));

        // Final assistant text
        assert_eq!(msgs[3].role, "assistant");
        assert_eq!(msgs[3].content.as_deref(), Some("Found 2 files."));

        std::env::remove_var("HERMES_HOME");
    }

    #[test]
    fn get_session_messages_orders_by_timestamp_and_respects_limit() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = tempfile::tempdir().expect("tempdir");
        std::env::set_var("HERMES_HOME", dir.path());

        let conn = make_fixture_db(&dir.path().join("state.db"));
        let sid = "s-order";
        insert_session(&conn, sid);
        insert_msg(&conn, sid, "user", Some("a"), 300.0, None, None, None, None);
        insert_msg(&conn, sid, "user", Some("b"), 100.0, None, None, None, None);
        insert_msg(&conn, sid, "user", Some("c"), 200.0, None, None, None, None);

        let msgs = get_session_messages(sid, 2).expect("query ok");
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].content.as_deref(), Some("b"));
        assert_eq!(msgs[1].content.as_deref(), Some("c"));

        std::env::remove_var("HERMES_HOME");
    }
}
