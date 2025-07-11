// findSimilar_updated.js

// --- Similarity Weights (Adjust these based on your preferences) ---
const WEIGHTS = {
  GENRE: 4,
  CRITIC_RATING: 2,
  COMMUNITY_RATING: 3,
  ACTOR: 3,
  DIRECTOR_WRITER: 5,
  STUDIO: 1,
  TAG: 4,
  PRODUCTION_YEAR: 2,
  // IS_FAVORITE_BONUS: 5,
};

const MAX_YEAR_DIFF = 80;  // Max range considered meaningful for production year
const EPSILON = 1e-6;      // To prevent division by zero in unions

const usedWatchedIds = new Set();   // Track already tried watched Contents
const usedUnwatchedIds = new Set(); // Track recommended unwatched Contents to avoid duplicates


function buildRarityMap(allContents) {
  const genreFreq = {};
  const tagFreq = {};
  const totalContents = allContents.length;

  for (const Content of allContents) {
    for (const g of Content.Genres || []) {
      const genre = g.toLowerCase();
      genreFreq[genre] = (genreFreq[genre] || 0) + 1;
    }
    for (const t of Content.Tags || []) {
      const tag = t.toLowerCase();
      tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    }
  }

  const genreRarity = {};
  const tagRarity = {};

  for (const g in genreFreq) {
    genreRarity[g] = Math.log((totalContents + 1) / (genreFreq[g] + 1));
  }
  for (const t in tagFreq) {
    tagRarity[t] = Math.log((totalContents + 1) / (tagFreq[t] + 1));
  }

  return { genreRarity, tagRarity };
}



// --- REFINED: Helper Function to Calculate Similarity ---
function calculateSimilarity(targetContent, currentContent, rarityProfile) {
  let rawScore = 0;
  let maxScore = 0;

  const jaccardRarityWeighted = (setA, setB, rarityMap, weight) => {
    const union = new Set([...setA, ...setB]);
    let sumShared = 0;
    let sumTotal = 0;

    for (const item of union) {
      const rarity = rarityMap[item] || 0;
      if (setA.has(item) && setB.has(item)) {
        sumShared += rarity;
      }
      sumTotal += rarity;
    }

    return (sumTotal > 0 ? (sumShared / (sumTotal + EPSILON)) : 0) * weight;
  };

  // Genres
  const genresA = new Set((targetContent.Genres || []).map(g => g.toLowerCase()));
  const genresB = new Set((currentContent.Genres || []).map(g => g.toLowerCase()));
  rawScore += jaccardRarityWeighted(genresA, genresB, rarityProfile.genreRarity, 4);
  maxScore += 4;

  // Tags
  const tagsA = new Set((targetContent.Tags || []).map(t => t.toLowerCase()));
  const tagsB = new Set((currentContent.Tags || []).map(t => t.toLowerCase()));
  rawScore += jaccardRarityWeighted(tagsA, tagsB, rarityProfile.tagRarity, 2.5);
  maxScore += 2.5;

  // Community Rating (0–10 scale)
  if (targetContent.CommunityRating && currentContent.CommunityRating) {
    const diff = Math.abs(targetContent.CommunityRating - currentContent.CommunityRating);
    const ratingSim = Math.max(0, 1 - diff / 10);
    rawScore += ratingSim * 3;
    maxScore += 3;
  }

  // Production Year
  if (targetContent.ProductionYear && currentContent.ProductionYear) {
    const diff = Math.abs(targetContent.ProductionYear - currentContent.ProductionYear);
    const decay = Math.max(0, 1 - diff / MAX_YEAR_DIFF); // Use constant
    rawScore += decay * 2;
    maxScore += 2;
  }

  return maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
}


function findSimilarForOne(targetContent, unwatchedContents, limit = 10, allSimilarities = [], rarityProfile) {
  const similarities = [];
  // Use a Set for efficient checking of already recommended Contents
  const recommendedContentIds = new Set(allSimilarities.flatMap(group => group.similarContents.map(s => s.Content.Id)));

  for (const Content of unwatchedContents) {
    // Skip if already watched or already in recommendations
    if (Content.Id === targetContent.Id || Content.UserData?.Played || recommendedContentIds.has(Content.Id)) {
      continue;
    }

    const similarityScore = calculateSimilarity(targetContent, Content, rarityProfile);

    // Keep a threshold, but perhaps it could be dynamic or adjusted
    if (similarityScore > 15) {
      similarities.push({ Content, similarityScore });
    }
  }

  similarities.sort((a, b) => b.similarityScore - a.similarityScore);
  return similarities.slice(0, limit);
}

function selectRandomContents(Contents, count) {
  if (Contents.length === 0) return [];
  if (Contents.length <= count) return [...Contents];

  const shuffled = [...Contents].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Consolidating taste profile building into one function
function buildTasteProfile(watchedContents) {
  const genreCounts = {};
  const tagCounts = {};
  let totalGenres = 0;
  let totalTags = 0;

  for (const Content of watchedContents) {
    if (!Content?.UserData?.Played) continue;

    for (const genre of Content.Genres || []) {
      const g = genre.toLowerCase();
      genreCounts[g] = (genreCounts[g] || 0) + 1;
      totalGenres++;
    }

    for (const tag of Content.Tags || []) {
      const t = tag.toLowerCase();
      tagCounts[t] = (tagCounts[t] || 0) + 1;
      totalTags++;
    }
  }

  const genreWeights = {};
  const tagWeights = {};

  // Normalize weights to represent proportion of watched Contents
  for (const g in genreCounts) {
    genreWeights[g] = genreCounts[g] / totalGenres;
  }
  for (const t in tagCounts) {
    tagWeights[t] = tagCounts[t] / totalTags;
  }

  return { genreWeights, tagWeights };
}

// Removed extractTasteProfile as buildTasteProfile now covers its functionality.

function computeTasteSimilarity(Content, tasteProfile, options = {}) {
  const {
    genreWeights,
    tagWeights
  } = tasteProfile;

  const {
    genreWeightFactor = 0.65,
    tagWeightFactor = 0.35,
    genrePenaltyThreshold = 4 // too many genres dilute meaning
  } = options;

  const ContentGenres = (Content.Genres || []).map(g => g.toLowerCase());
  const ContentTags = (Content.Tags || []).map(t => t.toLowerCase());

  let genreScore = 0;
  for (const genre of ContentGenres) {
    const weight = genreWeights[genre];
    if (weight) genreScore += weight;
  }

  let tagScore = 0;
  for (const tag of ContentTags) {
    const weight = tagWeights[tag];
    if (weight) tagScore += weight * 1.25; // bonus for rare, specific tags
  }

  // ✂️ Penalty for overly generic Contents (too many genres)
  const genrePenalty = ContentGenres.length > genrePenaltyThreshold
    ? Math.pow(0.85, ContentGenres.length - genrePenaltyThreshold) // Use Math.pow for clarity
    : 1;

  const totalScore = (
    (genreScore * genreWeightFactor) +
    (tagScore * tagWeightFactor)
  ) * genrePenalty;

  return Math.min(1, totalScore); // Ensure score doesn't exceed 1
}




// --- Main Execution Logic ---
function findSimilar(watchedContents, unwatchedContents, numberOfRandomWatchedContents = 10, numberOfSimilarContentsPerWatched = 7) {
  try {
    const trulyUnwatchedContents = unwatchedContents.filter(
      m => !(m.UserData?.Played)
    );

    if (trulyUnwatchedContents.length === 0) {
      console.log("No truly unwatched Contents available after filtering.");
      return []; // Return empty array if no Contents
    }

    const allContents = [...watchedContents, ...trulyUnwatchedContents];
    const rarityProfile = buildRarityMap(allContents);

    const allSimilarities = [];

    const availableWatched = [...watchedContents];
    let attempts = 0;
    const maxAttempts = watchedContents.length * 2; // Prevent infinite loops

    // Improved loop to ensure we try to get enough unique watched Contents as anchors
    while (allSimilarities.length < numberOfRandomWatchedContents && availableWatched.length > 0 && attempts < maxAttempts) {
      const candidatePool = availableWatched.filter(m => !usedWatchedIds.has(m.Id));
      if (candidatePool.length === 0) break; // No more unique watched Contents to select from

      const randomWatched = selectRandomContents(candidatePool, 1)[0];
      if (!randomWatched) break; // Should not happen if candidatePool is not empty

      usedWatchedIds.add(randomWatched.Id);

      // Filter unwatched Contents to exclude those already recommended from any previous target Content
      const availableUnwatched = trulyUnwatchedContents.filter(m => !usedUnwatchedIds.has(m.Id));

      const similarContents = findSimilarForOne(
        randomWatched,
        availableUnwatched,
        numberOfSimilarContentsPerWatched,
        allSimilarities, // Pass current recommendations to avoid duplicates
        rarityProfile
      );

      if (similarContents.length > 0) {
        // Add the IDs of newly recommended Contents to the set of used unwatched Contents
        similarContents.forEach(entry => usedUnwatchedIds.add(entry.Content.Id));

        allSimilarities.push({
          targetContent: randomWatched,
          similarContents: similarContents
        });
      }

      attempts++;
    }

    if (allSimilarities.length === 0) {
      console.log("No recommendations could be generated.");
      return []; // Return empty array if no recommendations
    }

    const recommendations = allSimilarities.map(({ targetContent, similarContents }) => ({
      Name: targetContent.Name,
      Id: targetContent.Id,
      Recommendations: similarContents.map(({ Content, similarityScore }) => ({
        Name: Content.Name,
        Id: Content.Id,
        Genres: Content.Genres,
        CommunityRating: Content.CommunityRating,
        ProductionYear: Content.ProductionYear,
        similarityScore: Math.round(similarityScore),
        ImageUrl: jellyfin.makeImageUrl(Content.Id) // Assuming jellyfin object is available globally or passed in
      }))
    }));

    return recommendations;
  } catch (error) {
    console.error("An error occurred during similarity analysis:", error);
    return []; // Return empty array on error
  }
}