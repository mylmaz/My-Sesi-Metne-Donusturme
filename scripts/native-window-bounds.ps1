param(
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][string]$OwnerExecutable,
  [ValidateSet('read','set','show')][string]$Action='read',
  [int]$Width=0,[int]$Height=0,
  [int]$Left=[int]::MinValue,[int]$Top=[int]::MinValue,
  [switch]$PhysicalPixels
)
# Bounded fallback for Electron versions without CDP Browser window commands.
# Only the exact isolated EXE PID's single top-level Chromium app window is used.
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TranscriptNativeBounds {
  public delegate bool EnumProc(IntPtr hwnd,IntPtr data);
  [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback,IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,StringBuilder text,int length);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int length);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int left,int top,int width,int height,uint flags);
  public static IntPtr[] OwnedWindows(int pid) {
    var found=new List<IntPtr>();
    EnumWindows((hwnd,data)=>{uint actual;GetWindowThreadProcessId(hwnd,out actual);var name=new StringBuilder(256);var title=new StringBuilder(512);GetClassName(hwnd,name,name.Capacity);GetWindowText(hwnd,title,title.Capacity);if(actual==pid && name.ToString()=="Chrome_WidgetWin_1" && title.Length>0)found.Add(hwnd);return true;},IntPtr.Zero);
    return found.ToArray();
  }
}
'@
$process=Get-Process -Id $ProcessId
if([IO.Path]::GetFullPath($process.Path) -ne [IO.Path]::GetFullPath($OwnerExecutable)){throw 'Window owner EXE does not match the launched isolated process.'}
$windows=@([TranscriptNativeBounds]::OwnedWindows($ProcessId))
if($windows.Count -ne 1){throw "Expected one owned Chromium app window, found $($windows.Count)."}
$handle=$windows[0]
$previousContext=[TranscriptNativeBounds]::SetThreadDpiAwarenessContext([IntPtr](-4))
try {
  $wasVisible=[TranscriptNativeBounds]::IsWindowVisible($handle)
  $wasMinimized=[TranscriptNativeBounds]::IsIconic($handle)
  $rect=New-Object TranscriptNativeBounds+RECT
  if(![TranscriptNativeBounds]::GetWindowRect($handle,[ref]$rect)){throw 'Owned window bounds could not be read.'}
  $dpi=[TranscriptNativeBounds]::GetDpiForWindow($handle);if($dpi -eq 0){throw 'Owned window DPI could not be read.'};$scale=$dpi/96.0
  if($Action -eq 'show') {
    [uint32]$actualOwner=0;[TranscriptNativeBounds]::GetWindowThreadProcessId($handle,[ref]$actualOwner)|Out-Null
    if($actualOwner -ne $ProcessId){throw 'Native window owner changed before showing.'}
    [TranscriptNativeBounds]::ShowWindow($handle,9)|Out-Null
    if(![TranscriptNativeBounds]::SetWindowPos($handle,[IntPtr]::Zero,0,0,0,0,0x0043)){throw 'The isolated native window could not be shown.'}
    [TranscriptNativeBounds]::SetForegroundWindow($handle)|Out-Null
    Start-Sleep -Milliseconds 350
    if(![TranscriptNativeBounds]::IsWindowVisible($handle)){throw 'The isolated native window remained hidden.'}
    [TranscriptNativeBounds]::GetWindowRect($handle,[ref]$rect)|Out-Null
  }
  if($Action -eq 'set') {
    if($Width -lt 100 -or $Height -lt 100 -or $Width -gt 5000 -or $Height -gt 5000){throw 'Requested test dimensions are outside the bounded test range.'}
    $targetWidth=if($PhysicalPixels){$Width}else{[int][Math]::Round($Width*$scale)}
    $targetHeight=if($PhysicalPixels){$Height}else{[int][Math]::Round($Height*$scale)}
    $targetLeft=if($Left -eq [int]::MinValue){$rect.Left}else{$Left}
    $targetTop=if($Top -eq [int]::MinValue){$rect.Top}else{$Top}
    [uint32]$actualOwner=0;[TranscriptNativeBounds]::GetWindowThreadProcessId($handle,[ref]$actualOwner)|Out-Null
    if($actualOwner -ne $ProcessId){throw 'Native window owner changed before resize.'}
    if(![TranscriptNativeBounds]::SetWindowPos($handle,[IntPtr]::Zero,$targetLeft,$targetTop,$targetWidth,$targetHeight,0x0014)){throw 'The isolated native window could not be resized.'}
    Start-Sleep -Milliseconds 250
    [TranscriptNativeBounds]::GetWindowRect($handle,[ref]$rect)|Out-Null
  }
  [ordered]@{processId=$ProcessId;windowHandle=$handle.ToInt64();visibleBefore=$wasVisible;minimizedBefore=$wasMinimized;visible=[TranscriptNativeBounds]::IsWindowVisible($handle);minimized=[TranscriptNativeBounds]::IsIconic($handle);dpi=$dpi;scale=$scale;physicalBounds=@{left=$rect.Left;top=$rect.Top;width=$rect.Right-$rect.Left;height=$rect.Bottom-$rect.Top};dipBounds=@{left=$rect.Left/$scale;top=$rect.Top/$scale;width=($rect.Right-$rect.Left)/$scale;height=($rect.Bottom-$rect.Top)/$scale};method='Exact-PID Win32 ShowWindow/SetWindowPos; helper-thread DPI context only, OS display settings unchanged'}|ConvertTo-Json -Depth 4 -Compress
} finally {if($previousContext -ne [IntPtr]::Zero){[TranscriptNativeBounds]::SetThreadDpiAwarenessContext($previousContext)|Out-Null}}
