//! Engine service handler implementations.

use engine::Engine;
use engine::proto::common::v1::Error as ProtoError;
use engine::proto::engine::v1::{
    AccountCardRequest, BadgeStripRequest, ImageResponse, ProfileCardRequest,
};
use std::sync::Arc;

#[derive(Clone)]
pub struct EngineHandler {
    engine: Arc<Engine>,
}

impl Default for EngineHandler {
    fn default() -> Self {
        Self {
            engine: Arc::new(Engine::default()),
        }
    }
}

impl EngineHandler {
    pub async fn render_profile_card(&self, req: ProfileCardRequest) -> ImageResponse {
        match self.engine.render_profile_card(&req).await {
            Ok(img) => ImageResponse {
                success: true,
                image_data: img.bytes.to_vec(),
                format: img.format.as_str().to_string(),
                ..Default::default()
            },
            Err(e) => ImageResponse {
                success: false,
                error: Some(ProtoError {
                    code: "RENDER_FAILED".into(),
                    message: e.to_string(),
                }),
                ..Default::default()
            },
        }
    }

    pub async fn render_account_card(&self, req: AccountCardRequest) -> ImageResponse {
        match self.engine.render_account_card(&req).await {
            Ok(img) => ImageResponse {
                success: true,
                image_data: img.bytes.to_vec(),
                format: img.format.as_str().to_string(),
                ..Default::default()
            },
            Err(e) => ImageResponse {
                success: false,
                error: Some(ProtoError {
                    code: "RENDER_FAILED".into(),
                    message: e.to_string(),
                }),
                ..Default::default()
            },
        }
    }

    pub async fn render_badge_strip(&self, req: BadgeStripRequest) -> ImageResponse {
        match self.engine.render_badge_strip(&req).await {
            Ok(img) => ImageResponse {
                success: true,
                image_data: img.bytes.to_vec(),
                format: img.format.as_str().to_string(),
                ..Default::default()
            },
            Err(e) => ImageResponse {
                success: false,
                error: Some(ProtoError {
                    code: "RENDER_FAILED".into(),
                    message: e.to_string(),
                }),
                ..Default::default()
            },
        }
    }
}
