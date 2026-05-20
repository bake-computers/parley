//! Multi-progress display using indicatif for Vessel CLI operations.
//!
//! [`VesselProgress`] renders three spinner bars in a coordinated
//! [`MultiProgress`] display: discovery rate, DB write latency, and
//! active sync count. Each bar auto-ticks via `enable_steady_tick`.

use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::time::Duration;

pub struct VesselProgress {
    pub multi: MultiProgress,
    pub discovery_rate: ProgressBar,
    pub db_write_latency: ProgressBar,
    pub active_syncs: ProgressBar,
}

impl VesselProgress {
    pub fn new() -> Self {
        let multi = MultiProgress::new();
        let style = ProgressStyle::with_template("{spinner} {msg}: {pos}")
            .expect("static progress template should parse")
            .tick_chars("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏");

        let discovery_rate = {
            let pb = ProgressBar::new_spinner()
                .with_style(style.clone())
                .with_message("Discovery Rate");
            pb.enable_steady_tick(Duration::from_millis(80));
            multi.add(pb)
        };

        let db_write_latency = {
            let pb = ProgressBar::new_spinner()
                .with_style(style.clone())
                .with_message("DB Write Latency");
            pb.enable_steady_tick(Duration::from_millis(80));
            multi.add(pb)
        };

        let active_syncs = {
            let pb = ProgressBar::new_spinner()
                .with_style(style)
                .with_message("Active Syncs");
            pb.enable_steady_tick(Duration::from_millis(80));
            multi.add(pb)
        };

        Self {
            multi,
            discovery_rate,
            db_write_latency,
            active_syncs,
        }
    }
}

impl Default for VesselProgress {
    fn default() -> Self {
        Self::new()
    }
}
