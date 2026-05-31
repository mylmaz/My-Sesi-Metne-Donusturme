using System;
using System.Collections.Generic;
using System.ComponentModel;

namespace MySesiMetneDonusturme
{
    public enum JobState
    {
        Bekliyor,
        Isleniyor,
        Tamamlandi,
        Hata,
        IptalEdildi
    }

    public enum JobSourceType
    {
        Dosya,
        YouTube
    }

    [Serializable]
    public class AppSettings
    {
        public string OutputFolder { get; set; }
        public string DefaultLanguage { get; set; }
        public string DefaultModel { get; set; }
        public bool DarkTheme { get; set; }
        public bool AutoSave { get; set; }
        public bool TimestampsEnabled { get; set; }
        public bool ParagraphMode { get; set; }
        public bool RemoveFillers { get; set; }
        public bool ImprovePunctuation { get; set; }
        public bool SplitLongFiles { get; set; }
        public bool ReduceSilence { get; set; }
        public bool FirstRunCompleted { get; set; }
    }

    public class TranscriptionOptions
    {
        public string Language { get; set; }
        public string Model { get; set; }
        public bool TimestampsEnabled { get; set; }
        public bool ParagraphMode { get; set; }
        public bool RemoveFillers { get; set; }
        public bool ImprovePunctuation { get; set; }
        public bool SplitLongFiles { get; set; }
        public bool ReduceSilence { get; set; }
        public string OutputFolder { get; set; }
    }

    [Serializable]
    public class HistoryItem
    {
        public string Id { get; set; }
        public string FileName { get; set; }
        public string SourcePath { get; set; }
        public string CreatedAt { get; set; }
        public string Duration { get; set; }
        public string OutputPath { get; set; }
        public string State { get; set; }
        public string Language { get; set; }
    }

    [Serializable]
    public class HistoryStore
    {
        public List<HistoryItem> Items { get; set; }

        public HistoryStore()
        {
            Items = new List<HistoryItem>();
        }
    }

    public class DependencyItem
    {
        public string Name { get; set; }
        public string Path { get; set; }
        public bool Found { get; set; }
        public string Hint { get; set; }
    }

    public class YouTubeMetadata
    {
        public string Title { get; set; }
        public string Duration { get; set; }
        public string ThumbnailUrl { get; set; }
        public string RawUrl { get; set; }
    }

    public class ProcessResult
    {
        public int ExitCode { get; set; }
        public string Output { get; set; }
        public string Error { get; set; }
    }

    public class MediaJob : INotifyPropertyChanged
    {
        private JobState _state;
        private int _progress;
        private string _transcript;
        private string _errorMessage;
        private string _duration;

        public event PropertyChangedEventHandler PropertyChanged;

        public string Id { get; set; }
        public JobSourceType SourceType { get; set; }
        public string SourcePath { get; set; }
        public string DisplayName { get; set; }
        public string Format { get; set; }
        public string SizeText { get; set; }
        public string OutputPath { get; set; }
        public string Language { get; set; }
        public DateTime CreatedAt { get; set; }

        public string Duration
        {
            get { return _duration; }
            set
            {
                if (_duration != value)
                {
                    _duration = value;
                    OnPropertyChanged("Duration");
                }
            }
        }

        public JobState State
        {
            get { return _state; }
            set
            {
                if (_state != value)
                {
                    _state = value;
                    OnPropertyChanged("State");
                    OnPropertyChanged("StateText");
                }
            }
        }

        public string StateText
        {
            get { return ToStateText(State); }
        }

        public int Progress
        {
            get { return _progress; }
            set
            {
                int safe = value;
                if (safe < 0) safe = 0;
                if (safe > 100) safe = 100;
                if (_progress != safe)
                {
                    _progress = safe;
                    OnPropertyChanged("Progress");
                    OnPropertyChanged("ProgressText");
                }
            }
        }

        public string ProgressText
        {
            get { return Progress.ToString() + "%"; }
        }

        public string Transcript
        {
            get { return _transcript; }
            set
            {
                if (_transcript != value)
                {
                    _transcript = value;
                    OnPropertyChanged("Transcript");
                }
            }
        }

        public string ErrorMessage
        {
            get { return _errorMessage; }
            set
            {
                if (_errorMessage != value)
                {
                    _errorMessage = value;
                    OnPropertyChanged("ErrorMessage");
                }
            }
        }

        public MediaJob()
        {
            Id = Guid.NewGuid().ToString("N");
            CreatedAt = DateTime.Now;
            State = JobState.Bekliyor;
            Progress = 0;
            Duration = "Bilinmiyor";
            Transcript = "";
            ErrorMessage = "";
            Language = "Türkçe";
        }

        public static string ToStateText(JobState state)
        {
            if (state == JobState.Bekliyor) return "Bekliyor";
            if (state == JobState.Isleniyor) return "İşleniyor";
            if (state == JobState.Tamamlandi) return "Tamamlandı";
            if (state == JobState.Hata) return "Hata";
            if (state == JobState.IptalEdildi) return "İptal edildi";
            return "Bekliyor";
        }

        protected void OnPropertyChanged(string propertyName)
        {
            PropertyChangedEventHandler handler = PropertyChanged;
            if (handler != null)
            {
                handler(this, new PropertyChangedEventArgs(propertyName));
            }
        }
    }

    public class UserVisibleException : Exception
    {
        public UserVisibleException(string message) : base(message)
        {
        }

        public UserVisibleException(string message, Exception inner) : base(message, inner)
        {
        }
    }
}
