-- 뉴스 브리핑 테이블
CREATE TABLE IF NOT EXISTS news_briefings (
  date DATE PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  news_count INT DEFAULT 0,
  top_keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE news_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read briefings" ON news_briefings FOR SELECT USING (true);
