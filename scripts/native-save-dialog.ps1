param(
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][string]$OwnerExecutable,
  [ValidateSet('save','cancel')][string]$Action = 'save',
  [string]$Destination,
  [string]$AllowedDirectory,
  [int]$TimeoutSeconds = 30
)

# Automate only a common file dialog owned by this exact isolated test EXE PID.
# No desktop-wide keystrokes, clipboard edits, or unrelated windows are used.
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TranscriptDialogWindows {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wparam, string value);
  public static IntPtr[] Dialogs(int processId) {
    var result = new List<IntPtr>();
    EnumWindows((hwnd,data) => { uint pid; GetWindowThreadProcessId(hwnd,out pid); var name=new StringBuilder(256); GetClassName(hwnd,name,name.Capacity); if(pid==processId && IsWindowVisible(hwnd) && name.ToString()=="#32770") result.Add(hwnd); return true; },IntPtr.Zero);
    return result.ToArray();
  }
  public static IntPtr FilenameEdit(IntPtr parent) {
    IntPtr result=IntPtr.Zero;
    EnumChildWindows(parent,(hwnd,data)=> {var name=new StringBuilder(256);GetClassName(hwnd,name,name.Capacity); int id=GetDlgCtrlID(hwnd); if(name.ToString()=="Edit" && (id==1001 || id==1152)) result=hwnd; return true;},IntPtr.Zero);
    return result;
  }
  public static IntPtr Button(IntPtr parent,int controlId) {
    IntPtr result=IntPtr.Zero;
    EnumChildWindows(parent,(hwnd,data)=> {var name=new StringBuilder(256);GetClassName(hwnd,name,name.Capacity);if(name.ToString()=="Button" && GetDlgCtrlID(hwnd)==controlId)result=hwnd;return true;},IntPtr.Zero);
    return result;
  }
  public static string DescribeChildren(IntPtr parent) {
    var result=new List<string>();
    EnumChildWindows(parent,(hwnd,data)=> {var name=new StringBuilder(256);GetClassName(hwnd,name,name.Capacity); result.Add(name.ToString()+":"+GetDlgCtrlID(hwnd));return true;},IntPtr.Zero);
    return String.Join(";",result);
  }
}
'@
$owner = Get-Process -Id $ProcessId
if ([IO.Path]::GetFullPath($owner.Path) -ne [IO.Path]::GetFullPath($OwnerExecutable)) { throw 'Dialog owner EXE does not match the isolated launched process.' }
if ($Action -eq 'save') {
  $Destination = [IO.Path]::GetFullPath($Destination)
  $AllowedDirectory = [IO.Path]::GetFullPath($AllowedDirectory)
  if ([IO.Path]::GetDirectoryName($Destination) -ne $AllowedDirectory -or !(Test-Path -LiteralPath $AllowedDirectory -PathType Container)) { throw 'Save destination is outside this exact test output directory.' }
  if (Test-Path -LiteralPath $Destination) { throw 'Refusing to overwrite an existing file during native dialog test.' }
}
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$dialog = $null
while ([DateTime]::UtcNow -lt $deadline) {
  if (!(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { throw 'The isolated dialog owner process exited.' }
  foreach ($handle in [TranscriptDialogWindows]::Dialogs($ProcessId)) {
    $candidate = [Windows.Automation.AutomationElement]::FromHandle($handle)
    if ($candidate.Current.ProcessId -eq $ProcessId) { $dialog = $candidate; break }
  }
  if ($null -ne $dialog) { break }
  Start-Sleep -Milliseconds 150
}
if ($null -eq $dialog) { throw 'Native Save As dialog did not appear for the exact isolated process PID.' }
Start-Sleep -Milliseconds 750
$title = $dialog.Current.Name
$id = if ($Action -eq 'cancel') { '2' } else { '1' }
if ($Action -eq 'save') {
  $edit = $null
  while ($null -eq $edit -and [DateTime]::UtcNow -lt $deadline) {
    $edits = @($dialog.FindAll([Windows.Automation.TreeScope]::Descendants,
      (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Edit))))
    $edit = $edits | Where-Object { $_.Current.AutomationId -in @('1001','1152') -or $_.Current.Name -match 'File name|Dosya ad' } | Select-Object -First 1
    if ($null -eq $edit) {
      $combo = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants,(New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::AutomationIdProperty,'1001')))
      if ($null -ne $combo) { $edit = $combo.FindFirst([Windows.Automation.TreeScope]::Descendants,(New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Edit))) }
    }
    if ($null -eq $edit -and [TranscriptDialogWindows]::FilenameEdit([IntPtr]$dialog.Current.NativeWindowHandle) -ne [IntPtr]::Zero) { break }
    if ($null -eq $edit) { Start-Sleep -Milliseconds 150 }
  }
  if ($null -eq $edit) {
    $nativeEdit = [TranscriptDialogWindows]::FilenameEdit([IntPtr]$dialog.Current.NativeWindowHandle)
    if ($nativeEdit -eq [IntPtr]::Zero) { throw ('Filename edit not identified in ' + $title + ': ' + [TranscriptDialogWindows]::DescribeChildren([IntPtr]$dialog.Current.NativeWindowHandle)) }
    [uint32]$editOwner=0
    [TranscriptDialogWindows]::GetWindowThreadProcessId($nativeEdit,[ref]$editOwner) | Out-Null
    if ($editOwner -ne $ProcessId) { throw 'Native filename edit belongs to another process.' }
    [TranscriptDialogWindows]::SendMessage($nativeEdit,0x000C,[IntPtr]::Zero,$Destination) | Out-Null
  } else {
    if ($edit.Current.ProcessId -ne $ProcessId) { throw 'Filename edit belongs to another process.' }
    $pattern = $null
    if ($edit.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)) { $pattern.SetValue($Destination) }
    else { [TranscriptDialogWindows]::SendMessage([IntPtr]$edit.Current.NativeWindowHandle,0x000C,[IntPtr]::Zero,$Destination) | Out-Null }
  }
}
$button = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants,
  (New-Object Windows.Automation.AndCondition(
    (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::AutomationIdProperty,$id)),
    (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::Button)))))
if ($null -eq $button) {
  $nativeButton=[TranscriptDialogWindows]::Button([IntPtr]$dialog.Current.NativeWindowHandle,[int]$id)
  if ($nativeButton -eq [IntPtr]::Zero) { throw ('Save/Cancel button missing from '+$title+': '+[TranscriptDialogWindows]::DescribeChildren([IntPtr]$dialog.Current.NativeWindowHandle)) }
  [uint32]$buttonOwner=0
  [TranscriptDialogWindows]::GetWindowThreadProcessId($nativeButton,[ref]$buttonOwner) | Out-Null
  if ($buttonOwner -ne $ProcessId) { throw 'Native Save/Cancel belongs to another process.' }
  [TranscriptDialogWindows]::SendMessage($nativeButton,0x00F5,[IntPtr]::Zero,$null) | Out-Null
} else {
  if ($button.Current.ProcessId -ne $ProcessId) { throw 'Save/Cancel button belongs to another process.' }
  $invoke = $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()
}
[ordered]@{ processId=$ProcessId; ownerExecutable=$OwnerExecutable; dialogTitle=$title; action=$Action; destination=$Destination; mechanism='Windows UIAutomation with controlled Win32 common-dialog fallback; exact owner PID only' } | ConvertTo-Json -Compress
