//! Avatar fetch + circular crop.

use bytes::Bytes;
use image::{imageops::FilterType, GenericImageView, Rgba, RgbaImage};
use reqwest::Client;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AvatarError {
    #[error("avatar http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("avatar decode error: {0}")]
    Decode(#[from] image::ImageError),
}

/// Download an avatar image. Shares a `reqwest::Client` by reference to let
/// callers reuse their connection pool.
pub async fn fetch_avatar(client: &Client, url: &str) -> Result<Bytes, AvatarError> {
    let resp = client.get(url).send().await?.error_for_status()?;
    Ok(resp.bytes().await?)
}

/// Decode raw bytes, resize to a square `size` and mask into a circle. Returns
/// an RGBA image with transparent corners.
pub fn decode_and_circular_crop(bytes: &[u8], size: u32) -> Result<RgbaImage, AvatarError> {
    let decoded = image::load_from_memory(bytes)?;
    let square = center_square(&decoded);
    let resized = square.resize_exact(size, size, FilterType::Lanczos3);
    let mut rgba = resized.to_rgba8();
    apply_circular_mask(&mut rgba);
    Ok(rgba)
}

fn center_square(img: &image::DynamicImage) -> image::DynamicImage {
    let (w, h) = img.dimensions();
    let side = w.min(h);
    let x = (w - side) / 2;
    let y = (h - side) / 2;
    img.crop_imm(x, y, side, side)
}

fn apply_circular_mask(img: &mut RgbaImage) {
    let (w, h) = img.dimensions();
    let cx = (w as f32) / 2.0 - 0.5;
    let cy = (h as f32) / 2.0 - 0.5;
    let radius = (w.min(h) as f32) / 2.0;
    for y in 0..h {
        for x in 0..w {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let d = (dx * dx + dy * dy).sqrt();
            if d > radius {
                img.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            } else if d > radius - 1.5 {
                // Antialias the edge slightly.
                let t = ((radius - d) / 1.5).clamp(0.0, 1.0);
                let px = *img.get_pixel(x, y);
                img.put_pixel(x, y, Rgba([px[0], px[1], px[2], (px[3] as f32 * t) as u8]));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    fn build_test_avatar(size: u32) -> Vec<u8> {
        let mut img = RgbImage::new(size, size);
        for y in 0..size {
            for x in 0..size {
                img.put_pixel(x, y, Rgb([100, 180, 240]));
            }
        }
        let dyn_img = image::DynamicImage::ImageRgb8(img);
        let mut out = Vec::new();
        dyn_img
            .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn circular_crop_makes_corners_transparent() {
        let bytes = build_test_avatar(64);
        let rgba = decode_and_circular_crop(&bytes, 64).unwrap();
        let corner = rgba.get_pixel(0, 0);
        assert_eq!(corner[3], 0, "corner pixel should be transparent");
    }

    #[test]
    fn circular_crop_center_pixel_stays_opaque() {
        let bytes = build_test_avatar(64);
        let rgba = decode_and_circular_crop(&bytes, 64).unwrap();
        let center = rgba.get_pixel(32, 32);
        assert_eq!(center[3], 255);
        assert_eq!(center[0], 100);
    }
}
