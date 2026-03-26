CREATE TABLE blog_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  author TEXT DEFAULT '노무법인 위너스',
  cover_image TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_published BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  related_news_ids UUID[],
  seo_title TEXT,
  seo_description TEXT
);
CREATE INDEX idx_blog_slug ON blog_articles(slug);
CREATE INDEX idx_blog_published ON blog_articles(published_at DESC);
CREATE INDEX idx_blog_category ON blog_articles(category);
CREATE INDEX idx_blog_tags ON blog_articles USING gin(tags);
ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON blog_articles FOR SELECT USING (is_published = true);
