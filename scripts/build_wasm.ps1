if ($env:PATH -notlike "*C:\Programs\python\3.11*") { $env:PATH = ($env:PATH.TrimEnd(';')) + ";C:\Programs\python\3.11" }
$emcc = "C:\Programs\emsdk\upstream\emscripten\emcc.bat"

if ($PSScriptRoot) {
    $root = Split-Path -Parent $PSScriptRoot
} else {
    $root = "D:\projects\graphVm"
}

& $emcc -O2 `
    -DVM_ENABLE_PATH `
    -s WASM=1 `
    -s "EXPORTED_FUNCTIONS=[""_vm_wasm_reload"",""_vm_wasm_run"",""_vm_wasm_fire_event"",""_vm_wasm_get_framebuf"",""_vm_wasm_destroy"",""_malloc"",""_free""]" `
    -s "EXPORTED_RUNTIME_METHODS=[""ccall"",""cwrap"",""HEAPU8"",""UTF8ToString"",""stringToUTF8"",""lengthBytesUTF8""]" `
    -s ALLOW_MEMORY_GROWTH=1 `
    -s MODULARIZE=1 `
    -s EXPORT_NAME="createVmModule" `
    -I "$root\src" `
    "$root\src\vm\vm.c" `
    "$root\src\vm\vm_font.c" `
    "$root\src\platform\wasm\vm_wasm_api.c" `
    "$root\src\platform\wasm\platform_wasm.c" `
    -lm `
    -o "$root\compiler\static\vm.js"

if ($LASTEXITCODE -eq 0) {
    Write-Host "WASM build OK"
    Get-ChildItem "$root\compiler\static\vm.*" | ForEach-Object { Write-Host "  $($_.Name) $($_.Length) bytes" }
} else {
    Write-Host "WASM build FAILED" -ForegroundColor Red
}
