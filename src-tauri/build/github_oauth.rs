//! Build-owner configuration. Only the public OAuth identifier is selected;
//! unrelated dotenv entries are never exported to Cargo or the application.

pub const CLIENT_ID_KEYS: [&str; 2] = [
    "GITSOMETHING_GITHUB_CLIENT_ID",
    "BRANCHLINE_GITHUB_CLIENT_ID",
];

const INVALID_ID: &str = "GitSomething's OAuth Client ID is invalid. Set GITSOMETHING_GITHUB_CLIENT_ID to the registered application's public Client ID, not a token or client secret.";
const MISSING_RELEASE_ID: &str = "GitSomething release configuration is incomplete: set GITSOMETHING_GITHUB_CLIENT_ID in the build environment, project .env.local, or project .env. Register GitSomething once as a GitHub OAuth App and enable Device Flow. The public Client ID must be embedded by the application owner so installed users can select Sign in with GitHub without setup. See docs/GITHUB_AUTH.md. Do not provide a token or client secret.";

pub fn valid_client_id(value: &str) -> bool {
    (10..=128).contains(&value.len())
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
        && !(value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
}

fn validated(value: &str) -> Result<Option<String>, &'static str> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    valid_client_id(value)
        .then(|| Some(value.to_owned()))
        .ok_or(INVALID_ID)
}

pub fn from_environment(
    read: impl Fn(&str) -> Option<String>,
) -> Result<Option<String>, &'static str> {
    for key in CLIENT_ID_KEYS {
        if let Some(value) = read(key) {
            if let Some(client_id) = validated(&value)? {
                return Ok(Some(client_id));
            }
        }
    }
    Ok(None)
}

pub fn from_dotenv(contents: &str) -> Result<Option<String>, &'static str> {
    let mut canonical = None;
    let mut legacy = None;
    for line in contents.trim_start_matches('\u{feff}').lines() {
        let line = line.trim();
        let line = line.strip_prefix("export ").unwrap_or(line).trim_start();
        let Some((key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let slot = match key.trim() {
            "GITSOMETHING_GITHUB_CLIENT_ID" => &mut canonical,
            "BRANCHLINE_GITHUB_CLIENT_ID" => &mut legacy,
            _ => continue,
        };
        let raw_value = raw_value.trim();
        let value = match raw_value.as_bytes().first() {
            Some(b'\'' | b'"') => {
                let quote = raw_value.as_bytes()[0] as char;
                let remainder = &raw_value[1..];
                let Some(end) = remainder.find(quote) else {
                    return Err(INVALID_ID);
                };
                let suffix = remainder[end + 1..].trim();
                if !suffix.is_empty() && !suffix.starts_with('#') {
                    return Err(INVALID_ID);
                }
                &remainder[..end]
            }
            _ => raw_value.split('#').next().unwrap_or_default().trim(),
        };
        *slot = Some(value);
    }

    // The canonical name wins regardless of line order. Empty placeholders allow
    // a previously configured legacy name to remain compatible during migration.
    for value in [canonical, legacy].into_iter().flatten() {
        if let Some(client_id) = validated(value)? {
            return Ok(Some(client_id));
        }
    }
    Ok(None)
}

pub fn validate_build_configuration(
    configured: Result<Option<String>, &'static str>,
    profile: &str,
) -> Result<Option<String>, &'static str> {
    let client_id = configured?;
    if profile == "release" && client_id.is_none() {
        return Err(MISSING_RELEASE_ID);
    }
    Ok(client_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PUBLIC_ID: &str = "Ov23liGitSomething123";
    const LEGACY_ID: &str = "Iv1GitSomething456";

    #[test]
    fn environment_uses_canonical_then_legacy_and_skips_empty_placeholders() {
        let both = from_environment(|key| {
            Some(
                if key == CLIENT_ID_KEYS[0] {
                    PUBLIC_ID
                } else {
                    LEGACY_ID
                }
                .into(),
            )
        });
        assert_eq!(both.unwrap().as_deref(), Some(PUBLIC_ID));
        assert_eq!(
            from_environment(|key| Some(
                if key == CLIENT_ID_KEYS[0] {
                    "  "
                } else {
                    LEGACY_ID
                }
                .into()
            ))
            .unwrap()
            .as_deref(),
            Some(LEGACY_ID)
        );
        assert_eq!(from_environment(|_| None).unwrap(), None);
    }

    #[test]
    fn dotenv_reads_only_exact_public_identifier_keys_without_expansion() {
        let contents = format!(
            "GITHUB_TOKEN=ghp_do_not_export\nCLIENT_SECRET=do_not_export\nOTHER_GITSOMETHING_GITHUB_CLIENT_ID=ignored\nexport GITSOMETHING_GITHUB_CLIENT_ID = '{PUBLIC_ID}' # public app identifier\nBRANCHLINE_GITHUB_CLIENT_ID={LEGACY_ID}\n"
        );
        assert_eq!(from_dotenv(&contents).unwrap().as_deref(), Some(PUBLIC_ID));
        assert_eq!(
            from_dotenv("GITHUB_TOKEN=secret\nCLIENT_SECRET=secret").unwrap(),
            None
        );
        assert!(from_dotenv("GITSOMETHING_GITHUB_CLIENT_ID=${GITHUB_TOKEN}").is_err());
    }

    #[test]
    fn dotenv_supports_bom_quotes_comments_and_legacy_without_executing_values() {
        assert_eq!(
            from_dotenv(&format!("\u{feff}# owner configuration\nBRANCHLINE_GITHUB_CLIENT_ID=\"{LEGACY_ID}\" # public\n"))
                .unwrap()
                .as_deref(),
            Some(LEGACY_ID)
        );
        assert_eq!(
            from_dotenv("GITSOMETHING_GITHUB_CLIENT_ID= # not configured").unwrap(),
            None
        );
        for invalid in [
            "GITSOMETHING_GITHUB_CLIENT_ID='unterminated",
            "GITSOMETHING_GITHUB_CLIENT_ID='Ov23liGitSomething123' extra",
            "GITSOMETHING_GITHUB_CLIENT_ID=$(read-secret)",
            "GITSOMETHING_GITHUB_CLIENT_ID=ghp_access_token",
        ] {
            assert!(from_dotenv(invalid).is_err());
        }
    }

    #[test]
    fn public_identifier_validation_rejects_tokens_secrets_and_newlines() {
        assert!(valid_client_id(PUBLIC_ID));
        assert!(valid_client_id(LEGACY_ID));
        for invalid in [
            "",
            "short",
            "ghp_1234567890",
            "github_pat_1234567890",
            "0123456789012345678901234567890123456789",
            "Ov23liGitSomething123\nCLIENT_SECRET=secret",
        ] {
            assert!(!valid_client_id(invalid));
        }
        assert!(!valid_client_id(&"a".repeat(129)));
    }

    #[test]
    fn only_release_requires_configuration_and_invalid_values_never_pass() {
        assert_eq!(
            validate_build_configuration(Ok(None), "debug").unwrap(),
            None
        );
        let error = validate_build_configuration(Ok(None), "release").unwrap_err();
        assert!(error.contains("application owner"));
        assert!(error.contains("Device Flow"));
        assert!(error.contains("GITSOMETHING_GITHUB_CLIENT_ID"));
        for profile in ["debug", "release"] {
            assert!(validate_build_configuration(Err(INVALID_ID), profile).is_err());
            assert_eq!(
                validate_build_configuration(Ok(Some(PUBLIC_ID.into())), profile)
                    .unwrap()
                    .as_deref(),
                Some(PUBLIC_ID)
            );
        }
    }
}
