mod error;
mod parse;
mod scan;

pub use error::OcrError;
pub use parse::{parse_scoreboard_text, ParsedMatch, ParsedPlayer};
pub use scan::OcrClient;
