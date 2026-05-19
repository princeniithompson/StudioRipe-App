/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, signInWithGoogle, db, handleFirestoreError, OperationType } from "./firebase";
import {
  getProjects,
  saveProject,
  deleteProject,
  deleteProjectEverywhere,
  DBProject,
  DBAsset,
} from "./db";
import { get, set } from "idb-keyval";
import { FloatingAgent } from "./components/FloatingAgent";
import {
  Plus,
  Play,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  Film,
  AlertCircle,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
  Send,
  Loader2,
  MessageSquare,
  ArrowRight,
  Edit2,
  Home,
  Layout,
  Lock,
  Magnet,
  Settings,
  Sliders,
  Unlock,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Smile,
  Ghost,
  HardDrive,
  Trash,
  Cloud,
  Folder,
  Clock,
  CheckCircle,
} from "lucide-react";

// --- Types ---

export type AgentType = "blue" | "emoji" | "transparent";

interface AgentSettings {
  type: AgentType;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  sleepMode: boolean;
}

type AssetType = "image" | "video";

interface Asset {
  id: string;
  type: AssetType;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sequence: number;
  name: string;
  file?: File | Blob;
  fileData?: string;
  rotation?: number;
}

interface ViewTransform {
  x: number;
  y: number;
  zoom: number;
}

interface AgentMessage {
  role: "user" | "model";
  text: string;
  assets?: Asset[];
  isPending?: boolean;
}

// --- Components ---

// --- Global Cache for Blob URLs to ensure zero-latency navigation ---
const BLOB_URL_CACHE = new Map<string, string>();

/**
 * SmartVideo pauses playback when not in viewport or when the tab is hidden to save battery.
 */
const SmartVideo = React.forwardRef<HTMLVideoElement, React.VideoHTMLAttributes<HTMLVideoElement>>((props, externalRef) => {
  const localRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Sync ref
  useEffect(() => {
    if (typeof externalRef === 'function') {
      externalRef(localRef.current);
    } else if (externalRef) {
      externalRef.current = localRef.current;
    }
  }, [externalRef]);
  
  // Tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => setIsTabVisible(document.visibilityState === 'visible');
    setIsTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Intersection observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => setIsVisible(entry.isIntersecting));
    }, { threshold: 0.1 });
    
    if (localRef.current) {
      observer.observe(localRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Play/Pause logic
  useEffect(() => {
    const video = localRef.current;
    if (!video) return;
    
    if (props.autoPlay) {
      if (isVisible && isTabVisible) {
        if (video.paused) video.play().catch(() => {});
      } else {
        if (!video.paused) video.pause();
      }
    } else {
       if (!isTabVisible && !video.paused) {
         video.pause();
       }
    }
  }, [isVisible, isTabVisible, props.autoPlay]);

  return <video {...props} ref={localRef} />;
});
SmartVideo.displayName = 'SmartVideo';

function getCachedUrl(
  id: string,
  file?: File | Blob | null,
  fileData?: string,
): string | null {
  if (fileData) return fileData;
  if (BLOB_URL_CACHE.has(id)) return BLOB_URL_CACHE.get(id)!;
  if (file) {
    try {
      const url = URL.createObjectURL(file);
      BLOB_URL_CACHE.set(id, url);
      return url;
    } catch (e) {
      console.warn("Failed to create object url in cache", e);
      return null;
    }
  }
  return null;
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
  onRename,
  activeAccent = "#00FF87",
}: {
  project: DBProject;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
  activeAccent?: string;
}) {
  const firstAsset = project.assets.length > 0 ? project.assets[0] : null;
  // Use persistent blob URL from cache if available to prevent flickering
  const [coverUrl, setCoverUrl] = useState<string | null>(() => {
    if (firstAsset) {
      return getCachedUrl(
        `cover_${project.id}_${firstAsset.id}`,
        firstAsset.file,
        firstAsset.fileData,
      );
    }
    return null;
  });

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (firstAsset && !coverUrl) {
      const url = getCachedUrl(
        `cover_${project.id}_${firstAsset.id}`,
        firstAsset.file,
        firstAsset.fileData,
      );
      setCoverUrl(url);
    }
  }, [firstAsset, project.id, coverUrl]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirmingDelete(!isConfirmingDelete);
  };

  return (
    <div
      className="flex flex-col group/card bg-[#111111] rounded-none cursor-pointer relative shadow-[0_4px_20px_rgba(0,0,0,0.5)] active:scale-[0.98] transition-all duration-300 border border-white/5"
      onClick={onOpen}
    >
      <div className="w-full aspect-[4/3] sm:aspect-[16/10] object-cover bg-black/40 relative overflow-hidden">
        {coverUrl ? (
          firstAsset?.type === "video" ? (
            <SmartVideo
              ref={(el) => {
                if (el) {
                  el.defaultMuted = true;
                  el.muted = true;
                }
              }}
              src={coverUrl || undefined}
              className="w-full h-full object-cover object-top sm:object-center group-hover/card:scale-105 transition-transform duration-1000 ease-out"
              muted
              autoPlay
              loop
              playsInline
            />
          ) : (
            <img
              src={coverUrl || undefined}
              alt={project.title}
              className="w-full h-full object-cover object-top sm:object-center group-hover/card:scale-105 transition-transform duration-1000 ease-out"
            />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-700 bg-[#1A1A1A]">
            <ImageIcon className="w-6 h-6 mb-1 opacity-20" />
            <span className="text-[10px] font-medium uppercase tracking-widest opacity-30">
              Blank
            </span>
          </div>
        )}
        <div className="absolute inset-0 pointer-events-none" />
      </div>

      <div className="flex items-center justify-between p-4 px-5 bg-[#111111]">
        <div className="flex flex-col min-w-0 flex-1 mr-4">
          <span className="text-sm font-medium tracking-wide text-white truncate">
            {project.title}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: activeAccent, opacity: 0.8 }}>
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(project.updatedAt))}
            </span>
            <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-[0.1em] border ${project.storageType === 'cloud' ? 'bg-[#CCFF00]/10 text-[#CCFF00] border-[#CCFF00]/20' : 'bg-white/5 text-zinc-500 border-white/10'}`}>
              {project.storageType || 'local'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className="w-8 h-8 rounded-full border border-white/10 text-slate-400 hover:text-white bg-transparent hover:bg-white/5 transition-all flex items-center justify-center"
            title="Rename"
          >
            <Edit2 className="w-[14px] h-[14px]" />
          </button>
          <button
            onClick={handleDeleteClick}
            className={`w-8 h-8 rounded-full border transition-all flex items-center justify-center
              ${
                isConfirmingDelete
                  ? "bg-red-500/20 text-red-500 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                  : "border-white/10 text-slate-400 hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20"
              }
            `}
            title="Delete Project"
          >
            <Trash2 className="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isConfirmingDelete && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-0 bg-[#111111] border border-[#222222] flex flex-col justify-end z-20 text-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1" />
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 items-center text-center px-2">
                <p className="font-sans font-bold text-sm tracking-widest text-white uppercase">
                  Permanent Deletion?
                </p>
                <p className="text-[#666666] text-[10px] leading-relaxed">
                  This action will wipe the session footprint from local terminal buffers.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full mt-2">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimeout(() => {
                      onDelete();
                      setIsConfirmingDelete(false);
                    }, 300);
                  }}
                  className="w-full py-3 bg-[#BE123C] shadow-[0_0_15px_rgba(190,18,60,0.3)] text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors hover:bg-[#A30000]"
                >
                  DELETE
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimeout(() => {
                      setIsConfirmingDelete(false);
                    }, 300);
                  }}
                  className="w-full py-3 bg-transparent text-[#666666] active:text-white hover:text-white font-bold uppercase tracking-widest text-xs transition-colors"
                >
                  CANCEL
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Components ---

const TemplateVideo = ({
  src,
  className,
  isActive,
  absOffset,
}: {
  src: string;
  className?: string;
  isActive?: boolean;
  absOffset?: number;
}) => {
  const isMobile =
    typeof navigator !== "undefined" &&
    /Mobi|Android/i.test(navigator.userAgent);

  // Enhanced visibility for mobile: allow 3 templates to be in DOM (center + 1 neighbor each side)
  // This ensures no black screens during carousel swipes
  const isVisible =
    absOffset === undefined ||
    (isMobile ? Math.abs(absOffset) < 1.6 : Math.abs(absOffset) < 2.5);

  const [isLoaded, setIsLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(false);
  const [key, setKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check if it's an external video provider that needs an embed
  const isStreamable = src.includes("streamable.com");
  const embedUrl = isStreamable
    ? src.replace("streamable.com/", "streamable.com/e/")
    : null;

  // Sync playback state for native video
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const handleVisibility = () => setTabVisible(document.visibilityState === "visible");
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useLayoutEffect(() => {
    if (isStreamable) return;
    const v = videoRef.current;
    if (!v || !isVisible) return;

    if (isActive && tabVisible) {
      v.muted = true;
      v.playsInline = true;
      // Use play() directly with no checks to maximize speed
      v.play().catch(() => {});
    } else {
      // Don't pause neighbors as aggressively to avoid black flickers unless tab is hidden
      if (!tabVisible || Math.abs(absOffset || 0) > 1.8) {
        v.pause();
      }
    }
  }, [isActive, isVisible, key, isStreamable, absOffset, tabVisible]);

  // Loading indicator with timeout safety
  useEffect(() => {
    // Spinner is removed based on user request to avoid visual breaks
    setShowSpinner(false);
  }, [isVisible, isLoaded, error]);

  // Cleanup to prevent memory leaks on Android
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (v) {
        try {
          v.pause();
          v.src = "";
          v.load();
        } catch (e) {}
      }
    };
  }, []);

  if (!isVisible) {
    return (
      <div
        className={`relative w-full h-full bg-[#050505] flex items-center justify-center ${className}`}
      >
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
          <Film className="w-6 h-6 text-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full bg-[#030303] overflow-hidden rounded-[inherit] ${className}`}
      style={{ transform: "translate3d(0,0,0)" }}
    >
      <div className="absolute -inset-[1px] transform-gpu">
        {isStreamable ? (
          <div className="absolute inset-0 scale-[1.3] pointer-events-none select-none flex items-center justify-center">
            <iframe
              src={`${embedUrl}?autoplay=1&muted=1&loop=1&controls=0&transparent=1&background=1&mute=1&interactive=0`}
              className={`w-full h-full border-none transition-opacity duration-1000 ${isLoaded ? "opacity-100" : "opacity-0"}`}
              allow="autoplay; fullscreen"
              onLoad={() => {
                setIsLoaded(true);
                setShowSpinner(false);
              }}
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            key={key}
            src={src || undefined}
            muted
            loop
            playsInline
            autoPlay={isActive}
            controls={false}
            preload="auto"
            onLoadedData={() => {
              setIsLoaded(true);
              setShowSpinner(false);
              setError(false);
            }}
            onWaiting={() => {}}
            onPlaying={() => {}}
            onError={(e) => {
              const err = (e.target as HTMLVideoElement).error;
              if (err?.code === 1) return; // Aborted is normal
              setError(true);
            }}
            className={`w-full h-full object-cover scale-[1.08] transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
      </div>

      {/* Edge Sealer: Subtle inset shadow to bridge any sub-pixel gaps at rounds */}
      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)] pointer-events-none z-[5]" />

      {/* Loading Overlay - Removed based on user feedback */}

      {/* Error Overlay - ONLY show if there is an actual video error */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 px-8 text-center backdrop-blur-lg">
          <AlertCircle className="w-8 h-8 text-emerald-500/30 mb-4" />
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/50 font-black mb-8">
            Signal Connection Issues
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setError(false);
              setIsLoaded(false);
              setShowSpinner(true);
              setKey((k) => k + 1); // Full remount
            }}
            className="px-10 py-3 rounded-full liquid-glass-emerald text-[9px] font-black uppercase tracking-[0.3em] text-white hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-500/10 cursor-pointer pointer-events-auto"
          >
            Force Refresh
          </button>

          <p className="text-[8px] text-white/20 mt-8 font-medium italic underline decoration-white/10 underline-offset-4">
            Try clicking the button to manually reset the video decoder.
          </p>
        </div>
      )}
    </div>
  );
};

// --- TEMPLATE CONFIGURATION ---
// To use your own videos:
// 1. Upload your video to a public hosting service (or provide the file to the AI).
// 2. Replace the 'src' URL below with your actual video link.
const TEMPLATES: {
  id: string;
  type: "video" | "image" | "blank";
  title?: string;
  label?: string;
  src?: string;
}[] = [
  {
    id: "motion-graphics",
    type: "video",
    title: "Motion Graphics",
    label: "AI GENERATED",
    src: "https://streamable.com/pcyh7p",
  },
  {
    id: "b1",
    type: "video",
    title: "Daily Object",
    label: "- Daily Object Story",
    src: "https://streamable.com/exmuah",
  },
  {
    id: "fruit",
    type: "video",
    title: "AI Fruit Drama",
    label: "RIPE - AI Fruit Story",
    src: "https://streamable.com/rdf713",
  },
  {
    id: "b2",
    type: "image",
    title: "Space Legend",
    label: "RIPE - AI Fruit Story",
    src: "https://images.unsplash.com/photo-1628126235206-5260b9ea6441?q=80&w=400&auto=format&fit=crop",
  },
];

interface AuthContextType {
  user: User | null;
  activeAccent: string;
  setActiveAccent: (c: string) => void;
  fontScale: number;
  setFontScale: React.Dispatch<React.SetStateAction<number>>;
  agentSettings: AgentSettings;
  setAgentSettings: React.Dispatch<React.SetStateAction<AgentSettings>>;
}
export const AuthContext = React.createContext<AuthContextType>({
  user: null,
  activeAccent: "#00FF87",
  setActiveAccent: () => {},
  fontScale: 1.0,
  setFontScale: () => {},
  agentSettings: { type: "emoji", soundEnabled: true, hapticsEnabled: true, sleepMode: false },
  setAgentSettings: () => {},
});

function UserAvatarButton({ onClick, className = "" }: { onClick: () => void, className?: string }) {
  const { user } = React.useContext(AuthContext);

  const handleClick = (e: React.PointerEvent) => {
    e.stopPropagation();
    setTimeout(() => {
      onClick();
    }, 300);
  };

  if (!user) return null;

  const photoUrl = user.photoURL;
  const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();

  return (
    <button
      onPointerDown={handleClick}
      className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center active:scale-95 transition-transform ${photoUrl ? "" : "bg-[#111111] border border-[#222222]"} ${className}`}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-bold uppercase">{initial}</span>
      )}
    </button>
  );
}

function DeploymentSequenceOverlay({ 
  isOpen, 
  onClose,
  currentProject,
  assets,
  uploadedAssetIds,
  onUploadSuccess,
  setAssetUploadStatuses
}: { 
  isOpen: boolean; 
  onClose: () => void;
  currentProject: DBProject | null;
  assets: DBAsset[];
  uploadedAssetIds: string[];
  onUploadSuccess: () => void;
  setAssetUploadStatuses: React.Dispatch<React.SetStateAction<Record<string, { status: 'idle' | 'uploading' | 'success' | 'error', message: string }>>>;
}) {
  const [step, setStep] = useState<'loading'|'capacity'|'transit'|'uploading'|'complete'|'manage'>('loading');
  const [cloudProjects, setCloudProjects] = useState<DBProject[]>([]);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCloud = async () => {
    try {
      const { getCloudProjects } = await import("./db");
      const cps = await getCloudProjects();
      setCloudProjects(cps);
    } catch(err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setStep('loading');
      setErrorMessage(null);
      fetchCloud().then(() => setStep('capacity'));
    } else {
      setProgress(0);
    }
  }, [isOpen]);

  const handleDeleteRemote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { deleteProjectEverywhere } = await import("./db");
      await deleteProjectEverywhere(id);
      await fetchCloud();
      onUploadSuccess();
    } catch(err) {
      console.error(err);
    }
  };

  const handleExecute = async () => {
    setStep('uploading');
    setErrorMessage(null);
    setProgress(0);
    
    const pendingAssets = assets.filter(a => !uploadedAssetIds.includes(a.id));
    // totalItems = Assets + 1 (Metadata Project Document)
    const totalItems = pendingAssets.length + 1;
    setUploadStatus({ current: 0, total: totalItems });

    try {
      if (currentProject) {
        const { deployProjectToCloud, deployAssetToCloud } = await import("./db");
        
        // 1. PROJECT METADATA SYNC
        await deployProjectToCloud({ ...currentProject, assets });
        setUploadStatus(prev => ({ ...prev, current: 1 })); 
        // Initial progress for project doc (roughly equal weight for UX)
        const projectShare = (1 / totalItems) * 100;
        setProgress(projectShare);

        // 2. INDIVIDUAL ASSET TRANSMISSION
        let completedAssets = 0;
        for (const asset of pendingAssets) {
          try {
            if (!asset.fileData && asset.type === 'image') {
              completedAssets++;
              setUploadStatus(prev => ({ ...prev, current: completedAssets + 1 }));
              continue;
            }

            setAssetUploadStatuses(prev => ({ ...prev, [asset.id]: { status: 'uploading', message: 'Uploading...' } }));
            await deployAssetToCloud(currentProject.id, asset);
            setAssetUploadStatuses(prev => ({ ...prev, [asset.id]: { status: 'success', message: 'Uploaded ✅' } }));
            setTimeout(() => setAssetUploadStatuses(prev => ({ ...prev, [asset.id]: { status: 'idle', message: '' } })), 3000);
            
            completedAssets++;
            setUploadStatus(prev => ({ ...prev, current: completedAssets + 1 }));
            
            // Calculate progress based on total items
            const currentProgress = ((completedAssets + 1) / totalItems) * 100;
            setProgress(currentProgress);
            onUploadSuccess();
          } catch (err: any) {
            setAssetUploadStatuses(prev => ({ ...prev, [asset.id]: { status: 'error', message: 'Upload Failed ❌' } }));
            console.error("Asset upload failed:", err);
            throw err;
          }
        }
        
        // Final completion state
        setProgress(100);
        setTimeout(() => setStep('complete'), 300);
      }
    } catch (e: any) {
      console.error("Main deployment error:", e);
      let msg = e.message || "Failed to initialize deployment";
      if (msg.includes("Quota")) msg = "Firebase Quota Limit Hit. Progress capped.";
      if (msg.includes("timed out")) msg = "Connection timed out. Data may be too large for your current network.";
      setErrorMessage(msg);
    } finally {
      onUploadSuccess();
    }
  };

  useEffect(() => {
    if (step === 'complete') {
      const timer = setTimeout(() => {
        onClose();
      }, 4000); // 4 seconds of feedback before auto-close
      return () => clearTimeout(timer);
    }
  }, [step, onClose]);

  if (!isOpen) return null;

  const pendingCount = assets.filter(a => !uploadedAssetIds.includes(a.id)).length;
  
  const totalMB = 1024;
  const usedEstMB = cloudProjects.reduce((acc, cp) => acc + (cp.agentMessages ? cp.agentMessages.length * 0.1 : 0.2), 0);
  const remainingMB = Math.max(totalMB - usedEstMB, 0);
  const projectMassRaw = (pendingCount * 0.5); // Average 500kb per downscaled asset
  const projectMassMB = Number((projectMassRaw === 0 ? 0.1 : projectMassRaw).toFixed(1));
  const isCritical = Boolean(projectMassMB > remainingMB);
  const remainingDisplay = remainingMB.toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="bg-[#050505] border border-[#121212] p-8 rounded-2xl w-full max-w-sm mx-auto flex flex-col pointer-events-auto shadow-2xl relative"
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-[#00FF87] text-xs font-bold tracking-[0.2em] uppercase">Deploy to Companion Protocol</h2>
        </div>

        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="animate-spin text-white mb-4" size={24} />
            <span className="text-[#666666] text-[10px] uppercase font-bold tracking-widest">Scanning Cloud Constraints...</span>
          </div>
        )}

        {step === 'capacity' && !isCritical && (
          <div className="flex flex-col items-center w-full">
            <Cloud className="text-[#00FF87] mb-4" strokeWidth={1.5} size={48} />
            <span className="text-[#666666] text-[10px] uppercase font-bold tracking-widest mb-1">Storage Remaining:</span>
            <span className="text-white text-2xl font-bold tracking-wide mb-6">{remainingDisplay} MB <span className="text-[#666666] text-lg font-normal">/ 1 GB</span></span>
            
            <div className="w-full h-1 bg-[#1A1A1A] rounded-full mb-8 relative">
              <div className="absolute left-0 top-0 h-full bg-[#00FF87] rounded-full" style={{ width: `${Math.max(5, Math.min(100, (remainingMB / totalMB) * 100))}%` }} />
            </div>

            <div className="flex items-center justify-center gap-3 w-full mb-8 rounded-xl border border-[#222222] p-4 bg-[#111111]/30">
              <div className="flex items-center justify-center shrink-0">
                <Folder className="text-[#888888]" size={24} strokeWidth={1.5} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[#666666] text-[10px] uppercase font-bold tracking-widest leading-tight mb-1">Upload pending</span>
                <span className="text-white text-xs uppercase font-bold tracking-wide leading-tight">{pendingCount} assets — ~{projectMassMB} MB</span>
              </div>
            </div>

            <button
              onClick={() => setStep('transit')}
              className="w-full bg-white text-black rounded-xl py-3.5 font-bold uppercase tracking-[0.1em] text-[11px] hover:bg-gray-200 active:scale-95 transition-all outline-none"
            >
              Continue to Transit Check
            </button>
          </div>
        )}

        {step === 'capacity' && isCritical && (
          <div className="flex flex-col items-center w-full">
            <Cloud className="text-[#DC2626] mb-6" strokeWidth={1.5} size={56} />
            <div className="flex flex-col items-center text-center mb-8">
              <span className="text-white text-[10px] uppercase font-bold tracking-widest mb-2">Critical Status:</span>
              <span className="text-[#666666] text-[11px] uppercase font-bold tracking-wider leading-relaxed max-w-[240px]">
                <span className="text-[#DC2626]">{projectMassMB} MB</span> PROJECT MASS, BUT ONLY <span className="text-[#DC2626]">{remainingDisplay} MB</span> REMAINING
              </span>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => setStep('manage')}
                className="w-full bg-[#991B1B]/20 border border-[#DC2626]/50 text-[#DC2626] hover:bg-[#DC2626] hover:text-white rounded-xl py-3.5 font-bold uppercase tracking-[0.1em] text-[11px] active:scale-95 transition-all outline-none flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Manage Storage
              </button>
              <button
                onClick={onClose}
                className="w-full bg-[#1A1A1A] text-white hover:bg-[#222222] border border-[#333333] rounded-xl py-3.5 font-bold uppercase tracking-[0.1em] text-[11px] active:scale-95 transition-all outline-none"
              >
                Cancel Protocol
              </button>
            </div>
          </div>
        )}

        {step === 'manage' && (
          <div className="flex flex-col w-full">
            <h3 className="text-white text-xs uppercase tracking-widest font-bold mb-4">Manage Cloud Storage</h3>
            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto no-scrollbar mb-4 border border-[#222222] rounded-xl p-2 bg-[#0A0A0A]">
              {cloudProjects.length === 0 ? (
                 <span className="text-[#666666] text-[10px] p-2 text-center my-4 font-bold uppercase tracking-wider">No remote backups found.</span>
              ) : (
                 cloudProjects.map(cp => (
                   <div key={cp.id} className="flex items-center justify-between text-white text-xs bg-[#111111] p-2.5 rounded-lg border border-[#222222]">
                     <span className="truncate pr-4">{cp.title}</span>
                     <button 
                       onClick={(e) => handleDeleteRemote(cp.id, e)}
                       className="text-[#666666] hover:text-[#DC2626] transition-colors p-1"
                     >
                       <Trash2 size={14} />
                     </button>
                   </div>
                 ))
              )}
            </div>
            <button
              onClick={() => {
                 setStep('loading');
                 fetchCloud().then(() => setStep('capacity'));
              }}
              className="w-full bg-white text-black rounded-xl py-3.5 font-bold uppercase tracking-[0.1em] text-[11px] active:scale-95 transition-all outline-none mt-2"
            >
              Re-eval Capacity
            </button>
          </div>
        )}

        {step === 'transit' && (
          <div className="flex flex-col items-center w-full">
            <div className="flex items-center gap-5 w-full mb-10 mt-4 px-2">
              <div className="w-14 h-14 rounded-full border border-[#444444] flex items-center justify-center shrink-0">
                <Clock className="text-white" size={24} strokeWidth={1.5} />
              </div>
              <span className="text-white text-lg font-medium tracking-wide leading-tight">
                This upload requires approximately {Math.ceil(pendingCount * 5)}s across your current hardware link.
              </span>
            </div>

            <button
              onClick={handleExecute}
              className="w-full bg-white text-black rounded-xl py-3.5 font-bold uppercase tracking-[0.1em] text-[11px] hover:bg-gray-200 active:scale-95 transition-all outline-none"
            >
              Execute Transmission
            </button>
          </div>
        )}

        {(step === 'uploading' || step === 'complete') && (
          <div className="flex flex-col w-full">
            <div className="flex items-center gap-5 mb-8 w-full mt-2">
              <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                 <svg className="absolute inset-0 w-full h-full text-[#333333] -rotate-90 transform" viewBox="0 0 36 36">
                   <path className="stroke-current" fill="none" strokeWidth="2.5" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                 </svg>
                 <svg className="absolute inset-0 w-full h-full text-[#00FF87] -rotate-90 transform transition-all duration-300" viewBox="0 0 36 36">
                   <path className="stroke-current" fill="none" strokeWidth="2.5" strokeDasharray={`${progress}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                 </svg>
                 {progress === 100 && <Check className="text-[#00FF87]" size={20} strokeWidth={2.5} />}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-white text-xs uppercase font-bold tracking-wide leading-tight mb-1">
                  {errorMessage ? "Deployment Paused" : (step === 'uploading' ? 'Transmitting assets to cloud...' : 'Deployment complete.')}
                </span>
                {!errorMessage ? (
                  <span className="text-[#666666] text-[10px] font-mono whitespace-nowrap">
                    {uploadStatus.current} / {uploadStatus.total} | {Math.round(progress)}% {progress < 100 && <>(Est: {Math.ceil((uploadStatus.total - uploadStatus.current) * 5)}s)</>}
                  </span>
                ) : (
                  <span className="text-[#DC2626] text-[10px] font-bold tracking-widest uppercase mt-2">
                    {errorMessage}
                  </span>
                )}
              </div>
            </div>

            {(step === 'complete' || errorMessage) && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                <div className={`w-full ${errorMessage ? 'bg-[#991B1B]/20 border border-[#DC2626]/50' : 'bg-[#00FF87]/10 border border-[#00FF87]/30'} rounded-xl py-4 text-center px-4`}>
                  <span className={`${errorMessage ? 'text-[#DC2626]' : 'text-[#00FF87]'} text-[10px] leading-tight font-black uppercase tracking-wider block`}>
                    {errorMessage ? (
                      `UPLOAD INCOMPLETE.\n${uploadStatus.current} ASSETS PERSISTED SECURELY.`
                    ) : (
                      `Transmission Complete.\nWorkspace deployed to companion.`
                    )}
                  </span>
                </div>

                <button
                  onClick={onClose}
                  className={`w-full ${errorMessage ? 'bg-[#DC2626] text-white hover:bg-[#B91C1C]' : 'bg-[#00FF87] text-black hover:bg-[#00e67a]'} rounded-xl py-3.5 font-bold uppercase tracking-[0.1em] text-[11px] active:scale-95 transition-all outline-none`}
                >
                  {errorMessage ? 'Dismiss Error' : 'Finish & Return'}
                </button>
                
                {!errorMessage && (
                  <span className="text-[8px] text-[#666666] font-bold uppercase tracking-[0.2em] text-center mt-1">Auto-closing transmission gate...</span>
                )}
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function MainApp() {
  const { user, activeAccent, setActiveAccent, fontScale, setFontScale, agentSettings, setAgentSettings } = React.useContext(AuthContext);
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [currentProject, setCurrentProject] = useState<DBProject | null>(null);
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  
  const refreshUploadedAssets = React.useCallback(async () => {
    if (currentProject) {
      try {
        const { getUploadedAssetIds } = await import("./db");
        const ids = await getUploadedAssetIds(currentProject.id);
        setUploadedAssetIds(ids);
      } catch (err) {
        console.error(err);
      }
    } else {
      setUploadedAssetIds([]);
    }
  }, [currentProject]);

  useEffect(() => {
    refreshUploadedAssets();
  }, [refreshUploadedAssets]);

  const [activeTemplate, setActiveTemplate] = useState(2);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 400,
  );
  const [activatingAccent, setActivatingAccent] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cloudUsage, setCloudUsage] = useState(0);
  const [cloudProjectsList, setCloudProjectsList] = useState<DBProject[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<Record<string, number>>({});
  const [activatingRow, setActivatingRow] = useState<string | null>(null);
  const [settingsPage, setSettingsPage] = useState<
    "main" | "agent" | "appearance" | "haptics" | "advanced" | "api" | "profile" | "storage"
  >("main");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  const handleUpdateName = async () => {
    if (user && editNameValue.trim()) {
      try {
        const { updateProfile } = await import("firebase/auth");
        await updateProfile(user, { displayName: editNameValue.trim() });
      } catch (err) {
        console.error("Failed to update name", err);
      }
    }
    setIsEditingName(false);
  };

  const [localApiKey, setLocalApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("studioripe-gemini-key") || "";
    }
    return "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.style.setProperty(
        "--font-scale",
        fontScale.toString(),
      );
      localStorage.setItem("studioripe-font-scale", fontScale.toString());
    }
  }, [fontScale]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("studioripe-gemini-key", localApiKey);
    }
  }, [localApiKey]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    const handleScroll = () => {
      // If user is scrolling the page, pause the template carousel
      setTemplateInteractionTime(Date.now());
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetUploadStatuses, setAssetUploadStatuses] = 
    useState<Record<string, { status: 'idle' | 'uploading' | 'success' | 'error', message: string }>>({});
  const [past, setPast] = useState<Asset[][]>([]);
  const [future, setFuture] = useState<Asset[][]>([]);
  const [viewMode, setViewMode] = useState<"dashboard" | "board" | "playback">(
    "dashboard",
  );
  const [templateInteractionTime, setTemplateInteractionTime] =
    useState<number>(0);
  const [showTemplateArrows, setShowTemplateArrows] = useState(true);
  const arrowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transform, setTransform] = useState<ViewTransform>({
    x: 0,
    y: 0,
    zoom: 1,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [touchCount, setTouchCount] = useState(0);
  const [isLayoutLocked, setIsLayoutLocked] = useState(true);
  const [arrangeStatus, setArrangeStatus] = useState<
    "idle" | "scanning_yellow" | "scanning_green" | "success" | "error"
  >("idle");
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);
  const [isCanvasSettingsOpen, setIsCanvasSettingsOpen] = useState(false);
  const [showLockHint, setShowLockHint] = useState(false);
  const [isDeployOverlayOpen, setIsDeployOverlayOpen] = useState(false);
  const [isStorageChoiceOpen, setIsStorageChoiceOpen] = useState(false);
  const [deployStorageUsed, setDeployStorageUsed] = useState(0);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const isSettingsScrolling = useRef(false);
  const settingsStartY = useRef(0);

  const handleAutoArrange = () => {
    if (isLayoutLocked) {
      setArrangeStatus("error");
      setShowLockHint(true);
      setTimeout(() => setShowLockHint(false), 2000);
      // "No" shake haptic
      if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([40, 30, 40, 30, 40]);
      }
      setTimeout(() => setArrangeStatus("idle"), 2000);
      return;
    }

    setArrangeStatus("scanning_yellow");

    // First sharp haptic for Yellow stage
    if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(20);
    }

    // Mid-way haptic for transition to Green stage (at 1 second)
    setTimeout(() => {
      setArrangeStatus("scanning_green");
      if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(20);
      }
    }, 1000);

    // Sequential Yellow->Green (1s each, 2s total)
    setTimeout(() => {
      // Auto-arrange logic
      autoArrange();

      // Reset rotations
      setAssets((prev) => prev.map((a) => ({ ...a, rotation: 0 })));

      // Auto-lock after rearrangement
      setIsLayoutLocked(true);

      // The user likes the zoom behavior of the lock button (which is zoom: 1)
      setTransform({ x: 0, y: 0, zoom: 1 });

      setArrangeStatus("success");

      // Final long haptic for successful settlement
      if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(200);
      }

      setTimeout(() => setArrangeStatus("idle"), 1200);
    }, 2000);
  };

  // --- Agent Mode State ---
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [isAgentTyping, setIsAgentTyping] = useState(false);

  // Auto-sync Project Metadata for Cloud Projects
  useEffect(() => {
    if (currentProject?.storageType === "cloud") {
      const syncMetadata = async () => {
        if (!currentProject || (assets.length === 0 && currentProject.assets.length > 0)) {
          return;
        }
        try {
          const { syncProjectMetadata, saveProject } = await import("./db");
          
          const currentMetadata = { ...currentProject, assets, updatedAt: Date.now() };
          
          // Local first
          await saveProject(currentMetadata);
          
          // Quiet Metadata Sync (only structure and layout, not binary data)
          await syncProjectMetadata(currentMetadata);
        } catch (err) {
          // Fail silently, kept in local DB
        }
      };
      
      const timeoutId = setTimeout(syncMetadata, 3000); // 3s debounce for layout shifts
      return () => clearTimeout(timeoutId);
    }
  }, [assets.length, currentProject?.id]);

  const agentScrollRef = useRef<HTMLDivElement>(null);
  const agentFileInputRef = useRef<HTMLInputElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deletedProjectInfo, setDeletedProjectInfo] = useState<{
    project: DBProject;
    timeoutId: NodeJS.Timeout;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const isMultiTouch = touchCount >= 2;

  // Track global touches to differentiate drag vs pinch
  useEffect(() => {
    const handleTouch = (e: TouchEvent) => {
      setTouchCount(e.touches.length);
    };
    /* TEMPORARILY DISABLED FOR DEBUGGING
    window.addEventListener('touchstart', handleTouch, { passive: true });
    window.addEventListener('touchend', handleTouch, { passive: true });
    window.addEventListener('touchcancel', handleTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('touchend', handleTouch);
      window.removeEventListener('touchcancel', handleTouch);
    }; */
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const resetArrowTimer = useCallback(() => {
    setShowTemplateArrows(true);
    if (arrowTimeoutRef.current) clearTimeout(arrowTimeoutRef.current);
    arrowTimeoutRef.current = setTimeout(() => {
      setShowTemplateArrows(false);
    }, 6000);
  }, []);

  useEffect(() => {
    resetArrowTimer();
    return () => {
      if (arrowTimeoutRef.current) clearTimeout(arrowTimeoutRef.current);
    };
  }, [resetArrowTimer]);

  const handleTemplateInteraction = () => {
    resetArrowTimer();
    setTemplateInteractionTime(Date.now());
  };

  const handlePrevTemplate = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleTemplateInteraction();
    setActiveTemplate((prev) => prev + 1);
    if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(8);
    }
  };

  const handleNextTemplate = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleTemplateInteraction();
    setActiveTemplate((prev) => prev - 1);
    if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(8);
    }
  };

  // Template auto-carousel
  useEffect(() => {
    if (viewMode !== "dashboard") return;
    const interval = setInterval(() => {
      // Pause auto-scroll if interacted within the last 6 seconds
      // Using a local check to ensure we don't jitter during active user sessions
      if (Date.now() - templateInteractionTime > 8000) {
        setActiveTemplate((prev) => prev - 1);
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [viewMode, templateInteractionTime]);

  // Load projects from local and cloud on mount
  useEffect(() => {
    async function loadProjects() {
      // 1. Initial local load for instant UI
      const localProjects = await getProjects();
      setProjects(localProjects);

      // 2. Background cloud fetch if user is signed in
      if (user) {
        try {
          const { getCloudProjects } = await import("./db");
          const cloudProjects = await getCloudProjects();
          
         setProjects(prev => {
            const cloudProjectIds = new Set(cloudProjects.map(p => p.id));
            
            // 1. Prune orphaned cloud projects: 
            // Projects that are cloud-synced but no longer in the cloud list
            const pruned = prev.filter(p => !(p.storageType === 'cloud' && !cloudProjectIds.has(p.id)));
            
            // 2. Merge logic
            const merged = [...pruned];
            cloudProjects.forEach(cp => {
              const localIndex = merged.findIndex(p => p.id === cp.id);
              if (localIndex === -1) {
                merged.push(cp);
              } else {
                if (cp.updatedAt > merged[localIndex].updatedAt) {
                  merged[localIndex] = cp;
                }
              }
            });

            // 3. Sync pruned+merged back to IDB
            import("./db").then(db => {
               db.setAllProjects(merged);
            });
            
            return merged.sort((a, b) => b.updatedAt - a.updatedAt);
          });
        } catch (err) {
          console.warn("Cloud Sync Error (Initial Load):", err);
        }
      }
    }
    loadProjects();
  }, [user]);

  // Save current project when assets change (debounced implicitly by only saving when we change them)
  useEffect(() => {
    if (currentProject && viewMode !== "dashboard") {
      const serializeAsset = (a: Asset): DBAsset | null => {
        if (!a.file && !a.fileData) return null;

        // Ensure it's in our memory cache too so ProjectCard can use it instantly on return to home
        if (a.file || a.fileData) {
          getCachedUrl(
            `cover_${currentProject.id}_${a.id}`,
            a.file,
            a.fileData,
          );
        }

        return {
          id: a.id,
          type: a.type,
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
          sequence: a.sequence,
          name: a.name,
          file: a.file as File | Blob,
          fileData: a.fileData,
          rotation: a.rotation,
        };
      };

      const updatedProject: DBProject = {
        ...currentProject,
        updatedAt: Date.now(),
        assets: assets
          .map(serializeAsset)
          .filter((a): a is DBAsset => a !== null),
        agentMessages: agentMessages.map((m) => ({
          role: m.role,
          text: m.text,
          assets: m.assets
            ? m.assets
                .map(serializeAsset)
                .filter((a): a is DBAsset => a !== null)
            : undefined,
        })),
      };
      saveProject(updatedProject);
      setProjects((prev) =>
        prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
      );
    }
  }, [assets, agentMessages, currentProject?.id, viewMode]);

  const pushHistory = (newAssets: Asset[]) => {
    setPast((prev) => [...prev, assets]);
    setFuture([]);
    setAssets(newAssets);
  };

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setPast(newPast);
    setFuture((prev) => [assets, ...prev]);
    setAssets(previous);
  }, [past, assets]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setFuture(newFuture);
    setPast((prev) => [...prev, assets]);
    setAssets(next);
  }, [future, assets]);

  const triggerHaptic = useCallback(
    (type: "light" | "medium" | "success" = "light") => {
      if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
        if (type === "success") navigator.vibrate([10, 30, 50]);
        else if (type === "medium") navigator.vibrate(25);
        else navigator.vibrate(10);
      }
    },
    [agentSettings.hapticsEnabled],
  );

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== "board") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, viewMode]);

  // Handle Wheel Zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (viewMode !== "board") return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        setTransform((prev) => ({
          ...prev,
          zoom: Math.min(Math.max(prev.zoom + delta, 0.2), 3),
        }));
      } else if (!isPanning) {
        // Standard scroll pans the board
        setTransform((prev) => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => canvas?.removeEventListener("wheel", handleWheel);
  }, [viewMode, isPanning]);

  // Auto-scroll agent chat
  useEffect(() => {
    if (agentScrollRef.current) {
      agentScrollRef.current.scrollTop = agentScrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  const processFile = async (
    file: File,
  ): Promise<{
    url: string;
    width: number;
    height: number;
    file: File | Blob;
    fileData?: string;
  }> => {
    // 1. Detect HEIF/HEIC
    const isHeic = file.name.toLowerCase().endsWith(".heic") || 
                   file.name.toLowerCase().endsWith(".heif") ||
                   file.type === "image/heic" || 
                   file.type === "image/heif";

    let targetFile: File | Blob = file;

    if (isHeic) {
      try {
        console.log("HEIC detected, converting...");
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.8
        });
        targetFile = Array.isArray(converted) ? converted[0] : converted;
      } catch (e) {
        console.error("HEIC conversion failed, falling back to original", e);
      }
    }

    return new Promise((resolve) => {
      const tempUrl = URL.createObjectURL(targetFile);

      if (targetFile.type.startsWith("video")) {
        const video = document.createElement("video");
        video.onloadedmetadata = () => {
          resolve({
            url: tempUrl,
            width: video.videoWidth || 1920,
            height: video.videoHeight || 1080,
            file,
          });
        };
        video.onerror = () => {
          resolve({ url: tempUrl, width: 1920, height: 1080, file });
        };
        video.src = tempUrl;
      } else {
        const img = new Image();
        img.onload = () => {
          // Optimized for Cloud Sync Performance
          const MAX_DIM = 1000; 
          let { width, height } = img;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round(height * (MAX_DIM / width));
              width = MAX_DIM;
            } else {
              width = Math.round(width * (MAX_DIM / height));
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Lower quality for significant speed gain in Firestore
            const dataUrl = canvas.toDataURL("image/jpeg", 0.70); 
            resolve({ url: dataUrl, width, height, file: targetFile, fileData: dataUrl });
          } else {
            const reader = new FileReader();
            reader.onloadend = () =>
              resolve({
                url: reader.result as string,
                width,
                height,
                file: targetFile,
                fileData: reader.result as string,
              });
            reader.readAsDataURL(targetFile);
          }
        };
        img.onerror = () => {
          // If it failed to load but we didn't try HEIC conversion yet, or if it's a known tough format
          resolve({ url: tempUrl, width: 1920, height: 1080, file: targetFile });
        };
        img.src = tempUrl;
      }
    });
  };

  const handleAgentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let fileList = Array.from(files) as File[];
    if (fileList.length > 7) {
      showToast(
        "Agent constraint: Please provide a maximum of 7 items for auditing at once.",
      );
      fileList = fileList.slice(0, 7);
    }

    const newAgentAssets: Asset[] = fileList.map((file, idx) => {
      const type: AssetType = file.type.startsWith("video") ? "video" : "image";
      return {
        id: `agent-${Math.random().toString(36).substr(2, 9)}`,
        type,
        url: URL.createObjectURL(file), // Will still render as Blob URL locally
        width: type === "video" ? 1920 : 1200,
        height: type === "video" ? 1080 : 800,
        x: 0,
        y: 0,
        sequence: 0,
        name: file.name,
        file,
      };
    });

    // Add to chat history
    setAgentMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: `Uploaded ${newAgentAssets.length} asset(s)`,
        assets: newAgentAssets,
      },
    ]);

    // Call AI automatically after upload, but pass the un-encoded FILE objects for standard base64 encoding inside
    callAgent(
      `I've uploaded ${newAgentAssets.length} new asset(s) for audit.`,
      fileList,
    );

    e.target.value = "";
  };

  const approveAsset = (asset: Asset) => {
    // 1. Mark as approved in UI (optional visual feedback)
    // 2. Add to main board
    const newAsset: Asset = {
      ...asset,
      id: Math.random().toString(36).substr(2, 9), // New unique ID for the main gallery
      x: (Math.random() * 100 + 50 - transform.x) / transform.zoom,
      y: (Math.random() * 100 + 50 - transform.y) / transform.zoom,
      sequence: assets.length + 1,
    };

    const nextBoard = calculateAutoLayout([...assets, newAsset]);
    pushHistory(nextBoard);

    setAgentMessages((prev) => [
      ...prev,
      {
        role: "model",
        text: `Asset "${asset.name}" has been approved and moved to the Audit Bench.`,
      },
    ]);
  };

  const callAgent = async (message: string, contextFiles?: File[]) => {
    setIsAgentTyping(true);
    try {
      // NOTE: Ensure apiKey is provided (in AI Studio we use process.env via Vite Define Plugin)
      const ai = new GoogleGenAI({
        apiKey:
          localApiKey ||
          (import.meta as any).env.VITE_GEMINI_API_KEY ||
          process.env.GEMINI_API_KEY!,
      });

      const parts: any[] = [{ text: message }];

      if (contextFiles && contextFiles.length > 0) {
        for (const file of contextFiles) {
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(",")[1]);
            };
            reader.readAsDataURL(file);
          });
          parts.unshift({
            inlineData: {
              data: base64Data,
              mimeType: file.type,
            },
          });
        }
      }

      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...agentMessages.map((m) => ({
            role: m.role,
            parts: [{ text: m.text }],
          })),
          { role: "user", parts: parts },
        ],
        config: {
          systemInstruction:
            "You are the 'Director's Agent' for a film production tool. You help the user audit visual assets. You are professional, concise, and focused on film terminology. If a user uploads an image, analyze its composition and quality. Address the user as 'Director Prince'.",
        },
      });

      const response = await model;
      setAgentMessages((prev) => [
        ...prev,
        { role: "model", text: response.text },
      ]);
    } catch (err: any) {
      console.error("Agent Error:", err);
      setAgentMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: `Apologies, Director. I encountered a signal interference (${err?.message || "Unknown error"}). Please try again.`,
        },
      ]);
    } finally {
      setIsAgentTyping(false);
    }
  };

  const sendAgentMessage = () => {
    if (!agentInput.trim()) return;
    const msg = agentInput.trim();
    setAgentMessages((prev) => [...prev, { role: "user", text: msg }]);
    setAgentInput("");
    callAgent(msg);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let fileList = Array.from(files) as File[];

    if (currentProject?.storageType === "cloud") {
      if (fileList.length > 1) {
        alert("Cloud Sync only accepts 1 asset at a time.");
        e.target.value = "";
        return;
      }
      const firstFile = fileList[0];
      if (firstFile.type.startsWith("video")) {
        alert("Videos are restricted to Local-Only projects.");
        e.target.value = "";
        return;
      }
      if (firstFile.size > 1024 * 1024) {
        alert("File size exceeds 1MB cloud limit. Upload rejected.");
        e.target.value = "";
        return;
      }
    } else if (fileList.length > 7) {
      showToast(
        "Exceeded limit: You can only upload a maximum of 7 items at a time.",
      );
      fileList = fileList.slice(0, 7);
    }

    // 1. Create immediate asset placeholders for zero-latency UI
    const immediateBatch: Asset[] = fileList.map((file, idx) => {
      const type: AssetType = file.type.startsWith("video") ? "video" : "image";
      return {
        id: Math.random().toString(36).substr(2, 9),
        type,
        url: URL.createObjectURL(file), // Fast local blob URL
        width: type === "video" ? 1920 : 1200,
        height: type === "video" ? 1080 : 800,
        x: (Math.random() * 100 + 50 - transform.x) / transform.zoom,
        y: (Math.random() * 100 + 50 - transform.y) / transform.zoom,
        sequence: assets.length + idx + 1,
        name: file.name,
        file,
      };
    });

    // 2. Add to board immediately using history
    const nextBoard = calculateAutoLayout([...assets, ...immediateBatch]);
    pushHistory(nextBoard);

    // 3. Reset input immediately
    e.target.value = "";

    // 4. Background process for high-res/metadata updates & Sync
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const processed = await processFile(file);
      
      setAssets((current) => {
        let finalAsset: Asset | null = null;
        const updated = current.map((item) => {
          if (item.id === immediateBatch[i].id) {
            finalAsset = {
              ...item,
              url: processed.url,
              width: processed.width,
              height: processed.height,
              file: processed.file,
              fileData: processed.fileData,
            };
            return finalAsset;
          }
          return item;
        });
        const layouted = calculateAutoLayout(updated);

        // HYBRID DUAL-ANCHOR PERSISTENCE
        if (currentProject) {
            const sync = async () => {
                const { saveProject, syncProjectMetadata, deployAssetToCloud } = await import("./db");
                const projectSnapshot: DBProject = {
                    ...currentProject,
                    assets: layouted.map(a => a as unknown as DBAsset),
                    updatedAt: Date.now()
                };

                // ALWAYS local first
                await saveProject(projectSnapshot);

                // Quiet Cloud Sync
                if (currentProject.storageType === 'cloud' && finalAsset) {
                    try {
                        await syncProjectMetadata(projectSnapshot);
                        await deployAssetToCloud(currentProject.id, finalAsset as unknown as DBAsset);
                        refreshUploadedAssets();
                    } catch (err) {
                        console.error("Background sync error (asset safe in local DB):", err);
                    }
                }
            };
            sync();
        }

        return layouted;
      });
    }
  };

  const openProject = async (project: DBProject) => {
    // Default to local if storageType is missing (legacy projects)
    const normalizedProject: DBProject = {
      ...project,
      storageType: project.storageType || "local"
    };

    setCurrentProject(normalizedProject);
    setPast([]);
    setFuture([]);
    resetView();
    setIsSettingsOpen(false);
    setViewMode("board");

    const deserializeAsset = (a: DBAsset): Asset => {
      let url = a.fileData || "";
      if (!url && a.file) {
        try {
          url = URL.createObjectURL(a.file);
        } catch (e) {
          console.error("Failed to create URL for file", e);
        }
      }
      return {
        ...a,
        url,
        file: a.file,
        fileData: a.fileData,
      };
    };

    // Load available assets first (some might be local)
    const reconstructedAssets = project.assets.map(deserializeAsset);
    setAssets(reconstructedAssets);

    if (project.agentMessages && project.agentMessages.length > 0) {
      setAgentMessages(
        project.agentMessages.map((m) => ({
          role: m.role,
          text: m.text,
          assets: m.assets ? m.assets.map(deserializeAsset) : undefined,
        })),
      );
    } else {
      setAgentMessages([
        {
          role: "model",
          text: "Hello Director Prince. I'm ready to audit your assets. Upload a scene here to begin.",
        },
      ]);
    }

    // Attempt cloud recovery if local data is missing (crucial for cross-device sync)
    const isSkeleton = project.assets.some(a => !a.fileData && !a.file);
    if (isSkeleton) {
      try {
        const { getProjectAssets, saveProject } = await import("./db");
        const cloudAssets = await getProjectAssets(project.id);
        
        if (cloudAssets.length > 0) {
           const updatedAssetsInState = normalizedProject.assets.map(pa => {
              const ca = cloudAssets.find(c => c.id === pa.id);
              return ca ? deserializeAsset(ca) : deserializeAsset(pa);
           });

           setAssets(updatedAssetsInState);

           const updatedProject: DBProject = {
             ...normalizedProject,
             assets: updatedAssetsInState.map(a => a as unknown as DBAsset),
             updatedAt: Date.now()
           };

           // PERSIST CACHE: Save the recovered assets to local IndexedDB so next launch is instant
           await saveProject(updatedProject);
           
           // Update current project ref
           setCurrentProject(updatedProject);
        }
      } catch (err) {
        console.error("Cloud Asset Recovery Failed:", err);
      }
    }
  };

  const handleNewProject = () => {
    setIsStorageChoiceOpen(true);
  };

  const confirmNewProject = async (storageType: "local" | "cloud") => {
    const { saveProject } = await import("./db");
    const newDbProject: DBProject = {
      id: Math.random().toString(36).substr(2, 9),
      title: `Project ${new Date().toLocaleDateString()}`,
      updatedAt: Date.now(),
      assets: [],
      storageType,
    };
    
    // Explicit Local-First Protocol Initialization
    await saveProject(newDbProject);
    
    setProjects((prev) => [newDbProject, ...prev]);
    openProject(newDbProject);
    setIsStorageChoiceOpen(false);
    
    if (agentSettings.hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25);
    }
  };

  const removeAsset = (id: string) => {
    const filtered = assets.filter((a) => a.id !== id);
    // Re-sequence
    const resequenced = filtered.map((a, idx) => ({ ...a, sequence: idx + 1 }));
    pushHistory(resequenced);
  };

  const updateAssetPos = (
    id: string,
    x: number,
    y: number,
    rotation?: number,
  ) => {
    if (isLayoutLocked) return;

    let finalX = x;
    let finalY = y;

    const newAssets = assets.map((a) =>
      a.id === id
        ? {
            ...a,
            x: finalX,
            y: finalY,
            rotation: rotation !== undefined ? rotation : a.rotation,
          }
        : a,
    );
    pushHistory(newAssets);
  };

  const updateAssetData = (newAsset: Asset) => {
    setAssets((prev) => prev.map((a) => (a.id === newAsset.id ? newAsset : a)));
  };

  const zoomIn = () =>
    setTransform((prev) => ({ ...prev, zoom: Math.min(prev.zoom + 0.1, 3) }));
  const zoomOut = () =>
    setTransform((prev) => ({ ...prev, zoom: Math.max(prev.zoom - 0.1, 0.2) }));
  const resetView = () => {
    setTransform({ x: 0, y: 0, zoom: 1 });
  };

  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [lastSwappedId, setLastSwappedId] = useState<string | null>(null);

  const [deleteSelection, setDeleteSelection] = useState<string[]>([]);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<string | null>(
    null,
  );

  const handleSelectForDelete = useCallback((id: string, toggle: boolean) => {
    setDeleteSelection((prev) => {
      if (toggle) {
        if (prev.includes(id)) {
          return prev.filter((p) => p !== id);
        } else {
          return [...prev, id];
        }
      } else {
        if (!prev.includes(id)) return [...prev, id];
        return prev;
      }
    });
  }, []);

  const handleRequestDelete = useCallback(
    (targetId: string) => {
      if (deleteSelection.length > 1) {
        setDeleteConfirmTarget(targetId);
      } else {
        removeAsset(targetId);
        setDeleteSelection((prev) => prev.filter((p) => p !== targetId));
      }
    },
    [deleteSelection.length, removeAsset],
  );

  const handleConfirmDelete = (mode: "single" | "all") => {
    if (!deleteConfirmTarget) return;

    if (mode === "single") {
      removeAsset(deleteConfirmTarget);
      setDeleteSelection((prev) =>
        prev.filter((p) => p !== deleteConfirmTarget),
      );
    } else {
      const newAssets = assets
        .filter((a) => !deleteSelection.includes(a.id))
        .map((a, idx) => ({ ...a, sequence: idx + 1 })); // Re-sequence
      pushHistory(newAssets);
      setDeleteSelection([]);
    }
    setDeleteConfirmTarget(null);
  };

  // Layout Config for perfectly fitted storyboard grids
  const getLayoutConfig = () => {
    const screenWidth =
      typeof window !== "undefined" ? window.innerWidth : 1200;
    const padding = 12; // Outer padding
    const gutter = 4; // Micro-spacing between items to replicate the visual reference

    let numColumns = 1;
    if (screenWidth >= 1500) numColumns = 6;
    else if (screenWidth >= 1200) numColumns = 5;
    else if (screenWidth >= 900) numColumns = 4;
    else if (screenWidth >= 600) numColumns = 3;
    else numColumns = 2; // Always perfectly fitted on mobile

    const totalGutterSpace = gutter * (numColumns - 1);
    const availableWidth = screenWidth - padding * 2 - totalGutterSpace;
    const colWidth = Math.floor(availableWidth / numColumns);

    // Tight 16:9 ratio for cinematic production feel
    const itemHeight = colWidth * (9 / 16);

    return { padding, gutter, numColumns, colWidth, itemHeight };
  };

  const [layoutConfig, setLayoutConfig] = useState(getLayoutConfig());

  const calculateAutoLayout = useCallback(
    (inputAssets: Asset[], config = layoutConfig) => {
      if (inputAssets.length === 0) return [];

      const { padding, gutter, numColumns, colWidth } = config;

      // Sort local copy to ensure correct grid placement calculations
      const sorted = [...inputAssets].sort((a, b) => a.sequence - b.sequence);

      const columnHeights = new Array(numColumns).fill(80);
      const idToPos = new Map<string, { x: number; y: number }>();

      sorted.forEach((asset, idx) => {
        // Use strict columns to naturally preserve order and prevent cascading shifts on swap
        const col = idx % numColumns;

        const x = padding + col * (colWidth + gutter);
        const y = columnHeights[col];

        // Calculate true height based on aspect ratio
        const aspectRatio =
          asset.width && asset.height ? asset.height / asset.width : 9 / 16;
        const itemHeight = colWidth * aspectRatio;

        // Update the column height
        columnHeights[col] += itemHeight + gutter;

        idToPos.set(asset.id, { x, y });
      });

      // CRITICAL: Return in the original array order to prevent React DOM re-ordering which causes flickering/snapping.
      return inputAssets.map((asset) => {
        const pos = idToPos.get(asset.id);
        return pos ? { ...asset, x: pos.x, y: pos.y } : asset;
      });
    },
    [layoutConfig],
  );

  useEffect(() => {
    const handleResize = () => {
      const newConfig = getLayoutConfig();
      setLayoutConfig(newConfig);
      setAssets((prev) => calculateAutoLayout(prev, newConfig));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [calculateAutoLayout]);

  const swapSequence = (id1: string, id2: string) => {
    setHoveredAssetId(null);
    setSwapSourceId(null);
    setLastSwappedId(id2);

    // Success flash duration
    setTimeout(() => setLastSwappedId(null), 1000);

    const asset1 = assets.find((a) => a.id === id1);
    const asset2 = assets.find((a) => a.id === id2);
    if (!asset1 || !asset2 || id1 === id2) return;

    // Swap sequence only, then re-calculate layout to properly handle different aspect ratios
    // without gaps or overlaps. Strict column layout in calculateAutoLayout prevents cascading shifts.
    const updated = assets.map((a) => {
      if (a.id === id1) {
        return { ...a, sequence: asset2.sequence };
      }
      if (a.id === id2) {
        return { ...a, sequence: asset1.sequence };
      }
      return a;
    });

    const reArranged = calculateAutoLayout(updated);
    pushHistory(reArranged);
  };

  // Memoize sorted assets for performance
  const sortedAssets = React.useMemo(
    () => [...assets].sort((a, b) => a.sequence - b.sequence),
    [assets],
  );

  const autoArrange = useCallback(() => {
    if (assets.length === 0) return;
    const arranged = calculateAutoLayout(assets);
    pushHistory(arranged);
    setTransform({ x: 0, y: 0, zoom: 1 });
  }, [assets, calculateAutoLayout, pushHistory]);

  const startPlayback = () => {
    if (assets.length === 0) return;
    setCurrentIndex(0);
    setViewMode("playback");
  };

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % assets.length);
  }, [assets.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + assets.length) % assets.length);
  }, [assets.length]);

  // Auto-advance for images
  useEffect(() => {
    const currentAsset = sortedAssets[currentIndex];
    if (viewMode === "playback" && currentAsset?.type === "image") {
      const timer = setTimeout(() => {
        nextSlide();
      }, 5000); // 5 seconds per image
      return () => clearTimeout(timer);
    }
  }, [viewMode, currentIndex, sortedAssets, nextSlide]);

  const clearBoard = () => {
    if (window.confirm("Clear all assets?")) {
      pushHistory([]);
      setTransform({ x: 0, y: 0, zoom: 1 });
    }
  };

  // Handle touch interactions for playback
  const handlePlaybackClick = (e: React.MouseEvent) => {
    const clientX = e.clientX;
    const width = window.innerWidth;
    if (clientX < width * 0.3) {
      prevSlide();
    } else if (clientX > width * 0.7) {
      nextSlide();
    }
  };

  const handleDeleteProject = async (id: string) => {
    const projectToDelete = projects.find((p) => p.id === id);
    if (!projectToDelete) return;

    // Resolve any previous pending deletion immediately (force previous one to finish)
    if (deletedProjectInfo) {
      clearTimeout(deletedProjectInfo.timeoutId);
      deleteProjectEverywhere(deletedProjectInfo.project.id);
    }

    // 1. Immediately remove from UI state
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (currentProject?.id === id) {
      setCurrentProject(null);
    }

    // 2. Immediately remove from Local IDB to prevent reappearing on refresh
    await deleteProject(id);

    // 3. Start 5 second timer for CLOUD deletion
    const timeoutId = setTimeout(() => {
      deleteProjectEverywhere(id);
      setDeletedProjectInfo((prev) => (prev?.project.id === id ? null : prev));
    }, 5000);

    setDeletedProjectInfo({ project: projectToDelete, timeoutId });
  };

  const handleUndoDelete = async () => {
    if (deletedProjectInfo) {
      if (agentSettings.hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([15, 30, 20]);
      }
      clearTimeout(deletedProjectInfo.timeoutId);
      
      // Restore to Local IDB immediately
      await saveProject(deletedProjectInfo.project);
      
      setProjects((prev) => {
        const restored = [...prev, deletedProjectInfo.project];
        return restored.sort((a, b) => b.updatedAt - a.updatedAt);
      });
      setDeletedProjectInfo(null);
    }
  };

  const handleRenameProject = async (project: DBProject) => {
    const newTitle = window.prompt("Enter new project title:", project.title);
    if (newTitle && newTitle.trim() && newTitle !== project.title) {
      const updated = {
        ...project,
        title: newTitle.trim(),
        updatedAt: Date.now(),
      };
      await saveProject(updated);
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? updated : p)),
      );
      if (currentProject?.id === project.id) {
        setCurrentProject(updated);
      }
    }
  };

  const refreshStorageData = async () => {
    if (!user) return;
    try {
      const { getCloudStorageTelemetry } = await import("./db");
      const { projects, totalBytes } = await getCloudStorageTelemetry();
      setCloudUsage(totalBytes);
      setCloudProjectsList(projects);
    } catch (err) {
      console.error("Failed to load storage telemetry:", err);
    }
  };

  const handleDeleteCloudProject = (projectId: string) => {
    // UI Feedback first
    triggerHaptic("success");
    
    // Start countdown
    setPendingDeletions(prev => ({ ...prev, [projectId]: 5 }));
    
    const interval = setInterval(() => {
      setPendingDeletions(prev => {
        if (!prev[projectId]) {
          clearInterval(interval);
          return prev;
        }
        
        const next = { ...prev };
        if (next[projectId] <= 1) {
          clearInterval(interval);
          // Target deletion executed permanently
          import("./db").then(db => db.deleteProjectEverywhere(projectId)).then(() => refreshStorageData());
          delete next[projectId];
        } else {
          next[projectId] -= 1;
        }
        return next;
      });
    }, 1000);
    
    (window as any)[`deletion_${projectId}`] = interval;
  };

  const handleUndoCloudDeletion = (projectId: string) => {
    const interval = (window as any)[`deletion_${projectId}`];
    if (interval) clearInterval(interval);
    setPendingDeletions(prev => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    triggerHaptic("light");
  };

  const handlePurgeAllCloud = async () => {
    if (window.confirm("ARE YOU SURE? THIS WILL PERMANENTLY ERASE ALL CLOUD DATA FROM FIREBASE.")) {
       const { purgeAllCloudData } = await import("./db");
       await purgeAllCloudData();
       refreshStorageData();
    }
  };

  const renderSettings = () => (
    <AnimatePresence>
      {isSettingsOpen && (
        <motion.div
          initial={{ opacity: 0, x: "100%" }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          style={{
            position: "fixed",
            inset: 0,
            background: "#000000",
            zIndex: 999999,
            pointerEvents: "auto",
          }}
          className="fixed inset-0 z-[999999] bg-black flex flex-col"
        >
          {/* Subtle Grid Mesh Overlay */}
          <div 
            className="absolute top-0 right-0 w-[80vw] h-[60vh] max-w-[600px] pointer-events-none opacity-25"
            style={{
              backgroundImage: 'linear-gradient(#CCFF00 1px, transparent 1px), linear-gradient(90deg, #CCFF00 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              maskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 70%)'
            }}
          />

          {/* Sticky Header */}
          <header className="sticky top-0 bg-[#000000] z-50 w-full pt-12 md:pt-16 pb-6 px-4 md:px-8 border-b border-[#111111] flex items-center gap-5">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (settingsPage === "main") {
                  setIsSettingsOpen(false);
                } else {
                  setSettingsPage("main");
                }
              }}
              className="w-12 h-12 flex items-center justify-center bg-[#111111] border border-white/[0.05] rounded-full text-slate-300 hover:text-white transition-all shadow-lg active:opacity-70"
            >
              {settingsPage === "main" ? (
                <X size={20} strokeWidth={2} />
              ) : (
                <ChevronLeft size={24} strokeWidth={2} />
              )}
            </motion.button>
            <h2 className="text-[28px] md:text-[32px] font-bold text-white tracking-tight font-display font-black uppercase">
              {settingsPage === "main"
                ? "Settings"
                : settingsPage === "storage"
                  ? "Cloud Storage"
                : settingsPage === "profile"
                  ? "Profile Protocol"
                  : settingsPage === "api"
                    ? "API Connections"
                    : settingsPage === "agent"
                      ? "Agents"
                      : settingsPage === "appearance"
                        ? "Workspace Layout"
                        : settingsPage === "haptics"
                          ? "Sound & Haptics"
                          : settingsPage.charAt(0).toUpperCase() + settingsPage.slice(1)}
            </h2>
          </header>

          <div 
            ref={settingsScrollRef}
            onScroll={() => {
              isSettingsScrolling.current = true;
              if ((window as any)._settingsScrollTimeout) clearTimeout((window as any)._settingsScrollTimeout);
              (window as any)._settingsScrollTimeout = setTimeout(() => {
                isSettingsScrolling.current = false;
              }, 150);
            }}
            className="flex-1 overflow-y-auto pr-2 no-scrollbar relative z-20 h-full max-h-[85vh]"
          >
            <div className="w-full max-w-2xl mx-auto px-4 md:px-8 py-6 pb-20">
              {settingsPage === "main" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col mb-8 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[var(--theme-accent)]/5 blur-[100px] pointer-events-none rounded-full translate-x-1/3 -translate-y-1/2" style={{ "--theme-accent": activeAccent } as React.CSSProperties} />
                    <div className="flex items-center gap-5 relative z-10 w-full">
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border border-[#222222] bg-[#111111]">
                        {user?.photoURL ? (
                          <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-bold text-2xl uppercase">
                            {(user?.displayName || user?.email || "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 w-full max-w-full min-w-0">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col min-w-0">
                            <span className="text-lg md:text-xl tracking-wide font-bold text-white truncate min-w-0">
                              {user?.displayName || "StudioRipe Director"}
                            </span>
                            <span className="text-[13px] text-slate-500 font-medium truncate min-w-0 mt-0.5">
                              {user?.email || ""}
                            </span>
                          </div>
                          <button
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              settingsStartY.current = e.clientY;
                            }}
                            onClick={(e) => {
                              if (Math.abs(e.clientY - settingsStartY.current) > 10) return;
                              setEditNameValue(user?.displayName || "");
                              setSettingsPage("profile");
                            }}
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[#111111] border border-[#222222] text-slate-400 hover:text-white transition-colors cursor-pointer relative z-20"
                          >
                            <Edit2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      setSettingsPage("storage");
                      refreshStorageData();
                    }}
                    className="bg-[#111111] border border-[#222222] text-white hover:bg-[#151515] rounded-xl py-4 w-full text-[10px] uppercase tracking-[0.2em] font-black text-center mt-3 mb-6 transition-all shadow-xl flex items-center justify-center gap-3"
                  >
                    <HardDrive size={16} className="text-[var(--theme-accent)]" style={{ "--theme-accent": activeAccent } as any} />
                    MY STORAGE
                  </motion.button>

                  <div className="flex flex-col">
                    <span className="text-[#666666] text-xs tracking-widest mb-3 font-semibold block mt-6">
                      SYSTEM CONFIGURATION
                    </span>
                    <div className="flex flex-col rounded-2xl md:bg-[#0A0A0A] md:border border-[#1A1A1A] overflow-hidden">
                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          settingsStartY.current = e.clientY;
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("agent");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setSettingsPage("agent");
                            setActivatingRow(null);
                          }, 300);
                        }}
                        onClick={(e) => {
                          if (Math.abs(e.clientY - settingsStartY.current) > 10) e.stopPropagation();
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "agent" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "agent" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center text-white shrink-0 shadow-sm border border-[#222222]">
                            <MessageSquare size={18} strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Agents
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Model selection and identity settings
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="text-[#444444] group-hover:text-white transition-colors" size={20} strokeWidth={1.5} />
                      </motion.button>

                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          settingsStartY.current = e.clientY;
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("haptics");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setSettingsPage("haptics");
                            setActivatingRow(null);
                          }, 300);
                        }}
                        onClick={(e) => {
                          if (Math.abs(e.clientY - settingsStartY.current) > 10) e.stopPropagation();
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "haptics" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "haptics" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center text-white shrink-0 shadow-sm border border-[#222222]">
                            <Magnet size={18} strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Sound & Haptics
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Vibration physics and audio feedback
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="text-[#444444] group-hover:text-white transition-colors" size={20} strokeWidth={1.5} />
                      </motion.button>

                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          settingsStartY.current = e.clientY;
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("appearance");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setSettingsPage("appearance");
                            setActivatingRow(null);
                          }, 300);
                        }}
                        onClick={(e) => {
                          if (Math.abs(e.clientY - settingsStartY.current) > 10) e.stopPropagation();
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "appearance" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "appearance" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center text-white shrink-0 shadow-sm border border-[#222222]">
                            <Sliders size={18} strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Workspace Layout
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Interface scale and spatial behavior
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="text-[#444444] group-hover:text-white transition-colors" size={20} strokeWidth={1.5} />
                      </motion.button>
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[#666666] text-xs tracking-widest mb-3 font-semibold block mt-6">
                      ADVANCED
                    </span>
                    <div className="flex flex-col rounded-2xl md:bg-[#0A0A0A] md:border border-[#1A1A1A] overflow-hidden">
                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          settingsStartY.current = e.clientY;
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("api");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setSettingsPage("api");
                            setActivatingRow(null);
                          }, 300);
                        }}
                        onClick={(e) => {
                          if (Math.abs(e.clientY - settingsStartY.current) > 10) e.stopPropagation();
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "api" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "api" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center text-white shrink-0 shadow-sm border border-[#222222]">
                            <Lock size={18} strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              API Connections
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              External keys and secure integrations
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="text-[#444444] group-hover:text-white transition-colors" size={20} strokeWidth={1.5} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}

              {settingsPage === "profile" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-8"
                >
                  <div className="flex flex-col gap-8">
                    <section className="flex flex-col gap-4">
                      <span className="text-[#666666] text-xs tracking-widest font-semibold block uppercase">Change Photo</span>
                      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col items-center gap-4">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden border border-[#222222] bg-[#111111]">
                          {user?.photoURL ? (
                             <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                             <div className="w-full h-full flex items-center justify-center text-white text-4xl font-bold">
                               {(user?.displayName || user?.email || "?").charAt(0).toUpperCase()}
                             </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = async (e: any) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                  showToast("Storage uplink pending configuration.");
                               }
                            };
                            input.click();
                          }}
                          className="px-6 py-2 bg-[#111111] border border-[#222222] text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:border-[#CCFF00]/50 transition-colors"
                        >
                          Upload New Context
                        </button>
                      </div>
                    </section>

                    <section className="flex flex-col gap-4">
                      <span className="text-[#666666] text-xs tracking-widest font-semibold block uppercase">Edit Name</span>
                      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col gap-4">
                        <input
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          className="bg-[#050505] border border-[#222222] rounded-xl p-4 text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                          placeholder="Enter display name"
                        />
                        <button
                          onClick={handleUpdateName}
                          className="w-full py-4 bg-[#CCFF00] text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-[#A3CC00] active:scale-95 transition-all outline-none rounded-xl"
                        >
                          Save Changes
                        </button>
                      </div>
                    </section>
                  </div>
                </motion.div>
              )}

              {settingsPage === "agent" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col">
                    <span className="text-[#666666] text-xs tracking-widest mb-3 font-semibold block mt-6">
                      ASSISTANT DEPLOYMENT
                    </span>
                    <div className="flex flex-col rounded-2xl md:bg-[#0A0A0A] md:border border-[#1A1A1A] overflow-hidden">
                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("blue-agent");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setAgentSettings((prev) => ({ ...prev, type: "blue" }));
                            triggerHaptic("medium");
                            setActivatingRow(null);
                          }, 300);
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "blue-agent" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "blue-agent" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] overflow-hidden flex items-center justify-center relative shrink-0 shadow-sm border border-[#222222]">
                             <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none" />
                             <div className="flex gap-1 items-center justify-center">
                               <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white]" />
                               <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white]" />
                             </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Protégé Blue
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Directorial Standard
                            </span>
                          </div>
                        </div>
                        {agentSettings.type === "blue" ? (
                           <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--theme-accent)]">Active</span>
                        ) : (
                           <ChevronRight className="text-[#444444] group-hover:text-white transition-colors" size={20} strokeWidth={1.5} />
                        )}
                      </motion.button>

                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("emoji-agent");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setAgentSettings((prev) => ({ ...prev, type: "emoji" }));
                            triggerHaptic("medium");
                            setActivatingRow(null);
                          }, 300);
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "emoji-agent" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "emoji-agent" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center shrink-0 shadow-sm border border-[#222222] relative overflow-hidden">
                             <div className="absolute inset-0 bg-yellow-500/10 pointer-events-none" />
                             <Smile className="w-5 h-5 text-yellow-500" strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Emoji Companion
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Dynamic Persona
                            </span>
                          </div>
                        </div>
                        {agentSettings.type === "emoji" ? (
                           <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--theme-accent)]">Active</span>
                        ) : (
                           <ChevronRight className="text-[#444444] group-hover:text-white transition-colors" size={20} strokeWidth={1.5} />
                        )}
                      </motion.button>
                      
                      <div className="w-full p-4 border-b border-[#1A1A1A] last:border-0 opacity-50 flex items-center justify-between cursor-not-allowed">
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center shrink-0 shadow-sm border border-[#222222] relative overflow-hidden grayscale">
                             <Ghost className="w-5 h-5 text-slate-400" strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-slate-400 tracking-wide leading-tight">
                              Ghost
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Coming Soon
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {settingsPage === "appearance" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-3 mt-6">
                      <span className="text-[#666666] text-xs tracking-widest font-semibold block uppercase">
                        WORKSPACE SCALING
                      </span>
                      <span className="text-xs font-mono" style={{ color: activeAccent }}>
                        {Math.round(fontScale * 100)}%
                      </span>
                    </div>

                    <div className="flex flex-col rounded-2xl md:bg-[#0A0A0A] md:border border-[#1A1A1A] overflow-hidden">
                      <div className="w-full p-6 border-b border-[#1A1A1A]">
                        <div className="flex items-center gap-4 sm:gap-6">
                          <motion.button
                            whileTap={{ scale: 0.95, borderColor: activeAccent }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (isSettingsScrolling.current) return;
                              setTimeout(() => {
                                if (isSettingsScrolling.current) return;
                                setFontScale((prev) => Math.max(0.7, prev - 0.05));
                              }, 300);
                            }}
                            className="w-12 h-12 rounded-lg bg-[#111111] flex items-center justify-center text-white shrink-0 shadow-sm border border-[#222222] transition-colors"
                          >
                            <ZoomOut size={20} strokeWidth={1.5} />
                          </motion.button>

                          <div className="flex-1 h-1.5 bg-[#222222] rounded-full overflow-hidden relative shadow-inner">
                            <motion.div
                              className="absolute inset-y-0 left-0"
                              style={{ backgroundColor: activeAccent }}
                              animate={{
                                width: `${((fontScale - 0.7) / (1.5 - 0.7)) * 100}%`,
                              }}
                              transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                          </div>

                          <motion.button
                            whileTap={{ scale: 0.95, borderColor: activeAccent }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (isSettingsScrolling.current) return;
                              setTimeout(() => {
                                if (isSettingsScrolling.current) return;
                                setFontScale((prev) => Math.min(1.5, prev + 0.05));
                              }, 300);
                            }}
                            className="w-12 h-12 rounded-lg bg-[#111111] flex items-center justify-center text-white shrink-0 shadow-sm border border-[#222222] transition-colors"
                          >
                            <ZoomIn size={20} strokeWidth={1.5} />
                          </motion.button>
                        </div>
                      </div>

                      <motion.button
                        whileTap={{ scale: 0.98, borderColor: activeAccent }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (isSettingsScrolling.current) return;
                          setTimeout(() => {
                            if (isSettingsScrolling.current) return;
                            setFontScale(1.0);
                          }, 300);
                        }}
                        className="w-full p-4 flex items-center justify-center hover:bg-[#111111] transition-colors border-t border-transparent"
                        style={{ borderTopColor: "transparent" }}
                      >
                        <motion.span 
                          whileTap={{ color: activeAccent }}
                          className="text-[11px] font-bold text-[#666666] tracking-widest uppercase hover:text-white transition-colors"
                        >
                          Restore System Baseline
                        </motion.span>
                      </motion.button>
                    </div>

                    <div className="mt-4 p-4 text-center">
                      <p className="text-[11px] text-[#666666] font-medium italic">
                        "True design is the clarity between space and intent. Adjusting the scale updates every relative viewport coordinate in real-time."
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col mt-8">
                    <span className="text-[#666666] text-xs tracking-widest font-semibold block uppercase mb-4">
                      ACCENT COLOR PROTOCOL
                    </span>
                    <div className="flex flex-row items-center gap-4 overflow-x-auto py-2 no-scrollbar">
                      {[
                        { color: "#00FF87", id: "neon-green" },
                        { color: "#2563EB", id: "cobalt-blue" },
                        { color: "#F43F5E", id: "neon-pink" },
                        { color: "#F59E0B", id: "amber" },
                        { color: "#E2E8F0", id: "ice-white" }
                      ].map((item) => {
                        const isLive = activatingAccent === item.color || (!activatingAccent && activeAccent === item.color);
                        return (
                          <motion.button
                            key={item.id}
                            whileTap={{ scale: 0.9 }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (isSettingsScrolling.current) return;
                              setActivatingAccent(item.color);
                              setTimeout(() => {
                                if (isSettingsScrolling.current) {
                                  setActivatingAccent(null);
                                  return;
                                }
                                setActiveAccent(item.color);
                                setActivatingAccent(null);
                              }, 300);
                            }}
                            className={`w-12 h-12 rounded-full shrink-0 transition-all ${
                              isLive 
                                ? "scale-105 border-2 border-white ring-2 ring-[#000000] z-10" 
                                : "scale-100 hover:scale-110 opacity-70 hover:opacity-100 border border-white/5"
                            }`}
                            style={{ backgroundColor: item.color }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {settingsPage === "haptics" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col">
                    <span className="text-[#666666] text-xs tracking-widest mb-3 font-semibold block mt-6">
                      FEEDBACK CONFIGURATION
                    </span>
                    <div className="flex flex-col rounded-2xl md:bg-[#0A0A0A] md:border border-[#1A1A1A] overflow-hidden">
                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("haptic-engine");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setAgentSettings((prev) => ({
                              ...prev,
                              hapticsEnabled: !prev.hapticsEnabled,
                            }));
                            if (!agentSettings.hapticsEnabled) {
                              if (typeof navigator !== "undefined" && navigator.vibrate) {
                                navigator.vibrate([10, 30, 50]);
                              }
                            }
                            setActivatingRow(null);
                          }, 300);
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "haptic-engine" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "haptic-engine" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center shrink-0 shadow-sm border border-[#222222]">
                            <Magnet size={18} className={agentSettings.hapticsEnabled ? "text-[var(--theme-accent)]" : "text-white"} strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Haptic Engine
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Toggle physical feedback across interface
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${agentSettings.hapticsEnabled ? "text-[var(--theme-accent)]" : "text-[#444444]"}`}>
                          {agentSettings.hapticsEnabled ? "Engaged" : "Disconnected"}
                        </span>
                      </motion.button>

                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("audio-output");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setAgentSettings((prev) => ({
                              ...prev,
                              soundEnabled: !prev.soundEnabled,
                            }));
                            if (!agentSettings.soundEnabled)
                              triggerHaptic("success");
                            setActivatingRow(null);
                          }, 300);
                        }}
                        className={`w-full p-4 border-b border-[#1A1A1A] last:border-0 transition-colors flex items-center justify-between group ${activatingRow === "audio-output" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "audio-output" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center shrink-0 shadow-sm border border-[#222222]">
                            {agentSettings.soundEnabled ? <Volume2 size={18} className="text-[var(--theme-accent)]" strokeWidth={2} /> : <VolumeX size={18} className="text-white" strokeWidth={2} />}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Audio Output
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Control contextual audio cues
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${agentSettings.soundEnabled ? "text-[var(--theme-accent)]" : "text-[#444444]"}`}>
                          {agentSettings.soundEnabled ? "Engaged" : "Disconnected"}
                        </span>
                      </motion.button>

                      {/* Agent Sleep Mode Toggle */}
                      <motion.button
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (isSettingsScrolling.current) return;
                          setActivatingRow("sleep-mode");
                          setTimeout(() => {
                            if (isSettingsScrolling.current) {
                              setActivatingRow(null);
                              return;
                            }
                            setAgentSettings((prev) => ({
                              ...prev,
                              sleepMode: !prev.sleepMode,
                            }));
                            setActivatingRow(null);
                          }, 300);
                        }}
                        className={`w-full p-4 transition-colors flex items-center justify-between group ${activatingRow === "sleep-mode" ? "bg-[#111111]" : "bg-transparent hover:bg-[#111111]"}`}
                        style={{ boxShadow: activatingRow === "sleep-mode" ? `inset 2px 0 0 ${activeAccent}` : undefined }}
                      >
                        <div className="flex items-center gap-4 text-left">
                          <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center shrink-0 shadow-sm border border-[#222222]">
                            {agentSettings.sleepMode ? <Moon size={18} className="text-[var(--theme-accent)]" strokeWidth={2} /> : <Sun size={18} className="text-white" strokeWidth={2} />}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[15px] font-bold text-white tracking-wide leading-tight">
                              Agent Low-Power/Sleep
                            </span>
                            <span className="text-[11px] text-[#666666] font-medium mt-0.5">
                              Disable all idle sounds and activity to save battery
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${agentSettings.sleepMode ? "text-[var(--theme-accent)]" : "text-[#444444]"}`}>
                          {agentSettings.sleepMode ? "Active" : "Disabled"}
                        </span>
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}

              {settingsPage === "api" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col">
                    <span className="text-[#666666] text-xs tracking-widest mb-3 font-semibold block mt-6">
                      NEURAL API ACCESS
                    </span>
                    <div className="flex flex-col rounded-2xl md:bg-[#0A0A0A] md:border border-[#1A1A1A] overflow-hidden p-4">
                      <div className="relative">
                        <input
                          type="password"
                          value={localApiKey}
                          onChange={(e) => setLocalApiKey(e.target.value)}
                          placeholder="Gemini Protocol Key"
                          className="w-full bg-[#111111] border border-[#222222] rounded-[10px] px-4 py-3 text-white text-[13px] sm:text-sm focus:outline-none focus:border-[#CCFF00] transition-colors font-mono tracking-widest placeholder:text-[#666666] placeholder:tracking-normal placeholder:font-sans"
                        />
                      </div>
                      <p className="text-[11px] sm:text-xs text-[#666666] font-medium italic mt-4 text-center">
                        "Verified channel required for high-throughput directorial analysis."
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {settingsPage === "storage" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-8"
                >
                  {/* Telemetry Header */}
                  <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                    <div className="flex justify-between items-end mb-4">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#444444] mb-1">Status Report</span>
                          <span className="text-xs font-bold text-white tracking-widest leading-none">
                            CLOUD VACANCY: <span className={cloudUsage > 800 * 1024 * 1024 ? "text-red-500" : "text-[var(--theme-accent)]"} style={{ "--theme-accent": activeAccent } as any}>{(cloudUsage / (1024 * 1024)).toFixed(2)} MB</span> / 1024 MB TOTAL
                          </span>
                       </div>
                       <HardDrive size={24} className="text-white/10" />
                    </div>
                    
                    {/* Linear Progress Meter */}
                    <div className="h-1.5 w-full bg-[#111111] rounded-full overflow-hidden border border-white/5">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${Math.min((cloudUsage / (1024 * 1024 * 1024)) * 100, 100)}%` }}
                         className="h-full bg-gradient-to-r from-[var(--theme-accent)] to-[#40ff00]"
                         style={{ "--theme-accent": activeAccent } as any}
                       />
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-2">
                     <span className="text-[10px] font-black uppercase tracking-widest text-[#444444]">Project Registry</span>
                     <button 
                       onClick={handlePurgeAllCloud}
                       className="bg-red-500/10 border border-red-500/20 text-[9px] font-black uppercase tracking-wider text-red-500 hover:bg-red-500 hover:text-white transition-all px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                     >
                       <Trash size={12} />
                       Purge All Cloud Data
                     </button>
                  </div>

                  {/* Cloud Project List */}
                  <div className="space-y-3">
                    {cloudProjectsList.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center border border-dashed border-[#222222] rounded-2xl">
                         <Cloud size={32} className="text-zinc-800 mb-4" />
                         <span className="text-[10px] uppercase font-black tracking-widest text-[#333333]">No Cloud Records Found</span>
                      </div>
                    ) : (
                      cloudProjectsList.map(cp => {
                        const isPending = pendingDeletions[cp.id] !== undefined;
                        
                        return (
                          <div 
                            key={cp.id}
                            className={`bg-[#0A0A0A] border rounded-xl p-4 flex items-center justify-between group transition-all duration-300 ${isPending ? 'border-red-500/50 bg-red-500/5' : 'border-[#1A1A1A] hover:border-[#333333]'}`}
                          >
                            {isPending ? (
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin" />
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase text-red-500 tracking-widest">Purging in {pendingDeletions[cp.id]}s</span>
                                    <span className="text-[9px] text-zinc-500 uppercase font-bold truncate max-w-[150px]">{cp.title}</span>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleUndoCloudDeletion(cp.id)}
                                  className="text-[10px] font-black text-white bg-[#111111] border border-[#222222] px-4 py-2 rounded-lg hover:bg-white hover:text-black transition-all"
                                >
                                  UNDO
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-col min-w-0">
                                   <span className="text-sm font-bold text-white truncate max-w-[200px]">{cp.title}</span>
                                   <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-tighter">
                                     {new Date(cp.updatedAt).toLocaleDateString()} • {cp.assets.length} ASSETS
                                   </span>
                                </div>
    
                                <motion.button 
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCloudProject(cp.id);
                                  }}
                                  className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all relative z-[100]"
                                >
                                  <Trash2 size={16} />
                                </motion.button>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}

              <div className="flex justify-center mt-12 pt-8 pb-12 overflow-hidden max-w-full border-t border-[#111111]">
                <div className="flex flex-col items-center gap-2 max-w-full w-full">
                  <span className="w-2 h-2 rounded-full block mb-1" style={{ backgroundColor: activeAccent, boxShadow: `0 0 10px ${activeAccent}` }}></span>
                  <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-[0.4em] whitespace-nowrap px-1 max-w-full truncate text-center" style={{ color: activeAccent, opacity: 0.5 }}>Directorial Terminal V4.0.7</span>
                  <div className="w-24 h-1 bg-white/20 rounded-full mt-4"></div>
                </div>
              </div>
            </div>
          </div>

          <footer className="p-8 text-center opacity-10 flex flex-col items-center">
            <div className="w-8 h-[1px] bg-white mb-4" />
            <span className="text-[10px] font-black uppercase tracking-[1em] text-white">
              Directorial Terminal v4.0.7
            </span>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (viewMode === "dashboard") {
    return (
      <div className="fixed inset-0 bg-black text-slate-100 font-sans overflow-y-auto overflow-x-hidden no-scrollbar pb-24 selection:bg-[var(--theme-accent)]/30" style={{ "--theme-accent": activeAccent } as React.CSSProperties}>
        <div className="relative z-10 w-full max-w-[1440px] mx-auto flex flex-col min-h-screen">
          {/* Header */}
          <header className="sticky top-0 z-[110] w-full bg-black/80 backdrop-blur-3xl transition-all duration-500 overflow-hidden">
            <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pt-10 pb-4 flex items-center justify-between">
              <div className="flex flex-col">
                <h1 className="text-[28px] md:text-5xl font-black font-display tracking-tight text-white leading-none mix-blend-screen">
                  STUDIO<span className="text-[#CCFF00]">RIPE</span>
                </h1>
              </div>

              <div className="flex items-center gap-6">
                <UserAvatarButton
                  onClick={() => {
                    setSettingsPage("main");
                    setIsSettingsOpen(true);
                  }}
                  className="relative z-[9999999]"
                />
              </div>
            </div>
          </header>

          {/* Top Video Template Carousel - Virtual Infinite Loop */}
          <div className="w-full pt-2 md:pt-4 pb-8 md:pb-12 flex flex-col items-center overflow-hidden">
            <div
              className="relative w-full h-[320px] md:h-[450px] flex items-center justify-center pointer-events-auto group/carousel touch-pan-y"
              onMouseEnter={handleTemplateInteraction}
              onTouchStart={handleTemplateInteraction}
              onScroll={handleTemplateInteraction}
              style={{ transform: "translateZ(0)", touchAction: "pan-y" }}
            >
              {/* LIQUID MOTION VIRTUALIZATION: Use fixed indices to ensure zero-jump coordinate mapping */}
              {Array.from({ length: 101 }, (_, i) => i - 50).map((idx) => {
                const total = TEMPLATES.length;
                const spacing = windowWidth >= 768 ? 260 : 170;

                // Position is strictly mapping idx to activeTemplate without rounding jumps
                const x = (idx - activeTemplate) * spacing;
                const absOffset = Math.abs(idx - activeTemplate);

                // Only render items near the viewport center
                if (absOffset > 5) return null;

                const tplIndex = ((idx % total) + total) % total;
                const tpl = TEMPLATES[tplIndex];

                const isActive = absOffset < 0.5;
                const scale = 1 - absOffset * 0.15; // if offset is 1, scale is 0.85
                const opacity = 1 - absOffset * 0.5; // if offset is 1, opacity is 0.50
                const zIndex = 100 - Math.floor(absOffset * 10);

                return (
                  <motion.div
                    key={idx} // Strictly stable key for smooth position lifecycle
                    onClick={() => {
                      if (isActive && tpl.type === "video") {
                        setIsAgentMode(true);
                        setAgentMessages([
                          {
                            role: "model",
                            text: `Template initialized: ${tpl.title}. Upload session assets to begin the audit.`,
                          },
                        ]);
                      } else {
                        setActiveTemplate(idx);
                      }
                      handleTemplateInteraction();
                    }}
                    initial={false}
                    animate={{ x, scale, opacity, zIndex }}
                    transition={{
                      type: "spring",
                      stiffness: 350,
                      damping: 34,
                      mass: 0.8,
                      restDelta: 0.005,
                      restSpeed: 0.005,
                    }}
                    style={{
                      willChange: "transform, opacity",
                      backfaceVisibility: "hidden",
                      transformStyle: "preserve-3d",
                      WebkitFontSmoothing: "antialiased",
                    }}
                    className={`absolute w-[220px] h-[330px] md:w-[320px] md:h-[450px] rounded-[2rem] md:rounded-[2.5rem] overflow-hidden shadow-2xl bg-[#1A1A1A] cursor-pointer group
                      ${isActive ? "opacity-100 z-50" : "opacity-50 grayscale-[50%] blur-[1px]"}
                    `}
                  >
                    <div className="absolute inset-0 scale-[1.01] rounded-[inherit] overflow-hidden">
                      {tpl.type === "video" ? (
                        <TemplateVideo
                          src={tpl.src || undefined}
                          isActive={isActive}
                          absOffset={absOffset}
                          className=""
                        />
                      ) : (
                        <img
                          src={tpl.src || undefined}
                          alt={tpl.title}
                          className="w-full h-full object-cover"
                        />
                      )}

                      {/* Depth Overlays */}
                      <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

                      <div className="absolute inset-x-0 bottom-12 md:bottom-20 flex flex-col items-center justify-end z-10 px-8 text-center pointer-events-none">
                        <span className="font-black text-[28px] md:text-4xl text-white font-display leading-[0.9] tracking-tight">
                          {tpl.title
                            .toUpperCase()
                            .split(" ")
                            .map((word, i) => (
                              <React.Fragment key={i}>
                                {word}
                                {i < tpl.title.split(" ").length - 1 && <br />}
                              </React.Fragment>
                            ))}
                        </span>
                      </div>

                      {isActive && (
                        <>
                          <div className="absolute bottom-0 left-0 right-0 h-4 bg-[#CCFF00] shadow-[0_0_40px_rgba(204,255,0,0.4)] z-20 rounded-b-[inherit] mask-bottom" />
                        </>
                      )}

                      {/* Glass Finish */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none mix-blend-overlay" />
                    </div>
                  </motion.div>
                );
              })}

              {/* Navigation Arrows */}
              <AnimatePresence>
                {showTemplateArrows && (
                  <>
                    <motion.button
                      initial={{ opacity: 0, x: -20 }}
                      animate={{
                        opacity: 1,
                        x: 0,
                        scale: [1, 1.05, 1],
                      }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{
                        opacity: { duration: 0.4 },
                        scale: {
                          repeat: Infinity,
                          duration: 2,
                          ease: "easeInOut",
                        },
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9, transition: { duration: 0.05 } }}
                      onClick={handlePrevTemplate}
                      className="absolute left-4 md:left-12 z-[110] w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#1A1A1A]/80 backdrop-blur-xl border border-[#CCFF00]/30 flex items-center justify-center text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-colors shadow-[0_0_20px_rgba(204,255,0,0.1)] group/nav"
                    >
                      <ChevronLeft className="w-6 h-6 md:w-8 md:h-8 group-hover/nav:scale-110 transition-transform" />
                    </motion.button>

                    <motion.button
                      initial={{ opacity: 0, x: 20 }}
                      animate={{
                        opacity: 1,
                        x: 0,
                        scale: [1, 1.05, 1],
                      }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{
                        opacity: { duration: 0.4 },
                        scale: {
                          repeat: Infinity,
                          duration: 2,
                          ease: "easeInOut",
                        },
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9, transition: { duration: 0.05 } }}
                      onClick={handleNextTemplate}
                      className="absolute right-4 md:right-12 z-[110] w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#1A1A1A]/80 backdrop-blur-xl border border-[#CCFF00]/30 flex items-center justify-center text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-colors shadow-[0_0_20px_rgba(204,255,0,0.1)] group/nav"
                    >
                      <ChevronRight className="w-6 h-6 md:w-8 md:h-8 group-hover/nav:scale-110 transition-transform" />
                    </motion.button>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-3 mt-6 md:mt-8">
              {TEMPLATES.map((_, i) => {
                const total = TEMPLATES.length;
                const currentActual =
                  ((activeTemplate % total) + total) % total;
                const isSelected = i === Math.round(currentActual);

                return (
                  <div
                    key={i}
                    onClick={() => {
                      const closest =
                        Math.round((activeTemplate - i) / total) * total + i;
                      setActiveTemplate(closest);
                    }}
                    className={`h-1.5 rounded-full transition-all duration-700 cursor-pointer ${
                      isSelected
                        ? "w-10 md:w-16 bg-[#CCFF00] shadow-[0_0_15px_rgba(204,255,0,0.5)]"
                        : "w-8 md:w-12 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="w-full h-8" />

          {/* Projects Collection Section */}
          <div className="flex-1 w-full max-w-4xl mx-auto px-4 md:px-8 pb-40 relative">
            <div className="mb-6 flex flex-col justify-between border-b border-white/[0.05] pb-4">
              <span className="text-[10px] font-medium uppercase tracking-widest mb-1.5 text-left" style={{ color: activeAccent, opacity: 0.7 }}>
                Historical Records
              </span>
              <div className="flex items-center justify-between">
                <h3 className="text-[28px] md:text-3xl font-bold tracking-tight text-white font-display">
                  Active Projects
                </h3>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#CCFF00] flex items-center justify-center text-black font-black text-sm relative">
                    {projects.length.toString().padStart(2, "0")}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[8px] font-bold text-[#CCFF00] uppercase tracking-widest leading-none">
                      Saved
                    </span>
                    <span className="text-[8px] font-bold text-[#CCFF00] uppercase tracking-widest leading-none mt-0.5">
                      Nodes
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center rounded-[2rem] border border-[#CCFF00]/20 bg-[#CCFF00]/[0.02] text-center shadow-[0_0_50px_rgba(204,255,0,0.03)] mx-1">
                <div className="mb-6 opacity-90">
                  <Film
                    className="w-14 h-14 text-[#CCFF00]"
                    strokeWidth={1.5}
                  />
                </div>
                <h4 className="text-xl font-bold font-display text-white mb-3">
                  No active projects yet
                </h4>
                <p className="text-[15px] text-slate-400 leading-relaxed max-w-[200px]">
                  Start a new session to bring your ideas to life.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-6">
                <AnimatePresence mode="popLayout">
                  {projects.map((project) => (
                    <motion.div
                      key={project.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    >
                      <ProjectCard
                        project={project}
                        onOpen={() => openProject(project)}
                        onDelete={() => handleDeleteProject(project.id)}
                        onRename={() => handleRenameProject(project)}
                        activeAccent={activeAccent}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Floating Action: New Project - Bottom Pill */}
        <AnimatePresence>
          {!isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-8 inset-x-0 z-[100] pointer-events-none"
            >
              <div className="w-full max-w-4xl mx-auto px-4 md:px-8 pointer-events-auto">
                <button
                  onClick={handleNewProject}
                  className="w-full h-[68px] flex items-center justify-center gap-2.5 rounded-full bg-[#CCFF00] text-black transition-all duration-300 hover:bg-[#D4FF33] active:scale-[0.98] group shadow-[0_10px_35px_rgba(204,255,0,0.15)] ring-1 ring-[#CCFF00]/50"
                >
                  <Plus className="w-5 h-5 stroke-[2.5] group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-[15px] tracking-widest uppercase">
                    New project
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {deletedProjectInfo && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: "-50%", scale: 0.95 }}
              animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
              exit={{ opacity: 0, y: 10, x: "-50%", scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="fixed bottom-[116px] left-1/2 z-[200] bg-[#111111] border border-[#222222] px-5 py-3 rounded-xl flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.5)] w-[calc(100%-48px)] md:w-[450px]"
            >
              <div className="flex flex-col min-w-0 pr-4">
                <span className="text-white text-sm font-semibold truncate tracking-wide">
                  {deletedProjectInfo.project.title}
                </span>
                <span className="text-[#666666] text-[10px] tracking-widest uppercase mt-0.5">
                  Project Deleted
                </span>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleUndoDelete}
                className="relative flex items-center justify-center w-[46px] h-[46px] flex-shrink-0 bg-transparent rounded-full hover:bg-white/5 transition-colors group cursor-pointer"
              >
                <span className="text-white font-bold text-[9px] tracking-wider uppercase z-10 transition-colors group-hover:text-white/80">
                  Undo
                </span>
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 48 48">
                  <circle
                    cx="24"
                    cy="24"
                    r="22"
                    fill="none"
                    stroke="#222222"
                    strokeWidth="2"
                  />
                  <motion.circle
                    cx="24"
                    cy="24"
                    r="22"
                    fill="none"
                    stroke="#CCFF00"
                    strokeWidth="2"
                    strokeDasharray="138"
                    initial={{ strokeDashoffset: 0 }}
                    animate={{ strokeDashoffset: 138 }}
                    transition={{ duration: 5, ease: "linear" }}
                  />
                </svg>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Shared Overlays in Dashboard (Settings / Toast) --- */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -50, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -50, x: "-50%" }}
              className="fixed top-8 left-1/2 z-[200] bg-orange-600/90 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-[0_0_30px_rgba(234,88,12,0.4)] backdrop-blur-md border border-white/20 whitespace-nowrap overflow-hidden text-ellipsis liquid-glass"
            >
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {renderSettings()}

        <StorageChoiceModal
          isOpen={isStorageChoiceOpen}
          onClose={() => setIsStorageChoiceOpen(false)}
          onConfirm={confirmNewProject}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 font-sans overflow-hidden select-none flex" style={{ "--theme-accent": activeAccent } as React.CSSProperties}>
      <FloatingAgent
        onClick={() => setIsAgentMode(true)}
        isVisible={
          viewMode === "board" &&
          isToolbarExpanded &&
          !isAgentMode
        }
        type={agentSettings.type}
        soundEnabled={agentSettings.soundEnabled}
        hapticsEnabled={agentSettings.hapticsEnabled}
        sleepMode={agentSettings.sleepMode}
        currentProjectTitle={currentProject?.title}
        lastMessage={agentMessages[agentMessages.length - 1]?.text}
      />
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -50, x: "-50%" }}
            className="fixed top-8 left-1/2 z-[200] bg-orange-600/90 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-[0_0_30px_rgba(234,88,12,0.4)] backdrop-blur-md border border-white/20 whitespace-nowrap overflow-hidden text-ellipsis"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {renderSettings()}

      {/* --- Left Sidebar: Director's Agent --- */}
      <AnimatePresence>
        {isAgentMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 bg-slate-950 flex flex-col z-[100]"
          >
            <div className="p-5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
              <div className="flex flex-col">
                <h2 className="text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">
                  Director's Agent
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">
                    Audit Active
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsAgentMode(false)}
                className="p-2 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-lg transition-colors"
                title="Exit Agent Mode"
              >
                <X size={20} />
              </button>
            </div>

            <div
              ref={agentScrollRef}
              className="flex-1 p-5 overflow-y-auto space-y-6 scrollbar-hide bg-[radial-gradient(circle_at_top_left,rgba(30,58,138,0.05),transparent)]"
            >
              <div className="max-w-3xl mx-auto w-full space-y-6">
                {agentMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed shadow-sm ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-tr-none"
                          : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_li]:mb-1 [&_strong]:text-slate-100"
                      }`}
                    >
                      {msg.role === "model" ? (
                        <div className="markdown-body">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                    {msg.assets && msg.assets.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 w-full max-w-[90%]">
                        {msg.assets.map((asset) => (
                          <div
                            key={asset.id}
                            className="relative group overflow-hidden bg-transparent flex items-center justify-center"
                            style={{
                              aspectRatio: asset.width && asset.height ? `${asset.width} / ${asset.height}` : "16/9"
                            }}
                          >
                            {asset.type === "video" ? (
                              <div className="w-full h-full flex items-center justify-center bg-black/40">
                                <Film className="w-8 h-8 text-slate-500" />
                              </div>
                            ) : (
                              <img
                                src={asset.url || undefined}
                                className="w-full h-full object-contain"
                              />
                            )}
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-300">
                              <p className="text-[10px] text-slate-400 mb-2 font-medium px-2 text-center line-clamp-1">
                                {asset.name}
                              </p>
                              <button
                                onClick={() => approveAsset(asset)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase transition-all scale-90 group-hover:scale-100 shadow-lg"
                              >
                                Approve For Gallery
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {isAgentTyping && (
                  <div className="flex items-center gap-2 text-slate-500">
                    <div className="flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-blue-500/50 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur-xl">
              <div className="max-w-3xl mx-auto w-full flex items-end gap-3 bg-slate-900/50 border border-slate-800 rounded-2xl p-2 focus-within:border-blue-500/50 transition-all shadow-inner">
                <button
                  onClick={() => agentFileInputRef.current?.click()}
                  className="p-2 text-slate-500 hover:text-white bg-white/5 backdrop-blur-xl hover:bg-white/10 rounded-xl transition-all border border-white/5 hover:border-blue-400/30 group relative overflow-hidden"
                  title="Upload to Agent"
                >
                  <div className="relative z-10">
                    <Plus size={20} />
                  </div>
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity" />
                </button>
                <textarea
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendAgentMessage();
                    }
                  }}
                  placeholder="Ask Agent to audit..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-[13px] py-2 resize-none max-h-32 text-slate-200 placeholder:text-slate-600"
                  rows={1}
                />
                <button
                  onClick={sendAgentMessage}
                  disabled={!agentInput.trim() || isAgentTyping}
                  className={`p-2 transition-all relative overflow-hidden group rounded-xl
                    ${
                      !agentInput.trim() || isAgentTyping
                        ? "bg-blue-600/5 text-slate-700 cursor-not-allowed opacity-30"
                        : "bg-blue-500/20 backdrop-blur-xl border border-blue-400/30 text-blue-400 hover:bg-blue-500/30 shadow-lg"
                    }
                  `}
                >
                  <div className="relative z-10">
                    <Send size={18} />
                  </div>
                  {!(!agentInput.trim() || isAgentTyping) && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent opacity-50 pointer-events-none" />
                      <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 animate-[shine_3s_infinite] pointer-events-none" />
                    </>
                  )}
                </button>
              </div>
              <input
                type="file"
                ref={agentFileInputRef}
                onChange={handleAgentUpload}
                className="hidden"
                multiple
                accept="image/*,video/mp4"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Toggle */}
      <div className="fixed top-8 right-8 z-[9999999]" style={{ pointerEvents: "auto" }}>
        <UserAvatarButton
          onClick={() => {
            setSettingsPage("main");
            setIsSettingsOpen(true);
          }}
          className="shadow-lg"
        />
      </div>

      {/* --- Main Board --- */}
      {viewMode === "board" && (
        <div className="flex-1 relative w-full h-full bg-slate-950">
          {/* Floating Toolbar (Transparent Liquid Glass) - Centered at the top */}
          <motion.div
            layout
            className={`fixed top-[32px] left-1/2 -translate-x-1/2 z-50 transition-all duration-700
              ${isToolbarExpanded ? "opacity-100 scale-100" : "opacity-0 scale-50 pointer-events-none"}
            `}
            style={{ transformOrigin: "center" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={(e, info) => {
              if (Math.abs(info.offset.x) > 40) {
                setIsToolbarExpanded(false);
              }
            }}
          >
            <div
              className={`backdrop-blur-[2px] rounded-[48px] px-[12px] py-[12px] w-[95vw] max-w-[95vw] sm:max-w-[800px] transition-transform duration-300 box-border overflow-hidden
                ${
                  arrangeStatus === "scanning_yellow"
                    ? "bg-[#FACC15]/20 border border-[#FACC15]/50 shadow-[0_20px_40px_rgba(250,204,21,0.3),0_0_20px_rgba(250,204,21,0.2)]"
                    : arrangeStatus === "scanning_green"
                      ? "bg-[#00FF7F]/20 border border-[#00FF7F]/50 shadow-[0_20px_40px_rgba(0,255,127,0.3),0_0_20px_rgba(0,255,127,0.2)]"
                      : "bg-white/[0.05] border border-emerald-500/30 shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_15px_rgba(16,185,129,0.15)]"
                }
              `}
              style={{ transformOrigin: "center" }}
            >
              {/* Flex Toolbar - 7 Buttons, uniform circular */}
              <div className="flex flex-nowrap justify-between items-center sm:gap-[8px]">
                <button
                  onClick={() => setViewMode("dashboard")}
                  className="w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full liquid-glass flex items-center justify-center transition-all active:scale-90 border-white/5 group sm:translate-y-1 ml-[8px] sm:ml-0"
                  title="Home"
                >
                  <Home
                    size={26}
                    strokeWidth={2}
                    color="#00FF7F"
                    className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                </button>

                <button
                  onClick={undo}
                  disabled={past.length === 0}
                  className="w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full liquid-glass flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border-white/5 group sm:-translate-y-1"
                  title="Undo"
                >
                  <Undo2
                    size={26}
                    strokeWidth={2}
                    color="#00FF7F"
                    className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                </button>

                <button
                  onClick={redo}
                  disabled={future.length === 0}
                  className="w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full liquid-glass flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border-white/5 group sm:-translate-y-3"
                  title="Redo"
                >
                  <Redo2
                    size={26}
                    strokeWidth={2}
                    color="#00FF7F"
                    className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-[14vw] h-[14vw] max-w-[56px] max-h-[56px] shrink-0 max-[500px]:-translate-y-[5px] sm:w-[68px] sm:h-[68px] sm:max-w-none sm:max-h-none sm:-translate-y-[16px] rounded-full liquid-glass flex items-center justify-center transition-all active:scale-90 border-white/5 sm:mx-1 group shadow-[0_0_15px_rgba(0,255,127,0.2)] relative z-10"
                  title="Add Media"
                >
                  <Plus
                    size={32}
                    strokeWidth={2.5}
                    color="#00FF7F"
                    className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity"
                  />
                </button>

                <button
                  onClick={() => {
                    const next = !isLayoutLocked;
                    setIsLayoutLocked(next);
                    if (next) autoArrange();
                  }}
                  className={`w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full transition-all duration-500 flex items-center justify-center relative overflow-hidden group sm:-translate-y-3
                    liquid-glass border-white/5 ${isLayoutLocked ? "shadow-[0_0_15px_rgba(0,255,127,0.2)]" : ""}
                  `}
                  title={isLayoutLocked ? "Unlock Layout" : "Lock Layout"}
                >
                  <motion.div
                    animate={showLockHint ? { y: [0, -5, 0] } : {}}
                    transition={{
                      duration: 0.5,
                      repeat: showLockHint ? Infinity : 0,
                    }}
                  >
                    {isLayoutLocked ? (
                      <Lock
                        size={26}
                        strokeWidth={2}
                        color="#00FF7F"
                        className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)]"
                      />
                    ) : (
                      <Unlock
                        size={26}
                        strokeWidth={2}
                        color="#00FF7F"
                        className="drop-shadow-[0_0_5px_rgba(0,255,127,0.4)] opacity-70"
                      />
                    )}
                  </motion.div>
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none opacity-20" />
                </button>

                <button
                  onClick={handleAutoArrange}
                  className={`w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full transition-all duration-300 flex items-center justify-center relative overflow-hidden group border-white/5 sm:-translate-y-1
                    liquid-glass ${arrangeStatus === "error" ? "shadow-[0_0_20px_rgba(255,48,80,0.4)] border-red-500/30" : arrangeStatus === "success" ? "shadow-[0_0_20px_rgba(0,255,127,0.4)] border-[#00FF7F]/30" : ""}
                  `}
                  title="Auto Arrange"
                >
                  <motion.div
                    animate={
                      arrangeStatus === "scanning_yellow" ||
                      arrangeStatus === "scanning_green"
                        ? { scale: [1, 1.15, 1] }
                        : arrangeStatus === "error"
                          ? { x: [-4, 4, -4, 4, 0] }
                          : { rotate: 0, scale: 1, x: 0 }
                    }
                    transition={
                      arrangeStatus === "scanning_yellow" ||
                      arrangeStatus === "scanning_green"
                        ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
                        : arrangeStatus === "error"
                          ? { duration: 0.4, ease: "easeInOut" }
                          : { duration: 0.3 }
                    }
                    className="relative z-20"
                  >
                    <Magnet
                      size={26}
                      strokeWidth={2}
                      color={arrangeStatus === "error" ? "#FF3050" : "#00FF7F"}
                      className={
                        arrangeStatus === "error"
                          ? "drop-shadow-[0_0_8px_rgba(255,48,80,0.8)]"
                          : "drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100"
                      }
                    />
                  </motion.div>

                  <div
                    className={`absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none transition-opacity duration-300 z-10 ${arrangeStatus !== "idle" ? "opacity-0" : "opacity-20"}`}
                  />
                </button>

                <button
                  onClick={() => setViewMode("playback")}
                  disabled={assets.length === 0}
                  className="w-[12vw] h-[12vw] mr-[8px] sm:mr-0 max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full bg-gradient-to-tr from-[#FF8800] to-[#FFAA00] shadow-[0_0_20px_rgba(255,136,0,0.6)] flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border-transparent relative overflow-hidden group hover:shadow-[0_0_30px_rgba(255,136,0,0.8)] sm:translate-y-1"
                  title="Play"
                >
                  <Play
                    size={26}
                    fill="white"
                    color="white"
                    className="ml-[2px]"
                  />
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
                </button>
              </div>
            </div>
          </motion.div>

          {/* Mini Reveal Button (When toolbar hidden) */}
          <AnimatePresence>
            {!isToolbarExpanded && (
              <motion.button
                initial={{ opacity: 0, y: -20, scale: 0.5 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.5 }}
                onClick={() => setIsToolbarExpanded(true)}
                className="fixed top-[32px] left-1/2 -translate-x-1/2 z-50 w-[64px] h-[64px] rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:scale-110 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10"
                title="Restore Control Deck"
              >
                <div className="flex flex-col items-center gap-[4px] opacity-80">
                  <div className="w-[20px] h-[3px] bg-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
                  <div className="w-[20px] h-[3px] bg-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
                  <div className="w-[20px] h-[3px] bg-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]" />
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Canvas Wrapper */}
          <div
            ref={canvasRef}
            className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={(e) => {
              // Clear selection if clicking background
              if (e.target === canvasRef.current) {
                setSwapSourceId(null);
                setHoveredAssetId(null);
              }
              // Always allow panning in locked mode, or if clicking the background
              if (isLayoutLocked || e.target === canvasRef.current) {
                setIsPanning(true);
              }
            }}
            onPointerUp={() => setIsPanning(false)}
            onPointerMove={(e) => {
              if (isPanning && !isMultiTouch) {
                setTransform((prev) => ({
                  ...prev,
                  x: prev.x + e.movementX,
                  y: prev.y + e.movementY,
                }));
              }
            }}
            onTouchStart={(e) => {
              // Prevent browser default zoom/scroll behavior
              if (e.touches.length >= 2) {
                setIsPanning(false);
              }
              if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const distance = Math.hypot(
                  touch1.pageX - touch2.pageX,
                  touch1.pageY - touch2.pageY,
                );
                const focalX = (touch1.pageX + touch2.pageX) / 2;
                const focalY = (touch1.pageY + touch2.pageY) / 2;

                const target = e.currentTarget as any;
                target._initialPinchDist = distance;
                target._initialFocalX = focalX;
                target._initialFocalY = focalY;
                target._startTransform = { ...transform };
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2) {
                const target = e.currentTarget as any;
                if (!target._initialPinchDist) return;

                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const distance = Math.hypot(
                  touch1.pageX - touch2.pageX,
                  touch1.pageY - touch2.pageY,
                );

                const startZoom = target._startTransform.zoom;
                const startX = target._startTransform.x;
                const startY = target._startTransform.y;
                const anchorX = target._initialFocalX;
                const anchorY = target._initialFocalY;

                const ratio = distance / target._initialPinchDist;
                const newZoom = Math.min(Math.max(startZoom * ratio, 0.2), 3);

                setTransform({
                  zoom: newZoom,
                  // Fixed-point zoom formula around the initial focal point
                  // Ensures the point under the fingers at the start of the pinch stays stationary
                  x: anchorX - (anchorX - startX) * (newZoom / startZoom),
                  y: anchorY - (anchorY - startY) * (newZoom / startZoom),
                });
              }
            }}
            onTouchEnd={() => {
              const target = canvasRef.current as any;
              if (target) {
                target._initialPinchDist = null;
                target._initialFocalX = null;
                target._initialFocalY = null;
                target._startTransform = null;
              }
            }}
          >
            {/* Infinite Grid Background */}
            <div
              className="absolute inset-0 pointer-events-none opacity-15"
              style={{
                backgroundImage:
                  "radial-gradient(#94a3b8 1px, transparent 1px)",
                backgroundSize: "40px 40px",
                backgroundPosition: `${transform.x}px ${transform.y}px`,
              }}
            />

            {/* Assets Container */}
            <motion.div
              className={`absolute inset-0 origin-top-left ${isMultiTouch ? "pointer-events-none" : "pointer-events-auto"}`}
              animate={{
                x: transform.x,
                y: transform.y,
                scale: transform.zoom,
              }}
              transition={{ duration: 0 }}
            >
              {assets.map((asset: Asset) => (
                <DraggableAsset
                  key={asset.id}
                  asset={asset}
                  onRemove={() => handleRequestDelete(asset.id)}
                  onSelectForDelete={handleSelectForDelete}
                  isDeleteSelected={deleteSelection.includes(asset.id)}
                  isDeleteModeActive={deleteSelection.length > 0}
                  onUpdate={(x, y, rotation) =>
                    updateAssetPos(asset.id, x, y, rotation)
                  }
                  onAssetChange={updateAssetData}
                  onSwap={swapSequence}
                  isHovered={hoveredAssetId === asset.id}
                  isLocked={isLayoutLocked}
                  setHoveredTarget={setHoveredAssetId}
                  swapSourceId={swapSourceId}
                  setSwapSourceId={setSwapSourceId}
                  lastSwappedId={lastSwappedId}
                  zoom={transform.zoom}
                  isMultiTouch={isMultiTouch}
                  width={layoutConfig.colWidth}
                  triggerHaptic={triggerHaptic}
                  activeAccent={activeAccent}
                  isUploaded={uploadedAssetIds.includes(asset.id)}
                  uploadStatus={assetUploadStatuses[asset.id]}
                />
              ))}
            </motion.div>
          </div>

          {/* Tutorial / Empty State */}
          {assets.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
              <Upload className="w-16 h-16 mb-4 opacity-20 text-blue-500" />
              <h3 className="text-lg font-medium text-slate-300 mb-2 tracking-wide">
                Audit Bench Empty
              </h3>
              <p className="text-sm">Drag files here or click + to upload</p>
              <p className="text-[10px] uppercase tracking-widest mt-3 opacity-50 text-blue-400">
                Cinematic Inspection Ready
              </p>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept="image/*,video/mp4"
            className="hidden"
          />

          {/* Footer Stats */}
          <footer className="absolute bottom-4 left-4 z-50 flex items-center gap-4">
            <span className="text-[10px] text-slate-500 uppercase tracking-tighter">
              Assets: {assets.length} • Screen: Pixel 7 Optimized
            </span>
          </footer>
        </div>
      )}

      {/* --- TELEMETRY COMPANION DEPLOYMENT OVERLAY --- */}
      <AnimatePresence>
        {isDeployOverlayOpen && (
          <DeploymentSequenceOverlay 
            isOpen={isDeployOverlayOpen}
            onClose={() => setIsDeployOverlayOpen(false)}
            currentProject={currentProject}
            assets={assets}
            uploadedAssetIds={uploadedAssetIds}
            onUploadSuccess={refreshUploadedAssets}
            setAssetUploadStatuses={setAssetUploadStatuses}
          />
        )}
      </AnimatePresence>

      {/* --- Fullscreen Playback --- */}
      <AnimatePresence>
        {viewMode === "playback" && sortedAssets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          >
            {/* Playback Controls Layer */}
            <div
              className="absolute inset-0 z-10 flex cursor-pointer"
              onClick={handlePlaybackClick}
            >
              <div className="w-[30%] h-full group flex items-center justify-start pl-8 opacity-0 hover:opacity-100 transition-opacity">
                <div className="p-3 bg-white/10 rounded-full backdrop-blur-md">
                  <ChevronLeft size={32} />
                </div>
              </div>
              <div className="w-[40%] h-full" />
              <div className="w-[30%] h-full group flex items-center justify-end pr-8 opacity-0 hover:opacity-100 transition-opacity">
                <div className="p-3 bg-white/10 rounded-full backdrop-blur-md">
                  <ChevronRight size={32} />
                </div>
              </div>
            </div>

            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 z-20 flex flex-col p-4 gap-2 bg-gradient-to-b from-black/60 to-transparent">
              {/* Progress Bar Container */}
              <div className="flex gap-1">
                {sortedAssets.map((asset, idx) => (
                  <div
                    key={asset.id}
                    className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden"
                  >
                    <motion.div
                      className="h-full bg-white"
                      initial={{ width: 0 }}
                      animate={{
                        width:
                          idx === currentIndex
                            ? "100%"
                            : idx < currentIndex
                              ? "100%"
                              : "0%",
                      }}
                      transition={{
                        duration:
                          idx === currentIndex
                            ? sortedAssets[currentIndex].type === "video"
                              ? 0
                              : 5
                            : 0.3,
                        ease: "linear",
                      }}
                      onAnimationComplete={() => {
                        // For images, we might want auto-advance
                        // if (idx === currentIndex && sortedAssets[currentIndex].type === 'image') {
                        //   nextSlide();
                        // }
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-white mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 bg-indigo-600 rounded">
                    {sortedAssets[currentIndex]?.sequence}
                  </span>
                  <span className="text-sm font-medium truncate max-w-[200px]">
                    {sortedAssets[currentIndex]?.name}
                  </span>
                </div>
                <button
                  onClick={() => setViewMode("board")}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Main Content */}
            <div className="w-full h-full flex items-center justify-center p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={sortedAssets[currentIndex]?.id || "empty"}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="max-w-full max-h-full flex items-center justify-center relative"
                >
                  {/* Background Loader */}
                  <div className="absolute inset-0 flex items-center justify-center text-white/10 -z-10">
                    {sortedAssets[currentIndex]?.type === "video" ? (
                      <Film size={64} />
                    ) : (
                      <ImageIcon size={64} />
                    )}
                  </div>

                  {sortedAssets[currentIndex]?.type === "image" ? (
                    <img
                      src={sortedAssets[currentIndex].url || undefined}
                      alt="story"
                      decoding="async"
                      className="max-w-full max-h-[85vh] object-contain"
                    />
                  ) : sortedAssets[currentIndex]?.type === "video" ? (
                    <SmartVideo
                      src={sortedAssets[currentIndex].url || undefined}
                      autoPlay
                      loop
                      muted={false}
                      onEnded={nextSlide}
                      className="max-w-full max-h-[85vh] object-contain"
                      playsInline
                    />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="liquid-glass rounded-[2rem] p-8 w-full max-w-sm relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-white/[0.05] pointer-events-none" />
              <h3 className="text-2xl font-black mb-2 text-white tracking-tight">
                Delete Assets
              </h3>
              <p className="text-slate-400 text-[13px] leading-relaxed mb-8">
                You have multiple assets selected for deletion. Do you want to
                delete just this asset, or delete all {deleteSelection.length}{" "}
                selected assets?
              </p>
              <div className="flex flex-col gap-3 relative z-10">
                <button
                  onClick={() => handleConfirmDelete("all")}
                  className="bg-indigo-600/20 backdrop-blur-xl hover:bg-indigo-600/30 text-indigo-100 font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 border border-indigo-500/40 shadow-lg active:scale-95 group"
                >
                  <Trash2
                    size={20}
                    className="group-hover:rotate-12 transition-transform"
                  />
                  Delete All Selected ({deleteSelection.length})
                </button>
                <button
                  onClick={() => handleConfirmDelete("single")}
                  className="bg-white/5 backdrop-blur-xl hover:bg-white/10 text-slate-200 font-bold py-4 px-6 rounded-2xl transition-all border border-white/10 active:scale-95"
                >
                  Delete Just This One
                </button>
                <button
                  onClick={() => setDeleteConfirmTarget(null)}
                  className="text-slate-500 hover:text-white font-bold py-3 px-6 rounded-2xl transition-all mt-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <StorageChoiceModal
        isOpen={isStorageChoiceOpen}
        onClose={() => setIsStorageChoiceOpen(false)}
        onConfirm={confirmNewProject}
      />
    </div>
  );
}

interface DraggableAssetProps {
  asset: Asset;
  onRemove: () => void;
  onSelectForDelete: (id: string, toggle: boolean) => void;
  isDeleteSelected: boolean;
  isDeleteModeActive: boolean;
  onUpdate: (x: number, y: number, rotation?: number) => void;
  onAssetChange: (asset: Asset) => void;
  onSwap: (id1: string, id2: string) => void;
  isHovered: boolean;
  isLocked: boolean;
  setHoveredTarget: (id: string | null) => void;
  swapSourceId: string | null;
  setSwapSourceId: (id: string | null) => void;
  lastSwappedId: string | null;
  zoom: number;
  isMultiTouch: boolean;
  width: number;
  triggerHaptic: (type?: "light" | "medium" | "success") => void;
  activeAccent: string;
  isUploaded?: boolean;
  uploadStatus?: { status: 'idle' | 'uploading' | 'success' | 'error', message: string };
}

const DraggableAsset = React.memo<DraggableAssetProps>(
  ({
    asset,
    onRemove,
    onSelectForDelete,
    isDeleteSelected,
    isDeleteModeActive,
    onUpdate,
    onAssetChange,
    onSwap,
    isHovered,
    isLocked,
    setHoveredTarget,
    swapSourceId,
    setSwapSourceId,
    lastSwappedId,
    zoom,
    isMultiTouch,
    width,
    triggerHaptic,
    activeAccent,
    isUploaded,
    uploadStatus
  }) => {
    const [hadMultiTouch, setHadMultiTouch] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [isConverting, setIsConverting] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [rotation, setRotation] = useState(asset.rotation || 0);
    const [isRotating, setIsRotating] = useState(false);
    const [isPressing, setIsPressing] = useState(false);

    // Sync internal rotation with prop changes
    useEffect(() => {
      if (!isRotating) {
        setRotation(asset.rotation || 0);
      }
    }, [asset.rotation, isRotating]);

    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const lastTapTime = useRef<number>(0);
    const dragged = useRef<boolean>(false);
    const wasLongPressed = useRef<boolean>(false);

    useEffect(() => {
      if (isMultiTouch) setHadMultiTouch(true);
    }, [isMultiTouch]);

    useEffect(() => {
      // Staggered entrance to prevent memory spikes on mobile
      const timer = setTimeout(() => setIsVisible(true), asset.sequence * 20);
      return () => clearTimeout(timer);
    }, [asset.sequence]);

    // HEIC Conversion Fallback for browser compatibility
    useEffect(() => {
      if (loadError && !isConverting) {
        const nameMatch = asset.name.toLowerCase().match(/\.hei[cf]$/i);
        const dataMatch = asset.fileData?.startsWith('data:image/hei') || asset.url?.startsWith('data:image/hei');
        const mimeMatch = asset.file?.type === 'image/heic' || asset.file?.type === 'image/heif';

        if (nameMatch || dataMatch || mimeMatch) {
          setIsConverting(true);
          (async () => {
            try {
              console.log(`Attempting emergency HEIC conversion for ${asset.name}...`);
              const heic2any = (await import("heic2any")).default;
              let blob: Blob | null = asset.file || null;
              
              if (!blob) {
                const res = await fetch(asset.fileData || asset.url);
                blob = await res.blob();
              }

              const converted = await heic2any({
                blob: blob as Blob,
                toType: "image/jpeg",
                quality: 0.7
              });
              
              const targetBlob = Array.isArray(converted) ? converted[0] : converted;
              const newUrl = URL.createObjectURL(targetBlob);
              
              onAssetChange({
                ...asset,
                url: newUrl,
                file: targetBlob,
                fileData: newUrl // This is just local, but helps UI
              });
              setLoadError(false);
            } catch (err) {
              console.error("Emergency HEIC conversion failed:", err);
            } finally {
              setIsConverting(false);
            }
          })();
        }
      }
    }, [loadError, asset.id, asset.url, asset.fileData, asset.file, asset.name]);

    const handlePointerDown = (e: React.PointerEvent) => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);

      // Initial position to detect movement
      const startX = e.clientX;
      const startY = e.clientY;
      dragged.current = false;
      wasLongPressed.current = false;
      setIsPressing(true);

      const handleMove = (moveEvent: PointerEvent) => {
        const dist = Math.sqrt(
          Math.pow(moveEvent.clientX - startX, 2) +
            Math.pow(moveEvent.clientY - startY, 2),
        );
        // Increased threshold to 12px for better mobile reliability
        if (dist > 12) {
          dragged.current = true;
          setIsPressing(false);
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener(
        "pointerup",
        () => {
          window.removeEventListener("pointermove", handleMove);
        },
        { once: true },
      );

      // Long press logic for swapping
      longPressTimer.current = setTimeout(() => {
        if (swapSourceId === asset.id) {
          setSwapSourceId(null);
          triggerHaptic("medium");
        } else if (!swapSourceId) {
          setSwapSourceId(asset.id);
          triggerHaptic("medium");
        } else if (swapSourceId !== asset.id) {
          setHoveredTarget(asset.id);
          triggerHaptic("medium");
        }
        wasLongPressed.current = true;
      }, 600);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      setIsPressing(false);
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleClick = (e: React.MouseEvent) => {
      // If we just finished a long press, don't trigger the tap logic
      if (wasLongPressed.current) {
        wasLongPressed.current = false;
        return;
      }

      // Ignore if drag occurred
      if (dragged.current) {
        dragged.current = false;
        return;
      }

      const now = Date.now();
      const isDoubleTap = now - lastTapTime.current < 300;

      // Identify if the target or its parent is the trash button
      const target = e.target as HTMLElement;
      const isDeleteBtn = !!target.closest('[data-is-delete-btn="true"]');

      // IF we are in delete mode (at least one image is selected),
      // any tap on the image area (not the trash button itself) should toggle selection.
      if (isDeleteModeActive && !isDeleteBtn) {
        onSelectForDelete(asset.id, true);
        lastTapTime.current = 0; // Prevent sequential taps from triggering double-tap swaps
        return;
      }

      // Default behavior when not in delete selection mode
      if (isDoubleTap) {
        // Double tap detected for swap
        if (swapSourceId && isHovered && swapSourceId !== asset.id) {
          triggerHaptic("success");
          onSwap(swapSourceId, asset.id);
        }
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
      }
    };

    if (!isVisible && isLocked) {
      return (
        <div
          className="absolute bg-[#121214]"
          style={{
            left: asset.x,
            top: asset.y,
            width,
            height: asset.width && asset.height ? (width * (asset.height / asset.width)) : width * 0.75,
          }}
        />
      );
    }

    return (
      <motion.div
        drag={!isLocked && !isRotating ? true : false}
        dragMomentum={false}
        onDragStart={() => setHadMultiTouch(false)}
        initial={{
          scale: 0.8,
          opacity: 0,
          x: asset.x,
          y: asset.y,
          rotate: asset.rotation || 0,
        }}
        animate={{
          scale: 1,
          opacity: 1,
          x: asset.x,
          y: asset.y,
          rotate: rotation,
        }}
        transition={{
          x: { type: "spring", damping: 25, stiffness: 120 },
          y: { type: "spring", damping: 25, stiffness: 120 },
          scale: { duration: 0.2 },
          opacity: { duration: 0.2 },
          rotate: isRotating
            ? { duration: 0 }
            : { type: "spring", damping: 25, stiffness: 120 },
        }}
        onDragEnd={(e, info) => {
          if (isLocked || isRotating) return;
          if (!swapSourceId && !isMultiTouch && !hadMultiTouch) {
            // Use a functional update or ensure we have the latest rotation if it can change during drag
            // In this case, rotation only changes via the rotation handle which disables dragging
            onUpdate(
              asset.x + info.offset.x / zoom,
              asset.y + info.offset.y / zoom,
              rotation,
            );
          }
          setTimeout(() => setHadMultiTouch(false), 50);
        }}
        className={`absolute pointer-events-auto group touch-none ${isLocked ? "cursor-default" : swapSourceId ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
        style={{
          width,
          zIndex:
            swapSourceId === asset.id || isHovered ? 1000 : asset.sequence,
          WebkitTouchCallout: "none",
        }}
        data-asset-id={asset.id}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className={`relative transition-all duration-500
        ${isLocked ? "p-0" : "p-0"}
        ${swapSourceId === asset.id || lastSwappedId === asset.id || (isHovered && swapSourceId && swapSourceId !== asset.id) ? "z-40" : ""}
      `}
        >
          {/* Status Badge */}
          {uploadStatus && uploadStatus.status !== 'idle' && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl">
                <div className={`px-3 py-1 rounded-full text-[12px] font-black uppercase tracking-widest ${uploadStatus.status === 'success' ? 'bg-[#00ff66] text-black' : 'bg-red-500 text-white'}`}>
                   {uploadStatus.message}
                </div>
             </div>
          )}

          {/* Rotation & Delete Controls */}
          {!isLocked && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-4 z-[60]">
              {/* Rotate Button */}
              <div
                className="flex flex-col items-center gap-2 group/rotate cursor-alias"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setIsRotating(true);

                  // Find the center of the asset relative to the viewport
                  const element = e.currentTarget.parentElement?.parentElement;
                  if (!element) return;
                  const rect = element.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;

                  let currentDeg = rotation;

                  const handlePointerMove = (moveEvent: PointerEvent) => {
                    const dx = moveEvent.clientX - centerX;
                    const dy = moveEvent.clientY - centerY;
                    const angle = Math.atan2(dy, dx);
                    currentDeg = (angle * 180) / Math.PI + 90;
                    setRotation(currentDeg);
                  };

                  const handlePointerUpLocal = () => {
                    setIsRotating(false);
                    window.removeEventListener(
                      "pointermove",
                      handlePointerMove,
                    );
                    window.removeEventListener(
                      "pointerup",
                      handlePointerUpLocal,
                    );
                    onUpdate(asset.x, asset.y, currentDeg);
                  };

                  window.addEventListener("pointermove", handlePointerMove);
                  window.addEventListener("pointerup", handlePointerUpLocal);
                }}
              >
                <div className="w-0.5 h-6 bg-emerald-500/30 group-hover/rotate:bg-emerald-500/60 transition-colors" />
                <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center text-white shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_0_12px_rgba(255,255,255,0.1)] hover:bg-emerald-500/40 hover:border-emerald-400 group-hover/rotate:text-emerald-400 transition-all active:scale-95 group/btn relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5 opacity-40" />
                  <RotateCcw size={16} className="relative z-10" />
                </div>
              </div>

              {/* Delete Button (Moved here per user request) */}
              <div className="flex flex-col items-center gap-2 group/delete">
                <div className="w-0.5 h-6 bg-slate-500/30 group-hover/delete:bg-indigo-500/60 transition-colors" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                    triggerHaptic("medium");
                  }}
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center text-white shadow-[0_8px_32_rgba(0,0,0,0.5),inset_0_0_12px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:border-indigo-400 group-hover/delete:text-indigo-400 transition-all active:scale-95 group/btn relative overflow-hidden"
                  title="Delete Asset"
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5 opacity-40" />
                  <Trash2 size={16} className="relative z-10" />
                </button>
              </div>
            </div>
          )}

          {/* Delete Selection Overlay moved inside Media Content */}
          {/* Liquid Glass Overlay Effect & Swapping Instructions moved inside Media Content */}

          {/* Media Content Wrapper */}
          <div
            className="relative flex items-center justify-center overflow-hidden bg-transparent"
            style={{
              aspectRatio: asset.width && asset.height ? `${asset.width} / ${asset.height}` : "16/9",
              width: "100%",
              contentVisibility: "auto",
            }}
          >
            {/* Transforming Content Layer (Image + Selection Overlays) */}
            <motion.div
              className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center transform-gpu"
              animate={
                swapSourceId === asset.id
                  ? {
                      scale: [0.92, 0.85, 0.82, 1.08, 1],
                      y: 0,
                    }
                  : isHovered && swapSourceId && swapSourceId !== asset.id
                    ? {
                        scale: [1, 1, 0.98, 1, 0.95, 1, 1],
                        y: [0, 0, 1.5, 0, 3.5, 0, 0],
                      }
                    : isPressing
                      ? { scale: 0.92, y: 0 }
                      : { scale: 1, y: 0 }
              }
              transition={
                swapSourceId === asset.id
                  ? {
                      duration: 1.4,
                      times: [0, 0.3, 0.6, 0.85, 1],
                      ease: [0.34, 1.56, 0.64, 1], // Custom elastic ease
                    }
                  : isHovered && swapSourceId && swapSourceId !== asset.id
                    ? {
                        duration: 2.4, // Increased to account for delay
                        repeat: Infinity,
                        times: [0, 0.5, 0.55, 0.6, 0.68, 0.75, 1], // First 50% (1.2s) is static
                        ease: "circOut",
                      }
                    : {
                        duration: 0.4,
                        ease: [0.22, 1, 0.36, 1],
                      }
              }
              style={{ transformOrigin: "center" }}
            >
              {asset.type === "video" ? (
                <SmartVideo
                  ref={(el) => {
                    if (el) {
                      el.defaultMuted = true;
                      el.muted = true;
                    }
                  }}
                  key={`${asset.url}-${retryCount}`}
                  src={asset.url || undefined}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  muted
                  playsInline
                  loop
                  autoPlay
                  onLoadedData={() => setLoadError(false)}
                  onError={() => setLoadError(true)}
                />
              ) : (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                  {loadError ? (
                    <button
                      onClick={() => {
                        setLoadError(false);
                        setRetryCount((prev) => prev + 1);
                        triggerHaptic("light");
                      }}
                      className="flex flex-col items-center justify-center p-4 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer group/retry"
                    >
                      {isConverting ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                          <span className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">Converting HEIC</span>
                        </div>
                      ) : (
                        <>
                          <ImageIcon
                            size={32}
                            className="mb-2 opacity-10 group-hover/retry:opacity-40"
                          />
                          <span className="text-[9px] uppercase tracking-wider text-center flex flex-col items-center gap-1">
                            <span className="font-bold text-slate-500">
                              Load Failed
                            </span>
                            <span className="bg-zinc-800/50 px-2 py-1 rounded text-[7px]">
                              Tap to Retry
                            </span>
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <img
                      key={`${asset.url}-${retryCount}`}
                      src={asset.url || undefined}
                      alt={asset.name}
                      className="w-full h-full object-contain block pointer-events-none"
                      referrerPolicy="no-referrer"
                      onLoad={() => setLoadError(false)}
                      onError={(e) => {
                        console.error(`Failed to load asset: ${asset.name}`);
                        setLoadError(true);
                      }}
                    />
                  )}
                </div>
              )}

              {/* Integrated Selection Overlays - Clean Surface Wash */}
              <AnimatePresence mode="wait">
                {(swapSourceId === asset.id ||
                  (isHovered && swapSourceId && swapSourceId !== asset.id) ||
                  lastSwappedId === asset.id) && (
                  <motion.div
                    key={
                      swapSourceId === asset.id
                        ? "source"
                        : lastSwappedId === asset.id
                          ? "swapped"
                          : "target"
                    }
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                    className={`absolute inset-0 z-50 pointer-events-none backdrop-blur-[1px]
                      ${swapSourceId === asset.id ? "bg-yellow-500/20" : ""}
                      ${lastSwappedId === asset.id ? "bg-blue-600/25" : ""}
                      ${isHovered && swapSourceId && swapSourceId !== asset.id ? "bg-green-500/20" : ""}
                    `}
                  >
                    {isHovered && swapSourceId && swapSourceId !== asset.id ? (
                      <div className="w-full h-full flex flex-col items-center justify-center relative">
                        <div className="relative z-10 flex flex-col items-center text-center px-6">
                          <span className="text-[20px] font-black uppercase tracking-[0.1em] leading-tight text-white">
                            Double tap to swap
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center relative p-6">
                        <div className="relative z-10 flex flex-col items-center text-center text-white">
                          <span className="text-[20px] font-black uppercase tracking-[0.1em] leading-tight text-white">
                            {swapSourceId === asset.id
                              ? "Ready for Swap"
                              : "Swap Successful"}
                          </span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Delete Selection Overlay - Surface Wash */}
              <AnimatePresence>
                {isDeleteSelected && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      duration: 0.25,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="absolute inset-0 z-[60] flex items-center justify-center bg-indigo-950/30 backdrop-blur-[2px] cursor-pointer"
                  >
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                      <Check size={14} />
                    </div>
                    <motion.button
                      data-is-delete-btn="true"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                        triggerHaptic("medium");
                      }}
                      className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl ring-4 ring-white/20 pointer-events-auto"
                    >
                      <Trash2 size={32} />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Sequence Overlay (Bottom Left) - Static UI */}
            <div
              data-is-bubble="true"
              className="absolute bottom-0 left-0 p-3 pt-6 pr-6 cursor-pointer z-40 pointer-events-none"
            >
              <span
                className={`text-[13px] font-black tracking-[0.2em] uppercase
              ${isHovered && swapSourceId && swapSourceId !== asset.id ? "opacity-100 drop-shadow-md" : (isUploaded ? "opacity-100" : "opacity-90")}
              ${isUploaded ? "drop-shadow-[0_0_12px_currentColor] brightness-125" : ""}
              transition-all duration-300
            `}
                style={{ color: activeAccent }}
              >
                Shot {asset.sequence}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  },
);

const StorageChoiceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (type: "local" | "cloud") => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [selectedStorage, setSelectedStorage] = useState<"local" | "cloud" | null>(null);
  const [step, setStep] = useState<"selection" | "risk">("selection");
  const [showToast, setShowToast] = useState(false);

  const resetModalState = useCallback(() => {
    setSelectedStorage(null);
    setStep("selection");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4" onClick={resetModalState}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl mx-auto my-auto max-h-[92vh] flex flex-col justify-between p-4 sm:p-8 overflow-y-auto bg-[#0c0c0e] border border-neutral-900 rounded-3xl shadow-[0_32px_64px_rgba(0,0,0,0.5)] relative"
      >
        <div className="flex justify-between items-start mb-6">
            <div>
               <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase text-left">Initialize Storage Protocol</h2>
               <p className="text-xs sm:text-sm text-neutral-400 mt-1 sm:mt-2 leading-relaxed font-medium text-left">Select your primary production environment.</p>
            </div>
            <button onClick={resetModalState} className="text-neutral-500 hover:text-white hover:bg-white/10 rounded-full p-2 transition-all">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        
        {step === 'selection' ? (
          <div>
            <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-6">
            {/* Local Storage */}
            <button
              onClick={() => setSelectedStorage("local")}
              className={`flex flex-col items-start p-3 sm:p-6 rounded-2xl border transition-all text-left group relative overflow-hidden ${selectedStorage === 'local' ? 'bg-white/10 ring-2 ring-offset-2 ring-offset-[#0c0c0e] ring-[#00ff66] border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/[0.08] hover:border-white/20'}`}
            >
              <div className="flex items-center gap-2 sm:flex-col sm:items-start w-full">
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-blue-500/20 flex items-center justify-center sm:mb-6 group-hover:scale-110 transition-transform">
                   <HardDrive className="text-blue-400" size={20} />
                </div>
                <h3 className="text-sm sm:text-xl font-black text-white uppercase tracking-wide">Save 100% Locally</h3>
              </div>
              <div className="space-y-1 sm:space-y-2 mt-2 sm:mt-0">
                <div className="flex items-center gap-2 text-neutral-300 text-[11px] sm:text-xs font-bold uppercase tracking-widest">
                   <Check size={10} className="text-blue-400" /> Upload up to 7 items
                </div>
                <div className="flex items-center gap-2 text-neutral-300 text-[11px] sm:text-xs font-bold uppercase tracking-widest">
                   <Check size={10} className="text-blue-400" /> Support All Files
                </div>
              </div>
            </button>

            {/* Cloud Storage */}
            <button
              onClick={() => setSelectedStorage("cloud")}
              className={`flex flex-col items-start p-3 sm:p-6 rounded-2xl border transition-all text-left group relative overflow-hidden ${selectedStorage === 'cloud' ? 'bg-[#CCFF00]/10 ring-2 ring-offset-2 ring-offset-[#0c0c0e] ring-[#00ff66] border-[#CCFF00]/30' : 'bg-[#CCFF00]/5 border-[#CCFF00]/20 hover:bg-[#CCFF00]/10 hover:border-[#CCFF00]/30'}`}
            >
              <div className="flex items-center gap-2 sm:flex-col sm:items-start w-full">
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#CCFF00]/20 flex items-center justify-center sm:mb-6 group-hover:scale-110 transition-transform">
                   <Cloud className="text-[#CCFF00]" size={20} />
                </div>
                <h3 className="text-sm sm:text-xl font-black text-white uppercase tracking-wide">Save to Cloud Sync</h3>
              </div>
              <div className="space-y-1 sm:space-y-2 mt-2 sm:mt-0">
                <div className="flex items-center gap-2 text-neutral-300 text-[11px] sm:text-xs font-bold uppercase tracking-widest">
                   <Cloud size={10} className="text-[#CCFF00]" /> Real-time Multi-device
                </div>
                <div className="flex items-center gap-2 text-neutral-300 text-[11px] sm:text-xs font-bold uppercase tracking-widest">
                   <AlertCircle size={10} className="text-[#CCFF00]" /> 1 Image / 1MB Max
                </div>
              </div>
              <div className="mt-2 sm:mt-4 text-[10px] p-2 bg-yellow-950/30 border border-yellow-700/30 rounded-xl text-yellow-500 font-mono tracking-wider">
                  ⚠️ 1GB Shared Quota
              </div>
            </button>
            </div>
            
            <button
                disabled={!selectedStorage}
                onClick={() => setStep('risk')}
                className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest mt-6 transition-all ${selectedStorage ? 'bg-[#00ff66] text-black hover:bg-[#00e65c] shadow-[0_0_20px_rgba(0,255,102,0.3)]' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}
            >
                Start Project
            </button>
          </div>
        ) : (
            <div className="flex flex-col gap-6">
                <h2 className="text-2xl text-yellow-500 font-black uppercase tracking-widest text-center">⚠️ CRITICAL RISK WARNING</h2>
                <div className="p-4 bg-yellow-950/20 border border-yellow-700/30 rounded-2xl text-yellow-100 text-sm leading-relaxed">
                   <p>You have selected <strong>{selectedStorage?.toUpperCase()}</strong> storage.</p>
                   {selectedStorage === 'cloud' && (
                       <p className="mt-2">Cloud projects auto-sync across devices. Ensure internet stability and follow all protocol guidelines to maintain integrity.</p>
                   )}
                </div>
                
                 {/* Data Integrity Safeguard - Conditional */}
                {selectedStorage === 'cloud' && (
                    <div className="mt-4 p-4 bg-red-950/20 border border-red-500/30 rounded-xl">
                      <h4 className="text-red-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2 mb-2">
                        <span className="text-lg">⚠️</span> Asset Integrity Notice
                      </h4>
                      <p className="text-neutral-300 text-[11px] leading-relaxed">
                        To prevent assets from being discarded, <strong>always verify sync status</strong> before exiting. 
                        Ensure your <strong>SHOT</strong> tags have achieved the "Sync Complete" glow. 
                        Closing the app mid-transmission may lead to partial uploads.
                      </p>
                    </div>
                )}
                
                <div className="flex gap-3">
                    <button onClick={() => setStep('selection')} className="flex-1 py-4 rounded-xl font-bold uppercase tracking-widest border border-neutral-700 text-neutral-400 hover:bg-neutral-800">
                        Back
                    </button>
                    <button onClick={() => { onConfirm(selectedStorage!); setShowToast(true); }} className="flex-1 py-4 rounded-xl font-bold uppercase tracking-widest bg-[#00ff66] text-black hover:bg-[#00e65c]">
                        Confirm & Initialize
                    </button>
                </div>
            </div>
        )}
        
        {showToast && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#00ff66] text-black px-6 py-3 rounded-full font-black uppercase tracking-widest shadow-lg z-[2001]">
                Protocol Initialized!
            </div>
        )}
      </motion.div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [activeAccent, setActiveAccent] = useState("#00FF87");
  const [fontScale, setFontScale] = useState(1.0);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({ type: "emoji", soundEnabled: true, hapticsEnabled: true, sleepMode: false });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setTimeout(() => setIsAuthChecking(false), 300);

      if (u) {
        try {
          const settings = await get<{activeAccent?: string, fontScale?: number, agentSettings?: AgentSettings}>(`user_settings_${u.uid}`);
          if (settings) {
            if (settings.activeAccent) setActiveAccent(settings.activeAccent);
            if (settings.fontScale) setFontScale(settings.fontScale);
            if (settings.agentSettings) setAgentSettings(settings.agentSettings);
          } else {
            await set(`user_settings_${u.uid}`, { activeAccent, fontScale, agentSettings });
          }
        } catch(e) {
          console.error("Local Settings Load Error:", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleActiveAccentChange = (newAccent: string) => {
    setActiveAccent(newAccent);
    if (user) {
      get(`user_settings_${user.uid}`).then((s: any) => set(`user_settings_${user.uid}`, { ...(s || {}), activeAccent: newAccent })).catch(console.error);
    }
  };

  const handleFontScaleChange: React.Dispatch<React.SetStateAction<number>> = (val) => {
    setFontScale((prev) => {
      const newScale = typeof val === "function" ? val(prev) : val;
      if (user) {
        get(`user_settings_${user.uid}`).then((s: any) => set(`user_settings_${user.uid}`, { ...(s || {}), fontScale: newScale })).catch(console.error);
      }
      return newScale;
    });
  };

  const handleAgentSettingsChange: React.Dispatch<React.SetStateAction<AgentSettings>> = (val) => {
    setAgentSettings((prev) => {
      const newSettings = typeof val === "function" ? val(prev) : val;
      if (user) {
        get(`user_settings_${user.uid}`).then((s: any) => set(`user_settings_${user.uid}`, { ...(s || {}), agentSettings: newSettings })).catch(console.error);
      }
      return newSettings;
    });
  };

  if (isAuthChecking) {
    return (
      <div className="fixed inset-0 bg-black grid place-items-center z-[999999]">
        <span 
          className="text-4xl animate-pulse font-mono font-black"
          style={{ color: activeAccent }}
        >
          _
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-[#050505] z-[999999] flex items-center justify-center">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => signInWithGoogle()}
          className="px-8 py-4 rounded-xl border border-[#222222] bg-[#111111] hover:bg-[#151515] flex items-center justify-center uppercase text-white tracking-wider text-sm font-bold shadow-2xl z-10 transition-colors"
        >
          <svg className="w-5 h-5 mr-4" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l2.85-2.22.83-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="mt-0.5">SIGN IN WITH GOOGLE PROTOCOL</span>
        </motion.button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, activeAccent, setActiveAccent: handleActiveAccentChange, fontScale, setFontScale: handleFontScaleChange, agentSettings, setAgentSettings: handleAgentSettingsChange }}>
      <MainApp />
    </AuthContext.Provider>
  );
}
