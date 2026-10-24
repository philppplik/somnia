//! Every child process the app starts on Windows must run without a console window.
//! Without CREATE_NO_WINDOW each git/taskkill/npm call flashes a terminal. No-op elsewhere.
use std::process::Command;

pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub trait NoWindow {
    fn no_window(&mut self) -> &mut Self;
}
impl NoWindow for Command {
    fn no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn flag_value_is_create_no_window() {
        assert_eq!(CREATE_NO_WINDOW, 0x0800_0000);
    }
    #[cfg(windows)]
    #[test]
    fn no_window_child_has_no_console() {
        // A console child started with the flag still runs and exits normally.
        let status = Command::new("cmd")
            .args(["/C", "exit", "0"])
            .no_window()
            .status()
            .unwrap();
        assert!(status.success());
    }
}
