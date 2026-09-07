import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import { CodeFile } from '../types';
import { Copy, Check, Download, WrapText, Hash, ArrowDown } from 'lucide-react';
import { downloadSingleFile } from '../utils/zipExport';

interface CodeViewerProps {
  file: CodeFile;
  wrapLines?: boolean;
  onToggleWrap?: () => void;
  isStreaming?: boolean;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  file,
  wrapLines = false,
  onToggleWrap,
  isStreaming = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showScrollSyncPill, setShowScrollSyncPill] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabledRef = useRef(true);

  const isWriting = Boolean(isStreaming || file.isStreaming);

  // Synchronize scrolling directly with code generation speed.
  // useLayoutEffect runs synchronously before browser paint, ensuring zero jump or lag.
  useLayoutEffect(() => {
    if (!isWriting || !scrollContainerRef.current || !isAutoScrollEnabledRef.current) return;
    const container = scrollContainerRef.current;
    container.scrollTop = container.scrollHeight;
  }, [file.content, isWriting]);

  // When switching to this file while it is currently streaming, immediately jump to the live writing line
  useEffect(() => {
    if (isWriting && scrollContainerRef.current && isAutoScrollEnabledRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [file.id, isWriting]);

  // Track if user manually scrolled up to inspect earlier code
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 50;

    isAutoScrollEnabledRef.current = isAtBottom;
    setShowScrollSyncPill(!isAtBottom && isWriting);
  };

  // Re-engage synchronized auto-scrolling
  const handleResumeSyncScroll = () => {
    isAutoScrollEnabledRef.current = true;
    setShowScrollSyncPill(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = file.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    downloadSingleFile(file);
  };

  // Syntax highlight code safely
  const highlightedLines = useMemo(() => {
    const rawContent = file.content || '';
    let prismLang = file.language;
    if (prismLang === 'html' || prismLang === 'svg' || prismLang === 'xml') {
      prismLang = 'markup';
    } else if (prismLang === 'js') {
      prismLang = 'javascript';
    } else if (prismLang === 'ts') {
      prismLang = 'typescript';
    }

    const grammar = Prism.languages[prismLang] || Prism.languages.markup || Prism.languages.text;

    try {
      const html = Prism.highlight(rawContent, grammar, prismLang);
      return html.split('\n');
    } catch (e) {
      return rawContent.split('\n').map((l) =>
        l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      );
    }
  }, [file.content, file.language]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-200 select-text overflow-hidden min-h-0 min-w-0">
      {/* File Action & Metadata Sub-bar */}
      <div className="h-10 px-3 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between gap-2 shrink-0 text-xs text-zinc-400 min-w-0">
        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400 truncate">
          <span className="text-zinc-300 font-medium truncate">{file.name}</span>
          <span className="text-zinc-600">•</span>
          <span className="shrink-0">{highlightedLines.length} lines</span>
          <span className="text-zinc-600">•</span>
          <span className="shrink-0">{formatBytes(file.sizeBytes)}</span>

          {isWriting ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Writing in real-time...</span>
            </span>
          ) : file.isUnclosed ? (
            <span className="text-amber-400 text-[10px] bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 shrink-0 ml-1">
              Incomplete / Cutoff
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Line Numbers Toggle */}
          <button
            type="button"
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className={`p-1.5 rounded-md transition cursor-pointer ${
              showLineNumbers
                ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
            title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            aria-label="Toggle line numbers"
          >
            <Hash className="w-3.5 h-3.5" />
          </button>

          {/* Word Wrap Toggle */}
          {onToggleWrap && (
            <button
              type="button"
              onClick={onToggleWrap}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                wrapLines
                  ? 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
              title={wrapLines ? 'Disable word wrap' : 'Enable word wrap'}
              aria-label="Toggle word wrap"
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-zinc-300 hover:text-white bg-zinc-800/70 hover:bg-zinc-700/80 transition cursor-pointer ml-1"
            title="Copy file contents"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Download File Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            title={`Download ${file.name}`}
            aria-label={`Download ${file.name}`}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Code Content Area with Line Numbers */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto prism-code-editor text-xs leading-relaxed bg-[#0d0d10] relative min-h-0 min-w-0"
      >
        <div className="flex min-w-full font-mono py-3">
          {/* Line Numbers Column */}
          {showLineNumbers && (
            <div
              className="select-none text-right pr-3.5 pl-3 text-zinc-600 bg-zinc-950/40 border-r border-zinc-800/50 shrink-0 font-mono text-[11px]"
              style={{ minWidth: '42px' }}
            >
              {highlightedLines.map((_, i) => (
                <div key={i} className="h-[20px] leading-[20px]">
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Code Text Column */}
          <div
            className={`flex-1 min-w-0 pl-4 pr-6 ${
              wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
            }`}
          >
            {highlightedLines.map((lineHtml, i) => (
              <div
                key={i}
                className="h-[20px] leading-[20px] hover:bg-zinc-800/20 rounded-xs flex items-center"
              >
                <span dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }} />
                {isWriting && i === highlightedLines.length - 1 && (
                  <span className="inline-block w-2 h-3.5 bg-emerald-400 ml-0.5 animate-pulse rounded-xs" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Floating Sync to Live Output Button (shown if user scrolled up during generation) */}
        {showScrollSyncPill && isWriting && (
          <button
            type="button"
            onClick={handleResumeSyncScroll}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg transition cursor-pointer border border-emerald-400/40 animate-bounce"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Sync to Live Output</span>
          </button>
        )}
      </div>
    </div>
  );
};
