add_executable(graphvm_sim
    main.c
    display.c
    gvmb_loader.c
    sizeof_report.c
)

target_link_libraries(graphvm_sim PRIVATE
    vm_core
    platform_pc
    user32
    gdi32
)
