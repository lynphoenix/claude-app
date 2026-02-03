const { HistoryLoader } = require('./dist/historyLoader.js');
const loader = new HistoryLoader();
(async () => {
  const messages = await loader.loadHistory('/Users/linyining/Documents/code/clawdbot', 200);
  console.log('Total:', messages.length);
  console.log('\nLast 3 messages:');
  messages.slice(-3).forEach((msg, i) => {
    const idx = messages.length - 3 + i;
    console.log(`[${idx}] ${msg.role}: ${msg.content.substring(0, 80)}`);
  });

  // Check if "好！现在重新编译" is in the messages
  const found = messages.find(m => m.content.includes('好！现在重新编译'));
  console.log('\n"好！现在重新编译" found:', !!found);
  if (found) {
    const idx = messages.indexOf(found);
    console.log(`Position: ${idx} (from end: ${messages.length - idx})`);
  }
})();
