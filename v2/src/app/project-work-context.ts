export interface ProjectWorkIssue {
  id: string
  title: string
  status: string
  priority: number | null
  issue_type: string | null
}

export interface ProjectWorkContext {
  repo_path: string
  has_bd: boolean
  in_progress_issues: ProjectWorkIssue[]
  ready_issues: ProjectWorkIssue[]
  dark_factory_notes: string | null
  dark_factory_path: string | null
  error: string | null
}
