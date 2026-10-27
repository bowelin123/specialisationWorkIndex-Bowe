"use strict";

// DOM Elements
// I made these DOM elements at the top to avoid repeatedly querying the DOM, 
// which improves performance during the rapid timer updates.
const startButton = document.getElementById("start");
const pauseButton = document.getElementById("pause");
const resetButton = document.getElementById("reset");
const hideButton = document.getElementById("toggle-timer");
const previewButton = document.getElementById("preview");
const durationSelect = document.getElementById("duration");
const soundSelect = document.getElementById("sound");
const volumeSlider = document.getElementById("volume");
const volumeLabel = document.getElementById("volume-value");
const timerDisplay = document.getElementById("timer-display");
const hiddenMessage = document.getElementById("hidden-message");
const countdown = document.getElementById("countdown");
const arc = document.getElementById("arc");
const statusText = document.getElementById("status");
const audioStatus = document.getElementById("audio-status");
const today = document.getElementById("today");

// Use the browser's built-in Temporal API when it is available.
// Otherwise, it will use the built-in Date API. 
const TemporalAPI = window.Temporal;

// State & Audio Logic
// Keep track of the timer and audio. Including all the States ("ready", "running", "paused", "completed").
// These state shows which UI controls are active at any given time.
let state = "ready";
let total = Number(durationSelect.value) * 1000;
let remaining = total;
let deadline = null;
let loading = false;
let timerHidden = false;
let previewTimeout = null;
const circumference = 2 * Math.PI * 90;

let audioContext = null;
let volumeControl = null;
let audioLoaded = false;
let rainBuffer = null;
let forestBuffer = null;
let bellBuffer = null;
let backgroundSound = null;
let startBell = null;
let endBell = null;

// Audio Loading
// I used async with an AbortController so that if the network is slow, 
// the browser doesn't hang forever trying to load the mp3 files.
async function loadAudio(path) {
  // Stop a stalled download after 15 seconds so the user can try again.
  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!response.ok) {
      throw new Error("Could not load " + path);
    }
    const file = await response.arrayBuffer();
    return await audioContext.decodeAudioData(file);
  } finally {
    clearTimeout(timeout);
  }
}

async function prepareAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    // All sounds pass through this volume control.
    volumeControl = audioContext.createGain();
    volumeControl.connect(audioContext.destination);
    volumeControl.gain.value = Number(volumeSlider.value) / 100;
  }

  // Browsers need a user's click before they allow sound.
  await audioContext.resume();
  if (audioContext.state !== "running") {
    throw new Error("Audio is blocked by the browser.");
  }

  if (!audioLoaded) {
    rainBuffer = await loadAudio("assets/rain.mp3");
    forestBuffer = await loadAudio("assets/forest.mp3");
    bellBuffer = await loadAudio("assets/temple-bell.mp3");
    audioLoaded = true;
  }
}

function stopSource(source) {
  if (source) {
    source.stop();
    source.disconnect();
  }
}

function stopBackground() {
  stopSource(backgroundSound);
  backgroundSound = null;
}

function stopAllSounds() {
  stopBackground();
  stopSource(startBell);
  stopSource(endBell);
  startBell = null;
  endBell = null;
}

function playBell(time) {
  const source = audioContext.createBufferSource();
  source.buffer = bellBuffer;
  source.connect(volumeControl);
  source.onended = function () {
    source.disconnect();
    if (startBell === source) {
      startBell = null;
    }
    if (endBell === source) {
      endBell = null;
    }
  };
  source.start(time);
  return source;
}

function playBackground(seconds, offset) {
  stopBackground();
  const source = audioContext.createBufferSource();
  if (soundSelect.value === "forest") {
    source.buffer = forestBuffer;
  } else {
    source.buffer = rainBuffer;
  }
  source.loop = true;
  source.connect(volumeControl);
  source.onended = function () {
    source.disconnect();
    if (backgroundSound === source) {
      backgroundSound = null;
    }
  };

  //The remainder (%) resets the position back to the start when the audio loops.
  const position = offset % source.buffer.duration;
  const now = audioContext.currentTime;
  source.start(now, position);
  source.stop(now + seconds);
  backgroundSound = source;
}

function showAudioMessage() {
  if (Number(volumeSlider.value) === 0) {
    audioStatus.textContent = "Audio volume is at 0%. The bell will also be silent.";
  } else {
    audioStatus.textContent = "Audio enabled. Adjust the volume to a comfortable level.";
  }
}


function formatTime(milliseconds) {
  const secondsLeft = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}
// Display & Timer Logic
// The updateDisplay function syncs the Javascript state with the visual UI (ARIA attributes and SVG circle).
function updateDisplay() {
  countdown.textContent = formatTime(remaining);
  const progress = remaining / total;
  arc.style.strokeDasharray = circumference;
  arc.style.strokeDashoffset = circumference * (1 - progress);

  // Give screen readers the same remaining time as the visible display.
  const seconds = Math.ceil(remaining / 1000);
  timerDisplay.setAttribute("aria-valuemax", total / 1000);
  timerDisplay.setAttribute("aria-valuenow", seconds);
  timerDisplay.setAttribute("aria-valuetext",
    Math.floor(seconds / 60) + " minutes " + seconds % 60 + " seconds remaining");

  timerDisplay.hidden = timerHidden;
  hiddenMessage.hidden = !timerHidden;
  hideButton.setAttribute("aria-expanded", !timerHidden);
  if (timerHidden) {
    hideButton.textContent = "Show timer";
  } else {
    hideButton.textContent = "Hide timer";
  }

  if (loading) {
    startButton.textContent = "Loading audio…";
  } else if (state === "paused") {
    startButton.textContent = "Resume";
  } else if (state === "completed") {
    startButton.textContent = "Start again";
  } else {
    startButton.textContent = "Start";
  }

  startButton.disabled = loading || state === "running";
  pauseButton.disabled = loading || state !== "running";
  resetButton.disabled = loading || (state === "ready" && previewTimeout === null);
  durationSelect.disabled = loading || state === "running" || state === "paused";
  soundSelect.disabled = loading;
  previewButton.disabled = loading || state === "running";
  if (previewTimeout !== null) {
    previewButton.textContent = "Stop preview";
  } else {
    previewButton.textContent = "Preview sound";
  }
}

function updateTimer() {
  if (state !== "running") {
    return;
  }

 // Design Choice: I compared the current time with a saved deadline, rather 
 // than subtracting 1 second per tick. This ensures the timer remains perfectly 
 // accurate even if the browser slows down JavaScript in a background tab.
  if (TemporalAPI) {
    const now = TemporalAPI.Now.instant();
    const timeLeft = now.until(deadline);
    remaining = Math.max(0, timeLeft.total("milliseconds"));
  } else {
    // Date.now() returns milliseconds. This fallback does not use Temporal.
    remaining = Math.max(0, deadline - Date.now());
  }

  if (remaining === 0) {
    state = "completed";
    deadline = null;
    stopBackground();
    // The end bell is already scheduled. Let it finish playing.
    statusText.textContent = "Session complete. Take a moment to rest.";
  }
  updateDisplay();
}

// Timer Controls
// I made the start function async because it needs to wait for the audio to load 
// before starting the countdown. This prevents the timer from running while the user hears silence.
async function startSession() {
  if (loading || state === "running") {
    return;
  }
  const resuming = state === "paused";
  loading = true;
  stopPreview();
  stopAllSounds();
  updateDisplay();
  audioStatus.textContent = "Preparing your soundscape…";

  try {
    await prepareAudio();
    if (!resuming) {
      total = Number(durationSelect.value) * 1000;
      remaining = total;
    }
    // Temporal stores the deadline as an Instant. The Date fallback stores
    // it as a number of milliseconds. Resume creates a new deadline using
    // the time left at pause, so paused time is not counted.
    if (TemporalAPI) {
      deadline = TemporalAPI.Now.instant().add({ milliseconds: Math.ceil(remaining) });
    } else {
      deadline = Date.now() + Math.ceil(remaining);
    }
    playBackground(remaining / 1000, (total - remaining) / 1000);
    if (!resuming) {
      startBell = playBell(audioContext.currentTime);
    }
    // I scheduled the end bell so it plays on time, even if the browser pauses scripts in a background tab.
    endBell = playBell(audioContext.currentTime + remaining / 1000);
    state = "running";
    statusText.textContent = "Session in progress. This time is yours.";
    showAudioMessage();
  } catch (error) {
    stopAllSounds();
    deadline = null;
    audioStatus.textContent = "Audio could not load. Check your connection and try Start again.";
    console.warn(error.message);
  }
  loading = false;
  updateDisplay();
}

function pauseSession() {
  if (state !== "running") {
    return;
  }
  updateTimer();
  if (state === "completed") {
    return;
  }
  state = "paused";
  deadline = null;
  stopAllSounds();
  statusText.textContent = "Session paused. Continue when you’re ready.";
  updateDisplay();
}

function resetSession() {
  stopPreview();
  stopAllSounds();
  state = "ready";
  deadline = null;
  total = Number(durationSelect.value) * 1000;
  remaining = total;
  statusText.textContent = "Ready to begin";
  // Reset keeps the user's choice to hide or show the timer.
  updateDisplay();
}

// Preview and other controls.
function stopPreview() {
  clearTimeout(previewTimeout);
  previewTimeout = null;
  if (state !== "running") {
    stopAllSounds();
  }
}

function startPreview() {
  playBackground(3, 0);
  previewTimeout = setTimeout(function () {
    stopPreview();
    updateDisplay();
  }, 3000);
}

async function togglePreview() {
  if (loading || state === "running") {
    return;
  }
  if (previewTimeout !== null) {
    stopPreview();
    updateDisplay();
    return;
  }
  loading = true;
  updateDisplay();
  try {
    await prepareAudio();
    stopAllSounds();
    startPreview();
    showAudioMessage();
  } catch (error) {
    stopAllSounds();
    audioStatus.textContent = "Audio could not load. Please try again.";
    console.warn(error.message);
  }
  loading = false;
  updateDisplay();
}

startButton.addEventListener("click", startSession);
pauseButton.addEventListener("click", pauseSession);
previewButton.addEventListener("click", togglePreview);
resetButton.addEventListener("click", function () {
  resetSession();
  showAudioMessage();
});
durationSelect.addEventListener("change", resetSession);

hideButton.addEventListener("click", function () {
  timerHidden = !timerHidden;
  updateDisplay();
});

soundSelect.addEventListener("change", function () {
  if (state === "running") {
    updateTimer();
    if (state === "running") {
      // Change the background only; keep the same end time and bell.
      playBackground(remaining / 1000, 0);
    }
  } else if (previewTimeout !== null) {
    stopPreview();
    startPreview();
  }
  updateDisplay();
});

volumeSlider.addEventListener("input", function () {
  volumeLabel.textContent = volumeSlider.value + "%";
  if (audioContext) {
    // A short volume fade avoids clicks when the slider moves.
    volumeControl.gain.setTargetAtTime(Number(volumeSlider.value) / 100, audioContext.currentTime, 0.03);
  }
  showAudioMessage();
});

// Visibility & Cleanup
// In order to save resources and create better user's environment, if they navigate away 
// (visibilitychange / pagehide), pause the session and clean up audio nodes to prevent "ghost audio".
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) {
    updateTimer();
  }
});

window.addEventListener("pagehide", function () {
  pauseSession();
  stopPreview();
  stopAllSounds();
});

// Set up the page
// Show the device's local date using whichever built-in API is available.
const dateOptions = { day: "numeric", month: "short", year: "numeric" };
if (TemporalAPI) {
  const date = TemporalAPI.Now.plainDateISO();
  today.dateTime = date.toString();
  today.textContent = date.toLocaleString("en-AU", dateOptions);
} else {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  today.dateTime = date.getFullYear() + "-" + month + "-" + day;
  today.textContent = date.toLocaleDateString("en-AU", dateOptions);
}

// Start the interface in either mode; missing Temporal does not disable it.
updateDisplay();
setInterval(updateTimer, 200);
