const fs = require('fs');
const file = process.env.HOME + '/.claude/projects/-Users-linyining-Documents-code-clawdbot/097dddba-6883-4992-9f2d-c69c64b9734d.jsonl';
const content = fs.readFileSync(file, 'utf8');
const lines = content.trim().split('\n');

const startLine = 7876;
let count = 0;

for (let i = startLine - 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  try {
    const record = JSON.parse(line);
    if (record.type === 'user' || record.type === 'assistant') {
      if (!record.message || !record.message.content) continue;
      const cnt = record.message.content;
      let text = '';
      if (typeof cnt === 'string') text = cnt;
      else if (Array.isArray(cnt)) {
        text = cnt.filter(c => c.type === 'text').map(c => c.text).join('\n');
      }
      if (text) {
        count++;
        if (count <= 3) {
          console.log(`Line ${i + 1}: ${record.type}: ${text.substring(0, 60)}`);
        }
      }
    }
  } catch (e) {}
}
console.log(`\nTotal messages with text from line ${startLine}: ${count}`);
