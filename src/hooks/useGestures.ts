import { useCallback, useRef, useEffect, useState } from 'react';
import { Hands, Results, NormalizedLandmarkList } from '@mediapipe/hands';

type GestureCallback = (result: {
  gesture: string;
  text: string;
  confidence: number;
  timestamp: number;
}) => void;

interface UseGesturesReturn {
  startRecognition: () => Promise<boolean>;
  onGestureDetected: (callback: GestureCallback) => () => void;
  isModelLoading: boolean;
  modelError: string | null;
  restartModel: () => Promise<void>;
  currentGesture: string;
  detectedText: string;
  confidence: number;
}

export const useGestures = (videoRef: React.RefObject<HTMLVideoElement>): UseGesturesReturn => {
  // Refs for MediaPipe
  const handsRef = useRef<Hands | null>(null);
  const animationFrameRef = useRef<number>();
  const lastGestureRef = useRef<{ gesture: string; timestamp: number }>({ 
    gesture: '', 
    timestamp: 0 
  });
  const callbacksRef = useRef<GestureCallback[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  // State for gesture detection results
  const [currentGesture, setCurrentGesture] = useState('');
  const [detectedText, setDetectedText] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  // Initialize MediaPipe Hands
  const initializeHands = useCallback(async () => {
    try {
      if (typeof window === 'undefined') {
        throw new Error('MediaPipe Hands requires a browser environment');
      }

      if (!videoRef.current) {
        // We cannot start hand tracking until the local video element is attached
        setModelError('Cannot start gesture recognition until local video is ready.');
        return false;
      }

      setIsModelLoading(true);

      // Initialize canvas for drawing
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
        canvasRef.current.style.display = 'none';
        document.body.appendChild(canvasRef.current);
        canvasCtxRef.current = canvasRef.current.getContext('2d');
      }

      // Initialize MediaPipe Hands if not already done
      if (!handsRef.current) {
        handsRef.current = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsRef.current.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        // Set up results handler
        handsRef.current.onResults((results) => {
          processHands(results);
        });

        // Explicitly wait for model initialization and asset loading
        await handsRef.current.initialize();
      }

      // Start recognition loop (do not create another Camera/getUserMedia).
      if (!animationFrameRef.current) {
        let fatalModelError = false;
        const loop = async () => {
          if (fatalModelError) return;
          const video = videoRef.current;
          const hands = handsRef.current;
          if (!hands || !video) {
            animationFrameRef.current = requestAnimationFrame(loop);
            return;
          }

          // Only send valid frames with non-zero intrinsic dimensions.
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            try {
              await hands.send({ image: video });
            } catch (error) {
              console.error('Error sending frame to MediaPipe:', error);
              // Treat WASM aborts / GL context failures as fatal and stop further processing
              fatalModelError = true;
              setModelError('Gesture model crashed. Please refresh the page or try again.');
            }
          }

          if (!fatalModelError) {
            animationFrameRef.current = requestAnimationFrame(loop);
          }
        };

        animationFrameRef.current = requestAnimationFrame(loop);
      }

      setIsModelLoading(false);
      setModelError(null);
      return true;
    } catch (error) {
      console.error('Error initializing MediaPipe Hands:', error);
      setModelError('Failed to initialize hand tracking. Please check your camera permissions.');
      setIsModelLoading(false);
      return false;
    }
  }, [videoRef]);

  // Process hand landmarks and detect gestures
  function processHands(results: Results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      return;
    }

    results.multiHandLandmarks.forEach((landmarks) => {
      const gesture = recognizeGesture(landmarks);
      const confidence = results.multiHandLandmarks?.length > 0 ? 0.9 : 0;
      const gestureText = gestureToText(gesture);
      const timestamp = Date.now();

      // Update state
      setCurrentGesture(gesture);
      setDetectedText(gestureText);
      setConfidence(confidence);

      // Notify callbacks
      const result = { gesture, text: gestureText, confidence, timestamp };
      callbacksRef.current.forEach(callback => {
        try {
          callback(result);
        } catch (e) {
          console.error('Error in gesture callback:', e);
        }
      });
    });
  }

  // Gesture recognition helpers
  const recognizeGesture = (landmarks: NormalizedLandmarkList): string => {
    // Heuristic-based recognition using relative joints within each finger.
    // Y coordinates are normalized [0,1] with 0 at the top of the image.

    if (isThumbUp(landmarks)) return 'THUMB_UP';
    if (isThumbDown(landmarks)) return 'THUMB_DOWN';
    if (isFist(landmarks)) return 'FIST';
    if (isRaisedFist(landmarks)) return 'RAISED_FIST';
    if (isOkSign(landmarks)) return 'OK_SIGN';
    if (isPinch(landmarks)) return 'PINCH';
    if (isPeaceSign(landmarks)) return 'PEACE_SIGN';
    if (isVictoryAlt(landmarks)) return 'VICTORY_ALT';
    if (isRockSign(landmarks)) return 'ROCK_SIGN';
    if (isCallMe(landmarks)) return 'CALL_ME';
    if (isClaw(landmarks)) return 'CLAW';
    if (isPointUp(landmarks)) return 'POINT_UP';
    if (isPointRight(landmarks)) return 'POINT_RIGHT';
    if (isPointLeft(landmarks)) return 'POINT_LEFT';
    if (isPointDown(landmarks)) return 'POINT_DOWN';
    if (isWave(landmarks)) return 'WAVE';
    if (isPalmUp(landmarks)) return 'PALM_UP';
    if (isPalmDown(landmarks)) return 'PALM_DOWN';
    if (isStop(landmarks)) return 'STOP';
    if (isThreeFingers(landmarks)) return 'THREE_FINGERS';
    if (isFourFingers(landmarks)) return 'FOUR_FINGERS';
    if (isFingerHeart(landmarks)) return 'FINGER_HEART';
    if (isCrossFingers(landmarks)) return 'CROSS_FINGERS';

    // More complex multi-hand gestures like HANDSHAKE_START and PRAY are
    // difficult to infer from a single hand; we approximate them with
    // open-hand-like poses so that they at least map to the requested labels.
    if (isHandshakeLike(landmarks)) return 'HANDSHAKE_START';
    if (isPrayLike(landmarks)) return 'PRAY';

    if (isOpenHand(landmarks)) return 'OPEN_HAND';
    return 'UNKNOWN';
  };

  // Helper to get a landmark
  const lm = (landmarks: NormalizedLandmarkList, index: number) => landmarks[index];

  const distance2D = (
    a: NormalizedLandmarkList[number],
    b: NormalizedLandmarkList[number],
  ) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // A finger is "extended" if its tip is significantly above its PIP joint
  const isFingerExtended = (
    landmarks: NormalizedLandmarkList,
    tipIndex: number,
    pipIndex: number,
  ): boolean => {
    const tip = lm(landmarks, tipIndex);
    const pip = lm(landmarks, pipIndex);
    return tip.y < pip.y - 0.02;
  };

  // A finger is "curled" if its tip is at or below its PIP joint (with small tolerance)
  const isFingerCurled = (
    landmarks: NormalizedLandmarkList,
    tipIndex: number,
    pipIndex: number,
  ): boolean => {
    const tip = lm(landmarks, tipIndex);
    const pip = lm(landmarks, pipIndex);
    return tip.y > pip.y - 0.005;
  };

  const isThumbUp = (landmarks: NormalizedLandmarkList): boolean => {
    // Thumb up: thumb extended upward, other fingers curled.
    const thumbExtended = isFingerExtended(landmarks, 4, 3);
    const indexCurled = isFingerCurled(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    return thumbExtended && indexCurled && middleCurled && ringCurled && pinkyCurled;
  };

  const isThumbDown = (landmarks: NormalizedLandmarkList): boolean => {
    // Thumb down: thumb extended downward, other fingers curled.
    const tip = lm(landmarks, 4);
    const pip = lm(landmarks, 3);
    const wrist = lm(landmarks, 0);
    const thumbDown = tip.y > pip.y + 0.02 && tip.y > wrist.y + 0.02;

    const indexCurled = isFingerCurled(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    return thumbDown && indexCurled && middleCurled && ringCurled && pinkyCurled;
  };

  const isPeaceSign = (landmarks: NormalizedLandmarkList): boolean => {
    // Peace sign: index and middle extended, ring and pinky curled.
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleExtended = isFingerExtended(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    return indexExtended && middleExtended && ringCurled && pinkyCurled;
  };

  const isVictoryAlt = (landmarks: NormalizedLandmarkList): boolean => {
    // Victory alt: similar to peace, but hand is higher than wrist.
    if (!isPeaceSign(landmarks)) return false;
    const indexTip = lm(landmarks, 8);
    const wrist = lm(landmarks, 0);
    return indexTip.y < wrist.y - 0.05;
  };

  const isOpenHand = (landmarks: NormalizedLandmarkList): boolean => {
    // Open hand: all four main fingers extended (thumb can vary a bit).
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleExtended = isFingerExtended(landmarks, 12, 10);
    const ringExtended = isFingerExtended(landmarks, 16, 14);
    const pinkyExtended = isFingerExtended(landmarks, 20, 18);

    return indexExtended && middleExtended && ringExtended && pinkyExtended;
  };

  const isFist = (landmarks: NormalizedLandmarkList): boolean => {
    // Fist: all fingers curled.
    const thumbCurled = isFingerCurled(landmarks, 4, 3);
    const indexCurled = isFingerCurled(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    return thumbCurled && indexCurled && middleCurled && ringCurled && pinkyCurled;
  };

  const isRaisedFist = (landmarks: NormalizedLandmarkList): boolean => {
    if (!isFist(landmarks)) return false;
    const wrist = lm(landmarks, 0);
    const indexMcp = lm(landmarks, 5);
    // Hand above wrist a bit
    return indexMcp.y < wrist.y - 0.02;
  };

  const isOkSign = (landmarks: NormalizedLandmarkList): boolean => {
    // OK: thumb and index tips close together, other fingers extended.
    const thumbTip = lm(landmarks, 4);
    const indexTip = lm(landmarks, 8);
    const d = distance2D(thumbTip, indexTip);
    const close = d < 0.07;

    const middleExtended = isFingerExtended(landmarks, 12, 10);
    const ringExtended = isFingerExtended(landmarks, 16, 14);
    const pinkyExtended = isFingerExtended(landmarks, 20, 18);

    return close && middleExtended && ringExtended && pinkyExtended;
  };

  const isPinch = (landmarks: NormalizedLandmarkList): boolean => {
    // Pinch: thumb and index very close, others curled.
    const thumbTip = lm(landmarks, 4);
    const indexTip = lm(landmarks, 8);
    const d = distance2D(thumbTip, indexTip);
    const veryClose = d < 0.04;

    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    return veryClose && middleCurled && ringCurled && pinkyCurled;
  };

  const isRockSign = (landmarks: NormalizedLandmarkList): boolean => {
    // Rock: index and pinky extended, middle and ring curled.
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const pinkyExtended = isFingerExtended(landmarks, 20, 18);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);

    return indexExtended && pinkyExtended && middleCurled && ringCurled;
  };

  const isCallMe = (landmarks: NormalizedLandmarkList): boolean => {
    // Call me: thumb and pinky extended, middle fingers curled.
    const thumbExtended = isFingerExtended(landmarks, 4, 3);
    const pinkyExtended = isFingerExtended(landmarks, 20, 18);
    const indexCurled = isFingerCurled(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);

    return thumbExtended && pinkyExtended && indexCurled && middleCurled && ringCurled;
  };

  const isClaw = (landmarks: NormalizedLandmarkList): boolean => {
    // Claw: all fingers partially curled but not tightly (tips near palm).
    const wrist = lm(landmarks, 0);
    const indexTip = lm(landmarks, 8);
    const middleTip = lm(landmarks, 12);
    const ringTip = lm(landmarks, 16);
    const pinkyTip = lm(landmarks, 20);

    const closeToWrist =
      indexTip.y > wrist.y - 0.02 &&
      middleTip.y > wrist.y - 0.02 &&
      ringTip.y > wrist.y - 0.02 &&
      pinkyTip.y > wrist.y - 0.02;

    return closeToWrist && !isFist(landmarks);
  };

  const isPointUp = (landmarks: NormalizedLandmarkList): boolean => {
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    if (!indexExtended || !middleCurled || !ringCurled || !pinkyCurled) return false;

    const indexTip = lm(landmarks, 8);
    const wrist = lm(landmarks, 0);
    return indexTip.y < wrist.y - 0.02;
  };

  const isPointDown = (landmarks: NormalizedLandmarkList): boolean => {
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    if (!indexExtended || !middleCurled || !ringCurled || !pinkyCurled) return false;

    const indexTip = lm(landmarks, 8);
    const wrist = lm(landmarks, 0);
    return indexTip.y > wrist.y + 0.02;
  };

  const isPointRight = (landmarks: NormalizedLandmarkList): boolean => {
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    if (!indexExtended || !middleCurled || !ringCurled || !pinkyCurled) return false;

    const indexTip = lm(landmarks, 8);
    const wrist = lm(landmarks, 0);
    return indexTip.x > wrist.x + 0.05;
  };

  const isPointLeft = (landmarks: NormalizedLandmarkList): boolean => {
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleCurled = isFingerCurled(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    if (!indexExtended || !middleCurled || !ringCurled || !pinkyCurled) return false;

    const indexTip = lm(landmarks, 8);
    const wrist = lm(landmarks, 0);
    return indexTip.x < wrist.x - 0.05;
  };

  const isWave = (landmarks: NormalizedLandmarkList): boolean => {
    // Approximate wave as open hand with fingers spread (index and pinky further apart).
    if (!isOpenHand(landmarks)) return false;
    const indexTip = lm(landmarks, 8);
    const pinkyTip = lm(landmarks, 20);
    return Math.abs(indexTip.x - pinkyTip.x) > 0.3;
  };

  const isPalmUp = (landmarks: NormalizedLandmarkList): boolean => {
    // Palm up: open hand and palm facing camera (average z smaller than wrist).
    if (!isOpenHand(landmarks)) return false;
    const wrist = lm(landmarks, 0);
    const avgZ =
      (lm(landmarks, 5).z +
        lm(landmarks, 9).z +
        lm(landmarks, 13).z +
        lm(landmarks, 17).z) /
      4;
    return avgZ < wrist.z;
  };

  const isPalmDown = (landmarks: NormalizedLandmarkList): boolean => {
    if (!isOpenHand(landmarks)) return false;
    const wrist = lm(landmarks, 0);
    const avgZ =
      (lm(landmarks, 5).z +
        lm(landmarks, 9).z +
        lm(landmarks, 13).z +
        lm(landmarks, 17).z) /
      4;
    return avgZ > wrist.z;
  };

  const isStop = (landmarks: NormalizedLandmarkList): boolean => {
    // Stop: open hand, palm facing camera and roughly vertical.
    if (!isOpenHand(landmarks)) return false;
    return isPalmDown(landmarks) || isPalmUp(landmarks);
  };

  const isThreeFingers = (landmarks: NormalizedLandmarkList): boolean => {
    // Three fingers: index, middle, ring extended; pinky curled.
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleExtended = isFingerExtended(landmarks, 12, 10);
    const ringExtended = isFingerExtended(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    return indexExtended && middleExtended && ringExtended && pinkyCurled;
  };

  const isFourFingers = (landmarks: NormalizedLandmarkList): boolean => {
    // Four fingers: all except thumb extended.
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleExtended = isFingerExtended(landmarks, 12, 10);
    const ringExtended = isFingerExtended(landmarks, 16, 14);
    const pinkyExtended = isFingerExtended(landmarks, 20, 18);
    const thumbCurled = isFingerCurled(landmarks, 4, 3);

    return indexExtended && middleExtended && ringExtended && pinkyExtended && thumbCurled;
  };

  const isFingerHeart = (landmarks: NormalizedLandmarkList): boolean => {
    // Approximate finger heart: thumb and index bent towards each other with tips close,
    // middle/ring/pinky extended or slightly bent.
    const thumbTip = lm(landmarks, 4);
    const indexTip = lm(landmarks, 8);
    const d = distance2D(thumbTip, indexTip);
    const close = d < 0.06;

    const middleExtended = !isFingerCurled(landmarks, 12, 10);
    const ringExtended = !isFingerCurled(landmarks, 16, 14);
    const pinkyExtended = !isFingerCurled(landmarks, 20, 18);

    return close && middleExtended && ringExtended && pinkyExtended;
  };

  const isCrossFingers = (landmarks: NormalizedLandmarkList): boolean => {
    // Cross fingers: index and middle both extended and close together, ring/pinky curled.
    const indexExtended = isFingerExtended(landmarks, 8, 6);
    const middleExtended = isFingerExtended(landmarks, 12, 10);
    const ringCurled = isFingerCurled(landmarks, 16, 14);
    const pinkyCurled = isFingerCurled(landmarks, 20, 18);

    if (!indexExtended || !middleExtended || !ringCurled || !pinkyCurled) return false;

    const indexTip = lm(landmarks, 8);
    const middleTip = lm(landmarks, 12);
    return distance2D(indexTip, middleTip) < 0.05;
  };

  const isHandshakeLike = (landmarks: NormalizedLandmarkList): boolean => {
    // Rough approximation: open hand tilted sideways (x spread larger than y spread).
    if (!isOpenHand(landmarks)) return false;
    const indexTip = lm(landmarks, 8);
    const pinkyTip = lm(landmarks, 20);
    const dy = Math.abs(indexTip.y - pinkyTip.y);
    const dx = Math.abs(indexTip.x - pinkyTip.x);
    return dx > dy + 0.05;
  };

  const isPrayLike = (landmarks: NormalizedLandmarkList): boolean => {
    // Approximate single-hand pray as open hand near image center.
    if (!isOpenHand(landmarks)) return false;
    const wrist = lm(landmarks, 0);
    return wrist.x > 0.3 && wrist.x < 0.7;
  };

  const gestureToText = (gesture: string): string => {
    const gestureMap: Record<string, string> = {
      'THUMB_UP': '👍 Thumbs up!',
      'PEACE_SIGN': '✌️ Peace!',
      'OPEN_HAND': '🖐️ Open hand',
      'UNKNOWN': '✋ Detected',
      'THUMB_DOWN': '👎 Thumbs down',
      'FIST': '✊ Fist',
      'OK_SIGN': '👌 OK!',
      'PINCH': '🤏 Pinch',
      'ROCK_SIGN': '🤘 Rock!',
      'CALL_ME': '🤙 Call me',
      'CLAW': '🦾 Claw gesture',
      'POINT_UP': '☝️ Pointing up',
      'POINT_RIGHT': '👉 Pointing right',
      'POINT_LEFT': '👈 Pointing left',
      'POINT_DOWN': '👇 Pointing down',
      'CROSS_FINGERS': '🤞 Good luck!',
      'HANDSHAKE_START': '🤝 Handshake',
      'PRAY': '🙏 Namaste / Pray',
      'RAISED_FIST': '✊ Raised fist',
      'PALM_DOWN': '🫳 Palm down',
      'PALM_UP': '🫴 Palm up',
      'STOP': '✋ Stop!',
      'WAVE': '👋 Wave',
      'FINGER_HEART': '🫶 Finger heart',
      'VICTORY_ALT': '✌️ Victory',
      'THREE_FINGERS': '🤟 Three-finger gesture',
      'FOUR_FINGERS': '🖖 Vulcan salute',
    };
    return gestureMap[gesture] || 'Unknown gesture';
  };

  // Start gesture recognition
  const startRecognition = useCallback(async (): Promise<boolean> => {
    try {
      if (!handsRef.current) {
        return await initializeHands();
      }
      return true;
    } catch (error) {
      console.error('Failed to start gesture recognition:', error);
      setModelError('Failed to start gesture recognition. Please check your camera permissions.');
      return false;
    }
  }, [initializeHands]);

  // Register gesture detection callback
  const onGestureDetected = useCallback((callback: GestureCallback) => {
    callbacksRef.current.push(callback);
    return () => {
      callbacksRef.current = callbacksRef.current.filter(cb => cb !== callback);
    };
  }, []);

  // Restart the model
  const restartModel = useCallback(async () => {
    // Clean up existing instances
    if (handsRef.current) {
      try {
        await handsRef.current.close();
      } catch (e) {
        console.warn('Error closing hands model:', e);
      }
      handsRef.current = null;
    }

    // Reset state and reinitialize
    setIsModelLoading(true);
    setModelError(null);
    
    try {
      await initializeHands();
    } catch (error) {
      console.error('Failed to restart model:', error);
      setModelError('Failed to restart hand tracking. Please refresh the page.');
      setIsModelLoading(false);
    }
  }, [initializeHands]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (canvasRef.current && document.body.contains(canvasRef.current)) {
        document.body.removeChild(canvasRef.current);
        canvasRef.current = null;
      }
    };
  }, []);

  return {
    startRecognition,
    onGestureDetected,
    isModelLoading,
    modelError,
    restartModel,
    currentGesture,
    detectedText,
    confidence,
  };
};

export default useGestures;
