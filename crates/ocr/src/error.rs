#[derive(Debug, thiserror::Error)]
pub enum OcrError {
    #[error("image download failed: {0}")]
    Download(#[from] reqwest::Error),
    #[error("OCR processing failed: {0}")]
    Ocr(String),
    #[error("scoreboard parse failed: {0}")]
    Parse(String),
}
