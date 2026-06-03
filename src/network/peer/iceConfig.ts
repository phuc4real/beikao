import type { PeerJSOption } from 'peerjs';

/**
 * ICE servers for WebRTC. STUN alone works on many networks; symmetric-NAT /
 * mobile / corporate networks need a TURN relay. Configure TURN via env
 * (VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL) for production —
 * without it, some peers will fail to connect. See TDD §4.
 */
export function peerOptions(): PeerJSOption {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    // Preferred: your own TURN server, configured via env / GitHub secrets.
    iceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  } else {
    // Best-effort free public TURN (OpenRelay) so cross-network play works out
    // of the box. It is rate-limited and not guaranteed — for anything serious,
    // run your own TURN and set VITE_TURN_URL/USERNAME/CREDENTIAL. Without any
    // TURN, peers behind symmetric NAT / mobile networks can't connect at all.
    iceServers.push(
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    );
  }

  return { config: { iceServers } };
}
