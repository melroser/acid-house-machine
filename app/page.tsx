'use client';

import { useState, useEffect, useRef } from 'react';

interface SynthParams {
  oscillatorType: 'sawtooth' | 'square' | 'triangle';
  cutoff: number;
  resonance: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  delayTime: number;
  delayFeedback: number;
}

interface DrumParams {
  kickTone: number;
  kickDecay: number;
  snareNoise: number;
  snareTone: number;
  snareDecay: number;
  hiHatOpen: number;
  hiHatDecay: number;
  tomTone: number;
  tomDecay: number;
  clapDecay: number;
  percTone: number;
  percDecay: number;
  tempo: number;
}

const defaultSynthParams: SynthParams = {
  oscillatorType: 'sawtooth',
  cutoff: 50,
  resonance: 20,
  attack: 20,
  decay: 40,
  sustain: 70,
  release: 30,
  delayTime: 30,
  delayFeedback: 40,
};

const defaultDrumParams: DrumParams = {
  kickTone: 50,
  kickDecay: 200,
  snareNoise: 50,
  snareTone: 50,
  snareDecay: 150,
  hiHatOpen: 50,
  hiHatDecay: 80,
  tomTone: 100,
  tomDecay: 300,
  clapDecay: 150,
  percTone: 800,
  percDecay: 100,
  tempo: 120,
};

const AcidHouseSynth = () => {
  const [synthParams, setSynthParams] = useState<SynthParams>(defaultSynthParams);
  const [drumParams, setDrumParams] = useState<DrumParams>(defaultDrumParams);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [patternName, setPatternName] = useState('Untitled Pattern');

  // Master FX state
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [compressionEnabled, setCompressionEnabled] = useState(false);
  const [duckKick, setDuckKick] = useState(false);

  // Sequencer state
  const [synthSequencer, setSynthSequencer] = useState<boolean[]>(Array(16).fill(false));
  const [drumSequencer, setDrumSequencer] = useState<Record<string, boolean[]>>({
    kick: Array(16).fill(false),
    snare: Array(16).fill(false),
    hihat: Array(16).fill(false),
    tom: Array(16).fill(false),
    clap: Array(16).fill(false),
    perc: Array(16).fill(false),
  });

  // Audio context and nodes refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayFeedbackGainRef = useRef<GainNode | null>(null);
  const reverbConvolverRef = useRef<ConvolverNode | null>(null);
  const compressionNodeRef = useRef<DynamicCompressorNode | null>(null);
  const duckGainRef = useRef<GainNode | null>(null);
  const kickGainRef = useRef<GainNode | null>(null);

  // Load impulse response for reverb
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioContextRef.current;
    masterGainRef.current = ctx.createGain();
    masterGainRef.current.gain.value = 0.7;

    // Delay setup
    delayNodeRef.current = ctx.createDelay(5.0);
    delayNodeRef.current.delayTime.value = 0.3;
    delayFeedbackGainRef.current = ctx.createGain();
    delayFeedbackGainRef.current.gain.value = 0.4;
    delayNodeRef.current.connect(delayFeedbackGainRef.current);
    delayFeedbackGainRef.current.connect(delayNodeRef.current);

    // Reverb setup
    reverbConvolverRef.current = ctx.createConvolver();
    // Load a simple impulse response (generated or fetched)
    fetch('/impulse-response.wav')
      .then(res => res.arrayBuffer())
      .then(buffer => ctx.decodeAudioData(buffer))
      .then(decoded => {
        if (reverbConvolverRef.current) {
          reverbConvolverRef.current.buffer = decoded;
        }
      })
      .catch(() => {
        // fallback: create a small impulse
        if (reverbConvolverRef.current) {
          const impulseBuffer = ctx.createBuffer(2, ctx.sampleRate * 0.3, ctx.sampleRate);
          for (let channel = 0; channel < 2; channel++) {
            const channelData = impulseBuffer.getChannelData(channel);
            for (let i = 0; i < impulseBuffer.length; i++) {
              channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseBuffer.length, 2);
            }
          }
          reverbConvolverRef.current.buffer = impulseBuffer;
        }
      });

    // Compression setup
    compressionNodeRef.current = ctx.createDynamicsCompressor();
    compressionNodeRef.current.threshold.setValueAtTime(-24, ctx.currentTime);
    compressionNodeRef.current.knee.setValueAtTime(30, ctx.currentTime);
    compressionNodeRef.current.ratio.setValueAtTime(12, ctx.currentTime);
    compressionNodeRef.current.attack.setValueAtTime(0.003, ctx.currentTime);
    compressionNodeRef.current.release.setValueAtTime(0.25, ctx.currentTime);

    // Ducking gain for kick
    duckGainRef.current = ctx.createGain();
    duckGainRef.current.gain.value = 1;

    // Kick gain for ducking
    kickGainRef.current = ctx.createGain();

    // Connect nodes
    // Routing: masterGain -> delay -> reverb -> compression -> destination
    // We'll create a chain and toggle effects on/off

    // Start with masterGain
    let inputNode = masterGainRef.current;

    // Delay
    delayNodeRef.current.connect(delayFeedbackGainRef.current);

    // Connect delay to reverb
    delayNodeRef.current.connect(reverbConvolverRef.current!);

    // Connect reverb to compression
    reverbConvolverRef.current!.connect(compressionNodeRef.current!);

    // Compression to destination
    compressionNodeRef.current!.connect(ctx.destination);

    // Also connect masterGain directly to compression for dry signal
    masterGainRef.current.connect(compressionNodeRef.current!);

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Update delay parameters
  useEffect(() => {
    if (delayNodeRef.current && delayFeedbackGainRef.current) {
      delayNodeRef.current.delayTime.value = synthParams.delayTime / 100 * 1.0;
      delayFeedbackGainRef.current.gain.value = synthParams.delayFeedback / 100;
    }
  }, [synthParams.delayTime, synthParams.delayFeedback]);

  // Play synth note
  const playSynthNote = (frequency: number) => {
    if (!audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;
    const osc = ctx.createOscillator();
    osc.type = synthParams.oscillatorType;
    osc.frequency.value = frequency;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = synthParams.resonance / 10;

    osc.connect(gainNode);
    gainNode.connect(filter);

    // Connect filter to masterGain or effects chain
    connectToEffectsChain(filter);

    const now = ctx.currentTime;
    const attackTime = synthParams.attack / 100;
    const decayTime = synthParams.decay / 100;
    const sustainLevel = synthParams.sustain / 100;
    const releaseTime = synthParams.release / 100;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1, now + attackTime);
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);

    filter.frequency.setValueAtTime(20000, now);
    filter.frequency.linearRampToValueAtTime(synthParams.cutoff * 200, now + 0.1);

    osc.start(now);

    gainNode.gain.setTargetAtTime(0, now + attackTime + decayTime, releaseTime / 10);

    osc.stop(now + attackTime + decayTime + releaseTime + 0.1);
  };

  // Play drum sounds
  const playDrumSound = (type: 'kick' | 'snare' | 'hihat' | 'tom' | 'clap' | 'perc') => {
    if (!audioContextRef.current || !masterGainRef.current) return;
    const ctx = audioContextRef.current;

    switch (type) {
      case 'kick': {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.setValueAtTime(150 + (drumParams.kickTone * 5), ctx.currentTime);
        gainNode.gain.setValueAtTime(1, ctx.currentTime);

        osc.type = 'sine';
        osc.connect(gainNode);
        gainNode.connect(kickGainRef.current!);
        kickGainRef.current!.connect(masterGainRef.current);

        osc.start();
        osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + drumParams.kickDecay / 1000);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + drumParams.kickDecay / 1000);
        osc.stop(ctx.currentTime + drumParams.kickDecay / 1000 + 0.05);
        break;
      }
      case 'snare': {
        const noiseBuffer = createNoiseBuffer(ctx);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, ctx.currentTime);

        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100 + (drumParams.snareTone * 2), ctx.currentTime);
        oscGain.gain.setValueAtTime(0.3, ctx.currentTime);

        noise.connect(noiseGain);
        noiseGain.connect(masterGainRef.current);
        osc.connect(oscGain);
        oscGain.connect(masterGainRef.current);

        noise.start();
        osc.start();

        noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + drumParams.snareDecay / 1000);
        oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + drumParams.snareDecay / 1000);

        noise.stop(ctx.currentTime + drumParams.snareDecay / 1000);
        osc.stop(ctx.currentTime + drumParams.snareDecay / 1000);
        break;
      }
      case 'hihat': {
        const noiseBuffer = createNoiseBuffer(ctx);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, ctx.currentTime);

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7000 - (drumParams.hiHatOpen * 50), ctx.currentTime);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(masterGainRef.current);

        noise.start();
        noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + drumParams.hiHatDecay / 1000);
        noise.stop(ctx.currentTime + drumParams.hiHatDecay / 1000);
        break;
      }
      case 'tom': {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(drumParams.tomTone, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.7, ctx.currentTime);

        osc.connect(gainNode);
        gainNode.connect(masterGainRef.current);

        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + drumParams.tomDecay / 1000);
        osc.stop(ctx.currentTime + drumParams.tomDecay / 1000 + 0.05);
        break;
      }
      case 'clap': {
        const noiseBuffer = createNoiseBuffer(ctx);
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, ctx.currentTime);

        noise.connect(noiseGain);
        noiseGain.connect(masterGainRef.current);

        noise.start();
        noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + drumParams.clapDecay / 1000);
        noise.stop(ctx.currentTime + drumParams.clapDecay / 1000);
        break;
      }
      case 'perc': {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(drumParams.percTone, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.5, ctx.currentTime);

        osc.connect(gainNode);
        gainNode.connect(masterGainRef.current);

        osc.start();
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + drumParams.percDecay / 1000);
        osc.stop(ctx.currentTime + drumParams.percDecay / 1000 + 0.05);
        break;
      }
    }
  };

  // Create noise buffer for drums
  const createNoiseBuffer = (ctx: AudioContext) => {
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  };

  // Connect node to effects chain based on enabled effects
  const connectToEffectsChain = (node: AudioNode) => {
    if (!audioContextRef.current || !masterGainRef.current || !delayNodeRef.current || !reverbConvolverRef.current || !compressionNodeRef.current) return;
    const ctx = audioContextRef.current;

    // Disconnect node from any previous connections
    try {
      node.disconnect();
    } catch {}

    let destination: AudioNode = masterGainRef.current;

    // Chain order: delay -> reverb -> compression -> destination
    // We'll create a chain of nodes and connect accordingly

    // Start with node
    let inputNode = node;

    if (delayEnabled) {
      inputNode.connect(delayNodeRef.current);
      destination = delayNodeRef.current;
    } else {
      inputNode.connect(masterGainRef.current);
      destination = masterGainRef.current;
    }

    if (reverbEnabled) {
      if (delayEnabled) {
        delayNodeRef.current!.disconnect();
        delayNodeRef.current!.connect(reverbConvolverRef.current!);
        destination = reverbConvolverRef.current!;
      } else {
        inputNode.disconnect();
        inputNode.connect(reverbConvolverRef.current!);
        destination = reverbConvolverRef.current!;
      }
    } else {
      if (delayEnabled) {
        delayNodeRef.current!.disconnect();
        delayNodeRef.current!.connect(masterGainRef.current!);
        destination = masterGainRef.current!;
      }
    }

    if (compressionEnabled) {
      if (reverbEnabled) {
        reverbConvolverRef.current!.disconnect();
        reverbConvolverRef.current!.connect(compressionNodeRef.current!);
      } else if (delayEnabled) {
        delayNodeRef.current!.disconnect();
        delayNodeRef.current!.connect(compressionNodeRef.current!);
      } else {
        inputNode.disconnect();
        inputNode.connect(compressionNodeRef.current!);
      }
      compressionNodeRef.current!.connect(ctx.destination);
    } else {
      if (reverbEnabled) {
        reverbConvolverRef.current!.disconnect();
        reverbConvolverRef.current!.connect(ctx.destination);
      } else if (delayEnabled) {
        delayNodeRef.current!.disconnect();
        delayNodeRef.current!.connect(ctx.destination);
      } else {
        inputNode.disconnect();
        inputNode.connect(ctx.destination);
      }
    }
  };

  // Handle sequencer play/stop
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  // Sequencer step update
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      const tempo = drumParams.tempo;
      const stepTime = (60 / tempo) * 1000 / 4;
      interval = setInterval(() => {
        // Play synth note if active
        if (synthSequencer[currentStep]) {
          playSynthNote(300 + (currentStep * 20));
        }
        // Play drum sounds if active
        Object.entries(drumSequencer).forEach(([instrument, steps]) => {
          if (steps[currentStep]) {
            playDrumSound(instrument as any);
          }
        });

        // Duck compression gain if enabled and kick is playing
        if (compressionEnabled && duckKick && drumSequencer.kick[currentStep]) {
          if (duckGainRef.current) {
            duckGainRef.current.gain.setTargetAtTime(0.3, audioContextRef.current!.currentTime, 0.05);
            setTimeout(() => {
              if (duckGainRef.current) {
                duckGainRef.current.gain.setTargetAtTime(1, audioContextRef.current!.currentTime, 0.1);
              }
            }, stepTime * 0.75);
          }
        }

        setCurrentStep(prev => (prev + 1) % 16);
      }, stepTime);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentStep, synthSequencer, drumSequencer, drumParams.tempo, compressionEnabled, duckKick]);

  // Toggle synth sequencer step
  const toggleSynthSequencerStep = (index: number) => {
    const newSequencer = [...synthSequencer];
    newSequencer[index] = !newSequencer[index];
    setSynthSequencer(newSequencer);
  };

  // Toggle drum sequencer step
  const toggleDrumSequencerStep = (instrument: string, index: number) => {
    setDrumSequencer(prev => {
      const newSteps = [...prev[instrument]];
      newSteps[index] = !newSteps[index];
      return { ...prev, [instrument]: newSteps };
    });
  };

  // Handle synth param change
  const handleSynthParamChange = (param: keyof SynthParams, value: number) => {
    setSynthParams(prev => ({ ...prev, [param]: value }));
  };

  // Handle drum param change
  const handleDrumParamChange = (param: keyof DrumParams, value: number) => {
    setDrumParams(prev => ({ ...prev, [param]: value }));
  };

  // Handle pattern name change
  const handlePatternNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPatternName(e.target.value);
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 font-mono">
      <div className="mb-6 flex items-center justify-between bg-purple-900 bg-opacity-30 p-4 rounded-lg border border-purple-500">
        <div className="text-2xl font-bold text-purple-400">ACID HOUSE 303/909</div>
        <input
          type="text"
          value={patternName}
          onChange={handlePatternNameChange}
          className="bg-black border border-purple-500 text-purple-300 px-3 py-1 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Pattern Name"
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 303 Synth Section */}
        <div className="bg-black bg-opacity-70 p-4 rounded-lg border border-purple-500 overflow-auto max-h-[600px]">
          <h2 className="text-xl font-bold mb-4 text-green-400 border-b border-green-500 pb-2">303 SYNTH</h2>
          <div className="mb-4">
            <label className="block text-green-400 mb-1">OSCILLATOR</label>
            <div className="flex space-x-2">
              {['sawtooth', 'square', 'triangle'].map(type => (
                <button
                  key={type}
                  className={`px-3 py-2 rounded-md ${synthParams.oscillatorType === type ? 'bg-green-600 text-black' : 'bg-black border border-green-500'}`}
                  onClick={() => handleSynthParamChange('oscillatorType', type as SynthParams['oscillatorType'])}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <label className="text-green-400">FILTER CUTOFF</label>
              <span className="text-green-400">{synthParams.cutoff}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={synthParams.cutoff}
              onChange={(e) => handleSynthParamChange('cutoff', parseInt(e.target.value))}
              className="w-full bg-black border border-green-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between items-center mt-3 mb-1">
              <label className="text-green-400">RESONANCE</label>
              <span className="text-green-400">{synthParams.resonance}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={synthParams.resonance}
              onChange={(e) => handleSynthParamChange('resonance', parseInt(e.target.value))}
              className="w-full bg-black border border-green-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div className="mb-4">
            <h3 className="text-green-400 mb-2">ADSR</h3>
            <div className="grid grid-cols-4 gap-2">
              {['attack', 'decay', 'sustain', 'release'].map(param => (
                <div key={param} className="flex flex-col">
                  <label className="text-xs text-green-400 mb-1 capitalize">{param}</label>
                  <div className="flex items-center">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={synthParams[param as keyof SynthParams]}
                      onChange={(e) => handleSynthParamChange(param as keyof SynthParams, parseInt(e.target.value))}
                      className="w-full bg-black border border-green-500 h-2 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="ml-1 text-xs text-green-400 w-6">{synthParams[param as keyof SynthParams]}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <label className="text-green-400">DELAY TIME</label>
              <span className="text-green-400">{synthParams.delayTime}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={synthParams.delayTime}
              onChange={(e) => handleSynthParamChange('delayTime', parseInt(e.target.value))}
              className="w-full bg-black border border-green-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between items-center mt-3 mb-1">
              <label className="text-green-400">DELAY FEEDBACK</label>
              <span className="text-green-400">{synthParams.delayFeedback}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={synthParams.delayFeedback}
              onChange={(e) => handleSynthParamChange('delayFeedback', parseInt(e.target.value))}
              className="w-full bg-black border border-green-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* 909 Drum Machine Section */}
        <div className="bg-black bg-opacity-70 p-4 rounded-lg border border-purple-500 overflow-auto max-h-[600px]">
          <h2 className="text-xl font-bold mb-4 text-blue-400 border-b border-blue-500 pb-2">909 DRUM MACHINE</h2>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <label className="text-blue-400">TEMPO</label>
              <span className="text-blue-400">{drumParams.tempo} BPM</span>
            </div>
            <input
              type="range"
              min="60"
              max="180"
              value={drumParams.tempo}
              onChange={(e) => handleDrumParamChange('tempo', parseInt(e.target.value))}
              className="w-full bg-black border border-blue-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Kick Controls */}
          <div className="mb-4 border border-red-600 rounded p-3">
            <h3 className="text-red-400 mb-2 font-semibold">KICK</h3>
            <label className="block text-red-400 text-sm mb-1">Tone</label>
            <input
              type="range"
              min="0"
              max="100"
              value={drumParams.kickTone}
              onChange={(e) => handleDrumParamChange('kickTone', parseInt(e.target.value))}
              className="w-full bg-black border border-red-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <label className="block text-red-400 text-sm mt-2 mb-1">Decay (ms)</label>
            <input
              type="range"
              min="50"
              max="500"
              value={drumParams.kickDecay}
              onChange={(e) => handleDrumParamChange('kickDecay', parseInt(e.target.value))}
              className="w-full bg-black border border-red-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Snare Controls */}
          <div className="mb-4 border border-yellow-600 rounded p-3">
            <h3 className="text-yellow-400 mb-2 font-semibold">SNARE</h3>
            <label className="block text-yellow-400 text-sm mb-1">Noise</label>
            <input
              type="range"
              min="0"
              max="100"
              value={drumParams.snareNoise}
              onChange={(e) => handleDrumParamChange('snareNoise', parseInt(e.target.value))}
              className="w-full bg-black border border-yellow-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <label className="block text-yellow-400 text-sm mt-2 mb-1">Tone</label>
            <input
              type="range"
              min="0"
              max="100"
              value={drumParams.snareTone}
              onChange={(e) => handleDrumParamChange('snareTone', parseInt(e.target.value))}
              className="w-full bg-black border border-yellow-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <label className="block text-yellow-400 text-sm mt-2 mb-1">Decay (ms)</label>
            <input
              type="range"
              min="50"
              max="500"
              value={drumParams.snareDecay}
              onChange={(e) => handleDrumParamChange('snareDecay', parseInt(e.target.value))}
              className="w-full bg-black border border-yellow-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* HiHat Controls */}
          <div className="mb-4 border border-blue-600 rounded p-3">
            <h3 className="text-blue-400 mb-2 font-semibold">HI-HAT</h3>
            <label className="block text-blue-400 text-sm mb-1">Open</label>
            <input
              type="range"
              min="0"
              max="100"
              value={drumParams.hiHatOpen}
              onChange={(e) => handleDrumParamChange('hiHatOpen', parseInt(e.target.value))}
              className="w-full bg-black border border-blue-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <label className="block text-blue-400 text-sm mt-2 mb-1">Decay (ms)</label>
            <input
              type="range"
              min="20"
              max="200"
              value={drumParams.hiHatDecay}
              onChange={(e) => handleDrumParamChange('hiHatDecay', parseInt(e.target.value))}
              className="w-full bg-black border border-blue-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Tom Controls */}
          <div className="mb-4 border border-purple-600 rounded p-3">
            <h3 className="text-purple-400 mb-2 font-semibold">TOM</h3>
            <label className="block text-purple-400 text-sm mb-1">Tone (Hz)</label>
            <input
              type="range"
              min="50"
              max="300"
              value={drumParams.tomTone}
              onChange={(e) => handleDrumParamChange('tomTone', parseInt(e.target.value))}
              className="w-full bg-black border border-purple-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <label className="block text-purple-400 text-sm mt-2 mb-1">Decay (ms)</label>
            <input
              type="range"
              min="50"
              max="600"
              value={drumParams.tomDecay}
              onChange={(e) => handleDrumParamChange('tomDecay', parseInt(e.target.value))}
              className="w-full bg-black border border-purple-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Clap Controls */}
          <div className="mb-4 border border-green-600 rounded p-3">
            <h3 className="text-green-400 mb-2 font-semibold">CLAP</h3>
            <label className="block text-green-400 text-sm mb-1">Decay (ms)</label>
            <input
              type="range"
              min="50"
              max="500"
              value={drumParams.clapDecay}
              onChange={(e) => handleDrumParamChange('clapDecay', parseInt(e.target.value))}
              className="w-full bg-black border border-green-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Perc Controls */}
          <div className="mb-4 border border-pink-600 rounded p-3">
            <h3 className="text-pink-400 mb-2 font-semibold">PERC</h3>
            <label className="block text-pink-400 text-sm mb-1">Tone (Hz)</label>
            <input
              type="range"
              min="200"
              max="1200"
              value={drumParams.percTone}
              onChange={(e) => handleDrumParamChange('percTone', parseInt(e.target.value))}
              className="w-full bg-black border border-pink-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
            <label className="block text-pink-400 text-sm mt-2 mb-1">Decay (ms)</label>
            <input
              type="range"
              min="20"
              max="300"
              value={drumParams.percDecay}
              onChange={(e) => handleDrumParamChange('percDecay', parseInt(e.target.value))}
              className="w-full bg-black border border-pink-500 h-2 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Master FX Section */}
      <div className="mt-6 bg-black bg-opacity-70 p-4 rounded-lg border border-purple-500 max-w-4xl mx-auto">
        <h2 className="text-xl font-bold text-purple-400 mb-4">MASTER EFFECTS</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Delay */}
          <div className="border border-purple-600 rounded p-3">
            <label className="flex items-center space-x-2 text-purple-400 font-semibold mb-2">
              <input
                type="checkbox"
                checked={delayEnabled}
                onChange={() => setDelayEnabled(!delayEnabled)}
                className="accent-purple-500"
              />
              <span>Delay</span>
            </label>
            {delayEnabled && (
              <>
                <label className="block text-purple-400 text-sm mb-1">Delay Time</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={synthParams.delayTime}
                  onChange={(e) => handleSynthParamChange('delayTime', parseInt(e.target.value))}
                  className="w-full bg-black border border-purple-500 h-2 rounded-lg appearance-none cursor-pointer"
                />
                <label className="block text-purple-400 text-sm mt-2 mb-1">Feedback</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={synthParams.delayFeedback}
                  onChange={(e) => handleSynthParamChange('delayFeedback', parseInt(e.target.value))}
                  className="w-full bg-black border border-purple-500 h-2 rounded-lg appearance-none cursor-pointer"
                />
              </>
            )}
          </div>

          {/* Reverb */}
          <div className="border border-purple-600 rounded p-3">
            <label className="flex items-center space-x-2 text-purple-400 font-semibold mb-2">
              <input
                type="checkbox"
                checked={reverbEnabled}
                onChange={() => setReverbEnabled(!reverbEnabled)}
                className="accent-purple-500"
              />
              <span>Reverb</span>
            </label>
            <p className="text-xs text-purple-400">Simple convolution reverb with impulse response.</p>
          </div>

          {/* Compression */}
          <div className="border border-purple-600 rounded p-3">
            <label className="flex items-center space-x-2 text-purple-400 font-semibold mb-2">
              <input
                type="checkbox"
                checked={compressionEnabled}
                onChange={() => setCompressionEnabled(!compressionEnabled)}
                className="accent-purple-500"
              />
              <span>Compression</span>
            </label>
            {compressionEnabled && (
              <label className="flex items-center space-x-2 text-purple-400 mt-2">
                <input
                  type="checkbox"
                  checked={duckKick}
                  onChange={() => setDuckKick(!duckKick)}
                  className="accent-purple-500"
                />
                <span>Duck Compression on Kick</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Sequencer Section */}
      <div className="mt-6 bg-black bg-opacity-70 p-4 rounded-lg border border-purple-500 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-purple-400">SEQUENCER</h2>
          <button
            onClick={togglePlay}
            className={`px-4 py-2 rounded-md ${isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-black font-bold border-2 ${isPlaying ? 'border-red-500' : 'border-green-500'}`}
          >
            {isPlaying ? 'STOP' : 'PLAY'}
          </button>
        </div>

        {/* Synth Sequencer */}
        <div className="mb-6">
          <h3 className="text-green-400 mb-2">SYNTH SEQUENCER</h3>
          <div className="flex mb-2">
            {Array(16).fill(0).map((_, i) => (
              <div key={i} className="w-8 flex justify-center">
                <div className={`text-xs text-green-400 ${i === currentStep && isPlaying ? 'font-bold' : ''}`}>{i + 1}</div>
              </div>
            ))}
          </div>
          <div className="flex">
            {synthSequencer.map((isActive, i) => (
              <button
                key={i}
                className={`w-8 h-8 m-1 rounded-md ${isActive ? 'bg-green-600' : 'bg-black border border-green-500'} ${i === currentStep && isPlaying ? 'ring-2 ring-green-400' : ''}`}
                onClick={() => toggleSynthSequencerStep(i)}
              />
            ))}
          </div>
        </div>

        {/* Drum Sequencer */}
        <div>
          <h3 className="text-blue-400 mb-2">DRUM SEQUENCER</h3>
          <div className="flex mb-2">
            {Array(16).fill(0).map((_, i) => (
              <div key={i} className="w-8 flex justify-center">
                <div className={`text-xs text-blue-400 ${i === currentStep && isPlaying ? 'font-bold' : ''}`}>{i + 1}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col space-y-2">
            {(['kick', 'snare', 'hihat', 'tom', 'clap', 'perc'] as const).map(instrument => (
              <div key={instrument} className="flex">
                {drumSequencer[instrument].map((isActive, i) => (
                  <button
                    key={i}
                    className={`w-8 h-8 m-1 rounded-md ${isActive ? `bg-${instrument}-600` : `bg-black border border-${instrument}-500`} ${i === currentStep && isPlaying ? `ring-2 ring-${instrument}-400` : ''}`}
                    onClick={() => toggleDrumSequencerStep(instrument, i)}
                    style={{
                      backgroundColor: isActive ? getInstrumentColor(instrument, 0.7) : 'transparent',
                      borderColor: getInstrumentColor(instrument, 0.5),
                      boxShadow: i === currentStep && isPlaying ? `0 0 8px ${getInstrumentColor(instrument, 1)}` : 'none',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper to get neon colors for instruments
const getInstrumentColor = (instrument: string, opacity: number) => {
  const colors: Record<string, string> = {
    kick: `rgba(255, 0, 0, ${opacity})`,
    snare: `rgba(255, 255, 0, ${opacity})`,
    hihat: `rgba(0, 0, 255, ${opacity})`,
    tom: `rgba(128, 0, 128, ${opacity})`,
    clap: `rgba(0, 255, 0, ${opacity})`,
    perc: `rgba(255, 0, 255, ${opacity})`,
  };
  return colors[instrument] || `rgba(255, 255, 255, ${opacity})`;
};

export default AcidHouseSynth;
