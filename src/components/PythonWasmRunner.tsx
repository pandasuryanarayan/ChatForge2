import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CodeFile } from '../types';
import { hasActualCode, hasExecutableCalls } from '../utils/codeExtractor';
import {
  Play,
  RotateCcw,
  Terminal,
  Trash2,
  Copy,
  Check,
  FileCode,
  Sparkles,
  AlertTriangle,
  Cpu,
  Clock,
  Layers,
  CheckCircle2,
  XCircle,
  Download,
  Image as ImageIcon,
  Loader2,
  Send,
  Code2,
  CornerDownLeft,
  ArrowRight,
  Zap,
} from 'lucide-react';

interface PythonWasmRunnerProps {
  files: CodeFile[];
  activeFileId?: string;
}

interface ConsoleOutputLine {
  id: string;
  type: 'stdout' | 'stderr' | 'system' | 'plot' | 'info' | 'result' | 'action';
  text: string;
  timestamp: string;
  imageUrl?: string;
  actionPayload?: {
    actionText: string;
    fileToRun?: string;
    codeToRun?: string;
  };
}

// Global cached Pyodide instance to prevent redundant downloads
let globalPyodidePromise: Promise<any> | null = null;
let globalPyodideInstance: any = null;

// Primary & secondary CDN mirrors for Pyodide
const CDN_MIRRORS = [
  {
    name: 'jsDelivr',
    scriptUrl: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js',
    indexUrl: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  },
  {
    name: 'unpkg',
    scriptUrl: 'https://unpkg.com/pyodide@0.26.4/pyodide.js',
    indexUrl: 'https://unpkg.com/pyodide@0.26.4/',
  },
];

async function loadScriptWithTimeout(url: string, timeoutMs = 12000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof (window as any).loadPyodide === 'function') {
      return resolve();
    }

    const script = document.createElement('script');
    script.src = url;
    script.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      script.remove();
      reject(new Error(`Timeout loading ${url} after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    script.onload = () => {
      clearTimeout(timer);
      let checks = 0;
      const interval = setInterval(() => {
        checks++;
        if (typeof (window as any).loadPyodide === 'function') {
          clearInterval(interval);
          resolve();
        } else if (checks > 20) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    };

    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error(`Network error loading ${url}`));
    };

    document.head.appendChild(script);
  });
}

async function getPyodide(
  onLog?: (msg: string) => void,
  stdoutCollector?: (text: string) => void,
  stderrCollector?: (text: string) => void
): Promise<any> {
  if (globalPyodideInstance) {
    return globalPyodideInstance;
  }
  if (globalPyodidePromise) {
    return globalPyodidePromise;
  }

  globalPyodidePromise = (async () => {
    let selectedIndexUrl = CDN_MIRRORS[0].indexUrl;

    if (typeof (window as any).loadPyodide !== 'function') {
      for (const mirror of CDN_MIRRORS) {
        try {
          onLog?.(`[Engine] Fetching Pyodide loader from ${mirror.name} CDN...`);
          await loadScriptWithTimeout(mirror.scriptUrl, 10000);
          if (typeof (window as any).loadPyodide === 'function') {
            selectedIndexUrl = mirror.indexUrl;
            onLog?.(`[Engine] Pyodide loader connected successfully.`);
            break;
          }
        } catch (err: any) {
          onLog?.(`[Notice] ${mirror.name} CDN timed out, trying mirror...`);
        }
      }

      if (typeof (window as any).loadPyodide !== 'function') {
        throw new Error(
          'Could not load Pyodide WebAssembly script from any CDN mirror. Please check your internet connection or network firewall.'
        );
      }
    }

    onLog?.('[Engine] Initializing WebAssembly CPython 3.12 VM (~10MB binary)...');

    const py = await (window as any).loadPyodide({
      indexURL: selectedIndexUrl,
      stdout: (text: string) => {
        if (stdoutCollector && text !== undefined && text !== null) {
          stdoutCollector(text);
        }
      },
      stderr: (text: string) => {
        if (stderrCollector && text !== undefined && text !== null) {
          stderrCollector(text);
        }
      },
    });

    try {
      await py.runPythonAsync(`
import sys, os
for p in ['/home/pyodide', '.']:
    if p not in sys.path:
        sys.path.insert(0, p)
`);
    } catch {}

    onLog?.('[Engine] WebAssembly runtime ready.');
    globalPyodideInstance = py;
    return py;
  })();

  return globalPyodidePromise;
}

export const PythonWasmRunner: React.FC<PythonWasmRunnerProps> = ({
  files,
  activeFileId,
}) => {
  const pythonFiles = useMemo(() => {
    return files.filter(
      (f) =>
        (f.language === 'python' || f.name.endsWith('.py')) &&
        f.content &&
        f.content.trim().length > 0 &&
        hasActualCode(f.content, 'python')
    );
  }, [files]);

  // Identify runner files vs definition files
  const runnerFiles = useMemo(() => {
    return pythonFiles.filter((f) => hasExecutableCalls(f.content));
  }, [pythonFiles]);

  // Determine smart default entry file:
  // If active file is python, use it.
  // Else if there is an executable runner (e.g. utils.py with main() or prints), prefer that runner!
  // Else default to main.py or first file.
  const defaultEntry = useMemo(() => {
    if (activeFileId) {
      const activeFile = pythonFiles.find((f) => f.id === activeFileId);
      if (activeFile) return activeFile.name;
    }
    if (runnerFiles.length > 0) {
      // If a runner file exists, prefer it if main.py doesn't have executable calls
      const mainFile = pythonFiles.find((f) => f.name === 'main.py');
      if (mainFile && hasExecutableCalls(mainFile.content)) {
        return mainFile.name;
      }
      return runnerFiles[0].name;
    }
    const mainFile = pythonFiles.find((f) => f.name === 'main.py');
    if (mainFile) return mainFile.name;
    return pythonFiles[0]?.name || 'main.py';
  }, [activeFileId, pythonFiles, runnerFiles]);

  const [selectedEntryFile, setSelectedEntryFile] = useState<string>(defaultEntry);

  useEffect(() => {
    if (defaultEntry && (!selectedEntryFile || !pythonFiles.some((f) => f.name === selectedEntryFile))) {
      setSelectedEntryFile(defaultEntry);
    }
  }, [defaultEntry, pythonFiles, selectedEntryFile]);

  useEffect(() => {
    if (activeFileId) {
      const activeFile = pythonFiles.find((f) => f.id === activeFileId);
      if (activeFile) {
        setSelectedEntryFile(activeFile.name);
      }
    }
  }, [activeFileId, pythonFiles]);
  const [runtimeStatus, setRuntimeStatus] = useState<'uninitialized' | 'loading' | 'ready' | 'running' | 'error'>('uninitialized');
  const [statusMessage, setStatusMessage] = useState<string>('Ready to execute with WebAssembly');
  const [outputLines, setOutputLines] = useState<ConsoleOutputLine[]>([]);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [activeView, setActiveView] = useState<'terminal' | 'code' | 'plots'>('terminal');
  const [plotImages, setPlotImages] = useState<string[]>([]);
  const [replInput, setReplInput] = useState('');
  const [replHistory, setReplHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [definedSymbols, setDefinedSymbols] = useState<string[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef(false);

  const getTimestamp = () => {
    const now = new Date();
    return now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  };

  const appendOutput = useCallback(
    (
      type: 'stdout' | 'stderr' | 'system' | 'plot' | 'info' | 'result' | 'action',
      rawText: string,
      imageUrl?: string,
      actionPayload?: { actionText: string; fileToRun?: string; codeToRun?: string }
    ) => {
      if (imageUrl) {
        setOutputLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2, 9),
            type: 'plot',
            text: rawText,
            timestamp: getTimestamp(),
            imageUrl,
          },
        ]);
        return;
      }

      if (type === 'action') {
        setOutputLines((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2, 9),
            type: 'action',
            text: rawText,
            timestamp: getTimestamp(),
            actionPayload,
          },
        ]);
        return;
      }

      let lines = rawText.split('\n');
      if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines = lines.slice(0, -1);
      }

      const newItems: ConsoleOutputLine[] = lines.map((line) => ({
        id: Math.random().toString(36).substring(2, 9),
        type,
        text: line,
        timestamp: getTimestamp(),
      }));

      setOutputLines((prev) => [...prev, ...newItems]);
    },
    []
  );

  // Update selected entry file if default changes
  useEffect(() => {
    if (pythonFiles.some((f) => f.name === defaultEntry)) {
      setSelectedEntryFile(defaultEntry);
    } else if (pythonFiles.length > 0) {
      setSelectedEntryFile(pythonFiles[0].name);
    }
  }, [defaultEntry, pythonFiles]);

  // Scroll to bottom of terminal output
  useEffect(() => {
    if (activeView === 'terminal') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLines, activeView]);

  // Active target file
  const activeTargetFile = useMemo(() => {
    return files.find((f) => f.name === selectedEntryFile) || pythonFiles[0];
  }, [files, selectedEntryFile, pythonFiles]);

  // Main execution handler
  const handleRun = useCallback(
    async (entryFile = selectedEntryFile) => {
      if (pythonFiles.length === 0 || isRunningRef.current) return;

      const target = files.find((f) => f.name === entryFile) || pythonFiles[0];
      if (!target) {
        appendOutput('stderr', `Error: Entry file "${entryFile}" not found in project files.`);
        setRuntimeStatus('error');
        setExitCode(1);
        return;
      }

      isRunningRef.current = true;
      setRuntimeStatus('running');
      setStatusMessage(`Running ${entryFile}...`);
      setExitCode(null);
      setExecutionTime(null);

      const lineCount = target.content.trim() ? target.content.split('\n').length : 0;
      appendOutput('system', `>>> python ${entryFile} (CPython 3.12 WASM • ${lineCount} lines)`);

      if (!target.content.trim()) {
        appendOutput('info', `[Notice: "${entryFile}" is currently empty. Add code with print(...) statements to produce output.]`);
        setExecutionTime(1);
        setExitCode(0);
        setRuntimeStatus('ready');
        setStatusMessage(`Finished (empty file)`);
        isRunningRef.current = false;
        return;
      }

      const startTime = performance.now();
      let capturedLiveCount = 0;

      try {
        // 1. Retrieve or initialize Pyodide instance
        const py = await getPyodide(
          (logMsg) => {
            setStatusMessage(logMsg);
            appendOutput('info', logMsg);
          },
          (stdoutChunk) => {
            capturedLiveCount++;
            appendOutput('stdout', stdoutChunk);
          },
          (stderrChunk) => {
            appendOutput('stderr', stderrChunk);
          }
        );

        // 2. Sync all workspace files into virtual filesystem with directory handling
        for (const f of files) {
          try {
            const parts = f.name.split('/');
            if (parts.length > 1) {
              const dir = parts.slice(0, -1).join('/');
              try { py.FS.mkdirTree('/home/pyodide/' + dir); } catch {}
              try { py.FS.mkdirTree('/' + dir); } catch {}
            }
            py.FS.writeFile('/home/pyodide/' + f.name, f.content);
            py.FS.writeFile('/' + f.name, f.content);
          } catch (fsErr) {
            console.warn('VFS write notice:', fsErr);
          }
        }

        // 3. Clear user modules from sys.modules so edits take effect immediately
        for (const f of files) {
          if (f.name.endsWith('.py')) {
            const modName = f.name.replace(/\.py$/, '');
            try {
              await py.runPythonAsync(`
import sys
if "${modName}" in sys.modules:
    del sys.modules["${modName}"]
`);
            } catch {}
          }
        }

        // 4. Check if known heavy packages (numpy, pandas, matplotlib, scipy) need loading
        const content = target.content;
        const packagesToLoad: string[] = [];
        if (/import\s+numpy|from\s+numpy/i.test(content)) packagesToLoad.push('numpy');
        if (/import\s+pandas|from\s+pandas/i.test(content)) packagesToLoad.push('pandas');
        if (/import\s+matplotlib|from\s+matplotlib/i.test(content)) packagesToLoad.push('matplotlib');
        if (/import\s+scipy|from\s+scipy/i.test(content)) packagesToLoad.push('scipy');

        for (const pkg of packagesToLoad) {
          try {
            setStatusMessage(`Loading package '${pkg}'...`);
            appendOutput('info', `[WASM] Loading package '${pkg}'...`);
            await py.loadPackage(pkg);
          } catch (pkgErr: any) {
            appendOutput('stderr', `Warning: Could not load package '${pkg}': ${pkgErr.message || pkgErr}`);
          }
        }

        // 5. Expose stream callback to window for instant chunk dispatch
        (window as any).__chatforge_py_stream = (chunk: string, isErr: boolean) => {
          capturedLiveCount++;
          appendOutput(isErr ? 'stderr' : 'stdout', chunk);
        };

        // 6. Gather sibling module names to auto-import so multi-file responses share definitions seamlessly!
        const currentModName = entryFile.replace(/\.py$/, '');
        const siblingModNames = files
          .filter((f) => f.name.endsWith('.py') && f.name !== entryFile)
          .map((f) => f.name.replace(/\.py$/, ''));

        py.globals.set('__chatforge_code__', target.content);
        py.globals.set('__chatforge_filename__', entryFile);
        py.globals.set('__chatforge_sibling_modules__', JSON.stringify(siblingModNames));

        const executionScript = `
import sys, io, ast, traceback, json, js, __main__

class _PyStreamWriter:
    def __init__(self, is_err=False):
        self.buf = io.StringIO()
        self.is_err = is_err
    def write(self, s):
        if s:
            self.buf.write(s)
            try:
                js.__chatforge_py_stream(s, self.is_err)
            except Exception:
                pass
    def flush(self):
        pass
    def getvalue(self):
        return self.buf.getvalue()

_out_stream = _PyStreamWriter(is_err=False)
_err_stream = _PyStreamWriter(is_err=True)

_orig_stdout = sys.stdout
_orig_stderr = sys.stderr
sys.stdout = _out_stream
sys.stderr = _err_stream

_exit_code = 0
_eval_repr = None
_defined_symbols = []

_code_str = __chatforge_code__
_filename = __chatforge_filename__
_sibling_mods = json.loads(__chatforge_sibling_modules__)

_globals = {
    "__name__": "__main__",
    "__file__": _filename,
    "__builtins__": __builtins__,
}

# Auto-import public symbols from sibling project modules so multi-file chat snippets work seamlessly!
for _mod_name in _sibling_mods:
    try:
        _mod = __import__(_mod_name)
        for _attr in dir(_mod):
            if not _attr.startswith("_") and _attr not in _globals:
                _globals[_attr] = getattr(_mod, _attr)
    except Exception:
        try:
            with open(f"{_mod_name}.py", "r", encoding="utf-8") as _sf:
                _s_code = _sf.read()
            _s_globals = {"__name__": _mod_name, "__builtins__": __builtins__}
            exec(_s_code, _s_globals)
            for _attr, _val in _s_globals.items():
                if not _attr.startswith("_") and _attr not in _globals:
                    _globals[_attr] = _val
        except Exception:
            pass

try:
    # 1. Parse AST to check if last statement is an expression to auto-evaluate
    _parsed = ast.parse(_code_str, filename=_filename)
    _last_expr = None
    if _parsed.body and isinstance(_parsed.body[-1], ast.Expr):
        _last_expr = _parsed.body.pop()

    # 2. Compile and execute preceding statements
    _exec_code = compile(_parsed, _filename, "exec")
    exec(_exec_code, _globals)

    # 3. Evaluate the last expression if present (like Jupyter/REPL)
    if _last_expr is not None:
        _eval_code = compile(ast.Expression(_last_expr.value), _filename, "eval")
        _res = eval(_eval_code, _globals)
        if _res is not None:
            _eval_repr = repr(_res)

    # 4. Gather defined functions and variables
    for _k, _v in _globals.items():
        if not _k.startswith("_") and _k not in ("sys", "io", "ast", "json", "js", "__main__"):
            # Also sync to __main__ so interactive REPL prompt has direct access to them!
            try:
                setattr(__main__, _k, _v)
            except Exception:
                pass

            if callable(_v):
                _defined_symbols.append(f"{_k}()")
            else:
                _defined_symbols.append(_k)

except SystemExit as se:
    _exit_code = se.code if isinstance(se.code, int) else (0 if se.code is None else 1)
except Exception:
    _exit_code = 1
    traceback.print_exc(file=_err_stream)
finally:
    sys.stdout = _orig_stdout
    sys.stderr = _orig_stderr

# 5. Capture matplotlib figure if any was created
_plot_data = None
try:
    import matplotlib.pyplot as plt
    if plt.get_fignums():
        _pbuf = io.BytesIO()
        plt.savefig(_pbuf, format="png", bbox_inches="tight", dpi=140, facecolor="#18181b")
        plt.close("all")
        _pbuf.seek(0)
        import base64
        _plot_data = "data:image/png;base64," + base64.b64encode(_pbuf.read()).decode("utf-8")
except Exception:
    pass

json.dumps({
    "stdout": _out_stream.getvalue(),
    "stderr": _err_stream.getvalue(),
    "evalResult": _eval_repr,
    "defined": _defined_symbols[:15],
    "exitCode": _exit_code,
    "plot": _plot_data
})
`;

        setStatusMessage(`Executing ${target.name}...`);
        const resultJsonStr = await py.runPythonAsync(executionScript);
        let result: any = {};
        try {
          result = JSON.parse(resultJsonStr);
        } catch {
          result = {};
        }

        // Output captured stdout if streaming didn't already display it
        if (capturedLiveCount === 0 && result.stdout) {
          appendOutput('stdout', result.stdout);
        }
        if (result.stderr && capturedLiveCount === 0) {
          appendOutput('stderr', result.stderr);
        }

        // Output evaluated expression result (e.g. => 42)
        if (result.evalResult !== null && result.evalResult !== undefined) {
          appendOutput('result', `=> ${result.evalResult}`);
        }

        // Handle Matplotlib plot if generated
        if (result.plot) {
          setPlotImages((prev) => [...prev, result.plot]);
          appendOutput('plot', '[Plot rendered by matplotlib]', result.plot);
        }

        const duration = Math.round(performance.now() - startTime);
        setExecutionTime(duration);
        const code = result.exitCode ?? 0;
        setExitCode(code);
        setRuntimeStatus(code === 0 ? 'ready' : 'error');

        const symbols = result.defined || [];
        setDefinedSymbols(symbols);

        if (code === 0) {
          const hadOutput =
            (result.stdout && result.stdout.trim().length > 0) ||
            capturedLiveCount > 0 ||
            result.evalResult !== null ||
            result.plot;

          if (!hadOutput) {
            // Check if another file has runner code (e.g. utils.py)
            const otherRunner = pythonFiles.find(
              (f) => f.name !== entryFile && hasExecutableCalls(f.content)
            );

            if (symbols.length > 0) {
              appendOutput(
                'info',
                `[Module executed successfully (${duration}ms) • Defined: ${symbols.join(', ')}]`
              );

              if (otherRunner) {
                appendOutput(
                  'action',
                  `Found runner script "${otherRunner.name}" with demo execution code:`,
                  undefined,
                  {
                    actionText: `Run ${otherRunner.name} (Demo Runner)`,
                    fileToRun: otherRunner.name,
                  }
                );
              } else {
                appendOutput(
                  'info',
                  `[Tip: This file defines functions. Call them in the >>> prompt below or use print() in ${entryFile}]`
                );
              }
            } else {
              appendOutput(
                'info',
                `[Execution successful with exit code 0 in ${duration}ms • No stdout printed. Use print(...) to display results]`
              );
            }
          }
          setStatusMessage(`Process finished with exit code 0 (${duration}ms)`);
        } else {
          setStatusMessage(`Process exited with code ${code} (${duration}ms)`);
        }
      } catch (err: any) {
        const duration = Math.round(performance.now() - startTime);
        setExecutionTime(duration);
        setExitCode(1);
        setRuntimeStatus('error');
        const errMsg = err?.message || String(err);
        appendOutput('stderr', errMsg);
        setStatusMessage(`Execution error (${duration}ms)`);
      } finally {
        isRunningRef.current = false;
      }
    },
    [pythonFiles, files, selectedEntryFile, appendOutput]
  );

  const handleClearOutput = () => {
    setOutputLines([]);
    setPlotImages([]);
    setExitCode(null);
    setExecutionTime(null);
  };

  const handleCopyOutput = () => {
    const rawText = outputLines.map((line) => line.text).join('\n');
    navigator.clipboard.writeText(rawText);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  // REPL execution for testing interactive expressions
  const handleReplSubmit = async (customCommand?: string) => {
    const command = (customCommand || replInput).trim();
    if (!command) return;

    if (!customCommand) {
      setReplHistory((prev) => [...prev, command]);
      setHistoryIdx(-1);
      setReplInput('');
    }

    appendOutput('system', `>>> ${command}`);

    try {
      setRuntimeStatus('running');
      const py = await getPyodide();
      const evalResult = await py.runPythonAsync(command);

      if (evalResult !== undefined && evalResult !== null) {
        const repr = String(evalResult);
        if (repr && repr !== 'None') {
          appendOutput('result', `=> ${repr}`);
        }
      }
      setRuntimeStatus('ready');
    } catch (err: any) {
      appendOutput('stderr', err?.message || String(err));
      setRuntimeStatus('ready');
    }
  };

  const isRunning = runtimeStatus === 'running' || runtimeStatus === 'loading';

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-zinc-950 text-zinc-200 overflow-hidden select-none min-h-0 min-w-0">
      {/* Runner Header & Toolbar */}
      <div className="px-3 py-1.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0 min-w-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {/* Entrypoint File Switcher Dropdown */}
          <div className="flex items-center gap-1.5 bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800 text-xs shrink-0">
            <span className="text-zinc-400 font-mono text-[11px] font-medium">Entry:</span>
            {pythonFiles.length > 0 ? (
              <select
                id="python-entrypoint-select"
                value={selectedEntryFile}
                onChange={(e) => {
                  setSelectedEntryFile(e.target.value);
                  // Do NOT auto-run: let the user decide when to run by clicking the Run button
                }}
                disabled={isRunning}
                className="bg-zinc-900 text-yellow-400 font-mono font-semibold text-xs rounded px-2 py-0.5 border border-zinc-700/60 focus:outline-none focus:border-yellow-500/50 cursor-pointer max-w-[170px] truncate"
                title="Select entry point file"
              >
                {pythonFiles.map((f) => {
                  const lines = f.content.trim().split('\n').length;
                  const isRunner = hasExecutableCalls(f.content);
                  return (
                    <option key={f.id} value={f.name} className="bg-zinc-900 text-zinc-100 font-mono">
                      {f.name} ({lines}L{isRunner ? ' • run' : ''})
                    </option>
                  );
                })}
              </select>
            ) : (
              <span className="text-zinc-500 font-mono text-xs italic">
                No code files
              </span>
            )}
          </div>

          {/* Virtual File System mounted pill count */}
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-400 shrink-0"
            title="All Python files containing code available in virtual filesystem"
          >
            <Layers className="w-3 h-3 text-blue-400" />
            <span>{pythonFiles.length} with code</span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('terminal')}
              className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer flex items-center gap-1 ${
                activeView === 'terminal'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3 h-3" />
              <span>Console</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('code')}
              className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer flex items-center gap-1 ${
                activeView === 'code'
                  ? 'bg-zinc-800 text-yellow-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>Code View</span>
            </button>
            {plotImages.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveView('plots')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                  activeView === 'plots'
                    ? 'bg-zinc-800 text-blue-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ImageIcon className="w-3 h-3" />
                <span>Plots ({plotImages.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Clear Button */}
          <button
            type="button"
            onClick={handleClearOutput}
            disabled={outputLines.length === 0}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40"
            title="Clear terminal output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Copy Output */}
          <button
            type="button"
            onClick={handleCopyOutput}
            disabled={outputLines.length === 0}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer disabled:opacity-40"
            title="Copy terminal output"
          >
            {copiedOutput ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Run / Rerun Button */}
          <button
            id="run-python-button"
            type="button"
            onClick={() => handleRun(selectedEntryFile)}
            disabled={isRunning || pythonFiles.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white disabled:text-zinc-500 text-xs font-semibold shadow-xs transition cursor-pointer"
            title={pythonFiles.length === 0 ? 'No Python files with code found' : `Execute ${selectedEntryFile} in WebAssembly`}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run {selectedEntryFile || 'Python'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Execution View */}
      <div className="flex-1 overflow-hidden flex flex-col relative min-h-0 min-w-0 w-full h-full">
        {activeView === 'terminal' ? (
          <div className="flex-1 bg-[#0d1117] p-3 overflow-y-auto overflow-x-hidden font-mono text-xs selection:bg-blue-500/30 min-h-0 min-w-0 w-full">
            {outputLines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400 select-none py-10 px-4">
                <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 mb-3 text-emerald-400 shadow-md">
                  <Terminal className="w-8 h-8" />
                </div>
                <h4 className="text-zinc-200 font-semibold text-sm mb-1">Python WebAssembly Console</h4>
                <p className="text-xs text-zinc-400 max-w-sm mb-4 leading-relaxed">
                  CPython 3.12 runs natively in your browser via WebAssembly. Select your entry point and click <span className="text-emerald-400 font-semibold">Run</span> to execute.
                </p>

                {pythonFiles.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-center gap-2.5 p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-md max-w-md w-full mb-3">
                    <div className="flex-1 min-w-0 text-left w-full">
                      <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                        Entry Point File:
                      </label>
                      <select
                        id="empty-state-entry-select"
                        value={selectedEntryFile}
                        onChange={(e) => setSelectedEntryFile(e.target.value)}
                        disabled={isRunning}
                        className="w-full bg-zinc-950 text-yellow-400 font-mono font-semibold text-xs rounded-lg px-2.5 py-1.5 border border-zinc-700/80 focus:outline-none focus:border-yellow-500/60 cursor-pointer"
                      >
                        {pythonFiles.map((f) => {
                          const lines = f.content.trim().split('\n').length;
                          const isRunner = hasExecutableCalls(f.content);
                          return (
                            <option key={f.id} value={f.name} className="bg-zinc-900 text-zinc-100 font-mono">
                              {f.name} ({lines} {lines === 1 ? 'line' : 'lines'}{isRunner ? ' • executable' : ''})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRun(selectedEntryFile)}
                      disabled={isRunning}
                      className="w-full sm:w-auto mt-2 sm:mt-0 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white disabled:text-zinc-500 text-xs font-semibold transition cursor-pointer shadow-sm self-end"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                          <span>Running...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run {selectedEntryFile}</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 font-mono">
                    No Python files with code found. Ask AI to generate code to execute it here.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1 w-full min-w-0 max-w-full">
                {outputLines.map((line) => {
                  if (line.type === 'system') {
                    return (
                      <div key={line.id} className="text-zinc-500 flex items-start gap-2 select-none pt-1">
                        <span className="text-[10px] text-zinc-600 select-none shrink-0">{line.timestamp}</span>
                        <span className="text-zinc-400 font-semibold break-words min-w-0">{line.text}</span>
                      </div>
                    );
                  }

                  if (line.type === 'info') {
                    return (
                      <div key={line.id} className="text-cyan-400/85 flex items-start gap-2 text-[11px] py-0.5">
                        <span className="text-[10px] text-zinc-600 select-none shrink-0">{line.timestamp}</span>
                        <span className="break-words min-w-0">{line.text}</span>
                      </div>
                    );
                  }

                  if (line.type === 'action' && line.actionPayload) {
                    return (
                      <div
                        key={line.id}
                        className="my-1.5 p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs max-w-full"
                      >
                        <div className="flex items-center gap-2 text-emerald-300 min-w-0">
                          <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="break-words">{line.text}</span>
                        </div>
                        {line.actionPayload.fileToRun && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEntryFile(line.actionPayload!.fileToRun!);
                              handleRun(line.actionPayload!.fileToRun!);
                            }}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer shadow-xs ml-auto"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{line.actionPayload.actionText}</span>
                          </button>
                        )}
                      </div>
                    );
                  }

                  if (line.type === 'result') {
                    return (
                      <div key={line.id} className="text-emerald-400 font-semibold flex items-start gap-2 text-xs py-0.5 bg-emerald-500/10 px-2 rounded">
                        <span className="text-[10px] text-zinc-600 select-none shrink-0">{line.timestamp}</span>
                        <span className="break-words min-w-0">{line.text}</span>
                      </div>
                    );
                  }

                  if (line.type === 'plot' && line.imageUrl) {
                    return (
                      <div key={line.id} className="my-2 p-2 rounded-lg bg-zinc-900 border border-zinc-800 max-w-md">
                        <img
                          src={line.imageUrl}
                          alt="Matplotlib figure"
                          className="rounded border border-zinc-800 w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-[10px] text-zinc-500 mt-1 flex items-center justify-between">
                          <span>Matplotlib plot</span>
                          <a
                            href={line.imageUrl}
                            download="plot.png"
                            className="text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> Download
                          </a>
                        </div>
                      </div>
                    );
                  }

                  if (line.type === 'stderr') {
                    return (
                      <div key={line.id} className="text-rose-400 whitespace-pre-wrap break-words leading-relaxed font-mono max-w-full overflow-hidden">
                        {line.text}
                      </div>
                    );
                  }

                  return (
                    <div key={line.id} className="text-zinc-200 whitespace-pre-wrap break-words leading-relaxed font-mono max-w-full overflow-hidden">
                      {line.text}
                    </div>
                  );
                })}
                <div ref={terminalEndRef} />
              </div>
            )}
          </div>
        ) : activeView === 'code' ? (
          /* Code View */
          <div className="flex-1 bg-[#090d13] p-3 sm:p-4 overflow-y-auto overflow-x-auto font-mono text-xs min-h-0 min-w-0 w-full">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800 text-xs text-zinc-400 shrink-0 min-w-0">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <FileCode className="w-4 h-4 text-yellow-400 shrink-0" />
                <span className="text-zinc-200 font-semibold truncate">{selectedEntryFile}</span>
                <span className="text-[11px] text-zinc-500 shrink-0">
                  ({activeTargetFile?.content ? activeTargetFile.content.split('\n').length : 0} lines)
                </span>
                {hasExecutableCalls(activeTargetFile?.content || '') ? (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20 shrink-0">
                    Runner Script
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] border border-blue-500/20 shrink-0">
                    Module Definitions
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRun(selectedEntryFile)}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] flex items-center gap-1 transition cursor-pointer shrink-0 ml-2"
              >
                <Play className="w-3 h-3 fill-current" /> Run this code
              </button>
            </div>
            {activeTargetFile?.content ? (
              <pre className="text-zinc-200 whitespace-pre font-mono text-xs leading-relaxed selection:bg-amber-500/30 overflow-x-auto max-w-full pb-4">
                {activeTargetFile.content}
              </pre>
            ) : (
              <div className="text-zinc-500 italic py-6 text-center">
                This file is empty.
              </div>
            )}
          </div>
        ) : (
          /* Plots Grid View */
          <div className="flex-1 bg-zinc-950 p-4 overflow-y-auto min-h-0 min-w-0 w-full">
            <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-400" />
              <span>Rendered Plots ({plotImages.length})</span>
            </h4>
            <div className="grid grid-cols-1 gap-4">
              {plotImages.map((img, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 shadow-md">
                  <img
                    src={img}
                    alt={`Plot ${idx + 1}`}
                    className="rounded-lg w-full object-contain max-h-96"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800 text-xs">
                    <span className="text-zinc-400 font-mono text-[11px]">Figure {idx + 1}</span>
                    <a
                      href={img}
                      download={`plot_${idx + 1}.png`}
                      className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] flex items-center gap-1 transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download PNG</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick-run function suggestion chips if available */}
        {activeView === 'terminal' && definedSymbols.length > 0 && (
          <div className="px-3 py-1 bg-[#090d13] border-t border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px] shrink-0 min-w-0">
            <span className="text-zinc-500 text-[10px] select-none shrink-0 font-medium">Quick Test:</span>
            {definedSymbols
              .filter((s) => s.endsWith('()'))
              .slice(0, 5)
              .map((fn) => {
                const fnName = fn.replace(/\(\)$/, '');
                return (
                  <button
                    key={fn}
                    type="button"
                    onClick={() => {
                      if (fnName === 'analyze_text') {
                        handleReplSubmit(`analyze_text("The quick brown fox jumps over the lazy dog.")`);
                      } else {
                        handleReplSubmit(`${fnName}("Hello world")`);
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-emerald-900/50 hover:text-emerald-300 text-zinc-300 border border-zinc-700/60 transition cursor-pointer shrink-0 font-mono text-[10px]"
                    title={`Test ${fnName} in console`}
                  >
                    ▶ {fnName}()
                  </button>
                );
              })}
          </div>
        )}

        {/* Interactive REPL Prompt Bar at bottom of terminal */}
        {activeView === 'terminal' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleReplSubmit();
            }}
            className="flex items-center gap-2 px-3 py-2 bg-[#090d13] border-t border-zinc-800 text-xs shrink-0 min-w-0 w-full"
          >
            <span className="text-emerald-400 font-mono font-bold select-none shrink-0">&gt;&gt;&gt;</span>
            <input
              type="text"
              value={replInput}
              onChange={(e) => setReplInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (replHistory.length > 0) {
                    const nextIdx = historyIdx < replHistory.length - 1 ? historyIdx + 1 : historyIdx;
                    setHistoryIdx(nextIdx);
                    setReplInput(replHistory[replHistory.length - 1 - nextIdx] || '');
                  }
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (historyIdx > 0) {
                    const nextIdx = historyIdx - 1;
                    setHistoryIdx(nextIdx);
                    setReplInput(replHistory[replHistory.length - 1 - nextIdx] || '');
                  } else if (historyIdx === 0) {
                    setHistoryIdx(-1);
                    setReplInput('');
                  }
                }
              }}
              placeholder="Interactive Python prompt (e.g. analyze_text('hello') or print(1 + 1))..."
              className="flex-1 min-w-0 bg-transparent text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none text-xs"
            />
            <button
              type="submit"
              disabled={!replInput.trim()}
              className="px-2 py-1 rounded text-zinc-400 hover:text-emerald-400 disabled:opacity-30 transition cursor-pointer shrink-0"
              title="Evaluate expression"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

      {/* Runner Status Bar */}
      <div className="px-3 py-1.5 bg-zinc-900/95 border-t border-zinc-800 flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-400 shrink-0 min-w-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 truncate">
          <div className="flex items-center gap-1">
            {runtimeStatus === 'running' || runtimeStatus === 'loading' ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            ) : runtimeStatus === 'ready' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            ) : runtimeStatus === 'error' ? (
              <span className="w-2 h-2 rounded-full bg-rose-400" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
            )}
            <span className="truncate max-w-xs">{statusMessage}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {executionTime !== null && (
            <div className="flex items-center gap-1 text-zinc-400">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>{executionTime}ms</span>
            </div>
          )}

          {exitCode !== null && (
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                exitCode === 0
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {exitCode === 0 ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Exit 0</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3" />
                  <span>Exit {exitCode}</span>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 text-zinc-500 text-[10px] border-l border-zinc-800 pl-2">
            <Cpu className="w-3 h-3 text-yellow-500" />
            <span>Pyodide 0.26 (WASM)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
