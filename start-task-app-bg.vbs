Dim shell, root
Set shell = CreateObject("WScript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Start backend silently (hidden window)
shell.Run "cmd /c cd /d """ & root & "\backend"" && npm start", 0, False

' Wait for backend to initialize
WScript.Sleep 2000

' Start frontend silently (hidden window)
shell.Run "cmd /c cd /d """ & root & "\frontend"" && npm run dev", 0, False

' Wait for frontend to be ready
WScript.Sleep 4000

' Open browser
shell.Run "http://localhost:3112"
