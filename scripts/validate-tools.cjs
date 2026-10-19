const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const lock = require('../Tools/tools-lock.json');

async function hash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

async function validateTools(toolsRoot, runExecutables = true) {
  const fail = message => { throw new Error(`${message}\nGeliştirici hazırlığı: npm run tools:prepare`); };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(toolsRoot, 'runtime-manifest.json'), 'utf8')); }
  catch { fail(`Araç bütünlük listesi eksik: ${toolsRoot}`); }
  if (manifest.schemaVersion !== 1 || manifest.model !== path.basename(lock.model.file) || !Array.isArray(manifest.files)) fail('Araç/model manifest sürümü uyumsuz.');
  const required = [lock.model.file, 'ffmpeg/ffmpeg.exe', 'ffmpeg/ffprobe.exe',
    'whisper/whisper-cli.exe', 'whisper/whisper.dll', 'whisper/ggml.dll', 'whisper/ggml-base.dll',
    'whisper/ggml-cpu-x64.dll', 'whisper/msvcp140.dll', 'whisper/vcruntime140.dll',
    'whisper/vcruntime140_1.dll', 'whisper/vcomp140.dll', 'yt-dlp/yt-dlp.exe', 'deno/deno.exe',
    'licenses/ffmpeg/LICENSE.txt', 'licenses/ffmpeg/COPYING.GPLv3.txt', 'licenses/Microsoft-VC-Runtime-LICENSE.rtf',
    'licenses/whisper-LICENSE.txt', 'licenses/Whisper-model-LICENSE.txt',
    'licenses/yt-dlp-LICENSE.txt', 'licenses/yt-dlp-THIRD_PARTY_LICENSES.txt', 'licenses/Deno-LICENSE.txt'];
  for (const name of required) {
    if (!manifest.files.some(item => item.path === name)) fail(`Zorunlu dosya manifestte yok: ${name}`);
  }
  for (const item of manifest.files) {
    if (typeof item.path !== 'string' || path.isAbsolute(item.path) || item.path.split(/[\\/]/).includes('..')) fail('Geçersiz manifest dosya yolu.');
    const file = path.join(toolsRoot, item.path);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`Paket bileşeni eksik: ${file}`);
    if (fs.statSync(file).size !== item.size || await hash(file) !== item.sha256) fail(`SHA256/boyut doğrulaması başarısız: ${item.path}`);
  }
  const model = manifest.files.find(item => item.path === lock.model.file);
  if (model.size !== lock.model.size || model.sha256 !== lock.model.sha256) fail('Resmi Large-v2 modeliyle bütünlük eşleşmedi.');
  for (const asset of lock.assets.filter(item => item.destination.startsWith('Tools/'))) {
    const record = manifest.files.find(item => `Tools/${item.path}` === asset.destination);
    if (!record || record.sha256 !== asset.sha256) fail(`Sabitlenmiş kaynak sağlama toplamı eşleşmedi: ${asset.destination}`);
  }
  if (runExecutables) {
    for (const [relative, args, version] of [
      ['ffmpeg/ffmpeg.exe', ['-version'], 'n8.1.3'], ['ffmpeg/ffprobe.exe', ['-version'], 'n8.1.3'],
      ['whisper/whisper-cli.exe', ['--version'], lock.versions.whisper],
      ['yt-dlp/yt-dlp.exe', ['--ignore-config', '--version'], lock.versions.ytdlp],
      ['deno/deno.exe', ['--version'], lock.versions.deno],
    ]) {
      const result = spawnSync(path.join(toolsRoot, relative), args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
      if (result.status !== 0 || !`${result.stdout}${result.stderr}`.includes(version)) fail(`Araç çalıştırma/sürüm kontrolü başarısız: ${relative} (${result.error?.message || result.stderr || result.status})`);
    }
  }
  console.log(`Araçlar doğrulandı: ${manifest.files.length} dosya; ${lock.model.name}, ${lock.model.size} bayt; SHA256 geçerli.`);
}

module.exports = async () => validateTools(path.join(root, 'Tools'));
module.exports.validateTools = validateTools;
if (require.main === module) module.exports().catch(error => { console.error(error.message); process.exitCode = 1; });
