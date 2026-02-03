const { HistoryLoader } = require('./dist/historyLoader.js');
const loader = new HistoryLoader();
(async () => {
  const messages = await loader.loadHistory('/Users/linyining/Documents/code/clawdbot', 200);
  console.log('Total:', messages.length);
  console.log('\n=== Last 5 messages ===');
  const last5 = messages.slice(-5);
  last5.forEach((msg, i) => {
    const idx = messages.length - 5 + i;
    console.log(`\n[${idx}] ${msg.role}:`);
    console.log(msg.content.substring(0, 100));
  });
})();
