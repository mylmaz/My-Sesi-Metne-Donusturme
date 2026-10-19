const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async result => {
  if (process.env.MY_TRANSCRIPT_SKIP_DESKTOP_COPY === '1') return [];
  const name = 'My-Sesi-Metne-Donusturme-Setup-x64.exe';
  const installer = result.artifactPaths.find(file => path.basename(file) === name);
  if (!installer || !fs.existsSync(installer)) throw new Error('NSIS kurulum çıktısı bulunamadı.');
  const desktop = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Environment]::GetFolderPath("DesktopDirectory")'],
    { encoding: 'utf8', windowsHide: true }).trim();
  if (!desktop || !path.isAbsolute(desktop) || !fs.statSync(desktop).isDirectory()) throw new Error('Windows masaüstü klasörü bulunamadı.');
  const destination = path.join(desktop, name);
  fs.copyFileSync(installer, destination);
  console.log(`Kurulum masaüstüne kopyalandı: ${destination}`);
  return [];
};
