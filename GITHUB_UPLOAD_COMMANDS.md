# GitHub'a Yüklemek İçin Çalıştırılacak Komutlar

Önerilen repo adı:

```text
My-Sesi-Metne-Donusturme
```

GitHub'da boş repo oluşturduktan sonra:

```powershell
git init
git add .
git commit -m "Initial Windows transcription app"
git branch -M main
git remote add origin https://github.com/vildancam/My-Sesi-Metne-Donusturme.git
git push -u origin main
```

GitHub CLI kurulu ve giriş yapılmışsa:

```powershell
gh repo create vildancam/My-Sesi-Metne-Donusturme --private --source . --remote origin --push
```
