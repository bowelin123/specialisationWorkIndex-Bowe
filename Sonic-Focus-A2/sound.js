// Local audio files keep the sound code short and work offline.
const sound = document.querySelector('#sound');
const audioStatus = document.querySelector('#audio-status');
const ambience = new Audio('audio/Rain.mp3');
const bell = new Audio('audio/temple bell.mp3');
const backgroundFiles = { rain: 'Rain.mp3', forest: 'Forest.mp3' };
let currentBell = 'temple bell.mp3';
ambience.loop = true;
ambience.volume = 0.5;

function playSound() {
  ambience.play().then(() => {
    audioStatus.textContent = 'Sound playing';
  }).catch(() => {
    audioStatus.textContent = 'Sound could not play. Press Play sound to retry.';
  });
}

function pauseSound() {
  ambience.pause();
  audioStatus.textContent = 'Sound paused';
}

function ringBell(isInterval = false) {
  const file = isInterval ? 'Singing bell.mp3' : 'temple bell.mp3';
  if (file !== currentBell) {
    bell.pause();
    bell.src = 'audio/' + file;
    currentBell = file;
  }
  bell.currentTime = 0;
  bell.play().catch(() => {
    audioStatus.textContent = 'Bell could not play. Check browser audio permissions.';
  });
}

sound.addEventListener('change', () => {
  const wasPlaying = !ambience.paused;
  ambience.src = 'audio/' + backgroundFiles[sound.value];
  if (wasPlaying) playSound();
});
document.querySelector('#play-sound').addEventListener('click', playSound);
document.querySelector('#pause-sound').addEventListener('click', pauseSound);
