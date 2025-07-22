const WEIGHTS = {
  GENRE: 4,
  CRITIC_RATING: 2,
  COMMUNITY_RATING: 3,
  ACTOR: 3,
  DIRECTOR_WRITER: 5,
  STUDIO: 1,
  TAG: 4,
  PRODUCTION_YEAR: 2,
  NAME: 3,
  START_WITH: 6
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

function extractSearchProfileFromWatched(watchedContents, topCount = 3) {
  const genreFreq = {};
  const tagFreq = {};
  const studioFreq = {};
  const directorFreq = {};
  const writerFreq = {};
  const actorFreq = {};
  const yearFreq = {};
  const ratingStats = [];

  for (const content of watchedContents) {
    const { Genres = [], Tags = [], ProductionYear, Studios = [], CommunityRating, People = [] } = content;

    Genres.forEach(g => {
      const k = g.toLowerCase();
      genreFreq[k] = (genreFreq[k] || 0) + 1;
    });

    Tags.forEach(t => {
      const k = t.toLowerCase();
      tagFreq[k] = (tagFreq[k] || 0) + 1;
    });

    Studios.forEach(s => {
      const k = s.Name?.toLowerCase();
      if (k) studioFreq[k] = (studioFreq[k] || 0) + 1;
    });

    People?.forEach(p => {
      const role = p.Type?.toLowerCase();
      const name = p.Name?.toLowerCase();
      if (role === 'director') directorFreq[name] = (directorFreq[name] || 0) + 1;
      if (role === 'writer') writerFreq[name] = (writerFreq[name] || 0) + 1;
      if (role === 'actor') actorFreq[name] = (actorFreq[name] || 0) + 1;
    });

    if (ProductionYear) yearFreq[ProductionYear] = (yearFreq[ProductionYear] || 0) + 1;
    if (CommunityRating) ratingStats.push(CommunityRating);
  }

  const top = (obj, n = topCount) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(e => e[0]);

  const avgRating = ratingStats.reduce((a, b) => a + b, 0) / (ratingStats.length || 1);
  const avgYear = Math.round(Object.entries(yearFreq).reduce((sum, [y, count]) => sum + (y * count), 0) / (Object.values(yearFreq).reduce((a, b) => a + b, 0) || 1));

  const profile = [];

  if (Object.keys(genreFreq).length > 0) {
    profile.push({ operator: 'all', fields: ['Genres'], queries: top(genreFreq) });
  }
  if (Object.keys(tagFreq).length > 0) {
    profile.push({ operator: 'all', fields: ['Tags'], queries: top(tagFreq) });
  }
  // if (Object.keys(studioFreq).length > 0) {
  //   profile.push({ operator: 'any', fields: ['Studios.Name'], queries: top(studioFreq) });
  // }
  // const directorWriterNames = [...top(directorFreq), ...top(writerFreq)];
  // if (directorWriterNames.length > 0) {
  //   profile.push({ operator: 'any', fields: ['People.Name'], queries: directorWriterNames });
  // }
  // if (Object.keys(actorFreq).length > 0) {
  //   profile.push({ operator: 'any', fields: ['People.Name'], queries: top(actorFreq) });
  // }
  if (Object.keys(yearFreq).length > 0) {
    profile.push({ operator: 'between', fields: ['ProductionYear'], queries: [avgYear - 5, avgYear + 5] });
  }
  if (ratingStats.length > 0) {
    profile.push({ operator: '>', fields: ['CommunityRating'], queries: [Math.max(avgRating - 0.5, 6.0)] });
  }
  return profile;
}


function tokenizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // remove punctuation
    .split(/\s+/)
    .filter(w => w.length > 1 && !['the', 'part', 'season', 'episode'].includes(w));
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
  rawScore += jaccardRarityWeighted(genresA, genresB, rarityProfile.genreRarity, WEIGHTS.GENRE);
  maxScore += WEIGHTS.GENRE;

  // Tags
  const tagsA = new Set((targetContent.Tags || []).map(t => t.toLowerCase()));
  const tagsB = new Set((currentContent.Tags || []).map(t => t.toLowerCase()));
  rawScore += jaccardRarityWeighted(tagsA, tagsB, rarityProfile.tagRarity, WEIGHTS.TAG);
  maxScore += WEIGHTS.TAG;

  // Community Rating (0–10 scale)
  if (targetContent.CommunityRating && currentContent.CommunityRating) {
    const diff = Math.abs(targetContent.CommunityRating - currentContent.CommunityRating);
    const ratingSim = Math.max(0, 1 - diff / 10);
    rawScore += ratingSim * WEIGHTS.COMMUNITY_RATING;
    maxScore += WEIGHTS.COMMUNITY_RATING;
  }

  // Production Year
  if (targetContent.ProductionYear && currentContent.ProductionYear) {
    const diff = Math.abs(targetContent.ProductionYear - currentContent.ProductionYear);
    const decay = Math.max(0, 1 - diff / MAX_YEAR_DIFF); // Use constant
    rawScore += decay * WEIGHTS.PRODUCTION_YEAR;
    maxScore += WEIGHTS.PRODUCTION_YEAR;
  }

  // 🎯 NEW: Title Token Similarity
  const nameA = new Set(tokenizeName(targetContent.Name));
  const nameB = new Set(tokenizeName(currentContent.Name));
  const nameIntersection = [...nameA].filter(w => nameB.has(w));
  const nameScore = nameIntersection.length / (Math.max(nameA.size, nameB.size) || 1); // Avoid /0
  rawScore += nameScore * WEIGHTS.NAME;
  maxScore += WEIGHTS.NAME;

  if (targetContent.Name && currentContent.Name) {
    const normalizedA = targetContent.Name.toLowerCase();
    const normalizedB = currentContent.Name.toLowerCase();
    if (normalizedA.startsWith(normalizedB) || normalizedB.startsWith(normalizedA)) {
      rawScore += WEIGHTS.START_WITH; // extra boost
      maxScore += WEIGHTS.START_WITH;
    }
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
function findSimilar(watchedContents, unwatchedContents, numberOfRandomWatchedContents = 10, numberOfSimilarContentsPerWatched = 7, useSingleAppearance = true) {
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
      let availableUnwatched = trulyUnwatchedContents;
      if (useSingleAppearance)
        availableUnwatched = trulyUnwatchedContents.filter(m => !usedUnwatchedIds.has(m.Id));

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

async function getTasteBasedContentfindSimilar(watchedContents, unwatchedContents, limite = 12, isStrict = true, useSingleAppearance = true) {
  if (!watchedContents || watchedContents.length === 0) {
    console.warn("No watched Contents provided for taste-based recommendations.");
    return [];
  }
  if (!unwatchedContents || unwatchedContents.length === 0) {
    console.warn("No unwatched Contents provided for taste-based recommendations.");
    return [];
  }

  window.tasteProfile ??= buildTasteProfile(watchedContents);

  if (isStrict) {
    window.profileQueries ??= extractSearchProfileFromWatched(watched, 7);

    window.searchEngine ??= new SearchEngine();

    const recommendations = window.searchEngine.search(unwatchedContents, window.profileQueries, [
      { fields: ['CommunityRating'], type: 'desc' },
      { fields: ['ProductionYear'], type: 'desc' }
    ], useSingleAppearance);

    return recommendations.slice(0, limite).map((Content) => ({
      Name: Content.Name,
      Id: Content.Id,
      Genres: Content.Genres,
      CommunityRating: Content.CommunityRating,
      ProductionYear: Content.ProductionYear,
      similarityScore: computeTasteSimilarity(Content, tasteProfile) * 100,
      ImageUrl: jellyfin.makeImageUrl(Content.Id)
    })).sort((a, b) => b.similarityScore - a.similarityScore);
  } else {
    const scoredContents = [];
    for (const Content of unwatchedContents) {
      const tasteSimilarityScore = computeTasteSimilarity(Content, tasteProfile);
      if (tasteSimilarityScore > 0) { // Only include Contents with some similarity
        scoredContents.push({
          Content,
          similarityScore: tasteSimilarityScore * 100 // Convert to percentage
        });
      }
    }

    scoredContents.sort((a, b) => b.similarityScore - a.similarityScore);

    return scoredContents.slice(0, limite).map(({ Content, similarityScore }) => ({
      Name: Content.Name,
      Id: Content.Id,
      Genres: Content.Genres,
      CommunityRating: Content.CommunityRating,
      ProductionYear: Content.ProductionYear,
      similarityScore: Math.round(similarityScore),
      ImageUrl: jellyfin.makeImageUrl(Content.Id)
    })).sort((a, b) => b.similarityScore - a.similarityScore);
  }
}