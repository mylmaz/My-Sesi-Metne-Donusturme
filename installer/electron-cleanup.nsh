!macro customInstall
  ; Eski sürümlerin bozuk/karakter sorunlu kısayollarını temizle.
  ; Bu yalnızca kısayol kalıntılarını kaldırır; kullanıcının belgelerine veya çıktılarına dokunmaz.
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Donusturme.lnk"
  Delete "$DESKTOP\My Sesi Metne Dönüştürme.lnk"
  Delete "$DESKTOP\My Sesi Metne Donusturme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme\My Sesi Metne Dönüştürme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme\Kaldır My Sesi Metne Dönüştürme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Donusturme\My Sesi Metne Donusturme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Donusturme\Kaldır My Sesi Metne Donusturme.lnk"
  RMDir "$SMPROGRAMS\My Sesi Metne Dönüştürme"
  RMDir "$SMPROGRAMS\My Sesi Metne Donusturme"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Donusturme.lnk"
  Delete "$DESKTOP\My Sesi Metne Dönüştürme.lnk"
  Delete "$DESKTOP\My Sesi Metne Donusturme.lnk"
!macroend
