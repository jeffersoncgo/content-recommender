// ======================
// Infinite Scroll Loader
// ======================

// Add a scroll listener to window (or a scrollable container if needed)
window.addEventListener('scroll', async () => {
  const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
  if (!nearBottom) return;

  // Basic safety: Avoid re-fetching if data isn't loaded yet
  if (!window.Played || !Array.isArray(window.Played)) return;

  // Prevent loading more if we've already used all watched IDs
  if (usedWatchedIds.size >= window.Played.length) {
    console.info("All watched Contents have been used. No more recommendations to fetch.");
    return;
  }

  // Fetch and append new batch
  try {
    getSugestions(ContentsToCheck, similarsToShow) // Default values for demonstration
      .then(recommendations => {
        displayRecommendations(recommendations);
      })
      .catch(error => {
        console.error("Infinite scroll error:", error);
      });
  } catch (err) {
    console.error("Failed during infinite scroll trigger:", err);
  }
});