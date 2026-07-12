# Yerel Araçlar

Bu klasör Electron uygulamasının çalışma zamanı için gereken yerel dosyaları tutar. `npm run dist` çalıştığında gerekli dosyalar Windows `setup.exe` paketine eklenir.

Beklenen yapı:

```text
Tools/
  ffmpeg/
    ffmpeg.exe
    ffprobe.exe
  whisper/
    whisper-cli.exe
    whisper.dll
    ggml.dll
    ggml-base.dll
    ggml-cpu.dll
  models/
    ggml-large-v2.bin
  yt-dlp/
    yt-dlp.exe
```

Kullanıcı bu klasörü ayrıca yönetmez. Model ve `.exe` dosyaları büyük olduğu için Git geçmişine eklenmez; release paketi içinde dağıtılır.
