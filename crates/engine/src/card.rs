//! Profile / account / badge card compositor.

use crate::avatar::{AvatarError, decode_and_circular_crop, fetch_avatar};
use crate::proto::common::v1::{PlayerStats, Rank, RankTier};
use crate::proto::engine::v1::{
    AccountCardRequest, BadgeStripRequest, ImageFormat, ProfileCardRequest,
};
use crate::rank;
use crate::text;
use ab_glyph::FontArc;
use bytes::Bytes;
use image::{Rgba, RgbaImage, imageops};
use once_cell::sync::Lazy;
use reqwest::Client;
use std::io::Cursor;
use thiserror::Error;

// ---------- constants ----------

/// Default card dimensions for profile cards.
pub const PROFILE_CARD_WIDTH: u32 = 800;
pub const PROFILE_CARD_HEIGHT: u32 = 240;
/// Background colour — deep blue-grey.
pub const BG_COLOR: [u8; 4] = [26, 26, 46, 255];
/// Accent colour used for outlines and dividers.
pub const ACCENT_COLOR: [u8; 4] = [60, 65, 100, 255];
/// Primary foreground text.
pub const FG_COLOR: [u8; 4] = [230, 232, 240, 255];
/// Muted foreground for labels.
pub const FG_MUTED: [u8; 4] = [150, 155, 175, 255];

// ---------- embedded font ----------

/// Noto Sans Regular embedded via `include_bytes!`. SIL OFL 1.1.
const EMBEDDED_FONT: &[u8] = include_bytes!("../assets/fonts/NotoSans-Regular.ttf");

static DEFAULT_FONT: Lazy<FontArc> =
    Lazy::new(|| FontArc::try_from_slice(EMBEDDED_FONT).expect("embedded font is valid"));

/// Access the default embedded font. Consumers that want a different typeface
/// can construct an [`Engine`] with a custom `FontArc`.
pub fn default_font() -> FontArc {
    DEFAULT_FONT.clone()
}

// ---------- engine ----------

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("avatar fetch/decode failed: {0}")]
    Avatar(#[from] AvatarError),
    #[error("encode failed: {0}")]
    Encode(#[from] image::ImageError),
    #[error("encode io: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenderedImageFormat {
    Png,
    Webp,
}

impl From<RenderedImageFormat> for image::ImageFormat {
    fn from(v: RenderedImageFormat) -> Self {
        match v {
            RenderedImageFormat::Png => image::ImageFormat::Png,
            RenderedImageFormat::Webp => image::ImageFormat::WebP,
        }
    }
}

impl RenderedImageFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            RenderedImageFormat::Png => "png",
            RenderedImageFormat::Webp => "webp",
        }
    }

    /// Map from the generated proto enum.
    pub fn from_proto(v: ImageFormat) -> Self {
        match v {
            ImageFormat::Webp => RenderedImageFormat::Webp,
            // Unspecified falls back to PNG (lossless and widely supported).
            _ => RenderedImageFormat::Png,
        }
    }
}

#[derive(Clone, Debug)]
pub struct RenderedImage {
    pub bytes: Bytes,
    pub format: RenderedImageFormat,
    pub width: u32,
    pub height: u32,
}

/// Shared renderer. Holds a font and reqwest client so callers can reuse both.
#[derive(Clone)]
pub struct Engine {
    font: FontArc,
    http: Client,
}

impl Default for Engine {
    fn default() -> Self {
        Self::with_font(default_font())
    }
}

impl Engine {
    pub fn with_font(font: FontArc) -> Self {
        let http = Client::builder()
            .user_agent("parley-engine/0.1")
            .build()
            .expect("reqwest client builds");
        Self { font, http }
    }

    pub fn with_font_and_client(font: FontArc, http: Client) -> Self {
        Self { font, http }
    }

    pub fn font(&self) -> &FontArc {
        &self.font
    }

    pub async fn render_profile_card(
        &self,
        req: &ProfileCardRequest,
    ) -> Result<RenderedImage, EngineError> {
        let avatar = self.fetch_avatar_if_present(&req.avatar_url, 160).await?;
        let canvas = compose_profile_card(
            &self.font,
            &req.username,
            req.rank.as_ref(),
            req.stats.as_ref(),
            req.is_top_100,
            avatar.as_ref(),
        );
        encode(
            canvas,
            RenderedImageFormat::from_proto(render_format(&req.options)),
        )
    }

    pub async fn render_account_card(
        &self,
        req: &AccountCardRequest,
    ) -> Result<RenderedImage, EngineError> {
        let avatar = self.fetch_avatar_if_present(&req.avatar_url, 128).await?;
        let canvas = compose_account_card(
            &self.font,
            &req.username,
            &req.game_username,
            req.rank.as_ref(),
            avatar.as_ref(),
        );
        encode(
            canvas,
            RenderedImageFormat::from_proto(render_format(&req.options)),
        )
    }

    pub async fn render_badge_strip(
        &self,
        req: &BadgeStripRequest,
    ) -> Result<RenderedImage, EngineError> {
        let canvas = compose_badge_strip(&self.font, &req.badges, req.max_display);
        encode(
            canvas,
            RenderedImageFormat::from_proto(render_format(&req.options)),
        )
    }

    async fn fetch_avatar_if_present(
        &self,
        url: &str,
        size: u32,
    ) -> Result<Option<RgbaImage>, EngineError> {
        if url.is_empty() {
            return Ok(None);
        }
        let bytes = fetch_avatar(&self.http, url).await?;
        let img = decode_and_circular_crop(&bytes, size)?;
        Ok(Some(img))
    }
}

fn render_format(options: &Option<crate::proto::engine::v1::RenderOptions>) -> ImageFormat {
    options
        .as_ref()
        .and_then(|o| ImageFormat::try_from(o.format).ok())
        .unwrap_or(ImageFormat::Unspecified)
}

// ---------- convenience top-level functions ----------

pub async fn render_profile_card(req: &ProfileCardRequest) -> Result<RenderedImage, EngineError> {
    Engine::default().render_profile_card(req).await
}

pub async fn render_account_card(req: &AccountCardRequest) -> Result<RenderedImage, EngineError> {
    Engine::default().render_account_card(req).await
}

pub async fn render_badge_strip(req: &BadgeStripRequest) -> Result<RenderedImage, EngineError> {
    Engine::default().render_badge_strip(req).await
}

// ---------- compose: profile card ----------

fn base_canvas(width: u32, height: u32) -> RgbaImage {
    let mut img = RgbaImage::from_pixel(width, height, Rgba(BG_COLOR));
    // Rounded-corner effect via a subtle top highlight and bottom shadow.
    for x in 0..width {
        img.put_pixel(x, 0, Rgba([60, 65, 100, 255]));
        img.put_pixel(x, height - 1, Rgba([10, 10, 20, 255]));
    }
    img
}

fn compose_profile_card(
    font: &FontArc,
    username: &str,
    rank: Option<&Rank>,
    stats: Option<&PlayerStats>,
    is_top_100: bool,
    avatar: Option<&RgbaImage>,
) -> RgbaImage {
    let mut img = base_canvas(PROFILE_CARD_WIDTH, PROFILE_CARD_HEIGHT);

    // Left gutter: avatar circle with rank badge overlay in bottom-right corner.
    let avatar_x: i32 = 32;
    let avatar_y: i32 = (PROFILE_CARD_HEIGHT as i32 - 160) / 2;
    if let Some(av) = avatar {
        imageops::overlay(&mut img, av, avatar_x as i64, avatar_y as i64);
    } else {
        // Placeholder circle when no avatar URL was supplied.
        let placeholder = rank::badge(RankTier::Unspecified, 160);
        imageops::overlay(&mut img, &placeholder, avatar_x as i64, avatar_y as i64);
    }

    let tier = rank.map(|r| r.tier()).unwrap_or(RankTier::Unspecified);
    let badge = rank::badge(tier, 64);
    imageops::overlay(
        &mut img,
        &badge,
        (avatar_x + 160 - 56) as i64,
        (avatar_y + 160 - 56) as i64,
    );

    // Right content column.
    let content_x: i32 = 220;
    let mut y = avatar_y;
    text::draw_text(&mut img, font, username, content_x, y, 32.0, FG_COLOR);
    y += 42;

    if is_top_100 {
        let label = match rank.map(|r| r.position) {
            Some(p) if p > 0 => format!("TOP 100 — #{p}"),
            _ => "TOP 100".to_string(),
        };
        text::draw_text(
            &mut img,
            font,
            &label,
            content_x,
            y,
            18.0,
            [240, 220, 80, 255],
        );
        y += 24;
    }

    let rank_line = match rank {
        Some(r) => format!(
            "{} · {} pts",
            rank::tier_short_label(r.tier()),
            r.rating.max(0),
        ),
        None => "Unranked".to_string(),
    };
    text::draw_text(&mut img, font, &rank_line, content_x, y, 20.0, FG_MUTED);
    y += 36;

    if let Some(stats) = stats {
        let stats_line_a = format!(
            "W/L {}-{} · KD {:.2}",
            stats.wins, stats.losses, stats.kd_ratio,
        );
        let stats_line_b = format!(
            "Matches {} · Win% {:.1}",
            stats.matches_played, stats.win_rate,
        );
        text::draw_text(&mut img, font, &stats_line_a, content_x, y, 18.0, FG_COLOR);
        y += 26;
        text::draw_text(&mut img, font, &stats_line_b, content_x, y, 18.0, FG_COLOR);
    } else {
        text::draw_text(
            &mut img,
            font,
            "No stats available",
            content_x,
            y,
            18.0,
            FG_MUTED,
        );
    }

    img
}

fn compose_account_card(
    font: &FontArc,
    username: &str,
    game_username: &str,
    rank: Option<&Rank>,
    avatar: Option<&RgbaImage>,
) -> RgbaImage {
    let w: u32 = 520;
    let h: u32 = 180;
    let mut img = base_canvas(w, h);

    let avatar_size: u32 = 120;
    let avatar_x: i32 = 24;
    let avatar_y: i32 = ((h - avatar_size) / 2) as i32;
    if let Some(av) = avatar {
        imageops::overlay(&mut img, av, avatar_x as i64, avatar_y as i64);
    }

    let tier = rank.map(|r| r.tier()).unwrap_or(RankTier::Unspecified);
    let badge = rank::badge(tier, 48);
    imageops::overlay(
        &mut img,
        &badge,
        (avatar_x + avatar_size as i32 - 40) as i64,
        (avatar_y + avatar_size as i32 - 40) as i64,
    );

    let cx: i32 = 170;
    let mut y: i32 = 32;
    text::draw_text(&mut img, font, username, cx, y, 28.0, FG_COLOR);
    y += 36;
    let game_line = if game_username.is_empty() {
        "No linked account".to_string()
    } else {
        format!("R6: {game_username}")
    };
    text::draw_text(&mut img, font, &game_line, cx, y, 18.0, FG_MUTED);
    y += 32;
    let rank_line = match rank {
        Some(r) => format!(
            "{} · {} pts",
            rank::tier_short_label(r.tier()),
            r.rating.max(0),
        ),
        None => "Unranked".to_string(),
    };
    text::draw_text(&mut img, font, &rank_line, cx, y, 20.0, FG_COLOR);

    img
}

fn compose_badge_strip(
    font: &FontArc,
    badges: &[crate::proto::common::v1::Badge],
    max_display: i32,
) -> RgbaImage {
    let effective_max = if max_display <= 0 {
        badges.len()
    } else {
        (max_display as usize).min(badges.len())
    };
    let visible = &badges[..effective_max];

    let badge_size: u32 = 64;
    let spacing: u32 = 16;
    let padding: u32 = 16;
    let w = padding * 2
        + if visible.is_empty() {
            200
        } else {
            (badge_size * visible.len() as u32) + spacing * (visible.len() as u32 - 1)
        };
    let h = badge_size + padding * 2;
    let mut img = base_canvas(w, h);

    if visible.is_empty() {
        text::draw_text(
            &mut img,
            font,
            "No badges yet",
            padding as i32,
            (padding + 20) as i32,
            18.0,
            FG_MUTED,
        );
        return img;
    }

    let mut x = padding as i32;
    let y = padding as i32;
    for b in visible {
        // Simple coloured disc labelled with the first letter of the badge id.
        let color = parse_hex_color(&b.color).unwrap_or([90, 100, 180, 255]);
        let mut disc = RgbaImage::new(badge_size, badge_size);
        imageproc::drawing::draw_filled_circle_mut(
            &mut disc,
            (badge_size as i32 / 2, badge_size as i32 / 2),
            (badge_size as i32 / 2) - 1,
            Rgba(color),
        );
        imageops::overlay(&mut img, &disc, x as i64, y as i64);
        let letter = b
            .label
            .chars()
            .next()
            .unwrap_or('?')
            .to_string()
            .to_uppercase();
        let tw = text::text_width(font, &letter, 26.0) as i32;
        text::draw_text(
            &mut img,
            font,
            &letter,
            x + (badge_size as i32 - tw) / 2,
            y + 16,
            26.0,
            [255, 255, 255, 255],
        );
        x += (badge_size + spacing) as i32;
    }

    img
}

fn parse_hex_color(s: &str) -> Option<[u8; 4]> {
    let v = s.trim_start_matches('#');
    if v.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&v[0..2], 16).ok()?;
    let g = u8::from_str_radix(&v[2..4], 16).ok()?;
    let b = u8::from_str_radix(&v[4..6], 16).ok()?;
    Some([r, g, b, 255])
}

// ---------- encoding ----------

fn encode(img: RgbaImage, fmt: RenderedImageFormat) -> Result<RenderedImage, EngineError> {
    let width = img.width();
    let height = img.height();
    let mut buf = Vec::with_capacity((width * height) as usize * 4);
    let dyn_img = image::DynamicImage::ImageRgba8(img);
    dyn_img.write_to(&mut Cursor::new(&mut buf), fmt.into())?;
    Ok(RenderedImage {
        bytes: Bytes::from(buf),
        format: fmt,
        width,
        height,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::common::v1::{PlayerStats, Rank, RankTier};

    #[test]
    fn profile_card_renders_to_valid_png() {
        let font = default_font();
        let rank = Rank {
            tier: RankTier::Diamond as i32,
            rating: 4200,
            position: 42,
        };
        let stats = PlayerStats {
            matches_played: 50,
            wins: 30,
            losses: 20,
            kills: 250,
            deaths: 180,
            kd_ratio: 1.39,
            win_rate: 60.0,
            ..Default::default()
        };
        let img = compose_profile_card(&font, "TestUser", Some(&rank), Some(&stats), true, None);
        assert_eq!(img.width(), PROFILE_CARD_WIDTH);
        assert_eq!(img.height(), PROFILE_CARD_HEIGHT);

        // Background should match the expected dark colour at an empty spot.
        let p = img.get_pixel(1, 20);
        assert_eq!(p[0], BG_COLOR[0]);
        assert_eq!(p[1], BG_COLOR[1]);
        assert_eq!(p[2], BG_COLOR[2]);

        let encoded = encode(img, RenderedImageFormat::Png).unwrap();
        assert!(!encoded.bytes.is_empty());
        // PNG magic.
        assert_eq!(&encoded.bytes[0..4], b"\x89PNG");
    }

    #[test]
    fn account_card_has_reasonable_size() {
        let font = default_font();
        let img = compose_account_card(&font, "User", "SomeR6Name", None, None);
        assert!(img.width() > 300 && img.height() > 100);
    }

    #[test]
    fn badge_strip_with_no_badges_shows_placeholder() {
        let font = default_font();
        let img = compose_badge_strip(&font, &[], 0);
        assert!(img.width() > 100);
        assert!(img.height() > 40);
    }
}
