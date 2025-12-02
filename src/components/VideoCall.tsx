import React, { useState, useEffect, useRef } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import { useGestures } from '../hooks/useGestures';

interface VideoCallProps {
  roomId: string;
  onLeave: () => void;
}

interface GestureData {
  gesture: string;
  text: string;
  confidence: number;
  timestamp: number;
}

const VideoCall: React.FC<VideoCallProps> = ({ roomId, onLeave }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [remoteGesture, setRemoteGesture] = useState<{
    text: string;
    confidence: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    localStream,
    remoteStream,
    isConnected,
    sendMessage,
    startLocalStream,
    error: webrtcError,
  } = useWebRTC(roomId, {
    onRemoteStream: (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    },
    onDataChannelMessage: (message) => {
      if (message?.type === 'gesture' && message.data) {
        setRemoteGesture({
          text: message.data.text || 'Unknown gesture',
          confidence: message.data.confidence || 0,
        });
      }
    },
  });

  const {
    startRecognition,
    onGestureDetected,
    isModelLoading,
    modelError,
    restartModel,
    detectedText,
    confidence,
  } = useGestures(localVideoRef);

  // Keep local video element in sync with localStream
  useEffect(() => {
    if (localVideoRef.current && localStream && localVideoRef.current.srcObject !== localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Keep remote video element in sync with remoteStream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && remoteVideoRef.current.srcObject !== remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Initialize local media + gesture recognition
  useEffect(() => {
    const init = async () => {
      try {
        const stream = await startLocalStream();
        if (!stream) {
          throw new Error(
            'Could not access camera/microphone. Please check permissions and try again.',
          );
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const ok = await startRecognition();
        if (!ok) {
          throw new Error('Failed to start gesture recognition');
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing call:', err);
        setLocalError(
          err instanceof Error ? err.message : 'Failed to initialize call',
        );
        setIsLoading(false);
      }
    };

    init();
  }, [startLocalStream, startRecognition]);

  // Send local gesture data over data channel to peer
  useEffect(() => {
    const handler = (gestureData: GestureData) => {
      if (!isConnected) return;
      sendMessage({
        type: 'gesture',
        data: {
          text: gestureData.text,
          confidence: gestureData.confidence,
        },
      });
    };

    const unsubscribe = onGestureDetected(handler);
    return () => unsubscribe();
  }, [onGestureDetected, sendMessage, isConnected]);

  // Auto-clear remote gesture overlay
  useEffect(() => {
    if (!remoteGesture) return;
    const timer = setTimeout(() => setRemoteGesture(null), 3000);
    return () => clearTimeout(timer);
  }, [remoteGesture]);

  const combinedError = localError || modelError || webrtcError;

  if (combinedError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-4">
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-6 max-w-md w-full">
          <h3 className="text-lg font-semibold mb-2">Error</h3>
          <p className="mb-4 text-gray-200">{combinedError}</p>
          <div className="flex flex-col space-y-2">
            {(modelError || localError) && (
              <button
                onClick={() => {
                  restartModel();
                  setLocalError(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Retry Gesture Recognition
              </button>
            )}
            <button
              onClick={onLeave}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Leave Call
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-gray-900">
      {/* Loading overlay */}
      {(isLoading || isModelLoading) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/90">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4" />
            <p className="text-gray-300">
              {isModelLoading
                ? 'Loading gesture recognition...'
                : 'Initializing call...'}
            </p>
          </div>
        </div>
      )}

      {/* Remote video */}
      <div className="absolute inset-0">
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full bg-gray-800">
            <p className="text-white">
              {isConnected ? 'Waiting for remote video...' : 'Waiting for peer to join...'}
            </p>
          </div>
        )}

        {/* Remote gesture overlay */}
        {remoteGesture && (
          <div className="absolute top-4 left-0 right-0 flex justify-center">
            <div className="bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg">
              <p className="text-lg font-medium">{remoteGesture.text}</p>
              <div className="w-full bg-gray-600 rounded-full h-2 mt-1">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: `${Math.round(remoteGesture.confidence * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Local video (PIP) */}
      <div className="absolute bottom-4 right-4 w-1/4 h-1/3 rounded-lg overflow-hidden shadow-lg border-2 border-white">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {detectedText && (
          <div className="absolute bottom-2 left-0 right-0">
            <div className="bg-black bg-opacity-70 text-white text-center py-1 px-2 mx-2 rounded">
              <p className="text-sm">
                {detectedText} ({Math.round(confidence * 100)}%)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status banner */}
      {!remoteStream && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg">
          {isConnected ? 'Connecting to peer...' : 'Initializing call...'}
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4">
        <button
          onClick={onLeave}
          className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full shadow-lg flex items-center space-x-2"
        >
          <span>Leave Call</span>
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>

        <button
          onClick={() => {
            if (localStream) {
              const audioTrack = localStream.getAudioTracks()[0];
              if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
            }
          }}
          className="p-2 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors"
          title="Toggle Audio"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default VideoCall;