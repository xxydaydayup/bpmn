# Research probe, pinned to the bundled schemas in bpmn-moddle 10.2.0.
# Run from the repository root after bpmn-xml-roundtrip.mjs.
$ErrorActionPreference = 'Stop'
$schemaDirectory = (Resolve-Path -LiteralPath 'node_modules/.pnpm/bpmn-moddle@10.2.0/node_modules/bpmn-moddle/resources/bpmn/xsd').Path
$schemaPath = Join-Path $schemaDirectory 'BPMN20.xsd'
$samplePath = (Resolve-Path -LiteralPath 'output/bpmn-portability/portable-approval-serialized.bpmn').Path
$schemaSet = New-Object System.Xml.Schema.XmlSchemaSet
$schemaSet.XmlResolver = New-Object System.Xml.XmlUrlResolver
[void]$schemaSet.Add('http://www.omg.org/spec/BPMN/20100524/MODEL', $schemaPath)
$schemaSet.Compile()

$settings = New-Object System.Xml.XmlReaderSettings
$settings.Schemas = $schemaSet
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.ValidationFlags = $settings.ValidationFlags -bor [System.Xml.Schema.XmlSchemaValidationFlags]::ReportValidationWarnings
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$validationMessages = New-Object 'System.Collections.Generic.List[object]'
$settings.add_ValidationEventHandler({
  param($sender, $eventArgs)
  $validationMessages.Add([PSCustomObject]@{
    severity = $eventArgs.Severity.ToString()
    message = $eventArgs.Message
  })
})
$reader = [System.Xml.XmlReader]::Create($samplePath, $settings)
try { while ($reader.Read()) {} } finally { $reader.Dispose() }

$validationErrors = @($validationMessages | Where-Object { $_.severity -eq 'Error' })
$schemaHashes = [ordered]@{}
foreach ($schemaName in @('BPMN20.xsd', 'BPMNDI.xsd', 'DC.xsd', 'DI.xsd', 'Semantic.xsd')) {
  $schemaHashes[$schemaName] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $schemaDirectory $schemaName)).Hash.ToLowerInvariant()
}
$result = [ordered]@{
  observedAt = [DateTime]::UtcNow.ToString('o')
  scope = 'BPMN/DI XSD validation only. No wf XSD was registered; wf attribute semantics are not validated. No engine was started.'
  bpmnModdleVersion = '10.2.0'
  sampleHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $samplePath).Hash.ToLowerInvariant()
  schemaHashes = $schemaHashes
  errors = $validationErrors.Count
  warnings = @($validationMessages | Where-Object { $_.severity -eq 'Warning' }).Count
  messages = @($validationMessages.ToArray())
}
$json = $result | ConvertTo-Json -Depth 5
$utf8Encoding = New-Object System.Text.UTF8Encoding($false)
$resultPath = Join-Path (Split-Path -Parent $samplePath) 'schema-results.json'
[System.IO.File]::WriteAllText($resultPath, $json + "`n", $utf8Encoding)
$json
if ($validationErrors.Count -gt 0) { throw 'BPMN XSD validation failed.' }
