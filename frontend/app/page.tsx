"use client";
import { useState } from "react";
import UploadScreen from "@/components/UploadScreen";
import ReviewScreen from "@/components/ReviewScreen";
import GenerateScreen from "@/components/GenerateScreen";

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

  return (
    <main className="min-h-screen bg-gray-50 font-sans">
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