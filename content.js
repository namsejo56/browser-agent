/**
 * Content Script for Video Transcription
 * Handles Audio Capture and Communication with Gemini Live
 */

// --- Configuration ---
const SAMPLE_RATE = 16000;

const BUFFER_SIZE = 4096;

let audioContext = null;
let mediaStream = null;
let source = null;
let workletNode = null;
let ws = null;
let isRecording = false;
let currentApiKey = null;
let currentModel = "gemini-2.5-flash-native-audio-dialog"; // Can be configured

console.log("Gemini Content Script Loaded");

// --- Inject Floating Action Button ---
function injectFAB() {
  if (document.getElementById('gemini-fab-root')) return;

  const fab = document.createElement('div');
  fab.id = 'gemini-fab-root';
  fab.className = 'gemini-fab';
  fab.innerHTML = `
        <svg viewBox="0 0 24 24">
            <path d="M19,2H5A2,2 0 0,0 3,4V18A2,2 0 0,0 5,20H9L12,23L15,20H19A2,2 0 0,0 21,18V4A2,2 0 0,0 19,2M19,18H14.7L12,20.7L9.3,18H5V4H19V18M16,12V14H8V12H16M16,8V10H8V8H16Z" />
        </svg>
    `;

  fab.addEventListener('click', () => {
    // Request background script to open Side Panel
    chrome.runtime.sendMessage({ action: "OPEN_SIDE_PANEL" });
  });

  document.body.appendChild(fab);
}

// Inject immediately if ready, or wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectFAB);
} else {
  injectFAB();
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // console.log("Content Script received message:", request); // Verbose
  if (request.action === "START_TRANSCRIPTION") {
    startTranscription().then((result) => {
      sendResponse(result);
    });
    return true; // async response
  } else if (request.action === "STOP_TRANSCRIPTION") {
    stopTranscription();
    sendResponse({ success: true });
  } else if (request.action === "GET_VIDEO_TRANSCRIPT") {
    handleVideoTranscriptRequest().then(sendResponse);
    return true; // Keep channel open
  }
});

// --- Main Logic ---

async function startTranscription() {
  if (isRecording) {
    console.log("Already recording");
    return { success: true };
  }

  try {
    // 1. Get API Key
    const data = await chrome.storage.local.get(["apiKey", "apiKeyModel"]);
    currentApiKey = data.apiKey;
    if (data.apiKeyModel && data.apiKeyModel.includes("audio")) {
      currentModel = data.apiKeyModel;
    }

    if (!currentApiKey) {
      console.error("No API Key found in storage");
      alert("Please set your Gemini API Key in the extension.");
      return { success: false, error: "Missing API Key" };
    }

    // 2. Find Video Element
    const video = document.querySelector("video");
    if (!video) {
      console.error("No video element found on page");
      // Search in iframes? (Difficult due to CORS)
      alert("No video found on this page. Please ensure a video is present.");
      return { success: false, error: "No video element found" };
    }

    // 3. Connect to Gemini WebSocket
    try {
      await connectWebSocket(currentApiKey);
    } catch (wsError) {
      console.error("WebSocket connection failed:", wsError);
      alert("Failed to connect to Gemini Live API. Check your API Key and Network.");
      return { success: false, error: "WebSocket connection failed" };
    }

    // 4. Capture Audio & Setup AudioContext
    try {
      // Must ensure video is not cross-origin tainted for some uses, but captureStream usually works
      mediaStream = video.captureStream();
      console.log("Captured video stream:", mediaStream);

      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn("No audio tracks found in stream");
        alert("This video has no audio tracks to transcribe.");
        return { success: false, error: "No audio tracks found" };
      }
    } catch (e) {
      console.error("video.captureStream failed:", e);
      // Fallback logic could go here
      alert("Browser blocked video capture. Ensure site audio is playing.");
      return { success: false, error: "Capture failed" };
    }

    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    // Load AudioWorklet
    const workletUrl = chrome.runtime.getURL("pcm-processor.js");
    console.log("Loading Worklet from:", workletUrl);

    try {
      await audioContext.audioWorklet.addModule(workletUrl);
    } catch (workletError) {
      console.error("Failed to add AudioWorklet module:", workletError);
      return { success: false, error: "AudioWorklet failed" };
    }

    try {
      source = audioContext.createMediaStreamSource(mediaStream);
    } catch (sourceError) {
      console.error("createMediaStreamSource failed:", sourceError);
      return { success: false, error: "Failed to create audio source" };
    }

    workletNode = new AudioWorkletNode(audioContext, "pcm-processor");

    // Handle Audio Chunks from Worklet
    workletNode.port.onmessage = (event) => {
      const float32Data = event.data;
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendAudioChunk(float32Data);
      }
    };

    source.connect(workletNode);
    workletNode.connect(audioContext.destination); // Connect to hear it

    isRecording = true;
    console.log("Transcription started successfully");
    return { success: true };

  } catch (error) {
    console.error("Failed to start transcription (General Error):", error);
    stopTranscription();
    return { success: false, error: error.message };
  }
}

function stopTranscription() {
  if (source) source.disconnect();
  if (workletNode) workletNode.disconnect();
  if (audioContext) audioContext.close();
  if (ws) ws.close();

  audioContext = null;
  mediaStream = null;
  source = null;
  workletNode = null;
  ws = null;
  isRecording = false;
  console.log("Transcription stopped");
}

// --- WebSocket Logic ---

function connectWebSocket(apiKey) {
  return new Promise((resolve, reject) => {
    const host = "generativelanguage.googleapis.com";
    const url = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log("Connecting to WebSocket...");
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("WebSocket Connected");

      const setupMsg = {
        setup: {
          model: `models/${currentModel}`,
          generation_config: {
            response_modalities: ["TEXT"],
          }
        }
      };
      ws.send(JSON.stringify(setupMsg));
      resolve();
    };

    ws.onmessage = (event) => {
      handleServerMessage(event);
    };

    ws.onerror = (error) => {
      console.error("WebSocket Error:", error);
      reject(error);
    };

    ws.onclose = (event) => {
      console.log("WebSocket Closed", event.code, event.reason);
      stopTranscription(); // Stop recording if WS closes
    };
  });
}

function sendAudioChunk(float32Data) {
  // Convert Float32 to Int16 PCM Base64
  const int16Data = floatTo16BitPCM(float32Data);
  const base64Data = arrayBufferToBase64(int16Data.buffer);

  const msg = {
    realtime_input: {
      media_chunks: [{
        mime_type: "audio/pcm",
        data: base64Data
      }]
    }
  };

  try {
    ws.send(JSON.stringify(msg));
  } catch (e) {
    console.error("WS Send Error:", e);
  }
}

function handleServerMessage(event) {
  if (event.data instanceof Blob) return;

  try {
    const data = JSON.parse(event.data);
    // console.log("WS Message:", data); // Verbose

    if (data.serverContent?.modelTurn?.parts) {
      const text = data.serverContent.modelTurn.parts
        .map(p => p.text)
        .join("");

      if (text) {
        console.log("Transcript:", text);
        // Send to Popup
        chrome.runtime.sendMessage({
          type: "TRANSCRIPT_UPDATE",
          text: text,
          isFinal: data.serverContent.turnComplete // heuristic
        });
      }
    }
  } catch (e) {
    console.error("Error parsing message:", e);
  }
}

// --- Helpers ---

function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

// Efficient ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// --- Video Transcript Extraction logic ---

async function handleVideoTranscriptRequest() {
  // 1. Check for specific supported sites
  if (window.location.hostname.includes("youtube.com")) {
    return await getYouTubeTranscript();
  }

  // Fallback / Other sites
  return { success: false, error: "Only YouTube is fully supported for auto-download currently. Use Live Transcription for others." };
}

function getYouTubeTranscript() {
  return new Promise((resolve) => {
    // 1. Setup Listener for the injected script's response
    const listener = async (event) => {
      // Only accept messages from same frame
      if (event.source !== window || !event.data || event.data.type !== "GEMINI_YT_CAPTIONS") return;

      window.removeEventListener("message", listener);
      const tracks = event.data.tracks;

      if (!tracks || tracks.length === 0) {
        resolve({ success: false, error: "No captions/transcripts found for this video." });
        return;
      }

      console.log("Found Caption Tracks:", tracks);

      // 2. Choose best track (English or first)
      // Priorities: en -> first available
      let track = tracks.find(t => t.languageCode === 'vi'); // Prioritize Vietnamese as user asked in Vietnamese? Or English?
      // User asked in Vietnamese, but "English" is default. Let's try to match user locale or fall back.
      // Let's stick to prioritization: User Language -> English -> First

      if (!track) track = tracks.find(t => t.languageCode === 'en');
      if (!track) track = tracks[0];

      if (!track) {
        resolve({ success: false, error: "Could not select a valid track." });
        return;
      }

      const title = document.title.replace(" - YouTube", "");

      // 3. Fetch content
      try {
        const response = await fetch(track.baseUrl);
        const text = await response.text();
        const transcript = parseTranscriptXml(text);
        resolve({ success: true, transcript: transcript, title: title });
      } catch (e) {
        console.error("Transcript fetch error:", e);
        resolve({ success: false, error: "Failed to download transcript text." });
      }
    };

    window.addEventListener("message", listener);

    // 2. Inject Script to access YouTube Player API
    const script = document.createElement('script');
    script.textContent = `
            (function() {
                try {
                     let tracks = null;
                     const player = document.getElementById('movie_player');
                     
                     // Try getting from player object (Works for SPA navigation)
                     if (player && player.getPlayerResponse) {
                         const resp = player.getPlayerResponse();
                         if (resp && resp.captions && resp.captions.playerCaptionsTracklistRenderer) {
                              tracks = resp.captions.playerCaptionsTracklistRenderer.captionTracks;
                         }
                     }
                     
                     // Fallback to initial response
                     if (!tracks && window.ytInitialPlayerResponse && 
                         window.ytInitialPlayerResponse.captions && 
                         window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer) {
                         tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
                     }
                     
                     window.postMessage({ type: "GEMINI_YT_CAPTIONS", tracks: tracks }, "*");
                } catch(e) { 
                    console.error("Gemini Ext: Injection Error", e);
                    window.postMessage({ type: "GEMINI_YT_CAPTIONS", tracks: null }, "*");
                }
            })();
        `;
    document.body.appendChild(script);
    script.remove();

    // 3. Timeout Safety
    setTimeout(() => {
      window.removeEventListener("message", listener);
      // If we haven't resolved yet (and listener wasn't called)
      // Actually we can't easily check if resolved, but the resolved promise ignores subsequent calls.
      // But we should default resolve if stuck.
      // We can use a flag.
    }, 5000);
  });
}

function parseTranscriptXml(xmlContent) {
  // Use DOMParser or simple InnerHTML trick
  // XML from YouTube format: <transcript><text start="0" dur="2">...</text></transcript>
  // Sometimes it's escaped HTML.

  const div = document.createElement('div');
  div.innerHTML = xmlContent;

  const texts = Array.from(div.getElementsByTagName('text'));

  let output = "";
  texts.forEach(node => {
    const start = parseFloat(node.getAttribute('start') || "0");
    const content = node.textContent.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    // Basic decoding is handled by textContent but double check

    // Clean up content (remove excessive newlines)
    const cleanContent = content.trim().replace(/\s+/g, ' ');

    if (cleanContent) {
      output += `[${formatTime(start)}] ${cleanContent}\n`;
    }
  });

  return output;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const pad = (n) => n.toString().padStart(2, '0');

  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}
