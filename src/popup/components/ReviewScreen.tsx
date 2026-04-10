import { useState, useRef, useCallback, useEffect } from 'react';
import type { Shot } from '../../types';

interface Props {
  shots: Shot[];
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  onBack: () => void;
  onOpenHailuo: () => void;
  onClear: () => void;
  generateShot: (shot: Shot, model: string) => void;
}

const MODELS = [
  {
    id: 'Hailuo 2.3-Fast',
    label: 'Hailuo 2.3-Fast',
    badge: 'New',
    desc: 'Faster speed, higher efficiency',
    specs: '768P-1080P · 6s-10s',
  },
  {
    id: 'Hailuo 2.0',
    label: 'Hailuo 2.0',
    badge: null,
    desc: 'Best effect, ultra-clear quality',
    specs: '512P-1080P · 6s-10s',
  },
  {
    id: 'Hailuo 1.0-Director',
    label: 'Hailuo 1.0-Director',
    badge: null,
    desc: 'Control camera like a director',
    specs: '720P · 6s',
  },
];

export default function ReviewScreen({ shots, setShots, onBack, onOpenHailuo, onClear, generateShot }: Props) {
  const [selectedId, setSelectedId] = useState(shots[0]?.id || '');
  const [imageDragging, setImageDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const isRunningRef = useRef(false);

  const selected = shots.find((s) => s.id === selectedId) || shots[0];
  const readyShots = shots.filter((s) => s.imagePreview && s.prompt);
  const readyCount = readyShots.length;
  const doneCount = shots.filter((s) => s.status === 'done').length;
  const errorCount = shots.filter((s) => s.status === 'error').length;

  const updateShot = (id: string, updates: Partial<Shot>) => {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const deleteShot = (id: string) => {
    setShots((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const next = prev.filter((s) => s.id !== id);
      if (id === selectedId && next.length > 0) {
        setSelectedId(next[Math.min(idx, next.length - 1)].id);
      }
      return next;
    });
  };

  // Crop image to 16:9 using canvas, returns base64 data URL
  const cropTo16x9 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const targetRatio = 16 / 9;
        let srcX = 0,
          srcY = 0,
          srcW = img.width,
          srcH = img.height;

        if (img.width / img.height > targetRatio) {
          srcW = Math.round(img.height * targetRatio);
          srcX = Math.round((img.width - srcW) / 2);
        } else {
          srcH = Math.round(img.width / targetRatio);
          srcY = Math.round((img.height - srcH) / 2);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 1280, 720);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = url;
    });
  };

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const base64 = await cropTo16x9(file);
    updateShot(selected.id, {
      imageBase64: base64,
      imagePreview: base64,
      status: 'ready',
    });
  };

  // Global Ctrl+V paste listener
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const blob = imageItem.getAsFile();
        if (blob) await handleImageFile(blob);
        return;
      }
      const files = Array.from(e.clipboardData?.files || []);
      const imageFile = files.find((f) => f.type.startsWith('image/'));
      if (imageFile) await handleImageFile(imageFile);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selected.id, shots]);

  const handleImageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setImageDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleImageFile(file);
    },
    [selected.id, shots]
  );

  // ── Generation logic ──────────────────────────────────────────────────────

  const waitForShotSubmitted = (shotId: string): Promise<void> => {
    return new Promise((resolve) => {
      const TIMEOUT_MS = 3 * 60 * 1000;
      const startTime = Date.now();

      const interval = setInterval(() => {
        if (!isRunningRef.current) { clearInterval(interval); resolve(); return; }
        if (Date.now() - startTime > TIMEOUT_MS) { clearInterval(interval); resolve(); return; }
        setShots((prev) => {
          const current = prev.find((s) => s.id === shotId);
          if (
            current &&
            (current.status === 'done' ||
              current.status === 'error' ||
              current.progress === 'Waiting for video generation...')
          ) {
            clearInterval(interval);
            resolve();
          }
          return prev;
        });
      }, 500);
    });
  };

  const waitForShotCompletion = (shotId: string): Promise<void> => {
    return new Promise((resolve) => {
      const TIMEOUT_MS = 12 * 60 * 1000;
      const startTime = Date.now();

      const interval = setInterval(() => {
        if (!isRunningRef.current) { clearInterval(interval); resolve(); return; }
        if (Date.now() - startTime > TIMEOUT_MS) {
          clearInterval(interval);
          setShots((prev) =>
            prev.map((s) =>
              s.id === shotId && s.status === 'generating'
                ? { ...s, status: 'error', errorMsg: 'Timed out waiting for result' }
                : s
            )
          );
          resolve();
          return;
        }
        setShots((prev) => {
          const current = prev.find((s) => s.id === shotId);
          if (current && (current.status === 'done' || current.status === 'error')) {
            clearInterval(interval);
            resolve();
          }
          return prev;
        });
      }, 2000);
    });
  };

  const runGeneration = async (model: string) => {
    setShowModelPicker(false);
    setSelectedModel(model);
    setIsRunning(true);
    isRunningRef.current = true;

    const shotsSnapshot = shots.filter((s) => s.imagePreview && s.prompt);

    for (let i = 0; i < shotsSnapshot.length; i++) {
      if (!isRunningRef.current) break;

      const shot = shotsSnapshot[i];
      setShots((prev) =>
        prev.map((s) => (s.id === shot.id ? { ...s, status: 'generating' } : s))
      );

      generateShot(shot, model);
      await waitForShotSubmitted(shot.id);
    }

    await Promise.all(shotsSnapshot.map((shot) => waitForShotCompletion(shot.id)));

    setIsRunning(false);
    isRunningRef.current = false;
  };

  const stopGeneration = () => {
    isRunningRef.current = false;
    setIsRunning(false);
  };

  // ── Status helpers ────────────────────────────────────────────────────────

  const statusDot = (shot: Shot) => {
    if (shot.status === 'done') return 'bg-green-500';
    if (shot.status === 'generating') return 'bg-blue-500 animate-pulse';
    if (shot.status === 'error') return 'bg-red-500';
    if (shot.imagePreview && shot.prompt) return 'bg-green-400';
    if (shot.imagePreview || shot.prompt) return 'bg-yellow-400';
    return 'bg-gray-300';
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          <span className="text-sm font-medium text-gray-800">Video Automation</span>
          <span className="text-gray-300">&middot;</span>
          <span className="text-sm text-gray-500">Review Shots</span>
        </div>
        <div className="flex items-center gap-3">
          {isRunning ? (
            <>
              <span className="text-xs text-gray-400">
                {doneCount} done &middot; {errorCount} errors &middot;{' '}
                {readyCount - doneCount - errorCount} remaining
              </span>
              <div className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Generating...
              </div>
              <button
                onClick={stopGeneration}
                className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">
                {readyCount} of {shots.length} ready
              </span>
              <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black rounded-full transition-all"
                  style={{ width: `${(readyCount / shots.length) * 100}%` }}
                />
              </div>
              <button
                onClick={onOpenHailuo}
                className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Open Hailuo
              </button>
              <button
                onClick={onClear}
                className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setShowModelPicker(true)}
                disabled={readyCount === 0}
                className="bg-black text-white text-xs px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
              >
                Generate All ({readyCount}) &rarr;
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Shot list */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">All Shots</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {shots.map((shot) => (
              <div
                key={shot.id}
                onClick={() => setSelectedId(shot.id)}
                className={`group flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition-colors
                  ${
                    shot.id === selectedId
                      ? 'bg-gray-50 border-l-2 border-l-black'
                      : 'hover:bg-gray-50'
                  }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(shot)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800">Shot {shot.shotNumber}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {shot.status === 'generating' && shot.progress
                      ? shot.progress
                      : shot.status === 'error'
                      ? shot.errorMsg
                      : shot.visualDescription || 'No description'}
                  </p>
                </div>
                {shot.imagePreview && (
                  <img src={shot.imagePreview} className="w-8 h-6 object-cover rounded group-hover:hidden" alt="" />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteShot(shot.id); }}
                  disabled={isRunning}
                  className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Delete shot"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Review panel */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Shot header with prev/next */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Shot {selected.shotNumber}</h2>
                <p className="text-sm text-gray-400">{selected.assetType}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const idx = shots.findIndex((s) => s.id === selectedId);
                    if (idx > 0) setSelectedId(shots[idx - 1].id);
                  }}
                  disabled={shots.findIndex((s) => s.id === selectedId) === 0}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                  &larr; Prev
                </button>
                <button
                  onClick={() => {
                    const idx = shots.findIndex((s) => s.id === selectedId);
                    if (idx < shots.length - 1) setSelectedId(shots[idx + 1].id);
                  }}
                  disabled={shots.findIndex((s) => s.id === selectedId) === shots.length - 1}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                  Next &rarr;
                </button>
                <button
                  onClick={() => deleteShot(selected.id)}
                  disabled={isRunning}
                  className="text-xs px-3 py-1.5 border border-red-200 text-red-400 rounded-lg hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Done video link */}
            {selected.status === 'done' && selected.videoUrl && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-xs text-green-700 font-medium">Video ready</span>
                <a
                  href={selected.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={`shot-${selected.shotNumber}.mp4`}
                  className="text-xs text-blue-500 hover:text-blue-700 underline ml-auto"
                >
                  Download
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(selected.videoUrl!)}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-0.5 rounded"
                >
                  Copy URL
                </button>
              </div>
            )}

            {/* Error message */}
            {selected.status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-xs text-red-600">{selected.errorMsg}</p>
              </div>
            )}

            {/* Generating status */}
            {selected.status === 'generating' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-xs text-blue-600">{selected.progress || 'Generating...'}</p>
              </div>
            )}

            {/* IMAGE UPLOAD — 16:9 enforced */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">
                    Reference Image{' '}
                    <span className="text-gray-400 font-normal">(auto-cropped to 16:9)</span>
                  </p>
                  <p className="text-[10px] text-blue-400 mt-0.5">
                    Press Ctrl+V anywhere to paste an image
                  </p>
                </div>
                {selected.imagePreview && (
                  <button
                    onClick={() =>
                      updateShot(selected.id, { imageBase64: null, imagePreview: null })
                    }
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>

              {selected.imagePreview ? (
                <div
                  className="relative w-full cursor-pointer group"
                  style={{ paddingBottom: '56.25%' }}
                  onClick={() => document.getElementById(`img-input-${selected.id}`)?.click()}
                >
                  <img
                    src={selected.imagePreview}
                    alt="Reference"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-xs bg-black/50 px-3 py-1.5 rounded-lg">
                      Click to replace
                    </span>
                  </div>
                  <input
                    id={`img-input-${selected.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageFile(f);
                    }}
                  />
                </div>
              ) : (
                <div
                  onDrop={handleImageDrop}
                  onDragOver={(e) => { e.preventDefault(); setImageDragging(true); }}
                  onDragLeave={() => setImageDragging(false)}
                  onClick={() => document.getElementById(`img-input-${selected.id}`)?.click()}
                  className={`relative w-full cursor-pointer transition-all ${
                    imageDragging ? 'bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  style={{ paddingBottom: '56.25%' }}
                >
                  <input
                    id={`img-input-${selected.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageFile(f);
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-12 h-12 bg-white border border-gray-200 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-600">Drop image here</p>
                      <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-md text-gray-500">Drag &amp; Drop</span>
                      <span className="text-xs bg-blue-50 border border-blue-200 px-2 py-1 rounded-md text-blue-600 font-medium">Ctrl+V Paste</span>
                      <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-md text-gray-500">Browse</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ALL EDITABLE FIELDS */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-600">
                  Shot Details{' '}
                  <span className="text-gray-400 font-normal">(all editable)</span>
                </p>
              </div>
              <div className="p-4 space-y-4">
                {(
                  [
                    { label: 'Narration', key: 'narration', multiline: true },
                    { label: 'Text on Screen', key: 'textOnScreen', multiline: false },
                    { label: 'Visual Description', key: 'visualDescription', multiline: true },
                    { label: 'Shot Description', key: 'shotDescription', multiline: true },
                    { label: 'Asset Type', key: 'assetType', multiline: false },
                  ] as { label: string; key: keyof Shot; multiline: boolean }[]
                ).map(({ label, key, multiline }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                      {label}
                    </label>
                    {multiline ? (
                      <textarea
                        value={(selected[key] as string) || ''}
                        onChange={(e) => updateShot(selected.id, { [key]: e.target.value })}
                        rows={3}
                        className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                      />
                    ) : (
                      <input
                        type="text"
                        value={(selected[key] as string) || ''}
                        onChange={(e) => updateShot(selected.id, { [key]: e.target.value })}
                        className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-gray-400 transition-colors"
                      />
                    )}
                  </div>
                ))}

                {/* PROMPT */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                    Video Prompt{' '}
                    <span className="text-blue-400 normal-case font-normal">(sent to Hailuo)</span>
                  </label>
                  <textarea
                    value={selected.prompt || ''}
                    onChange={(e) => updateShot(selected.id, { prompt: e.target.value })}
                    rows={4}
                    placeholder="Enter the video generation prompt..."
                    className="w-full text-sm text-gray-800 border border-blue-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-blue-400 transition-colors bg-blue-50/30"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {(selected.prompt || '').length} characters
                  </p>
                </div>
              </div>
            </div>

            {/* Save & Next */}
            <div className="flex justify-end pb-6">
              <button
                onClick={() => {
                  updateShot(selected.id, { status: 'ready' });
                  const idx = shots.findIndex((s) => s.id === selectedId);
                  if (idx < shots.length - 1) setSelectedId(shots[idx + 1].id);
                }}
                disabled={!selected.imagePreview || !selected.prompt}
                className="bg-black text-white text-sm px-6 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
              >
                Save &amp; Next &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Model picker modal */}
      {showModelPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-[480px] p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Select Model</h2>
            <p className="text-xs text-gray-400 mb-4">Choose the model to use for all {readyCount} shots</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`text-left rounded-xl border-2 p-3 transition-all cursor-pointer
                    ${selectedModel === m.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-semibold text-gray-900 truncate">{m.label}</span>
                    {m.badge && (
                      <span className="text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-semibold">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 leading-tight mb-1.5">{m.desc}</p>
                  <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                    {m.specs}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowModelPicker(false)}
                className="text-xs text-gray-500 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedModel && runGeneration(selectedModel)}
                disabled={!selectedModel}
                className="bg-black text-white text-xs px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
              >
                Start Generating {readyCount} Videos &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
