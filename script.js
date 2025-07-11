document.addEventListener('DOMContentLoaded', () => {
  // ======================
  // Initialization
  // ======================
  const jellyfinloginActionBtn = document.getElementById('loginAction');
  const cleanMemoryBtn = document.getElementById('cleanMemoryBtn');
  const recommendationsContainer = document.getElementById('recommendations-container');

  function makeMovieUrl(id) {
    return `${jellyfin.Server.ExternalAddress}/web/#/details?id=${id}&serverId=${jellyfin.Server.Id}`
  } 


  // Function to Create Because you Watched Container, you must pass the Movie Name
  function createBecauseYouWatchedContainer(movie) {
    const container = document.createElement('div');
    container.classList.add('because-you-watched-container');

    const title = document.createElement('h2');
    title.classList.add('because-you-watched-title');
    title.textContent = `Because you watched `;
    container.appendChild(title);

    // Make an "a" link, to the movie, using makeMovieUrl function and append to the title element
    const movieLink = document.createElement('a');
    movieLink.href = makeMovieUrl(movie.Id);
    movieLink.textContent = movie.Name;
    movieLink.target = "_blank";
    movieLink.classList.add('movie-link');
    title.appendChild(movieLink);


    const movieGrid = document.createElement('div');
    movieGrid.classList.add('movie-grid');
    container.appendChild(movieGrid);

    return { container, movieGrid };
  }
  

  // --- Function to create a single movie card ---
  function createMovieCard(movie) {
    const movieCard = document.createElement('div');
    movieCard.classList.add('movie-card');
    movieCard.setAttribute('data-movie-id', movie.Id); // Useful for event listeners later

    // Construct the image URL. This is a crucial part you'll need to implement.
    // For example, if your `allMovies.json` has an `ImageTag` and you have a base URL for images:
    // const imageUrl = `https://your-image-server.com/images/${movie.ImageTags.Primary}.jpg`;
    // For this template, we use a placeholder.
    const imageUrl = movie.ImageUrl || "https://placehold.co/220x280/808080/FFFFFF?text=No+Image";

    movieCard.innerHTML = `
            <img src="${imageUrl}" alt="${movie.Name} cover">
            <div class="movie-info">
                <h3>${movie.Name}</h3>
                <p class="rating">Score: ${movie.similarityScore !== undefined ? movie.similarityScore.toFixed(0) + '%' : 'N/A'}</p>
                <p class="rating">Community Rating: ${movie.CommunityRating !== undefined ? movie.CommunityRating.toFixed(2) : 'N/A'}</p>
                <p class="year">Year: ${movie.ProductionYear || 'N/A'}</p>
            </div>
        `;

    // Make the movie card, on click to open the movie
    movieCard.addEventListener('click', () => {
      window.open(makeMovieUrl(movie.Id), '_blank');
    });
    return movieCard;
  }

  // --- Function to display recommendations ---
  function displayRecommendations(recommendations) {
    const loadingMessage = document.querySelector('.loading-message');
    if (loadingMessage) {
      loadingMessage.remove(); // Remove the loading message
    }

    if (!recommendations) {
      recommendationsContainer.innerHTML = '<div class="no-results-message">No recommendations found. Try adjusting your preferences!</div>';
      return;
    }

    // Movies is a Object, wich each key is the name of the movie watched, and in it has a array of movies
    recommendations.forEach(watchedMovie => {
      const { container, movieGrid } = createBecauseYouWatchedContainer(watchedMovie);
      watchedMovie.Recommendations.forEach(movie => {
        const movieCardElement = createMovieCard(movie);
        movieGrid.appendChild(movieCardElement);
      });
      recommendationsContainer.appendChild(container);
    })
      
  }

function CreateJellyfin() {
  const server = document.getElementById("Server").value;
  const username = document.getElementById("Username").value;
  const password = document.getElementById("Password").value;
  const OnFail = (message) => {
    jellyfinloginActionBtn.removeAttribute('inactive')
    showWindow("loginBox");
    document.getElementById("loginBtn").setAttribute('logged-in', 'false')
    document.getElementById('loginErrorMessage').innerText = message;
  }
  window.jellyfin = new Jellyfin(server, username, password, {
    onLoginError: (err) => {
      if (err)
        OnFail(err.message)  
      else
        OnFail("Authentication failed. Please check your credentials.")
    },
    onServerSetupError: () => (OnFail("Server is offline. Please check the address.")),
    onLoginSuccess: () => {
      hideWindow("loginBox");
      document.getElementById("loginBtn").setAttribute('logged-in', 'true')
    },

    onLibraryLoad: () => {
      getSugestions(20, 7).then(recommendations => displayRecommendations(recommendations))
    },
    onSearchFinish: () => {
      // fillJellyfinContainerAttr();
      // jellyfinPreviousPageBtn?.setAttribute('disabled', !jellyfin.searchParams.hasPreviousPage);
      // jellyfinNextPageBtn?.setAttribute('disabled', !jellyfin.searchParams.hasNextPage)
    }
  });
  return window.jellyfin;
}

function Login() {
  // if jellyfinloginActionBtn is inactive, just skip
  if (jellyfinloginActionBtn.getAttribute('inactive'))
    return;
  const server = document.getElementById("Server").value
  const username = document.getElementById("Username").value
  const password = document.getElementById("Password").value
  jellyfinloginActionBtn.setAttribute('inactive', 'true')
  jellyfin.UpdateConfig(server, username, password)
}

function cleanMemory() {
  memory.reset().then(() => location.reload());
}

jellyfinloginActionBtn.addEventListener('click', Login)
cleanMemoryBtn.addEventListener('click', cleanMemory)


// ======================
// Storage Functions
// ======================
function saveFieldsToStorage() {
  if (document.getElementById("Server").value.endsWith("/")) {
    document.getElementById("Server").value = document.getElementById("Server").value.slice(0, -1);
  }
  const server = document.getElementById("Server").value;
  const username = document.getElementById("Username").value;
  const password = document.getElementById("Password").value;
  localStorage.setItem("server", server);
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

  loadFieldsFromStorage();
  document.getElementById("Server").addEventListener("change", saveFieldsToStorage);
  document.getElementById("Username").addEventListener("change", saveFieldsToStorage);
  document.getElementById("Password").addEventListener("change", saveFieldsToStorage);


  CreateJellyfin();

  window.memory = new pageMemory();
  window.memory.addEvent('onMemoryIsEmpty', () => dummyStart())
  window.memory.init();


});

const getList = async (Library, PlayStatus) => {
  jellyfin.searchParams.Library = Library || 'Filmes'
  jellyfin.searchParams.page = 1
  jellyfin.searchParams.offset = 0
  jellyfin.searchParams.limit = 999999
  jellyfin.searchParams.hasNextPage = true
  jellyfin.searchParams.IncludePeople  = false;
  if (PlayStatus == 'Played') {
    jellyfin.searchParams.PlayedOnly = true
    jellyfin.searchParams.UnplayedOnly = false
  } else {
    jellyfin.searchParams.PlayedOnly = false
    jellyfin.searchParams.UnplayedOnly = true  
  }
  return jellyfin.searchItems('', '', {})
}
const getPlayed = async Library => getList(Library, 'Played')
const getUnplayed = async Library => getList(Library, 'Unplayed')


const getSugestions = async (NumRandomWatched = 10, NumSimilarPerWatched = 7) => {
  const played = await getPlayed();
  const unplayed = await getUnplayed();
  return findSimilar(played, unplayed, NumRandomWatched, NumSimilarPerWatched);
}