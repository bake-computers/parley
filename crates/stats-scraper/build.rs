//! Build script: compile proto files using `protox` (pure-Rust, no protoc needed)
//! and hand the descriptor set to `prost-build` for Rust struct generation.

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let workspace_root = workspace_root();
    let proto_root = workspace_root.join("proto");

    let protos = [
        proto_root.join("common/v1/types.proto"),
        proto_root.join("stats/v1/stats.proto"),
    ];

    // Use protox to parse the .proto files into a FileDescriptorSet without needing protoc.
    let file_descriptor_set = protox::compile(protos.iter(), [&proto_root])?;

    // Tell Cargo to re-run when any watched proto file changes.
    for p in &protos {
        println!("cargo:rerun-if-changed={}", p.display());
    }

    prost_build::Config::new()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".", "#[serde(rename_all = \"camelCase\")]")
        .message_attribute(".", "#[serde(default)]")
        .compile_fds(file_descriptor_set)?;

    Ok(())
}

fn workspace_root() -> PathBuf {
    // CARGO_MANIFEST_DIR is `.../crates/stats-scraper`; workspace root is two levels up.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .and_then(|p| p.parent())
        .map(PathBuf::from)
        .unwrap_or(manifest)
}
