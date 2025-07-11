// script_updated.js

// ======================
// Initialization
// ======================
const jellyfinloginActionBtn = document.getElementById('loginAction');
const cleanMemoryBtn = document.getElementById('cleanMemoryBtn');
const recommendationsContainer = document.getElementById('recommendations-container');

let moviesToCheck = 3;
let similarsToShow = 6;

// Function to generate Jellyfin movie detail URL
function makeMovieUrl(id) {
  // Safely construct URL, assuming jellyfin object is available and has Server properties
  if (window.jellyfin && window.jellyfin.Server && window.jellyfin.Server.ExternalAddress && window.jellyfin.Server.Id) {
    return `${window.jellyfin.Server.ExternalAddress}/web/#/details?id=${id}&serverId=${window.jellyfin.Server.Id}`;
  }
  // Fallback if jellyfin object is not ready or incomplete
  console.warn("Jellyfin server details not available, cannot create full movie URL.");
  return `javascript:void(0);`; // Placeholder or error indicator
}

// Function to Create "Because you watched" Container
function createBecauseYouWatchedContainer(movie) {
  const container = document.createElement('div');
  container.classList.add('because-you-watched-container');

  const title = document.createElement('h2');
  title.classList.add('because-you-watched-title');
  title.textContent = 'Because you watched '; // Base text

  // Make an "a" link to the movie, using makeMovieUrl function and append to the title element
  const movieLink = document.createElement('a');
  movieLink.href = makeMovieUrl(movie.Id);
  movieLink.textContent = movie.Name;
  movieLink.target = "_blank"; // Open in new tab
  movieLink.classList.add('movie-link');
  // Add aria-label for accessibility
  movieLink.setAttribute('aria-label', `View ${movie.Name} on Jellyfin`);

  title.appendChild(movieLink);
  container.appendChild(title);

  const movieGrid = document.createElement('div');
  movieGrid.classList.add('movie-grid');
  container.appendChild(movieGrid);

  return { container, movieGrid };
}

// Function to create a single movie card
function createMovieCard(movie) {
  const movieCard = document.createElement('div');
  movieCard.classList.add('movie-card');
  movieCard.setAttribute('data-movie-id', movie.Id); // Useful for event listeners later

  // Use a fallback image if movie.ImageUrl is not provided or invalid
  const imageUrl = movie.ImageUrl || "https://placehold.co/200x280/808080/FFFFFF?text=No+Image";

  movieCard.innerHTML = `
        <img src="${imageUrl}" alt="${movie.Name} cover">
        <div class="movie-info">
            <h3>${movie.Name}</h3>
            <p class="rating">Score: ${movie.similarityScore !== undefined ? movie.similarityScore.toFixed(0) + '%' : 'N/A'}</p>
            <p class="rating">Community Rating: ${movie.CommunityRating !== undefined ? movie.CommunityRating.toFixed(2) : 'N/A'}</p>
            <p class="year">Year: ${movie.ProductionYear || 'N/A'}</p>
        </div>
    `;

  // Make the movie card clickable to open the movie details in Jellyfin
  movieCard.addEventListener('click', () => {
    window.open(makeMovieUrl(movie.Id), '_blank');
  });

  // Add keyboard accessibility for card click
  movieCard.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Prevent default scroll or action
      window.open(makeMovieUrl(movie.Id), '_blank');
    }
  });
  movieCard.setAttribute('tabindex', '0'); // Make it focusable

  return movieCard;
}

// Function to display recommendations
function displayRecommendations(recommendations) {
  const loadingMessage = document.querySelector('.loading-message');
  if (loadingMessage) {
    loadingMessage.remove(); // Remove the loading message
  }

  if (!recommendations || recommendations.length === 0) {
    recommendationsContainer.innerHTML = '<div class="no-results-message">No recommendations found. Try watching more movies!</div>';
    return;
  }

  recommendations.forEach(watchedMovieData => {
    // Ensure watchedMovieData and watchedMovieData.Recommendations are valid
    if (!watchedMovieData || !watchedMovieData.Recommendations) return;

    const { container, movieGrid } = createBecauseYouWatchedContainer(watchedMovieData);
    watchedMovieData.Recommendations.forEach(movie => {
      const movieCardElement = createMovieCard(movie);
      movieGrid.appendChild(movieCardElement);
    });
    recommendationsContainer.appendChild(container);
  });
}

// Jellyfin Initialization and Login Logic
function InitializeJellyfin() {
  const server = document.getElementById("Server").value.trim(); // Trim whitespace
  const username = document.getElementById("Username").value.trim();
  const password = document.getElementById("Password").value.trim();

  if (!server || !username || !password) {
      showWindow("loginBox"); // Show login if fields are empty
      document.getElementById('loginErrorMessage').innerText = "Please fill in all server details.";
      document.getElementById("loginBtn").setAttribute('logged-in', 'false');
      return;
  }

  // Disable login button temporarily to prevent multiple clicks
  jellyfinloginActionBtn.setAttribute('inactive', 'true');

  // Use window.jellyfin to ensure it's globally accessible if Jellyfin class is loaded
  if (typeof Jellyfin === 'undefined') {
      console.error("Jellyfin class not loaded. Ensure jellyfin.js is correctly included and deferred.");
      showWindow("loginBox");
      document.getElementById('loginErrorMessage').innerText = "Jellyfin library failed to load.";
      jellyfinloginActionBtn.removeAttribute('inactive');
      return;
  }

  window.jellyfin = new Jellyfin(server, username, password, {
    onLoginError: (err) => {
      const message = err?.message || "Authentication failed. Please check your credentials.";
      showWindow("loginBox"); // Ensure login box is visible on error
      document.getElementById('loginErrorMessage').innerText = message;
      document.getElementById("loginBtn").setAttribute('logged-in', 'false');
      jellyfinloginActionBtn.removeAttribute('inactive');
    },
    onServerSetupError: () => {
      const message = "Server is offline. Please check the address.";
      showWindow("loginBox");
      document.getElementById('loginErrorMessage').innerText = message;
      document.getElementById("loginBtn").setAttribute('logged-in', 'false');
      jellyfinloginActionBtn.removeAttribute('inactive');
    },
    onLoginSuccess: () => {
      hideWindow("loginBox"); // Hide login box on successful login
      document.getElementById("loginBtn").setAttribute('logged-in', 'true');
      // Clear any previous error messages
      document.getElementById('loginErrorMessage').innerText = "";
      // Trigger library load after successful login
      if (window.jellyfin.onLibraryLoad) {
          window.jellyfin.onLibraryLoad(); // Call the callback if it exists
      }
    },
    onLibraryLoad: () => { // This callback is directly handled by the Jellyfin class when libraries are ready
      // Fetch and display recommendations when libraries are loaded
      getSugestions(moviesToCheck, similarsToShow) // Default values for demonstration
          .then(recommendations => displayRecommendations(recommendations))
          .catch(error => {
              console.error("Error fetching recommendations:", error);
              recommendationsContainer.innerHTML = '<div class="no-results-message">Error loading recommendations.</div>';
          });
    },
    onSearchFinish: () => {
      // This callback might be for search results, not directly used here for recommendations.
    }
  });
}

// Event listener for the Login/Connect button
jellyfinloginActionBtn.addEventListener('click', () => {
    InitializeJellyfin(); // Call initialization logic on click
});

// Event listener for cleaning memory
cleanMemoryBtn.addEventListener('click', () => {
  if (window.memory && typeof window.memory.reset === 'function') {
    window.memory.reset().then(() => {
      console.log("Memory cleared. Reloading page.");
      location.reload();
    }).catch(error => {
      console.error("Error clearing memory:", error);
      alert("Failed to clear memory. Please try again.");
    });
  } else {
    console.error("Memory object or reset function not available.");
    alert("Memory management system not ready.");
  }
});

// ======================
// Storage Functions
// ======================
function saveFieldsToStorage() {
  const serverInput = document.getElementById("Server");
  let serverValue = serverInput.value.trim();
  // Remove trailing slash if present
  if (serverValue.endsWith("/")) {
    serverValue = serverValue.slice(0, -1);
    serverInput.value = serverValue; // Update input field
  }
  const username = document.getElementById("Username").value.trim();
  const password = document.getElementById("Password").value.trim();

  localStorage.setItem("server", serverValue);
  localStorage.setItem("username", username);
  localStorage.setItem("password", password);
}

function loadFieldsFromStorage() {
  const server = localStorage.getItem("server");
  const username = localStorage.getItem("username");
  const password = localStorage.getItem("password");

  if (server) document.getElementById("Server").value = server;
  if (username) document.getElementById("Username").value = username;
  if (password) document.getElementById("Password").value = password;
}

// Load fields on page load
loadFieldsFromStorage();
// Save fields whenever they change
document.getElementById("Server").addEventListener("change", saveFieldsToStorage);
document.getElementById("Username").addEventListener("change", saveFieldsToStorage);
document.getElementById("Password").addEventListener("change", saveFieldsToStorage);

// Initialize Jellyfin connection on page load if credentials exist
document.addEventListener('DOMContentLoaded', () => {
    const server = localStorage.getItem("server");
    const username = localStorage.getItem("username");
    const password = localStorage.getItem("password");

    // Only attempt to connect if all fields are present in local storage
    if (server && username && password) {
        // If login box is hidden (meaning credentials were saved), attempt login
        if (document.getElementById("loginBtn").getAttribute('logged-in') === 'false') {
             InitializeJellyfin();
        }
    } else {
        // If credentials are not saved, ensure login box is visible
        showWindow('loginBox');
    }

    // Initialize memory management
    if (typeof pageMemory !== 'undefined') {
        window.memory = new pageMemory();
        // Add a listener for when memory is empty to potentially start something,
        // but here we expect it to be initialized by Jellyfin's library load.
        window.memory.init();
    } else {
        console.error("pageMemory class not loaded. Ensure memory scripts are included.");
    }
});


// --- Data Fetching Functions ---

// Generic function to get items from Jellyfin library
const getList = async (Library, PlayStatus) => {
  // Ensure jellyfin instance is ready
  if (!window.jellyfin || !window.jellyfin.isAuthenticated) {
      console.warn("Jellyfin not authenticated or initialized. Cannot fetch list.");
      return []; // Return empty array if Jellyfin is not ready
  }

  // window.jellyfin.searchParams.Library = Library || 'Filmes'; // Default to 'Filmes'
  window.jellyfin.searchParams.page = 1;
  window.jellyfin.searchParams.offset = 0;
  window.jellyfin.searchParams.limit = 999999; // Fetch all items
  window.jellyfin.searchParams.hasNextPage = true;
  window.jellyfin.searchParams.IncludePeople = false; // Assuming we don't need people data for recommendations

  if (PlayStatus === 'Played') {
    window.jellyfin.searchParams.PlayedOnly = true;
    window.jellyfin.searchParams.UnplayedOnly = false;
  } else { // Unplayed or All (if PlayStatus is null/undefined)
    window.jellyfin.searchParams.PlayedOnly = false;
    window.jellyfin.searchParams.UnplayedOnly = true;
  }

  try {
    const items = await window.jellyfin.searchItems('', '', {});
    // The Jellyfin.js searchItems function returns a promise that resolves with the item list
    return items || []; // Ensure we always return an array
  } catch (error) {
    console.error(`Error fetching ${PlayStatus || 'all'} items from library '${Library}':`, error);
    return []; // Return empty array on error
  }
};

const getPlayed = async Library => {
  return getList(Library, 'Played');
};
const getUnplayed = async Library => {
  return getList(Library, 'Unplayed');
}

// Main function to get suggestions using findSimilar
const getSugestions = async (numberOfRandomWatchedMovies = 10, numberOfSimilarMoviesPerWatched = 7) => {
  try {
    const watchedMovies = await getPlayed();
    window.Played = watchedMovies;

    const unwatchedMovies = await getUnplayed();
    window.Unplayed = unwatchedMovies;
  
    if (!watchedMovies || watchedMovies.length === 0) {
        console.warn("No watched movies found. Cannot generate recommendations based on history.");
        // Optionally, fall back to a general popular movies list or a default set.
        recommendationsContainer.innerHTML = '<div class="no-results-message">Watch some movies to get recommendations!</div>';
        return [];
    }
    if (!unwatchedMovies || unwatchedMovies.length === 0) {
        console.warn("No unwatched movies found. Cannot generate recommendations.");
        recommendationsContainer.innerHTML = '<div class="no-results-message">No unwatched movies available.</div>';
        return [];
    }

    // Assuming findSimilar is correctly imported and available
    if (typeof findSimilar !== 'function') {
        console.error("findSimilar function not available. Ensure findSimilar_updated.js is loaded.");
        return [];
    }

    const recommendations = findSimilar(watchedMovies, unwatchedMovies, numberOfRandomWatchedMovies, numberOfSimilarMoviesPerWatched);
    return recommendations;

  } catch (error) {
    console.error("Error in getSugestions:", error);
    return []; // Return empty array on error
  }
};