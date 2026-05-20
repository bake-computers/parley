//! Generated protobuf types for services owned by the engine-service crate.
//!
//! * `parley.common.v1` is re-compiled here (even though stats-scraper/engine
//!   already have copies) so the identity+guild handlers can refer to the
//!   same generated enum types as the rest of this crate.

pub mod common {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/parley.common.v1.rs"));
    }
}

pub mod identity {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/parley.identity.v1.rs"));
    }
}

pub mod guild {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/parley.guild.v1.rs"));
    }
}

pub mod ocr {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/parley.ocr.v1.rs"));
    }
}
