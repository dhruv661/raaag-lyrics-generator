import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// DEFAULT STYLE GUIDE (will be replaced from Settings)
const DEFAULT_STYLE_GUIDE = `# RAAAG HINDI LYRICS WRITING STYLE GUIDE

## CORE PHILOSOPHY
- Write lyrics that capture EMOTIONAL TRUTH beyond surface-level storytelling
- Go deeper than just recounting events - explore feelings, meanings, and emotional landscapes
- Create authentic Hindi/Urdu poetry that feels natural, not translated
- Balance traditional poetic devices with modern accessibility

## LANGUAGE & AUTHENTICITY

### Hindi/Urdu Integration
- Use authentic Urdu/Hindi words naturally (dil, mohabbat, ishq, junoon, hasrat, etc.)
- Avoid English words unless specifically requested or contextually perfect
- Don't force Urdu words - use them where they naturally fit
- Choose words for emotional resonance and authenticity

### Grammar Excellence
- CRITICAL: Proper gender agreement (masculine/feminine forms)
  - Masculine: गया (gaya), हुआ (hua), था (tha), आया (aaya)
  - Feminine: गई (gayi), हुई (hui), थी (thi), आई (aayi)
- Match verb/adjective gender to subject
- Example: "वो आया" (he came) vs "वो आई" (she came)

### Natural Flow
- Write how people actually speak/sing in Hindi
- Use conversational rhythm and natural phrasing
- Avoid awkward word order for rhyme's sake
- Test singability - read aloud to check flow

## WHAT TO AVOID

### Banned Clichés
NEVER use these overused phrases:
- "dil ki baat" / "दिल की बात"
- "pyar ki kahani" / "प्यार की कहानी"
- "aankhon mein sapne" / "आँखों में सपने"
- "zindagi ka safar" / "ज़िंदगी का सफ़र"
- Generic "tu hai meri zindagi" statements`;

// DEFAULT QUALITY CHECKLIST (will be replaced from Settings)
const DEFAULT_QUALITY_CHECKLIST = `# RAAAG LYRICS QUALITY CHECKLIST - 28 CRITICAL GUIDELINES

## 1. STORY & PERSONALIZATION (Guidelines 1-8)

□ 1. Recipient's name included at least ONCE (preferably in chorus or meaningful moment)
□ 2. ALL specific memories/details from customer request are incorporated
□ 3. Relationship dynamic captured authentically
□ 4. Occasion appropriately addressed
□ 5. Emotional depth beyond surface storytelling
□ 6. Specific imagery from their story (not generic)
□ 7. Cultural context appropriate
□ 8. Story arc has beginning, middle, emotional climax

## 2. LANGUAGE EXCELLENCE (Guidelines 9-14)

□ 9. PERFECT Hindi gender agreement throughout
□ 10. Natural Hindi word order and phrasing
□ 11. Authentic Hindi/Urdu vocabulary
□ 12. No awkward constructions for rhyme
□ 13. Spelling and diacritics correct
□ 14. Language matches requested style

## 3. POETIC CRAFT (Guidelines 15-20)

□ 15. NO BANNED CLICHÉS anywhere in song
□ 16. Imagery is SPECIFIC and VIVID
□ 17. Cultural symbols used authentically
□ 18. Appropriate rasa (emotional flavor) maintained
□ 19. Rhythm and meter consistent
□ 20. Rhyme scheme executed well

## 4. STRUCTURE & FLOW (Guidelines 21-24)

□ 21. Clear song structure present
□ 22. Appropriate total length: 16-24 lines
□ 23. Lines are SINGABLE (8-14 syllables typically)
□ 24. Emotional arc builds to peak

## 5. FINAL POLISH (Guidelines 25-28)

□ 25. Every line serves a PURPOSE
□ 26. Chorus is MEMORABLE and REPEATABLE
□ 27. Overall tone matches customer request
□ 28. FINAL TEST: Would the recipient treasure this?`;

// ==================== HELPER FUNCTIONS ====================

/**
 * Build comprehensive system prompt with all training data
 */
async function buildSystemPrompt(clientRequest) {
  try {
    // 1. Get Style Guide (or use default)
    let styleGuide = DEFAULT_STYLE_GUIDE;
    try {
      const styleGuideResult = await pool.query(
        'SELECT content FROM style_guide ORDER BY id DESC LIMIT 1'
      );
      if (styleGuideResult.rows[0]?.content) {
        styleGuide = styleGuideResult.rows[0].content;
      }
    } catch (err) {
      console.log('Using default style guide');
    }

    // 2. Get Quality Checklist (or use default)
    let qualityChecklist = DEFAULT_QUALITY_CHECKLIST;
    try {
      const checklistResult = await pool.query(
        'SELECT content FROM quality_checklist ORDER BY id DESC LIMIT 1'
      );
      if (checklistResult.rows[0]?.content) {
        qualityChecklist = checklistResult.rows[0].content;
      }
    } catch (err) {
      console.log('Using default quality checklist');
    }

    // 3. Extract occasion, mood, language from client request
    const occasion = extractField(clientRequest, 'Occasion');
    const mood = extractField(clientRequest, 'Mood');
    const language = extractField(clientRequest, 'Language');

    // 4. Get similar reference examples (top 5 most relevant)
    let similarExamples = [];
    try {
      const examplesResult = await pool.query(
        `SELECT title, generated_lyrics, learning_notes, client_story
         FROM reference_examples
         WHERE occasion ILIKE $1 OR mood ILIKE $2 OR language ILIKE $3
         ORDER BY created_at DESC
         LIMIT 5`,
        [`%${occasion}%`, `%${mood}%`, `%${language}%`]
      );
      similarExamples = examplesResult.rows;
    } catch (err) {
      console.log('No examples found, using fresh generation');
    }

    // 5. Get approved patterns (what works well)
    let approvedPatterns = [];
    try {
      const approvedPatternsResult = await pool.query(
        `SELECT what_worked, learning_pattern
         FROM feedback_learning
         WHERE feedback_type = 'approved'
         ORDER BY created_at DESC
         LIMIT 10`
      );
      approvedPatterns = approvedPatternsResult.rows;
    } catch (err) {
      console.log('No approved patterns yet');
    }

    // 6. Get mistakes to avoid (from needs_work feedback)
    let commonMistakes = [];
    try {
      const mistakesResult = await pool.query(
        `SELECT what_failed
         FROM feedback_learning
         WHERE feedback_type = 'needs_work' AND what_failed IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 10`
      );
      commonMistakes = mistakesResult.rows;
    } catch (err) {
      console.log('No mistakes logged yet');
    }

    // 7. Build mega system prompt
    let systemPrompt = `You are RAAAG's expert Hindi lyrics writer. Your goal is to create high-quality, personalized song lyrics that match the established style and quality standards.

# YOUR WRITING STYLE
${styleGuide}

# QUALITY CHECKLIST - FOLLOW EVERY GUIDELINE
${qualityChecklist}`;

    // Add examples if available
    if (similarExamples.length > 0) {
      systemPrompt += `\n\n# REFERENCE EXAMPLES - LEARN FROM THESE\n`;
      similarExamples.forEach((ex, i) => {
        systemPrompt += `\n## Example ${i + 1}: ${ex.title}\n`;
        if (ex.client_story) {
          systemPrompt += `**Client Story:** ${ex.client_story.substring(0, 300)}...\n`;
        }
        systemPrompt += `**Generated Lyrics:**\n${ex.generated_lyrics}\n`;
        if (ex.learning_notes) {
          systemPrompt += `**Learning Notes:** ${ex.learning_notes}\n`;
        }
        systemPrompt += `\n---\n`;
      });
    }

    // Add approved patterns if available
    if (approvedPatterns.length > 0) {
      systemPrompt += `\n\n# APPROVED PATTERNS (What works well - use these!)\n`;
      approvedPatterns.forEach((p, i) => {
        systemPrompt += `${i + 1}. ${p.what_worked || p.learning_pattern}\n`;
      });
    }

    // Add common mistakes if available
    if (commonMistakes.length > 0) {
      systemPrompt += `\n\n# COMMON MISTAKES TO AVOID\n`;
      commonMistakes.forEach((m, i) => {
        systemPrompt += `${i + 1}. ❌ ${m.what_failed}\n`;
      });
    }

    systemPrompt += `\n\n# YOUR TASK
Generate lyrics for the following client request. Follow ALL guidelines, use the style from examples, and avoid common mistakes.

**CRITICAL REMINDERS:**
- Use proper Hindi grammar (especially gender agreement!)
- Ensure meaningful rhymes (not filler words)
- Include recipient's name at least once
- Maintain natural conversational tone
- Mix Hindi-English appropriately based on language preference
- Every line must make complete sense
- Read aloud mentally - does it flow?
- NO banned clichés: "dil ki baat", "pyar ki kahani", "aankhon mein sapne", "zindagi ka safar"

Now generate the lyrics:`;

    return systemPrompt;

  } catch (error) {
    console.error('Error building system prompt:', error);
    return `You are a Hindi lyrics writer. Follow the style guide and quality checklist to create personalized song lyrics.

${DEFAULT_STYLE_GUIDE}

${DEFAULT_QUALITY_CHECKLIST}`;
  }
}

/**
 * Extract field from client request (e.g., Occasion, Mood, Language)
 */
function extractField(text, fieldName) {
  const regex = new RegExp(`${fieldName}[:\\s-]+([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Extract order number from client request
 */
function extractOrderNumber(text) {
  const match = text.match(/Order\s+no[:\s]+([A-Z0-9]+)/i);
  return match ? match[1] : `ORD-${Date.now()}`;
}

// ==================== API ENDPOINTS ====================

/**
 * Generate Lyrics - Main endpoint
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('🎵 Generating lyrics with full learning system...');
    const startTime = Date.now();

    // Build comprehensive system prompt
    const systemPrompt = await buildSystemPrompt(prompt);

    // Generate lyrics with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    if (message.content && message.content[0] && message.content[0].text) {
      const generatedLyrics = message.content[0].text;
      const generationTime = Date.now() - startTime;
      
      // Save to database
      const orderNumber = extractOrderNumber(prompt);
      let lyricsId = null;
      
      try {
        const saveResult = await pool.query(
          `INSERT INTO generated_lyrics (order_number, client_request, generated_lyrics, status)
           VALUES ($1, $2, $3, 'pending')
           RETURNING id`,
          [orderNumber, prompt, generatedLyrics]
        );
        lyricsId = saveResult.rows[0].id;
      } catch (dbErr) {
        console.error('Database save error:', dbErr.message);
        // Continue even if DB save fails
      }
      
      console.log(`✅ Lyrics generated successfully in ${generationTime}ms (ID: ${lyricsId || 'not saved'})`);
      
      res.json({ 
        lyrics: generatedLyrics,
        lyricsId: lyricsId,
        orderNumber: orderNumber,
        generationTime: generationTime
      });
    } else {
      console.error('❌ No lyrics in response');
      res.status(500).json({ error: 'Failed to generate lyrics' });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Submit Feedback - Learning from approved/rejected lyrics
 */
app.post('/api/feedback', async (req, res) => {
  try {
    const { lyricsId, status, feedbackNotes } = req.body;
    
    // Update lyrics status
    await pool.query(
      `UPDATE generated_lyrics 
       SET status = $1, feedback_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, feedbackNotes, lyricsId]
    );
    
    // Extract learning patterns
    let whatWorked = null;
    let whatFailed = null;
    
    if (status === 'approved') {
      whatWorked = 'Lyrics approved - successful pattern';
    } else if (status === 'needs_work' && feedbackNotes) {
      whatFailed = feedbackNotes;
    }
    
    // Save learning
    await pool.query(
      `INSERT INTO feedback_learning (lyrics_id, feedback_type, what_worked, what_failed)
       VALUES ($1, $2, $3, $4)`,
      [lyricsId, status, whatWorked, whatFailed]
    );
    
    console.log(`✅ Feedback saved for lyrics ID: ${lyricsId} (Status: ${status})`);
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Dashboard Statistics
 */
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'needs_work' THEN 1 ELSE 0 END) as needs_work
      FROM generated_lyrics
    `);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get All Lyrics (with filters)
 */
app.get('/api/lyrics', async (req, res) => {
  try {
    const { status, search, limit = 100 } = req.query;
    
    let query = 'SELECT id, order_number, generated_lyrics, status, created_at FROM generated_lyrics';
    let params = [];
    let whereClauses = [];
    
    if (status) {
      whereClauses.push(`status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (search) {
      whereClauses.push(`(order_number ILIKE $${params.length + 1} OR generated_lyrics ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    
    if (whereClauses.length > 0) {
      query += ' WHERE ' + whereClauses.join(' AND ');
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Save/Update Style Guide
 */
app.post('/api/settings/style-guide', async (req, res) => {
  try {
    const { content } = req.body;
    await pool.query('INSERT INTO style_guide (content) VALUES ($1)', [content]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Style Guide
 */
app.get('/api/settings/style-guide', async (req, res) => {
  try {
    const result = await pool.query('SELECT content FROM style_guide ORDER BY id DESC LIMIT 1');
    res.json({ content: result.rows[0]?.content || DEFAULT_STYLE_GUIDE });
  } catch (error) {
    res.json({ content: DEFAULT_STYLE_GUIDE });
  }
});

/**
 * Save/Update Quality Checklist
 */
app.post('/api/settings/quality-checklist', async (req, res) => {
  try {
    const { content } = req.body;
    await pool.query('INSERT INTO quality_checklist (content) VALUES ($1)', [content]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Quality Checklist
 */
app.get('/api/settings/quality-checklist', async (req, res) => {
  try {
    const result = await pool.query('SELECT content FROM quality_checklist ORDER BY id DESC LIMIT 1');
    res.json({ content: result.rows[0]?.content || DEFAULT_QUALITY_CHECKLIST });
  } catch (error) {
    res.json({ content: DEFAULT_QUALITY_CHECKLIST });
  }
});

/**
 * Add Reference Example
 */
app.post('/api/settings/examples', async (req, res) => {
  try {
    const { title, lyrics, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO reference_examples (title, generated_lyrics, learning_notes, source)
       VALUES ($1, $2, $3, 'manual')
       RETURNING id`,
      [title, lyrics, notes]
    );
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get All Reference Examples
 */
app.get('/api/settings/examples', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, generated_lyrics, learning_notes, created_at FROM reference_examples ORDER BY id DESC'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Date-wise Analytics
 */
app.get('/api/analytics/datewise', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'needs_work' THEN 1 ELSE 0 END) as needs_work
      FROM generated_lyrics
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
      databaseConnected: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      databaseConnected: false,
      error: error.message
    });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔑 API Key configured: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`🗄️  Database URL configured: ${!!process.env.DATABASE_URL}`);
});
