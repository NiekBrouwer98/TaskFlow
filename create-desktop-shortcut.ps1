$Desktop = [Environment]::GetFolderPath('Desktop')
$VbsPath = Join-Path $PSScriptRoot "start-task-app-bg.vbs"
$TaskName = "TaskAppAutoStart"

# Create desktop shortcut pointing to the silent VBS launcher
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$Desktop\TaskFlow.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = """$VbsPath"""
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "Start TaskFlow (backend + frontend, silent)"
$Shortcut.Save()
Write-Host "Shortcut created: $Desktop\TaskFlow.lnk"

# Register scheduled task to auto-start at login
$Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument """$VbsPath"""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Limited -Force | Out-Null
Write-Host "Scheduled task '$TaskName' registered — app will start automatically at login."
Write-Host ""
Write-Host "To remove auto-start later, run:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
