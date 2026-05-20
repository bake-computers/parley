use serde::{Deserialize, Serialize};

/// Errors that can occur when building an [`InteractionPayload`] with a builder.
#[derive(Debug)]
pub enum BuildError {
    MissingField(&'static str),
}

impl std::fmt::Display for BuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BuildError::MissingField(field) => {
                write!(f, "InteractionBuilder: {field} is required but not set")
            }
        }
    }
}

impl std::error::Error for BuildError {}

/// Interaction types as defined by Discord's API (serialized as integers).
/// See: https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-type
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InteractionType {
    Ping = 1,
    ApplicationCommand = 2,
    MessageComponent = 3,
    Autocomplete = 4,
    ModalSubmit = 5,
}

impl Serialize for InteractionType {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for InteractionType {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = u8::deserialize(deserializer)?;
        match value {
            1 => Ok(InteractionType::Ping),
            2 => Ok(InteractionType::ApplicationCommand),
            3 => Ok(InteractionType::MessageComponent),
            4 => Ok(InteractionType::Autocomplete),
            5 => Ok(InteractionType::ModalSubmit),
            other => Err(serde::de::Error::custom(format!(
                "unknown interaction type: {other}"
            ))),
        }
    }
}

/// A Discord interaction payload serialized to JSON for HTTP request bodies.
/// Only required fields are included; optional fields use `skip_serializing_if`.
#[derive(Debug, Clone, Serialize)]
pub struct InteractionPayload {
    #[serde(rename = "type")]
    pub type_: InteractionType,
    pub id: String,
    pub application_id: String,
    pub token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guild_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub member: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<serde_json::Value>,
}

impl InteractionPayload {
    pub fn builder() -> InteractionBuilder {
        InteractionBuilder::default()
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

/// Builder for InteractionPayload. All required fields must be set before calling build().
/// Optional fields default to None.
#[derive(Debug, Default)]
pub struct InteractionBuilder {
    type_: Option<InteractionType>,
    id: Option<String>,
    application_id: Option<String>,
    token: Option<String>,
    data: Option<serde_json::Value>,
    guild_id: Option<String>,
    channel_id: Option<String>,
    member: Option<serde_json::Value>,
    user: Option<serde_json::Value>,
}

impl InteractionBuilder {
    pub fn type_(mut self, t: InteractionType) -> Self {
        self.type_ = Some(t);
        self
    }

    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn application_id(mut self, id: impl Into<String>) -> Self {
        self.application_id = Some(id.into());
        self
    }

    pub fn token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    pub fn guild_id(mut self, id: impl Into<String>) -> Self {
        self.guild_id = Some(id.into());
        self
    }

    pub fn channel_id(mut self, id: impl Into<String>) -> Self {
        self.channel_id = Some(id.into());
        self
    }

    pub fn data(mut self, data: serde_json::Value) -> Self {
        self.data = Some(data);
        self
    }

    pub fn member(mut self, member: serde_json::Value) -> Self {
        self.member = Some(member);
        self
    }

    pub fn user(mut self, user: serde_json::Value) -> Self {
        self.user = Some(user);
        self
    }

    /// Build the [`InteractionPayload`] from this builder.
    ///
    /// Returns [`BuildError`] if any required field is missing.
    pub fn build(self) -> Result<InteractionPayload, BuildError> {
        Ok(InteractionPayload {
            type_: self.type_.ok_or(BuildError::MissingField("type_"))?,
            id: self.id.ok_or(BuildError::MissingField("id"))?,
            application_id: self
                .application_id
                .ok_or(BuildError::MissingField("application_id"))?,
            token: self.token.ok_or(BuildError::MissingField("token"))?,
            data: self.data,
            guild_id: self.guild_id,
            channel_id: self.channel_id,
            member: self.member,
            user: self.user,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payload_json_matches_schema() {
        let payload = InteractionPayload::builder()
            .type_(InteractionType::ApplicationCommand)
            .id("123456789")
            .application_id("987654321")
            .token("abc123token")
            .build()
            .expect("build must succeed");

        let json = payload.to_json().expect("serialization must succeed");

        assert!(json.contains("\"type\":2"));
        assert!(json.contains("\"id\":\"123456789\""));
        assert!(json.contains("\"application_id\":\"987654321\""));
        assert!(json.contains("\"token\":\"abc123token\""));
    }

    #[test]
    fn test_payload_optional_fields_omitted() {
        let payload = InteractionPayload::builder()
            .type_(InteractionType::Ping)
            .id("1")
            .application_id("1")
            .token("t")
            .build()
            .expect("build must succeed");

        let json = payload.to_json().expect("serialization must succeed");

        assert!(!json.contains("guild_id"));
        assert!(!json.contains("channel_id"));
        assert!(!json.contains("\"data\""));
        assert!(!json.contains("\"member\""));
        assert!(!json.contains("\"user\""));
    }

    #[test]
    fn test_payload_with_optional_fields() {
        let payload = InteractionPayload::builder()
            .type_(InteractionType::MessageComponent)
            .id("comp-1")
            .application_id("app-1")
            .token("tok-1")
            .guild_id("guild-1")
            .channel_id("chan-1")
            .data(serde_json::json!({"custom_id": "btn_click"}))
            .build()
            .expect("build must succeed");

        let json = payload.to_json().expect("serialization must succeed");
        assert!(json.contains("\"guild_id\":\"guild-1\""));
        assert!(json.contains("\"channel_id\":\"chan-1\""));
        assert!(json.contains("\"custom_id\":\"btn_click\""));
    }

    #[test]
    fn test_interaction_type_serializes_as_integer() {
        let payload = InteractionPayload::builder()
            .type_(InteractionType::Autocomplete)
            .id("a")
            .application_id("a")
            .token("a")
            .build()
            .expect("build must succeed");

        let json = payload.to_json().expect("serialization must succeed");
        assert!(json.contains("\"type\":4"));
    }

    #[test]
    fn test_to_json_roundtrip_matches_builder_input() {
        let payload = InteractionPayload::builder()
            .type_(InteractionType::ModalSubmit)
            .id("modal-123")
            .application_id("app-456")
            .token("tok-789")
            .guild_id("guild-modal")
            .channel_id("chan-modal")
            .data(serde_json::json!({"custom_id": "modal_form", "components": []}))
            .build()
            .expect("build must succeed");

        let json = payload.to_json().expect("serialization must succeed");

        let parsed: serde_json::Value =
            serde_json::from_str(&json).expect("must parse back as valid JSON");

        assert_eq!(parsed["type"], 5);
        assert_eq!(parsed["id"], "modal-123");
        assert_eq!(parsed["application_id"], "app-456");
        assert_eq!(parsed["token"], "tok-789");
        assert_eq!(parsed["guild_id"], "guild-modal");
        assert_eq!(parsed["data"]["custom_id"], "modal_form");
    }
}
