use crate::acp::events::AcpEvent;

/// Parse a single NDJSON line from hermes acp stdout into an AcpEvent.
///
/// Returns None for messages we don't handle (notifications, errors, etc.)
pub fn parse_acp_line(_line: &str) -> Option<AcpEvent> {
    // TODO: implement in Task 4
    None
}
