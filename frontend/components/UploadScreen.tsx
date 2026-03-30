"use client";
import { useCallback, useState } from "react";
import * as XLSX from "xlsx";
import { Shot } from "@/app/page";

interface Props {
  onShotsLoaded: (shots: Shot[]) => void;
}

// Flexible column finder — matches any variation of column name
const col = (row: any, ...keys: string[]) => {
  for (const k of keys) {
    const found = Object.keys(row).find(
      rk => rk.trim().toLowerCase() === k.toLowerCase()
    );
    if (found && row[found] !== undefined && row[found] !== "") {
      return String(row[found]);
    }
  }
  return "";
};

export default function UploadScreen({ onShotsLoaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (rows.length === 0) {
          setError("Excel file is empty or has no data rows.");
          return;
        }

        const shots: Shot[] = rows.map((row, i) => ({
          id: String(i + 1),
          shotNumber: col(row, "Shot Number", "shot_number", "Shot No", "ShotNumber", "shot no") || String(i + 1),
          narration: col(row, "Narration", "narration", "Narration Text"),
          textOnScreen: col(row, "Text on Screen", "text_on_screen", "Text On Screen", "TextOnScreen", "text on screen"),
          visualDescription: col(row, "Visual Description", "visual_description", "Visual", "visual description"),
          shotDescription: col(row, "Shot Description", "shot_description", "Shot Desc", "shot description"),
          assetType: col(row, "Asset Type", "asset_type", "AssetType", "asset type", "Type"),
          prompt: col(row, "Prompt", "prompt", "Video Prompt", "video_prompt", "video prompt", "Hailuo Prompt", "hailuo_prompt"),
          imageFile: null,
          imagePreview: null,
          status: "pending",
        }));

        onShotsLoaded(shots);
      } catch (err) {
        setError("Could not read Excel file. Make sure it's a valid .xlsx file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseExcel(file);
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseExcel(file);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const file = e.clipboardData.files[0];
    if (file) parseExcel(file);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" onPaste={handlePaste}>
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 bg-black text-white px-4 py-1.5 rounded-full text-xs font-medium mb-4">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
          Video Automation
        </div>
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">Upload your storyboard</h1>
        <p className="text-gray-500 text-sm">Upload your Excel sheet to start reviewing and generating videos</p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`w-full max-w-xl border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
          ${dragging ? "border-black bg-gray-100" : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"}`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input id="file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Drop your Excel file here</p>
        <p className="text-xs text-gray-400 mb-4">or click to browse</p>
        <div className="inline-flex items-center gap-2 bg-black text-white text-xs px-4 py-2 rounded-lg">
          Browse file
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}
      <p className="mt-6 text-xs text-gray-400">Supports .xlsx and .xls · All data stays on your device</p>
    </div>
  );
}