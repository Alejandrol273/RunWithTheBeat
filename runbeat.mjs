// playlist.mjs
import http from "node:http";
import crypto from "node:crypto";

const CLIENT_ID = process.env.CLIENT_ID;
const GENRE = process.argv[2] || "house";
const TARGET_BPM = Number(process.argv[3] || 128);
const TOLERANCE = 6;        // accept BPM within ±6
const WANTED = 30;          // playlist size to aim for
const MAX_PAGES = 20;       // search pages (10 tracks each)

const PORT = 8888;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = "playlist-modify-private playlist-modify-public";

if (!CLIENT_ID) {
  console.error("Set CLIENT_ID first (see setup above).");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getUserCadence(){
  // APPROXIMATE CADENCE EQUATION: Strides per minute = 225 - (0.45 x Height (cm)) + (4.5 x Speed (m/s)) +- 6 SPM
  let value = document.getElementById("userInput").value;
  bpm = 225 - (0.45 * height) + (4.5 * speed)
  // Run 'npm install prompt-sync' first
  const prompt = require('prompt-sync')();

  const name = prompt('What is your name? ');
  console.log(`Hello ${name}`);

  return bpm
}
// ---------- 1. Authorization (PKCE) ----------
function waitForCode(state) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.end(error ? `Auth failed: ${error}` : "Logged in! You can close this tab.");
      server.close();
      if (error || url.searchParams.get("state") !== state) {
        reject(new Error(error || "State mismatch"));
      } else {
        resolve(code);
      }
    });
    server.listen(PORT, "127.0.0.1");
  });
}

async function getToken() {
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT,
      scope: SCOPES,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    });

  console.log("\nOpen this URL in your browser and approve access:\n\n" + authUrl + "\n");
  const code = await waitForCode(state);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Token exchange failed: " + JSON.stringify(data));
  return data.access_token;
}

// ---------- Spotify helper ----------
async function spotify(token, path, options = {}) {
  const res = await fetch("https://api.spotify.com/v1" + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  return { ok: res.ok, status: res.status, body };
}

// ---------- 2. Search by genre ----------
async function searchGenre(token, genre, offset) {
  const q = encodeURIComponent(`genre:"${genre}"`);
  const r = await spotify(token, `/search?type=track&limit=10&offset=${offset}&q=${q}`);
  if (!r.ok) throw new Error(`Search failed (${r.status}): ${JSON.stringify(r.body)}`);
  return r.body.tracks?.items ?? [];
}

// ---------- 3. BPM lookup (ReccoBeats) ----------
async function getJson(url, retries = 2) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get("retry-after") || 2);
    await sleep(wait * 1000);
    return getJson(url, retries - 1);
  }
  if (!res.ok) {
    console.log(`  ReccoBeats ${res.status}: ${(await res.text()).slice(0, 120)}`);
    return null;
  }
  return res.json();
}

// Takes Spotify IDs, returns a Map of spotifyId -> BPM
async function lookupBpms(spotifyIds) {
  const result = new Map();
  const data = await getJson(`https://api.reccobeats.com/v1/track?ids=${spotifyIds.join(",")}`);
  const tracks = Array.isArray(data) ? data : data?.content ?? [];

  if (tracks.length === 0) {
    console.log("  (none of these tracks were found in ReccoBeats)");
    return result;
  }

  for (const t of tracks) {
    // ReccoBeats gives its own id plus an href that ends in the Spotify ID
    const spotifyId = String(t.href ?? "").split("/").pop();
    if (!spotifyIds.includes(spotifyId)) continue;

    const feat = await getJson(`https://api.reccobeats.com/v1/track/${t.id}/audio-features`);
    await sleep(150);
    if (typeof feat?.tempo === "number") result.set(spotifyId, feat.tempo);
  }
  return result;
}


function bpmMatches(bpm) {
  // also accept half-time / double-time (e.g. 64 or 256 for a 128 target)
  return [TARGET_BPM, TARGET_BPM / 2, TARGET_BPM * 2].some(
    (t) => Math.abs(bpm - t) <= TOLERANCE
  );
}

// ---------- 4. Create playlist + add tracks ----------
async function createPlaylist(token, name) {
  const body = JSON.stringify({ name, description: `${GENRE} @ ~${TARGET_BPM} BPM`, public: false });
  let r = await spotify(token, "/me/playlists", { method: "POST", body });
  if (!r.ok) {
    // fallback to the older endpoint shape
    const me = await spotify(token, "/me");
    r = await spotify(token, `/users/${me.body.id}/playlists`, { method: "POST", body });
  }
  if (!r.ok) throw new Error(`Create playlist failed (${r.status}): ${JSON.stringify(r.body)}`);
  return r.body;
}

async function addTracks(token, playlistId, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    const body = JSON.stringify({ uris: uris.slice(i, i + 100) });
    // Spotify has been renaming /tracks to /items, so try both
    let r = await spotify(token, `/playlists/${playlistId}/items`, { method: "POST", body });
    if (r.status === 404 || r.status === 405) {
      r = await spotify(token, `/playlists/${playlistId}/tracks`, { method: "POST", body });
    }
    if (!r.ok) throw new Error(`Add tracks failed (${r.status}): ${JSON.stringify(r.body)}`);
  }
}

// ---------- main ----------
const token = await getToken();
console.log(`Searching "${GENRE}" for tracks near ${TARGET_BPM} BPM...`);

const seen = new Set();
const uris = [];

for (let page = 0; page < MAX_PAGES && uris.length < WANTED; page++) {
  const tracks = await searchGenre(token, GENRE, page * 10);
  if (tracks.length === 0) break;

  const fresh = tracks.filter((t) => !seen.has(t.id));
  fresh.forEach((t) => seen.add(t.id));
  if (fresh.length === 0) continue;

  const bpms = await lookupBpms(fresh.map((t) => t.id));

  for (const t of fresh) {
    const bpm = bpms.get(t.id);
    if (bpm !== undefined && bpmMatches(bpm)) {
      uris.push(t.uri);
      console.log(`+ ${t.name} (${bpm.toFixed(0)} BPM)`);
      if (uris.length >= WANTED) break;
    }
  }
}

if (uris.length === 0) {
  console.log("No matching tracks found. Try a wider tolerance, a different genre, or check the BPM lookup.");
  process.exit(0);
}

const playlist = await createPlaylist(token, `${GENRE} @ ${TARGET_BPM} BPM`);
await addTracks(token, playlist.id, uris);
console.log(`\nDone! ${uris.length} tracks added: ${playlist.external_urls?.spotify ?? playlist.id}`);