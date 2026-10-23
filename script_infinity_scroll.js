// ======================
// Infinite Scroll Loader
// ======================

// One batch at a time: every scroll event near the bottom used to start another batch in parallel
let loadingMoreRecommendations = false;

// Add a scroll listener to window (or a scrollable container if needed)
window.addEventListener('scroll', async () => {
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
  if (!nearBottom || loadingMoreRecommendations) return;

  // Basic safety: Avoid re-fetching if data isn't loaded yet
  if (!window.Played || !Array.isArray(window.Played)) return;

  // Prevent loading more if we've already used all watched IDs
  if (usedWatchedIds.size >= window.Played.length) {
    console.info("All watched Contents have been used. No more recommendations to fetch.");
    return;
  }

  // Fetch and append new batch
  loadingMoreRecommendations = true;
  try {
    const recommendations = await getSugestions(ContentsToCheck, similarsToShow); // Default values for demonstration
    displayRecommendations(recommendations, { append: true });
  } catch (err) {
    console.error("Infinite scroll error:", err);
  } finally {
    loadingMoreRecommendations = false;
  }
});