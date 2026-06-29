!macro customInstall
  ; Eski sürümlerin bozuk/karakter sorunlu kısayollarını temizle.
  ; Bu yalnızca kısayol kalıntılarını kaldırır; kullanıcının belgelerine veya çıktılarına dokunmaz.
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme.lnk"
  Delete "$DESKTOP\My Sesi Metne Dönüştürme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme\My Sesi Metne Dönüştürme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme\Kaldır My Sesi Metne Dönüştürme.lnk"
  RMDir "$SMPROGRAMS\My Sesi Metne Dönüştürme"

  ; Teknik bilgisi olmayan kullanıcı için kısayolları seçim ekranına bırakma.
  ; Exe adı ASCII olduğu için Türkçe karakter kaynaklı "Eksik Kısayol" hatası oluşmaz.
  CreateDirectory "$SMPROGRAMS\My Sesi Metne Donusturme"
  CreateShortCut "$DESKTOP\My Sesi Metne Donusturme.lnk" "$INSTDIR\MySesiMetneDonusturme.exe" "" "$INSTDIR\resources\resources\app-icon.ico" 0
  CreateShortCut "$SMPROGRAMS\My Sesi Metne Donusturme\My Sesi Metne Donusturme.lnk" "$INSTDIR\MySesiMetneDonusturme.exe" "" "$INSTDIR\resources\resources\app-icon.ico" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\My Sesi Metne Dönüştürme.lnk"
  Delete "$DESKTOP\My Sesi Metne Dönüştürme.lnk"
  Delete "$DESKTOP\My Sesi Metne Donusturme.lnk"
  Delete "$SMPROGRAMS\My Sesi Metne Donusturme\My Sesi Metne Donusturme.lnk"
  RMDir "$SMPROGRAMS\My Sesi Metne Donusturme"
!macroend
