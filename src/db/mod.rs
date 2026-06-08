//! Database layer.
//!
//! * [`pool`] builds and owns the bb8 + diesel-async Postgres pool.
//! * [`schema`] is the Diesel-generated schema (hand-written here because we
//!   don't ship `diesel print-schema` into CI; it mirrors the SQL migrations
//!   exactly).
//! * [`models`] holds Queryable/Insertable/AsChangeset structs per table.
//! * [`repos`] holds per-aggregate async repository structs.

#![allow(dead_code)] // Individual tasks fill this in; surfaces land task by task.

pub mod models;
pub mod pool;
pub mod repos;
pub mod schema;

/// Embedded migrations bundle. Used by [`pool::run_migrations`] on startup
/// when `RUN_MIGRATIONS=1`.
pub const MIGRATIONS: diesel_migrations::EmbeddedMigrations =
    diesel_migrations::embed_migrations!("migrations");

/// The `games` Postgres enum, mirrored in Rust.
///
/// Adding a game: extend this enum **and** ship a matching
/// `ALTER TYPE games ADD VALUE '…'` migration. Composite uniqueness on every
/// game-scoped table means the new value becomes usable the moment the
/// migration lands.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    diesel_derive_enum::DbEnum,
)]
#[ExistingTypePath = "crate::db::schema::sql_types::Games"]
#[serde(rename_all = "lowercase")]
pub enum Game {
    R6,
}

impl Game {
    pub fn as_str(&self) -> &'static str {
        match self {
            Game::R6 => "r6",
        }
    }
}

impl std::fmt::Display for Game {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Game {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "r6" | "R6" => Ok(Game::R6),
            other => Err(format!("unknown game: {other}")),
        }
    }
}

/// The `languages` Postgres enum, mirrored in Rust.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    serde::Serialize,
    serde::Deserialize,
    diesel_derive_enum::DbEnum,
)]
#[ExistingTypePath = "crate::db::schema::sql_types::Languages"]
#[serde(rename_all = "lowercase")]
pub enum Language {
    En,
    De,
}

impl Language {
    pub fn as_str(&self) -> &'static str {
        match self {
            Language::En => "en",
            Language::De => "de",
        }
    }
}

impl std::fmt::Display for Language {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Language {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "en" | "EN" => Ok(Language::En),
            "de" | "DE" => Ok(Language::De),
            other => Err(format!("unknown language: {other}")),
        }
    }
}
