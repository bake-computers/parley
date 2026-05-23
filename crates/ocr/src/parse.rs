use crate::OcrError;

#[derive(Debug, Clone)]
pub struct ParsedPlayer {
    pub username: String,
    pub kills: i32,
    pub deaths: i32,
    pub assists: i32,
    pub won: bool,
    pub team_id: String,
    pub confidence: f32,
}

#[derive(Debug, Clone)]
pub struct ParsedMatch {
    pub players: Vec<ParsedPlayer>,
    pub scanned_at: i64,
}

/// Parse Tesseract's raw text output into structured match data.
///
/// The R6 scoreboard layout is expected to be a 5-column table:
///   Username | Kills | Deaths | Assists | Points
///
/// Tesseract reads left-to-right, top-to-bottom. We detect the header row
/// (columns labeled "K", "D", "A" or similar) then group subsequent rows
/// into per-player entries.
pub fn parse_scoreboard_text(raw_text: &str) -> Result<ParsedMatch, OcrError> {
    let lines: Vec<&str> = raw_text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();

    if lines.len() < 12 {
        return Err(OcrError::Parse(
            "not enough text lines for a scoreboard (need at least 12)".into(),
        ));
    }

    let header_idx = find_header_row(&lines)?;
    let player_lines = &lines[header_idx + 1..];
    let players = extract_players(player_lines)?;

    if players.is_empty() {
        return Err(OcrError::Parse("no players found in scoreboard".into()));
    }

    let teams = split_into_teams(players);

    Ok(ParsedMatch {
        players: teams,
        scanned_at: chrono_now_millis(),
    })
}

fn find_header_row(lines: &[&str]) -> Result<usize, OcrError> {
    for (i, line) in lines.iter().enumerate() {
        let upper = line.to_uppercase();
        let has_k = upper.contains('K');
        let has_d = upper.contains('D');
        let has_a = upper.contains('A');
        if has_k && has_d && has_a {
            return Ok(i);
        }
    }
    Err(OcrError::Parse(
        "could not find scoreboard header row (K/D/A columns)".into(),
    ))
}

fn extract_players(lines: &[&str]) -> Result<Vec<ParsedPlayer>, OcrError> {
    let mut players = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.contains("--") || trimmed.contains("===") || trimmed.contains("___") {
            continue;
        }

        let parts = split_columns(trimmed);
        if parts.len() < 4 {
            continue;
        }

        let username = parts[0].trim().to_string();
        let kills = parse_stat(parts.get(1).map(|s| s.as_str()).unwrap_or("0"))?;
        let deaths = parse_stat(parts.get(2).map(|s| s.as_str()).unwrap_or("0"))?;
        let assists = parse_stat(parts.get(3).map(|s| s.as_str()).unwrap_or("0"))?;

        if username.is_empty() || username.chars().all(|c| c.is_numeric()) {
            continue;
        }

        players.push(ParsedPlayer {
            username: clean_username(&username),
            kills,
            deaths,
            assists,
            won: false,
            team_id: String::new(),
            confidence: 0.5,
        });
    }

    Ok(players)
}

/// Split a line into columns by whitespace, respecting that usernames may
/// contain spaces. Strategy: collect all leading non-numeric tokens as the
/// username, then split remaining numeric columns.
fn split_columns(line: &str) -> Vec<String> {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    if tokens.len() < 4 {
        return tokens.into_iter().map(String::from).collect();
    }

    let mut username_end = 0;
    for (i, tok) in tokens.iter().enumerate() {
        let clean = tok.trim_end_matches(|c: char| c.is_ascii_punctuation());
        if looks_like_number(clean) && i > 0 {
            username_end = i;
            break;
        }
        if i == tokens.len() - 1 {
            username_end = tokens.len();
        }
    }

    if username_end == 0 {
        username_end = tokens.len().saturating_sub(3);
        if username_end == 0 {
            username_end = 1;
        }
    }

    let username = tokens[..username_end].join(" ");
    let mut result = vec![username];
    for t in &tokens[username_end..] {
        result.push(t.to_string());
    }
    result
}

fn looks_like_number(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    s.chars().all(|c| c.is_ascii_digit())
}

fn parse_stat(raw: &str) -> Result<i32, OcrError> {
    let cleaned: String = raw
        .chars()
        .map(|c| match c {
            'O' | 'o' => '0',
            'l' | 'I' | '|' => '1',
            'S' | 's' => '5',
            'B' => '8',
            'g' | 'q' => '9',
            _ => c,
        })
        .filter(|c| c.is_ascii_digit() || *c == '-')
        .collect();

    cleaned
        .parse::<i32>()
        .map_err(|_| OcrError::Parse(format!("could not parse stat from '{}'", raw)))
}

fn clean_username(raw: &str) -> String {
    raw.trim_matches(|c: char| c.is_ascii_punctuation())
        .trim()
        .to_string()
}

/// Split players into team A (winners) and team B (losers).
/// The scoreboard typically lists team A first, then team B.
fn split_into_teams(mut players: Vec<ParsedPlayer>) -> Vec<ParsedPlayer> {
    let n = players.len();
    if n < 2 {
        return players;
    }
    let mid = n / 2;
    for (i, p) in players.iter_mut().enumerate() {
        if i < mid {
            p.team_id = "A".into();
            p.won = true;
        } else {
            p.team_id = "B".into();
            p.won = false;
        }
    }
    players
}

fn chrono_now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_columns_simple() {
        let result = split_columns("Player1  5  3  2  1200");
        let expected: Vec<String> = vec!["Player1", "5", "3", "2", "1200"]
            .into_iter()
            .map(String::from)
            .collect();
        assert_eq!(result, expected);
    }

    #[test]
    fn test_split_columns_multiword_username() {
        let result = split_columns("Player One 10 4 2 1500");
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], "Player One".to_string());
    }

    #[test]
    fn test_parse_stat_with_ocr_errors() {
        assert_eq!(parse_stat("1O").unwrap(), 10);
        assert_eq!(parse_stat("S").unwrap(), 5);
        assert_eq!(parse_stat("l").unwrap(), 1);
    }

    #[test]
    fn test_parse_scoreboard_typical() {
        let text = "\n\
        Map: Clubhouse\n\
        K  D  A\n\
        Player1  5  3  2\n\
        Player2  4  1  6\n\
        Player3  7  5  1\n\
        Player4  3  6  3\n\
        Player5  2  4  5\n\
        Player6  8  2  0\n\
        Player7  1  7  2\n\
        Player8  6  3  4\n\
        Player9  4  4  3\n\
        Player10 9  1  2\n";

        let result = parse_scoreboard_text(text).unwrap();
        assert_eq!(result.players.len(), 10);
        assert_eq!(result.players[0].team_id, "A");
        assert_eq!(result.players[0].won, true);
        assert_eq!(result.players[5].team_id, "B");
        assert_eq!(result.players[5].won, false);
    }
}
