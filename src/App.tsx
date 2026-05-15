/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { getProjects, saveProject, deleteProject, DBProject, DBAsset } from './db';
import { get, set } from 'idb-keyval';
import { FloatingAgent } from './components/FloatingAgent';
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
} from 'lucide-react';

// --- Types ---

export type AgentType = 'blue' | 'emoji' | 'transparent';

interface AgentSettings {
  type: AgentType;
  soundEnabled: boolean;
}

type AssetType = 'image' | 'video';

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
  role: 'user' | 'model';
  text: string;
  assets?: Asset[];
  isPending?: boolean;
}

// --- Components ---

// --- Global Cache for Blob URLs to ensure zero-latency navigation ---
const BLOB_URL_CACHE = new Map<string, string>();

function getCachedUrl(id: string, file?: File | Blob | null, fileData?: string): string | null {
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

function ProjectCard({ project, onOpen, onDelete, onRename }: { project: DBProject, onOpen: () => void, onDelete: () => void, onRename: () => void }) {
  const firstAsset = project.assets.length > 0 ? project.assets[0] : null;
  // Use persistent blob URL from cache if available to prevent flickering
  const [coverUrl, setCoverUrl] = useState<string | null>(() => {
    if (firstAsset) {
      return getCachedUrl(`cover_${project.id}_${firstAsset.id}`, firstAsset.file, firstAsset.fileData);
    }
    return null;
  });
  
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (firstAsset && !coverUrl) {
      const url = getCachedUrl(`cover_${project.id}_${firstAsset.id}`, firstAsset.file, firstAsset.fileData);
      setCoverUrl(url);
    }
  }, [firstAsset, project.id, coverUrl]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirmingDelete(!isConfirmingDelete);
  };

  return (
    <div 
      className="flex flex-col group/card liquid-glass rounded-[2rem] md:rounded-[2.5rem] overflow-hidden cursor-pointer relative shadow-2xl ring-1 ring-white/5 active:scale-[0.98] transition-all duration-300"
      onClick={onOpen}
    >
      <div className="w-full aspect-[16/9] bg-black/40 relative overflow-hidden">
        {coverUrl ? (
          firstAsset?.type === 'video' ? (
            <video 
              ref={(el) => { if(el) { el.defaultMuted = true; el.muted = true; el.play().catch(()=>{}); } }}
              src={coverUrl} 
              className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-1000 ease-out"
              muted
              autoPlay
              loop
              playsInline
            />
          ) : (
            <img src={coverUrl} alt={project.title} className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-1000 ease-out" />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
            <ImageIcon className="w-8 h-8 mb-2 opacity-20" />
            <span className="text-[0.5625rem] font-bold uppercase tracking-[0.4em] opacity-30">Archive Blank</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />
        <div className="absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.4)] pointer-events-none" />
      </div>

      <div className="flex items-center justify-between p-6 px-7">
        <div className="flex flex-col min-w-0 flex-1 mr-4">
          <span className="text-sm md:text-base font-bold tracking-tight text-white/80 group-hover/card:text-emerald-400 transition-colors truncate">
            {project.title}
          </span>
          <span className="text-[9px] font-bold text-slate-600 mt-1 uppercase tracking-[0.2em] group-hover/card:text-slate-500 transition-colors">
            {new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(project.updatedAt))}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className="p-2.5 text-slate-600 hover:text-white bg-white/0 hover:bg-white/5 rounded-full transition-all flex items-center justify-center liquid-glass"
            title="Rename"
          >
            <Edit2 className="w-[16px] h-[16px]" />
          </button>
          <button 
            onClick={handleDeleteClick}
            className={`p-2.5 rounded-full transition-all flex items-center justify-center liquid-glass
              ${isConfirmingDelete 
                ? 'bg-red-500/80 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] border-red-400/30' 
                : 'text-slate-600 hover:text-red-400 hover:bg-red-400/5 bg-white/0'}
            `}
            title="Delete Project"
          >
            <Trash2 className="w-[16px] h-[16px]" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isConfirmingDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 liquid-glass-indigo flex flex-col items-center justify-center z-20 text-white p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4 ring-1 ring-indigo-500/30">
               <Trash2 className="w-6 h-6 text-indigo-100" />
            </div>
            <p className="text-center font-bold text-sm mb-6 tracking-tight text-indigo-50 uppercase">Permanent Deletion?</p>
            <div className="flex flex-col gap-3 w-full">
               <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                  setIsConfirmingDelete(false);
                }}
                className="w-full py-4 bg-indigo-500/20 hover:bg-indigo-600 border border-indigo-500/40 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-xl"
              >
                Execute Purge
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setIsConfirmingDelete(false);
                }}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-2xl font-bold uppercase tracking-widest text-[10px] transition-all"
              >
                Abort
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Components ---

const TemplateVideo = ({ src, className, isActive, absOffset }: { src: string; className?: string; isActive?: boolean; absOffset?: number }) => {
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  
  // Enhanced visibility for mobile: allow 3 templates to be in DOM (center + 1 neighbor each side)
  // This ensures no black screens during carousel swipes
  const isVisible = absOffset === undefined || (isMobile ? Math.abs(absOffset) < 1.6 : Math.abs(absOffset) < 2.5);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(false);
  const [key, setKey] = useState(0); 
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check if it's an external video provider that needs an embed
  const isStreamable = src.includes('streamable.com');
  const embedUrl = isStreamable ? src.replace('streamable.com/', 'streamable.com/e/') : null;

  // Sync playback state for native video
  useLayoutEffect(() => {
    if (isStreamable) return;
    const v = videoRef.current;
    if (!v || !isVisible) return;

    if (isActive) {
      v.muted = true;
      v.playsInline = true;
      // Use play() directly with no checks to maximize speed
      v.play().catch(() => {});
    } else {
      // Don't pause neighbors as aggressively to avoid black flickers
      if (Math.abs(absOffset || 0) > 1.8) {
        v.pause();
      }
    }
  }, [isActive, isVisible, key, isStreamable, absOffset]);

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
      <div className={`relative w-full h-full bg-[#050505] flex items-center justify-center ${className}`}>
        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
          <Film className="w-6 h-6 text-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full bg-[#030303] overflow-hidden rounded-[inherit] ${className}`} style={{ transform: 'translate3d(0,0,0)' }}>
      <div className="absolute -inset-[1px] transform-gpu">
        {isStreamable ? (
          <div className="absolute inset-0 scale-[1.3] pointer-events-none select-none flex items-center justify-center">
            <iframe
              src={`${embedUrl}?autoplay=1&muted=1&loop=1&controls=0&transparent=1&background=1&mute=1&interactive=0`}
              className={`w-full h-full border-none transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
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
            src={src}
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
            className={`w-full h-full object-cover scale-[1.08] transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
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
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/50 font-black mb-8">Signal Connection Issues</p>
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setError(false);
              setIsLoaded(false);
              setShowSpinner(true);
              setKey(k => k + 1); // Full remount
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
const TEMPLATES: { id: string; type: 'video' | 'image' | 'blank'; title?: string; label?: string; src?: string }[] = [
  { 
    id: 'motion-graphics', 
    type: 'video', 
    title: 'Motion Graphics', 
    label: 'AI GENERATED', 
    src: 'https://streamable.com/pcyh7p' 
  },
  { 
    id: 'b1', 
    type: 'video', 
    title: 'Daily Object', 
    label: '- Daily Object Story', 
    src: 'https://streamable.com/exmuah' 
  },
  { 
    id: 'fruit', 
    type: 'video', 
    title: 'AI Fruit Drama', 
    label: 'RIPE - AI Fruit Story', 
    src: 'https://streamable.com/rdf713' 
  },
  { 
    id: 'b2', 
    type: 'image', 
    title: 'Space Legend', 
    label: 'RIPE - AI Fruit Story', 
    src: 'https://images.unsplash.com/photo-1628126235206-5260b9ea6441?q=80&w=400&auto=format&fit=crop' 
  }
];

export default function App() {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [currentProject, setCurrentProject] = useState<DBProject | null>(null);
  const [activeTemplate, setActiveTemplate] = useState(2);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 400);
  const [fontScale, setFontScale] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('studioripe-font-scale');
      return saved ? parseFloat(saved) : 1.0;
    }
    return 1.0;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'main' | 'agent' | 'appearance' | 'haptics' | 'advanced' | 'api'>('main');
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('studioripe-agent-settings');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse agent settings", e);
        }
      }
    }
    return { type: 'emoji', soundEnabled: true };
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('studioripe-agent-settings', JSON.stringify(agentSettings));
    }
  }, [agentSettings]);
  const [localApiKey, setLocalApiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('studioripe-gemini-key') || '';
    }
    return '';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.style.setProperty('--font-scale', fontScale.toString());
      localStorage.setItem('studioripe-font-scale', fontScale.toString());
    }
  }, [fontScale]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('studioripe-gemini-key', localApiKey);
    }
  }, [localApiKey]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    const handleScroll = () => {
      // If user is scrolling the page, pause the template carousel
      setTemplateInteractionTime(Date.now());
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);
  
  const [assets, setAssets] = useState<Asset[]>([]);
  const [past, setPast] = useState<Asset[][]>([]);
  const [future, setFuture] = useState<Asset[][]>([]);
  const [viewMode, setViewMode] = useState<'dashboard' | 'board' | 'playback'>('dashboard');
  const [templateInteractionTime, setTemplateInteractionTime] = useState<number>(0);
  const [showTemplateArrows, setShowTemplateArrows] = useState(true);
  const arrowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [touchCount, setTouchCount] = useState(0);
  const [isLayoutLocked, setIsLayoutLocked] = useState(true);
  const [arrangeStatus, setArrangeStatus] = useState<'idle' | 'scanning_yellow' | 'scanning_green' | 'success' | 'error'>('idle');
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);
  const [isCanvasSettingsOpen, setIsCanvasSettingsOpen] = useState(false);
  const [showLockHint, setShowLockHint] = useState(false);

  const handleAutoArrange = () => {
    if (isLayoutLocked) {
      setArrangeStatus('error');
      setShowLockHint(true);
      setTimeout(() => setShowLockHint(false), 2000);
      // "No" shake haptic
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 30, 40, 30, 40]);
      }
      setTimeout(() => setArrangeStatus('idle'), 2000);
      return;
    }

    setArrangeStatus('scanning_yellow');
    
    // First sharp haptic for Yellow stage
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }

    // Mid-way haptic for transition to Green stage (at 1 second)
    setTimeout(() => {
      setArrangeStatus('scanning_green');
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }
    }, 1000);
    
    // Sequential Yellow->Green (1s each, 2s total)
    setTimeout(() => {
      // Auto-arrange logic
      autoArrange();
      
      // Reset rotations
      setAssets(prev => prev.map(a => ({ ...a, rotation: 0 })));
      
      // Auto-lock after rearrangement
      setIsLayoutLocked(true);
      
      // The user likes the zoom behavior of the lock button (which is zoom: 1)
      setTransform({ x: 0, y: 0, zoom: 1 });
      
      setArrangeStatus('success');
      
      // Final long haptic for successful settlement
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(200); 
      }
      
      setTimeout(() => setArrangeStatus('idle'), 1200);
    }, 2000);
  };
  
  // --- Agent Mode State ---
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);

  const agentScrollRef = useRef<HTMLDivElement>(null);
  const agentFileInputRef = useRef<HTMLInputElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deletedProjectInfo, setDeletedProjectInfo] = useState<{ project: DBProject, timeoutId: NodeJS.Timeout } | null>(null);

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
    setActiveTemplate(prev => prev + 1); 
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8);
    }
  };

  const handleNextTemplate = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleTemplateInteraction();
    setActiveTemplate(prev => prev - 1);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8);
    }
  };

  // Template auto-carousel
  useEffect(() => {
    if (viewMode !== 'dashboard') return;
    const interval = setInterval(() => {
      // Pause auto-scroll if interacted within the last 6 seconds
      // Using a local check to ensure we don't jitter during active user sessions
      if (Date.now() - templateInteractionTime > 8000) {
        setActiveTemplate(prev => prev - 1);
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [viewMode, templateInteractionTime]);

  // Load projects from IndexedDB on mount
  useEffect(() => {
    async function loadProjects() {
      const dbProjects = await getProjects();
      setProjects(dbProjects);
    }
    loadProjects();
  }, []);
  
  // Save current project when assets change (debounced implicitly by only saving when we change them)
  useEffect(() => {
    if (currentProject && viewMode !== 'dashboard') {
      const serializeAsset = (a: Asset): DBAsset | null => {
        if (!a.file && !a.fileData) return null;
        
        // Ensure it's in our memory cache too so ProjectCard can use it instantly on return to home
        if (a.file || a.fileData) {
          getCachedUrl(`cover_${currentProject.id}_${a.id}`, a.file, a.fileData);
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
          rotation: a.rotation
        };
      };

      const updatedProject: DBProject = {
        ...currentProject,
        updatedAt: Date.now(),
        assets: assets.map(serializeAsset).filter((a): a is DBAsset => a !== null),
        agentMessages: agentMessages.map(m => ({
          role: m.role,
          text: m.text,
          assets: m.assets ? m.assets.map(serializeAsset).filter((a): a is DBAsset => a !== null) : undefined
        }))
      };
      saveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    }
  }, [assets, agentMessages, currentProject?.id, viewMode]);

  const pushHistory = (newAssets: Asset[]) => {
    setPast(prev => [...prev, assets]);
    setFuture([]);
    setAssets(newAssets);
  };

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setPast(newPast);
    setFuture(prev => [assets, ...prev]);
    setAssets(previous);
  }, [past, assets]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    setFuture(newFuture);
    setPast(prev => [...prev, assets]);
    setAssets(next);
  }, [future, assets]);

  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'success' = 'light') => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'success') navigator.vibrate([10, 30, 50]);
      else if (type === 'medium') navigator.vibrate(25);
      else navigator.vibrate(10);
    }
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'board') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, viewMode]);

  // Handle Wheel Zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (viewMode !== 'board') return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        setTransform(prev => ({
          ...prev,
          zoom: Math.min(Math.max(prev.zoom + delta, 0.2), 3)
        }));
      } else if (!isPanning) {
        // Standard scroll pans the board
        setTransform(prev => ({
          ...prev,
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => canvas?.removeEventListener('wheel', handleWheel);
  }, [viewMode, isPanning]);

  // Auto-scroll agent chat
  useEffect(() => {
    if (agentScrollRef.current) {
      agentScrollRef.current.scrollTop = agentScrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  const processFile = (file: File): Promise<{url: string, width: number, height: number, file: File | Blob, fileData?: string}> => {
    return new Promise((resolve) => {
      const tempUrl = URL.createObjectURL(file);
      
      if (file.type.startsWith('video')) {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
           resolve({ url: tempUrl, width: video.videoWidth || 1920, height: video.videoHeight || 1080, file });
        };
        video.onerror = () => {
           resolve({ url: tempUrl, width: 1920, height: 1080, file });
        };
        video.src = tempUrl;
      } else {
        const img = new Image();
        img.onload = () => {
           const MAX_DIM = 1280; 
           let { width, height } = img;
           
           if (width > MAX_DIM || height > MAX_DIM) {
             if (width > height) {
               height = Math.round(height * (MAX_DIM / width));
               width = MAX_DIM;
             } else {
               width = Math.round(width * (MAX_DIM / height));
               height = MAX_DIM;
             }
             
             const canvas = document.createElement('canvas');
             canvas.width = width;
             canvas.height = height;
             const ctx = canvas.getContext('2d');
             
             if (ctx) {
               ctx.drawImage(img, 0, 0, width, height);
               const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
               resolve({ url: dataUrl, width, height, file, fileData: dataUrl });
             } else {
               const reader = new FileReader();
               reader.onloadend = () => resolve({ url: reader.result as string, width, height, file, fileData: reader.result as string });
               reader.readAsDataURL(file);
             }
             
           } else {
             const reader = new FileReader();
             reader.onloadend = () => resolve({ url: reader.result as string, width, height, file, fileData: reader.result as string });
             reader.readAsDataURL(file);
           }
        };
        img.onerror = () => {
           resolve({ url: tempUrl, width: 1920, height: 1080, file });
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
      showToast("Agent constraint: Please provide a maximum of 7 items for auditing at once.");
      fileList = fileList.slice(0, 7);
    }

    const newAgentAssets: Asset[] = fileList.map((file, idx) => {
      const type: AssetType = file.type.startsWith('video') ? 'video' : 'image';
      return {
        id: `agent-${Math.random().toString(36).substr(2, 9)}`,
        type,
        url: URL.createObjectURL(file), // Will still render as Blob URL locally
        width: type === 'video' ? 1920 : 1200, 
        height: type === 'video' ? 1080 : 800,
        x: 0, y: 0,
        sequence: 0,
        name: file.name,
        file
      };
    });

    // Add to chat history
    setAgentMessages(prev => [...prev, { role: 'user', text: `Uploaded ${newAgentAssets.length} asset(s)`, assets: newAgentAssets }]);
    
    // Call AI automatically after upload, but pass the un-encoded FILE objects for standard base64 encoding inside
    callAgent(`I've uploaded ${newAgentAssets.length} new asset(s) for audit.`, fileList);

    e.target.value = '';
  };

  const approveAsset = (asset: Asset) => {
    // 1. Mark as approved in UI (optional visual feedback)
    // 2. Add to main board
    const newAsset: Asset = {
      ...asset,
      id: Math.random().toString(36).substr(2, 9), // New unique ID for the main gallery
      x: (Math.random() * 100 + 50 - transform.x) / transform.zoom,
      y: (Math.random() * 100 + 50 - transform.y) / transform.zoom,
      sequence: assets.length + 1
    };
    
    const nextBoard = calculateAutoLayout([...assets, newAsset]);
    pushHistory(nextBoard);

    setAgentMessages(prev => [...prev, { 
      role: 'model', 
      text: `Asset "${asset.name}" has been approved and moved to the Audit Bench.` 
    }]);
  };

  const callAgent = async (message: string, contextFiles?: File[]) => {
    setIsAgentTyping(true);
    try {
      // NOTE: Ensure apiKey is provided (in AI Studio we use process.env via Vite Define Plugin)
      const ai = new GoogleGenAI({ apiKey: localApiKey || (import.meta as any).env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY! });
      
      const parts: any[] = [{ text: message }];

      if (contextFiles && contextFiles.length > 0) {
        for (const file of contextFiles) {
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1]);
            };
            reader.readAsDataURL(file);
          });
          parts.unshift({
            inlineData: {
              data: base64Data,
              mimeType: file.type
            }
          });
        }
      }

      const model = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          ...agentMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: parts }
        ],
        config: {
          systemInstruction: "You are the 'Director's Agent' for a film production tool. You help the user audit visual assets. You are professional, concise, and focused on film terminology. If a user uploads an image, analyze its composition and quality. Address the user as 'Director Prince'."
        }
      });

      const response = await model;
      setAgentMessages(prev => [...prev, { role: 'model', text: response.text }]);
    } catch (err: any) {
      console.error('Agent Error:', err);
      setAgentMessages(prev => [...prev, { role: 'model', text: `Apologies, Director. I encountered a signal interference (${err?.message || 'Unknown error'}). Please try again.` }]);
    } finally {
      setIsAgentTyping(false);
    }
  };

  const sendAgentMessage = () => {
    if (!agentInput.trim()) return;
    const msg = agentInput.trim();
    setAgentMessages(prev => [...prev, { role: 'user', text: msg }]);
    setAgentInput('');
    callAgent(msg);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let fileList = Array.from(files) as File[];
    if (fileList.length > 7) {
      showToast("Exceeded limit: You can only upload a maximum of 7 items at a time.");
      fileList = fileList.slice(0, 7);
    }

    // 1. Create immediate asset placeholders for zero-latency UI
    const immediateBatch: Asset[] = fileList.map((file, idx) => {
      const type: AssetType = file.type.startsWith('video') ? 'video' : 'image';
      return {
        id: Math.random().toString(36).substr(2, 9),
        type,
        url: URL.createObjectURL(file), // Fast local blob URL
        width: type === 'video' ? 1920 : 1200, 
        height: type === 'video' ? 1080 : 800,
        x: (Math.random() * 100 + 50 - transform.x) / transform.zoom,
        y: (Math.random() * 100 + 50 - transform.y) / transform.zoom,
        sequence: assets.length + idx + 1,
        name: file.name,
        file
      };
    });

    // 2. Add to board immediately using history
    const nextBoard = calculateAutoLayout([...assets, ...immediateBatch]);
    pushHistory(nextBoard);

    // 3. Reset input immediately
    e.target.value = '';

    // 4. Background process for high-res/metadata updates
    fileList.forEach((file, idx) => {
      processFile(file).then(processed => {
        setAssets(current => {
          const updated = current.map(item => {
            if (item.id === immediateBatch[idx].id) {
              return { 
                ...item, 
                url: processed.url, 
                width: processed.width, 
                height: processed.height,
                file: processed.file,
                fileData: processed.fileData
              };
            }
            return item;
          });
          // Silently re-balance always as it is fixed auto-layout
          return calculateAutoLayout(updated);
        });
      });
    });
  };

  const openProject = (project: DBProject) => {
    setCurrentProject(project);
    
    const deserializeAsset = (a: DBAsset): Asset => {
      let url = a.fileData || '';
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
        fileData: a.fileData
      };
    };

    const reconstructedAssets = project.assets.map(deserializeAsset);
    setAssets(reconstructedAssets);

    if (project.agentMessages && project.agentMessages.length > 0) {
      setAgentMessages(project.agentMessages.map(m => ({
        role: m.role,
        text: m.text,
        assets: m.assets ? m.assets.map(deserializeAsset) : undefined
      })));
    } else {
      setAgentMessages([
        { role: 'model', text: "Hello Director Prince. I'm ready to audit your assets. Upload a scene here to begin." }
      ]);
    }

    setPast([]);
    setFuture([]);
    resetView();
    setIsSettingsOpen(false);
    setViewMode('board');
  };

  const handleNewProject = () => {
    const newDbProject: DBProject = {
      id: Math.random().toString(36).substr(2, 9),
      title: `Project ${new Date().toLocaleDateString()}`,
      updatedAt: Date.now(),
      assets: []
    };
    saveProject(newDbProject);
    setProjects(prev => [newDbProject, ...prev]);
    openProject(newDbProject);
  };

  const removeAsset = (id: string) => {
    const filtered = assets.filter(a => a.id !== id);
    // Re-sequence
    const resequenced = filtered.map((a, idx) => ({ ...a, sequence: idx + 1 }));
    pushHistory(resequenced);
  };

  const updateAssetPos = (id: string, x: number, y: number, rotation?: number) => {
    if (isLayoutLocked) return;
    
    let finalX = x;
    let finalY = y;
    
    const newAssets = assets.map(a => 
      a.id === id ? { 
        ...a, 
        x: finalX, 
        y: finalY, 
        rotation: rotation !== undefined ? rotation : a.rotation 
      } : a
    );
    pushHistory(newAssets);
  };

  const zoomIn = () => setTransform(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.1, 3) }));
  const zoomOut = () => setTransform(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.1, 0.2) }));
  const resetView = () => {
    setTransform({ x: 0, y: 0, zoom: 1 });
  };

  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [lastSwappedId, setLastSwappedId] = useState<string | null>(null);
  
  const [deleteSelection, setDeleteSelection] = useState<string[]>([]);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<string | null>(null);

  const handleSelectForDelete = useCallback((id: string, toggle: boolean) => {
    setDeleteSelection(prev => {
      if (toggle) {
        if (prev.includes(id)) {
          return prev.filter(p => p !== id);
        } else {
          return [...prev, id];
        }
      } else {
        if (!prev.includes(id)) return [...prev, id];
        return prev;
      }
    });
  }, []);

  const handleRequestDelete = useCallback((targetId: string) => {
    if (deleteSelection.length > 1) {
      setDeleteConfirmTarget(targetId);
    } else {
      removeAsset(targetId);
      setDeleteSelection(prev => prev.filter(p => p !== targetId));
    }
  }, [deleteSelection.length, removeAsset]); 

  const handleConfirmDelete = (mode: 'single' | 'all') => {
    if (!deleteConfirmTarget) return;
    
    if (mode === 'single') {
       removeAsset(deleteConfirmTarget);
       setDeleteSelection(prev => prev.filter(p => p !== deleteConfirmTarget));
    } else {
       const newAssets = assets.filter(a => !deleteSelection.includes(a.id))
         .map((a, idx) => ({ ...a, sequence: idx + 1 })); // Re-sequence
       pushHistory(newAssets);
       setDeleteSelection([]);
    }
    setDeleteConfirmTarget(null);
  };

  // Layout Config for perfectly fitted storyboard grids
  const getLayoutConfig = () => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const padding = 12; // Outer padding
    const gutter = 4; // Micro-spacing between items to replicate the visual reference
    
    let numColumns = 1;
    if (screenWidth >= 1500) numColumns = 6;
    else if (screenWidth >= 1200) numColumns = 5;
    else if (screenWidth >= 900) numColumns = 4;
    else if (screenWidth >= 600) numColumns = 3;
    else numColumns = 2; // Always perfectly fitted on mobile

    const totalGutterSpace = gutter * (numColumns - 1);
    const availableWidth = screenWidth - (padding * 2) - totalGutterSpace;
    const colWidth = Math.floor(availableWidth / numColumns);
    
    // Tight 16:9 ratio for cinematic production feel
    const itemHeight = colWidth * (9 / 16);
    
    return { padding, gutter, numColumns, colWidth, itemHeight };
  };

  const [layoutConfig, setLayoutConfig] = useState(getLayoutConfig());

  const calculateAutoLayout = useCallback((inputAssets: Asset[], config = layoutConfig) => {
    if (inputAssets.length === 0) return [];

    const { padding, gutter, numColumns, colWidth } = config;
    
    // Sort local copy to ensure correct grid placement calculations
    const sorted = [...inputAssets].sort((a, b) => a.sequence - b.sequence);

    const columnHeights = new Array(numColumns).fill(80);
    const idToPos = new Map<string, { x: number, y: number }>();

    sorted.forEach((asset, idx) => {
      // Use strict columns to naturally preserve order and prevent cascading shifts on swap
      const col = idx % numColumns;

      const x = padding + (col * (colWidth + gutter));
      const y = columnHeights[col];

      // Calculate true height based on aspect ratio
      const aspectRatio = (asset.width && asset.height) ? (asset.height / asset.width) : (9 / 16);
      const itemHeight = colWidth * aspectRatio;

      // Update the column height
      columnHeights[col] += itemHeight + gutter;

      idToPos.set(asset.id, { x, y });
    });

    // CRITICAL: Return in the original array order to prevent React DOM re-ordering which causes flickering/snapping.
    return inputAssets.map(asset => {
      const pos = idToPos.get(asset.id);
      return pos ? { ...asset, x: pos.x, y: pos.y } : asset;
    });
  }, [layoutConfig]);

  useEffect(() => {
    const handleResize = () => {
      const newConfig = getLayoutConfig();
      setLayoutConfig(newConfig);
      setAssets(prev => calculateAutoLayout(prev, newConfig));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateAutoLayout]);

  const swapSequence = (id1: string, id2: string) => {
    setHoveredAssetId(null);
    setSwapSourceId(null);
    setLastSwappedId(id2);
    
    // Success flash duration
    setTimeout(() => setLastSwappedId(null), 1000);

    const asset1 = assets.find(a => a.id === id1);
    const asset2 = assets.find(a => a.id === id2);
    if (!asset1 || !asset2 || id1 === id2) return;

    // Swap sequence only, then re-calculate layout to properly handle different aspect ratios
    // without gaps or overlaps. Strict column layout in calculateAutoLayout prevents cascading shifts.
    const updated = assets.map(a => {
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
  const sortedAssets = React.useMemo(() => 
    [...assets].sort((a, b) => a.sequence - b.sequence),
    [assets]
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
    setViewMode('playback');
  };

  const nextSlide = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % assets.length);
  }, [assets.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + assets.length) % assets.length);
  }, [assets.length]);

  // Auto-advance for images
  useEffect(() => {
    const currentAsset = sortedAssets[currentIndex];
    if (viewMode === 'playback' && currentAsset?.type === 'image') {
      const timer = setTimeout(() => {
        nextSlide();
      }, 5000); // 5 seconds per image
      return () => clearTimeout(timer);
    }
  }, [viewMode, currentIndex, sortedAssets, nextSlide]);

  const clearBoard = () => {
    if (window.confirm('Clear all assets?')) {
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
    const projectToDelete = projects.find(p => p.id === id);
    if (!projectToDelete) return;

    // Immediately remove from UI
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProject?.id === id) {
      setCurrentProject(null);
    }

    // Resolve any previous pending deletion immediately
    if (deletedProjectInfo) {
      clearTimeout(deletedProjectInfo.timeoutId);
      deleteProject(deletedProjectInfo.project.id);
    }

    // Start 7 second timer for this project
    const timeoutId = setTimeout(() => {
      deleteProject(id);
      setDeletedProjectInfo(prev => prev?.project.id === id ? null : prev);
    }, 7000);

    setDeletedProjectInfo({ project: projectToDelete, timeoutId });
  };

  const handleUndoDelete = () => {
    if (deletedProjectInfo) {
      clearTimeout(deletedProjectInfo.timeoutId);
      setProjects(prev => {
        const restored = [...prev, deletedProjectInfo.project];
        return restored.sort((a, b) => b.updatedAt - a.updatedAt);
      });
      setDeletedProjectInfo(null);
    }
  };

  const handleRenameProject = async (project: DBProject) => {
    const newTitle = window.prompt('Enter new project title:', project.title);
    if (newTitle && newTitle.trim() && newTitle !== project.title) {
      const updated = { ...project, title: newTitle.trim(), updatedAt: Date.now() };
      await saveProject(updated);
      setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
      if (currentProject?.id === project.id) {
        setCurrentProject(updated);
      }
    }
  };

  const renderSettings = () => (
    <AnimatePresence>
      {isSettingsOpen && (
        <motion.div
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          style={{ position: 'fixed', inset: 0, background: 'black', zIndex: 999999, pointerEvents: 'auto' }}
          className="fixed inset-0 z-[999999] bg-[#030303] flex flex-col"
        >
          {/* Settings Header */}
          <header className="p-6 md:p-8 flex items-center gap-4 border-b border-white/5 sticky top-0 bg-[#030303]/80 backdrop-blur-3xl z-20">
            <button 
              onPointerDown={(e) => {
                e.stopPropagation();
                if (settingsPage === 'main') {
                  setIsSettingsOpen(false);
                } else {
                  setSettingsPage('main');
                }
              }}
              className="p-3 bg-white/5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all liquid-glass"
            >
              {settingsPage === 'main' ? <X size={24} /> : <ChevronLeft size={24} />}
            </button>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">
              {settingsPage === 'main' ? 'Settings' : settingsPage === 'api' ? 'API Connections' : settingsPage === 'agent' ? 'Agents' : settingsPage === 'appearance' ? 'Workspace Layout' : settingsPage === 'haptics' ? 'Sound & Haptics' : settingsPage.charAt(0).toUpperCase() + settingsPage.slice(1)}
            </h2>
          </header>

          <div className="flex-1 overflow-y-auto no-scrollbar p-6 md:p-12">
            <div className="max-w-2xl mx-auto w-full space-y-10">
              
              {settingsPage === 'main' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* General Section */}
                  <div className="space-y-4">
                     <h4 className="text-[0.625rem] font-black uppercase tracking-[0.4em] text-white/20 px-4">System Configuration</h4>
                     <div className="grid gap-4">
                        <button 
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setTimeout(() => setSettingsPage('agent'), 350);
                          }}
                          className="w-full liquid-glass rounded-[2rem] p-6 border border-white/5 flex items-center justify-between group active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 group-hover:text-white group-hover:bg-indigo-500/20 transition-all">
                              <MessageSquare size={20} />
                            </div>
                            <div className="flex flex-col items-start translate-y-0.5">
                              <span className="text-sm font-bold text-white tracking-tight">Agents</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Neural Assistant Models</span>
                            </div>
                          </div>
                          <ChevronRight className="text-slate-600 group-hover:text-white transition-colors" size={18} />
                        </button>

                        <button 
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setTimeout(() => setSettingsPage('haptics'), 350);
                          }}
                          className="w-full liquid-glass rounded-[2rem] p-6 border border-white/5 flex items-center justify-between group active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 group-hover:text-white group-hover:bg-emerald-500/20 transition-all">
                              <Magnet size={20} />
                            </div>
                            <div className="flex flex-col items-start translate-y-0.5">
                              <span className="text-sm font-bold text-white tracking-tight">Sound & Haptics</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Feedback Customization</span>
                            </div>
                          </div>
                          <ChevronRight className="text-slate-600 group-hover:text-white transition-colors" size={18} />
                        </button>

                        <button 
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setTimeout(() => setSettingsPage('appearance'), 350);
                          }}
                          className="w-full liquid-glass rounded-[2rem] p-6 border border-white/5 flex items-center justify-between group active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 group-hover:text-white group-hover:bg-blue-500/20 transition-all">
                              <Sliders size={20} />
                            </div>
                            <div className="flex flex-col items-start translate-y-0.5">
                              <span className="text-sm font-bold text-white tracking-tight">Workspace Layout</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Responsive Interface Design</span>
                            </div>
                          </div>
                          <ChevronRight className="text-slate-600 group-hover:text-white transition-colors" size={18} />
                        </button>
                        
                        <button 
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setTimeout(() => setSettingsPage('api'), 350);
                          }}
                          className="w-full liquid-glass rounded-[2rem] p-6 border border-white/5 flex items-center justify-between group active:scale-[0.98] transition-all"
                        >
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 group-hover:text-white group-hover:bg-orange-500/20 transition-all">
                              <Lock size={20} />
                            </div>
                            <div className="flex flex-col items-start translate-y-0.5">
                              <span className="text-sm font-bold text-white tracking-tight">API Connections</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Neural Protocols Access</span>
                            </div>
                          </div>
                          <ChevronRight className="text-slate-600 group-hover:text-white transition-colors" size={18} />
                        </button>
                     </div>
                  </div>
                </motion.div>
              )}

              {settingsPage === 'agent' && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                   <div className="flex flex-col gap-2 mb-10">
                     <h4 className="text-[0.625rem] font-black uppercase tracking-[0.4em] text-emerald-400">Assistant Deployment</h4>
                     <p className="text-slate-500 text-sm font-medium leading-relaxed">Select the neural entity that will assist with your storyboard auditing. Each entity has distinct behavioral parameters.</p>
                   </div>

                   <div className="grid gap-6">
                      {/* Blue Agent */}
                      <button 
                        onClick={() => {
                          setAgentSettings(prev => ({ ...prev, type: 'blue' }));
                          triggerHaptic('medium');
                        }}
                        className={`w-full liquid-glass rounded-[2rem] p-8 border transition-all flex items-center justify-between group ${agentSettings.type === 'blue' ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_50px_rgba(99,102,241,0.2)]' : 'border-white/5 hover:border-white/20'}`}
                      >
                         <div className="flex items-center gap-6">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-indigo-600/20 border border-indigo-400 shadow-2xl relative overflow-hidden group-hover:scale-105 transition-transform flex items-center justify-center">
                               <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                               <div className="flex gap-1.5 items-center justify-center relative z-10">
                                 <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_white]" />
                                 <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_8px_white]" />
                               </div>
                            </div>
                            <div className="flex flex-col items-start translate-y-1">
                              <span className="text-xl font-black text-white tracking-tight">Protégé Blue</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Directorial Standard</span>
                            </div>
                         </div>
                         {agentSettings.type === 'blue' && (
                           <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black">
                             <Check size={18} strokeWidth={3} />
                           </div>
                         )}
                      </button>

                      {/* Emoji Agent */}
                      <button 
                        onClick={() => {
                          setAgentSettings(prev => ({ ...prev, type: 'emoji' }));
                          triggerHaptic('medium');
                        }}
                        className={`w-full liquid-glass rounded-[2rem] p-8 border transition-all flex items-center justify-between group ${agentSettings.type === 'emoji' ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.2)]' : 'border-white/5 hover:border-white/20'}`}
                      >
                         <div className="flex items-center gap-6">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-emerald-500 flex items-center justify-center text-4xl shadow-2xl relative overflow-hidden group-hover:scale-105 transition-transform">
                               <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent opacity-50" />
                               🫠
                            </div>
                            <div className="flex flex-col items-start translate-y-1">
                              <span className="text-xl font-black text-white tracking-tight">Emoji Companion</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Dynamic Persona</span>
                            </div>
                         </div>
                         {agentSettings.type === 'emoji' && (
                           <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-black">
                             <Check size={18} strokeWidth={3} />
                           </div>
                         )}
                      </button>

                      {/* Ghost Agent (Soon) */}
                      <div 
                        className={`w-full liquid-glass rounded-[2rem] p-8 border border-white/5 opacity-40 flex items-center justify-between cursor-not-allowed`}
                      >
                         <div className="flex items-center gap-6">
                            <div className="w-20 h-20 rounded-[1.5rem] bg-slate-800 flex items-center justify-center text-4xl shadow-2xl relative overflow-hidden">
                               👻
                            </div>
                            <div className="flex flex-col items-start translate-y-1">
                              <span className="text-xl font-black text-slate-400 tracking-tight">Ghost Scribe</span>
                              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-1">Signal Lost</span>
                            </div>
                         </div>
                         <span className="px-4 py-1.5 rounded-full bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/20 border border-white/5">Coming Soon</span>
                      </div>
                   </div>
                </motion.div>
              )}

              {settingsPage === 'appearance' && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-10"
                >
                   <div className="space-y-4">
                     <div className="flex items-center justify-between px-4">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Interface Scaling</span>
                        <span className="text-xs font-mono text-emerald-400">{Math.round(fontScale * 100)}%</span>
                     </div>
                     
                     <div className="liquid-glass rounded-3xl p-8 border border-white/5 space-y-8">
                        <div className="flex items-center gap-6">
                          <button 
                            onClick={() => setFontScale(prev => Math.max(0.7, prev - 0.05))}
                            className="w-16 h-16 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all liquid-glass active:scale-95"
                          >
                            <ZoomOut size={24} />
                          </button>
                          
                          <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden relative shadow-inner">
                            <motion.div 
                              className="absolute inset-y-0 left-0 bg-emerald-500 shadow-[0_0_15px_#10b981]"
                              animate={{ width: `${((fontScale - 0.7) / (1.5 - 0.7)) * 100}%` }}
                            />
                          </div>
                          
                          <button 
                            onClick={() => setFontScale(prev => Math.min(1.5, prev + 0.05))}
                            className="w-16 h-16 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all liquid-glass active:scale-95"
                          >
                            <ZoomIn size={24} />
                          </button>
                        </div>
                        
                        <button 
                          onClick={() => setFontScale(1.0)}
                          className="w-full py-5 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                        >
                          Restore System Baseline
                        </button>
                     </div>
                   </div>
                   
                   <div className="p-8 liquid-glass rounded-3xl border border-white/5 text-center">
                      <p className="text-[11px] leading-relaxed text-slate-500 font-medium italic opacity-70">
                        "True design is the clarity between space and intent. Adjusting the scale updates every relative viewport coordinate in real-time."
                      </p>
                   </div>
                </motion.div>
              )}

              {settingsPage === 'haptics' && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-10"
                >
                   <div className="liquid-glass rounded-3xl p-10 border border-emerald-500/20 text-center space-y-8 relative overflow-hidden">
                     <div className="relative z-10 w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                        <motion.div
                          animate={{ x: [-2, 2, -2, 2, 0] }}
                          transition={{ repeat: Infinity, duration: 0.1 }}
                        >
                          <Magnet size={40} className="text-emerald-400" />
                        </motion.div>
                     </div>
                     
                     <div className="relative z-10 space-y-4">
                        <h5 className="text-2xl font-black text-white tracking-tight uppercase">Haptic Engine</h5>
                        <p className="text-sm text-slate-500 font-medium">Toggle physical feedback across the directorial interface. This affects button presses, tool selection, and state transitions.</p>
                     </div>

                     <button
                       onClick={() => {
                         setAgentSettings(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }));
                         if (!agentSettings.soundEnabled) triggerHaptic('success');
                       }}
                       className={`relative z-10 w-full py-6 rounded-[2rem] transition-all font-black text-xs uppercase tracking-[0.4em] overflow-hidden ${agentSettings.soundEnabled ? 'liquid-glass-emerald bg-emerald-500/20 text-emerald-100 border-emerald-500/30' : 'bg-white/5 text-slate-600 border-white/5'}`}
                     >
                       <div className="relative z-10">{agentSettings.soundEnabled ? 'Engaged' : 'Disconnected'}</div>
                       {agentSettings.soundEnabled && (
                         <motion.div 
                           className="absolute inset-0 bg-emerald-400/10"
                           animate={{ opacity: [0.1, 0.3, 0.1] }}
                           transition={{ repeat: Infinity, duration: 2 }}
                         />
                       )}
                     </button>
                   </div>
                </motion.div>
              )}

              {settingsPage === 'api' && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-10"
                >
                   <div className="liquid-glass rounded-3xl p-10 border border-white/5 space-y-8 relative overflow-hidden">
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Lock className="w-4 h-4 text-emerald-400 opacity-50" />
                          <h4 className="text-[0.625rem] font-black uppercase tracking-[0.4em] text-white/40">Neural API Access</h4>
                        </div>
                        <div className="relative">
                          <input 
                            type="password" 
                            value={localApiKey}
                            onChange={(e) => setLocalApiKey(e.target.value)}
                            placeholder="Gemini Protocol Key" 
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] focus:outline-none focus:border-emerald-500/50 transition-all font-mono tracking-widest placeholder:text-slate-700 placeholder:tracking-normal"
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium opacity-70 italic">Verified channel required for high-throughput directorial analysis.</p>
                      </div>
                   </div>
                </motion.div>
              )}

            </div>
          </div>
          
          {/* Footer Signature */}
          <footer className="p-8 text-center opacity-10 flex flex-col items-center">
             <div className="w-8 h-[1px] bg-white mb-4" />
             <span className="text-[10px] font-black uppercase tracking-[1em] text-white">Directorial Terminal v4.0.7</span>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );

if (viewMode === 'dashboard') {
    return (
      <div className="fixed inset-0 bg-[#030303] text-slate-100 font-sans overflow-y-auto overflow-x-hidden no-scrollbar pb-24 selection:bg-emerald-500/30">
        
        {/* Background Ambient Lighting - Premium Studio Aesthetics */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[80vh] bg-gradient-to-b from-indigo-500/10 via-emerald-500/5 to-transparent opacity-40" />
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/[0.05] blur-[140px]" />
          <div className="absolute bottom-[20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/[0.05] blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-[1440px] mx-auto flex flex-col min-h-screen">
          
          {/* Sticky Refined Header */}
          <header className="sticky top-0 z-[110] w-full px-8 md:px-16 py-6 md:py-8 flex items-center justify-between bg-[#030303]/70 backdrop-blur-2xl border-b border-white/[0.05] transition-all duration-500 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Top Gloss Line */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50" />
            
            <div className="flex flex-col">
               <h1 className="text-3xl md:text-5xl font-black font-display tracking-tight text-white/95 leading-none">
                 STUDIO<span className="text-emerald-400">RIPE</span>
               </h1>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="hidden lg:flex flex-col items-end text-right opacity-20 mr-4">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.5em] mb-1">Secure Channel</span>
                <span className="text-[10px] font-mono text-white/30 tracking-tighter">0xCC..4FD7</span>
              </div>

              {/* Settings Toggle */}
              <button 
                style={{ zIndex: 9999999, pointerEvents: 'auto', position: 'relative' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSettingsPage('main');
                  setIsSettingsOpen(true);
                }}
                className={`p-4 rounded-full transition-all duration-700 scale-90 md:scale-100 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 ring-1 ring-white/5 shadow-lg active:scale-95 relative z-[9999999]`}
              >
                <Settings size={20} />
              </button>
            </div>
          </header>
          
          {/* Top Video Template Carousel - Virtual Infinite Loop */}
          <div className="w-full pt-2 md:pt-4 pb-8 md:pb-12 flex flex-col items-center overflow-hidden">
            
            <div 
              className="relative w-full h-[320px] md:h-[450px] flex items-center justify-center pointer-events-auto group/carousel touch-pan-y"
              /* onMouseEnter={handleTemplateInteraction}
              onTouchStart={handleTemplateInteraction} */
              style={{ transform: 'translateZ(0)', touchAction: 'pan-y' }}
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
                
                const isActive = absOffset < 1.9;
                const scale = 1 - (absOffset * 0.12);
                const opacity = 1 - (absOffset * 0.55);
                const zIndex = 100 - Math.floor(absOffset * 10);

                return (
                  <motion.div
                    key={idx} // Strictly stable key for smooth position lifecycle
                    onClick={() => {
                      if (isActive && tpl.type === 'video') {
                         setIsAgentMode(true);
                         setAgentMessages([
                           { role: 'model', text: `Template initialized: ${tpl.title}. Upload session assets to begin the audit.` }
                         ]);
                      } else {
                         setActiveTemplate(idx);
                      }
                      handleTemplateInteraction();
                    }}
                    initial={false}
                    animate={{ x, scale, opacity, zIndex }}
                    transition={{ 
                      type: 'spring', 
                      stiffness: 350, 
                      damping: 34,
                      mass: 0.8,
                      restDelta: 0.005,
                      restSpeed: 0.005
                    }}
                    style={{ 
                      willChange: 'transform, opacity',
                      backfaceVisibility: 'hidden',
                      transformStyle: 'preserve-3d',
                      WebkitFontSmoothing: 'antialiased'
                    }}
                    className={`absolute w-[202px] h-[302px] md:w-[302px] md:h-[432px] rounded-[2.5rem] md:rounded-[3.5rem] overflow-hidden shadow-2xl bg-black cursor-pointer group
                      ${isActive ? 'ring-1 ring-emerald-400/20' : 'ring-1 ring-white/5 opacity-30'}
                    `}
                  >
                    <div className="absolute inset-0 scale-[1.01] rounded-[inherit] overflow-hidden">
                      {tpl.type === 'video' ? (
                        <TemplateVideo 
                          src={tpl.src || ''} 
                          isActive={isActive}
                          absOffset={absOffset}
                          className="" 
                        />
                      ) : (
                        <img src={tpl.src} alt={tpl.title} className="w-full h-full object-cover" />
                      )}
                      
                      {/* Depth Overlays */}
                      <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
                      
                      <div className="absolute inset-x-0 bottom-10 md:bottom-16 flex flex-col items-center justify-end z-10 px-8 text-center pointer-events-none">
                         <span className="font-bold text-2xl md:text-3xl text-white/90 font-display leading-[0.85] tracking-tight translate-y-3 group-hover:translate-y-0 transition-transform duration-700 ease-out">
                           {tpl.title.toUpperCase()}
                         </span>
                         <span className="font-bold text-[8px] text-emerald-400/40 mt-5 uppercase tracking-[0.5em]">
                           {tpl.label?.replace('- ', '')}
                         </span>
                      </div>

                      {/* Glass Finish */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent pointer-events-none mix-blend-overlay" />
                      <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.03] pointer-events-none rounded-[2rem] md:rounded-[3rem]" />
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
                        scale: { repeat: Infinity, duration: 2, ease: "easeInOut" }
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9, transition: { duration: 0.05 } }}
                      onClick={handlePrevTemplate}
                      className="absolute left-4 md:left-12 z-[110] w-12 h-12 md:w-16 md:h-16 rounded-full liquid-glass-emerald bg-emerald-500/10 border-emerald-500/20 flex items-center justify-center text-white/90 hover:text-emerald-400 transition-colors shadow-2xl group/nav"
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
                        scale: { repeat: Infinity, duration: 2, ease: "easeInOut" }
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9, transition: { duration: 0.05 } }}
                      onClick={handleNextTemplate}
                      className="absolute right-4 md:right-12 z-[110] w-12 h-12 md:w-16 md:h-16 rounded-full liquid-glass-emerald bg-emerald-500/10 border-emerald-500/20 flex items-center justify-center text-white/90 hover:text-emerald-400 transition-colors shadow-2xl group/nav"
                    >
                      <ChevronRight className="w-6 h-6 md:w-8 md:h-8 group-hover/nav:scale-110 transition-transform" />
                    </motion.button>
                  </>
                )}
              </AnimatePresence>
            </div>
            
            {/* Pagination Controls */}
            <div className="flex items-center gap-4 mt-6 md:mt-10">
              {TEMPLATES.map((_, i) => {
                const total = TEMPLATES.length;
                const currentActual = ((activeTemplate % total) + total) % total;
                const isSelected = i === Math.round(currentActual);

                return (
                  <div 
                    key={i} 
                    onClick={() => {
                      const closest = Math.round((activeTemplate - i) / total) * total + i;
                      setActiveTemplate(closest);
                    }}
                    className={`h-1 rounded-full transition-all duration-700 cursor-pointer ${
                      isSelected 
                        ? 'w-10 bg-emerald-400 shadow-[0_0_20px_#10b981]' 
                        : 'w-2 bg-white/10 hover:bg-white/30'
                    }`} 
                  />
                );
              })}
            </div>
          </div>

          {/* Spacer to bridge sections with continuity */}
          <div className="w-full h-8 md:h-12" />

          {/* Projects Collection Section - Premium Bento Organization */}
          <div className="flex-1 px-8 md:px-16 pb-48 relative">
            {/* Background Atmosphere */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="absolute top-1/4 left-0 w-[400px] h-[400px] bg-white/[0.02] blur-[100px] rounded-full -translate-x-1/2 pointer-events-none" />
            
            <div className="mb-8 flex items-end justify-between border-b border-white/[0.03] pb-6 relative z-10">
               <div className="flex flex-col">
                  <span className="text-[0.625rem] font-black text-slate-700 uppercase tracking-[0.5em] mb-4">Historical Records</span>
                  <h3 className="text-4xl md:text-5xl font-black tracking-tight text-white/95 font-display flex items-center gap-5">
                    Active Projects
                    <span className="w-2 h-2 rounded-full bg-emerald-500/20 block" />
                  </h3>
               </div>
               <div className="flex items-center gap-8 mb-1">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                      <span className="text-[0.5625rem] font-black text-slate-700 uppercase tracking-[0.2em] leading-tight">Saved</span>
                      <span className="text-[0.6875rem] font-black text-slate-500 uppercase tracking-[0.3em] leading-tight">Nodes</span>
                    </div>
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.4)] ring-4 ring-emerald-500/10">
                      <span className="text-xl md:text-2xl font-black text-black tabular-nums tracking-tighter">
                        {projects.length.toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
               </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {projects.length === 0 ? (
                <div className="col-span-full py-40 flex flex-col items-center justify-center liquid-glass rounded-[4rem] border-white/5 opacity-50 text-center">
                   <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-8">
                      <Layout className="w-8 h-8 text-slate-400" />
                   </div>
                   <h4 className="text-xl font-bold font-display text-white mb-2">Archive Ready</h4>
                   <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em]">Start a new directorial session above</p>
                </div>
              ) : (
                projects.map(project => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    onOpen={() => openProject(project)} 
                    onDelete={() => handleDeleteProject(project.id)} 
                    onRename={() => handleRenameProject(project)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Floating Action: New Project - Premium Glass Card */}
        <AnimatePresence>
          {!isSettingsOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100]"
            >
              <button 
                onClick={handleNewProject}
                className="w-56 h-36 md:w-72 md:h-44 flex flex-col items-center justify-center gap-6 rounded-[3.5rem] md:rounded-[4rem] liquid-glass-emerald bg-emerald-600/15 border-emerald-400/30 text-white transition-all duration-700 hover:scale-[1.02] active:scale-95 group shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] overflow-hidden relative"
              >
                 <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none opacity-20" />
                 <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-emerald-400/10 flex items-center justify-center ring-1 ring-emerald-400/20 group-hover:bg-emerald-400/20 transition-colors">
                   <Plus className="w-7 h-7 md:w-8 md:h-8 text-emerald-400 group-hover:scale-110 transition-transform duration-500" strokeWidth={2} />
                 </div>
                 <span className="font-bold text-sm md:text-base tracking-[0.2em] uppercase text-emerald-100 group-hover:text-white transition-colors">New session</span>
                 
                 {/* Studio Glass Refinement */}
                 <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent opacity-10 pointer-events-none" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {deletedProjectInfo && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 50, x: '-50%' }}
              animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, scale: 0.9, y: 50, x: '-50%' }}
              className="fixed bottom-8 max-md:bottom-28 left-1/2 z-[200] liquid-glass px-6 py-4 rounded-[2rem] flex items-center gap-6 border-white/5 shadow-2xl backdrop-blur-3xl"
            >
              <div className="flex flex-col">
                <span className="text-white/90 font-semibold">{deletedProjectInfo.project.title}</span>
                <span className="text-white/50 text-[10px] tracking-widest uppercase">Project Deleted</span>
              </div>
              <button
                onClick={handleUndoDelete}
                className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-bold tracking-widest uppercase text-xs px-5 py-2.5 rounded-full transition-all ring-1 ring-emerald-500/30 liquid-glass"
              >
                Undo
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Shared Overlays in Dashboard (Settings / Toast) --- */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -50, x: '-50%' }}
              className="fixed top-8 left-1/2 z-[200] bg-orange-600/90 text-white px-6 py-3 rounded-full text-sm font-semibold shadow-[0_0_30px_rgba(234,88,12,0.4)] backdrop-blur-md border border-white/20 whitespace-nowrap overflow-hidden text-ellipsis liquid-glass"
            >
              {toastMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {renderSettings()}

      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 text-slate-100 font-sans overflow-hidden select-none flex">
      <FloatingAgent 
        onClick={() => setIsAgentMode(true)} 
        isVisible={(viewMode === 'board' || viewMode === 'dashboard') && isToolbarExpanded && !isAgentMode}
        type={agentSettings.type}
        soundEnabled={agentSettings.soundEnabled}
        currentProjectTitle={currentProject?.title}
        lastMessage={agentMessages[agentMessages.length - 1]?.text}
      />
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
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
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed inset-0 bg-slate-950 flex flex-col z-[100]"
          >
            <div className="p-5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
              <div className="flex flex-col">
                <h2 className="text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">Director's Agent</h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Audit Active</span>
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
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`max-w-[85%] p-4 rounded-2xl text-[13px] leading-relaxed shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-none' 
                        : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_li]:mb-1 [&_strong]:text-slate-100'
                    }`}>
                      {msg.role === 'model' ? (
                        <div className="markdown-body">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                    {msg.assets && msg.assets.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 w-full max-w-[90%]">
                        {msg.assets.map(asset => (
                          <div key={asset.id} className="relative group rounded-xl overflow-hidden aspect-video border border-slate-800 bg-slate-900 shadow-xl">
                            {asset.type === 'video' ? (
                              <div className="w-full h-full flex items-center justify-center bg-black/40">
                                <Film className="w-8 h-8 text-slate-500" />
                              </div>
                            ) : (
                              <img src={asset.url} className="w-full h-full object-contain" />
                            )}
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-300">
                              <p className="text-[10px] text-slate-400 mb-2 font-medium px-2 text-center line-clamp-1">{asset.name}</p>
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
                    if (e.key === 'Enter' && !e.shiftKey) {
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
                    ${!agentInput.trim() || isAgentTyping 
                      ? 'bg-blue-600/5 text-slate-700 cursor-not-allowed opacity-30' 
                      : 'bg-blue-500/20 backdrop-blur-xl border border-blue-400/30 text-blue-400 hover:bg-blue-500/30 shadow-lg'}
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
      <button 
        style={{ zIndex: 9999999, pointerEvents: 'auto' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setSettingsPage('main');
          setIsSettingsOpen(true);
        }}
        className="fixed top-8 right-8 z-[9999999] p-4 rounded-full transition-all duration-700 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 ring-1 ring-white/5 shadow-lg active:scale-95"
        title="Settings"
      >
        <Settings size={20} />
      </button>

      {/* --- Main Board --- */}
      {viewMode === 'board' && (
        <div className="flex-1 relative w-full h-full bg-slate-950">
          
          {/* Floating Toolbar (Transparent Liquid Glass) - Centered at the top */}
          <motion.div 
            layout
            className={`fixed top-[32px] left-1/2 -translate-x-1/2 z-50 transition-all duration-700
              ${isToolbarExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}
            `}
            style={{ transformOrigin: 'center' }}
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
                ${arrangeStatus === 'scanning_yellow' ? 'bg-[#FACC15]/20 border border-[#FACC15]/50 shadow-[0_20px_40px_rgba(250,204,21,0.3),0_0_20px_rgba(250,204,21,0.2)]' : 
                  arrangeStatus === 'scanning_green' ? 'bg-[#00FF7F]/20 border border-[#00FF7F]/50 shadow-[0_20px_40px_rgba(0,255,127,0.3),0_0_20px_rgba(0,255,127,0.2)]' : 
                  'bg-white/[0.05] border border-emerald-500/30 shadow-[0_20px_40px_rgba(0,0,0,0.4),0_0_15px_rgba(16,185,129,0.15)]'}
              `} 
              style={{ transformOrigin: 'center' }}
            >
              {/* Flex Toolbar - 7 Buttons, uniform circular */}
              <div className="flex flex-nowrap justify-between items-center sm:gap-[8px]">
                <button onClick={() => setViewMode('dashboard')} className="w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full liquid-glass flex items-center justify-center transition-all active:scale-90 border-white/5 group sm:translate-y-1 ml-[8px] sm:ml-0" title="Home">
                  <Home size={26} strokeWidth={2} color="#00FF7F" className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity" />
                </button>

                <button onClick={undo} disabled={past.length === 0} className="w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full liquid-glass flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border-white/5 group sm:-translate-y-1" title="Undo">
                  <Undo2 size={26} strokeWidth={2} color="#00FF7F" className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity" />
                </button>

                <button onClick={redo} disabled={future.length === 0} className="w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full liquid-glass flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border-white/5 group sm:-translate-y-3" title="Redo">
                  <Redo2 size={26} strokeWidth={2} color="#00FF7F" className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity" />
                </button>

                <button onClick={() => fileInputRef.current?.click()} className="w-[14vw] h-[14vw] max-w-[56px] max-h-[56px] shrink-0 max-[500px]:-translate-y-[5px] sm:w-[68px] sm:h-[68px] sm:max-w-none sm:max-h-none sm:-translate-y-[16px] rounded-full liquid-glass flex items-center justify-center transition-all active:scale-90 border-white/5 sm:mx-1 group shadow-[0_0_15px_rgba(0,255,127,0.2)] relative z-10" title="Add Media">
                  <Plus size={32} strokeWidth={2.5} color="#00FF7F" className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100 transition-opacity" />
                </button>

                <button 
                  onClick={() => { const next = !isLayoutLocked; setIsLayoutLocked(next); if (next) autoArrange(); }} 
                  className={`w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full transition-all duration-500 flex items-center justify-center relative overflow-hidden group sm:-translate-y-3
                    liquid-glass border-white/5 ${isLayoutLocked ? 'shadow-[0_0_15px_rgba(0,255,127,0.2)]' : ''}
                  `} 
                  title={isLayoutLocked ? "Unlock Layout" : "Lock Layout"}
                >
                  <motion.div
                    animate={showLockHint ? { y: [0, -5, 0] } : {}}
                    transition={{ duration: 0.5, repeat: showLockHint ? Infinity : 0 }}
                  >
                    {isLayoutLocked ? <Lock size={26} strokeWidth={2} color="#00FF7F" className="drop-shadow-[0_0_8px_rgba(0,255,127,0.8)]" /> : <Unlock size={26} strokeWidth={2} color="#00FF7F" className="drop-shadow-[0_0_5px_rgba(0,255,127,0.4)] opacity-70" />}
                  </motion.div>
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none opacity-20" />
                </button>

                <button 
                  onClick={handleAutoArrange} 
                  className={`w-[12vw] h-[12vw] max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full transition-all duration-300 flex items-center justify-center relative overflow-hidden group border-white/5 sm:-translate-y-1
                    liquid-glass ${arrangeStatus === 'error' ? 'shadow-[0_0_20px_rgba(255,48,80,0.4)] border-red-500/30' : arrangeStatus === 'success' ? 'shadow-[0_0_20px_rgba(0,255,127,0.4)] border-[#00FF7F]/30' : ''}
                  `}
                  title="Auto Arrange"
                >
                  <motion.div
                    animate={
                      arrangeStatus === 'scanning_yellow' || arrangeStatus === 'scanning_green' ? { scale: [1, 1.15, 1] } : 
                      arrangeStatus === 'error' ? { x: [-4, 4, -4, 4, 0] } :
                      { rotate: 0, scale: 1, x: 0 }
                    }
                    transition={
                      arrangeStatus === 'scanning_yellow' || arrangeStatus === 'scanning_green' ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" } : 
                      arrangeStatus === 'error' ? { duration: 0.4, ease: "easeInOut" } :
                      { duration: 0.3 }
                    }
                    className="relative z-20"
                  >
                    <Magnet size={26} strokeWidth={2} color={arrangeStatus === 'error' ? '#FF3050' : '#00FF7F'} className={arrangeStatus === 'error' ? 'drop-shadow-[0_0_8px_rgba(255,48,80,0.8)]' : 'drop-shadow-[0_0_8px_rgba(0,255,127,0.8)] opacity-90 group-hover:opacity-100'} />
                  </motion.div>
                  
                  <div className={`absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none transition-opacity duration-300 z-10 ${arrangeStatus !== 'idle' ? 'opacity-0' : 'opacity-20'}`} />
                </button>

                <button onClick={() => setViewMode('playback')} disabled={assets.length === 0} className="w-[12vw] h-[12vw] mr-[8px] sm:mr-0 max-w-[48px] max-h-[48px] sm:w-[56px] sm:h-[56px] sm:max-w-none sm:max-h-none shrink-0 rounded-full bg-gradient-to-tr from-[#FF8800] to-[#FFAA00] shadow-[0_0_20px_rgba(255,136,0,0.6)] flex items-center justify-center disabled:opacity-20 transition-all active:scale-90 border-transparent relative overflow-hidden group hover:shadow-[0_0_30px_rgba(255,136,0,0.8)] sm:translate-y-1" title="Play">
                  <Play size={26} fill="white" color="white" className="ml-[2px]" />
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
                setTransform(prev => ({
                  ...prev,
                  x: prev.x + e.movementX,
                  y: prev.y + e.movementY
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
                const distance = Math.hypot(touch1.pageX - touch2.pageX, touch1.pageY - touch2.pageY);
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
                const distance = Math.hypot(touch1.pageX - touch2.pageX, touch1.pageY - touch2.pageY);
                
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
                  y: anchorY - (anchorY - startY) * (newZoom / startZoom)
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
                backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                backgroundPosition: `${transform.x}px ${transform.y}px`
              }}
            />

            {/* Assets Container */}
            <motion.div 
              className={`absolute inset-0 origin-top-left ${isMultiTouch ? 'pointer-events-none' : 'pointer-events-auto'}`}
              animate={{ 
                x: transform.x, 
                y: transform.y,
                scale: transform.zoom
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
                  onUpdate={(x, y, rotation) => updateAssetPos(asset.id, x, y, rotation)}
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
                />
              ))}
            </motion.div>
          </div>


          {/* Tutorial / Empty State */}
          {assets.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
              <Upload className="w-16 h-16 mb-4 opacity-20 text-blue-500" />
              <h3 className="text-lg font-medium text-slate-300 mb-2 tracking-wide">Audit Bench Empty</h3>
              <p className="text-sm">Drag files here or click + to upload</p>
              <p className="text-[10px] uppercase tracking-widest mt-3 opacity-50 text-blue-400">Cinematic Inspection Ready</p>
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
          <footer className="absolute bottom-4 left-4 z-50 text-[10px] text-slate-500 uppercase tracking-tighter">
            Assets: {assets.length} • Screen: Pixel 7 Optimized
          </footer>
        </div>
      )}

      {/* --- Fullscreen Playback --- */}
      <AnimatePresence>
        {viewMode === 'playback' && sortedAssets.length > 0 && (
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
                  <div key={asset.id} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-white"
                      initial={{ width: 0 }}
                      animate={{ 
                        width: idx === currentIndex ? "100%" : idx < currentIndex ? "100%" : "0%" 
                      }}
                      transition={{ 
                        duration: idx === currentIndex ? (sortedAssets[currentIndex].type === 'video' ? 0 : 5) : 0.3,
                        ease: "linear"
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
                  onClick={() => setViewMode('board')}
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
                  key={sortedAssets[currentIndex]?.id || 'empty'}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="max-w-full max-h-full flex items-center justify-center relative"
                >
                  {/* Background Loader */}
                  <div className="absolute inset-0 flex items-center justify-center text-white/10 -z-10">
                    {sortedAssets[currentIndex]?.type === 'video' ? <Film size={64} /> : <ImageIcon size={64} />}
                  </div>
                  
                  {sortedAssets[currentIndex]?.type === 'image' ? (
                    <img 
                      src={sortedAssets[currentIndex].url} 
                      alt="story" 
                      decoding="async"
                      className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm"
                    />
                  ) : sortedAssets[currentIndex]?.type === 'video' ? (
                    <video 
                      src={sortedAssets[currentIndex].url} 
                      autoPlay 
                      loop 
                      muted={false}
                      onEnded={nextSlide}
                      className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm"
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
              <h3 className="text-2xl font-black mb-2 text-white tracking-tight">Delete Assets</h3>
              <p className="text-slate-400 text-[13px] leading-relaxed mb-8">
                You have multiple assets selected for deletion. Do you want to delete just this asset, or delete all {deleteSelection.length} selected assets?
              </p>
              <div className="flex flex-col gap-3 relative z-10">
                <button
                  onClick={() => handleConfirmDelete('all')}
                  className="bg-indigo-600/20 backdrop-blur-xl hover:bg-indigo-600/30 text-indigo-100 font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 border border-indigo-500/40 shadow-lg active:scale-95 group"
                >
                  <Trash2 size={20} className="group-hover:rotate-12 transition-transform" />
                  Delete All Selected ({deleteSelection.length})
                </button>
                <button
                  onClick={() => handleConfirmDelete('single')}
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
  onSwap: (id1: string, id2: string) => void;
  isHovered?: boolean;
  isLocked: boolean;
  setHoveredTarget: (id: string | null) => void;
  swapSourceId: string | null;
  setSwapSourceId: (id: string | null) => void;
  lastSwappedId: string | null;
  zoom: number;
  isMultiTouch: boolean;
  width: number;
  triggerHaptic: (type?: 'light' | 'medium' | 'success') => void;
}

const DraggableAsset = React.memo<DraggableAssetProps>(({ 
  asset, 
  onRemove, 
  onSelectForDelete,
  isDeleteSelected,
  isDeleteModeActive,
  onUpdate, 
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
  triggerHaptic
}) => {
  const [hadMultiTouch, setHadMultiTouch] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
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
        Math.pow(moveEvent.clientY - startY, 2)
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

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', () => {
      window.removeEventListener('pointermove', handleMove);
    }, { once: true });

    // Long press logic for swapping
    longPressTimer.current = setTimeout(() => {
      if (swapSourceId === asset.id) {
        setSwapSourceId(null);
        triggerHaptic('medium');
      } else if (!swapSourceId) {
        setSwapSourceId(asset.id);
        triggerHaptic('medium');
      } else if (swapSourceId !== asset.id) {
        setHoveredTarget(asset.id);
        triggerHaptic('medium');
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
        triggerHaptic('success');
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
        className="absolute bg-[#121214] rounded-sm" 
        style={{ 
          left: asset.x, 
          top: asset.y, 
          width, 
          height: width * 0.75 
        }} 
      />
    );
  }

  return (
    <motion.div
      drag={(!isLocked && !isRotating) ? true : false}
      dragMomentum={false}
      onDragStart={() => setHadMultiTouch(false)}
      initial={{ scale: 0.8, opacity: 0, x: asset.x, y: asset.y, rotate: asset.rotation || 0 }}
      animate={{ 
        scale: 1, 
        opacity: 1, 
        x: asset.x, 
        y: asset.y, 
        rotate: rotation 
      }}
      transition={{
        x: { type: 'spring', damping: 25, stiffness: 120 },
        y: { type: 'spring', damping: 25, stiffness: 120 },
        scale: { duration: 0.2 },
        opacity: { duration: 0.2 },
        rotate: isRotating ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 120 }
      }}
      onDragEnd={(e, info) => {
        if (isLocked || isRotating) return;
        if (!swapSourceId && !isMultiTouch && !hadMultiTouch) {
          // Use a functional update or ensure we have the latest rotation if it can change during drag
          // In this case, rotation only changes via the rotation handle which disables dragging
          onUpdate(
            asset.x + info.offset.x / zoom, 
            asset.y + info.offset.y / zoom,
            rotation
          );
        }
        setTimeout(() => setHadMultiTouch(false), 50);
      }}
      className={`absolute pointer-events-auto group touch-none ${isLocked ? 'cursor-default' : swapSourceId ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
      style={{ width, zIndex: swapSourceId === asset.id || isHovered ? 1000 : asset.sequence, WebkitTouchCallout: 'none' }}
      data-asset-id={asset.id}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={`relative transition-all duration-500
        ${isLocked ? 'p-0' : 'p-0'}
        ${(swapSourceId === asset.id || lastSwappedId === asset.id || (isHovered && swapSourceId && swapSourceId !== asset.id)) ? 'z-40' : ''}
      `}>
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
                  currentDeg = (angle * 180 / Math.PI) + 90;
                  setRotation(currentDeg);
                };
                
                const handlePointerUpLocal = () => {
                  setIsRotating(false);
                  window.removeEventListener('pointermove', handlePointerMove);
                  window.removeEventListener('pointerup', handlePointerUpLocal);
                  onUpdate(asset.x, asset.y, currentDeg);
                };
                
                window.addEventListener('pointermove', handlePointerMove);
                window.addEventListener('pointerup', handlePointerUpLocal);
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
                  triggerHaptic('medium');
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
          className="relative flex items-center justify-center"
          style={{ 
            aspectRatio: (asset.width && asset.height) ? `${asset.width} / ${asset.height}` : '16/9',
            minHeight: (asset.width && asset.height) ? width * (asset.height / asset.width) : width * (9/16),
            contentVisibility: 'auto'
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
                : (isHovered && swapSourceId && swapSourceId !== asset.id)
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
                    ease: [0.34, 1.56, 0.64, 1] // Custom elastic ease
                  }
                : (isHovered && swapSourceId && swapSourceId !== asset.id)
                ? {
                    duration: 2.4, // Increased to account for delay
                    repeat: Infinity,
                    times: [0, 0.5, 0.55, 0.6, 0.68, 0.75, 1], // First 50% (1.2s) is static
                    ease: "circOut"
                  }
                : { 
                    duration: 0.4,
                    ease: [0.22, 1, 0.36, 1]
                  }
            }
            style={{ transformOrigin: 'center' }}
          >
            {asset.type === 'video' ? (
              <video 
                ref={(el) => { if(el) { el.defaultMuted = true; el.muted = true; el.play().catch(()=>{}); } }}
                key={`${asset.url}-${retryCount}`}
                src={asset.url} 
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
                      setRetryCount(prev => prev + 1);
                      triggerHaptic('light');
                    }}
                    className="flex flex-col items-center justify-center p-4 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer group/retry"
                  >
                    <ImageIcon size={32} className="mb-2 opacity-10 group-hover/retry:opacity-40" />
                    <span className="text-[9px] uppercase tracking-wider text-center flex flex-col items-center gap-1">
                      <span className="font-bold text-slate-500">Load Failed</span>
                      <span className="bg-zinc-800/50 px-2 py-1 rounded text-[7px]">Tap to Retry</span>
                    </span>
                  </button>
                ) : (
                  <img 
                    key={`${asset.url}-${retryCount}`}
                    src={asset.url} 
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
              {(swapSourceId === asset.id || (isHovered && swapSourceId && swapSourceId !== asset.id) || lastSwappedId === asset.id) && (
                  <motion.div
                    key={swapSourceId === asset.id ? 'source' : (lastSwappedId === asset.id ? 'swapped' : 'target')}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ 
                      duration: 0.4,
                      ease: "easeOut"
                    }}
                    className={`absolute inset-0 z-50 pointer-events-none backdrop-blur-[1px]
                      ${swapSourceId === asset.id ? 'bg-yellow-500/20' : ''}
                      ${lastSwappedId === asset.id ? 'bg-blue-600/25' : ''}
                      ${isHovered && swapSourceId && swapSourceId !== asset.id ? 'bg-green-500/20' : ''}
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
                          {swapSourceId === asset.id ? 'Ready for Swap' : 'Swap Successful'}
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
                    ease: [0.22, 1, 0.36, 1]
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
                      triggerHaptic('medium');
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
            <span className={`text-[13px] font-black tracking-[0.2em] uppercase
              ${isHovered && swapSourceId && swapSourceId !== asset.id ? 'text-emerald-400 opacity-100' : 'text-white/95'}
              transition-all duration-300
            `}>
              Shot {asset.sequence}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
