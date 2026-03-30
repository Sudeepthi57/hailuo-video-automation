"use client";
import { useState } from "react";
import UploadScreen from "@/components/UploadScreen";
import ReviewScreen from "@/components/ReviewScreen";
import GenerateScreen from "@/components/GenerateScreen";

const API_BASE = "http://localhost:8001";

export type Shot = {
  id: string;
  shotNumber: string;
  narration: string;
  textOnScreen: string;
  visualDescription: string;
  shotDescription: string;
  assetType: string;
  prompt: string;
  imageFile: File | null;
  imagePreview: string | null;
  status: "pending" | "ready" | "generating" | "done" | "error";
  errorMsg?: string;
};

export type Screen = "upload" | "review" | "generate";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("upload");
  const [shots, setShots] = useState<Shot[]>([]);

  const openHailuo = () => {
    fetch(`${API_BASE}/hailuo/open`, { method: "POST" });
  };

  return (
    <main className="min-h-screen bg-gray-50 font-sans">
      <button
        onClick={openHailuo}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-black text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg hover:bg-gray-800 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Open Hailuo
      </button>

      {screen === "upload" && (
        <UploadScreen
          onShotsLoaded={(s) => {
            setShots(s);
            setScreen("review");
          }}
        />
      )}
      {screen === "review" && (
        <ReviewScreen
          shots={shots}
          setShots={setShots}
          onGenerate={() => setScreen("generate")}
          onBack={() => setScreen("upload")}
        />
      )}
      {screen === "generate" && (
        <GenerateScreen
          shots={shots}
          setShots={setShots}
          onBack={() => setScreen("review")}
        />
      )}
    </main>
  );
}