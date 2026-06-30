/* ═══════════════════════════════════════════════════════════
   GUARDIAN AI — Application Logic (Priority 1 Functional)
   Particle system, boot sequence, orbits, command center,
   analytics, voice orb, microinteractions, and modes.
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // Feature Flags
  const FEATURES = {
    voice: true,
    gemini: true,
    tts: true,
    dynamicScheduling: true
  };

  // ─── SYSTEM EVENT BUS ─────────────────────────────────────
  class EventBus {
    constructor() {
      this.listeners = {};
    }
    on(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    }
    emit(event, data) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(cb => cb(data));
      }
    }
  }
  const eventBus = new EventBus();

  // ─── PROCEDURAL SOUND MANAGER (3C) ─────────────────────────
  class SoundManager {
    constructor() {
      this.audioCtx = null;
      this.isMuted = localStorage.getItem('guardian_sfx_mute') === 'true';
      this.muteBtn = document.getElementById('sfx-mute');
      
      if (this.muteBtn) {
        this.updateMuteUI();
        this.muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.isMuted = !this.isMuted;
          localStorage.setItem('guardian_sfx_mute', this.isMuted);
          this.updateMuteUI();
        });
      }

      const unlock = () => {
        if (!this.audioCtx) {
          this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('click', unlock);
      document.addEventListener('keydown', unlock);
    }

    updateMuteUI() {
      if (this.muteBtn) {
        this.muteBtn.textContent = this.isMuted ? '🔇' : '🎵';
        this.muteBtn.classList.toggle('muted', this.isMuted);
      }
    }

    playTone(frequency, type, duration, slideTo = null) {
      if (this.isMuted) return;
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
      
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, this.audioCtx.currentTime + duration);
      }

      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    }

    playClick() {
      this.playTone(600, 'sine', 0.1, 1000);
    }

    playChime() {
      this.playTone(523.25, 'sine', 0.15); // C5
      setTimeout(() => this.playTone(659.25, 'sine', 0.3), 100); // E5
    }

    playWhoosh() {
      this.playTone(150, 'triangle', 0.5, 40);
    }

    playAlert() {
      this.playTone(880, 'sawtooth', 0.2);
      setTimeout(() => this.playTone(880, 'sawtooth', 0.2), 150);
    }

    playStinger() {
      this.playTone(220, 'sawtooth', 0.6, 110);
      setTimeout(() => this.playTone(330, 'sawtooth', 0.6, 165), 150);
    }
  }
  const soundManager = new SoundManager();

  // ─── TASK STORE & SCHEDULER (1D) ─────────────────────────

  const INITIAL_TASKS = [
    { id: 't1', title: 'Technical Interview', icon: '🎯', type: 'meeting', deadline: Date.now() + 2.25*3600000, estimatedDuration: 60, dependencies: ['t5'], riskScore: 82, status: 'upcoming', probability: '73%', difficulty: 'Hard', desc: 'Full-stack developer role at a Series B startup.', rec: 'Prioritize camera test now.' },
    { id: 't2', title: 'ML Assignment #3', icon: '📝', type: 'work', deadline: Date.now() + 5.5*3600000, estimatedDuration: 180, dependencies: ['t6'], riskScore: 76, status: 'upcoming', probability: '65%', difficulty: 'Hard', desc: 'Neural network implementation with custom backprop.', rec: 'Start preprocessing immediately.' },
    { id: 't3', title: 'DSA Exam Review', icon: '📚', type: 'study', deadline: Date.now() + 8*3600000, estimatedDuration: 120, dependencies: [], riskScore: 58, status: 'upcoming', probability: '58%', difficulty: 'Medium', desc: 'Covers graph algorithms and DP.', rec: 'Focus on BFS/DFS.' },
    { id: 't4', title: 'Team Meeting', icon: '👥', type: 'meeting', deadline: Date.now() + 6*3600000, estimatedDuration: 60, dependencies: [], riskScore: 32, status: 'upcoming', probability: '88%', difficulty: 'Easy', desc: 'Weekly sprint planning.', rec: 'Agenda confirmed.' },
    { id: 't5', title: 'Camera Test', icon: '📷', type: 'prep', deadline: Date.now() + 1*3600000, estimatedDuration: 5, dependencies: [], riskScore: 90, status: 'upcoming', probability: '100%', difficulty: 'Easy', desc: 'Check A/V for interview.', rec: 'Do this immediately.' },
    { id: 't6', title: 'Dataset Prep', icon: '📊', type: 'prep', deadline: Date.now() + 4*3600000, estimatedDuration: 30, dependencies: [], riskScore: 80, status: 'upcoming', probability: '90%', difficulty: 'Medium', desc: 'Clean CSV for assignment.', rec: 'Required before model training.' },
  ];

  class TaskStore {
    constructor() {
      this.tasks = [];
      this.listeners = [];
      this.load();
    }
    load() {
      const stored = localStorage.getItem('guardian_tasks');
      if (stored) {
        this.tasks = JSON.parse(stored);
      } else {
        this.tasks = INITIAL_TASKS;
        this.save();
      }
    }
    save() {
      localStorage.setItem('guardian_tasks', JSON.stringify(this.tasks));
      this.notify();
      eventBus.emit('task-state-change', this.tasks);
    }
    updateTask(id, updates) {
      const task = this.tasks.find(t => t.id === id);
      if (task) {
        Object.assign(task, updates);
        this.save();
      }
    }
    completeTask(titleSubstr) {
      const task = this.tasks.find(t => t.title.toLowerCase().includes(titleSubstr.toLowerCase()) && t.status !== 'completed');
      if (task) {
        task.status = 'completed';
        this.save();
        soundManager.playChime();
        return task.title;
      }
      return null;
    }
    subscribe(fn) {
      this.listeners.push(fn);
    }
    notify() {
      this.listeners.forEach(fn => fn(this.tasks));
    }
  }

  class Scheduler {
    constructor(store) {
      this.store = store;
    }
    recalculate(tasks, emergency = false) {
      const now = Date.now();
      let totalRisk = 0;
      
      tasks.forEach(t => {
        if (t.status === 'completed') {
          t.riskScore = 0;
          return;
        }
        const timeRemainingMs = t.deadline - now;
        const timeRemainingMins = timeRemainingMs / 60000;
        const depFactor = t.dependencies.filter(depId => {
          const dep = tasks.find(x => x.id === depId);
          return dep && dep.status !== 'completed';
        }).length * 0.15;
        
        const buffer = emergency ? 0.5 : 1.0;
        let risk = 100 * (1 - (timeRemainingMins - (t.estimatedDuration * (1 + depFactor))) / (timeRemainingMins * buffer));
        
        t.riskScore = Math.max(10, Math.min(100, Math.round(risk)));
        totalRisk += t.riskScore;
      });

      // Topological + priority sort
      const sorted = [...tasks].sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        if (a.dependencies.includes(b.id)) return 1;
        if (b.dependencies.includes(a.id)) return -1;
        
        const urgencyA = (a.deadline - now);
        const urgencyB = (b.deadline - now);
        const scoreA = emergency ? urgencyA : (urgencyA * 0.6 - a.riskScore * 1000 * 0.4);
        const scoreB = emergency ? urgencyB : (urgencyB * 0.6 - b.riskScore * 1000 * 0.4);
        return scoreA - scoreB;
      });

      return {
        tasks: sorted,
        avgRisk: tasks.length ? Math.round(totalRisk / tasks.length) : 0
      };
    }
  }

  const store = new TaskStore();
  const scheduler = new Scheduler(store);

  // ─── FLIP ANIMATOR ─────────────────────────────────────────

  const FlipAnimator = {
    positions: new Map(),
    capture(selector) {
      document.querySelectorAll(selector).forEach(el => {
        this.positions.set(el.id || el.dataset.id, el.getBoundingClientRect());
      });
    },
    animate(selector) {
      document.querySelectorAll(selector).forEach(el => {
        const id = el.id || el.dataset.id;
        const oldRect = this.positions.get(id);
        if (oldRect) {
          const newRect = el.getBoundingClientRect();
          const dx = oldRect.left - newRect.left;
          const dy = oldRect.top - newRect.top;
          if (dx !== 0 || dy !== 0) {
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            el.style.transition = 'none';
            requestAnimationFrame(() => {
              el.style.transform = '';
              el.style.transition = 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
            });
          }
        }
      });
      this.positions.clear();
    }
  };

  // ─── ORCHESTRATOR & INTENT PARSER ──────────────────────────

  class Orchestrator {
    constructor() {
      this.commandCenter = null;
      this.voiceEngine = null;
      this.geminiClient = null;
      this.ttsEngine = null;
      this.waitingForCloseConfirmation = false;
    }

    setDependencies(cc, ve, gc, tts) {
      this.commandCenter = cc;
      this.voiceEngine = ve;
      this.geminiClient = gc;
      this.ttsEngine = tts;
    }

    handleIntent(transcript) {
      const lower = transcript.toLowerCase();
      
      // Close confirmation handler
      if (this.waitingForCloseConfirmation) {
        this.waitingForCloseConfirmation = false;
        if (lower.includes('yes') || lower.includes('yeah') || lower.includes('yep') || lower.includes('sure') || lower.includes('close') || lower.includes('confirm') || lower.includes('ok') || lower.includes('okay')) {
          this.voiceEngine.continuousMode = false;
          this.ttsEngine.speak("Closing conversation. Let me know if you need anything else.", true);
          return;
        } else if (lower.includes('no') || lower.includes('nope') || lower.includes('not yet') || lower.includes('keep open')) {
          this.ttsEngine.speak("Understood. Keeping session active. How else can I assist you?", true);
          return;
        }
      }

      // Quick Intents
      if (lower.includes('rescue mode') || lower.includes('activate rescue')) {
        this.ttsEngine.speak("Activating Rescue Mode.");
        document.getElementById('rescue-btn').click();
        return;
      }
      if (lower.includes('focus mode') || lower.includes('start focus')) {
        this.ttsEngine.speak("Entering Focus Mode.");
        document.getElementById('focus-btn').click();
        return;
      }
      if (lower.includes('replan')) {
        this.replanDay();
        return;
      }
      if (lower.includes('complete')) {
        // e.g. "mark camera test complete"
        const words = lower.replace('mark', '').replace('complete', '').trim();
        const completed = store.completeTask(words);
        if (completed) {
          this.ttsEngine.speak(`Marked ${completed} as complete.`);
          this.commandCenter.addEntry({ type: 'success', text: `Task updated: ${completed} [DONE]` });
        } else {
          this.ttsEngine.speak(`Could not find a task matching ${words}.`);
        }
        return;
      }

      // Generative Query (Gemini)
      this.commandCenter.addEntry({ type: 'system', text: `User: "${transcript}"` });
      this.geminiClient.generateResponse(transcript);
    }

    replanDay(emergency = false) {
      this.commandCenter.addEntry({ type: 'info', text: 'Recalculating mission schedule...' });
      soundManager.playWhoosh();
      
      FlipAnimator.capture('.timeline-node');
      FlipAnimator.capture('.planet');
      
      const { tasks, avgRisk } = scheduler.recalculate(store.tasks, emergency);
      store.tasks = tasks; // update order
      
      // Re-render UI
      renderTimeline(document.getElementById('timeline-container'), tasks);
      renderOrbits(document.getElementById('orbit-container'), tasks);
      
      requestAnimationFrame(() => {
        FlipAnimator.animate('.timeline-node');
        FlipAnimator.animate('.planet');
      });

      const currentSuccess = Math.max(0, 100 - avgRisk);
      const msg = `Mission recalculated. Current average risk is ${avgRisk}%.`;
      this.ttsEngine.speak(msg);
      this.commandCenter.addEntry({ type: 'warn', text: msg });
      
      const missionVal = document.getElementById('mission-value');
      const prevSuccess = parseInt(missionVal.textContent) || 0;
      animateCounter(missionVal, currentSuccess, 1000);

      // Trend Indicator (Priority 3B)
      if (!this.predictionHistory) this.predictionHistory = [];
      this.predictionHistory.push({ time: Date.now(), val: currentSuccess });
      if (this.predictionHistory.length > 20) this.predictionHistory.shift();

      let trendEl = document.getElementById('mission-trend');
      if (!trendEl) {
        trendEl = document.createElement('span');
        trendEl.id = 'mission-trend';
        trendEl.style.fontSize = '12px';
        trendEl.style.marginLeft = '8px';
        trendEl.style.fontWeight = '700';
        document.getElementById('mission-value').parentNode.appendChild(trendEl);
      }

      const delta = currentSuccess - prevSuccess;
      if (delta > 0) {
        trendEl.textContent = `▲ ${delta}%`;
        trendEl.style.color = 'var(--success)';
        soundManager.playChime();
      } else if (delta < 0) {
        trendEl.textContent = `▼ ${Math.abs(delta)}%`;
        trendEl.style.color = 'var(--danger)';
        soundManager.playAlert();
      } else {
        trendEl.textContent = ``;
      }

      // Expressive Core Orb States (Priority 3D)
      const coreEl = document.getElementById('ai-core');
      if (coreEl) {
        coreEl.classList.remove('concerned', 'alert', 'celebratory', 'thinking-deep');
        if (currentSuccess < 50) {
          coreEl.classList.add('alert');
          // Shake/perturb planets in orbit
          document.querySelectorAll('.planet').forEach(p => p.classList.add('perturbed'));
        } else if (currentSuccess < 75) {
          coreEl.classList.add('concerned');
          document.querySelectorAll('.planet').forEach(p => p.classList.add('perturbed'));
        } else {
          document.querySelectorAll('.planet').forEach(p => p.classList.remove('perturbed'));
        }
      }
    }
  }
  const orchestrator = new Orchestrator();

  // ─── VOICE ENGINE (1A) ────────────────────────────────────

  class VoiceEngine {
    constructor(orb) {
      this.orb = orb;
      this.label = orb.querySelector('.voice-label');
      this.transcriptEl = document.getElementById('voice-transcript');
      this.inputWrap = document.getElementById('voice-input-wrap');
      this.textInput = document.getElementById('voice-text-input');
      this.state = 'idle';
      this.continuousMode = false;
      
      // Web Audio for Waveform
      this.audioCtx = null;
      this.analyser = null;
      this.microphone = null;
      this.drawVisual = null;

      // Web Speech
      this.recognition = null;
      this.setupRecognition();

      this.orb.addEventListener('click', () => this.toggle());
      
      this.textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && this.textInput.value.trim()) {
          const val = this.textInput.value.trim();
          this.textInput.value = '';
          this.setState('processing');
          orchestrator.handleIntent(val);
        }
      });
    }

    setupRecognition() {
      if (!FEATURES.voice) return;
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;

        this.recognition.onresult = (event) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (interim) {
            this.transcriptEl.textContent = interim;
            this.transcriptEl.classList.add('active');
          }
          if (final) {
            this.transcriptEl.textContent = final;
            setTimeout(() => this.transcriptEl.classList.remove('active'), 2000);
            this.stopAudioAnalysis();
            this.setState('processing');
            orchestrator.handleIntent(final);
          }
        };

        this.recognition.onerror = (event) => {
          if (event.error === 'not-allowed') {
            this.showError('Mic access denied');
            orchestrator.ttsEngine.speak("I need microphone access to listen.");
          } else if (event.error !== 'no-speech') {
            this.showError('Network error');
          } else {
            this.setState('idle');
          }
          this.stopAudioAnalysis();
        };

        this.recognition.onend = () => {
          if (this.state === 'listening') {
            this.setState('idle');
            this.stopAudioAnalysis();
          }
        };
      } else {
        console.warn('SpeechRecognition not supported.');
      }
    }

    async startAudioAnalysis() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioCtx.createAnalyser();
        this.microphone = this.audioCtx.createMediaStreamSource(stream);
        this.microphone.connect(this.analyser);
        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const rings = this.orb.querySelectorAll('.voice-ring-anim');

        const draw = () => {
          if (this.state !== 'listening') return;
          this.drawVisual = requestAnimationFrame(draw);
          this.analyser.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for(let i=0; i<bufferLength; i++) {
             sum += dataArray[i];
          }
          const avg = sum / bufferLength; // 0 to 255
          
          // Modulate rings based on volume
          const scale = 1 + (avg / 255) * 1.5;
          rings.forEach((ring, i) => {
             // We apply transform on top of the animation or override it if we pause CSS anim
             // The CSS animation handles expansion, but let's boost border opacity based on volume
             ring.style.borderColor = `rgba(0, 245, 255, ${0.3 + (avg/255)*0.7})`;
          });
          this.orb.querySelector('.voice-core').style.transform = `scale(${1 + (avg/255)*0.2})`;
        };
        draw();
      } catch (err) {
        console.error("Audio access failed", err);
      }
    }

    stopAudioAnalysis() {
      if (this.drawVisual) cancelAnimationFrame(this.drawVisual);
      if (this.microphone) this.microphone.disconnect();
      this.orb.querySelector('.voice-core').style.transform = '';
      this.orb.querySelectorAll('.voice-ring-anim').forEach(r => r.style.borderColor = '');
    }

    toggle() {
      if (this.state !== 'idle') {
        orchestrator.ttsEngine.stop();
        this.continuousMode = false;
        if (this.recognition) {
           try { this.recognition.stop(); } catch(e) {}
        }
        this.setState('idle');
        this.stopAudioAnalysis();
        return;
      }
      
      if (this.state === 'idle') {
        orchestrator.ttsEngine.stop();
        this.continuousMode = true;
        if (this.recognition) {
          this.setState('listening');
          try {
             this.recognition.start();
          } catch (e) {
             console.warn("SpeechRecognition was already started.");
          }
          this.startAudioAnalysis();
        } else {
          // Fallback to text input
          this.inputWrap.classList.toggle('hidden');
          if (!this.inputWrap.classList.contains('hidden')) {
            this.textInput.focus();
          }
        }
      }
    }

    setState(state) {
      this.state = state;
      this.orb.classList.remove('listening', 'processing', 'speaking', 'error');
      if (state !== 'idle') {
        this.orb.classList.add(state);
      }
      
      switch(state) {
        case 'idle':
          this.label.textContent = 'AI Assistant';
          break;
        case 'listening':
          this.label.textContent = 'Listening...';
          this.inputWrap.classList.add('hidden');
          break;
        case 'processing':
          this.animateProcessingLabel();
          break;
        case 'speaking':
          this.label.textContent = 'Guardian AI';
          break;
      }
    }
    
    showError(msg) {
      this.state = 'error';
      this.orb.classList.remove('listening', 'processing', 'speaking');
      this.orb.classList.add('error');
      this.label.textContent = msg;
      setTimeout(() => this.setState('idle'), 3000);
    }

    animateProcessingLabel() {
      const states = ['Analyzing...', 'Thinking...', 'Planning...'];
      let i = 0;
      const interval = setInterval(() => {
        if (this.state !== 'processing') {
          clearInterval(interval);
          return;
        }
        this.label.textContent = states[i % states.length];
        i++;
      }, 600);
    }
  }

  // ─── GEMINI CLIENT (1B) ───────────────────────────────────

  class GeminiClient {
    constructor() {
      this.history = [];
    }

    triggerLocalBackupFallback(message) {
      console.warn("Gemini API failed. Triggering backup local parsing...");
      orchestrator.commandCenter.addEntry({ type: 'warn', text: 'System: Backup offline intelligence active.' });
      
      const lower = message.toLowerCase();
      
      if (lower.includes("rescue mode") || lower.includes("activate rescue")) {
         orchestrator.commandCenter.updateLastEntry("System: Rescue Mode Activated (Backup).");
         document.getElementById('rescue-overlay').classList.add('active');
         orchestrator.replanDay(true);
         orchestrator.waitingForCloseConfirmation = true;
         orchestrator.ttsEngine.speak("Fallback Mode: Activating rescue mode. Should I close the conversation?", true);
         return;
      }
      
      if (lower.includes("replan") || lower.includes("recalculate")) {
         orchestrator.commandCenter.updateLastEntry("System: Schedule Recalculated (Backup).");
         orchestrator.replanDay(false);
         orchestrator.waitingForCloseConfirmation = true;
         orchestrator.ttsEngine.speak("Fallback Mode: Recalculating mission parameters. Should I close the conversation?", true);
         return;
      }
      
      // Parse task creation backup
      if (lower.includes("create") || lower.includes("task") || lower.includes("add")) {
         const taskMatch = message.match(/(?:create|add)(?: a)? task(?: to)? (.*?)(?: taking (\d+) minutes?)?$/i);
         const title = taskMatch && taskMatch[1] && taskMatch[1].trim().length > 0 ? taskMatch[1].trim() : "Backup Task";
         const duration = taskMatch && taskMatch[2] ? parseInt(taskMatch[2]) : 45;
         
         const newTask = {
           id: 't_' + Math.random().toString(36).substr(2, 9),
           title: title,
           estimatedDuration: duration,
           difficulty: 'Medium',
           desc: 'Created via backup local parser.',
           deadline: Date.now() + 24 * 60 * 60 * 1000,
           status: 'pending',
           probabilityOfFailure: 35,
           dependencies: []
         };
         store.tasks.push(newTask);
         store.save();
         orchestrator.replanDay(false);
         orchestrator.commandCenter.updateLastEntry("System: Created task '" + title + "' (Backup).");
         orchestrator.waitingForCloseConfirmation = true;
         orchestrator.ttsEngine.speak(`Fallback Mode: Task ${title} created successfully. Mission schedule recalculated. Should I close the conversation?`, true);
         return;
      }

      // Default mock answer if no specific command matched
      const fallbackReplies = [
        "Mission Control is currently offline, but I have queued your query. All scheduled tasks are secure.",
        "Unable to reach the cloud. Running on backup offline protocols. Timeline and orbits are fully synchronized."
      ];
      const reply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
      orchestrator.commandCenter.updateLastEntry(reply);
      orchestrator.waitingForCloseConfirmation = true;
      orchestrator.ttsEngine.speak(reply + " Should I close the conversation?", true);
    }

    async generateResponse(message) {
      if (!FEATURES.gemini) {
        setTimeout(() => orchestrator.ttsEngine.speak("API integration is currently disabled."), 1000);
        return;
      }

      // ─── OFFLINE INTENT PARSER ───
      const lowerMsg = message.toLowerCase();
      
      if (lowerMsg.includes("activate rescue mode") || lowerMsg.includes("help me")) {
         orchestrator.commandCenter.updateLastEntry("System: Rescue Mode Activated.");
         document.getElementById('rescue-overlay').classList.add('active');
         orchestrator.replanDay(true);
         orchestrator.waitingForCloseConfirmation = true;
         orchestrator.ttsEngine.speak("Activating rescue mode. Should I close the conversation?", true);
         return;
      }
      
      if (lowerMsg.includes("replan my day") || lowerMsg.includes("recalculate")) {
         orchestrator.commandCenter.updateLastEntry("System: Schedule Recalculated.");
         orchestrator.replanDay(false);
         orchestrator.waitingForCloseConfirmation = true;
         orchestrator.ttsEngine.speak("Recalculating mission parameters. Should I close the conversation?", true);
         return;
      }
      
      if (lowerMsg.includes("create") && lowerMsg.includes("task")) {
         // Try to extract task name and duration
         const taskMatch = message.match(/(?:create|add)(?: a)? task(?: to)? (.*?)(?: taking (\d+) minutes?)?$/i);
         const title = taskMatch && taskMatch[1] && taskMatch[1].trim().length > 0 ? taskMatch[1].trim() : "Unknown Task";
         const duration = taskMatch && taskMatch[2] ? parseInt(taskMatch[2]) : 30;
         
         if (title === "Unknown Task") {
            orchestrator.ttsEngine.speak("Please specify the task name. For example: Create a task to buy groceries taking 30 minutes.", true);
            return;
         }

         const newTask = {
           id: 't_' + Math.random().toString(36).substr(2, 9),
           title: title,
           estimatedDuration: duration,
           difficulty: 'Medium',
           desc: 'Created via offline voice command.',
           deadline: Date.now() + 24 * 60 * 60 * 1000,
           status: 'pending',
           probabilityOfFailure: 40,
           dependencies: []
         };
         store.tasks.push(newTask);
         store.save();
         orchestrator.replanDay(false);
         orchestrator.commandCenter.updateLastEntry("System: Created task '" + title + "'.");
         orchestrator.waitingForCloseConfirmation = true;
         orchestrator.ttsEngine.speak(`Task ${title} created successfully. Mission schedule recalculated. Should I close the conversation?`, true);
         return;
      }

      const { tasks, avgRisk } = scheduler.recalculate(store.tasks);
      const context = {
        timeRemaining: "4h 30m",
        missionSuccess: 100 - avgRisk,
        tasks: tasks.map(t => ({ title: t.title, risk: t.riskScore, status: t.status }))
      };

      const coreEl = document.getElementById('ai-core');
      if (coreEl) {
         coreEl.classList.remove('concerned', 'alert', 'celebratory');
         coreEl.classList.add('thinking-deep');
      }

      try {
        const response = await fetch('http://localhost:8080/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, context, history: this.history })
        });

        if (coreEl) {
           coreEl.classList.remove('thinking-deep');
        }

        if (!response.ok) throw new Error('API request failed');

        this.history.push({ role: 'USER', content: message });
        let aiResponse = "";
        
        // Handle SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // Enter processing/speaking state
        orchestrator.voiceEngine.setState('speaking');
        
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) {
                  this.triggerLocalBackupFallback(message);
                  return;
                }
                if (data.functionCall) {
                  const name = data.functionCall.name;
                  const args = data.functionCall.args;
                  
                  if (name === 'createTask') {
                     const newTask = {
                       id: 't_' + Math.random().toString(36).substr(2, 9),
                       title: args.title || "New Task",
                       estimatedDuration: args.estimatedDuration || 30,
                       difficulty: args.difficulty || 'Medium',
                       desc: args.desc || "",
                       deadline: Date.now() + 24 * 60 * 60 * 1000,
                       status: 'pending',
                       probabilityOfFailure: args.difficulty === 'Hard' ? 60 : (args.difficulty === 'Medium' ? 40 : 20),
                       dependencies: []
                     };
                     store.tasks.push(newTask);
                     store.save();
                     orchestrator.replanDay(false);
                     orchestrator.commandCenter.updateLastEntry("System: Created task '" + newTask.title + "'.");
                     orchestrator.waitingForCloseConfirmation = true;
                     orchestrator.ttsEngine.speak("Task created successfully. Mission schedule recalculated. Should I close the conversation?", true);
                     this.history.push({ role: 'GUARDIAN AI', content: "Task created successfully. Should I close the conversation?" });
                     if (this.history.length > 10) this.history = this.history.slice(-10);
                  }
                  else if (name === 'createCalendarEvent') {
                     const newTask = {
                       id: 'cal_' + Math.random().toString(36).substr(2, 9),
                       title: args.title || "Calendar Task",
                       estimatedDuration: args.estimatedDuration || 30,
                       difficulty: 'Medium',
                       desc: args.desc || "",
                       deadline: Date.now() + 24 * 60 * 60 * 1000,
                       status: 'pending',
                       probabilityOfFailure: 40,
                       dependencies: []
                     };
                     store.tasks.push(newTask);
                     store.save();
                     orchestrator.replanDay(false);
                     
                     // Background sync write-back to Google Calendar
                     fetch('/api/calendar/event', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify(newTask)
                     }).catch(console.error);

                     orchestrator.commandCenter.updateLastEntry("System: Created calendar event '" + newTask.title + "'.");
                     orchestrator.waitingForCloseConfirmation = true;
                     orchestrator.ttsEngine.speak("Google Calendar event created successfully. Mission schedule recalculated. Should I close the conversation?", true);
                     this.history.push({ role: 'GUARDIAN AI', content: "Google Calendar event created successfully. Should I close the conversation?" });
                     if (this.history.length > 10) this.history = this.history.slice(-10);
                  }
                  else if (name === 'rescheduleTask') {
                     const task = store.tasks.find(t => t.id === args.taskId || t.title.toLowerCase().includes((args.taskId || "").toLowerCase()));
                     if (task) {
                        task.deadline = Date.now() + (args.newTimeMins || 60) * 60000;
                        store.save();
                        orchestrator.replanDay(false);
                        orchestrator.commandCenter.updateLastEntry("System: Rescheduled task '" + task.title + "'.");
                        orchestrator.waitingForCloseConfirmation = true;
                        orchestrator.ttsEngine.speak(`Task ${task.title} has been rescheduled. Should I close the conversation?`, true);
                        this.history.push({ role: 'GUARDIAN AI', content: `Task ${task.title} rescheduled. Should I close the conversation?` });
                        if (this.history.length > 10) this.history = this.history.slice(-10);
                     } else {
                        orchestrator.ttsEngine.speak("Could not find the specified task to reschedule. Should I close the conversation?", true);
                     }
                  }
                  else if (name === 'markTaskComplete') {
                     const titleSubstr = args.titleSubstr;
                     const completedTitle = store.completeTask(titleSubstr);
                     if (completedTitle) {
                        orchestrator.replanDay(false);
                        orchestrator.commandCenter.updateLastEntry("System: Task completed: " + completedTitle);
                        orchestrator.waitingForCloseConfirmation = true;
                        orchestrator.ttsEngine.speak(`Marked ${completedTitle} as complete. Mission schedule recalculated. Should I close the conversation?`, true);
                        this.history.push({ role: 'GUARDIAN AI', content: `Marked task complete. Should I close the conversation?` });
                        if (this.history.length > 10) this.history = this.history.slice(-10);
                     } else {
                        orchestrator.ttsEngine.speak(`Could not find an active task matching ${titleSubstr}. Should I close the conversation?`, true);
                     }
                  }
                  else if (name === 'activateRescueMode') {
                     document.getElementById('rescue-overlay').classList.add('active');
                     orchestrator.replanDay(true);
                     orchestrator.waitingForCloseConfirmation = true;
                     orchestrator.ttsEngine.speak("Emergency Rescue Mode activated. All buffers minimized. Should I close the conversation?", true);
                     this.history.push({ role: 'GUARDIAN AI', content: "Rescue Mode activated. Should I close the conversation?" });
                     if (this.history.length > 10) this.history = this.history.slice(-10);
                  }
                  return;
                }
                if (data.text) {
                  aiResponse += data.text;
                  buffer += data.text;
                  
                  // Simple sentence boundary detection to trigger TTS early
                  if (buffer.match(/[.!?]\s/)) {
                     const parts = buffer.split(/(?<=[.!?])\s+/);
                     const sentence = parts.shift();
                     buffer = parts.join(' ');
                     orchestrator.ttsEngine.speak(sentence, false);
                  }
                  
                  orchestrator.commandCenter.updateLastEntry(aiResponse);
                }
              } catch (e) {
                // Ignore incomplete JSON chunks (rare in properly formatted SSE but safe)
              }
            }
          }
        }
        
        if (buffer.trim()) {
           orchestrator.ttsEngine.speak(buffer.trim(), false);
        }

        if (aiResponse.toLowerCase().includes("should i close")) {
           orchestrator.waitingForCloseConfirmation = true;
        }

        this.history.push({ role: 'GUARDIAN AI', content: aiResponse });
        if (this.history.length > 10) this.history = this.history.slice(-10); // Keep last 10 turns

      } catch (err) {
        console.error(err);
        this.triggerLocalBackupFallback(message);
      }
    }
  }

  // ─── TTS ENGINE (1C) ──────────────────────────────────────

  class TTSEngine {
    constructor() {
      this.synth = window.speechSynthesis;
      this.voices = [];
      this.selectedVoice = null;
      this.captionEl = document.getElementById('voice-caption');
      this.muteBtn = document.getElementById('tts-mute');
      
      this.isMuted = localStorage.getItem('guardian_mute') === 'true';
      this.updateMuteUI();

      this.muteBtn.addEventListener('click', () => {
        this.isMuted = !this.isMuted;
        localStorage.setItem('guardian_mute', this.isMuted);
        this.updateMuteUI();
        if (this.isMuted) this.stop();
      });

      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }

    updateMuteUI() {
      this.muteBtn.textContent = this.isMuted ? '🔇' : '🔊';
      this.muteBtn.classList.toggle('muted', this.isMuted);
    }

    loadVoices() {
      this.voices = this.synth.getVoices();
      // Try to find a good English voice (Daniel/Samantha on macOS, Google UK/US on Chrome)
      this.selectedVoice = this.voices.find(v => v.name.includes('Daniel') || v.name.includes('Google UK English Male')) 
                        || this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
    }

    speak(text, clearQueue = true) {
      if (!FEATURES.tts || this.isMuted) return;
      if (clearQueue) this.stop();

      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance; // prevent GC
      if (this.selectedVoice) utterance.voice = this.selectedVoice;
      utterance.pitch = 0.9;
      utterance.rate = 1.0;

      utterance.onstart = () => {
        orchestrator.voiceEngine.setState('speaking');
        this.captionEl.textContent = text;
        this.captionEl.classList.add('visible');
      };

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          // Pulse the orb slightly on words
          const core = document.querySelector('#voice-orb .voice-core');
          if (core) {
             core.style.transform = 'scale(1.15)';
             setTimeout(() => core.style.transform = 'scale(1)', 100);
          }
          // Highlight word in caption
          const before = text.substring(0, event.charIndex);
          const match = text.substring(event.charIndex).match(/^\w+/);
          const word = match ? match[0] : '';
          const after = text.substring(event.charIndex + word.length);
          this.captionEl.innerHTML = `${before}<span class="caption-highlight">${word}</span>${after}`;
        }
      };

      utterance.onend = () => {
        this.currentUtterance = null;
        // If queue is empty, handle next state
        if (!this.synth.pending) {
          if (orchestrator.voiceEngine.continuousMode && orchestrator.voiceEngine.state !== 'idle') {
            orchestrator.voiceEngine.setState('listening');
            if (orchestrator.voiceEngine.recognition) {
              try {
                orchestrator.voiceEngine.recognition.start();
                orchestrator.voiceEngine.startAudioAnalysis();
              } catch (e) {
                console.warn("SpeechRecognition auto-start failed:", e);
              }
            }
          } else {
            orchestrator.voiceEngine.setState('idle');
            this.captionEl.classList.remove('visible');
          }
        }
      };

      this.synth.speak(utterance);
    }

    stop() {
      this.synth.cancel();
      this.currentUtterance = null;
      this.captionEl.classList.remove('visible');
      orchestrator.voiceEngine.setState('idle');
    }
  }

  // ─── COMMAND CENTER LOGIC ─────────────────────────────────

  class CommandCenter {
    constructor(feedEl) {
      this.feed = feedEl;
      this.lastEntry = null;
    }
    addEntry(log) {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const entry = document.createElement('div');
      entry.className = `log-entry ${log.type}`;
      entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="log-text">${log.text}</span>`;
      this.feed.appendChild(entry);
      this.lastEntry = entry.querySelector('.log-text');
      this.scrollToBottom();
    }
    updateLastEntry(text) {
      if (this.lastEntry) {
        this.lastEntry.textContent = text;
        this.scrollToBottom();
      } else {
        this.addEntry({ type: 'info', text });
      }
    }
    scrollToBottom() {
      this.feed.scrollTop = this.feed.scrollHeight;
    }
  }

  // ─── RENDERERS ────────────────────────────────────────────

  function renderTimeline(container, tasks) {
    container.innerHTML = '';
    tasks.forEach((task, i) => {
      const node = document.createElement('div');
      node.className = `timeline-node ${task.status}`;
      node.dataset.id = task.id; // For FLIP

      const d = new Date(task.deadline);
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      let statusColor = 'var(--cyan)';
      if (task.status === 'completed') statusColor = 'var(--success)';
      else if (task.riskScore > 60) statusColor = 'var(--danger)';
      else if (task.riskScore > 30) statusColor = 'var(--warning)';

      const circumference = 2 * Math.PI * 8;
      const offset = circumference - (task.probability ? parseInt(task.probability)/100 : 1) * circumference;

      node.innerHTML = `
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <span class="timeline-label">${task.status === 'completed' ? '✓ ' : ''}${task.title}</span>
          <span class="timeline-time mono">${timeStr} | Risk: ${task.riskScore}%</span>
          <div class="timeline-meta">
            <svg class="timeline-ring" viewBox="0 0 24 24">
              <circle class="ring-bg" cx="12" cy="12" r="8"/>
              <circle class="ring-fill" cx="12" cy="12" r="8" stroke="${statusColor}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
            </svg>
            <span class="timeline-prob mono" style="color:${statusColor}">${task.probability}</span>
          </div>
        </div>
      `;
      container.appendChild(node);
      setTimeout(() => node.classList.add('revealed'), 50 * i);
    });
  }

  const ORBIT_PATHS = [ { rx: 190, ry: 100 }, { rx: 250, ry: 130 }, { rx: 310, ry: 160 } ];

  function renderOrbits(container, tasks) {
    // Clear old planets but keep paths
    Array.from(container.children).forEach(c => {
      if (c.classList.contains('planet')) c.remove();
    });

    const activeTasks = tasks.filter(t => t.status !== 'completed').slice(0, 8); // Max 8 planets

    activeTasks.forEach((task, i) => {
      const el = document.createElement('div');
      el.className = 'planet';
      el.dataset.id = `planet-${task.id}`;

      // Calculate orbit params based on risk
      let orbitLevel = 3; // low risk (outer)
      let riskClass = 'risk-low';
      let speed = 0.08;
      if (task.riskScore > 60) { orbitLevel = 1; riskClass = 'risk-high'; speed = 0.35; }
      else if (task.riskScore > 30) { orbitLevel = 2; riskClass = 'risk-medium'; speed = 0.18; }

      const angle = (i * (360 / activeTasks.length)) % 360;

      el.innerHTML = `
        <div class="planet-body ${riskClass}">${task.icon}</div>
        <span class="planet-label">${task.title}</span>
      `;
      
      // Store data for orbit loop
      el.dataset.angle = angle;
      el.dataset.speed = speed;
      el.dataset.rx = ORBIT_PATHS[orbitLevel-1].rx;
      el.dataset.ry = ORBIT_PATHS[orbitLevel-1].ry;

      container.appendChild(el);
    });
  }

  function updateOrbitLoop() {
    const container = document.getElementById('orbit-container');
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;

    container.querySelectorAll('.planet').forEach(el => {
      let angle = parseFloat(el.dataset.angle);
      const speed = parseFloat(el.dataset.speed);
      const rx = parseFloat(el.dataset.rx);
      const ry = parseFloat(el.dataset.ry);

      angle = (angle + speed) % 360;
      el.dataset.angle = angle;

      const rad = (angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * rx;
      const y = cy + Math.sin(rad) * ry * 0.55;

      const depth = Math.sin(rad);
      const scale = 0.7 + 0.3 * ((depth + 1) / 2);
      
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = `translate(-50%, -50%) scale(${scale})`;
      el.style.zIndex = depth > 0 ? 10 : 1;
      el.style.opacity = 0.5 + 0.5 * ((depth + 1) / 2);
    });

    requestAnimationFrame(updateOrbitLoop);
  }

  // ─── UTILITIES & UI COMPONENTS ────────────────────────────

  function animateCounter(element, target, duration = 1200, suffix = '') {
    const start = performance.now();
    const initial = parseInt(element.textContent) || 0;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      element.textContent = Math.round(initial + (target - initial) * eased) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Reusing Boot, Analytics, Finder, Rescue, Focus, ParticleSystem from previous
  class BootSequence {
    constructor(onComplete) {
      this.overlay = document.getElementById('boot-overlay');
      this.lines = document.querySelectorAll('.boot-line');
      this.final = document.querySelector('.boot-final');
      this.skipBtn = document.getElementById('skip-boot');
      this.onComplete = onComplete;
      this.skipped = false;
      
      if (this.skipBtn) {
        this.skipBtn.addEventListener('click', () => {
          this.skipped = true;
          this.overlay.classList.add('hidden');
          this.onComplete();
        });
      }
    }
    async start() {
      await new Promise(r => setTimeout(r, 1000));
      if (this.skipped) return;
      for (let line of this.lines) {
        if (this.skipped) return;
        line.classList.add('active');
        await new Promise(r => setTimeout(r, 300));
        line.classList.add('complete');
      }
      if (this.skipped) return;
      this.final.classList.add('active');
      await new Promise(r => setTimeout(r, 800));
      if (this.skipped) return;
      this.overlay.classList.add('fade-out');
      setTimeout(() => {
        if (!this.skipped) this.onComplete();
      }, 800);
    }
  }

  // Settings & Memory UI controls
  function setupSettingsControls(cc) {
    const settingsBtn = document.getElementById('settings-toggle-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close-btn');
    
    const calendarStatusText = document.getElementById('calendar-status-text');
    const calendarConnectBtn = document.getElementById('calendar-connect-btn');
    const githubStatusText = document.getElementById('github-status-text');
    const githubConnectBtn = document.getElementById('github-connect-btn');
    const mapsToggle = document.getElementById('maps-toggle');
    const memoryList = document.getElementById('memory-list');
    const memoryClearBtn = document.getElementById('memory-clear-btn');

    settingsBtn.addEventListener('click', () => {
      settingsOverlay.classList.remove('hidden');
      refreshSettingsUI();
    });

    settingsClose.addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
    });

    calendarConnectBtn.addEventListener('click', () => {
      window.location.href = '/auth/google';
    });

    githubConnectBtn.addEventListener('click', async () => {
      cc.addEntry({ type: 'info', text: 'Syncing GitHub issues...' });
      try {
        const res = await fetch('/api/github/sync');
        const issues = await res.json();
        issues.forEach(issue => {
          if (!store.tasks.some(t => t.id === issue.id)) {
            const newTask = {
              id: issue.id,
              title: issue.title,
              icon: '🐙',
              type: 'work',
              deadline: issue.deadline,
              estimatedDuration: issue.duration,
              dependencies: [],
              riskScore: 40,
              status: 'upcoming',
              probability: '60%',
              difficulty: 'Medium',
              desc: issue.desc
            };
            store.tasks.push(newTask);
          }
        });
        store.save();
        orchestrator.replanDay(false);
        cc.addEntry({ type: 'success', text: `Synchronized ${issues.length} tasks from GitHub.` });
        refreshSettingsUI();
      } catch (e) {
        cc.addEntry({ type: 'error', text: 'GitHub synchronization failed.' });
      }
    });

    mapsToggle.addEventListener('change', async () => {
      const enabled = mapsToggle.checked;
      localStorage.setItem('guardian_maps_enabled', enabled);
      if (enabled) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            cc.addEntry({ type: 'info', text: 'Geolocation enabled. Travel warnings active.' });
            calculateTravelTimes(pos.coords.latitude, pos.coords.longitude, cc);
          },
          (err) => {
            mapsToggle.checked = false;
            localStorage.setItem('guardian_maps_enabled', false);
            cc.addEntry({ type: 'error', text: 'Geolocation access denied.' });
          }
        );
      }
    });

    memoryClearBtn.addEventListener('click', async () => {
      const res = await fetch('/api/memory/clear', { method: 'POST' });
      if (res.ok) {
        cc.addEntry({ type: 'info', text: 'AI Memory cleared.' });
        refreshSettingsUI();
      }
    });

    async function refreshSettingsUI() {
      try {
        const calRes = await fetch('/api/calendar/status');
        const calStatus = await calRes.json();
        if (calStatus.connected) {
          calendarStatusText.textContent = 'Connected ' + (calStatus.isMock ? '(Mock)' : '');
          calendarConnectBtn.textContent = 'Disconnect';
          calendarConnectBtn.onclick = async () => {
            await fetch('/api/calendar/disconnect', { method: 'POST' });
            refreshSettingsUI();
          };
        } else {
          calendarStatusText.textContent = 'Disconnected';
          calendarConnectBtn.textContent = 'Connect Calendar';
          calendarConnectBtn.onclick = () => { window.location.href = '/auth/google'; };
        }
      } catch (e) {
        console.error("Failed to fetch calendar status:", e);
      }

      // Update GitHub sync status text
      const ghTaskCount = store.tasks.filter(t => t.id.startsWith('gh_')).length;
      githubStatusText.textContent = ghTaskCount > 0 ? `Synced (${ghTaskCount} issues)` : 'Disconnected';

      mapsToggle.checked = localStorage.getItem('guardian_maps_enabled') === 'true';

      try {
        const memRes = await fetch('/api/memory/structured');
        const memories = await memRes.json();
        memoryList.innerHTML = '';
        if (memories.length === 0) {
          memoryList.innerHTML = '<div style="color:var(--text-dim); text-align:center; font-size:11px; padding:10px 0;">No active memories stored</div>';
        } else {
          memories.forEach(m => {
            const row = document.createElement('div');
            row.className = 'memory-item';
            row.innerHTML = `
              <span class="memory-key">${m.key.slice(0, 15)}</span>
              <span class="memory-val">${m.val}</span>
              <button class="danger-btn" style="padding: 2px 6px; font-size: 10px;" onclick="deleteMemoryKey('${m.key}')">✕</button>
            `;
            memoryList.appendChild(row);
          });
        }
      } catch (e) {
        console.error("Failed to load memory settings:", e);
      }
    }

    window.deleteMemoryKey = async (key) => {
      const res = await fetch('/api/memory/structured', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      if (res.ok) {
        refreshSettingsUI();
      }
    };
  }

  async function calculateTravelTimes(lat, lon, cc) {
    if (localStorage.getItem('guardian_maps_enabled') !== 'true') return;
    const tasksWithLocation = store.tasks.filter(t => t.status !== 'completed' && t.type === 'meeting');
    for (let task of tasksWithLocation) {
      try {
        const res = await fetch('/api/maps/travel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: `${lat},${lon}`,
            destination: 'Building A, Room 102'
          })
        });
        const travel = await res.json();
        const leaveByTime = new Date(task.deadline - travel.durationMins * 60000);
        cc.addEntry({
          type: 'warn',
          text: `🚨 TRAVEL ALERT: Leave for "${task.title}" by ${leaveByTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}. Travel time is ${travel.durationMins} mins (${travel.distanceStr}) with a traffic delay of ${travel.trafficDelayMins} mins.`
        });
      } catch(e) {
        console.error("Maps travel alert failure:", e);
      }
    }
  }

  async function syncGoogleCalendar(cc) {
    cc.addEntry({ type: 'info', text: 'Synchronizing Google Calendar events...' });
    try {
      const res = await fetch('/api/calendar/sync');
      if (!res.ok) throw new Error('Failed to sync events');
      const events = await res.json();
      events.forEach(e => {
        const deadline = new Date(e.start.dateTime || e.start.date).getTime();
        const duration = e.end ? (new Date(e.end.dateTime || e.end.date).getTime() - deadline) / 60000 : 60;
        
        if (!store.tasks.some(t => t.id === e.id)) {
          const newTask = {
            id: e.id,
            title: e.summary,
            icon: '📅',
            type: e.summary.toLowerCase().includes('interview') ? 'meeting' : 'meeting',
            deadline: deadline,
            estimatedDuration: duration,
            dependencies: [],
            riskScore: 30,
            status: 'upcoming',
            probability: '50%',
            difficulty: 'Medium',
            desc: e.description || 'Google Calendar Event'
          };
          store.tasks.push(newTask);
        }
      });
      store.save();
      orchestrator.replanDay(false);
      cc.addEntry({ type: 'success', text: `Synchronized ${events.length} events from Google Calendar.` });
    } catch (e) {
      console.error(e);
      cc.addEntry({ type: 'error', text: 'Google Calendar sync failed.' });
    }
  }

  function initDashboard() {
    document.getElementById('dashboard').classList.add('visible');
    
    // Initial Render
    const { tasks, avgRisk } = scheduler.recalculate(store.tasks);
    store.tasks = tasks;
    
    renderTimeline(document.getElementById('timeline-container'), tasks);
    renderOrbits(document.getElementById('orbit-container'), tasks);
    updateOrbitLoop();
    
    animateCounter(document.getElementById('mission-value'), Math.max(0, 100 - avgRisk), 1500);
    document.getElementById('core-status').textContent = 'All Systems Operational';

    // Start Orchestrator
    const cc = new CommandCenter(document.getElementById('terminal-feed'));
    const ve = new VoiceEngine(document.getElementById('voice-orb'));
    const gc = new GeminiClient();
    const tts = new TTSEngine();
    
    orchestrator.setDependencies(cc, ve, gc, tts);
    document.getElementById('voice-orb').classList.add('visible');
    cc.addEntry({ type: 'info', text: 'Guardian AI initialized. Listening on all channels.' });

    // Setup integrations UI controls
    setupSettingsControls(cc);

    // Mission Success hover/click breakdown panel
    const coreSuccess = document.querySelector('.core-success');
    if (coreSuccess) {
      const breakdownPanel = document.createElement('div');
      breakdownPanel.className = 'success-breakdown-panel';
      coreSuccess.appendChild(breakdownPanel);
      
      const updateBreakdown = () => {
        const activeTasks = store.tasks.filter(t => t.status !== 'completed');
        const highRisk = activeTasks.filter(t => t.riskScore > 65).length;
        const mediumRisk = activeTasks.filter(t => t.riskScore > 30 && t.riskScore <= 65).length;
        const elapsed = activeTasks.some(t => t.deadline < Date.now());
        
        breakdownPanel.innerHTML = `
          <h4>SUCCESS FACTOR BREAKDOWN</h4>
          <div class="breakdown-row"><span>Active Schedule Risk:</span> <span>${highRisk ? 'CRITICAL (' + highRisk + ' tasks)' : 'STABLE'}</span></div>
          <div class="breakdown-row"><span>Pending Deadlines:</span> <span>${activeTasks.length} total</span></div>
          <div class="breakdown-row"><span>Time Buffer:</span> <span>${elapsed ? 'EXHAUSTED' : 'NORMAL'}</span></div>
          <div class="breakdown-row"><span>Geo-Location Safety:</span> <span>ACTIVE</span></div>
        `;
      };
      
      coreSuccess.addEventListener('mouseenter', () => {
        updateBreakdown();
        breakdownPanel.classList.add('visible');
      });
      coreSuccess.addEventListener('mouseleave', () => {
        breakdownPanel.classList.remove('visible');
      });
      coreSuccess.addEventListener('click', (e) => {
        e.stopPropagation();
        updateBreakdown();
        breakdownPanel.classList.toggle('visible');
      });
    }

    // Ambient Observer Loop (runs every 60 seconds)
    setInterval(() => {
      console.log("[Observer] Re-evaluating schedule parameters...");
      const activeTasks = store.tasks.filter(t => t.status !== 'completed');
      const now = Date.now();
      
      // 1. Alert on overdue task
      const overdue = activeTasks.find(t => t.deadline < now);
      if (overdue) {
        cc.addEntry({
          type: 'ambient',
          text: `🤖 [Ambient Observer]: Task "${overdue.title}" is currently overdue. High schedule friction detected.`
        });
        soundManager.playAlert();
        return; // limit to 1 ambient entry per cycle
      }

      // 2. Alert on task starting in next 30 mins
      const imminent = activeTasks.find(t => t.deadline - now > 0 && t.deadline - now < 30 * 60 * 1000);
      if (imminent) {
        cc.addEntry({
          type: 'ambient',
          text: `🤖 [Ambient Observer]: "${imminent.title}" is due in less than 30 minutes. Finalizing buffer configurations.`
        });
        return;
      }

      // 3. Proactive suggestion if risk is high
      const { avgRisk } = scheduler.recalculate(store.tasks);
      if (avgRisk > 40 && Math.random() > 0.5) {
        cc.addEntry({
          type: 'ambient',
          text: `🤖 [Ambient Observer]: High mission friction detected (Success prediction: ${100 - avgRisk}%). I recommend starting Focus Mode.`
        });
        return;
      }
    }, 60000);

    // Auto Calendar Event Sync if URL shows connection
    if (window.location.search.includes('connected=true')) {
      cc.addEntry({ type: 'success', text: 'Successfully authenticated Google Calendar.' });
      syncGoogleCalendar(cc);
      window.history.replaceState({}, document.title, "/");
    }

    // Rescue/Focus handlers
    document.getElementById('rescue-btn').addEventListener('click', () => {
      document.getElementById('rescue-overlay').classList.add('active');
      orchestrator.replanDay(true);
      soundManager.playStinger();
    });
    document.getElementById('rescue-close').addEventListener('click', () => {
      document.getElementById('rescue-overlay').classList.remove('active');
      orchestrator.replanDay(false);
    });

    document.getElementById('focus-btn').addEventListener('click', () => {
      document.getElementById('focus-overlay').classList.add('active');
      soundManager.playChime();
    });
    document.getElementById('focus-close').addEventListener('click', () => {
      document.getElementById('focus-overlay').classList.remove('active');
    });

    // Clock
    setInterval(() => {
      document.getElementById('current-time').textContent = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    }, 1000);
  }

  // INIT
  document.addEventListener('DOMContentLoaded', () => {
    new BootSequence(initDashboard).start();
  });

})();
