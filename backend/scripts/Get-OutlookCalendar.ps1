# Requires Outlook desktop installed and (optionally) running.
# Usage: powershell -File Get-OutlookCalendar.ps1 YYYY-MM-DD
# Output: JSON array of { "title": "...", "start": "ISO8601", "end": "ISO8601" } for that day.

param([Parameter(Mandatory=$false)][string]$DateYmd)

if (-not $DateYmd) {
  $DateYmd = Get-Date -Format "yyyy-MM-dd"
}

$culture = [System.Globalization.CultureInfo]::InvariantCulture
$targetDate = [DateTime]::ParseExact($DateYmd, "yyyy-MM-dd", $culture)

$result = @()

try {
  $outlook = New-Object -ComObject Outlook.Application
  $namespace = $outlook.GetNamespace("MAPI")
  $calendar = $namespace.GetDefaultFolder(9)  # olFolderCalendar = 9

  $items = $calendar.Items
  $items.Sort("[Start]", $true)
  $items.IncludeRecurrences = $true

  # Iterate and filter by date; expand recurring appointments via GetOccurrence
  foreach ($item in $items) {
    try {
      if ($item.Class -eq 26) {  # olAppointment = 26
        $start = $null
        $end = $null
        $title = if ($item.Subject) { $item.Subject } else { "No title" }

        if ($item.IsRecurring) {
          try {
            $pattern = $item.GetRecurrencePattern()
            # GetOccurrence expects the start time of the occurrence: use target date + master's time-of-day
            $masterStart = $item.Start
            $occurrenceStart = [DateTime]::new($targetDate.Year, $targetDate.Month, $targetDate.Day, $masterStart.Hour, $masterStart.Minute, $masterStart.Second)
            $occurrence = $pattern.GetOccurrence($occurrenceStart)
            if ($occurrence) {
              $start = $occurrence.Start
              $end = $occurrence.End
              [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($occurrence)
            }
            [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($pattern)
          } catch {
            # No occurrence on targetDate for this recurring item
            continue
          }
        } else {
          $start = $item.Start
          if ($start -and $start.Date -eq $targetDate.Date) {
            $end = $item.End
          }
        }

        if ($start -and $end) {
          $result += @{
            title = $title
            start = $start.ToString("yyyy-MM-ddTHH:mm:ss")
            end   = $end.ToString("yyyy-MM-ddTHH:mm:ss")
          }
        }
      }
    } catch {
      continue
    }
  }

  [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($items)
  [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($calendar)
  [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($namespace)
  [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($outlook)
} catch {
  # Log error to stderr so backend can report it; still output valid JSON
  [Console]::Error.WriteLine("Outlook COM: $($_.Exception.Message)")
  Write-Output "[]"
  exit 0
}

# Always output a JSON array (PowerShell 5.1 ConvertTo-Json outputs single object for 1-element array)
if ($result.Count -eq 0) {
  Write-Output "[]"
} elseif ($result.Count -eq 1) {
  Write-Output ($result[0] | ConvertTo-Json -Compress)
} else {
  Write-Output ($result | ConvertTo-Json -Compress)
}
