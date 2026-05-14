//! Prometheus metrics installer.
//!
//! Install a process-global recorder once at startup; `/metrics` renders the
//! accumulated snapshot on demand.

use std::sync::OnceLock;

use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle as InnerHandle};

#[derive(Clone)]
pub struct PrometheusHandle {
    inner: InnerHandle,
}

impl PrometheusHandle {
    pub fn render(&self) -> String {
        self.inner.render()
    }
}

static HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();

/// Install the recorder globally; idempotent.
pub fn install_recorder() {
    HANDLE.get_or_init(|| {
        let inner = PrometheusBuilder::new()
            .install_recorder()
            .expect("install Prometheus recorder");
        PrometheusHandle { inner }
    });
}

/// Returns the installed handle (or `None` if `install_recorder` was never
/// called — e.g. in unit tests that build a bare `AppContext`).
pub fn handle() -> Option<PrometheusHandle> {
    HANDLE.get().cloned()
}
