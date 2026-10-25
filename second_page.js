// second_page.js
document.addEventListener("DOMContentLoaded", async function () {
    try {
        const response = await fetch("/api/playlist-songs");
        const songs = await response.json();

        const songListContainer = document.querySelector(".song-list");
        songListContainer.innerHTML = ""; // Clear placeholder slots

        if (songs.length === 0) {
            songListContainer.innerHTML = "<li>No matching songs found. Try a different genre!</li>";
            return;
        }

        // Display each song (Name and Artist only)
        songs.forEach((song, index) => {
            const li = document.createElement("li");
            li.innerHTML = `<strong>${index + 1}. ${song.name}</strong> — <em>${song.artist}</em>`;
            songListContainer.appendChild(li);
        });

    } catch (err) {
        console.error("Failed to load playlist songs:", err);
    }
});