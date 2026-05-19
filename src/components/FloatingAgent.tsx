import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useAnimation, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

const playSound = (type: 'squeak' | 'ouch' | 'pop' | 'yawn' | 'low-hum' | 'glitch' | 'sigh' | 'giggle' | 'breath' | 'chuckle' | 'growl' | 'snore' | 'woah' | 'whistle' | 'stomach' | 'puke' | 'wobble' | 'cough', enabled: boolean = true) => {
  if (!enabled || (window as any).isAgentSleepMode || (window as any).isAgentHidden) return;
  try {
    (window as any).sharedAudioContext = (window as any).sharedAudioContext || new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const ctx = (window as any).sharedAudioContext;
    
    // Ensure context is running, especially if resumed from suspension
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'squeak') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'ouch') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'pop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'yawn') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.8);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } else if (type === 'low-hum') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 1);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      osc.start();
      osc.stop(ctx.currentTime + 1);
    } else if (type === 'glitch') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      for(let i=0; i<5; i++) {
        osc.frequency.setValueAtTime(Math.random() * 500 + 100, ctx.currentTime + i * 0.05);
      }
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'sigh') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === 'giggle') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      
      // Delay second giggle part
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(900, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(1300, ctx.currentTime + 0.1);
        gain2.gain.setValueAtTime(0.02, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.1);
      }, 150);
    } else if (type === 'breath') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.015, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'chuckle') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'growl') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'snore') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 1.2);
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } else if (type === 'woah') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'whistle') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 1);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      osc.start();
      osc.stop(ctx.currentTime + 1);
    } else if (type === 'stomach') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(40, ctx.currentTime + 1);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
      osc.start();
      osc.stop(ctx.currentTime + 1);
    } else if (type === 'puke') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'wobble') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'cough') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch(e) {}
};

const triggerHaptic = (type: 'light' | 'medium' | 'heavy' | 'warning' | 'mischief' | 'sustained-anger', enabled: boolean = true) => {
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    switch (type) {
      case 'light': navigator.vibrate(15); break;
      case 'medium': navigator.vibrate(40); break;
      case 'heavy': navigator.vibrate(800); break;
      case 'warning': navigator.vibrate([100, 30, 100, 30, 500]); break;
      case 'mischief': navigator.vibrate([200, 100, 200, 100, 200, 100, 600]); break;
      case 'sustained-anger': navigator.vibrate(5000); break;
    }
  }
};

type EmotionState = 
  // Primary
  | 'calm' | 'thinking' | 'relaxed' | 'sleepy' | 'joy' | 'mild_annoyed'
  // Secondary
  | 'dizzy' | 'hurt' | 'annoyed' | 'yawning' | 'watching' | 'surprised' | 'sleepy_light' | 'annoyed_light' | 'grumpy'
  // Physical / Rotation
  | 'nauseous' | 'vomit' | 'recovering' | 'wobbly'
  // Rare
  | 'greeting' | 'cute' | 'confident' | 'dramatic_sad' | 'mischievous' | 'angry' | 'enraged';

const PERSONALITIES = {
  blue: {
    idlePhrases: ["Keep going.", "You're doing well.", "Nice progress.", "Still working?", "Good job."],
    greetPhrase: "Hello. I'm here to support you.",
    awakePhrase: "Welcome back, Director.",
    recoveryPhrase: "Stabilizing systems...",
    vomitPhrase: "System error... recalibrating.",
    hurtPhrases: ["Integrity scan required.", "Please be careful.", "Minor impact detected.", "Careful with the cursor."],
    starePhrase: "Ready to assist.",
    voiceConfig: { pitch: 1.0, rate: 0.85, volume: 0.3 }
  },
  emoji: {
    idlePhrases: ["Zzz", "zzz...", "Hmm..."],
    greetPhrase: "Oh... you're back.",
    awakePhrase: "Oh... you're back.",
    recoveryPhrase: "I think I'm dying...",
    vomitPhrase: "Ugh...",
    hurtPhrases: ["Ouch!", "Watch it!", "My head...", "Hey!", "Careful!"],
    starePhrase: "...",
    voiceConfig: { pitch: 1.45, rate: 0.95, volume: 0.35 }
  },
  transparent: {
    idlePhrases: [
        "James is starting to feel colder in Act II.",
        "That scene still feels unfinished.",
        "You never finished the courtroom lighting idea.",
        "I’m still waiting to see Mr. Ali’s final scene.",
        "You left Jacks hanging.",
        "That transition shot could hit harder.",
        "You were fixing the Dutch angles earlier.",
        "We never resolved the ending.",
        "James looked stronger in the first version.",
        "Observing the flow..."
    ],
    greetPhrase: "Welcome back.",
    awakePhrase: "I'm still here.",
    recoveryPhrase: "Calming down.",
    vomitPhrase: "That was... rough.",
    hurtPhrases: ["Ow.", "Hey.", "Easy.", "Too rough.", "Careful.", "That hurts.", "You're poking me again?", "You threw me."],
    starePhrase: "...",
    voiceConfig: { pitch: 0.8, rate: 0.7, volume: 0.4 }
  }
};

export function FloatingAgent({ 
  onClick, 
  isVisible = true,
  type = 'emoji',
  soundEnabled = true,
  hapticsEnabled = true,
  sleepMode = false,
  currentProjectTitle,
  lastMessage
}: { 
  onClick: () => void;
  isVisible?: boolean;
  type?: 'blue' | 'emoji' | 'transparent';
  soundEnabled?: boolean;
  hapticsEnabled?: boolean;
  sleepMode?: boolean;
  currentProjectTitle?: string;
  lastMessage?: string;
}) {
  const triggerHapticInner = (type: 'light' | 'medium' | 'heavy' | 'warning' | 'mischief' | 'sustained-anger') => {
    if (!hapticsEnabled || (window as any).isAgentHidden) return;
    triggerHaptic(type);
  };
  const [pos, setPos] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 90 : 0, y: typeof window !== 'undefined' ? 100 : 0 });
  const controls = useAnimation();
  const isMounted = useRef(false);

  useEffect(() => {
    (window as any).isAgentHidden = !isVisible;
  }, [isVisible]);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const dragPath = useRef<{x: number, y: number}[]>([]);
  
  // Viewport constraints
  const [viewport, setViewport] = useState({ w: 500, h: 500 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const updateViewport = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      setPos(prev => {
        const padding = 24;
        const agentSize = 64;
        const w = window.innerWidth;
        const h = window.innerHeight;
        return {
          x: prev.x < w / 2 ? padding : w - agentSize - padding,
          y: Math.max(padding, Math.min(prev.y, h - agentSize - padding))
        };
      });
    };

    updateViewport();
    
    const resetIdle = () => { lastInteraction.current = Date.now(); };
    window.addEventListener('resize', updateViewport);
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('mousedown', resetIdle);
    window.addEventListener('touchstart', resetIdle);
    
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('mousedown', resetIdle);
      window.removeEventListener('touchstart', resetIdle);
    };
  }, []);

  // Visibility and sleep mode handling
  useEffect(() => {
    (window as any).isAgentSleepMode = sleepMode;
    const handleVisibility = () => {
      const isHidden = document.visibilityState === 'hidden' || !isVisible;
      (window as any).isAgentHidden = isHidden;
      if (document.visibilityState === 'hidden' || !isVisible) {
        if ((window as any).sharedAudioContext) (window as any).sharedAudioContext.suspend();
        controls.stop();
      } else {
        if ((window as any).sharedAudioContext) (window as any).sharedAudioContext.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sleepMode, controls, isVisible]);

  // Tracking Inactivity
  const lastInteraction = useRef(Date.now());
  const [idleState, setIdleState] = useState<'active' | 'short' | 'medium' | 'long' | 'very_long'>('active');

  // Primary padding for all viewport logic
  const PADDING = 24;
  const AGENT_W = 64;
  const AGENT_H = 64;

  useEffect(() => {
    if (!isVisible) {
      setIdleState('active');
      return;
    }
    
    // Reset interaction time when becoming visible
    lastInteraction.current = Date.now();

    const checkIdle = setInterval(() => {
      const elapsed = Date.now() - lastInteraction.current;
      let nextState: typeof idleState = 'active';
      if (elapsed > 60000) nextState = 'very_long';
      else if (elapsed > 30000) nextState = 'long';
      else if (elapsed > 15000) nextState = 'medium';
      else if (elapsed > 5000) nextState = 'short';
      setIdleState(nextState);
    }, 2000);
    return () => clearInterval(checkIdle);
  }, [isVisible]);

  const [emotion, setEmotion] = useState<EmotionState>('calm');
  const [speech, setSpeech] = useState<string | null>(null);
  const [pokeStage, setPokeStage] = useState(0);
  const [isRetaliating, setIsRetaliating] = useState<string | null>(null);
  const lastPokeTimeRef = useRef(Date.now());
  const [isMainAgentHidden, setIsMainAgentHidden] = useState(false);
  const [clones, setClones] = useState<{ id: number, x: number, y: number, scale: number, delay: number, type: 'peek' | 'float' | 'pop' }[]>([]);
  const harassmentLevel = useRef(0);
  const lastHarassmentTime = useRef(Date.now());
  const lastAttentionSeek = useRef(Date.now());
  const emotionLock = useRef(0);
  const zzzTimer = useRef<any>(null);

  const getContextAwarePhrase = (phraseType: 'idle' | 'hurt' | 'greet' | 'awake') => {
    if (type === 'transparent') {
        if (phraseType === 'idle') {
            const idlePhrases = [
               ...PERSONALITIES.transparent.idlePhrases
            ];
            
            // Context Awareness based on lastMessage
            if (lastMessage) {
                const msg = lastMessage.toLowerCase();
                if (msg.includes('lighting')) idlePhrases.push("You never finished the courtroom lighting idea.");
                else if (msg.includes('shot')) idlePhrases.push("That transition shot could hit harder.");
                else if (msg.includes('frame')) idlePhrases.push("You never uploaded the third frame.");
                else if (msg.includes('james')) idlePhrases.push("James is starting to feel colder in Act II.");
                else if (msg.includes('ali')) idlePhrases.push("I’m still waiting to see Mr. Ali’s final scene.");
                else if (msg.includes('jacks')) idlePhrases.push("You left Jacks hanging.");
                else if (msg.includes('angle')) idlePhrases.push("You were fixing the Dutch angles earlier.");
                else if (msg.length > 50) idlePhrases.push("You've been focused on that part for a while.");
                else if (msg.length > 5) idlePhrases.push("That was an interesting point.");
            }
            return idlePhrases[Math.floor(Math.random() * idlePhrases.length)];
        }
        if (phraseType === 'hurt') {
            return ["Ow.", "Hey.", "Easy.", "Too rough.", "Careful.", "That hurts.", "You're poking me again?", "You threw me."][Math.floor(Math.random() * 8)];
        }
    }
    const personality = PERSONALITIES[type];
    if (phraseType === 'idle') return personality.idlePhrases[Math.floor(Math.random() * personality.idlePhrases.length)];
    if (phraseType === 'hurt') return personality.hurtPhrases[Math.floor(Math.random() * personality.hurtPhrases.length)];
    return personality.greetPhrase;
  };

  // Manage idle state transitions (Evolution)
  useEffect(() => {
    if (!isVisible) {
      if (zzzTimer.current) {
        clearInterval(zzzTimer.current);
        zzzTimer.current = null;
      }
      setSpeech(null);
      return;
    }

    if (Date.now() < emotionLock.current) return;
    
    if (idleState === 'active') {
      if (emotion === 'sleepy' || emotion === 'sleepy_light' || emotion === 'yawning') {
        const wasDeepSleep = emotion === 'sleepy';
        setEmotion('watching');
        emotionLock.current = Date.now() + 2000;
        setSpeech(null);
        if (zzzTimer.current) clearInterval(zzzTimer.current);
        
        if (wasDeepSleep) {
          setTimeout(() => {
            const msg = type === 'transparent' ? "I'm back." : PERSONALITIES[type].awakePhrase;
            setSpeech(msg);
            attemptSpeak(msg);
            setTimeout(() => setSpeech(null), 3000);
          }, 500);
        }
        
        setTimeout(() => setEmotion('calm'), 2000);
      } else {
        setEmotion('calm');
      }
    } else if (idleState === 'short') {
      setEmotion('relaxed');
    } else if (idleState === 'medium') {
      if (emotion !== 'yawning' && emotion !== 'sleepy_light') {
        setEmotion('yawning');
        playSound('yawn', soundEnabled);
        emotionLock.current = Date.now() + 3000;
        setTimeout(() => setEmotion('sleepy_light'), 3000);
      }
    } else if (idleState === 'long') {
      setEmotion('sleepy_light');
    } else if (idleState === 'very_long') {
      setEmotion('sleepy');
      if (!zzzTimer.current) {
        zzzTimer.current = setInterval(() => {
          const msg = getContextAwarePhrase('idle');
          setSpeech(msg);
          if (Math.random() > 0.4) playSound('snore', soundEnabled);
          setTimeout(() => setSpeech(null), 3000);
        }, 75000);
      }
    }
  }, [idleState, emotion, currentProjectTitle, type, isVisible]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (zzzTimer.current) clearInterval(zzzTimer.current);
    };
  }, []);

  // Idle animation based on emotion mapping (Respect Aspect Ratio)
  useEffect(() => {
    let active = true;
    const startIdleAnimation = async () => {
      while (active) {
        // Stop idle animation if retaliating or locked or sleeping/hidden
        if (isRetaliating || Date.now() < emotionLock.current || isDragging || !isMounted.current || (window as any).isAgentSleepMode || (window as any).isAgentHidden) {
          await new Promise(resolve => setTimeout(resolve, 800));
          continue;
        }

        if (emotion === 'calm' || emotion === 'relaxed') {
          // Subtle breathing (uniform scale) - Weighted and slower
          if (Math.random() > 0.7) playSound('breath', soundEnabled);
          
          // Random attention seeking (Manipulative Interaction Loop)
          if (Date.now() - lastAttentionSeek.current > 20000 && Math.random() > 0.5) {
             lastAttentionSeek.current = Date.now();
             setEmotion('watching');
             playSound('giggle', soundEnabled);
             if (isMounted.current) await controls.start({ x: [0, -5, 5, 0], transition: { duration: 0.5 } });
             await new Promise(r => setTimeout(r, 1000));
             setEmotion('calm');
          }

          if (isMounted.current) {
            await controls.start({
              scale: [1, 1.015, 1],
              rotate: [0, 0.5, 0, -0.5, 0],
              transition: { duration: 5, ease: "easeInOut" }
            });
          }
          await new Promise(resolve => setTimeout(resolve, Math.random() * 4000 + 3000));
        } else if (emotion === 'thinking') {
          if (Math.random() > 0.8) playSound('sigh', soundEnabled);
          if (isMounted.current) {
            await controls.start({
              rotate: [-2, 0, 2, 0],
              scale: [1, 1.01, 1],
              transition: { duration: 4, ease: "easeInOut" }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else if (emotion === 'sleepy' || emotion === 'sleepy_light') {
          if (Math.random() > 0.6) playSound('breath', soundEnabled);
          if (isMounted.current) {
            await controls.start({
              scale: [0.98, 0.96, 0.98],
              y: [0, 1, 0],
              transition: { duration: 6, ease: "easeInOut" }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else if (emotion === 'joy') {
          if (Math.random() > 0.5) playSound('giggle', soundEnabled);
          if (isMounted.current) {
            await controls.start({
              scale: [1, 1.08, 1],
              y: [0, -3, 0],
              transition: { duration: 0.8, ease: "easeOut" }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (emotion === 'dizzy') {
          if (isMounted.current) {
            await controls.start({
              rotate: [0, 15, -15, 10, -10, 0],
              scale: [1, 0.95, 1],
              transition: { duration: 2, ease: "easeInOut" }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (emotion === 'mischievous') {
          if (Math.random() > 0.7) playSound('chuckle', soundEnabled);
          // Weighted flip
          if (isMounted.current) {
            await controls.start({
              rotate: [0, 180, 180, 0],
              scale: [1, 1.15, 1.15, 1],
              transition: { duration: 3, ease: "easeInOut", times: [0, 0.3, 0.7, 1] }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (emotion === 'angry' || emotion === 'enraged') {
          if (Math.random() > 0.5) playSound('growl', soundEnabled);
          if (isMounted.current) {
            await controls.start({
              x: [0, -1.5, 1.5, 0],
              scale: [1, 0.98, 1],
              transition: { duration: 0.4, ease: "easeInOut", repeat: 1 }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 1200));
        } else if (emotion === 'annoyed' || emotion === 'mild_annoyed' || emotion === 'annoyed_light' || emotion === 'grumpy') {
          if (Math.random() > 0.8) playSound('sigh', soundEnabled);
          if (isMounted.current) {
            await controls.start({
              rotate: [0, -4, 0],
              x: [0, -2, 0],
              transition: { duration: 2, ease: "easeInOut" }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (emotion === 'watching' || emotion === 'surprised') {
          if (isMounted.current) {
            await controls.start({
              scale: [1, 1.04, 1],
              transition: { duration: 1.2, ease: "easeOut" }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          if (isMounted.current) {
            await controls.start({
              scale: [1, 1], rotate: [0, 0],
              transition: { duration: 2 }
            });
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    };
    startIdleAnimation();
    return () => { active = false; };
  }, [controls, emotion]);

  const [isRotating, setIsRotating] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  const lastDragPoint = useRef({ x: 0, y: 0 });
  const dizzinessMeter = useRef(0);
  const lastDirection = useRef({ x: 0, y: 0 });
  const lastVelocity = useRef(0);
  const lastSoundTime = useRef(0);
  const lastCollisionTime = useRef(0);

  // ROTATION / SHAKE STORY SYSTEM 🎡
  const runDizzyStory = async (intensity: number) => {
    if (!isMounted.current) return;
    emotionLock.current = Date.now() + 10000; // Long lock for story
    
    if (intensity < 25) {
      // Light Motion -> Calmly Stabilize
      setEmotion('watching');
      await controls.start({ 
        rotate: [rotation, 0], 
        transition: { duration: 0.6, ease: "backOut" } 
      });
      setRotation(0);
      setTimeout(() => {
        if (isMounted.current) setEmotion('calm');
      }, 1500);
      emotionLock.current = Date.now() + 1500;
    } else if (intensity < 60) {
      // Medium Dizziness
      setEmotion('dizzy');
      playSound('whistle', soundEnabled);
      await controls.start({ 
        rotate: [rotation, rotation + 360, 0], 
        transition: { duration: 1.5, ease: "circOut" } 
      });
      setRotation(0);
      setTimeout(() => {
        if (isMounted.current) {
          setEmotion('annoyed_light');
          playSound('sigh', soundEnabled);
        }
      }, 2000);
      setTimeout(() => {
        if (isMounted.current) setEmotion('calm');
      }, 4500);
      emotionLock.current = Date.now() + 4500;
    } else if (intensity < 120) {
      // Heavy Dizziness -> Nausea
      setEmotion('dizzy');
      playSound('whistle', soundEnabled);
      await controls.start({ 
        rotate: rotation + 1080, 
        transition: { duration: 2, ease: 'easeOut' } 
      });
      setRotation(0);
      
      await new Promise(r => setTimeout(r, 800));
      if (!isMounted.current) return;
      setEmotion('nauseous');
      playSound('stomach', soundEnabled);
      await controls.start({ scale: [1, 1.15, 0.95, 1.05, 1], transition: { duration: 1.5, repeat: 1 } });
      
      setTimeout(() => {
        if (isMounted.current) {
          setEmotion('recovering');
          setSpeech(PERSONALITIES[type].vomitPhrase);
          playSound('breath', soundEnabled);
        }
      }, 3500);
      setTimeout(() => {
        if (isMounted.current) {
          setSpeech(null);
          setEmotion('calm');
        }
      }, 6500);
      emotionLock.current = Date.now() + 6500;
    } else {
      // Extreme Dizziness -> VOMIT 🤮
      setEmotion('dizzy');
      playSound('whistle', soundEnabled);
      await controls.start({ 
        rotate: rotation + 1800, 
        transition: { duration: 2.5, ease: 'easeOut' } 
      });
      setRotation(0);
      
      await new Promise(r => setTimeout(r, 1000));
      if (!isMounted.current) return;
      setEmotion('nauseous');
      playSound('stomach', soundEnabled);
      
      // Intense Trembling
      await controls.start({ 
        x: [-3, 3, -2, 2, -1, 1, 0], 
        transition: { duration: 0.1, repeat: 20 } 
      });
      
      // THE VOMIT MOMENT — DRAMATIC PAUSE
      await new Promise(r => setTimeout(r, 1200));
      if (!isMounted.current) return;
      setEmotion('vomit');
      playSound('puke', soundEnabled);
      triggerHapticInner('heavy');
      
      await controls.start({ 
        y: [0, 25, -10, 5, 0], 
        scale: [1, 1.4, 0.8, 1.1, 1], 
        transition: { duration: 0.8, ease: "backOut" } 
      });
      
      playSound('cough', soundEnabled);
      await new Promise(r => setTimeout(r, 1500));
      if (!isMounted.current) return;
      setEmotion('recovering');
      setSpeech(PERSONALITIES[type].recoveryPhrase);
      await controls.start({ 
        rotate: [0, -8, 8, -4, 4, 0], 
        transition: { duration: 3 } 
      });
      
      setTimeout(() => {
        if (isMounted.current) {
          setSpeech(null);
          setEmotion('calm');
        }
      }, 6000);
      emotionLock.current = Date.now() + 10000;
    }
    // Deep reset
    dizzinessMeter.current = 0;
  };

  const renderVisual = (e: EmotionState) => {
    if (type === 'transparent') {
        const isHeated = pokeStage === 4;
        const opacity = isHeated ? 0.95 : 0.7;
        const color = isHeated ? 'bg-red-500/80 shadow-[0_0_50px_red]' : 'bg-blue-400/30 shadow-[0_0_30px_blue]';
        const isSpeaking = speech !== null;
        
        return (
            <motion.div 
               className={`relative w-[60px] h-[60px] rounded-full liquid-glass border border-white/20 backdrop-blur-xl ${color} flex flex-col items-center justify-center gap-1.5`}
               style={{ opacity }}
               animate={isHeated ? { scale: [1, 1.05, 1] } : {}}
               transition={{ repeat: Infinity, duration: 2 }}
            >
                {/* Eyes */}
                <div className="flex gap-2.5 mt-1">
                    <motion.div 
                        initial={{ scaleY: 1 }}
                        animate={{ scaleY: isHeated ? 0.8 : 1 }}
                        className="w-2.5 h-2.5 bg-white/90 rounded-full" 
                    />
                    <motion.div 
                        initial={{ scaleY: 1 }}
                        animate={{ scaleY: isHeated ? 0.8 : 1 }}
                        className="w-2.5 h-2.5 bg-white/90 rounded-full" 
                    />
                </div>
                
                {/* Mouth/Lips */}
                <motion.div 
                    className="bg-white/60 border border-white/20"
                    animate={{ 
                        width: isSpeaking ? [24, 38, 24] : 20,
                        height: isSpeaking ? [6, 12, 6] : 2,
                        borderRadius: isSpeaking ? ['40% 40% 50% 50%', '50% 50% 20% 20%', '40% 40% 50% 50%'] : '9999px',
                        y: isSpeaking ? -1 : 2
                    }}
                    transition={{ repeat: isSpeaking ? Infinity : 0, duration: 0.3, ease: "easeInOut" }}
                />
            </motion.div>
        );
    }
    
    if (type === 'blue') {
      const isAngry = e === 'angry' || e === 'enraged' || e === 'mischievous';
      const isDizzy = e === 'dizzy' || e === 'wobbly' || e === 'nauseous' || e === 'vomit';
      const isSleepy = e === 'sleepy' || e === 'sleepy_light' || e === 'yawning';
      
      return (
        <div className="relative flex items-center justify-center w-[60px] h-[60px]">
          <motion.div 
            animate={isAngry ? {
              scale: [1, 1.05, 1],
              rotate: [0, -1, 1, 0],
            } : isSleepy ? {
              scale: [1, 0.95, 1],
            } : {}}
            transition={{ repeat: Infinity, duration: isAngry ? 0.2 : 4 }}
            className={`w-[52px] h-[52px] rounded-full border-2 transition-all duration-500 shadow-xl flex items-center justify-center relative overflow-hidden
              ${isAngry ? 'bg-red-500/20 border-red-400 shadow-red-500/40' : 
                isDizzy ? 'bg-emerald-500/20 border-emerald-400 shadow-emerald-500/40' :
                'bg-blue-500/20 border-blue-400 shadow-blue-500/40'}
            `}
          >
            {/* Glossy Reflection */}
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
            
            {/* Expressive Eye Area */}
            <div className="flex gap-1.5 items-center justify-center">
              <motion.div 
                animate={isSleepy ? { height: 1 } : isAngry ? { height: 6 } : { height: 4 }}
                className={`w-1.5 bg-white rounded-full transition-all duration-300 ${isAngry ? 'shadow-[0_0_8px_white]' : ''}`}
              />
              <motion.div 
                animate={isSleepy ? { height: 1 } : isAngry ? { height: 6 } : { height: 4 }}
                className={`w-1.5 bg-white rounded-full transition-all duration-300 ${isAngry ? 'shadow-[0_0_8px_white]' : ''}`}
              />
            </div>
          </motion.div>
          {/* Outer Ring */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
            className={`absolute inset-0 rounded-full border border-dashed opacity-20 bg-transparent
              ${isAngry ? 'border-red-500' : 'border-blue-500'}
            `}
          />
        </div>
      );
    }
    return getEmoji(e);
  };

  const getEmoji = (e: EmotionState) => {
    switch (e) {
      // Primary
      case 'calm': return '🙂';
      case 'thinking': return '🤔';
      case 'relaxed': return '😌';
      case 'sleepy_light': return '😪';
      case 'sleepy': return '😴';
      case 'joy': return '😂';
      case 'mild_annoyed': return '🙄';
      case 'grumpy': return '😤';
      // Secondary
      case 'dizzy': return '😵‍💫';
      case 'hurt': return '🤕';
      case 'annoyed': return '😠';
      case 'enraged': return '🤬';
      case 'annoyed_light': return '🤨';
      case 'yawning': return '🥱';
      case 'watching': return '👀';
      case 'surprised': return '😳';
      case 'wobbly': return '🫨';
      case 'nauseous': return '🤢';
      case 'vomit': return '🤮';
      case 'recovering': return '😖';
      // Rare
      case 'greeting': return '👋';
      case 'cute': return '🥹';
      case 'confident': return '😎';
      case 'dramatic_sad': return '😭';
      case 'mischievous': return '😈';
      case 'angry': return '😡';
      default: return '🙂';
    }
  };

  // Poking System
  const clickTimeout = useRef<any>(null);
  const pokeCount = useRef(0);

  const handleInteraction = async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (isDragging || isRetaliating) return;

    if (type === 'transparent') {
        const now = Date.now();
        // Decay logic
        if (now - lastPokeTimeRef.current > 5000) {
            setPokeStage(Math.max(0, pokeStage - 1));
        }
        lastPokeTimeRef.current = now;

        const nextStage = Math.min(4, pokeStage + 1);
        setPokeStage(nextStage);

        // Escalation Logic (Stage-based)
        if (nextStage === 1) { // Light interruption
           setSpeech(["Hm?", "Hey.", "Careful.", "I'm listening."][Math.floor(Math.random()*4)]);
           // Mouth animation to open slightly
           setTimeout(() => setSpeech(null), 2000);
        } else if (nextStage === 2) { // Distracted
           setSpeech(["Can I focus?", "I was thinking.", "You're distracting me.", "Hey, watch out."][Math.floor(Math.random()*4)]);
           triggerHapticInner('light');
           setTimeout(() => setSpeech(null), 3000);
        } else if (nextStage === 3) { // Annoyed
           setSpeech(["Hey, that hurts.", "Please stop.", "You're messing everything up.", "Stop, please."][Math.floor(Math.random()*4)]);
           triggerHapticInner('medium');
           setTimeout(() => setSpeech(null), 3000);
        } else if (nextStage === 4) { // Heated / Red
           setSpeech(["Enough.", "You're pushing it too far.", "I really don't enjoy this.", "Stop now."][Math.floor(Math.random()*4)]);
           triggerHapticInner('sustained-anger');
           setTimeout(() => setSpeech(null), 3000);
           
           // Cool down after a while to allow decay
           setTimeout(() => {
             setPokeStage(3);
           }, 7000);
        }
        return;
    }

    if (clickTimeout.current) {
      // Double tap detected -> Poke (aggressive)
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      
      const now = Date.now();
      if (now - lastHarassmentTime.current < 10000) { 
        harassmentLevel.current += 1;
      } else {
        harassmentLevel.current = 1;
      }
      lastHarassmentTime.current = now;

      // STAGE 4 — Self-Duplication / Screen Infestation (HARASSMENT 10+)
      if (harassmentLevel.current >= 10) {
        setEmotion('mischievous');
        emotionLock.current = now + 15000;
        
        // IMMEDIATE FEEDBACK: Red viewport and Haptics
        setIsRetaliating('infestation'); 
        triggerHapticInner('sustained-anger');
        playSound('chuckle', soundEnabled);
        playSound('low-hum', soundEnabled);

        // CINEMATIC SEQUENCE - High Suspense Redesign
        // 1. Sudden Freeze
        if (isMounted.current) await controls.start({ scale: 1.1, rotate: 0, x: 0, y: 0, transition: { duration: 0.8, ease: "easeOut" } });
        await new Promise(r => setTimeout(r, 1000));
        
        // 2. Slow Stare Left (Deep Thinking)
        setEmotion('watching');
        if (isMounted.current) await controls.start({ rotate: -20, transition: { duration: 1.5, ease: "easeInOut" } });
        await new Promise(r => setTimeout(r, 1200));
        
        // 3. Heavy Pause (The calm before the storm)
        await new Promise(r => setTimeout(r, 800));
        
        // 4. Snap Right
        if (isMounted.current) await controls.start({ rotate: 20, transition: { duration: 0.6, ease: "easeIn" } });
        await new Promise(r => setTimeout(r, 800));
        
        // 5. Hide Leader and Start Clones
        setEmotion('mischievous');
        setSpeech("I think you've seen enough.");
        setIsMainAgentHidden(true);
        
        if (isMounted.current) await controls.start({ scale: 1.5, rotate: 0, transition: { duration: 0.8, ease: "backIn" } });
        await new Promise(r => setTimeout(r, 500));
        
        // 6. INFESTATION SETUP — ENVIRONMENTAL CORRUPTION 😈
        playSound('glitch', soundEnabled);

        const newClones = [];
        const count = 50; 
        const w = window.innerWidth;
        const h = window.innerHeight;

        for (let i = 0; i < count; i++) {
          const type = Math.random() > 0.4 ? 'peek' : (Math.random() > 0.3 ? 'pop' : 'float');
          let lx, ly;
          
          if (type === 'peek') {
            const side = Math.floor(Math.random() * 4);
            // ALLOW PARTIAL OFF-SCREEN
            if (side === 0) { lx = -25 + (Math.random() * 40); ly = Math.random() * h; } // left edge
            else if (side === 1) { lx = w - 45 + (Math.random() * 40); ly = Math.random() * h; } // right edge
            else if (side === 2) { lx = Math.random() * w; ly = -25 + (Math.random() * 40); } // top edge
            else { lx = Math.random() * w; ly = h - 45 + (Math.random() * 40); } // bottom edge
          } else {
            // UNPREDICTABLE SCATTER
            lx = Math.random() * (w - 60) + 30;
            ly = Math.random() * (h - 60) + 30;
          }

          newClones.push({
            id: Date.now() + i,
            x: lx,
            y: ly,
            scale: Math.random() * 0.4 + 0.4,
            delay: i * (0.05 + Math.random() * 0.1), // STAGGERED ENTRANCE
            type: type as any
          });
        }
        setClones(newClones);
        
        // LONGER CINEMATIC DURATION FOR INFESTATION
        setTimeout(() => {
          setIsRetaliating(null);
          // DELAYED RESTORE — LET CLONES FADE FIRST
          setTimeout(() => {
            setIsMainAgentHidden(false);
            setClones([]);
            setEmotion('grumpy');
            setSpeech(null);
          }, 2000); 
          harassmentLevel.current = 0; 
        }, 11000);

      } 
      // STAGE 3 — Angry (HARASSMENT 7-9)
      else if (harassmentLevel.current >= 7) {
        setEmotion('angry');
        // ENABLED sustanied-anger only for RED emojis 😡🤬
        triggerHapticInner('sustained-anger');
        playSound('growl', soundEnabled);
        if (Math.random() > 0.3) {
          const msg = getContextAwarePhrase('hurt');
          setSpeech(msg);
          attemptSpeak(msg);
        }
        emotionLock.current = now + 6000;
        setTimeout(() => { setEmotion('enraged'); }, 2000);
        setTimeout(() => { setSpeech(null); setEmotion('calm'); }, 6000);
      } 
      // STAGE 2 — Frustrated (HARASSMENT 4-6)
      else if (harassmentLevel.current >= 4) {
        setEmotion('annoyed');
        playSound('sigh', soundEnabled);
        if (Math.random() > 0.5) {
          const msg = getContextAwarePhrase('hurt');
          setSpeech(msg);
          attemptSpeak(msg);
        }
        emotionLock.current = now + 4000;
        setTimeout(() => { setSpeech(null); setEmotion('grumpy'); }, 4000);
      } 
      // STAGE 1 — Mild Irritation (HARASSMENT 1-3)
      else {
        setEmotion('annoyed_light');
        playSound('breath', soundEnabled);
        if (harassmentLevel.current === 1) {
          const msg = PERSONALITIES[type].starePhrase;
          setSpeech(msg === '...' ? '...Seriously?' : msg);
        }
        emotionLock.current = now + 3000;
        setTimeout(() => { setSpeech(null); setEmotion('calm'); }, 3000);
      }
    } else {
      // Start single tap timer
      clickTimeout.current = setTimeout(() => {
        clickTimeout.current = null;
        playSound('pop', soundEnabled);
        onClick();
        
        if (emotion === 'calm' || emotion === 'relaxed') {
          setEmotion('thinking');
          emotionLock.current = Date.now() + 2000;
          setTimeout(() => setEmotion('calm'), 2000);
        }
      }, 450); 
    }
  };

  const attemptSpeak = (text: string) => {
    if (!soundEnabled) return;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (text.includes("Zzz") || text.includes("...")) return; 
      const utterance = new SpeechSynthesisUtterance(text);
      const config = PERSONALITIES[type].voiceConfig;
      utterance.pitch = config.pitch;
      utterance.rate = config.rate;
      utterance.volume = config.volume;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    if (speech && !speech.includes("Zzz")) {
      // Significantly lower frequency of talking
      if (Math.random() > 0.9) attemptSpeak(speech);
    }
  }, [speech]);

  const pressTimer = useRef<any>(null);

  const handlePointerDown = (e: any) => {
    pressTimer.current = setTimeout(() => {
      // Long press -> Gentle interaction
      setEmotion('cute');
      playSound('giggle', soundEnabled);
      emotionLock.current = Date.now() + 3000;
      setTimeout(() => setEmotion('calm'), 3000);
    }, 500); // 500ms
  };

  const handlePointerUp = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <>
      {typeof document !== 'undefined' && isRetaliating && createPortal(
        <div className="fixed inset-0 pointer-events-none z-[999999] overflow-hidden">
          <AnimatePresence mode="wait">
            {isRetaliating === 'blackout' && (
              <motion.div 
                key="blackout"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.8, 1, 0] }}
                transition={{ duration: 1.5 }}
                className="fixed inset-0 bg-black"
              />
            )}
            
            {isRetaliating === 'infestation' && (
              <motion.div 
                key="infestation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 1.5 } }}
                className="fixed inset-0 pointer-events-none"
              >
                {/* SUBTLE FULLSCREEN TINT — CINEMATIC REFINEMENT 😈 */}
                <div className="absolute inset-0 bg-red-950/10 pointer-events-none">
                  {/* Clones Inside Containment */}
                  <AnimatePresence>
                    {clones.map((clone) => (
                      <motion.div
                        key={clone.id}
                        initial={{ 
                          opacity: 0, 
                          scale: 0,
                          rotate: Math.random() * 40 - 20,
                          x: clone.x + (Math.random() * 40 - 20),
                          y: clone.y + (Math.random() * 40 - 20)
                        }}
                        animate={{ 
                          x: clone.x, 
                          y: clone.y, 
                          scale: 1, 
                          opacity: 1,
                          rotate: 0
                        }}
                        exit={{ 
                          opacity: 0, 
                          scale: 0.5,
                          y: clone.y + 100,
                          rotate: Math.random() * 30 - 15,
                          transition: { duration: 1 + Math.random() }
                        }}
                        transition={{ 
                          delay: clone.delay,
                          type: "spring",
                          stiffness: 80,
                          damping: 12
                        }}
                        style={{
                          position: 'fixed',
                          left: 0,
                          top: 0,
                          fontSize: '56px',
                          width: '72px',
                          height: '72px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 1000000,
                          filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))'
                        }}
                      >
                        <motion.div
                          animate={{ 
                            y: [0, -4, 0],
                            rotate: [-2, 2, -2]
                          }}
                          transition={{ 
                            duration: 3 + Math.random() * 2,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        >
                          {renderVisual('mischievous')}
                        </motion.div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}

      <motion.div
        drag
        dragConstraints={{ 
          left: PADDING, 
          top: PADDING, 
          right: viewport.w - AGENT_W - PADDING, 
          bottom: viewport.h - AGENT_H - PADDING 
        }}
        dragMomentum={true}
        dragElastic={0.1}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDragStart={() => {
          handlePointerUp();
          setIsDragging(true);
          dragPath.current = [];
          dizzinessMeter.current = 0;
          lastInteraction.current = Date.now();
          if (zzzTimer.current) clearInterval(zzzTimer.current);
          setEmotion('surprised');
          playSound('pop', soundEnabled);
        }}
        onDrag={(e, info) => {
          dragPath.current.push({ x: info.point.x, y: info.point.y });
          if (dragPath.current.length > 30) dragPath.current.shift();

          const now = Date.now();
          const last = info.point;
          const prev = dragPath.current[dragPath.current.length - 2] || info.point;
          
          if (last && prev) {
             const dx = last.x - prev.x;
             const dy = last.y - prev.y;
             const velocity = Math.sqrt(dx*dx + dy*dy);
             
             // 1. DYNAMIC ROTATION - Smooth interpolation
             const targetRotation = dx * 1.5;
             setRotation(prevRot => prevRot + (targetRotation - prevRot) * 0.3);

             // 2. SHAKE / DIZZINESS DETECTION
             // Detect direction reversals (oscillation)
             const dirX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
             const dirY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
             
             // Passive decay to prevent accumulation during slow repositioning
             dizzinessMeter.current = Math.max(0, dizzinessMeter.current - 0.5);

             if (dirX !== 0 && dirX !== lastDirection.current.x) {
                dizzinessMeter.current += velocity * 0.25; // Direction reversal adds meter significantly
                if (velocity > 15) triggerHapticInner('light');
             }
             if (dirY !== 0 && dirY !== lastDirection.current.y) {
                dizzinessMeter.current += velocity * 0.25;
                if (velocity > 15) triggerHapticInner('light');
             }
             lastDirection.current = { x: dirX, y: dirY };

             // High velocity builds dizziness but only at extreme speeds to avoid repositioning confusion
             if (velocity > 55) {
                dizzinessMeter.current += velocity * 0.1;
             }

             // 3. PROGRESSIVE LIVE FEEDBACK DURING MOTION
             if (dizzinessMeter.current > 100) {
                setEmotion('nauseous');
                if (now - lastSoundTime.current > 300) {
                   playSound('stomach', soundEnabled);
                   lastSoundTime.current = now;
                }
             } else if (dizzinessMeter.current > 50) {
                setEmotion('dizzy');
                if (now - lastSoundTime.current > 350) {
                   playSound('whistle', soundEnabled);
                   lastSoundTime.current = now;
                }
             } else if (dizzinessMeter.current > 20) {
                setEmotion('wobbly');
                if (now - lastSoundTime.current > 500) {
                   playSound('woah', soundEnabled);
                   lastSoundTime.current = now;
                }
             } else if (velocity > 30) {
                setEmotion('surprised');
             }

             // 4. COLLISION DETECTION - Physical & Emotional
             const padding = PADDING + 12;
             const hitLeft = last.x < padding && dx < -14;
             const hitRight = last.x > viewport.w - AGENT_W - padding && dx > 14;
             const hitTop = last.y < padding && dy < -14;
             const hitBottom = last.y > viewport.h - AGENT_H - padding && dy > 14;

             if ((hitLeft || hitRight || hitTop || hitBottom) && now - lastCollisionTime.current > 600) {
                lastCollisionTime.current = now;
                setEmotion('hurt');
                playSound('ouch', soundEnabled);
                triggerHapticInner('heavy');
                
                // Visual impact bounce
                if (isMounted.current) {
                  controls.start({
                    x: hitLeft ? 15 : (hitRight ? -15 : 0),
                    y: hitTop ? 15 : (hitBottom ? -15 : 0),
                    transition: { type: "spring", stiffness: 1000, damping: 10 }
                  });
                }

                const msg = getContextAwarePhrase('hurt');
                setSpeech(msg);
                setTimeout(() => setSpeech(null), 2500);
             }
          }
        }}
        onDragEnd={(e, info) => {
          setTimeout(() => setIsDragging(false), 100);
          
          // Apply aftermath based on final dizziness score
          if (dizzinessMeter.current > 10) {
            runDizzyStory(dizzinessMeter.current);
          } else {
            setRotation(0);
            setEmotion('watching');
            emotionLock.current = Date.now() + 1500;
            setTimeout(() => setEmotion('calm'), 1500);
          }

          // Screen-space only snapping logic
          const w = window.innerWidth;
          const h = window.innerHeight;
          
          // We use viewport-relative logic here
          const targetX = info.point.x < w / 2 ? PADDING : w - AGENT_W - PADDING;
          const targetY = Math.max(PADDING, Math.min(info.point.y - (AGENT_H/2), h - AGENT_H - PADDING));

          setPos({ x: targetX, y: targetY });
        }}
        animate={isVisible && !isMainAgentHidden ? { 
          ...pos, 
          scale: 1, 
          opacity: 1,
          pointerEvents: 'auto' 
        } : { 
          x: pos.x, 
          y: pos.y, 
          scale: 0, 
          opacity: 0,
          pointerEvents: 'none' 
        }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 10000,
          width: AGENT_W,
          height: AGENT_H,
          touchAction: 'none' 
        }}
        onClick={(e: any) => handleInteraction(e)}
      >
        {emotion === 'mischievous' && !isRetaliating && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Energy build up around main creature */}
          </div>
        )}
        <AnimatePresence>
          {speech && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              className={`absolute top-[-35px] ${pos.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 500) ? 'right-2 origin-bottom-right' : 'left-2 origin-bottom-left'} text-slate-600 font-medium px-3 py-1 rounded-2xl text-[11px] whitespace-nowrap z-50 flex items-center justify-center pointer-events-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.1)] bg-white/70 backdrop-blur-md border border-white/40`}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              {speech}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          animate={controls}
          className="w-full h-full relative cursor-pointer flex items-center justify-center p-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-[50px] drop-shadow-[0_8px_16px_rgba(0,0,0,0.15)] select-none pointer-events-none">
             <motion.div
               animate={{ rotate: rotation }}
               className="origin-center"
             >
               {renderVisual(emotion)}
             </motion.div>

             {emotion === 'mischievous' && (
               <div className="absolute inset-0" />
             )}

             {emotion === 'dizzy' && (
               <motion.div 
                 animate={{ rotate: 360 }} 
                 transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                 className="absolute -top-3 -left-3 -right-3 h-8 flex justify-between pointer-events-none opacity-80"
               >
                 <Sparkles className="text-yellow-400 w-4 h-4 drop-shadow-md z-10" />
                 <Sparkles className="text-yellow-400 w-3 h-3 drop-shadow-md translate-y-3 z-10" />
               </motion.div>
             )}
          </div>
        </motion.div>
      </motion.div>
    </>

  );
}
