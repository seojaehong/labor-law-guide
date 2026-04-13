import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeSnippetMarkdown } from './utils';

export default function MarkdownSnippet({ value }: { value: string }) {
  const cleaned = normalizeSnippetMarkdown(value);
  return (
    <div className="break-words text-[13px] leading-6 [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--color-accent)' }} />,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-1">{children}</ol>,
          h1: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          h2: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          h3: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          h4: ({ children }) => <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</p>,
          strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{children}</strong>,
          hr: () => <hr className="my-2 border-t" style={{ borderColor: 'var(--color-border)' }} />,
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
