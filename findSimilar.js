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

const usedWatchedIds = new Set();   // Track already tried watched movies
const usedUnwatchedIds = new Set(); // Track recommended unwatched movies to avoid duplicates


function buildRarityMap(allMovies) {
  const genreFreq = {};
  const tagFreq = {};
  const totalMovies = allMovies.length;

  for (const movie of allMovies) {
    for (const g of movie.Genres || []) {
      const genre = g.toLowerCase();
      genreFreq[genre] = (genreFreq[genre] || 0) + 1;
    }
    for (const t of movie.Tags || []) {
      const tag = t.toLowerCase();
      tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    }
  }

  const genreRarity = {};
  const tagRarity = {};

  for (const g in genreFreq) {
    genreRarity[g] = Math.log((totalMovies + 1) / (genreFreq[g] + 1));
  }
  for (const t in tagFreq) {
    tagRarity[t] = Math.log((totalMovies + 1) / (tagFreq[t] + 1));
  }

  return { genreRarity, tagRarity };
}



// --- REFINED: Helper Function to Calculate Similarity ---
function calculateSimilarity(targetMovie, currentMovie, rarityProfile) {
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
  const genresA = new Set((targetMovie.Genres || []).map(g => g.toLowerCase()));
  const genresB = new Set((currentMovie.Genres || []).map(g => g.toLowerCase()));
  rawScore += jaccardRarityWeighted(genresA, genresB, rarityProfile.genreRarity, 4);
  maxScore += 4;

  // Tags
  const tagsA = new Set((targetMovie.Tags || []).map(t => t.toLowerCase()));
  const tagsB = new Set((currentMovie.Tags || []).map(t => t.toLowerCase()));
  rawScore += jaccardRarityWeighted(tagsA, tagsB, rarityProfile.tagRarity, 2.5);
  maxScore += 2.5;

  // Community Rating (0–10 scale)
  if (targetMovie.CommunityRating && currentMovie.CommunityRating) {
    const diff = Math.abs(targetMovie.CommunityRating - currentMovie.CommunityRating);
    const ratingSim = Math.max(0, 1 - diff / 10);
    rawScore += ratingSim * 3;
    maxScore += 3;
  }

  // Production Year
  if (targetMovie.ProductionYear && currentMovie.ProductionYear) {
    const diff = Math.abs(targetMovie.ProductionYear - currentMovie.ProductionYear);
    const decay = Math.max(0, 1 - diff / MAX_YEAR_DIFF); // Use constant
    rawScore += decay * 2;
    maxScore += 2;
  }

  return maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
}


function findSimilarForOne(targetMovie, unwatchedMovies, limit = 10, allSimilarities = [], rarityProfile) {
  const similarities = [];
  // Use a Set for efficient checking of already recommended movies
  const recommendedMovieIds = new Set(allSimilarities.flatMap(group => group.similarMovies.map(s => s.movie.Id)));

  for (const movie of unwatchedMovies) {
    // Skip if already watched or already in recommendations
    if (movie.Id === targetMovie.Id || movie.UserData?.Played || recommendedMovieIds.has(movie.Id)) {
      continue;
    }

    const similarityScore = calculateSimilarity(targetMovie, movie, rarityProfile);

    // Keep a threshold, but perhaps it could be dynamic or adjusted
    if (similarityScore > 15) {
      similarities.push({ movie, similarityScore });
    }
  }

  similarities.sort((a, b) => b.similarityScore - a.similarityScore);
  return similarities.slice(0, limit);
}

function selectRandomMovies(movies, count) {
  if (movies.length === 0) return [];
  if (movies.length <= count) return [...movies];

  const shuffled = [...movies].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Consolidating taste profile building into one function
function buildTasteProfile(watchedMovies) {
  const genreCounts = {};
  const tagCounts = {};
  let totalGenres = 0;
  let totalTags = 0;

  for (const movie of watchedMovies) {
    if (!movie?.UserData?.Played) continue;

    for (const genre of movie.Genres || []) {
      const g = genre.toLowerCase();
      genreCounts[g] = (genreCounts[g] || 0) + 1;
      totalGenres++;
    }

    for (const tag of movie.Tags || []) {
      const t = tag.toLowerCase();
      tagCounts[t] = (tagCounts[t] || 0) + 1;
      totalTags++;
    }
  }

  const genreWeights = {};
  const tagWeights = {};

  // Normalize weights to represent proportion of watched movies
  for (const g in genreCounts) {
    genreWeights[g] = genreCounts[g] / totalGenres;
  }
  for (const t in tagCounts) {
    tagWeights[t] = tagCounts[t] / totalTags;
  }

  return { genreWeights, tagWeights };
}

// Removed extractTasteProfile as buildTasteProfile now covers its functionality.

function computeTasteSimilarity(movie, tasteProfile, options = {}) {
  const {
    genreWeights,
    tagWeights
  } = tasteProfile;

  const {
    genreWeightFactor = 0.65,
    tagWeightFactor = 0.35,
    genrePenaltyThreshold = 4 // too many genres dilute meaning
  } = options;

  const movieGenres = (movie.Genres || []).map(g => g.toLowerCase());
  const movieTags = (movie.Tags || []).map(t => t.toLowerCase());

  let genreScore = 0;
  for (const genre of movieGenres) {
    const weight = genreWeights[genre];
    if (weight) genreScore += weight;
  }

  let tagScore = 0;
  for (const tag of movieTags) {
    const weight = tagWeights[tag];
    if (weight) tagScore += weight * 1.25; // bonus for rare, specific tags
  }

  // ✂️ Penalty for overly generic movies (too many genres)
  const genrePenalty = movieGenres.length > genrePenaltyThreshold
    ? Math.pow(0.85, movieGenres.length - genrePenaltyThreshold) // Use Math.pow for clarity
    : 1;

  const totalScore = (
    (genreScore * genreWeightFactor) +
    (tagScore * tagWeightFactor)
  ) * genrePenalty;

  return Math.min(1, totalScore); // Ensure score doesn't exceed 1
}




// --- Main Execution Logic ---
function findSimilar(watchedMovies, unwatchedMovies, numberOfRandomWatchedMovies = 10, numberOfSimilarMoviesPerWatched = 7) {
  try {
    const trulyUnwatchedMovies = unwatchedMovies.filter(
      m => !(m.UserData?.Played)
    );

    if (trulyUnwatchedMovies.length === 0) {
      console.log("No truly unwatched movies available after filtering.");
      return []; // Return empty array if no movies
    }

    const allMovies = [...watchedMovies, ...trulyUnwatchedMovies];
    const rarityProfile = buildRarityMap(allMovies);

    const allSimilarities = [];

    const availableWatched = [...watchedMovies];
    let attempts = 0;
    const maxAttempts = watchedMovies.length * 2; // Prevent infinite loops

    // Improved loop to ensure we try to get enough unique watched movies as anchors
    while (allSimilarities.length < numberOfRandomWatchedMovies && availableWatched.length > 0 && attempts < maxAttempts) {
      const candidatePool = availableWatched.filter(m => !usedWatchedIds.has(m.Id));
      if (candidatePool.length === 0) break; // No more unique watched movies to select from

      const randomWatched = selectRandomMovies(candidatePool, 1)[0];
      if (!randomWatched) break; // Should not happen if candidatePool is not empty

      usedWatchedIds.add(randomWatched.Id);

      // Filter unwatched movies to exclude those already recommended from any previous target movie
      const availableUnwatched = trulyUnwatchedMovies.filter(m => !usedUnwatchedIds.has(m.Id));

      const similarMovies = findSimilarForOne(
        randomWatched,
        availableUnwatched,
        numberOfSimilarMoviesPerWatched,
        allSimilarities, // Pass current recommendations to avoid duplicates
        rarityProfile
      );

      if (similarMovies.length > 0) {
        // Add the IDs of newly recommended movies to the set of used unwatched movies
        similarMovies.forEach(entry => usedUnwatchedIds.add(entry.movie.Id));

        allSimilarities.push({
          targetMovie: randomWatched,
          similarMovies: similarMovies
        });
      }

      attempts++;
    }

    if (allSimilarities.length === 0) {
      console.log("No recommendations could be generated.");
      return []; // Return empty array if no recommendations
    }

    const recommendations = allSimilarities.map(({ targetMovie, similarMovies }) => ({
      Name: targetMovie.Name,
      Id: targetMovie.Id,
      Recommendations: similarMovies.map(({ movie, similarityScore }) => ({
        Name: movie.Name,
        Id: movie.Id,
        Genres: movie.Genres,
        CommunityRating: movie.CommunityRating,
        ProductionYear: movie.ProductionYear,
        similarityScore: Math.round(similarityScore),
        ImageUrl: jellyfin.makeImageUrl(movie.Id) // Assuming jellyfin object is available globally or passed in
      }))
    }));

    return recommendations;
  } catch (error) {
    console.error("An error occurred during similarity analysis:", error);
    return []; // Return empty array on error
  }
}