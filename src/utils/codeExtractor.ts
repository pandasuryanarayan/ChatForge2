import { CodeFile, ExtractedCodeCollection, CodeLanguage, Message } from '../types';

/**
 * Checks if a string has an unclosed markdown code fence (odd number of ```).
 */
export function hasUnclosedCodeBlock(text: string): boolean {
  if (!text) return false;
  const matches = text.match(/```/g);
  return matches ? matches.length % 2 !== 0 : false;
}

/**
 * Gets details of the last open unclosed code block if present.
 */
export function getLastOpenCodeBlockInfo(text: string): {
  isOpen: boolean;
  lang: string;
  header: string;
  lastLines: string;
} {
  if (!hasUnclosedCodeBlock(text)) {
    return { isOpen: false, lang: '', header: '', lastLines: '' };
  }
  const lastIndex = text.lastIndexOf('```');
  const afterFence = text.slice(lastIndex + 3);
  const firstNewline = afterFence.indexOf('\n');
  if (firstNewline === -1) {
    const header = afterFence.trim();
    return { isOpen: true, lang: header, header, lastLines: '' };
  }
  const headerLine = afterFence.slice(0, firstNewline).trim();
  const codeContent = afterFence.slice(firstNewline + 1);
  const lines = codeContent.split('\n');
  const lastLines = lines.slice(-4).join('\n');
  return {
    isOpen: true,
    lang: headerLine.split(/\s+/)[0] || '',
    header: headerLine,
    lastLines,
  };
}

/**
 * Intelligently merges two chunks of the same code file across continuation turns.
 * Handles duplicate lines at the boundary, partial line cutoff, and clean indentation.
 */
export function mergeCodeChunks(part1: string, part2: string): string {
  if (!part1) return part2 || '';
  if (!part2) return part1 || '';

  const cleanPart1 = part1.replace(/\r\n/g, '\n');
  const cleanPart2 = part2.replace(/\r\n/g, '\n');

  const lines1 = cleanPart1.split('\n');
  const lines2 = cleanPart2.split('\n');

  // If part2 is already an entire replacement of part1 (e.g. model generated full file)
  if (
    cleanPart2.length > cleanPart1.length &&
    cleanPart2.startsWith(cleanPart1.slice(0, Math.min(250, cleanPart1.length)))
  ) {
    return cleanPart2;
  }

  // 1. Check for overlapping lines at boundary (e.g. model repeated 1 to 8 lines from the end of part 1)
  const maxOverlap = Math.min(8, lines1.length, lines2.length);
  for (let overlap = maxOverlap; overlap >= 1; overlap--) {
    const slice1 = lines1.slice(-overlap).map((l) => l.trim()).join('\n');
    const slice2 = lines2.slice(0, overlap).map((l) => l.trim()).join('\n');
    if (slice1 && slice1 === slice2) {
      // Remove overlapping lines from start of part2
      const remainingLines2 = lines2.slice(overlap);
      return lines1.join('\n') + (remainingLines2.length > 0 ? '\n' + remainingLines2.join('\n') : '');
    }
  }

  // 2. Check if the last line of part1 was cut off mid-statement and part2 starts by completing it
  const lastLine1 = lines1[lines1.length - 1];
  const firstLine2 = lines2[0];
  if (
    lastLine1 &&
    firstLine2 &&
    !lastLine1.trimEnd().endsWith(';') &&
    !lastLine1.trimEnd().endsWith('}') &&
    !lastLine1.trimEnd().endsWith('>')
  ) {
    const trimmedLast1 = lastLine1.trim();
    const trimmedFirst2 = firstLine2.trim();
    if (trimmedFirst2.startsWith(trimmedLast1) && trimmedFirst2.length > trimmedLast1.length) {
      // Replace partial last line with complete line
      return lines1.slice(0, -1).join('\n') + '\n' + lines2.join('\n');
    }
  }

  // 3. Fallback: seamless concatenation
  if (cleanPart1.endsWith('\n')) {
    return cleanPart1 + cleanPart2;
  }
  return cleanPart1 + '\n' + cleanPart2;
}

/**
 * Normalizes language aliases to standard canonical languages.
 */
export function normalizeLanguage(rawLang: string): CodeLanguage {
  const lang = (rawLang || '').toLowerCase().trim();
  if (['html', 'htm', 'xhtml', 'svg', 'xml'].includes(lang)) return 'html';
  if (['css', 'scss', 'sass', 'less'].includes(lang)) return 'css';
  if (['js', 'javascript', 'mjs', 'cjs', 'jsx'].includes(lang)) return 'javascript';
  if (['ts', 'typescript', 'tsx'].includes(lang)) return 'typescript';
  if (['json', 'jsonc'].includes(lang)) return 'json';
  if (['py', 'python', 'py3', 'python3'].includes(lang)) return 'python';
  if (['sh', 'bash', 'zsh', 'shell'].includes(lang)) return 'bash';
  if (['sql'].includes(lang)) return 'sql';
  return lang || 'text';
}

/**
 * Checks if a code block's language is an eligible project code file,
 * or if it specifies an explicit target file name.
 * Terminal output, general markdown text, and unlabelled commands are excluded.
 */
export function isEligibleCodeFileLanguage(rawLang: string, fenceHeader = ''): boolean {
  const l = (rawLang || '').toLowerCase().trim();
  if (['html', 'htm', 'css', 'scss', 'javascript', 'js', 'jsx', 'mjs', 'cjs', 'typescript', 'ts', 'tsx', 'python', 'py', 'py3', 'json', 'sql'].includes(l)) {
    return true;
  }
  // If the fence header explicitly names a file (e.g. ```bash setup.sh or file="config.yaml")
  if (fenceHeader && /(?:filename=["']?|file=["']?)?[a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+/i.test(fenceHeader)) {
    return true;
  }
  return false;
}

/**
 * Checks if content contains actual non-comment, non-whitespace code statements.
 * Prevents creating dummy/placeholder files that contain no executable or structural code.
 */
export function hasActualCode(content: string, _lang?: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (!trimmed) return false;

  const lines = trimmed.split('\n');
  let nonCommentLineCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Common comment prefixes across languages
    if (
      line.startsWith('#') ||
      line.startsWith('//') ||
      line.startsWith('/*') ||
      line.startsWith('*') ||
      line.startsWith('<!--') ||
      line.startsWith(';') ||
      line.startsWith('--')
    ) {
      continue;
    }
    nonCommentLineCount++;
  }

  // Must have at least one non-comment line, or substantial structured code content
  return nonCommentLineCount > 0;
}

/**
 * Checks if Python content has top-level execution calls (print, __main__, function invocation).
 */
export function hasExecutableCalls(content: string): boolean {
  if (!content) return false;
  return /print\s*\(|if\s+__name__\s*==\s*['"]__main__['"]|def\s+main\s*\([^)]*\):[\s\S]*main\s*\(|\bmain\s*\(\)/m.test(
    content
  );
}

/**
 * Derives a filename by inspecting what the AI stated in the markdown text immediately
 * preceding the code block (e.g. "Here is calculator.py:", "### `app.py`", "File: math_ops.py").
 */
function extractFileNameFromPrecedingText(
  precedingText: string,
  lang: CodeLanguage,
  existingNames: Set<string>
): string | null {
  if (!precedingText) return null;

  // Split into lines and inspect from the line right above the fence upwards (up to 8 lines)
  const lines = precedingText.trimEnd().split('\n').filter((l) => l.trim().length > 0);
  const recentLines = lines.slice(-8).reverse();

  // Valid extensions for this language
  let validExts: string[] = [];
  switch (lang) {
    case 'python':
      validExts = ['py', 'pyw'];
      break;
    case 'html':
      validExts = ['html', 'htm'];
      break;
    case 'css':
      validExts = ['css', 'scss', 'sass', 'less'];
      break;
    case 'javascript':
      validExts = ['js', 'mjs', 'cjs', 'jsx'];
      break;
    case 'typescript':
      validExts = ['ts', 'tsx'];
      break;
    case 'json':
      validExts = ['json'];
      break;
    case 'bash':
      validExts = ['sh', 'bash'];
      break;
    default:
      validExts = [lang, 'txt'];
  }

  const extPattern = validExts.join('|');

  // Pass 1: Look for backticked filename with matching extension (e.g. `calculator.py`, `index.html`, `style.css`)
  for (const line of recentLines) {
    const backtickMatch = line.match(new RegExp(`\`([a-zA-Z0-9_\\-./]+\\.(?:${extPattern}))\``, 'i'));
    if (backtickMatch && backtickMatch[1]) {
      const name = backtickMatch[1].split('/').pop() || backtickMatch[1];
      if (!existingNames.has(name)) return name;
    }
  }

  // Pass 2: Look for headings, bold/italics, or explicit labels like "File: calculator.py", "### calculator.py", "**calculator.py**"
  for (const line of recentLines) {
    const labelMatch = line.match(
      new RegExp(
        `(?:#{1,6}|\\*\\*|\\*|File(?:name)?|Save\\s+(?:as|to)|Create(?:\\s+a\\s+file)?|Step\\s*\\d+|\\d+\\.|[-*])\\s*[:\\-]?\\s*[\`"']?([a-zA-Z0-9_\\-./]+\\.(?:${extPattern}))[\`"']?`,
        'i'
      )
    );
    if (labelMatch && labelMatch[1]) {
      const name = labelMatch[1].split('/').pop() || labelMatch[1];
      if (!existingNames.has(name)) return name;
    }
  }

  // Pass 3: Look for any standalone filename with matching extension in the line (e.g. "Here is calculator.py:" or "In calculator.py:")
  for (const line of recentLines) {
    const standaloneMatch = line.match(
      new RegExp(`\\b([a-zA-Z0-9_\\-./]+\\.(?:${extPattern}))\\b`, 'i')
    );
    if (standaloneMatch && standaloneMatch[1]) {
      const name = standaloneMatch[1].split('/').pop() || standaloneMatch[1];
      if (!existingNames.has(name)) return name;
    }
  }

  // Pass 4: Look for backticked name without extension (e.g. `calculator` or `student_manager`) right above fence
  const disallowedWords = new Set([
    'python', 'code', 'script', 'file', 'solution', 'example', 'terminal', 'bash',
    'output', 'input', 'print', 'return', 'def', 'class', 'import', 'function',
    'true', 'false', 'none', 'null', 'undefined', 'html', 'css', 'javascript', 'typescript'
  ]);
  for (const line of recentLines) {
    const backtickWordMatch = line.match(/`([a-zA-Z0-9_\-]+)`/);
    if (backtickWordMatch && backtickWordMatch[1]) {
      const word = backtickWordMatch[1].toLowerCase();
      if (!disallowedWords.has(word) && word.length > 2) {
        const ext = validExts[0] || 'txt';
        const candidate = `${backtickWordMatch[1]}.${ext}`;
        if (!existingNames.has(candidate)) return candidate;
      }
    }
  }

  return null;
}

/**
 * Derives a clean, readable filename from the language, fence header, preceding text, or code comment.
 */
function deriveFileName(
  lang: CodeLanguage,
  fenceHeader: string,
  content: string,
  index: number,
  existingNames: Set<string>,
  precedingText = ''
): string {
  // 1. Check fence header for a valid file name (e.g. ```html index.html, ```python utils.py, filename="app.py", python:calc.py)
  if (fenceHeader) {
    const cleanHeader = fenceHeader.replace(/^[:\s=]+/, '').replace(/^[([{"']+|[)\]}"']+$/g, '');
    const fileMatch = cleanHeader.match(
      /(?:filename=["']?|file=["']?|title=["']?)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)["']?/i
    );
    if (fileMatch && fileMatch[1]) {
      const candidate = fileMatch[1].split('/').pop() || fileMatch[1];
      if (!existingNames.has(candidate)) {
        return candidate;
      }
    }
  }

  // 2. Check the markdown text immediately preceding this code block (what the AI told the user in chat)
  if (precedingText) {
    const toldName = extractFileNameFromPrecedingText(precedingText, lang, existingNames);
    if (toldName) {
      return toldName;
    }
  }

  // 3. Check the first 8 lines of code for comment or docstring filename indications
  const firstLines = content.slice(0, 500).split('\n').slice(0, 8);
  for (const line of firstLines) {
    const trimmed = line.trim();
    // e.g., <!-- index.html --> or <!-- filename: index.html -->
    const htmlComment = trimmed.match(
      /<!--\s*(?:(?:file(?:name)?|module):\s*)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*-->/i
    );
    if (htmlComment && htmlComment[1]) {
      const candidate = htmlComment[1].split('/').pop() || htmlComment[1];
      if (!existingNames.has(candidate)) return candidate;
    }

    // e.g., /* style.css */ or /* filename: styles.css */
    const cssComment = trimmed.match(
      /\/\*\s*(?:(?:file(?:name)?|module):\s*)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)\s*\*\//i
    );
    if (cssComment && cssComment[1]) {
      const candidate = cssComment[1].split('/').pop() || cssComment[1];
      if (!existingNames.has(candidate)) return candidate;
    }

    // e.g., // script.js or // filename: app.js
    const jsComment = trimmed.match(
      /\/\/\s*(?:(?:file(?:name)?|module):\s*)?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/i
    );
    if (jsComment && jsComment[1]) {
      const candidate = jsComment[1].split('/').pop() || jsComment[1];
      if (!existingNames.has(candidate)) return candidate;
    }

    // e.g., # main.py or # filename: calculator.py or # === calculator.py === or # --- calculator.py ---
    const pyComment = trimmed.match(
      /^#\s*(?:(?:file(?:name)?|module):\s*)?[-=\s*]*([a-zA-Z0-9_\-./]+\.(?:py|pyw|txt|json|csv|dat|md))/i
    );
    if (pyComment && pyComment[1]) {
      const candidate = pyComment[1].split('/').pop() || pyComment[1];
      if (!existingNames.has(candidate)) return candidate;
    }

    // e.g. """calculator.py""" or """ filename: calculator.py """
    const docstringComment = trimmed.match(
      /^(?:"""|''')\s*(?:(?:file(?:name)?|module):\s*)?([a-zA-Z0-9_\-./]+\.(?:py|pyw))/i
    );
    if (docstringComment && docstringComment[1]) {
      const candidate = docstringComment[1].split('/').pop() || docstringComment[1];
      if (!existingNames.has(candidate)) return candidate;
    }
  }

  // 4. Smart language-based default filenames (consistent across all languages)
  let baseName = 'file';
  let ext = 'txt';

  switch (lang) {
    case 'html':
      baseName = 'index';
      ext = 'html';
      break;
    case 'css':
      baseName = 'style';
      ext = 'css';
      break;
    case 'javascript':
      baseName = 'script';
      ext = 'js';
      break;
    case 'typescript':
      baseName = 'script';
      ext = 'ts';
      break;
    case 'json':
      baseName = 'data';
      ext = 'json';
      break;
    case 'python':
      baseName = 'main';
      ext = 'py';
      break;
    case 'bash':
      baseName = 'run';
      ext = 'sh';
      break;
    default:
      baseName = 'snippet';
      ext = lang || 'txt';
  }

  let candidate = `${baseName}.${ext}`;
  let counter = 2;
  while (existingNames.has(candidate)) {
    candidate = `${baseName}_${counter}.${ext}`;
    counter++;
  }

  return candidate;
}

/**
 * Extracts all code files from a markdown message content.
 */
export function extractCodeFiles(
  content: string,
  messageId?: string,
  isStreaming = false,
  isTruncated = false
): ExtractedCodeCollection {
  if (!content) {
    return {
      messageId: messageId || '',
      files: [],
      hasHtml: false,
      hasCss: false,
      hasJs: false,
      hasPython: false,
      isWebProject: false,
      isPythonProject: false,
      isStreaming: false,
      isTruncated: false,
    };
  }

  const unclosed = hasUnclosedCodeBlock(content);

  // If there are no markdown fences, check if the content is raw code
  if (!content.includes('```')) {
    const trimmed = content.trim();
    let detectedLang: CodeLanguage | null = null;
    let defaultFileName = 'snippet.txt';

    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || (trimmed.startsWith('<') && trimmed.includes('</'))) {
      detectedLang = 'html';
      defaultFileName = 'index.html';
    } else if (trimmed.startsWith('/*') || trimmed.includes('{') && trimmed.includes('}') && (trimmed.includes('color:') || trimmed.includes('margin:'))) {
      detectedLang = 'css';
      defaultFileName = 'style.css';
    } else if (trimmed.includes('function ') || trimmed.includes('const ') || trimmed.includes('let ') || trimmed.includes('=>')) {
      detectedLang = 'javascript';
      defaultFileName = 'script.js';
    }

    if (detectedLang) {
      const clean = content.replace(/\r\n/g, '\n');
      const lines = clean.split('\n');
      const rawFile: CodeFile = {
        id: `file-${messageId || 'raw'}-0-${defaultFileName}`,
        name: defaultFileName,
        language: detectedLang,
        content: clean,
        messageId,
        lineCount: lines.length,
        sizeBytes: new Blob([clean]).size,
        index: 0,
        isStreaming,
        isUnclosed: isTruncated,
      };

      const isWeb = ['html', 'css', 'javascript', 'typescript'].includes(detectedLang);
      const col: ExtractedCodeCollection = {
        messageId: messageId || '',
        files: [rawFile],
        hasHtml: detectedLang === 'html',
        hasCss: detectedLang === 'css',
        hasJs: detectedLang === 'javascript',
        hasPython: false,
        isWebProject: isWeb,
        isPythonProject: false,
        isStreaming,
        isTruncated,
        activeStreamingFileName: isStreaming ? defaultFileName : undefined,
      };
      if (isWeb) {
        col.combinedHtmlPreview = buildCombinedHtmlPreview([rawFile]);
      }
      return col;
    }

    return {
      messageId: messageId || '',
      files: [],
      hasHtml: false,
      hasCss: false,
      hasJs: false,
      hasPython: false,
      isWebProject: false,
      isPythonProject: false,
      isStreaming: false,
      isTruncated: false,
    };
  }

  // Matches both closed ``` and unclosed ``` (for streaming), capturing full fence line
  const codeBlockRegex = /```([^\r\n]*)\r?\n([\s\S]*?)(?:```|$)/g;
  const files: CodeFile[] = [];
  const existingNames = new Set<string>();

  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const rawFenceInfo = (match[1] || '').trim();
    const codeContent = match[2] || '';
    const fenceStartIndex = match.index;
    const precedingText = content.slice(Math.max(0, fenceStartIndex - 500), fenceStartIndex);

    let rawLang = '';
    let header = '';

    if (rawFenceInfo) {
      // Check for colon separator e.g. python:calc.py or python: calc.py
      const colonMatch = rawFenceInfo.match(/^([a-zA-Z0-9_\-#+.]+)\s*:\s*(.*)$/);
      if (colonMatch) {
        rawLang = colonMatch[1];
        header = colonMatch[2];
      } else {
        const spaceMatch = rawFenceInfo.match(/^([a-zA-Z0-9_\-#+.]+)(?:\s+(.*))?$/);
        if (spaceMatch) {
          rawLang = spaceMatch[1];
          header = spaceMatch[2] || '';
        } else {
          rawLang = rawFenceInfo;
        }
      }
    }

    // Ignore if not an eligible code file language (e.g. bash commands like pip install, terminal output, plain text)
    if (!isEligibleCodeFileLanguage(rawLang, header)) {
      continue;
    }

    const cleanContent = codeContent.replace(/\r\n/g, '\n');

    // Strict code validity: Only create files that contain actual code
    if (!hasActualCode(cleanContent, rawLang)) {
      if (!(isStreaming && cleanContent.trim().length > 0)) {
        continue;
      }
    }

    const lang = normalizeLanguage(rawLang);
    const fileName = deriveFileName(lang, header, cleanContent, index, existingNames, precedingText);
    existingNames.add(fileName);

    const lines = cleanContent.split('\n');

    files.push({
      id: `file-${messageId || 'msg'}-${index}-${fileName}`,
      name: fileName,
      language: lang,
      content: cleanContent,
      messageId,
      lineCount: lines.length,
      sizeBytes: new Blob([cleanContent]).size,
      index,
    });

    index++;
  }

  // Mark the last file as unclosed/streaming if applicable
  if (files.length > 0) {
    const lastIdx = files.length - 1;
    if (unclosed || isTruncated) {
      files[lastIdx].isUnclosed = true;
    }
    if (isStreaming) {
      files[lastIdx].isStreaming = true;
    }
  }

  const hasHtml = files.some((f) => f.language === 'html');
  const hasCss = files.some((f) => f.language === 'css');
  const hasJs = files.some((f) => f.language === 'javascript' || f.language === 'typescript');
  const hasPython = files.some((f) => f.language === 'python');

  // A web project is identified if it has HTML, or at least any web code file (and not purely python)
  const isWebProject =
    hasHtml ||
    (hasCss && hasJs) ||
    (files.length > 0 && files.some((f) => ['html', 'css', 'javascript', 'typescript'].includes(f.language)));
  const isPythonProject = hasPython;

  const collection: ExtractedCodeCollection = {
    messageId: messageId || '',
    files,
    hasHtml,
    hasCss,
    hasJs,
    hasPython,
    isWebProject,
    isPythonProject,
    isStreaming,
    isTruncated: isTruncated || unclosed,
    activeStreamingFileName: isStreaming && files.length > 0 ? files[files.length - 1].name : undefined,
  };

  if (isWebProject) {
    collection.combinedHtmlPreview = buildCombinedHtmlPreview(files);
  }

  return collection;
}

/**
 * Merges a chain of assistant messages that represent continuations of each other.
 */
function mergeChainMessages(chain: Message[], isStreaming = false): ExtractedCodeCollection {
  let consolidatedFiles: CodeFile[] = [];
  const lastMsg = chain[chain.length - 1];

  for (let i = 0; i < chain.length; i++) {
    const msg = chain[i];
    const isLastInChain = i === chain.length - 1;
    const isThisMsgStreaming = isStreaming && isLastInChain;
    const hasFences = msg.content.includes('```');
    const prevMsg = i > 0 ? chain[i - 1] : null;
    const prevHadUnclosed = prevMsg ? hasUnclosedCodeBlock(prevMsg.content) : false;

    if (!hasFences) {
      // ONLY merge if the previous message cut off with an unclosed code block!
      // If previous message was normal, this message is text/explanation and must NEVER be merged into code files.
      if (prevHadUnclosed && consolidatedFiles.length > 0) {
        const lastFileIdx = consolidatedFiles.length - 1;
        const lastFile = consolidatedFiles[lastFileIdx];
        const mergedContent = mergeCodeChunks(lastFile.content, msg.content);
        const lines = mergedContent.split('\n');
        consolidatedFiles[lastFileIdx] = {
          ...lastFile,
          content: mergedContent,
          lineCount: lines.length,
          sizeBytes: new Blob([mergedContent]).size,
          isStreaming: isThisMsgStreaming,
          isUnclosed: isLastInChain && (msg.isTruncated || hasUnclosedCodeBlock(msg.content)),
        };
      }
      continue;
    }

    let contentToParse = msg.content;

    // If previous message had an unclosed block, and this message has text before its first fence
    if (prevHadUnclosed && consolidatedFiles.length > 0) {
      const firstFenceIdx = msg.content.indexOf('```');
      if (firstFenceIdx > 0) {
        const preFenceCode = msg.content.slice(0, firstFenceIdx);
        const lastFileIdx = consolidatedFiles.length - 1;
        const lastFile = consolidatedFiles[lastFileIdx];
        const mergedContent = mergeCodeChunks(lastFile.content, preFenceCode);
        const lines = mergedContent.split('\n');
        consolidatedFiles[lastFileIdx] = {
          ...lastFile,
          content: mergedContent,
          lineCount: lines.length,
          sizeBytes: new Blob([mergedContent]).size,
        };
        contentToParse = msg.content.slice(firstFenceIdx);
      }
    }

    const col = extractCodeFiles(contentToParse, msg.id, isThisMsgStreaming, msg.isTruncated);

    // Merge col.files into consolidatedFiles
    for (const newFile of col.files) {
      const existingIdx = consolidatedFiles.findIndex(
        (f) =>
          f.name.toLowerCase() === newFile.name.toLowerCase() ||
          (f.language === newFile.language && ['html', 'css', 'javascript'].includes(f.language))
      );

      if (existingIdx !== -1) {
        // Matching file found: merge content seamlessly!
        const existing = consolidatedFiles[existingIdx];
        const merged = mergeCodeChunks(existing.content, newFile.content);
        const lines = merged.split('\n');
        consolidatedFiles[existingIdx] = {
          ...existing,
          content: merged,
          lineCount: lines.length,
          sizeBytes: new Blob([merged]).size,
          isStreaming: isThisMsgStreaming && Boolean(newFile.isStreaming),
          isUnclosed: isLastInChain ? newFile.isUnclosed : false,
        };
      } else {
        consolidatedFiles.push({
          ...newFile,
          isStreaming: isThisMsgStreaming && Boolean(newFile.isStreaming),
        });
      }
    }
  }

  // Final filter: Ensure only files that actually contain code are retained
  consolidatedFiles = consolidatedFiles.filter(
    (f) => f.content && f.content.trim().length > 0 && hasActualCode(f.content, f.language)
  );

  // Determine active streaming file name
  let activeStreamingFileName: string | undefined;
  if (isStreaming && consolidatedFiles.length > 0) {
    const streamingFile =
      consolidatedFiles.find((f) => f.isStreaming) || consolidatedFiles[consolidatedFiles.length - 1];
    activeStreamingFileName = streamingFile.name;
  }

  const hasHtml = consolidatedFiles.some((f) => f.language === 'html');
  const hasCss = consolidatedFiles.some((f) => f.language === 'css');
  const hasJs = consolidatedFiles.some((f) => f.language === 'javascript' || f.language === 'typescript');
  const isWebProject =
    hasHtml ||
    (hasCss && hasJs) ||
    (consolidatedFiles.length > 0 &&
      consolidatedFiles.some((f) => ['html', 'css', 'javascript', 'typescript'].includes(f.language)));

  const isTruncated = Boolean(lastMsg.isTruncated || hasUnclosedCodeBlock(lastMsg.content));

  const result: ExtractedCodeCollection = {
    messageId: lastMsg.id,
    files: consolidatedFiles,
    hasHtml,
    hasCss,
    hasJs,
    hasPython: consolidatedFiles.some((f) => f.language === 'python'),
    isWebProject,
    isPythonProject: consolidatedFiles.some((f) => f.language === 'python'),
    isStreaming,
    isTruncated,
    activeStreamingFileName,
  };

  if (isWebProject) {
    result.combinedHtmlPreview = buildCombinedHtmlPreview(consolidatedFiles);
  }

  return result;
}

/**
 * Assembles project files across a sequence of messages (such as continuation turns or revisions)
 * into a single unified, coherent ExtractedCodeCollection.
 */
export function assembleProjectCodeCollection(
  messages: Message[],
  selectedMessageId?: string,
  isStreaming = false
): ExtractedCodeCollection | null {
  if (!messages || messages.length === 0) return null;

  // 1. Identify target assistant message
  let targetIndex = -1;
  if (selectedMessageId) {
    targetIndex = messages.findIndex((m) => m.id === selectedMessageId);
  }
  if (targetIndex === -1) {
    // Find latest assistant message with code or content
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.content) {
        targetIndex = i;
        break;
      }
    }
  }

  if (targetIndex === -1) return null;

  const targetMsg = messages[targetIndex];

  // 2. Determine if this message is part of a continuation chain
  const chain: Message[] = [];
  let currIdx = targetIndex;
  const visited = new Set<string>();

  while (currIdx >= 0) {
    const m = messages[currIdx];
    if (!m || visited.has(m.id)) break;
    visited.add(m.id);
    chain.unshift(m);

    if (m.continuationOfId) {
      const parentIdx = messages.findIndex((p) => p.id === m.continuationOfId);
      if (parentIdx !== -1 && parentIdx < currIdx) {
        currIdx = parentIdx;
        continue;
      }
    }

    // Heuristic: check if the previous assistant message was truncated / had unclosed code
    let foundParent = false;
    for (let p = currIdx - 1; p >= 0; p--) {
      const prev = messages[p];
      if (prev.role === 'assistant') {
        const hasCutoff = prev.isTruncated || hasUnclosedCodeBlock(prev.content);
        const userBetween = messages.slice(p + 1, currIdx).filter((u) => u.role === 'user');
        const isContinuePrompt = userBetween.some((u) =>
          /continue|go on|keep going|more|rest of|finish/i.test(u.content)
        );
        if (hasCutoff || isContinuePrompt) {
          currIdx = p;
          foundParent = true;
        }
        break;
      }
    }
    if (!foundParent) break;
  }

  // Also trace forward from targetIndex to see if any subsequent messages continued from targetIndex
  let forwardIdx = targetIndex;
  while (forwardIdx < messages.length - 1) {
    let nextIdx = -1;
    for (let f = forwardIdx + 1; f < messages.length; f++) {
      const candidate = messages[f];
      if (candidate.role === 'assistant') {
        if (candidate.continuationOfId === messages[forwardIdx].id) {
          nextIdx = f;
          break;
        }
        const userBetween = messages.slice(forwardIdx + 1, f).filter((u) => u.role === 'user');
        const isContinuePrompt = userBetween.some((u) =>
          /continue|go on|keep going|more|rest of|finish/i.test(u.content)
        );
        if (
          (messages[forwardIdx].isTruncated || hasUnclosedCodeBlock(messages[forwardIdx].content)) &&
          isContinuePrompt
        ) {
          nextIdx = f;
          break;
        }
        break;
      }
    }
    if (nextIdx !== -1 && !visited.has(messages[nextIdx].id)) {
      visited.add(messages[nextIdx].id);
      chain.push(messages[nextIdx]);
      forwardIdx = nextIdx;
    } else {
      break;
    }
  }

  // 3. Assemble unified code files
  if (chain.length === 1) {
    const singleMsg = chain[0];
    const isThisStreaming = isStreaming && singleMsg.id === targetMsg.id;
    const col = extractCodeFiles(singleMsg.content, singleMsg.id, isThisStreaming, singleMsg.isTruncated);
    return col.files.length > 0 ? col : null;
  }

  const merged = mergeChainMessages(chain, isStreaming);
  return merged.files.length > 0 ? merged : null;
}

export interface CutoffDetails {
  hasFiles: boolean;
  cutoffFileName: string;
  cutoffLanguage: string;
  lastSnippet: string;
  completedFiles: string[];
  isWebProject: boolean;
}

/**
 * Inspects a truncated or cut-off message to prepare a targeted continuation prompt.
 */
export function getCutoffDetails(
  targetMsg: Message,
  projectCollection: ExtractedCodeCollection | null
): CutoffDetails {
  const files = projectCollection?.files || [];
  const lastFile = files.length > 0 ? files[files.length - 1] : undefined;

  let lastSnippet = '';
  if (lastFile && lastFile.content) {
    const lines = lastFile.content.trimEnd().split('\n');
    lastSnippet = lines.slice(-4).join('\n');
  }

  const completedFiles = files.slice(0, -1).map((f) => f.name);
  const cutoffFileName = lastFile?.name || 'the project';
  const cutoffLanguage = lastFile?.language || 'code';
  const isWebProject = projectCollection?.isWebProject ?? false;

  return {
    hasFiles: files.length > 0,
    cutoffFileName,
    cutoffLanguage,
    lastSnippet,
    completedFiles,
    isWebProject,
  };
}

/**
 * Combines extracted HTML, CSS, and JS files into a single runnable sandbox HTML document.
 */
export function buildCombinedHtmlPreview(files: CodeFile[]): string {
  const htmlFiles = files.filter((f) => f.language === 'html');
  const cssFiles = files.filter((f) => f.language === 'css');
  const jsFiles = files.filter((f) => f.language === 'javascript' || f.language === 'typescript');

  // Concatenate all CSS
  const combinedCss = cssFiles.map((f) => `/* ${f.name} */\n${f.content}`).join('\n\n');

  // Concatenate all JS with safety try-catch
  const combinedJs = jsFiles
    .map(
      (f) => `
// === ${f.name} ===
try {
${f.content}
} catch (err) {
  console.error("Error executing ${f.name}:", err);
}
`
    )
    .join('\n');

  // Console capture snippet to post messages to parent window
  const consoleCaptureScript = `
<script>
(function() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  function safeStringify(obj) {
    try {
      if (typeof obj === 'undefined') return 'undefined';
      if (obj === null) return 'null';
      if (typeof obj === 'object') return JSON.stringify(obj, null, 2);
      return String(obj);
    } catch(e) {
      return String(obj);
    }
  }

  function sendLog(type, args) {
    try {
      const messages = Array.from(args).map(safeStringify);
      window.parent.postMessage({
        source: 'chatforge-code-preview',
        type: 'console',
        level: type,
        messages: messages,
        timestamp: Date.now()
      }, '*');
    } catch(e) {}
  }

  console.log = function(...args) { originalLog.apply(console, args); sendLog('log', args); };
  console.error = function(...args) { originalError.apply(console, args); sendLog('error', args); };
  console.warn = function(...args) { originalWarn.apply(console, args); sendLog('warn', args); };
  console.info = function(...args) { originalInfo.apply(console, args); sendLog('info', args); };

  window.addEventListener('error', function(e) {
    sendLog('error', [e.message + ' (' + (e.filename || 'preview') + ':' + e.lineno + ')']);
  });
})();
</script>
`;

  if (htmlFiles.length > 0) {
    let mainHtml = htmlFiles[0].content;

    // Check if it already has a full HTML structure
    const hasHead = /<head[^>]*>/i.test(mainHtml);
    const hasBody = /<body[^>]*>/i.test(mainHtml);

    if (combinedCss.trim()) {
      const styleTag = `<style id="chatforge-injected-styles">\n${combinedCss}\n</style>`;
      if (hasHead) {
        mainHtml = mainHtml.replace(/<\/head>/i, `${styleTag}\n</head>`);
      } else if (hasBody) {
        mainHtml = mainHtml.replace(/<body[^>]*>/i, `$& \n${styleTag}`);
      } else {
        mainHtml = `${styleTag}\n${mainHtml}`;
      }
    }

    if (combinedJs.trim() || consoleCaptureScript) {
      const scriptTags = `${consoleCaptureScript}\n<script id="chatforge-injected-script">\n${combinedJs}\n</script>`;
      if (hasBody) {
        if (/<\/body>/i.test(mainHtml)) {
          mainHtml = mainHtml.replace(/<\/body>/i, `${scriptTags}\n</body>`);
        } else {
          mainHtml = `${mainHtml}\n${scriptTags}\n</body>`;
        }
      } else {
        mainHtml = `${mainHtml}\n${scriptTags}`;
      }
    }

    // Ensure closing tags if missing
    if (hasHead && !/<\/head>/i.test(mainHtml)) {
      mainHtml = mainHtml.replace(/<body/i, '</head>\n<body');
    }
    if (!/<\/html>/i.test(mainHtml)) {
      mainHtml = `${mainHtml}\n</html>`;
    }

    // Ensure DOCTYPE if missing
    if (!/<!DOCTYPE\s+html>/i.test(mainHtml)) {
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Preview</title>\n</head>\n<body>\n${mainHtml}\n</body>\n</html>`;
    }

    return mainHtml;
  }

  // If no HTML file is present, construct a clean interactive shell for CSS & JS
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      background: #09090b;
      color: #f4f4f5;
    }
    #preview-container {
      max-width: 800px;
      margin: 0 auto;
    }
  </style>
  ${combinedCss ? `<style id="chatforge-injected-styles">\n${combinedCss}\n</style>` : ''}
</head>
<body>
  <div id="preview-container">
    <div id="app"></div>
  </div>
  ${consoleCaptureScript}
  ${combinedJs ? `<script id="chatforge-injected-script">\n${combinedJs}\n</script>` : ''}
</body>
</html>`;
}
