mod error;
mod parse;
mod scan;

pub use error::OcrError;
pub use parse::{ParsedMatch, ParsedPlayer, parse_scoreboard_text};
pub use scan::OcrClient;
