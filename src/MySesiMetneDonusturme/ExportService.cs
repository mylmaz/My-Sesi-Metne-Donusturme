using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Packaging;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;

namespace MySesiMetneDonusturme
{
    public class ExportService
    {
        private const string FooterText = "My Sesi Metne Dönüştürme | Mustafa Yılmaz © 2026 Tüm hakları saklıdır.";

        public string ExportTxt(MediaJob job, string folder)
        {
            AppPaths.EnsureDirectory(folder);
            string path = Path.Combine(folder, BaseName(job) + ".txt");
            File.WriteAllText(path, BuildHeader(job) + Environment.NewLine + job.Transcript, Encoding.UTF8);
            return path;
        }

        public string ExportSrt(MediaJob job, string folder)
        {
            AppPaths.EnsureDirectory(folder);
            string path = Path.Combine(folder, BaseName(job) + ".srt");
            List<Cue> cues = BuildCues(job.Transcript);
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < cues.Count; i++)
            {
                builder.AppendLine((i + 1).ToString(CultureInfo.InvariantCulture));
                builder.AppendLine(FormatSrt(cues[i].Start) + " --> " + FormatSrt(cues[i].End));
                builder.AppendLine(cues[i].Text);
                builder.AppendLine();
            }
            File.WriteAllText(path, builder.ToString(), Encoding.UTF8);
            return path;
        }

        public string ExportVtt(MediaJob job, string folder)
        {
            AppPaths.EnsureDirectory(folder);
            string path = Path.Combine(folder, BaseName(job) + ".vtt");
            List<Cue> cues = BuildCues(job.Transcript);
            StringBuilder builder = new StringBuilder();
            builder.AppendLine("WEBVTT");
            builder.AppendLine();
            for (int i = 0; i < cues.Count; i++)
            {
                builder.AppendLine(FormatVtt(cues[i].Start) + " --> " + FormatVtt(cues[i].End));
                builder.AppendLine(cues[i].Text);
                builder.AppendLine();
            }
            File.WriteAllText(path, builder.ToString(), Encoding.UTF8);
            return path;
        }

        public string ExportDocx(MediaJob job, string folder)
        {
            AppPaths.EnsureDirectory(folder);
            string path = Path.Combine(folder, BaseName(job) + ".docx");
            if (File.Exists(path)) File.Delete(path);

            using (Package package = Package.Open(path, FileMode.Create))
            {
                PackagePart document = AddXmlPart(package, new Uri("/word/document.xml", UriKind.Relative), "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml", DocumentXml(job));
                PackagePart footer = AddXmlPart(package, new Uri("/word/footer1.xml", UriKind.Relative), "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml", FooterXml());
                package.CreateRelationship(document.Uri, TargetMode.Internal, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "rId1");
                document.CreateRelationship(footer.Uri, TargetMode.Internal, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer", "rIdFooter1");
            }
            return path;
        }

        public string ExportPdf(MediaJob job, string folder)
        {
            AppPaths.EnsureDirectory(folder);
            string path = Path.Combine(folder, BaseName(job) + ".pdf");
            SimplePdfWriter.Write(path, job.DisplayName, BuildHeader(job), job.Transcript, FooterText);
            return path;
        }

        private static PackagePart AddXmlPart(Package package, Uri uri, string contentType, string xml)
        {
            PackagePart part = package.CreatePart(uri, contentType, CompressionOption.Maximum);
            using (Stream stream = part.GetStream(FileMode.Create, FileAccess.Write))
            using (StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false)))
            {
                writer.Write(xml);
            }
            return part;
        }

        private static string BuildHeader(MediaJob job)
        {
            StringBuilder builder = new StringBuilder();
            builder.AppendLine("Başlık: " + job.DisplayName);
            builder.AppendLine("Dosya: " + job.SourcePath);
            builder.AppendLine("Tarih: " + DateTime.Now.ToString("dd.MM.yyyy HH:mm", CultureInfo.CurrentCulture));
            builder.AppendLine("Süre: " + job.Duration);
            builder.AppendLine("Dil: " + job.Language);
            builder.AppendLine(new string('-', 48));
            return builder.ToString();
        }

        private static string BaseName(MediaJob job)
        {
            string value = Path.GetFileNameWithoutExtension(job.DisplayName);
            if (String.IsNullOrWhiteSpace(value)) value = "transkripsiyon";
            foreach (char invalid in Path.GetInvalidFileNameChars())
            {
                value = value.Replace(invalid, '_');
            }
            return value + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss", CultureInfo.InvariantCulture);
        }

        private static List<Cue> BuildCues(string transcript)
        {
            List<Cue> cues = new List<Cue>();
            if (String.IsNullOrWhiteSpace(transcript)) return cues;

            Regex regex = new Regex(@"^\[(\d{2}:\d{2}:\d{2})\]\s*(.*)$");
            string[] lines = transcript.Replace("\r\n", "\n").Split('\n');
            foreach (string raw in lines)
            {
                string line = raw.Trim();
                if (line.Length == 0) continue;
                Match match = regex.Match(line);
                TimeSpan start = cues.Count == 0 ? TimeSpan.Zero : cues[cues.Count - 1].End;
                string text = line;
                if (match.Success)
                {
                    TimeSpan parsed;
                    if (TimeSpan.TryParseExact(match.Groups[1].Value, @"hh\:mm\:ss", CultureInfo.InvariantCulture, out parsed))
                    {
                        start = parsed;
                    }
                    text = match.Groups[2].Value.Trim();
                }
                Cue cue = new Cue();
                cue.Start = start;
                cue.End = start.Add(TimeSpan.FromSeconds(5));
                cue.Text = text;
                cues.Add(cue);
            }

            for (int i = 0; i < cues.Count - 1; i++)
            {
                if (cues[i + 1].Start > cues[i].Start)
                {
                    cues[i].End = cues[i + 1].Start;
                }
            }
            return cues;
        }

        private static string FormatSrt(TimeSpan value)
        {
            return value.ToString(@"hh\:mm\:ss\,fff", CultureInfo.InvariantCulture);
        }

        private static string FormatVtt(TimeSpan value)
        {
            return value.ToString(@"hh\:mm\:ss\.fff", CultureInfo.InvariantCulture);
        }

        private static string FooterXml()
        {
            return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                   "<w:ftr xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">" +
                   ParagraphXml(FooterText, "20", true) +
                   "</w:ftr>";
        }

        private static string DocumentXml(MediaJob job)
        {
            StringBuilder body = new StringBuilder();
            body.Append(ParagraphXml("My Sesi Metne Dönüştürme", "32", true));
            body.Append(ParagraphXml("Dosya: " + job.DisplayName, "24", false));
            body.Append(ParagraphXml("Tarih: " + DateTime.Now.ToString("dd.MM.yyyy HH:mm", CultureInfo.CurrentCulture), "22", false));
            body.Append(ParagraphXml("Süre: " + job.Duration + " | Dil: " + job.Language, "22", false));

            string[] lines = (job.Transcript ?? "").Replace("\r\n", "\n").Split('\n');
            foreach (string raw in lines)
            {
                string line = raw.Trim();
                if (line.Length == 0)
                {
                    body.Append(ParagraphXml("", "22", false));
                }
                else
                {
                    body.Append(ParagraphXml(line, "22", false));
                }
            }

            body.Append("<w:sectPr><w:footerReference w:type=\"default\" r:id=\"rIdFooter1\"/></w:sectPr>");

            return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
                   "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                   "<w:body>" + body.ToString() + "</w:body></w:document>";
        }

        private static string ParagraphXml(string text, string fontSizeHalfPoints, bool bold)
        {
            string boldXml = bold ? "<w:b/>" : "";
            return "<w:p><w:r><w:rPr>" + boldXml + "<w:sz w:val=\"" + fontSizeHalfPoints + "\"/></w:rPr><w:t xml:space=\"preserve\">" +
                   EscapeXml(text) + "</w:t></w:r></w:p>";
        }

        private static string EscapeXml(string value)
        {
            if (value == null) return "";
            return SecurityElementEscape(value);
        }

        private static string SecurityElementEscape(string value)
        {
            return value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&apos;");
        }

        private class Cue
        {
            public TimeSpan Start;
            public TimeSpan End;
            public string Text;
        }
    }

    internal static class SimplePdfWriter
    {
        public static void Write(string path, string title, string header, string body, string footer)
        {
            List<string> lines = new List<string>();
            lines.Add(title);
            lines.Add("");
            AddWrapped(lines, header, 92);
            lines.Add("");
            AddWrapped(lines, body, 92);

            List<List<string>> pages = Paginate(lines, 46);
            List<string> objects = new List<string>();
            objects.Add("<< /Type /Catalog /Pages 2 0 R >>");
            objects.Add("");
            objects.Add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

            List<int> pageObjectIds = new List<int>();
            for (int i = 0; i < pages.Count; i++)
            {
                string stream = BuildPageStream(pages[i], footer, i + 1, pages.Count);
                int contentId = objects.Count + 1;
                objects.Add("<< /Length " + Encoding.ASCII.GetByteCount(stream).ToString(CultureInfo.InvariantCulture) + " >>\nstream\n" + stream + "\nendstream");
                int pageId = objects.Count + 1;
                objects.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents " + contentId.ToString(CultureInfo.InvariantCulture) + " 0 R >>");
                pageObjectIds.Add(pageId);
            }

            StringBuilder kids = new StringBuilder();
            foreach (int id in pageObjectIds)
            {
                kids.Append(id.ToString(CultureInfo.InvariantCulture)).Append(" 0 R ");
            }
            objects[1] = "<< /Type /Pages /Count " + pageObjectIds.Count.ToString(CultureInfo.InvariantCulture) + " /Kids [" + kids.ToString() + "] >>";

            using (FileStream fs = File.Create(path))
            {
                WriteAscii(fs, "%PDF-1.4\n");
                List<long> offsets = new List<long>();
                offsets.Add(0);
                for (int i = 0; i < objects.Count; i++)
                {
                    offsets.Add(fs.Position);
                    WriteAscii(fs, (i + 1).ToString(CultureInfo.InvariantCulture) + " 0 obj\n");
                    WriteAscii(fs, objects[i]);
                    WriteAscii(fs, "\nendobj\n");
                }
                long xref = fs.Position;
                WriteAscii(fs, "xref\n0 " + (objects.Count + 1).ToString(CultureInfo.InvariantCulture) + "\n");
                WriteAscii(fs, "0000000000 65535 f \n");
                for (int i = 1; i < offsets.Count; i++)
                {
                    WriteAscii(fs, offsets[i].ToString("0000000000", CultureInfo.InvariantCulture) + " 00000 n \n");
                }
                WriteAscii(fs, "trailer\n<< /Size " + (objects.Count + 1).ToString(CultureInfo.InvariantCulture) + " /Root 1 0 R >>\nstartxref\n");
                WriteAscii(fs, xref.ToString(CultureInfo.InvariantCulture) + "\n%%EOF");
            }
        }

        private static void AddWrapped(List<string> lines, string text, int maxChars)
        {
            if (String.IsNullOrEmpty(text)) return;
            string[] rawLines = text.Replace("\r\n", "\n").Split('\n');
            foreach (string raw in rawLines)
            {
                string line = raw.Trim();
                if (line.Length == 0)
                {
                    lines.Add("");
                    continue;
                }
                while (line.Length > maxChars)
                {
                    int breakAt = line.LastIndexOf(' ', Math.Min(maxChars, line.Length - 1));
                    if (breakAt < 20) breakAt = Math.Min(maxChars, line.Length);
                    lines.Add(line.Substring(0, breakAt).Trim());
                    line = line.Substring(breakAt).Trim();
                }
                lines.Add(line);
            }
        }

        private static List<List<string>> Paginate(List<string> lines, int perPage)
        {
            List<List<string>> pages = new List<List<string>>();
            List<string> current = new List<string>();
            foreach (string line in lines)
            {
                if (current.Count >= perPage)
                {
                    pages.Add(current);
                    current = new List<string>();
                }
                current.Add(line);
            }
            if (current.Count > 0) pages.Add(current);
            if (pages.Count == 0) pages.Add(new List<string>());
            return pages;
        }

        private static string BuildPageStream(List<string> lines, string footer, int page, int pageCount)
        {
            StringBuilder content = new StringBuilder();
            content.AppendLine("BT");
            content.AppendLine("/F1 10 Tf");
            content.AppendLine("50 790 Td");
            content.AppendLine("14 TL");
            foreach (string line in lines)
            {
                content.Append("(").Append(EscapePdf(Transliterate(line))).AppendLine(") Tj");
                content.AppendLine("T*");
            }
            content.AppendLine("ET");
            content.AppendLine("BT /F1 8 Tf 50 36 Td (" + EscapePdf(Transliterate(footer)) + ") Tj ET");
            content.AppendLine("BT /F1 8 Tf 520 36 Td (" + page.ToString(CultureInfo.InvariantCulture) + "/" + pageCount.ToString(CultureInfo.InvariantCulture) + ") Tj ET");
            return content.ToString();
        }

        private static string EscapePdf(string value)
        {
            if (value == null) return "";
            return value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
        }

        private static string Transliterate(string value)
        {
            if (value == null) return "";
            return value
                .Replace("Ç", "C").Replace("ç", "c")
                .Replace("Ğ", "G").Replace("ğ", "g")
                .Replace("İ", "I").Replace("ı", "i")
                .Replace("Ö", "O").Replace("ö", "o")
                .Replace("Ş", "S").Replace("ş", "s")
                .Replace("Ü", "U").Replace("ü", "u")
                .Replace("©", "(c)");
        }

        private static void WriteAscii(Stream stream, string text)
        {
            byte[] bytes = Encoding.ASCII.GetBytes(text);
            stream.Write(bytes, 0, bytes.Length);
        }
    }
}
