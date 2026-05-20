//! Text rendering helpers using `ab_glyph`. Simple left-aligned rasterisation
//! directly onto an `RgbaImage`, with manual alpha blending.

use ab_glyph::{Font, FontArc, PxScale, ScaleFont};
use image::{Rgba, RgbaImage};

/// Draw a single line of text. Returns the horizontal extent used.
pub fn draw_text(
    img: &mut RgbaImage,
    font: &FontArc,
    text: &str,
    x: i32,
    y: i32,
    size_px: f32,
    color: [u8; 4],
) -> i32 {
    let scale = PxScale::from(size_px);
    let scaled = font.as_scaled(scale);
    let ascent = scaled.ascent().ceil() as i32;

    let mut pen_x = x as f32;
    let mut last_glyph: Option<ab_glyph::GlyphId> = None;

    for ch in text.chars() {
        let glyph_id = font.glyph_id(ch);
        if let Some(prev) = last_glyph {
            pen_x += scaled.kern(prev, glyph_id);
        }
        let glyph =
            glyph_id.with_scale_and_position(scale, ab_glyph::point(pen_x, (y + ascent) as f32));
        if let Some(outlined) = font.outline_glyph(glyph) {
            let bounds = outlined.px_bounds();
            outlined.draw(|ox, oy, v| {
                let px = bounds.min.x as i32 + ox as i32;
                let py = bounds.min.y as i32 + oy as i32;
                if px < 0 || py < 0 {
                    return;
                }
                if (px as u32) >= img.width() || (py as u32) >= img.height() {
                    return;
                }
                let alpha = (v * (color[3] as f32) / 255.0).clamp(0.0, 1.0);
                if alpha <= 0.0 {
                    return;
                }
                let old = img.get_pixel(px as u32, py as u32);
                let inv = 1.0 - alpha;
                let blended = Rgba([
                    ((color[0] as f32) * alpha + (old[0] as f32) * inv) as u8,
                    ((color[1] as f32) * alpha + (old[1] as f32) * inv) as u8,
                    ((color[2] as f32) * alpha + (old[2] as f32) * inv) as u8,
                    255,
                ]);
                img.put_pixel(px as u32, py as u32, blended);
            });
        }
        pen_x += scaled.h_advance(glyph_id);
        last_glyph = Some(glyph_id);
    }

    pen_x as i32 - x
}

/// Convenience: width of a string at a given font size, in pixels.
pub fn text_width(font: &FontArc, text: &str, size_px: f32) -> f32 {
    let scaled = font.as_scaled(PxScale::from(size_px));
    let mut width = 0.0f32;
    let mut last_glyph: Option<ab_glyph::GlyphId> = None;
    for ch in text.chars() {
        let gid = font.glyph_id(ch);
        if let Some(prev) = last_glyph {
            width += scaled.kern(prev, gid);
        }
        width += scaled.h_advance(gid);
        last_glyph = Some(gid);
    }
    width
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::default_font;

    #[test]
    fn text_width_increases_with_longer_strings() {
        let f = default_font();
        let short = text_width(&f, "Hi", 20.0);
        let long = text_width(&f, "Hello, World!", 20.0);
        assert!(long > short);
    }

    #[test]
    fn draw_text_changes_pixels_within_target_area() {
        let f = default_font();
        let mut img = RgbaImage::from_pixel(200, 60, Rgba([10, 10, 12, 255]));
        draw_text(&mut img, &f, "Hi", 10, 10, 24.0, [255, 255, 255, 255]);

        // Find at least one non-background pixel in the drawn region.
        let mut changed = false;
        for x in 0..60 {
            for y in 0..50 {
                let p = img.get_pixel(x, y);
                if p[0] > 40 {
                    changed = true;
                    break;
                }
            }
            if changed {
                break;
            }
        }
        assert!(changed);
    }
}
