import { useState, useCallback, useEffect } from 'react';
import type { Shot } from '../../types';

interface Props {
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  onGenerate: () => void;
  onBack: () => void;
  onOpenHailuo: () => void;
  onClear: () => void;
}

export default function ReviewScreen({ shots, setShots, onGenerate, onBack, onOpenHailuo, onClear }: Props) {
  const [selectedId, setSelectedId] = useState(shots[0]?.id || '');
  const [imageDragging, setImageDragging] = useState(false);

  const selected = shots.find((s) => s.id === selectedId) || shots[0];
  const readyCount = shots.filter((s) => s.imagePreview && s.prompt).length;

  const updateShot = (id: string, updates: Partial<Shot>) => {
    setShots(shots.map((s) => (s.id === id ? { ...s, ...updates } : s)));
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
          // Too wide — crop sides
          srcW = Math.round(img.height * targetRatio);
          srcX = Math.round((img.width - srcW) / 2);
        } else {
          // Too tall — crop top/bottom
          srcH = Math.round(img.width / targetRatio);
          srcY = Math.round((img.height - srcH) / 2);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 1280, 720);
        URL.revokeObjectURL(url);
        const base64 = canvas.toDataURL('image/jpeg', 0.92);
        resolve(base64);
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

  const statusDot = (shot: Shot) => {
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
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
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
            onClick={onGenerate}
            disabled={readyCount === 0}
            className="bg-black text-white text-xs px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
          >
            Generate All ({readyCount}) &rarr;
          </button>
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
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition-colors
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
                    {shot.visualDescription || 'No description'}
                  </p>
                </div>
                {shot.imagePreview && (
                  <img
                    src={shot.imagePreview}
                    className="w-8 h-6 object-cover rounded"
                    alt=""
                  />
                )}
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
                  disabled={
                    shots.findIndex((s) => s.id === selectedId) === shots.length - 1
                  }
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                >
                  Next &rarr;
                </button>
              </div>
            </div>

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
                  onDragOver={(e) => {
                    e.preventDefault();
                    setImageDragging(true);
                  }}
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
                      <svg
                        className="w-6 h-6 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909"
                        />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-600">Drop image here</p>
                      <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-md text-gray-500">
                        Drag &amp; Drop
                      </span>
                      <span className="text-xs bg-blue-50 border border-blue-200 px-2 py-1 rounded-md text-blue-600 font-medium">
                        Ctrl+V Paste
                      </span>
                      <span className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-md text-gray-500">
                        Browse
                      </span>
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
    </div>
  );
}
