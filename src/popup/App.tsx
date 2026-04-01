import { useState, useRef, useEffect, useCallback } from 'react';
import type { Shot, Screen, BackgroundMsg, PopupMsg } from '../types';
import UploadScreen from './components/UploadScreen';
import ReviewScreen from './components/ReviewScreen';

export default function App() {
  const [screen, setScreen] = useState<Screen>('upload');
  const [shots, setShots] = useState<Shot[]>([]);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // Connect to background service worker
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'generation' });
    portRef.current = port;

    port.onMessage.addListener((msg: BackgroundMsg) => {
      if (msg.type === 'SHOT_PROGRESS') {
        setShots((prev) =>
          prev.map((s) =>
            s.id === msg.shotId ? { ...s, progress: msg.step } : s
          )
        );
      } else if (msg.type === 'SHOT_DONE') {
        setShots((prev) =>
          prev.map((s) =>
            s.id === msg.shotId
              ? { ...s, status: 'done', videoUrl: msg.videoUrl, progress: undefined }
              : s
          )
        );
      } else if (msg.type === 'SHOT_ERROR') {
        setShots((prev) =>
          prev.map((s) =>
            s.id === msg.shotId
              ? { ...s, status: 'error', errorMsg: msg.error, progress: undefined }
              : s
          )
        );
      }
    });

    port.onDisconnect.addListener(() => {
      portRef.current = null;
    });

    return () => {
      try {
        port.disconnect();
      } catch {
        // Already disconnected
      }
    };
  }, []);

  // Persist shots to chrome.storage.local for resilience
  useEffect(() => {
    if (shots.length > 0) {
      chrome.storage.local.set({ shots });
    }
  }, [shots]);

  // Restore shots from storage on mount
  useEffect(() => {
    chrome.storage.local.get(['shots'], (result) => {
      if (result.shots && result.shots.length > 0) {
        setShots(result.shots);
        setScreen('review');
      }
    });
  }, []);

  const generateShot = useCallback((shot: Shot, model: string) => {
    if (!portRef.current) return;

    setShots((prev) =>
      prev.map((s) =>
        s.id === shot.id ? { ...s, status: 'generating', progress: 'Starting...' } : s
      )
    );

    const msg: PopupMsg = {
      type: 'GENERATE',
      shot: {
        id: shot.id,
        prompt: shot.prompt,
        imageBase64: shot.imageBase64,
        model,
      },
    };

    portRef.current.postMessage(msg);
  }, []);

  const handleShotsLoaded = (newShots: Shot[]) => {
    setShots(newShots);
    setScreen('review');
  };

  const handleOpenHailuo = () => {
    chrome.tabs.create({ url: 'https://hailuoai.video/create/image-to-video' });
  };

  const handleClearData = () => {
    chrome.storage.local.remove(['shots']);
    setShots([]);
    setScreen('upload');
  };

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {screen === 'upload' && (
        <UploadScreen onShotsLoaded={handleShotsLoaded} />
      )}
      {screen === 'review' && (
        <ReviewScreen
          shots={shots}
          setShots={setShots}
          onBack={() => setScreen('upload')}
          onOpenHailuo={handleOpenHailuo}
          onClear={handleClearData}
          generateShot={generateShot}
        />
      )}
    </div>
  );
}
