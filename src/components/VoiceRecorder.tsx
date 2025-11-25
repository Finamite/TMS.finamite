import  { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Mic, Square, Play, Pause, RotateCcw, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onRecordingComplete: (audioFile: File) => void;
  onRecordingDeleted?: (fileName: string) => void;
  isDark: boolean;
}

export interface VoiceRecorderRef {
  resetFromParent: () => void;
}

const VoiceRecorder = forwardRef<VoiceRecorderRef, VoiceRecorderProps>(({ onRecordingComplete, onRecordingDeleted, isDark }, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioURL, setAudioURL] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentFileName, setCurrentFileName] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
    };
  }, [audioURL]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioURL(url);
        
        // Auto-add to attachments when recording stops
        const fileName = `voice-recording-${Date.now()}.webm`;
        const audioFile = new File([blob], fileName, {
          type: 'audio/webm'
        });
        setCurrentFileName(fileName);
        onRecordingComplete(audioFile);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please check permissions.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        intervalRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const playPauseAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const resetRecording = () => {
    // Notify parent to remove from attachments if there's a current recording
    if (currentFileName && onRecordingDeleted) {
      onRecordingDeleted(currentFileName);
    }
    
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
    }
    setAudioURL('');
    setRecordingTime(0);
    setIsPlaying(false);
    setIsRecording(false);
    setIsPaused(false);
    setCurrentFileName('');
    chunksRef.current = [];
  };

  const deleteRecording = () => {
    // Notify parent to remove from attachments
    if (currentFileName && onRecordingDeleted) {
      onRecordingDeleted(currentFileName);
    }
    resetRecording();
  };

  // Public method to reset from parent component
  const resetFromParent = () => {
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
    }
    setAudioURL('');
    setRecordingTime(0);
    setIsPlaying(false);
    setIsRecording(false);
    setIsPaused(false);
    setCurrentFileName('');
    chunksRef.current = [];
  };

  // Expose reset function to parent via ref
  useImperativeHandle(ref, () => ({
    resetFromParent
  }));
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`p-4 rounded-xl border shadow-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <h2 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
        <Mic className="mr-2" size={16} style={{ color: 'var(--color-primary)' }} />
        Voice Recording
      </h2>

      <div className="space-y-4">
        {/* Recording Controls */}
        <div className="flex items-center space-x-3">
          {!isRecording && !audioURL && (
            <button
              type="button"
              onClick={startRecording}
              className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                isDark
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              <Mic size={16} className="mr-2" />
              Start Recording
            </button>
          )}

          {isRecording && (
            <>
              <button
                type="button"
                onClick={pauseRecording}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDark
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                }`}
              >
                {isPaused ? <Play size={16} className="mr-2" /> : <Pause size={16} className="mr-2" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <button
                type="button"
                onClick={stopRecording}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDark
                    ? 'bg-gray-600 hover:bg-gray-700 text-white'
                    : 'bg-gray-500 hover:bg-gray-600 text-white'
                }`}
              >
                <Square size={16} className="mr-2" />
                Stop
              </button>
            </>
          )}

          {audioURL && !isRecording && (
            <>
              <button
                type="button"
                onClick={playPauseAudio}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDark
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isPlaying ? <Pause size={16} className="mr-2" /> : <Play size={16} className="mr-2" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>

              <button
                type="button"
                onClick={resetRecording}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDark
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                <RotateCcw size={16} className="mr-2" />
                Record Again
              </button>

              <button
                type="button"
                onClick={deleteRecording}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDark
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                <Trash2 size={16} className="mr-2" />
                Delete
              </button>
            </>
          )}
        </div>

        {/* Recording Status */}
        <div className="flex items-center space-x-4">
          {isRecording && (
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full animate-pulse ${isPaused ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
              <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                {isPaused ? 'Paused' : 'Recording'}: {formatTime(recordingTime)}
              </span>
            </div>
          )}

          {audioURL && !isRecording && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Recording completed: {formatTime(recordingTime)}
              </span>
            </div>
          )}
        </div>

        {/* Audio Player */}
        {audioURL && (
          <div className="mt-4">
            <audio
              ref={audioRef}
              src={audioURL}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full"
              controls
            />
          </div>
        )}

        {/* Auto-add notification */}
        {audioURL && (
          <div
            className="p-3 rounded-lg border"
            style={{
              backgroundColor: 'var(--color-success-light)',
              borderColor: 'var(--color-success-border)'
            }}
          >
            <p className={`text-sm font-medium`} style={{ color: 'var(--color-success-dark)' }}>
              ✓ Voice recording automatically added to attachments
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

VoiceRecorder.displayName = 'VoiceRecorder';

export default VoiceRecorder;