import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCcw,
  Smartphone,
  Tablet,
  Monitor,
  ExternalLink,
  Terminal,
  Trash2,
  AlertCircle,
  Info,
} from 'lucide-react';

interface ConsoleLog {
  id: string;
  level: 'log' | 'error' | 'warn' | 'info';
  messages: string[];
  timestamp: number;
}

interface LivePreviewProps {
  htmlContent: string;
}

export const LivePreview: React.FC<LivePreviewProps> = ({ htmlContent }) => {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for console logs posted from the sandboxed iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.source === 'chatforge-code-preview' && event.data.type === 'console') {
        setConsoleLogs((prev) => [
          ...prev.slice(-100), // Keep last 100 logs
          {
            id: Math.random().toString(36).substring(2, 9),
            level: event.data.level || 'log',
            messages: event.data.messages || [],
            timestamp: event.data.timestamp || Date.now(),
          },
        ]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRefresh = () => {
    setReloadKey((k) => k + 1);
    setConsoleLogs([]);
  };

  const handleOpenNewTab = () => {
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Failed to open preview in new tab', e);
    }
  };

  const viewportWidths = {
    desktop: 'w-full',
    tablet: 'w-[768px] max-w-full',
    mobile: 'w-[375px] max-w-full',
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-200 overflow-hidden">
      {/* Live Preview Controls Bar */}
      <div className="h-10 px-3 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0 text-xs">
        {/* Device Switcher */}
        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`p-1 rounded-md transition cursor-pointer ${
              viewport === 'desktop'
                ? 'bg-zinc-800 text-blue-400 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Desktop View (100%)"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`p-1 rounded-md transition cursor-pointer ${
              viewport === 'tablet'
                ? 'bg-zinc-800 text-blue-400 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Tablet View (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`p-1 rounded-md transition cursor-pointer ${
              viewport === 'mobile'
                ? 'bg-zinc-800 text-blue-400 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Mobile View (375px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {/* Console Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono transition cursor-pointer ${
              isConsoleOpen
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle Console"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Console</span>
            {consoleLogs.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-blue-500 text-zinc-950 font-bold text-[9px] flex items-center justify-center">
                {consoleLogs.length}
              </span>
            )}
          </button>

          {/* Refresh / Re-run */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            title="Reload Preview"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Open in New Window */}
          <button
            type="button"
            onClick={handleOpenNewTab}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            title="Open in New Tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview Stage */}
      <div className="flex-1 bg-zinc-900/40 p-2 sm:p-4 overflow-auto flex items-center justify-center relative">
        <div
          className={`${viewportWidths[viewport]} h-full bg-white rounded-xl overflow-hidden shadow-2xl transition-all duration-200 flex flex-col border border-zinc-800`}
        >
          <iframe
            key={reloadKey}
            ref={iframeRef}
            srcDoc={htmlContent}
            title="Live Code Preview"
            sandbox="allow-scripts allow-modals allow-same-origin"
            className="w-full h-full border-none bg-white"
          />
        </div>
      </div>

      {/* Expandable Console Drawer */}
      {isConsoleOpen && (
        <div className="h-44 border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0 font-mono text-xs">
          <div className="h-7 px-3 bg-zinc-900 flex items-center justify-between border-b border-zinc-800/80 text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-blue-400" />
              <span>Preview Console ({consoleLogs.length})</span>
            </span>
            <button
              type="button"
              onClick={() => setConsoleLogs([])}
              className="hover:text-red-400 transition cursor-pointer p-0.5"
              title="Clear console"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {consoleLogs.length === 0 ? (
              <div className="text-zinc-600 italic text-[11px] p-2">
                No console messages recorded. Any console.log() output from your code will appear here.
              </div>
            ) : (
              consoleLogs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 p-1.5 rounded-sm ${
                    log.level === 'error'
                      ? 'bg-red-950/30 text-red-300 border-l-2 border-red-500'
                      : log.level === 'warn'
                      ? 'bg-amber-950/30 text-amber-300 border-l-2 border-amber-500'
                      : 'text-zinc-300 hover:bg-zinc-900/60'
                  }`}
                >
                  {log.level === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                  )}
                  <span className="flex-1 break-all">
                    {log.messages.join(' ')}
                  </span>
                  <span className="text-[10px] text-zinc-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
