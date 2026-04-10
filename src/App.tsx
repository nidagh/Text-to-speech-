/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Volume2, Download, Play, Pause, RotateCcw, Languages, Settings2, Mic2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const LANGUAGES = [
  { label: "ગુજરાતી (Gujarati)", value: "gu-IN", prompt: "Speak in Gujarati." },
  { label: "हिन्दी (Hindi)", value: "hi-IN", prompt: "Speak in Hindi." },
  { label: "English (US)", value: "en-US", prompt: "Speak in English." },
];

const VOICES = [
  { name: "Kore", description: "Clear and professional" },
  { name: "Puck", description: "Energetic and bright" },
  { name: "Charon", description: "Deep and calm" },
  { name: "Fenrir", description: "Strong and authoritative" },
  { name: "Zephyr", description: "Soft and gentle" },
];

export default function App() {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("gu-IN");
  const [voice, setVoice] = useState("Kore");
  const [pitch, setPitch] = useState(1); // 0.5 to 2.0
  const [rate, setRate] = useState(1); // 0.5 to 2.0
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleSpeak = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setIsSpeaking(true);

    try {
      // Construct prompt based on settings
      const langInfo = LANGUAGES.find(l => l.value === language);
      const pitchDesc = pitch > 1.2 ? "with a high pitch" : pitch < 0.8 ? "with a low pitch" : "with a normal pitch";
      const rateDesc = rate > 1.2 ? "quickly" : rate < 0.8 ? "slowly" : "at a normal speed";
      
      const fullPrompt = `${langInfo?.prompt} Speak the following text ${pitchDesc} and ${rateDesc}: ${text}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: fullPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice as any },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        await playPCM(base64Audio);
        createDownloadableWav(base64Audio);
      }
    } catch (error) {
      console.error("Error generating speech:", error);
      setIsSpeaking(false);
    } finally {
      setIsLoading(false);
    }
  };

  const playPCM = async (base64Data: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const audioContext = audioContextRef.current;
    
    // Stop previous audio if any
    if (sourceRef.current) {
      sourceRef.current.stop();
    }

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Int16Array(len / 2);
    for (let i = 0; i < len; i += 2) {
      // PCM 16-bit Little Endian
      bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
    }

    const float32Data = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      float32Data[i] = bytes[i] / 32768;
    }

    const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    
    source.onended = () => {
      setIsSpeaking(false);
    };

    sourceRef.current = source;
    source.start();
  };

  const createDownloadableWav = (base64Data: string) => {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const wavHeader = createWavHeader(len, 24000);
    
    const wavBuffer = new Uint8Array(wavHeader.length + len);
    wavBuffer.set(wavHeader);
    for (let i = 0; i < len; i++) {
      wavBuffer[wavHeader.length + i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
  };

  const createWavHeader = (dataLength: number, sampleRate: number) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // File length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // Format chunk identifier
    writeString(view, 12, 'fmt ');
    // Format chunk length
    view.setUint32(16, 16, true);
    // Sample format (1 is PCM)
    view.setUint16(20, 1, true);
    // Channel count
    view.setUint16(22, 1, true);
    // Sample rate
    view.setUint32(24, sampleRate, true);
    // Byte rate (sampleRate * channelCount * bitsPerSample / 8)
    view.setUint32(28, sampleRate * 2, true);
    // Block align (channelCount * bitsPerSample / 8)
    view.setUint16(32, 2, true);
    // Bits per sample
    view.setUint16(34, 16, true);
    // Data chunk identifier
    writeString(view, 36, 'data');
    // Data chunk length
    view.setUint32(40, dataLength, true);

    return new Uint8Array(header);
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `vachak-audio-${Date.now()}.wav`;
    a.click();
  };

  const handleReset = () => {
    setText("");
    setAudioUrl(null);
    if (sourceRef.current) {
      sourceRef.current.stop();
    }
    setIsSpeaking(false);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 md:p-8 font-sans text-[#202124]">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-200">
              <Volume2 className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Vachak</h1>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Text to Speech</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={handleReset}>
            <RotateCcw className="w-5 h-5 text-gray-400" />
          </Button>
        </header>

        <main className="space-y-6">
          {/* Main Input Card */}
          <Card className="border-none shadow-xl shadow-gray-200/50 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="pb-2 border-b border-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Mic2 className="w-4 h-4 text-blue-500" />
                  <span>Input Text</span>
                </div>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-[160px] h-8 text-xs border-none bg-gray-50 rounded-full focus:ring-0">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-gray-100">
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value} className="text-xs">
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Textarea
                placeholder={language === "gu-IN" ? "અહીં લખાણ લખો..." : "Type your text here..."}
                className="min-h-[200px] border-none focus-visible:ring-0 text-lg resize-none placeholder:text-gray-300 scrollbar-hide"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </CardContent>
            <CardFooter className="flex justify-between items-center bg-gray-50/50 p-4">
              <div className="flex gap-2">
                <Button 
                  onClick={handleSpeak} 
                  disabled={!text.trim() || isLoading}
                  className="rounded-full px-8 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  {isLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </motion.div>
                  ) : isSpeaking ? (
                    <Pause className="w-4 h-4 mr-2" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {isSpeaking ? "Speaking..." : "Speak"}
                </Button>
                
                <AnimatePresence>
                  {audioUrl && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="rounded-full border-gray-200 hover:bg-white hover:border-blue-200 hover:text-blue-600 transition-colors"
                        onClick={handleDownload}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                Powered by Gemini AI
              </div>
            </CardFooter>
          </Card>

          {/* Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Voice Selection */}
            <Card className="border-none shadow-lg shadow-gray-100 rounded-3xl bg-white">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Settings2 className="w-4 h-4 text-purple-500" />
                  <span>Voice Settings</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Select Voice</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {VOICES.map((v) => (
                      <button
                        key={v.name}
                        onClick={() => setVoice(v.name)}
                        className={`p-3 rounded-2xl text-left transition-all border ${
                          voice === v.name 
                            ? "bg-purple-50 border-purple-200 ring-2 ring-purple-100" 
                            : "bg-white border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <p className={`text-sm font-bold ${voice === v.name ? "text-purple-700" : "text-gray-700"}`}>{v.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{v.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Controls */}
            <Card className="border-none shadow-lg shadow-gray-100 rounded-3xl bg-white">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <div className="w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  </div>
                  <span>Audio Controls</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pitch</Label>
                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{pitch.toFixed(1)}x</span>
                  </div>
                  <Slider
                    value={[pitch]}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    onValueChange={(val) => setPitch(val[0])}
                    className="py-2"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Speech Rate</Label>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{rate.toFixed(1)}x</span>
                  </div>
                  <Slider
                    value={[rate]}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    onValueChange={(val) => setRate(val[0])}
                    className="py-2"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </main>

        {/* Footer */}
        <footer className="pt-8 pb-4 text-center">
          <p className="text-xs text-gray-400 font-medium">
            Made with ❤️ for Gujarati Speakers
          </p>
        </footer>
      </div>
    </div>
  );
}
