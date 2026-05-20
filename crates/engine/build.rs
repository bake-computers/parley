//! Build script: compile proto files using `protox` for the engine service.

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let workspace_root = workspace_root();
    let proto_root = workspace_root.join("proto");

    let protos = [
        proto_root.join("common/v1/types.proto"),
        proto_root.join("engine/v1/engine.proto"),
    ];

    let file_descriptor_set = protox::compile(protos.iter(), [&proto_root])?;

    for p in &protos {
        println!("cargo:rerun-if-changed={}", p.display());
    }

    prost_build::Config::new()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".", "#[serde(rename_all = \"snake_case\")]")
        .message_attribute(".", "#[serde(default)]")
        .compile_fds(file_descriptor_set)?;

    Ok(())
}

fn workspace_root() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .and_then(|p| p.parent())
        .map(PathBuf::from)
        .unwrap_or(manifest)
}
