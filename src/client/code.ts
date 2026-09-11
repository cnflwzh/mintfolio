/** Shared code-language labels, rendered-text extraction, and clipboard access. No UI is mounted on import. */
const languageLabels: Record<string, string> = {
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  cs: 'C#',
  css: 'CSS',
  docker: 'Docker',
  dockerfile: 'Dockerfile',
  go: 'Go',
  gql: 'GraphQL',
  graphql: 'GraphQL',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  less: 'Less',
  markdown: 'Markdown',
  md: 'Markdown',
  mdx: 'MDX',
  php: 'PHP',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  ruby: 'Ruby',
  rs: 'Rust',
  rust: 'Rust',
  sass: 'Sass',
  scss: 'SCSS',
  shell: 'Shell',
  sh: 'Shell',
  sql: 'SQL',
  svelte: 'Svelte',
  swift: 'Swift',
  text: 'Text',
  toml: 'TOML',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  vue: 'Vue',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  zsh: 'Zsh',
};

export function formatLanguageLabel(language: string): string {
  const normalized = (language ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'Text';
  }

  if (languageLabels[normalized]) {
    return languageLabels[normalized];
  }

  const words = normalized
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return 'Text';
  }

  return words
    .map((word) => {
      if (word.length <= 4) {
        return word.toUpperCase();
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(' ');
}

export function resolveCodeLanguage(pre: HTMLPreElement, code: HTMLElement): string {
  const preLanguage = pre.getAttribute('data-language') ?? pre.dataset.language;
  if (preLanguage) {
    return formatLanguageLabel(preLanguage);
  }

  const className = Array.from(code.classList).find((value) => value.startsWith('language-'));
  if (className) {
    return formatLanguageLabel(className.replace('language-', ''));
  }

  return 'Text';
}

function fallbackCopyText(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  textarea.remove();
  return copied;
}

export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopyText(text);
    }
  }

  return fallbackCopyText(text);
}

export function extractCodeText(code: HTMLElement, pre: HTMLPreElement): string {
  const renderedLines = Array.from(code.children).filter((child) => child.classList?.contains('line'));

  if (renderedLines.length > 0) {
    return renderedLines
      .map((line) => line.textContent ?? '')
      .join('\n')
      .replace(/\n$/, '');
  }

  return (code.textContent ?? pre.textContent ?? '').replace(/\n$/, '');
}
