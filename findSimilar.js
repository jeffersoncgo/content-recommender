// findSimilar.js

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

// --- REFINED: Helper Function to Calculate Similarity ---
function calculateSimilarity(targetMovie, currentMovie) {
  let rawScore = 0;
  let maxScore = 0;

  const jaccard = (aSet, bSet) => {
    if (aSet.size === 0 && bSet.size === 0) return 1;
    const intersection = new Set([...aSet].filter(x => bSet.has(x))).size;
    const union = new Set([...aSet, ...bSet]).size + EPSILON;
    return intersection / union;
  };

  const similarityIfBothPresent = (value1, value2, weight, scale) => {
    if (value1 !== undefined && value2 !== undefined) {
      const diff = Math.abs(value1 - value2);
      const similarity = Math.max(0, 1 - diff / scale);
      rawScore += similarity * weight;
      maxScore += weight;
    }
  };

  // 1. Genres
  const genresA = new Set(targetMovie.Genres || []);
  const genresB = new Set(currentMovie.Genres || []);
  if (genresA.size || genresB.size) {
    rawScore += jaccard(genresA, genresB) * WEIGHTS.GENRE;
    maxScore += WEIGHTS.GENRE;
  }

  // 2. Critic Rating (0–100)
  similarityIfBothPresent(targetMovie.CriticRating, currentMovie.CriticRating, WEIGHTS.CRITIC_RATING, 100);

  // 3. Community Rating (0–10)
  similarityIfBothPresent(targetMovie.CommunityRating, currentMovie.CommunityRating, WEIGHTS.COMMUNITY_RATING, 10);

  // 4. Actors
  const actorsA = new Set((targetMovie.People || []).filter(p => p.Type === 'Actor').map(p => p.Id));
  const actorsB = new Set((currentMovie.People || []).filter(p => p.Type === 'Actor').map(p => p.Id));
  if (actorsA.size || actorsB.size) {
    rawScore += jaccard(actorsA, actorsB) * WEIGHTS.ACTOR;
    maxScore += WEIGHTS.ACTOR;
  }

  // 5. Director/Writer
  const dirWritersA = new Set((targetMovie.People || []).filter(p => ['Director', 'Writer'].includes(p.Type)).map(p => p.Id));
  const dirWritersB = new Set((currentMovie.People || []).filter(p => ['Director', 'Writer'].includes(p.Type)).map(p => p.Id));
  if (dirWritersA.size || dirWritersB.size) {
    rawScore += jaccard(dirWritersA, dirWritersB) * WEIGHTS.DIRECTOR_WRITER;
    maxScore += WEIGHTS.DIRECTOR_WRITER;
  }

  // 6. Studios
  const studiosA = new Set((targetMovie.Studios || []).map(s => s.Id));
  const studiosB = new Set((currentMovie.Studios || []).map(s => s.Id));
  if (studiosA.size || studiosB.size) {
    rawScore += jaccard(studiosA, studiosB) * WEIGHTS.STUDIO;
    maxScore += WEIGHTS.STUDIO;
  }

  // 7. Tags
  const tagsA = new Set(targetMovie.Tags || []);
  const tagsB = new Set(currentMovie.Tags || []);
  if (tagsA.size || tagsB.size) {
    rawScore += jaccard(tagsA, tagsB) * WEIGHTS.TAG;
    maxScore += WEIGHTS.TAG;
  }

  // 8. Production Year
  if (targetMovie.ProductionYear !== undefined && currentMovie.ProductionYear !== undefined) {
    const diff = Math.abs(targetMovie.ProductionYear - currentMovie.ProductionYear);
    const decay = Math.max(0, 1 - diff / MAX_YEAR_DIFF);
    rawScore += decay * WEIGHTS.PRODUCTION_YEAR;
    maxScore += WEIGHTS.PRODUCTION_YEAR;
  }

  // 9. Is Favorite Bonus
  if (currentMovie.UserData?.IsFavorite) {
    rawScore += WEIGHTS.IS_FAVORITE_BONUS;
    maxScore += WEIGHTS.IS_FAVORITE_BONUS;
  }

  return maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
}


function findSimilarForOne(targetMovie, unwatchedMovies, limit = 10, allSimilarities = []) {
  const similarities = [];

  for (const movie of unwatchedMovies) {
    if (movie.Id === targetMovie.Id) {
      continue;
    }

    if (allSimilarities.some(group => group.similarMovies.some(s => s.movie.Id === movie.Id))) {
      continue;
    }

    if (movie.UserData && movie.UserData.Played) {
      continue;
    }

    // Calculate the normalized similarity score (0-100)
    const similarityScore = calculateSimilarity(targetMovie, movie);

    // Only consider movies with a meaningful similarity score (e.g., > 15%)
    if (similarityScore > 15) {
      similarities.push({ movie, similarityScore });
    }
  }

  // Sort by similarity in descending order
  similarities.sort((a, b) => b.similarityScore - a.similarityScore);

  // Return top N similar movies, already in the correct format
  return similarities.slice(0, limit);
}

function selectRandomMovies(movies, count) {
  if (movies.length === 0) {
    return [];
  }
  if (movies.length <= count) {
    return [...movies]; // Return all if fewer than requested
  }
  // Shuffle the array and take the first 'count' elements
  const shuffled = [...movies].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// --- Main Execution Logic ---
function findSimilar(watchedMovies, unwatchedMovies, numberOfRandomWatchedMovies = 10, numberOfSimilarMoviesPerWatched = 7) {
  try {
    const trulyUnwatchedMovies = unwatchedMovies.filter(
      m => !(m.UserData?.Played)
    );

    if (trulyUnwatchedMovies.length === 0) {
      console.log("No truly unwatched movies available after filtering.");
      return;
    }

    const usedWatchedIds = new Set();   // Track already tried watched movies
    const usedUnwatchedIds = new Set(); // Track recommended unwatched movies to avoid duplicates
    const allSimilarities = [];

    const availableWatched = [...watchedMovies]; // Clone for internal mutation
    let attempts = 0;

    while (allSimilarities.length < numberOfRandomWatchedMovies && availableWatched.length > 0) {
      // Get a random unwatched movie not already tried
      const candidatePool = availableWatched.filter(m => !usedWatchedIds.has(m.Id));
      if (candidatePool.length === 0) break;

      const randomWatched = selectRandomMovies(candidatePool, 1)[0];
      usedWatchedIds.add(randomWatched.Id);

      const similarMovies = findSimilarForOne(
        randomWatched,
        trulyUnwatchedMovies.filter(m => !usedUnwatchedIds.has(m.Id)),
        numberOfSimilarMoviesPerWatched,
        allSimilarities
      );

      if (similarMovies.length > 0) {
        // Mark recommended movies to prevent future reuse
        similarMovies.forEach(entry => usedUnwatchedIds.add(entry.movie.Id));

        allSimilarities.push({
          targetMovie: randomWatched,
          similarMovies: similarMovies
        });
      } else {
        console.log(`No similar movies found for "${randomWatched.Name}", trying another.`);
      }

      attempts++;
      if (attempts > watchedMovies.length) break; // Prevent infinite loop
    }

    if (allSimilarities.length === 0) {
      console.log("No recommendations could be generated.");
      return;
    }

    // 🧾 Final Output Structuring
    const recommendations = allSimilarities.map(({ targetMovie, similarMovies }) => {
      return {
        Name: targetMovie.Name,
        Id: targetMovie.Id,
        Recommendations: similarMovies.map(({ movie, similarityScore }) => ({
          Name: movie.Name,
          Id: movie.Id,
          Genres: movie.Genres,
          CommunityRating: movie.CommunityRating,
          ProductionYear: movie.ProductionYear,
          similarityScore: Math.round(similarityScore),
          ImageUrl: jellyfin.makeImageUrl(movie.Id)
        }))
      };
    });

    return recommendations;
  } catch (error) {
    console.error("An error occurred during similarity analysis:", error);
  }
}
