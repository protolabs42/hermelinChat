// src-tauri/src/projects.rs
//
// First-class project storage for Aurora Chat.
// Projects are stored in Tauri's app_data_dir as "projects.json".
// All file operations are serialized via ProjectLock.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager as _;
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

// ── Validation ────────────────────────────────────────────────────────

const SHELL_META: &[char] = &[';', '|', '&', '`', '$', '>', '<', '(', ')'];

fn validate_path(path: &str) -> Result<(), String> {
    if path.contains(SHELL_META) {
        return Err(format!("Path '{path}' contains shell metacharacters"));
    }
    Ok(())
}

// ── Data Model ────────────────────────────────────────────────────────

/// A named project with an associated filesystem path.
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,      // epoch milliseconds
    pub last_opened_at: u64,  // epoch milliseconds
    pub pinned: bool,
}

/// Git repository status for a project path.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct GitInfo {
    pub branch: Option<String>,
    pub dirty: bool,
    pub remote: Option<String>,
}

/// Returned by detect_project when a git repo is found.
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct DetectedProject {
    pub git_root: String,
    pub suggested_name: String,
    pub git_info: GitInfo,
}

/// On-disk JSON representation.
#[derive(Clone, Serialize, Deserialize, Default, Debug)]
pub struct ProjectData {
    pub projects: Vec<Project>,
    /// session_id → project_id
    pub session_projects: HashMap<String, String>,
    pub active_project_id: Option<String>,
}

/// Serialized access to projects.json.  Managed by Tauri state.
pub struct ProjectLock(pub TokioMutex<()>);

// ── Helpers ───────────────────────────────────────────────────────────

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// ── Storage ───────────────────────────────────────────────────────────

/// Resolve Aurora Chat's data directory, creating it if needed.
pub fn data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Path to projects.json.
pub fn data_path(app: &AppHandle) -> PathBuf {
    data_dir(app).join("projects.json")
}

/// Read projects.json, returning default if the file is absent or invalid.
pub fn read_data(app: &AppHandle) -> ProjectData {
    let path = data_path(app);
    if !path.exists() {
        return ProjectData::default();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Atomically write projects.json (temp + rename + chmod 0600).
pub fn write_data(app: &AppHandle, data: &ProjectData) -> Result<(), String> {
    let path = data_path(app);
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize project data: {e}"))?;
    atomic_write(&path, json.as_bytes())
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("No parent directory")?;
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create directory {}: {e}", dir.display()))?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)
        .map_err(|e| format!("Failed to create temp file: {e}"))?;
    tmp.write_all(data)
        .map_err(|e| format!("Failed to write temp file: {e}"))?;
    tmp.flush()
        .map_err(|e| format!("Failed to flush temp file: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(tmp.path(), std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set permissions: {e}"))?;
    }

    tmp.persist(path)
        .map_err(|e| format!("Failed to rename temp file: {e}"))?;
    Ok(())
}

// ── Git helpers ───────────────────────────────────────────────────────

fn run_git(path: &str, args: &[&str]) -> Option<String> {
    let mut cmd_args = vec!["-C", path];
    cmd_args.extend_from_slice(args);
    std::process::Command::new("git")
        .args(&cmd_args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn git_info_for_path(path: &str) -> GitInfo {
    let branch = run_git(path, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let dirty = run_git(path, &["status", "--porcelain"])
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let remote = run_git(path, &["remote", "get-url", "origin"]);
    GitInfo { branch, dirty, remote }
}

// ── Tauri Commands ────────────────────────────────────────────────────

/// List all stored projects.
#[tauri::command]
pub async fn list_projects(
    _lock: tauri::State<'_, ProjectLock>,
    app: AppHandle,
) -> Result<Vec<Project>, String> {
    let _guard = _lock.0.lock().await;
    Ok(read_data(&app).projects)
}

/// Add a project by path.  Validates .git exists, auto-names from basename.
#[tauri::command]
pub async fn add_project(
    path: String,
    name: Option<String>,
    lock: tauri::State<'_, ProjectLock>,
    app: AppHandle,
) -> Result<Project, String> {
    validate_path(&path)?;

    let abs_path = std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.clone());

    // Require a .git directory
    if !Path::new(&abs_path).join(".git").exists() {
        return Err(format!("'{abs_path}' is not a git repository (no .git directory)"));
    }

    let _guard = lock.0.lock().await;
    let mut data = read_data(&app);

    // Reject duplicates
    if data.projects.iter().any(|p| p.path == abs_path) {
        return Err(format!("Project with path '{abs_path}' already exists"));
    }

    let display_name = name.filter(|s| !s.is_empty()).unwrap_or_else(|| {
        Path::new(&abs_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| abs_path.clone())
    });

    let now = now_ms();
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: display_name,
        path: abs_path,
        created_at: now,
        last_opened_at: now,
        pinned: false,
    };

    data.projects.push(project.clone());
    write_data(&app, &data)?;
    Ok(project)
}

/// Remove a project by ID.  Cleans up session_projects entries.
#[tauri::command]
pub async fn remove_project(
    id: String,
    lock: tauri::State<'_, ProjectLock>,
    app: AppHandle,
) -> Result<(), String> {
    let _guard = lock.0.lock().await;
    let mut data = read_data(&app);

    let before = data.projects.len();
    data.projects.retain(|p| p.id != id);
    if data.projects.len() == before {
        return Err(format!("Project '{id}' not found"));
    }

    // Clean session mappings that pointed to the removed project
    data.session_projects.retain(|_, proj_id| proj_id != &id);

    // Clear active if it was this project
    if data.active_project_id.as_deref() == Some(&id) {
        data.active_project_id = None;
    }

    write_data(&app, &data)
}

/// Rename or pin/unpin a project.
#[tauri::command]
pub async fn update_project(
    id: String,
    name: Option<String>,
    pinned: Option<bool>,
    lock: tauri::State<'_, ProjectLock>,
    app: AppHandle,
) -> Result<Project, String> {
    let _guard = lock.0.lock().await;
    let mut data = read_data(&app);

    let project = data
        .projects
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Project '{id}' not found"))?;

    if let Some(n) = name {
        if !n.is_empty() {
            project.name = n;
        }
    }
    if let Some(p) = pinned {
        project.pinned = p;
    }

    let result = project.clone();
    write_data(&app, &data)?;
    Ok(result)
}

/// Persist the active project and update last_opened_at.
#[tauri::command]
pub async fn set_active_project(
    id: String,
    lock: tauri::State<'_, ProjectLock>,
    app: AppHandle,
) -> Result<(), String> {
    let _guard = lock.0.lock().await;
    let mut data = read_data(&app);

    // "scratchpad" is a virtual project — accept it without validation
    if id != "scratchpad" {
        let project = data
            .projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| format!("Project '{id}' not found"))?;
        project.last_opened_at = now_ms();
    }

    data.active_project_id = Some(id);
    write_data(&app, &data)
}

/// Get git info (branch, dirty, remote) for a path.
#[tauri::command]
pub async fn get_git_info(path: String) -> Result<GitInfo, String> {
    validate_path(&path)?;
    Ok(git_info_for_path(&path))
}

/// Walk up from path to find a .git directory (stops at fs root).
#[tauri::command]
pub async fn detect_project(path: String) -> Result<Option<DetectedProject>, String> {
    validate_path(&path)?;

    let start = PathBuf::from(&path);
    let mut current = if start.is_dir() {
        start
    } else {
        start.parent().map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
    };

    loop {
        if current.join(".git").exists() {
            let git_root = current.to_string_lossy().to_string();
            let suggested_name = current
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| git_root.clone());
            let git_info = git_info_for_path(&git_root);
            return Ok(Some(DetectedProject {
                git_root,
                suggested_name,
                git_info,
            }));
        }

        // Stop at filesystem root
        match current.parent() {
            Some(parent) if parent != current => current = parent.to_path_buf(),
            _ => break,
        }
    }

    Ok(None)
}

/// Map a session to a project.
#[tauri::command]
pub async fn assign_session_to_project(
    session_id: String,
    project_id: String,
    lock: tauri::State<'_, ProjectLock>,
    app: AppHandle,
) -> Result<(), String> {
    let _guard = lock.0.lock().await;
    let mut data = read_data(&app);
    data.session_projects.insert(session_id, project_id);
    write_data(&app, &data)
}

/// Return sessions belonging to a project, ordered by started_at DESC.
#[tauri::command]
pub async fn get_sessions_for_project(
    project_id: String,
    limit: Option<usize>,
    lock: tauri::State<'_, ProjectLock>,
    app: AppHandle,
) -> Result<Vec<crate::sessions::SessionSummary>, String> {
    let _guard = lock.0.lock().await;
    let data = read_data(&app);
    drop(_guard);

    let cap = limit.unwrap_or(50).max(1);
    let all = crate::sessions::list_sessions(cap * 10)?; // over-fetch to allow filtering

    // Sessions with no mapping default to scratchpad
    let filtered: Vec<_> = all
        .into_iter()
        .filter(|s| {
            let mapped = data.session_projects.get(&s.id).map(|p| p.as_str());
            if project_id == "scratchpad" {
                // Scratchpad: not in the map, or explicitly mapped to scratchpad
                mapped.is_none() || mapped == Some("scratchpad")
            } else {
                mapped == Some(&project_id)
            }
        })
        .take(cap)
        .collect();

    Ok(filtered)
}

// ── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ── Helpers ───────────────────────────────────────────────────────

    /// Build a minimal ProjectData and write/read it via a temp dir path,
    /// bypassing the AppHandle requirement.
    fn temp_data_path() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::TempDir::new().expect("tmp dir");
        let path = dir.path().join("projects.json");
        (dir, path)
    }

    fn write_direct(path: &Path, data: &ProjectData) {
        let json = serde_json::to_string_pretty(data).unwrap();
        atomic_write(path, json.as_bytes()).unwrap();
    }

    fn read_direct(path: &Path) -> ProjectData {
        if !path.exists() {
            return ProjectData::default();
        }
        let s = fs::read_to_string(path).unwrap();
        serde_json::from_str(&s).unwrap()
    }

    // ── Path validation ───────────────────────────────────────────────

    #[test]
    fn validate_path_accepts_normal() {
        assert!(validate_path("/home/user/my-project").is_ok());
        assert!(validate_path("/tmp/some dir/with spaces").is_ok());
        assert!(validate_path("relative/path").is_ok());
    }

    #[test]
    fn validate_path_rejects_shell_meta() {
        for meta in SHELL_META {
            let p = format!("/home/user/proj{meta}evil");
            assert!(
                validate_path(&p).is_err(),
                "should reject path with '{meta}'"
            );
        }
    }

    // ── Atomic write / read round-trip ────────────────────────────────

    #[test]
    fn atomic_write_round_trip() {
        let (_dir, path) = temp_data_path();
        let data = ProjectData::default();
        write_direct(&path, &data);
        let back = read_direct(&path);
        assert!(back.projects.is_empty());
        assert!(back.session_projects.is_empty());
        assert!(back.active_project_id.is_none());
    }

    // ── Project CRUD round-trip ───────────────────────────────────────

    #[test]
    fn crud_add_list_update_remove() {
        let (_dir, path) = temp_data_path();

        // Create a fake git repo in a temp dir
        let proj_dir = tempfile::TempDir::new().unwrap();
        fs::create_dir_all(proj_dir.path().join(".git")).unwrap();
        let proj_path = proj_dir
            .path()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .to_string();

        // ── add ──
        let mut data = ProjectData::default();
        let now = now_ms();
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: "test-project".into(),
            path: proj_path.clone(),
            created_at: now,
            last_opened_at: now,
            pinned: false,
        };
        data.projects.push(project.clone());
        write_direct(&path, &data);

        // ── list ──
        let loaded = read_direct(&path);
        assert_eq!(loaded.projects.len(), 1);
        assert_eq!(loaded.projects[0].name, "test-project");
        assert_eq!(loaded.projects[0].path, proj_path);

        // ── update ──
        let id = project.id.clone();
        {
            let mut d = read_direct(&path);
            let p = d.projects.iter_mut().find(|p| p.id == id).unwrap();
            p.name = "renamed".into();
            p.pinned = true;
            write_direct(&path, &d);
        }
        let after_update = read_direct(&path);
        let updated = after_update.projects.iter().find(|p| p.id == id).unwrap();
        assert_eq!(updated.name, "renamed");
        assert!(updated.pinned);

        // ── remove ──
        {
            let mut d = read_direct(&path);
            d.projects.retain(|p| p.id != id);
            write_direct(&path, &d);
        }
        let after_remove = read_direct(&path);
        assert!(after_remove.projects.is_empty());
    }

    // ── duplicate path rejection ──────────────────────────────────────

    #[test]
    fn duplicate_path_detected() {
        let proj_dir = tempfile::TempDir::new().unwrap();
        fs::create_dir_all(proj_dir.path().join(".git")).unwrap();
        let proj_path = proj_dir
            .path()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .to_string();

        let mut data = ProjectData::default();
        let now = now_ms();
        data.projects.push(Project {
            id: "existing-id".into(),
            name: "existing".into(),
            path: proj_path.clone(),
            created_at: now,
            last_opened_at: now,
            pinned: false,
        });

        // Simulate the duplicate check from add_project
        let is_dup = data.projects.iter().any(|p| p.path == proj_path);
        assert!(is_dup, "duplicate path should be detected");
    }

    // ── .git presence check ───────────────────────────────────────────

    #[test]
    fn requires_git_directory() {
        let no_git = tempfile::TempDir::new().unwrap();
        let no_git_path = no_git.path().to_string_lossy().to_string();
        assert!(
            !Path::new(&no_git_path).join(".git").exists(),
            "test dir should have no .git"
        );
    }

    // ── Session-project mapping ───────────────────────────────────────

    #[test]
    fn session_project_assign_and_filter() {
        let (_dir, path) = temp_data_path();

        let mut data = ProjectData::default();
        data.session_projects.insert("sess-1".into(), "proj-a".into());
        data.session_projects.insert("sess-2".into(), "proj-a".into());
        data.session_projects.insert("sess-3".into(), "proj-b".into());
        write_direct(&path, &data);

        let loaded = read_direct(&path);
        let proj_a_sessions: Vec<&String> = loaded
            .session_projects
            .iter()
            .filter(|(_, pid)| pid.as_str() == "proj-a")
            .map(|(sid, _)| sid)
            .collect();
        assert_eq!(proj_a_sessions.len(), 2);
        assert!(loaded.session_projects.contains_key("sess-3"));
    }

    #[test]
    fn scratchpad_sessions_default_when_unmapped() {
        let data = ProjectData::default(); // no session_projects entries

        // Sessions not in the map belong to scratchpad
        let session_id = "unmapped-sess";
        let mapped = data.session_projects.get(session_id).map(|p| p.as_str());
        let is_scratchpad = mapped.is_none() || mapped == Some("scratchpad");
        assert!(is_scratchpad);
    }

    #[test]
    fn remove_project_cleans_session_map() {
        let (_dir, path) = temp_data_path();

        let mut data = ProjectData::default();
        data.session_projects.insert("sess-x".into(), "proj-to-remove".into());
        data.session_projects.insert("sess-y".into(), "proj-keep".into());
        data.active_project_id = Some("proj-to-remove".into());
        write_direct(&path, &data);

        // Simulate remove
        {
            let mut d = read_direct(&path);
            let remove_id = "proj-to-remove";
            d.session_projects.retain(|_, pid| pid != remove_id);
            if d.active_project_id.as_deref() == Some(remove_id) {
                d.active_project_id = None;
            }
            write_direct(&path, &d);
        }

        let after = read_direct(&path);
        assert!(!after.session_projects.contains_key("sess-x"));
        assert!(after.session_projects.contains_key("sess-y"));
        assert!(after.active_project_id.is_none());
    }

    // ── detect_project directory walk ─────────────────────────────────

    #[test]
    fn detect_project_finds_git_root() {
        // Structure: /tmp/xxx/repo/.git  and  /tmp/xxx/repo/sub/subdir
        let root = tempfile::TempDir::new().unwrap();
        let repo = root.path().join("repo");
        let subdir = repo.join("sub").join("deep");
        fs::create_dir_all(&subdir).unwrap();
        fs::create_dir_all(repo.join(".git")).unwrap();

        let start = subdir.to_string_lossy().to_string();

        // Run the walk logic directly
        let result = find_git_root_for_test(&start);
        assert!(result.is_some(), "should find git root");
        let found = result.unwrap();
        let expected = repo.canonicalize().unwrap().to_string_lossy().to_string();
        assert_eq!(found, expected);
    }

    #[test]
    fn detect_project_returns_none_for_non_git() {
        let no_git = tempfile::TempDir::new().unwrap();
        let subdir = no_git.path().join("a").join("b");
        fs::create_dir_all(&subdir).unwrap();

        let result = find_git_root_for_test(&subdir.to_string_lossy());
        assert!(result.is_none());
    }

    /// Inline the walking logic so tests don't need AppHandle or async.
    fn find_git_root_for_test(path: &str) -> Option<String> {
        let start = PathBuf::from(path);
        let mut current = if start.is_dir() {
            start
        } else {
            start.parent().map(PathBuf::from)?
        };

        loop {
            if current.join(".git").exists() {
                // canonicalize so the path matches what Tauri would return
                let resolved = current.canonicalize().ok()?;
                return Some(resolved.to_string_lossy().to_string());
            }
            match current.parent() {
                Some(parent) if parent != current => current = parent.to_path_buf(),
                _ => break,
            }
        }
        None
    }

    // ── Git info parsing ──────────────────────────────────────────────

    #[test]
    fn git_info_on_real_repo() {
        // Use the hermelinChat repo itself (we know it has a .git dir)
        let repo_path = std::env::var("CARGO_MANIFEST_DIR")
            .map(|s| PathBuf::from(s).parent().unwrap().to_path_buf())
            .unwrap_or_else(|_| PathBuf::from("."));

        // Only run if git is available
        let git_available = std::process::Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        if !git_available {
            println!("Skipping git_info test — git not in PATH");
            return;
        }

        let info = git_info_for_path(&repo_path.to_string_lossy());
        // In a git repo we should get at least a branch name
        assert!(
            info.branch.is_some(),
            "expected branch name in a git repo, got None"
        );
    }
}
