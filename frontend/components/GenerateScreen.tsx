"use client";
import { useState, useRef } from "react";
import { Shot } from "@/app/page";

// 1. Update the Props interface:
interface Props {
  shots: Shot[];
  setShots: React.Dispatch<React.SetStateAction<Shot[]>>;
  onBack: () => void;  // ← ADD THIS
}

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001"}/generate-video`;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "my-secret-key";

const MODELS = [
  {
    id: "Hailuo 2.3-Fast",
    label: "Hailuo 2.3-Fast",
    badge: "New",
    desc: "Faster speed, higher efficiency",
    specs: "768P-1080P · 6s-10s",
  },
  {
    id: "Hailuo 2.0",
    label: "Hailuo 2.0",
    badge: null,
    desc: "Best effect, ultra-clear quality",
    specs: "512P-1080P · 6s-10s",
  },
  {
    id: "Hailuo 1.0-Director",
    label: "Hailuo 1.0-Director",
    badge: null,
    desc: "Control camera like a director",
    specs: "720P · 6s",
  },
];

export default function GenerateScreen({ shots, setShots, onBack }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [allDone, setAllDone] = useState(false);
  const [selectedModel, setSelectedModel] = useState("Hailuo 2.3-Fast");
  const isRunningRef = useRef(false);

  const readyShots = shots.filter((s) => s.imagePreview && s.prompt);
  const doneCount = shots.filter((s) => s.status === "done").length;
  const errorCount = shots.filter((s) => s.status === "error").length;
  const progress = Math.round((doneCount / readyShots.length) * 100) || 0;

  const runGeneration = async () => {
    setIsRunning(true);
    isRunningRef.current = true;

    // ✅ Capture shots ONCE at start using a snapshot
    const shotsSnapshot = shots.filter((s) => s.imagePreview && s.prompt);

    for (let i = 0; i < shotsSnapshot.length; i++) {
      if (!isRunningRef.current) break;

      const shot = shotsSnapshot[i];
      setCurrentIndex(i);

      // ✅ Always use functional updater
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: "generating" } : s));

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
          },
          body: JSON.stringify({
            shot_id: shot.id,
            prompt: shot.prompt,
            image_url: shot.imagePreview,
            model: selectedModel,
          }),
        });

        const result = await response.json();

        if (result.status === "success") {
          setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: "done" } : s));
        } else {
          setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: "error", errorMsg: result.message } : s));
        }

      } catch (err: any) {
        setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: "error", errorMsg: err.message } : s));
      }
    }

    setIsRunning(false);
    isRunningRef.current = false;
    setAllDone(true);
  };

  const statusIcon = (shot: Shot) => {
    if (shot.status === "done") return (
      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
        <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
    if (shot.status === "generating") return (
      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
    if (shot.status === "error") return (
      <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
        <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
    return (
      <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
        <div className="w-2 h-2 bg-gray-400 rounded-full" />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

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
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          <span className="text-sm font-medium text-gray-800">Video Automation</span>
          <span className="text-gray-300">·</span>
          <span className="text-sm text-gray-500">Generating Videos</span>
        </div>
        <span className="text-xs text-gray-400">
          {doneCount} done · {errorCount} errors · {readyShots.length - doneCount - errorCount} remaining
        </span>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full p-8">

        {/* ALL DONE banner */}
        {allDone && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-green-800 mb-1">All videos generated! 🎉</h2>
            <p className="text-sm text-green-600">{doneCount} videos completed · {errorCount} errors</p>
          </div>
        )}

        {/* Progress */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-800">Overall Progress</h3>
            <span className="text-sm font-medium text-gray-600">{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-black rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-gray-900">{readyShots.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Total shots</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-green-700">{doneCount}</p>
              <p className="text-xs text-green-500 mt-0.5">Completed</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-red-600">{errorCount}</p>
              <p className="text-xs text-red-400 mt-0.5">Errors</p>
            </div>
          </div>
        </div>

        {/* Model selector — only show before running */}
        {!isRunning && !allDone && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Select Model</p>
            <div className="grid grid-cols-3 gap-3">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`text-left rounded-xl border-2 p-3 transition-all cursor-pointer
                    ${selectedModel === m.id
                      ? "border-black bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                    }`}
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
          </div>
        )}

        {/* Start button */}
        {!isRunning && !allDone && (
          <div className="mb-6 text-center">
            <button
              onClick={runGeneration}
              className="bg-black text-white px-8 py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Start Generating {readyShots.length} Videos →
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Using <span className="font-medium text-gray-600">{selectedModel}</span> · one by one automatically
            </p>
          </div>
        )}

        {isRunning && (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-2 rounded-xl">
              <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Generating shot {currentIndex + 1} of {readyShots.length} · {selectedModel}
            </div>
          </div>
        )}

        {/* Shot list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Shot Queue</p>
          </div>
          <div className="divide-y divide-gray-50">
            {readyShots.map((shot, idx) => (
              <div
                key={shot.id}
                className={`flex items-center gap-4 px-4 py-3 transition-colors
                  ${shot.status === "generating" ? "bg-blue-50" : ""}
                  ${shot.status === "done" ? "bg-green-50/50" : ""}
                `}
              >
                <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}</span>
                {shot.imagePreview ? (
                  <img src={shot.imagePreview} className="w-14 h-9 object-cover rounded-lg flex-shrink-0" alt="" />
                ) : (
                  <div className="w-14 h-9 bg-gray-100 rounded-lg flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">Shot {shot.shotNumber}</p>
                  <p className="text-xs text-gray-400 truncate">{shot.prompt.substring(0, 60)}...</p>
                  {shot.status === "error" && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{shot.errorMsg}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {shot.status === "generating" && <span className="text-xs text-blue-600 font-medium">Generating...</span>}
                  {shot.status === "done" && <span className="text-xs text-green-600 font-medium">Done ✓</span>}
                  {shot.status === "error" && <span className="text-xs text-red-500 font-medium">Error</span>}
                  {shot.status === "ready" && !isRunning && <span className="text-xs text-gray-400">Queued</span>}
                  {shot.status === "ready" && isRunning && idx > currentIndex && <span className="text-xs text-gray-400">Waiting...</span>}
                  {statusIcon(shot)}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}