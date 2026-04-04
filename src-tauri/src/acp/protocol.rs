use serde_json::Value;
use crate::acp::events::{AcpEvent, ApprovalOption, ToolContent};

/// Parse a single NDJSON line from hermes acp stdout into an AcpEvent.
///
/// Returns None for messages we don't handle (notifications, errors, etc.)
pub fn parse_acp_line(line: &str) -> Option<AcpEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    let json: Value = serde_json::from_str(line).ok()?;

    // JSON-RPC responses have "result" or "error" but no "method".
    if let Some(result) = json.get("result") {
        // session/new response: { "result": { "sessionId": "..." } }
        if let Some(sid) = result.get("sessionId").and_then(|s| s.as_str()) {
            return Some(AcpEvent::SessionInfo {
                session_id: sid.to_string(),
                model: None,
            });
        }
        // Other responses (e.g., session/prompt completion) signal end-of-stream
        return Some(AcpEvent::StreamEnd);
    }
    if json.get("error").is_some() {
        return Some(AcpEvent::StreamEnd);
    }

    // JSON-RPC notifications/requests have "method".
    // ACP session/update: { "method": "session/update", "params": { "sessionUpdate": "...", ... } }
    let method = json.get("method")?.as_str()?;

    match method {
        "session/update" => parse_session_update(json.get("params")?),
        "session/request_permission" => parse_permission_request(&json),
        _ => None,
    }
}

fn parse_session_update(params: &Value) -> Option<AcpEvent> {
    let update_type = params.get("sessionUpdate")?.as_str()?;

    match update_type {
        "agent_thought_chunk" => {
            let text = params
                .get("content")
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            Some(AcpEvent::AgentThinking { text })
        }

        "agent_message_chunk" => {
            let text = params
                .get("content")
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            Some(AcpEvent::AgentMessage { text })
        }

        "tool_call" => {
            let id = params.get("toolCallId")?.as_str()?.to_string();
            let title = params
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .to_string();
            let tool_kind = params
                .get("kind")
                .and_then(|k| k.as_str())
                .unwrap_or("execute")
                .to_string();

            // Check for diff content in tool call
            if let Some(content_arr) = params.get("content").and_then(|c| c.as_array()) {
                for item in content_arr {
                    if item.get("type").and_then(|t| t.as_str()) == Some("diff") {
                        let path = item.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string();
                        let old_text = item.get("oldText").and_then(|t| t.as_str()).map(|s| s.to_string());
                        let new_text = item.get("newText").and_then(|t| t.as_str()).unwrap_or("").to_string();

                        return Some(AcpEvent::DiffProposed {
                            tool_call_id: id,
                            path,
                            old_text,
                            new_text,
                        });
                    }
                }
            }

            Some(AcpEvent::ToolCallStarted { id, title, tool_kind })
        }

        "tool_call_update" => {
            let id = params.get("toolCallId")?.as_str()?.to_string();
            let status = params
                .get("status")
                .and_then(|s| s.as_str())
                .unwrap_or("pending")
                .to_string();
            let content = parse_tool_content(params.get("content"));
            Some(AcpEvent::ToolCallUpdate { id, status, content })
        }

        "usage_update" => {
            let used = params.get("used").and_then(|v| v.as_u64()).unwrap_or(0);
            let size = params.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            let cost_usd = params
                .get("cost")
                .and_then(|c| c.get("amount"))
                .and_then(|a| a.as_f64());
            Some(AcpEvent::UsageUpdate { used, size, cost_usd })
        }

        "session_info_update" => {
            let session_id = params.get("sessionId")?.as_str()?.to_string();
            let model = params.get("model").and_then(|m| m.as_str()).map(|s| s.to_string());
            Some(AcpEvent::SessionInfo { session_id, model })
        }

        _ => None,
    }
}

fn parse_permission_request(json: &Value) -> Option<AcpEvent> {
    let params = json.get("params")?;
    let id = json.get("id")?.to_string(); // JSON-RPC request id
    let tool_call = params.get("toolCall")?;
    let command = tool_call.get("input").and_then(|i| i.as_str()).unwrap_or("").to_string();
    let description = tool_call
        .get("title")
        .and_then(|t| t.as_str())
        .unwrap_or("permission requested")
        .to_string();

    let options = params
        .get("options")
        .and_then(|o| o.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|opt| {
                    Some(ApprovalOption {
                        id: opt.get("optionId")?.as_str()?.to_string(),
                        label: opt.get("name")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Some(AcpEvent::ApprovalRequested {
        id,
        description,
        command,
        options,
    })
}

fn parse_tool_content(content: Option<&Value>) -> Vec<ToolContent> {
    let arr = match content.and_then(|c| c.as_array()) {
        Some(a) => a,
        None => return vec![],
    };

    arr.iter()
        .filter_map(|item| {
            let content_type = item.get("type").and_then(|t| t.as_str())?;
            match content_type {
                "diff" => Some(ToolContent::Diff {
                    path: item.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string(),
                    old_text: item.get("oldText").and_then(|t| t.as_str()).map(|s| s.to_string()),
                    new_text: item.get("newText").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                }),
                _ => {
                    let text = item
                        .get("content")
                        .and_then(|c| c.get("text"))
                        .and_then(|t| t.as_str())
                        .or_else(|| item.get("text").and_then(|t| t.as_str()))
                        .unwrap_or("")
                        .to_string();
                    Some(ToolContent::Text { text })
                }
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_agent_message_chunk() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Hello world"}}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::AgentMessage { text } => assert_eq!(text, "Hello world"),
            other => panic!("expected AgentMessage, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_thinking_chunk() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"Let me think..."}}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::AgentThinking { text } => assert_eq!(text, "Let me think..."),
            other => panic!("expected AgentThinking, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_tool_call() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"tool_call","toolCallId":"tc-123","title":"read_file: main.rs","kind":"read","content":[{"type":"content","content":{"type":"text","text":"file content"}}]}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::ToolCallStarted { id, title, tool_kind } => {
                assert_eq!(id, "tc-123");
                assert_eq!(title, "read_file: main.rs");
                assert_eq!(tool_kind, "read");
            }
            other => panic!("expected ToolCallStarted, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_tool_call_with_diff() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"tool_call","toolCallId":"tc-456","title":"write: main.py","kind":"edit","content":[{"type":"diff","path":"/src/main.py","newText":"def hello():\n    pass","oldText":"def old():\n    pass"}]}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::DiffProposed { tool_call_id, path, old_text, new_text } => {
                assert_eq!(tool_call_id, "tc-456");
                assert_eq!(path, "/src/main.py");
                assert_eq!(old_text.unwrap(), "def old():\n    pass");
                assert_eq!(new_text, "def hello():\n    pass");
            }
            other => panic!("expected DiffProposed, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_usage_update() {
        let line = r#"{"method":"session/update","params":{"sessionUpdate":"usage_update","used":1250,"size":8192,"cost":{"amount":0.0015,"currency":"USD"}}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::UsageUpdate { used, size, cost_usd } => {
                assert_eq!(used, 1250);
                assert_eq!(size, 8192);
                assert_eq!(cost_usd, Some(0.0015));
            }
            other => panic!("expected UsageUpdate, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_empty_line() {
        assert!(parse_acp_line("").is_none());
        assert!(parse_acp_line("  \n").is_none());
    }

    #[test]
    fn test_parse_invalid_json() {
        assert!(parse_acp_line("not json").is_none());
    }

    #[test]
    fn test_parse_unknown_method() {
        let line = r#"{"method":"unknown/method","params":{}}"#;
        assert!(parse_acp_line(line).is_none());
    }

    #[test]
    fn test_parse_new_session_response() {
        let line = r#"{"jsonrpc":"2.0","id":1,"result":{"sessionId":"abc-123"}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::SessionInfo { session_id, .. } => assert_eq!(session_id, "abc-123"),
            other => panic!("expected SessionInfo, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_prompt_response_as_stream_end() {
        let line = r#"{"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn"}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::StreamEnd => {} // correct
            other => panic!("expected StreamEnd, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_jsonrpc_error_as_stream_end() {
        let line = r#"{"jsonrpc":"2.0","id":2,"error":{"code":-32600,"message":"Invalid Request"}}"#;
        let event = parse_acp_line(line).unwrap();
        match event {
            AcpEvent::StreamEnd => {} // correct
            other => panic!("expected StreamEnd, got {:?}", other),
        }
    }
}
