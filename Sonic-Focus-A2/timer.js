// All six pages share basic controls; only the experimental feedback changes.
const prototype = Number(document.body.dataset.prototype);
const start = document.querySelector('#start');
const pause = document.querySelector('#pause');
const reset = document.querySelector('#reset');
const duration = document.querySelector('#duration');
const status = document.querySelector('#status');
const timer = document.querySelector('#timer');
const bellMode = document.querySelector('#bell-mode');
let total = Number(duration.value);
let remaining = total;
let interval = null;
let endTime = 0;
let nextCue = 0;

function draw() {
  const seconds = Math.ceil(remaining);
  if (timer) {
    timer.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  if (prototype === 2) {
    document.querySelector('#arc').style.strokeDashoffset = 100 * (1 - remaining / total);
    document.querySelector('#percent').textContent = Math.ceil(remaining / total * 100) + '% remaining';
  }
  // Prototype 6 changes volume continuously, from 50% to 10%.
  if (prototype === 6) ambience.volume = 0.1 + 0.4 * remaining / total;
}

function stopTimer() {
  clearInterval(interval);
  interval = null;
  start.disabled = false;
  pause.disabled = true;
}

function tick() {
  // Use a deadline so delayed browser callbacks do not slow the countdown.
  remaining = Math.max(0, (endTime - Date.now()) / 1000);
  draw();
  if (remaining === 0) {
    stopTimer();
    pauseSound();
    status.textContent = 'Session complete';
    if (prototype === 4 || prototype === 5) ringBell();
  } else if (prototype === 5 && total - remaining >= nextCue) {
    ringBell(bellMode.value === 'interval');
    status.textContent = bellMode.value === 'halfway' ? 'Halfway reached' : 'Interval bell';
    // Skip missed cues when returning from a background tab.
    const step = total === 30 ? 10 : 300;
    nextCue = bellMode.value === 'halfway' ? Infinity : (Math.floor((total - remaining) / step) + 1) * step;
  }
}

function resetTimer() {
  stopTimer();
  total = Number(duration.value);
  remaining = total;
  nextCue = bellMode && bellMode.value === 'interval' ? (total === 30 ? 10 : 300) : total / 2;
  duration.disabled = false;
  if (bellMode) bellMode.disabled = false;
  pauseSound();
  ambience.currentTime = 0;
  bell.pause();
  bell.currentTime = 0;
  status.textContent = 'Ready';
  if (prototype === 3) {
    timer.hidden = true;
    document.querySelector('#reveal').textContent = 'Show time';
  }
  draw();
}

start.addEventListener('click', () => {
  if (interval !== null) return;
  if (remaining === 0) resetTimer();
  const firstStart = remaining === total;
  endTime = Date.now() + remaining * 1000;
  interval = setInterval(tick, 200);
  start.disabled = true;
  pause.disabled = false;
  duration.disabled = true;
  if (bellMode) bellMode.disabled = true;
  status.textContent = 'Focusing';
  if (firstStart && (prototype === 4 || prototype === 5)) ringBell();
  if (prototype === 6) playSound();
});

pause.addEventListener('click', () => {
  tick();
  if (remaining === 0) return;
  stopTimer();
  pauseSound();
  bell.pause();
  status.textContent = 'Paused';
});
reset.addEventListener('click', resetTimer);
duration.addEventListener('change', resetTimer);
if (bellMode) bellMode.addEventListener('change', resetTimer);
if (prototype === 3) {
  document.querySelector('#reveal').addEventListener('click', (event) => {
    timer.hidden = !timer.hidden;
    event.target.textContent = timer.hidden ? 'Show time' : 'Hide time';
  });
}
resetTimer();
