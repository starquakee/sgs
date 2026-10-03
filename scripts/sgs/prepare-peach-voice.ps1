param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$sgsFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($sgsVoice in @(@{ Gender = 'male'; Name = 'Microsoft Kangkang' }, @{ Gender = 'female'; Name = 'Microsoft Huihui Desktop' })) {
    $sgsDirectory = Join-Path $OutputDirectory $sgsVoice.Gender
    [System.IO.Directory]::CreateDirectory($sgsDirectory) | Out-Null
    $sgsSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try {
        $sgsSynth.SelectVoice($sgsVoice.Name)
        $sgsSynth.Rate = 0
        $sgsSynth.Volume = 100
        $sgsSynth.SetOutputToWaveFile((Join-Path $sgsDirectory 'tao.wav'), $sgsFormat)
        # U+6843, Peach. Code point avoids Windows PowerShell 5 legacy decoding.
        $sgsSynth.Speak([string][char]0x6843)
    } finally { $sgsSynth.Dispose() }
}
