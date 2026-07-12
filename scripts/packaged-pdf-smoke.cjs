const fs = require("fs");
const path = require("path");
const { app } = require("electron");

async function run() {
  const asar = process.env.PACKAGED_APP_ASAR;
  const output = process.env.PACKAGED_PDF_OUTPUT;
  if (!asar || !fs.existsSync(asar) || !output) throw new Error("Paketli PDF test yolları eksik.");
  const PDFDocument = require(path.join(asar, "node_modules", "pdfkit", "js", "pdfkit.standalone.js"));
  const font = ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf"].find(fs.existsSync);
  if (!font) throw new Error("Unicode Windows fontu bulunamadı.");
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const stream = fs.createWriteStream(output);
  const done = new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
  doc.pipe(stream);
  doc.registerFont("AppText", fs.readFileSync(font));
  doc.font("AppText").fontSize(14).text("Türkçe PDF doğrulaması: ğ, ü, ş, ı, ö, ç, İ");
  doc.end();
  await done;
  if (!fs.existsSync(output) || fs.statSync(output).size < 500) throw new Error("Paketli PDF üretilemedi.");
  console.log(`PACKAGED_PDF_OK|bytes=${fs.statSync(output).size}`);
}

app.whenReady().then(run).then(() => app.exit(0)).catch((error) => { console.error(error.stack || error); app.exit(1); });
