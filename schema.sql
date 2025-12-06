-- RAAAG Lyrics Generator Database Schema
-- PostgreSQL Database

-- 1. Style Guide Table
CREATE TABLE IF NOT EXISTS style_guide (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Quality Checklist Table  
CREATE TABLE IF NOT EXISTS quality_checklist (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Reference Examples Table
CREATE TABLE IF NOT EXISTS reference_examples (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    order_no VARCHAR(50),
    mood VARCHAR(50),
    occasion VARCHAR(100),
    language VARCHAR(50),
    client_story TEXT,
    generated_lyrics TEXT NOT NULL,
    learning_notes TEXT,
    source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'extracted', 'generated'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Generated Lyrics Table (All production lyrics)
CREATE TABLE IF NOT EXISTS generated_lyrics (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    client_request TEXT NOT NULL,
    generated_lyrics TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'needs_work'
    feedback_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Feedback & Learning Table
CREATE TABLE IF NOT EXISTS feedback_learning (
    id SERIAL PRIMARY KEY,
    lyrics_id INTEGER REFERENCES generated_lyrics(id),
    feedback_type VARCHAR(20), -- 'approved', 'needs_work'
    what_worked TEXT, -- Extracted successful patterns
    what_failed TEXT, -- Mistakes to avoid
    learning_pattern TEXT, -- AI-identified pattern
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Pattern Library (AI-discovered patterns from approved lyrics)
CREATE TABLE IF NOT EXISTS pattern_library (
    id SERIAL PRIMARY KEY,
    pattern_type VARCHAR(50), -- 'rhyme', 'structure', 'emotion', 'cultural'
    pattern_description TEXT,
    example_text TEXT,
    success_count INTEGER DEFAULT 0,
    confidence_score DECIMAL(3,2) DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Performance Metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_generated INTEGER DEFAULT 0,
    approved_count INTEGER DEFAULT 0,
    needs_work_count INTEGER DEFAULT 0,
    approval_rate DECIMAL(5,2),
    avg_generation_time INTEGER, -- seconds
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_lyrics_order ON generated_lyrics(order_number);
CREATE INDEX IF NOT EXISTS idx_lyrics_status ON generated_lyrics(status);
CREATE INDEX IF NOT EXISTS idx_lyrics_created ON generated_lyrics(created_at);
CREATE INDEX IF NOT EXISTS idx_examples_occasion ON reference_examples(occasion);
CREATE INDEX IF NOT EXISTS idx_examples_mood ON reference_examples(mood);

-- Insert default style guide (will be updated from UI)
INSERT INTO style_guide (content) VALUES 
('# RAAAG HINDI LYRICS WRITING STYLE GUIDE - Will be updated from Settings');

-- Insert default quality checklist
INSERT INTO quality_checklist (content) VALUES 
('# RAAAG LYRICS QUALITY CHECKLIST - 28 CRITICAL GUIDELINES - Will be updated from Settings');
