// script_updated.js

// ======================
// Initialization
// ======================
const jellyfinloginActionBtn = document.getElementById('loginAction');
const jellyfinLogoutBtn = document.getElementById('logoutAction');
const cleanMemoryBtn = document.getElementById('cleanMemoryBtn');
const recommendationsContainer = document.getElementById('recommendations-container');

let ContentsToCheck = 3;
let similarsToShow = 6;
let recommendationsShowed = 0;

const noImage = "https://placehold.co/200x280/808080/FFFFFF?text=No+Image"

// Function to generate Jellyfin Content detail URL
function makeContentUrl(id) {
  // Safely construct URL, assuming jellyfin object is available and has Server properties
  if (window.jellyfin && window.jellyfin.Server && window.jellyfin.Server.ExternalAddress && window.jellyfin.Server.Id) {
    return `${window.jellyfin.Server.ExternalAddress}/web/#/details?id=${id}&serverId=${window.jellyfin.Server.Id}`;
  }
  // Fallback if jellyfin object is not ready or incomplete
  console.warn("Jellyfin server details not available, cannot create full Content URL.");
  return `javascript:void(0);`; // Placeholder or error indicator
}

// Function to Create "Because you watched" Container
function createBecauseYouWatchedContainer(Content) {
  const container = document.createElement('div');
  container.classList.add('because-you-watched-container');

  const title = document.createElement('h2');
  title.classList.add('because-you-watched-title');
  title.textContent = 'Because you watched '; // Base text

  // Make an "a" link to the Content, using makeContentUrl function and append to the title element
  const ContentLink = document.createElement('a');
  ContentLink.href = makeContentUrl(Content.Id);
  ContentLink.textContent = Content.Name;
  ContentLink.target = "_blank"; // Open in new tab
  ContentLink.classList.add('Content-link');
  // Add aria-label for accessibility
  ContentLink.setAttribute('aria-label', `View ${Content.Name} on Jellyfin`);

  title.appendChild(ContentLink);
  container.appendChild(title);

  const ContentGrid = document.createElement('div');
  ContentGrid.classList.add('Content-grid');
  container.appendChild(ContentGrid);

  return { container, ContentGrid };
}

// Function to create a single Content card
function createContentCard(Content) {
  const ContentCard = document.createElement('div');
  ContentCard.classList.add('Content-card');
  ContentCard.setAttribute('data-Content-id', Content.Id); // Useful for event listeners later

  // Use a fallback image if Content.ImageUrl is not provided or invalid
  const imageUrl = Content.ImageUrl || noImage;

  // Built with DOM nodes: names come from server metadata and must never be parsed as HTML
  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = `${Content.Name} cover`;
  img.onerror = () => { img.onerror = null; img.src = noImage; };

  const info = document.createElement('div');
  info.classList.add('Content-info');
  const addLine = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.classList.add(className);
    el.textContent = text;
    info.appendChild(el);
  };
  addLine('h3', null, Content.Name);
  addLine('p', 'rating', `Score: ${typeof Content.similarityScore === 'number' ? Content.similarityScore.toFixed(0) + '%' : 'N/A'}`);
  // CommunityRating can be null (items without a rating)
  addLine('p', 'rating', `Community Rating: ${typeof Content.CommunityRating === 'number' ? Content.CommunityRating.toFixed(2) : 'N/A'}`);
  addLine('p', 'year', `Year: ${Content.ProductionYear || 'N/A'}`);

  ContentCard.append(img, info);


  // Make the Content card clickable to open the Content details in Jellyfin
  ContentCard.addEventListener('click', () => {
    window.open(makeContentUrl(Content.Id), '_blank');
  });

  // Add keyboard accessibility for card click
  ContentCard.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Prevent default scroll or action
      window.open(makeContentUrl(Content.Id), '_blank');
    }
  });
  ContentCard.setAttribute('tabindex', '0'); // Make it focusable

  return ContentCard;
}

// Function to display recommendations
function displayRecommendations(recommendations) {
  const loadingMessage = document.querySelector('.loading-message');
  if (loadingMessage) {
    loadingMessage.remove(); // Remove the loading message
  }

  if (!recommendations || recommendations.length === 0) {
    recommendationsContainer.innerHTML = '<div class="no-results-message">No recommendations found. Try watching more Contents!</div>';
    return;
  }

  recommendations.forEach(watchedContentData => {
    // Ensure watchedContentData and watchedContentData.Recommendations are valid
    if (!watchedContentData || !watchedContentData.Recommendations) return;

    const { container, ContentGrid } = createBecauseYouWatchedContainer(watchedContentData);
    watchedContentData.Recommendations.forEach(Content => {
      const ContentCardElement = createContentCard(Content);
      ContentGrid.appendChild(ContentCardElement);
    });
    recommendationsContainer.appendChild(container);
  });
}

function createBasedOnTastesContainer(recommendations) {
  const tasteRecommendationsContainer = document.getElementById('taste-recommendations-container');
  if (!tasteRecommendationsContainer) {
    console.error("Taste recommendations container not found.");
    return;
  }

  // tasteRecommendationsContainer.innerHTML = ''; // Clear previous recommendations

  if (!recommendations || recommendations.length === 0) {
    tasteRecommendationsContainer.innerHTML = '<div class="no-results-message">No taste-based recommendations found.</div>';
    return;
  }

  if(tasteRecommendationsContainer.childElementCount == 0) {
    const title = document.createElement('h2');
    title.classList.add('because-you-watched-title');
    title.textContent = 'Based on Your General Watched Content';
    tasteRecommendationsContainer.appendChild(title);

    ContentGrid = document.createElement('div');
    ContentGrid.classList.add('Content-grid');
    tasteRecommendationsContainer.appendChild(ContentGrid);

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.classList.add('load-more-btn');
    loadMoreBtn.textContent = 'Load More';
    loadMoreBtn.addEventListener('click', async () => {
      if (recommendationsShowed < window.recommendations.length) {
        createBasedOnTastesContainer(window.recommendations.slice(recommendationsShowed, recommendationsShowed + similarsToShow));
      } else {
        loadMoreBtn.style.display = 'none';
      }
    });
    tasteRecommendationsContainer.appendChild(loadMoreBtn);
  } else {
    ContentGrid = tasteRecommendationsContainer.querySelector('.Content-grid');
  }
  recommendations.forEach(Content => {
    const ContentCardElement = createContentCard(Content);
    ContentGrid.appendChild(ContentCardElement);
    recommendationsShowed++;
  });
}

function displayBasedOnYourTastes(recommendations) {
  createBasedOnTastesContainer(recommendations);
}

// Jellyfin Initialization and Login Logic
// explicitLogin: the Connect button, where typed credentials win over the saved session token
function InitializeJellyfin(explicitLogin = false) {
  const server = document.getElementById("Server").value.trim(); // Trim whitespace
  const username = document.getElementById("Username").value.trim();
  const password = document.getElementById("Password").value.trim();
  // The Jellyfin class keeps the session token after a login; with it, no password is needed
  const hasSavedSession = typeof Jellyfin !== 'undefined' && typeof Jellyfin.getSavedAuth === 'function' && !!Jellyfin.getSavedAuth(server);

  if (!server || (!(username && password) && !hasSavedSession)) {
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
    onLoginError: (err, response) => {
      // A password the server rejects is useless: never keep it (older versions saved it)
      if (response?.status === 401) forgetSavedPassword();
      const message = (!response && err?.message) || "Authentication failed. Please check your credentials.";
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
      // The Jellyfin class saved the session token: the password is no longer needed anywhere
      forgetSavedPassword();
      jellyfinloginActionBtn.removeAttribute('inactive');
      if (jellyfinLogoutBtn) jellyfinLogoutBtn.hidden = false;
      document.getElementById("loginBtn").setAttribute('logged-in', 'true');
      // Clear any previous error messages
      document.getElementById('loginErrorMessage').innerText = "";
      // Trigger library load after successful login
      if (window.jellyfin.onLibraryLoad) {
          window.jellyfin.IncludeItemsTypes = ["Audio", "Video", "Book", "Movie", "Series", ]
          window.jellyfin.onLibraryLoad(); // Call the callback if it exists
      }
    },
    onLibraryLoad: async () => { // This callback is directly handled by the Jellyfin class when libraries are ready
      // Fetch and display recommendations when libraries are loaded
      await updateTestesSugestions(true);
      await updateRecommendations();
    },
    onSearchFinish: () => {
      // This callback might be for search results, not directly used here for recommendations.
    }
  }, false, { preferCredentials: explicitLogin });
}

// Event listener for the Login/Connect button
jellyfinloginActionBtn.addEventListener('click', () => {
    InitializeJellyfin(true); // Call initialization logic on click
});

// Ends the Jellyfin session (the token stops working) and starts over at the login window
jellyfinLogoutBtn?.addEventListener('click', async () => {
  if (window.jellyfin?.logout) await window.jellyfin.logout();
  location.reload();
});

// Event listener for cleaning memory
cleanMemoryBtn.addEventListener('click', () => jellyfin.cleanDb());

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
  // Only the server address is saved. The login is kept as a session token by the Jellyfin class
  // (localStorage "jellyfinAuth"); username and password are never stored.
  localStorage.setItem("server", serverValue);
}

function loadFieldsFromStorage() {
  const server = localStorage.getItem("server");
  // Saved by older versions: used one last time to get a session token, then removed (forgetSavedPassword)
  const username = localStorage.getItem("username");
  const password = localStorage.getItem("password");

  if (server) document.getElementById("Server").value = server;
  if (username) document.getElementById("Username").value = username;
  if (password) document.getElementById("Password").value = password;
}

// Removes the username/password older versions kept in localStorage and (through the [save] attribute the login
// fields no longer have) in the pageMemory record. The session token makes them unnecessary.
function forgetSavedPassword() {
  localStorage.removeItem("password");
  localStorage.removeItem("username");
  const passwordInput = document.getElementById("Password");
  if (passwordInput) passwordInput.value = "";
  // Rewrites the pageMemory record without the login fields (pageMemory only saves after its restore finished)
  try { window.memory?.savePageInfo?.(); } catch (e) { /* not ready yet: the next save rewrites the record */ }
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

    // Connect when there is a saved session token, or credentials saved by an older version
    const hasSavedSession = typeof Jellyfin !== 'undefined' && typeof Jellyfin.getSavedAuth === 'function' && !!Jellyfin.getSavedAuth(server);
    if (server && ((username && password) || hasSavedSession)) {
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
const getSugestions = async (numberOfRandomWatchedContents = 10, numberOfSimilarContentsPerWatched = 7, useSingleAppearance = true) => {
  try {
    const watchedContents = window.watched || (await getPlayed());
    window.Played = watchedContents;

    const unwatchedContents = window.unwatched || (await getUnplayed());
    window.Unplayed = unwatchedContents;
  
    if (!watchedContents || watchedContents.length === 0) {
        console.warn("No watched Contents found. Cannot generate recommendations based on history.");
        // Optionally, fall back to a general popular Contents list or a default set.
        recommendationsContainer.innerHTML = '<div class="no-results-message">Watch some Contents to get recommendations!</div>';
        return [];
    }
    if (!unwatchedContents || unwatchedContents.length === 0) {
        console.warn("No unwatched Contents found. Cannot generate recommendations.");
        recommendationsContainer.innerHTML = '<div class="no-results-message">No unwatched Contents available.</div>';
        return [];
    }

    // Assuming findSimilar is correctly imported and available
    if (typeof findSimilar !== 'function') {
        console.error("findSimilar function not available. Ensure findSimilar_updated.js is loaded.");
        return [];
    }

    const recommendations = findSimilar(watchedContents, unwatchedContents, numberOfRandomWatchedContents, numberOfSimilarContentsPerWatched, useSingleAppearance);
    return recommendations;

  } catch (error) {
    console.error("Error in getSugestions:", error);
    return []; // Return empty array on error
  }
};

const getSugestionsBasedOnYourTastes = async (isStrict = false) => {
  window.watched = window.Played || (await getPlayed());   // Your already watched items
  window.unwatched = window.Unplayed || (await getUnplayed()); // Content pool
  
  // window.searchEngine = new SearchEngine();
  
  // return window.searchEngine.search(window.unwatched, window.profileQueries, [
  //   { fields: ['CommunityRating'], type: 'desc' },
  //   { fields: ['ProductionYear'], type: 'desc' }
  // ])
  if (!window.watched || window.watched.length === 0) {
    console.warn("No watched Contents found for taste-based recommendations.");
    return [];
  }
  if (!window.unwatched || window.unwatched.length === 0) {
    console.warn("No unwatched Contents found for taste-based recommendations.");
    return [];
  }

  if (typeof getTasteBasedContentfindSimilar !== 'function') {
    console.error("getTasteBasedContentfindSimilar function not available. Ensure findSimilar.js is loaded.");
    return [];
  }

  const tasteRecommendations = await getTasteBasedContentfindSimilar(window.watched, window.unwatched, 6, isStrict, true); // Limit to 10 for taste-based
  return tasteRecommendations;
}

async function updateTestesSugestions(isStrict) {
  try {
    displayBasedOnYourTastes(await getSugestionsBasedOnYourTastes(isStrict))
  } catch (error) {
    console.error("Error fetching taste-based recommendations:", error);
    const tasteRecommendationsContainer = document.getElementById('taste-recommendations-container');
    if (tasteRecommendationsContainer) {
      tasteRecommendationsContainer.innerHTML = '<div class="no-results-message">Error loading taste-based recommendations.</div>';
    }
  }
}

async function updateRecommendations() {
  try {
    displayRecommendations(await getSugestions(ContentsToCheck, similarsToShow, false))
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    recommendationsContainer.innerHTML = '<div class="no-results-message">Error loading recommendations.</div>';
  }
}