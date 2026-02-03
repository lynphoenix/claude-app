const fs = require('fs');
const file = process.env.HOME + '/.claude/projects/-Users-linyining-Documents-code-clawdbot/097dddba-6883-4992-9f2d-c69c64b9734d.jsonl';
const content = fs.readFileSync(file, 'utf8');
const lines = content.trim().split('\n');

const messages = [];
for (let i = 0; i < lines.length; i++) {
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
        messages.push({ lineNum: i + 1, text: text.substring(0, 50) });
      }
    }
  } catch (e) {}
}

const targetLine = 7517;
const targetIndex = messages.findIndex(m => m.lineNum === targetLine);
console.log('Total messages with text:', messages.length);
console.log('Target message line:', targetLine);
console.log('Target message index:', targetIndex);
console.log('Position from end:', messages.length - targetIndex);
