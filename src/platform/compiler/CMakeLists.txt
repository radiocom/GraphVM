add_library(vm_compiler STATIC
    compiler.c
)

target_include_directories(vm_compiler PUBLIC
    ${CMAKE_SOURCE_DIR}/include
)

target_link_libraries(vm_compiler PUBLIC vm_core)
