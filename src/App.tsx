import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AppSettings,
  Attachment,
  Conversation,
  Message,
  ModelInfo,
  ProviderCredential,
  ProviderId,
  ExtractedCodeCollection,
} from './types';
import { PROVIDERS, DEFAULT_SYSTEM_PROMPTS } from './constants/providers';
import {
  loadConversations,
  saveConversations,
  loadCredentials,
  saveCredential,
  removeCredential,
  loadSettings,
  saveSettings,
  loadActiveConversationId,
  saveActiveConversationId,
  createNewConversation,
  loadAvailableModels,
  saveAvailableModels,
} from './services/storage';
import { streamChat, calculateCost } from './services/api';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { RightSidebarPanel } from './components/RightSidebarPanel';
import { ProviderModal } from './components/ProviderModal';
import { ModelSelectorModal } from './components/ModelSelectorModal';
import { ParametersModal } from './components/ParametersModal';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingView } from './components/OnboardingView';
import { ChatForgeIcon } from './components/ChatForgeLogo';
import { parseApiError } from './utils/errorParser';
import { enrichModelInfo } from './utils/modelSpecs';
import { extractCodeFiles, assembleProjectCodeCollection, getCutoffDetails } from './utils/codeExtractor';
import { AlertCircle, ArrowDown, Sparkles, MessageSquare, Bot } from 'lucide-react';

export default function App() {
  // State Initialization
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [credentials, setCredentials] = useState<Record<ProviderId, ProviderCredential>>(loadCredentials);
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(loadActiveConversationId);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(() => {
    const creds = loadCredentials();
    const isConfigured = (pId: ProviderId) => {
      const c = creds[pId];
      if (!c) return false;
      if (pId === 'custom') return Boolean(c.customBaseUrl?.trim() || (c.apiKey && c.apiKey.trim().length > 3));
      return Boolean(c.apiKey && c.apiKey.trim().length > 3);
    };

    const isDeprecated = (id: string) =>
      /^(gemini-2\.5-flash$|gemini-1\.|gemini-2\.0|gemini-pro)/i.test(id);

    const saved = loadAvailableModels();
    if (saved.length > 0) {
      // Only keep saved models for configured providers and filter out deprecated models
      const valid = saved.filter((m) => isConfigured(m.provider) && !isDeprecated(m.id)).map(enrichModelInfo);
      if (valid.length > 0) return valid;
    }

    const configured = PROVIDERS.filter((p) => isConfigured(p.id));
    if (configured.length > 0) {
      return configured.flatMap((p) => p.defaultModels).map(enrichModelInfo);
    }
    return [];
  });

  // Modal & Inspector Visibility States
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isParametersModalOpen, setIsParametersModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('chatforge_sidebar_open');
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  });

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('chatforge_sidebar_open', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Right Panel Code Files & Inspector Modes
  const [rightSidebarMode, setRightSidebarMode] = useState<'code' | 'inspector'>('code');
  const [selectedCodeMessageId, setSelectedCodeMessageId] = useState<string | null>(null);
  const [activeCodeFileId, setActiveCodeFileId] = useState<string | undefined>(undefined);
  const [isRightSidebarExpanded, setIsRightSidebarExpanded] = useState(false);

  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Ensure active conversation exists & migrate deprecated model references
  useEffect(() => {
    // Migration check for deprecated active models
    if (settings.activeModel === 'gemini-2.5-flash' || /^(gemini-1\.|gemini-2\.0)/.test(settings.activeModel)) {
      setSettings((prev) => ({ ...prev, activeModel: 'gemini-3.7-flash' }));
    }

    if (conversations.length === 0) {
      const initial = createNewConversation(
        settings.activeProvider,
        settings.activeModel || 'gemini-3.7-flash',
        DEFAULT_SYSTEM_PROMPTS[0].prompt
      );
      setConversations([initial]);
      setActiveConversationId(initial.id);
      saveConversations([initial]);
      saveActiveConversationId(initial.id);
    } else {
      // Migrate conversations with deprecated model IDs
      let modified = false;
      const updatedConversations = conversations.map((conv) => {
        if (conv.modelId === 'gemini-2.5-flash' || /^(gemini-1\.|gemini-2\.0)/.test(conv.modelId)) {
          modified = true;
          return { ...conv, modelId: 'gemini-3.7-flash' };
        }
        return conv;
      });

      if (modified) {
        setConversations(updatedConversations);
      }

      if (!activeConversationId || !conversations.some((c) => c.id === activeConversationId)) {
        setActiveConversationId(conversations[0].id);
        saveActiveConversationId(conversations[0].id);
      }
    }
  }, []);

  // Sync settings & conversations to storage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    saveActiveConversationId(activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    if (availableModels && availableModels.length > 0) {
      saveAvailableModels(availableModels);
    }
  }, [availableModels]);

  // Apply Theme & Font-Size classes to document
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
    root.setAttribute('data-font-size', settings.fontSize || 'md');
    if (settings.theme === 'light') {
      root.classList.add('light-theme');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light-theme');
    }
  }, [settings.theme, settings.fontSize]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsModelSelectorOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewConversation();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.activeProvider, settings.activeModel, handleToggleSidebar]);

  const isNearBottomRef = useRef(true);

  // Scroll detection for "Jump to bottom" button
  const handleChatScroll = () => {
    if (chatScrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatScrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isNear = distanceFromBottom < 80;
      isNearBottomRef.current = isNear;
      setShowScrollBottomBtn(!isNear);
    }
  };

  const scrollToBottom = (smooth = true) => {
    isNearBottomRef.current = true;
    setShowScrollBottomBtn(false);
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // Reset scroll-to-bottom button when switching conversations
  useEffect(() => {
    setShowScrollBottomBtn(false);
    isNearBottomRef.current = true;
  }, [activeConversationId]);

  // Active Conversation and Model Resolution with bulletproof fallback
  const fallbackConversation: Conversation = {
    id: 'default_conv',
    title: 'New Conversation',
    providerId: settings.activeProvider || 'google',
    modelId: settings.activeModel || 'gemini-3.7-flash',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    systemPrompt: DEFAULT_SYSTEM_PROMPTS[0].prompt,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const activeConversation: Conversation =
    conversations.find((c) => c.id === activeConversationId) ||
    conversations[0] ||
    fallbackConversation;

  const activeProvider = activeConversation?.providerId || settings.activeProvider || 'google';
  const activeModelId = activeConversation?.modelId || settings.activeModel || 'gemini-3.7-flash';
  const rawModelInfo = availableModels.find(
    (m) => m.id === activeModelId && m.provider === activeProvider
  ) || availableModels.find((m) => m.id === activeModelId);
  const activeModelInfo = rawModelInfo ? enrichModelInfo(rawModelInfo) : undefined;

  // Extract and assemble all code files (HTML, CSS, JS, etc.) from the active conversation,
  // merging continuations and streaming chunks across turns into a unified project.
  const currentCodeCollection: ExtractedCodeCollection | null = useMemo(() => {
    if (!activeConversation?.messages || activeConversation.messages.length === 0) return null;

    return assembleProjectCodeCollection(
      activeConversation.messages,
      selectedCodeMessageId,
      isStreaming
    );
  }, [activeConversation?.messages, selectedCodeMessageId, isStreaming]);

  // When new code files start generating or appear, automatically show them in Code Workbench
  const prevCodeFilesCountRef = useRef(0);
  useEffect(() => {
    const fileCount = currentCodeCollection?.files.length || 0;
    if (fileCount > 0 && prevCodeFilesCountRef.current === 0) {
      setRightSidebarMode('code');
      setIsInspectorOpen(true);
      if (currentCodeCollection?.files[0]) {
        setActiveCodeFileId(currentCodeCollection.files[0].id);
      }
    }
    prevCodeFilesCountRef.current = fileCount;
  }, [currentCodeCollection]);

  // During active streaming, automatically follow to the file currently being written
  const prevStreamingFileNameRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isStreaming && currentCodeCollection?.activeStreamingFileName) {
      if (prevStreamingFileNameRef.current !== currentCodeCollection.activeStreamingFileName) {
        prevStreamingFileNameRef.current = currentCodeCollection.activeStreamingFileName;
        const matchingFile = currentCodeCollection.files.find(
          (f) => f.name === currentCodeCollection.activeStreamingFileName
        );
        if (matchingFile) {
          setActiveCodeFileId(matchingFile.id);
        }
      }
    }
  }, [isStreaming, currentCodeCollection?.activeStreamingFileName, currentCodeCollection?.files]);

  // Resolve model information accurately for any specific message
  const getModelInfoForMessage = (message: Message, conv: Conversation): ModelInfo | undefined => {
    if (message.role === 'user') return undefined;

    const targetProviderId = message.providerId || conv.providerId || 'google';
    const targetModelId = message.modelId || conv.modelId || 'gemini-3.7-flash';

    // 1. Check loaded availableModels
    const foundInAvailable = availableModels.find(
      (m) => m.id === targetModelId && (!targetProviderId || m.provider === targetProviderId)
    ) || availableModels.find((m) => m.id === targetModelId);

    if (foundInAvailable) {
      return enrichModelInfo(foundInAvailable);
    }

    // 2. Check static default models for the provider
    const providerObj = PROVIDERS.find((p) => p.id === targetProviderId);
    const foundInDefaults =
      providerObj?.defaultModels.find((m) => m.id === targetModelId) ||
      PROVIDERS.flatMap((p) => p.defaultModels).find((m) => m.id === targetModelId);

    if (foundInDefaults) {
      return enrichModelInfo(foundInDefaults);
    }

    // 3. Fallback dynamically enriched ModelInfo
    return enrichModelInfo({
      id: targetModelId,
      name: targetModelId,
      provider: targetProviderId,
    });
  };

  // Check if active provider has a valid key configured
  const currentCred = credentials[activeProvider];
  const hasActiveKey = currentCred?.apiKey && currentCred.apiKey.length > 3;

  // Check if ANY provider is configured
  const hasAnyKeyConfigured = Object.values(credentials).some(
    (c) => c?.apiKey && c.apiKey.length > 3
  );

  // Conversation Actions
  const handleNewConversation = () => {
    if (isStreaming) handleStopStreaming();
    if (activeConversation && activeConversation.messages.length === 0) {
      // Already on a new empty conversation, no need to create a duplicate
      setErrorMessage(null);
      return;
    }
    const newConv = createNewConversation(
      settings.activeProvider,
      settings.activeModel,
      activeConversation?.systemPrompt || DEFAULT_SYSTEM_PROMPTS[0].prompt
    );
    const updated = [newConv, ...conversations];
    setConversations(updated);
    setActiveConversationId(newConv.id);
    setErrorMessage(null);
  };

  const handleDeleteConversation = (id: string) => {
    const updated = conversations.filter((c) => c.id !== id);
    if (updated.length === 0) {
      const fresh = createNewConversation(settings.activeProvider, settings.activeModel);
      setConversations([fresh]);
      setActiveConversationId(fresh.id);
    } else {
      setConversations(updated);
      if (activeConversationId === id) {
        setActiveConversationId(updated[0].id);
      }
    }
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
  };

  const handleTogglePinConversation = (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isPinned: !c.isPinned } : c))
    );
  };

  // Provider & Model Actions
  const handleSaveCredential = (providerId: ProviderId, cred: ProviderCredential) => {
    saveCredential(providerId, cred);
    setCredentials(loadCredentials());
    setSettings((prev) => ({ ...prev, activeProvider: providerId }));
    if (activeConversation) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation.id ? { ...c, providerId } : c))
      );
    }
  };

  const handleRemoveCredential = (providerId: ProviderId) => {
    removeCredential(providerId);
    setCredentials(loadCredentials());
  };

  const handleSelectModel = (providerId: ProviderId, modelId: string) => {
    setSettings((prev) => ({
      ...prev,
      activeProvider: providerId,
      activeModel: modelId,
    }));

    if (activeConversation) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id ? { ...c, providerId, modelId, updatedAt: Date.now() } : c
        )
      );
    }
  };

  const handleTogglePinModel = (modelId: string) => {
    setSettings((prev) => {
      const isPinned = prev.pinnedModels.includes(modelId);
      const updated = isPinned
        ? prev.pinnedModels.filter((id) => id !== modelId)
        : [...prev.pinnedModels, modelId];
      return { ...prev, pinnedModels: updated };
    });
  };

  const handleSaveParameters = (params: {
    temperature: number;
    maxTokens: number;
    topP: number;
    systemPrompt: string;
  }) => {
    if (!activeConversation) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversation.id ? { ...c, ...params, updatedAt: Date.now() } : c))
    );
  };

  // Stop generation
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  // Core Send Message Implementation
  const handleSendMessage = async (
    text: string,
    attachments?: Attachment[],
    customMessagesHistory?: Message[],
    continuationOfId?: string
  ) => {
    if ((!text.trim() && (!attachments || attachments.length === 0)) || isStreaming || !activeConversation) return;

    setErrorMessage(null);
    const cred = credentials[activeConversation.providerId];
    if (!cred?.apiKey && activeConversation.providerId !== 'custom') {
      setIsProviderModalOpen(true);
      return;
    }

    const now = Date.now();
    const currentProvider = activeConversation.providerId;
    const currentModel = activeConversation.modelId;

    const userMessage: Message = {
      id: `msg_${now}_${Math.random().toString(36).substring(2, 7)}`,
      role: 'user',
      content: text.trim(),
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      createdAt: now,
      timestamp: now,
      providerId: currentProvider,
      modelId: currentModel,
    };

    const assistantPlaceholderId = `msg_${now + 1}_${Math.random().toString(36).substring(2, 7)}`;
    const assistantMessage: Message = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      timestamp: now + 1,
      providerId: currentProvider,
      modelId: currentModel,
      continuationOfId,
    };

    // Calculate auto title if this is the first message in conversation
    const baseHistory = customMessagesHistory || activeConversation.messages;
    const isFirstMessage = baseHistory.length === 0;
    const newTitle = isFirstMessage
      ? text.length > 38
        ? `${text.substring(0, 35)}...`
        : text
      : activeConversation.title;

    const updatedMessages = [...baseHistory, userMessage, assistantMessage];
    const workingConversation: Conversation = {
      ...activeConversation,
      title: newTitle,
      messages: updatedMessages,
      updatedAt: now,
    };

    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversation.id ? workingConversation : c))
    );

    setIsStreaming(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startTime = performance.now();

    // Auto-scroll as message starts
    setTimeout(() => scrollToBottom(true), 50);

    try {
      await streamChat(
        {
          ...workingConversation,
          messages: [...baseHistory, userMessage], // send history excluding the empty assistant placeholder
        },
        cred,
        {
          onChunk: (chunk: string) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== activeConversation.id) return c;
                const msgs = c.messages.map((m) => {
                  if (m.id === assistantPlaceholderId) {
                    return { ...m, content: m.content + chunk };
                  }
                  return m;
                });
                return { ...c, messages: msgs };
              })
            );
            if (isNearBottomRef.current) {
              scrollToBottom(false);
            }
          },
          onReasoningChunk: (reasoningChunk: string) => {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== activeConversation.id) return c;
                const msgs = c.messages.map((m) => {
                  if (m.id === assistantPlaceholderId) {
                    return {
                      ...m,
                      reasoningContent: (m.reasoningContent || '') + reasoningChunk,
                    };
                  }
                  return m;
                });
                return { ...c, messages: msgs };
              })
            );
            if (isNearBottomRef.current) {
              scrollToBottom(false);
            }
          },
          onDone: (
            fullText: string,
            fullReasoning?: string,
            usage?: any,
            metadata?: { isTruncated?: boolean; finishReason?: string }
          ) => {
            const durationMs = Math.round(performance.now() - startTime);
            const cost = calculateCost(
              activeModelInfo,
              usage?.prompt || 0,
              usage?.completion || 0
            );

            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== activeConversation.id) return c;
                const msgs = c.messages.map((m) => {
                  if (m.id === assistantPlaceholderId) {
                    return {
                      ...m,
                      content: fullText,
                      reasoningContent: fullReasoning,
                      tokens: usage,
                      estimatedCost: cost,
                      durationMs,
                      providerId: currentProvider,
                      modelId: currentModel,
                      isTruncated: metadata?.isTruncated,
                      finishReason: metadata?.finishReason,
                      continuationOfId,
                    };
                  }
                  return m;
                });
                return { ...c, messages: msgs, updatedAt: Date.now() };
              })
            );
            setIsStreaming(false);
            abortControllerRef.current = null;
          },
          onError: (err: Error) => {
            if (err.name === 'AbortError') return;
            const parsedError = parseApiError(err);
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== activeConversation.id) return c;
                const msgs = c.messages.map((m) => {
                  if (m.id === assistantPlaceholderId) {
                    return {
                      ...m,
                      isError: true,
                      errorDetails: parsedError,
                      providerId: currentProvider,
                      modelId: currentModel,
                    };
                  }
                  return m;
                });
                return { ...c, messages: msgs, updatedAt: Date.now() };
              })
            );
            setIsStreaming(false);
            abortControllerRef.current = null;
          },
        },
        abortController.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const parsedError = parseApiError(err);
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== activeConversation.id) return c;
            const msgs = c.messages.map((m) => {
              if (m.id === assistantPlaceholderId) {
                return {
                  ...m,
                  isError: true,
                  errorDetails: parsedError,
                  providerId: currentProvider,
                  modelId: currentModel,
                };
              }
              return m;
            });
            return { ...c, messages: msgs, updatedAt: Date.now() };
          })
        );
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    }
  };

  // Continue generating code seamlessly when model tokens limit is reached or output is truncated
  const handleContinueGenerating = (targetAssistantMessage?: Message) => {
    if (isStreaming || !activeConversation || activeConversation.messages.length === 0) return;

    // Default to the last assistant message if not passed
    const targetMsg =
      targetAssistantMessage ||
      [...activeConversation.messages].reverse().find((m) => m.role === 'assistant');

    if (!targetMsg) return;

    const cutoff = getCutoffDetails(targetMsg, currentCodeCollection);

    let promptText: string;
    if (cutoff.cutoffFileName) {
      promptText = `Please continue generating the code directly from where you stopped in \`${cutoff.cutoffFileName}\`. Do not repeat code already written. Resume seamlessly from:
\`\`\`${cutoff.cutoffLanguage}
${cutoff.lastSnippet}
\`\`\`
Finish \`${cutoff.cutoffFileName}\` and provide any remaining files in standard fenced code blocks.`;
    } else {
      promptText = `Please continue directly from where you were cut off, without repeating previously written code. Complete any unfinished code blocks and remaining files.`;
    }

    // Keep workbench open in code mode so the user watches real-time streaming
    setRightSidebarMode('code');
    setIsInspectorOpen(true);

    handleSendMessage(promptText, undefined, undefined, targetMsg.id);
  };

  // Regenerate last assistant response
  const handleRegenerate = () => {
    if (isStreaming || !activeConversation || activeConversation.messages.length === 0) return;
    const msgs = [...activeConversation.messages];
    const lastMsg = msgs[msgs.length - 1];

    if (lastMsg.role === 'assistant') {
      msgs.pop(); // remove last assistant message
      const lastUserMsg = msgs[msgs.length - 1];
      if (lastUserMsg && lastUserMsg.role === 'user') {
        const text = lastUserMsg.content;
        const attachments = lastUserMsg.attachments;
        msgs.pop(); // remove user message so handleSendMessage appends it properly
        handleSendMessage(text, attachments, msgs);
      }
    }
  };

  const starterPrompts = [
    'Create a Python project with main.py & utils.py to analyze text statistics',
    'Build a sleek Pomodoro timer in HTML, CSS & JavaScript',
    'Write a TypeScript function to debounce an API call',
    'Audit this code snippet for security vulnerabilities',
  ];

  return (
    <div
      id="chatforge-app-root"
      className="flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans antialiased overflow-hidden selection:bg-blue-500/30"
    >
      {/* Navigation Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          setErrorMessage(null);
        }}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onTogglePinConversation={handleTogglePinConversation}
        isOpen={isSidebarOpen}
        onToggleOpen={handleToggleSidebar}
        onOpenProviderModal={() => setIsProviderModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        credentials={credentials}
        activeProvider={activeProvider}
      />

      {/* Main Chat Viewport */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-900/20 overflow-hidden relative">
        {/* Top Navbar */}
        <Navbar
          onToggleSidebar={handleToggleSidebar}
          isSidebarOpen={isSidebarOpen}
          activeProviderId={activeProvider}
          activeModelId={activeModelId}
          activeModelInfo={activeModelInfo}
          onOpenModelSelector={() => setIsModelSelectorOpen(true)}
          onOpenParameters={() => setIsParametersModalOpen(true)}
          onOpenProviderModal={() => setIsProviderModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onNewChat={handleNewConversation}
          credentials={credentials}
          currentTemperature={activeConversation?.temperature ?? 0.7}
          isInspectorOpen={isInspectorOpen}
          onToggleInspector={() => setIsInspectorOpen(!isInspectorOpen)}
          codeFilesCount={currentCodeCollection?.files.length || 0}
        />

        {/* Center Main Chat Area */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
            {/* Chat Area Content: Onboarding vs Message Stream */}
            {!hasAnyKeyConfigured && activeConversation?.messages.length === 0 ? (
              <OnboardingView
                onSaveCredentialAndStart={(pId, cred) => {
                  handleSaveCredential(pId, cred);
                  const providerModels = availableModels.filter((m) => m.provider === pId);
                  const firstModel =
                    providerModels[0]?.id ||
                    PROVIDERS.find((p) => p.id === pId)?.defaultModels[0]?.id ||
                    'gemini-3.7-flash';
                  handleSelectModel(pId, firstModel);
                }}
                onOpenFullProviderModal={() => setIsProviderModalOpen(true)}
              />
            ) : (
              <div
                ref={chatScrollContainerRef}
                onScroll={handleChatScroll}
                className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-6"
              >
                {activeConversation?.messages.length === 0 ? (
                  <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
                    <div className="flex justify-center">
                      <ChatForgeIcon className="w-16 h-16 drop-shadow-md" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
                        {activeModelInfo?.name || activeModelId}
                      </h2>
                      <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                        {activeModelInfo?.description ||
                          'Ready to answer questions, analyze code, or write complex reasoning workflows.'}
                      </p>
                    </div>

                    {/* Bento Grid Starter Prompts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto pt-4 text-left">
                      <button
                        onClick={() => handleSendMessage('Explain the architecture of Transformer attention mechanisms.')}
                        className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-left transition group shadow-sm cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 transition">
                          Transformer Architecture
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-1">
                          Explain self-attention, query/key/value matrices, and multi-head attention.
                        </div>
                      </button>

                      <button
                        onClick={() => handleSendMessage('Write a clean TypeScript debounce hook for React.')}
                        className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-left transition group shadow-sm cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 transition">
                          React Custom Hooks
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-1">
                          Write a clean TypeScript debounce hook with full type safety.
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto space-y-4">
                    {(activeConversation?.messages || []).map((message, idx) => {
                      const messagesCount = activeConversation?.messages?.length || 0;
                      const isLastAssistantMessage =
                        idx === messagesCount - 1 &&
                        message.role === 'assistant';

                      const messageModelInfo = getModelInfoForMessage(message, activeConversation);

                      return (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          isStreaming={isLastAssistantMessage && isStreaming}
                          onRegenerate={isLastAssistantMessage ? handleRegenerate : undefined}
                          onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                          onOpenProviderModal={() => setIsProviderModalOpen(true)}
                          onOpenParameters={() => setIsParametersModalOpen(true)}
                          onContinueGenerating={
                            isLastAssistantMessage && !isStreaming
                              ? () => handleContinueGenerating(message)
                              : undefined
                          }
                          configuredMaxTokens={activeConversation?.maxTokens ?? 4096}
                          modelInfo={messageModelInfo || activeModelInfo}
                          onOpenFileInWorkbench={(fileId, messageId) => {
                            setSelectedCodeMessageId(messageId);
                            setActiveCodeFileId(fileId);
                            setRightSidebarMode('code');
                            setIsInspectorOpen(true);
                          }}
                          onOpenWorkbenchPreview={(messageId) => {
                            setSelectedCodeMessageId(messageId);
                            const msg = activeConversation?.messages.find((m) => m.id === messageId);
                            const isPython = Boolean(
                              msg?.content &&
                              (msg.content.includes('```python') ||
                               msg.content.includes('```py') ||
                               /#\s*(?:filename:)?\s*.*\.py/i.test(msg.content))
                            );
                            setActiveCodeFileId(isPython ? 'python-runner' : 'preview');
                            setRightSidebarMode('code');
                            setIsInspectorOpen(true);
                          }}
                        />
                      );
                    })}
                    <div ref={messagesEndRef} className="h-4" />
                  </div>
                )}
              </div>
            )}

            {/* Input Bar */}
            <div className="relative p-2.5 sm:px-6 md:px-8 bg-zinc-950/60 backdrop-blur-xs border-t border-zinc-800/60">
              {/* Small Down Arrow Floating Above Chat Space */}
              {showScrollBottomBtn && (activeConversation?.messages?.length || 0) > 0 && (
                <div className="absolute -top-11 sm:-top-12 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                  <button
                    id="scroll-to-bottom-button"
                    onClick={() => scrollToBottom(true)}
                    className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-zinc-900/95 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 shadow-lg shadow-black/50 backdrop-blur-md transition-all duration-150 transform hover:scale-110 active:scale-95 cursor-pointer group"
                    title="Scroll to bottom"
                    aria-label="Scroll to bottom"
                  >
                    <ArrowDown className="w-4 h-4 text-zinc-300 group-hover:text-blue-400 group-hover:translate-y-0.5 transition-all duration-150" />
                  </button>
                </div>
              )}

              <div className="max-w-4xl mx-auto">
                <ChatInput
                  onSendMessage={(text, attachments) => handleSendMessage(text, attachments)}
                  isStreaming={isStreaming}
                  onStopStreaming={handleStopStreaming}
                  activeProviderId={activeProvider}
                  activeModelId={activeModelId}
                  activeModelInfo={activeModelInfo}
                  onOpenModelSelector={() => setIsModelSelectorOpen(true)}
                  onOpenParameters={() => setIsParametersModalOpen(true)}
                  disabled={!hasActiveKey}
                  starterPrompts={activeConversation?.messages.length === 0 ? starterPrompts : undefined}
                />
              </div>
            </div>
          </div>

          {/* Right Configuration Inspector & Code Workbench Column */}
          <RightSidebarPanel
            activeConversation={activeConversation}
            activeProviderId={activeProvider}
            activeModelId={activeModelId}
            activeModelInfo={activeModelInfo}
            credentials={credentials}
            onOpenProviderModal={() => setIsProviderModalOpen(true)}
            onOpenParameters={() => setIsParametersModalOpen(true)}
            onOpenModelSelector={() => setIsModelSelectorOpen(true)}
            isOpen={isInspectorOpen}
            onToggle={() => setIsInspectorOpen(!isInspectorOpen)}
            codeCollection={currentCodeCollection}
            activeFileId={activeCodeFileId}
            onSelectFile={(fileId) => setActiveCodeFileId(fileId)}
            mode={rightSidebarMode}
            onChangeMode={(m) => setRightSidebarMode(m)}
            isExpanded={isRightSidebarExpanded}
            onToggleExpand={() => setIsRightSidebarExpanded(!isRightSidebarExpanded)}
            isStreaming={isStreaming}
            onContinueGenerating={() => handleContinueGenerating()}
          />
        </div>
      </div>

      {/* Modals */}
      <ProviderModal
        isOpen={isProviderModalOpen}
        onClose={() => setIsProviderModalOpen(false)}
        credentials={credentials}
        onSaveCredential={handleSaveCredential}
        onRemoveCredential={handleRemoveCredential}
        activeProvider={activeProvider}
        availableModels={availableModels}
        onUpdateAvailableModels={setAvailableModels}
        onSelectActiveProvider={(id) => {
          const providerModels = availableModels.filter((m) => m.provider === id);
          const firstModel =
            providerModels[0]?.id ||
            PROVIDERS.find((p) => p.id === id)?.defaultModels[0]?.id ||
            'gemini-3.7-flash';
          handleSelectModel(id, firstModel);
        }}
      />

      <ModelSelectorModal
        isOpen={isModelSelectorOpen}
        onClose={() => setIsModelSelectorOpen(false)}
        activeProvider={activeProvider}
        activeModelId={activeModelId}
        onSelectModel={handleSelectModel}
        pinnedModels={settings.pinnedModels}
        onTogglePinModel={handleTogglePinModel}
        credentials={credentials}
        availableModels={availableModels}
        onUpdateAvailableModels={setAvailableModels}
        onOpenProviderModal={(providerId) => {
          if (providerId) {
            handleSelectModel(providerId, activeModelId);
          }
          setIsProviderModalOpen(true);
        }}
      />

      <ParametersModal
        isOpen={isParametersModalOpen}
        onClose={() => setIsParametersModalOpen(false)}
        temperature={activeConversation?.temperature ?? 0.7}
        maxTokens={activeConversation?.maxTokens ?? 4096}
        topP={activeConversation?.topP ?? 1.0}
        systemPrompt={activeConversation?.systemPrompt ?? DEFAULT_SYSTEM_PROMPTS[0].prompt}
        onSaveParameters={handleSaveParameters}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        activeConversation={activeConversation}
        onDataReset={() => {
          setCredentials({} as Record<ProviderId, ProviderCredential>);
          const fresh = createNewConversation('google', 'gemini-3.7-flash');
          setConversations([fresh]);
          setActiveConversationId(fresh.id);
        }}
      />
    </div>
  );
}
