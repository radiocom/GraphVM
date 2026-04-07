add_library(vm_core STATIC
    vm.c
    vm_font.c
)

target_include_directories(vm_core PUBLIC
    ${CMAKE_SOURCE_DIR}/src
)
