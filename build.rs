//! Build script: compile identity + guild protos for the engine-service crate
//! using `protox` (no protoc required).

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let proto_root = manifest.join("proto");

    let protos = [
        proto_root.join("common/v1/types.proto"),
        proto_root.join("identity/v1/identity.proto"),
        proto_root.join("guild/v1/guild.proto"),
        proto_root.join("ocr/v1/ocr.proto"),
    ];

    for p in &protos {
        println!("cargo:rerun-if-changed={}", p.display());
    }

    let file_descriptor_set = protox::compile(protos.iter(), [&proto_root])?;

    prost_build::Config::new()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".", "#[serde(rename_all = \"camelCase\")]")
        .message_attribute(".", "#[serde(default)]")
        .compile_fds(file_descriptor_set)?;

    Ok(())
}
