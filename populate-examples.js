import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

// Read extracted examples
const examples = JSON.parse(fs.readFileSync('./extracted_examples.json', 'utf8'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function populateExamples() {
  console.log(`\n📥 Populating database with ${examples.length} examples...\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const [index, example] of examples.entries()) {
    try {
      await pool.query(
        `INSERT INTO reference_examples 
         (title, order_no, mood, occasion, language, client_story, generated_lyrics, learning_notes, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'extracted')`,
        [
          `Order ${example.order_no} - ${example.occasion}`,
          example.order_no,
          example.mood,
          example.occasion,
          example.language,
          example.story,
          'Lyrics from training data',  // We didn't extract full lyrics in first pass
          `Extracted from training data - ${example.mood} ${example.occasion} in ${example.language}`,
        ]
      );
      
      successCount++;
      
      if ((index + 1) % 10 === 0) {
        console.log(`✅ Processed ${index + 1}/${examples.length} examples...`);
      }
      
    } catch (error) {
      errorCount++;
      console.error(`❌ Error inserting example ${example.order_no}:`, error.message);
    }
  }
  
  console.log(`\n========================================`);
  console.log(`✅ Successfully inserted: ${successCount} examples`);
  console.log(`❌ Errors: ${errorCount} examples`);
  console.log(`========================================\n`);
  
  await pool.end();
}

populateExamples();
