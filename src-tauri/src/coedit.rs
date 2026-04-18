use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CoeditSurfaceInstance {
    pub surface_instance_id: String,
    pub session_id: String,
    pub surface_id: String,
    pub server: String,
    pub resource_uri: String,
    pub state_json: Value,
    pub revision: i64,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone)]
pub struct NewSurfaceInstance {
    pub surface_instance_id: String,
    pub session_id: String,
    pub surface_id: String,
    pub server: String,
    pub resource_uri: String,
    pub state_json: Value,
    pub revision: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PatchOp {
    pub op: String,
    pub path: String,
    pub value: Value,
}

fn now_ts() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

fn meta_db_path() -> PathBuf {
    if let Ok(home) = std::env::var("HERMES_HOME") {
        return PathBuf::from(home).join("hermelin_meta.db");
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".hermes").join("hermelin_meta.db")
}

fn open_conn() -> Result<Connection, String> {
    let path = meta_db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create meta db dir: {e}"))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("open meta db: {e}"))?;
    init_schema(&conn)?;
    Ok(conn)
}

fn row_to_surface(row: &rusqlite::Row<'_>) -> rusqlite::Result<CoeditSurfaceInstance> {
    let state_json_text: String = row.get("state_json")?;
    let state_json =
        serde_json::from_str(&state_json_text).unwrap_or(Value::Object(Default::default()));
    Ok(CoeditSurfaceInstance {
        surface_instance_id: row.get("surface_instance_id")?,
        session_id: row.get("session_id")?,
        surface_id: row.get("surface_id")?,
        server: row.get("server")?,
        resource_uri: row.get("resource_uri")?,
        state_json,
        revision: row.get("revision")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS coedit_surface_instances (
            surface_instance_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            surface_id TEXT NOT NULL,
            server TEXT NOT NULL,
            resource_uri TEXT NOT NULL,
            state_json TEXT NOT NULL,
            revision INTEGER NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS coedit_surface_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            surface_instance_id TEXT NOT NULL,
            actor TEXT NOT NULL,
            event_type TEXT NOT NULL,
            base_revision INTEGER,
            payload_json TEXT NOT NULL,
            created_at REAL NOT NULL
        );",
    )
    .map_err(|e| format!("init coedit schema: {e}"))?;
    Ok(())
}

pub fn upsert_surface_instance(
    conn: &Connection,
    instance: &NewSurfaceInstance,
) -> Result<CoeditSurfaceInstance, String> {
    let now = now_ts();
    let existing_created_at: Option<f64> = conn
        .query_row(
            "SELECT created_at FROM coedit_surface_instances WHERE surface_instance_id = ?1",
            params![instance.surface_instance_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("query created_at: {e}"))?;
    let created_at = existing_created_at.unwrap_or(now);
    let state_json_text = serde_json::to_string(&instance.state_json)
        .map_err(|e| format!("encode state_json: {e}"))?;

    conn.execute(
        "INSERT INTO coedit_surface_instances (
            surface_instance_id, session_id, surface_id, server, resource_uri,
            state_json, revision, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(surface_instance_id) DO UPDATE SET
            session_id = excluded.session_id,
            surface_id = excluded.surface_id,
            server = excluded.server,
            resource_uri = excluded.resource_uri,
            state_json = excluded.state_json,
            revision = excluded.revision,
            updated_at = excluded.updated_at",
        params![
            instance.surface_instance_id,
            instance.session_id,
            instance.surface_id,
            instance.server,
            instance.resource_uri,
            state_json_text,
            instance.revision,
            created_at,
            now,
        ],
    )
    .map_err(|e| format!("upsert coedit instance: {e}"))?;

    get_surface_instance(conn, &instance.surface_instance_id)?
        .ok_or_else(|| "surface instance missing after upsert".to_string())
}

pub fn get_surface_instance(
    conn: &Connection,
    surface_instance_id: &str,
) -> Result<Option<CoeditSurfaceInstance>, String> {
    conn.query_row(
        "SELECT * FROM coedit_surface_instances WHERE surface_instance_id = ?1",
        params![surface_instance_id],
        row_to_surface,
    )
    .optional()
    .map_err(|e| format!("query surface instance: {e}"))
}

pub fn append_surface_event(
    conn: &Connection,
    surface_instance_id: &str,
    actor: &str,
    event_type: &str,
    base_revision: Option<i64>,
    payload_json: &Value,
) -> Result<(), String> {
    let payload_json_text =
        serde_json::to_string(payload_json).map_err(|e| format!("encode event payload: {e}"))?;
    conn.execute(
        "INSERT INTO coedit_surface_events (
            surface_instance_id, actor, event_type, base_revision, payload_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            surface_instance_id,
            actor,
            event_type,
            base_revision,
            payload_json_text,
            now_ts(),
        ],
    )
    .map_err(|e| format!("append coedit event: {e}"))?;
    Ok(())
}

fn apply_replace(target: &mut Value, path: &str, value: Value) -> Result<(), String> {
    if path.is_empty() || path == "/" {
        *target = value;
        return Ok(());
    }
    if !path.starts_with('/') {
        return Err(format!("unsupported patch path: {path}"));
    }
    let segments: Vec<String> = path
        .trim_start_matches('/')
        .split('/')
        .map(|segment| segment.replace("~1", "/").replace("~0", "~"))
        .collect();

    let mut cursor = target;
    for segment in &segments[..segments.len().saturating_sub(1)] {
        if !cursor.is_object() {
            *cursor = Value::Object(Default::default());
        }
        let obj = cursor
            .as_object_mut()
            .ok_or_else(|| format!("path parent is not an object: {path}"))?;
        cursor = obj
            .entry(segment.clone())
            .or_insert_with(|| Value::Object(Default::default()));
    }

    let last = segments
        .last()
        .ok_or_else(|| format!("invalid patch path: {path}"))?
        .clone();
    if !cursor.is_object() {
        *cursor = Value::Object(Default::default());
    }
    cursor
        .as_object_mut()
        .ok_or_else(|| format!("path target is not an object: {path}"))?
        .insert(last, value);
    Ok(())
}

fn apply_patch_ops(current: &Value, patch: &[PatchOp]) -> Result<Value, String> {
    let mut next = current.clone();
    for op in patch {
        if op.op != "replace" {
            return Err(format!("unsupported patch op: {}", op.op));
        }
        apply_replace(&mut next, &op.path, op.value.clone())?;
    }
    Ok(next)
}

pub fn apply_patch_if_fresh(
    conn: &Connection,
    surface_instance_id: &str,
    base_revision: i64,
    patch: &[PatchOp],
    actor: &str,
) -> Result<CoeditSurfaceInstance, String> {
    let current = get_surface_instance(conn, surface_instance_id)?
        .ok_or_else(|| format!("unknown surface instance: {surface_instance_id}"))?;

    if current.revision != base_revision {
        return Err(format!(
            "revision conflict: current={} base={}",
            current.revision, base_revision
        ));
    }

    let next_state = apply_patch_ops(&current.state_json, patch)?;
    let event_type = if actor == "user" {
        "patch"
    } else {
        "agent_patch"
    };
    let next_instance = NewSurfaceInstance {
        surface_instance_id: current.surface_instance_id.clone(),
        session_id: current.session_id.clone(),
        surface_id: current.surface_id.clone(),
        server: current.server.clone(),
        resource_uri: current.resource_uri.clone(),
        state_json: next_state,
        revision: current.revision + 1,
    };
    let updated = upsert_surface_instance(conn, &next_instance)?;
    append_surface_event(
        conn,
        surface_instance_id,
        actor,
        event_type,
        Some(base_revision),
        &serde_json::json!({ "patch": patch }),
    )?;
    Ok(updated)
}

#[tauri::command]
pub fn coedit_upsert_surface_instance(
    surface_instance_id: String,
    session_id: String,
    surface_id: String,
    server: String,
    resource_uri: String,
    state_json: Value,
    revision: i64,
) -> Result<CoeditSurfaceInstance, String> {
    let conn = open_conn()?;
    upsert_surface_instance(
        &conn,
        &NewSurfaceInstance {
            surface_instance_id,
            session_id,
            surface_id,
            server,
            resource_uri,
            state_json,
            revision,
        },
    )
}

#[tauri::command]
pub fn coedit_get_surface_instance(
    surface_instance_id: String,
) -> Result<Option<CoeditSurfaceInstance>, String> {
    let conn = open_conn()?;
    get_surface_instance(&conn, &surface_instance_id)
}

#[tauri::command]
pub fn coedit_submit_patch(
    surface_instance_id: String,
    base_revision: i64,
    patch: Vec<PatchOp>,
    selection: Option<Value>,
) -> Result<CoeditSurfaceInstance, String> {
    let conn = open_conn()?;
    let updated = apply_patch_if_fresh(&conn, &surface_instance_id, base_revision, &patch, "user")?;
    append_surface_event(
        &conn,
        &surface_instance_id,
        "user",
        "submit",
        Some(base_revision),
        &serde_json::json!({ "patch": patch, "selection": selection }),
    )?;
    Ok(updated)
}

#[tauri::command]
pub fn coedit_apply_host_patch(
    surface_instance_id: String,
    base_revision: i64,
    patch: Vec<PatchOp>,
    authored_by: String,
) -> Result<CoeditSurfaceInstance, String> {
    let conn = open_conn()?;
    apply_patch_if_fresh(
        &conn,
        &surface_instance_id,
        base_revision,
        &patch,
        &authored_by,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    fn make_conn() -> Connection {
        Connection::open_in_memory().expect("open in-memory db")
    }

    fn seed_instance() -> NewSurfaceInstance {
        NewSurfaceInstance {
            surface_instance_id: "coedit-1".to_string(),
            session_id: "sess-1".to_string(),
            surface_id: "surface-1".to_string(),
            server: "aurora-bundled".to_string(),
            resource_uri: "ui://aurora-bundled/coedit-proof.html".to_string(),
            state_json: serde_json::json!({ "text": "draft one" }),
            revision: 1,
        }
    }

    #[test]
    fn init_schema_creates_required_tables() {
        let conn = make_conn();

        init_schema(&conn).expect("schema init");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('coedit_surface_instances', 'coedit_surface_events')",
                [],
                |row| row.get(0),
            )
            .expect("count tables");
        assert_eq!(count, 2);
    }

    #[test]
    fn upsert_and_get_surface_instance_round_trip() {
        let conn = make_conn();
        init_schema(&conn).expect("schema init");

        upsert_surface_instance(&conn, &seed_instance()).expect("upsert");
        let row = get_surface_instance(&conn, "coedit-1")
            .expect("query ok")
            .expect("instance exists");

        assert_eq!(row.session_id, "sess-1");
        assert_eq!(row.revision, 1);
        assert_eq!(row.state_json, serde_json::json!({ "text": "draft one" }));
    }

    #[test]
    fn append_surface_event_persists_row() {
        let conn = make_conn();
        init_schema(&conn).expect("schema init");
        upsert_surface_instance(&conn, &seed_instance()).expect("upsert");

        append_surface_event(
            &conn,
            "coedit-1",
            "user",
            "submit",
            Some(1),
            &serde_json::json!({ "patch": [{ "op": "replace", "path": "/text", "value": "next" }] }),
        )
        .expect("append event");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM coedit_surface_events", [], |row| {
                row.get(0)
            })
            .expect("count events");
        assert_eq!(count, 1);
    }

    #[test]
    fn apply_patch_if_fresh_rejects_stale_base_revision() {
        let conn = make_conn();
        init_schema(&conn).expect("schema init");
        upsert_surface_instance(&conn, &seed_instance()).expect("upsert");

        let err = apply_patch_if_fresh(
            &conn,
            "coedit-1",
            0,
            &[PatchOp {
                op: "replace".to_string(),
                path: "/text".to_string(),
                value: serde_json::json!("stale write"),
            }],
            "sophie",
        )
        .expect_err("stale patch should fail");

        assert!(err.contains("revision conflict"));
    }

    #[test]
    fn apply_patch_if_fresh_updates_state_and_revision() {
        let conn = make_conn();
        init_schema(&conn).expect("schema init");
        upsert_surface_instance(&conn, &seed_instance()).expect("upsert");

        let updated = apply_patch_if_fresh(
            &conn,
            "coedit-1",
            1,
            &[PatchOp {
                op: "replace".to_string(),
                path: "/text".to_string(),
                value: serde_json::json!("sophie rewrite"),
            }],
            "sophie",
        )
        .expect("fresh patch should apply");

        assert_eq!(updated.revision, 2);
        assert_eq!(
            updated.state_json,
            serde_json::json!({ "text": "sophie rewrite" })
        );

        let event_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM coedit_surface_events WHERE actor = ?1 AND event_type = ?2",
                params!["sophie", "agent_patch"],
                |row| row.get(0),
            )
            .expect("count patch events");
        assert_eq!(event_count, 1);
    }
}
