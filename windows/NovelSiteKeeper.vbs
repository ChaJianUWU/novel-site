' NovelSiteKeeper: keep the novel site + serveo tunnel alive
' 放到 启动 文件夹（shell:startup），开机即跑；脚本退出 15 秒后自动重启
Set sh = CreateObject("WScript.Shell")
Do
  sh.Run "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ""D:\DFY\novel-site-server\run-forever.ps1""", 0, True
  WScript.Sleep 15000
Loop