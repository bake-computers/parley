//! Headless browser-based opponent username scraping for the siphon crawler.
//!
//! Stats.cc loads match participant data (teammates/opponents) via client-side
//! API calls after the initial HTML render. The profile page shows a list of
//! match previews; clicking a preview reveals the full match table with all
//! participant profile links as `<a href="/siege/{username}/{uuid}">` elements.
//!
//! Clicks may expand inline (accordion) or navigate to a match detail page
//! (client-side routing). Both cases are handled via JavaScript evaluation
//! inside the page context, which avoids stale DOM element references and
//! navigation interruptions that occur with the per-element click API.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::Page;

const PAGE_LOAD_TIMEOUT: Duration = Duration::from_secs(20);
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const MATCH_CLICK_LIMIT: usize = 20;
const EXPAND_WAIT: Duration = Duration::from_millis(2000);

#[derive(Clone)]
pub struct BrowserPool {
    browser: Arc<Browser>,
}

impl BrowserPool {
    pub async fn launch() -> anyhow::Result<Self> {
        let config = BrowserConfig::builder()
            .new_headless_mode()
            .no_sandbox()
            .build()
            .map_err(|e| anyhow::anyhow!("{e}"))?;

        let (browser, mut handler) = Browser::launch(config).await.map_err(|e| {
            anyhow::anyhow!(
                "Failed to launch headless Chrome. Is Chromium installed?\n\
                 Install with: brew install chromium\n\
                 Error: {e}"
            )
        })?;

        tokio::spawn(async move {
            use futures::StreamExt;
            while handler.next().await.is_some() {}
        });

        Ok(Self {
            browser: Arc::new(browser),
        })
    }

    pub async fn scrape_opponent_usernames(
        &self,
        uid: &str,
        platform: &str,
    ) -> anyhow::Result<Vec<String>> {
        let url = format!("https://stats.cc/siege?displayName={uid}&platform={platform}");

        let page = self.browser.new_page("about:blank").await?;
        // Goto consumes Page, wait_for_navigation returns a new Page.
        let page = page.goto(&url).await?.wait_for_navigation().await?;
        // Allow JS to hydrate after SSR load.
        tokio::time::sleep(Duration::from_secs(2)).await;

        println!("[siphon:{uid}] page navigated, starting match click-through");

        let result = Self::click_through_matches(&page, uid).await;
        let _ = page.close().await;
        result
    }

    async fn click_through_matches(page: &Page, uid: &str) -> anyhow::Result<Vec<String>> {
        Self::wait_for_match_previews(page).await?;

        let count_js = "document.querySelectorAll('.match-preview').length";
        let count: usize = page
            .evaluate(count_js)
            .await
            .map(|r| r.into_value().unwrap_or(0))
            .unwrap_or(0);

        eprintln!("[siphon:{uid}] found {count} .match-preview elements");

        if count == 0 {
            let fallback_links = page.find_elements("a[href^=\"/siege/\"]").await?;
            eprintln!(
                "[siphon:{uid}] no .match-preview; found {} /siege/ links on page",
                fallback_links.len()
            );
            return Self::collect_link_usernames(&fallback_links).await;
        }

        let limit = MATCH_CLICK_LIMIT.min(count);
        let mut found: HashSet<String> = HashSet::new();

        for i in 0..limit {
            let click_js = format!(
                "(() => {{ \
                    const el = document.querySelectorAll('.match-preview')[{i}]; \
                    if (!el) return false; \
                    el.scrollIntoView({{block:'center',behavior:'instant'}}); \
                    el.dispatchEvent(new MouseEvent('click',{{bubbles:true,cancelable:true}})); \
                    el.click(); \
                    return true; \
                }})()"
            );

            let clicked: bool = page
                .evaluate(click_js.as_str())
                .await
                .map(|r| r.into_value().unwrap_or(false))
                .unwrap_or(false);

            if !clicked {
                continue;
            }

            tokio::time::sleep(EXPAND_WAIT).await;

            let links = page.find_elements("a[href^=\"/siege/\"]").await?;
            for link in &links {
                if let Ok(Some(href)) = link.attribute("href").await {
                    if let Some(username) = Self::username_from_siege_url(&href) {
                        found.insert(username);
                    }
                }
            }
        }

        eprintln!(
            "[siphon:{uid}] collected {} unique usernames from {limit} clicks",
            found.len()
        );

        let mut result: Vec<String> = found.into_iter().collect();
        result.sort();
        Ok(result)
    }

    async fn collect_link_usernames(
        elements: &[chromiumoxide::element::Element],
    ) -> anyhow::Result<Vec<String>> {
        let mut usernames = Vec::with_capacity(elements.len());
        for el in elements {
            if let Ok(Some(href)) = el.attribute("href").await {
                if let Some(username) = Self::username_from_siege_url(&href) {
                    usernames.push(username);
                }
            }
        }
        usernames.sort();
        usernames.dedup();
        Ok(usernames)
    }

    async fn wait_for_match_previews(page: &Page) -> anyhow::Result<()> {
        let start = std::time::Instant::now();

        loop {
            let elements = page.find_elements(".match-preview").await?;
            if !elements.is_empty() {
                return Ok(());
            }
            if start.elapsed() > PAGE_LOAD_TIMEOUT {
                return Ok(());
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    fn username_from_siege_url(url: &str) -> Option<String> {
        let pos = url.find("/siege/")?;
        let after = &url[pos + 7..];
        let slash = after.find('/')?;
        let username = &after[..slash];
        if username.is_empty() {
            return None;
        }
        Some(username.to_string())
    }
}
