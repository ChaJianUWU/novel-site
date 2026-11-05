' NovelSiteKeeper: keep the novel site + serveo tunnel alive
' 放到 启动 文件夹（shell:startup），开机即跑
' 判据：status.json 的最后修改时间（守护每 10 秒刷新）——活着就不打扰，停了才拉起并等它退出
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
statusFile = "D:\DFY\novel-site-server\status.json"
cmd = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""D:\DFY\novel-site-server\run-forever.ps1"""

Do
  If Not Alive() Then
    sh.Run cmd, 0, True
  End If
  WScript.Sleep 15000
Loop

Function Alive()
  Alive = False
  On Error Resume Next
  If fso.FileExists(statusFile) Then
    If DateDiff("s", fso.GetFile(statusFile).DateLastModified, Now) < 60 Then Alive = True
  End If
  Err.Clear
End Function
