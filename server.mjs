// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8888;

// Your Spotify App Credentials
const CLIENT_ID = "7916fcbec1c74d469649fa377ea3e9a5";
const CLIENT_SECRET = "c88ae139c8e44f8e9b647b0642c4ce99";
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

let pendingRunData = null;
let savedPlaylistTracks = []; // Stores latest songs for the second page

// 1. Form submission triggers Spotify Login redirect
app.post("/submit-run", (req, res) => {
    pendingRunData = req.body; 

    const scopes = "playlist-modify-private playlist-modify-public";
    const spotifyAuthUrl = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: scopes,
        redirect_uri: REDIRECT_URI
    });

    res.redirect(spotifyAuthUrl);
});

// 2. Spotify Callback & Playlist Generator
app.get("/callback", async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("Authorization failed!");

    try {
        const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code: code,
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            })
        });

        const tokenData = await tokenRes.json();
        const token = tokenData.access_token;

        const height = Number(pendingRunData.height) || 170;
        const pace = Number(pendingRunData.pace) || 0;
        const speedMs = pace > 0 ? pace / 3.6 : 2.78;
        const targetBPM = Math.round(225 - (0.45 * height) + (4.5 * speedMs));
        
        const runTime = Number(pendingRunData.selected_time) || 30;
        const targetSongs = Math.ceil(runTime / 3.5);
        const genre = pendingRunData.selected_genre || "Pop";

        console.log(`Target: Genre=${genre}, BPM=${targetBPM}, Songs Needed=${targetSongs}`);

        const uris = [];
        savedPlaylistTracks = [];
        const seen = new Set();
        const tolerance = 6;

        for (let page = 0; page < 10 && uris.length < targetSongs; page++) {
            const searchRes = await fetch(`https://api.spotify.com/v1/search?type=track&limit=10&offset=${page*10}&q=${encodeURIComponent(`genre:"${genre}"`)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const searchData = await searchRes.json();
            const tracks = searchData.tracks?.items ?? [];
            if (tracks.length === 0) break;

            const fresh = tracks.filter(t => !seen.has(t.id));
            fresh.forEach(t => seen.add(t.id));
            if (fresh.length === 0) continue;

            const ids = fresh.map(t => t.id).join(",");
            const rbRes = await fetch(`https://api.reccobeats.com/v1/track?ids=${ids}`);
            const rbData = await rbRes.json();
            const rbTracks = Array.isArray(rbData) ? rbData : rbData?.content ?? [];

            for (const rbT of rbTracks) {
                const spotifyId = String(rbT.href ?? "").split("/").pop();
                const matchTrack = fresh.find(t => t.id === spotifyId);
                if (!matchTrack) continue;

                const featRes = await fetch(`https://api.reccobeats.com/v1/track/${rbT.id}/audio-features`);
                const featData = await featRes.json();

                if (typeof featData?.tempo === "number") {
                    const bpm = featData.tempo;
                    const matches = [targetBPM, targetBPM / 2, targetBPM * 2].some(t => Math.abs(bpm - t) <= tolerance);
                    
                    if (matches) {
                        // Ensure we are grabbing the exact spotify URI (e.g. spotify:track:...)
                        if (matchTrack.uri) {
                            uris.push(matchTrack.uri);
                            const artistNames = matchTrack.artists.map(a => a.name).join(", ");
                            savedPlaylistTracks.push({
                                name: matchTrack.name,
                                artist: artistNames
                            });
                            console.log(`Matched Track: ${matchTrack.name} by ${artistNames} (${bpm} BPM) — URI: ${matchTrack.uri}`);
                        }
                        if (uris.length >= targetSongs) break;
                    }
                }
            }
        }

        console.log(`Total matching tracks found: ${uris.length}`);

        // Create Playlist on Spotify & Add Tracks
        // Create Playlist on Spotify & Add Tracks
        if (uris.length > 0) {
            console.log(`Creating playlist for ${genre} with ${uris.length} tracks...`);
            
            const createRes = await fetch("https://api.spotify.com/v1/me/playlists", {
                method: "POST",
                headers: { 
                    Authorization: `Bearer ${token}`, 
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify({ 
                    name: `${genre} @ ~${targetBPM} BPM`, 
                    description: `Custom running playlist generated by Run With The Beat!`, 
                    public: false 
                })
            });
            
            const playlistData = await createRes.json();
            console.log(`Playlist created successfully: ${playlistData.name} (ID: ${playlistData.id})`);

            if (playlistData.id) {
                const addTracksRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistData.id}/items`, {
                    method: "POST",
                    headers: { 
                        Authorization: `Bearer ${token}`, 
                        "Content-Type": "application/json" 
                    },
                    body: JSON.stringify({ uris: uris })
                });
                const addData = await addTracksRes.json();
                console.log("Add tracks response:", addData);
            } else {
                console.error("Failed to get playlist ID, could not add tracks.");
            }
        } else {
            console.log("Warning: No tracks matched the BPM criteria, so no playlist was created.");
        }

        res.redirect("/second_page.html");

    } catch (err) {
        console.error("Error during playlist generation:", err);
        res.send("An error occurred generating your playlist.");
    }
});
// 3. API endpoint for second page to fetch the songs
app.get("/api/playlist-songs", (req, res) => {
    res.json(savedPlaylistTracks);
});

app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
});