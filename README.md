# Content Recommender

This project is a web application that leverages your Jellyfin server to recommend Contents based on your watch history and preferences. It analyzes your watched Contents and suggests similar, unwatched Contents, considering various factors like genre, ratings, actors, directors, and production year.

## Preview
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/fb6805fb-eeb3-4bca-aa5e-cca3bf9f6f5e" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/48e71346-d39e-4f8e-8efd-2b24b42150ad" />



## Features

*   **Personalized Recommendations:** Get Content suggestions tailored to your viewing habits.
*   **Jellyfin Integration:** Connects directly to your Jellyfin server to fetch your library data.
*   **Configurable Similarity:** The `findSimilar.js` file allows you to adjust the weights for different attributes (genre, ratings, actors, etc.) to fine-tune the recommendation algorithm.
*   **User-Friendly Interface:** A clean and intuitive interface to log in to your Jellyfin server and view recommendations.
*   **Web-Based:** Accessible directly through your web browser without any local installation (via the provided GitHub Pages link).

## How It Works

1.  **Jellyfin Connection:** The application first prompts you to log in to your Jellyfin server using your server URL, username, and password.
2.  **Data Fetching:** Once connected, it fetches your played and unplayed Content libraries.
3.  **Similarity Calculation:** The `findSimilar.js` script calculates a similarity score between your watched Contents and the unwatched ones. This score is based on a weighted combination of:
    *   Genres
    *   Critic Ratings
    *   Community Ratings
    *   Actors
    *   Directors/Writers
    *   Studios
    *   Tags
    *   Production Year
4.  **Recommendation Generation:** It then selects a subset of your watched Contents and generates recommendations for each, displaying the top-scoring similar unwatched Contents.

## Live Demo

You can try out the Content Recommender directly on GitHub Pages:

[https://jeffersoncgo.github.io/content-recommender/](https://jeffersoncgo.github.io/content-recommender/)

## Project Structure

*   **`index.html`**: The main HTML file that structures the application's user interface, including the login form and the area where recommendations are displayed.
*   **`style.css`**: Contains all the CSS for styling the application, ensuring a visually appealing and responsive design.
*   **`script.js`**: The main JavaScript file responsible for handling user interactions, connecting to Jellyfin, processing recommendations, and displaying them.
*   **`findSimilar.js`**: Contains the core logic for calculating Content similarities and generating recommendations. This is where you can tweak the `WEIGHTS` object to customize the recommendation algorithm.
*   **External Libraries**: The project utilizes several external JavaScript libraries for Jellyfin API interaction, utility functions, and window management. These are loaded from a CDN.

## How to Run Locally (Optional)

While the application is hosted on GitHub Pages, you can also run it locally for development or testing purposes.

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/jeffersoncgo/Content-recommender.git
    cd Content-recommender
    ```

2.  **Open `index.html`:**
    Open the `index.html` file in your web browser.

3.  **Configure Jellyfin:**
    *   You will see a "Login to Jellyfin" button. Click it to reveal the login form.
    *   Enter your Jellyfin server URL (e.g., `http://localhost:8096`), your Jellyfin username, and your Jellyfin password.
    *   Click the "Connect" button.

4.  **View Recommendations:**
    Once successfully logged in, the application will fetch your library data and display Content recommendations.

## Customization

The `findSimilar.js` file contains a `WEIGHTS` object that allows you to adjust the importance of different Content attributes in the similarity calculation. You can modify these values to prioritize certain aspects of Content similarity according to your preferences. For example, increasing the `DIRECTOR_WRITER` weight will give more importance to shared directors or writers.

```javascript
const WEIGHTS = {
  GENRE: 4,
  CRITIC_RATING: 2,
  COMMUNITY_RATING: 3,
  ACTOR: 3,
  DIRECTOR_WRITER: 5, // Higher weight for directors/writers
  STUDIO: 1,
  TAG: 4,
  PRODUCTION_YEAR: 2,
};
```

## Contributing

Contributions are welcome! If you have any suggestions or find any issues, feel free to open an issue or submit a pull request on the GitHub repository.
