' NovelSiteKeeper: keep the novel site + serveo tunnel alive
' 双保险：启动文件夹 + 计划任务（AtLogOn）都会跑它
' 判活：status.json 60 秒内更新 且 本地 8787 端口在听 —— 缺一就拉起守护并等它退出
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
statusFile = "D:\DFY\novel-site-server\status.json"
cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""D:\DFY\novel-site-server\run-forever.ps1"""

Do
  If Not Alive() Then
    sh.Run cmd, 0, True
    WScript.Sleep 5000
  End If
  WScript.Sleep 15000
Loop

Function Alive()
  Alive = False
  On Error Resume Next
  Dim fresh
  fresh = False
  If fso.FileExists(statusFile) Then
    If DateDiff("s", fso.GetFile(statusFile).DateLastModified, Now) < 60 Then fresh = True
  End If
  Err.Clear
  If fresh Then
    Alive = (sh.Run("cmd /c netstat -ano | findstr /C:"":8787 "" >NUL", 0, True) = 0)
    Err.Clear
  End If
End Function