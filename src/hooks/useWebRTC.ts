import { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

type WebRTCReturn = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnected: boolean;
  dataChannel: RTCDataChannel | null;
  startLocalStream: () => Promise<MediaStream | null>;
  sendMessage: (message: { type: string; data: any }) => boolean;
  error: string | null;
};

type UseWebRTCOptions = {
  onRemoteStream?: (stream: MediaStream) => void;
  onDataChannelMessage?: (message: any) => void;
};

type JoinAck = {
  roomSize: number;
  role: 'caller' | 'callee';
};

export const useWebRTC = (
  roomId: string,
  callbacks?: UseWebRTCOptions,
): WebRTCReturn => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const isInitiatorRef = useRef(false);
  const roomReadyRef = useRef(false);
  const offerSentRef = useRef(false);

  // ----- helpers ------------------------------------------------------------

  const setupDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log('Data channel opened');
        setIsConnected(true);
      };

      dc.onclose = () => {
        console.log('Data channel closed');
        setIsConnected(false);
      };

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Data channel message received:', message);
          callbacks?.onDataChannelMessage?.(message);
        } catch (e) {
          console.error('Error parsing data channel message:', e);
        }
      };
    },
    [callbacks],
  );

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('candidate', roomId, event.candidate.toJSON());
      }
    };

    pc.ontrack = (event) => {
      if (!event.streams || !event.streams[0]) return;
      const stream = event.streams[0];
      console.log('Remote track received');
      setRemoteStream(stream);
      callbacks?.onRemoteStream?.(stream);
    };

    pc.ondatachannel = (event) => {
      console.log('Remote data channel created:', event.channel.label);
      if (event.channel.label === 'gestures') {
        setupDataChannel(event.channel);
      }
    };

    // Attach local tracks if already available
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Caller creates the data channel
    if (isInitiatorRef.current) {
      const dc = pc.createDataChannel('gestures');
      setupDataChannel(dc);
    }

    pcRef.current = pc;
    return pc;
  }, [roomId, callbacks, setupDataChannel]);

  // ----- signaling handlers -------------------------------------------------

  // Helper to actually accept an offer once we have local media
  const acceptOffer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      console.log('Accepting offer');
      const socket = socketRef.current;
      if (!socket) return;

      let pc = pcRef.current;
      if (!pc) {
        pc = createPeerConnection();
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', roomId, answer);
      } catch (err) {
        console.error('Error handling offer:', err);
        setError('Failed to handle offer');
      }
    },
    [createPeerConnection, roomId],
  );

  const handleOffer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      console.log('Received offer');

      // If local media is not ready yet, defer processing until after
      // getUserMedia completes in startLocalStream.
      if (!localStreamRef.current) {
        console.log('Deferring offer until local media is ready');
        pendingOfferRef.current = offer;
        return;
      }

      await acceptOffer(offer);
    },
    [acceptOffer],
  );

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    console.log('Received answer');
    const pc = pcRef.current;
    if (!pc) return;

    // Only accept an answer when we are in have-local-offer state
    if (pc.signalingState !== 'have-local-offer') {
      console.warn('Ignoring answer in state', pc.signalingState);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('Error handling answer:', err);
      setError('Failed to handle answer');
    }
  }, []);

  const handleCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;

    if (!pc || pc.signalingState === 'closed') {
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }, []);

  const processPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || pc.signalingState === 'closed') return;
 
    while (pendingCandidatesRef.current.length > 0) {
      const candidate = pendingCandidatesRef.current.shift();
      if (!candidate) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding pending ICE candidate:', err);
      }
    }
  }, []);
 
  // Create and send an offer once all preconditions are met
  const createAndSendOffer = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
 
    let pc = pcRef.current;
    if (!pc) {
      pc = createPeerConnection();
    }
 
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', roomId, offer);
      console.log('Offer sent');
    } catch (err) {
      console.error('Error creating offer:', err);
      setError('Failed to start call');
    }
  }, [createPeerConnection, roomId]);
 
  // Only the initiator starts the call, and only after room is ready AND
  // we have obtained a local media stream.
  const maybeStartCall = useCallback(() => {
    if (!isInitiatorRef.current) return;
    if (!roomReadyRef.current) return;
    if (!localStreamRef.current) return;
    if (offerSentRef.current) return;
    offerSentRef.current = true;
    void createAndSendOffer();
  }, [createAndSendOffer]);
 
  // ----- public: startLocalStream ------------------------------------------
 
  const startLocalStream = useCallback(async () => {
    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        console.error('navigator.mediaDevices.getUserMedia is not available');
        setError(
          'Camera/microphone are not available in this browser or on this URL. ' +
            'Open the app from http://localhost:5173 (or use HTTPS) and try again.',
        );
        return null;
      }
 
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
 
      localStreamRef.current = stream;
      setLocalStream(stream);
 
      if (pcRef.current) {
        stream.getTracks().forEach((track) => {
          pcRef.current!.addTrack(track, stream);
        });
      }
 
      // If we received a remote offer before local media was ready,
      // process it now that we have a stream.
      if (pendingOfferRef.current) {
        const offer = pendingOfferRef.current;
        pendingOfferRef.current = null;
        await acceptOffer(offer);
      }
 
      maybeStartCall();
 
      return stream;
    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      const name = err?.name || '';
 
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        setError(
          'Camera or microphone is already in use by another application or tab. Close it and try again.',
        );
      } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError(
          'Camera/microphone permission was denied. Please allow access and reload the page.',
        );
      } else {
        setError('Could not access camera/microphone.');
      }
      return null;
    }
  }, [maybeStartCall]);
 
  // ----- socket setup -------------------------------------------------------

  useEffect(() => {
    console.log('Connecting to signaling server...');

    // Connect directly to the signaling server on port 3002
    const socket = io('http://192.168.0.111:3002', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
      timeout: 20000,
    });

    socketRef.current = socket;

    const onConnect = () => {
      console.log('WebSocket connected with ID:', socket.id);

      socket.emit('join', roomId, (ack: JoinAck) => {
        console.log(
          `Joined room ${roomId}, size=${ack.roomSize}, role=${ack.role}`,
        );
        isInitiatorRef.current = ack.role === 'caller';
      });
    };

    const onConnectError = (err: Error) => {
      console.error('WebSocket connection error:', err);
      setError('Failed to connect to signaling server');
    };

    const onDisconnect = (reason: string) => {
      console.log('WebSocket disconnected:', reason);
    };

    const onRoomReady = () => {
      console.log('Room is ready; starting negotiation (if caller)');
      roomReadyRef.current = true;
      maybeStartCall();
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('room-ready', onRoomReady);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('candidate', handleCandidate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('room-ready', onRoomReady);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('candidate', handleCandidate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  // process queued ICE once pc/remoteDescription is ready
  useEffect(() => {
    processPendingCandidates();
  }, [processPendingCandidates, remoteStream]);

  // ----- public: sendMessage ------------------------------------------------

  const sendMessage = useCallback((message: { type: string; data: any }) => {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') {
      console.warn('Data channel not ready');
      return false;
    }
    try {
      dc.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      return false;
    }
  }, []);

  // ----- cleanup on unmount -------------------------------------------------

  useEffect(() => {
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
        dataChannelRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

  return {
    localStream,
    remoteStream,
    isConnected,
    dataChannel: dataChannelRef.current,
    startLocalStream,
    sendMessage,
    error,
  };
};