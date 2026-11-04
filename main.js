'use strict';

const $ = id => document.getElementById(id);
let pc1, pc2, transceiver, codec = 'H264';

function codecsFor(names) {
  const all = RTCRtpSender.getCapabilities('video').codecs;
  return names.flatMap(n => all.filter(c => c.mimeType === 'video/' + n));
}

async function negotiate() {
  await pc1.setLocalDescription();
  console.log('pc1 offer:\n' + pc1.localDescription.sdp);
  await pc2.setRemoteDescription(pc1.localDescription);
  await pc2.setLocalDescription();
  console.log('pc2 answer:\n' + pc2.localDescription.sdp);
  await pc1.setRemoteDescription(pc2.localDescription);
}

function logStates(pc, name) {
  for (const s of ['signalingState', 'iceGatheringState', 'iceConnectionState', 'connectionState'])
    pc.addEventListener(s.toLowerCase().replace('state', 'statechange'), () => console.log(`${name} ${s}: ${pc[s]}`));
}

$('start').onclick = async () => {
  $('start').disabled = true;
  const stream = await navigator.mediaDevices.getUserMedia({video: true});
  $('local').srcObject = stream;

  pc1 = new RTCPeerConnection();
  pc2 = new RTCPeerConnection();
  logStates(pc1, 'pc1');
  logStates(pc2, 'pc2');
  pc1.onicecandidate = e => { console.log('pc1 ICE candidate:', e.candidate?.candidate ?? '(end)'); pc2.addIceCandidate(e.candidate); };
  pc2.onicecandidate = e => { console.log('pc2 ICE candidate:', e.candidate?.candidate ?? '(end)'); pc1.addIceCandidate(e.candidate); };
  pc2.ontrack = e => $('remote').srcObject = e.streams[0];

  transceiver = pc1.addTransceiver(stream.getVideoTracks()[0], {streams: [stream], direction: 'sendonly'});
  // Both codecs negotiated up front, H264 first, so switching needs no renegotiation.
  transceiver.setCodecPreferences(codecsFor(['H264', 'AV1', 'rtx']));
  await negotiate();

  $('toggle').disabled = false;
  setInterval(showStats, 1000);
};

$('toggle').onclick = async () => {
  const next = codec === 'H264' ? 'AV1' : 'H264';
  const sender = transceiver.sender;
  const params = sender.getParameters();
  params.encodings[0].codec = params.codecs.find(c => c.mimeType === 'video/' + next);
  try {
    await sender.setParameters(params);
  } catch (e) {
    // No per-encoding codec support (e.g. Firefox): reorder preferences and renegotiate.
    console.warn('setParameters codec switch failed, renegotiating:', e);
    transceiver.setCodecPreferences(codecsFor([next, codec, 'rtx']));
    await negotiate();
  }
  codec = next;
  $('toggle').textContent = 'Switch to ' + (codec === 'H264' ? 'AV1' : 'H264');
};

async function showStats() {
  const stats = await pc2.getStats();
  stats.forEach(r => {
    if (r.type !== 'inbound-rtp' || r.kind !== 'video')
      return;
    const c = stats.get(r.codecId);
    $('stats').textContent = `${c ? c.mimeType : '?'} ${r.frameWidth || 0}x${r.frameHeight || 0} @ ${r.framesPerSecond || 0} fps`;
  });
}
