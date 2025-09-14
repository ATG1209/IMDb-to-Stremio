# Current Issues Impacting IMDb Watchlist → Stremio Integration

This document describes, in detail, the user-visible problems and roadblocks currently observed. It intentionally avoids proposed fixes or implementation approaches and focuses only on what is going wrong, where, and how it manifests.

## 1) Sorting Is Not “Date Added (Newest First)”
- Expected behavior: the most recently added items in the IMDb watchlist should appear first in the Stremio catalog (i.e., newest → oldest by added date).
- Observed behavior: items are not consistently ordered by the date they were added. Recently added titles can appear below older ones, and the top of the list does not reliably reflect the latest additions.
- Variability: the order can differ depending on which IMDb watchlist layout is rendered (legacy “lister” view vs. the newer “poster grid”/IPC view) and what the page defaults to on load. In some sessions, list order appears stable; in others, it appears mixed.
- Contributing constraints in the source page:
  - IMDb supports multiple sort modes (e.g., list order, date added, your rating, release date). The default may not be “date added (desc)” depending on view/state.
  - The page loads items in chunks (infinite scroll). When new chunks append, the visual order a human sees on screen may not match the order initially present in the static HTML.
  - Different templates (detail vs. grid) can present items with different DOM structures, which can affect which order is detectable without fully interacting with the page.
- Impact: users expect “last added shows first,” but the catalog frequently violates that expectation, making it hard to find the newest additions.
- Reproduction (high level): add a few new titles to the IMDb watchlist, then immediately open the Stremio catalog; the new titles often do not appear at the top and older items may precede them.

## 2) Missing Posters for a Subset of Titles
- Expected behavior: every title in the Stremio catalog should show a valid poster image when IMDb visibly has one.
- Observed behavior: some titles display without posters (blank/placeholder) despite IMDb showing a poster on the watchlist or title page.
- Variability: the presence/absence of posters is inconsistent across the same list between loads and across different views. In some runs, posters appear for certain items; in others, those same items lack posters.
- Contributing constraints in the source page:
  - IMDb uses lazy-loading for images. On initial load, poster `<img>` tags may point to placeholders while the actual image is deferred until the element scrolls into view.
  - Different attributes are used across templates and A/B variants: some variants populate `src`, others rely on `srcset`, `data-src`, or `data-image-url` (and only later upgrade `src`).
  - Different watchlist templates (legacy “.lister-item” vs. modern “.ipc-poster-card”) structure the image nodes differently, so the straightforward attribute that contains the final poster URL is not consistent.
  - For some titles (particularly certain TV entries, unreleased items, or niche content), a canonical, stable poster URL is not directly present in the initial markup.
- Impact: the catalog grid looks incomplete and visually broken; users cannot quickly recognize entries and may assume content is missing or the add-on is malfunctioning.
- Reproduction (high level): open the Stremio catalog and scan for items without posters; verify that the same titles show a poster when visiting their IMDb pages, indicating a disconnect between what the source displays to users vs. what is retrievable at initial load.

## 3) Inconsistent IMDb Watchlist Markup Across Views/States
- Observed behavior: the same watchlist can render under different DOM structures and test IDs depending on account state, cookies, feature flags, or layout selection. Common patterns include `.lister-item` (legacy/detail view) and `.ipc-poster-card` (new/grid view), and occasionally other data-testid based containers.
- Consequence: field locations for title, year, type labels, and images are not uniform. A selector that works in one view fails or yields partial data in the other. This inconsistency directly contributes to both ordering ambiguity and missing metadata (including posters).
- Impact: intermittent, hard-to-reproduce “works on my machine” behavior where some users see correct metadata while others see gaps, even for the same list.

## 4) Infinite Scroll and Partial Content on Initial Load
- Observed behavior: only a subset of the list is present immediately after the page reaches “network idle.” Additional titles render progressively as the user scrolls.
- Consequence: if only the initially present items are considered, the dataset is incomplete. When additional chunks append, relative ordering may change visually, and late-loaded items may appear newer/older than originally inferred from the first chunk.
- Impact: catalogs generated without fully loaded content miss titles and can misrepresent list order. Users may not see their latest additions, or totals may not match what IMDb displays.

## 5) Title Type and Year Ambiguities Affect Downstream Metadata
- Observed behavior: determining whether an entry is a movie vs. a TV title and extracting a reliable year is not uniform across all watchlist layouts. Some variants rely on textual labels; others derive the year from a metadata block whose format changes between templates.
- Consequence: downstream consumers that rely on type/year for display or for enriching data (e.g., choosing an image or grouping) may receive incomplete or ambiguous fields for certain entries.
- Impact: inconsistent type labeling and year values can lead to sorting inconsistencies (when sorting by release date), category mismatches, or missing imagery when the year/type are needed to identify the correct artwork.

## Affected Surfaces
- Stremio catalog endpoints that reflect a user’s IMDb watchlist.
- Any UI that displays the watchlist as a cover grid where ordering and poster presence are key to user experience.

## User Impact Summary
- Newest additions are not reliably surfaced first, contradicting user expectations about “recent-first” ordering.
- Some items appear without posters even though IMDb visibly has one, making the catalog look incomplete and reducing usability.
- Behavior varies between sessions and accounts due to markup differences and lazy-loading, causing intermittent and confusing results for end users.

