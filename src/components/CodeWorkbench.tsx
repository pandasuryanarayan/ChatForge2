import React, { useState, useEffect, useMemo } from 'react';
import {
  CodeFile,
  ExtractedCodeCollection,
} from '../types';
import { CodeViewer } from './CodeViewer';
import { LivePreview } from './LivePreview';
import { PythonWasmRunner } from './PythonWasmRunner';
import { downloadFilesAsZip } from '../utils/zipExport';
import {
  Code2,
  FileCode,
  Eye,
  Download,
  Maximize2,
  Minimize2,
  Layers,
  Sparkles,
  FileText,
  Play,
  Check,
  FolderArchive,
  ArrowUpRight,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

interface CodeWorkbenchProps {
  collection?: ExtractedCodeCollection | null;
  activeFileId?: string;
  onSelectFile?: (fileId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onClose?: () => void;
  isStreaming?: boolean;
  onContinueGenerating?: () => void;
}

export const CodeWorkbench: React.FC<CodeWorkbenchProps> = ({
  collection,
  activeFileId: propActiveFileId,
  onSelectFile: propOnSelectFile,
  isExpanded = false,
  onToggleExpand,
  onClose,
  isStreaming = false,
  onContinueGenerating,
}) => {
  const files = collection?.files || [];
  const hasFiles = files.length > 0;
  const canPreview = Boolean(collection?.isWebProject && collection?.combinedHtmlPreview);
  const hasPython = Boolean(
    collection?.hasPython ||
    files.some((f) => f.language === 'python' || f.name.endsWith('.py'))
  );

  // Initialize with the first file or python runner, NOT preview (so user sees code files in real-time)
  const [internalActiveTab, setInternalActiveTab] = useState<string>(() => {
    if (files.length > 0) {
      return hasPython && !canPreview ? 'python-runner' : files[0].id;
    }
    return 'preview';
  });

  const [wrapLines, setWrapLines] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipSuccess, setZipSuccess] = useState(false);

  // Sync active tab with propActiveFileId or default to active streaming file / current file
  // Resolve active file matching by ID or by file name
  const activeFile = useMemo(() => {
    if (!files || files.length === 0) return undefined;
    const target = propActiveFileId || internalActiveTab;
    if (target === 'preview' || target === 'python-runner') return undefined;
    return (
      files.find((f) => f.id === target) ||
      files.find((f) => f.name.toLowerCase() === target?.toLowerCase()) ||
      files.find((f) => target?.toLowerCase().includes(f.name.toLowerCase())) ||
      files[0]
    );
  }, [files, propActiveFileId, internalActiveTab]);

  const activeTab = useMemo(() => {
    const target = propActiveFileId || internalActiveTab;
    if (target === 'preview' || target === 'python-runner') return target;
    return activeFile?.id || target;
  }, [propActiveFileId, internalActiveTab, activeFile]);

  useEffect(() => {
    if (propActiveFileId) {
      const match =
        files.find((f) => f.id === propActiveFileId) ||
        files.find((f) => f.name.toLowerCase() === propActiveFileId.toLowerCase());
      if (match) {
        setInternalActiveTab(match.id);
      } else {
        setInternalActiveTab(propActiveFileId);
      }
    } else if (files.length > 0) {
      if (isStreaming) {
        // While streaming, ALWAYS prioritize the file currently being written in real-time!
        const streamingFile =
          files.find((f) => f.isStreaming || f.name === collection?.activeStreamingFileName) ||
          files[files.length - 1];
        if (streamingFile && internalActiveTab !== streamingFile.id && internalActiveTab === 'preview') {
          setInternalActiveTab(streamingFile.id);
        }
      } else {
        if (hasPython && !canPreview) {
          if (internalActiveTab !== 'python-runner') setInternalActiveTab('python-runner');
        } else if (
          !files.some((f) => f.id === internalActiveTab) &&
          internalActiveTab !== 'preview' &&
          internalActiveTab !== 'python-runner'
        ) {
          setInternalActiveTab(files[0].id);
        }
      }
    }
  }, [propActiveFileId, files, isStreaming, collection?.activeStreamingFileName, canPreview, hasPython, internalActiveTab]);

  const handleSelectTab = (tabId: string) => {
    setInternalActiveTab(tabId);
    if (propOnSelectFile && tabId !== 'preview' && tabId !== 'python-runner') {
      propOnSelectFile(tabId);
    }
  };

  const handleDownloadAll = async () => {
    if (!hasFiles) return;
    setIsZipping(true);
    try {
      const zipName = hasPython && !canPreview ? 'chatforge-python-project.zip' : 'chatforge-project.zip';
      await downloadFilesAsZip(files, zipName);
      setZipSuccess(true);
      setTimeout(() => setZipSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to download zip', e);
    } finally {
      setIsZipping(false);
    }
  };

  // Helper for language badges & tab icons
  const getFileBadge = (file: CodeFile) => {
    switch (file.language) {
      case 'python':
        return {
          label: 'PY',
          color: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
          dot: 'bg-amber-400',
        };
      case 'html':
        return {
          label: 'HTML',
          color: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
          dot: 'bg-orange-400',
        };
      case 'css':
        return {
          label: 'CSS',
          color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
          dot: 'bg-sky-400',
        };
      case 'javascript':
        return {
          label: 'JS',
          color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
          dot: 'bg-yellow-400',
        };
      case 'typescript':
        return {
          label: 'TS',
          color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
          dot: 'bg-blue-400',
        };
      case 'json':
        return {
          label: 'JSON',
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
          dot: 'bg-emerald-400',
        };
      default:
        return {
          label: file.language.toUpperCase().slice(0, 4),
          color: 'text-zinc-400 bg-zinc-800 border-zinc-700',
          dot: 'bg-zinc-400',
        };
    }
  };

  if (!hasFiles) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-zinc-950/60 select-none">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-3 shadow-inner">
          <Code2 className="w-6 h-6 text-blue-400/60" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200 mb-1">Code Workbench</h3>
        <p className="text-xs text-zinc-400 max-w-xs leading-relaxed mb-4">
          When the assistant generates Python, HTML, CSS, or JavaScript code, files will automatically appear here separated into organized tabs with live execution and preview.
        </p>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 font-mono">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Try asking: "Write a Python script to calculate Fibonacci series"</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden min-h-0 min-w-0">
      {/* Top Header & Tab Navigation Bar */}
      <div className="bg-zinc-900/95 border-b border-zinc-800/90 shrink-0 flex flex-col">
        {/* Controls row */}
        <div className="h-9 px-3 flex items-center justify-between border-b border-zinc-800/50 bg-zinc-950/40 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-blue-400" />
              <span>Project Files</span>
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-mono text-blue-400 font-semibold">
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Download All as ZIP */}
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={isZipping}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700/90 transition cursor-pointer disabled:opacity-50"
              title="Download all files as ZIP"
            >
              {zipSuccess ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Exported!</span>
                </>
              ) : (
                <>
                  <FolderArchive className="w-3 h-3 text-blue-400" />
                  <span>Export ZIP</span>
                </>
              )}
            </button>

            {/* Expand / Collapse toggle */}
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer ml-0.5"
                title={isExpanded ? 'Restore normal panel width' : 'Expand panel width'}
                aria-label="Expand code panel"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable File Tabs Bar */}
        <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 overflow-x-auto no-scrollbar selection:bg-blue-500/30">
          {/* Live Preview Tab (if web project) */}
          {canPreview && (
            <button
              type="button"
              onClick={() => handleSelectTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition shrink-0 cursor-pointer border-t border-x ${
                activeTab === 'preview'
                  ? 'bg-zinc-950 text-blue-400 border-zinc-800 font-semibold shadow-xs'
                  : 'bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-400 border-transparent hover:text-zinc-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Live Preview</span>
              {isStreaming ? (
                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 font-mono">
                  Writing...
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          )}

          {/* Python WASM Runner Tab (if python project) */}
          {hasPython && (
            <button
              type="button"
              onClick={() => handleSelectTab('python-runner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition shrink-0 cursor-pointer border-t border-x ${
                activeTab === 'python-runner'
                  ? 'bg-zinc-950 text-yellow-400 border-zinc-800 font-semibold shadow-xs'
                  : 'bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-400 border-transparent hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-yellow-400" />
              <span>Run Python (WASM)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </button>
          )}

          {/* Individual Code File Tabs */}
          {files.map((file) => {
            const badge = getFileBadge(file);
            const isActive = activeTab === file.id;
            const isFileStreaming = Boolean(
              isStreaming && (file.isStreaming || file.name === collection?.activeStreamingFileName)
            );

            return (
              <button
                key={file.id}
                type="button"
                onClick={() => handleSelectTab(file.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-mono transition shrink-0 cursor-pointer border-t border-x ${
                  isActive
                    ? 'bg-zinc-950 text-zinc-100 border-zinc-800 font-semibold shadow-xs'
                    : 'bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-400 border-transparent hover:text-zinc-300'
                }`}
              >
                <span className={`text-[10px] px-1 py-0.2 rounded font-sans font-bold border ${badge.color}`}>
                  {badge.label}
                </span>
                <span className="truncate max-w-[130px]">{file.name}</span>
                {isFileStreaming && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-0.5 shrink-0" title="Writing in real-time" />
                )}
                {file.isUnclosed && !isFileStreaming && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5 shrink-0" title="Incomplete block" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action / Notification Banners */}
      {!isStreaming && collection?.isTruncated && (
        <div className="bg-amber-950/40 border-b border-amber-800/60 px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Output reached token ceiling while generating <span className="font-mono text-amber-300 font-semibold">{files[files.length - 1]?.name || 'code'}</span>.
            </span>
          </div>
          {onContinueGenerating && (
            <button
              type="button"
              onClick={onContinueGenerating}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-sm"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Continue Generating</span>
            </button>
          )}
        </div>
      )}

      {!isStreaming && !collection?.isTruncated && canPreview && activeTab !== 'preview' && (
        <div className="bg-emerald-950/30 border-b border-emerald-800/40 px-3 py-1.5 flex items-center justify-between gap-2 text-xs text-emerald-300 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              Generation complete! {files.length} {files.length === 1 ? 'file' : 'files'} ({files.map((f) => f.name).join(', ')}) ready.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleSelectTab('preview')}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>View Live Preview</span>
          </button>
        </div>
      )}

      {/* Tab Contents View */}
      <div className="flex-1 overflow-hidden relative flex flex-col min-h-0 min-w-0 h-full">
        {activeTab === 'preview' && canPreview ? (
          <LivePreview htmlContent={collection?.combinedHtmlPreview || ''} />
        ) : activeTab === 'python-runner' && hasPython ? (
          <PythonWasmRunner files={files} activeFileId={propActiveFileId} />
        ) : activeFile ? (
          <CodeViewer
            key={activeFile.id}
            file={activeFile}
            wrapLines={wrapLines}
            onToggleWrap={() => setWrapLines(!wrapLines)}
            isStreaming={isStreaming && (activeFile.isStreaming || activeFile.name === collection?.activeStreamingFileName)}
          />
        ) : hasPython ? (
          <PythonWasmRunner files={files} activeFileId={propActiveFileId} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-zinc-500 text-xs">
            Select a file from the tabs above to inspect its code.
          </div>
        )}
      </div>
    </div>
  );
};
