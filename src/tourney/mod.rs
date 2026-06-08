//! Tournament bracket generation and seeding.

pub mod bracket;
pub mod seeding;

pub fn parse_tournament_format(format: &str) -> (String, usize) {
    let trimmed = format.trim().to_ascii_lowercase();
    if trimmed.contains("double") {
        let team_size = crate::matchmaking::parse_team_size(Some(format));
        return ("double_elimination".to_string(), team_size);
    }
    if trimmed.contains("single") {
        let team_size = crate::matchmaking::parse_team_size(Some(format));
        return ("single_elimination".to_string(), team_size);
    }
    let team_size = crate::matchmaking::parse_team_size(Some(format));
    ("single_elimination".to_string(), team_size)
}

pub fn normalize_tournament_name(name: &str) -> String {
    name.trim().to_ascii_lowercase()
}
