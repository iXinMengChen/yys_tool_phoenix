use serde::Deserialize;

pub(crate) mod product;
pub(crate) mod search;
pub(crate) mod session;
pub(crate) mod webview;
pub(crate) mod windows;

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CbgChannel {
    Official,
    Huawei,
    Oppo,
    Vivo,
    Xiaomi,
}

impl Default for CbgChannel {
    fn default() -> Self {
        Self::Official
    }
}

impl CbgChannel {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Official => "official",
            Self::Huawei => "huawei",
            Self::Oppo => "oppo",
            Self::Vivo => "vivo",
            Self::Xiaomi => "xiaomi",
        }
    }

    pub(crate) fn host(self) -> &'static str {
        match self {
            Self::Official => "yys.cbg.163.com",
            Self::Huawei => "yys-huawei.cbg.163.com",
            Self::Oppo => "yys-oppo.cbg.163.com",
            Self::Vivo => "yys-vivo.cbg.163.com",
            Self::Xiaomi => "yys-xiaomi.cbg.163.com",
        }
    }

    pub(crate) fn login_window_label(self) -> String {
        format!("cbg-login-{}", self.label())
    }

    pub(crate) fn accepts_source_host(self, host: &str) -> bool {
        match self {
            Self::Official => matches!(host, "yys.cbg.163.com" | "cbg.163.com"),
            _ => host == self.host(),
        }
    }
}

pub(crate) fn is_supported_cbg_source_host(host: &str) -> bool {
    [
        CbgChannel::Official,
        CbgChannel::Huawei,
        CbgChannel::Oppo,
        CbgChannel::Vivo,
        CbgChannel::Xiaomi,
    ]
    .iter()
    .any(|channel| channel.accepts_source_host(host))
}

pub(crate) const CBG_SHELL_LABEL: &str = "cbg-shell";
pub(crate) const CBG_BROWSER_LABEL: &str = "cbg-browser";
