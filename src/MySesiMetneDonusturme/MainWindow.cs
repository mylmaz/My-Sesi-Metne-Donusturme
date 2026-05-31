using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MySesiMetneDonusturme
{
    public class MainWindow : Window
    {
        private readonly SettingsService _settingsService;
        private readonly HistoryService _historyService;
        private readonly DependencyService _dependencyService;
        private readonly ProcessRunner _processRunner;
        private readonly TranscriptionService _transcriptionService;
        private readonly ExportService _exportService;
        private readonly YouTubeService _youTubeService;
        private readonly ObservableCollection<MediaJob> _jobs;

        private AppSettings _settings;
        private ContentControl _content;
        private TextBlock _titleText;
        private TextBlock _statusText;
        private DataGrid _jobsGrid;
        private TextBox _transcriptBox;
        private TextBox _searchBox;
        private TextBox _replaceBox;
        private ComboBox _languageCombo;
        private ComboBox _modelCombo;
        private CheckBox _timestampsCheck;
        private CheckBox _paragraphCheck;
        private CheckBox _fillersCheck;
        private CheckBox _punctuationCheck;
        private CheckBox _splitCheck;
        private CheckBox _silenceCheck;
        private TextBox _youtubeUrlBox;
        private TextBlock _youtubeTitle;
        private TextBlock _youtubeDuration;
        private Image _youtubeThumb;
        private TextBox _outputFolderBox;
        private YouTubeMetadata _currentMetadata;
        private CancellationTokenSource _cancelSource;

        private readonly Brush _pageBackground;
        private readonly Brush _panelBackground;
        private readonly Brush _softPanelBackground;
        private readonly Brush _textBrush;
        private readonly Brush _mutedBrush;
        private readonly Brush _accentBrush;

        public MainWindow()
        {
            _settingsService = new SettingsService();
            _historyService = new HistoryService();
            _dependencyService = new DependencyService();
            _processRunner = new ProcessRunner();
            _transcriptionService = new TranscriptionService(_dependencyService, _processRunner, _historyService);
            _exportService = new ExportService();
            _youTubeService = new YouTubeService(_dependencyService, _processRunner);
            _jobs = new ObservableCollection<MediaJob>();
            _settings = _settingsService.Load();

            _pageBackground = new SolidColorBrush(Color.FromRgb(9, 14, 29));
            _panelBackground = new SolidColorBrush(Color.FromRgb(16, 24, 43));
            _softPanelBackground = new SolidColorBrush(Color.FromRgb(27, 39, 66));
            _textBrush = new SolidColorBrush(Color.FromRgb(241, 245, 249));
            _mutedBrush = new SolidColorBrush(Color.FromRgb(166, 180, 205));
            _accentBrush = new SolidColorBrush(Color.FromRgb(56, 189, 248));

            Title = "My Sesi Metne Dönüştürme";
            Width = 1280;
            Height = 820;
            MinWidth = 1040;
            MinHeight = 680;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            FontFamily = new FontFamily("Segoe UI");
            Background = _pageBackground;
            Foreground = _textBrush;
            Icon = CreateWindowIcon();

            Content = BuildShell();
            AllowDrop = true;
            DragOver += OnDragOver;
            Drop += OnDrop;
            Loaded += delegate { ShowOnboardingIfNeeded(); };
            Closing += delegate { SaveSettingsFromControls(); };
            ShowHome();
            UpdateStatus("Hazır");
        }

        private UIElement BuildShell()
        {
            Grid root = new Grid();
            root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(235) });
            root.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            Border sidebar = new Border();
            sidebar.Background = CreateSidebarBrush();
            sidebar.Padding = new Thickness(18, 20, 18, 18);
            Grid.SetColumn(sidebar, 0);
            root.Children.Add(sidebar);

            DockPanel sidePanel = new DockPanel();
            sidebar.Child = sidePanel;

            StackPanel footer = new StackPanel();
            DockPanel.SetDock(footer, Dock.Bottom);
            footer.Children.Add(CreateSmallText("Ücretsiz"));
            footer.Children.Add(CreateSmallText("Reklamsız"));
            footer.Children.Add(CreateSmallText("Sınırsız kullanım"));
            sidePanel.Children.Add(footer);

            StackPanel nav = new StackPanel();
            sidePanel.Children.Add(nav);
            nav.Children.Add(CreateLogo());
            nav.Children.Add(CreateSidebarButton("Ana Sayfa", delegate { ShowHome(); }));
            nav.Children.Add(CreateSidebarButton("Dosya Yükle", delegate { ShowFiles(); }));
            nav.Children.Add(CreateSidebarButton("YouTube Linki", delegate { ShowYouTube(); }));
            nav.Children.Add(CreateSidebarButton("İşlem Geçmişi", delegate { ShowHistory(); }));
            nav.Children.Add(CreateSidebarButton("Ayarlar", delegate { ShowSettings(); }));
            nav.Children.Add(CreateSidebarButton("Hakkında", delegate { ShowAbout(); }));

            Grid main = new Grid();
            main.RowDefinitions.Add(new RowDefinition { Height = new GridLength(84) });
            main.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            main.RowDefinitions.Add(new RowDefinition { Height = new GridLength(34) });
            Grid.SetColumn(main, 1);
            root.Children.Add(main);

            Border header = new Border();
            header.Padding = new Thickness(26, 18, 26, 12);
            header.Background = new SolidColorBrush(Color.FromRgb(11, 18, 32));
            Grid.SetRow(header, 0);
            main.Children.Add(header);

            Grid headerGrid = new Grid();
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            header.Child = headerGrid;

            StackPanel headerText = new StackPanel();
            _titleText = new TextBlock();
            _titleText.FontSize = 26;
            _titleText.FontWeight = FontWeights.SemiBold;
            _titleText.Foreground = _textBrush;
            headerText.Children.Add(_titleText);
            headerText.Children.Add(CreateMutedText("Reklamsız, ücretsiz ve sınırsız ses metne dönüştürme deneyimi."));
            headerGrid.Children.Add(headerText);

            StackPanel badges = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            badges.Children.Add(CreateBadge("Yerel"));
            badges.Children.Add(CreateBadge("Gizli"));
            badges.Children.Add(CreateBadge("AI"));
            Grid.SetColumn(badges, 1);
            headerGrid.Children.Add(badges);

            _content = new ContentControl();
            Grid.SetRow(_content, 1);
            main.Children.Add(_content);

            Border status = new Border();
            status.Background = new SolidColorBrush(Color.FromRgb(8, 12, 24));
            status.Padding = new Thickness(26, 6, 26, 6);
            _statusText = CreateMutedText("");
            status.Child = _statusText;
            Grid.SetRow(status, 2);
            main.Children.Add(status);

            return root;
        }

        private void ShowHome()
        {
            SetTitle("Ana Sayfa");
            ScrollViewer scroll = PageScroll();
            StackPanel panel = PageStack();

            TextBlock headline = new TextBlock();
            headline.Text = "My Sesi Metne Dönüştürme";
            headline.FontSize = 34;
            headline.FontWeight = FontWeights.Bold;
            headline.Foreground = _textBrush;
            headline.Margin = new Thickness(0, 0, 0, 8);
            panel.Children.Add(headline);

            TextBlock intro = CreateMutedText("Ses, video ve izinli YouTube içeriklerini yerel araçlarla zaman damgalı metne dönüştürün. Dosyalar varsayılan olarak bilgisayarınızdan dışarı gönderilmez.");
            intro.FontSize = 16;
            intro.TextWrapping = TextWrapping.Wrap;
            intro.Margin = new Thickness(0, 0, 0, 22);
            panel.Children.Add(intro);

            UniformGrid cards = new UniformGrid { Columns = 2, Margin = new Thickness(0, 0, 0, 22) };
            cards.Children.Add(HomeCard("Ses & Video Dosyalarını Metne Çevir", "MP3, M4A, WAV, MP4, MKV ve daha fazlası."));
            cards.Children.Add(HomeCard("YouTube Linklerinden Transkripsiyon", "Sadece indirme hakkınız olan içerikler için."));
            cards.Children.Add(HomeCard("PDF, Word ve TXT Olarak İndir", "DOCX, SRT ve VTT çıktıları da hazır."));
            cards.Children.Add(HomeCard("Zaman Damgalı Akıllı Metin", "[00:00:00] biçiminde düzenlenebilir metin."));
            panel.Children.Add(cards);

            StackPanel actions = new StackPanel { Orientation = Orientation.Horizontal };
            actions.Children.Add(CreatePrimaryButton("Dosya ekle", delegate { ShowFiles(); AddFilesFromDialog(); }));
            actions.Children.Add(CreateGhostButton("YouTube linki", delegate { ShowYouTube(); }));
            actions.Children.Add(CreateGhostButton("Ayarları kontrol et", delegate { ShowSettings(); }));
            panel.Children.Add(actions);

            panel.Children.Add(DependencySummaryCard());

            scroll.Content = panel;
            _content.Content = scroll;
        }

        private void ShowFiles()
        {
            SetTitle("Dosya Yükle");
            Grid page = new Grid { Margin = new Thickness(26) };
            page.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            page.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            page.RowDefinitions.Add(new RowDefinition { Height = new GridLength(260) });

            Border top = PanelBorder();
            top.Padding = new Thickness(16);
            Grid.SetRow(top, 0);
            page.Children.Add(top);

            Grid topGrid = new Grid();
            topGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            topGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            top.Child = topGrid;

            StackPanel options = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            _languageCombo = Combo(new string[] { "Türkçe", "Otomatik Algıla", "İngilizce", "Almanca", "Arapça" }, _settings.DefaultLanguage);
            _modelCombo = Combo(new string[] { "Hızlı", "Dengeli", "Yüksek Doğruluk" }, _settings.DefaultModel);
            options.Children.Add(Labeled("Dil", _languageCombo, 150));
            options.Children.Add(Labeled("Model", _modelCombo, 160));
            _timestampsCheck = Check("Zaman damgası", _settings.TimestampsEnabled);
            _paragraphCheck = Check("Paragraf", _settings.ParagraphMode);
            _fillersCheck = Check("Dolgu temizle", _settings.RemoveFillers);
            _punctuationCheck = Check("Noktalama", _settings.ImprovePunctuation);
            _splitCheck = Check("Bölümlere ayır", _settings.SplitLongFiles);
            _silenceCheck = Check("Sessizliği azalt", _settings.ReduceSilence);
            options.Children.Add(_timestampsCheck);
            options.Children.Add(_paragraphCheck);
            options.Children.Add(_fillersCheck);
            options.Children.Add(_punctuationCheck);
            options.Children.Add(_splitCheck);
            options.Children.Add(_silenceCheck);
            topGrid.Children.Add(options);

            StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            buttons.Children.Add(CreatePrimaryButton("Dosya seç", delegate { AddFilesFromDialog(); }));
            buttons.Children.Add(CreateGhostButton("Başlat", async delegate { await StartQueueAsync(); }));
            buttons.Children.Add(CreateGhostButton("İptal", delegate { CancelWork(); }));
            buttons.Children.Add(CreateGhostButton("Klasörü aç", delegate { OpenFolder(GetOutputFolder()); }));
            Grid.SetColumn(buttons, 1);
            topGrid.Children.Add(buttons);

            Grid middle = new Grid { Margin = new Thickness(0, 14, 0, 14) };
            middle.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(3, GridUnitType.Star) });
            middle.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2, GridUnitType.Star) });
            Grid.SetRow(middle, 1);
            page.Children.Add(middle);

            Border listPanel = PanelBorder();
            listPanel.Padding = new Thickness(12);
            _jobsGrid = BuildJobsGrid();
            listPanel.Child = _jobsGrid;
            Grid.SetColumn(listPanel, 0);
            middle.Children.Add(listPanel);

            Border help = PanelBorder();
            help.Margin = new Thickness(14, 0, 0, 0);
            help.Padding = new Thickness(18);
            StackPanel helpStack = new StackPanel();
            helpStack.Children.Add(SectionTitle("Desteklenen formatlar"));
            helpStack.Children.Add(WrapText("mp3, mp4, mpeg, mpga, m4a, wav, webm, mov, aac, ogg, opus, wma, wmv, avi, flac, mkv"));
            helpStack.Children.Add(SectionTitle("Gizlilik"));
            helpStack.Children.Add(WrapText("Varsayılan işlem yereldir. Bulut API, abonelik, kota ya da reklam sistemi kullanılmaz."));
            helpStack.Children.Add(SectionTitle("Araç durumu"));
            helpStack.Children.Add(DependencySummarySmall());
            help.Child = helpStack;
            Grid.SetColumn(help, 1);
            middle.Children.Add(help);

            Border editorPanel = PanelBorder();
            editorPanel.Padding = new Thickness(12);
            Grid.SetRow(editorPanel, 2);
            page.Children.Add(editorPanel);
            editorPanel.Child = BuildTranscriptEditor();

            _content.Content = page;
            if (_jobs.Count > 0 && _jobsGrid.SelectedItem == null)
            {
                _jobsGrid.SelectedIndex = 0;
            }
        }

        private void ShowYouTube()
        {
            SetTitle("YouTube Linki");
            ScrollViewer scroll = PageScroll();
            StackPanel panel = PageStack();

            Border warning = PanelBorder();
            warning.Padding = new Thickness(16);
            warning.Margin = new Thickness(0, 0, 0, 14);
            warning.Child = WrapText("Telif hakkı ve kullanım izni size ait olmayan içerikleri indirmeyin ya da metne dönüştürmeyin. Bu özellik yalnızca hakkınız olan içerikler için tasarlanmıştır.");
            panel.Children.Add(warning);

            Border inputPanel = PanelBorder();
            inputPanel.Padding = new Thickness(18);
            panel.Children.Add(inputPanel);

            Grid grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            inputPanel.Child = grid;

            _youtubeUrlBox = new TextBox();
            _youtubeUrlBox.MinHeight = 36;
            _youtubeUrlBox.Margin = new Thickness(0, 0, 10, 0);
            _youtubeUrlBox.FontSize = 14;
            _youtubeUrlBox.Text = "";
            _youtubeUrlBox.ToolTip = "YouTube bağlantısı";
            Grid.SetColumn(_youtubeUrlBox, 0);
            grid.Children.Add(_youtubeUrlBox);

            StackPanel ytButtons = new StackPanel { Orientation = Orientation.Horizontal };
            ytButtons.Children.Add(CreatePrimaryButton("Bilgi getir", async delegate { await LoadYouTubeMetadataAsync(); }));
            ytButtons.Children.Add(CreateGhostButton("Metne dönüştür", async delegate { await TranscribeYouTubeAsync(); }));
            Grid.SetColumn(ytButtons, 1);
            grid.Children.Add(ytButtons);

            Border info = PanelBorder();
            info.Padding = new Thickness(16);
            info.Margin = new Thickness(0, 16, 0, 0);
            Grid.SetRow(info, 1);
            Grid.SetColumnSpan(info, 2);
            grid.Children.Add(info);

            Grid infoGrid = new Grid();
            infoGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(160) });
            infoGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            info.Child = infoGrid;

            _youtubeThumb = new Image { Width = 140, Height = 80, Stretch = Stretch.UniformToFill, Margin = new Thickness(0, 0, 16, 0) };
            Border thumbShell = new Border { Background = _softPanelBackground, CornerRadius = new CornerRadius(6), Child = _youtubeThumb };
            infoGrid.Children.Add(thumbShell);

            StackPanel meta = new StackPanel();
            _youtubeTitle = SectionTitle("Video bilgisi bekleniyor");
            _youtubeDuration = CreateMutedText("Süre: -");
            meta.Children.Add(_youtubeTitle);
            meta.Children.Add(_youtubeDuration);
            meta.Children.Add(WrapText("Bağlantı okunduğunda başlık, süre ve varsa küçük görsel burada görünür."));
            Grid.SetColumn(meta, 1);
            infoGrid.Children.Add(meta);

            scroll.Content = panel;
            _content.Content = scroll;
        }

        private void ShowHistory()
        {
            SetTitle("İşlem Geçmişi");
            Grid page = new Grid { Margin = new Thickness(26) };
            page.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            page.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            StackPanel buttons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 12) };
            buttons.Children.Add(CreatePrimaryButton("Yenile", delegate { ShowHistory(); }));
            buttons.Children.Add(CreateGhostButton("Eski metni aç", delegate { OpenSelectedHistory(); }));
            buttons.Children.Add(CreateGhostButton("Klasörde göster", delegate { OpenSelectedHistoryFolder(); }));
            buttons.Children.Add(CreateGhostButton("Geçmişi temizle", delegate { ClearHistory(); }));
            Grid.SetRow(buttons, 0);
            page.Children.Add(buttons);

            Border panel = PanelBorder();
            panel.Padding = new Thickness(12);
            Grid.SetRow(panel, 1);
            page.Children.Add(panel);

            DataGrid grid = new DataGrid();
            grid.AutoGenerateColumns = false;
            grid.IsReadOnly = true;
            grid.SelectionMode = DataGridSelectionMode.Single;
            grid.HeadersVisibility = DataGridHeadersVisibility.Column;
            grid.Background = Brushes.Transparent;
            grid.Foreground = _textBrush;
            grid.RowBackground = new SolidColorBrush(Color.FromRgb(20, 31, 54));
            grid.AlternatingRowBackground = new SolidColorBrush(Color.FromRgb(24, 36, 62));
            grid.GridLinesVisibility = DataGridGridLinesVisibility.None;
            grid.Columns.Add(TextColumn("Dosya", "FileName", 2));
            grid.Columns.Add(TextColumn("Tarih", "CreatedAt", 1));
            grid.Columns.Add(TextColumn("Süre", "Duration", 1));
            grid.Columns.Add(TextColumn("Durum", "State", 1));
            grid.Columns.Add(TextColumn("Çıktı", "OutputPath", 3));
            grid.ItemsSource = _historyService.Load();
            panel.Child = grid;
            grid.Name = "HistoryGrid";
            grid.Tag = "history";
            _content.Content = page;
        }

        private void ShowSettings()
        {
            SetTitle("Ayarlar");
            ScrollViewer scroll = PageScroll();
            StackPanel panel = PageStack();

            Border form = PanelBorder();
            form.Padding = new Thickness(18);
            panel.Children.Add(form);

            StackPanel stack = new StackPanel();
            form.Child = stack;
            stack.Children.Add(SectionTitle("Varsayılanlar"));

            _outputFolderBox = new TextBox { Text = _settings.OutputFolder, MinHeight = 34, Margin = new Thickness(0, 4, 8, 10) };
            StackPanel folderRow = new StackPanel { Orientation = Orientation.Horizontal };
            folderRow.Children.Add(new Border { Width = 620, Child = _outputFolderBox });
            folderRow.Children.Add(CreateGhostButton("Klasör seç", delegate { ChooseOutputFolder(); }));
            stack.Children.Add(LabeledBlock("Çıktı klasörü", folderRow));

            ComboBox settingsLanguage = Combo(new string[] { "Türkçe", "Otomatik Algıla", "İngilizce", "Almanca", "Arapça" }, _settings.DefaultLanguage);
            ComboBox settingsModel = Combo(new string[] { "Hızlı", "Dengeli", "Yüksek Doğruluk" }, _settings.DefaultModel);
            stack.Children.Add(LabeledBlock("Varsayılan dil", settingsLanguage));
            stack.Children.Add(LabeledBlock("Varsayılan model", settingsModel));

            CheckBox dark = Check("Koyu tema", _settings.DarkTheme);
            CheckBox autosave = Check("Otomatik kaydetme", _settings.AutoSave);
            CheckBox timestamps = Check("Zaman damgası varsayılan açık", _settings.TimestampsEnabled);
            stack.Children.Add(dark);
            stack.Children.Add(autosave);
            stack.Children.Add(timestamps);

            StackPanel settingButtons = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 12, 0, 0) };
            settingButtons.Children.Add(CreatePrimaryButton("Kaydet", delegate
            {
                _settings.OutputFolder = _outputFolderBox.Text;
                _settings.DefaultLanguage = Convert.ToString(settingsLanguage.SelectedItem);
                _settings.DefaultModel = Convert.ToString(settingsModel.SelectedItem);
                _settings.DarkTheme = dark.IsChecked == true;
                _settings.AutoSave = autosave.IsChecked == true;
                _settings.TimestampsEnabled = timestamps.IsChecked == true;
                _settingsService.Save(_settings);
                UpdateStatus("Ayarlar kaydedildi");
            }));
            settingButtons.Children.Add(CreateGhostButton("Çıktı klasörünü aç", delegate { OpenFolder(_settings.OutputFolder); }));
            stack.Children.Add(settingButtons);

            Border deps = PanelBorder();
            deps.Padding = new Thickness(18);
            deps.Margin = new Thickness(0, 16, 0, 0);
            panel.Children.Add(deps);
            StackPanel depStack = new StackPanel();
            deps.Child = depStack;
            depStack.Children.Add(SectionTitle("Başlangıç araç kontrolü"));
            depStack.Children.Add(DependencyGrid());
            depStack.Children.Add(CreateGhostButton("Tekrar kontrol et", delegate { ShowSettings(); }));

            scroll.Content = panel;
            _content.Content = scroll;
        }

        private void ShowAbout()
        {
            SetTitle("Hakkında");
            ScrollViewer scroll = PageScroll();
            StackPanel panel = PageStack();
            Border card = PanelBorder();
            card.Padding = new Thickness(22);
            panel.Children.Add(card);
            StackPanel content = new StackPanel();
            card.Child = content;

            TextBlock name = new TextBlock { Text = "My Sesi Metne Dönüştürme", FontSize = 30, FontWeight = FontWeights.Bold, Foreground = _textBrush, Margin = new Thickness(0, 0, 0, 8) };
            content.Children.Add(name);
            content.Children.Add(WrapText("Ses ve video dosyalarını yapay zekâ destekli olarak zaman damgalı metne dönüştüren Windows masaüstü uygulaması."));
            content.Children.Add(InfoLine("Geliştirici", "Mustafa Yılmaz"));
            content.Children.Add(InfoLine("Yıl", "2026"));
            content.Children.Add(InfoLine("Versiyon", "1.0.0"));
            content.Children.Add(InfoLine("Telif", "© 2026 Mustafa Yılmaz. Tüm hakları saklıdır."));
            content.Children.Add(WrapText("Bu uygulama Mustafa Yılmaz tarafından ücretsiz, reklamsız ve sınırsız kullanım amacıyla geliştirilmiştir."));
            content.Children.Add(WrapText("Sınırsız kullanım bilgisayarın işlemci gücü, RAM kapasitesi, disk alanı ve yerel model performansıyla sınırlı olabilir; uygulama içinde bilinçli kota yoktur."));

            scroll.Content = panel;
            _content.Content = scroll;
        }

        private DataGrid BuildJobsGrid()
        {
            DataGrid grid = new DataGrid();
            grid.AutoGenerateColumns = false;
            grid.IsReadOnly = true;
            grid.SelectionMode = DataGridSelectionMode.Single;
            grid.HeadersVisibility = DataGridHeadersVisibility.Column;
            grid.Background = Brushes.Transparent;
            grid.Foreground = _textBrush;
            grid.RowBackground = new SolidColorBrush(Color.FromRgb(20, 31, 54));
            grid.AlternatingRowBackground = new SolidColorBrush(Color.FromRgb(24, 36, 62));
            grid.GridLinesVisibility = DataGridGridLinesVisibility.None;
            grid.Columns.Add(TextColumn("Ad", "DisplayName", 2));
            grid.Columns.Add(TextColumn("Süre", "Duration", 1));
            grid.Columns.Add(TextColumn("Boyut", "SizeText", 1));
            grid.Columns.Add(TextColumn("Format", "Format", 1));
            grid.Columns.Add(TextColumn("Durum", "StateText", 1));
            grid.Columns.Add(ProgressColumn());
            grid.ItemsSource = _jobs;
            grid.SelectionChanged += delegate { LoadSelectedTranscript(); };
            return grid;
        }

        private Grid BuildTranscriptEditor()
        {
            Grid grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            StackPanel toolbar = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 10) };
            _searchBox = new TextBox { Width = 160, MinHeight = 30, Margin = new Thickness(0, 0, 8, 0), ToolTip = "Kelime bul" };
            _replaceBox = new TextBox { Width = 160, MinHeight = 30, Margin = new Thickness(0, 0, 8, 0), ToolTip = "Değiştir" };
            toolbar.Children.Add(_searchBox);
            toolbar.Children.Add(CreateGhostButton("Bul", delegate { FindInTranscript(); }));
            toolbar.Children.Add(_replaceBox);
            toolbar.Children.Add(CreateGhostButton("Değiştir", delegate { ReplaceInTranscript(); }));
            toolbar.Children.Add(CreateGhostButton("Tümünü kopyala", delegate { CopyTranscript(); }));
            toolbar.Children.Add(CreateGhostButton("PDF İndir", delegate { ExportSelected("pdf"); }));
            toolbar.Children.Add(CreateGhostButton("Word İndir", delegate { ExportSelected("docx"); }));
            toolbar.Children.Add(CreateGhostButton("TXT İndir", delegate { ExportSelected("txt"); }));
            toolbar.Children.Add(CreateGhostButton("SRT", delegate { ExportSelected("srt"); }));
            toolbar.Children.Add(CreateGhostButton("VTT", delegate { ExportSelected("vtt"); }));
            Grid.SetRow(toolbar, 0);
            grid.Children.Add(toolbar);

            _transcriptBox = new TextBox();
            _transcriptBox.AcceptsReturn = true;
            _transcriptBox.AcceptsTab = true;
            _transcriptBox.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            _transcriptBox.HorizontalScrollBarVisibility = ScrollBarVisibility.Auto;
            _transcriptBox.TextWrapping = TextWrapping.Wrap;
            _transcriptBox.FontFamily = new FontFamily("Consolas");
            _transcriptBox.FontSize = 14;
            _transcriptBox.Background = new SolidColorBrush(Color.FromRgb(7, 12, 24));
            _transcriptBox.Foreground = _textBrush;
            _transcriptBox.BorderBrush = new SolidColorBrush(Color.FromRgb(51, 65, 85));
            _transcriptBox.TextChanged += delegate
            {
                MediaJob job = SelectedJob();
                if (job != null) job.Transcript = _transcriptBox.Text;
            };
            Grid.SetRow(_transcriptBox, 1);
            grid.Children.Add(_transcriptBox);
            return grid;
        }

        private async void AddMediaFile(string filePath)
        {
            if (String.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath)) return;
            if (!IsSupported(filePath))
            {
                MessageBox.Show("Bu dosya formatı desteklenmiyor.", "Dosya yükle", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            FileInfo info = new FileInfo(filePath);
            MediaJob job = new MediaJob();
            job.SourceType = JobSourceType.Dosya;
            job.SourcePath = filePath;
            job.DisplayName = info.Name;
            job.Format = info.Extension.TrimStart('.').ToUpperInvariant();
            job.SizeText = FormatSize(info.Length);
            job.Language = _settings.DefaultLanguage;
            _jobs.Add(job);
            UpdateStatus("Dosya eklendi: " + info.Name);
            try
            {
                job.Duration = await _dependencyService.GetDurationAsync(filePath);
            }
            catch
            {
                job.Duration = "Bilinmiyor";
            }
        }

        private void AddFilesFromDialog()
        {
            OpenFileDialog dialog = new OpenFileDialog();
            dialog.Multiselect = true;
            dialog.Filter = "Ses ve video dosyaları|*.mp3;*.mp4;*.mpeg;*.mpga;*.m4a;*.wav;*.webm;*.mov;*.aac;*.ogg;*.opus;*.wma;*.wmv;*.avi;*.flac;*.mkv|Tüm dosyalar|*.*";
            if (dialog.ShowDialog(this) == true)
            {
                foreach (string file in dialog.FileNames)
                {
                    AddMediaFile(file);
                }
                ShowFiles();
            }
        }

        private async Task StartQueueAsync()
        {
            if (_jobs.Count == 0)
            {
                MessageBox.Show("Önce bir dosya ekleyin.", "Başlat", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            if (_cancelSource != null)
            {
                MessageBox.Show("Devam eden bir işlem var.", "Başlat", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            SaveSettingsFromControls();
            _cancelSource = new CancellationTokenSource();
            try
            {
                foreach (MediaJob job in _jobs.ToList())
                {
                    if (job.State == JobState.Tamamlandi) continue;
                    await RunSingleJobAsync(job, _cancelSource.Token);
                }
            }
            finally
            {
                _cancelSource = null;
            }
        }

        private async Task RunSingleJobAsync(MediaJob job, CancellationToken token)
        {
            try
            {
                if (_jobsGrid != null) _jobsGrid.SelectedItem = job;
                TranscriptionOptions options = CurrentOptions();
                job.Language = options.Language;
                IProgress<int> progress = new Progress<int>(delegate(int value)
                {
                    job.Progress = value;
                    UpdateStatus(job.DisplayName + " işleniyor: " + value.ToString() + "%");
                });
                await _transcriptionService.TranscribeFileAsync(job, options, progress, token);
                if (_transcriptBox != null && SelectedJob() == job) _transcriptBox.Text = job.Transcript;
                UpdateStatus("İşlem tamamlandı: " + job.DisplayName);
                MessageBox.Show("Transkripsiyon tamamlandı.", "Başarılı", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (OperationCanceledException)
            {
                job.State = JobState.IptalEdildi;
                job.ErrorMessage = "İşlem iptal edildi.";
                UpdateStatus("İşlem iptal edildi");
            }
            catch (UserVisibleException ex)
            {
                job.State = JobState.Hata;
                job.ErrorMessage = ex.Message;
                Logger.Error("Kullaniciya gosterilen hata", ex);
                MessageBox.Show(ex.Message, "İşlem yapılamadı", MessageBoxButton.OK, MessageBoxImage.Warning);
                UpdateStatus("Hata: " + ex.Message);
            }
            catch (Exception ex)
            {
                job.State = JobState.Hata;
                job.ErrorMessage = "Beklenmeyen bir hata oluştu.";
                Logger.Error("Transkripsiyon hatasi", ex);
                MessageBox.Show("Beklenmeyen bir hata oluştu. Ayrıntılar logs klasörüne yazıldı.", "Hata", MessageBoxButton.OK, MessageBoxImage.Error);
                UpdateStatus("Beklenmeyen hata");
            }
        }

        private async Task LoadYouTubeMetadataAsync()
        {
            string url = _youtubeUrlBox == null ? "" : _youtubeUrlBox.Text.Trim();
            if (url.Length == 0)
            {
                MessageBox.Show("Lütfen YouTube bağlantısı yapıştırın.", "YouTube", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            try
            {
                UpdateStatus("YouTube bilgisi alınıyor");
                _currentMetadata = await _youTubeService.GetMetadataAsync(url, CancellationToken.None);
                _youtubeTitle.Text = _currentMetadata.Title;
                _youtubeDuration.Text = "Süre: " + _currentMetadata.Duration;
                if (!String.IsNullOrWhiteSpace(_currentMetadata.ThumbnailUrl))
                {
                    BitmapImage image = new BitmapImage();
                    image.BeginInit();
                    image.UriSource = new Uri(_currentMetadata.ThumbnailUrl, UriKind.Absolute);
                    image.CacheOption = BitmapCacheOption.OnLoad;
                    image.EndInit();
                    _youtubeThumb.Source = image;
                }
                UpdateStatus("Video bilgisi alındı");
            }
            catch (UserVisibleException ex)
            {
                MessageBox.Show(ex.Message, "YouTube", MessageBoxButton.OK, MessageBoxImage.Warning);
                UpdateStatus("YouTube bilgisi alınamadı");
            }
            catch (Exception ex)
            {
                Logger.Error("YouTube metadata hatasi", ex);
                MessageBox.Show("Video bilgisi alınamadı. Lütfen bağlantıyı kontrol edin.", "YouTube", MessageBoxButton.OK, MessageBoxImage.Warning);
                UpdateStatus("YouTube bilgisi alınamadı");
            }
        }

        private async Task TranscribeYouTubeAsync()
        {
            string url = _youtubeUrlBox == null ? "" : _youtubeUrlBox.Text.Trim();
            if (url.Length == 0)
            {
                MessageBox.Show("Lütfen YouTube bağlantısı yapıştırın.", "YouTube", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            MessageBoxResult consent = MessageBox.Show("Bu içeriği indirme ve metne dönüştürme hakkınız olduğunu onaylıyor musunuz?", "Telif ve izin uyarısı", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (consent != MessageBoxResult.Yes) return;

            if (_currentMetadata == null || !String.Equals(_currentMetadata.RawUrl, url, StringComparison.OrdinalIgnoreCase))
            {
                await LoadYouTubeMetadataAsync();
            }

            _cancelSource = new CancellationTokenSource();
            try
            {
                string work = Path.Combine(AppPaths.WorkRoot, "youtube_" + Guid.NewGuid().ToString("N"));
                UpdateStatus("YouTube sesi indiriliyor");
                string audio = await _youTubeService.DownloadAudioAsync(url, work, _cancelSource.Token);

                MediaJob job = new MediaJob();
                job.SourceType = JobSourceType.YouTube;
                job.SourcePath = audio;
                job.DisplayName = _currentMetadata == null ? "YouTube videosu" : _currentMetadata.Title;
                job.Duration = _currentMetadata == null ? "Bilinmiyor" : _currentMetadata.Duration;
                job.Format = "YOUTUBE";
                job.SizeText = FormatSize(new FileInfo(audio).Length);
                job.Language = _settings.DefaultLanguage;
                _jobs.Add(job);

                ShowFiles();
                if (_jobsGrid != null) _jobsGrid.SelectedItem = job;
                await RunSingleJobAsync(job, _cancelSource.Token);
            }
            finally
            {
                _cancelSource = null;
            }
        }

        private void CancelWork()
        {
            if (_cancelSource != null)
            {
                _cancelSource.Cancel();
                UpdateStatus("İptal isteği gönderildi");
            }
        }

        private void LoadSelectedTranscript()
        {
            if (_transcriptBox == null) return;
            MediaJob job = SelectedJob();
            _transcriptBox.Text = job == null ? "" : job.Transcript;
        }

        private MediaJob SelectedJob()
        {
            if (_jobsGrid == null) return null;
            return _jobsGrid.SelectedItem as MediaJob;
        }

        private TranscriptionOptions CurrentOptions()
        {
            TranscriptionOptions options = new TranscriptionOptions();
            options.Language = _languageCombo == null ? _settings.DefaultLanguage : Convert.ToString(_languageCombo.SelectedItem);
            options.Model = _modelCombo == null ? _settings.DefaultModel : Convert.ToString(_modelCombo.SelectedItem);
            options.TimestampsEnabled = _timestampsCheck == null ? _settings.TimestampsEnabled : _timestampsCheck.IsChecked == true;
            options.ParagraphMode = _paragraphCheck == null ? _settings.ParagraphMode : _paragraphCheck.IsChecked == true;
            options.RemoveFillers = _fillersCheck == null ? _settings.RemoveFillers : _fillersCheck.IsChecked == true;
            options.ImprovePunctuation = _punctuationCheck == null ? _settings.ImprovePunctuation : _punctuationCheck.IsChecked == true;
            options.SplitLongFiles = _splitCheck == null ? _settings.SplitLongFiles : _splitCheck.IsChecked == true;
            options.ReduceSilence = _silenceCheck == null ? _settings.ReduceSilence : _silenceCheck.IsChecked == true;
            options.OutputFolder = GetOutputFolder();
            return options;
        }

        private void SaveSettingsFromControls()
        {
            try
            {
                if (_languageCombo != null) _settings.DefaultLanguage = Convert.ToString(_languageCombo.SelectedItem);
                if (_modelCombo != null) _settings.DefaultModel = Convert.ToString(_modelCombo.SelectedItem);
                if (_timestampsCheck != null) _settings.TimestampsEnabled = _timestampsCheck.IsChecked == true;
                if (_paragraphCheck != null) _settings.ParagraphMode = _paragraphCheck.IsChecked == true;
                if (_fillersCheck != null) _settings.RemoveFillers = _fillersCheck.IsChecked == true;
                if (_punctuationCheck != null) _settings.ImprovePunctuation = _punctuationCheck.IsChecked == true;
                if (_splitCheck != null) _settings.SplitLongFiles = _splitCheck.IsChecked == true;
                if (_silenceCheck != null) _settings.ReduceSilence = _silenceCheck.IsChecked == true;
                if (_outputFolderBox != null) _settings.OutputFolder = _outputFolderBox.Text;
                _settingsService.Save(_settings);
            }
            catch
            {
            }
        }

        private string GetOutputFolder()
        {
            if (_outputFolderBox != null && !String.IsNullOrWhiteSpace(_outputFolderBox.Text)) return _outputFolderBox.Text;
            if (!String.IsNullOrWhiteSpace(_settings.OutputFolder)) return _settings.OutputFolder;
            return AppPaths.DefaultOutputRoot;
        }

        private void FindInTranscript()
        {
            if (_transcriptBox == null || _searchBox == null) return;
            string needle = _searchBox.Text;
            if (String.IsNullOrEmpty(needle)) return;
            int start = _transcriptBox.SelectionStart + _transcriptBox.SelectionLength;
            int index = _transcriptBox.Text.IndexOf(needle, start, StringComparison.CurrentCultureIgnoreCase);
            if (index < 0) index = _transcriptBox.Text.IndexOf(needle, StringComparison.CurrentCultureIgnoreCase);
            if (index >= 0)
            {
                _transcriptBox.Focus();
                _transcriptBox.Select(index, needle.Length);
            }
            else
            {
                MessageBox.Show("Aranan kelime bulunamadı.", "Bul", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void ReplaceInTranscript()
        {
            if (_transcriptBox == null || _searchBox == null || _replaceBox == null) return;
            string needle = _searchBox.Text;
            if (String.IsNullOrEmpty(needle)) return;
            if (_transcriptBox.SelectionLength > 0 && String.Equals(_transcriptBox.SelectedText, needle, StringComparison.CurrentCultureIgnoreCase))
            {
                _transcriptBox.SelectedText = _replaceBox.Text;
            }
            else
            {
                FindInTranscript();
            }
        }

        private void CopyTranscript()
        {
            if (_transcriptBox != null && _transcriptBox.Text.Length > 0)
            {
                Clipboard.SetText(_transcriptBox.Text);
                UpdateStatus("Metin kopyalandı");
            }
        }

        private void ExportSelected(string format)
        {
            MediaJob job = SelectedJob();
            if (job == null || String.IsNullOrWhiteSpace(job.Transcript))
            {
                MessageBox.Show("Dışa aktarmak için tamamlanmış bir metin seçin.", "Dışa aktar", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            try
            {
                string folder = GetOutputFolder();
                string path = "";
                if (format == "pdf") path = _exportService.ExportPdf(job, folder);
                if (format == "docx") path = _exportService.ExportDocx(job, folder);
                if (format == "txt") path = _exportService.ExportTxt(job, folder);
                if (format == "srt") path = _exportService.ExportSrt(job, folder);
                if (format == "vtt") path = _exportService.ExportVtt(job, folder);
                job.OutputPath = path;
                UpdateStatus("Dışa aktarıldı: " + path);
                MessageBoxResult result = MessageBox.Show("Dosya oluşturuldu.\n\n" + path + "\n\nKlasörde gösterilsin mi?", "Dışa aktar", MessageBoxButton.YesNo, MessageBoxImage.Information);
                if (result == MessageBoxResult.Yes) ShowInFolder(path);
            }
            catch (Exception ex)
            {
                Logger.Error("Disa aktarma hatasi", ex);
                MessageBox.Show("Dosya dışa aktarılamadı. Çıktı klasörünü ve izinleri kontrol edin.", "Dışa aktar", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void OpenSelectedHistory()
        {
            DataGrid grid = FindVisualChild<DataGrid>(_content);
            if (grid == null) return;
            HistoryItem item = grid.SelectedItem as HistoryItem;
            if (item == null || String.IsNullOrWhiteSpace(item.OutputPath) || !File.Exists(item.OutputPath))
            {
                MessageBox.Show("Açılabilir metin çıktısı bulunamadı.", "Geçmiş", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            MediaJob job = new MediaJob();
            job.DisplayName = item.FileName;
            job.SourcePath = item.SourcePath;
            job.Duration = item.Duration;
            job.State = JobState.Tamamlandi;
            job.Progress = 100;
            job.OutputPath = item.OutputPath;
            job.Transcript = File.ReadAllText(item.OutputPath, Encoding.UTF8);
            _jobs.Add(job);
            ShowFiles();
            if (_jobsGrid != null) _jobsGrid.SelectedItem = job;
        }

        private void OpenSelectedHistoryFolder()
        {
            DataGrid grid = FindVisualChild<DataGrid>(_content);
            if (grid == null) return;
            HistoryItem item = grid.SelectedItem as HistoryItem;
            if (item != null && !String.IsNullOrWhiteSpace(item.OutputPath))
            {
                ShowInFolder(item.OutputPath);
            }
        }

        private void ClearHistory()
        {
            MessageBoxResult result = MessageBox.Show("İşlem geçmişi temizlensin mi?", "Geçmiş", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (result == MessageBoxResult.Yes)
            {
                _historyService.Clear();
                ShowHistory();
                UpdateStatus("Geçmiş temizlendi");
            }
        }

        private void ChooseOutputFolder()
        {
            using (System.Windows.Forms.FolderBrowserDialog dialog = new System.Windows.Forms.FolderBrowserDialog())
            {
                dialog.Description = "Varsayılan çıktı klasörünü seçin";
                dialog.SelectedPath = GetOutputFolder();
                if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                {
                    _outputFolderBox.Text = dialog.SelectedPath;
                    _settings.OutputFolder = dialog.SelectedPath;
                    _settingsService.Save(_settings);
                }
            }
        }

        private void ShowOnboardingIfNeeded()
        {
            if (_settings.FirstRunCompleted) return;
            Window dialog = new Window();
            dialog.Title = "Hoş geldiniz";
            dialog.Owner = this;
            dialog.Width = 620;
            dialog.Height = 430;
            dialog.WindowStartupLocation = WindowStartupLocation.CenterOwner;
            dialog.ResizeMode = ResizeMode.NoResize;
            dialog.Background = _pageBackground;
            dialog.Foreground = _textBrush;

            StackPanel panel = new StackPanel { Margin = new Thickness(24) };
            dialog.Content = panel;
            TextBlock title = new TextBlock { Text = "My Sesi Metne Dönüştürme", FontSize = 26, FontWeight = FontWeights.Bold, Foreground = _textBrush, Margin = new Thickness(0, 0, 0, 12) };
            panel.Children.Add(title);
            panel.Children.Add(WrapText("Bu uygulama ses ve video dosyalarını yerel araçlarla metne dönüştürmek için hazırlanmıştır. Varsayılan olarak dosyalarınız internete gönderilmez."));
            panel.Children.Add(WrapText("YouTube özelliğini yalnızca indirme ve yazıya çevirme hakkınız olan içeriklerde kullanın."));
            panel.Children.Add(WrapText("FFmpeg, whisper.cpp ve yt-dlp araçları Tools klasöründe bulunursa uygulama otomatik kullanır."));
            Button accept = CreatePrimaryButton("Anladım ve devam et", delegate
            {
                _settings.FirstRunCompleted = true;
                _settingsService.Save(_settings);
                dialog.Close();
            });
            accept.Margin = new Thickness(0, 20, 0, 0);
            panel.Children.Add(accept);
            dialog.ShowDialog();
        }

        private void OnDragOver(object sender, DragEventArgs e)
        {
            e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None;
            e.Handled = true;
        }

        private void OnDrop(object sender, DragEventArgs e)
        {
            if (!e.Data.GetDataPresent(DataFormats.FileDrop)) return;
            string[] files = e.Data.GetData(DataFormats.FileDrop) as string[];
            if (files == null) return;
            foreach (string file in files) AddMediaFile(file);
            ShowFiles();
        }

        private void SetTitle(string text)
        {
            if (_titleText != null) _titleText.Text = text;
        }

        private void UpdateStatus(string text)
        {
            if (_statusText != null) _statusText.Text = DateTime.Now.ToString("HH:mm") + "  " + text;
        }

        private bool IsSupported(string filePath)
        {
            string ext = Path.GetExtension(filePath).TrimStart('.').ToLowerInvariant();
            string[] supported = new string[] { "mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "mov", "aac", "ogg", "opus", "wma", "wmv", "avi", "flac", "mkv" };
            return supported.Contains(ext);
        }

        private string FormatSize(long bytes)
        {
            double value = bytes;
            string[] units = new string[] { "B", "KB", "MB", "GB" };
            int unit = 0;
            while (value >= 1024 && unit < units.Length - 1)
            {
                value /= 1024;
                unit++;
            }
            return value.ToString("0.##") + " " + units[unit];
        }

        private void OpenFolder(string folder)
        {
            try
            {
                AppPaths.EnsureDirectory(folder);
                Process.Start("explorer.exe", ProcessRunner.Quote(folder));
            }
            catch (Exception ex)
            {
                Logger.Error("Klasor acilamadi", ex);
            }
        }

        private void ShowInFolder(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    Process.Start("explorer.exe", "/select," + ProcessRunner.Quote(path));
                }
                else if (Directory.Exists(path))
                {
                    Process.Start("explorer.exe", ProcessRunner.Quote(path));
                }
            }
            catch (Exception ex)
            {
                Logger.Error("Klasorde gosterilemedi", ex);
            }
        }

        private Border CreateLogo()
        {
            Border outer = new Border();
            outer.Margin = new Thickness(0, 0, 0, 24);
            StackPanel stack = new StackPanel();
            outer.Child = stack;

            Border mark = new Border();
            mark.Width = 58;
            mark.Height = 58;
            mark.CornerRadius = new CornerRadius(12);
            mark.Background = CreateAccentBrush();
            mark.HorizontalAlignment = HorizontalAlignment.Left;
            TextBlock initials = new TextBlock();
            initials.Text = "MY";
            initials.FontSize = 22;
            initials.FontWeight = FontWeights.Bold;
            initials.Foreground = Brushes.White;
            initials.HorizontalAlignment = HorizontalAlignment.Center;
            initials.VerticalAlignment = VerticalAlignment.Center;
            mark.Child = initials;
            stack.Children.Add(mark);

            TextBlock title = new TextBlock();
            title.Text = "My Sesi Metne\nDönüştürme";
            title.FontSize = 18;
            title.FontWeight = FontWeights.SemiBold;
            title.Foreground = _textBrush;
            title.Margin = new Thickness(0, 12, 0, 0);
            stack.Children.Add(title);
            return outer;
        }

        private Button CreateSidebarButton(string text, Action action)
        {
            Button button = new Button();
            button.Content = text;
            button.HorizontalContentAlignment = HorizontalAlignment.Left;
            button.Margin = new Thickness(0, 4, 0, 4);
            button.Padding = new Thickness(14, 10, 14, 10);
            button.Foreground = _textBrush;
            button.Background = Brushes.Transparent;
            button.BorderBrush = Brushes.Transparent;
            button.FontSize = 14;
            button.Cursor = Cursors.Hand;
            button.Click += delegate { action(); };
            return button;
        }

        private Button CreatePrimaryButton(string text, Action action)
        {
            Button button = BasicButton(text);
            button.Background = CreateAccentBrush();
            button.Foreground = Brushes.White;
            button.BorderBrush = Brushes.Transparent;
            button.Click += delegate { action(); };
            return button;
        }

        private Button CreateGhostButton(string text, Action action)
        {
            Button button = BasicButton(text);
            button.Background = _softPanelBackground;
            button.Foreground = _textBrush;
            button.BorderBrush = new SolidColorBrush(Color.FromRgb(63, 82, 115));
            button.Click += delegate { action(); };
            return button;
        }

        private Button BasicButton(string text)
        {
            Button button = new Button();
            button.Content = text;
            button.Margin = new Thickness(0, 0, 8, 0);
            button.Padding = new Thickness(14, 8, 14, 8);
            button.MinHeight = 34;
            button.FontSize = 13;
            button.FontWeight = FontWeights.SemiBold;
            button.Cursor = Cursors.Hand;
            return button;
        }

        private Border HomeCard(string title, string text)
        {
            Border card = PanelBorder();
            card.Margin = new Thickness(0, 0, 14, 14);
            card.Padding = new Thickness(18);
            StackPanel stack = new StackPanel();
            card.Child = stack;
            stack.Children.Add(SectionTitle(title));
            stack.Children.Add(WrapText(text));
            return card;
        }

        private Border DependencySummaryCard()
        {
            Border card = PanelBorder();
            card.Padding = new Thickness(18);
            card.Margin = new Thickness(0, 4, 0, 0);
            StackPanel stack = new StackPanel();
            card.Child = stack;
            stack.Children.Add(SectionTitle("Yerel araç durumu"));
            stack.Children.Add(DependencySummarySmall());
            return card;
        }

        private StackPanel DependencySummarySmall()
        {
            StackPanel stack = new StackPanel();
            foreach (DependencyItem item in _dependencyService.CheckAll())
            {
                TextBlock line = CreateMutedText((item.Found ? "Hazır: " : "Eksik: ") + item.Name + (item.Found ? "" : "  (" + item.Hint + ")"));
                line.Foreground = item.Found ? new SolidColorBrush(Color.FromRgb(134, 239, 172)) : new SolidColorBrush(Color.FromRgb(253, 186, 116));
                stack.Children.Add(line);
            }
            return stack;
        }

        private DataGrid DependencyGrid()
        {
            DataGrid grid = new DataGrid();
            grid.AutoGenerateColumns = false;
            grid.IsReadOnly = true;
            grid.MinHeight = 190;
            grid.Margin = new Thickness(0, 8, 0, 12);
            grid.Background = Brushes.Transparent;
            grid.Foreground = _textBrush;
            grid.RowBackground = new SolidColorBrush(Color.FromRgb(20, 31, 54));
            grid.AlternatingRowBackground = new SolidColorBrush(Color.FromRgb(24, 36, 62));
            grid.GridLinesVisibility = DataGridGridLinesVisibility.None;
            grid.Columns.Add(TextColumn("Bileşen", "Name", 1));
            grid.Columns.Add(TextColumn("Durum", "Found", 1));
            grid.Columns.Add(TextColumn("Konum", "Path", 3));
            grid.Columns.Add(TextColumn("Beklenen", "Hint", 2));
            grid.ItemsSource = _dependencyService.CheckAll();
            return grid;
        }

        private DataGridTextColumn TextColumn(string header, string binding, int star)
        {
            DataGridTextColumn column = new DataGridTextColumn();
            column.Header = header;
            column.Binding = new Binding(binding);
            column.Width = new DataGridLength(star, DataGridLengthUnitType.Star);
            ElementStyleText(column);
            return column;
        }

        private void ElementStyleText(DataGridTextColumn column)
        {
            Style style = new Style(typeof(TextBlock));
            style.Setters.Add(new Setter(TextBlock.ForegroundProperty, _textBrush));
            style.Setters.Add(new Setter(TextBlock.TextWrappingProperty, TextWrapping.NoWrap));
            style.Setters.Add(new Setter(TextBlock.MarginProperty, new Thickness(4, 0, 4, 0)));
            column.ElementStyle = style;
        }

        private DataGridTemplateColumn ProgressColumn()
        {
            FrameworkElementFactory borderFactory = new FrameworkElementFactory(typeof(Grid));
            FrameworkElementFactory barFactory = new FrameworkElementFactory(typeof(ProgressBar));
            barFactory.SetValue(RangeBase.MinimumProperty, 0.0);
            barFactory.SetValue(RangeBase.MaximumProperty, 100.0);
            barFactory.SetValue(ProgressBar.HeightProperty, 12.0);
            barFactory.SetValue(ProgressBar.ForegroundProperty, _accentBrush);
            barFactory.SetBinding(RangeBase.ValueProperty, new Binding("Progress"));
            borderFactory.AppendChild(barFactory);
            DataTemplate template = new DataTemplate { VisualTree = borderFactory };
            DataGridTemplateColumn column = new DataGridTemplateColumn();
            column.Header = "İlerleme";
            column.CellTemplate = template;
            column.Width = new DataGridLength(1, DataGridLengthUnitType.Star);
            return column;
        }

        private ComboBox Combo(string[] items, string selected)
        {
            ComboBox combo = new ComboBox();
            combo.Width = 140;
            combo.MinHeight = 32;
            combo.Margin = new Thickness(0, 0, 12, 0);
            foreach (string item in items) combo.Items.Add(item);
            combo.SelectedItem = items.Contains(selected) ? selected : items[0];
            return combo;
        }

        private CheckBox Check(string text, bool isChecked)
        {
            CheckBox check = new CheckBox();
            check.Content = text;
            check.IsChecked = isChecked;
            check.Foreground = _textBrush;
            check.Margin = new Thickness(0, 0, 12, 0);
            check.VerticalAlignment = VerticalAlignment.Center;
            return check;
        }

        private StackPanel Labeled(string label, UIElement control, double width)
        {
            StackPanel panel = new StackPanel { Width = width, Margin = new Thickness(0, 0, 10, 0) };
            panel.Children.Add(CreateTinyLabel(label));
            panel.Children.Add(control);
            return panel;
        }

        private StackPanel LabeledBlock(string label, UIElement control)
        {
            StackPanel panel = new StackPanel { Margin = new Thickness(0, 0, 0, 12) };
            panel.Children.Add(CreateTinyLabel(label));
            panel.Children.Add(control);
            return panel;
        }

        private TextBlock SectionTitle(string text)
        {
            TextBlock block = new TextBlock();
            block.Text = text;
            block.FontSize = 17;
            block.FontWeight = FontWeights.SemiBold;
            block.Foreground = _textBrush;
            block.Margin = new Thickness(0, 0, 0, 8);
            return block;
        }

        private TextBlock CreateTinyLabel(string text)
        {
            TextBlock block = new TextBlock();
            block.Text = text;
            block.FontSize = 12;
            block.Foreground = _mutedBrush;
            block.Margin = new Thickness(0, 0, 0, 4);
            return block;
        }

        private TextBlock CreateMutedText(string text)
        {
            TextBlock block = new TextBlock();
            block.Text = text;
            block.Foreground = _mutedBrush;
            block.TextWrapping = TextWrapping.Wrap;
            return block;
        }

        private TextBlock CreateSmallText(string text)
        {
            TextBlock block = CreateMutedText(text);
            block.Margin = new Thickness(0, 3, 0, 0);
            block.FontSize = 12;
            return block;
        }

        private TextBlock WrapText(string text)
        {
            TextBlock block = CreateMutedText(text);
            block.FontSize = 14;
            block.LineHeight = 21;
            block.Margin = new Thickness(0, 0, 0, 10);
            return block;
        }

        private Border InfoLine(string label, string value)
        {
            Border border = new Border { Margin = new Thickness(0, 8, 0, 0) };
            StackPanel row = new StackPanel { Orientation = Orientation.Horizontal };
            row.Children.Add(new TextBlock { Text = label + ": ", Width = 120, Foreground = _mutedBrush, FontWeight = FontWeights.SemiBold });
            row.Children.Add(new TextBlock { Text = value, Foreground = _textBrush, TextWrapping = TextWrapping.Wrap });
            border.Child = row;
            return border;
        }

        private Border CreateBadge(string text)
        {
            Border badge = new Border();
            badge.Background = new SolidColorBrush(Color.FromArgb(70, 56, 189, 248));
            badge.BorderBrush = new SolidColorBrush(Color.FromRgb(56, 189, 248));
            badge.BorderThickness = new Thickness(1);
            badge.CornerRadius = new CornerRadius(14);
            badge.Padding = new Thickness(10, 4, 10, 4);
            badge.Margin = new Thickness(6, 0, 0, 0);
            badge.Child = new TextBlock { Text = text, Foreground = _textBrush, FontSize = 12, FontWeight = FontWeights.SemiBold };
            return badge;
        }

        private Border PanelBorder()
        {
            Border border = new Border();
            border.Background = _panelBackground;
            border.BorderBrush = new SolidColorBrush(Color.FromRgb(38, 54, 85));
            border.BorderThickness = new Thickness(1);
            border.CornerRadius = new CornerRadius(8);
            return border;
        }

        private ScrollViewer PageScroll()
        {
            ScrollViewer scroll = new ScrollViewer();
            scroll.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            scroll.HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled;
            return scroll;
        }

        private StackPanel PageStack()
        {
            StackPanel panel = new StackPanel();
            panel.Margin = new Thickness(26);
            return panel;
        }

        private Brush CreateAccentBrush()
        {
            LinearGradientBrush brush = new LinearGradientBrush();
            brush.StartPoint = new Point(0, 0);
            brush.EndPoint = new Point(1, 1);
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(37, 99, 235), 0));
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(124, 58, 237), 0.55));
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(6, 182, 212), 1));
            return brush;
        }

        private Brush CreateSidebarBrush()
        {
            LinearGradientBrush brush = new LinearGradientBrush();
            brush.StartPoint = new Point(0, 0);
            brush.EndPoint = new Point(1, 1);
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(3, 7, 18), 0));
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(17, 24, 39), 0.5));
            brush.GradientStops.Add(new GradientStop(Color.FromRgb(30, 41, 59), 1));
            return brush;
        }

        private ImageSource CreateWindowIcon()
        {
            DrawingGroup group = new DrawingGroup();
            group.Children.Add(new GeometryDrawing(CreateAccentBrush(), null, new RectangleGeometry(new Rect(0, 0, 64, 64), 12, 12)));
            Pen whitePen = new Pen(Brushes.White, 4);
            group.Children.Add(new GeometryDrawing(null, whitePen, Geometry.Parse("M18,34 C22,20 42,20 46,34")));
            group.Children.Add(new GeometryDrawing(Brushes.White, null, new EllipseGeometry(new Point(32, 35), 6, 6)));
            DrawingImage image = new DrawingImage(group);
            image.Freeze();
            return image;
        }

        private T FindVisualChild<T>(DependencyObject root) where T : DependencyObject
        {
            if (root == null) return null;
            int count = VisualTreeHelper.GetChildrenCount(root);
            for (int i = 0; i < count; i++)
            {
                DependencyObject child = VisualTreeHelper.GetChild(root, i);
                T typed = child as T;
                if (typed != null) return typed;
                T nested = FindVisualChild<T>(child);
                if (nested != null) return nested;
            }
            return null;
        }
    }
}
