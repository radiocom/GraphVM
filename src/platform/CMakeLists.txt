# ── Platform abstraction (PC implementation) ────────────────
add_library(platform_pc STATIC
    pc/platform_pc.c
)

target_include_directories(platform_pc PUBLIC
    ${CMAKE_SOURCE_DIR}/src
)

# Link platform-specific libraries
if(WIN32)
    # Windows: GetTickCount / Sleep are in kernel32 (linked by default)
elseif(APPLE)
    # macOS: no extra libs needed for clock_gettime on modern macOS
else()
    # Linux: may need -lrt for clock_gettime on older glibc
    target_link_libraries(platform_pc PRIVATE rt)
endif()
