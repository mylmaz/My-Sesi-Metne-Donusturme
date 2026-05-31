using System;
using System.Windows;

namespace MySesiMetneDonusturme
{
    public class App : Application
    {
        [STAThread]
        public static void Main()
        {
            Logger.Info("Uygulama baslatiliyor.");
            App app = new App();
            app.DispatcherUnhandledException += delegate(object sender, System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
            {
                Logger.Error("Beklenmeyen arayuz hatasi", e.Exception);
                MessageBox.Show("Beklenmeyen bir hata olustu. Ayrintilar logs klasorune yazildi.", "My Sesi Metne Donusturme", MessageBoxButton.OK, MessageBoxImage.Error);
                e.Handled = true;
            };
            AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e)
            {
                Exception ex = e.ExceptionObject as Exception;
                if (ex != null)
                {
                    Logger.Error("Beklenmeyen sistem hatasi", ex);
                }
            };
            app.Run(new MainWindow());
        }
    }
}
