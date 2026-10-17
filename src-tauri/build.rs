#[path = "build/github_oauth.rs"]
mod github_oauth;

fn main() {
    configure_github_sign_in();
    tauri_build::build()
}

fn configure_github_sign_in() {
    use std::{env, fs, path::PathBuf};

    for name in github_oauth::CLIENT_ID_KEYS {
        println!("cargo:rerun-if-env-changed={name}");
    }

    let project =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"))
            .parent()
            .expect("GitSomething project directory")
            .to_path_buf();
    let files = [project.join(".env.local"), project.join(".env")];
    for file in &files {
        println!("cargo:rerun-if-changed={}", file.display());
    }

    let configured =
        github_oauth::from_environment(|name| env::var(name).ok()).and_then(|environment| {
            if environment.is_some() {
                return Ok(environment);
            }
            for file in &files {
                let metadata = match fs::metadata(file) {
                    Ok(metadata) => metadata,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
                    Err(_) => return Err("Could not read the project OAuth configuration file."),
                };
                if metadata.len() > 65_536 {
                    return Err("The project OAuth configuration file exceeds 64 KiB.");
                }
                let contents = fs::read_to_string(file)
                    .map_err(|_| "Could not read the project OAuth configuration file as UTF-8.")?;
                if let Some(client_id) = github_oauth::from_dotenv(&contents)? {
                    return Ok(Some(client_id));
                }
            }
            Ok(None)
        });

    let profile = env::var("PROFILE").unwrap_or_default();
    let client_id = github_oauth::validate_build_configuration(configured, &profile)
        .unwrap_or_else(|diagnostic| panic!("{diagnostic}"));

    if let Some(client_id) = client_id {
        // This is the application's public identifier, never an access token or secret.
        println!("cargo:rustc-env=GITSOMETHING_GITHUB_CLIENT_ID={client_id}");
    } else {
        println!("cargo:warning=GitHub sign-in is unavailable in this local debug build. Configure GITSOMETHING_GITHUB_CLIENT_ID before distributing GitSomething.");
    }
}
