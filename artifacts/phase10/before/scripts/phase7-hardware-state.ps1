param([int]$BenchmarkNodePid=0)
$ErrorActionPreference='Stop'
$csv = & nvidia-smi.exe --query-gpu=name,utilization.gpu,memory.used,memory.total,clocks.current.graphics,clocks.current.memory --format=csv,noheader,nounits
$values = $csv.Split(',').ForEach({$_.Trim()})
$result = @{sampledAt=[DateTime]::UtcNow.ToString('o');gpu=$values[0];utilizationPercent=[int]$values[1];machineDedicatedUsedMiB=[int]$values[2];machineDedicatedTotalMiB=[int]$values[3];graphicsClockMHz=[int]$values[4];memoryClockMHz=[int]$values[5];scope='Point-in-time GPU counters outside the timed frame sample; machine total includes desktop applications.'}
try {
 $memory = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory)
 $processes = @(Get-CimInstance Win32_Process)
 $result.largeAllocations = @($memory | Where-Object {$_.DedicatedUsage -gt 50000000} | ForEach-Object {
  $processId = [int]([regex]::Match($_.Name,'pid_(\d+)_').Groups[1].Value)
  @{pid=$processId;name=($processes | Where-Object ProcessId -eq $processId | Select-Object -First 1 -ExpandProperty Name);dedicatedBytes=[long]$_.DedicatedUsage;sharedBytes=[long]$_.SharedUsage}
 })
 if($BenchmarkNodePid -gt 0){
  $roots=@($processes | Where-Object {$_.ParentProcessId -eq $BenchmarkNodePid -and $_.Name -eq 'chrome.exe'})
  $gpuProcesses=@($processes | Where-Object {$_.ParentProcessId -in $roots.ProcessId -and $_.Name -eq 'chrome.exe' -and $_.CommandLine -match '--type=gpu-process'})
  $result.benchmarkBrowserMemory=@($memory | Where-Object { [int]([regex]::Match($_.Name,'pid_(\d+)_').Groups[1].Value) -in $gpuProcesses.ProcessId } | ForEach-Object { @{dedicatedBytes=[long]$_.DedicatedUsage;sharedBytes=[long]$_.SharedUsage} })
 }
} catch { $result.processCountersUnavailable=$_.Exception.Message }
$result | ConvertTo-Json -Depth 5 -Compress
