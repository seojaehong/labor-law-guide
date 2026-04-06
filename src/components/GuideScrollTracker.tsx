'use client';

import { useState, useEffect } from 'react';
import SectionNav from './SectionNav';

interface Section {
  id: string;
  title: string;
}

export default function GuideScrollTracker({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id || '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return <SectionNav sections={sections} activeId={activeId} />;
}
