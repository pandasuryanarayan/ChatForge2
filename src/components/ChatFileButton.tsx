import React, { useState } from 'react';
import {
  FileCode,
  Code2,
  Palette,
  Terminal,
  FileText,
  Copy,
  Check,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ChatFileButtonProps {
  fileName: string;
  language: string;
  fileId: string;
  lineCount: number;
  sizeBytes: number;
  codeContent: string;
  isStreaming?: boolean;
  onOpenFile?: () => void;
}

export const ChatFileButton: React.FC<ChatFileButtonProps> = ({
  fileName,
  language,
  lineCount,
  sizeBytes,
  codeContent,
  isStreaming = false,
  onOpenFile,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = codeContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getLanguageVisuals = (lang: string, name: string) => {
    const l = (lang || '').toLowerCase();
    const n = (name || '').toLowerCase();

    if (l === 'html' || n.endsWith('.html') || n.endsWith('.htm')) {
      return {
        icon: Code2,
        label: 'HTML',
        container: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
        badge: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
        iconColor: 'text-orange-400',
      };
    }
    if (l === 'css' || n.endsWith('.css') || n.endsWith('.scss')) {
      return {
        icon: Palette,
        label: 'CSS',
        container: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
        badge: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
        iconColor: 'text-sky-400',
      };
    }
    if (l === 'javascript' || l === 'js' || n.endsWith('.js') || n.endsWith('.jsx')) {
      return {
        icon: FileCode,
        label: 'JAVASCRIPT',
        container: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
        badge: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
        iconColor: 'text-yellow-400',
      };
    }
    if (l === 'typescript' || l === 'ts' || n.endsWith('.ts') || n.endsWith('.tsx')) {
      return {
        icon: FileCode,
        label: 'TYPESCRIPT',
        container: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
        badge: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
        iconColor: 'text-blue-400',
      };
    }
    if (l === 'python' || l === 'py' || n.endsWith('.py')) {
      return {
        icon: Terminal,
        label: 'PYTHON',
        container: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        badge: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
        iconColor: 'text-amber-400',
      };
    }
    if (l === 'json' || n.endsWith('.json')) {
      return {
        icon: FileText,
        label: 'JSON',
        container: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
        badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        iconColor: 'text-emerald-400',
      };
    }
    return {
      icon: FileCode,
      label: (lang || 'CODE').toUpperCase(),
      container: 'bg-zinc-800 border-zinc-700 text-zinc-300',
      badge: 'bg-zinc-800 border-zinc-700 text-zinc-300',
      iconColor: 'text-zinc-300',
    };
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const visuals = getLanguageVisuals(language, fileName);
  const IconComponent = visuals.icon;

  return (
    <div className="my-3 rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-blue-500/40 hover:bg-zinc-850/80 transition-all duration-150 shadow-sm overflow-hidden group">
      <div className="flex items-center justify-between gap-3 p-3 select-none min-w-0">
        {/* Main Clickable Card Header */}
        <button
          type="button"
          onClick={onOpenFile}
          className="flex-1 flex items-center gap-3 min-w-0 text-left cursor-pointer focus:outline-none"
          title={`Click to open ${fileName} in Code Workbench`}
        >
          {/* Language / File Icon */}
          <div className={`p-2 rounded-lg border shrink-0 ${visuals.container}`}>
            <IconComponent className={`w-4 h-4 ${visuals.iconColor}`} />
          </div>

          {/* Name & Metadata */}
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-zinc-100 group-hover:text-blue-400 transition truncate">
                {fileName}
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-semibold ${visuals.badge}`}>
                {visuals.label}
              </span>
              {isStreaming ? (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 rounded-full animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Writing code...</span>
                </span>
              ) : (
                <span className="text-[11px] text-zinc-400 font-mono">
                  {lineCount} {lineCount === 1 ? 'line' : 'lines'} • {formatBytes(sizeBytes)}
                </span>
              )}
            </div>
            <span className="text-[11px] text-zinc-500 mt-0.5 group-hover:text-zinc-400 transition truncate">
              Click to view and edit in Code Workbench
            </span>
          </div>
        </button>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            title="Copy code to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Open in Workbench Button */}
          <button
            type="button"
            onClick={onOpenFile}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/10 group-hover:bg-blue-600 text-blue-400 group-hover:text-white border border-blue-500/30 group-hover:border-blue-500 text-xs font-semibold transition cursor-pointer shadow-xs"
            title={`Open ${fileName} in Editor`}
          >
            <span>Open</span>
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>

          {/* Quick Peek Accordion Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            title={isExpanded ? 'Collapse snippet' : 'Peek code inline'}
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Inline Peek Snippet (optional, collapsed by default) */}
      {isExpanded && (
        <div className="border-t border-zinc-800/80 bg-[#0d0d10] p-3 max-h-56 overflow-y-auto font-mono text-xs text-zinc-300">
          <pre className="!m-0 !p-0 leading-relaxed">
            <code>{codeContent}</code>
          </pre>
          <div className="pt-2 mt-2 border-t border-zinc-800/60 flex justify-end">
            <button
              type="button"
              onClick={onOpenFile}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-sans flex items-center gap-1 cursor-pointer"
            >
              <span>View full file in Code Workbench</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
