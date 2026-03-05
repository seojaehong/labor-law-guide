'use client';

interface Section {
  id: string;
  title: string;
}

interface Props {
  sections: Section[];
  activeId: string;
}

export default function SectionNav({ sections, activeId }: Props) {
  return (
    <nav className="space-y-1">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`toc-link ${activeId === s.id ? 'active' : ''}`}
        >
          {s.title}
        </a>
      ))}
    </nav>
  );
}
