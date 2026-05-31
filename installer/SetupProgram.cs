using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

namespace MySesiMetneDonusturmeSetup
{
    internal static class SetupProgram
    {
        private const string AppName = "My Sesi Metne Donusturme";
        private const string ExeName = "MySesiMetneDonusturme.exe";

        [STAThread]
        private static void Main()
        {
            try
            {
                string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                string installDir = Path.Combine(programFiles, AppName);
                Directory.CreateDirectory(installDir);

                ExtractPayload(installDir);
                string appExe = Path.Combine(installDir, ExeName);
                CreateShortcuts(appExe, installDir);

                DialogResult result = MessageBox.Show(
                    "Kurulum tamamlandı.\n\nProgram Files içine kuruldu ve kısayollar oluşturuldu.\n\nUygulama şimdi açılsın mı?",
                    AppName,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Information);

                if (result == DialogResult.Yes && File.Exists(appExe))
                {
                    System.Diagnostics.Process.Start(appExe);
                }
            }
            catch (UnauthorizedAccessException)
            {
                MessageBox.Show("Kurulum için yönetici izni gerekiyor. Lütfen setup dosyasını yönetici olarak çalıştırın.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Kurulum tamamlanamadı.\n\n" + ex.Message, AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void ExtractPayload(string installDir)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream payload = assembly.GetManifestResourceStream("Payload.zip"))
            {
                if (payload == null) throw new InvalidOperationException("Kurulum paketi içinde uygulama dosyaları bulunamadı.");
                using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string destination = Path.GetFullPath(Path.Combine(installDir, entry.FullName));
                        string safeRoot = Path.GetFullPath(installDir);
                        if (!destination.StartsWith(safeRoot, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidOperationException("Geçersiz kurulum paketi girdisi.");
                        }

                        if (String.IsNullOrEmpty(entry.Name))
                        {
                            Directory.CreateDirectory(destination);
                            continue;
                        }

                        string directory = Path.GetDirectoryName(destination);
                        if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
                        if (File.Exists(destination)) File.Delete(destination);

                        using (Stream input = entry.Open())
                        using (FileStream output = File.Create(destination))
                        {
                            input.CopyTo(output);
                        }
                    }
                }
            }
        }

        private static void CreateShortcuts(string appExe, string installDir)
        {
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            string startMenuFolder = Path.Combine(programs, AppName);
            Directory.CreateDirectory(startMenuFolder);

            CreateShortcut(Path.Combine(desktop, AppName + ".lnk"), appExe, installDir);
            CreateShortcut(Path.Combine(startMenuFolder, AppName + ".lnk"), appExe, installDir);
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;

            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
            shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { "My Sesi Metne Donusturme" });
            shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ",0" });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
    }
}
