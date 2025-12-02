import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
type Timeout = ReturnType<typeof setTimeout>;

interface SubtitleOverlayProps {
  text: string;
  confidence: number;
  visible: boolean;
  onHide: () => void;
}

export const SubtitleOverlay = ({
  text,
  confidence,
  visible,
  onHide,
}: SubtitleOverlayProps) => {
  const [currentText, setCurrentText] = useState('');
  const [currentConfidence, setCurrentConfidence] = useState(0);
  const hideTimeoutRef = useRef<Timeout>();

  useEffect(() => {
    if (visible && text) {
      setCurrentText(text);
      setCurrentConfidence(confidence);
      
      // Clear any existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      
      // Set timeout to hide after 3 seconds
      hideTimeoutRef.current = setTimeout(() => {
        onHide();
      }, 3000);
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [text, confidence, visible, onHide]);

  // Don't render anything if not visible and no text
  if (!visible && !currentText) return null;

  const confidenceColor = 
    currentConfidence > 0.8 ? 'bg-green-500' : 
    currentConfidence > 0.6 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 max-w-full"
          >
            <div className="flex items-center space-x-3">
              <span className="text-white text-lg font-medium">{currentText}</span>
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full mr-1.5 flex-shrink-0">
                  <div className={`w-full h-full rounded-full ${confidenceColor} animate-pulse`} />
                </div>
                <span className="text-xs text-gray-300">
                  {Math.round(currentConfidence * 100)}%
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SubtitleOverlay;
