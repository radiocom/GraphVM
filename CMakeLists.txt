cmake_minimum_required(VERSION 3.16)
project(graphVM
    VERSION 0.1.0
    LANGUAGES C
    DESCRIPTION "Embedded 2D graphics stack virtual machine"
)

# ── C standard ─────────────────────────────────────────────
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

# ── Output directories ─────────────────────────────────────
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

# ── Global include path ────────────────────────────────────
include_directories(${CMAKE_SOURCE_DIR}/src)

# ── Compiler warnings ──────────────────────────────────────
if(MSVC)
    add_compile_options(/W4)
    add_compile_definitions(_CRT_SECURE_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# ── Sub-projects ───────────────────────────────────────────
add_subdirectory(src/vm)
add_subdirectory(src/platform)
add_subdirectory(simulator)

# ── WASM build (emcc required) ─────────────────────────────
find_program(EMCC
    NAMES emcc emcc.bat
    PATHS
        "$ENV{EMSDK}/upstream/emscripten"
        "C:/Programs/emsdk/upstream/emscripten"
    NO_DEFAULT_PATH
)

if(EMCC)
    set(WASM_SRCS
        ${CMAKE_SOURCE_DIR}/src/vm/vm.c
        ${CMAKE_SOURCE_DIR}/src/vm/vm_font.c
        ${CMAKE_SOURCE_DIR}/src/platform/wasm/vm_wasm_api.c
        ${CMAKE_SOURCE_DIR}/src/platform/wasm/platform_wasm.c
    )
    set(WASM_OUT ${CMAKE_SOURCE_DIR}/compiler/static/vm.js)
    set(WASM_EXPORTS
        _vm_wasm_reload
        _vm_wasm_run
        _vm_wasm_fire_event
        _vm_wasm_get_framebuf
        _vm_wasm_destroy
        _malloc
        _free
    )
    set(WASM_RUNTIME ccall cwrap HEAPU8 UTF8ToString stringToUTF8 lengthBytesUTF8)
    list(JOIN WASM_EXPORTS "\",\"" WASM_EXPORTS_STR)
    list(JOIN WASM_RUNTIME "\",\"" WASM_RUNTIME_STR)

    add_custom_target(graphvm_wasm
        COMMAND ${CMAKE_COMMAND} -E env "PATH=$ENV{PATH};C:/Programs/python/3.11"
            ${EMCC} -O2 -DVM_ENABLE_PATH
            -s WASM=1
            "-s" "EXPORTED_FUNCTIONS=[\"${WASM_EXPORTS_STR}\"]"
            "-s" "EXPORTED_RUNTIME_METHODS=[\"${WASM_RUNTIME_STR}\"]"
            -s ALLOW_MEMORY_GROWTH=1
            -s MODULARIZE=1
            -s EXPORT_NAME=createVmModule
            -I ${CMAKE_SOURCE_DIR}/src
            ${WASM_SRCS}
            -lm
            -o ${WASM_OUT}
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        COMMENT "Building WASM (emcc)"
        SOURCES ${WASM_SRCS}
    )
else()
    message(STATUS "emcc not found - graphvm_wasm target disabled")
endif()
