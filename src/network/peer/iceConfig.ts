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
    iceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }

  return { config: { iceServers } };
}
