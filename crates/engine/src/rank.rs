//! Rank icon lookup. Returns a procedurally-rendered colored disc keyed by
//! `RankTier`. Replace with `include_bytes!` assets when real rank art ships.

use crate::proto::common::v1::RankTier;
use image::{Rgba, RgbaImage};
use imageproc::drawing::{draw_filled_circle_mut, draw_hollow_circle_mut};

/// Colour palette for each rank tier. Chosen to be visually distinguishable on
/// a dark grey card background.
pub fn tier_color(tier: RankTier) -> [u8; 4] {
    match tier {
        RankTier::Unspecified => [120, 120, 120, 255],
        RankTier::Iron => [90, 90, 90, 255],
        RankTier::Bronze => [176, 120, 60, 255],
        RankTier::Silver => [190, 200, 210, 255],
        RankTier::Gold => [230, 190, 70, 255],
        RankTier::Platinum => [120, 200, 210, 255],
        RankTier::Diamond => [120, 180, 240, 255],
        RankTier::Master => [180, 120, 240, 255],
        RankTier::Grandmaster => [230, 120, 120, 255],
        RankTier::Challenger => [240, 220, 80, 255],
    }
}

/// Short two-letter label for the tier, used on procedural badges.
pub fn tier_short_label(tier: RankTier) -> &'static str {
    match tier {
        RankTier::Unspecified => "??",
        RankTier::Iron => "IR",
        RankTier::Bronze => "BR",
        RankTier::Silver => "SI",
        RankTier::Gold => "GO",
        RankTier::Platinum => "PL",
        RankTier::Diamond => "DI",
        RankTier::Master => "MA",
        RankTier::Grandmaster => "GM",
        RankTier::Challenger => "CH",
    }
}

/// Render a rank badge as an RGBA disc with a darker ring and inner fill.
/// Size is the outer bounding box (width == height).
pub fn badge(tier: RankTier, size: u32) -> RgbaImage {
    let mut img = RgbaImage::new(size, size);
    let [r, g, b, a] = tier_color(tier);
    let center = (size as i32 / 2, size as i32 / 2);
    let radius = (size as i32 / 2) - 1;

    // Outer ring: slightly darker.
    let ring_color = Rgba([
        r.saturating_sub(40),
        g.saturating_sub(40),
        b.saturating_sub(40),
        a,
    ]);
    let fill_color = Rgba([r, g, b, a]);

    draw_filled_circle_mut(&mut img, center, radius, ring_color);
    draw_filled_circle_mut(&mut img, center, (radius * 85) / 100, fill_color);
    draw_hollow_circle_mut(&mut img, center, radius, ring_color);

    img
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_has_expected_dimensions() {
        let b = badge(RankTier::Diamond, 64);
        assert_eq!(b.width(), 64);
        assert_eq!(b.height(), 64);
    }

    #[test]
    fn badge_center_pixel_matches_tier_colour() {
        let b = badge(RankTier::Gold, 64);
        let px = b.get_pixel(32, 32);
        assert_eq!(px[0], 230);
        assert_eq!(px[1], 190);
        assert_eq!(px[2], 70);
    }

    #[test]
    fn all_tiers_have_distinct_short_labels() {
        let tiers = [
            RankTier::Iron,
            RankTier::Bronze,
            RankTier::Silver,
            RankTier::Gold,
            RankTier::Platinum,
            RankTier::Diamond,
            RankTier::Master,
            RankTier::Grandmaster,
            RankTier::Challenger,
        ];
        let labels: std::collections::HashSet<&str> =
            tiers.iter().copied().map(tier_short_label).collect();
        assert_eq!(labels.len(), tiers.len());
    }
}
