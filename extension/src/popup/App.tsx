import { useState, useRef, useEffect, useCallback } from 'react';
import type { Shot, Screen, BackgroundMsg, PopupMsg } from '../types';
import UploadScreen from './components/UploadScreen';
import ReviewScreen from './components/ReviewScreen';
import GenerateScreen from './components/GenerateScreen';

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
      {/* Floating action buttons */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={handleOpenHailuo}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-xs text-gray-600 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Hailuo
        </button>
        {shots.length > 0 && (
          <button
            onClick={handleClearData}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-xs text-red-400 px-3 py-1.5 rounded-lg shadow-sm hover:bg-red-50 hover:border-red-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {screen === 'upload' && (
        <UploadScreen onShotsLoaded={handleShotsLoaded} />
      )}
      {screen === 'review' && (
        <ReviewScreen
          shots={shots}
          setShots={setShots}
          onGenerate={() => setScreen('generate')}
          onBack={() => setScreen('upload')}
        />
      )}
      {screen === 'generate' && (
        <GenerateScreen
          shots={shots}
          setShots={setShots}
          onBack={() => setScreen('review')}
          generateShot={generateShot}
        />
      )}
    </div>
  );
}
