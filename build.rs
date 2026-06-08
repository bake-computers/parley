//! Build script: compile identity + guild protos for the parley binary
//! using `protox` (no protoc required).

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let proto_root = manifest.join("proto");

    let protos = [
        proto_root.join("common/v1/types.proto"),
        proto_root.join("identity/v1/identity.proto"),
        proto_root.join("guild/v1/guild.proto"),
        proto_root.join("stats/v1/stats.proto"),
        proto_root.join("leaderboard/v1/leaderboard.proto"),
        proto_root.join("user/v1/user.proto"),
        proto_root.join("matchmaking/v1/matchmaking.proto"),
        proto_root.join("tournament/v1/tournament.proto"),
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
