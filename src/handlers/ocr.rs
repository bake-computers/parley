//! OCR service handler implementations.

use std::sync::Arc;

use ocr::{OcrClient, OcrError, ParsedPlayer};

use crate::proto::common::v1::Error as ProtoError;
use crate::proto::ocr::v1::{
    MatchScanResult, ScanBatchRequest, ScanBatchResponse, ScanScreenshotRequest,
    ScanScreenshotResponse, ScannedPlayer,
};

#[derive(Clone)]
pub struct OcrHandler {
    client: Arc<OcrClient>,
}

impl Default for OcrHandler {
    fn default() -> Self {
        Self {
            client: Arc::new(OcrClient::new()),
        }
    }
}

impl OcrHandler {
    pub async fn scan_screenshot(&self, req: ScanScreenshotRequest) -> ScanScreenshotResponse {
        tracing::info!(url = %req.image_url, "ocr scan request");
        match self.client.scan_screenshot(&req.image_url).await {
            Ok(parsed) => ScanScreenshotResponse {
                success: true,
                result: Some(MatchScanResult {
                    players: parsed.players.into_iter().map(convert_player).collect(),
                    region: 0,
                    mode: String::new(),
                    map: String::new(),
                    scanned_at: parsed.scanned_at,
                }),
                credits_consumed: 0,
                ..Default::default()
            },
            Err(e) => {
                tracing::warn!(url = %req.image_url, error = %e, "ocr scan failed");
                ScanScreenshotResponse {
                    success: false,
                    error: Some(ProtoError {
                        code: error_code_for_ocr_error(&e).into(),
                        message: e.to_string(),
                    }),
                    credits_consumed: 0,
                    ..Default::default()
                }
            }
        }
    }

    pub async fn scan_batch(&self, req: ScanBatchRequest) -> ScanBatchResponse {
        let futs: Vec<_> = req
            .requests
            .into_iter()
            .map(|r| self.scan_screenshot(r))
            .collect();
        let responses = futures_util::future::join_all(futs).await;
        let total_credits = responses.iter().map(|r| r.credits_consumed).sum();
        ScanBatchResponse {
            responses,
            total_credits_consumed: total_credits,
        }
    }
}

fn convert_player(p: ParsedPlayer) -> ScannedPlayer {
    ScannedPlayer {
        username: p.username,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        won: p.won,
        team_id: p.team_id,
        confidence: p.confidence,
    }
}

fn error_code_for_ocr_error(e: &OcrError) -> &'static str {
    match e {
        OcrError::Download(_) => "SCAN_DOWNLOAD_FAILED",
        OcrError::Ocr(_) => "SCAN_OCR_FAILED",
        OcrError::Parse(_) => "SCAN_PARSE_FAILED",
    }
}
