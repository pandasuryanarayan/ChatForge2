import React from 'react';
import { Conversation, ModelInfo, ProviderCredential, ProviderId, ExtractedCodeCollection } from '../types';
import { CodeWorkbench } from './CodeWorkbench';
import { BentoInspector } from './BentoInspector';
import { Code2, Sliders, X, Maximize2, Minimize2, Sparkles, Layers } from 'lucide-react';

interface RightSidebarPanelProps {
  activeConversation?: Conversation;
  activeProviderId: ProviderId;
  activeModelId: string;
  activeModelInfo?: ModelInfo;
  credentials: Record<ProviderId, ProviderCredential>;
  onOpenProviderModal: () => void;
  onOpenParameters: () => void;
  onOpenModelSelector: () => void;
  isOpen: boolean;
  onToggle: () => void;
  codeCollection: ExtractedCodeCollection | null;
  activeFileId?: string;
  onSelectFile?: (fileId: string) => void;
  mode: 'code' | 'inspector';
  onChangeMode: (mode: 'code' | 'inspector') => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isStreaming?: boolean;
  onContinueGenerating?: () => void;
}

export const RightSidebarPanel: React.FC<RightSidebarPanelProps> = ({
  activeConversation,
  activeProviderId,
  activeModelId,
  activeModelInfo,
  credentials,
  onOpenProviderModal,
  onOpenParameters,
  onOpenModelSelector,
  isOpen,
  onToggle,
  codeCollection,
  activeFileId,
  onSelectFile,
  mode,
  onChangeMode,
  isExpanded,
  onToggleExpand,
  isStreaming = false,
  onContinueGenerating,
}) => {
  if (!isOpen) return null;

  const fileCount = codeCollection?.files.length || 0;
  const isWebProject = codeCollection?.isWebProject || false;

  const widthClass = isExpanded
    ? 'w-full sm:w-[560px] md:w-[680px] lg:w-[780px] max-w-full'
    : 'w-full sm:w-88 md:w-96 lg:w-[410px] max-w-full';

  return (
    <aside
      id="right-sidebar-panel"
      className={`border-l border-zinc-800 bg-zinc-950 flex flex-col shrink-0 transition-all duration-200 z-20 h-full max-h-full max-w-full overflow-hidden ${widthClass} fixed inset-y-0 right-0 xl:static min-h-0 min-w-0`}
    >
      {/* Top Header Switcher: Code Files vs Model Config */}
      <div className="h-11 px-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0 select-none">
        {/* Segmented Switcher */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
          <button
            type="button"
            onClick={() => onChangeMode('code')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              mode === 'code'
                ? 'bg-zinc-800 text-blue-400 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Code Files</span>
            {fileCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                  mode === 'code'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {fileCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeMode('inspector')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              mode === 'inspector'
                ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-zinc-400" />
            <span>Inspector</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {/* Expand / Minimize Width Button */}
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer hidden sm:flex"
            title={isExpanded ? 'Restore width' : 'Expand panel width'}
            aria-label="Toggle panel width"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Panel Button */}
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            title="Close panel"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-hidden flex flex-col relative min-h-0 min-w-0 h-full">
        {mode === 'code' ? (
          <CodeWorkbench
            collection={codeCollection}
            activeFileId={activeFileId}
            onSelectFile={onSelectFile}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
            onClose={onToggle}
            isStreaming={isStreaming}
            onContinueGenerating={onContinueGenerating}
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 bg-zinc-950/40">
            <BentoInspector
              activeConversation={activeConversation}
              activeProviderId={activeProviderId}
              activeModelId={activeModelId}
              activeModelInfo={activeModelInfo}
              credentials={credentials}
              onOpenProviderModal={onOpenProviderModal}
              onOpenParameters={onOpenParameters}
              onOpenModelSelector={onOpenModelSelector}
              isOpen={true}
              onToggle={onToggle}
              isInsidePanel={true}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
