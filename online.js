// `npm run online`: starts the game plus a free Cloudflare quick tunnel, so
// friends can join from anywhere without being on the same Wi-Fi.
// Needs cloudflared (macOS: brew install cloudflared). No account required.

const { spawn } = require('child_process');

process.env.PORT = process.env.PORT || '3000';
require('./server').start();

const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${process.env.PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

tunnel.on('error', () => {
  console.error('\n  ไม่พบโปรแกรม cloudflared ติดตั้งก่อนด้วย: brew install cloudflared\n');
  process.exit(1);
});

// cloudflared prints the public address in its log output.
function watch(chunk) {
  const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !process.env.PUBLIC_URL) {
    process.env.PUBLIC_URL = m[0];
    console.log(`  ลิงก์ออนไลน์ (ส่งให้เพื่อนได้เลย): ${m[0]}`);
    console.log('  ปิดเซิร์ฟเวอร์และลิงก์: กด Ctrl+C\n');
  }
}
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);
tunnel.on('exit', (code) => {
  console.error(`\n  ลิงก์ออนไลน์ปิดลงแล้ว (cloudflared exit ${code})`);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    tunnel.kill();
    process.exit(0);
  });
}
