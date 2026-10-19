const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateTools } = require('./validate-tools.cjs');

// This runs in the packaged Electron executable, not the development Node.js
// dependency tree. Never import app main here: the check needs no window,
// settings, history, network or application startup.
async function probeExports() {
  const fs = require('node:fs');
  const path = require('node:path');
  const assert = require('node:assert/strict');
  const Module = require('node:module');
  const { inflateRawSync } = require('node:zlib');
  const { once } = require('node:events');
  const archive = path.resolve(process.argv[2]);
  const scratch = path.resolve(process.argv[3]);
  const builtinModules = new Set(Module.builtinModules.map(name => name.replace(/^node:/, '')));
  const allowedRoots = [archive, `${archive}.unpacked`];
  const checkedModules = new Set();
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...options) {
    const resolved = resolve.call(this, request, parent, ...options);
    if (!builtinModules.has(resolved.replace(/^node:/, ''))) {
      const allowed = allowedRoots.some(root => {
        const relative = path.relative(root, path.resolve(resolved));
        return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      });
      // Node's upward lookup could otherwise silently use the repository's
      // node_modules and hide a missing transitive dependency in app.asar.
      if (!allowed) throw new Error(`Paket dışından çözümlenen çalışma zamanı bağımlılığı: ${request} -> ${resolved}`);
      checkedModules.add(resolved);
    }
    return resolved;
  };
  const packagedRequire = Module.createRequire(path.join(archive, 'package.json'));
  const PDFDocument = packagedRequire('pdfkit');
  const { Document, Packer, Paragraph, TextRun } = packagedRequire('docx');
  const text = 'Türkçe karakterler: ç ğ ı İ ö ş ü — Almanca: ä ö ü ß';
  const fonts = path.join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'Fonts');
  const font = ['arial.ttf', 'segoeui.ttf', 'tahoma.ttf'].map(name => path.join(fonts, name)).find(file => fs.existsSync(file));
  assert(font, 'PDF doğrulaması için Türkçe karakter destekli Windows yazı tipi bulunamadı.');
  const pdf = path.join(scratch, 'Türkçe doğrulama.pdf');
  const output = fs.createWriteStream(pdf);
  const finished = once(output, 'finish');
  const document = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  document.on('error', error => output.destroy(error));
  document.pipe(output);
  document.registerFont('AppText', font).font('AppText').fontSize(14).text(text, { features: [] });
  document.end();
  await finished;
  const pdfBytes = fs.readFileSync(pdf);
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  assert(pdfBytes.includes(Buffer.from('/FontFile2')) && pdfBytes.includes(Buffer.from('%%EOF')), 'PDF yazı tipi gömülmedi veya çıktı tamamlanmadı.');
  const docx = path.join(scratch, 'Türkçe doğrulama.docx');
  const docxBytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] }));
  fs.writeFileSync(docx, docxBytes);
  assert.equal(docxBytes.readUInt32LE(0), 0x04034b50);
  let xml;
  // Read the actual document XML from the generated ZIP without relying on
  // another development dependency that might itself mask a packaging error.
  for (let offset = 0; offset + 46 < docxBytes.length; offset++) {
    if (docxBytes.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = docxBytes.readUInt16LE(offset + 28);
    if (docxBytes.subarray(offset + 46, offset + 46 + nameLength).toString() !== 'word/document.xml') continue;
    const method = docxBytes.readUInt16LE(offset + 10);
    const size = docxBytes.readUInt32LE(offset + 20);
    const local = docxBytes.readUInt32LE(offset + 42);
    const start = local + 30 + docxBytes.readUInt16LE(local + 26) + docxBytes.readUInt16LE(local + 28);
    const compressed = docxBytes.subarray(start, start + size);
    xml = (method === 8 ? inflateRawSync(compressed) : compressed).toString('utf8');
    break;
  }
  assert(xml && xml.includes(text), 'DOCX içinde Türkçe/Almanca metin korunmadı.');
  process.stdout.write(`PACKAGED_EXPORT_RUNTIME_OK|modules=${checkedModules.size}|pdf=${pdfBytes.length}|docx=${docxBytes.length}|electron=${process.versions.electron}\n`);
}

function findExecutable(appOutDir, packager) {
  const name = packager?.platformSpecificBuildOptions?.executableName || packager?.appInfo?.productFilename;
  if (name) {
    const file = path.join(appOutDir, name.endsWith('.exe') ? name : `${name}.exe`);
    if (fs.existsSync(file)) return file;
  }
  const executables = fs.readdirSync(appOutDir).filter(name => name.toLowerCase().endsWith('.exe'));
  if (executables.length !== 1) throw new Error(`Paketlenmiş uygulama çalıştırıcısı kesin olarak belirlenemedi: ${appOutDir}`);
  return path.join(appOutDir, executables[0]);
}

function assertNodeModeEnabled(executable) {
  // Read the documented V1 wire before spawning. If a future build disables
  // RunAsNode, fail safely instead of accidentally starting the user's app.
  // https://www.electronjs.org/docs/latest/tutorial/fuses#the-hard-way
  const bytes = fs.readFileSync(executable);
  const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const start = bytes.indexOf(sentinel) + sentinel.length;
  if (start < sentinel.length || bytes[start] !== 1 || bytes[start + 1] < 1 || bytes[start + 2] !== 0x31) {
    throw new Error('Paketlenmiş Electron için RunAsNode doğrulanamadı. Uygulama açılmadan dışa aktarım kontrolü durduruldu.');
  }
}

async function validatePackagedExports(appOutDir, packager) {
  if (process.platform !== 'win32') throw new Error('Windows paketinin dışa aktarım çalışma zamanı kontrolü Windows üzerinde çalıştırılmalıdır.');
  const archive = path.join(appOutDir, 'resources', 'app.asar');
  if (!fs.existsSync(archive)) throw new Error(`Paketlenmiş uygulama arşivi eksik: ${archive}`);
  const executable = findExecutable(appOutDir, packager);
  assertNodeModeEnabled(executable);
  const tempRoot = fs.realpathSync(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(tempRoot, 'my-transcript-package-check-'));
  try {
    const script = path.join(scratch, 'validate-exports.cjs');
    fs.writeFileSync(script, `(${probeExports.toString()})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });\n`, 'utf8');
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: '' };
    delete env.NODE_OPTIONS;
    delete env.ELECTRON_NO_ASAR;
    const result = spawnSync(executable, [script, archive, scratch], { cwd: scratch, env, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0 || !result.stdout?.includes('PACKAGED_EXPORT_RUNTIME_OK|')) {
      throw new Error(`Paketleme durduruldu: PDF/DOCX çalışma zamanı veya bağımlılıkları doğrulanamadı.\n${result.error?.message || ''}\n${result.stderr || ''}\n${result.stdout || ''}`.trim());
    }
    console.log(result.stdout.trim());
  } finally {
    if (path.dirname(scratch) !== tempRoot || !path.basename(scratch).startsWith('my-transcript-package-check-')) {
      throw new Error('Geçici doğrulama klasörü güvenli temizleme sınırının dışında.');
    }
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

module.exports = async context => {
  await validateTools(path.join(context.appOutDir, 'resources', 'Tools'));
  await validatePackagedExports(context.appOutDir, context.packager);
};
module.exports.validatePackagedExports = validatePackagedExports;
