use chrono::Utc;
use uuid::Uuid;
use vessel::session::{NewVesselSession, VesselSession};

#[test]
fn vessel_session_model_compiles() {
    let session = VesselSession {
        id: 1,
        session_id: Uuid::new_v4(),
        started_at: Utc::now(),
        status: "active".to_string(),
        seed_player: "test_player".to_string(),
        players_discovered: 0,
        players_inserted: 0,
        interactions_sent: 0,
    };
    assert_eq!(session.status, "active");
}

#[test]
fn new_vessel_session_model_compiles() {
    let session_id = Uuid::new_v4();
    let new_session = NewVesselSession {
        session_id,
        started_at: Utc::now(),
        status: "active",
        seed_player: "test_player",
        players_discovered: 0,
        players_inserted: 0,
        interactions_sent: 0,
    };
    assert_eq!(new_session.status, "active");
    assert_eq!(new_session.seed_player, "test_player");
}
