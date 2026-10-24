/**
 * Moving focus to the prospect search from anywhere in the dashboard: the "/"
 * shortcut and the sidebar's search button. If the search isn't on the current
 * page, a focus request is left for it to pick up once the search page mounts.
 */
export const PROSPECT_SEARCH_INPUT_ID = "prospect-search-input";

let focusRequested = false;

/** Focuses the search input if it is on the page. Returns false when it isn't. */
export function focusProspectSearch(): boolean {
  const input = document.getElementById(PROSPECT_SEARCH_INPUT_ID);
  if (!(input instanceof HTMLInputElement)) return false;
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

export function requestSearchFocus(): void {
  focusRequested = true;
}

/** True once per request; the search component calls this when it mounts. */
export function consumeSearchFocusRequest(): boolean {
  const requested = focusRequested;
  focusRequested = false;
  return requested;
}
