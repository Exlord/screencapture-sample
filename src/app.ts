import EBMLReader from 'ts-ebml/lib/EBMLReader';
import EBMLDecoder from 'ts-ebml/lib/EBMLDecoder';
import { makeMetadataSeekable } from 'ts-ebml/lib/tools';
import { saveAs } from 'file-saver';

const startBtn = document.querySelector<HTMLButtonElement>('#start');
const stopBtn = document.querySelector<HTMLButtonElement>('#stop');
const pauseBtn = document.querySelector<HTMLButtonElement>('#pause');
const preview = document.querySelector<HTMLVideoElement>('#preview');

let mediaRecorder: MediaRecorder;
let startTime: number;
let endTime: number;
let startDate;
let recordedChunks = [];
let stream: MediaStream;
let recordIndex = 1;
const RecordTimeout = 60000;
let recordTimer;
let micStreamTrack;
let micStream;

let audioContext: AudioContext;
let mediaStreamAudioDestinationNode;

window.addEventListener('beforeunload', stop);
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
pauseBtn.addEventListener('click', pause);

function start() {
  startBtn.setAttribute('disabled', 'disabled');
  stopBtn.removeAttribute('disabled');
  pauseBtn.removeAttribute('disabled');

  startRecording();
}

function pause() {
  startBtn.setAttribute('disabled', 'disabled');
  stopBtn.setAttribute('disabled', 'disabled');
  pauseBtn.removeAttribute('disabled');
}

async function stop() {
  startBtn.removeAttribute('disabled');
  stopBtn.setAttribute('disabled', 'disabled');
  pauseBtn.setAttribute('disabled', 'disabled');

  await stopRecording();
}

async function getDisplayMedia() {
  const gdmOptions: DisplayMediaStreamConstraints = {
    video: true,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 44100
    }
  };
  try {
    preview.srcObject = null;
    stream = await navigator.mediaDevices.getDisplayMedia(gdmOptions);
    preview.srcObject = stream;
    console.log('stream captured');
    return stream;
  } catch (err) {
    console.error(`getDisplayMedia: `, err);
  }
}

async function setupRecorder() {
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => {
    recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = recordingStopped;
  mediaRecorder.start(1000);
}

async function startRecording() {
  stream = await getDisplayMedia();
  if (!stream) return;

  startDate = Date.now();
  startTime = Date.now();
  setupRecorder();

  console.log('record started');

  recordTimer = setInterval(() => {
    mediaRecorder.stop();

    setupRecorder();
  }, RecordTimeout);
}

async function stopRecording() {
  clearTimeout(recordTimer);
  console.log(stream);
  console.log(mediaRecorder);
  if (stream) stopStream(stream);
  if (mediaRecorder) {
    mediaRecorder.stop();
    console.log(mediaRecorder.state);
  }
  console.log('recorder stopped');
}

/**
 *
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
function readAsArrayBuffer(blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.onloadend = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.onerror = (ev) => {
      reject(ev);
    };
  });
}

async function getSeekableBlob(inputBlob, mimeType, duration) {
  // EBML.js copyrights goes to: https://github.com/legokichi/ts-ebml
  const reader = new EBMLReader();
  const decoder = new EBMLDecoder();
  reader.drop_default_duration = false;
  const webMBuf = await readAsArrayBuffer(inputBlob);
  const ebmlElms = decoder.decode(webMBuf);
  ebmlElms.forEach(function (element) {
    reader.read(element);
  });
  reader.stop();
  const refinedMetadataBuf = makeMetadataSeekable(reader.metadatas, duration, reader.cues);
  const body = webMBuf.slice(reader.metadataSize);
  return new Blob([refinedMetadataBuf, body], {
    type: mimeType
  });
}

function stopStream(stream) {
  let tracks = [
    ...stream.getAudioTracks(),
    ...stream.getVideoTracks()
  ];

  for (const track of tracks) track.stop();
}

async function saveRecording() {
  if (recordedChunks.length) {
    const duration = Date.now() - startTime;
    startTime = Date.now();
    let blob = new Blob(recordedChunks, { type: 'video/webm; codecs=vp9, opus' });
    blob = await getSeekableBlob(blob, 'video/webm; codecs=vp9, opus', duration);
    saveAs(blob, `record-${startDate}(${recordIndex}).webm`);
    recordIndex++;
    recordedChunks = [];
  }
}

async function recordingStopped(e) {
  console.log('recordingStopped');
  endTime = Date.now();
  await saveRecording();
}
