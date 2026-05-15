const fs = require('fs');
let src = fs.readFileSync('src/App.tsx', 'utf-8');

const settingsBlock = `  const renderSettings = () => (
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
                  {/* Profile Section */}
                  <div className="liquid-glass rounded-[3rem] p-10 border border-white/5 relative overflow-hidden group shadow-2xl space-y-10">
                    <div className="flex items-center gap-8">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 p-0.5 shadow-2xl">
                        <div className="w-full h-full rounded-full bg-[#030303] flex items-center justify-center overflow-hidden">
                          <img src={\`https://api.dicebear.com/7.x/avataaars/svg?seed=\${(import.meta as any).env.VITE_USER_EMAIL || 'Director'}\`} alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-2xl font-black text-white leading-tight">Director Prince</h3>
                        <p className="text-slate-500 text-sm font-medium tracking-tight">{(import.meta as any).env.VITE_USER_EMAIL || 'princeniithompson@gmail.com'}</p>
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent pointer-events-none" />
                  </div>

                  {/* General Section */}
                  <div className="space-y-4">
                     <h4 className="text-[0.625rem] font-black uppercase tracking-[0.4em] text-white/20 px-4">System Configuration</h4>
                     <div className="grid gap-4">
                        <button 
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSettingsPage('agent');
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
                            setSettingsPage('haptics');
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
                            setSettingsPage('appearance');
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
                            setSettingsPage('api');
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
                        className={\`w-full liquid-glass rounded-[2rem] p-8 border transition-all flex items-center justify-between group \${agentSettings.type === 'blue' ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_50px_rgba(99,102,241,0.2)]' : 'border-white/5 hover:border-white/20'}\`}
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
                        className={\`w-full liquid-glass rounded-[2rem] p-8 border transition-all flex items-center justify-between group \${agentSettings.type === 'emoji' ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_50px_rgba(16,185,129,0.2)]' : 'border-white/5 hover:border-white/20'}\`}
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
                        className={\`w-full liquid-glass rounded-[2rem] p-8 border border-white/5 opacity-40 flex items-center justify-between cursor-not-allowed\`}
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
                              animate={{ width: \`\${((fontScale - 0.7) / (1.5 - 0.7)) * 100}%\` }}
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
                       className={\`relative z-10 w-full py-6 rounded-[2rem] transition-all font-black text-xs uppercase tracking-[0.4em] overflow-hidden \${agentSettings.soundEnabled ? 'liquid-glass-emerald bg-emerald-500/20 text-emerald-100 border-emerald-500/30' : 'bg-white/5 text-slate-600 border-white/5'}\`}
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
  );\n\n`;

// 1. replace broken definition logic (lines 1333 to 1335)
const brokenDefRegex = /\s*const renderSettings = \(\) => \(\s*\{renderSettings\(\)\}\s*\);\s*/;
src = src.replace(brokenDefRegex, '\n\n' + settingsBlock);

// 2. remove the main board settings block accurately
// It starts with `      {/* Full Screen Settings Panel Overlay */}`
const boardSettingsComment = "      {/* Full Screen Settings Panel Overlay */}";
const boardSettingsStart = src.indexOf(boardSettingsComment);
if (boardSettingsStart !== -1) {
  // We need to find the ending `      </AnimatePresence>`
  const animatePresenceEnd = src.indexOf("</AnimatePresence>", boardSettingsStart);
  if (animatePresenceEnd !== -1) {
    const blockEnd = animatePresenceEnd + "</AnimatePresence>".length;
    src = src.substring(0, boardSettingsStart) + "{renderSettings()}" + src.substring(blockEnd);
  }
}

fs.writeFileSync('src/App.tsx', src);
