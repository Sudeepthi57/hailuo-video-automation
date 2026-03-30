"use client";
import { useState } from "react";

const API_BASE = "http://localhost:8001";

interface Props {
  onLoggedIn: () => void;
}

type State = "idle" | "opening" | "waiting" | "verifying" | "error";

export default function LoginScreen({ onLoggedIn }: Props) {
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const openChrome = async () => {
    setState("opening");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/auth/login/start`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setState("waiting");
      } else {
        setErrorMsg(data.message || "Failed to open Chrome.");
        setState("error");
      }
    } catch {
      setErrorMsg("Could not connect to the backend. Make sure it is running.");
      setState("error");
    }
  };

  const verifyLogin = async () => {
    setState("verifying");
    try {
      const res = await fetch(`${API_BASE}/auth/login/verify`, { method: "POST" });
      const data = await res.json();
      if (data.logged_in) {
        onLoggedIn();
      } else {
        setErrorMsg("Not logged in yet. Please log in and try again.");
        setState("waiting");
      }
    } catch {
      setErrorMsg("Could not connect to the backend.");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-md w-full text-center shadow-sm">
        <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14m0-4v4m0-4l-6 2.5V7.5L15 10z" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-1">Hailuo Video Automation</h1>
        <p className="text-sm text-gray-500 mb-6">You need to log in to Hailuo before generating videos.</p>

        <button
          onClick={() => fetch(`${API_BASE}/hailuo/open`, { method: "POST" })}
          className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open Hailuo
        </button>

        {/* Step 1 — Open Chrome */}
        {(state === "idle" || state === "error") && (
          <div className="space-y-3">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                {errorMsg}
              </div>
            )}
            <button
              onClick={openChrome}
              className="w-full bg-black text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Open Hailuo &amp; Log In
            </button>
          </div>
        )}

        {/* Opening */}
        {state === "opening" && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Opening Chrome...
          </div>
        )}

        {/* Step 2 — Wait for user to login, then confirm */}
        {state === "waiting" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
              <p className="text-sm font-medium text-blue-700 mb-1">Chrome is open</p>
              <p className="text-xs text-blue-500">
                Log in to your Hailuo account in the Chrome window, then click the button below.
              </p>
            </div>
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                {errorMsg}
              </div>
            )}
            <button
              onClick={verifyLogin}
              className="w-full bg-black text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              I&apos;ve Logged In ✓
            </button>
          </div>
        )}

        {/* Verifying */}
        {state === "verifying" && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Verifying login...
          </div>
        )}
      </div>
    </div>
  );
}
