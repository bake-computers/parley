//! Image rendering engine for Parley profile/account/badge cards.
//!
//! Pure library crate. The `EngineService` handlers live in the
//! `engine-service` binary and delegate to functions in this crate.
//!
//! Design notes:
//!   * The engine is configured with a `FontArc` at construction; it does not
//!     ship a default font to callers who want to bring their own. Built-in
//!     assets embed an open-license fallback (Noto Sans) when the `embedded-font`
//!     feature is on (default).
//!   * Rank badges are procedural colored discs so the crate stays
//!     self-contained without shipping real rank artwork. Swap `rank::badge`
//!     for a `include_bytes!` asset lookup when production PNGs are in place.

pub mod avatar;
pub mod card;
pub mod rank;
pub mod text;

pub mod proto {
    pub mod common {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/parley.common.v1.rs"));
        }
    }
    pub mod engine {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/parley.engine.v1.rs"));
        }
    }
}

pub use card::{
    render_account_card, render_badge_strip, render_profile_card, Engine, EngineError,
    RenderedImage, RenderedImageFormat,
};
