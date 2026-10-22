// Dedicated Background Web Worker for Alarm Clock Ticks
// Web Workers are NOT throttled to once-a-minute by browser tab backgrounding
let intervalId = null;

self.onmessage = function (event) {
  if (event.data === 'START') {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      self.postMessage('TICK');
    }, 1000);
  } else if (event.data === 'STOP') {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }
};
