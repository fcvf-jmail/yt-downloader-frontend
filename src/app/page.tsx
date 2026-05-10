/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect } from "react";
import { Search, Download, Loader2, CheckCircle2, Video, PlayCircle, Music } from "lucide-react";
import { toast, Toaster } from "react-hot-toast";

interface VideoFormat {
  format_id: string;
  resolution?: string;
  ext: string;
  has_audio: boolean;
  filesize_bytes?: number;
  audio_bitrate?: number;
  height?: number | null;
}

interface VideoInfo {
  title: string;
  thumbnail_url: string;
  duration: string;
  formats: VideoFormat[];
}

type AppState = "initial" | "loadingInfo" | "videoDetails" | "downloading" | "success";

function isCompatibleCombination(vExt: string, aExt: string) {
  if (vExt === "webm") return aExt === "webm";
  if (vExt === "mp4") return ["m4a", "mp4"].includes(aExt);
  return true;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes === 0) return "~ Неизвестно";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatDuration(secStr: string) {
  const sec = parseInt(secStr, 10);
  if (isNaN(sec)) return secStr;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const DIRECT_VPS_URL = process.env.NEXT_PUBLIC_API_URL || "http://151.244.72.124:8080";

export default function Home() {
  const [state, setState] = useState<AppState>("initial");
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  const [selectedVideoFormatId, setSelectedVideoFormatId] = useState("");
  const [selectedAudioFormatId, setSelectedAudioFormatId] = useState("");

  const [taskId, setTaskId] = useState("");
  const [progress, setProgress] = useState(0);

  const changeState = (newState: AppState, action: "push" | "replace" | "none" = "push") => {
    if (typeof window !== "undefined") {
      const currentState = window.history.state || {};
      if (action === "push") {
        window.history.pushState({ ...currentState, step: newState }, "");
      } else if (action === "replace") {
        window.history.replaceState({ ...currentState, step: newState }, "");
      }
    }
    setState(newState);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const currentState = window.history.state;
      if (currentState && currentState.step) {
        setState(currentState.step as AppState);
      } else {
        window.history.replaceState({ ...currentState, step: state }, "");
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.step) {
        setState(e.state.step as AppState);
      } else {
        setState("initial");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ((state === "videoDetails" || state === "downloading" || state === "success") && !videoInfo) {
      changeState("initial", "replace");
    }
  }, [state, videoInfo]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state === "downloading" && taskId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/status/${taskId}`, {
            headers: { "ngrok-skip-browser-warning": "true" }
          });
          if (!res.ok) {
            throw new Error("Failed to fetch status");
          }
          const data = await res.json();
          if (data.status === "completed") {
            clearInterval(interval);
            setProgress(100);
            changeState("success", "replace");
          } else if (data.status === "failed") {
            clearInterval(interval);
            toast.error("Ошибка скачивания.");
            changeState("initial", "replace");
          } else if (data.status === "active" || data.status === "pending") {
            setProgress(parseFloat(data.progress || "0"));
          }
        } catch (error) {
          console.error("Polling error:", error);
          toast.error("Сетевая ошибка при проверке статуса. Проверьте соединение и CORS.");
          clearInterval(interval);
          changeState("initial", "replace");
        }
      }, 1000);
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, taskId]);

  const getDownloadUrl = () => {
    if (!videoInfo) return "#";

    let videoId = "";
    // Идеальная регулярка для любых ссылок YouTube (включая Shorts)
    const ytRegex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/;
    const match = url.match(ytRegex);

    if (match && match[1]) {
      videoId = match[1];
    } else {
      // Надежный фоллбэк, если регулярка почему-то не справилась
      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        videoId = urlObj.searchParams.get("v") || urlObj.pathname.split("/").pop() || "unknown_id";
      } catch {
        videoId = "unknown_id";
      }
    }

    let height = "1080";
    let ext = "mp4";

    if (selectedVideoFormatId) {
      const selectedVideoFormat = videoInfo.formats.find(f => f.format_id === selectedVideoFormatId);
      height = selectedVideoFormat?.height ? String(selectedVideoFormat.height) : (selectedVideoFormat?.resolution ? selectedVideoFormat.resolution.split("x")[1] : "1080");
      ext = selectedVideoFormat?.ext || "mp4";
    } else if (selectedAudioFormatId) {
      const selectedAudioFormat = videoInfo.formats.find(f => f.format_id === selectedAudioFormatId);
      height = "NA";
      ext = selectedAudioFormat?.ext || "mp3";
    }

    return `${DIRECT_VPS_URL}/api/file?id=${videoId}&height=${height}&ext=${ext}&title=${encodeURIComponent(videoInfo.title)}`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    changeState("loadingInfo", "none");
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      if (!res.ok) throw new Error("Failed to fetch info");

      const data: VideoInfo = await res.json();
      setVideoInfo(data);

      const vFormats = data.formats.filter(f => {
        if (!f.resolution) return false;
        if (f.resolution === '0x0') return false;
        if (f.ext === 'mhtml') return false;
        if (f.height === 0 || f.height === null) return false;
        return true;
      }).reduce((acc: VideoFormat[], current) => {
        const x = acc.find(item => item.resolution === current.resolution && item.ext === current.ext);
        if (!x) return acc.concat([current]);
        return acc;
      }, []);

      const aFormats = data.formats.filter(f => f.has_audio && !!f.audio_bitrate);

      if (vFormats.length > 0) {
        const defaultVideo = vFormats[0];
        setSelectedVideoFormatId(defaultVideo.format_id);
        const compatibleAudio = aFormats.find(a => isCompatibleCombination(defaultVideo.ext, a.ext));
        if (compatibleAudio) setSelectedAudioFormatId(compatibleAudio.format_id);
      } else if (aFormats.length > 0) {
        setSelectedAudioFormatId(aFormats[0].format_id);
      }

      changeState("videoDetails", "push");
    } catch (error) {
      console.error(error);
      toast.error("Не удалось получить информацию о видео. Проверьте ссылку и CORS.");
      changeState("initial", "none");
    }
  };

  const handleDownloadStart = async () => {
    if (!selectedVideoFormatId && !selectedAudioFormatId) {
      toast.error("Выберите формат для скачивания");
      return;
    }

    changeState("downloading", "push");
    setProgress(0);
    try {
      const res = await fetch(`/api/download`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          url,
          video_format_id: selectedVideoFormatId || undefined,
          audio_format_id: selectedAudioFormatId || undefined,
        })
      });
      if (!res.ok) throw new Error("Failed to start download");
      const data = await res.json();
      setTaskId(data.task_id);
    } catch (error) {
      console.error(error);
      toast.error("Ошибка при запуске скачивания. Проверьте соединение и CORS.");
      changeState("videoDetails", "replace");
    }
  };

  const videoFormats = videoInfo?.formats.filter(f => {
    if (!f.resolution) return false;
    if (f.resolution === '0x0') return false;
    if (f.ext === 'mhtml') return false;
    if (f.height === 0 || f.height === null) return false;
    return true;
  }).reduce((acc: VideoFormat[], current) => {
    const x = acc.find(item => item.resolution === current.resolution && item.ext === current.ext);
    if (!x) return acc.concat([current]);
    return acc;
  }, []) || [];

  const audioFormats = videoInfo?.formats.filter(f => f.has_audio && !!f.audio_bitrate) || [];

  const isDownloadDisabled = !selectedVideoFormatId && !selectedAudioFormatId;

  return (
    <main className="min-h-screen bg-[#000000] text-[#FFFFFF] font-sans flex items-center justify-center p-4">
      <Toaster position="top-right" toastOptions={{ style: { background: "#111111", color: "#FFFFFF" } }} />
      <div className="w-full max-w-4xl bg-black rounded-2xl p-6 sm:p-8 shadow-2xl border border-gray-800 transition-all duration-300">
        <div className="flex items-center justify-center mb-8 gap-3">
          <Video className="w-10 h-10 text-white" />
          <h1 className="text-3xl font-bold tracking-tight text-white">YT Downloader</h1>
        </div>

        {(state === "initial" || state === "loadingInfo") && (
          <form onSubmit={handleSearch} className="space-y-4 animate-in fade-in zoom-in max-w-2xl mx-auto">
            <div>
              <label htmlFor="url" className="sr-only">URL видео</label>
              <div className="relative">
                <input
                  id="url"
                  type="text"
                  placeholder="Вставьте ссылку на YouTube..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={state === "loadingInfo"}
                  autoComplete="off"
                  className="w-full bg-[#111111] border border-gray-700 rounded-xl px-4 py-4 pl-12 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-all disabled:opacity-50"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              </div>
            </div>
            <button
              type="submit"
              disabled={state === "loadingInfo" || !url.trim()}
              className="w-full bg-white hover:bg-gray-200 text-black font-bold rounded-xl py-4 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state === "loadingInfo" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Анализ видео...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Найти
                </>
              )}
            </button>
          </form>
        )}

        {state === "videoDetails" && videoInfo && (
          <div className="space-y-8 animate-in fade-in zoom-in">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-[#111111] rounded-xl border border-gray-800">
              <div className="relative w-full sm:w-48 aspect-video rounded-lg overflow-hidden shrink-0 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={videoInfo.thumbnail_url} alt={videoInfo.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold line-clamp-2 leading-tight" title={videoInfo.title}>{videoInfo.title}</h2>
                <p className="text-sm text-gray-400 mt-3 flex items-center gap-1.5 bg-black w-max px-2 py-1 rounded-md">
                  <PlayCircle className="w-4 h-4" />
                  {formatDuration(videoInfo.duration)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">1. Выберите качество видео</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedVideoFormatId("")}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${selectedVideoFormatId === ""
                    ? "border-white shadow-[0_0_15px_rgba(255,255,255,0.2)] bg-white/10"
                    : "border-gray-800 hover:border-gray-500 bg-[#111111]"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Music className="w-5 h-5 text-white" />
                    <span className="font-bold text-white">Без видео</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Только аудио
                  </div>
                </button>
                {videoFormats.map(f => (
                  <button
                    key={f.format_id}
                    type="button"
                    onClick={() => {
                      setSelectedVideoFormatId(f.format_id);
                      if (selectedAudioFormatId) {
                        const selAudio = audioFormats.find(a => a.format_id === selectedAudioFormatId);
                        if (selAudio && !isCompatibleCombination(f.ext, selAudio.ext)) {
                          setSelectedAudioFormatId("");
                        }
                      }
                    }}
                    className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${selectedVideoFormatId === f.format_id
                      ? "border-white shadow-[0_0_15px_rgba(255,255,255,0.2)] bg-white/10"
                      : "border-gray-800 hover:border-gray-500 bg-[#111111]"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Video className="w-5 h-5 text-white" />
                      <span className="font-bold text-white">
                        {f.height ? `${f.height}p` : f.resolution}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {f.ext} • {formatBytes(f.filesize_bytes)}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">2. Выберите качество звука</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedAudioFormatId("")}
                  className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${selectedAudioFormatId === ""
                    ? "border-white shadow-[0_0_15px_rgba(255,255,255,0.2)] bg-white/10"
                    : "border-gray-800 hover:border-gray-500 bg-[#111111]"
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Video className="w-5 h-5 text-white" />
                    <span className="font-bold text-white">Без аудио</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Если встроено
                  </div>
                </button>
                {audioFormats.map(f => {
                  let isCompatible = true;
                  if (selectedVideoFormatId) {
                    const selVideo = videoFormats.find(v => v.format_id === selectedVideoFormatId);
                    if (selVideo && !isCompatibleCombination(selVideo.ext, f.ext)) {
                      isCompatible = false;
                    }
                  }

                  return (
                    <button
                      key={f.format_id}
                      type="button"
                      disabled={!isCompatible}
                      onClick={() => {
                        setSelectedAudioFormatId(f.format_id);
                        if (selectedVideoFormatId) {
                          const selVideo = videoFormats.find(v => v.format_id === selectedVideoFormatId);
                          if (selVideo && !isCompatibleCombination(selVideo.ext, f.ext)) {
                            setSelectedVideoFormatId("");
                          }
                        }
                      }}
                      className={`p-4 rounded-xl border text-left flex flex-col gap-2 transition-all ${selectedAudioFormatId === f.format_id
                        ? "border-white shadow-[0_0_15px_rgba(255,255,255,0.2)] bg-white/10"
                        : "border-gray-800 hover:border-gray-500 bg-[#111111]"
                        } ${!isCompatible ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <Music className="w-5 h-5 text-white" />
                        <span className="font-bold text-white">
                          {f.audio_bitrate ? `${Math.round(f.audio_bitrate)} kbps` : f.ext}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {f.ext} • {formatBytes(f.filesize_bytes)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t border-gray-800">
              <button
                onClick={() => changeState("initial", "push")}
                className="px-6 py-4 rounded-xl bg-[#111111] border border-gray-700 hover:bg-gray-800 text-white transition-all font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleDownloadStart}
                disabled={isDownloadDisabled}
                className="flex-1 bg-white hover:bg-gray-200 text-black font-bold rounded-xl py-4 flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:shadow-[0_0_25px_rgba(255,255,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Download className="w-5 h-5" />
                Скачать
              </button>
            </div>
          </div>
        )}

        {(state === "downloading" || state === "success") && (
          <div className="space-y-8 text-center animate-in fade-in zoom-in py-8">
            <div className="flex justify-center">
              {state === "downloading" ? (
                <div className="w-20 h-20 rounded-full bg-[#111111] border border-white/30 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.15)]">
                  <Download className="w-10 h-10 text-white animate-bounce" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-white/10 border border-white flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)]">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold tracking-tight">
                {state === "downloading" ? `Подготовка видео... ${progress}%` : "Готово!"}
              </h2>
              {state === "downloading" && (
                <p className="text-gray-400 text-sm">Файл скачивается на сервер, пожалуйста, подождите</p>
              )}
            </div>

            <div className="w-full max-w-md mx-auto bg-[#111111] rounded-full h-3 overflow-hidden border border-gray-800">
              <div
                className="bg-white h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)] relative"
                style={{ width: `${progress}%` }}
              >
                {state === "downloading" && (
                  <div className="absolute inset-0 bg-white/40 w-full animate-[shimmer_2s_infinite]" style={{ transform: 'translateX(-100%)' }}></div>
                )}
              </div>
            </div>

            {state === "success" && (
              <div className="flex flex-col gap-3 mt-6">
                <a
                  href={getDownloadUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-w-md mx-auto w-full bg-white hover:bg-gray-200 text-black font-bold rounded-xl py-4 flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                >
                  <Download className="w-5 h-5" />
                  Сохранить на устройство
                </a>

                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  *Если браузер напишет "Небезопасное скачивание", нажмите "Сохранить" (это связано с HTTP-протоколом сервера).
                </p>

                <button
                  onClick={() => {
                    changeState("initial", "push");
                    setUrl("");
                    setVideoInfo(null);
                    setProgress(0);
                  }}
                  className="max-w-md mx-auto w-full bg-[#111111] hover:bg-gray-800 text-white border border-gray-700 font-semibold rounded-xl py-4 flex items-center justify-center gap-2 transition-all mt-2"
                >
                  Скачать другое видео
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </main>
  );
}