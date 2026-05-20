use leptess::LepTess;
use std::time::Duration;

use crate::parse::{parse_scoreboard_text, ParsedMatch};
use crate::OcrError;

pub struct OcrClient {
    http: reqwest::Client,
}

impl Default for OcrClient {
    fn default() -> Self {
        Self::new()
    }
}

impl OcrClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent("parley-ocr/0.1")
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("ocr reqwest client builds");

        Self { http }
    }

    /// Download an R6 scoreboard screenshot and run Tesseract OCR on it.
    ///
    /// The image is downloaded via HTTP, then OCR runs on a blocking thread
    /// because `leptess::LepTess` uses C thread-local state and is `!Send`.
    pub async fn scan_screenshot(&self, image_url: &str) -> Result<ParsedMatch, OcrError> {
        let response = self.http.get(image_url).send().await.map_err(|e| {
            tracing::warn!(url = %image_url, error = %e, "ocr download request failed");
            OcrError::Download(e)
        })?;
        let image_bytes = response.error_for_status()?.bytes().await?;

        let url_owned = image_url.to_string();
        let result = tokio::task::spawn_blocking(move || run_tesseract(&image_bytes))
            .await
            .map_err(|e| OcrError::Ocr(format!("OCR task panicked: {e}")))?;

        match result {
            Ok(text) => {
                tracing::debug!(url = %url_owned, len = text.len(), "ocr text extracted");
                parse_scoreboard_text(&text)
            }
            Err(e) => Err(e),
        }
    }
}

fn run_tesseract(image_bytes: &[u8]) -> Result<String, OcrError> {
    let mut lt = LepTess::new(None, "eng")
        .map_err(|e| OcrError::Ocr(format!("failed to init Tesseract: {e}")))?;

    lt.set_image_from_mem(image_bytes)
        .map_err(|e| OcrError::Ocr(format!("failed to load image into Tesseract: {e}")))?;

    let text = lt
        .get_utf8_text()
        .map_err(|e| OcrError::Ocr(format!("OCR text extraction failed: {e}")))?;

    Ok(text)
}
