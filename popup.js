const authManager = window.authManager;

let conversationHistory = [];

// DOM Elements
const loginScreen = document.getElementById("loginScreen");
const loginGoogleBtn = document.getElementById("loginGoogleBtn");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const settingsBtn = document.getElementById("settingsBtn");

const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

// Live Transcription Elements
const toggleLiveBtn = document.getElementById("toggleLiveBtn");
const liveStatus = document.getElementById("liveStatus");
const transcriptionArea = document.getElementById("transcriptionArea");
let isLiveActive = false;

// Talk Elements
const talkBtn = document.getElementById("talkBtn");
const talkStatus = document.getElementById("talkStatus");
const talkWaves = document.getElementById("talkWaves");
const talkHistory = document.getElementById("talkHistory"); // New history element
let isTalkActive = false;
let talkWs = null;
let talkAudioContext = null;
let talkStream = null;
let talkWorkletNode = null;
let talkAudioQueue = [];
let talkIsPlaying = false;

// Configuration for Talk
const SAMPLE_RATE = 16000;

// Tabs
const tabs = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();

  try {
    const isAuth = await authManager.initialize();
    if (isAuth) {
      showMainInterface();
      addMessage("assistant", "Hello! I'm Gemini. How can I help you today?");
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.error("Initialization error:", error);
    showLoginScreen();
  }

  setupEventListeners();
}

function setupTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      // Update Tabs
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update Views
      views.forEach(v => {
        v.classList.remove('active');
        if (v.id === `${target}View`) {
          v.classList.add('active');
        }
      });
    });
  });
}

function setupEventListeners() {
  if (loginGoogleBtn) loginGoogleBtn.addEventListener("click", loginWithGoogle);
  if (saveApiKeyBtn) saveApiKeyBtn.addEventListener("click", saveApiKey);

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      if (confirm("Do you want to logout?")) {
        handleLogout();
      }
    });
  }

  if (sendBtn) sendBtn.addEventListener("click", sendMessage);

  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener("input", () => {
      sendBtn.disabled = !messageInput.value.trim();
    });
  }

  if (toggleLiveBtn) toggleLiveBtn.addEventListener("click", toggleLiveTranscription);
  if (talkBtn) talkBtn.addEventListener("click", toggleTalk);

  const downloadTranscriptBtn = document.getElementById("downloadTranscriptBtn");
  if (downloadTranscriptBtn) {
    downloadTranscriptBtn.addEventListener("click", downloadTranscript);
  }

  const fetchVideoTranscriptBtn = document.getElementById("fetchVideoTranscriptBtn");
  if (fetchVideoTranscriptBtn) {
    fetchVideoTranscriptBtn.addEventListener("click", fetchVideoTranscript);
  }
}

// --- Live Transcription Logic ---

function toggleLiveTranscription() {
  if (!isLiveActive) {
    // Start
    toggleLiveBtn.textContent = "Connecting...";
    toggleLiveBtn.disabled = true;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        appendTranscript("System", "Error: Cannot access current tab.", true);
        resetLiveUI();
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: "START_TRANSCRIPTION" }, (response) => {
        toggleLiveBtn.disabled = false;

        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError);
          appendTranscript("System", "Could not connect to page. Try reloading the page to load the extension.", true);
          resetLiveUI();
        } else if (!response || !response.success) {
          console.error("Response fail:", response);
          const errorMsg = response && response.error ? response.error : "Failed to start. No video or audio found.";
          appendTranscript("System", errorMsg, true);
          resetLiveUI();
        } else {
          // Success
          isLiveActive = true;
          updateLiveUI();
          appendTranscript("System", "Connected. Listening for audio...", true);
        }
      });
    });

  } else {
    // Stop
    isLiveActive = false;
    updateLiveUI();

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "STOP_TRANSCRIPTION" });
      }
    });
    appendTranscript("System", "Transcription stopped.", true);
  }
}

function updateLiveUI() {
  if (isLiveActive) {
    toggleLiveBtn.textContent = "Stop";
    toggleLiveBtn.classList.add("active");
    liveStatus.classList.add("status-active");
    const statusText = liveStatus.querySelector('span:last-child');
    if (statusText) statusText.textContent = "Listening...";
  } else {
    resetLiveUI();
  }
}

function resetLiveUI() {
  isLiveActive = false;
  toggleLiveBtn.textContent = "Start";
  toggleLiveBtn.classList.remove("active");
  liveStatus.classList.remove("status-active");
  const statusText = liveStatus.querySelector('span:last-child');
  if (statusText) statusText.textContent = "Ready to connect";
  toggleLiveBtn.disabled = false;
}

// --- Talk Logic (Voice to Voice) ---

function appendTalkLog(text, type = 'system') {
  if (!talkHistory) return;

  // Default to system style if not specified
  let className = 'message system';
  if (type === 'model') className = 'message assistant';
  if (type === 'user') className = 'message user';
  if (type === 'error') className = 'message error';

  // Check if duplicate of last message to avoid flooding system messages
  const lastMsg = talkHistory.lastElementChild;
  if (lastMsg && lastMsg.textContent === text && (type === 'system' || type === 'error')) return;

  const div = document.createElement("div");
  div.className = className;

  // Handle HTML links (for permissions)
  if (text.includes("<a href")) {
    div.innerHTML = text;
    const link = div.querySelector('a');
    if (link && link.id === 'fixPermsBtn') {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'permissions.html' });
      });
    }
  } else {
    // Simple formatting for model logs
    if (type === 'model') {
      div.innerHTML = text.replace(/\n/g, '<br>');
    } else {
      div.textContent = text;
    }
  }

  talkHistory.appendChild(div);
  talkHistory.scrollTop = talkHistory.scrollHeight;
}

async function toggleTalk() {
  if (isTalkActive) {
    stopTalk();
  } else {
    startTalk();
  }
}

async function startTalk() {
  try {
    talkStatus.textContent = "Requesting microphone...";
    appendTalkLog("Requesting microphone access...", "system");
    talkBtn.disabled = true;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: SAMPLE_RATE, channelCount: 1 } });
    talkStream = stream;

    // Init Audio Context for input and output
    talkAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    await talkAudioContext.audioWorklet.addModule('pcm-processor.js');

    // Connect WS
    talkStatus.textContent = "Connecting to Gemini...";
    const apiKey = authManager.apiKey; // assume initialized
    await connectTalkWebSocket(apiKey);

    // Setup Mic Processing
    const source = talkAudioContext.createMediaStreamSource(stream);
    talkWorkletNode = new AudioWorkletNode(talkAudioContext, 'pcm-processor');

    talkWorkletNode.port.onmessage = (event) => {
      if (talkWs && talkWs.readyState === WebSocket.OPEN) {
        sendTalkAudioChunk(event.data);
      }
    };

    source.connect(talkWorkletNode);
    // Do NOT connect to destination to avoid echo
    talkWorkletNode.connect(talkAudioContext.destination);

    isTalkActive = true;
    talkBtn.classList.add('active');
    talkWaves.classList.remove('hidden');
    talkStatus.textContent = "Listening...";
    appendTalkLog("Gemini is listening...", "system");
    talkBtn.disabled = false;

  } catch (error) {
    console.error("Talk failed:", error);
    stopTalk();

    // Suggest fixing permissions
    if (error.name === "NotAllowedError" || error.name === "PermissionDismissedError") {
      appendTalkLog(`Microphone blocked. <a href="#" id="fixPermsBtn" style="color: #ef4444; text-decoration: underline;">Fix Permissions</a>`, "error");
    } else {
      appendTalkLog("Error: " + error.message, "error");
    }

    talkBtn.disabled = false;
  }
}

function stopTalk() {
  if (isTalkActive) {
    appendTalkLog("Session ended.", "system");
  }
  isTalkActive = false;
  talkBtn.classList.remove('active');
  talkWaves.classList.add('hidden');
  talkStatus.textContent = "Tap to speak";

  if (talkStream) talkStream.getTracks().forEach(track => track.stop());
  if (talkWorkletNode) talkWorkletNode.disconnect();
  if (talkAudioContext) talkAudioContext.close();
  if (talkWs) talkWs.close();

  talkStream = null;
  talkWorkletNode = null;
  talkAudioContext = null;
  talkWs = null;
  talkAudioQueue = [];
}

function connectTalkWebSocket(apiKey) {
  return new Promise((resolve, reject) => {
    const host = "generativelanguage.googleapis.com";
    const url = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    talkWs = new WebSocket(url);

    talkWs.onopen = () => {
      console.log("Talk WS Connected");
      const setupMsg = {
        setup: {
          model: "models/gemini-2.5-flash-native-audio-dialog",
          generation_config: {
            response_modalities: ["AUDIO"], // Audio output
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: "Aoede" // or "Charon", "Kore"
                }
              }
            }
          }
        }
      };
      talkWs.send(JSON.stringify(setupMsg));
      resolve();
    };

    talkWs.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        // Audio data from server
      } else {
        const data = JSON.parse(event.data);

        // Display Text content if available (Model's response text)
        if (data.serverContent?.modelTurn?.parts) {
          const parts = data.serverContent.modelTurn.parts;

          // Check for text part
          const textPart = parts.find(p => p.text);
          if (textPart && textPart.text) {
            appendTalkLog(textPart.text, "model");
          }

          // Check for inline audio
          const audioPart = parts.find(p => p.inlineData);
          if (audioPart && audioPart.inlineData) {
            // Base64 PCM
            playPcmAudio(audioPart.inlineData.data);
          }
        }
      }
    };

    talkWs.onerror = (e) => reject(e);
    talkWs.onclose = () => {
      if (isTalkActive) stopTalk();
    };
  });
}

function sendTalkAudioChunk(float32Data) {
  // Convert to Int16 PCM Base64
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
  talkWs.send(JSON.stringify(msg));
}

// --- Audio Playback ---

function playPcmAudio(base64Data) {
  // Decode base64 to Int16
  const binaryString = window.atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Data = new Int16Array(bytes.buffer);

  // Convert Int16 to Float32 for Web Audio API
  const float32Data = new Float32Array(int16Data.length);
  for (let i = 0; i < int16Data.length; i++) {
    float32Data[i] = int16Data[i] / 32768.0;
  }

  // Create Audio Buffer
  // Gemini Output is typically 24kHz.
  const audioBuffer = talkAudioContext.createBuffer(1, float32Data.length, 24000);
  audioBuffer.getChannelData(0).set(float32Data);

  // Play
  const source = talkAudioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(talkAudioContext.destination);
  source.start();
}

// Receive transcription updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRANSCRIPT_UPDATE") {
    appendTranscript("Gemini", message.text, message.isFinal);
  }
});

function appendTranscript(speaker, text, isFinal) {
  if (!transcriptionArea) return;
  const div = document.createElement("div");
  div.className = `segment ${isFinal ? 'final' : ''}`;
  div.innerHTML = `<strong>${speaker}:</strong> ${text}`;
  transcriptionArea.appendChild(div);
  transcriptionArea.scrollTop = transcriptionArea.scrollHeight;
}

function downloadTranscript() {
  if (!transcriptionArea) return;

  const segments = transcriptionArea.querySelectorAll('.segment');
  if (segments.length === 0) {
    alert("No transcript to save.");
    return;
  }

  let fullText = "";
  segments.forEach(seg => {
    // Extract text content, handling the speaker label
    const speaker = seg.querySelector('strong') ? seg.querySelector('strong').textContent : "";
    const text = seg.innerText.replace(speaker, "").trim();
    fullText += `[${speaker}] ${text}\n`;
  });

  const blob = new Blob([fullText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Video Transcript Fetcher ---

function fetchVideoTranscript() {
  const btn = document.getElementById("fetchVideoTranscriptBtn");
  if (!btn) return;

  const originalHtml = btn.innerHTML;
  btn.textContent = "Fetching...";
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs[0]) {
      alert("Cannot access current tab.");
      btn.innerHTML = originalHtml;
      btn.disabled = false;
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: "GET_VIDEO_TRANSCRIPT" }, (response) => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;

      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        alert("Could not connect to the page. Try refreshing the page.");
        return;
      }

      if (response && response.success) {
        const title = response.title ? response.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'video';
        downloadStringAsFile(response.transcript, `transcript-${title}.txt`);
      } else {
        alert(response.error || "No transcript found for this video. You can try the Live Transcription feature.");
      }
    });
  });
}

function downloadStringAsFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Auth Functions ---

async function loginWithGoogle() {
  try {
    loginGoogleBtn.textContent = "Signing in...";
    await authManager.loginWithGoogle();
    showMainInterface();
  } catch (error) {
    alert("Login failed: " + error.message);
    loginGoogleBtn.textContent = "Sign in with Google (OAuth)";
  }
}

async function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) return;

  try {
    saveApiKeyBtn.textContent = "Verifying...";
    saveApiKeyBtn.disabled = true;

    await authManager.setApiKey(apiKey);

    showMainInterface();
    addMessage("assistant", "API Key verified! I am ready to help.");

  } catch (error) {
    alert(error.message);
  } finally {
    saveApiKeyBtn.textContent = "Continue";
    saveApiKeyBtn.disabled = false;
  }
}

async function handleLogout() {
  await authManager.logout();
  showLoginScreen();
  // Clear chat
  chatMessages.innerHTML = "";
  conversationHistory = [];
}

function showLoginScreen() {
  if (loginScreen) loginScreen.classList.remove("hidden");
}

function showMainInterface() {
  if (loginScreen) loginScreen.classList.add("hidden");
}

// --- Chat Functions ---

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  addMessage("user", message);
  messageInput.value = "";
  sendBtn.disabled = true;

  const loadingDiv = addLoading();

  try {
    // Basic chat implementation using authManager
    const apiUrl = authManager.getApiUrl(); // Uses default or stored model (gemma-3-27b-it)

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: authManager.getAuthHeaders(),
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await response.json();

    loadingDiv.remove();

    if (data.candidates && data.candidates[0].content) {
      addMessage("assistant", data.candidates[0].content.parts[0].text);
    } else {
      addMessage("assistant", "Sorry, I couldn't understand that.");
    }

  } catch (error) {
    loadingDiv.remove();
    addMessage("assistant", "Error: " + error.message);
  } finally {
    sendBtn.disabled = false;
  }
}

function addMessage(role, text) {
  if (!chatMessages) return;
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}`;

  // Format simple markdown
  let html = text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  messageDiv.innerHTML = html;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return messageDiv;
}

function addLoading() {
  if (!chatMessages) return null;
  const div = document.createElement("div");
  div.className = "message assistant";
  div.textContent = "...";
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
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

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
